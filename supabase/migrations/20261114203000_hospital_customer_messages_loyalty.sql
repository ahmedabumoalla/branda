-- MIND hospital: original loyalty stamps and three independently deduplicated messages
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
ALTER TABLE public.hospital_store_settings ADD COLUMN whatsapp_invoice_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE hospital_private.customer_messages(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),
 kind text NOT NULL CHECK(kind IN('account','invoice','loyalty_card')),dedupe_key uuid NOT NULL,
 party_id uuid NOT NULL,document_id uuid,card_id uuid REFERENCES public.loyalty_cards(id),
 phone text NOT NULL CHECK(phone~'^9665[0-9]{8}$'),customer_name text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','processing','dispatching','queued','rejected','unknown','skipped')),
 lease_token uuid,lease_until timestamptz,available_at timestamptz NOT NULL DEFAULT now(),provider_message_id text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(cafe_id,kind,dedupe_key),FOREIGN KEY(cafe_id,party_id) REFERENCES public.bf_parties(cafe_id,id),
 FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),
 CHECK((kind='account' AND dedupe_key=party_id AND document_id IS NULL AND card_id IS NULL)
 OR (kind='invoice' AND dedupe_key=document_id AND document_id IS NOT NULL AND card_id IS NULL)
 OR (kind='loyalty_card' AND dedupe_key=card_id AND card_id IS NOT NULL AND document_id IS NULL))
);
ALTER TABLE hospital_private.customer_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hospital_private.customer_messages FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX hospital_customer_messages_pending ON hospital_private.customer_messages(available_at,id) WHERE status='pending';

CREATE FUNCTION public.brand_finance_pos_settings_read(p_cafe uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF brand_finance_private.role_for(p_cafe) IS DISTINCT FROM 'owner' OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND slug='mind-hospital') THEN RAISE EXCEPTION 'HOSPITAL_FORBIDDEN' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('whatsappInvoiceEnabled',coalesce((SELECT whatsapp_invoice_enabled FROM public.hospital_store_settings WHERE cafe_id=p_cafe),false));
END $$;
CREATE FUNCTION public.brand_finance_pos_settings_save(p_cafe uuid,p_enabled boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF brand_finance_private.role_for(p_cafe) IS DISTINCT FROM 'owner' OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND slug='mind-hospital') THEN RAISE EXCEPTION 'HOSPITAL_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF p_enabled IS NULL THEN RAISE EXCEPTION 'HOSPITAL_INVALID_INPUT';END IF;
 UPDATE public.hospital_store_settings SET whatsapp_invoice_enabled=p_enabled WHERE cafe_id=p_cafe;
 IF NOT FOUND THEN RAISE EXCEPTION 'HOSPITAL_UNAVAILABLE';END IF;
 RETURN jsonb_build_object('whatsappInvoiceEnabled',p_enabled);
END $$;

CREATE FUNCTION hospital_private.card_already_provided(c uuid,card uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM loyalty_audit_private.wallet_customer_events e WHERE e.cafe_id=c AND e.card_id=card AND e.kind IN('download','installed'))
 OR EXISTS(SELECT 1 FROM public.wallet_apple_registrations r WHERE r.cafe_id=c AND r.card_id=card)
 OR EXISTS(SELECT 1 FROM loyalty_read_private.card_link_jobs j WHERE j.cafe_id=c AND j.card_id=card AND j.status IN('pending','dispatching','queued','unknown'))
 OR EXISTS(SELECT 1 FROM public.bf_sale_customers s JOIN public.bf_customer_message_jobs j ON j.cafe_id=s.cafe_id AND j.document_id=s.document_id WHERE s.cafe_id=c AND s.card_id=card AND j.state IN('pending','dispatching','queued','unknown'))
$$;

