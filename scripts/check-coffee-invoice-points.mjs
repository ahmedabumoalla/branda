import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const modulePath = process.env.PGLITE_MODULE ?? path.join(tmpdir(), "branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js");
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
const demo = "00000000-0000-4000-8000-000000000011";
const otherBrand = "00000000-0000-4000-8000-000000000012";
const actor = "00000000-0000-4000-8000-000000000001";
const cashier = "00000000-0000-4000-8000-000000000002";
const card = "00000000-0000-4000-8000-000000000003";
const customer = "00000000-0000-4000-8000-000000000004";
const migration = (file) => readFile(new URL("../supabase/migrations/" + file, import.meta.url), "utf8");
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
const tiers = [{points: 200, reward: "Coffee"}, {points: 500, reward: "Coffee and dessert"}];
const request = "00000000-0000-4000-8000-000000000005";

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema platform_access_private; create schema brand_finance_private;
    create schema loyalty_read_private; create schema employee_access_private;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
    create function public.is_platform_admin() returns boolean language sql as $$select false$$;
    create function public.is_cafe_owner(uuid) returns boolean language sql as $$select auth.uid()='${actor}'::uuid and $1='${demo}'::uuid$$;
    create function platform_access_private.service_enabled(uuid,text) returns boolean language sql as $$select current_setting('test.entitled',true) is distinct from 'no'$$;
    create table cafes(id uuid primary key,slug text,deleted_at timestamptz);
    create table cafe_loyalty_programs(cafe_id uuid primary key,enabled boolean default true,updated_at timestamptz,terms text default 'Terms',purchases_required integer default 7);
    create table cafe_loyalty_experience(cafe_id uuid,reward_validity_days integer,reward_kind text,reward_discount_percent numeric);
    create table menu_products(id uuid,cafe_id uuid,name text);
    create table loyalty_cards(id uuid primary key,cafe_id uuid,customer_profile_id uuid,status text,card_code text,
      available_rewards integer,stamps_in_cycle integer,total_purchases integer,last_used_at timestamptz,updated_at timestamptz);
    create table customer_profiles(id uuid,cafe_id uuid,status text,blocked_at timestamptz);
    create table bf_sale_customers(document_id uuid,cafe_id uuid,phone text,card_id uuid,loyalty_status text);
    create table bf_documents(id uuid,cafe_id uuid,kind text,total numeric,reference_id uuid);
    create function brand_finance_private.customer_loyalty_enabled(uuid) returns boolean language sql as $$select true$$;
    create function brand_finance_private.customer_card(uuid,text) returns uuid language sql as $$select '${card}'::uuid$$;
    create table cafe_cashiers(id uuid,cafe_id uuid,active boolean,can_use_loyalty boolean);
    create table cafe_cashier_sessions(token text,cafe_id uuid,cashier_id uuid,finance_user_id uuid,expires_at timestamptz,revoked_at timestamptz);
    create table loyalty_scan_requests(cafe_id uuid,request_id uuid,operation text check(operation in ('stamp','redeem')),
      target_code text,cashier_id uuid,actor_id uuid,result jsonb,primary key(cafe_id,request_id));
    create table employee_access_private.loyalty_scan_aliases(cafe_id uuid,user_id uuid,request_id uuid,payload jsonb,result jsonb,primary key(cafe_id,user_id,request_id));
    create table loyalty_card_events(cafe_id uuid,stamps_added integer default 0,card_id uuid,cashier_id uuid,event_type text,
      invoice_barcode text,reward_delta integer,stamps_after integer,rewards_after integer);
    create table customer_reward_instances(cafe_id uuid,customer_id uuid,loyalty_card_id uuid,source_type text,reward_title text,
      reward_description text,reward_code text unique,qr_payload text,metadata jsonb,issued_at timestamptz default now(),
      expires_at timestamptz,status text default 'available',reward_definition_id uuid,id uuid default gen_random_uuid(),redeemed_at timestamptz);
    create table customer_reward_redemptions(cafe_id uuid,reward_instance_id uuid,customer_id uuid,redeemed_by_cashier_id uuid,scanned_code text);
    create function public.make_customer_reward_code(text) returns text language sql as $$select gen_random_uuid()::text$$;
    create function public.brand_finance_loyalty_session_guard(text) returns boolean language sql as $$select true$$;
    create function employee_access_private.allows(uuid,text,boolean) returns boolean language sql as $$select current_setting('test.allows',true)='yes'
      and current_setting('test.denied',true) is distinct from $2$$;
    create function employee_access_private.loyalty_request(uuid,text,text,jsonb,uuid) returns jsonb language sql as $$
      select jsonb_build_object('status',current_setting('test.approval',true),'requestId',$5)$$;
    create function employee_access_private.assert_and_consume(uuid,text,text,jsonb,uuid) returns void language sql as $$select$$;
    insert into cafes values('${demo}','first-brand',null),('${otherBrand}','second-brand',null);
    insert into cafe_loyalty_experience values('${demo}',12,'discount',50);
    insert into cafe_cashiers values('${cashier}','${demo}',true,true);
    insert into cafe_cashier_sessions values('session','${demo}','${cashier}',null,now()+interval '1 hour',null);
    insert into loyalty_cards values('${card}','${demo}','${customer}','active','CARD',1,3,0,null,null);
    insert into customer_reward_instances(cafe_id,customer_id,loyalty_card_id,source_type,reward_title,reward_code)
      values('${demo}','${customer}','${card}','loyalty','Previous stamp reward','STAMP-PREVIOUS');
    insert into customer_profiles values('${customer}','${demo}','active',null);
    set check_function_bodies=off;
  `);
  // Load the actual historical function bodies used as anchors for the migration.
  const slice = (s, begin, end) => {
    const i = s.indexOf(begin), j = s.indexOf(end, i + begin.length);
    assert(i >= 0 && j > i, begin);
    return s.slice(i, j);
  };
  const pos = await migration("20261025201442_brand_finance_pos_customer.sql");
  await db.exec(slice(pos, "CREATE FUNCTION brand_finance_private.stamp_sale_customer(", "CREATE FUNCTION brand_finance_private.consume_customer_pending("));
  const audit = await migration("20261004112815_loyalty_activity_audit.sql");
  const scanner = slice(audit, "CREATE FUNCTION public.execute_loyalty_audited_operation(", "REVOKE ALL ON FUNCTION public.execute_loyalty_audited_operation(");
  await db.exec(scanner.replace("public.execute_loyalty_audited_operation(", "employee_access_private.execute_loyalty_before_policy("));
  const queue = await migration("20261118000602_loyalty_branch_cards.sql");
  await db.exec(slice(queue, "CREATE OR REPLACE FUNCTION loyalty_read_private.process_one_before_employee_policy(", "END $function$") + "END $function$;");
  const original = await migration("20261002234900_loyalty_experience_atomic_scanner.sql");
  await db.exec(slice(original,"CREATE FUNCTION public.snapshot_rast_loyalty_reward()", "CREATE FUNCTION public.guard_rast_loyalty_ledger()")
    .replace(" AND slug = 'rast'", ""));
  await db.exec(await migration("20261111164314_loyalty_brand_read_snapshot.sql"));
  await db.exec(await migration("20261121221223_coffee_invoice_points.sql"));
  await db.exec(await migration("20261121234500_universal_loyalty_points.sql"));
  await db.exec(await migration("20261122100400_loyalty_points_settings_conflict.sql"));
  await db.exec("set check_function_bodies=on");
  // Exercise the ledger guards even when an older environment grants direct writes.
  await db.exec("grant select,update on loyalty_cards,cafe_loyalty_programs to authenticated");
  const save = (mode, rate = 2, quantity = 1, milestones = tiers, expected = null, brand = demo) =>
    db.query("select save_loyalty_points_program($1,$2,$3,$4,$5,$6)",[brand,mode,rate,quantity,JSON.stringify(milestones),expected && JSON.stringify(expected)]);
  const earn = (amount, id = request, code = "CARD", rate = 2) =>
    scalar("select scan_loyalty_invoice_points('session',$1,$2,$3,$4,1)",[code,id,amount,rate]);
  const options = () => scalar("select get_loyalty_points_options('session','CARD')");
  const spend = (cost, title, id = randomUUID(), balance = null) =>
    scalar("select redeem_loyalty_points_reward('session','CARD',$1,$2,$3,$4)",[id,cost,title,balance]);
  await db.exec("set role anon");
  await assert.rejects(() => save("points"), {code:"42501"});
  await db.exec("reset role; set role authenticated");
  await assert.rejects(() => save("points"), {code:"42501"});
  await db.exec(`set test.actor='${actor}'`);
  await assert.rejects(() => save("points",2,1,tiers,null,otherBrand), {code:"42501"});
  await db.exec("set test.entitled='no'");
  await assert.rejects(() => save("points"), {code:"42501"});
  await db.exec("set test.entitled='yes'");
  await assert.rejects(() => save("points",2,1,tiers,null,actor), {code:"42501"});
  await save("points",2,1,tiers,{mode:"stamps",rateSar:1,rateQuantity:1,milestones:[]});
  await assert.rejects(() => db.exec("update loyalty_cards set available_loyalty_points=50"), {code:"42501"});
  await assert.rejects(() => db.exec("update cafe_loyalty_programs set points_mode='stamps'"), {code:"42501"});
  const saved = {mode:"points",rateSar:2,rateQuantity:1,milestones:tiers};
  const bolingoTiers = ["سناك مجاني 🍫","مشروب او قهوة مجانيه ❤️","اي لعبة الكترونية مجانيه😉","قيم لشخصين بولينقو😍"]
    .map((reward, index) => ({points:[200,300,500,700][index], reward}));
  await assert.rejects(() => save("points",10,1,bolingoTiers,{mode:"stamps"}), error => {
    assert.equal(error.code,"PT409");
    assert.deepEqual(JSON.parse(error.detail), saved);
    return true;
  });
  await save("points",10,1,bolingoTiers,saved);
  const updated = await scalar("select updated_at::text from cafe_loyalty_programs where cafe_id=$1", [demo]);
  await save("points",10,1,bolingoTiers,saved);
  assert.equal(await scalar("select updated_at::text from cafe_loyalty_programs where cafe_id=$1", [demo]),updated);
  await save("points",2,1,tiers,{mode:"points",rateSar:10,rateQuantity:1,milestones:bolingoTiers});
  await assert.rejects(() => save("points",2,1,[tiers[0],tiers[0]]), {code:"22023"});
  await assert.rejects(() => save("points",0), {code:"22023"});
  await assert.rejects(() => earn(11), {code:"42501"});
  await assert.rejects(() => spend(200,"Coffee"), {code:"42501"});
  await assert.rejects(options, {code:"42501"});
  await db.exec("reset role; set role service_role");
  assert.equal((await earn(1.99)).errorCode,"zero_points");
  assert.equal((await earn(11, request, "CARD", 1)).errorCode,"points_rate_changed");
  assert.equal((await earn(11, request, "MISSING")).errorCode,"card_unavailable");
  await db.exec("reset role");
  await db.query("insert into loyalty_cards(id,cafe_id,card_code,status,customer_profile_id) values($1,$2,'FOREIGNCARD','active',$3)", [randomUUID(),otherBrand,customer]);
  await db.exec("set role service_role");
  assert.equal((await earn(20, randomUUID(), "FOREIGNCARD")).errorCode,"card_unavailable");
  assert.deepEqual((await options()).affordableRewards,[]);
  const result = await earn(423.99);
  assert.equal(result.pointsAdded,211);
  assert.deepEqual(result.affordableRewards,[tiers[0]]);
  assert.deepEqual((await options()).affordableRewards,[tiers[0]]);
  assert.equal((await earn(423.99)).replayed,true);
  await assert.rejects(() => earn(12),/Scan request conflict/);
  await db.exec("reset role");
  assert.equal(await scalar("select count(*)::int from customer_reward_instances"),1);
  assert.equal((await spend(200,"Old name")).errorCode,"points_reward_changed");
  assert.equal((await spend(500,"Coffee and dessert")).errorCode,"insufficient_points");
  assert.equal((await spend(200,"Coffee",randomUUID(),210)).errorCode,"points_balance_changed");
  const spentId = randomUUID();
  const first = await spend(200,"Coffee",spentId,211);
  assert.equal(first.pointsBalance,11);
  assert.equal(first.pointsSpent,200);
  assert.deepEqual(first.affordableRewards,[]);
  assert.equal((await spend(200,"Coffee",spentId,211)).replayed,true);
  await assert.rejects(() => spend(200,"Changed",spentId),/Scan request conflict/);
  await assert.rejects(() => earn(10,spentId),/Scan request conflict/);
  assert.equal((await spend(200,"Coffee")).errorCode,"insufficient_points");
  assert.equal(await scalar("select count(*)::int from customer_reward_redemptions"),1);
  assert.equal(await scalar("select count(*)::int from loyalty_card_events where event_type='redeem'"),1);
  assert.equal(await scalar("select status from customer_reward_instances where reward_code='STAMP-PREVIOUS'"),"available");
  assert.equal(await scalar("select available_rewards from loyalty_cards where id=$1",[card]),1);
  assert.equal(await scalar("select metadata->'termsSnapshot'->>'rewardKind' from customer_reward_instances where status='redeemed'"),"custom");
  assert.equal(await scalar("select stamps_in_cycle from loyalty_cards where id=$1",[card]),3);
  await db.exec(`insert into bf_documents values('${request}','${demo}','sale',120,null);
    insert into bf_sale_customers values('${request}','${demo}','000',null,'pending_enrollment');
    select brand_finance_private.stamp_sale_customer('${request}','${card}');`);
  assert.equal(await scalar("select loyalty_status from bf_sale_customers"),"unavailable");
  assert.equal(await scalar("select total::int from bf_documents"),120);
  assert.equal(await scalar("select available_loyalty_points from loyalty_cards where id=$1",[card]),11);
  await assert.rejects(() => db.query("insert into loyalty_card_events values ($1,1)",[demo]),/Invoice amount required/);
  await db.query("insert into loyalty_card_events values ($1,1)",[actor]);
  await save("stamps",null,null,null);
  assert.equal(await scalar("select points_rate_sar from cafe_loyalty_programs"),"2.00");
  assert.deepEqual(await scalar("select points_milestones from cafe_loyalty_programs"),tiers);
  const later = "00000000-0000-4000-8000-000000000006";
  assert.equal((await earn(2,later)).errorCode,"points_mode_changed");
  assert.equal((await earn(423.99)).pointsBalance,211);
  assert.equal((await spend(200,"Coffee",spentId,211)).pointsBalance,11);
  await db.query("insert into loyalty_card_events values ($1,1)",[demo]);
  await save("points");
  await db.exec(`update cafe_cashier_sessions set finance_user_id='${actor}'; set test.allows='no'`);
  await assert.rejects(() => earn(6,later),{code:"42501"});
  await db.exec("set test.allows='yes'; set test.approval='pending'");
  assert.equal((await earn(1200,later)).status,"approval_pending");
  assert.equal(await scalar("select available_loyalty_points from loyalty_cards where id=$1",[card]),11);
  await db.exec("set test.approval='approved'");
  assert.equal((await earn(1200,later)).pointsBalance,611);
  assert.deepEqual((await options()).affordableRewards,tiers);
  assert.equal(await scalar("select count(*)::int from customer_reward_instances"),2);
  await db.exec("set test.denied='loyalty.redeem'");
  await assert.rejects(() => spend(200,"Coffee"), {code:"42501"});
  assert.equal((await options()).pointsBalance,611);
  await db.exec("set test.denied=''; set test.approval='pending'");
  const nextSpend = randomUUID();
  assert.equal((await spend(200,"Coffee",nextSpend,611)).status,"approval_pending");
  assert.equal(await scalar("select available_loyalty_points from loyalty_cards where id=$1",[card]),611);
  await db.exec("set test.approval='approved'");
  const repeat = await spend(200,"Coffee",nextSpend,611);
  assert.equal(repeat.pointsBalance,411);
  assert.deepEqual(repeat.affordableRewards,[tiers[0]]);
  assert.equal((await spend(200,"Coffee")).pointsBalance,211);
  // Two distinct requests competing for the last affordable reward.
  const attempts = await Promise.all([spend(200,"Coffee"),spend(200,"Coffee")]);
  assert.deepEqual(attempts.map(a=>a.ok).sort(),[false,true]);
  assert.equal((await options()).pointsBalance,11);
  assert.equal(await scalar("select count(*)::int from customer_reward_redemptions"),4);
  await db.exec("update cafe_cashiers set active=false");
  await assert.rejects(() => earn(6,later),{code:"42501"});
  console.log("Coffee invoice points: earning, affordable rewards, 211-200=11, repeated redemption, insufficient balance, replay, approval and stamp isolation passed");
} finally {
  await db.close();
}
