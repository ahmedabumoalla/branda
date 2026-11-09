import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
export async function runFrenchDailyStampCases(db){
 let checks=0;const check=(v,message)=>{assert.ok(v,message);checks++;};
 const q=(s,p=[])=>db.query(s,p),value=async(s,p=[])=>Object.values((await q(s,p)).rows[0])[0];
 const french='f91cbe65-1921-412b-98cc-451cccf2a86a',other='10000000-0000-4000-8000-000000000002',owner='20000000-0000-4000-8000-000000000001';
 await db.exec(`CREATE SCHEMA brand_finance_private;
 CREATE TABLE public.bf_documents(id uuid PRIMARY KEY,cafe_id uuid,total numeric,kind text,reference_id uuid,created_by uuid,number bigint);
 CREATE TABLE public.bf_sale_customers(document_id uuid PRIMARY KEY,cafe_id uuid,phone text,loyalty_status text,card_id uuid,stamp_event_id uuid);`);
 const pos=await readFile('supabase/migrations/20261025201442_brand_finance_pos_customer.sql','utf8');
 await db.exec(pos.slice(pos.indexOf('CREATE FUNCTION brand_finance_private.customer_loyalty_enabled'),pos.indexOf('CREATE FUNCTION brand_finance_private.consume_customer_pending')));
 await q("INSERT INTO cafes(id,slug,name,owner_id,owner_user_id) VALUES($1,'brand-10620d3a586c','French fixture',$2,$2)",[french,owner]);
 await q("INSERT INTO cafe_loyalty_programs(cafe_id,purchases_required,reward_name) VALUES($1,2,'Fixture reward')",[french]);
 await q("INSERT INTO subscriptions(cafe_id,plan_id,expires_at) VALUES($1,'full',now()+interval '1 month')",[french]);
 await q("INSERT INTO profiles(id,full_name,status) VALUES($1,'Owner fixture','active') ON CONFLICT DO NOTHING",[owner]);
 let n=0;
 async function card(cafe=french){const id=randomUUID(),phone='966599'+String(++n).padStart(6,'0');
  await q("INSERT INTO customer_profiles(id,cafe_id,full_name,phone,phone_normalized,status) VALUES($1,$2,'Daily cap fixture',$3,$3,'active')",[id,cafe,phone]);
  await q('SELECT public.issue_rast_loyalty_card($1)',[id]);return (await q('SELECT * FROM loyalty_cards WHERE customer_profile_id=$1',[id])).rows[0];
 }
 const c=await card();
 const historical=await card();
 await q("INSERT INTO loyalty_card_events(cafe_id,card_id,event_type,invoice_barcode,stamps_added,stamps_after,rewards_after,created_at) VALUES($1,$2,'stamp','history',2,0,0,(date_trunc('day',now() AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh')-interval '1 second')",[french,historical.id]);
 const baseline=await value('SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM loyalty_cards t');
 await db.exec(await readFile('supabase/migrations/20261109174116_french_corner_daily_stamp_limit.sql','utf8'));
 check(baseline===await value('SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM loyalty_cards t'),'migration preserves balances');
 const stamp=(c,request=randomUUID())=>value('SELECT public.apply_rast_loyalty_stamp($1,$2,$3,NULL,$4)',[c.cafe_id,c.card_code,request,owner]);
 const age=()=>q("UPDATE loyalty_card_events SET created_at=now()-interval '31 seconds' WHERE card_id=$1 AND event_type='stamp'",[c.id]);
 const firstId=randomUUID();check((await stamp(c,firstId)).status==='stamped','first stamp accepted');await age();
 check((await stamp(c)).status==='reward_issued','second stamp accepted and reward issued');await age();
 check((await stamp(c,firstId)).replayed===true,'replay at cap returns original success');
 const before=await value('SELECT to_jsonb(t) FROM loyalty_cards t WHERE id=$1',[c.id]);
 await assert.rejects(stamp(c),/Daily stamp limit reached/);checks++;
 assert.deepEqual(await value('SELECT to_jsonb(t) FROM loyalty_cards t WHERE id=$1',[c.id]),before);checks++;
 check(Number(await value("SELECT count(*) FROM loyalty_card_events WHERE card_id=$1 AND stamps_added>0",[c.id]))===2,'third leaves exactly two stamp events');
 check(Number(await value('SELECT count(*) FROM customer_reward_instances WHERE loyalty_card_id=$1',[c.id]))===1,'no extra reward after rejection');
 check((await stamp(historical)).status==='stamped','previous Saudi calendar day does not consume today');
 const another=await card();check((await stamp(another)).status==='stamped','customers have independent caps');
 const otherCard=await card(other);
 for(let i=0;i<3;i++){await stamp(otherCard);await q("UPDATE loyalty_card_events SET created_at=now()-interval '31 seconds' WHERE card_id=$1",[otherCard.id]);}
 check(Number(await value('SELECT total_purchases FROM loyalty_cards WHERE id=$1',[otherCard.id]))===3,'other brands remain uncapped');
 check(await value("SELECT (date_trunc('day','2026-11-09 21:00:00+00'::timestamptz AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh')='2026-11-09 21:00:00+00'::timestamptz"),'Saudi midnight is UTC21:00');
 check(await value("SELECT (date_trunc('day','2026-11-09 20:59:59+00'::timestamptz AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh')='2026-11-08 21:00:00+00'::timestamptz"),'second before Saudi midnight remains previous day');
 const cashier=randomUUID(),token='daily-fixture-'+randomUUID();
 await q("INSERT INTO cafe_cashiers(id,cafe_id,full_name,email,password_hash,temporary_password,can_use_loyalty) VALUES($1,$2,'Fixture',$3,'fixture','',true)",[cashier,french,cashier+'@fixture.invalid']);
 await q('INSERT INTO cafe_cashier_sessions(cafe_id,cashier_id,token) VALUES($1,$2,$3)',[french,cashier,token]);
 const rejected=await value("SELECT public.execute_loyalty_audited_operation($1,$2,$3,'stamp')",[token,c.card_code,randomUUID()]);check(rejected.errorCode==='daily_stamp_limit','audited scan reports daily cap');
 const req=randomUUID();await q("SELECT public.enqueue_loyalty_read($1,$2,'phone',$3,$4,$5)",[token,req,(await q('SELECT phone_normalized FROM customer_profiles WHERE id=$1',[c.customer_profile_id])).rows[0].phone_normalized,french,cashier]);
 await q('SELECT public.process_loyalty_reads(10,$1,ARRAY[$2::uuid])',[french,req]);
 const row=(await q('SELECT * FROM loyalty_read_private.operations WHERE request_id=$1',[req])).rows[0];
 check(row.status==='failed'&&row.error_code==='daily_stamp_limit'&&!row.retryable&&row.identifier===null,'phone queue permanently rejects cap and cannot carry excess into tomorrow');
 const reward=(await q('SELECT reward_code FROM customer_reward_instances WHERE loyalty_card_id=$1',[c.id])).rows[0];
 check((await value('SELECT public.redeem_loyalty_reward($1,$2,$3)',[token,reward.reward_code,randomUUID()])).status==='redeemed','redemption works at daily cap');
 check(!(await value('SELECT loyalty_read_private.french_daily_stamp_allowed($1,$2,1)',[french,c.id])),'redemption does not restore daily slots');
 const bulk=await card();await assert.rejects(q("INSERT INTO loyalty_card_events(cafe_id,card_id,event_type,invoice_barcode,stamps_added,stamps_after,rewards_after) VALUES($1,$2,'stamp','bulk',3,0,0)",[french,bulk.id]),/Daily stamp limit reached/);checks++;
 async function sale(c){const doc=randomUUID();const phone=await value('SELECT phone_normalized FROM customer_profiles WHERE id=$1',[c.customer_profile_id]);
  await q("INSERT INTO bf_documents(id,cafe_id,total,kind,created_by,number) VALUES($1,$2,20,'sale',$3,1)",[doc,c.cafe_id,owner]);await q("INSERT INTO bf_sale_customers(document_id,cafe_id,phone,loyalty_status) VALUES($1,$2,$3,'pending_enrollment')",[doc,c.cafe_id,phone]);return doc;
 }
 const doc=await sale(c);await q('SELECT brand_finance_private.stamp_sale_customer($1,$2)',[doc,c.id]);
 check(await value("SELECT loyalty_status='unavailable' AND stamp_event_id IS NULL FROM bf_sale_customers WHERE document_id=$1",[doc]),'POS at cap skips only the stamp');
 check(Number(await value('SELECT total FROM bf_documents WHERE id=$1',[doc]))===20,'sale stays intact');
 for(const role of ['anon','authenticated','service_role'])check(!(await value("SELECT has_function_privilege($1,'loyalty_read_private.french_daily_stamp_allowed(uuid,uuid,integer)','EXECUTE')",[role])),'private quota helper not exposed to '+role);
 if(db.connectIndependent){
  const concurrent=await card(),docs=[];for(let i=0;i<3;i++)docs.push(await sale(concurrent));
  const connections=await Promise.all(docs.map(()=>db.connectIndependent()));
  try{await Promise.all(connections.map(conn=>conn.query('SET ROLE postgres')));await Promise.all(connections.map((conn,i)=>conn.query('SELECT brand_finance_private.stamp_sale_customer($1,$2)',[docs[i],concurrent.id])));}finally{await Promise.all(connections.map(conn=>conn.end()));}
  check(Number(await value('SELECT total_purchases FROM loyalty_cards WHERE id=$1',[concurrent.id]))===2,'three real concurrent POS sessions cannot exceed two stamps');
  check(Number(await value("SELECT count(*) FROM bf_sale_customers WHERE document_id=ANY($1::uuid[]) AND loyalty_status='unavailable'",[docs]))===1,'concurrent third sale retains its invoice without stamp');
  console.log('PASS real PostgreSQL independent-session concurrency');
 }
 console.log('PASS '+checks+' French daily cap assertions');
}
