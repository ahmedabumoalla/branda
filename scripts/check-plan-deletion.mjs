import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";

// Exercise the real data layer and action against isolated PostgreSQL semantics
// using the checked-in foreign keys, RLS policies, grants and audit trigger.
const engine = process.env.PGLITE_MODULE ?? path.join(tmpdir(), "branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js");
const { PGlite } = await import(pathToFileURL(engine).href);
const db = new PGlite();
const read = file => fs.readFileSync(file, "utf8");
const base = read("supabase/migrations/001_barndaksa_production_schema.sql");
const audit = read("supabase/migrations/005_barndaksa_admin_dashboard_audit.sql");
const checkout = read("supabase/migrations/006_barndaksa_subscription_checkout_upgrade.sql");
const settings = read("supabase/migrations/003_barndaksa_security_hardening.sql");
const categories = read("supabase/migrations/059_barndaksa_enable_events_conferences_platform.sql");
function extract(source, pattern) { const match = source.match(pattern); assert.ok(match, String(pattern)); return match[0]; }
const reference = (source, field) => extract(source, new RegExp(`${field}\\s+(?:TEXT|text)[^\\n]*REFERENCES[^\\n]*platform_plans\\(id\\)[^\\n]*`, "i")).trim().replace(/,$/, "");
let allowed = true;
let queries = 0;
let deleteQueries = 0;
let beforeDelete;
let deleteFailure;
let suppressDelete = false;
const revalidated = [];
const tables = new Set(["platform_plans", "platform_settings", "category_default_plans"]);
function client() {
  return { from(table) {
    assert.ok(tables.has(table), `unexpected table ${table}`);
    let operation = "select", columns = "*", single = false, order;
    const filters = [];
    const builder = {
      select(value) { columns = value; return builder; },
      delete() { operation = "delete"; return builder; },
      eq(key, value) { filters.push([key, value]); return builder; },
      order(key) { order = key; return builder; },
      single() { single = true; return builder; },
      async then(resolve, reject) {
        try {
          queries++;
          const params = filters.map(([, value]) => value);
          const where = filters.length ? ` WHERE ${filters.map(([key], i) => `${key}=$${i + 1}`).join(" AND ")}` : "";
          if (operation === "delete") {
            deleteQueries++;
            assert.deepEqual(filters.map(([key]) => key), ["id"], "delete must target exactly one primary key");
            if (beforeDelete) { const callback = beforeDelete; beforeDelete = undefined; await callback(params[0]); }
            if (deleteFailure) return resolve({ data: null, error: deleteFailure });
            if (suppressDelete) return resolve({ data: [], error: null });
          }
          const sql = operation === "delete" ? `DELETE FROM ${table}${where} RETURNING ${columns}` : `SELECT ${columns} FROM ${table}${where}${order ? ` ORDER BY ${order}` : ""}`;
          const { rows } = await db.query(sql, params);
          resolve({ data: single ? rows[0] : rows, error: null });
        } catch (error) { resolve({ data: null, error }); }
      },
    };
    return builder;
  } };
}
const dependency = createRequire(import.meta.url);
const cache = new Map();
const stubs = {
  "@/lib/supabase/server": { createClient: async () => client() },
  "@/lib/supabase/admin": { createAdminClient: () => client() },
  "@/lib/data/cafes": { requirePlatformAdmin: async () => { if (!allowed) throw new Error("Forbidden"); return { id: "00000000-0000-4000-8000-000000000001" }; } },
  "@/lib/platform/maintenance": {},
  "@/lib/data/feature-entitlements": {},
  "next/cache": { revalidatePath: value => revalidated.push(value) },
};
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const output = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function("require", "exports", output)(name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.startsWith("@/")) return load(path.resolve(`${name.slice(2)}.ts`));
    if (name.startsWith(".")) return load(path.resolve(path.dirname(file), `${name}.ts`));
    return dependency(name);
  }, exports);
  return exports;
}
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-000000000001'::uuid $$;
    CREATE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('test.admin',true)='yes' $$;
    ${extract(base, /CREATE TABLE IF NOT EXISTS platform_plans \([\s\S]*?\n\);/)}
    CREATE TABLE subscriptions(id integer PRIMARY KEY, ${reference(base, "plan_id")});
    CREATE TABLE subscription_payment_requests(id integer PRIMARY KEY, ${reference(checkout, "plan_id")});
    CREATE TABLE platform_settings(id text PRIMARY KEY, ${reference(settings, "default_plan_id")});
    ${extract(categories, /CREATE TABLE IF NOT EXISTS public.category_default_plans \([\s\S]*?\n\);/)}
    CREATE TABLE audit_logs(actor_id uuid,cafe_id uuid,action text,entity_table text,entity_id uuid,old_data jsonb,new_data jsonb);
    ${extract(audit, /CREATE OR REPLACE FUNCTION public.capture_platform_admin_audit\(\)[\s\S]*?\n\$\$;/)}
    ${extract(audit, /CREATE TRIGGER admin_audit_platform_plans[\s\S]*?\(\);/)}
    ALTER TABLE platform_plans ENABLE ROW LEVEL SECURITY;
    ${extract(base, /CREATE POLICY platform_plans_read[^;]+;/)}
    ${extract(base, /CREATE POLICY platform_plans_admin[^;]+;/)}
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT SELECT ON platform_plans,platform_settings,category_default_plans TO authenticated;
    ${extract(audit, /GRANT INSERT, UPDATE, DELETE ON TABLE public.platform_plans TO authenticated;/)}
    INSERT INTO platform_plans(id,name) VALUES ('default','Default'),('category','Category'),('owner_trial_7d','Trial'),('unused_plan','Unused'),('subscribed','Subscribed'),('payment','Payment'),('race','Race'),('failure','Failure');
    INSERT INTO platform_settings VALUES('default','default');
    INSERT INTO category_default_plans(category_id,default_plan_id) VALUES('restaurants','category');
    INSERT INTO subscriptions VALUES(1,'subscribed');
    INSERT INTO subscription_payment_requests VALUES(1,'payment');
    SELECT set_config('test.admin','yes',false);
    SET ROLE authenticated;
  `);
  const data = load(path.resolve("lib/data/admin.ts"));
  const actions = load(path.resolve("app/actions/admin.ts"));
  const outcome = await actions.deletePlatformPlanAction("unused_plan");
  assert.deepEqual(outcome, { ok: true, data: "unused_plan" });
  check(!(await data.getAdminPlatformPlans()).some(plan => plan.id === "unused_plan"), "fresh admin load must not restore the deleted plan");
  check(!(await data.getPlatformPlans()).some(plan => plan.id === "unused_plan"), "public plan listing also omits the deleted plan");
  assert.deepEqual(revalidated, ["/admin/plans", "/dashboard/subscription"]);
  const beforeRetry = deleteQueries;
  assert.deepEqual(await actions.deletePlatformPlanAction("unused_plan"), outcome);
  check(deleteQueries === beforeRetry, "lost-response retry is idempotent");

  for (const id of ["default", "category", "owner_trial_7d"]) {
    const count = deleteQueries;
    const result = await actions.deletePlatformPlanAction(id);
    check(!result.ok && /لا يمكن حذف/.test(result.message), `protect ${id} on server`);
    check(deleteQueries === count, "protected plans never reach delete");
  }
  for (const id of ["subscribed", "payment"]) {
    const result = await actions.deletePlatformPlanAction(id);
    check(!result.ok && result.message.includes("مرتبطة"), `show useful foreign-key error for ${id}`);
    check((await data.getAdminPlatformPlans()).some(plan => plan.id === id), "referenced plan is retained");
  }
  beforeDelete = async id => {
    await db.exec("RESET ROLE");
    await db.query("INSERT INTO subscriptions VALUES(2,$1)", [id]);
    await db.exec("SET ROLE authenticated");
  };
  check(!(await actions.deletePlatformPlanAction("race")).ok, "concurrent subscription blocks deletion atomically");
  allowed = false;
  const beforeDenied = queries;
  check(!(await actions.deletePlatformPlanAction("failure")).ok, "non-admin action is denied");
  check(queries === beforeDenied, "authorization precedes all data reads and writes");
  allowed = true;
  check(!(await actions.deletePlatformPlanAction("bad/id")).ok, "invalid plan identifiers rejected");
  deleteFailure = { code: "42501", message: "private database detail" };
  const failed = await actions.deletePlatformPlanAction("failure");
  check(!failed.ok && !failed.message.includes("private"), "permission failure is not a false success or leaked detail");
  deleteFailure = undefined;
  suppressDelete = true;
  check(!(await actions.deletePlatformPlanAction("failure")).ok, "zero affected rows are not reported as deletion");
  suppressDelete = false;
  await db.exec("SELECT set_config('test.admin','no',false)");
  check((await db.query("DELETE FROM platform_plans WHERE id='failure' RETURNING id")).rows.length === 0, "RLS independently blocks non-admin deletion");
  await db.exec("RESET ROLE");
  const log = (await db.query("SELECT old_data->>'id' AS id FROM audit_logs WHERE action='admin_delete_platform_plans'")).rows;
  check(log.length === 1 && log[0].id === "unused_plan", "exactly one successful deletion is audited");
  check((await db.query("SELECT count(*)::int AS count FROM subscriptions")).rows[0].count === 2, "subscription history remains intact");
  check((await db.query("SELECT count(*)::int AS count FROM subscription_payment_requests")).rows[0].count === 1, "payment history remains intact");
  console.log(`PASS plan deletion: ${checks} isolated PostgreSQL/data/action checks including fresh reload, FK races, audit, RLS, authorization and retry`);
} finally {
  await db.close();
}
