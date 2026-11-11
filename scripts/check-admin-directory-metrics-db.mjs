import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(path.join(os.tmpdir(), 'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let checks = 0;
const check = (value, message) => { assert(value, message); checks++; };
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE TABLE profiles(id uuid PRIMARY KEY, role text, status text);
    CREATE TABLE cafes(id uuid PRIMARY KEY, deleted_at timestamptz);
    CREATE TABLE menu_products(cafe_id uuid,deleted_at timestamptz);
    CREATE TABLE offers(cafe_id uuid,deleted_at timestamptz);
    CREATE TABLE branches(cafe_id uuid,deleted_at timestamptz);
    CREATE TABLE customer_profiles(cafe_id uuid);
    CREATE TABLE orders(cafe_id uuid,total numeric);
    CREATE TABLE experience_reward_submissions(cafe_id uuid,status text);
    CREATE TABLE loyalty_cards(cafe_id uuid);
    CREATE TABLE brand_support_tickets(cafe_id uuid);
    GRANT USAGE ON SCHEMA public,auth TO authenticated;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
    INSERT INTO profiles VALUES('${id(1)}','platform_admin','active'),('${id(2)}','cafe_owner','active'),('${id(3)}','platform_admin','disabled');
    INSERT INTO cafes VALUES('${id(11)}',NULL),('${id(12)}',NULL),('${id(13)}',now());
    INSERT INTO menu_products VALUES('${id(11)}',NULL),('${id(11)}',now()),('${id(12)}',NULL);
    INSERT INTO offers VALUES('${id(11)}',NULL),('${id(11)}',now());
    INSERT INTO branches VALUES('${id(11)}',NULL),('${id(11)}',now());
    INSERT INTO customer_profiles VALUES('${id(11)}'),('${id(11)}'),('${id(12)}');
    INSERT INTO orders SELECT '${id(11)}',2.50 FROM generate_series(1,1500);
    INSERT INTO orders VALUES('${id(12)}',900),('${id(13)}',1000);
    INSERT INTO experience_reward_submissions VALUES('${id(11)}','pending'),('${id(11)}','approved'),('${id(11)}','redeemed'),('${id(11)}','rejected');
    INSERT INTO loyalty_cards VALUES('${id(11)}'); INSERT INTO brand_support_tickets VALUES('${id(11)}');`);
  await db.exec(await fs.readFile('supabase/migrations/20261111162104_admin_brand_directory_metrics.sql', 'utf8'));
  const call = ids => db.query('SELECT * FROM public.admin_brand_directory_metrics($1)', [ids]);
  for (const role of ['anon', 'service_role']) {
    check(!(await db.query("SELECT has_function_privilege($1,'public.admin_brand_directory_metrics(uuid[])','EXECUTE') AS allowed", [role])).rows[0].allowed, `${role} denied`);
  }
  check((await db.query("SELECT NOT prosecdef AS invoker FROM pg_proc WHERE oid='public.admin_brand_directory_metrics(uuid[])'::regprocedure")).rows[0].invoker, 'retains RLS invoker');
  await assert.rejects(() => call([id(11)]), /brand_directory_forbidden/); checks++;
  for (const actor of [2,3]) {
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id(actor)]);
    await assert.rejects(() => call([id(11)]), /brand_directory_forbidden/); checks++;
  }
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id(1)]);
  await db.exec('SET ROLE authenticated');
  const rows = (await call([id(11),id(11),id(13),id(99)])).rows;
  check(rows.length === 1 && rows[0].cafe_id === id(11), 'only requested nondeleted brand, deduplicated');
  const row=rows[0];
  for (const [key, value] of Object.entries({products_count:1,offers_count:1,branches_count:1,customers_count:2,orders_count:1500,experience_submissions_count:4,experience_rewards_count:2,loyalty_cards_count:1,support_tickets_count:1,total_revenue:3750})) check(Number(row[key])===value,key);
  check((await call([])).rows.length===0,'empty batch');
  check(Number((await call([id(12)])).rows[0].total_revenue)===900,'second tenant isolated');
  for(const ids of [null,[null],Array(101).fill(id(11))]) { await assert.rejects(()=>call(ids),/brand_directory_invalid_batch/); checks++; }
  await db.exec('RESET ROLE; ALTER TABLE orders ENABLE ROW LEVEL SECURITY');
  await db.exec(`CREATE POLICY restricted_test ON orders TO authenticated USING(cafe_id='${id(12)}')`);
  await db.exec('SET ROLE authenticated');
  const restricted=(await call([id(11)])).rows[0];
  check(Number(restricted.total_revenue)===0 && Number(restricted.orders_count)===0,'function cannot bypass caller RLS');
  console.log(`PASS ${checks} SQL directory aggregation, full totals beyond API row limit, bounds, active-admin authorization and RLS scenarios`);
} finally { await db.close(); }
