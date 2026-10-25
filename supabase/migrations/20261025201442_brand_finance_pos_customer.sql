-- Optional POS customer engagement is committed with the authoritative sale
-- Existing scanner, enrollment, pager delivery and Wallet paths remain intact
BEGIN;
ALTER TABLE public.bf_documents ADD COLUMN customer_phone text CHECK(customer_phone IS NULL OR customer_phone ~ '^9665[0-9]{8}$');
CREATE INDEX bf_documents_customer_phone ON public.bf_documents(cafe_id,customer_phone,created_at DESC) WHERE customer_phone IS NOT NULL;
CREATE TABLE public.bf_sale_customers(
 cafe_id uuid NOT NULL,document_id uuid PRIMARY KEY,phone text NOT NULL CHECK(phone ~ '^9665[0-9]{8}$'),
 pager_order_id uuid UNIQUE REFERENCES public.pager_orders(id),loyalty_status text NOT NULL CHECK(loyalty_status IN('pending_enrollment','stamped','unavailable','refunded')),
 card_id uuid REFERENCES public.loyalty_cards(id),stamp_event_id uuid UNIQUE REFERENCES public.loyalty_card_events(id),
 redeemed_reward_id uuid UNIQUE REFERENCES public.customer_reward_instances(id),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),UNIQUE(cafe_id,document_id)
);
CREATE INDEX bf_sale_customer_pending ON public.bf_sale_customers(cafe_id,phone,created_at,document_id) WHERE loyalty_status='pending_enrollment';
CREATE TABLE public.bf_customer_message_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,document_id uuid NOT NULL UNIQUE,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','dispatching','queued','rejected','unknown','cancelled')),
 lease_token uuid,lease_until timestamptz,provider_message_id text,error_code text,created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
 FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_sale_customers(cafe_id,document_id)
);
CREATE INDEX bf_customer_message_pending ON public.bf_customer_message_jobs(created_at,id) WHERE state='pending';
ALTER TABLE public.bf_sale_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bf_customer_message_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_sale_customers,public.bf_customer_message_jobs FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION brand_finance_private.customer_phone(p_phone text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE v text;
BEGIN
 IF p_phone IS NULL OR btrim(p_phone)='' THEN RETURN NULL; END IF;
 IF length(p_phone)>30 THEN RAISE EXCEPTION 'Invalid customer phone'; END IF;
 v:=public.normalize_customer_phone(translate(p_phone,'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'));
 IF v IS NULL OR v !~ '^9665[0-9]{8}$' THEN RAISE EXCEPTION 'Invalid customer phone'; END IF;
 RETURN v;
END $$;
CREATE FUNCTION brand_finance_private.customer_loyalty_enabled(p_cafe uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT platform_access_private.service_enabled(p_cafe,'loyalty') AND EXISTS(SELECT 1 FROM public.cafe_loyalty_programs WHERE cafe_id=p_cafe AND enabled)
 AND EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND status IN('active','published') AND deleted_at IS NULL)
$$;
CREATE FUNCTION brand_finance_private.customer_card(p_cafe uuid,p_phone text) RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT lc.id FROM public.customer_profiles cp JOIN public.loyalty_cards lc ON lc.cafe_id=cp.cafe_id AND lc.customer_profile_id=cp.id
 WHERE cp.cafe_id=p_cafe AND cp.phone_normalized=p_phone AND cp.status='active' AND cp.blocked_at IS NULL AND NOT cp.phone_auth_conflict
 AND lc.status='active' AND (SELECT count(*) FROM public.customer_profiles p WHERE p.cafe_id=p_cafe AND p.phone_normalized=p_phone)=1
$$;
CREATE FUNCTION brand_finance_private.stamp_sale_customer(p_document uuid,p_card uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE s public.bf_sale_customers; d public.bf_documents; c public.loyalty_cards; p public.cafe_loyalty_programs;
 v_stamps integer;v_rewards integer;v_reward boolean;v_event uuid;
BEGIN
 SELECT * INTO s FROM public.bf_sale_customers WHERE document_id=p_document FOR UPDATE;
 IF NOT FOUND OR s.loyalty_status<>'pending_enrollment' THEN RETURN; END IF;
 SELECT * INTO STRICT d FROM public.bf_documents WHERE id=p_document;
 IF (SELECT coalesce(sum(total),0) FROM public.bf_documents WHERE cafe_id=d.cafe_id AND kind='refund' AND reference_id=d.id)>=d.total THEN
  UPDATE public.bf_sale_customers SET loyalty_status='refunded' WHERE document_id=d.id; RETURN;
 END IF;
 IF NOT brand_finance_private.customer_loyalty_enabled(s.cafe_id) OR brand_finance_private.customer_card(s.cafe_id,s.phone) IS DISTINCT FROM p_card THEN RETURN; END IF;
 SELECT * INTO STRICT p FROM public.cafe_loyalty_programs WHERE cafe_id=s.cafe_id AND enabled FOR SHARE;
 SELECT * INTO STRICT c FROM public.loyalty_cards WHERE id=p_card AND cafe_id=s.cafe_id FOR UPDATE;
 SELECT count(*) INTO v_rewards FROM public.customer_reward_instances WHERE cafe_id=s.cafe_id AND loyalty_card_id=c.id AND status='available' AND (expires_at IS NULL OR expires_at>now());
 v_stamps:=c.stamps_in_cycle+1;v_reward:=v_stamps>=p.purchases_required;
 IF v_reward THEN v_stamps:=0;v_rewards:=v_rewards+1; END IF;
 UPDATE public.loyalty_cards SET stamps_in_cycle=v_stamps,available_rewards=v_rewards,total_purchases=total_purchases+1,
 completed_cycles=completed_cycles+CASE WHEN v_reward THEN 1 ELSE 0 END,last_used_at=now(),updated_at=now() WHERE id=c.id;
 INSERT INTO public.loyalty_card_events(cafe_id,card_id,performed_by,event_type,invoice_barcode,invoice_amount,stamps_added,reward_delta,stamps_after,rewards_after,note)
 VALUES(s.cafe_id,c.id,d.created_by,'stamp','POS-'||d.number::text,d.total,1,CASE WHEN v_reward THEN 1 ELSE 0 END,v_stamps,v_rewards,'ختم فاتورة نقطة البيع') RETURNING id INTO v_event;
 UPDATE public.bf_sale_customers SET card_id=c.id,stamp_event_id=v_event,loyalty_status='stamped' WHERE document_id=d.id;
END $$;
CREATE FUNCTION brand_finance_private.consume_customer_pending() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_phone text;v_document uuid;
BEGIN
 SELECT phone_normalized INTO v_phone FROM public.customer_profiles WHERE id=NEW.customer_profile_id AND cafe_id=NEW.cafe_id;
 IF v_phone IS NULL OR NEW.status<>'active' THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('loyalty-enroll:'||NEW.cafe_id::text||':'||v_phone,0));
 FOR v_document IN SELECT document_id FROM public.bf_sale_customers WHERE cafe_id=NEW.cafe_id AND phone=v_phone AND loyalty_status='pending_enrollment' ORDER BY created_at,document_id LOOP
  PERFORM brand_finance_private.stamp_sale_customer(v_document,NEW.id);
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER bf_pos_customer_enrollment AFTER INSERT ON public.loyalty_cards FOR EACH ROW EXECUTE FUNCTION brand_finance_private.consume_customer_pending();

CREATE FUNCTION brand_finance_private.refund_pending_customer() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.bf_documents d WHERE d.id=NEW.reference_id AND d.cafe_id=NEW.cafe_id AND d.kind='sale'
  AND (SELECT coalesce(sum(r.total),0) FROM public.bf_documents r WHERE r.cafe_id=d.cafe_id AND r.kind='refund' AND r.reference_id=d.id)>=d.total) THEN
  UPDATE public.bf_sale_customers SET loyalty_status='refunded' WHERE cafe_id=NEW.cafe_id AND document_id=NEW.reference_id AND loyalty_status='pending_enrollment';
  UPDATE public.bf_customer_message_jobs SET state='cancelled',finished_at=now() WHERE cafe_id=NEW.cafe_id AND document_id=NEW.reference_id AND state='pending';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bf_pos_customer_refund AFTER INSERT ON public.bf_documents FOR EACH ROW WHEN(NEW.kind='refund') EXECUTE FUNCTION brand_finance_private.refund_pending_customer();

