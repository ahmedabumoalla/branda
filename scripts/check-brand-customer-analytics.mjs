import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const dependency = createRequire(import.meta.url);
function load(relative, stubs = {}, cache = new Map()) {
  if (cache.has(relative)) return cache.get(relative);
  const output = ts.transpileModule(fs.readFileSync(relative, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {}; cache.set(relative, exports);
  new Function("require", "exports", output)(name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.startsWith("@/") || name.startsWith(".")) {
      const next = name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(relative), name);
      return load(`${next}.ts`, stubs, cache);
    }
    return dependency(name);
  }, exports);
  return exports;
}
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const stamp = "2026-11-04T10:00:00+00:00";
const retention = [7, 14, 30].map(days => ({ days, eligible: 1, retained: 1, rate: 100 }));
const brand = { id: id(1), name: "Test Brand", slug: "test-brand", category: "cafes_coffee", registeredCustomers: 205,
  cardholders: 205, activeCustomers: 100, inactiveCustomers: 105, returningCustomers: 50, loyalCustomers: 20,
  walletCustomers: 70, visitsInPeriod: 250, averageVisitGapDays: 3.5, retention, lastVisitAt: stamp };
const customer = n => ({ id: id(n + 100), name: `Synthetic ${n}`, phone: "", email: "", status: "active", identityMatch: "profile",
  joinedAt: stamp, cardIssuedAt: stamp, cardCount: 1, currentStamps: 1, totalStamps: 5, rewardsRedeemed: 1,
  lastStampAt: stamp, lastRedemptionAt: null, lastVisitAt: stamp, inactiveDays: 0, isInactive: false, visitDays: 3,
  averageVisitGapDays: 3.5, isLoyal: true, firstReturnAt: stamp,
  wallet: { firstDownloadAt: null, lastDownloadAt: null, downloads: 0, firstGoogleSaveAt: stamp, lastGoogleSaveAt: stamp,
    googleSaveLinks: 1, firstInstalledAt: null, lastInstalledAt: null, installedDevices: 0 } });
