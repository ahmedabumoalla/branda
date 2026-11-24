import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
process.on('uncaughtException',error=>{console.error(error.message,error.where??'',error.detail??'');process.exit(1);});
const engine=process.env.PGLITE_MODULE??path.join(tmpdir(),'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js');
const {PGlite}=await import(pathToFileURL(engine).href);
const db=new PGlite();
const q=(s,p=[])=>db.query(s,p);
const value=async(s,p=[])=>Object.values((await q(s,p)).rows[0])[0];
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const cafe=id(1),other=id(2),owner=id(3),outsider=id(4),manager=id(5),staff=id(6),admin=id(7),a=id(10),b=id(11),foreign=id(12),cashier=id(20),idle=id(21),card=id(30),profile=id(31),qrCard=id(32),qrProfile=id(33);
let checks=0;
const eq=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++;};
const rejects=async(s,p=[])=>{await assert.rejects(q(s,p));checks++;};
const report=async(branch=null,from=null,to=null,page=1,size=25,unassigned=false)=>value('select get_owner_loyalty_branch_report($1,$2,$3,$4,\'\',$5,$6,$7)',[cafe,from,to,branch,page,size,unassigned]);
try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth;CREATE SCHEMA loyalty_read_private;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE TABLE profiles(id uuid PRIMARY KEY,full_name text,status text DEFAULT 'active',role text);
 CREATE TABLE cafes(id uuid PRIMARY KEY,owner_user_id uuid,deleted_at timestamptz);
 CREATE TABLE cafe_members(cafe_id uuid,user_id uuid,role text);
 CREATE FUNCTION is_platform_admin() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='platform_admin')$$;
 CREATE TABLE branches(id uuid PRIMARY KEY,cafe_id uuid,name text,active boolean DEFAULT true,address text,city text,phone text,hours jsonb DEFAULT '{}',created_at timestamptz DEFAULT now(),deleted_at timestamptz);
 CREATE TABLE cafe_cashiers(id uuid PRIMARY KEY,cafe_id uuid,full_name text,active boolean DEFAULT true,loyalty_branch_id uuid);
 CREATE TABLE customer_profiles(id uuid PRIMARY KEY,cafe_id uuid,full_name text,phone text);
 CREATE TABLE loyalty_cards(id uuid PRIMARY KEY,cafe_id uuid,customer_profile_id uuid,customer_name text,customer_phone text,card_code text,loyalty_branch_id uuid,issued_at timestamptz DEFAULT now());
 CREATE TABLE loyalty_read_private.operations(cafe_id uuid,request_id uuid,cashier_id uuid,cashier_name text,status text,result jsonb,completed_at timestamptz);
 CREATE TABLE loyalty_read_private.card_link_jobs(card_id uuid,cafe_id uuid,card_created boolean);
 CREATE TABLE loyalty_read_private.cashier_issued_cards(card_id uuid PRIMARY KEY);
 CREATE FUNCTION loyalty_read_private.ensure_cashier_phone_card(text,text,uuid,text,numeric,numeric,integer) RETURNS jsonb LANGUAGE plpgsql AS $$
 DECLARE card record;cashier_session record;BEGIN
 INSERT INTO loyalty_read_private.cashier_issued_cards(card_id) VALUES(card.id);
 RETURN '{}'::jsonb;END$$;
 GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
 `);
 const original=await readFile('supabase/migrations/20261004112815_loyalty_activity_audit.sql','utf8');
 await db.exec(original.slice(original.indexOf('CREATE SCHEMA'),original.indexOf('CREATE FUNCTION loyalty_audit_private.capture_ledger_event')));
 const wallet=await readFile('supabase/migrations/20261004121343_admin_brand_customers.sql','utf8');
 await db.exec(wallet.slice(wallet.indexOf('CREATE TABLE loyalty_audit_private.wallet_customer_events'),wallet.indexOf('CREATE FUNCTION loyalty_audit_private.capture_wallet_registration')));
 await q('insert into profiles(id,full_name,role) values($1,\'Owner\',\'cafe_owner\'),($2,\'Outsider\',\'cafe_owner\'),($3,\'Manager\',\'cafe_manager\'),($4,\'Staff\',\'cafe_staff\'),($5,\'Admin\',\'platform_admin\')',[owner,outsider,manager,staff,admin]);
 await q('insert into cafes values($1,$3,null),($2,$4,null)',[cafe,other,owner,outsider]);
 await q('insert into cafe_members values($1,$2,\'manager\'),($1,$3,\'staff\')',[cafe,manager,staff]);
 await q('insert into branches(id,cafe_id,name,address,city,phone,hours) values($1,$3,\'Branch A\',\'Address A\',\'City A\',\'Phone A\',\'{"summary":"Hours A"}\'),($2,$3,\'Branch B\',null,null,null,null),($4,$5,\'Foreign\',null,null,null,null)',[a,b,cafe,foreign,other]);
 await q('insert into cafe_cashiers(id,cafe_id,full_name,loyalty_branch_id,active) values($1,$3,\'Cashier\',$4,true),($2,$3,\'Inactive employee\',$4,false)',[cashier,idle,cafe,a]);
 await q('insert into customer_profiles values($1,$3,\'Cashier customer\',\'966500000001\'),($2,$3,\'QR customer\',\'966500000002\')',[profile,qrProfile,cafe]);
 await q('insert into loyalty_cards values($1,$3,$4,\'Cashier customer\',\'966500000001\',\'CARD0001\',$6,\'2026-11-01Z\'),($2,$3,$5,\'QR customer\',\'966500000002\',\'CARD0002\',$6,\'2026-11-02Z\')',[card,qrCard,cafe,profile,qrProfile,a]);
 await q('insert into loyalty_read_private.operations values($1,$2,$3,\'Cashier snapshot\',\'succeeded\',$4,\'2026-11-01Z\')',[cafe,id(40),cashier,JSON.stringify({cardCreated:true,cardId:card})]);
 await q('insert into loyalty_read_private.cashier_issued_cards values($1)',[card]);
 await q('insert into loyalty_activity_events(cafe_id,occurred_at,kind,outcome,actor_type,cashier_id,card_id,stamps_delta) values($1,\'2026-11-03Z\',\'stamp\',\'success\',\'cashier\',$2,$3,1)',[cafe,cashier,card]);
 await q('insert into loyalty_audit_private.wallet_customer_events(cafe_id,card_id,provider,kind,occurred_at) values($1,$2,\'apple\',\'download\',\'2026-11-04Z\'),($1,$2,\'apple\',\'download\',\'2026-11-05Z\'),($1,$2,\'apple\',\'installed\',\'2026-11-05Z\'),($1,$3,\'google\',\'save_link\',\'2026-11-06Z\')',[cafe,qrCard,card]);
 await db.exec(await readFile('supabase/migrations/20261124161000_loyalty_branch_reporting.sql','utf8'));
 await q("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
 let r=await report();
 eq(r.summary.issuedCards,2,'Issuance independent of download');eq(r.summary.downloadedCards,1,'Repeated Apple download and install deduplicate');eq(r.summary.googleSaveLinks,1,'Google link separate');eq(r.summary.appleInstalledCards,1);
 eq(r.summary.stamps,1);eq(r.branches.find(x=>x.id===a).stamps,0,'Old stamp not assigned using current cashier');eq(r.branches.find(x=>x.id===null).stamps,1,'Old stamp explicitly unassigned');
 eq(r.customers.find(x=>x.cardId===card).source,'cashier');eq(r.customers.find(x=>x.cardId===card).cashierName,'Cashier snapshot');eq(r.staff.length,2,'Idle/inactive staff included');
 eq(r.customers.find(x=>x.cardId===qrCard).source,'unknown','Historical registration channel is never guessed');
 eq(r.branches.find(x=>x.id===a).workingHours,'Hours A');eq(r.customers.find(x=>x.cardId===qrCard).downloadedAt!==null,true);
 let activity=await value('select get_owner_loyalty_activity_v2($1)',[cafe]);eq(activity.summary.issuedCards,2);eq(activity.summary.downloadedCards,1);eq(activity.events.filter(x=>x.kind==='issue').length,2);eq(activity.events.some(x=>x.kind==='save_link'),true);
 await q('update cafe_cashiers set loyalty_branch_id=$1 where id=$2',[b,cashier]);
 await q('insert into loyalty_activity_events(cafe_id,occurred_at,kind,outcome,actor_type,cashier_id,card_id,stamps_delta) values($1,\'2026-11-10Z\',\'stamp\',\'success\',\'cashier\',$2,$3,2)',[cafe,cashier,card]);
 await q('update cafe_cashiers set loyalty_branch_id=$1 where id=$2',[a,cashier]);
 r=await report(b);eq(r.summary.stamps,2,'Action branch stays B after staff transfer');eq(r.summary.issuedCards,0,'Foreign issuance branch not counted');eq(r.customers.length,1,'Visiting card from A included in B');eq(r.customers[0].branchId,a,'Original issuance branch preserved');
 activity=await value('select get_owner_loyalty_activity_v2($1,null,null,null,null,null,\'\',1,25,$2,false)',[cafe,b]);eq(activity.events.length,1);eq(activity.events[0].branchId,b);
 eq(activity.branches.some(x=>x.id===a),true,'Branch comparison remains complete when B selected');
 eq(activity.employees.length,1,'Selected branch includes original actor but not irrelevant idle employees');
 r=await value('select get_owner_loyalty_branch_report($1,null,null,null,$2)',[cafe,'QR customer']);
 eq(r.summary.customers,1);eq(r.summary.issuedCards,1);eq(r.summary.downloadedCards,1);eq(r.summary.googleSaveLinks,0);eq(r.summary.stamps,0);eq(r.staff.length,0,'Search excludes unrelated staff');
 await q('insert into loyalty_activity_events(cafe_id,occurred_at,kind,outcome,origin,actor_type,cashier_id,card_id,stamps_delta) values($1,\'2026-10-01Z\',\'stamp\',\'success\',\'historical\',\'cashier\',$2,$3,4)',[cafe,cashier,card]);
 eq(await value('select branch_id from loyalty_activity_events where origin=\'historical\' and stamps_delta=4'),null,'Later historical backfill never uses current branch');
 await rejects('update loyalty_activity_events set branch_id=$1 where cafe_id=$2',[b,cafe]);await rejects('delete from loyalty_audit_private.card_issuances where cafe_id=$1',[cafe]);
 await rejects('select get_owner_loyalty_branch_report($1,null,null,$2)',[cafe,foreign]);await rejects('select get_owner_loyalty_branch_report($1,null,null,null,\'\',0)',[cafe]);
 eq((await report(a,'2026-11-04Z','2026-11-07Z')).summary.issuedCards,0);eq((await report(a,'2026-11-04Z','2026-11-07Z')).summary.downloadedCards,1);
 assert(Date.parse((await report(a,'2026-11-04Z','2026-11-07Z')).asOf)>Date.parse('2026-11-07Z'),'Report generation time is not historical filter end');checks++;
 const first=await report(null,null,null,1,1),second=await report(null,null,first.asOf,2,1);eq(first.total,2);eq(second.total,2);assert.notEqual(first.customers[0].cardId,second.customers[0].cardId);checks++;
 // Deferred capture sees proven cashier metadata only after the creating transaction completes
 await db.exec('BEGIN');
 await q('insert into loyalty_cards values($1,$2,$3,\'New customer\',\'966500000003\',\'CARD0003\',$4,now())',[id(50),cafe,id(51),a]);
 await q('insert into loyalty_read_private.cashier_issued_cards values($1,$2,\'Actual issuer\')',[id(50),cashier]);
 eq(await value('select count(*)::int from loyalty_audit_private.card_issuances where card_id=$1',[id(50)]),0);
 await db.exec('COMMIT');
 eq(await value('select cashier_name from loyalty_audit_private.card_issuances where card_id=$1',[id(50)]),'Actual issuer');
 await db.exec('BEGIN');await q('insert into loyalty_cards values($1,$2,$3,\'Rolled back\',null,\'CARD0004\',$4,now())',[id(60),cafe,id(61),a]);await db.exec('ROLLBACK');
 eq(await value('select count(*)::int from loyalty_audit_private.card_issuances where card_id=$1',[id(60)]),0);
 for(const who of [outsider,staff]){await q("select set_config('request.jwt.claim.sub',$1,false)",[who]);await rejects('select get_owner_loyalty_branch_report($1)',[cafe]);await rejects('select get_owner_loyalty_activity_v2($1)',[cafe]);}
 for(const who of [owner,manager,admin]){await q("select set_config('request.jwt.claim.sub',$1,false)",[who]);await db.exec('SET ROLE authenticated');eq((await report()).summary.issuedCards,3);await db.exec('RESET ROLE');}
 await db.exec('SET ROLE anon');await rejects('select get_owner_loyalty_branch_report($1)',[cafe]);await db.exec('RESET ROLE');
 await db.exec('SET ROLE service_role');await rejects('select get_owner_loyalty_branch_report($1)',[cafe]);await db.exec('RESET ROLE');
 eq(await value("select has_table_privilege('authenticated','loyalty_audit_private.card_issuances','SELECT')"),false);
 await q("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
 await q(`INSERT INTO loyalty_cards(id,cafe_id,customer_profile_id,customer_name,customer_phone,card_code,loyalty_branch_id,issued_at)
 SELECT ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1,
 ('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Bulk '||n,'966500000000','BULK'||n,$2,'2026-11-15Z'
 FROM generate_series(1,1001) n`,[cafe,a]);
 const bulkFirst=await report(null,null,null,1,500),bulkSecond=await report(null,null,bulkFirst.asOf,2,500),bulkThird=await report(null,null,bulkFirst.asOf,3,500);
 eq(bulkFirst.total,1004);eq(bulkFirst.customers.length,500);eq(bulkSecond.customers.length,500);eq(bulkThird.customers.length,4);
 eq(new Set([...bulkFirst.customers,...bulkSecond.customers,...bulkThird.customers].map(x=>x.cardId)).size,1004,'Stable full export beyond1000cards');
 console.log(`PASS branch report SQL: ${checks} issuance/download deduplication, snapshots, transfers, history, pagination, rollback and authorization checks`);
}finally{await db.close();}
