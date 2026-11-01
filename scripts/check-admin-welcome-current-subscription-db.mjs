import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(path.join(os.tmpdir(),'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db=new PGlite(); const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const q=(s,a=[])=>db.query(s,a),v=async(s,a=[])=>Object.values((await q(s,a)).rows[0])[0];let checks=0;let inTransaction=false;const begin=async()=>{await db.exec('BEGIN');inTransaction=true};const rollback=async()=>{await db.exec('ROLLBACK');inTransaction=false};
const check=(x,m)=>{assert(x,m);checks++};const reject=async(fn,re)=>{if(inTransaction)await db.exec('SAVEPOINT expected_failure');await assert.rejects(fn,re);if(inTransaction)await db.exec('ROLLBACK TO SAVEPOINT expected_failure');checks++};
const claim=(attempt=50,retry=false,actor=1)=>v('SELECT public.admin_claim_brand_welcome($1,$2,$3,$4)',[id(actor),id(3),id(attempt),retry]);
const finish=(attempt=50,message='provider-receipt')=>q('SELECT public.admin_finish_brand_welcome($1,$2,$3,$4,now())',[id(1),id(3),id(attempt),message]);
try{
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE SCHEMA brand_onboarding_private;
CREATE TABLE profiles(id uuid primary key,role text,status text);CREATE TABLE auth.users(id uuid primary key,phone text,encrypted_password text);
CREATE TABLE cafes(id uuid primary key,status text,deleted_at timestamptz);CREATE TABLE platform_plans(id text primary key,active boolean);
CREATE TABLE subscriptions(id uuid primary key,cafe_id uuid,plan_id text,status text,activation_source text,started_at timestamptz,expires_at timestamptz,duration_unit text,duration_count integer,updated_at timestamptz);
CREATE TABLE brand_onboarding_private.accounts(id uuid primary key,cafe_id uuid,owner_id uuid,subscription_id uuid,state text,draft jsonb,pending_edit jsonb,attempt_started_at timestamptz,attempt_id uuid,password_ciphertext text,owner_password_hash text,password_context uuid,sent_at timestamptz,provider_message_id text,proof text);
CREATE FUNCTION brand_onboarding_private.require_admin(p_actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='platform_admin' AND status='active') THEN RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE='42501';END IF;END$$;
REVOKE ALL ON SCHEMA brand_onboarding_private FROM PUBLIC,anon,authenticated,service_role;REVOKE ALL ON FUNCTION brand_onboarding_private.require_admin(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;`);
await q("INSERT INTO profiles VALUES($1,'platform_admin','active'),($2,'owner','active')",[id(1),id(2)]);
await q("INSERT INTO auth.users VALUES($1,'+966511111111','valid-hash')",[id(2)]);await q("INSERT INTO cafes VALUES($1,'active',NULL)",[id(3)]);
await db.exec("INSERT INTO platform_plans VALUES('trial',true),('loyalty',true)");
await q("INSERT INTO subscriptions(id,cafe_id,plan_id,status,activation_source,started_at,expires_at) VALUES($1,$2,'trial','trialing','admin_prepared_trial',now(),NULL)",[id(4),id(3)]);
await q("INSERT INTO brand_onboarding_private.accounts(id,cafe_id,owner_id,subscription_id,state,draft,password_ciphertext,owner_password_hash,proof) VALUES($1,$2,$3,$4,'ready',$5,'ciphertext','valid-hash','proof')",[id(5),id(3),id(2),id(4),{phone:'966511111111',ownerName:'Test Owner',brandName:'Brand',passwordReady:true}]);
await db.exec(await fs.readFile('supabase/migrations/20261101214430_admin_welcome_current_subscription.sql','utf8'));
check(await v("SELECT NOT has_function_privilege('anon','public.admin_claim_brand_welcome(uuid,uuid,uuid,boolean)','EXECUTE')"),'anon denied');
check(await v("SELECT NOT has_function_privilege('authenticated','public.admin_finish_brand_welcome(uuid,uuid,uuid,text,timestamptz)','EXECUTE')"),'authenticated denied');
check(await v("SELECT has_function_privilege('service_role','public.admin_claim_brand_welcome(uuid,uuid,uuid,boolean)','EXECUTE')"),'service granted');
await reject(()=>claim(50,false,2),/ADMIN_REQUIRED/);
await reject(()=>v('SELECT public.admin_claim_brand_welcome($1,$2,NULL,false)',[id(1),id(3)]),/INVALID_SEND_ATTEMPT/);
await begin();let r=await claim();check(r.startsTrial===true,'prepared trial recognized');check(await v("SELECT expires_at IS NULL FROM subscriptions WHERE id=$1",[id(4)]),'claim never starts trial');await reject(()=>claim(51),/SEND_IN_PROGRESS/);await reject(()=>finish(51),/INVALID_SEND_RECEIPT/);await finish();check(await v("SELECT expires_at-started_at=interval '7 days' AND activation_source='admin_whatsapp_trial' FROM subscriptions WHERE id=$1",[id(4)]),'seven day trial begins after receipt');check(await v("SELECT state='sent' AND password_ciphertext IS NULL AND owner_password_hash IS NULL FROM brand_onboarding_private.accounts"),'handoff secret cleared');check((await claim()).sent===true,'sent idempotent');await finish();checks++;await rollback();
await q("UPDATE subscriptions SET status='cancelled' WHERE id=$1",[id(4)]);await reject(()=>claim(),/ACTIVE_SUBSCRIPTION_REQUIRED/);
await q("INSERT INTO subscriptions(id,cafe_id,plan_id,status,activation_source,started_at,expires_at,duration_unit,duration_count) VALUES($1,$2,'loyalty','active','admin_manual_change',now()-interval '1 day',now()+interval '29 days','month',1)",[id(6),id(3)]);
const before=(await q('SELECT * FROM subscriptions ORDER BY id')).rows;
await begin();r=await claim();check(r.startsTrial===false,'changed current plan recognized');await finish();assert.deepEqual((await q('SELECT * FROM subscriptions ORDER BY id')).rows,before);checks++;check(await v("SELECT status='cancelled' FROM subscriptions WHERE id=$1",[id(4)]),'cancelled trial not revived');await rollback();
for(const change of ["UPDATE platform_plans SET active=false WHERE id='loyalty'","UPDATE subscriptions SET expires_at=now()-interval '1 day' WHERE id='"+id(6)+"'","UPDATE subscriptions SET started_at=now()+interval '1 day' WHERE id='"+id(6)+"'"]){await begin();await db.exec(change);await reject(()=>claim(),/ACTIVE_SUBSCRIPTION_REQUIRED/);await rollback();}
for(const [change,error] of [["UPDATE auth.users SET phone='+966522222222'",/OWNER_PHONE_CHANGED/],["UPDATE auth.users SET encrypted_password='changed'",/OWNER_PASSWORD_CHANGED/],["UPDATE brand_onboarding_private.accounts SET password_ciphertext=NULL",/OWNER_PASSWORD_CHANGED/],["UPDATE brand_onboarding_private.accounts SET pending_edit='{}'",/OWNER_EDIT_PENDING/],["UPDATE cafes SET status='suspended'",/BRAND_UNAVAILABLE/]]){await begin();await db.exec(change);await reject(()=>claim(),error);await rollback();}
await begin();await db.exec("UPDATE brand_onboarding_private.accounts SET state='uncertain'");await reject(()=>claim(),/SEND_UNCERTAIN/);check((await claim(52,true)).startsTrial===false,'uncertain retry explicitly allowed without changing plan');await rollback();
await begin();await db.exec("UPDATE brand_onboarding_private.accounts SET state='sending',attempt_started_at=now()-interval '3 minutes'");await reject(()=>claim(),/SEND_UNCERTAIN/);await claim(52,true);checks++;await rollback();
await begin();await claim();await q("UPDATE subscriptions SET status='cancelled' WHERE id=$1",[id(6)]);await q("UPDATE subscriptions SET status='trialing' WHERE id=$1",[id(4)]);await finish();check(await v("SELECT expires_at IS NULL AND activation_source='admin_prepared_trial' FROM subscriptions WHERE id=$1",[id(4)]),'active-mode attempt cannot start old trial after another change');await rollback();
await begin();await q("UPDATE subscriptions SET status='cancelled' WHERE id=$1",[id(6)]);await q("UPDATE subscriptions SET status='trialing' WHERE id=$1",[id(4)]);await claim();await q("UPDATE subscriptions SET status='active' WHERE id=$1",[id(6)]);await finish();check(await v("SELECT expires_at IS NULL FROM subscriptions WHERE id=$1",[id(4)]),'active package added during send prevents trial reset');await rollback();
await begin();await claim();await reject(()=>finish(50,''),/INVALID_SEND_RECEIPT/);await reject(()=>q("SELECT public.admin_finish_brand_welcome($1,$2,$3,'receipt',now()+interval '10 minutes')",[id(1),id(3),id(50)]),/INVALID_SEND_RECEIPT/);await rollback();
await begin();await q("UPDATE subscriptions SET status='trialing',activation_source='owner_authorized_trial' WHERE id=$1",[id(6)]);const trialBefore=(await q('SELECT * FROM subscriptions ORDER BY id')).rows;check((await claim()).startsTrial===false,'current non-prepared trial supports credential-only handoff');await finish();assert.deepEqual((await q('SELECT * FROM subscriptions ORDER BY id')).rows,trialBefore);checks++;await rollback();
console.log(`Admin welcome current subscription: ${checks} SQL/security/state checks passed`);
}finally{await db.close()}
