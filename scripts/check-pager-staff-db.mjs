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

  await db.exec(`
    CREATE SCHEMA platform_access_private;
    CREATE TABLE staff_test_services(cafe_id uuid,feature text);
    INSERT INTO staff_test_services VALUES ('${cafe}','loyalty'),('${cafe}','pager'),('${otherCafe}','pager');
    CREATE FUNCTION platform_access_private.service_enabled(p_cafe_id uuid,p_feature text) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.staff_test_services WHERE cafe_id=p_cafe_id AND feature=p_feature) $$;
    GRANT USAGE ON SCHEMA platform_access_private TO anon,authenticated,service_role;
    CREATE POLICY package_service_access ON cafe_cashiers AS RESTRICTIVE FOR ALL TO anon,authenticated USING(true);
    CREATE FUNCTION platform_access_private.fixture_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
    CREATE TRIGGER package_service_write BEFORE INSERT OR UPDATE ON cafe_cashiers FOR EACH ROW EXECUTE FUNCTION platform_access_private.fixture_guard();
    ALTER TABLE profiles ADD COLUMN email text;
    CREATE FUNCTION public.record_loyalty_card_operation(p_cafe_id uuid,p_card_code text,p_invoice_barcode text,p_invoice_amount numeric,p_operation text,p_cashier_session_token text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN '{"ok":true}'::jsonb; END $$;
    CREATE FUNCTION public.record_loyalty_card_operation_legacy(p_cafe_id uuid,p_card_code text,p_invoice_barcode text,p_invoice_amount numeric,p_operation text,p_cashier_session_token text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN '{"ok":true}'::jsonb; END $$;
    CREATE FUNCTION public.preview_loyalty_card(p_session_token text,p_card_code text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN '{"ok":true}'::jsonb; END $$;
    CREATE FUNCTION public.scan_loyalty_stamp(p_session_token text,p_card_code text,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN '{"ok":true}'::jsonb; END $$;
  `);
  await db.exec(await readFile("supabase/migrations/20261009222000_maintenance_cashier_entry.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/20261011013346_pager_staff_permissions.sql", "utf8"));
  // Apply both new migrations in deployment order using the actual package gate.
  await db.exec(`
    CREATE TABLE public.platform_plans(id text PRIMARY KEY,features jsonb,active boolean DEFAULT true);
    CREATE TABLE public.subscriptions(cafe_id uuid,plan_id text,status text,started_at timestamptz,expires_at timestamptz,created_at timestamptz DEFAULT now());
    CREATE TABLE public.brand_feature_overrides(cafe_id uuid,feature_id text,enabled boolean);
    INSERT INTO public.platform_plans VALUES('both','["loyalty","pager"]',true),('pager','["pager"]',true);
    INSERT INTO public.subscriptions(cafe_id,plan_id,status) VALUES('${cafe}','both','active'),('${otherCafe}','pager','active');
  `);
  await db.exec(await readFile("supabase/migrations/20261011013350_pager_system.sql", "utf8"));
  const legacyFlags = await one("SELECT can_use_loyalty,can_use_pager,pager_station FROM cafe_cashiers WHERE email='old@example.test'");
  check(legacyFlags.can_use_loyalty && !legacyFlags.can_use_pager && legacyFlags.pager_station === "", "old staff retains only loyalty");
  const createStaff = (loyalty,pager,email,brand=cafe) => value("SELECT create_cafe_staff($1,'Staff',$2,'chosen-pass-123','0501234567',null,$3,$4,'Bar')", [brand,email,loyalty,pager]);
  await asUser(owner);
  const pagerStaff = await createStaff(false,true,'pager@example.test');
  const bothStaff = await createStaff(true,true,'both@example.test');
  await rejects(() => createStaff(false,false,'none@example.test'), /Select a staff permission/);
  await rejects(() => createStaff(false,true,'foreign@example.test',otherCafe), /Forbidden/);
  await asUser(otherOwner);
  await createStaff(false,true,'pager-only-brand@example.test',otherCafe);
  await rejects(() => createStaff(true,true,'unentitled@example.test',otherCafe), /Staff service unavailable/);
  const pagerOwner = await start(otherCafe);
  check(Boolean(pagerOwner.token), "pager-only brand owner opens shared identity");
  await asUser(null,'anon');
  const pagerSession = await login('pager@example.test','chosen-pass-123');
  const bothSession = await login('both@example.test','chosen-pass-123');
  for (const name of ['record_loyalty_card_operation','record_loyalty_card_operation_legacy']) {
    await rejects(() => value(`SELECT ${name}($1,'CARD','INV',1,'stamp',$2)`,[cafe,pagerSession.token]), /Cashier loyalty permission denied/);
    check((await value(`SELECT ${name}($1,'CARD','INV',1,'stamp',$2)`,[cafe,bothSession.token])).ok, 'combined staff legacy path accepted');
  }
  await rejects(() => value("SELECT preview_loyalty_card($1,'CARD')",[pagerSession.token]), /Cashier loyalty permission denied/);
  await rejects(() => value("SELECT scan_loyalty_stamp($1,'CARD',gen_random_uuid())",[pagerSession.token]), /Cashier loyalty permission denied/);
  await asUser(owner);
  await value("SELECT update_cafe_staff_permissions($1,$2,false,true,'Kitchen')",[cafe,bothStaff]);
  await root();
  check(await value("SELECT revoked_at IS NOT NULL FROM cafe_cashier_sessions WHERE token=$1",[bothSession.token]), 'permission change revokes prior session');
  check(await value("SELECT pager_station FROM cafe_cashiers WHERE id=$1",[bothStaff]) === 'Kitchen', 'station saved');
  await asUser(outsider);
  await rejects(() => value("SELECT update_cafe_staff_permissions($1,$2,true,true,'Bar')",[cafe,pagerStaff]),/Forbidden/);
  await asUser(owner,'anon');
  await rejects(() => createStaff(true,true,'anon@example.test'), /permission denied/);
  await asUser(owner);
  const ownerSession = await start();
  const ownerFlags = await one("SELECT can_use_loyalty,can_use_pager FROM cafe_cashiers WHERE id=$1",[ownerSession.cashier_id]);
  check(ownerFlags.can_use_loyalty && ownerFlags.can_use_pager,'owner identity has both permissions');
  await rejects(() => value("SELECT update_cafe_staff_permissions($1,$2,false,true,'Bar')",[cafe,ownerSession.cashier_id]), /Forbidden/);
  await root();
  check(await value("SELECT count(*) FROM cafe_cashiers WHERE email IN ('none@example.test','unentitled@example.test')") === 0, 'failed create rolls back whole account');
  check(await value("SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('cafe_cashiers'::regclass,'cafe_cashier_sessions'::regclass)"), 'RLS preserved');
  console.log(`PASS combined staff/pager migration SQL: ${checks} checks (${Math.round(performance.now()-started)}ms)`);
} finally { await db.close(); }
