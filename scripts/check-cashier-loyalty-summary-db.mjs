import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const engine = process.env.PGLITE_MODULE ?? path.join(tmpdir(), 'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js');
const { PGlite } = await import(pathToFileURL(engine).href);
const db = new PGlite();
const sql = (query, params = []) => db.query(query, params);
const scalar = async (query, params = []) => Object.values((await sql(query, params)).rows[0])[0];
const cafe = '10000000-0000-4000-8000-000000000001', otherCafe = '10000000-0000-4000-8000-000000000002';
const cashier = '20000000-0000-4000-8000-000000000001', otherCashier = '20000000-0000-4000-8000-000000000002';
const customer = '30000000-0000-4000-8000-000000000001', otherCustomer = '30000000-0000-4000-8000-000000000002';
const card = '40000000-0000-4000-8000-000000000001', otherCard = '40000000-0000-4000-8000-000000000002';
const owner = '50000000-0000-4000-8000-000000000001';
let checks = 0;
const check = (actual, expected, name) => { assert.deepEqual(actual, expected, name); checks++; };
const lookup = (value = '123', method = 'code', expectedCafe = cafe, expectedCashier = cashier, verified = false, token = 'valid') => scalar('SELECT public.get_cashier_loyalty_summary($1,$2,$3,$4,$5,$6)', [token, expectedCafe, expectedCashier, method, value, verified]);
async function denied(update, reset, name, code = null) {
  await db.exec(update);
  if (code) check((await lookup()).code, code, name);
  else { await assert.rejects(lookup(), /permission denied/i, name); checks++; }
  await db.exec(reset);
}
try {
  // A minimal real PostgreSQL fixture; the existing permission function itself
  // is loaded unchanged, while service entitlement has a deterministic fixture.
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA platform_access_private;
    CREATE TABLE cafes(id uuid PRIMARY KEY,status text DEFAULT 'active',deleted_at timestamptz,loyalty_enabled boolean DEFAULT true);
    CREATE TABLE profiles(id uuid PRIMARY KEY,status text DEFAULT 'active');
    CREATE TABLE cafe_cashiers(id uuid PRIMARY KEY,cafe_id uuid,active boolean DEFAULT true,can_use_loyalty boolean DEFAULT true,owner_user_id uuid);
    CREATE TABLE cafe_cashier_sessions(id uuid DEFAULT gen_random_uuid(),token text UNIQUE,cafe_id uuid,cashier_id uuid,expires_at timestamptz DEFAULT now()+interval '1 hour',revoked_at timestamptz);
    CREATE TABLE cafe_loyalty_programs(cafe_id uuid PRIMARY KEY,enabled boolean DEFAULT true,purchases_required integer DEFAULT 6);
    CREATE TABLE customer_profiles(id uuid PRIMARY KEY,cafe_id uuid,status text DEFAULT 'active',blocked_at timestamptz,phone_auth_conflict boolean DEFAULT false,phone_normalized text);
    CREATE TABLE loyalty_cards(id uuid PRIMARY KEY,cafe_id uuid,customer_profile_id uuid,card_code text UNIQUE,display_number integer,customer_name text,stamps_in_cycle integer DEFAULT 4,status text DEFAULT 'active',UNIQUE(cafe_id,customer_profile_id),UNIQUE(cafe_id,display_number));
    CREATE TABLE customer_reward_instances(id uuid DEFAULT gen_random_uuid(),cafe_id uuid,loyalty_card_id uuid,status text DEFAULT 'available',expires_at timestamptz);
    CREATE UNIQUE INDEX idx_customer_profiles_cafe_phone_normalized ON customer_profiles(cafe_id,phone_normalized) WHERE phone_normalized IS NOT NULL AND phone_auth_conflict=false;
    CREATE FUNCTION platform_access_private.service_enabled(p_id uuid,p_feature text) RETURNS boolean LANGUAGE sql AS $$ SELECT loyalty_enabled AND p_feature='loyalty' FROM public.cafes WHERE id=p_id $$;
  `);
  const permissions = await readFile('supabase/migrations/20261011013346_pager_staff_permissions.sql', 'utf8');
  const start = permissions.indexOf('CREATE FUNCTION platform_access_private.assert_cashier_loyalty');
  const end = permissions.indexOf('-- Preserve function bodies', start);
  await db.exec(permissions.slice(start, end));
  await sql('INSERT INTO cafes(id) VALUES($1),($2)', [cafe,otherCafe]);
  await sql('INSERT INTO profiles(id) VALUES($1)', [owner]);
  await sql('INSERT INTO cafe_cashiers(id,cafe_id) VALUES($1,$2),($3,$4)', [cashier,cafe,otherCashier,otherCafe]);
  await sql("INSERT INTO cafe_cashier_sessions(token,cafe_id,cashier_id) VALUES('valid',$1,$2),('other',$3,$4)", [cafe,cashier,otherCafe,otherCashier]);
  await sql('INSERT INTO cafe_loyalty_programs(cafe_id) VALUES($1),($2)',[cafe,otherCafe]);
  await sql("INSERT INTO customer_profiles(id,cafe_id,phone_normalized) VALUES($1,$2,'966501234567'),($3,$4,'966501234567')",[customer,cafe,otherCustomer,otherCafe]);
  await sql("INSERT INTO loyalty_cards(id,cafe_id,customer_profile_id,card_code,display_number,customer_name) VALUES($1,$2,$3,'ABCDEF0123456789',123,'Customer'),($4,$5,$6,'OTHER1234567890AB',123,'Other')",[card,cafe,customer,otherCard,otherCafe,otherCustomer]);
  await sql("INSERT INTO customer_reward_instances(cafe_id,loyalty_card_id,status,expires_at) VALUES($1,$2,'available',NULL),($1,$2,'available',now()+interval '1 day'),($1,$2,'available',now()-interval '1 minute'),($1,$2,'redeemed',NULL),($1,$2,'cancelled',NULL),($3,$4,'available',NULL)",[cafe,card,otherCafe,otherCard]);
  if (process.env.SUMMARY_LIVE_ROLLBACK) {
    await db.exec('CREATE SCHEMA loyalty_read_private; CREATE TABLE loyalty_read_private.operations(id uuid)');
    await db.exec(await readFile(process.env.SUMMARY_LIVE_ROLLBACK,'utf8'));
    check(await scalar("SELECT to_regprocedure('public.get_cashier_loyalty_summary(text,uuid,uuid,text,text,boolean)') IS NULL"),true,'prepared live rollback removes candidate function');
  }
  await db.exec(await readFile('supabase/migrations/20261109163334_cashier_loyalty_summary.sql','utf8'));
  const snapshot = () => scalar("SELECT md5(jsonb_build_array((SELECT jsonb_agg(t) FROM cafes t),(SELECT jsonb_agg(t) FROM cafe_cashier_sessions t),(SELECT jsonb_agg(t) FROM customer_profiles t),(SELECT jsonb_agg(t) FROM loyalty_cards t),(SELECT jsonb_agg(t) FROM customer_reward_instances t))::text)");
  const before = await snapshot();
  const expected = {ok:true,summary:{customerName:'Customer',stampsInCycle:4,purchasesRequired:6,availableRewards:2}};
  check(await lookup(),expected,'display number summary');
  check(await lookup('ABCDEF0123456789'),expected,'secure card code summary');
  check(await lookup('966501234567','phone'),expected,'phone summary');
  // Defense in depth: even if a deployment loses the uniqueness constraint,
  // an ambiguous phone must not pick and disclose an arbitrary customer.
  await db.exec('DROP INDEX idx_customer_profiles_cafe_phone_normalized');
  await sql("INSERT INTO customer_profiles(id,cafe_id,phone_normalized) VALUES('30000000-0000-4000-8000-000000000003',$1,'966501234567')",[cafe]);
  await sql("INSERT INTO loyalty_cards(id,cafe_id,customer_profile_id,card_code,display_number,customer_name) VALUES('40000000-0000-4000-8000-000000000003',$1,'30000000-0000-4000-8000-000000000003','DUPLICATE123',124,'Duplicate')",[cafe]);
  check((await lookup('966501234567','phone')).code,'not_found','ambiguous phone fails closed');
  await db.exec("DELETE FROM loyalty_cards WHERE card_code='DUPLICATE123'; DELETE FROM customer_profiles WHERE id='30000000-0000-4000-8000-000000000003'; CREATE UNIQUE INDEX idx_customer_profiles_cafe_phone_normalized ON customer_profiles(cafe_id,phone_normalized) WHERE phone_normalized IS NOT NULL AND phone_auth_conflict=false");
  check((await lookup('OTHER1234567890AB')).code,'not_found','cross brand code cannot disclose');
  check((await lookup('966599999999','phone')).code,'not_found','missing phone never enrolls');
  check((await lookup('123','code',otherCafe)).code,'session_scope_changed','client cannot choose another cafe');
  check((await lookup('123','code',cafe,otherCashier)).code,'session_scope_changed','client cannot choose another cashier');
  for (const [value,method] of [[null,'code'],['abc','code'],['1 OR 1=1','code'],['0501234567','phone'],['123','bad'],['x'.repeat(101),'code']]) check((await lookup(value,method)).code,'invalid_input','invalid RPC identifier');
  await assert.rejects(lookup('123','code',cafe,cashier,false,'invalid'),/permission denied/i); checks++;
  await denied("UPDATE cafe_cashier_sessions SET revoked_at=now() WHERE token='valid'","UPDATE cafe_cashier_sessions SET revoked_at=NULL WHERE token='valid'",'revoked session');
  await denied("UPDATE cafe_cashier_sessions SET expires_at=now()-interval '1 second' WHERE token='valid'","UPDATE cafe_cashier_sessions SET expires_at=now()+interval '1 hour' WHERE token='valid'",'expired session');
  await denied(`UPDATE cafe_cashiers SET active=false WHERE id='${cashier}'`,`UPDATE cafe_cashiers SET active=true WHERE id='${cashier}'`,'inactive cashier');
  await denied(`UPDATE cafe_cashiers SET can_use_loyalty=false WHERE id='${cashier}'`,`UPDATE cafe_cashiers SET can_use_loyalty=true WHERE id='${cashier}'`,'cashier missing loyalty permission');
  await denied(`UPDATE cafes SET loyalty_enabled=false WHERE id='${cafe}'`,`UPDATE cafes SET loyalty_enabled=true WHERE id='${cafe}'`,'feature disabled');
  await denied(`UPDATE cafes SET deleted_at=now() WHERE id='${cafe}'`,`UPDATE cafes SET deleted_at=NULL WHERE id='${cafe}'`,'deleted brand');
  await denied(`UPDATE cafes SET status='suspended' WHERE id='${cafe}'`,`UPDATE cafes SET status='active' WHERE id='${cafe}'`,'suspended brand');
  await denied(`UPDATE cafe_loyalty_programs SET enabled=false WHERE cafe_id='${cafe}'`,`UPDATE cafe_loyalty_programs SET enabled=true WHERE cafe_id='${cafe}'`,'disabled program','permission_denied');
  for (const [field,value,reset] of [['status',"'suspended'","'active'"],['blocked_at','now()','NULL'],['phone_auth_conflict','true','false']]) {
    await denied(`UPDATE customer_profiles SET ${field}=${value} WHERE id='${customer}'`,`UPDATE customer_profiles SET ${field}=${reset} WHERE id='${customer}'`,field,'not_found');
  }
  await denied(`UPDATE loyalty_cards SET status='suspended' WHERE id='${card}'`,`UPDATE loyalty_cards SET status='active' WHERE id='${card}'`,'suspended card','not_found');
  await sql('UPDATE cafe_cashiers SET owner_user_id=$1 WHERE id=$2',[owner,cashier]);
  check((await lookup()).code,'owner_auth_required','owner auth gate exposes no summary');
  check(await lookup('123','code',cafe,cashier,true),expected,'server verified owner can read');
  await sql("UPDATE profiles SET status='suspended' WHERE id=$1",[owner]);
  check((await lookup('123','code',cafe,cashier,true)).code,'permission_denied','revoked owner profile rejected');
  await sql("UPDATE profiles SET status='active' WHERE id=$1",[owner]);
  await sql('UPDATE cafe_cashiers SET owner_user_id=NULL WHERE id=$1',[cashier]);
  for (const role of ['anon','authenticated']) {
    await db.exec(`SET ROLE ${role}`); await assert.rejects(lookup(),/permission denied/i); checks++; await db.exec('RESET ROLE');
  }
  await db.exec('SET ROLE service_role'); check(await lookup(),expected,'only service role can execute'); await db.exec('RESET ROLE');
  // Permission tests intentionally updated fixture expiry; inspect read-only calls separately.
  const current = await snapshot();
  for (let i=0;i<10;i++) await lookup();
  check(await snapshot(),current,'all customer/session/card/reward data unchanged by reads');
  check(typeof before,'string','initial snapshot recorded');
  const functionMeta = (await sql("SELECT prosecdef,proconfig FROM pg_proc WHERE oid='public.get_cashier_loyalty_summary(text,uuid,uuid,text,text,boolean)'::regprocedure")).rows[0];
  check(functionMeta.prosecdef,true,'security definer required for private auth gate');
  check(functionMeta.proconfig,['search_path=""'],'empty search path');
  await db.exec('SET enable_seqscan=off');
  const plan = await sql("EXPLAIN SELECT count(*) FROM customer_reward_instances WHERE cafe_id=$1 AND loyalty_card_id=$2 AND status='available' AND (expires_at IS NULL OR expires_at>now())",[cafe,card]);
  check(JSON.stringify(plan.rows).includes('idx_reward_instances_available_card'),true,'reward count has scoped partial index');
  console.log(JSON.stringify({checks,result:'PASS',engine:'PGlite PostgreSQL',liveWrites:0}));
} finally { await db.close(); }
