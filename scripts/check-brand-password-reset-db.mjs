import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Same local PostgreSQL harness used by the other isolated database suites.
const harness = path.join(tmpdir(), "branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js");
const { PGlite } = await import(pathToFileURL(harness).href);
const db = new PGlite();
const migration = name => readFile(new URL("../supabase/migrations/" + name, import.meta.url), "utf8");
const uid = value => "66f398d2-9455-460f-ab11-" + value.toString(16).padStart(12, "0");
const [actor, owner, cafe] = [1, 2, 3].map(uid);
const verifier = "$2b$10$" + "A".repeat(53);
const q = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
const rpc = (name, args) => q("select public.brand_password_reset_" + name + "(" + args.map((_, i) => "$" + (i + 1)).join(",") + ") as value", args);
const enqueue = (id, admin = actor) => rpc("enqueue", [admin, cafe, id, "encrypted".repeat(10), verifier]);
const claim = id => rpc("claim", [id]);
const permit = job => rpc("can_send", [job.id,job.claimToken]);
const finish = (job, result) => rpc("finish", [job.id,job.claimToken,result]);
const password = () => q("select encrypted_password as value from auth.users where id=$1", [owner]);
const makeDue = id => db.query("update brand_onboarding_private.password_resets set next_attempt_at=now() where id=$1",[id]);
const stored = id => q("select ciphertext is null and password_hash is null and original_fingerprint is null as value from brand_onboarding_private.password_resets where id=$1",[id]);

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA brand_onboarding_private;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY, role text, status text DEFAULT 'active');
    CREATE TABLE auth.users(id uuid PRIMARY KEY,phone text,phone_confirmed_at timestamptz,encrypted_password text,
      recovery_token text,recovery_sent_at timestamptz,deleted_at timestamptz,banned_until timestamptz,updated_at timestamptz);
    CREATE TABLE auth.sessions(user_id uuid);
    CREATE TABLE auth.one_time_tokens(user_id uuid,token_type text);
    CREATE TABLE public.cafes(id uuid PRIMARY KEY,owner_user_id uuid,name text,status text DEFAULT 'active',deleted_at timestamptz);
    CREATE TABLE brand_onboarding_private.accounts(cafe_id uuid,state text,pending_edit jsonb);
  `);
  const onboarding = await migration("20261013231133_admin_brand_preparation.sql");
  const requireAdmin = onboarding.slice(onboarding.indexOf("CREATE FUNCTION brand_onboarding_private.require_admin"), onboarding.indexOf("CREATE FUNCTION public.admin_prepare_brand_account"));
  await db.exec(requireAdmin);
  await db.exec(await migration("20261123011000_brand_mobile_country.sql"));
  await db.exec(await migration("20261123200000_brand_password_reset_queue.sql"));
  await db.query("insert into profiles values ($1,'platform_admin','active'),($2,'cafe_owner','active')",[actor,owner]);
  await db.query("insert into cafes(id,owner_user_id,name,phone_country) values ($1,$2,'Test','PS')",[cafe,owner]);
  await db.query("insert into auth.users(id,phone,encrypted_password,recovery_token) values ($1,'+970590000001','prior','temporary')",[owner]);
  await db.query("insert into auth.sessions values ($1)",[owner]);
  await db.query("insert into auth.one_time_tokens values ($1,'recovery_token'),($1,'confirmation_token')",[owner]);

  await assert.rejects(enqueue(uid(8),owner),/ADMIN_REQUIRED/);
  await assert.rejects(enqueue(uid(8)),/OWNER_PHONE_REQUIRED/);
  await db.query("update auth.users set phone_confirmed_at=now() where id=$1",[owner]);
  await db.query("insert into brand_onboarding_private.accounts values ($1,'sending',null)",[cafe]);
  await assert.rejects(enqueue(uid(8)),/OWNER_WELCOME_PENDING/);
  await db.exec("update brand_onboarding_private.accounts set state='sent'");
  // Direct table access and callable RPCs are restricted, independently of browser code.
  const privs = await db.query(`select p.oid,has_function_privilege('anon',p.oid,'execute') as anon,
      has_function_privilege('authenticated',p.oid,'execute') as signed,
      has_function_privilege('service_role',p.oid,'execute') as worker
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like 'brand_password_reset_%'`);
  assert.equal(privs.rows.length,5);
  assert.ok(privs.rows.every(row => !row.anon && !row.signed && row.worker));
  assert.equal(await q("select has_table_privilege('authenticated','brand_onboarding_private.password_resets','select') as value"),false);

  const first = uid(10);
  assert.equal((await enqueue(first)).status,"queued");
  assert.equal((await enqueue(first)).id,first);
  await assert.rejects(enqueue(uid(11)),/OWNER_RESET_IN_PROGRESS/);
  for (let attempt=1; attempt<=9; attempt++) {
    const job = await claim(first);
    assert.equal(job.attempt,attempt);
    assert.equal(job.phone,"970590000001");
    assert.equal(await claim(first),null);
    assert.equal(await permit(job),true);
    assert.equal(await permit(job),false);
    const receipt = await finish(job,"rejected");
    assert.equal((await finish(job,"rejected")).status,receipt.status);
    if (attempt<9) {
      assert.equal(receipt.status,"queued");
      assert.ok(Date.parse(receipt.nextAttemptAt)>=Date.now()+58000);
      assert.equal(await claim(first),null);
      await makeDue(first);
    } else {
      assert.equal(receipt.status,"failed");
      assert.equal(await stored(first),true);
    }
  }
  assert.equal(await password(),"prior");
  assert.equal((await enqueue(first)).status,"failed");
  const uncertain = uid(12);
  await enqueue(uncertain);
  const inFlight = await claim(uncertain);
  await permit(inFlight);
  await db.query("update brand_onboarding_private.password_resets set lease_until=now()-interval '1 second' where id=$1",[uncertain]);
  assert.equal((await rpc("status",[actor,cafe])).status,"uncertain");
  assert.equal(await claim(uncertain),null);
  assert.equal((await finish(inFlight,"accepted")).status,"uncertain");
  assert.equal(await stored(uncertain),true);
  assert.equal(await password(),"prior");

  const stale = uid(13);
  await enqueue(stale);
  const oldClaim = await claim(stale);
  await db.query("update auth.users set phone='+970590000002' where id=$1",[owner]);
  assert.equal(await permit(oldClaim),false);
  assert.equal((await finish(oldClaim,"rejected")).status,"cancelled");

  const changed = uid(14);
  await enqueue(changed);
  const changedClaim = await claim(changed);
  assert.equal(await permit(changedClaim),true);
  await db.query("update auth.users set encrypted_password='owner-updated' where id=$1",[owner]);
  assert.equal((await finish(changedClaim,"accepted")).status,"cancelled");
  assert.equal(await password(),"owner-updated");

  const success = uid(15);
  await enqueue(success);
  const approved = await claim(success);
  await assert.rejects(finish(approved,"accepted"),/DISPATCH_NOT_AUTHORIZED/);
  assert.equal(await permit(approved),true);
  const receipt = await finish(approved,"accepted");
  assert.equal(receipt.status,"sent");
  assert.deepEqual(Object.keys(receipt).sort(),["attempt","createdAt","id","nextAttemptAt","status"].sort());
  assert.equal(await stored(success),true);
  assert.equal(await claim(success),null);
  assert.equal(await password(),verifier);
  assert.equal(await q("select recovery_token as value from auth.users where id=$1",[owner]),"");
  assert.equal(await q("select token_type as value from auth.one_time_tokens where user_id=$1",[owner]),"confirmation_token");
  assert.equal(await q("select count(*)::int as value from auth.sessions where user_id=$1",[owner]),0);
  assert.equal((await finish(approved,"accepted")).status,"sent");
  console.log("Brand password reset DB checks passed (roles, confirmed PS phone, idempotency, 9 attempts, pacing, leases, owner changes, activation and credential cleanup)");
} finally {
  await db.close();
}
