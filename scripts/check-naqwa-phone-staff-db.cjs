const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(process.env.PGLITE_MODULE||'C:/Projects/branda-platform/offline-finance/node_modules/@electric-sql/pglite');
const cafe='94b9326e-9fd1-4b15-aa70-008ac4387f4b',id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
(async()=>{const db=new PGlite(),checks=[];const check=(name,value)=>{assert.ok(value,name);checks.push(name);};const actor=async(n,session)=>db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[n?id(n):'',JSON.stringify({sub:n?id(n):'',session_id:session?id(session):undefined})]);const query=async(sql,args=[])=> (await db.query(sql,args)).rows;try{
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE SCHEMA platform_access_private;CREATE SCHEMA brand_finance_private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
CREATE TABLE auth.users(id uuid PRIMARY KEY,phone text,phone_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz,raw_app_meta_data jsonb DEFAULT '{}');
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id));
CREATE TABLE public.profiles(id uuid PRIMARY KEY,status text DEFAULT 'active',role text DEFAULT 'customer');
CREATE TABLE public.cafes(id uuid PRIMARY KEY,slug text,name text,owner_user_id uuid,status text DEFAULT 'active',deleted_at timestamptz,enabled boolean DEFAULT true);
CREATE TABLE public.bf_staff(cafe_id uuid,user_id uuid REFERENCES auth.users(id),name text,role text,active boolean DEFAULT true,PRIMARY KEY(cafe_id,user_id));
ALTER TABLE public.bf_staff ENABLE ROW LEVEL SECURITY;REVOKE ALL ON public.bf_staff FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION platform_access_private.service_enabled(c uuid,f text) RETURNS boolean LANGUAGE sql AS $$SELECT enabled AND f='finance' FROM public.cafes WHERE id=c$$;
CREATE FUNCTION brand_finance_private.invoice_settings_maintenance(c uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
INSERT INTO auth.users(id,phone,phone_confirmed_at) SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'966500000'||lpad(n::text,3,'0'),now() FROM generate_series(1,15)n;
INSERT INTO profiles(id) SELECT id FROM auth.users;
INSERT INTO cafes VALUES('${cafe}','naqwa','Naqwa','${id(1)}','active',null,true),('${id(100)}','other','Other','${id(2)}','active',null,true);
UPDATE auth.users SET raw_app_meta_data='{"finance_staff_provisioned":true,"finance_phone_staff":true,"finance_cafe_id":"${cafe}"}' WHERE id IN('${id(3)}','${id(4)}','${id(5)}','${id(6)}','${id(7)}','${id(10)}');
INSERT INTO auth.sessions(id,user_id) SELECT ('00000000-0000-4000-8000-'||lpad((n+1000)::text,12,'0'))::uuid,('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,15)n;
INSERT INTO bf_staff(cafe_id,user_id,name,role) VALUES('${id(100)}','${id(8)}','Legacy','cashier'),('${cafe}','${id(9)}','Linked customer','cashier');`);
await db.exec(fs.readFileSync(path.resolve('supabase/migrations/20261114103500_naqwa_phone_finance_staff.sql'),'utf8'));
await db.exec(`CREATE FUNCTION public.test_finance_role(p_cafe uuid) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT brand_finance_private.role_for(p_cafe)$$;GRANT EXECUTE ON FUNCTION public.test_finance_role(uuid) TO authenticated;`);
await actor(1,1001);await db.exec('SET ROLE authenticated');
for(const [i,role] of ['manager','accountant','warehouse','auditor','cashier'].entries()){const result=await query('SELECT public.brand_finance_add_phone_staff($1,$2,$3,$4) result',[cafe,id(i+3),'Managed '+role,role]);check('Owner provisions '+role,result[0].result.role===role);}
await assert.rejects(()=>query('SELECT public.brand_finance_add_phone_staff($1,$2,$3,$4)',[cafe,id(10),'Invalid','owner']));checks.push('Owner escalation rejected');
await assert.rejects(()=>query('SELECT public.brand_finance_add_phone_staff($1,$2,$3,$4)',[cafe,id(11),'Customer','cashier']));checks.push('Untrusted existing customer rejected');
await assert.rejects(()=>query('SELECT public.brand_finance_add_phone_staff($1,$2,$3,$4)',[id(100),id(10),'Foreign','cashier']));checks.push('Other cafe cannot use managed provisioning');
await assert.rejects(()=>query('SELECT public.brand_finance_add_phone_staff($1,$2,$3,$4)',[cafe,id(3),'Duplicate','cashier']));checks.push('Duplicate membership not overwritten');
const list=(await query('SELECT public.brand_finance_phone_staff_list($1) result',[cafe]))[0].result;check('Owner list only current tenant',list.length===6&&!list.some(u=>u.userId===id(8)));check('Managed identities allow reset',list.filter(u=>u.canResetPassword).length===5);check('Global linked customer cannot reset',list.find(u=>u.userId===id(9)).canResetPassword===false);
await assert.rejects(()=>query('SELECT public.brand_finance_phone_staff_password_target($1,$2,true)',[cafe,id(9)]));checks.push('Existing customer password target blocked');
await assert.rejects(()=>query('SELECT public.brand_finance_phone_staff_password_target($1,$2,true)',[cafe,id(1)]));checks.push('Owner password cannot be targeted');
for(const [i,role] of ['manager','accountant','warehouse','auditor','cashier'].entries()){await actor(i+3,i+1003);const dest=await query('SELECT * FROM public.brand_finance_phone_staff_destinations()');check(role+' receives correct portal destination',dest.length===1&&dest[0].role===role);}
await actor(8,1008);check('Legacy cashier destination retained',(await query('SELECT * FROM public.brand_finance_phone_staff_destinations()'))[0].slug==='other');
await actor(3,1003);await assert.rejects(()=>query('SELECT public.brand_finance_phone_staff_list($1)',[cafe]));checks.push('Manager cannot read credential administration');
await assert.rejects(()=>query('SELECT public.brand_finance_phone_staff_password_target($1,$2,true)',[cafe,id(4)]));checks.push('Manager cannot revoke or reset colleague');
await actor(1,1001);await query('SELECT public.brand_finance_phone_staff_password_target($1,$2,true)',[cafe,id(3)]);await actor(3,1003);await assert.rejects(()=>query('SELECT public.test_finance_role($1)',[cafe]),/Finance session revoked/);checks.push('Revoked JWT cannot execute finance after session deletion');check('Revoked session has no destination',(await query('SELECT * FROM public.brand_finance_phone_staff_destinations()')).length===0);
await db.exec('RESET ROLE');await db.query('INSERT INTO auth.sessions VALUES($1,$2)',[id(2003),id(3)]);await actor(3,2003);await db.exec('SET ROLE authenticated');check('Fresh authenticated session restores assigned role',(await query('SELECT * FROM public.brand_finance_phone_staff_destinations()'))[0].role==='manager');
await db.exec('RESET ROLE');await db.query('INSERT INTO bf_staff(cafe_id,user_id,name,role) VALUES($1,$2,$3,$4)',[id(100),id(4),'Second role','cashier']);await actor(1,1001);await db.exec('SET ROLE authenticated');await assert.rejects(()=>query('SELECT public.brand_finance_phone_staff_password_target($1,$2,true)',[cafe,id(4)]));checks.push('Multi-brand identity reset blocked');
await actor(2,1002);await assert.rejects(()=>query('SELECT public.brand_finance_phone_staff_list($1)',[cafe]));checks.push('Foreign owner blocked');
await db.exec('RESET ROLE');await db.query("UPDATE bf_staff SET role='accountant' WHERE cafe_id=$1 AND user_id=$2",[cafe,id(9)]);await actor(9,1009);await db.exec('SET ROLE authenticated');check('Existing cashier can enter after owner changes finance role',(await query('SELECT * FROM public.brand_finance_phone_staff_destinations()'))[0].role==='accountant');
for(const role of ['anon','service_role']){await db.exec('RESET ROLE;SET ROLE '+role);await assert.rejects(()=>query('SELECT * FROM public.brand_finance_phone_staff_destinations()'));checks.push(role+' direct RPC denied');}
await db.exec('RESET ROLE;SET ROLE authenticated');await assert.rejects(()=>query('SELECT * FROM public.bf_staff'));checks.push('No direct table access introduced');
console.log(JSON.stringify({pass:true,at:new Date().toISOString(),checks}));
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1});
