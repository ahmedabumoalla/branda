import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(path.join(os.tmpdir(),'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const q=(s,a=[])=>db.query(s,a);
const one=async(s,a=[])=>Object.values((await q(s,a)).rows[0]??{})[0];
let checks=0;const check=(x,m)=>{assert(x,m);checks++;};
const scenario=async fn=>{await db.exec('BEGIN');try{await fn();}finally{await db.exec('ROLLBACK');}};
const reject=async(fn,re)=>{await db.exec('SAVEPOINT expected_failure');await assert.rejects(fn,re);await db.exec('ROLLBACK TO SAVEPOINT expected_failure');checks++;};
const claim=(attempt=50,retry=false,actor=1)=>one('SELECT public.admin_claim_brand_welcome($1,$2,$3,$4)',[id(actor),id(3),id(attempt),retry]);
const finish=(attempt=50,receipt='receipt',sent='now()')=>q(`SELECT public.admin_finish_brand_welcome($1,$2,$3,$4,${sent})`,[id(1),id(3),id(attempt),receipt]);
const rows=()=>q('SELECT * FROM subscriptions ORDER BY id').then(r=>r.rows);
const cancelOriginal=()=>q("UPDATE subscriptions SET status='cancelled',cancelled_at=now() WHERE id=$1",[id(4)]);
const add=(plans)=>one("SELECT public.admin_add_brand_plans($1,$2,subscription_terms_private.state($1)->>'revision')",[id(3),plans]);
const seed=(plan='pro',n=6,extra='')=>q(`INSERT INTO subscriptions(id,cafe_id,plan_id,status,activation_source,started_at,expires_at,duration_unit,duration_count) VALUES($1,$2,$3,'trialing','admin_prepared_trial',now(),NULL,CASE WHEN $3='finance' THEN 'month' ELSE 'day' END,CASE WHEN $3='finance' THEN 1 ELSE 7 END) ${extra}`,[id(n),id(3),plan]);
try {
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE SCHEMA brand_onboarding_private;CREATE SCHEMA subscription_terms_private;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
 CREATE TYPE subscription_status AS ENUM('active','trialing','cancelled','expired','past_due');
 CREATE TABLE profiles(id uuid PRIMARY KEY,role text,status text);
 CREATE TABLE auth.users(id uuid PRIMARY KEY,phone text,encrypted_password text);
 CREATE TABLE cafes(id uuid PRIMARY KEY,status text,deleted_at timestamptz);
 CREATE TABLE platform_plans(id text PRIMARY KEY,active bool,name text,price_sar numeric,trial_days int,duration_unit text,duration_count int);
 CREATE TABLE subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid,plan_id text,status subscription_status,activation_source text,
 started_at timestamptz,expires_at timestamptz,duration_unit text,duration_count int,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),cancelled_at timestamptz,
 amount_sar numeric DEFAULT 0,base_amount_sar numeric DEFAULT 0,discount_amount_sar numeric DEFAULT 0,paid_at timestamptz,plan_name_snapshot text,payment_provider text,payment_method_label text,
 CONSTRAINT finance_term CHECK(plan_id<>'finance' OR(duration_unit='month' AND duration_count IN(1,3))));
 CREATE TABLE audit_logs(actor_id uuid,cafe_id uuid,action text,entity_table text,entity_id uuid,old_data jsonb,new_data jsonb);
 CREATE TABLE brand_onboarding_private.accounts(id uuid PRIMARY KEY,cafe_id uuid,owner_id uuid,subscription_id uuid,state text,draft jsonb,pending_edit jsonb,attempt_started_at timestamptz,attempt_id uuid,password_ciphertext text,owner_password_hash text,password_context uuid,sent_at timestamptz,provider_message_id text,proof text);
 CREATE FUNCTION brand_onboarding_private.require_admin(actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND role='platform_admin' AND status='active') THEN RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE='42501';END IF;END$$;
 REVOKE ALL ON SCHEMA brand_onboarding_private,subscription_terms_private FROM PUBLIC,anon,authenticated,service_role;
 INSERT INTO profiles VALUES('${id(1)}','platform_admin','active'),('${id(2)}','cafe_owner','active');
 INSERT INTO auth.users VALUES('${id(2)}','+966511111111','valid-hash');INSERT INTO cafes VALUES('${id(3)}','active',NULL),('${id(30)}','active',NULL);
 INSERT INTO platform_plans VALUES('owner_trial_7d',true,'Trial',0,7,'day',7),('pro',true,'Branda Loyalty',300,0,'month',1),('starter',true,'Branda Menu',200,0,'month',1),('finance',true,'Finance',200,0,'month',1),('disabled',false,'Disabled',100,0,'month',1);
 INSERT INTO subscriptions(id,cafe_id,plan_id,status,activation_source,started_at,expires_at,duration_unit,duration_count) VALUES('${id(4)}','${id(3)}','owner_trial_7d','trialing','admin_prepared_trial',now(),NULL,'day',7);
 INSERT INTO brand_onboarding_private.accounts(id,cafe_id,owner_id,subscription_id,state,draft,password_ciphertext,owner_password_hash,proof) VALUES('${id(5)}','${id(3)}','${id(2)}','${id(4)}','ready','{"phone":"966511111111","ownerName":"Owner","brandName":"Brand","passwordReady":true}','ciphertext','valid-hash','proof');
 SELECT set_config('test.uid','${id(1)}',false);`);
 const shared=(await fs.readFile('supabase/migrations/20261106214239_shared_brand_subscription_deadline.sql','utf8')).replaceAll('\r\n','\n');
 await db.exec(shared.slice(shared.indexOf('CREATE FUNCTION subscription_terms_private.require_admin()'),shared.indexOf('CREATE FUNCTION public.admin_brand_subscription_state(')));
 await db.exec(shared.slice(shared.indexOf('CREATE FUNCTION subscription_terms_private.synchronize()'),shared.indexOf('CREATE FUNCTION public.admin_update_brand_subscription_deadline(')));
 await db.exec((await fs.readFile('supabase/migrations/20261101214430_admin_welcome_current_subscription.sql','utf8')).replaceAll('\r\n','\n'));
 // Reproduce the already-installed finance duration compatibility patch.
 const finishSource=await one("SELECT pg_get_functiondef('public.admin_finish_brand_welcome(uuid,uuid,uuid,text,timestamptz)'::regprocedure)");
 await db.exec(finishSource.replace("duration_unit='day',duration_count=7,","duration_unit=CASE WHEN s.plan_id='finance' THEN s.duration_unit ELSE 'day' END,duration_count=CASE WHEN s.plan_id='finance' THEN s.duration_count ELSE 7 END,"));
 const before=await rows();await db.exec(await fs.readFile('supabase/migrations/20261111165826_owner_handoff_selected_plan_trial.sql','utf8'));assert.deepEqual(await rows(),before);checks++;
 for(const role of ['anon','authenticated'])for(const signature of ['admin_claim_brand_welcome(uuid,uuid,uuid,boolean)','admin_finish_brand_welcome(uuid,uuid,uuid,text,timestamptz)'])check(!(await one('SELECT has_function_privilege($1,$2,\'EXECUTE\')',[role,'public.'+signature])),`${role} denied`);
 check(await one("SELECT has_function_privilege('service_role','public.admin_claim_brand_welcome(uuid,uuid,uuid,boolean)','EXECUTE')"),'service only');
 await scenario(async()=>{await cancelOriginal();await seed();const before=await rows();check((await claim()).startsTrial,'replaced original trial uses selected loyalty');assert.deepEqual(await rows(),before);checks++;await finish();check(await one("SELECT expires_at-started_at=interval '7 days' AND activation_source='admin_whatsapp_trial' FROM subscriptions WHERE id=$1",[id(6)]),'selected loyalty starts seven days');check(await one("SELECT status='cancelled' FROM subscriptions WHERE id=$1",[id(4)]),'cancelled original stays cancelled');});
 await scenario(async()=>{await cancelOriginal();await add(['pro','starter','finance']);let current=(await rows()).filter(s=>s.status==='trialing');check(current.length===3&&current.every(s=>s.activation_source==='admin_prepared_trial'&&s.expires_at===null),'remove-all then select any plans retains prepared intent');check((await claim()).startsTrial,'multi selected group allowed');await finish();current=(await rows()).filter(s=>s.status==='trialing');check(current.length===3&&current.every(s=>s.activation_source==='admin_whatsapp_trial'&&Date.parse(s.expires_at)-Date.parse(s.started_at)===7*86400000),'all selected plans share exactly seven days');check(current.find(s=>s.plan_id==='finance').duration_unit==='month','finance monthly snapshot retained');const after=await rows();await finish();check((await claim()).sent,'sent retry is idempotent');assert.deepEqual(await rows(),after);checks++;});
 await scenario(async()=>{await cancelOriginal();await reject(()=>claim(),/ACTIVE_SUBSCRIPTION_REQUIRED/);});
 await scenario(async()=>{await reject(()=>claim(50,false,2),/ADMIN_REQUIRED/);await q("UPDATE profiles SET status='disabled' WHERE id=$1",[id(1)]);await reject(()=>claim(),/ADMIN_REQUIRED/);});
 await scenario(async()=>{await claim();await reject(()=>claim(51),/SEND_IN_PROGRESS/);for(const receipt of ['', 'x'.repeat(257)])await reject(()=>finish(50,receipt),/INVALID_SEND_RECEIPT/);await reject(()=>finish(51),/INVALID_SEND_RECEIPT/);await reject(()=>finish(50,'receipt',"now()+interval '2 minutes'"),/INVALID_SEND_RECEIPT/);await reject(()=>finish(50,'receipt',"now()-interval '2 minutes'"),/INVALID_SEND_RECEIPT/);check(await one('SELECT expires_at IS NULL FROM subscriptions WHERE id=$1',[id(4)]),'invalid receipt never starts clock');});
 await scenario(async()=>{await q("UPDATE brand_onboarding_private.accounts SET state='uncertain'");await reject(()=>claim(),/SEND_UNCERTAIN/);check((await claim(51,true)).startsTrial,'explicit uncertain retry uses current selection');});
 await scenario(async()=>{await claim();await cancelOriginal();await add(['pro']);await finish();check(await one("SELECT activation_source='admin_whatsapp_trial' AND expires_at-started_at=interval '7 days' FROM subscriptions WHERE plan_id='pro'"),'package replacement during send starts current selection');check(await one("SELECT status='cancelled' FROM subscriptions WHERE id=$1",[id(4)]),'in-flight removed trial not revived');});
 await scenario(async()=>{await claim();await cancelOriginal();await finish();check(await one("SELECT status='cancelled' FROM subscriptions WHERE id=$1",[id(4)]),'remove all during send never resurrects package');check(await one("SELECT state='sent' FROM brand_onboarding_private.accounts"),'accepted message acknowledged even if admin removed all');});
 await scenario(async()=>{await cancelOriginal();await q("INSERT INTO subscriptions(id,cafe_id,plan_id,status,activation_source,amount_sar,paid_at,started_at,expires_at,duration_unit,duration_count) VALUES($1,$2,'pro','active','bank_transfer',300,now(),now()-interval '1 day',now()+interval '30 days','month',1)",[id(6),id(3)]);const before=await rows();check(!(await claim()).startsTrial,'paid account credential-only handoff');await finish();assert.deepEqual(await rows(),before);checks++;});
 await scenario(async()=>{await claim();await q("INSERT INTO subscriptions(id,cafe_id,plan_id,status,activation_source,amount_sar,paid_at,started_at,expires_at,duration_unit,duration_count) VALUES($1,$2,'pro','active','bank_transfer',300,now(),now(),now()+interval '30 days','month',1)",[id(6),id(3)]);const paidBefore=await rows();await finish();assert.deepEqual(await rows(),paidBefore);checks++;});
 await scenario(async()=>{await q("UPDATE subscriptions SET activation_source='admin_whatsapp_trial',started_at=now()-interval '1 day',expires_at=now()+interval '6 days'");const startedBefore=await rows();check(!(await claim()).startsTrial,'already started trial is credential-only');await finish();assert.deepEqual(await rows(),startedBefore);checks++;});
 await scenario(async()=>{await cancelOriginal();await q("UPDATE brand_onboarding_private.accounts SET state='uncertain'");await add(['finance']);await q("UPDATE subscriptions SET duration_count=3 WHERE plan_id='finance'");check(await one("SELECT activation_source='admin_prepared_trial' AND expires_at IS NULL FROM subscriptions WHERE plan_id='finance'"),'uncertain remove-all retains prepared intent');await claim(51,true);await finish(51);check(await one("SELECT duration_unit='month' AND duration_count=3 AND expires_at-started_at=interval '7 days' FROM subscriptions WHERE plan_id='finance'"),'quarterly finance snapshot survives seven-day handoff');});
 // Insert protected clocks before the prepared row, then preserve the scenario
 // without invoking the old synchronization while setting up legacy mixed data.
 for(const clock of ["now()-interval '1 day'","now()+interval '30 days'"])await scenario(async()=>{
  await cancelOriginal();await seed();await db.exec('ALTER TABLE subscriptions DISABLE TRIGGER zz_synchronize_brand_subscription_deadline');
  await q(`INSERT INTO subscriptions(id,cafe_id,plan_id,status,activation_source,amount_sar,paid_at,started_at,expires_at,duration_unit,duration_count) VALUES($1,$2,'starter','active','bank_transfer',200,now(),${clock==="now()+interval '30 days'"?"now()+interval '10 days'":"now()-interval '30 days'"},${clock},'month',1)`,[id(7),id(3)]);
  await db.exec('ALTER TABLE subscriptions ENABLE TRIGGER zz_synchronize_brand_subscription_deadline');const protectedBefore=await one('SELECT to_jsonb(s) FROM subscriptions s WHERE id=$1',[id(7)]);
  await claim();await finish();assert.deepEqual(await one('SELECT to_jsonb(s) FROM subscriptions s WHERE id=$1',[id(7)]),protectedBefore);checks++;check(await one("SELECT expires_at-started_at=interval '7 days' FROM subscriptions WHERE id=$1",[id(6)]),'selected prepared starts without resetting expired/future paid clock');
 });
 for(const change of ["UPDATE subscriptions SET started_at=now()+interval '1 day'","UPDATE subscriptions SET expires_at=now()-interval '1 day'","UPDATE platform_plans SET active=false","UPDATE subscriptions SET amount_sar=1","UPDATE subscriptions SET paid_at=now()"] )await scenario(async()=>{await db.exec(change);await reject(()=>claim(),/ACTIVE_SUBSCRIPTION_REQUIRED/);});
 await scenario(async()=>{await claim();await q("UPDATE platform_plans SET active=false WHERE id='owner_trial_7d'");await finish();check(await one('SELECT expires_at IS NULL FROM subscriptions WHERE id=$1',[id(4)]),'plan deactivated during send never starts');});
 await scenario(async()=>{await cancelOriginal();await q("UPDATE brand_onboarding_private.accounts SET state='sent',sent_at=now()");await add(['pro']);check(await one("SELECT activation_source='admin_manual_change' AND expires_at IS NOT NULL FROM subscriptions WHERE plan_id='pro'"),'already delivered accounts retain normal paid-length assignment behavior');});
 console.log(`PASS ${checks} selected-plan handoff SQL authorization, seven-day cohorts, finance, concurrency, receipt and paid-preservation checks`);
} finally {await db.close();}
