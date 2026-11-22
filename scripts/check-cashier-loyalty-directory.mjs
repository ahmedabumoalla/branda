import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const engine = process.env.PGLITE_MODULE ?? path.join(tmpdir(), "branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js");
const { PGlite } = await import(pathToFileURL(engine).href);
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [brand, other, cashierMember, walletMember, guest, foreignMember, newMember] = [1, 2, 3, 4, 5, 6, 7].map(id);
const list = async (cafe = brand, page = 0, query = "") =>
  (await db.query("SELECT public.finance_loyalty_customers_read($1,$2,$3) AS result", [cafe, page, query])).rows[0].result;
const detail = async customer =>
  (await db.query("SELECT public.finance_loyalty_customer_detail($1,$2) AS result", [brand, customer])).rows[0].result;
const enroll = (cafe, customer, name) => db.query(
  "INSERT INTO customer_profiles(id,cafe_id,full_name,phone) VALUES ($1,$2,$3,'test-only')", [customer, cafe, name]
);
const issue = (cafe, customer) => db.query(
  "INSERT INTO loyalty_cards(id,cafe_id,customer_profile_id) VALUES ($1,$2,$1)", [customer, cafe]
);
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA brand_finance_private; CREATE SCHEMA loyalty_audit_private;
    CREATE SCHEMA platform_access_private;
    CREATE FUNCTION brand_finance_private.role_for(uuid) RETURNS text LANGUAGE sql AS 'SELECT ''owner''::text';
    CREATE FUNCTION platform_access_private.service_enabled(uuid,text) RETURNS boolean LANGUAGE sql AS 'SELECT true';
    CREATE TABLE customer_profiles(id uuid PRIMARY KEY,cafe_id uuid,full_name text,phone text,birth_date date,created_at timestamptz DEFAULT now());
    CREATE TABLE loyalty_cards(id uuid,cafe_id uuid,customer_profile_id uuid,available_loyalty_points integer DEFAULT 0,UNIQUE(cafe_id,customer_profile_id));
    CREATE TABLE cafe_loyalty_programs(cafe_id uuid,points_mode text,points_milestones jsonb);
    CREATE TABLE loyalty_card_events(cafe_id uuid,card_id uuid,event_type text,invoice_barcode text,created_at timestamptz DEFAULT now(),stamps_added integer DEFAULT 0);
    CREATE TABLE customer_reward_instances(cafe_id uuid,loyalty_card_id uuid,source_type text,status text,reward_code text,expires_at timestamptz,metadata jsonb);
    CREATE TABLE loyalty_audit_private.wallet_customer_events(cafe_id uuid,card_id uuid,kind text);
    CREATE TABLE wallet_apple_registrations(cafe_id uuid,card_id uuid);
    CREATE FUNCTION public.loyalty_birthday_enabled(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';
    CREATE FUNCTION brand_finance_private.loyalty_directory_authorized(uuid) RETURNS boolean LANGUAGE sql
      AS $$ SELECT $1 = '${brand}'::uuid $$;
  `);
  await db.exec(await readFile("supabase/migrations/20261114205000_finance_loyalty_customer_directory.sql", "utf8"));
  await enroll(brand, cashierMember, "عميل الولاء");
  await enroll(brand, walletMember, "Wallet");
  await enroll(brand, guest, "Order only");
  await enroll(other, foreignMember, "Other");
  await issue(brand, cashierMember);
  await issue(brand, walletMember);
  await issue(other, foreignMember);
  await db.query("INSERT INTO cafe_loyalty_programs VALUES ($1,'points',$2)", [brand, JSON.stringify([{points: 10}, {points: 200}])]);
  await db.query("UPDATE loyalty_cards SET available_loyalty_points=11 WHERE id=$1", [cashierMember]);
  await db.query(`INSERT INTO loyalty_card_events(cafe_id,card_id,event_type,invoice_barcode,stamps_added) VALUES
    ($1,$2,'stamp','a',2),($1,$2,'stamp','b',1),($1,$2,'void','b',0),
    ($1,$2,'redeem','POINTS-1',0),($1,$2,'redeem','POS-4',0),($1,$2,'redeem',null,0),
    ($3,$2,'stamp','foreign',50)`, [brand, cashierMember, other]);
  await db.query(`INSERT INTO customer_reward_instances VALUES
    ($1,$2,'loyalty','available','available',null,'{}'),($1,$2,'loyalty','available','expired',now() - interval '1 day','{}'),
    ($1,$2,'loyalty','redeemed','POINTS-1',null,'{"source":"invoice_points"}'),
    ($1,$2,'loyalty','redeemed','stamp',null,'{"financeDocumentNumber":4}'),
    ($1,$2,'loyalty','redeemed','receipt-only',null,'{}'),
    ($1,$2,'experience','available','other',null,'{}'),($3,$2,'loyalty','available','foreign',null,'{}')`, [brand, cashierMember, other]);
  await db.query("INSERT INTO wallet_apple_registrations VALUES ($1,$2)", [brand, walletMember]);
  assert.deepEqual((await list()).rows.map(row => row.id), [walletMember]);
  await db.exec(await readFile("supabase/migrations/20261122094921_cashier_members_in_loyalty_directory.sql", "utf8"));
  await db.exec("SET ROLE authenticated");
  const initial = await list();
  assert.equal(initial.total, 2);
  assert.deepEqual(new Set(initial.rows.map(row => row.id)), new Set([cashierMember, walletMember]));
  assert.deepEqual(Object.keys(initial.rows[0]).sort(), ["id", "joinedAt", "loyalty", "name"]);
  const metrics = {stampsCollected: 2, rewardsRedeemed: 4, availableStampRewards: 1, pointsBalance: 11, affordablePointRewards: 1};
  assert.deepEqual(initial.rows.find(row => row.id === cashierMember).loyalty, metrics);
  const general = (await db.query("SELECT public.loyalty_customer_directory_page($1,0,'',false) AS result", [brand])).rows[0].result;
  assert.equal(general.total, 3);
  assert.equal(general.rows.find(row => row.id === guest).loyalty, null);
  assert.deepEqual(general.rows.find(row => row.id === cashierMember).loyalty, metrics);
  assert.equal((await list(brand, 0, '%')).total, 0);
  assert.equal((await detail(cashierMember)).phone, "test-only");
  assert.equal((await detail(walletMember)).birthdayEnabled, true);
  assert.equal((await list(brand, 500, "الولاء")).rows[0].id, cashierMember);
  await assert.rejects(detail(guest), /LOYALTY_CUSTOMER_UNAVAILABLE/);
  await assert.rejects(detail(foreignMember), /LOYALTY_CUSTOMER_UNAVAILABLE/);
  await assert.rejects(list(other), /LOYALTY_FORBIDDEN/);
  await db.exec("RESET ROLE");
  await db.query("UPDATE cafe_loyalty_programs SET points_mode='stamps' WHERE cafe_id=$1", [brand]);
  await enroll(brand, newMember, "عميل الولاء");
  await issue(brand, newMember);
  await db.exec("SET ROLE authenticated");
  const next = await list();
  assert.equal(next.total, 3);
  assert.equal(next.rows[0].id, newMember);
  assert.deepEqual(next.rows.find(row => row.id === cashierMember).loyalty, {...metrics, affordablePointRewards:null});
  assert.deepEqual(next.rows[0].loyalty, {stampsCollected:0,rewardsRedeemed:0,availableStampRewards:0,pointsBalance:0,affordablePointRewards:null});
  assert.equal((await detail(newMember)).id, newMember);
  await db.exec("RESET ROLE");
  await db.query(`WITH added AS (
    INSERT INTO customer_profiles(id,cafe_id,full_name,created_at)
    SELECT gen_random_uuid(),$1,'Page member',now() FROM generate_series(1,25) RETURNING id,cafe_id
  ) INSERT INTO loyalty_cards(id,cafe_id,customer_profile_id) SELECT id,cafe_id,id FROM added`, [brand]);
  await db.exec("SET ROLE authenticated");
  const first = await list(brand, 0, 'Page member');
  const last = await list(brand, 90, 'Page member');
  assert.equal(first.rows.length, 20);
  assert.equal(last.page, 1);
  assert.equal(last.total, 25);
  assert.equal(new Set([...first.rows,...last.rows].map(r => r.id)).size, 25);
  assert.deepEqual(await list(brand, 20, 'missing'), {rows:[],total:0,page:0,pageSize:20});
  await db.exec("RESET ROLE; SET ROLE anon");
  await assert.rejects(list(), /permission denied/);
  await assert.rejects(db.query("SELECT public.loyalty_customer_directory_page($1,0,'',false)", [brand]), /permission denied/);
  console.log("PASS cashier membership, historical stamps and redemption, expiration, points balance and eligibility, paging and tenant isolation");
} finally {
  await db.close();
}
