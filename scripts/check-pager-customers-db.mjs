import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE ?? path.join(tmpdir(),'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db=new PGlite();let checks=0;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const value=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const check=(v,label)=>{assert.ok(v,label);checks++;};
const reject=async fn=>{await assert.rejects(fn);checks++;};
try {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA platform_access_private; GRANT USAGE ON SCHEMA public,platform_access_private TO anon,authenticated,service_role;
 CREATE TABLE cafes(id uuid PRIMARY KEY,name text,slug text,status text DEFAULT 'active',deleted_at timestamptz);
 CREATE TABLE platform_plans(id text PRIMARY KEY,features jsonb,active boolean DEFAULT true);
 CREATE TABLE subscriptions(cafe_id uuid,plan_id text,status text,started_at timestamptz,expires_at timestamptz,created_at timestamptz DEFAULT now());
 CREATE TABLE brand_feature_overrides(cafe_id uuid,feature_id text,enabled boolean);
 CREATE TABLE customer_profiles(id uuid PRIMARY KEY,cafe_id uuid,full_name text,phone text,phone_normalized text,updated_at timestamptz DEFAULT now());
 GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;`);
 await db.exec(await readFile('supabase/migrations/20261011013350_pager_system.sql','utf8'));
 await db.query("INSERT INTO cafes(id,name,slug) VALUES($1,'Alpha','alpha'),($2,'Beta','beta'),($3,'No pager','no-pager')",[id(1),id(2),id(3)]);
 await db.exec(`INSERT INTO platform_plans(id,features) VALUES('pager','["pager"]'),('loyalty','["loyalty"]');`);
 await db.query("INSERT INTO subscriptions(cafe_id,plan_id,status) VALUES($1,'pager','trialing'),($2,'pager','active'),($3,'loyalty','active')",[id(1),id(2),id(3)]);
 const create=(n,cafe=1,phone='966500000001',name='')=>value("SELECT to_jsonb(pager_create_named_order($1,$2,$3,$4,'Staff','Desk',null,$5,$6))",[id(n),id(cafe),'invoice-'+n,phone,String(n).padStart(64,'0'),name]);
 await db.query("SELECT pager_create_order($1,$2,'historic','966500000001','Staff','Desk',null,$3)",[id(10),id(1),'a'.repeat(64)]);
 await db.query("INSERT INTO customer_profiles(id,cafe_id,full_name,phone_normalized) VALUES($1,$2,'Existing name','+966500000001'),($3,$4,'Other brand name','966500000001')",[id(80),id(1),id(81),id(2)]);
 await db.exec(await readFile('supabase/migrations/20261113152024_pager_customer_directory_reviews.sql','utf8'));
 for(const role of ['anon','authenticated']) {
  await db.exec(`SET ROLE ${role}`);
  for(const table of ['pager_customers','pager_brand_settings','pager_private.customer_directory']) {
   await reject(()=>db.query(`SELECT * FROM ${table}`));
   await reject(()=>db.query(`DELETE FROM ${table}`));
  }
  await reject(()=>value('SELECT pager_customer_directory()'));
  await reject(()=>value('SELECT pager_reviews_page($1)',[id(1)]));
  await reject(()=>create(20));
  await db.exec('RESET ROLE');
 }
 await db.exec('SET ROLE service_role');
 const directory=(cafe=null,phone=null,q='',page=0)=>value('SELECT pager_customer_directory($1,$2,$3,$4)',[cafe===null?null:id(cafe),phone,q,page]);
 let result=await directory(1);check(result.total===1&&result.rows[0].registrations===1,'historic orders backfilled');check(result.rows[0].full_name==='Existing name','loyalty identity found within same brand');
 await create(20,1,'966500000001','New name');await create(20,1,'966500000001','New name');
 result=await directory(1);check(result.total===1&&result.rows[0].registrations===2,'idempotent retries do not inflate visits');check(result.rows[0].full_name==='New name','entered customer name retained');
 await create(21,1);check((await directory(1)).rows[0].full_name==='New name','blank input preserves known name');
 await create(22,2,'966500000001','Second tenant');
 check((await directory(1)).rows[0].full_name==='New name'&&(await directory(2)).rows[0].full_name==='Second tenant','same phone separated by brand');
 check((await directory(1,'966500000001')).total===3,'customer history counts all own orders');
 check((await directory(null,null,'Alpha')).rows[0].customers===1,'brand customer totals');
 check((await directory(1,null,'New')).total===1,'customer name search');
 check((await directory(1,null,'not found')).total===0,'empty search');
 await reject(()=>create(23,3));await reject(()=>create(20,2));await reject(()=>directory(1,null,'',-1));await reject(()=>directory(null,'966500000001'));
 await value("SELECT pager_transition_order($1,$2,'ready','Staff','Desk',null)",[id(1),id(20)]);
 await value("SELECT pager_transition_order($1,$2,'received','Staff','Desk',null)",[id(1),id(20)]);
 await value("SELECT pager_submit_feedback($1,1,'Needs improvement')",[String(20).padStart(64,'0')]);
 const reviews=(cafe=1,rating=null,q='',page=0)=>value('SELECT pager_reviews_page($1,$2,$3,$4)',[id(cafe),q,rating,page]);
 result=await reviews();check(result.total===1&&result.average===1&&result.rows[0].phone==='966500000001','review includes customer phone and real average');
 check((await reviews(2)).total===0,'reviews tenant isolation');check((await reviews(1,5)).total===0,'star filtering');check((await reviews(1,null,'improvement')).total===1,'review text search');await reject(()=>reviews(3));
 for(let n=100;n<127;n++) await create(n,1,'9665'+String(n).padStart(8,'0'));
 result=await directory(1);const second=await directory(1,null,'',1);check(result.rows.length===25&&second.rows.length===3&&result.total===28,'bounded pagination');check(!second.rows.some(row=>result.rows.some(first=>first.phone===row.phone)),'stable nonoverlapping pages');
 check(!JSON.stringify(await directory(1,'966500000001')).includes('feedback_hash'),'feedback secret excluded');
 await db.query("INSERT INTO pager_brand_settings(cafe_id,google_review_url) VALUES($1,'https://g.page/r/fixture/review')",[id(1)]);check(await value('SELECT count(*)=1 FROM pager_brand_settings WHERE cafe_id=$1',[id(1)]),'service settings storage');
 check(await value("SELECT count(*)=2 FROM pg_class WHERE relname IN('pager_customers','pager_brand_settings') AND relrowsecurity"),'RLS enabled');
 console.log(`PASS ${checks} pager directory migration, permissions, identity, history, review, trial and pagination checks`);
}finally {await db.close();}
