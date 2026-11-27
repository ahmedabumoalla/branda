import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function checkFaroujStampInterval(db) {
  const brand = "ec9b4415-b68e-4554-acbd-c918bd5cc2f2";
  const owner = "20000000-0000-4000-8000-000000000001";
  const other = "10000000-0000-4000-8000-000000000002";
  const q = (sql, args = []) => db.query(sql, args);
  const value = async (sql, args = []) => Object.values((await q(sql, args)).rows[0])[0];
  await q("INSERT INTO cafes(id,slug,name,owner_id,owner_user_id) VALUES($1,'farouj-test','Fixture',$2,$2)", [brand, owner]);
  await q("INSERT INTO cafe_loyalty_programs(cafe_id,purchases_required,reward_name) VALUES($1,2,'Reward')", [brand]);
  await q("INSERT INTO subscriptions(cafe_id,plan_id,expires_at) VALUES($1,'full',now()+interval '1 month')", [brand]);

  let seq = 0;
  async function card(cafe = brand) {
    const id = randomUUID(), phone = "966566" + String(++seq).padStart(6, "0");
    await q("INSERT INTO customer_profiles(id,cafe_id,full_name,phone,phone_normalized,status) VALUES($1,$2,'Fixture',$3,$3,'active')", [id, cafe, phone]);
    await q("SELECT public.issue_rast_loyalty_card($1)", [id]);
    return (await q("SELECT * FROM loyalty_cards WHERE customer_profile_id=$1", [id])).rows[0];
  }
  const stampSQL = "SELECT public.apply_rast_loyalty_stamp($1,$2,$3,NULL,$4) AS result";
  const stamp = (c, request = randomUUID()) => value(stampSQL, [c.cafe_id,c.card_code,request,owner]);
  const lastStamp = "SELECT max(created_at) FROM loyalty_card_events WHERE card_id=$1 AND stamps_added>0";
  const a = await card(), request = randomUUID();
  assert.equal((await stamp(a,request)).status, "stamped");
  await db.exec(await readFile("supabase/migrations/20261127173000_farouj_card_stamp_interval.sql","utf8"));
  assert.equal((await stamp(a,request)).replayed, true);
  const snapshot = await value("SELECT to_jsonb(c) FROM loyalty_cards c WHERE id=$1", [a.id]);
  assert.equal((await stamp(a)).status, "recent_scan");
  assert.deepEqual(await value("SELECT to_jsonb(c) FROM loyalty_cards c WHERE id=$1", [a.id]), snapshot);
  for (const [elapsed,allowed] of [["29 minutes 59.999999 seconds",false],["30 minutes",true]]) {
    assert.equal(await value("SELECT loyalty_read_private.farouj_stamp_allowed($1,("+lastStamp+")+$2::interval)", [a.id,elapsed]), allowed);
  }
  const cashier = randomUUID(), token = "interval-test-" + cashier;
  await q("INSERT INTO cafe_cashiers(id,cafe_id,full_name,email,password_hash,temporary_password,can_use_loyalty) VALUES($1,$2,'Fixture',$3,'fixture','',true)", [cashier,brand,cashier+"@example.invalid"]);
  await q("INSERT INTO cafe_cashier_sessions(cafe_id,cashier_id,token) VALUES($1,$2,$3)", [brand,cashier,token]);
  const queued = randomUUID();
  await q("SELECT public.enqueue_loyalty_read($1,$2,'phone',$3,$4,$5)",[token,queued,a.customer_phone,brand,cashier]);
  await q("SELECT public.process_loyalty_reads(10,$1,ARRAY[$2::uuid])",[brand,queued]);
  const op = (await q("SELECT status,retryable,error_code FROM loyalty_read_private.operations WHERE request_id=$1",[queued])).rows[0];
  assert.deepEqual(op, {status:"duplicate",retryable:false,error_code:"recent_scan"});
  const doc = randomUUID();
  await q("INSERT INTO bf_documents(id,cafe_id,total,kind,number) VALUES($1,$2,20,'sale',1)",[doc,brand]);
  await q("INSERT INTO bf_sale_customers(document_id,cafe_id,phone,loyalty_status) VALUES($1,$2,$3,'pending_enrollment')",[doc,brand,a.customer_phone]);
  await q("SELECT brand_finance_private.stamp_sale_customer($1,$2)",[doc,a.id]);
  assert.equal(await value("SELECT loyalty_status FROM bf_sale_customers WHERE document_id=$1",[doc]), "unavailable");
  assert.equal(Number(await value("SELECT total FROM bf_documents WHERE id=$1",[doc])),20);

  const b = await card();
  const insert = "INSERT INTO loyalty_card_events(cafe_id,card_id,event_type,invoice_barcode,stamps_added,stamps_after,rewards_after,created_at) VALUES($1,$2,'stamp',$3,$4,1,0,now()-interval '1 day')";
  await assert.rejects(q(insert,[brand,b.id,"bulk",2]),/30/);
  await q(insert,[brand,b.id,"once",1]);
  assert.equal(await value("SELECT ("+lastStamp+") > now()-interval '1 minute'",[b.id]),true);
  await assert.rejects(q(insert,[brand,b.id,"backdated",1]),/30/);
  await q("UPDATE loyalty_card_events SET created_at=clock_timestamp()-interval '30 minutes' WHERE card_id=$1",[a.id]);
  assert.equal((await stamp(a)).status, "reward_issued");
  const otherCard = await card(other);
  await stamp(otherCard);
  await q("UPDATE loyalty_card_events SET created_at=clock_timestamp()-interval '31 seconds' WHERE card_id=$1",[otherCard.id]);
  assert.equal((await stamp(otherCard)).status !== "recent_scan",true);
  if (db.connectIndependent) {
    const fresh = await card();
    const connections = await Promise.all([db.connectIndependent(),db.connectIndependent()]);
    try {
      await Promise.all(connections.map(c=>c.query("SET ROLE postgres")));
      const replies = await Promise.all(connections.map(c=>c.query(stampSQL,[brand,fresh.card_code,randomUUID(),owner])));
      assert.deepEqual(replies.map(r=>r.rows[0].result.status).sort(),["recent_scan","stamped"]);
      assert.equal(Number(await value("SELECT count(*) FROM loyalty_card_events WHERE card_id=$1 AND stamps_added>0",[fresh.id])),1);
    } finally { await Promise.all(connections.map(c=>c.end())); }
    console.log("PASS simultaneous Farouj stamps from independent PostgreSQL sessions");
  }
  console.log("PASS Farouj per-card interval, past stamps, replay, cutoff, queue, POS, bulk and tenant isolation");
}
