import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE ?? path.join(tmpdir(),'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db=new PGlite();let checks=0;
const [cashier,other,owner,admin,a,b]=Array.from({length:6},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
const rows=async()=> (await db.query('SELECT * FROM public.brand_finance_sales_cashier_destinations()')).rows;
const login=async id=>db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);
const check=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
try {
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth;CREATE SCHEMA platform_access_private;CREATE SCHEMA brand_finance_private;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);
 CREATE TABLE profiles(id uuid PRIMARY KEY,status text DEFAULT 'active',role text DEFAULT 'customer');
 CREATE TABLE cafes(id uuid PRIMARY KEY,slug text,name text,owner_user_id uuid,status text DEFAULT 'active',deleted_at timestamptz,enabled boolean DEFAULT true);
 CREATE TABLE bf_staff(cafe_id uuid,user_id uuid,role text,active boolean DEFAULT true,PRIMARY KEY(cafe_id,user_id));
 ALTER TABLE bf_staff ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON bf_staff FROM PUBLIC,anon,authenticated,service_role;
 CREATE FUNCTION platform_access_private.service_enabled(c uuid,f text) RETURNS boolean LANGUAGE sql AS $$SELECT enabled AND f='finance' FROM public.cafes WHERE id=c$$;
 INSERT INTO auth.users(id) VALUES('${cashier}'),('${other}'),('${owner}'),('${admin}');
 INSERT INTO profiles(id) SELECT id FROM auth.users;
 UPDATE profiles SET role='platform_admin' WHERE id='${admin}';
 INSERT INTO cafes(id,slug,name,owner_user_id) VALUES('${a}','brand-a','A','${owner}'),('${b}','brand-b','B','${owner}');
 INSERT INTO bf_staff VALUES('${a}','${cashier}','cashier'),('${b}','${other}','cashier');`);
 for(const file of ['20261023204056_brand_finance_platform_admin_access.sql','20261024092034_finance_sales_cashier_destinations.sql'])await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'));
 await login(cashier);await db.exec('SET ROLE authenticated');check((await rows()).map(r=>r.slug),['brand-a']);
 await assert.rejects(()=>db.query('SELECT * FROM bf_staff'),/permission denied/);checks++;
 await login(other);check((await rows()).map(r=>r.slug),['brand-b']);
 for(const actor of [owner,admin]){await login(actor);check(await rows(),[]);}
 await login('');await assert.rejects(rows,/authentication required/);checks++;
 for(const role of ['anon','service_role']){await db.exec(`RESET ROLE;SET ROLE ${role}`);await assert.rejects(rows,/permission denied/);checks++;}
 await db.exec('RESET ROLE');await login(cashier);
 await db.query("INSERT INTO bf_staff VALUES($1,$2,'cashier')",[b,cashier]);
 await db.exec('SET ROLE authenticated');check((await rows()).map(r=>r.slug),['brand-a','brand-b']);await db.exec('RESET ROLE');
 for(const [field,value,reset] of [['enabled',false,true],['status','blocked','active'],['deleted_at','2026-01-01',null]]){
  await db.query(`UPDATE cafes SET ${field}=$1 WHERE id=$2`,[value,a]);
  await db.exec('SET ROLE authenticated');check((await rows()).map(r=>r.slug),['brand-b']);await db.exec('RESET ROLE');
  await db.query(`UPDATE cafes SET ${field}=$1 WHERE id=$2`,[reset,a]);
 }
 await db.query('UPDATE bf_staff SET active=false WHERE user_id=$1',[cashier]);await db.exec('SET ROLE authenticated');check(await rows(),[]);await db.exec('RESET ROLE');
 await db.query("UPDATE bf_staff SET active=true,role='manager' WHERE user_id=$1",[cashier]);await db.exec('SET ROLE authenticated');check(await rows(),[]);await db.exec('RESET ROLE');
 await db.query("UPDATE bf_staff SET role='cashier' WHERE user_id=$1",[cashier]);
 await db.query("UPDATE profiles SET status='blocked' WHERE id=$1",[cashier]);await db.exec('SET ROLE authenticated');check(await rows(),[]);await db.exec('RESET ROLE');
 await db.query("UPDATE profiles SET status='active' WHERE id=$1",[cashier]);
 for(const field of ['deleted_at','banned_until']){
  await db.query(`UPDATE auth.users SET ${field}='2099-01-01' WHERE id=$1`,[cashier]);await db.exec('SET ROLE authenticated');await assert.rejects(rows,/authentication required/);checks++;await db.exec('RESET ROLE');
  await db.query(`UPDATE auth.users SET ${field}=NULL WHERE id=$1`,[cashier]);
 }
 for(const actor of [owner,admin]){
  await db.query("INSERT INTO bf_staff VALUES($1,$2,'cashier')",[a,actor]);await login(actor);await db.exec('SET ROLE authenticated');check(await rows(),[]);await db.exec('RESET ROLE');
 }
 await db.exec('SET ROLE service_role');await assert.rejects(()=>db.query('SELECT * FROM bf_staff'),/permission denied/);checks++;
 console.log(`PASS ${checks} sales destination DB checks: actor isolation, roles, subscription, revocation, disabled identity and direct-table denial`);
} finally {await db.close();}
