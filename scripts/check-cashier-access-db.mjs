import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// PostgreSQL/WASM integration; bcrypt is a deterministic plumbing fixture only.
// PGlite uses one connection, so concurrency is reviewed through locks/constraints,
// not represented as a multi-connection load test.
const engine = process.env.PGLITE_MODULE ?? path.join(tmpdir(), "branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js");
const { PGlite } = await import(pathToFileURL(engine).href);
const db = new PGlite();
const sql = (query, args = []) => db.query(query, args);
const one = async (query, args = []) => (await sql(query, args)).rows[0];
const value = async (query, args = []) => Object.values(await one(query, args))[0];
const ids = Array.from({ length: 8 }, (_, index) => `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const [owner, outsider, manager, inactive, admin, otherOwner, cafe, otherCafe] = ids;
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const rejects = async (operation, pattern) => { await assert.rejects(operation, pattern); checks++; };
const root = () => db.exec("RESET ROLE");
const asUser = async (id, role = "authenticated") => {
  await root();
  await sql("SELECT set_config('request.jwt.claim.sub',$1,false)", [id ?? ""]);
  await db.exec(`SET ROLE ${role}`);
};
const create = (args = {}) => value("SELECT create_cafe_cashier_with_contact($1,$2,$3,$4,$5,$6)", [
  Object.hasOwn(args, "cafe") ? args.cafe : cafe,
  Object.hasOwn(args, "name") ? args.name : "Employee",
  Object.hasOwn(args, "email") ? args.email : "employee@example.test",
  Object.hasOwn(args, "password") ? args.password : "chosen-pass-123",
  Object.hasOwn(args, "phone") ? args.phone : "0501234567",
  args.number ?? null,
]);
const start = (id = cafe) => one("SELECT * FROM start_owner_cashier_session($1)", [id]);
const login = (email, password) => one("SELECT * FROM login_cafe_cashier($1,$2)", [email, password]);
const migration = await readFile("supabase/migrations/20261004152552_cashier_contact_owner_sessions.sql", "utf8");
const started = performance.now();
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA extensions;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE profiles(id uuid PRIMARY KEY REFERENCES auth.users(id),full_name text,status text DEFAULT 'active',role text DEFAULT 'customer');
    CREATE TABLE cafes(id uuid PRIMARY KEY,owner_user_id uuid,slug text,name text,status text DEFAULT 'active',deleted_at timestamptz);
    CREATE TABLE cafe_members(cafe_id uuid,user_id uuid,role text);
    CREATE FUNCTION has_cafe_permission(cafe uuid,permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS(SELECT 1 FROM public.cafes WHERE id=cafe AND owner_user_id=auth.uid())
      OR EXISTS(SELECT 1 FROM public.cafe_members WHERE cafe_id=cafe AND user_id=auth.uid() AND role='manager') $$;
    CREATE FUNCTION is_platform_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='platform_admin') $$;
    CREATE FUNCTION extensions.crypt(plaintext text,salt text) RETURNS text LANGUAGE sql STRICT AS $$ SELECT 'fixture$'||md5(plaintext) $$;
    CREATE FUNCTION extensions.gen_salt(kind text) RETURNS text LANGUAGE sql AS $$ SELECT 'fixture' $$;
    CREATE FUNCTION public.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS $$ SELECT decode(repeat(replace(gen_random_uuid()::text,'-',''),2),'hex') $$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
    GRANT SELECT ON profiles TO authenticated;
  `);
  const historical = await readFile("supabase/migrations/013_barndaksa_loyapro_wallet_loyalty_system.sql", "utf8");
  await db.exec(historical.slice(historical.indexOf("CREATE TABLE IF NOT EXISTS public.cafe_cashiers"), historical.indexOf("CREATE TABLE IF NOT EXISTS public.loyalty_card_events")));
  await db.exec(`
    ALTER TABLE cafe_cashiers ADD COLUMN employee_number text, ADD COLUMN last_logout_at timestamptz;
    ALTER TABLE cafe_cashier_sessions ADD COLUMN revoked_at timestamptz;
    CREATE TABLE cafe_cashier_activity_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid,cashier_id uuid,action_type text,target_type text,details jsonb);
    GRANT SELECT ON cafe_cashiers TO authenticated;
    GRANT ALL ON cafe_cashiers,cafe_cashier_sessions TO service_role;
  `);
  for (const [index, id] of ids.slice(0, 6).entries()) {
    await sql("INSERT INTO auth.users VALUES($1,$2)", [id, `user${index}@example.test`]);
    await sql("INSERT INTO profiles(id,full_name,status,role) VALUES($1,$2,$3,$4)", [id, `Real person ${index}`, id === inactive ? "suspended" : "active", id === admin ? "platform_admin" : "customer"]);
  }
  await sql("INSERT INTO cafes(id,owner_user_id,slug,name) VALUES($1,$2,'rast','Rast'),($3,$4,'other','Other')", [cafe, owner, otherCafe, otherOwner]);
  await sql("INSERT INTO cafe_members VALUES($1,$2,'manager'),($1,$3,'manager')", [cafe, manager, inactive]);
  await sql("INSERT INTO cafe_cashiers(cafe_id,full_name,email,password_hash,temporary_password) VALUES($1,'Old account','old@example.test','old-hash','old-plaintext')", [cafe]);
  await db.exec(migration);
  check(await value("SELECT temporary_password FROM cafe_cashiers WHERE email='old@example.test'") === "old-plaintext", "migration preserves existing credential data");
  for (const role of ["anon", "service_role"]) {
    await asUser(owner, role);
    await rejects(() => create(), /permission denied/);
    await rejects(() => start(), /permission denied/);
  }
  for (const user of [null, outsider, inactive]) {
    await asUser(user);
    await rejects(() => create(), /Forbidden/);
    await rejects(() => start(), /Forbidden/);
  }
  await asUser(owner);
  await rejects(() => create({ cafe: otherCafe }), /Forbidden/);
  await rejects(() => create({ cafe: null }), /Forbidden/);
  await rejects(() => start(otherCafe), /Forbidden/);
  for (const name of [null, "", " ", "A", "Bad\nName", "a".repeat(81)]) await rejects(() => create({ name }), /Invalid cashier name/);
  for (const email of [null, "", "bad", `${"a".repeat(245)}@example.test`]) await rejects(() => create({ email }), /Invalid email/);
  for (const password of [null, "", "1234567", " 1234567 ", "valid\npass123", "a".repeat(41), "\u0627".repeat(37)]) await rejects(() => create({ password }), /Invalid password/);
  for (const phone of [null, "", "555", "+0501234567", "+1234567890123456", "050letters", "x".repeat(41)]) await rejects(() => create({ phone }), /Invalid phone/);
  await rejects(() => create({ number: "a".repeat(41) }), /Invalid employee number/);
  const employee = await create({ email: " Employee@Example.test ", number: " EMP-1 " });
  const employeeRow = await one("SELECT * FROM cafe_cashiers WHERE id=$1", [employee]);
  check(employeeRow.email === "employee@example.test" && employeeRow.phone === "+966501234567" && employeeRow.employee_number === "EMP-1", "employee contact normalized");
  check(employeeRow.temporary_password === "" && employeeRow.password_hash !== "chosen-pass-123" && employeeRow.password_hash.startsWith("fixture$"), "only hashed password persisted");
  check(employeeRow.owner_user_id === null && employeeRow.created_by === owner, "employee cannot create linked owner identity");
  await rejects(() => create({ email: "EMPLOYEE@example.test" }), /already exists/);
  await asUser(otherOwner);
  await rejects(() => create({ cafe: otherCafe, email: "employee@example.test" }), /already exists/);
  await asUser(manager);
  const managerEmployee = await create({ email: "manager-created@example.test", phone: "00966501234568" });
  check(await value("SELECT phone FROM cafe_cashiers WHERE id=$1", [managerEmployee]) === "+966501234568", "authorized manager creates employee");
  await rejects(() => start(), /Forbidden/);
  await asUser(admin);
  await create({ email: "admin-created@example.test", phone: "+966 50 123 4569" });
  checks++;
  await rejects(() => start(), /Forbidden/);
  await asUser(owner);
  const legacy = await value("SELECT create_cafe_cashier($1,'L','legacy@example.test','K123abc',null)", [cafe]);
  check(await value("SELECT temporary_password FROM cafe_cashiers WHERE id=$1", [legacy]) === "", "legacy RPC also stores no plaintext");
  check(await value("SELECT password_hash FROM cafe_cashiers WHERE id=$1", [legacy]) !== "K123abc", "legacy seven-character generated password remains hashed");
  for (const password of [null, "12345", "a".repeat(41), "\u0627".repeat(37)]) {
    await rejects(() => value("SELECT create_cafe_cashier($1,'L','invalid-legacy@example.test',$2,null)", [cafe, password]), /Invalid password/);
  }
  await asUser(null, "anon");
  check((await login("legacy@example.test", "K123abc")).cashier_id === legacy, "legacy seven-character generated password still signs employee in");
  for (const password of [null, "", "wrong-password"]) await rejects(() => login("employee@example.test", password), /Invalid cashier credentials/);
  const employeeSession = await login("EMPLOYEE@example.test", "chosen-pass-123");
  check(employeeSession.cashier_id === employee, "chosen password signs employee in");
  await asUser(owner);
  await value("SELECT set_cashier_status($1,false)", [employee]);
  await root();
  check(await value("SELECT revoked_at IS NOT NULL FROM cafe_cashier_sessions WHERE token=$1", [employeeSession.token]), "employee deactivation revokes existing token");
  await asUser(owner);
  await value("SELECT set_cashier_status($1,true)", [employee]);
  await root();
  check(await value("SELECT revoked_at IS NOT NULL FROM cafe_cashier_sessions WHERE token=$1", [employeeSession.token]), "reactivation does not revive token");
  await asUser(owner);
  // Real owner email can coexist with a preexisting employee address.
  await create({ email: "user0@example.test" });
  const ownerSession = await start();
  const repeated = await start();
  check(ownerSession.cashier_id === repeated.cashier_id && ownerSession.token !== repeated.token, "stable owner cashier identity with distinct sessions");
  const ownerRow = await one("SELECT * FROM cafe_cashiers WHERE id=$1", [ownerSession.cashier_id]);
  check(ownerRow.full_name === "Real person 0" && ownerRow.email === "user0@example.test" && ownerRow.owner_user_id === owner, "owner real identity derived from authenticated user");
  check(ownerRow.temporary_password === "" && ownerRow.password_hash === "!owner-session-only!", "linked owner has no usable password");
  await rejects(() => value("SELECT set_cashier_status($1,false)", [ownerSession.cashier_id]), /Forbidden/);
  await rejects(() => value("SELECT set_cashier_status($1,null)", [employee]), /Forbidden/);
  await rejects(() => sql("UPDATE cafe_cashiers SET owner_user_id=$1 WHERE id=$2", [owner, employee]), /permission denied/);
  await rejects(() => db.exec("DELETE FROM cafe_cashiers"), /permission denied/);
  await rejects(() => db.exec("INSERT INTO cafe_cashiers(cafe_id) VALUES(null)"), /permission denied/);
  await rejects(() => db.exec("SELECT * FROM cafe_cashier_sessions"), /permission denied/);
  await asUser(outsider);
  check(await value("SELECT count(*)::int FROM cafe_cashiers") === 0, "RLS hides other brand employee data");
  await rejects(() => value("SELECT set_cashier_status($1,false)", [employee]), /Forbidden/);
  await root();
  check(await value("SELECT extract(epoch FROM expires_at-created_at)=28800 FROM cafe_cashier_sessions WHERE token=$1", [ownerSession.token]), "owner session has eight-hour expiry");
  check(await value("SELECT details->>'actorType' FROM cafe_cashier_activity_logs WHERE cashier_id=$1 LIMIT 1", [ownerSession.cashier_id]) === "owner", "owner login audit carries real actor identity");
  await rejects(() => sql("INSERT INTO cafe_cashiers(cafe_id,full_name,email,password_hash,temporary_password,owner_user_id) VALUES($1,'Duplicate','different@example.test','x','',$2)", [cafe, owner]), /unique constraint/);
  // Exclude owner row from password login even if a service writes a valid hash.
  await sql("UPDATE cafe_cashiers SET password_hash=extensions.crypt('test-owner-password','fixture'),email='owner-only@example.test' WHERE id=$1", [ownerSession.cashier_id]);
  await asUser(null, "anon");
  await rejects(() => login("owner-only@example.test", "test-owner-password"), /Invalid cashier credentials/);
  await root();
  await sql("UPDATE profiles SET status='suspended' WHERE id=$1", [owner]);
  check(await value("SELECT bool_and(revoked_at IS NOT NULL) FROM cafe_cashier_sessions WHERE cashier_id=$1", [ownerSession.cashier_id]), "profile suspension immediately revokes all owner sessions");
  check(await value("SELECT active=false FROM cafe_cashiers WHERE id=$1", [ownerSession.cashier_id]), "profile suspension deactivates linked identity");
  await asUser(owner);
  await rejects(() => start(), /Forbidden/);
  await rejects(() => create({ email: "suspended@example.test" }), /Forbidden/);
  check(await value("SELECT count(*)::int FROM cafe_cashiers") === 0, "suspended profile cannot read employee contacts");
  await root(); await sql("UPDATE profiles SET status='active',full_name='Updated owner' WHERE id=$1", [owner]);
  await asUser(owner);
  const restored = await start();
  check(restored.cashier_id === ownerSession.cashier_id, "owner identity reused after account restoration");
  check(await value("SELECT full_name FROM cafe_cashiers WHERE id=$1", [restored.cashier_id]) === "Updated owner", "owner identity refreshes from profile");
  await root();
  await sql("UPDATE cafes SET owner_user_id=$1 WHERE id=$2", [otherOwner, cafe]);
  check(await value("SELECT revoked_at IS NOT NULL FROM cafe_cashier_sessions WHERE token=$1", [restored.token]), "ownership transfer revokes previous owner token");
  await asUser(owner); await rejects(() => start(), /Forbidden/);
  await asUser(otherOwner);
  const successor = await start();
  check(successor.cashier_id !== restored.cashier_id, "successor has separate named identity");
  await root(); await sql("UPDATE cafes SET status='suspended' WHERE id=$1", [cafe]);
  check(await value("SELECT revoked_at IS NOT NULL FROM cafe_cashier_sessions WHERE token=$1", [successor.token]), "cafe suspension revokes owner token");
  await asUser(otherOwner); await rejects(() => start(), /Forbidden/);
  await root(); await sql("UPDATE cafes SET status='published' WHERE id=$1", [cafe]);
  await asUser(otherOwner); const published = await start();
  check(Boolean(published.token), "published cafe remains usable");
  await root(); await sql("UPDATE cafes SET deleted_at=now() WHERE id=$1", [cafe]);
  check(await value("SELECT revoked_at IS NOT NULL FROM cafe_cashier_sessions WHERE token=$1", [published.token]), "soft deletion revokes owner token");
  await asUser(otherOwner); await rejects(() => start(), /Forbidden/);
  await root(); await sql("UPDATE cafes SET deleted_at=null WHERE id=$1", [cafe]);
  await asUser(otherOwner); const beforeDelete = await start();
  await root(); await sql("DELETE FROM profiles WHERE id=$1", [otherOwner]);
  check(await value("SELECT revoked_at IS NOT NULL FROM cafe_cashier_sessions WHERE token=$1", [beforeDelete.token]), "profile deletion revokes owner token");
  await asUser(otherOwner); await rejects(() => start(), /Forbidden/);
  await root();
  check(await value("SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('cafe_cashiers'::regclass,'cafe_cashier_sessions'::regclass)"), "cashier and session RLS retained");
  check(migration.includes("pg_advisory_xact_lock(hashtextextended(lower(btrim(p_email)),0))") && migration.includes("FOR SHARE"), "reviewed lock invariants remain present");
  await db.exec(await readFile("supabase/tests/cashier_owner_access_postflight.sql", "utf8"));
  checks++;
  console.log(`PASS cashier access SQL: ${checks} checks (${Math.round(performance.now() - started)}ms). Mocked bcrypt; single PostgreSQL connection.`);
} finally {
  await db.close();
}
