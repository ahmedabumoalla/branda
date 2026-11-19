BEGIN;
DO $$
DECLARE first_job jsonb; next_job jsonb; result boolean;
BEGIN
 IF EXISTS(SELECT 1 FROM owner_guide_private.jobs) THEN RAISE EXCEPTION 'Run isolated test before live queue usage'; END IF;
 IF has_function_privilege('anon','public.enqueue_owner_companion_guides(text,text)','EXECUTE') OR has_function_privilege('authenticated','public.claim_owner_companion_guide()','EXECUTE') OR NOT has_function_privilege('service_role','public.claim_owner_companion_guide()','EXECUTE') THEN RAISE EXCEPTION 'Function permissions invalid'; END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='owner_guide_private.jobs'::regclass) OR has_table_privilege('authenticated','owner_guide_private.jobs','SELECT') THEN RAISE EXCEPTION 'Queue exposed'; END IF;
 PERFORM public.enqueue_owner_companion_guides('966511111111','rollback-guide-fixture');
 PERFORM public.enqueue_owner_companion_guides('966511111111','rollback-guide-fixture');
 IF (SELECT count(*) FROM owner_guide_private.jobs)<>2 THEN RAISE EXCEPTION 'Enqueue duplicated'; END IF;
 first_job:=public.claim_owner_companion_guide();
 IF first_job->>'guide'<>'cashier' OR public.claim_owner_companion_guide() IS NOT NULL THEN RAISE EXCEPTION 'Ordering or exclusive lease failed'; END IF;
 result:=public.finish_owner_companion_guide((first_job->>'id')::uuid,gen_random_uuid(),'sent','fixture-receipt');
 IF result THEN RAISE EXCEPTION 'Wrong attempt acknowledged'; END IF;
 PERFORM public.finish_owner_companion_guide((first_job->>'id')::uuid,(first_job->>'attempt')::uuid,'rejected');
 IF public.claim_owner_companion_guide() IS NOT NULL THEN RAISE EXCEPTION 'Retry delay/order failed'; END IF;
 UPDATE owner_guide_private.jobs SET available_at=clock_timestamp() WHERE guide='cashier';
 first_job:=public.claim_owner_companion_guide();
 result:=public.finish_owner_companion_guide((first_job->>'id')::uuid,(first_job->>'attempt')::uuid,'sent','fixture-receipt');
 IF NOT result OR NOT public.finish_owner_companion_guide((first_job->>'id')::uuid,(first_job->>'attempt')::uuid,'sent','fixture-receipt') THEN RAISE EXCEPTION 'Acknowledgement not idempotent'; END IF;
 next_job:=public.claim_owner_companion_guide();
 IF next_job->>'guide'<>'customer' THEN RAISE EXCEPTION 'Customer clip missing'; END IF;
 UPDATE owner_guide_private.jobs SET leased_until=clock_timestamp()-interval '1 minute' WHERE guide='customer';
 first_job:=public.claim_owner_companion_guide();
 IF first_job IS NOT NULL OR NOT EXISTS(SELECT 1 FROM owner_guide_private.jobs WHERE guide='customer' AND status='uncertain') THEN RAISE EXCEPTION 'Expired send replayed'; END IF;
 BEGIN
  PERFORM public.enqueue_owner_companion_guides('966522222222','rollback-guide-fixture');
  RAISE EXCEPTION 'Changed recipient accepted' USING ERRCODE='XX000';
 EXCEPTION WHEN raise_exception THEN NULL;
 END;
 BEGIN
  PERFORM public.enqueue_owner_companion_guides('bad-phone','bad');
  RAISE EXCEPTION 'Invalid phone accepted' USING ERRCODE='XX000';
 EXCEPTION WHEN raise_exception THEN NULL;
 END;
END $$;
ROLLBACK;
SELECT true AS owner_guide_guards_passed_and_rolled_back;
