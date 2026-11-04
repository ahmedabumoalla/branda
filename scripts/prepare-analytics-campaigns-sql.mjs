import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const file='supabase/migrations/20261104124234_analytics_targeted_campaigns.sql';
const source=(await readFile(file,'utf8')).replaceAll('\r\n','\n');
const body=source.replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'');
const checks=`
CREATE TEMP TABLE analytics_campaign_before AS SELECT
 (SELECT count(*) FROM public.customer_profiles) AS customers,
 (SELECT count(*) FROM public.loyalty_cards) AS cards,
 (SELECT count(*) FROM public.loyalty_activity_events) AS activity,
 (SELECT count(*) FROM public.platform_marketing_campaigns) AS campaigns,
 (SELECT count(*) FROM public.platform_marketing_recipients) AS recipients,
 (SELECT count(*) FROM loyalty_audit_private.wallet_welcomes) AS welcomes;
CREATE TEMP TABLE analytics_campaign_results(name text,result jsonb);
DO $verify$
DECLARE admin_id uuid; non_admin uuid; brand record; segment text; result jsonb; other_page jsonb; started timestamptz; total integer:=0; elapsed numeric;
BEGIN
 SELECT id INTO admin_id FROM public.profiles WHERE role='platform_admin' AND status='active' LIMIT 1;
 IF admin_id IS NULL THEN RAISE EXCEPTION 'Missing active administrator'; END IF;
 IF has_function_privilege('anon','public.platform_marketing_analytics_audience(uuid,uuid,text,integer,integer)','EXECUTE')
 OR has_function_privilege('authenticated','public.platform_marketing_analytics_audience(uuid,uuid,text,integer,integer)','EXECUTE')
 OR has_function_privilege('authenticated','public.platform_marketing_create_analytics_campaign(uuid,uuid,text,text,uuid,text,integer,text,timestamptz,text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.platform_marketing_analytics_audience(uuid,uuid,text,integer,integer)','EXECUTE')
 OR has_schema_privilege('service_role','brand_loyalty_analytics_private','USAGE') THEN RAISE EXCEPTION 'Invalid new RPC privileges'; END IF;
 started:=clock_timestamp();
 FOR brand IN SELECT id FROM public.cafes WHERE deleted_at IS NULL AND status IN('active','published') LOOP
   FOREACH segment IN ARRAY ARRAY['inactive','loyal','absent'] LOOP
     result:=public.platform_marketing_analytics_audience(admin_id,brand.id,segment,CASE WHEN segment='absent' THEN 30 ELSE 10 END,1);
     IF NOT(result ?& ARRAY['generatedAt','brandId','segment','inactiveDays','matched','total','excluded','digest','items','page','pageSize'])
       OR result->>'brandId'<>brand.id::text OR result->>'segment'<>segment OR (result->>'total')::integer>(result->>'matched')::integer
       OR (result->>'matched')::integer-(result->>'total')::integer<>(result->>'excluded')::integer OR result->>'digest'!~'^[0-9a-f]{64}$'
       OR jsonb_array_length(result->'items')>25 THEN RAISE EXCEPTION 'Invalid audience DTO'; END IF;
     IF EXISTS(SELECT 1 FROM jsonb_array_elements(result->'items') item WHERE item->>'phone'!~'^9665[0-9]{8}$'
       OR NOT(item ?& ARRAY['id','name','phone','lastVisitAt','inactiveDays','visitDays','averageVisitGapDays'])) THEN RAISE EXCEPTION 'Invalid customer DTO'; END IF;
     other_page:=public.platform_marketing_analytics_audience(admin_id,brand.id,segment,CASE WHEN segment='absent' THEN 30 ELSE 10 END,2);
     IF result->>'digest' IS DISTINCT FROM other_page->>'digest' THEN RAISE EXCEPTION 'Pagination digest mismatch'; END IF;
     total:=total+1;
   END LOOP;
 END LOOP;
 elapsed:=extract(epoch FROM clock_timestamp()-started)*1000;
 INSERT INTO analytics_campaign_results VALUES('preview_queries',to_jsonb(total*2)),('preview_ms',to_jsonb(round(elapsed,2)));
 SELECT id INTO non_admin FROM public.profiles WHERE role<>'platform_admin' LIMIT 1;
 BEGIN PERFORM public.platform_marketing_analytics_audience(non_admin,brand.id,'inactive'); RAISE EXCEPTION 'Nonadmin preview allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.platform_marketing_create_analytics_campaign(non_admin,gen_random_uuid(),'No send','No send',brand.id,'inactive',10,repeat('0',64)); RAISE EXCEPTION 'Nonadmin creation allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('role','service_role',true);
 result:=public.platform_marketing_analytics_audience(admin_id,brand.id,'inactive');
 RESET ROLE;
 INSERT INTO analytics_campaign_results VALUES('service_role_preview',to_jsonb(true)),('nonadmin_denied',to_jsonb(true));
 IF EXISTS(SELECT 1 FROM analytics_campaign_before b WHERE b.customers<>(SELECT count(*) FROM public.customer_profiles)
 OR b.cards<>(SELECT count(*) FROM public.loyalty_cards) OR b.activity<>(SELECT count(*) FROM public.loyalty_activity_events)
 OR b.campaigns<>(SELECT count(*) FROM public.platform_marketing_campaigns) OR b.recipients<>(SELECT count(*) FROM public.platform_marketing_recipients)
 OR b.welcomes<>(SELECT count(*) FROM loyalty_audit_private.wallet_welcomes)) THEN RAISE EXCEPTION 'Preview mutated business data'; END IF;
 INSERT INTO analytics_campaign_results VALUES('business_data_unchanged',to_jsonb(true));
END $verify$;
SET LOCAL ROLE authenticated;
DO $denied$ BEGIN
 BEGIN PERFORM public.platform_marketing_analytics_audience(gen_random_uuid(),gen_random_uuid(),'inactive'); RAISE EXCEPTION 'Client preview allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.platform_marketing_create_analytics_campaign(gen_random_uuid(),gen_random_uuid(),'No send','No send',gen_random_uuid(),'inactive',10,repeat('0',64)); RAISE EXCEPTION 'Client create allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $denied$;
RESET ROLE;
SELECT jsonb_object_agg(name,result) AS analytics_campaign_validation FROM analytics_campaign_results;
`;
await mkdir('output/analytics-campaigns',{recursive:true});
await writeFile('output/analytics-campaigns/rollback.sql',`BEGIN ISOLATION LEVEL REPEATABLE READ;\nSET LOCAL statement_timeout='60s';\n${body}\n${checks}\nROLLBACK;\n`);
await writeFile('output/analytics-campaigns/verify.sql',`BEGIN ISOLATION LEVEL REPEATABLE READ;\nSET LOCAL statement_timeout='60s';\n${checks}\nROLLBACK;\n`);
await writeFile('output/analytics-campaigns/apply.sql',`BEGIN;\nSET LOCAL statement_timeout='60s';\n${body}\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261104124234','analytics_targeted_campaigns',ARRAY['${source.replaceAll("'","''")}']);\nCOMMIT;\n`);
console.log(JSON.stringify({file,md5:createHash('md5').update(source).digest('hex'),sha256:createHash('sha256').update(source).digest('hex'),preparedOnly:true}));
