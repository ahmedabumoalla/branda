BEGIN;
DO $$
DECLARE
  challenge uuid:=gen_random_uuid();
  owner_id uuid:=gen_random_uuid();
  job jsonb;
BEGIN
  IF EXISTS(SELECT 1 FROM owner_guide_private.jobs) THEN RAISE EXCEPTION 'Run on an isolated empty queue'; END IF;
  IF has_function_privilege('anon','public.claim_owner_signup_guide()','EXECUTE')
    OR has_function_privilege('authenticated','public.defer_owner_signup_guide(uuid,uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.claim_owner_signup_guide()','EXECUTE')
    OR has_table_privilege('authenticated','owner_guide_private.jobs','SELECT')
    OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='owner_guide_private.jobs'::regclass)
  THEN RAISE EXCEPTION 'Worker permissions invalid'; END IF;

  PERFORM public.enqueue_owner_companion_guides('966511111111','retired-admin-handoff');
  INSERT INTO owner_onboarding_private.challenges(id,phone,ip_hash,session_hash,code_hash,draft,sent)
  VALUES(challenge,'966511111111','fixture','fixture','fixture','{}',true);
  UPDATE owner_onboarding_private.challenges SET verified_at=now() WHERE id=challenge;
  IF EXISTS(SELECT 1 FROM owner_guide_private.jobs) THEN RAISE EXCEPTION 'Queued before completion or from admin'; END IF;
  UPDATE owner_onboarding_private.challenges SET consumed_by=owner_id WHERE id=challenge;
  UPDATE owner_onboarding_private.challenges SET consumed_by=owner_id WHERE id=challenge;
  IF (SELECT count(*) FROM owner_guide_private.jobs WHERE signup_challenge_id=challenge AND phone='966511111111')<>3
    OR public.claim_owner_companion_guide() IS NOT NULL THEN RAISE EXCEPTION 'Wrong source, recipient or duplicate'; END IF;

  job:=public.claim_owner_signup_guide();
  IF job->>'guide' IS DISTINCT FROM 'setup' OR public.claim_owner_signup_guide() IS NOT NULL THEN RAISE EXCEPTION 'Setup must go first'; END IF;
  IF public.defer_owner_signup_guide((job->>'id')::uuid,gen_random_uuid()) THEN RAISE EXCEPTION 'Foreign lease accepted'; END IF;
  PERFORM public.defer_owner_signup_guide((job->>'id')::uuid,(job->>'attempt')::uuid);
  IF NOT public.defer_owner_signup_guide((job->>'id')::uuid,(job->>'attempt')::uuid)
    OR public.claim_owner_signup_guide() IS NOT NULL
    OR NOT EXISTS(SELECT 1 FROM owner_guide_private.jobs WHERE guide='setup' AND status='pending' AND attempts=0)
  THEN RAISE EXCEPTION 'Known primary outage consumed an attempt or changed order'; END IF;
  UPDATE owner_guide_private.jobs SET available_at=clock_timestamp() WHERE guide='setup';
  job:=public.claim_owner_signup_guide();
  PERFORM public.finish_owner_companion_guide((job->>'id')::uuid,(job->>'attempt')::uuid,'sent','setup-receipt');
  IF NOT public.finish_owner_companion_guide((job->>'id')::uuid,(job->>'attempt')::uuid,'sent','setup-receipt')
  THEN RAISE EXCEPTION 'Acknowledgement replay failed'; END IF;
  job:=public.claim_owner_signup_guide();
  IF job->>'guide' IS DISTINCT FROM 'cashier' OR public.claim_owner_signup_guide() IS NOT NULL THEN RAISE EXCEPTION 'Second clip order'; END IF;
  PERFORM public.finish_owner_companion_guide((job->>'id')::uuid,(job->>'attempt')::uuid,'uncertain');
  job:=public.claim_owner_signup_guide();
  IF job->>'guide' IS DISTINCT FROM 'customer' THEN RAISE EXCEPTION 'Uncertain send replayed or third clip lost'; END IF;
  UPDATE owner_guide_private.jobs SET leased_until=clock_timestamp()-interval '1 minute' WHERE guide='customer';
  IF public.claim_owner_signup_guide() IS NOT NULL THEN RAISE EXCEPTION 'Expired worker replayed'; END IF;
  IF (SELECT count(*) FROM owner_guide_private.jobs WHERE status='uncertain')<>2 THEN RAISE EXCEPTION 'Ambiguous lease not preserved'; END IF;
END $$;
ROLLBACK;
SELECT true AS owner_guide_guards_passed_and_rolled_back;