CREATE FUNCTION brand_finance_private.apply_sale_customer(p_cafe uuid,p_document uuid,p_payload jsonb,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE d public.bf_documents;c public.loyalty_cards;r public.customer_reward_instances;v_phone text;v_card uuid;v_reward uuid;
 v_loyalty boolean;v_pager uuid;v_rewards integer;v_state text;v_existing public.pager_orders;v_hash text:=p_payload->>'pagerFeedbackHash';
BEGIN
 SELECT * INTO STRICT d FROM public.bf_documents WHERE cafe_id=p_cafe AND id=p_document AND kind='sale';
 v_phone:=d.customer_phone;v_reward:=nullif(p_payload->>'redeemRewardId','')::uuid;
 IF v_phone IS NULL THEN IF v_reward IS NOT NULL THEN RAISE EXCEPTION 'Customer phone required for reward'; END IF; RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('loyalty-enroll:'||p_cafe::text||':'||v_phone,0));
 v_loyalty:=brand_finance_private.customer_loyalty_enabled(p_cafe);v_card:=CASE WHEN v_loyalty THEN brand_finance_private.customer_card(p_cafe,v_phone) END;
 -- Ambiguous, blocked or suspended identities never acquire a deferred reward
 IF (SELECT count(*) FROM public.customer_profiles WHERE cafe_id=p_cafe AND phone_normalized=v_phone)>1
 OR EXISTS(SELECT 1 FROM public.customer_profiles cp LEFT JOIN public.loyalty_cards lc ON lc.cafe_id=cp.cafe_id AND lc.customer_profile_id=cp.id
  WHERE cp.cafe_id=p_cafe AND cp.phone_normalized=v_phone AND (cp.status<>'active' OR cp.blocked_at IS NOT NULL OR cp.phone_auth_conflict OR lc.status<>'active')) THEN
  v_loyalty:=false;v_card:=NULL;
 END IF;
 IF v_reward IS NOT NULL THEN
  IF v_card IS NULL THEN RAISE EXCEPTION 'Customer reward unavailable'; END IF;
  -- Match the existing scanner lock order: card first, then reward
  SELECT * INTO STRICT c FROM public.loyalty_cards WHERE id=v_card FOR UPDATE;
  SELECT * INTO r FROM public.customer_reward_instances WHERE id=v_reward AND cafe_id=p_cafe AND loyalty_card_id=v_card AND source_type='loyalty' FOR UPDATE;
  IF NOT FOUND OR r.status<>'available' OR (r.expires_at IS NOT NULL AND r.expires_at<=now()) THEN RAISE EXCEPTION 'Customer reward unavailable'; END IF;
  UPDATE public.customer_reward_instances SET status='redeemed',redeemed_at=now(),redeemed_by=auth.uid(),updated_at=now(),
   metadata=metadata||jsonb_build_object('financeDocumentId',d.id,'financeDocumentNumber',d.number,'redeemedByFinanceUserId',auth.uid()) WHERE id=r.id;
  INSERT INTO public.customer_reward_redemptions(cafe_id,reward_instance_id,customer_id,redeemed_by,scanned_code) VALUES(p_cafe,r.id,r.customer_id,auth.uid(),r.reward_code);
  SELECT count(*) INTO v_rewards FROM public.customer_reward_instances WHERE cafe_id=p_cafe AND loyalty_card_id=v_card AND status='available' AND (expires_at IS NULL OR expires_at>now());
  UPDATE public.loyalty_cards SET available_rewards=v_rewards,last_used_at=now(),updated_at=now() WHERE id=v_card;
  INSERT INTO public.loyalty_card_events(cafe_id,card_id,performed_by,event_type,invoice_barcode,reward_delta,stamps_after,rewards_after,note)
  VALUES(p_cafe,v_card,auth.uid(),'redeem','POS-'||d.number::text,-1,c.stamps_in_cycle,v_rewards,'صرف مكافأة من نقطة البيع');
 END IF;
 IF pager_private.enabled(p_cafe) THEN
  IF v_hash IS NULL OR v_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Pager identity required'; END IF;
  SELECT * INTO v_existing FROM public.pager_orders WHERE cafe_id=p_cafe AND invoice_number=d.number::text AND status IN('waiting','ready') FOR UPDATE;
  IF FOUND THEN
   IF v_existing.phone<>v_phone OR EXISTS(SELECT 1 FROM public.bf_sale_customers WHERE pager_order_id=v_existing.id) THEN RAISE EXCEPTION 'رقم الفاتورة مرتبط بطلب بيجر آخر راجع رقم العميل قبل تأكيد البيع'; END IF;
   v_pager:=v_existing.id;
  ELSE
   v_pager:=p_request;
   PERFORM public.pager_create_order(v_pager,p_cafe,d.number::text,v_phone,brand_finance_private.treasury_actor_name(p_cafe,auth.uid()),'نقطة البيع',auth.uid(),v_hash);
  END IF;
 END IF;
 v_state:=CASE WHEN v_loyalty THEN 'pending_enrollment' ELSE 'unavailable' END;
 INSERT INTO public.bf_sale_customers(cafe_id,document_id,phone,pager_order_id,loyalty_status,redeemed_reward_id) VALUES(p_cafe,d.id,v_phone,v_pager,v_state,v_reward);
 IF v_card IS NOT NULL THEN PERFORM brand_finance_private.stamp_sale_customer(d.id,v_card); END IF;
 SELECT loyalty_status INTO v_state FROM public.bf_sale_customers WHERE document_id=d.id;
 IF v_loyalty THEN INSERT INTO public.bf_customer_message_jobs(cafe_id,document_id) VALUES(p_cafe,d.id); END IF;
 RETURN jsonb_build_object('phone',v_phone,'pagerOrderId',v_pager,'pagerStatus',CASE WHEN v_pager IS NULL THEN 'unavailable' ELSE coalesce(v_existing.status,'waiting') END,
  'loyaltyStatus',v_state,'rewardRedeemedId',v_reward,'notificationStatus',CASE WHEN v_loyalty THEN 'pending' ELSE 'not_applicable' END);
