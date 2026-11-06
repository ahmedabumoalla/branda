import fs from 'node:fs';
import crypto from 'node:crypto';
const dir='output/loco-whatsapp';fs.mkdirSync(dir,{recursive:true});
const migrations=['20261106075708_loco_customer_whatsapp_connection','20261106075709_loco_customer_delivery_routing'].map(name=>({name,version:name.split('_')[0],source:fs.readFileSync(`supabase/migrations/${name}.sql`,'utf8').replaceAll('\r\n','\n')}));
const tables=['public.brand_marketing_connections','public.customer_phone_otp_requests','phone_otp_delivery_private.deliveries','loyalty_audit_private.wallet_welcomes'];
const fingerprint=table=>`(SELECT md5(coalesce(jsonb_agg(to_jsonb(t)-'transactional_requested_at'-'delivery_context_ambiguous'${table.endsWith('.deliveries')?"-'cafe_id'-'purpose'":''} ORDER BY ${table.endsWith('connections')?'cafe_id':'id'})::text,'')) FROM ${table} t)`;
const snapshot=`jsonb_build_array(${tables.map(fingerprint).join(',')})`;
const functions=['loco_whatsapp_actor_allowed(uuid,uuid)','loco_claim_whatsapp_connection(uuid,uuid,text)','loco_activate_whatsapp_connection(uuid,uuid,uuid,text,text)','claim_customer_phone_otp_dispatch(text,text)','enqueue_customer_phone_otp_delivery(text,text,text,text)','claim_customer_phone_otp_delivery_context(text,uuid)','claim_routed_wallet_welcome(uuid,boolean,boolean)'];
const gates=`DO $guard$ BEGIN
 IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN('20261106075708','20261106075709')) THEN RAISE EXCEPTION 'Migration already applied'; END IF;
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid='public.claim_customer_phone_otp_dispatch(text,text)'::regprocedure)<>'f7c0b1a9c214123e0be3c897f4d9a02b' OR
 (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid='public.enqueue_customer_phone_otp_delivery(text,text,text,text)'::regprocedure)<>'27f9b8f83a71a579b2c9964e9394f80a' THEN RAISE EXCEPTION 'OTP schema changed since review'; END IF;
END $guard$;
CREATE TEMP TABLE loco_before ON COMMIT DROP AS SELECT ${snapshot} AS digest;
`;
const invariant=`DO $checks$ DECLARE f text; BEGIN
 IF ${snapshot} IS DISTINCT FROM (SELECT digest FROM loco_before) THEN RAISE EXCEPTION 'Existing operational rows changed';END IF;
 FOREACH f IN ARRAY ARRAY[${functions.map(f=>`'public.${f}'`).join(',')}] LOOP
  IF has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('authenticated',f,'EXECUTE') OR NOT has_function_privilege('service_role',f,'EXECUTE') THEN RAISE EXCEPTION 'RPC privilege mismatch %',f;END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=f::regprocedure AND prosecdef AND proconfig=ARRAY['search_path=""']) THEN RAISE EXCEPTION 'Unsafe function configuration %',f;END IF;
 END LOOP;
 IF has_function_privilege('service_role','phone_otp_delivery_private.claim_admission(text,text)','EXECUTE') OR has_function_privilege('authenticated','phone_otp_delivery_private.claim_admission(text,text)','EXECUTE') THEN RAISE EXCEPTION 'Private admission exposed';END IF;
 IF EXISTS(SELECT 1 FROM public.brand_marketing_connections WHERE transactional_requested_at IS NOT NULL) THEN RAISE EXCEPTION 'Unexpected opt-in';END IF;
 IF EXISTS(SELECT 1 FROM phone_otp_delivery_private.deliveries WHERE cafe_id IS NOT NULL OR purpose IS NOT NULL) THEN RAISE EXCEPTION 'Historical delivery context changed';END IF;
END $checks$;
`;
const bodies=migrations.map(m=>m.source.replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'')).join('\n');
const history=migrations.map(m=>`INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${m.version}','${m.name.slice(15)}',ARRAY[$source$${m.source}$source$]);`).join('\n');
const smoke=`DO $smoke$ DECLARE actor uuid; result jsonb; BEGIN
 IF public.loco_whatsapp_actor_allowed('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'Foreign tenant accepted';END IF;
 SELECT owner_user_id INTO actor FROM public.cafes WHERE id='321fd305-1883-48df-ab69-829cf7d1bc48';
 IF NOT public.loco_whatsapp_actor_allowed('321fd305-1883-48df-ab69-829cf7d1bc48',actor) THEN RAISE EXCEPTION 'Active owner rejected';END IF;
 result:=public.loco_claim_whatsapp_connection('321fd305-1883-48df-ab69-829cf7d1bc48',actor,'966500000000');
 IF result->>'transactional_requested_at' IS NULL OR result->>'status'<>'provisioning' OR NOT (result->>'allow_create')::boolean THEN RAISE EXCEPTION 'Explicit claim failed';END IF;
 UPDATE public.brand_marketing_connections SET status='disconnecting' WHERE cafe_id='321fd305-1883-48df-ab69-829cf7d1bc48';
 IF EXISTS(SELECT 1 FROM public.brand_marketing_connections WHERE cafe_id='321fd305-1883-48df-ab69-829cf7d1bc48' AND transactional_requested_at IS NOT NULL) THEN RAISE EXCEPTION 'Disconnect opt-in retained';END IF;
END $smoke$;
`;
fs.writeFileSync(dir+'/rollback.sql',`BEGIN ISOLATION LEVEL REPEATABLE READ;\n${gates}${bodies}\n${invariant}${smoke}\nSELECT 'PASS migrations, real-owner claim, opt-in reset and permissions; rolling back all changes' AS validation;\nROLLBACK;`);
fs.writeFileSync(dir+'/apply.sql',`BEGIN ISOLATION LEVEL REPEATABLE READ;\n${gates}${bodies}\n${invariant}${history}\nSELECT 'PASS migrations only; existing rows unchanged; no connection or messages created' AS validation;\nCOMMIT;`);
fs.writeFileSync(dir+'/migrations.json',JSON.stringify(migrations.map(m=>({file:`supabase/migrations/${m.name}.sql`,version:m.version,sourceMd5:crypto.createHash('md5').update(m.source).digest('hex')})),null,2));
console.log('Prepared scoped rollback/apply SQL and exact migration identities');
