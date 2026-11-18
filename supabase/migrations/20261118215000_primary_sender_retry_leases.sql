BEGIN;
SET LOCAL lock_timeout='5s';
-- Accommodate three primary retry intervals without reclaiming an in-flight send.
-- Recipient guards, terminal outcomes, OTP expiry and privileges stay unchanged.
DO $retry_leases$
DECLARE item record; definition text;
BEGIN
 FOR item IN SELECT * FROM (VALUES
  ('public.admin_claim_brand_welcome(uuid,uuid,uuid,boolean)','1b3d1b10844ec3679840c17bd6a8285f','interval ''2 minutes''','interval ''4 minutes''',1),
  ('public.brand_finance_claim_customer_messages(uuid,integer)','399c485ebdbc14910ba6f25c7c195c44','interval ''2 minutes''','interval ''4 minutes''',1),
  ('public.claim_customer_phone_otp_delivery(text,uuid)','4e1aea83a832c22e08e068c955cbe919','interval ''2 minutes''','interval ''4 minutes''',1),
  ('public.claim_subscription_renewal_reminders(integer)','96ecaf3179c0bed7076aca9f9ecf346c','interval ''90 seconds''','interval ''4 minutes''',1),
  ('public.hospital_notifications_claim(integer)','22f9d735dd9dc063493071c79e99132a','interval ''90 seconds''','interval ''4 minutes''',1),
  ('public.pager_claim_messages(integer)','ae60355c35042c64aba82d8af410c7b0','interval ''90 seconds''','interval ''4 minutes''',1),
  ('public.platform_marketing_begin_dispatch(uuid,uuid)','2e4fd8ab3dea5d6ca6e25e8e7a6bb8eb','interval ''2 minutes''','interval ''4 minutes''',2),
  ('public.salon_claim_messages_v3(integer)','f1c618b0e1636995baf0adcc3bae879b','interval ''2 minutes''','interval ''4 minutes''',1)
 ) AS patches(signature,expected_hash,old_text,new_text,occurrences) LOOP
  definition:=replace(pg_get_functiondef(item.signature::regprocedure),E'\r\n',E'\n');
  IF md5(definition)<>item.expected_hash OR (length(definition)-length(replace(definition,item.old_text,'')))/length(item.old_text)<>item.occurrences THEN
   RAISE EXCEPTION 'Primary retry lease prerequisite changed: %',item.signature;
  END IF;
  EXECUTE replace(definition,item.old_text,item.new_text);
 END LOOP;
END $retry_leases$;
COMMIT;
