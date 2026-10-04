-- Read-only proof. Only counts/booleans are returned, never customer identifiers or contacts.
BEGIN;
DO $$
DECLARE admin_id uuid; owner_id uuid; response jsonb; denied boolean:=false;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='loyalty_audit_private.wallet_customer_events'::regclass AND relrowsecurity)
    THEN RAISE EXCEPTION 'Wallet history RLS missing'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.wallet_apple_registrations'::regclass
    AND tgname='wallet_customer_registration_history' AND tgenabled='O' AND (tgtype::integer & 4)=4 AND (tgtype::integer & 8)=8 AND (tgtype::integer & 16)=16)
    THEN RAISE EXCEPTION 'Atomic registration reconciliation trigger missing'; END IF;
  -- Authenticated USAGE is required by the existing audit SELECT policy's
  -- can_read helper. Object grants, not schema USAGE, protect private data.
  IF has_schema_privilege('anon','loyalty_audit_private','USAGE,CREATE')
    OR has_schema_privilege('authenticated','loyalty_audit_private','CREATE')
    THEN RAISE EXCEPTION 'Private schema access expanded'; END IF;
  IF NOT has_schema_privilege('authenticated','loyalty_audit_private','USAGE')
    OR NOT has_function_privilege('authenticated','loyalty_audit_private.can_read(uuid)','EXECUTE')
    THEN RAISE EXCEPTION 'Existing audit authorization unavailable'; END IF;
  IF EXISTS(SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) roles(name)
    CROSS JOIN (VALUES ('settings'),('brand_customer_rows'),('wallet_customer_events')) objects(name)
    WHERE has_table_privilege(roles.name,'loyalty_audit_private.'||objects.name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
    THEN RAISE EXCEPTION 'Private object access exposed'; END IF;
  IF has_function_privilege('anon','loyalty_audit_private.capture_wallet_registration()','EXECUTE')
    OR has_function_privilege('authenticated','loyalty_audit_private.capture_wallet_registration()','EXECUTE')
    OR has_function_privilege('service_role','loyalty_audit_private.capture_wallet_registration()','EXECUTE')
    THEN RAISE EXCEPTION 'Private registration function exposed'; END IF;
  IF has_table_privilege('authenticated','loyalty_audit_private.wallet_customer_events','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('service_role','loyalty_audit_private.wallet_customer_events','INSERT,UPDATE,DELETE')
    THEN RAISE EXCEPTION 'Direct history access exposed'; END IF;
  IF has_function_privilege('anon','public.get_admin_brand_customers(text,uuid,text,text,integer,integer)','EXECUTE')
    OR has_function_privilege('service_role','public.get_admin_brand_customers(text,uuid,text,text,integer,integer)','EXECUTE')
    OR has_function_privilege('anon','public.get_admin_brand_customer_detail(uuid,integer,integer)','EXECUTE')
    OR has_function_privilege('authenticated','public.record_wallet_download(uuid,text)','EXECUTE')
    THEN RAISE EXCEPTION 'RPC grants exposed'; END IF;
  IF NOT has_function_privilege('authenticated','public.get_admin_brand_customers(text,uuid,text,text,integer,integer)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.record_wallet_download(uuid,text)','EXECUTE')
    THEN RAISE EXCEPTION 'RPC grants missing'; END IF;
  SELECT id INTO admin_id FROM public.profiles WHERE role='platform_admin' AND status='active' LIMIT 1;
  IF admin_id IS NULL THEN RAISE EXCEPTION 'No active admin available for verification'; END IF;
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  response:=public.get_admin_brand_customers();
  IF jsonb_typeof(response->'customers')<>'array' OR (response->>'total')::integer<0 THEN RAISE EXCEPTION 'Admin DTO invalid'; END IF;
  IF response::text ~ '"(cardCode|qrPayload|pushToken|deviceLibraryIdentifier|sessionToken|password_hash)"'
    THEN RAISE EXCEPTION 'Sensitive bearer fields leaked'; END IF;
  IF jsonb_array_length(response->'customers')>0 THEN
    response:=public.get_admin_brand_customer_detail((response->'customers'->0->>'id')::uuid);
    IF response->'customer' IS NULL OR jsonb_typeof(response->'events')<>'array' THEN RAISE EXCEPTION 'Detail DTO invalid'; END IF;
  END IF;
  SELECT id INTO owner_id FROM public.profiles WHERE role<>'platform_admin' AND status='active' LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub',coalesce(owner_id::text,''),true);
  BEGIN PERFORM public.get_admin_brand_customers(); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Non-admin could read brand customers'; END IF;
  PERFORM set_config('request.jwt.claim.sub','',true);
  denied:=false;
  BEGIN PERFORM public.get_admin_brand_customers(); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Anonymous identity could read brand customers'; END IF;
END $$;
SELECT 'brand_customers_postflight_pass' AS result,
  (SELECT count(*) FROM loyalty_audit_private.brand_customer_rows) AS memberships,
  (SELECT count(*) FROM loyalty_audit_private.wallet_customer_events) AS wallet_history_events;
ROLLBACK;
