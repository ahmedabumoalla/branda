-- MIND's POS invoice preference is independent of configuring a loyalty reward
-- Preserve the existing queue, idempotency, cancellation and unknown-send rules
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE FUNCTION brand_finance_private.pos_customer_message_enabled(c uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM public.cafes WHERE id=c AND slug='mind-hospital')
 THEN brand_finance_private.customer_loyalty_enabled(c) OR EXISTS(SELECT 1 FROM public.hospital_store_settings WHERE cafe_id=c AND enabled AND whatsapp_invoice_enabled)
 ELSE brand_finance_private.customer_loyalty_enabled(c) END
$$;
REVOKE ALL ON FUNCTION brand_finance_private.pos_customer_message_enabled(uuid) FROM PUBLIC,anon,authenticated,service_role;
DO $patch$
DECLARE src text;anchor text;
BEGIN
 SELECT pg_get_functiondef('brand_finance_private.apply_sale_customer(uuid,uuid,jsonb,uuid)'::regprocedure) INTO src;
 anchor:='IF v_loyalty THEN INSERT INTO public.bf_customer_message_jobs';
 IF position(anchor IN src)=0 THEN RAISE EXCEPTION 'POS message enqueue anchor changed';END IF;
 src:=replace(src,anchor,'IF brand_finance_private.pos_customer_message_enabled(p_cafe) THEN INSERT INTO public.bf_customer_message_jobs');
 src:=replace(src,'''notificationStatus'',CASE WHEN v_loyalty THEN','''notificationStatus'',CASE WHEN brand_finance_private.pos_customer_message_enabled(p_cafe) THEN');
 EXECUTE src;
 SELECT pg_get_functiondef('public.brand_finance_claim_customer_messages(uuid,integer)'::regprocedure) INTO src;
 anchor:='NOT brand_finance_private.customer_loyalty_enabled(j.cafe_id)';
 IF position(anchor IN src)=0 THEN RAISE EXCEPTION 'POS message eligibility anchor changed';END IF;
 src:=replace(src,anchor,'NOT brand_finance_private.pos_customer_message_enabled(j.cafe_id)');
 IF position(' WITH picked AS(' IN src)=0 THEN RAISE EXCEPTION 'POS message cancellation anchor changed';END IF;
 src:=replace(src,' WITH picked AS(', $cancel$
 UPDATE public.bf_customer_message_jobs j SET state='cancelled',finished_at=now(),error_code='notification_not_required'
 WHERE j.state='pending' AND (p_cafe_id IS NULL OR j.cafe_id=p_cafe_id)
 AND EXISTS(SELECT 1 FROM public.cafes c WHERE c.id=j.cafe_id AND c.slug='mind-hospital')
 AND NOT EXISTS(SELECT 1 FROM public.hospital_store_settings hs WHERE hs.cafe_id=j.cafe_id AND hs.enabled AND hs.whatsapp_invoice_enabled)
 AND EXISTS(SELECT 1 FROM public.bf_sale_customers s WHERE s.document_id=j.document_id AND
 (s.loyalty_status NOT IN('stamped','pending_enrollment') OR EXISTS(SELECT 1 FROM public.wallet_apple_registrations reg WHERE reg.cafe_id=j.cafe_id AND reg.card_id=s.card_id) OR EXISTS(SELECT 1 FROM loyalty_audit_private.wallet_customer_events ev WHERE ev.cafe_id=j.cafe_id AND ev.card_id=s.card_id AND ev.kind IN('download','installed'))));
 WITH picked AS($cancel$);
 anchor:='''cardCode'',lc.card_code';
 IF position(anchor IN src)=0 THEN RAISE EXCEPTION 'POS message projection anchor changed';END IF;
 src:=replace(src,anchor,anchor||$fields$,'invoiceEnabled',CASE WHEN c.slug<>'mind-hospital' THEN true ELSE EXISTS(SELECT 1 FROM public.hospital_store_settings hs WHERE hs.cafe_id=c.id AND hs.enabled AND hs.whatsapp_invoice_enabled) END,'includeCardLink',CASE WHEN c.slug<>'mind-hospital' THEN true ELSE brand_finance_private.customer_loyalty_enabled(c.id) AND s.loyalty_status IN('stamped','pending_enrollment') AND NOT EXISTS(SELECT 1 FROM public.wallet_apple_registrations reg WHERE reg.cafe_id=c.id AND reg.card_id=s.card_id) AND NOT EXISTS(SELECT 1 FROM loyalty_audit_private.wallet_customer_events ev WHERE ev.cafe_id=c.id AND ev.card_id=s.card_id AND ev.kind IN('download','installed')) END$fields$);
 EXECUTE src;
END $patch$;
NOTIFY pgrst,'reload schema';
COMMIT;
