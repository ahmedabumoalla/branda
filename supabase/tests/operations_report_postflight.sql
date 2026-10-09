-- Read-only security and aggregate checks; no customer or token data emitted.
BEGIN;
DO $$
DECLARE admin_id uuid; response jsonb; denied boolean:=false;
BEGIN
  IF EXISTS(SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) roles(name)
    CROSS JOIN (VALUES ('settings'),('registration_sources')) objects(name)
    WHERE has_schema_privilege(roles.name,'operations_report_private','USAGE,CREATE')
      OR has_table_privilege(roles.name,'operations_report_private.'||objects.name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
    THEN RAISE EXCEPTION 'Registration sources exposed'; END IF;
  IF (SELECT count(*) FROM pg_class WHERE oid IN ('operations_report_private.settings'::regclass,
    'operations_report_private.registration_sources'::regclass) AND relrowsecurity)<>2
    THEN RAISE EXCEPTION 'Private RLS missing'; END IF;
  IF (SELECT count(*) FROM operations_report_private.settings)<>1
    THEN RAISE EXCEPTION 'Registration boundary missing'; END IF;
  IF has_function_privilege('anon','public.get_admin_operations_report(date,date)','EXECUTE')
    OR has_function_privilege('service_role','public.get_admin_operations_report(date,date)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.get_admin_operations_report(date,date)','EXECUTE')
    THEN RAISE EXCEPTION 'Report grants invalid'; END IF;
  IF EXISTS(SELECT 1 FROM (VALUES ('anon'),('authenticated')) roles(name)
    CROSS JOIN (VALUES ('public.record_customer_registration_source(uuid,text)'),
      ('public.link_customer_phone_otp_attributed(uuid,text,text,uuid,text,text)')) functions(name)
    WHERE has_function_privilege(roles.name,functions.name,'EXECUTE'))
    OR NOT has_function_privilege('service_role','public.record_customer_registration_source(uuid,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.link_customer_phone_otp_attributed(uuid,text,text,uuid,text,text)','EXECUTE')
    THEN RAISE EXCEPTION 'Attribution grants invalid'; END IF;
  IF (SELECT count(*) FROM pg_proc WHERE oid IN ('public.get_admin_operations_report(date,date)'::regprocedure,
    'public.record_customer_registration_source(uuid,text)'::regprocedure,
    'public.link_customer_phone_otp_attributed(uuid,text,text,uuid,text,text)'::regprocedure)
    AND prosecdef AND proconfig @> ARRAY['search_path=""'])<>3
    THEN RAISE EXCEPTION 'Function configuration invalid'; END IF;
  SELECT id INTO admin_id FROM public.profiles WHERE role='platform_admin' AND status='active' LIMIT 1;
  IF admin_id IS NULL THEN RAISE EXCEPTION 'Admin verification identity missing'; END IF;
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  response:=public.get_admin_operations_report();
  IF jsonb_array_length(response->'brands')<>(SELECT count(*) FROM public.cafes WHERE deleted_at IS NULL)
    OR response->>'registrationTrackingSince' IS NULL OR response->>'menuTrackingSince' IS NULL
    OR response->>'walletTrackingSince' IS NULL
    THEN RAISE EXCEPTION 'Report coverage invalid'; END IF;
  IF response::text ~ '"(visitor_key|session_id|phone|email|cardCode|qrPayload|pushToken)"'
    THEN RAISE EXCEPTION 'Report leaked private fields'; END IF;
  response:=public.get_admin_operations_report(current_date,current_date);
  IF response->>'from'<>current_date::text OR response->>'to'<>current_date::text
    THEN RAISE EXCEPTION 'Report dates invalid'; END IF;
  PERFORM set_config('request.jwt.claim.sub','',true);
  BEGIN PERFORM public.get_admin_operations_report(); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Anonymous report accepted'; END IF;
END;
$$;
ROLLBACK;
SELECT 'operations_report_postflight_pass' AS result;
