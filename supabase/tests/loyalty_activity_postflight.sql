-- Read-only production checks. The impersonated read is transaction-scoped and rolled back.
BEGIN;
DO $$
BEGIN
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.loyalty_activity_events'::regclass), 'Audit RLS disabled';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='loyalty_audit_private.settings'::regclass), 'Settings RLS disabled';
  ASSERT NOT has_table_privilege('anon','public.loyalty_activity_events','SELECT'), 'Anonymous audit access';
  ASSERT NOT has_table_privilege('authenticated','public.loyalty_activity_events','INSERT,UPDATE,DELETE,TRUNCATE'), 'Client audit writes';
  ASSERT NOT has_table_privilege('service_role','public.loyalty_activity_events','INSERT,UPDATE,DELETE,TRUNCATE'), 'Direct service audit writes';
  ASSERT NOT has_function_privilege('authenticated','public.preview_loyalty_card(text,text)','EXECUTE'), 'Client preview bypass';
  ASSERT NOT has_function_privilege('authenticated','public.preview_loyalty_reward(text,text)','EXECUTE'), 'Client reward bypass';
  ASSERT NOT has_function_privilege('authenticated','public.execute_loyalty_audited_operation(text,text,uuid,text)','EXECUTE'), 'Client cashier bypass';
  ASSERT has_function_privilege('service_role','public.execute_loyalty_audited_operation(text,text,uuid,text)','EXECUTE'), 'Cashier RPC unavailable';
  ASSERT NOT has_function_privilege('anon','public.get_owner_loyalty_activity(uuid,timestamptz,timestamptz,uuid,text,text,text,integer,integer)','EXECUTE'), 'Anonymous reader access';
  ASSERT NOT has_function_privilege('service_role','public.get_owner_loyalty_activity(uuid,timestamptz,timestamptz,uuid,text,text,text,integer,integer)','EXECUTE'), 'Unauthenticated owner reader';
  ASSERT (SELECT count(*)=4 FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O' AND tgname IN ('loyalty_activity_immutable','loyalty_activity_no_truncate','zz_loyalty_activity_capture','loyalty_activity_experience_redemption')), 'Audit trigger missing';
  ASSERT NOT EXISTS (SELECT 1 FROM public.loyalty_card_events e WHERE NOT EXISTS (SELECT 1 FROM public.loyalty_activity_events a WHERE a.source_event_id=e.id)), 'History import incomplete';
  PERFORM set_config('request.jwt.claim.sub',(SELECT owner_user_id::text FROM public.cafes WHERE slug='rast' AND deleted_at IS NULL),true);
END;
$$;
SET LOCAL ROLE authenticated;
SELECT jsonb_build_object('owner_read',true,'events_in_page',jsonb_array_length(result->'events'),
  'summary',result->'summary','employees',jsonb_array_length(result->'employees'),
  'recording_started_at',result->'recordingStartedAt',
  'tenant_isolation',NOT EXISTS(SELECT 1 FROM public.loyalty_activity_events WHERE cafe_id<>(SELECT id FROM public.cafes WHERE slug='rast')),
  'raw_codes_absent',NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'events') e WHERE e ?| ARRAY['cardCode','rewardCode','token','sessionToken','phone','email'])) AS audit_postflight
FROM (SELECT public.get_owner_loyalty_activity((SELECT id FROM public.cafes WHERE slug='rast'),now()-interval '30 days',now(),NULL,NULL,NULL,'',1,25) result) checked;
ROLLBACK;
