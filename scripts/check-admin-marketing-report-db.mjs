import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const engine = process.env.PGLITE_MODULE ?? path.join(tmpdir(), "branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js");
const { PGlite } = await import(pathToFileURL(engine).href);
const db = new PGlite();
const q = (sql, args = []) => db.query(sql, args);
const value = async (sql, args = []) => Object.values((await q(sql, args)).rows[0] ?? {})[0];
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const phone = n => `96650000${String(n).padStart(4,"0")}`;
let checks = 0;
const check = (condition, label) => { assert(condition, label); checks++; };
async function denied(run) { await assert.rejects(run); checks++; }
const migrations = [
  "supabase/migrations/20261019122042_brand_marketing_campaigns.sql",
  "supabase/migrations/20261021090454_marketing_campaign_media.sql",
  "supabase/migrations/20261021093245_admin_marketing_campaign_report.sql",
];
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text,status text);
    CREATE TABLE public.cafes(id uuid PRIMARY KEY,name text,owner_user_id uuid,status text,deleted_at timestamptz);
    CREATE TABLE public.cafe_members(cafe_id uuid,user_id uuid,role text);
    CREATE TABLE public.platform_plans(id text PRIMARY KEY,features jsonb,active boolean);
    CREATE TABLE public.subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid,plan_id text,status text,created_at timestamptz DEFAULT now(),started_at timestamptz DEFAULT now(),expires_at timestamptz);
    CREATE TABLE public.brand_feature_overrides(cafe_id uuid,feature_id text,enabled boolean);
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
  `);
  for (const file of migrations.slice(0,2)) await db.exec(await readFile(file,"utf8"));
  const policiesBefore = (await q("SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies ORDER BY schemaname,tablename,policyname")).rows;
  const tableGrantsBefore = (await q("SELECT table_schema,table_name,grantee,privilege_type FROM information_schema.role_table_grants WHERE grantee IN ('anon','authenticated','service_role') ORDER BY 1,2,3,4")).rows;
  await db.exec(await readFile(migrations[2],"utf8"));
  assert.deepEqual((await q("SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies ORDER BY schemaname,tablename,policyname")).rows,policiesBefore);checks++;
  assert.deepEqual((await q("SELECT table_schema,table_name,grantee,privilege_type FROM information_schema.role_table_grants WHERE grantee IN ('anon','authenticated','service_role') ORDER BY 1,2,3,4")).rows,tableGrantsBefore);checks++;
  await q("INSERT INTO profiles VALUES($1,'platform_admin','active'),($2,'cafe_owner','active'),($3,'platform_admin','suspended'),($4,'cafe_staff','active')",[11,12,13,14].map(id));
  for(const n of [1,2,3,4]) await q("INSERT INTO cafes VALUES($1,$2,$3,'active',$4)",[id(n),`Brand ${n}`,id(12),n===3?'2026-10-01T00:00:00Z':null]);
  async function campaign(n,brand,created,status="completed",scheduled="2026-10-01T00:00:00Z",media=null,title=`Campaign ${n}`,body=`Body ${n}`) {
    await q("INSERT INTO brand_marketing_campaigns(id,cafe_id,created_by,request_key,content_hash,title,body,status,scheduled_at,consent_at,created_at,media_id) VALUES($1,$2,$3,$1,'private-content-hash',$4,$5,$6,$7,now(),$8,$9)",[id(n),id(brand),id(12),title,body,status,scheduled,created,media]);
  }
  async function recipient(campaignId,brand,number,status,attempted=false) {
    await q("INSERT INTO brand_marketing_recipients(campaign_id,cafe_id,phone,status,attempted_at,instance_id,provider_message_id,error_code) VALUES($1,$2,$3,$4,$5,'secret-instance',$6,'PRIVATE_DIAGNOSTIC')",[id(campaignId),id(brand),phone(number),status,attempted?'2026-10-20T00:00:00Z':null,`private-message-${campaignId}-${number}`]);
  }
  for(const [n,mime] of [[501,'image/png'],[502,'video/mp4']]) await q("INSERT INTO brand_marketing_media(id,cafe_id,created_by,file_name,mime_type,byte_size,storage_path,status,content_sha256,ready_at) VALUES($1,$2,$3,'private-original-name',$4,100,$5,'ready',repeat('a',64),now())",[id(n),id(1),id(12),mime,`${id(1)}/ready/${id(n)}.asset`]);
  const start='2026-10-09T21:00:00Z',middle='2026-10-10T12:00:00Z',end='2026-10-10T20:59:59.999Z';
  await campaign(100,1,start,'completed',undefined,id(501),'عرض خاص، "١"','النص الأصلي\n<script>alert("x")</script>');
  for(const [i,status] of ['accepted','delivered','read','queued','processing','failed','uncertain','cancelled','suppressed'].entries())await recipient(100,1,i+1,status,['accepted','delivered','read','failed','uncertain'].includes(status));
  await campaign(101,1,middle,'completed',undefined,id(502));await recipient(101,1,1,'accepted',true);
  await campaign(102,1,middle,'cancelled');await recipient(102,1,2,'cancelled');
  await campaign(103,1,middle,'cancelled');await recipient(103,1,10,'failed',true);
  await campaign(104,1,middle,'scheduled','2099-01-01T00:00:00Z');await recipient(104,1,11,'queued');
  await campaign(105,1,end);
  await campaign(106,1,middle,'cancelled','2099-01-01T00:00:00Z');await recipient(106,1,12,'cancelled',true);
  await campaign(107,1,'2026-10-09T20:59:59.999Z');await recipient(107,1,20,'accepted',true);
  await campaign(108,1,'2026-10-10T21:00:00Z');await recipient(108,1,21,'accepted',true);
  await campaign(109,1,'2020-01-01T00:00:00Z');await recipient(109,1,22,'accepted',true);
  await campaign(200,2,middle);await recipient(200,2,1,'accepted',true);
  await campaign(300,3,middle);await recipient(300,3,99,'accepted',true);
  for(let n=1000;n<1025;n++)await campaign(n,2,'2026-09-20T12:00:00Z');
  const report=(from=null,to=null,cafe=null,page=0)=>value("SELECT public.get_admin_marketing_campaign_report($1,$2,$3,$4)",[from,to,cafe,page]);
  const asUser=async(user,role='authenticated')=>{await db.exec('RESET ROLE');await q("SELECT set_config('test.uid',$1,false)",[user? id(user):'']);await db.exec(`SET ROLE ${role}`);};
  for(const [user,role]of [[null,'anon'],[11,'anon'],[null,'authenticated'],[12,'authenticated'],[13,'authenticated'],[14,'authenticated'],[null,'service_role'],[11,'service_role']]){
    await asUser(user,role);await denied(()=>report());
  }
  await asUser(11);
  let result=await report('2026-10-10','2026-10-10');
  check(result.from==='2026-10-10'&&result.to==='2026-10-10'&&result.history===null,'date echoes and optional history contract');
  check(result.metrics.length===2,'only nondeleted brands with cohort campaigns returned');
  const a=result.metrics.find(row=>row.cafeId===id(1)),b=result.metrics.find(row=>row.cafeId===id(2));
  assert.deepEqual(a,{cafeId:id(1),campaignLaunched:4,campaignTargets:12,campaignSent:4,campaignPending:3,campaignFailed:2,campaignUncertain:1,campaignCancelled:3,campaignSuppressed:1});checks++;
  check(b.campaignTargets===1&&b.campaignSent===1&&b.campaignLaunched===1,'same phone deduplicates only within its brand');
  check(a.campaignSent===4,'sent includes provider accepted delivered and read even when recipient activity is outside cohort dates');
  check(a.campaignPending===3,'future scheduled recipients remain pending');
  check(a.campaignLaunched===4,'future schedules and pre-attempt cancellation excluded, attempted cancellation retained');
  result=await report('2026-10-10','2026-10-10',id(1));
  check(result.metrics.length===1&&result.metrics[0].cafeId===id(1),'requested brand isolates metrics');
  check(result.history.total===7&&result.history.page===0&&result.history.campaigns.length===7,'same Saudi inclusive campaign creation cohort in history');
  const campaigns=result.history.campaigns,c100=campaigns.find(row=>row.id===id(100)),c101=campaigns.find(row=>row.id===id(101));
  check(c100.title==='عرض خاص، "١"'&&c100.body==='النص الأصلي\n<script>alert("x")</script>','original title/body and punctuation preserved as JSON data');
  check(c100.mediaKind==='image'&&c101.mediaKind==='video'&&campaigns.find(row=>row.id===id(105)).mediaKind===null,'media kind contains no private object identity');
  assert.deepEqual({total:c100.total,sent:c100.sent,pending:c100.pending,failed:c100.failed,uncertain:c100.uncertain,cancelled:c100.cancelled,suppressed:c100.suppressed},{total:9,sent:3,pending:2,failed:1,uncertain:1,cancelled:1,suppressed:1});checks++;
  for(const row of campaigns)check(row.total===row.sent+row.pending+row.failed+row.uncertain+row.cancelled+row.suppressed,'recipient status groups partition campaign total');
  check(campaigns[0].id===id(105)&&campaigns.at(-1).id===id(100),'exact Saudi start and final millisecond included in correct order');
  check(!campaigns.some(row=>[id(107),id(108)].includes(row.id)),'immediately before start and exclusive next day are excluded');
  for(const secret of ['96650000','private-content-hash','secret-instance','private-message','PRIVATE_DIAGNOSTIC','private-original-name','storage_path','content_sha256','/ready/','created_by','request_key'])check(!JSON.stringify(result).includes(secret),'allowlist excludes private field '+secret);
  const all=await report(null,null,id(1));check(all.history.total===10&&all.history.campaigns.some(row=>row.id===id(109)),'unbounded report includes historical campaigns without a cutoff');
  check((await report(null,'2026-10-10',id(1))).history.total===9,'open start bound retains previous history');
  check((await report('2026-10-10',null,id(1))).history.total===8,'open end bound includes following days');
  const page0=await report(null,null,id(2),0),page1=await report(null,null,id(2),1),page2=await report(null,null,id(2),2);
  check(page0.history.total===26&&page0.history.campaigns.length===20&&page1.history.campaigns.length===6&&page2.history.campaigns.length===0,'history paginates by20 with correct full cohort total');
  const sortedIds=[id(200),...Array.from({length:25},(_,i)=>id(1024-i))];
  assert.deepEqual([...page0.history.campaigns,...page1.history.campaigns].map(row=>row.id),sortedIds);checks++;
  check(new Set([...page0.history.campaigns,...page1.history.campaigns].map(row=>row.id)).size===26,'equal timestamps have stable id ordering without page overlap');
  assert.deepEqual((await report(null,null,id(4))).history,{page:0,total:0,campaigns:[]});checks++;
  check((await report('2050-01-01','2050-01-02')).metrics.length===0,'empty cohort returns empty metrics');
  check((await report(null,null,id(4))).metrics.length===0,'brand without campaigns is omitted from metrics');
  await denied(()=>report('2026-10-11','2026-10-10'));
  for(const page of [-1,100001,null])await denied(()=>report(null,null,id(1),page));
  await denied(()=>report(null,null,id(3)));await denied(()=>report(null,null,id(9999)));
  check((await report(null,null,id(1),100000)).history.campaigns.length===0,'maximum bounded page accepted safely');
  await db.exec('RESET ROLE');
  check(await value("SELECT provolatile='s' AND prosecdef AND proconfig=ARRAY['search_path=\"\"'] FROM pg_proc WHERE oid='public.get_admin_marketing_campaign_report(date,date,uuid,integer)'::regprocedure"),'stable security definer uses empty search path');
  check(await value("SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='brand_marketing_campaign_report_history' AND indexdef LIKE '%(cafe_id, created_at DESC, id DESC)%')"),'brand date stable-order index installed');
  check(!await value("SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='brand_marketing_campaign_history')"),'superseded prefix index is not duplicated');
  check(await value('SELECT count(*) FROM brand_marketing_campaigns')===37,'report never changes campaign records');
  const files=[...migrations,'scripts/check-admin-marketing-report-db.mjs'];
  const inputs=Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
  const pgliteVersion=JSON.parse(await readFile(path.join(path.dirname(engine),'../package.json'),'utf8')).version;
  await writeFile('.git/admin-marketing-report-db-checks.json',JSON.stringify({executedAt:new Date().toISOString(),node:process.version,pgliteVersion,checks,inputs,engine:'PGlite isolated PostgreSQL',liveDatabaseWrites:0},null,2));
  console.log(`PASS admin marketing report SQL: ${checks} authorization, cohort, counts, privacy, history and pagination checks`);
}finally{await db.close();}
