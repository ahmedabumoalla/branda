import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const file='supabase/migrations/20261106212401_enable_butcher_shops_category.sql';
const migration=await readFile(file,'utf8');
const barber=await readFile('supabase/migrations/20261028073254_enable_mens_barbershop_category.sql','utf8');
const oldFunction=barber.slice(barber.indexOf('CREATE OR REPLACE FUNCTION'),barber.indexOf('REVOKE ALL')).replace("NOT IN ('cafes_coffee','restaurants','hair_salons')","NOT IN ('cafes_coffee','restaurants','hair_salons','gifts_flowers')");
const foundation=await readFile('supabase/migrations/20261013231133_admin_brand_preparation.sql','utf8');
const requireAdmin=foundation.slice(foundation.indexOf('CREATE FUNCTION brand_onboarding_private.require_admin'),foundation.indexOf('CREATE FUNCTION public.admin_prepare_brand_account'));
const oldCategories=['cafes_coffee','restaurants','massage_centers','beauty_centers','hair_salons','clinics_health_centers','gyms_fitness','retail_stores','clothing_stores','furniture','events_conferences','gifts_flowers'];
const oldDefaults=['cafes_coffee','restaurants','hair_salons','events_conferences','gifts_flowers'];
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE??path.join(tmpdir(),'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db=new PGlite();let checks=0;
const q=(sql,args=[])=>db.query(sql,args),value=async(sql,args=[])=>Object.values((await q(sql,args)).rows[0])[0];
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const check=(test,label)=>{assert.ok(test,label);checks++;};
const rejects=async(fn,re)=>{await assert.rejects(fn,re);checks++;};
const fn="public.admin_prepare_brand_account(uuid,uuid,jsonb,text,text)";
const snapshot=()=>value(`SELECT jsonb_build_object('cafes',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM cafes t),'defaults',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY category_id),'[]') FROM category_default_plans t),'profiles',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM profiles t),'plans',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM platform_plans t),'users',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM auth.users t),'accounts',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM brand_onboarding_private.accounts t))`);
const prepare=(n,category='butcher_shops',extra={})=>value('SELECT public.admin_prepare_brand_account($1,$2,$3,$4,$5)',[id(n),id(1),{slug:`local-fixture-${n}`,brandName:'Fixture brand',ownerName:'',phone:'',category,...extra},'a'.repeat(64),'b'.repeat(64)]);
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE SCHEMA brand_onboarding_private;
CREATE TABLE profiles(id uuid PRIMARY KEY,phone text,role text,status text);
CREATE TABLE auth.users(id uuid PRIMARY KEY,phone text);
CREATE TABLE cafes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),slug text UNIQUE,business_category text NOT NULL CONSTRAINT cafes_business_category_check CHECK(business_category IN(${oldCategories.map(x=>`'${x}'`).join(',')})));
CREATE TABLE platform_plans(id text PRIMARY KEY,active boolean,price_sar numeric,trial_days integer);
CREATE TABLE platform_settings(id text PRIMARY KEY,default_plan_id text REFERENCES platform_plans(id));
CREATE TABLE category_default_plans(category_id text PRIMARY KEY CONSTRAINT category_default_plans_category_check CHECK(category_id IN(${oldDefaults.map(x=>`'${x}'`).join(',')})),default_plan_id text REFERENCES platform_plans(id));
CREATE TABLE brand_onboarding_private.accounts(id uuid PRIMARY KEY,created_by uuid REFERENCES profiles(id),draft jsonb,fingerprint text,password_ciphertext text,cafe_id uuid,proof text DEFAULT replace(gen_random_uuid()::text,'-',''));
ALTER TABLE cafes ENABLE ROW LEVEL SECURITY;ALTER TABLE category_default_plans ENABLE ROW LEVEL SECURITY;
${requireAdmin}
${oldFunction}
REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION ${fn} TO service_role;
INSERT INTO profiles VALUES('${id(1)}',NULL,'platform_admin','active'),('${id(2)}',NULL,'cafe_owner','active'),('${id(3)}',NULL,'platform_admin','suspended'),('${id(4)}',NULL,'platform_admin','active');
INSERT INTO platform_plans VALUES('default-trial',true,0,7),('butcher-trial',true,0,7),('paid',true,99,7),('disabled',false,0,7),('no-trial',true,0,0);
INSERT INTO platform_settings VALUES('default','default-trial');
INSERT INTO cafes(id,slug,business_category) VALUES('${id(100)}','existing-cafe','cafes_coffee');
INSERT INTO category_default_plans VALUES('cafes_coffee','default-trial');`);
const before=await snapshot(),oldDefinition=await value(`SELECT pg_get_functiondef('${fn}'::regprocedure)`);
check(await value(`SELECT md5(pg_get_functiondef('${fn}'::regprocedure))`) === '62773818f80b66c71aed425b39acb537','historical source matches live reviewed function');
await rejects(()=>prepare(10),/INVALID_ACCOUNT_DATA/);
await db.exec(migration.replace(/COMMIT;\s*$/,'ROLLBACK;'));
check(JSON.stringify(await snapshot())===JSON.stringify(before),'migration rollback preserves all business fixtures');
check(await value(`SELECT pg_get_functiondef('${fn}'::regprocedure)`)===oldDefinition,'rollback restores exact function');
await rejects(()=>q("INSERT INTO cafes(slug,business_category) VALUES('unavailable','butcher_shops')"),/cafes_business_category_check/);
await db.exec(migration);
check(JSON.stringify(await snapshot())===JSON.stringify(before),'schema-only migration leaves accounts/defaults/plans untouched');
const updated=await value(`SELECT pg_get_functiondef('${fn}'::regprocedure)`);
check(updated===oldDefinition.replace("'hair_salons','gifts_flowers')","'hair_salons','gifts_flowers','butcher_shops')"),'only onboarding allowlist changed');
for(const category of [...oldCategories,'butcher_shops']){await q('INSERT INTO cafes(slug,business_category) VALUES($1,$2)',[`category-${category}`,category]);checks++;}
for(const category of [...oldDefaults,'butcher_shops']){await q('INSERT INTO category_default_plans VALUES($1,$2) ON CONFLICT(category_id) DO UPDATE SET default_plan_id=excluded.default_plan_id',[category,'default-trial']);checks++;}
await rejects(()=>q("INSERT INTO cafes(slug,business_category) VALUES('bad-category','unlisted')"),/cafes_business_category_check/);
await rejects(()=>q("INSERT INTO category_default_plans VALUES('unlisted','default-trial')"),/category_default_plans_category_check/);
await q("DELETE FROM category_default_plans WHERE category_id='butcher_shops'");
const created=await prepare(10);check(created.cafeId===null&&Boolean(created.proof),'new category stages a draft only');
check(await value('SELECT draft->>\'planId\' FROM brand_onboarding_private.accounts WHERE id=$1',[id(10)])==='default-trial','missing category override uses configured free trial');
check(JSON.stringify(await prepare(10))===JSON.stringify(created),'idempotent retry returns same proof');
await rejects(()=>value('SELECT public.admin_prepare_brand_account($1,$2,$3,$4,$5)',[id(10),id(1),{},'c'.repeat(64),'b'.repeat(64)]),/REQUEST_CHANGED/);
await rejects(()=>value('SELECT public.admin_prepare_brand_account($1,$2,$3,$4,$5)',[id(10),id(4),{},'a'.repeat(64),'b'.repeat(64)]),/REQUEST_CHANGED/);
for(const actor of [id(2),id(3),id(999)])await rejects(()=>value('SELECT public.admin_prepare_brand_account($1,$2,$3,$4,$5)',[id(90),actor,{},'a'.repeat(64),'b'.repeat(64)]),/ADMIN_REQUIRED/);
for(const category of ['cafes_coffee','restaurants','hair_salons','gifts_flowers']){await prepare(20+checks,category);checks++;}
await rejects(()=>prepare(60,'events_conferences'),/INVALID_ACCOUNT_DATA/);
await rejects(()=>prepare(61,'unlisted'),/INVALID_ACCOUNT_DATA/);
await rejects(()=>prepare(62,'butcher_shops',{slug:'x'}),/INVALID_ACCOUNT_DATA/);
await q("INSERT INTO category_default_plans VALUES('butcher_shops','butcher-trial')");
await prepare(70);check(await value('SELECT draft->>\'planId\' FROM brand_onboarding_private.accounts WHERE id=$1',[id(70)])==='butcher-trial','category-specific configured free trial is honored');
for(const plan of ['paid','disabled','no-trial']){await q("UPDATE category_default_plans SET default_plan_id=$1 WHERE category_id='butcher_shops'",[plan]);await rejects(()=>prepare(80),/TRIAL_PLAN_UNAVAILABLE/);}
check(await value('SELECT count(*)::integer FROM auth.users')===0,'staging tests never create an Auth user');
check(await value(`SELECT NOT has_function_privilege('anon','${fn}','EXECUTE') AND NOT has_function_privilege('authenticated','${fn}','EXECUTE') AND has_function_privilege('service_role','${fn}','EXECUTE')`),'service-only RPC grants preserved');
check(await value("SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN('cafes'::regclass,'category_default_plans'::regclass)"),'RLS retained');
await rejects(()=>db.exec(migration),/Unexpected business category schema/);await db.exec('ROLLBACK');
const inputs=[file,'scripts/check-butcher-category-db.mjs','supabase/migrations/20261028073254_enable_mens_barbershop_category.sql','supabase/migrations/20261013231133_admin_brand_preparation.sql'];
const hashes={};for(const f of inputs)hashes[f]=createHash('sha256').update(await readFile(f)).digest('hex');
await mkdir('output/butcher-category',{recursive:true});await writeFile('output/butcher-category/db-checks.json',JSON.stringify({at:new Date().toISOString(),checks,node:process.version,engine:'PGlite',inputs:hashes,liveBusinessWrites:0},null,2)+'\n');
await db.close();console.log(`Butcher category SQL: ${checks} checks passed`);
