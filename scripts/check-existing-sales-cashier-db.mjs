import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE ?? path.join(tmpdir(),'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db=new PGlite();let checks=0;
const ids=Array.from({length:9},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
const [owner,manager,cashier,administrator,tenant,other,target,otherOwner,missing]=ids;
const phone='966500000000';
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const login=async(id)=>db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);
const link=(cafe=tenant,p=phone,name='Sales Cashier')=>scalar('SELECT public.brand_finance_link_sales_cashier($1,$2,$3)',[cafe,p,name]);
const eligible=(p=phone)=>scalar('SELECT public.brand_finance_sales_cashier_phone_enabled($1)',[p]);
const equal=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const fail=async(fn,label)=>{await assert.rejects(fn,label);checks++;};
try {
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth;CREATE SCHEMA platform_access_private;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,phone text,phone_confirmed_at timestamptz,raw_app_meta_data jsonb DEFAULT '{}',raw_user_meta_data jsonb DEFAULT '{}',encrypted_password text,deleted_at timestamptz,banned_until timestamptz);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE TABLE profiles(id uuid PRIMARY KEY,status text DEFAULT 'active',role text DEFAULT 'customer');
 CREATE TABLE cafes(id uuid PRIMARY KEY,slug text,name text,owner_user_id uuid,status text DEFAULT 'active',deleted_at timestamptz,enabled boolean DEFAULT true);
 CREATE TABLE cafe_members(cafe_id uuid,user_id uuid,role text);
 CREATE TABLE loyalty_fixture(user_id uuid,points int,card text);
 CREATE TABLE menu_categories(id uuid PRIMARY KEY,cafe_id uuid,name text);
 CREATE TABLE menu_products(id uuid PRIMARY KEY,cafe_id uuid,name text,price numeric,available boolean DEFAULT true,deleted_at timestamptz,category_id uuid,image_url text,image_storage_path text,sort_order integer DEFAULT 0);
 CREATE FUNCTION platform_access_private.service_enabled(c uuid,f text) RETURNS boolean LANGUAGE sql AS $$ SELECT enabled AND f='finance' FROM public.cafes WHERE id=c $$;
 GRANT USAGE ON SCHEMA auth TO anon,authenticated;GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;
 INSERT INTO auth.users(id) VALUES('${owner}'),('${manager}'),('${cashier}'),('${administrator}'),('${target}'),('${otherOwner}');
 INSERT INTO profiles(id) SELECT id FROM auth.users;
 UPDATE profiles SET role='platform_admin' WHERE id='${administrator}';
 INSERT INTO cafes(id,slug,name,owner_user_id) VALUES('${tenant}','brand-a','A','${owner}'),('${other}','brand-b','B','${otherOwner}');
 INSERT INTO loyalty_fixture VALUES('${target}',127,'preserved-card');
 UPDATE auth.users SET phone='+${phone}',phone_confirmed_at=now(),encrypted_password='unchanged-existing-hash',raw_user_meta_data='{"customer_preference":"existing"}' WHERE id='${target}';`);
 for(const file of ['20261023195232_brand_finance_operations.sql','20261023204056_brand_finance_platform_admin_access.sql','20261024082633_brand_finance_existing_sales_cashier.sql']) await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'));
 await db.query("INSERT INTO bf_staff(cafe_id,user_id,name,role) VALUES($1,$2,'Manager','manager'),($1,$3,'Cashier','cashier')",[tenant,manager,cashier]);
 const initialUser=await scalar('SELECT to_jsonb(u) FROM auth.users u WHERE id=$1',[target]);
 const initialProfile=await scalar('SELECT to_jsonb(p) FROM profiles p WHERE id=$1',[target]);
 const initialLoyalty=await scalar('SELECT to_jsonb(l) FROM loyalty_fixture l WHERE user_id=$1',[target]);
 for(const actor of [manager,cashier,administrator,otherOwner,'']){await login(actor);await fail(link,'only actual tenant owner can link');}
 await login(owner);
 for(const cafe of [other,missing])await fail(()=>link(cafe),'cross tenant or absent brand denied');
 for(const p of [null,'0500000000','+966500000000','966500000001','9665%'])await fail(()=>link(tenant,p),'canonical existing phone required');
 for(const name of [null,'','A','X'.repeat(101)])await fail(()=>link(tenant,phone,name),'valid name required');
 equal(await eligible(),false,'customer alone cannot receive sales OTP');
 for(const [field,value,reset] of [['enabled',false,true],['status','blocked','active'],['deleted_at','2026-01-01',null]]) {
  await db.query(`UPDATE cafes SET ${field}=$1 WHERE id=$2`,[value,tenant]);await fail(link,'inactive brand or expired finance denied');
  await db.query(`UPDATE cafes SET ${field}=$1 WHERE id=$2`,[reset,tenant]);
 }
 await db.query("UPDATE profiles SET status='blocked' WHERE id=$1",[owner]);await fail(link,'blocked owner denied');await db.query("UPDATE profiles SET status='active' WHERE id=$1",[owner]);
 for(const [field,value,reset] of [['phone_confirmed_at',null,'2026-01-01'],['banned_until','2099-01-01',null],['deleted_at','2026-01-01',null]]) {
  await db.query(`UPDATE auth.users SET ${field}=$1 WHERE id=$2`,[value,target]);await fail(link,'ineligible auth identity denied');
  await db.query(`UPDATE auth.users SET ${field}=$1 WHERE id=$2`,[reset,target]);
 }
 await db.query('UPDATE auth.users SET phone_confirmed_at=$1 WHERE id=$2',[initialUser.phone_confirmed_at,target]);
 for(const [field,value,reset] of [['role','cafe_owner','customer'],['status','blocked','active']]) {
  await db.query(`UPDATE profiles SET ${field}=$1 WHERE id=$2`,[value,target]);await fail(link,'inactive or privileged customer denied');
  await db.query(`UPDATE profiles SET ${field}=$1 WHERE id=$2`,[reset,target]);
 }
 for(const role of ['anon','service_role']){await db.exec(`SET ROLE ${role}`);await fail(link,'no service or anonymous owner impersonation');await db.exec('RESET ROLE');}
 for(const role of ['anon','authenticated']){await db.exec(`SET ROLE ${role}`);await fail(eligible,'no public eligibility enumeration');await db.exec('RESET ROLE');}
 await db.exec('SET ROLE authenticated');
 equal(await link(),{id:target,changed:true},'owner links customer as cashier');
 equal(await link(tenant,phone,'Attempted Rename'),{id:target,changed:false},'retry returns unchanged without overwrite');
 await fail(()=>db.query("UPDATE public.bf_staff SET role='manager' WHERE user_id=$1",[target]),'direct staff update denied');
 await db.exec('RESET ROLE');
 equal(await scalar('SELECT name FROM bf_staff WHERE user_id=$1',[target]),'Sales Cashier','idempotent retry preserves membership name');
 equal(await scalar('SELECT to_jsonb(u) FROM auth.users u WHERE id=$1',[target]),initialUser,'identity credentials and metadata preserved exactly');
 equal(await scalar('SELECT to_jsonb(p) FROM profiles p WHERE id=$1',[target]),initialProfile,'customer profile preserved exactly');
 equal(await scalar('SELECT to_jsonb(l) FROM loyalty_fixture l WHERE user_id=$1',[target]),initialLoyalty,'loyalty preserved exactly');
 equal(await scalar('SELECT count(*)::int FROM cafe_members'),0,'no dashboard memberships granted');
 await db.exec('SET ROLE service_role');equal(await eligible(),true,'service-only eligibility true after link');equal(await eligible('+966500000000'),false,'eligibility rejects unnormalized input');await db.exec('RESET ROLE');
 await login(target);equal((await scalar("SELECT public.brand_finance_context('brand-a')")).role,'cashier','POS context authorized');await fail(()=>scalar("SELECT public.brand_finance_context('brand-b')"),'unassigned other brand denied');
 await login(otherOwner);equal((await link(other)).changed,true,'second brand owner can independently assign same customer');
 equal(await scalar('SELECT count(*)::int FROM bf_staff WHERE user_id=$1',[target]),2,'multiple memberships preserved');
 await login(owner);
 await db.query('UPDATE bf_staff SET active=false WHERE user_id=$1 AND cafe_id=$2',[target,tenant]);
 equal((await link()).changed,true,'inactive cashier reactivated');
 await db.query("UPDATE bf_staff SET role='manager' WHERE user_id=$1 AND cafe_id=$2",[target,tenant]);await fail(link,'existing manager cannot be downgraded');
 equal(await scalar('SELECT role FROM bf_staff WHERE user_id=$1 AND cafe_id=$2',[target,tenant]),'manager','manager role preserved');
 await db.query("UPDATE bf_staff SET role='cashier' WHERE user_id=$1 AND cafe_id=$2",[target,tenant]);
 await db.query('UPDATE bf_staff SET active=false WHERE user_id=$1',[target]);equal(await eligible(),false,'all cashier memberships inactive');await db.query('UPDATE bf_staff SET active=true WHERE user_id=$1',[target]);
 await db.query('UPDATE cafes SET enabled=false');equal(await eligible(),false,'all finance subscriptions expired');await db.query('UPDATE cafes SET enabled=true');
 for(const [table,field,value,reset] of [['profiles','status','blocked','active'],['profiles','role','platform_admin','customer'],['auth.users','phone_confirmed_at',null,initialUser.phone_confirmed_at],['auth.users','banned_until','2099-01-01',null],['auth.users','deleted_at','2026-01-01',null]]) {
  await db.query(`UPDATE ${table} SET ${field}=$1 WHERE id=$2`,[value,target]);equal(await eligible(),false,'live OTP eligibility rejects revoked identity');await db.query(`UPDATE ${table} SET ${field}=$1 WHERE id=$2`,[reset,target]);
 }
 await db.query('UPDATE cafes SET deleted_at=now()');equal(await eligible(),false,'deleted brands denied');await db.query('UPDATE cafes SET deleted_at=null');
 await db.query("INSERT INTO auth.users(id,phone) VALUES($1,$2)",[missing,phone]);await fail(link,'ambiguous normalized phone denied');equal(await eligible(),false,'ambiguous normalized phone cannot get OTP');
 console.log(`PASS existing sales cashier SQL: ${checks} assertions`);
} finally {await db.close();}
