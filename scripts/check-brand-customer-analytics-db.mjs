import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const sourcePath = 'supabase/migrations/20261104104817_admin_brand_analytics.sql';
const source = await readFile(sourcePath, 'utf8');
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE ?? path.join(tmpdir(), 'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const q = (sql, args = []) => db.query(sql, args);
const value = async (sql, args = []) => Object.values((await q(sql, args)).rows[0])[0];
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const rejects = async action => { await assert.rejects(action); checks++; };
const asUser = async (user = 1, role = 'authenticated') => { await db.exec('RESET ROLE'); await q("SELECT set_config('request.jwt.claim.sub',$1,false)", [user ? id(user) : '']); await db.exec(`SET ROLE ${role}`); };
const report = (days = 30, asOf = null) => value('SELECT public.get_admin_brand_customer_analytics($1,$2)', [days,asOf]);
const detail = (brand = 10, segment = 'all', search = '', page = 1, size = 25, asOf = null, days = 30, sort = 'recent') => value('SELECT public.get_admin_brand_analytics_detail($1,$2,$3,$4,$5,$6,$7,$8)',[id(brand),days,search,segment,sort,page,size,asOf]);
const customer = (profile, brand = 10, page = 1, asOf = null) => value('SELECT public.get_admin_brand_analytics_customer($1,$2,$3,$4)',[id(brand),id(profile),page,asOf]);
try {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE SCHEMA loyalty_audit_private;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE profiles(id uuid PRIMARY KEY,role text,status text);
 CREATE TABLE cafes(id uuid PRIMARY KEY,name text,slug text,business_category text DEFAULT 'cafes_coffee',deleted_at timestamptz);
 CREATE TABLE customer_profiles(id uuid PRIMARY KEY,cafe_id uuid REFERENCES cafes(id),user_id uuid,full_name text,phone text,email text,status text DEFAULT 'active',blocked_at timestamptz,
 created_at timestamptz DEFAULT now(),phone_auth_conflict boolean DEFAULT false,phone_normalized text);
 CREATE TABLE loyalty_cards(id uuid PRIMARY KEY,cafe_id uuid REFERENCES cafes(id),customer_profile_id uuid REFERENCES customer_profiles(id),issued_at timestamptz DEFAULT now(),stamps_in_cycle integer DEFAULT 0,total_purchases integer DEFAULT 0);
 CREATE TABLE customer_reward_instances(id uuid PRIMARY KEY,cafe_id uuid,customer_id uuid,loyalty_card_id uuid,status text,redeemed_at timestamptz,reward_title text,reward_code text);
 CREATE TABLE customer_reward_redemptions(id uuid PRIMARY KEY,cafe_id uuid,customer_id uuid,reward_instance_id uuid);
 CREATE TABLE loyalty_card_events(id uuid PRIMARY KEY,cafe_id uuid,card_id uuid,created_at timestamptz,event_type text,stamps_added integer DEFAULT 1,invoice_barcode text);
 CREATE TABLE loyalty_activity_events(id uuid PRIMARY KEY,cafe_id uuid,card_id uuid,occurred_at timestamptz,kind text,outcome text DEFAULT 'success',origin text DEFAULT 'live',stamps_delta integer DEFAULT 1,reward_name text,source_event_id uuid,source_redemption_id uuid);
 CREATE TABLE loyalty_audit_private.wallet_customer_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid,card_id uuid,provider text,kind text,occurred_at timestamptz,origin text DEFAULT 'live');
 CREATE TABLE wallet_apple_registrations(card_id uuid,cafe_id uuid);
 CREATE TABLE loyalty_audit_private.settings(recording_started_at timestamptz,wallet_recording_started_at timestamptz);
 INSERT INTO loyalty_audit_private.settings VALUES(now()-interval '30 days',now()-interval '25 days');
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
 CREATE FUNCTION public.get_admin_brand_analytics(p_cafe_id uuid,p_from date,p_to date) RETURNS text LANGUAGE sql AS $$SELECT 'legacy'::text$$;
 `);
 await db.exec(source);
 await q("INSERT INTO profiles VALUES($1,'platform_admin','active'),($2,'platform_admin','suspended'),($3,'cafe_owner','active'),($4,'customer','active')",[1,2,3,4].map(id));
 await q("INSERT INTO cafes(id,name,slug) VALUES($1,'Alpha','alpha'),($2,'Beta','beta'),($3,'Empty','empty'),($4,'Deleted','deleted')",[10,11,12,13].map(id));
 await q('UPDATE cafes SET deleted_at=now() WHERE id=$1',[id(13)]);
 for (const user of [0,2,3,4]) { await asUser(user); await rejects(() => report()); await rejects(() => detail()); await rejects(() => customer(20)); }
 for (const role of ['anon','service_role']) { await asUser(1,role); await rejects(() => report()); await rejects(() => detail()); await rejects(() => customer(20)); }
 for (const role of ['anon','authenticated','service_role']) {
   await asUser(1,role);
   await rejects(() => q('SELECT * FROM brand_loyalty_analytics_private.identities'));
   await rejects(() => q('SELECT * FROM brand_loyalty_analytics_private.customers(NULL,now())'));
   await rejects(() => q('SELECT brand_loyalty_analytics_private.brand($1,30,now())',[id(10)]));
 }
 await asUser();
 const empty = await report();
 check(empty.brands.length===3 && empty.brands.every(b=>b.registeredCustomers===0), 'include empty brands and exclude deleted brands');
 check(empty.brands.every(b=>b.retention.every(r=>r.eligible===0&&r.retained===0&&r.rate===null)), 'unmatured retention is unknown, never fabricated zero');
 check(await value('SELECT public.get_admin_brand_analytics(NULL,NULL,NULL)')==='legacy','existing engagement RPC preserved');
 await rejects(()=>report(29)); await rejects(()=>report(null)); await rejects(()=>report(30,'2999-01-01')); await rejects(()=>report(30,'2000-01-01'));
 await rejects(()=>detail(10,'invalid')); await rejects(()=>detail(10,'all','',0)); await rejects(()=>detail(10,'all','',1,101)); await rejects(()=>detail(10,'all','x'.repeat(101)));
 await rejects(()=>detail(13)); await rejects(()=>customer(20));
 await db.exec('RESET ROLE');
 const now = await value('SELECT now()');
 const when = (days,hours=0) => new Date(new Date(now).getTime()-(days*24+hours)*3600000).toISOString();
 const profiles = [
 [20,10,'Recurring','966500000020',40],[21,10,'Dormant','966500000021',40],
 [22,10,'Never','966500000022',40],[23,10,'New','966500000023',2],
 [24,10,'No card','966500000024',40],[25,11,'Other brand','966500000021',40],
 [26,10,'Duplicate recurring','966500000020',35],[27,10,'Redeem only','966500000027',40],
 [28,10,'Same day','966500000028',40],[29,10,'Voided','966500000029',40],
 [30,10,'Boundary','966500000030',40],[31,10,'Old profile new card','966500000031',40],
 [32,10,'Auth conflict','966500000020',40],[33,10,'Late','966500000033',40],
 ];
 for (const [n,b,name,phone,days] of profiles) await q('INSERT INTO customer_profiles(id,cafe_id,full_name,phone,phone_normalized,created_at,phone_auth_conflict) VALUES($1,$2,$3,$4,$4,$5,$6)',[id(n),id(b),name,phone,when(days),n===32]);
 for (const [n,b,,,days] of profiles.filter(p=>p[0]!==24)) await q('INSERT INTO loyalty_cards(id,cafe_id,customer_profile_id,issued_at,stamps_in_cycle,total_purchases) VALUES($1,$2,$3,$4,2,8)',[id(n+100),id(b),id(n),when(n===31?2:days)]);
 let seq=1000;
 const stamp = async (n,days,{kind='stamp',outcome='success',hours=0,ledger=false,source=null,brand=n===25?11:10}={}) => {
   const event=id(seq++); await q('INSERT INTO loyalty_activity_events(id,cafe_id,card_id,occurred_at,kind,outcome,source_event_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[event,id(brand),id(n+100),when(days,hours),kind,outcome,source]); return event;
 };
 for(const day of [9,6,3]) await stamp(20,day);
 await stamp(26,3,{hours:1}); // duplicate identity and day, one visit
 await stamp(21,11); await stamp(21,1,{outcome:'denied'}); await stamp(21,1,{kind:'scan'});
 await stamp(25,1); // same phone at another brand must not reset Alpha inactivity
 await stamp(28,1); await stamp(28,1,{hours:1}); await stamp(28,1,{hours:2});
 await stamp(30,10); // exact boundary pinned to the captured snapshot
 await stamp(33,1);
 const ledgerId=id(seq++);
 await q("INSERT INTO loyalty_card_events VALUES($1,$2,$3,$4,'stamp',1,'ledger-dedupe')",[ledgerId,id(10),id(120),when(6)]);
 await stamp(20,6,{source:ledgerId});
 const voided=id(seq++);
 await q("INSERT INTO loyalty_card_events VALUES($1,$2,$3,$4,'stamp',1,'void-me'),($5,$2,$3,$6,'void',-1,'void-me')",[voided,id(10),id(129),when(2),id(seq++),when(1)]);
 await stamp(29,2,{source:voided});
 const reward=id(seq++);
 await q("INSERT INTO customer_reward_instances VALUES($1,$2,$3,$4,'redeemed',$5,'Reward','reward-27')",[reward,id(10),id(27),id(127),when(2)]);
 // Source-linked experience redemption must be counted only once with its persisted reward row.
 const dedupeReward=id(seq++), redemption=id(seq++);
 await q("INSERT INTO customer_reward_instances VALUES($1,$2,$3,$4,'redeemed',$5,'Reward','reward-dedupe')",[dedupeReward,id(10),id(20),id(120),when(3)]);
 await q('INSERT INTO customer_reward_redemptions VALUES($1,$2,$3,$4)',[redemption,id(10),id(20),dedupeReward]);
 await q("INSERT INTO loyalty_activity_events(id,cafe_id,card_id,occurred_at,kind,source_redemption_id) VALUES($1,$2,$3,$4,'redeem',$5)",[id(seq++),id(10),id(120),when(3),redemption]);
 await q("INSERT INTO loyalty_audit_private.wallet_customer_events(cafe_id,card_id,provider,kind,occurred_at) VALUES($1,$2,'apple','download',$3),($1,$2,'apple','download',$4),($1,$2,'google','save_link',$5),($1,$2,'apple','installed',$6)",[id(10),id(120),when(20),when(5),when(4),when(19)]);
 await q("INSERT INTO loyalty_audit_private.wallet_customer_events(cafe_id,card_id,provider,kind,occurred_at) VALUES($1,$2,'apple','download',$3)",[id(10),id(121),when(1)]);
 await q('INSERT INTO wallet_apple_registrations VALUES($1,$2)',[id(120),id(10)]);
 await asUser();
 const snap=new Date(now).toISOString();
 const d=await detail(10,'all','',1,100,snap);
 const a=d.brand;
 const c=n=>d.customers.find(c=>c.id===id(n));
 check(a.registeredCustomers===12,'same valid phone within brand deduplicated, phone conflict isolated');
 check(a.cardholders===11,'profiles without cards preserved');
 check(c(20).cardCount===2 && c(20).name==='Duplicate recurring','canonical earliest id, latest contact info');
 check(c(20).visitDays===3 && c(20).averageVisitGapDays===3 && c(20).isLoyal,'distinct-day recurrence and source dedupe');
 check(c(20).rewardsRedeemed===1,'captured redemption not doubled by reward fallback');
 check(c(21).isInactive && c(21).inactiveDays===11,'failed scans, downloads and another brand do not reset inactivity');
 check(c(22).isInactive && c(22).lastVisitAt===null,'never-active old card uses issuance as inactivity anchor');
 check(!c(23).isInactive&&!c(31).isInactive,'new cards not inactive even with old profile');
 check(c(24).cardCount===0&&c(24).cardIssuedAt===null,'no fabricated card issuance');
 check(c(27).lastRedemptionAt!==null&&!c(27).isInactive&&c(27).visitDays===1,'legacy reward redemption counts as real visit');
 check(c(28).visitDays===1&&c(28).averageVisitGapDays===null&&!c(28).isLoyal,'multiple same-day stamps not repeat visits');
 check(c(29).visitDays===0&&c(29).lastStampAt===null&&c(29).isInactive,'explicitly voided stamp is excluded');
 check(!c(30).isInactive&&c(30).inactiveDays===10,'strict more-than-ten-days boundary');
 check(c(20).wallet.downloads===2&&c(20).wallet.googleSaveLinks===1&&c(20).wallet.installedDevices===1,'wallet providers and confirmed installation kept separate');
 check(c(20).wallet.firstDownloadAt!==c(20).wallet.lastDownloadAt,'first and last wallet timestamps preserved');
 check(d.heatmap.length===168&&d.heatmap.reduce((s,h)=>s+h.visits,0)===a.visitsInPeriod,'complete Riyadh heatmap reconciles to distinct customer-days');
 check(a.retention.every(r=>r.eligible===9),'new cards and no-card profiles excluded from mature retention denominator');
 check(a.retention.every(r=>r.retained===(r.days===30?2:0)),'returns outside D7/D14 and within D30 stay in their correct windows');
 check(d.cohorts.reduce((s,c)=>s+c.issued,0)===a.cardholders,'cohorts reconcile to unique cardholders');
 const inactive=await detail(10,'inactive','',1,100,snap);
 check(inactive.total===a.inactiveCustomers&&inactive.customers.every(c=>c.isInactive),'inactive filter matches overview');
 check((await detail(10,'loyal','',1,100,snap)).total===1,'loyal filter');
 check((await detail(10,'no_card','',1,100,snap)).total===1,'no card filter');
 check((await detail(10,'all','966500000021',1,100,snap)).total===1,'phone search restricted to selected brand');
 const p1=await detail(10,'all','',1,2,snap),p2=await detail(10,'all','',2,2,snap);
 check(p1.total===12&&p1.customers.every(c=>!p2.customers.some(x=>x.id===c.id)),'stable server pagination');
 const timeline=await customer(20,10,1,snap);
 check(timeline.events.filter(e=>e.kind==='card_issued').length===2,'timeline merges cards of deduplicated customer');
 check(timeline.events.filter(e=>e.kind==='redeem').length===1,'timeline does not duplicate reward redemption');
 check(timeline.events.every(e=>!['scan','void'].includes(e.kind)),'timeline only qualifying activity and wallet events');
 await rejects(()=>customer(20,11));
 check(JSON.stringify(await report(30,snap)).includes('Duplicate recurring')===false,'overview contains no customer PII');
 await db.exec('RESET ROLE');
 // A second synthetic cohort: same-day issue activity is not a return; later local day within D7 is.
 await q('INSERT INTO customer_profiles(id,cafe_id,full_name,phone,created_at) VALUES($1,$2,$3,$4,$5)',[id(40),id(11),'Retained','966500000040',when(40)]);
 await q('INSERT INTO loyalty_cards(id,cafe_id,customer_profile_id,issued_at) VALUES($1,$2,$3,$4)',[id(140),id(11),id(40),when(40)]);
 await stamp(40,40,{brand:11}); await stamp(40,36,{brand:11});
 // Future activity after the frozen snapshot never leaks into a later export page.
 await q("INSERT INTO loyalty_activity_events(id,cafe_id,card_id,occurred_at,kind) VALUES($1,$2,$3,$4,'stamp')",[id(seq++),id(10),id(122),new Date(new Date(now).getTime()+1000).toISOString()]);
 await asUser();
 const beta=(await detail(11,'all','',1,100,snap)).brand;
 check(beta.retention.every(r=>r.eligible===2&&r.retained===1&&r.rate===50),'cumulative matured D7/D14/D30 retention includes later-day return only');
 check((await customer(22,10,1,snap)).customer.isInactive,'snapshot ignores future activity');
 check((await report(7,snap)).brands.find(b=>b.id===id(10)).visitsInPeriod < a.visitsInPeriod,'selected period changes visits only');
 await db.exec('RESET ROLE');
 const beforeMidnight = new Date(now); beforeMidnight.setUTCDate(beforeMidnight.getUTCDate()-20); beforeMidnight.setUTCHours(20,59,59,0);
 const afterMidnight = new Date(beforeMidnight.getTime()+2000);
 for (const n of [50,51,52]) {
  await q('INSERT INTO customer_profiles(id,cafe_id,full_name,phone,created_at) VALUES($1,$2,$3,$4,$5)',[id(n),id(12),`Timezone ${n}`,`9665000000${n}`,when(40)]);
  await q('INSERT INTO loyalty_cards(id,cafe_id,customer_profile_id,issued_at) VALUES($1,$2,$3,$4)',[id(n+100),id(12),id(n),n===51?beforeMidnight.toISOString():when(40)]);
 }
 for (const at of [beforeMidnight,afterMidnight]) await q("INSERT INTO loyalty_activity_events(id,cafe_id,card_id,occurred_at,kind) VALUES($1,$2,$3,$4,'stamp')",[id(seq++),id(12),id(150),at.toISOString()]);
 await q("INSERT INTO loyalty_activity_events(id,cafe_id,card_id,occurred_at,kind) VALUES($1,$2,$3,$4,'stamp')",[id(seq++),id(12),id(151),beforeMidnight.toISOString()]);
 for (const day of [3,2,1]) await stamp(52,day,{brand:12});
 await asUser();
 const timezoneDetail = await detail(12,'all','',1,100,snap);
 const timezoneCustomer=timezoneDetail.customers.find(c=>c.id===id(50));
 check(timezoneCustomer.visitDays===2&&timezoneCustomer.averageVisitGapDays===1,'21:00 UTC separates Riyadh visit dates');
 check(timezoneDetail.heatmap.some(h=>h.hour===23&&h.visits>0)&&timezoneDetail.heatmap.some(h=>h.hour===0&&h.visits>0),'heatmap hours use Riyadh midnight');
 check(timezoneDetail.customers.find(c=>c.id===id(51)).firstReturnAt===null,'activity on issuance local day is never a retained return');
 check(timezoneDetail.customers.find(c=>c.id===id(52)).isLoyal,'daily active visitors qualify as loyal within four days');
 await db.exec('RESET ROLE');
 const stateBefore=await value('SELECT count(*) FROM loyalty_activity_events');
 await asUser();
 await report(30,snap); await detail(10,'all','',1,100,snap); await customer(20,10,1,snap);
 await db.exec('RESET ROLE');
 check(await value('SELECT count(*) FROM loyalty_activity_events')===stateBefore,'read-only analytics never write loyalty events');
 await mkdir('output/brand-customer-analytics',{recursive:true});
 await writeFile('output/brand-customer-analytics/sql-checks.json',JSON.stringify({at:new Date().toISOString(),runtime:process.version,checks,sourcePath,sha256:createHash('sha256').update(source).digest('hex'),engine:'PGlite',status:'pass'},null,2));
 console.log(`PASS ${checks} brand customer analytics SQL checks`);
} catch(error) { console.error(error.message, error.code ?? '',error.position ?? '',error.where ?? ''); process.exitCode=1; }
finally { await db.close(); }
