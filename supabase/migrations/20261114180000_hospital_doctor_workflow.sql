-- Hospital workflow database connection explicitly authorized on 2026-11-14
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
ALTER TABLE public.hospital_orders ADD COLUMN doctor_party_id uuid,
 ADD COLUMN rejection_reason text NOT NULL DEFAULT '',
 ADD CONSTRAINT hospital_order_doctor_party_fk FOREIGN KEY(cafe_id,doctor_party_id) REFERENCES public.bf_parties(cafe_id,id);

CREATE FUNCTION hospital_private.phone(value text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT regexp_replace(regexp_replace(regexp_replace(translate(coalesce(value,''),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[[:space:]+()-]','','g'),'^00966','966'),'^05','9665')
$$;
CREATE INDEX bf_hospital_doctor_phone ON public.bf_parties(cafe_id,hospital_private.phone(phone)) WHERE kind='customer' AND active;

CREATE FUNCTION hospital_private.ensure_doctor(c uuid,doctor_name text,doctor_phone text,clinic text,floor text) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE person public.bf_parties;contact text:=hospital_private.phone(doctor_phone);matches integer;
BEGIN
 IF contact!~'^9665[0-9]{8}$' OR length(btrim(coalesce(doctor_name,''))) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'HOSPITAL_DEBTOR_REQUIRED';END IF;
 -- The caller holds the same tenant lock as order posting and collections
 SELECT count(*) INTO matches FROM public.bf_parties WHERE cafe_id=c AND kind='customer' AND active AND hospital_private.phone(phone)=contact;
 IF matches>1 THEN RAISE EXCEPTION 'HOSPITAL_IDENTITY_CONFLICT';END IF;
 SELECT * INTO person FROM public.bf_parties WHERE cafe_id=c AND kind='customer' AND active AND hospital_private.phone(phone)=contact FOR UPDATE;
 IF person.id IS NOT NULL AND coalesce(person.details->>'hospitalDebtorType','doctor')<>'doctor' THEN RAISE EXCEPTION 'HOSPITAL_IDENTITY_CONFLICT';END IF;
 IF person.id IS NULL THEN
  INSERT INTO public.bf_parties(cafe_id,name,kind,phone,details) VALUES(c,btrim(doctor_name),'customer',contact,jsonb_build_object('hospitalDebtorType','doctor','clinic',clinic,'floor',floor)) RETURNING id INTO person.id;
 ELSE
  UPDATE public.bf_parties SET details=coalesce(details,'{}')||jsonb_build_object('hospitalDebtorType','doctor','clinic',clinic,'floor',floor) WHERE cafe_id=c AND id=person.id;
 END IF;
 RETURN person.id;
END $$;

CREATE TABLE hospital_private.notifications(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,order_id uuid NOT NULL,
 order_status text NOT NULL CHECK(order_status IN('accepted','cancelled')),phone text NOT NULL CHECK(phone~'^9665[0-9]{8}$'),
 language text NOT NULL CHECK(language IN('ar','en')),customer_name text NOT NULL,order_number bigint NOT NULL,reason text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','processing','dispatching','queued','rejected','unknown','skipped')),
 lease_token uuid,lease_until timestamptz,available_at timestamptz NOT NULL DEFAULT now(),provider_message_id text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(cafe_id,order_id,order_status),FOREIGN KEY(cafe_id,order_id) REFERENCES public.hospital_orders(cafe_id,id)
);
ALTER TABLE hospital_private.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hospital_private.notifications FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX hospital_notification_pending ON hospital_private.notifications(available_at,id) WHERE status='pending';

CREATE OR REPLACE FUNCTION hospital_private.dto(o public.hospital_orders) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',o.id,'number',o.number,'source',o.source,'customerName',o.customer_name,'phone',o.phone,'floor',o.floor,'clinic',o.clinic,'doctor',o.doctor,'notes',o.notes,'language',o.language,'status',o.status,'paymentStatus',o.payment_status,'financeDocumentId',o.finance_document_id,'total',o.total,'totalMax',o.total_max,'needsPriceConfirmation',o.total<>o.total_max,'items',o.items,'createdAt',o.created_at,'doctorPartyId',o.doctor_party_id,'rejectionReason',o.rejection_reason,'notificationStatus',(SELECT n.status FROM hospital_private.notifications n WHERE n.cafe_id=o.cafe_id AND n.order_id=o.id ORDER BY n.created_at DESC,n.id DESC LIMIT 1))
$$;

CREATE OR REPLACE FUNCTION public.hospital_order_manage(p_cafe uuid,p_order uuid,p_request uuid,p_action text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.hospital_orders%ROWTYPE;ev public.hospital_order_events%ROWTYPE;line jsonb;confirmed jsonb;rows jsonb:='[]';idx integer:=0;price numeric;subtotal numeric:=0;final_total numeric;party uuid;party_type text;party_name text;debtor_phone text;result jsonb;sale jsonb;cfg public.bf_settings%ROWTYPE;
BEGIN
 IF NOT hospital_private.can_manage(p_cafe) OR brand_finance_private.role_for(p_cafe) NOT IN('owner','manager','cashier') THEN RAISE EXCEPTION 'HOSPITAL_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>20000 THEN RAISE EXCEPTION 'HOSPITAL_INVALID_INPUT';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,60412));
 SELECT * INTO o FROM public.hospital_orders WHERE cafe_id=p_cafe AND id=p_order FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'HOSPITAL_NOT_FOUND';END IF;
 SELECT * INTO ev FROM public.hospital_order_events WHERE cafe_id=p_cafe AND request_id=p_request;
 IF FOUND THEN IF ev.order_id IS DISTINCT FROM p_order OR ev.action<>p_action OR ev.payload<>p_payload OR ev.actor_id<>auth.uid() THEN RAISE EXCEPTION 'HOSPITAL_REQUEST_CHANGED';END IF;RETURN ev.result||'{"duplicate":true}'::jsonb;END IF;
 IF p_action='checkout' THEN
  IF o.finance_document_id IS NOT NULL OR o.status IN('completed','cancelled') THEN RAISE EXCEPTION 'HOSPITAL_ALREADY_INVOICED';END IF;
  IF coalesce(p_payload->>'paymentMethod','') NOT IN('cash','card','credit') THEN RAISE EXCEPTION 'HOSPITAL_INVALID_PAYMENT';END IF;
  IF jsonb_typeof(p_payload->'confirmedPrices') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'confirmedPrices')<>jsonb_array_length(o.items) THEN RAISE EXCEPTION 'HOSPITAL_CONFIRM_PRICES';END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(o.items) LOOP
   SELECT x INTO confirmed FROM jsonb_array_elements(p_payload->'confirmedPrices')x WHERE (x->>'index')::integer=idx;
   IF confirmed IS NULL OR (SELECT count(*) FROM jsonb_array_elements(p_payload->'confirmedPrices')x WHERE (x->>'index')::integer=idx)<>1 THEN RAISE EXCEPTION 'HOSPITAL_CONFIRM_PRICES';END IF;
   price:=(confirmed->>'unitPrice')::numeric;
   IF price IS NULL OR price< (line->>'unitPrice')::numeric OR price>(line->>'maxUnitPrice')::numeric OR price<>round(price,2) THEN RAISE EXCEPTION 'HOSPITAL_CONFIRM_PRICES';END IF;
   rows:=rows||jsonb_build_array(jsonb_build_object('productId',line->>'productId','quantity',(line->>'quantity')::numeric,'price',price,'expectedUnitPrice',price,'hospitalLineIndex',idx));
   subtotal:=subtotal+round(price*(line->>'quantity')::numeric,2);idx:=idx+1;
  END LOOP;
  SELECT * INTO STRICT cfg FROM public.bf_settings WHERE cafe_id=p_cafe;
  IF cfg.vat_rate<>o.vat_rate OR cfg.tax_inclusive<>o.tax_inclusive THEN RAISE EXCEPTION 'HOSPITAL_TAX_CHANGED';END IF;
  final_total:=subtotal+CASE WHEN cfg.tax_inclusive THEN 0 ELSE round(subtotal*cfg.vat_rate/100,2) END;
  PERFORM hospital_private.posting_guard(p_cafe,(p_payload->>'shiftId')::uuid);
  party_type:=coalesce(p_payload->>'debtorType','doctor');
  IF party_type='clinic' AND p_payload->>'paymentMethod'='credit' THEN
   party:=(p_payload->>'partyId')::uuid;
   IF party IS NULL THEN
    party_name:=btrim(coalesce(p_payload->>'debtorName',''));debtor_phone:=hospital_private.phone(p_payload->>'debtorPhone');
    IF length(party_name) NOT BETWEEN 2 AND 120 OR debtor_phone!~'^(9665[0-9]{8})?$' THEN RAISE EXCEPTION 'HOSPITAL_DEBTOR_REQUIRED';END IF;
    SELECT id INTO party FROM public.bf_parties WHERE cafe_id=p_cafe AND kind='customer' AND active AND details->>'hospitalDebtorType'='clinic' AND name=party_name ORDER BY id LIMIT 1;
    IF party IS NULL THEN INSERT INTO public.bf_parties(cafe_id,name,kind,phone,details) VALUES(p_cafe,party_name,'customer',debtor_phone,jsonb_build_object('hospitalDebtorType','clinic','clinic',o.clinic)) RETURNING id INTO party;END IF;
   ELSIF NOT EXISTS(SELECT 1 FROM public.bf_parties WHERE cafe_id=p_cafe AND id=party AND kind='customer' AND active AND details->>'hospitalDebtorType'='clinic') THEN RAISE EXCEPTION 'HOSPITAL_DEBTOR_REQUIRED';END IF;
  ELSIF o.phone~'^9665[0-9]{8}$' OR p_payload->>'paymentMethod'='credit' THEN
   debtor_phone:=CASE WHEN o.phone~'^9665[0-9]{8}$' THEN o.phone ELSE p_payload->>'debtorPhone' END;
   party_name:=coalesce(nullif(btrim(o.doctor),''),nullif(btrim(o.customer_name),''),p_payload->>'debtorName');
   party:=hospital_private.ensure_doctor(p_cafe,party_name,debtor_phone,o.clinic,o.floor);
   IF nullif(p_payload->>'partyId','') IS NOT NULL AND (p_payload->>'partyId')::uuid<>party THEN RAISE EXCEPTION 'HOSPITAL_DEBTOR_REQUIRED';END IF;
  END IF;
  IF p_payload->>'paymentMethod'<>'credit' THEN PERFORM hospital_private.account_guard(p_cafe,p_payload->>'paymentMethod',(p_payload->>'accountId')::uuid,(p_payload->>'shiftId')::uuid);END IF;
  INSERT INTO hospital_private.checkout_quotes(cafe_id,request_id,actor_id,transaction_id,lines) VALUES(p_cafe,p_request,auth.uid(),txid_current(),rows);
  sale:=public.brand_finance_execute(p_cafe,'sale',jsonb_build_object('lines',rows,'discount',0,'partyId',party,'accountId',CASE WHEN p_payload->>'paymentMethod'<>'credit' THEN p_payload->>'accountId' END,'shiftId',p_payload->>'shiftId','warehouseId',p_payload->>'warehouseId','expectedTotal',final_total,'note',left('Hospital #'||o.number||' / '||o.floor||' / '||o.clinic||' / '||o.customer_name||' / '||coalesce(p_payload->>'note',''),1000)),p_request);
  DELETE FROM hospital_private.checkout_quotes WHERE cafe_id=p_cafe AND request_id=p_request;
  UPDATE public.hospital_orders SET doctor_party_id=CASE WHEN party_type='doctor' THEN party ELSE doctor_party_id END,finance_document_id=(sale->>'id')::uuid,payment_status=CASE WHEN p_payload->>'paymentMethod'='credit' THEN 'credit' ELSE 'paid' END,status=CASE WHEN status='pending' THEN 'accepted' ELSE status END,total=final_total,total_max=final_total,
   items=(SELECT jsonb_agg(x.value||jsonb_build_object('quotedUnitPrice',x.value->'unitPrice','quotedMaxUnitPrice',x.value->'maxUnitPrice','unitPrice',rows->(x.ordinality::integer-1)->'price','maxUnitPrice',rows->(x.ordinality::integer-1)->'price') ORDER BY x.ordinality) FROM jsonb_array_elements(o.items) WITH ORDINALITY x(value,ordinality)),updated_at=now() WHERE id=o.id RETURNING * INTO o;
 ELSIF p_action='accept' AND o.status='pending' THEN
  IF o.phone~'^9665[0-9]{8}$' THEN party:=hospital_private.ensure_doctor(p_cafe,coalesce(nullif(btrim(o.doctor),''),o.customer_name),o.phone,o.clinic,o.floor);END IF;
  UPDATE public.hospital_orders SET status='accepted',doctor_party_id=party,updated_at=now() WHERE id=o.id RETURNING * INTO o;
 ELSIF p_action='prepare' AND o.status='accepted' THEN UPDATE public.hospital_orders SET status='preparing',updated_at=now() WHERE id=o.id RETURNING * INTO o;
 ELSIF p_action='ready' AND o.status='preparing' THEN UPDATE public.hospital_orders SET status='ready',updated_at=now() WHERE id=o.id RETURNING * INTO o;
 ELSIF p_action='complete' AND o.status IN('accepted','preparing','ready') AND o.finance_document_id IS NOT NULL THEN UPDATE public.hospital_orders SET status='completed',updated_at=now() WHERE id=o.id RETURNING * INTO o;
 ELSIF p_action='cancel' AND o.finance_document_id IS NULL AND o.status NOT IN('completed','cancelled') AND length(btrim(coalesce(p_payload->>'note',''))) BETWEEN 3 AND 500 THEN UPDATE public.hospital_orders SET status='cancelled',rejection_reason=btrim(p_payload->>'note'),updated_at=now() WHERE id=o.id RETURNING * INTO o;
 ELSE RAISE EXCEPTION 'HOSPITAL_INVALID_STATE';END IF;
 IF p_action IN('accept','cancel') AND o.source='menu' THEN
  INSERT INTO hospital_private.notifications(cafe_id,order_id,order_status,phone,language,customer_name,order_number,reason) VALUES(p_cafe,o.id,o.status,o.phone,o.language,coalesce(nullif(o.doctor,''),o.customer_name),o.number,o.rejection_reason) ON CONFLICT(cafe_id,order_id,order_status) DO NOTHING;
 END IF;
 result:=jsonb_build_object('id',o.id,'status',o.status,'paymentStatus',o.payment_status,'financeDocumentId',o.finance_document_id,'financeDocumentNumber',sale->'number','doctorPartyId',o.doctor_party_id,'notificationStatus',(SELECT n.status FROM hospital_private.notifications n WHERE n.cafe_id=p_cafe AND n.order_id=o.id ORDER BY n.created_at DESC,n.id DESC LIMIT 1));
 INSERT INTO public.hospital_order_events(cafe_id,request_id,order_id,action,payload,result,actor_id) VALUES(p_cafe,p_request,p_order,p_action,p_payload,result,auth.uid());
 RETURN result;
END $$;

CREATE FUNCTION public.hospital_order_receipt(p_cafe uuid,p_order uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT hospital_private.can_manage(p_cafe) THEN RAISE EXCEPTION 'HOSPITAL_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT (to_jsonb(d)-'cafe_id'-'created_by')||brand_finance_private.document_state(p_cafe,d.id)||jsonb_build_object('lines',coalesce((SELECT jsonb_agg((to_jsonb(l)-'cafe_id'-'document_id'-'cost')||'{"cost":0}'::jsonb ORDER BY l.id) FROM public.bf_document_lines l WHERE l.cafe_id=p_cafe AND l.document_id=d.id),'[]')) INTO result
 FROM public.hospital_orders o JOIN public.bf_documents d ON d.cafe_id=o.cafe_id AND d.id=o.finance_document_id AND d.kind='sale' WHERE o.cafe_id=p_cafe AND o.id=p_order;
 IF result IS NULL THEN RAISE EXCEPTION 'HOSPITAL_NOT_FOUND';END IF;RETURN result;
END $$;

CREATE FUNCTION public.hospital_doctor_statement(p_slug text,p_user uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.cafes;person public.bf_parties;contact text;matches integer;invoices jsonb;invoiced numeric;paid numeric;balance numeric;
BEGIN
 -- Only the server calls this RPC after validating the current active user session
 SELECT hospital_private.phone(phone) INTO contact FROM auth.users WHERE id=p_user AND phone_confirmed_at IS NOT NULL AND deleted_at IS NULL;
 IF contact IS NULL OR contact!~'^9665[0-9]{8}$' THEN RAISE EXCEPTION 'HOSPITAL_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT b.* INTO c FROM public.cafes b JOIN public.hospital_store_settings s ON s.cafe_id=b.id AND s.enabled WHERE b.slug=p_slug AND b.deleted_at IS NULL AND b.status IN('active','published') AND platform_access_private.service_enabled(b.id,'finance');
 IF c.id IS NULL THEN RAISE EXCEPTION 'HOSPITAL_UNAVAILABLE';END IF;
 SELECT count(*) INTO matches FROM public.bf_parties WHERE cafe_id=c.id AND kind='customer' AND active AND hospital_private.phone(phone)=contact;
 IF matches=0 THEN RAISE EXCEPTION 'HOSPITAL_DOCTOR_NOT_FOUND';END IF;
 IF matches<>1 THEN RAISE EXCEPTION 'HOSPITAL_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT * INTO person FROM public.bf_parties WHERE cafe_id=c.id AND kind='customer' AND active AND details->>'hospitalDebtorType'='doctor' AND hospital_private.phone(phone)=contact;
 IF person.id IS NULL THEN RAISE EXCEPTION 'HOSPITAL_DOCTOR_NOT_FOUND';END IF;
 IF coalesce(person.details->>'hospitalPortalDisabled','false')='true' THEN RAISE EXCEPTION 'HOSPITAL_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'number',d.number,'createdAt',d.created_at,'total',d.total,'paid',greatest(d.total-coalesce((s.value->>'refunded_total')::numeric,0)-coalesce((s.value->>'outstanding')::numeric,0),0),'outstanding',s.value->'outstanding','refundedTotal',s.value->'refunded_total','status',CASE WHEN (s.value->>'refunded')::boolean THEN 'refunded' WHEN (s.value->>'outstanding')::numeric=0 THEN 'paid' ELSE 'unpaid' END,'items',coalesce((SELECT jsonb_agg(jsonb_build_object('name',l.name,'quantity',l.quantity,'unitPrice',l.unit_price,'total',l.net+l.tax) ORDER BY l.id) FROM public.bf_document_lines l WHERE l.cafe_id=c.id AND l.document_id=d.id),'[]')) ORDER BY d.created_at DESC,d.id),'[]'),
 coalesce(sum(d.total-coalesce((s.value->>'refunded_total')::numeric,0)),0),coalesce(sum(greatest(d.total-coalesce((s.value->>'refunded_total')::numeric,0)-coalesce((s.value->>'outstanding')::numeric,0),0)),0),coalesce(sum((s.value->>'outstanding')::numeric),0)
 INTO invoices,invoiced,paid,balance FROM public.bf_documents d CROSS JOIN LATERAL(SELECT brand_finance_private.document_state(c.id,d.id) value)s WHERE d.cafe_id=c.id AND d.party_id=person.id AND d.kind='sale';
 SELECT coalesce(sum(j.debit-j.credit),0) INTO balance FROM public.bf_journal j JOIN public.bf_accounts a ON a.cafe_id=j.cafe_id AND a.id=j.account_id WHERE j.cafe_id=c.id AND j.party_id=person.id AND a.kind='receivable';
 RETURN jsonb_build_object('brand',jsonb_build_object('name',c.name,'slug',c.slug,'logoUrl',null),'doctor',jsonb_build_object('id',person.id,'name',person.name,'phone',person.phone),'invoices',invoices,'totalInvoiced',invoiced,'totalPaid',paid,'balance',balance);
END $$;

CREATE FUNCTION public.hospital_notifications_claim(p_limit integer DEFAULT 10) RETURNS SETOF hospital_private.notifications LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE hospital_private.notifications SET status=CASE WHEN status='dispatching' THEN 'unknown' ELSE 'pending' END,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE status IN('processing','dispatching') AND lease_until<now();
 RETURN QUERY WITH pick AS(SELECT id FROM hospital_private.notifications WHERE status='pending' AND available_at<=now() ORDER BY available_at,id LIMIT greatest(1,least(coalesce(p_limit,10),25)) FOR UPDATE SKIP LOCKED)
 UPDATE hospital_private.notifications n SET status='processing',lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',updated_at=now() FROM pick WHERE n.id=pick.id RETURNING n.*;
END $$;
CREATE FUNCTION public.hospital_notification_authorize(p_id uuid,p_lease uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n hospital_private.notifications;valid boolean;
BEGIN
 SELECT * INTO n FROM hospital_private.notifications WHERE id=p_id AND lease_token=p_lease AND status='processing' AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 SELECT EXISTS(SELECT 1 FROM public.hospital_orders o JOIN public.hospital_store_settings s ON s.cafe_id=o.cafe_id AND s.enabled JOIN public.cafes c ON c.id=o.cafe_id AND c.deleted_at IS NULL AND c.status IN('active','published') WHERE o.cafe_id=n.cafe_id AND o.id=n.order_id AND o.phone=n.phone AND ((n.order_status='accepted' AND o.status<>'cancelled') OR (n.order_status='cancelled' AND o.status='cancelled' AND o.rejection_reason=n.reason))) INTO valid;
 UPDATE hospital_private.notifications SET status=CASE WHEN valid THEN 'dispatching' ELSE 'skipped' END,updated_at=now() WHERE id=p_id;
 RETURN valid;
END $$;
CREATE FUNCTION public.hospital_notification_finish(p_id uuid,p_lease uuid,p_outcome text,p_message_id text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_outcome NOT IN('queued','rejected','unknown','not_sent','skipped') OR (p_outcome='queued' AND coalesce(length(p_message_id),0) NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'HOSPITAL_INVALID_INPUT';END IF;
 UPDATE hospital_private.notifications SET status=CASE WHEN p_outcome='not_sent' THEN 'pending' ELSE p_outcome END,provider_message_id=CASE WHEN p_outcome='queued' THEN p_message_id END,lease_token=NULL,lease_until=NULL,available_at=now()+interval '1 minute',updated_at=now()
 WHERE id=p_id AND lease_token=p_lease AND ((status='processing' AND p_outcome IN('not_sent','skipped')) OR (status='dispatching' AND p_outcome IN('queued','rejected','unknown')) OR (status='skipped' AND p_outcome='skipped'));
 RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION hospital_private.phone(text),hospital_private.ensure_doctor(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.hospital_order_receipt(uuid,uuid),public.hospital_doctor_statement(text,uuid),public.hospital_notifications_claim(integer),public.hospital_notification_authorize(uuid,uuid),public.hospital_notification_finish(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hospital_order_receipt(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hospital_doctor_statement(text,uuid),public.hospital_notifications_claim(integer),public.hospital_notification_authorize(uuid,uuid),public.hospital_notification_finish(uuid,uuid,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