const customers = Array.from({ length: 205 }, (_, n) => customer(n));
const overview = { generatedAt: stamp, timeZone: "Asia/Riyadh", days: 30, recordingStartedAt: stamp, walletRecordingStartedAt: stamp,
  summary: { brands: 1, registeredCustomers: 205, cardholders: 205, activeCustomers: 100, inactiveCustomers: 105,
    returningCustomers: 50, loyalCustomers: 20, walletCustomers: 70 }, brands: [brand] };
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const rejects = async operation => { await assert.rejects(operation); checks++; };
const dto = load("lib/analytics/brand-customer-analytics.ts");
for (const bad of [{ brandId: "bad" }, { brandId: id(1), days: 31 }, { brandId: id(1), search: "x".repeat(101) },
  { brandId: id(1), page: 0 }, { brandId: id(1), page: 1.5 }, { brandId: id(1), segment: "any" },
  { brandId: id(1), asOf: "yesterday" }, { brandId: id(1), actorId: id(3) }]) {
  check(!dto.brandAnalyticsFiltersSchema.safeParse(bad).success, "invalid and injected filter rejected");
}
check(dto.brandAnalyticsFiltersSchema.parse({ brandId: id(1) }).days === 30, "default period");
check(dto.brandAnalyticsCustomerSchema.parse(customer(1)).wallet.firstInstalledAt === null, "Google link does not imply installation");
check(dto.brandAnalyticsCustomerDetailSchema.safeParse({ generatedAt: stamp, customer: customer(1), events: [{
  id: `coupon:${id(5)}`, at: stamp, kind: "coupon_redeemed", provider: null, origin: "live", stampsDelta: 0, rewardName: "Synthetic personal offer",
}], total: 1, page: 1, pageSize: 25 }).success, "personal coupon redemption is an accepted visit event without stamp increments");
let user = { id: id(3) }, profile = { role: "platform_admin", status: "active" }, authError = null, profileError = null;
let mode = "normal", rpcError = null;
const calls = [];
const supabase = {
  auth: { getUser: async () => ({ data: { user }, error: authError }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: profileError }) }) }) }),
  rpc: async (name, args) => {
    calls.push({ name, args });
    let data;
    if (name === "get_admin_brand_customer_analytics") data = { ...overview, days: args.p_days };
    else if (name === "get_admin_brand_analytics_customer") data = { generatedAt: stamp, customer: customer(0), events: [], total: 0, page: args.p_page, pageSize: 25 };
    else {
      const page = args.p_page, pageSize = args.p_page_size;
      data = { generatedAt: stamp, days: args.p_days, brand, heatmap: [], cohorts: [],
        customers: customers.slice((page - 1) * pageSize, page * pageSize), total: customers.length, page, pageSize };
      if (mode === "wrongBrand") data.brand = { ...brand, id: id(99) };
      if (mode === "wrongSnapshot" && page > 1) data.generatedAt = "2026-11-04T10:00:01Z";
      if (mode === "changingCount" && page > 1) data.total = 204;
      if (mode === "missingRow" && page === 3) data.customers.pop();
      if (mode === "duplicateRow" && page === 3) data.customers[0] = customer(0);
    }
    return { data, error: rpcError };
  },
};
const backend = load("lib/data/brand-customer-analytics.ts", { "server-only": {}, "@/lib/supabase/server": { createClient: async () => supabase } });
for (const denied of [null, { role: "owner", status: "active" }, { role: "customer", status: "active" }, { role: "platform_admin", status: "suspended" }]) {
  profile = denied;
  await rejects(() => backend.getAdminBrandCustomerAnalytics());
  await rejects(() => backend.getAdminBrandAnalyticsDetail({ brandId: id(1) }));
  await rejects(() => backend.getAdminBrandAnalyticsCustomer(id(1), id(100)));
  await rejects(() => backend.getAdminBrandAnalyticsExport(id(1), 30));
}
profile = { role: "platform_admin", status: "active" }; user = null;
await rejects(() => backend.getAdminBrandCustomerAnalytics()); user = { id: id(3) };
authError = new Error("private auth"); await rejects(() => backend.getAdminBrandCustomerAnalytics()); authError = null;
profileError = new Error("private profile"); await rejects(() => backend.getAdminBrandCustomerAnalytics()); profileError = null;
check(calls.length === 0, "unauthorized requests never reach analytics RPC");
check((await backend.getAdminBrandCustomerAnalytics()).summary.registeredCustomers === 205, "validated overview");
await rejects(() => backend.getAdminBrandCustomerAnalytics(2));
const detail = await backend.getAdminBrandAnalyticsDetail({ brandId: id(1), search: "  test  ", segment: "inactive" });
check(detail.customers.length === 25 && calls.at(-1).args.p_search === "test", "server pagination and normalized search");
mode = "wrongBrand"; await rejects(() => backend.getAdminBrandAnalyticsDetail({ brandId: id(1) })); mode = "normal";
await rejects(() => backend.getAdminBrandAnalyticsCustomer(id(1), id(101)));
const report = await backend.getAdminBrandAnalyticsExport(id(1), 30);
check(report.customers.length === 205 && new Set(report.customers.map(row => row.id)).size === 205, "full export across 3 pages");
check(calls.filter(call => call.name.endsWith("detail") && call.args.p_page > 1).every(call => call.args.p_as_of === stamp && call.args.p_search === "" && call.args.p_segment === "all"), "full unfiltered export shares one snapshot");
for (mode of ["wrongSnapshot", "changingCount", "missingRow", "duplicateRow"]) await rejects(() => backend.getAdminBrandAnalyticsExport(id(1), 30));
mode = "normal"; rpcError = { message: "private database detail" };
await rejects(() => backend.getAdminBrandCustomerAnalytics()); rpcError = null;
const fail = async () => { throw new Error("private database detail"); };
const actions = load("app/actions/brand-customer-analytics.ts", { "@/lib/data/brand-customer-analytics": {
  getAdminBrandCustomerAnalytics: fail, getAdminBrandAnalyticsDetail: fail, getAdminBrandAnalyticsCustomer: fail, getAdminBrandAnalyticsExport: fail,
} });
for (const result of await Promise.all([actions.loadBrandCustomerAnalyticsAction(), actions.loadBrandAnalyticsDetailAction({ brandId: id(1) }),
  actions.loadBrandAnalyticsCustomerAction(id(1), id(100)), actions.loadBrandAnalyticsExportAction(id(1), 30)])) {
  check(!result.ok && !JSON.stringify(result).includes("private"), "sanitized server-action error");
}
console.log(`Brand customer analytics: ${checks} checks passed`);
