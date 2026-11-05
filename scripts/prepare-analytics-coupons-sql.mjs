import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const file='supabase/migrations/20261105080819_analytics_individual_coupons.sql';
const source=(await readFile(file,'utf8')).replaceAll('\r\n','\n');
const body=source.replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'');
const hash=text=>createHash('md5').update(text).digest('hex');
const counts=`jsonb_build_object('customers',(SELECT count(*) FROM public.customer_profiles),'cards',(SELECT count(*) FROM public.loyalty_cards),
 'activities',(SELECT count(*) FROM public.loyalty_activity_events),'campaigns',(SELECT count(*) FROM public.platform_marketing_campaigns),
 'recipients',(SELECT count(*) FROM public.platform_marketing_recipients),'welcomes',(SELECT count(*) FROM loyalty_audit_private.wallet_welcomes),
 'cashierLogs',(SELECT count(*) FROM public.cafe_cashier_activity_logs))`;
const functionHashes=`SELECT jsonb_object_agg(n.nspname||'.'||p.proname,md5(replace(p.prosrc,E'\r\n',E'\n'))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE p.proname IN('platform_marketing_claim_job','platform_marketing_begin_dispatch','platform_marketing_finish_dispatch','campaign_recipient_allowed','events','assert_cashier_loyalty')
 AND n.nspname IN('public','brand_loyalty_analytics_private','platform_access_private')`;
const introspect=`SELECT jsonb_build_object('functions',(${functionHashes}),'ledgerPresent',to_regclass('brand_loyalty_analytics_private.coupons') IS NOT NULL,
 'createRpcPresent',to_regprocedure('public.platform_marketing_create_coupon_campaign(uuid,uuid,text,text,uuid,text,integer,text,timestamptz,jsonb)') IS NOT NULL,
 'history',(SELECT jsonb_build_object('version',version,'name',name,'sourceMd5',md5(replace(array_to_string(statements,E'\n'),E'\r\n',E'\n'))) FROM supabase_migrations.schema_migrations WHERE version='20261105080819'),
 'legacyCouponsPresent',to_regclass('public.brand_coupons') IS NOT NULL,'counts',${counts}) AS validation;`;
const before=`CREATE TEMP TABLE coupon_before AS SELECT ${counts} AS counts,
 (${functionHashes}) AS functions,
 (SELECT md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.brand_id,c.id)::text,'')) FROM brand_loyalty_analytics_private.customers(NULL,now()) c) AS customers_digest;`;
