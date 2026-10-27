import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE??path.join(tmpdir(),'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db=new PGlite();let checks=0;
const scalar=async(q,p=[])=>Object.values((await db.query(q,p)).rows[0])[0];
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++};
const fail=async(fn,label)=>{await assert.rejects(fn,label);checks++};
try {
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE SCHEMA brand_finance_private;CREATE SCHEMA platform_access_private;
 CREATE TABLE test_access(cafe_id uuid,user_id uuid,role text,active boolean default true);
 CREATE FUNCTION brand_finance_private.role_for(p_cafe uuid) RETURNS text LANGUAGE plpgsql AS $$DECLARE r text;BEGIN SELECT role INTO r FROM test_access WHERE cafe_id=p_cafe AND user_id=auth.uid() AND active;IF r IS NULL THEN RAISE EXCEPTION 'Denied' USING ERRCODE='42501';END IF;RETURN r;END$$;
 CREATE FUNCTION platform_access_private.service_enabled(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
 CREATE TABLE bf_documents(id uuid PRIMARY KEY,cafe_id uuid,kind text,created_by uuid,customer_phone text,created_at timestamptz default now());
 CREATE TABLE bf_sale_customers(document_id uuid PRIMARY KEY,cafe_id uuid,phone text);
 CREATE TABLE bf_customer_message_jobs(id uuid PRIMARY KEY,cafe_id uuid,document_id uuid UNIQUE,state text,provider_message_id text,error_code text,created_at timestamptz default now(),finished_at timestamptz);
 REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC,anon,authenticated,service_role;`);
 await db.exec(await readFile('supabase/migrations/20261027110759_finance_invoice_message_status.sql','utf8'));
 const cafe=crypto.randomUUID(),foreign=crypto.randomUUID(),owner=crypto.randomUUID(),cashier=crypto.randomUUID(),other=crypto.randomUUID();
 await db.query("INSERT INTO test_access(cafe_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'cashier'),($4,$5,'owner')",[cafe,owner,cashier,foreign,other]);
 const login=user=>db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user??'']);
 const ids=[];const jobs=[];
 for(let i=0;i<12;i++){const document=crypto.randomUUID(),job=crypto.randomUUID();ids.push(document);jobs.push(job);await db.query("INSERT INTO bf_documents(id,cafe_id,kind,created_by,customer_phone) VALUES($1,$2,'sale',$3,'966500000010')",[document,i===11?foreign:cafe,i===10?owner:cashier]);await db.query("INSERT INTO bf_sale_customers(document_id,cafe_id,phone) SELECT id,cafe_id,customer_phone FROM bf_documents WHERE id=$1",[document]);await db.query("INSERT INTO bf_customer_message_jobs(id,cafe_id,document_id,state,provider_message_id) SELECT $2,cafe_id,id,'queued',$3 FROM bf_documents WHERE id=$1",[document,job,'provider-'+i]);}
 const statuses=(requested=ids)=>scalar('SELECT brand_finance_invoice_message_statuses($1,$2)',[cafe,requested]);
 const claim=(requested=ids)=>scalar('SELECT brand_finance_claim_message_status_checks($1,$2)',[cafe,requested]);
 const finish=(job,status,token=job.pollToken)=>db.query('SELECT brand_finance_finish_message_status_check($1,$2,$3)',[job.id,token,status]);
 await login(owner);eq((await statuses()).length,11,'foreign invoice excluded from mixed IDs');
 await login(cashier);eq((await statuses()).length,10,'cashier sees only own sales');
 await login(other);await fail(()=>statuses(),'foreign owner denied');await login(null);await fail(()=>statuses(),'anonymous auth denied');await login(owner);
 await fail(()=>statuses(null),'null array denied');await fail(()=>statuses([null]),'null ID denied');await fail(()=>statuses(Array(101).fill(ids[0])),'batch cap');eq(await statuses([]),[],'empty batch supported');
 for(const role of ['manager','accountant','auditor','warehouse']){await db.query('UPDATE test_access SET role=$1 WHERE user_id=$2',[role,owner]);if(role==='warehouse')await fail(()=>statuses(),'warehouse denied');else eq((await statuses()).length,11,role+' can read status without payload');}
 await db.query("UPDATE test_access SET role='owner' WHERE user_id=$1",[owner]);
 for(const role of ['anon','authenticated']){eq(await scalar("SELECT has_function_privilege($1,'public.brand_finance_claim_message_status_checks(uuid,uuid[])','EXECUTE')",[role]),false,'poll service-only');eq(await scalar("SELECT has_function_privilege($1,'public.brand_finance_finish_message_status_check(uuid,uuid,text)','EXECUTE')",[role]),false,'finish service-only');}
 eq(await scalar("SELECT has_function_privilege('anon','public.brand_finance_invoice_message_statuses(uuid,uuid[])','EXECUTE')"),false,'anonymous read grant denied');
 const first=await claim();eq(first.length,8,'provider query cap8');const second=await claim();eq(second.length,3,'fair next batch gets remaining rows');eq(await claim(),[],'60second lease prevents duplicate provider requests');
 const sample=first[0],doc=await scalar('SELECT document_id FROM bf_customer_message_jobs WHERE id=$1',[sample.id]);
 await finish(sample,'delivered',crypto.randomUUID());eq((await statuses([doc]))[0].status,'queued','stale token cannot confirm delivery');
 await finish(sample,'sent');eq((await statuses([doc]))[0].status,'sent','provider sent differs from delivered');
 const retry=async()=>{await db.query("UPDATE bf_customer_message_jobs SET provider_checked_at=now()-interval '61 seconds' WHERE id=$1",[sample.id]);return (await claim([doc]))[0];};
 await finish(await retry(),'pending');eq((await statuses([doc]))[0].status,'sent','pending cannot downgrade sent');
 await finish(await retry(),'delivered');eq((await statuses([doc]))[0].status,'delivered','delivery requires provider confirmation');
 await finish(await retry(),null);eq((await statuses([doc]))[0].status,'delivered','network failure retains confirmed delivery');
 await finish(await retry(),'failed');eq((await statuses([doc]))[0].status,'delivered','late failed cannot erase delivery');
 await finish(await retry(),'read');eq((await statuses([doc]))[0].status,'read','read confirmation');eq(await retry(),undefined,'read is terminal no polling');
 const candidate=second[0];await finish(candidate,'failed');const failedDoc=await scalar('SELECT document_id FROM bf_customer_message_jobs WHERE id=$1',[candidate.id]);eq((await statuses([failedDoc]))[0].reason,'provider_failed','safe failure reason');
 await db.query("UPDATE bf_customer_message_jobs SET state='unknown',provider_message_id=NULL,error_code='customer_message_unknown',provider_status=NULL WHERE id=$1",[jobs[1]]);eq((await statuses([ids[1]]))[0].status,'review','ambiguous dispatch never called failed or sent');
 await db.query("UPDATE bf_customer_message_jobs SET state='pending',provider_status=NULL WHERE id=$1",[jobs[2]]);eq((await statuses([ids[2]]))[0].status,'queued','pending dispatch queued');
 await db.query("UPDATE bf_customer_message_jobs SET state='dispatching' WHERE id=$1",[jobs[2]]);eq((await statuses([ids[2]]))[0].status,'sending','in-flight dispatch');
 await db.query("UPDATE bf_customer_message_jobs SET state='rejected' WHERE id=$1",[jobs[2]]);eq((await statuses([ids[2]]))[0].status,'failed','definitive provider rejection');
 await db.query("UPDATE bf_customer_message_jobs SET state='cancelled' WHERE id=$1",[jobs[2]]);eq((await statuses([ids[2]]))[0].status,'cancelled','cancelled dispatch');
 await db.query('DELETE FROM bf_customer_message_jobs WHERE id=$1',[jobs[3]]);await db.query('UPDATE bf_documents SET customer_phone=NULL WHERE id=$1',[ids[3]]);eq((await statuses([ids[3]]))[0].reason,'no_phone','no phone distinction');
 const publicJson=JSON.stringify(await statuses());for(const secret of ['966500000010','provider-','pollToken','messageId'])eq(publicJson.includes(secret),false,'no private metadata '+secret);
 await db.exec('SET ROLE authenticated');await fail(()=>db.query('SELECT * FROM bf_customer_message_jobs'),'table remains private');await db.exec('RESET ROLE');
 console.log(JSON.stringify({ok:true,checks,engine:'PGlite',scope:'delivery status permissions, cache leases, monotonic confirmations and privacy'}));
}finally{await db.close();}
