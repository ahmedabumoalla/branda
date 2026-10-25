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
 await db.query('DELETE FROM auth.users WHERE id=$1',[missing]);
 await db.exec("ALTER TABLE cafes ADD COLUMN is_public boolean DEFAULT false;ALTER TABLE cafes ADD COLUMN loyalty_enabled boolean DEFAULT false;CREATE TABLE cafe_loyalty_programs(cafe_id uuid,enabled boolean);CREATE OR REPLACE FUNCTION platform_access_private.service_enabled(c uuid,f text) RETURNS boolean LANGUAGE sql AS $$SELECT CASE WHEN f='finance' THEN enabled WHEN f='loyalty' THEN loyalty_enabled ELSE false END FROM public.cafes WHERE id=c$$");
 const legacy=await readFile('supabase/migrations/075_supabase_phone_auth_rate_limits_and_linking.sql','utf8');
 await db.exec(legacy.slice(0,legacy.indexOf('CREATE OR REPLACE FUNCTION public.link_customer_after_supabase_phone_otp'))+'COMMIT;');
 await db.exec("ALTER TABLE customer_phone_otp_requests ADD COLUMN provider_dispatched_at timestamptz;REVOKE ALL ON FUNCTION public.begin_customer_phone_otp_request(uuid,text,text,text,integer,integer,integer,integer),public.complete_customer_phone_otp_request(uuid,boolean) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.begin_customer_phone_otp_request(uuid,text,text,text,integer,integer,integer,integer),public.complete_customer_phone_otp_request(uuid,boolean) TO service_role");
 await db.exec(await readFile('supabase/migrations/20261024083527_brand_finance_sales_cashier_otp_admission.sql','utf8'));
 const ip='a'.repeat(64),provider='isolated-provider';
 const begin=async(p=phone,i=ip,limit=20)=>(await db.query('SELECT * FROM public.begin_finance_sales_cashier_otp_request($1,$2,$3,$4)',[p,provider,i,limit])).rows[0];
 const claim=(p=phone,instance=provider)=>scalar('SELECT public.claim_customer_phone_otp_dispatch($1,$2)',[p,instance]);
 const complete=(id,accepted)=>db.query('SELECT public.complete_finance_sales_cashier_otp_request($1,$2)',[id,accepted]);
 const clear=()=>db.query('DELETE FROM customer_phone_otp_requests');
 const seed=async({n=1,p=phone,i=ip,age='10 minutes',purpose='finance_cashier_login',status='accepted',instance=provider,cafe=tenant}={})=>db.query("INSERT INTO customer_phone_otp_requests(cafe_id,phone_normalized,purpose,provider_instance,finance_ip_hash,created_at,status) SELECT $1,$2,$3,$4,$5,now()-$6::interval,$7 FROM generate_series(1,$8::int)",[cafe,p,purpose,instance,purpose==='finance_cashier_login'?i:null,age,status,n]);
 for(const role of ['anon','authenticated']) {
  await db.exec(`SET ROLE ${role}`);await fail(begin,'untrusted roles cannot admit finance OTP');await fail(claim,'untrusted roles cannot claim OTP');await fail(()=>complete(target,true),'untrusted roles cannot complete OTP');await fail(()=>db.query('SELECT * FROM customer_phone_otp_requests'),'untrusted roles cannot read requests');await db.exec('RESET ROLE');
 }
 for(const args of [['123',ip,20],[phone,'raw-ip',20],[phone,ip,0],['966599999999',ip,20]])equal((await begin(...args)).result,'unavailable','invalid identity/admission data denied');
 await db.exec('SET ROLE service_role');const first=await begin();equal(first.result,'created','finance-only private brand admitted');equal(first.retry_after_seconds,60,'phone cooldown returned');
 equal(await claim(phone,'wrong-provider'),null,'provider identity must match');equal(await claim(),'brand-a','published hook receives finance cafe slug without loyalty');equal(await claim(),null,'claim is single-use');await complete(first.request_id,true);await db.exec('RESET ROLE');
 equal(await scalar('SELECT status FROM customer_phone_otp_requests WHERE id=$1',[first.request_id]),'accepted','accepted request completed');
 equal((await begin()).result,'cooldown','phone cooldown across requests');
 await complete(first.request_id,false);equal(await scalar('SELECT status FROM customer_phone_otp_requests WHERE id=$1',[first.request_id]),'accepted','completion replay cannot change terminal state');
 await clear();const uncertain=await begin();await claim();await complete(uncertain.request_id,false);equal(await scalar('SELECT status FROM customer_phone_otp_requests WHERE id=$1',[uncertain.request_id]),'accepted','dispatched uncertainty retains global quota');
 await clear();const failed=await begin();await complete(failed.request_id,false);equal(await scalar('SELECT status FROM customer_phone_otp_requests WHERE id=$1',[failed.request_id]),'failed','pre-dispatch failure recorded');equal((await begin()).result,'cooldown','failed attempt still consumes phone cooldown');
 await clear();await seed({n:3,status:'failed'});equal((await begin()).result,'hourly_limit','failed phone attempts count hourly');
 await clear();await seed({n:5,status:'failed',age:'2 hours'});equal((await begin()).result,'daily_limit','failed phone attempts count daily');
 await clear();await seed({p:'966500000001',age:'1 second',status:'failed'});equal((await begin()).result,'cooldown','IP cooldown covers another phone');
 await clear();await seed({n:20,p:'966500000001',status:'failed'});equal((await begin()).result,'hourly_limit','IP hourly attempts include failure');
 await clear();await seed({n:50,p:'966500000001',age:'2 hours',status:'failed'});equal((await begin()).result,'daily_limit','IP daily attempts include failure');
 await clear();await seed({p:'966500000001',purpose:'customer_login'});equal((await begin(phone,ip,1)).result,'global_limit','customer request consumes shared provider new-chat quota');
 await clear();await seed({p:phone,purpose:'customer_login'});equal((await begin(phone,ip,1)).result,'created','existing phone does not consume a new unique chat');
 await clear();await seed({p:'966500000001'});
 const customerBegin=(p=phone)=>db.query('SELECT * FROM public.begin_customer_phone_otp_request($1,$2,$3,$4,60,3,5,1)',[tenant,p,'customer_login',provider]);
 equal((await customerBegin()).rows[0].result,'global_limit','finance request consumes customer provider global quota');
 await clear();await seed({p:phone,age:'1 second',n:3});equal((await customerBegin()).rows[0].result,'created','finance requests do not change customer per-phone cooldown or hourly quota');
 await clear();await seed({p:phone,age:'1 second',purpose:'customer_login',n:3});equal((await begin()).result,'created','customer requests do not change finance phone/IP quotas');
 await clear();await seed({age:'3 minutes',status:'pending'});equal(await claim(),null,'expired admission rejected');
 for(const [table,field,value,reset] of [['profiles','status','blocked','active'],['auth.users','banned_until','2099-01-01',null],['auth.users','deleted_at','2026-01-01',null],['auth.users','phone_confirmed_at',null,initialUser.phone_confirmed_at]]) {
  await clear();await begin();await db.query(`UPDATE ${table} SET ${field}=$1 WHERE id=$2`,[value,target]);equal(await claim(),null,'live revoked identity cannot dispatch');await db.query(`UPDATE ${table} SET ${field}=$1 WHERE id=$2`,[reset,target]);
 }
 await clear();await begin();await db.query('UPDATE bf_staff SET active=false WHERE user_id=$1 AND cafe_id=$2',[target,tenant]);equal(await claim(),null,'revoked selected membership cannot use another active brand');await db.query('UPDATE bf_staff SET active=true WHERE user_id=$1',[target]);
 await clear();await begin();await db.query('UPDATE cafes SET enabled=false WHERE id=$1',[tenant]);equal(await claim(),null,'selected brand expired finance prevents dispatch');await db.query('UPDATE cafes SET enabled=true WHERE id=$1',[tenant]);
 await clear();await seed({purpose:'customer_login',status:'pending',age:'1 second'});equal(await claim(),null,'customer branch still needs public active loyalty');
 await db.query('UPDATE cafes SET is_public=true,loyalty_enabled=true WHERE id=$1',[tenant]);await db.query('INSERT INTO cafe_loyalty_programs VALUES($1,true)',[tenant]);equal(await claim(),'brand-a','legacy customer dispatch remains functional');equal(await claim(),null,'customer claim remains single-use');
 await clear();await seed({purpose:'customer_signup',status:'pending',age:'1 second'});await db.query('UPDATE cafe_loyalty_programs SET enabled=false');equal(await claim(),null,'disabled loyalty program still prevents customer dispatch');
 await clear();await fail(()=>db.query("INSERT INTO customer_phone_otp_requests(cafe_id,phone_normalized,purpose,provider_instance) VALUES($1,$2,'finance_cashier_login',$3)",[tenant,phone,provider]),'finance purpose requires admission IP hash');
 equal(await scalar('SELECT to_jsonb(u) FROM auth.users u WHERE id=$1',[target]),initialUser,'OTP admission never changes account password or metadata');
 console.log(`PASS sales cashier OTP SQL: ${checks} assertions`);
} finally {await db.close();}