END $$;

-- Patch only the authoritative sale insertion and pre-request-result integration
DO $$ DECLARE before_definition text;definition text;old text;replacement text;
BEGIN
 before_definition:=pg_get_functiondef('brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid)'::regprocedure);
 old:='subtotal,discount,tax,total,paid,note,created_by,vat_rate,tax_inclusive) VALUES(id,p_cafe_id,p_operation,pid,CASE WHEN p_operation=''sale'' THEN sid ELSE NULL END,aid,wid,subtotal,discount,tax,total,paid,note,auth.uid(),cfg.vat_rate,cfg.tax_inclusive)';
 replacement:='subtotal,discount,tax,total,paid,note,created_by,vat_rate,tax_inclusive,customer_phone) VALUES(id,p_cafe_id,p_operation,pid,CASE WHEN p_operation=''sale'' THEN sid ELSE NULL END,aid,wid,subtotal,discount,tax,total,paid,note,auth.uid(),cfg.vat_rate,cfg.tax_inclusive,CASE WHEN p_operation=''sale'' THEN brand_finance_private.customer_phone(p_payload->>''customerPhone'') END)';
 IF position(old IN before_definition)=0 THEN RAISE EXCEPTION 'Sale insertion anchor missing'; END IF;
 definition:=replace(before_definition,old,replacement);
 old:='INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by) VALUES(p_cafe_id,p_request_id,p_operation,p_payload,result,auth.uid());';
 IF position(old IN definition)=0 THEN RAISE EXCEPTION 'Sale result anchor missing'; END IF;
 definition:=replace(definition,old,'IF p_operation=''sale'' AND (nullif(btrim(p_payload->>''customerPhone''),'''') IS NOT NULL OR nullif(p_payload->>''redeemRewardId'','''') IS NOT NULL) THEN result:=result||jsonb_build_object(''customer'',brand_finance_private.apply_sale_customer(p_cafe_id,id,p_payload,p_request_id)); END IF; '||old);
 EXECUTE definition;
