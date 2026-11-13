import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE??path.join(tmpdir(),'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db=new PGlite(),ids=Array.from({length:7},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`),[owner,outsider,reviewer,cafe,other,raw,product]=ids;
let checks=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const scalar=async(sql,params=[])=>Object.values((await db.query(sql,params)).rows[0])[0];
const fail=async(fn,label,code)=>{await assert.rejects(fn,error=>!code||error.code===code,label);checks++;};
const login=id=>db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id??'']);
const files=['supabase/migrations/20261023195232_brand_finance_operations.sql','supabase/migrations/20261113075249_erp_manufacturing.sql','supabase/migrations/20261113081149_erp_files.sql','supabase/migrations/20261113171653_erp_manufacturing_notes.sql'];
const sources=await Promise.all(files.map(file=>readFile(file,'utf8')));
const tracked=[...files,'scripts/check-erp-manufacturing-notes-db.mjs','package.json','package-lock.json'];
const inputStart=Object.fromEntries(await Promise.all(tracked.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth;CREATE SCHEMA platform_access_private;CREATE SCHEMA storage;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);CREATE TABLE profiles(id uuid PRIMARY KEY,status text DEFAULT 'active');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE TABLE cafes(id uuid PRIMARY KEY,slug text,name text,owner_user_id uuid,status text DEFAULT 'active',deleted_at timestamptz,enabled boolean DEFAULT true);
 CREATE TABLE menu_categories(id uuid PRIMARY KEY,cafe_id uuid,name text);
 CREATE TABLE menu_products(id uuid PRIMARY KEY,cafe_id uuid,name text,price numeric,available boolean DEFAULT true,deleted_at timestamptz,category_id uuid,image_url text,image_storage_path text,sort_order integer DEFAULT 0);
 CREATE FUNCTION platform_access_private.service_enabled(c uuid,f text) RETURNS boolean LANGUAGE sql AS $$SELECT enabled AND f='finance' FROM public.cafes WHERE id=c$$;
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb);
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 GRANT USAGE ON SCHEMA auth TO authenticated,anon;GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
 INSERT INTO auth.users(id) VALUES('${owner}'),('${outsider}'),('${reviewer}');INSERT INTO profiles(id) SELECT id FROM auth.users;
 INSERT INTO cafes(id,slug,name,owner_user_id) VALUES('${cafe}','note-a','A','${owner}'),('${other}','note-b','B','${outsider}');`);
 await db.exec(sources[0]);await db.exec("ALTER TABLE bf_staff DROP CONSTRAINT bf_staff_role_check;ALTER TABLE bf_staff ADD CHECK(role IN('manager','cashier','accountant','warehouse','auditor'))");
 await db.exec(sources[1]);await db.exec(sources[2]);
 // Local-only historical lock adapter. The full current branch/archive chain is
 // independently exercised by the linked rollback probe, not claimed here.
 await db.exec(`DO $$DECLARE source text;BEGIN SELECT pg_get_functiondef('public.erp_file_delete_access(text)'::regprocedure) INTO source;EXECUTE replace(source,'WHERE path=p_path;','WHERE path=p_path FOR UPDATE;');END $$;`);
 const deletionOid=await scalar("SELECT 'public.erp_file_delete_access(text)'::regprocedure::oid");
 await db.exec(sources[3]);eq(await scalar("SELECT 'public.erp_file_delete_access(text)'::regprocedure::oid"),deletionOid,'deletion function identity preserved');
 await login(owner);await scalar('SELECT brand_finance_snapshot($1)',[cafe]);
 const inventory=await scalar("SELECT id FROM bf_accounts WHERE cafe_id=$1 AND code='1200'",[cafe]);
 await db.query("INSERT INTO bf_items(id,cafe_id,name,sku) VALUES($1,$2,'Product','PRODUCT')",[product,cafe]);
 await db.query("INSERT INTO bf_items(id,cafe_id,name,sku) VALUES($1,$2,'Raw','RAW')",[raw,cafe]);
 const save=(kind,payload)=>scalar('SELECT erp_manufacturing_save($1,$2,$3,NULL,0,false,$4)',[cafe,kind,payload,randomUUID()]);
 const order=(await save('orders',{name:'Order',code:'N1',description:'',productId:product,quantity:1,accountId:inventory,routingId:'',bomId:'',customerId:'',employees:[],from:'',to:'',customValues:{},materials:[],expenses:[],operations:[],scrap:[]})).id;
 const second=(await save('orders',{name:'Other order',code:'N2',description:'',productId:product,quantity:1,accountId:inventory,routingId:'',bomId:'',customerId:'',employees:[],from:'',to:'',customValues:{},materials:[],expenses:[],operations:[],scrap:[]})).id;
 const bom=(await save('bom',{name:'BOM',code:'B1',description:'',productId:product,quantity:1,accountId:inventory,routingId:'',active:true,isDefault:true,materials:[{itemId:raw,quantity:1,price:1,stage:''}],expenses:[],operations:[],scrap:[]})).id;
 const plan=(await save('plans',{name:'Plan',code:'P1',description:'',from:'',to:'',customerId:'',sourceId:'',employees:[],items:[{productId:product,quantity:1,bomId:bom}],customValues:{}})).id;
 const read=(kind,id)=>scalar('SELECT erp_manufacturing_read($1,$2,$3)',[cafe,kind,id]);
 async function command(kind='orders',record=order,patch={}){const revision=(await read(kind,record)).records[0].revision;return {kind,id:record,revision,requestId:randomUUID(),action:'note',note:'note',lines:[],value:{},...patch};}
 const act=cmd=>scalar('SELECT erp_manufacturing_act($1,$2)',[cafe,cmd]);
 const legacy=await command('orders',order,{note:'Legacy <literal>\nsecond'});await act(legacy);
 let events=(await read('orders',order)).events.filter(e=>e.action==='note');eq(events[0].note,legacy.note,'legacy plain text persisted literally');eq(events[0].payload.format,undefined,'legacy payload does not change format');
 const rich=await command('orders',order,{note:'<h3>Title</h3><p><strong>safe</strong> &lt;img&gt;</p>',format:'rich',tags:['Review','فريق'],occurredAt:'2026-11-13T21:30:00+03:00',attachmentIds:[]});
 await act(rich);events=(await read('orders',order)).events.filter(e=>e.action==='note');eq(events[0].payload.tags,rich.tags,'tags persist through actual action/read chain');eq(events[0].payload.occurredAt,rich.occurredAt,'occurrence time persists');eq(events[0].note,rich.note,'rich note persists unchanged');eq((await act(rich)).duplicate,true,'exact note retry idempotent');eq((await read('orders',order)).events.filter(e=>e.action==='note').length,2,'retry adds no duplicate note');
 await fail(()=>act({...rich,note:'changed'}),'request reuse with changed content denied');
 for(const patch of [{note:''},{note:'<p><br></p>',format:'rich'},{note:'<p>&nbsp;</p>',format:'rich'},{note:'<script>evil()</script>',format:'rich'},{note:'<p onclick="evil()">x</p>',format:'rich'},{note:'x'.repeat(10001)},{format:'html'},{tags:['a','A']},{tags:[' فريق ']},{tags:[5]},{tags:null},{tags:Array.from({length:21},(_,i)=>String(i))},{tags:['bad\u0001tag']},{occurredAt:'infinity'},{occurredAt:'2026-11-13T12:00:00'},{occurredAt:'2026-02-30T12:00:00Z'},{attachmentIds:[randomUUID()]},{attachmentIds:'bad'}]){const cmd=await command('orders',order,patch);await fail(()=>act(cmd),'SQL rejects malformed note '+JSON.stringify(patch).slice(0,45));}
 async function upload(record=order,type='manufacturing_order'){const id=randomUUID(),metadata={name:'note.pdf',mime:'application/pdf',size:3,sha256:'a'.repeat(64)};const file=await scalar('SELECT erp_file($1,$2,$3,$4,$5,$6)',[cafe,'prepare',type,record,id,metadata]);await db.query("INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('erp-record-files',$1,$2)",[file.path,{size:3,mimetype:'application/pdf'}]);await scalar('SELECT erp_file($1,$2,$3,$4,$5)',[cafe,'complete',type,record,id]);return {id,path:file.path};}
 const attached=await upload();eq(await scalar('SELECT erp_file_delete_access($1)',[attached.path]),true,'unreferenced attachment deletion allowed');
 const withFile=await command('orders',order,{format:'rich',note:'<p>With file</p>',attachmentIds:[attached.id]});await act(withFile);eq((await read('orders',order)).events[0].payload.attachmentIds,[attached.id],'uploaded attachment survives note/read chain');
 eq(await scalar('SELECT erp_file_delete_access($1)',[attached.path]),false,'deletion preflight denies note reference');
 await fail(()=>db.query('DELETE FROM erp_files WHERE id=$1',[attached.id]),'metadata deletion denied while note references file','23503');
 for(const set of ['uploaded=false',"path='changed'","sha256=repeat('b',64)",`record_id='${second}'`,`entity_type='manufacturing_plan'`])await fail(()=>db.query(`UPDATE erp_files SET ${set} WHERE id=$1`,[attached.id]),'referenced file identity immutable '+set,'23503');
 await db.query("UPDATE erp_files SET name='renamed.pdf' WHERE id=$1",[attached.id]);eq(await scalar('SELECT name FROM erp_files WHERE id=$1',[attached.id]),'renamed.pdf','nonidentity filename update allowed');
 await fail(async()=>act({...await command('orders',order),attachmentIds:[attached.id,attached.id]}),'duplicate attachment rejected');
 await fail(async()=>act({...await command('orders',second),attachmentIds:[attached.id]}),'cross-record attachment rejected','42501');
 await fail(async()=>act({...await command('plans',plan),attachmentIds:[attached.id]}),'wrong-kind attachment rejected','42501');
 const missing=await upload();await db.query('DELETE FROM storage.objects WHERE name=$1',[missing.path]);await fail(async()=>act({...await command(),attachmentIds:[missing.id]}),'uploaded marker without stored object rejected','42501');
 const unuploaded=await upload();await db.query('UPDATE erp_files SET uploaded=false WHERE id=$1',[unuploaded.id]);await fail(async()=>act({...await command(),attachmentIds:[unuploaded.id]}),'uncompleted upload rejected','42501');
 const crossTenant=await upload();await db.query('UPDATE erp_files SET cafe_id=$1 WHERE id=$2',[other,crossTenant.id]);await fail(async()=>act({...await command(),attachmentIds:[crossTenant.id]}),'cross-tenant file rejected','42501');
 const planFile=await upload(plan,'manufacturing_plan');await act({...await command('plans',plan),attachmentIds:[planFile.id],note:'Plan note'});eq((await read('plans',plan)).events[0].note,'Plan note','plan notes support correctly scoped attachments');
 const beforeRole=await command();await login(outsider);await fail(()=>act(beforeRole),'outsider denied','42501');
 await db.query("INSERT INTO bf_staff(cafe_id,user_id,name,role) VALUES($1,$2,'Auditor','auditor')",[cafe,reviewer]);await login(reviewer);await fail(()=>act(beforeRole),'auditor cannot write note','42501');
 await login(null);await fail(()=>act(beforeRole),'anonymous note denied','42501');
 await login(owner);const authenticatedCommand=await command();await db.exec('SET ROLE authenticated');eq((await act(authenticatedCommand)).id,order,'actual authenticated role executes public note RPC');await fail(()=>db.query('SELECT * FROM erp_mfg_events'),'raw event table denies authenticated access','42501');await db.exec('RESET ROLE');
 eq(await scalar("SELECT has_function_privilege('authenticated','erp_manufacturing_private.note_content_guard()','EXECUTE')"),false,'note guard not callable by authenticated');
 eq(await scalar("SELECT has_function_privilege('anon','erp_manufacturing_private.note_file_guard()','EXECUTE')"),false,'file guard not callable by anonymous');
 eq(Number(await scalar('SELECT count(*) FROM bf_documents WHERE cafe_id=$1',[cafe])),0,'notes create no financial documents');
 const inputs=Object.fromEntries(await Promise.all(tracked.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));assert.deepEqual(inputs,inputStart,'verification inputs stable');sources.forEach((source,index)=>assert.equal(createHash('sha256').update(source).digest('hex'),inputs[files[index]],'executed migration matches fingerprint'));
 const result={passed:true,checks,at:new Date().toISOString(),runtime:process.version,scope:'Isolated PGlite actual original finance/manufacturing/file RPCs plus exact notes migration; Storage objects/buckets and auth/platform fixtures local stubs; historical deletion row-lock adapter only; current branch/archive wrappers and live Storage not claimed',inputs};await writeFile('output/integrated-system/erp-manufacturing-notes-db-verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:true,checks,at:result.at}));
}catch(error){console.error(JSON.stringify({passed:false,checks,message:error.message,code:error.code,where:error.where}));process.exitCode=1;}finally{await db.close();}