CREATE FUNCTION hospital_private.queue_doctor_account(c uuid,party uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 INSERT INTO hospital_private.customer_messages(cafe_id,kind,dedupe_key,party_id,phone,customer_name)
 SELECT c,'account',p.id,p.id,hospital_private.phone(p.phone),p.name FROM public.bf_parties p
 JOIN public.cafes b ON b.id=p.cafe_id JOIN public.hospital_store_settings s ON s.cafe_id=b.id AND s.enabled
 WHERE p.cafe_id=c AND p.id=party AND p.active AND p.kind='customer' AND p.details->>'hospitalDebtorType'='doctor'
 AND b.slug='mind-hospital' AND hospital_private.phone(p.phone)~'^9665[0-9]{8}$'
 ON CONFLICT(cafe_id,kind,dedupe_key) DO NOTHING;
END $$;

CREATE FUNCTION hospital_private.checkout_customer(o public.hospital_orders) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE party public.bf_parties;card uuid;enabled boolean;enrollment jsonb;contact text;identity_count integer;
BEGIN
 IF o.finance_document_id IS NULL OR o.doctor_party_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=o.cafe_id AND slug='mind-hospital') THEN RETURN;END IF;
 SELECT * INTO party FROM public.bf_parties WHERE cafe_id=o.cafe_id AND id=o.doctor_party_id AND active AND kind='customer' AND details->>'hospitalDebtorType'='doctor';
 contact:=hospital_private.phone(party.phone);IF party.id IS NULL OR contact!~'^9665[0-9]{8}$' THEN RETURN;END IF;
 -- Original finance customer/stamp tables remain authoritative; do not invoke the generic pager/message hook
 PERFORM pg_advisory_xact_lock(hashtextextended('loyalty-enroll:'||o.cafe_id::text||':'||contact,0));
 enabled:=brand_finance_private.customer_loyalty_enabled(o.cafe_id);
 SELECT count(*) INTO identity_count FROM public.customer_profiles WHERE cafe_id=o.cafe_id AND phone_normalized=contact;
 IF identity_count>1 OR EXISTS(SELECT 1 FROM public.customer_profiles cp LEFT JOIN public.loyalty_cards lc ON lc.cafe_id=cp.cafe_id AND lc.customer_profile_id=cp.id WHERE cp.cafe_id=o.cafe_id AND cp.phone_normalized=contact AND (cp.status<>'active' OR cp.blocked_at IS NOT NULL OR cp.phone_auth_conflict OR lc.status<>'active')) THEN enabled:=false;END IF;
 INSERT INTO public.bf_sale_customers(cafe_id,document_id,phone,loyalty_status)
 VALUES(o.cafe_id,o.finance_document_id,contact,CASE WHEN enabled THEN 'pending_enrollment' ELSE 'unavailable' END) ON CONFLICT(document_id) DO NOTHING;
 IF enabled THEN
  card:=brand_finance_private.customer_card(o.cafe_id,contact);
  IF card IS NULL AND identity_count=0 THEN
   enrollment:=public.enroll_loyalty_customer_direct(o.cafe_id,party.name,contact,encode(extensions.digest('hospital:'||o.cafe_id::text||':'||contact,'sha256'),'hex'));
   IF enrollment->>'ok'='true' THEN card:=brand_finance_private.customer_card(o.cafe_id,contact);END IF;
  ELSIF card IS NULL AND identity_count=1 THEN
   PERFORM public.issue_rast_loyalty_card(cp.id) FROM public.customer_profiles cp WHERE cp.cafe_id=o.cafe_id AND cp.phone_normalized=contact AND cp.status='active' AND cp.blocked_at IS NULL AND NOT cp.phone_auth_conflict;
   card:=brand_finance_private.customer_card(o.cafe_id,contact);
  END IF;
  IF card IS NOT NULL THEN
   PERFORM brand_finance_private.stamp_sale_customer(o.finance_document_id,card);
   IF NOT hospital_private.card_already_provided(o.cafe_id,card) THEN
    INSERT INTO hospital_private.customer_messages(cafe_id,kind,dedupe_key,party_id,card_id,phone,customer_name)
    VALUES(o.cafe_id,'loyalty_card',card,party.id,card,contact,party.name) ON CONFLICT(cafe_id,kind,dedupe_key) DO NOTHING;
   END IF;
  END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.hospital_store_settings s WHERE s.cafe_id=o.cafe_id AND s.enabled AND s.whatsapp_invoice_enabled) THEN
  INSERT INTO hospital_private.customer_messages(cafe_id,kind,dedupe_key,party_id,document_id,phone,customer_name)
  VALUES(o.cafe_id,'invoice',o.finance_document_id,party.id,o.finance_document_id,contact,party.name) ON CONFLICT(cafe_id,kind,dedupe_key) DO NOTHING;
 END IF;
END $$;