END $$;

CREATE FUNCTION public.brand_finance_pos_customer(p_cafe_id uuid,p_phone text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_phone text;v_card uuid;c public.loyalty_cards;v_enabled boolean;v_rewards jsonb;
BEGIN
 PERFORM brand_finance_private.role_for(p_cafe_id);v_phone:=brand_finance_private.customer_phone(p_phone);
 IF v_phone IS NULL THEN RAISE EXCEPTION 'Customer phone required'; END IF;
 v_enabled:=brand_finance_private.customer_loyalty_enabled(p_cafe_id);v_card:=CASE WHEN v_enabled THEN brand_finance_private.customer_card(p_cafe_id,v_phone) END;
 SELECT * INTO c FROM public.loyalty_cards WHERE id=v_card;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'title',reward_title,'expiresAt',expires_at) ORDER BY issued_at,id),'[]'::jsonb) INTO v_rewards
 FROM public.customer_reward_instances WHERE cafe_id=p_cafe_id AND loyalty_card_id=v_card AND source_type='loyalty' AND status='available' AND (expires_at IS NULL OR expires_at>now());
 RETURN jsonb_build_object('phone',v_phone,'loyaltyEnabled',v_enabled,'pagerEnabled',pager_private.enabled(p_cafe_id),'member',v_card IS NOT NULL,
 'customerName',c.customer_name,'stampsInCycle',coalesce(c.stamps_in_cycle,0),'purchasesRequired',coalesce((SELECT purchases_required FROM public.cafe_loyalty_programs WHERE cafe_id=p_cafe_id AND enabled),0),'rewards',v_rewards);
