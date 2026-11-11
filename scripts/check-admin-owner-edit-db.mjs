import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE ?? path.join(tmpdir(), 'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href);

const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA brand_onboarding_private; CREATE SCHEMA platform_access_private;
CREATE TABLE auth.users(id uuid PRIMARY KEY,phone text,email text,encrypted_password text,raw_app_meta_data jsonb DEFAULT '{}');
CREATE TABLE profiles(id uuid PRIMARY KEY,role text,status text,full_name text,phone text,email text);
CREATE TABLE cafes(id uuid PRIMARY KEY,owner_user_id uuid,status text,deleted_at timestamptz,settings_enabled boolean DEFAULT false);
CREATE TABLE cafe_settings(cafe_id uuid PRIMARY KEY,owner_name text,owner_phone text,owner_email text,logo_url text,updated_at timestamptz DEFAULT now());
CREATE TABLE brand_onboarding_private.accounts(id uuid PRIMARY KEY,cafe_id uuid,owner_id uuid,created_by uuid,state text,draft jsonb,password_ciphertext text,owner_password_hash text);
CREATE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id::text=current_setting('request.jwt.claim.sub',true) AND role='platform_admin' AND status='active') $$;
CREATE FUNCTION platform_access_private.service_enabled(cafe uuid,feature text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce((SELECT settings_enabled FROM public.cafes WHERE id=cafe),false) $$;
CREATE FUNCTION brand_onboarding_private.require_admin(actor uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND role='platform_admin' AND status='active') THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF; END $$;
`);
const boundaries = await readFile('supabase/migrations/20261009193000_package_service_boundaries.sql', 'utf8');
const guard = boundaries.slice(boundaries.indexOf('CREATE FUNCTION platform_access_private.guard_service_write()'), boundaries.indexOf('DO $$', boundaries.indexOf('CREATE FUNCTION platform_access_private.guard_service_write()')));
await db.exec(guard);
await db.exec(`CREATE TRIGGER package_settings_write BEFORE UPDATE ON cafe_settings FOR EACH ROW EXECUTE FUNCTION platform_access_private.guard_service_write('settings');`);
const drafts = await readFile('supabase/migrations/20261013232802_admin_brand_drafts.sql', 'utf8');
await db.exec(drafts.slice(0, drafts.indexOf('CREATE OR REPLACE FUNCTION public.admin_prepare_brand_account')));
const beforeGuard = (await db.query(`SELECT pg_get_functiondef('platform_access_private.guard_service_write()'::regprocedure) AS body`)).rows[0].body;
await db.exec(await readFile('supabase/migrations/20261111154614_admin_owner_contact_pre_delivery.sql', 'utf8'));
await db.exec(`CREATE FUNCTION public.test_owner_settings_tamper() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_setting('test.owner_tamper',true)='yes' THEN NEW.logo_url:='tampered'; END IF; RETURN NEW; END $$;
CREATE TRIGGER aaa_test_owner_tamper BEFORE UPDATE ON cafe_settings FOR EACH ROW EXECUTE FUNCTION public.test_owner_settings_tamper();`);
assert.equal((await db.query(`SELECT pg_get_functiondef('platform_access_private.guard_service_write()'::regprocedure) AS body`)).rows[0].body, beforeGuard);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const admin=id(1), owner=id(2), cafe=id(3), account=id(4), edit=id(5);
const phone='966511111111', nextPhone='966522222222';
const query = (sql, args=[]) => db.query(sql,args);
let checks=0;
async function fixture(test) {
 await db.exec('BEGIN');
 try {
  await query(`INSERT INTO profiles VALUES($1,'platform_admin','active','Admin',NULL,NULL),($2,'cafe_owner','active','Owner',$3,NULL)`,[admin,owner,phone]);
  await query(`INSERT INTO auth.users(id,phone,encrypted_password) VALUES($1,$2,'retained-hash')`,[owner,phone]);
  await query(`INSERT INTO cafes(id,owner_user_id,status) VALUES($1,$2,'active')`,[cafe,owner]);
  await query(`INSERT INTO cafe_settings(cafe_id,owner_name,owner_phone,owner_email,logo_url) VALUES($1,'Owner',$2,'','unchanged-logo')`,[cafe,phone]);
  await query(`INSERT INTO brand_onboarding_private.accounts(id,cafe_id,owner_id,created_by,state,draft,password_ciphertext,owner_password_hash) VALUES($1,$2,$3,$4,'ready',$5,'retained-cipher','retained-hash')`,[account,cafe,owner,admin,{ownerName:'Owner',phone,email:'',passwordReady:true,planId:'retained-plan'}]);
  await test();checks++;
 } finally {await db.exec('ROLLBACK');}
}
async function stage() {
 return (await query(`SELECT public.admin_prepare_brand_owner_edit($1,$2,$3,$4,$5,NULL) AS result`,[admin,cafe,edit,{ownerName:'Updated Owner',phone:nextPhone,email:''},'a'.repeat(64)])).rows[0].result;
}
async function complete(staged, overrides={}) {
 await query(`UPDATE auth.users SET phone=$2 WHERE id=$1`,[owner,overrides.phone??nextPhone]);
 await query(`UPDATE auth.users SET raw_app_meta_data=$2 WHERE id=$1`,[owner,{admin_brand_edit_id:edit,admin_brand_edit_proof:overrides.proof??staged.proof,admin_brand_edit_attempt:id(6)}]);
}
async function denied(action, pattern) {await assert.rejects(action,pattern);}
await fixture(async()=>{
 const staged=await stage();await complete(staged);
 const row=(await query(`SELECT s.*,a.state,a.pending_edit,a.last_edit_id,a.password_ciphertext,a.owner_password_hash,a.draft FROM cafe_settings s JOIN brand_onboarding_private.accounts a USING(cafe_id)`)).rows[0];
 assert.equal(row.owner_phone,nextPhone);assert.equal(row.owner_name,'Updated Owner');assert.equal(row.logo_url,'unchanged-logo');
 assert.equal(row.state,'ready');assert.equal(row.pending_edit,null);assert.equal(row.last_edit_id,edit);
 assert.equal(row.password_ciphertext,'retained-cipher');assert.equal(row.owner_password_hash,'retained-hash');assert.equal(row.draft.planId,'retained-plan');
 assert.equal((await stage()).done,true,'retry must not create a second edit');
});
await fixture(async()=>denied(()=>query(`UPDATE cafe_settings SET owner_phone=$2 WHERE cafe_id=$1`,[cafe,nextPhone]),/Service unavailable/));
await fixture(async()=>{const s=await stage();await denied(()=>complete(s,{proof:'forged'}),/OWNER_EDIT_PROOF_REQUIRED/);});
await fixture(async()=>{const s=await stage();await denied(()=>complete(s,{phone}),/OWNER_PHONE_CHANGED/);});
await fixture(async()=>{const s=await stage();await query(`UPDATE profiles SET status='disabled' WHERE id=$1`,[admin]);await denied(()=>complete(s),/ADMIN_REQUIRED/);});
await fixture(async()=>{await query(`UPDATE brand_onboarding_private.accounts SET state='sent'`);await denied(stage,/OWNER_EDIT_NOT_ALLOWED/);});
await fixture(async()=>{await query(`INSERT INTO profiles VALUES($1,'cafe_owner','active','Other',$2,NULL)`,[id(7),nextPhone]);await denied(stage,/PHONE_EXISTS/);});
await fixture(async()=>{await stage();await denied(()=>query(`UPDATE cafe_settings SET logo_url='tampered',owner_phone=$2 WHERE cafe_id=$1`,[cafe,nextPhone]),/Service unavailable/);});
await fixture(async()=>{const s=await stage();await query(`SELECT set_config('test.owner_tamper','yes',true)`);await denied(()=>complete(s),/Service unavailable/);});
await fixture(async()=>{await stage();await denied(()=>query(`UPDATE cafe_settings SET cafe_id=$2 WHERE cafe_id=$1`,[cafe,id(8)]),/tenant cannot change/);});
await fixture(async()=>{await query(`SELECT set_config('request.jwt.claim.sub',$1,true)`,[owner]);await denied(()=>query(`UPDATE cafe_settings SET owner_name='Unstaged'`),/Service unavailable/);});
await fixture(async()=>{await query(`UPDATE cafes SET settings_enabled=true`);await query(`UPDATE cafe_settings SET logo_url='allowed'`);assert.equal((await query('SELECT logo_url FROM cafe_settings')).rows[0].logo_url,'allowed');});
await fixture(async()=>{await query(`SELECT set_config('request.jwt.claim.sub',$1,true)`,[admin]);await query(`UPDATE cafe_settings SET logo_url='admin-maintenance'`);});
await fixture(async()=>{await query(`UPDATE cafes SET status='suspended'`);await denied(stage,/BRAND_UNAVAILABLE/);});
for(const role of ['anon','authenticated','service_role'])assert.equal((await query(`SELECT has_function_privilege($1,'platform_access_private.guard_settings_write()','EXECUTE') AS allowed`,[role])).rows[0].allowed,false);
await db.close();
console.log(`PASS ${checks} owner edit database scenarios, private ACL and unchanged shared service guard`);
