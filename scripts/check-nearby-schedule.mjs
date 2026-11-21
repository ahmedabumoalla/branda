import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, stubs = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "exports", source)(name => name === "server-only" ? {} : stubs[name] ?? require(name), exports);
  return exports;
}
const helper = load("lib/loyalty/nearby-schedule.ts");
const { nearbyScheduleSchema, scheduledNearbyMessage, NEARBY_SCHEDULE_CAFE_ID: cafe } = helper;
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const periods = [
  { id: id(1), start: "07:00", end: "09:00", message: "رسالة الصباح" },
  { id: id(2), start: "09:00", end: "10:00", message: "رسالة الفترة الثانية" },
  { id: id(3), start: "23:00", end: "02:00", message: "رسالة المساء" },
];
const schedule = { enabled: true, periods, revision: 0 };
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
check(nearbyScheduleSchema.safeParse(schedule).success);
for (const [utc, expected] of [["03:59", null], ["04:00", periods[0].message], ["05:59", periods[0].message], ["06:00", periods[1].message], ["07:00", null], ["20:00", periods[2].message], ["22:59", periods[2].message], ["23:00", null]]) {
  check(scheduledNearbyMessage(schedule, new Date(`2026-11-21T${utc}:00Z`)) === expected, utc);
}
check(scheduledNearbyMessage({ ...schedule, enabled: false }) === null);
const invalid = [
  [{ ...periods[0], start: "24:00" }], [{ ...periods[0], start: "7:00" }], [{ ...periods[0], end: "07:00" }],
  [{ ...periods[0], message: " " }], [{ ...periods[0], message: "x".repeat(241) }],
  [periods[0], { ...periods[1], start: "08:59" }],
  [periods[2], { ...periods[1], start: "01:59", end: "03:00" }],
  [periods[0], { ...periods[1], id: periods[0].id }],
  Array.from({ length: 49 }, (_, i) => ({ ...periods[0], id: id(20 + i) })),
];
for (const rows of invalid) check(!nearbyScheduleSchema.safeParse({ ...schedule, periods: rows }).success);
check(!nearbyScheduleSchema.safeParse({ ...schedule, periods: [] }).success);
check(nearbyScheduleSchema.safeParse({ ...schedule, enabled: false, periods: [] }).success);

