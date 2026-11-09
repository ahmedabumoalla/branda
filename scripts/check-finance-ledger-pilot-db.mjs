import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pilotContracts} from './lib/finance-ledger-pilot-cases.mjs';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
const engine=typeof db.connectIndependent==='function'?'Native PostgreSQL':'PGlite';
const results=[];
const owner='00000000-0000-4000-8000-000000000001';
const reviewer='00000000-0000-4000-8000-000000000002';
const outsider='00000000-0000-4000-8000-000000000003';
const cafe='2e08901c-5aac-4bec-8c97-a135058e508b';
const other='00000000-0000-4000-8000-000000000005';
const scalar=async(q,p=[])=>Object.values((await db.query(q,p)).rows[0])[0];
const login=id=>db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id??'']);
const gl=(action,payload,request=crypto.randomUUID(),tenant=cafe)=>scalar('SELECT brand_finance_gl_execute($1,$2,$3,$4)',[tenant,action,payload,request]);
const check=(a,b,label)=>{assert.deepEqual(a,b,label);results.push({label,status:'PASS'});};
const fail=async(fn,pattern,label)=>{await assert.rejects(fn,pattern,label);results.push({label,status:'PASS'});};
const change=(rec,action,extra={})=>gl(action,{id:rec.id,revision:rec.revision,...extra});
try {
  if(db.connectIndependent)await db.exec('SET ROLE postgres');
  await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA platform_access_private;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE TABLE profiles(id uuid PRIMARY KEY,status text DEFAULT 'active',role text DEFAULT 'customer');
CREATE TABLE cafes(id uuid PRIMARY KEY,slug text,name text,owner_user_id uuid,status text DEFAULT 'active',deleted_at timestamptz,enabled boolean DEFAULT true);
CREATE TABLE menu_categories(id uuid PRIMARY KEY,cafe_id uuid,name text);
CREATE TABLE menu_products(id uuid PRIMARY KEY,cafe_id uuid,name text,price numeric,available boolean DEFAULT true,deleted_at timestamptz,category_id uuid,image_url text,image_storage_path text,sort_order integer DEFAULT 0);
CREATE FUNCTION platform_access_private.service_enabled(c uuid,f text) RETURNS boolean LANGUAGE sql AS $$SELECT enabled AND f='finance' FROM public.cafes WHERE id=c$$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
INSERT INTO auth.users(id,email) VALUES('${owner}','owner@example.test'),('${reviewer}','reviewer@example.test'),('${outsider}','other@example.test');
INSERT INTO profiles(id) SELECT id FROM auth.users;
INSERT INTO cafes(id,slug,name,owner_user_id) VALUES('${cafe}','test-cafe','Synthetic A','${owner}'),('${other}','test-b','Synthetic B','${outsider}');
`);
  for(const file of ['20261023195232_brand_finance_operations.sql','20261023214839_brand_finance_invoice_tax.sql'])
    await db.exec(await readFile(path.join('supabase/migrations',file),'utf8'));
  await db.exec(`CREATE TABLE public.bf_cash_handovers(id uuid PRIMARY KEY, cafe_id uuid, shift_id uuid);
CREATE TABLE public.bf_cash_handover_receipts(id uuid PRIMARY KEY, cafe_id uuid, handover_id uuid);
CREATE FUNCTION brand_finance_private.pilot_test_existing_grant() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
GRANT EXECUTE ON FUNCTION brand_finance_private.pilot_test_existing_grant() TO service_role;
ALTER FUNCTION public.brand_finance_execute(uuid,text,jsonb,uuid) SET SCHEMA brand_finance_private;
ALTER FUNCTION brand_finance_private.brand_finance_execute(uuid,text,jsonb,uuid) RENAME TO execute_before_treasury;
REVOKE ALL ON FUNCTION brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.brand_finance_execute(p_cafe_id uuid,p_operation text,p_payload jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT brand_finance_private.execute_before_treasury(p_cafe_id,p_operation,p_payload,p_request_id) $$;
REVOKE ALL ON FUNCTION public.brand_finance_execute(uuid,text,jsonb,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_execute(uuid,text,jsonb,uuid) TO authenticated;`);
  const baseline=(await db.query("SELECT pg_get_functiondef('public.brand_finance_execute(uuid,text,jsonb,uuid)'::regprocedure) body")).rows[0].body;
  await db.exec(await readFile('supabase/migrations/20261109185151_finance_ledger_pilot.sql','utf8'));
  check((await db.query("SELECT pg_get_functiondef('public.brand_finance_execute(uuid,text,jsonb,uuid)'::regprocedure) body")).rows[0].body,baseline,'existing execute function unchanged');
  check(await scalar("SELECT has_function_privilege('service_role','brand_finance_private.pilot_test_existing_grant()','EXECUTE')"),true,'existing private grant preserved');
  await db.query("INSERT INTO bf_staff(cafe_id,user_id,name,role) VALUES($1,$2,'Synthetic reviewer','manager')",[cafe,reviewer]);
  await login(owner);
  await scalar('SELECT brand_finance_snapshot($1)',[cafe]);
  const accounts=(await scalar('SELECT brand_finance_gl_snapshot($1)',[cafe])).accounts;
  const account=code=>accounts.find(a=>a.code===code).id;
  const data={title:'Synthetic journal',date:'2026-01-15',note:'Test only',lines:[
    {accountId:account('5100'),debit:'1.40',credit:'0',memo:'Expense'},
    {accountId:account('3000'),debit:'0',credit:'1.40',memo:'Equity'}]};
  const request=crypto.randomUUID();
  let rec=await gl('save',data,request);
  check(rec.number,1,'GL tenant/year numbering begins at one');
  check((await gl('save',data,request)).id,rec.id,'same request yields original record');
  await fail(()=>gl('save',{...data,title:'Changed'},request),/معرف الطلب/,'different payload same request rejected');
  const original=rec;
  rec=await change(rec,'submit');
  await fail(()=>change(original,'submit'),e=>e.code==='40001','stale revision is explicit serialization conflict');
  await fail(()=>change(rec,'approve'),e=>e.code==='42501','maker cannot self approve');
  await login(reviewer); rec=await change(rec,'approve');
  await login(owner); const postRequest=crypto.randomUUID(),postPayload={id:rec.id,revision:rec.revision};
  rec=await gl('post',postPayload,postRequest);
  check(rec.status,'posted','approved draft posts to existing ledger');
  check((await gl('post',postPayload,postRequest)).document_id,rec.document_id,'post commit retry has same document');
  check(Number(await scalar('SELECT sum(debit-credit) FROM bf_journal WHERE document_id=$1',[rec.document_id])),0,'posted ledger balances');
  check(await scalar("SELECT bool_and((created_at AT TIME ZONE 'Asia/Riyadh')::date='2026-01-15') FROM bf_journal WHERE document_id=$1",[rec.document_id]),true,'lines retain accounting date');
  await fail(()=>change(rec,'save',data),/مسودة/,'posted document cannot be edited');
  const period=await gl('period_close',{from:'2026-01-01',to:'2026-01-31',reason:'Month closed test'});
  await fail(()=>gl('save',data),/مقفلة/,'closed month rejects backdated draft');
  await fail(()=>change(rec,'reverse',{date:'2026-01-20',reason:'Reversal test'}),/مقفلة/,'reversal rejects closed month');
  rec=await change(rec,'reverse',{date:'2026-02-01',reason:'Reverse test journal'});
  check(rec.status,'reversed','open period reversal creates linked opposite journal');
  check(await scalar('SELECT reference_id FROM bf_documents WHERE id=$1',[rec.reversal_document_id]),rec.document_id,'reversal points to source');
  check(Number(await scalar('SELECT sum(debit-credit) FROM bf_journal WHERE account_id=$1',[account('5100')])),0,'reversal restores expense balance');
  const january=await scalar('SELECT brand_finance_gl_report($1,$2,$3)',[cafe,'2026-01-01','2026-01-31']);
  check(Number(january.balances.find(b=>b.code==='5100').closing),1.4,'as-of report excludes later reversal');
  const february=await scalar('SELECT brand_finance_gl_report($1,$2,$3)',[cafe,'2026-02-01','2026-02-28']);
  check(Number(february.balances.find(b=>b.code==='5100').opening),1.4,'next month carries opening balance');
  check(Number(february.balances.find(b=>b.code==='5100').closing),0,'next month closing includes reversal');
  const detail=await scalar('SELECT brand_finance_gl_document($1,$2)',[cafe,rec.document_id]);
  check(detail.journal.length,2,'document drilldown includes both posted lines');
  check(detail.journal.map(j=>j.memo).sort(),['Equity','Expense'],'approved line descriptions survive posting');
  await fail(()=>change(rec,'reverse',{date:'2026-02-02',reason:'Again test reversal'}),/مرحلًا/,'second reversal denied');
  await gl('period_reopen',{from:'2026-01-01',to:'2026-01-31',revision:period.revision,reason:'Reopen controlled test'});
  check((await gl('save',data)).number,2,'reopened period permits new journal without number reuse');
  await fail(()=>gl('save',{...data,lines:[data.lines[0],{...data.lines[1],credit:'1.39'}]}),/غير متوازن/,'unbalanced draft rejected');
  await fail(()=>gl('save',{...data,lines:[{...data.lines[0],debit:'NaN'},data.lines[1]]}),/كل سطر/,'NaN rejected');
  await fail(()=>gl('save',{...data,lines:[{...data.lines[0],debit:'1.401'},data.lines[1]]}),/كل سطر/,'excess money precision rejected');
  await fail(()=>gl('save',{...data,lines:[{...data.lines[0],accountId:account('1200')},data.lines[1]]}),/حسابات الرقابة/,'manual posting cannot bypass inventory subledger');
  const group=await gl('account_save',{name:'Test expense group',code:'G-1',kind:'expense',isGroup:true});
  const child=await gl('account_save',{name:'Test expense child',code:'G-2',kind:'expense',parentId:group.id,isGroup:true});
  await fail(()=>gl('account_save',{id:group.id,revision:group.revision,name:group.name,code:group.code,kind:group.kind,isGroup:true,parentId:child.id}),/دورة/,'COA cycles rejected');
  await fail(()=>gl('save',{...data,lines:[{...data.lines[0],accountId:group.id},data.lines[1]]}),/تجميعي/,'group cannot receive manual posting');
  const expense=await gl('account_save',{name:'Test expense',code:'E-1',kind:'expense',parentId:group.id});
  await gl('account_save',{...expense,revision:expense.revision,frozen:true,parentId:group.id});
  await fail(()=>gl('save',{...data,lines:[{...data.lines[0],accountId:expense.id},data.lines[1]]}),/نشطًا/,'frozen account cannot receive posting');
  await fail(()=>gl('account_save',{id:account('1200'),revision:1,name:'Inventory',code:'1200',kind:'inventory',frozen:true}),/الرقابة/,'core control account cannot be disabled');
  await login(outsider);
  await fail(()=>gl('save',data),e=>e.code==='42501','cross tenant GL write denied');
  await fail(()=>scalar('SELECT brand_finance_gl_snapshot($1)',[cafe]),e=>e.code==='42501','cross tenant GL snapshot denied');
  await fail(()=>scalar('SELECT brand_finance_gl_document($1,$2)',[other,rec.document_id]),e=>e.code==='42501','nonpilot tenant document API rejected');
  await fail(()=>scalar('SELECT brand_finance_gl_snapshot($1)',[other]),e=>e.code==='42501','nonpilot owner rejected');
  await db.query('INSERT INTO brand_finance_private.gl_rollout(cafe_id,enabled) VALUES($1,true)',[other]);
  await fail(()=>scalar('SELECT brand_finance_gl_document($1,$2)',[other,rec.document_id]),/غير موجود/,'cross tenant document ID rejected');
  await scalar('SELECT brand_finance_snapshot($1)',[other]);
  const otherAccounts=(await scalar('SELECT brand_finance_gl_snapshot($1)',[other])).accounts;
  const otherData={...data,lines:data.lines.map((x,i)=>({...x,accountId:otherAccounts.find(a=>a.code===(i?'3000':'5100')).id}))};
  check((await gl('save',otherData,crypto.randomUUID(),other)).number,1,'second tenant has independent numbering');
  await login(owner); await db.exec('SET ROLE authenticated');
  await fail(()=>db.query('SELECT * FROM bf_gl_drafts'),e=>e.code==='42501','raw draft table denied through authenticated role');
  await fail(()=>db.query('DELETE FROM bf_gl_events'),e=>e.code==='42501','audit direct delete denied');
  await scalar('SELECT brand_finance_gl_snapshot($1)',[cafe]);
  await db.exec('RESET ROLE');
  await fail(()=>db.query('UPDATE bf_gl_events SET action=action'),/immutable/,'audit immutable even via table update');
  if(typeof db.connectIndependent==='function') {
    const first=await db.connectIndependent(),second=await db.connectIndependent();
    try {
      for(const client of [first,second]){await client.query('SET ROLE authenticated');await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[owner]);}
      const command=crypto.randomUUID();
      await first.query('BEGIN');
      const saved=(await first.query('SELECT brand_finance_gl_execute($1,$2,$3,$4) result',[cafe,'save',{...data,title:'Concurrent retry'},command])).rows[0].result;
      const secondPid=(await second.query('SELECT pg_backend_pid() pid')).rows[0].pid;
      const waiting=second.query('SELECT brand_finance_gl_execute($1,$2,$3,$4) result',[cafe,'save',{...data,title:'Concurrent retry'},command]);
      let blocked=false;
      for(let i=0;i<100;i++){blocked=await scalar('SELECT cardinality(pg_blocking_pids($1))>0',[secondPid]);if(blocked)break;await new Promise(resolve=>setTimeout(resolve,10));}
      check(blocked,true,'independent PostgreSQL session observed waiting for tenant lock');
      await first.query('COMMIT');
      const repeated=(await waiting).rows[0].result;
      check(repeated.id,saved.id,'concurrent retry returns exactly one committed draft');
      check(repeated.duplicate,true,'concurrent second writer classified duplicate');
      check(Number(await scalar('SELECT count(*) FROM bf_gl_drafts WHERE id=$1',[saved.id])),1,'duplicate race stores one row');
    }finally{await first.query('ROLLBACK');await first.end();await second.end();}
  }
  await pilotContracts({db,check,fail,scalar,login,gl,change,owner,reviewer,outsider,cafe,other,data,account});
  await db.query('UPDATE cafes SET enabled=false WHERE id=$1',[cafe]);
  await fail(()=>scalar('SELECT brand_finance_gl_snapshot($1)',[cafe]),e=>e.code==='42501','subscription revocation enforced at request time');
  console.log(`GL SQL contracts: ${results.length} checks passed (${engine}, synthetic Auth helper; not real Auth proof)`);
} catch(error) {
  results.push({status:'FAIL',message:error.message,code:error.code,where:error.where});
  console.error(JSON.stringify(results.at(-1))); process.exitCode=1;
} finally {
  if(process.env.EVIDENCE_DIR){await mkdir(process.env.EVIDENCE_DIR,{recursive:true});await writeFile(path.join(process.env.EVIDENCE_DIR,engine==='PGlite'?'ledger-pglite.json':'ledger-native.json'),JSON.stringify({at:new Date().toISOString(),engine,auth:'synthetic helper',node:process.version,provenance:await Promise.all(['supabase/migrations/20261109185151_finance_ledger_pilot.sql','scripts/check-finance-ledger-pilot-db.mjs','scripts/lib/finance-ledger-pilot-cases.mjs','supabase/migrations/20261023195232_brand_finance_operations.sql','supabase/migrations/20261023214839_brand_finance_invoice_tax.sql'].map(async file=>({file,sha256:createHash('sha256').update(await readFile(file)).digest('hex')}))),results},null,2));}
  await db.close();
}
