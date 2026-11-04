import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const file='supabase/migrations/20261104124234_analytics_targeted_campaigns.sql';
const source=await readFile(file,'utf8');
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE??path.join(tmpdir(),'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db=new PGlite();
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const phone=n=>`96650000${String(n).padStart(4,'0')}`;
const q=(sql,args=[])=>db.query(sql,args);
const value=async(sql,args=[])=>Object.values((await q(sql,args)).rows[0])[0];
let checks=0,seq=1000;
const check=(yes,label)=>{assert.ok(yes,label);checks++;};
const rejects=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++;};
const audience=(segment='inactive',days=10,brand=10,page=1,actor=1)=>value('SELECT public.platform_marketing_analytics_audience($1,$2,$3,$4,$5)',[id(actor),id(brand),segment,days,page]);
const create=(a,key,overrides={})=>{
 const v={actor:1,brand:a.brandId,key:id(key),title:'Targeted message',body:'Brand specific message',segment:a.segment,days:a.inactiveDays,digest:a.digest,scheduledAt:null,kind:'message',...overrides};
 return value('SELECT public.platform_marketing_create_analytics_campaign($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id(v.actor),v.key,v.title,v.body,v.brand,v.segment,v.days,v.digest,v.scheduledAt,v.kind]);
};
const counts=()=>value("SELECT jsonb_build_object('campaigns',(SELECT count(*) FROM platform_marketing_campaigns),'recipients',(SELECT count(*) FROM platform_marketing_recipients),'events',(SELECT count(*) FROM loyalty_activity_events))");
async function stamp(profile,days=0,kind='stamp'){
 await q("INSERT INTO loyalty_activity_events(id,cafe_id,card_id,occurred_at,kind) VALUES($1,$2,$3,now()-make_interval(days=>$4),$5)",[id(seq++),id(profile===30||profile===31?11:10),id(profile+100),days,kind]);
}
try {
 const analyticsTest=await readFile('scripts/check-brand-customer-analytics-db.mjs','utf8');
 const setup=analyticsTest.match(/await db\.exec\(`(CREATE ROLE anon;[\s\S]*?)`\);/)[1];
 await db.exec(setup);
 await db.exec(`ALTER TABLE cafes ADD status text DEFAULT 'active',ADD owner_user_id uuid;
 ALTER TABLE customer_profiles ALTER id SET DEFAULT gen_random_uuid();
 ALTER TABLE loyalty_cards ALTER id SET DEFAULT gen_random_uuid(),ADD customer_name text,ADD customer_phone text,ADD status text DEFAULT 'active';
 CREATE TABLE brand_marketing_suppressions(cafe_id uuid,phone text,reason text,PRIMARY KEY(cafe_id,phone));
 CREATE SCHEMA storage;
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;
 GRANT SELECT ON loyalty_activity_events TO service_role;`);
 const normalizer=await readFile('supabase/migrations/073_customer_phone_auth.sql','utf8');
 await db.exec(normalizer.slice(normalizer.indexOf('CREATE OR REPLACE FUNCTION public.normalize_customer_phone'),normalizer.indexOf('UPDATE public.customer_profiles')));
 await db.exec(await readFile('supabase/migrations/20261104104817_admin_brand_analytics.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261101224311_platform_marketing_campaigns.sql','utf8'));
 await db.exec(source);
 await q("INSERT INTO profiles VALUES($1,'platform_admin','active'),($2,'platform_admin','suspended'),($3,'cafe_owner','active'),($4,'customer','active')",[1,2,3,4].map(id));
 // Run the original queue's complete rollback suite with the new worker predicates.
 await db.exec(await readFile('supabase/tests/platform_marketing_campaigns_rollback.sql','utf8'));
 check(await value('SELECT count(*) FROM platform_marketing_campaigns')===0,'legacy queue rollback leaves no campaigns');
 await q("INSERT INTO cafes(id,name,slug,status,deleted_at) VALUES($1,'Alpha','alpha','active',NULL),($2,'Beta','beta','active',NULL),($3,'Empty','empty','active',NULL),($4,'Inactive','inactive','inactive',NULL),($5,'Deleted','deleted','active',now())",[10,11,12,13,14].map(id));
 const fixture=[
  [20,10,'Z Brand A',phone(20),40,false,'active'],[21,10,'Loyal',phone(21),40,false,'active'],[22,10,'Long absent',phone(22),50,false,'active'],
  [23,10,'New',phone(23),2,false,'active'],[24,10,'Never',phone(24),40,false,'active'],[25,10,'Invalid','invalid',40,false,'active'],
  [26,10,'Blocked',phone(26),40,false,'blocked'],[27,10,'Suppressed',phone(27),40,false,'active'],[28,10,'Cross blocked',phone(28),40,false,'active'],
  [29,10,'Z Brand A latest',phone(20),39,false,'active'],[30,11,'A Other Brand',phone(20),40,false,'active'],[31,11,'Other blocked',phone(28),40,false,'blocked'],
  [32,10,'Old unlinked identity',phone(32),40,true,'active'],[33,10,'Recent unlinked identity',phone(32),40,true,'active'],[34,10,'Old profile new card',phone(34),50,false,'active'],
 ];
 for(const [n,b,name,p,days,unlinked,status] of fixture){
  await q('INSERT INTO customer_profiles(id,cafe_id,full_name,phone,phone_normalized,created_at,status) VALUES($1,$2,$3,$4,$5,now()-make_interval(days=>$6),$7)',[id(n),id(b),name,p,unlinked?null:p,days,status]);
  await q('INSERT INTO loyalty_cards(id,cafe_id,customer_profile_id,issued_at,status) VALUES($1,$2,$3,now()-make_interval(days=>$4),\'active\')',[id(n+100),id(b),id(n),n===34?2:days]);
 }
 for(const d of [9,6,3])await stamp(21,d);
 await stamp(20,15);await stamp(22,35);await stamp(30,1);await stamp(32,20);await stamp(33,1);
 await q('INSERT INTO brand_marketing_suppressions VALUES($1,$2,\'opt out\')',[id(10),phone(27)]);
 for(const role of ['anon','authenticated']){
  await db.exec(`SET ROLE ${role}`);await rejects(()=>audience());
  await rejects(()=>create({brandId:id(10),segment:'inactive',inactiveDays:10,digest:'0'.repeat(64)},500));
  await rejects(()=>q('SELECT * FROM brand_loyalty_analytics_private.campaign_audience($1,\'inactive\',10,now())',[id(10)]));
  await db.exec('RESET ROLE');
 }
 await db.exec('SET ROLE service_role');
 for(const actor of [2,3,4]){await rejects(()=>audience('inactive',10,10,1,actor),/Forbidden/);await rejects(()=>create({brandId:id(10),segment:'inactive',inactiveDays:10,digest:'0'.repeat(64)},500,{actor}),/Forbidden/);}
 for(const args of [['bad',10],['inactive',11],['loyal',9],['absent',0],['absent',366],['inactive',10,13],['inactive',10,14],['inactive',10,10,0]])await rejects(()=>audience(...args));
 await rejects(()=>q('SELECT brand_loyalty_analytics_private.campaign_recipient_allowed(\'{}\',\'x\')'));
 const before=await counts(),a=await audience();
 check(a.total===3&&a.matched===8&&a.excluded===5,'server segment plus global suppressions, invalid phones and duplicate recent identity exclusions');
 check(a.items.find(x=>x.phone===phone(20)).name==='Z Brand A latest','preview selected brand name not global minimum');
 check(a.items.every(x=>x.inactiveDays>10)&&/^[a-f0-9]{64}$/.test(a.digest),'inactive semantics and digest');
 check(JSON.stringify(before)===JSON.stringify(await counts()),'preview is read only');
 const page2=await audience('inactive',10,10,2);check(page2.items.length===0&&page2.digest===a.digest&&page2.total===3,'digest covers full audience independent of page');
 const loyal=await audience('loyal');check(loyal.total===1&&loyal.items[0].id===id(21),'loyal segment uses analytics recurrence');
 const absent=await audience('absent',30);check(absent.total===2&&absent.digest!==a.digest,'custom absence days bind digest');
 const empty=await audience('inactive',10,12);check(empty.total===0,'empty brand previews safely');await rejects(()=>create(empty,501),/Empty/);
 await rejects(()=>create(a,502,{digest:loyal.digest}),/Audience changed/);
 await rejects(()=>create(a,503,{brand:id(11)}),/Audience changed/);
 await rejects(()=>create(a,504,{title:' '}));await rejects(()=>create(a,505,{body:'x'.repeat(3001)}));await rejects(()=>create(a,506,{kind:'coupon'}));
 const campaign=await create(a,510,{kind:'offer'});
 check(campaign.total===3,'queued only full reviewed eligible segment');
 check(await value('SELECT name FROM platform_marketing_recipients WHERE campaign_id=$1 AND phone=$2',[campaign.campaignId,phone(20)])==='Z Brand A latest','queue keeps selected-brand name');
 check((await value('SELECT audience_filter FROM platform_marketing_campaigns WHERE id=$1',[campaign.campaignId])).analytics.contentKind==='offer','segment and content metadata persisted');
 await rejects(()=>create(a,510,{body:'Changed',kind:'offer'}),/Idempotency/);
 await rejects(()=>create(a,510,{kind:'message'}),/Idempotency/);
 await db.exec('RESET ROLE');await stamp(20);await db.exec('SET ROLE service_role');
 check(JSON.stringify(await create(a,510,{kind:'offer'}))===JSON.stringify(campaign),'lost response retry succeeds after audience changed');
 await rejects(()=>create(a,511),/Audience changed/);
 await q("UPDATE platform_marketing_recipients SET created_at=now()-interval '1 hour' WHERE campaign_id=$1 AND phone=$2",[campaign.campaignId,phone(20)]);
 const job=await value('SELECT public.platform_marketing_claim_job()');
 check(job&&job.phone!==phone(20),'claim skips recipient who returned after queueing');
 check(await value('SELECT status FROM platform_marketing_recipients WHERE campaign_id=$1 AND phone=$2',[campaign.campaignId,phone(20)])==='suppressed','returned recipient suppressed before send');
 // A return between claim and dispatch must be suppressed by finish, not endlessly requeued.
 const claimedProfile=job.phone===phone(22)?22:24;
 await db.exec('RESET ROLE');await stamp(claimedProfile);await db.exec('SET ROLE service_role');
 check(await value('SELECT public.platform_marketing_begin_dispatch($1,$2)',[job.id,job.lease_token])===false,'begin dispatch rechecks segment');
 await q("SELECT public.platform_marketing_finish_dispatch($1,$2,'queued',NULL,'RECIPIENT_UNAVAILABLE')",[job.id,job.lease_token]);
 check(await value('SELECT status FROM platform_marketing_recipients WHERE id=$1',[job.id])==='suppressed','finish suppresses changed segment rather than queue loop');
 const remaining=await value('SELECT public.platform_marketing_claim_job()');check(remaining&&remaining.phone!==job.phone,'other eligible recipient still claimable');
 check(await value('SELECT public.platform_marketing_begin_dispatch($1,$2)',[remaining.id,remaining.lease_token]),'eligible segment can begin existing dispatcher');
 await q("SELECT public.platform_marketing_finish_dispatch($1,$2,'queued',NULL,'AMBIGUOUS')",[remaining.id,remaining.lease_token]);
 check(await value('SELECT status FROM platform_marketing_recipients WHERE id=$1',[remaining.id])==='uncertain','ambiguous attempted send never requeues');
 const schedule=new Date(Date.now()+86400000).toISOString();
 const scheduled=await create(loyal,520,{scheduledAt:schedule});
 check(scheduled.total===1,'scheduled loyal campaign queued');
 check(await value('SELECT public.platform_marketing_claim_job()')===null,'future campaign not claimed');
 await db.exec('RESET ROLE');
 await q("UPDATE platform_marketing_campaigns SET scheduled_at=now()-interval '1 minute' WHERE id=$1",[scheduled.campaignId]);
 await q("UPDATE platform_marketing_sender_state SET last_dispatch_at=now()-interval '10 seconds' WHERE singleton");
 await q("UPDATE loyalty_activity_events SET occurred_at=occurred_at-interval '30 days' WHERE card_id=$1",[id(121)]);
 await db.exec('SET ROLE service_role');
 check(await value('SELECT public.platform_marketing_claim_job()')===null,'scheduled customer no longer loyal is excluded');
 check(await value('SELECT status FROM platform_marketing_recipients WHERE campaign_id=$1',[scheduled.campaignId])==='suppressed','scheduled segment reevaluated at delivery');
 check(JSON.stringify(await create(loyal,520,{scheduledAt:schedule}))===JSON.stringify(scheduled),'scheduled retry preserves original audience despite later changes');
 // Existing ordinary campaigns retain their original contact-only eligibility.
 const legacy=await value("SELECT public.platform_marketing_create_campaign($1,$2,'Legacy','Body',NULL,$3,'',$4,NULL)",[id(1),id(530),id(10),[phone(20)]]);
 const legacyJob=await value('SELECT public.platform_marketing_claim_job()');
 check(legacyJob.campaign_id===legacy.campaignId&&legacyJob.phone===phone(20),'ordinary campaigns remain unaffected by segment eligibility');
 await db.exec('RESET ROLE');
 await mkdir('output/analytics-campaigns',{recursive:true});
 await writeFile('output/analytics-campaigns/sql-checks.json',JSON.stringify({at:new Date().toISOString(),runtime:process.version,engine:'PGlite',checks,file,sha256:createHash('sha256').update(source).digest('hex'),legacyRollbackSuite:'pass',status:'pass'},null,2));
 console.log(`PASS ${checks} targeted analytics campaign SQL checks plus original campaign rollback suite`);
} catch(error){console.error(error.message,error.code??'',error.position??'',error.where??'');process.exitCode=1;}
finally{await db.close();}
