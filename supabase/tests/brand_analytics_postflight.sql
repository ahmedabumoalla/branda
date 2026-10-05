-- Read-only post-deployment verification. Never emits visitor/customer payloads.
BEGIN;
DO $$
DECLARE admin_id uuid; brand_id uuid; response jsonb; denied boolean:=false;
BEGIN
  IF EXISTS(SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) roles(name)
    CROSS JOIN (VALUES ('settings'),('events')) objects(name)
    WHERE has_schema_privilege(roles.name,'brand_analytics_private','USAGE,CREATE')
      OR has_table_privilege(roles.name,'brand_analytics_private.'||objects.name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
    THEN RAISE EXCEPTION 'Private engagement access exposed'; END IF;
  IF (SELECT count(*) FROM pg_class WHERE oid IN ('brand_analytics_private.events'::regclass,'brand_analytics_private.settings'::regclass) AND relrowsecurity)<>2
    THEN RAISE EXCEPTION 'Engagement RLS missing'; END IF;
  IF (SELECT count(*) FROM brand_analytics_private.settings)<>1
    THEN RAISE EXCEPTION 'Recording boundary missing'; END IF;
  IF has_function_privilege('anon','public.record_brand_engagement(text,text,uuid,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.record_brand_engagement(text,text,uuid,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.record_brand_engagement(text,text,uuid,text)','EXECUTE')
    OR has_function_privilege('anon','public.get_admin_brand_analytics(uuid,date,date)','EXECUTE')
    OR has_function_privilege('service_role','public.get_admin_brand_analytics(uuid,date,date)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.get_admin_brand_analytics(uuid,date,date)','EXECUTE')
    THEN RAISE EXCEPTION 'Analytics RPC grants invalid'; END IF;
  IF (SELECT count(*) FROM pg_proc WHERE oid IN ('public.record_brand_engagement(text,text,uuid,text)'::regprocedure,
    'public.get_admin_brand_analytics(uuid,date,date)'::regprocedure) AND prosecdef AND proconfig @> ARRAY['search_path=""'])<>2
    THEN RAISE EXCEPTION 'Analytics function configuration invalid'; END IF;
  IF to_regclass('brand_analytics_private.brand_analytics_cafe_time_idx') IS NULL
    OR to_regclass('brand_analytics_private.brand_analytics_visitor_time_idx') IS NULL
    OR to_regclass('loyalty_audit_private.wallet_customer_events_cafe_time_idx') IS NULL
    THEN RAISE EXCEPTION 'Analytics indexes missing'; END IF;
  SELECT id INTO admin_id FROM public.profiles WHERE role='platform_admin' AND status='active' LIMIT 1;
  SELECT id INTO brand_id FROM public.cafes WHERE deleted_at IS NULL ORDER BY (slug='rast') DESC LIMIT 1;
  IF admin_id IS NULL OR brand_id IS NULL THEN RAISE EXCEPTION 'Verification identity unavailable'; END IF;
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  response:=public.get_admin_brand_analytics(brand_id);
  IF response->>'brandId'<>brand_id::text OR jsonb_typeof(response->'wallet')<>'object'
    OR jsonb_typeof(response->'engagement')<>'object' OR jsonb_typeof(response->'confirmed')<>'object'
    OR response->>'engagementStartedAt' IS NULL OR (response->'wallet'->>'customers')::bigint<0
    THEN RAISE EXCEPTION 'Analytics DTO invalid'; END IF;
  IF response::text ~ '"(visitor_key|visitorId|phone|email|cardCode|qrPayload|pushToken)"'
    THEN RAISE EXCEPTION 'Private fields leaked'; END IF;
  PERFORM set_config('request.jwt.claim.sub','',true);
  BEGIN PERFORM public.get_admin_brand_analytics(brand_id); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Anonymous identity accepted'; END IF;
END;
$$;
ROLLBACK;
