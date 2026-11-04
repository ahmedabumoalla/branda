import { readFile,mkdir,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const file='supabase/migrations/20261104104817_admin_brand_analytics.sql';
const source=(await readFile(file,'utf8')).replace(/\r\n/g,'\n');
const body=source.replace(/^([\s\S]*?)BEGIN;/, '$1').replace(/COMMIT;\s*$/, '');
const before=`
CREATE TEMP TABLE analytics_unchanged AS SELECT
 (SELECT count(*) FROM public.customer_profiles) AS profiles,
 (SELECT count(*) FROM public.loyalty_cards) AS cards,
 (SELECT count(*) FROM public.loyalty_activity_events) AS events,
 (SELECT count(*) FROM loyalty_audit_private.wallet_customer_events) AS wallets,
 (SELECT count(*) FROM loyalty_audit_private.wallet_welcomes) AS welcomes;
`;
const checks=`
DO $verify$
DECLARE admin_id uuid; other_id uuid; report jsonb; detail jsonb; selected uuid; row record; started timestamptz; elapsed numeric;
BEGIN
 IF has_function_privilege('anon','public.get_admin_brand_customer_analytics(integer,timestamptz)','EXECUTE')
 OR has_function_privilege('service_role','public.get_admin_brand_customer_analytics(integer,timestamptz)','EXECUTE')
 OR has_schema_privilege('authenticated','brand_loyalty_analytics_private','USAGE')
 OR NOT has_function_privilege('authenticated','public.get_admin_brand_customer_analytics(integer,timestamptz)','EXECUTE') THEN
  RAISE EXCEPTION 'Unsafe analytics grants'; END IF;
 SELECT id INTO admin_id FROM public.profiles WHERE role='platform_admin' AND status='active' LIMIT 1;
 IF admin_id IS NULL THEN RAISE EXCEPTION 'Missing active admin'; END IF;
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 started:=clock_timestamp(); report:=public.get_admin_brand_customer_analytics(30); elapsed:=extract(epoch FROM clock_timestamp()-started)*1000;
 INSERT INTO analytics_results VALUES('overview_ms',to_jsonb(round(elapsed,2)));
 IF jsonb_array_length(report->'brands')<>(SELECT count(*) FROM public.cafes WHERE deleted_at IS NULL) THEN RAISE EXCEPTION 'Missing brands'; END IF;
 FOR row IN SELECT value AS b FROM jsonb_array_elements(report->'brands') LOOP
  IF (row.b->>'registeredCustomers')::integer < (row.b->>'cardholders')::integer
  OR (row.b->>'registeredCustomers')::integer < (row.b->>'activeCustomers')::integer
  OR (row.b->>'registeredCustomers')::integer < (row.b->>'inactiveCustomers')::integer
  OR (row.b->>'returningCustomers')::integer < (row.b->>'loyalCustomers')::integer THEN RAISE EXCEPTION 'Invalid customer metrics'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(row.b->'retention') r WHERE (r->>'retained')::integer>(r->>'eligible')::integer) THEN RAISE EXCEPTION 'Invalid retention'; END IF;
 END LOOP;
 SELECT (b->>'id')::uuid INTO selected FROM jsonb_array_elements(report->'brands') b ORDER BY (b->>'registeredCustomers')::integer DESC LIMIT 1;
 started:=clock_timestamp(); detail:=public.get_admin_brand_analytics_detail(selected,30,'','all','recent',1,100,(report->>'generatedAt')::timestamptz); elapsed:=extract(epoch FROM clock_timestamp()-started)*1000;
 INSERT INTO analytics_results VALUES('detail_ms',to_jsonb(round(elapsed,2)));
 IF detail->'brand' IS DISTINCT FROM (SELECT b FROM jsonb_array_elements(report->'brands') b WHERE b->>'id'=selected::text) THEN RAISE EXCEPTION 'Snapshot totals mismatch'; END IF;
 IF (detail->>'total')::integer<>(detail->'brand'->>'registeredCustomers')::integer THEN RAISE EXCEPTION 'Customer total mismatch'; END IF;
 IF (SELECT sum((h->>'visits')::integer) FROM jsonb_array_elements(detail->'heatmap') h)<>(detail->'brand'->>'visitsInPeriod')::integer THEN RAISE EXCEPTION 'Heatmap mismatch'; END IF;
 IF jsonb_array_length(detail->'customers')>0 THEN
  PERFORM public.get_admin_brand_analytics_customer(selected,(detail->'customers'->0->>'id')::uuid,1,(report->>'generatedAt')::timestamptz);
 END IF;
 INSERT INTO analytics_results VALUES('brands',report->'summary'->'brands'),('registered_memberships',report->'summary'->'registeredCustomers'),('largest_brand_customers',detail->'total');
 SELECT id INTO other_id FROM public.profiles WHERE role<>'platform_admin' LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',coalesce(other_id::text,''),true);
 BEGIN PERFORM public.get_admin_brand_customer_analytics(); RAISE EXCEPTION 'Non-admin access allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.get_admin_brand_analytics_detail(selected); RAISE EXCEPTION 'Non-admin detail allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.get_admin_brand_analytics_customer(selected,selected); RAISE EXCEPTION 'Non-admin customer allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub','',true);
 BEGIN PERFORM public.get_admin_brand_customer_analytics(); RAISE EXCEPTION 'Anonymous access allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF EXISTS(SELECT 1 FROM analytics_unchanged b WHERE b.profiles<>(SELECT count(*) FROM public.customer_profiles)
 OR b.cards<>(SELECT count(*) FROM public.loyalty_cards) OR b.events<>(SELECT count(*) FROM public.loyalty_activity_events)
 OR b.wallets<>(SELECT count(*) FROM loyalty_audit_private.wallet_customer_events)
 OR b.welcomes<>(SELECT count(*) FROM loyalty_audit_private.wallet_welcomes)) THEN RAISE EXCEPTION 'Customer data was mutated'; END IF;
 INSERT INTO analytics_results VALUES('authorization_and_read_only',to_jsonb(true));
 -- Validate every customer DTO returned by every brand without printing PII.
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 FOR row IN SELECT value AS b FROM jsonb_array_elements(report->'brands') LOOP
  detail:=public.get_admin_brand_analytics_detail((row.b->>'id')::uuid,30,'','all','recent',1,100,(report->>'generatedAt')::timestamptz);
  IF NOT(detail ?& ARRAY['generatedAt','days','brand','heatmap','cohorts','customers','total','page','pageSize']) THEN RAISE EXCEPTION 'Missing detail fields'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(detail->'customers') c WHERE
    NOT(c ?& ARRAY['id','name','phone','email','status','identityMatch','joinedAt','cardIssuedAt','cardCount','currentStamps','totalStamps','rewardsRedeemed','lastStampAt','lastRedemptionAt','lastVisitAt','inactiveDays','isInactive','visitDays','averageVisitGapDays','isLoyal','firstReturnAt','wallet'])
    OR jsonb_typeof(c->'phone')<>'string' OR jsonb_typeof(c->'name')<>'string' OR jsonb_typeof(c->'email')<>'string'
    OR jsonb_typeof(c->'isInactive')<>'boolean' OR jsonb_typeof(c->'isLoyal')<>'boolean'
    OR jsonb_typeof(c->'cardCount')<>'number' OR jsonb_typeof(c->'visitDays')<>'number'
    OR jsonb_typeof(c->'inactiveDays')<>'number' OR jsonb_typeof(c->'wallet')<>'object'
    OR NOT((c->'wallet') ?& ARRAY['firstDownloadAt','lastDownloadAt','downloads','firstGoogleSaveAt','lastGoogleSaveAt','googleSaveLinks','firstInstalledAt','lastInstalledAt','installedDevices'])
  ) THEN RAISE EXCEPTION 'Invalid customer DTO'; END IF;
 END LOOP;
 INSERT INTO analytics_results VALUES('live_dto_shapes',to_jsonb(true));
END $verify$;
DO $authenticated$
DECLARE admin_id uuid; brand_id uuid; report jsonb; detail jsonb;
BEGIN
 SELECT id INTO admin_id FROM public.profiles WHERE role='platform_admin' AND status='active' LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 PERFORM set_config('role','authenticated',true);
 report:=public.get_admin_brand_customer_analytics();
 SELECT (b->>'id')::uuid INTO brand_id FROM jsonb_array_elements(report->'brands') b ORDER BY (b->>'registeredCustomers')::integer DESC LIMIT 1;
 detail:=public.get_admin_brand_analytics_detail(brand_id,30,'','all','recent',1,25,(report->>'generatedAt')::timestamptz);
 IF jsonb_array_length(detail->'customers')>0 THEN PERFORM public.get_admin_brand_analytics_customer(brand_id,(detail->'customers'->0->>'id')::uuid); END IF;
 RESET ROLE;
 INSERT INTO analytics_results VALUES('actual_authenticated_role',to_jsonb(true));
END $authenticated$;
SET LOCAL ROLE anon;
DO $denied$ BEGIN
 BEGIN PERFORM public.get_admin_brand_customer_analytics(); RAISE EXCEPTION 'Anon execute allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $denied$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $denied$ BEGIN
 BEGIN PERFORM public.get_admin_brand_customer_analytics(); RAISE EXCEPTION 'Service execute allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $denied$;
RESET ROLE;
SELECT jsonb_object_agg(name,result) AS analytics_validation FROM analytics_results;
`;
await mkdir('output/brand-customer-analytics',{recursive:true});
await writeFile('output/brand-customer-analytics/rollback.sql',`BEGIN;\nSET LOCAL statement_timeout='60s';\nCREATE TEMP TABLE analytics_results(name text,result jsonb);\n${before}${body}${checks}\nROLLBACK;\n`);
await writeFile('output/brand-customer-analytics/verify.sql',`BEGIN;\nSET LOCAL statement_timeout='60s';\nCREATE TEMP TABLE analytics_results(name text,result jsonb);\n${before}${checks}\nROLLBACK;\n`);
await writeFile('output/brand-customer-analytics/apply.sql',`BEGIN;
DO $guard$ BEGIN
 IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261104104817')
 OR to_regnamespace('brand_loyalty_analytics_private') IS NOT NULL THEN RAISE EXCEPTION 'Analytics migration already exists'; END IF;
 IF md5(pg_get_functiondef('public.get_admin_brand_analytics(uuid,date,date)'::regprocedure))<>'b77a88ff53500218e829b0ab7d9c0147' THEN RAISE EXCEPTION 'Legacy analytics changed'; END IF;
END $guard$;
${body}
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261104104817','admin_brand_analytics',ARRAY['${source.replaceAll("'","''")}']);
COMMIT;
`);
console.log(JSON.stringify({file,md5:createHash('md5').update(source).digest('hex'),sha256:createHash('sha256').update(source).digest('hex'),preparedOnly:true}));