const checks=`DO $check$ DECLARE actor uuid; non_admin uuid; brand uuid; a jsonb; n integer; BEGIN
 IF (SELECT count(*) FROM brand_loyalty_analytics_private.coupons)<>0 THEN RAISE EXCEPTION 'Unexpected coupon issuance'; END IF;
 IF ${counts} IS DISTINCT FROM (SELECT counts FROM coupon_before) THEN RAISE EXCEPTION 'Business rows changed'; END IF;
 IF (SELECT md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.brand_id,c.id)::text,'')) FROM brand_loyalty_analytics_private.customers(NULL,now()) c)
   IS DISTINCT FROM (SELECT customers_digest FROM coupon_before) THEN RAISE EXCEPTION 'Existing analytics changed without coupons'; END IF;
 IF has_schema_privilege('service_role','brand_loyalty_analytics_private','USAGE') OR has_table_privilege('service_role','brand_loyalty_analytics_private.coupons','SELECT')
   OR has_table_privilege('authenticated','brand_loyalty_analytics_private.coupons','SELECT') OR has_table_privilege('anon','brand_loyalty_analytics_private.coupons','SELECT')
   OR NOT(SELECT relrowsecurity FROM pg_class WHERE oid='brand_loyalty_analytics_private.coupons'::regclass) THEN RAISE EXCEPTION 'Private ledger permissions'; END IF;
 FOR a IN SELECT jsonb_build_object('id',p.oid,'name',p.proname) FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public'
 AND p.proname IN('platform_marketing_create_coupon_campaign','analytics_coupon_preview','analytics_coupon_redeem') LOOP
   IF has_function_privilege('anon',(a->>'id')::oid,'EXECUTE') OR has_function_privilege('authenticated',(a->>'id')::oid,'EXECUTE')
     OR NOT has_function_privilege('service_role',(a->>'id')::oid,'EXECUTE') THEN RAISE EXCEPTION 'Invalid RPC permissions'; END IF;
 END LOOP;
 SELECT id INTO actor FROM public.profiles WHERE role='platform_admin' AND status='active' LIMIT 1;
 SELECT id INTO non_admin FROM public.profiles WHERE role<>'platform_admin' LIMIT 1;
 SELECT id INTO brand FROM public.cafes WHERE deleted_at IS NULL AND status IN('active','published') LIMIT 1;
 BEGIN PERFORM public.platform_marketing_create_coupon_campaign(non_admin,gen_random_uuid(),'No send','No send',brand,'inactive',10,repeat('0',64),NULL,'{}');
   RAISE EXCEPTION 'Nonadmin created campaign'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.platform_marketing_create_coupon_campaign(actor,gen_random_uuid(),'No send','No send',brand,'inactive',10,repeat('0',64),NULL,'{}');
   RAISE EXCEPTION 'Invalid config created campaign'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM set_config('role','service_role',true);
 BEGIN PERFORM public.analytics_coupon_preview('invalid-rollback-token','BC-'||repeat('A',32),'0500000000',100);
   RAISE EXCEPTION 'Invalid cashier preview allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.analytics_coupon_redeem('invalid-rollback-token','BC-'||repeat('A',32),'0500000000',100,gen_random_uuid());
   RAISE EXCEPTION 'Invalid cashier redeem allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 a:=public.platform_marketing_analytics_audience(actor,brand,'inactive',10,1);
 RESET ROLE;
 IF a->>'brandId'<>brand::text OR a->>'digest'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Existing preview invalid'; END IF;
 PERFORM set_config('role','authenticated',true);
 BEGIN PERFORM public.analytics_coupon_preview('invalid-rollback-token','BC-'||repeat('A',32),'0500000000',100);
   RAISE EXCEPTION 'Client coupon preview allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.analytics_coupon_redeem('invalid-rollback-token','BC-'||repeat('A',32),'0500000000',100,gen_random_uuid());
   RAISE EXCEPTION 'Client coupon redeem allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RESET ROLE;
 IF ${counts} IS DISTINCT FROM (SELECT counts FROM coupon_before) THEN RAISE EXCEPTION 'Verification mutated business rows'; END IF;
END $check$;
SELECT jsonb_build_object('businessRowsUnchanged',${counts}=(SELECT counts FROM coupon_before),'coupons',(SELECT count(*) FROM brand_loyalty_analytics_private.coupons),
 'newFunctions',(${functionHashes}),'oldFunctions',(SELECT functions FROM coupon_before),'rpcGuardsPassed',true,'analyticsUnchangedWithoutCoupons',true) AS validation;`;
await mkdir('output/analytics-coupons',{recursive:true});
await writeFile('output/analytics-coupons/inspect.sql',introspect);
await writeFile('output/analytics-coupons/rollback.sql',`BEGIN ISOLATION LEVEL REPEATABLE READ;\nSET LOCAL statement_timeout='60s';\n${before}\n${body}\n${checks}\nROLLBACK;\n`);
await writeFile('output/analytics-coupons/verify.sql',`BEGIN ISOLATION LEVEL REPEATABLE READ;\nSET LOCAL statement_timeout='60s';\n${before}\n${checks}\nROLLBACK;\n`);
await writeFile('output/analytics-coupons/apply.sql',`BEGIN;\nSET LOCAL statement_timeout='60s';\n${body}\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261105080819','analytics_individual_coupons',ARRAY['${source.replaceAll("'","''")}']);\nCOMMIT;\n`);
console.log(JSON.stringify({file,md5:hash(source),sha256:createHash('sha256').update(source).digest('hex'),preparedOnly:true}));
