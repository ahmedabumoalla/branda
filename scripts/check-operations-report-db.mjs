import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";

const engine = process.env.PGLITE_MODULE ?? path.join(tmpdir(), "branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js");
const { PGlite } = await import(pathToFileURL(engine).href);
const db = new PGlite();
const query = (sql, args = []) => db.query(sql, args);
const value = async (sql, args = []) => Object.values((await query(sql, args)).rows[0])[0];
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const rejects = async operation => { await assert.rejects(operation); checks++; };
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA brand_analytics_private; CREATE SCHEMA loyalty_audit_private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text,status text);
    CREATE TABLE public.cafes(id uuid PRIMARY KEY,name text,slug text,status text DEFAULT 'active',deleted_at timestamptz);
    CREATE TABLE public.customer_profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid REFERENCES public.cafes(id),
      user_id uuid,full_name text,phone text,email text,phone_normalized text,phone_auth_conflict boolean DEFAULT false,
      last_visit_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.customer_phone_auth_identities(phone_normalized text PRIMARY KEY,auth_user_id uuid,updated_at timestamptz);
    CREATE TABLE public.customer_phone_auth_conflicts(cafe_id uuid,phone_masked text,profile_count int,status text DEFAULT 'open',detected_at timestamptz);
    CREATE UNIQUE INDEX conflict_idx ON public.customer_phone_auth_conflicts(cafe_id,phone_masked) WHERE status='open';
    CREATE TABLE public.cafe_visit_events(cafe_id uuid,session_id text,created_at timestamptz);
    CREATE TABLE brand_analytics_private.events(cafe_id uuid,visitor_key text,kind text,occurred_at timestamptz);
    CREATE TABLE brand_analytics_private.settings(recording_started_at timestamptz DEFAULT now());
    INSERT INTO brand_analytics_private.settings DEFAULT VALUES;
    CREATE TABLE loyalty_audit_private.settings(wallet_recording_started_at timestamptz DEFAULT now());
    INSERT INTO loyalty_audit_private.settings DEFAULT VALUES;
    CREATE TABLE loyalty_audit_private.wallet_customer_events(cafe_id uuid,card_id uuid,provider text,kind text,occurred_at timestamptz);
    CREATE TABLE public.loyalty_cards(cafe_id uuid,customer_profile_id uuid,issued_at timestamptz);
    CREATE TABLE public.loyalty_activity_events(cafe_id uuid,kind text,outcome text,occurred_at timestamptz);
    CREATE TABLE public.platform_plans(id text PRIMARY KEY,name text,features jsonb);
    CREATE TABLE public.subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid,plan_id text,status text,
      started_at timestamptz DEFAULT now(),expires_at timestamptz,created_at timestamptz DEFAULT now());
    CREATE TABLE public.brand_feature_overrides(cafe_id uuid,feature_id text,enabled boolean);
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
  `);
  await db.exec(await readFile("supabase/migrations/076_customer_signup_name.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/20261009115142_admin_operations_report.sql", "utf8"));
  await query("INSERT INTO profiles VALUES($1,'platform_admin','active'),($2,'platform_admin','suspended'),($3,'cafe_owner','active'),($4,'customer','active')", [1,2,3,4].map(id));
  await query("INSERT INTO cafes(id,name,slug) VALUES($1,'Alpha','alpha'),($2,'Beta','beta'),($3,'Empty','empty'),($4,'Deleted','deleted')", [10,11,12,13].map(id));
  await query("UPDATE cafes SET deleted_at=now() WHERE id=$1", [id(13)]);
  const asUser = async n => { await db.exec("RESET ROLE"); await query("SELECT set_config('request.jwt.claim.sub',$1,false)",[n ? id(n) : ""]); await db.exec("SET ROLE authenticated"); };
  const report = (from = null, to = null) => value("SELECT public.get_admin_operations_report($1,$2)", [from,to]);
  for (const user of [0,2,3,4]) { await asUser(user); await rejects(() => report()); }
  for (const role of ["anon","authenticated","service_role"]) {
    await db.exec(`RESET ROLE; SET ROLE ${role}`);
    for (const statement of ["SELECT * FROM operations_report_private.registration_sources", "SELECT * FROM operations_report_private.settings", "DELETE FROM operations_report_private.registration_sources", "TRUNCATE operations_report_private.registration_sources"])
      await rejects(() => query(statement));
    if (role !== "authenticated") await rejects(() => report());
    if (role !== "service_role") {
      await rejects(() => query("SELECT public.record_customer_registration_source($1,'storefront')", [id(20)]));
      await rejects(() => query("SELECT * FROM public.link_customer_phone_otp_attributed($1,'966500000001','customer_signup',$2,'New','storefront')", [id(10),id(3)]));
    }
  }
  await asUser(1);
  const empty = await report();
  check(empty.brands.length === 3 && empty.brands.every(b => Object.values(b.metrics).every(n => n === 0)), "all nondeleted brands included with true zero counts");
  check(empty.brands.every(b => b.lastMenuVisit === null && !b.subscribed), "empty states have no fabricated visits or subscriptions");
  await rejects(() => report("2026-10-06", "2026-10-05"));
  await db.exec("RESET ROLE");
  await query(`INSERT INTO customer_profiles(id,cafe_id,full_name,phone_normalized,created_at) VALUES
    ($1,$5,'Store','966500000020','2026-10-05T12:00:00Z'),($2,$5,'Loyal','966500000021','2026-10-05T12:00:00Z'),
    ($3,$5,'Unknown','966500000022','2026-10-05T12:00:00Z'),($4,$6,'Beta','966500000023','2026-10-05T12:00:00Z')`,[id(20),id(21),id(22),id(23),id(10),id(11)]);
  await query("INSERT INTO operations_report_private.registration_sources(customer_id,cafe_id,source) VALUES($1,$3,'storefront'),($2,$3,'loyalty')",[id(20),id(21),id(10)]);
  await query(`INSERT INTO cafe_visit_events VALUES
    ($1,'a','2026-10-04T20:59:59Z'),($1,'a','2026-10-04T21:00:00Z'),($1,'a','2026-10-05T12:00:00Z'),
    ($1,'b','2026-10-05T20:59:59.999999Z'),($1,'c','2026-10-05T21:00:00Z'),($2,'a','2026-10-05T12:00:00Z')`,[id(10),id(11)]);
  await query(`INSERT INTO brand_analytics_private.events VALUES
    ($1,'a','menu_view','2026-10-04T21:00:00Z'),($1,'a','menu_view','2026-10-05T12:00:00Z'),
    ($1,'b','menu_view','2026-10-05T21:00:00Z'),($1,'c','loyalty_qr_visit','2026-10-05T12:00:00Z')`,[id(10)]);
  await query("INSERT INTO loyalty_cards VALUES($1,$2,'2026-10-05T12:00:00Z'),($1,$3,'2026-10-04T20:59:59Z')",[id(10),id(20),id(21)]);
  await query(`INSERT INTO loyalty_audit_private.wallet_customer_events VALUES
    ($1,$2,'apple','download','2026-10-05T12:00:00Z'),($1,$2,'apple','download','2026-10-05T12:01:00Z'),
    ($1,$2,'google','save_link','2026-10-05T12:00:00Z'),($1,$3,'apple','installed','2026-10-05T12:00:00Z'),
    ($1,$3,'google','save_link','2026-10-05T21:00:00Z')`,[id(10),id(30),id(31)]);
  await query(`INSERT INTO loyalty_activity_events VALUES
    ($1,'stamp','success','2026-10-04T21:00:00Z'),($1,'stamp','success','2026-10-05T20:59:59.999999Z'),
    ($1,'stamp','success','2026-10-05T21:00:00Z'),($1,'stamp','denied','2026-10-05T12:00:00Z'),
    ($1,'scan','success','2026-10-05T12:00:00Z'),($1,'void','success','2026-10-05T12:00:00Z'),
    ($1,'redeem','success','2026-10-05T12:00:00Z'),($2,'redeem','success','2026-10-05T12:00:00Z')`,[id(10),id(11)]);
  await db.exec(`INSERT INTO platform_plans VALUES('paid','Paid','["menu","loyalty"]');`);
  await query(`INSERT INTO subscriptions(cafe_id,plan_id,status,started_at,expires_at,created_at) VALUES
    ($1,'paid','active',now()-interval '5 days',now()+interval '5 days',now()-interval '5 days'),
    ($1,'paid','cancelled',now()-interval '1 day',NULL,now()),
    ($2,'paid','active',now()-interval '5 days',now()-interval '1 second',now()),
    ($3,'paid','trialing',now()+interval '1 day',NULL,now())`,[id(10),id(11),id(12)]);
  await query("INSERT INTO brand_feature_overrides VALUES($1,'menu',false),($1,'standalone_menu',true)",[id(10)]);
  await asUser(1);
  const period = await report("2026-10-05", "2026-10-05");
  const alpha = period.brands.find(b => b.id === id(10));
  check(alpha.metrics.storefrontVisits === 3 && alpha.metrics.storefrontVisitors === 2, "Saudi half-open day boundaries and distinct sessions");
  check(alpha.metrics.menuVisits === 2 && alpha.metrics.menuVisitors === 1, "menu kinds and repeated browser separated");
  check(alpha.metrics.accounts === 3 && alpha.metrics.storefrontAccounts === 1 && alpha.metrics.unattributedAccounts === 1, "known loyalty and unknown sources never counted as storefront");
  check(alpha.metrics.loyaltyCards === 1 && alpha.metrics.loyaltyCustomers === 1, "card period uses issued_at");
  check(alpha.metrics.appleCards === 1 && alpha.metrics.googleCards === 1, "unique wallet issuance excludes installation and outside-period links");
  check(alpha.metrics.stampOperations === 2 && alpha.metrics.rewardOperations === 1, "only confirmed successful operations counted");
  check(alpha.lastStorefrontVisit !== alpha.periodLastStorefrontVisit && alpha.lastMenuVisit !== alpha.periodLastMenuVisit, "all-time last visits preserved separately from period");
  check(alpha.subscribed && alpha.subscriptionStatus === "active" && alpha.featureOverrides.length === 2, "current valid subscription preferred to newer cancellation and overrides returned");
  check(period.brands.filter(b => b.id !== id(10)).every(b => !b.subscribed), "expired and future subscriptions are not current subscribers");
  const beta = period.brands.find(b => b.id === id(11));
  check(beta.metrics.storefrontVisits === 1 && beta.metrics.rewardOperations === 1 && beta.metrics.stampOperations === 0, "brand isolation without join multiplicity");
  const realRequire = createRequire(import.meta.url);
  const modules = new Map();
  let rpcCalls = 0;
  const auth = { user: { id: id(1) }, profile: { role: "platform_admin", status: "active" }, result: period };
  const client = {
    auth: { getUser: async () => ({ data: { user: auth.user }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: auth.profile, error: null }) }) }) }),
    rpc: async () => { rpcCalls++; return { data: auth.result, error: null }; },
  };
  for (const file of ["lib/platform/feature-registry.ts", "lib/platform/feature-access.ts", "lib/analytics/operations-report.ts", "lib/data/operations-report.ts", "app/actions/operations-report.ts"]) {
    const exports = {};
    const requireMock = name => name === "server-only" ? {} : name === "@/lib/supabase/server" ? { createClient: async () => client }
      : name.startsWith("@/") ? modules.get(name.slice(2)) : realRequire(name);
    new Function("require", "exports", ts.transpileModule(await readFile(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(requireMock, exports);
    modules.set(file.replace(/\.ts$/, ""), exports);
  }
  const { getAdminOperationsReport } = modules.get("lib/data/operations-report");
  const actual = await getAdminOperationsReport({ from: "2026-10-05", to: "2026-10-05" });
  check(actual.brands.length === 3 && rpcCalls === 1, "real TypeScript loader uses one aggregate RPC and parses actual PostgreSQL DTO");
  const actualAlpha = actual.brands.find(b => b.id === id(10));
  check(!actualAlpha.features.includes("menu") && actualAlpha.features.includes("loyalty") && actualAlpha.features.includes("standalone_menu"), "actual entitlement helper applies disabled override and independent menu publication");
  check(!actual.brands.find(b => b.id === id(11)).features.includes("loyalty"), "expired plan does not appear as currently subscribed feature");
  auth.user = null;
  await rejects(() => getAdminOperationsReport({ from: "", to: "" }));
  check(rpcCalls === 1, "anonymous loader cannot call aggregate RPC");
  auth.user = { id: id(1) }; auth.profile = { role: "cafe_owner", status: "active" };
  await rejects(() => getAdminOperationsReport({ from: "", to: "" }));
  auth.profile = { role: "platform_admin", status: "suspended" };
  await rejects(() => getAdminOperationsReport({ from: "", to: "" }));
  auth.profile = { role: "platform_admin", status: "active" };
  await rejects(() => getAdminOperationsReport({ from: "2026-02-30", to: "" }));
  await rejects(() => getAdminOperationsReport({ from: "2026-10-05", to: "2026-10-04" }));
  await rejects(() => getAdminOperationsReport({ from: "", to: "" }));
  auth.result = { ...period, brands: [{ ...alpha, metrics: { ...alpha.metrics, accounts: -1 } }] };
  await rejects(() => getAdminOperationsReport({ from: "2026-10-05", to: "2026-10-05" }));
  const failed = await modules.get("app/actions/operations-report").loadOperationsReportAction({ from: "", to: "" });
  check(!failed.ok && !JSON.stringify(failed).includes("metrics"), "server action returns safe error with no partial or fabricated report");
  await db.exec("RESET ROLE");
  await query("INSERT INTO cafe_visit_events SELECT $1,'bulk-'||n, '2026-10-05T12:00:00Z'::timestamptz FROM generate_series(1,1700) n",[id(11)]);
  await asUser(1);
  check((await report()).brands.find(b => b.id === id(11)).metrics.storefrontVisits === 1701, "aggregate is not truncated by an API row limit");
  await db.exec("RESET ROLE; SET ROLE service_role");
  await rejects(() => query("SELECT public.record_customer_registration_source($1,'forged')",[id(20)]));
  await query("SELECT public.record_customer_registration_source($1,'storefront')",[id(22)]);
  await db.exec("RESET ROLE");
  check(await value("SELECT count(*) FROM operations_report_private.registration_sources WHERE customer_id=$1",[id(22)]) === 0, "historical account cannot be retroactively attributed");
  await db.exec("SET ROLE service_role");
  const signup = (phone, source = "storefront", purpose = "customer_signup") => query("SELECT * FROM public.link_customer_phone_otp_attributed($1,$2,$3,$4,'New User',$5)",[id(10),phone,purpose,id(4),source]);
  const first = (await signup("966500000040", "loyalty")).rows[0];
  check(first.result === "authenticated", "attributed wrapper preserves real signup behavior");
  await signup("966500000040", "storefront");
  await signup("966500000022", "storefront");
  const login = (await signup("966500000041", "storefront", "customer_login")).rows[0];
  check(login.result === "not_found", "missing login remains unchanged and is not attributed");
  await db.exec("RESET ROLE");
  check(await value("SELECT source FROM operations_report_private.registration_sources WHERE customer_id=$1",[first.profile_id]) === "loyalty", "first source immutable on repeated signup");
  check(await value("SELECT count(*) FROM operations_report_private.registration_sources WHERE customer_id=$1",[id(22)]) === 0, "existing historical signup never mislabeled");
  await query("INSERT INTO customer_profiles(id,cafe_id,full_name,created_at) VALUES($1,$2,'Email',clock_timestamp())",[id(60),id(10)]);
  await db.exec("SET ROLE service_role");
  await query("SELECT public.record_customer_registration_source($1,'storefront')",[id(60)]);
  await query("SELECT public.record_customer_registration_source($1,'loyalty')",[id(60)]);
  await db.exec("RESET ROLE");
  check(await value("SELECT source FROM operations_report_private.registration_sources WHERE customer_id=$1",[id(60)]) === "storefront", "new email registration persisted once");
  await db.exec(await readFile("supabase/tests/operations_report_postflight.sql", "utf8"));
  checks++;
  await db.exec("ALTER TABLE operations_report_private.registration_sources RENAME TO unavailable_sources; SET ROLE service_role");
  check((await signup("966500000050")).rows[0].result === "authenticated", "attribution storage failure does not block authentication");
  console.log(`PASS ${checks} operations-report PostgreSQL checks`);
} finally { await db.close(); }