DO $patch$
DECLARE src text;needle text;
BEGIN
 SELECT pg_get_functiondef('hospital_private.ensure_doctor(uuid,text,text,text,text)'::regprocedure) INTO src;
 needle:=$old$RETURNING id INTO person.id;$old$;
 IF (length(src)-length(replace(src,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Doctor creation account message hook drift';END IF;
 EXECUTE replace(src,needle,needle||' PERFORM hospital_private.queue_doctor_account(c,person.id);');
 SELECT pg_get_functiondef('public.hospital_order_manage(uuid,uuid,uuid,text,jsonb)'::regprocedure) INTO src;
 needle:=$old$ IF p_action IN('accept','cancel') AND o.source='menu' THEN$old$;
 IF (length(src)-length(replace(src,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Hospital checkout customer hook drift';END IF;
 EXECUTE replace(src,needle,$new$ IF p_action='checkout' THEN PERFORM hospital_private.checkout_customer(o);END IF;
$new$||needle);
END $patch$;

CREATE FUNCTION public.hospital_customer_messages_claim(p_limit integer DEFAULT 10,p_cafe uuid DEFAULT NULL) RETURNS SETOF hospital_private.customer_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE hospital_private.customer_messages SET status=CASE WHEN status='dispatching' THEN 'unknown' ELSE 'pending' END,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE status IN('processing','dispatching') AND lease_until<now() AND (p_cafe IS NULL OR cafe_id=p_cafe);
 RETURN QUERY WITH pick AS(SELECT id FROM hospital_private.customer_messages WHERE status='pending' AND available_at<=now() AND (p_cafe IS NULL OR cafe_id=p_cafe) ORDER BY available_at,id LIMIT greatest(1,least(coalesce(p_limit,10),25)) FOR UPDATE SKIP LOCKED)
 UPDATE hospital_private.customer_messages n SET status='processing',lease_token=gen_random_uuid(),lease_until=now()+interval '180 seconds',updated_at=now() FROM pick WHERE n.id=pick.id RETURNING n.*;
END $$;

CREATE FUNCTION public.hospital_customer_message_context(p_id uuid,p_lease uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE n hospital_private.customer_messages;b public.cafes;doc jsonb;code text;profile uuid;google_issued boolean:=false;enabled boolean;
BEGIN
 SELECT * INTO n FROM hospital_private.customer_messages WHERE id=p_id AND lease_token=p_lease AND status='processing' AND lease_until>now();
 IF NOT FOUND THEN RAISE EXCEPTION 'HOSPITAL_NOT_FOUND';END IF;
 SELECT * INTO STRICT b FROM public.cafes WHERE id=n.cafe_id;
 SELECT whatsapp_invoice_enabled INTO enabled FROM public.hospital_store_settings WHERE cafe_id=n.cafe_id;
 IF n.kind='invoice' THEN
  SELECT jsonb_build_object('brandName',b.name,'receiptSeller',d.receipt_seller,'cafeId',d.cafe_id,'number',d.number,'createdAt',coalesce(d.local_created_at,d.created_at),'localReference',d.local_reference,'subtotal',d.subtotal,'discount',d.discount,'tax',d.tax,'total',d.total,'paid',d.paid,'customerPhone',n.phone,'customerName',p.name,'customerTaxNumber',p.tax_number,'note',coalesce(d.note,''),'outstanding',st.value->'outstanding','refunded',st.value->'refunded','refundedTotal',st.value->'refunded_total','vatRate',d.vat_rate,'taxInclusive',d.tax_inclusive,'paymentMethod',CASE WHEN a.kind IN('cash','pos','bank') THEN a.kind ELSE '' END,
   'lines',coalesce((SELECT jsonb_agg(jsonb_build_object('name',l.name,'quantity',l.quantity,'unitPrice',l.unit_price,'net',l.net,'tax',l.tax) ORDER BY l.id) FROM public.bf_document_lines l WHERE l.cafe_id=d.cafe_id AND l.document_id=d.id),'[]')) INTO doc
  FROM public.bf_documents d JOIN public.bf_parties p ON p.cafe_id=d.cafe_id AND p.id=d.party_id LEFT JOIN public.bf_accounts a ON a.cafe_id=d.cafe_id AND a.id=d.account_id CROSS JOIN LATERAL(SELECT brand_finance_private.document_state(d.cafe_id,d.id) value) st
  WHERE d.cafe_id=n.cafe_id AND d.id=n.document_id AND d.party_id=n.party_id AND d.kind='sale';
 ELSIF n.kind='loyalty_card' THEN
  SELECT card_code,customer_profile_id INTO code,profile FROM public.loyalty_cards WHERE cafe_id=n.cafe_id AND id=n.card_id AND status='active';
  SELECT EXISTS(SELECT 1 FROM public.wallet_passes WHERE cafe_id=n.cafe_id AND card_id=n.card_id AND provider='google') INTO google_issued;
 END IF;
 RETURN jsonb_build_object('kind',n.kind,'phone',n.phone,'customerName',n.customer_name,'brand',jsonb_build_object('name',b.name,'slug',b.slug),'document',doc,'cardCode',code,'cafeId',n.cafe_id,'profileId',profile,'cardId',n.card_id,'googleIssued',google_issued,'invoiceEnabled',coalesce(enabled,false));
END $$;

CREATE FUNCTION public.hospital_customer_message_authorize(p_id uuid,p_lease uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n hospital_private.customer_messages;valid boolean;
BEGIN
 SELECT * INTO n FROM hospital_private.customer_messages WHERE id=p_id AND lease_token=p_lease AND status='processing' AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 SELECT EXISTS(SELECT 1 FROM public.cafes b JOIN public.hospital_store_settings s ON s.cafe_id=b.id AND s.enabled JOIN public.bf_parties p ON p.cafe_id=b.id AND p.id=n.party_id AND p.active AND p.kind='customer' AND p.details->>'hospitalDebtorType'='doctor' WHERE b.id=n.cafe_id AND b.slug='mind-hospital' AND b.deleted_at IS NULL AND b.status IN('active','published') AND hospital_private.phone(p.phone)=n.phone AND coalesce(p.details->>'hospitalPortalDisabled','false')<>'true' AND platform_access_private.service_enabled(b.id,'finance')) INTO valid;
 IF valid AND n.kind='invoice' THEN
  valid:=EXISTS(SELECT 1 FROM public.hospital_store_settings s JOIN public.bf_documents d ON d.cafe_id=s.cafe_id WHERE s.cafe_id=n.cafe_id AND s.whatsapp_invoice_enabled AND d.id=n.document_id AND d.party_id=n.party_id AND d.kind='sale' AND coalesce((brand_finance_private.document_state(d.cafe_id,d.id)->>'refunded')::boolean,false)=false);
 ELSIF valid AND n.kind='loyalty_card' THEN
  valid:=brand_finance_private.customer_loyalty_enabled(n.cafe_id) AND brand_finance_private.customer_card(n.cafe_id,n.phone)=n.card_id AND NOT hospital_private.card_already_provided(n.cafe_id,n.card_id);
 END IF;
 UPDATE hospital_private.customer_messages SET status=CASE WHEN coalesce(valid,false) THEN 'dispatching' ELSE 'skipped' END,updated_at=now() WHERE id=p_id;
 RETURN coalesce(valid,false);
END $$;
CREATE FUNCTION public.hospital_customer_message_finish(p_id uuid,p_lease uuid,p_outcome text,p_message_id text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_outcome IS NULL OR p_outcome NOT IN('queued','rejected','unknown','not_sent','skipped') OR (p_outcome='queued' AND coalesce(length(p_message_id),0) NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'HOSPITAL_INVALID_INPUT';END IF;
 UPDATE hospital_private.customer_messages SET status=CASE WHEN p_outcome='not_sent' THEN 'pending' ELSE p_outcome END,provider_message_id=CASE WHEN p_outcome='queued' THEN p_message_id END,lease_token=NULL,lease_until=NULL,available_at=now()+interval '1 minute',updated_at=now()
 WHERE id=p_id AND lease_token=p_lease AND ((status='processing' AND p_outcome IN('not_sent','skipped')) OR (status='dispatching' AND p_outcome IN('queued','rejected','unknown')) OR (status='skipped' AND p_outcome='skipped'));
 RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION hospital_private.card_already_provided(uuid,uuid),hospital_private.queue_doctor_account(uuid,uuid),hospital_private.checkout_customer(public.hospital_orders) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.brand_finance_pos_settings_read(uuid),public.brand_finance_pos_settings_save(uuid,boolean),public.hospital_customer_messages_claim(integer,uuid),public.hospital_customer_message_context(uuid,uuid),public.hospital_customer_message_authorize(uuid,uuid),public.hospital_customer_message_finish(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_pos_settings_read(uuid),public.brand_finance_pos_settings_save(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hospital_customer_messages_claim(integer,uuid),public.hospital_customer_message_context(uuid,uuid),public.hospital_customer_message_authorize(uuid,uuid),public.hospital_customer_message_finish(uuid,uuid,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
