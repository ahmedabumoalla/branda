import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(path.join(tmpdir(),'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db=new PGlite();const q=(sql,args=[])=>db.query(sql,args),v=async sql=>Object.values((await q(sql)).rows[0])[0];
const brand='00000000-0000-4000-8000-000000000001';let checks=0;
const check=(ok,message)=>{assert.ok(ok,message);checks++};
try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;
 CREATE TYPE public.subscription_status AS ENUM ('trialing','active','past_due','cancelled','expired','paid');
 CREATE TABLE cafes(id uuid PRIMARY KEY,deleted_at timestamptz);
 CREATE TABLE platform_plans(id text PRIMARY KEY,name text,price_sar numeric,trial_days integer,duration_unit text,duration_count integer,active boolean);
 CREATE TABLE subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid REFERENCES cafes(id),plan_id text REFERENCES platform_plans(id),status public.subscription_status NOT NULL,amount_sar numeric,base_amount_sar numeric,discount_amount_sar numeric,plan_name_snapshot text,duration_unit text,duration_count integer,activation_source text,payment_provider text,payment_method_label text,started_at timestamptz,expires_at timestamptz,cancelled_at timestamptz,updated_at timestamptz);
 CREATE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql AS $$SELECT coalesce(current_setting('app.admin',true),'false')='true'$$;
 INSERT INTO cafes VALUES('${brand}',NULL);
 INSERT INTO platform_plans VALUES('trial','Trial',0,7,'day',15,true),('monthly','Monthly',99,0,'month',3,true),('annual','Annual',999,0,'year',1,true),('inactive','Inactive',0,7,'day',7,false);
 INSERT INTO subscriptions(cafe_id,plan_id,status,started_at,expires_at) VALUES('${brand}','annual','active',now()-interval '1 day',now()+interval '1 year');`);
 const file=(await readdir('supabase/migrations')).find(f=>f.endsWith('_admin_plan_assignment_duration.sql'));
 await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 await assert.rejects(()=>q('SELECT admin_assign_plan_without_payment($1,$2)',[brand,'trial']));checks++;
 await db.exec("SET app.admin='true'");
 await assert.rejects(()=>q('SELECT admin_assign_plan_without_payment($1,$2)',[brand,'trial']),{code:'42804'});checks++;
 check(await v("SELECT count(*)=1 FROM subscriptions WHERE plan_id='annual' AND status='active'"),'original enum mismatch leaves existing subscription unchanged');
 const statusFix=(await readdir('supabase/migrations')).find(f=>f.endsWith('_admin_plan_assignment_status_type.sql'));
 await db.exec(await readFile('supabase/migrations/'+statusFix,'utf8'));
 for(const [plan,unit,count,status]of [['trial','day',7,'trialing'],['monthly','month',3,'active'],['annual','year',1,'active']]){
  await q('SELECT admin_assign_plan_without_payment($1,$2)',[brand,plan]);
  const row=(await q("SELECT *,expires_at-started_at AS delta FROM subscriptions WHERE status IN ('active','trialing')")).rows;
  check(row.length===1,'one active assignment');check(row[0].plan_id===plan&&row[0].duration_unit===unit&&row[0].duration_count===count,'configured duration snapshot');
  check(row[0].status===status&&Number(row[0].amount_sar)===0,'manual assignment status and no fabricated payment');
  check(await v(`SELECT expires_at=started_at+interval '${count} ${unit}' FROM subscriptions WHERE status IN ('active','trialing')`),'expiry from new start, never previous expiry');
 }
 for(const plan of ['inactive','missing']){await assert.rejects(()=>q('SELECT admin_assign_plan_without_payment($1,$2)',[brand,plan]));checks++};
 await db.exec(`CREATE FUNCTION reject_assignment() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'test insert failure';END$$;CREATE TRIGGER reject_assignment BEFORE INSERT ON subscriptions FOR EACH ROW EXECUTE FUNCTION reject_assignment();`);
 await assert.rejects(()=>q('SELECT admin_assign_plan_without_payment($1,$2)',[brand,'trial']));checks++;
 check(await v("SELECT count(*)=1 FROM subscriptions WHERE plan_id='annual' AND status='active'"),'failed insert rolls back cancellation');
 check(!await v("SELECT has_function_privilege('anon','public.admin_assign_plan_without_payment(uuid,text)','EXECUTE')"),'anon grant denied');
 console.log(`PASS admin plan assignment: ${checks} PostgreSQL authorization, exact duration, no carryover, paid/calendar duration and rollback checks`);
}finally{await db.close()}