END $$;
CREATE FUNCTION public.brand_finance_pos_pager_page(p_cafe_id uuid,p_page integer DEFAULT 0,p_status text DEFAULT 'active',p_query text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM brand_finance_private.role_for(p_cafe_id);
 IF NOT pager_private.enabled(p_cafe_id) THEN RAISE EXCEPTION 'Pager service unavailable' USING ERRCODE='42501'; END IF;
 RETURN public.pager_get_page(p_cafe_id,p_page,p_status,p_query);
END $$;
CREATE FUNCTION public.brand_finance_pos_pager_transition(p_cafe_id uuid,p_order_id uuid,p_status text) RETURNS public.pager_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM brand_finance_private.role_for(p_cafe_id);
 RETURN public.pager_transition_order(p_cafe_id,p_order_id,p_status,brand_finance_private.treasury_actor_name(p_cafe_id,auth.uid()),'نقطة البيع',auth.uid());
END $$;

CREATE FUNCTION public.brand_finance_claim_customer_messages(p_cafe_id uuid DEFAULT NULL,p_limit integer DEFAULT 5) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Invalid message batch'; END IF;
 UPDATE public.bf_customer_message_jobs SET state='unknown',finished_at=now(),error_code='dispatch_expired' WHERE state='dispatching' AND lease_until<=now() AND (p_cafe_id IS NULL OR cafe_id=p_cafe_id);
 UPDATE public.bf_customer_message_jobs j SET state='cancelled',finished_at=now() WHERE state='pending' AND (p_cafe_id IS NULL OR j.cafe_id=p_cafe_id)
 AND (NOT brand_finance_private.customer_loyalty_enabled(j.cafe_id) OR EXISTS(SELECT 1 FROM public.bf_sale_customers s WHERE s.document_id=j.document_id AND s.loyalty_status='refunded'));
 WITH picked AS(SELECT j.id FROM public.bf_customer_message_jobs j WHERE j.state='pending' AND (p_cafe_id IS NULL OR j.cafe_id=p_cafe_id) ORDER BY j.created_at,j.id LIMIT p_limit FOR UPDATE SKIP LOCKED),
 claimed AS(UPDATE public.bf_customer_message_jobs j SET state='dispatching',lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes' FROM picked WHERE j.id=picked.id RETURNING j.*)
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',j.id,'leaseToken',j.lease_token,'phone',s.phone,'brandName',c.name,'slug',c.slug,'invoiceNumber',d.number,'loyaltyStatus',s.loyalty_status,'cardCode',lc.card_code)),'[]'::jsonb) INTO result
 FROM claimed j JOIN public.bf_sale_customers s ON s.document_id=j.document_id JOIN public.bf_documents d ON d.id=j.document_id JOIN public.cafes c ON c.id=j.cafe_id
 LEFT JOIN public.loyalty_cards lc ON lc.id=s.card_id AND lc.cafe_id=j.cafe_id;
 RETURN result;
END $$;
CREATE FUNCTION public.brand_finance_finish_customer_message(p_job_id uuid,p_lease_token uuid,p_status text,p_provider_message_id text DEFAULT NULL,p_error_code text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_status IS NULL OR p_status NOT IN('queued','rejected','unknown') OR (p_status='queued' AND nullif(btrim(p_provider_message_id),'') IS NULL) THEN RAISE EXCEPTION 'Invalid message outcome'; END IF;
 UPDATE public.bf_customer_message_jobs SET state=p_status,provider_message_id=left(p_provider_message_id,200),error_code=left(p_error_code,100),finished_at=now()
 WHERE id=p_job_id AND state='dispatching' AND lease_token=p_lease_token;
 RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION brand_finance_private.customer_phone(text),brand_finance_private.customer_loyalty_enabled(uuid),brand_finance_private.customer_card(uuid,text),brand_finance_private.stamp_sale_customer(uuid,uuid),brand_finance_private.consume_customer_pending(),brand_finance_private.refund_pending_customer(),brand_finance_private.apply_sale_customer(uuid,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.brand_finance_pos_customer(uuid,text),public.brand_finance_pos_pager_page(uuid,integer,text,text),public.brand_finance_pos_pager_transition(uuid,uuid,text),public.brand_finance_claim_customer_messages(uuid,integer),public.brand_finance_finish_customer_message(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_pos_customer(uuid,text),public.brand_finance_pos_pager_page(uuid,integer,text,text),public.brand_finance_pos_pager_transition(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.brand_finance_claim_customer_messages(uuid,integer),public.brand_finance_finish_customer_message(uuid,uuid,text,text,text) TO service_role;
COMMIT;