// Real PostgreSQL execution in memory; never contacts the platform or providers.
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE ?? path.join(tmpdir(), "branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js")).href);
const db = new PGlite();
const q = (sql, args = []) => db.query(sql, args);
const v = async (sql, args = []) => Object.values((await q(sql, args)).rows[0])[0];
await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE SCHEMA platform_access_private;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
 CREATE TABLE public.profiles(id uuid PRIMARY KEY,status text);
 CREATE TABLE public.cafes(id uuid PRIMARY KEY,owner_id uuid,status text DEFAULT 'active');
 CREATE FUNCTION public.is_cafe_owner(c uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.cafes WHERE id=c AND owner_id=auth.uid()) $$;
 CREATE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
 CREATE FUNCTION public.brand_account_not_cancelled(c uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.archived',true),'')<>'yes' $$;
 CREATE FUNCTION platform_access_private.service_enabled(c uuid,s text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.no_entitlement',true),'')<>'yes' $$;
 CREATE TABLE public.loyalty_cards(id uuid PRIMARY KEY,cafe_id uuid,status text);
 CREATE TABLE public.wallet_passes(card_id uuid,cafe_id uuid,provider text,updated_at timestamptz DEFAULT now(),PRIMARY KEY(card_id,provider));
 CREATE TABLE public.wallet_notification_jobs(id uuid DEFAULT gen_random_uuid(),cafe_id uuid,card_id uuid,kind text,status text DEFAULT 'pending');
 CREATE UNIQUE INDEX pending_sync ON public.wallet_notification_jobs(card_id) WHERE kind='sync' AND status='pending';
 GRANT USAGE ON SCHEMA public,auth,platform_access_private TO authenticated,service_role;
 GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
 INSERT INTO public.profiles VALUES('${id(9)}','active'),('${id(10)}','active');
 INSERT INTO public.cafes VALUES('${cafe}','${id(9)}'),('${id(99)}','${id(10)}');
 INSERT INTO public.loyalty_cards VALUES('${id(11)}','${cafe}','active'),('${id(12)}','${id(99)}','active');
 INSERT INTO public.wallet_passes(card_id,cafe_id,provider) VALUES('${id(11)}','${cafe}','apple'),('${id(11)}','${cafe}','google'),('${id(12)}','${id(99)}','apple');
`);
await db.exec(fs.readFileSync("supabase/migrations/20261120235457_bolingo_nearby_message_periods.sql", "utf8"));
for (const rows of invalid) check(!await v("SELECT public.valid_loyalty_nearby_periods($1::jsonb)", [JSON.stringify(rows)]));
for (const rows of [null, {}, [null], [{ message: "hello" }]]) check(!await v("SELECT public.valid_loyalty_nearby_periods($1::jsonb)", [JSON.stringify(rows)]));
check(await v("SELECT public.valid_loyalty_nearby_periods($1::jsonb)", [JSON.stringify(periods)]));
const everyMinute = await q("SELECT n,public.loyalty_nearby_message_at(true,$1::jsonb,'2026-11-20T21:00:00Z'::timestamptz+n*interval '1 minute') message FROM generate_series(0,1439) n", [JSON.stringify(periods)]);
for (const row of everyMinute.rows) check(row.message === scheduledNearbyMessage(schedule, new Date(Date.parse("2026-11-20T21:00:00Z") + row.n * 60000)), `SQL/JS minute ${row.n}`);
async function actor(value, role = "authenticated") { await db.exec(`RESET ROLE; SET test.actor='${value}'; SET ROLE ${role};`); }
async function denied(sql, args = []) { await assert.rejects(() => q(sql, args)); checks++; }
const save = (enabled, rows, revision) => v("SELECT public.save_loyalty_nearby_schedule($1,$2,$3::jsonb,$4)", [cafe, enabled, JSON.stringify(rows), revision]);
await actor(id(10));
await assert.rejects(() => save(true, periods, 0)); checks++;
await actor(""); await assert.rejects(() => save(true, periods, 0)); checks++;
await actor(id(9));
await denied("SELECT public.save_loyalty_nearby_schedule($1,true,$2::jsonb,0)", [id(99), JSON.stringify(periods)]);
await denied("SELECT public.refresh_loyalty_nearby_schedules()");
await denied("INSERT INTO public.loyalty_nearby_schedules(cafe_id) VALUES($1)", [cafe]);
check((await save(true, periods, 0)).revision === 1);
await assert.rejects(() => save(true, periods, 0)); checks++;
check(await v("SELECT count(*) FROM public.loyalty_nearby_schedules") === 1);
await actor(id(10)); check(await v("SELECT count(*) FROM public.loyalty_nearby_schedules") === 0);
await actor("", "anon"); await denied("SELECT * FROM public.loyalty_nearby_schedules"); await denied("SELECT public.refresh_loyalty_nearby_schedules()");
await actor(id(9));
await db.exec("SET test.no_entitlement='yes'"); await assert.rejects(() => save(true, periods, 1)); checks++;
await db.exec("SET test.no_entitlement='no'; SET test.archived='yes'"); await assert.rejects(() => save(true, periods, 1)); checks++;
await db.exec("SET test.archived='no'");
// Force a genuine transition, verify coalescing, tenant isolation and no announcement jobs.
await db.exec("RESET ROLE; DELETE FROM public.wallet_notification_jobs; UPDATE public.loyalty_nearby_schedules SET last_message_token='old'; SET ROLE service_role;");
check(await v("SELECT public.refresh_loyalty_nearby_schedules()") === 1);
check(await v("SELECT count(*) FROM public.wallet_notification_jobs WHERE cafe_id=$1 AND kind='sync' AND nearby_refresh", [cafe]) === 1);
check(await v("SELECT count(*) FROM public.wallet_notification_jobs WHERE cafe_id<>$1 OR kind='message'", [cafe]) === 0);
check(await v("SELECT public.refresh_loyalty_nearby_schedules()") === 0);
await db.exec("RESET ROLE; UPDATE public.loyalty_nearby_schedules SET last_message_token='old-again'; SET ROLE service_role;");
check(await v("SELECT public.refresh_loyalty_nearby_schedules()") === 1);
check(await v("SELECT count(*) FROM public.wallet_notification_jobs") === 1);
await actor(id(9)); check((await save(false, periods, 1)).revision === 2);
check(await v("SELECT enabled FROM public.loyalty_nearby_schedules") === false);
await db.close();

// Real data-service guards and action result handling with mocked database boundaries.
let adminReads = 0, rpcCalls = 0, currentCafe = cafe;
const service = load("lib/data/nearby-schedule.ts", {
  "@/lib/loyalty/nearby-schedule": helper,
  "@/lib/supabase/admin": { createAdminClient: () => ({ from: () => { adminReads++; return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: schedule }) }) }) }; } }) },
  "@/lib/supabase/server": { createClient: async () => ({ rpc: async (_name, args) => { rpcCalls++; assert.equal(args.p_cafe, cafe); return { data: { ...schedule, revision: 1 } }; } }) },
  "@/lib/data/cafes": { requireOwnerCafeContext: async () => ({ id: currentCafe }) },
  "@/lib/data/feature-entitlements": { getOwnerFeatureCodes: async () => ["loyalty"] },
  "@/lib/platform/feature-gates": { featureCodesAllow: () => true },
});
check(await service.getNearbySchedule(id(99)) === null); check(adminReads === 0);
check((await service.getNearbySchedule(cafe)).periods.length === 3);
check(!(await service.saveOwnerNearbySchedule({ ...schedule, periods: invalid[0] })).ok); check(rpcCalls === 0);
check((await service.saveOwnerNearbySchedule(schedule)).ok); check(rpcCalls === 1);
currentCafe = id(99); await assert.rejects(() => service.saveOwnerNearbySchedule(schedule)); checks++;
const { renderToStaticMarkup } = require("react-dom/server");
const { createElement } = require("react");
const { NearbyScheduleEditor } = load("components/loyalty/nearby-schedule-editor.tsx", {
  "@/lib/loyalty/nearby-schedule": helper,
  "@/app/actions/nearby-schedule": { saveNearbyScheduleAction: async () => { throw Error("No writes during render"); } },
  "./nearby-schedule-editor.module.css": {},
});
const editor = renderToStaticMarkup(createElement(NearbyScheduleEditor, { initial: { schedule } }));
check(editor.includes("تحديد فترات") && editor.includes("بتوقيت السعودية"));
check((editor.match(/type="time"/g) ?? []).length === 6);
check(!editor.includes("<form"), "Editor must not nest a form inside reward settings");
check(editor.includes("تنتهي هذه الفترة في اليوم التالي"));
check(editor.includes("حذف الفترة 3") && editor.includes("حفظ الفترات"));
const empty = renderToStaticMarkup(createElement(NearbyScheduleEditor, { initial: { schedule: helper.emptyNearbySchedule } }));
check(empty.includes("أضف أول فترة"));
const failed = renderToStaticMarkup(createElement(NearbyScheduleEditor, { initial: { schedule: null, error: "تعذر التحميل" } }));
check(failed.includes('role="alert"') && failed.includes('disabled=""'), "Failed reads cannot overwrite existing schedules");
const priorSecret = process.env.CRON_SECRET;
process.env.CRON_SECRET = "test-only-nearby-worker-secret-123456789";
let refreshCalls = 0, queueCalls = 0;
const workerRoute = load("app/api/wallet/jobs/route.ts", {
  "@/lib/data/nearby-schedule": { refreshNearbySchedules: async () => { refreshCalls++; throw Error("Schedule temporarily unavailable"); } },
  "@/lib/wallet": { retryWalletNotificationJobs: async () => { queueCalls++; return { processed: 0 }; } },
  "@/lib/wallet/welcome": { dispatchWalletWelcomes: async () => ({ processed: 0 }) },
  "@/lib/wallet/birthday": { dispatchBirthdayGreetings: async () => ({ processed: 0 }) },
});
check((await workerRoute.GET(new Request("https://example.invalid/api/wallet/jobs"))).status === 401);
check(refreshCalls === 0 && queueCalls === 0, "Unauthorized cron calls must not read or dispatch anything");
const workerResponse = await workerRoute.GET(new Request("https://example.invalid/api/wallet/jobs", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
check(workerResponse.status === 200 && queueCalls === 1, "A schedule failure cannot stop other brands' wallet jobs");
check((await workerResponse.json()).nearbySchedules.failed === true, "Schedule failures remain visible in the worker result");
if (priorSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = priorSecret;
console.log(`Nearby schedule: ${checks} checks passed (including 1440 SQL/JS minute boundaries, tenant guards and durable queue)`);
