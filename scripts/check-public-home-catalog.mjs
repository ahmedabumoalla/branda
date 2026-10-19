import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const dependency = createRequire(import.meta.url);
function load(relative, stubs, cache = new Map()) {
  const file = path.join(root, relative);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function("require", "exports", output)(name => {
    if (name === "server-only") return {};
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.startsWith("@/")) return load(`${name.slice(2)}.ts`, stubs, cache);
    return dependency(name);
  }, exports);
  return exports;
}

const basePlan = { id: "paid", name: "Paid", description: "Admin description", price_sar: 99.99, annual_discount_percent: 12.5, duration_unit: "month", duration_count: 1, trial_days: 0, free_after_trial: false, features: ["menu", "loyalty", "unknown", "orders"], active: true, max_products_monthly: 30, max_orders_monthly: null, max_branches: 1, sort_order: 0 };
function database({ plans = [basePlan], partners = [], failTable, storageError = false, throwStorage = false, enabledMenus = [], failMenus = false } = {}) {
  const queries = [], signedCalls = [], entitlementCalls = [];
  const admin = {
    from(table) {
      const query = { table, filters: [], orders: [] };
      queries.push(query);
      const builder = {
        select(columns) { query.columns = columns; return builder; },
        eq(column, value) { query.filters.push([column, value]); return builder; },
        is(column, value) { query.filters.push([column, value]); return builder; },
        order(column) { query.orders.push(column); return builder; },
        range(start, end) {
          query.range = [start, end];
          if (failTable === table) return Promise.resolve({ data: null, error: { message: "PRIVATE_DATABASE_DIAGNOSTIC" } });
          const rows = table === "platform_plans" ? plans : partners;
          return Promise.resolve({ data: rows.filter(row => query.filters.every(([column, value]) => (row[column] ?? null) === value)).slice(start, end + 1), error: null });
        },
      };
      return builder;
    },
    storage: { from(bucket) { return { async createSignedUrls(paths, seconds) {
      signedCalls.push({ bucket, paths, seconds });
      if (throwStorage) throw new Error("Storage offline");
      return storageError ? { data: null, error: {} } : { data: paths.map(item => ({ path: item, signedUrl: `https://storage.invalid/${item}?token=temporary` })), error: null };
    } }; } },
  };
  const stubs = {
    "@/lib/supabase/admin": { createAdminClient: () => admin },
    "@/lib/data/feature-entitlements": { async getCafeFeatureCodes(id) { entitlementCalls.push(id); if (failMenus) throw new Error("PRIVATE_FEATURE_ERROR"); return enabledMenus.includes(id) ? ["menu"] : []; } },
  };
  return { ...load("lib/data/public-home-catalog.ts", stubs), admin, queries, signedCalls, entitlementCalls, stubs };
}
let checks = 0;
async function test(run) { await run(); checks++; }

await test(async () => {
  const db = database({ plans: [basePlan, { ...basePlan, id: "hidden", active: false }] });
  const catalog = await db.getPublicHomeCatalog();
  assert.equal(catalog.plans.length, 1);
  assert.deepEqual(catalog.errors, { plans: false, partners: false, menus: false });
  const plan = catalog.plans[0];
  assert.equal(plan.priceMonthly, 99.99);
  assert.equal(plan.maxProductsMonthly, 30);
  assert.equal(plan.maxOrdersMonthly, null);
  assert.deepEqual(plan.durations.map(item => item.months), [1, 3, 6, 12]);
  assert.equal(plan.durations[0].totalAmount, 99.99);
  assert.equal(plan.durations[2].totalAmount, 599.94);
  assert.equal(plan.durations[2].discountAmount, 0);
  assert.equal(plan.durations[3].totalAmount, 1049.89);
  assert.deepEqual(plan.features.map(item => item.id), ["menu", "loyalty"]);
  assert(db.queries.every(query => !query.columns.includes("*")));
});
await test(async () => {
  const db = database({ plans: [{ ...basePlan, price_sar: 0, trial_days: 7, duration_unit: "year", duration_count: 2 }] });
  assert.deepEqual((await db.getPublicHomeCatalog()).plans, []);
  const reservedTrial = database({ plans: [{ ...basePlan, id: "owner_trial_7d", price_sar: 10 }] });
  assert.deepEqual((await reservedTrial.getPublicHomeCatalog()).plans, []);
});
await test(async () => {
  const db = database({ plans: [{ ...basePlan, price_sar: 0, trial_days: null, duration_unit: "year", duration_count: 2 }] });
  const catalog = await db.getPublicHomeCatalog();
  assert.deepEqual(catalog.plans, []);
  assert.equal(catalog.errors.plans, false);
});
await test(async () => {
  const partners = Array.from({ length: 1001 }, (_, index) => ({ id: `brand-${index}`, name: `Brand ${index}`, status: "suspended", is_public: false, deleted_at: null, owner_email: "PRIVATE_EMAIL", slug: "PRIVATE_SLUG" }));
  partners.push({ id: "deleted", name: "Deleted", deleted_at: "2026-10-19" });
  const db = database({ partners });
  const catalog = await db.getPublicHomeCatalog();
  assert.equal(catalog.partners.length, 1001);
  assert.equal(db.queries.filter(query => query.table === "cafes").length, 3);
  assert.deepEqual(Object.keys(catalog.partners[0]).sort(), ["id", "logoUrl", "name"]);
  assert(!JSON.stringify(catalog).includes("PRIVATE_"));
  assert(db.queries.filter(query => query.table === "cafes").every(query => query.columns === "id,name,slug,status,is_public,cafe_settings(logo_storage_path,logo_url)"));
});
await test(async () => {
  const demoId = "2e08901c-5aac-4bec-8c97-a135058e508b";
  const partners = Array.from({ length: 501 }, (_, index) => ({ id: index === 0 ? demoId : `brand-${index}`, name: index === 0 ? "تجربة الكوفي" : `Brand ${index}`, slug: `brand-${index}`, status: "active", is_public: true, cafe_settings: { logo_storage_path: `${index === 0 ? demoId : `brand-${index}`}/logo.png` } }));
  const db = database({ partners, enabledMenus: partners.map(partner => partner.id) });
  const catalog = await db.getPublicHomeCatalog();
  assert.equal(catalog.partners.length, 500, "Hidden demo must not truncate database pagination");
  assert.equal(catalog.menus.length, 500);
  assert(!catalog.partners.some(partner => partner.id === demoId));
  assert(!catalog.menus.some(menu => menu.id === demoId));
  assert(!db.signedCalls.some(call => call.paths.some(path => path.startsWith(demoId))));
  assert(!db.entitlementCalls.includes(demoId));
});
await test(async () => {
  const partners = [
    { id: "own", name: "Own", cafe_settings: { logo_storage_path: "own/upload/logo.png" } },
    { id: "foreign", name: "Foreign", cafe_settings: [{ logo_storage_path: "other/private.png" }] },
    { id: "unsafe", name: "Unsafe", cafe_settings: { logo_storage_path: "unsafe/.." } },
    { id: "encoded", name: "Encoded", cafe_settings: { logo_storage_path: "encoded/%2E%2E" } },
  ];
  const db = database({ partners });
  const catalog = await db.getPublicHomeCatalog();
  assert.equal(db.signedCalls.length, 1);
  assert.deepEqual(db.signedCalls[0], { bucket: "cafe-logos", paths: ["own/upload/logo.png"], seconds: 600 });
  assert(catalog.partners[0].logoUrl.startsWith("https://storage.invalid/"));
  assert(catalog.partners.slice(1).every(item => item.logoUrl === null));
});
await test(async () => {
  const urls = ["https://images.invalid/logo.png", "/brand/logo.png", "javascript:alert(1)", "//images.invalid/logo.png", "https://user:password@images.invalid/logo.png", "data:image/png;base64,private", "/\\images.invalid/logo.png"];
  const db = database({ partners: urls.map((logo_url, index) => ({ id: String(index), name: "Brand", cafe_settings: { logo_url } })) });
  const catalog = await db.getPublicHomeCatalog();
  assert.deepEqual(catalog.partners.map(item => item.logoUrl), [urls[0], urls[1], null, null, null, null, null]);
});
await test(async () => {
  for (const option of [{ storageError: true }, { throwStorage: true }]) {
    const db = database({ ...option, partners: [{ id: "own", name: "Own", cafe_settings: { logo_storage_path: "own/logo.png" } }] });
    const catalog = await db.getPublicHomeCatalog();
    assert.equal(catalog.partners[0].name, "Own");
    assert.equal(catalog.partners[0].logoUrl, null);
    assert.equal(catalog.errors.partners, false);
  }
});
await test(async () => {
  for (const failTable of ["platform_plans", "cafes"]) {
    const db = database({ failTable, partners: [{ id: "brand", name: "Brand" }] });
    const catalog = await db.getPublicHomeCatalog();
    assert.equal(catalog.errors.plans, failTable === "platform_plans");
    assert.equal(catalog.errors.partners, failTable === "cafes");
    assert.equal(catalog.plans.length, failTable === "platform_plans" ? 0 : 1);
    assert.equal(catalog.partners.length, failTable === "cafes" ? 0 : 1);
    assert(!JSON.stringify(catalog).includes("PRIVATE_DATABASE_DIAGNOSTIC"));
  }
  const empty = await database({ plans: [], partners: [] }).getPublicHomeCatalog();
  assert.deepEqual(empty, { plans: [], partners: [], menus: [], errors: { plans: false, partners: false, menus: false } });
});
await test(async () => {
  const mutable = { ...basePlan };
  const rows = [mutable];
  const db = database({ plans: rows });
  assert.equal((await db.getPublicHomeCatalog()).plans[0].priceMonthly, 99.99);
  mutable.price_sar = 150;
  mutable.annual_discount_percent = 20;
  const refreshed = (await db.getPublicHomeCatalog()).plans[0];
  assert.equal(refreshed.priceMonthly, 150);
  assert.equal(refreshed.durations[3].totalAmount, 1440);
  rows.push({ ...basePlan, id: "new-admin-plan", name: "New plan", price_sar: 250, features: ["pager"] });
  const added = (await db.getPublicHomeCatalog()).plans.find(plan => plan.id === "new-admin-plan");
  assert.equal(added.name, "New plan");
  assert.equal(added.priceMonthly, 250);
  assert.deepEqual(added.features.map(feature => feature.id), ["pager"]);
  const { isPurchasablePlan } = load("lib/platform/subscription-durations.ts", {});
  assert.equal(isPurchasablePlan(added), true);
  assert(fs.readFileSync(path.join(root, "components/dashboard/pages/subscription-page.tsx"), "utf8").includes("plans.filter(isPurchasablePlan)"));
});
await test(async () => {
  for (const price_sar of ["broken", null, "", -1]) {
    const db = database({ plans: [{ ...basePlan, price_sar }] });
    const catalog = await db.getPublicHomeCatalog();
    assert.equal(catalog.errors.plans, true);
    assert.deepEqual(catalog.plans, []);
  }
  const unavailable = load("lib/data/public-home-catalog.ts", { ...database().stubs, "@/lib/supabase/admin": { createAdminClient() { throw new Error("PRIVATE_KEY_ERROR"); } } });
  assert.deepEqual(await unavailable.getPublicHomeCatalog(), { plans: [], partners: [], menus: [], errors: { plans: true, partners: true, menus: true } });
});
await test(async () => {
  const base = { name: "Brand", slug: "public-menu", status: "active", is_public: true };
  const partners = [
    { ...base, id: "enabled" },
    { ...base, id: "expired" },
    { ...base, id: "disabled-override" },
    { ...base, id: "private", is_public: false },
    { ...base, id: "suspended", status: "suspended" },
    { ...base, id: "draft", status: "draft" },
    { ...base, id: "deleted", deleted_at: "2026-10-19" },
    { ...base, id: "unsafe", slug: "//external.invalid" },
    { ...base, id: "path", slug: "../../admin" },
    { ...base, id: "published", status: "published", slug: "published-menu" },
  ];
  const db = database({ partners, enabledMenus: ["enabled", "private", "suspended", "draft", "deleted", "unsafe", "path", "published"] });
  const catalog = await db.getPublicHomeCatalog();
  assert.deepEqual(catalog.menus.map(item => [item.id, item.href]), [["enabled", "/menu/public-menu"], ["published", "/menu/published-menu"]]);
  assert.deepEqual(db.entitlementCalls, ["enabled", "expired", "disabled-override", "published"]);
  assert.equal(catalog.partners.length, 9);
  assert.equal(catalog.errors.menus, false);
});
await test(async () => {
  const db = database({ failMenus: true, partners: [{ id: "brand", name: "Brand", slug: "brand", is_public: true, status: "active" }] });
  const catalog = await db.getPublicHomeCatalog();
  assert.deepEqual(catalog.menus, []);
  assert.equal(catalog.partners.length, 1);
  assert.deepEqual(catalog.errors, { plans: false, partners: false, menus: true });
  assert(!JSON.stringify(catalog).includes("PRIVATE_FEATURE_ERROR"));
});
await test(async () => {
  for (const errors of [{ plans: false, partners: false }, { plans: true, partners: false }, { plans: true, partners: true }]) {
    const catalog = { plans: [], partners: [], errors };
    const route = load("app/api/public/home-catalog/route.ts", { "@/lib/data/public-home-catalog": { getPublicHomeCatalog: async () => catalog } });
    const response = await route.GET();
    assert.equal(route.dynamic, "force-dynamic");
    assert.equal(response.status, errors.plans && errors.partners ? 503 : 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store, max-age=0");
    assert.deepEqual(await response.json(), catalog);
  }
});

await test(async () => {
  const current = { plan_id: "paid", status: "active", started_at: "2020-01-01", expires_at: "2099-01-01", platform_plans: { active: true, features: ["menu"] } };
  for (const [row, overrides, expected] of [
    [current, [], ["menu"]],
    [{ ...current, status: "trialing" }, [], ["menu"]],
    [{ ...current, expires_at: "2020-01-01" }, [], []],
    [{ ...current, started_at: "2099-01-01" }, [], []],
    [{ ...current, platform_plans: { active: false, features: ["menu"] } }, [], []],
    [current, [{ feature_id: "menu", enabled: false }], []],
    [null, [{ feature_id: "menu", enabled: true }], []],
  ]) {
    const admin = { from(table) {
      const result = { data: table === "subscriptions" ? row : overrides, error: null };
      const builder = { select() { return builder; }, eq() { return builder; }, in() { return builder; }, order() { return builder; }, limit() { return builder; }, maybeSingle() { return Promise.resolve(result); }, then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); } };
      return builder;
    } };
    const access = load("lib/data/feature-entitlements.ts", { "@/lib/supabase/admin": { createAdminClient: () => admin }, "@/lib/data/cafes": {} });
    const features = await access.getCafeFeatureCodes("brand");
    assert.deepEqual(features.filter(feature => feature === "menu"), expected);
  }
});

await test(async () => {
  const React = dependency("react");
  const { renderToStaticMarkup } = dependency("react-dom/server");
  let allowed = true, menu = { slug: "brand", name: "Brand" }, menuCalls = 0;
  const page = load("app/menu/[slug]/page.tsx", {
    "next/navigation": { notFound() { throw new Error("NOT_FOUND"); } },
    "@/lib/data/standalone-menu": { getStandaloneMenu: async () => { menuCalls++; return menu; } },
    "@/lib/data/public-home-catalog": { isPublicHomeMenuSlug: async () => allowed },
    "@/components/menu/bistro-menu": { BistroMenu: () => React.createElement("main", null, "real-menu") },
    "@/components/analytics/public-page-analytics": { PublicPageAnalytics: () => React.createElement("i", null, "ANALYTICS") },
    "@/components/menu/menu-auto-refresh": { MenuAutoRefresh: () => React.createElement("i", null, "REFRESH") },
  });
  const props = { params: Promise.resolve({ slug: "brand" }), searchParams: Promise.resolve({ showcase: "1" }) };
  const preview = renderToStaticMarkup(await page.default(props));
  assert(preview.includes("real-menu"));
  assert(preview.includes("inert"));
  assert(!preview.includes("REFRESH"), "Showcase must not keep reloading full menus in the background");
  assert(!preview.includes("ANALYTICS"));
  const metadata = await page.generateMetadata(props);
  assert.equal(metadata.robots.index, false);
  assert.equal(metadata.alternates.canonical, "/menu/brand");
  const ordinary = renderToStaticMarkup(await page.default({ params: props.params }));
  assert(ordinary.includes("ANALYTICS"));
  assert(ordinary.includes("REFRESH"), "Normal customer menus retain live updates");
  assert(!ordinary.includes("inert"));
  allowed = false;
  const before = menuCalls;
  await assert.rejects(page.default(props), /NOT_FOUND/);
  assert.equal(menuCalls, before, "Private preview must be rejected before loading menu data");
  allowed = true;
  menu = null;
  await assert.rejects(page.default(props), /NOT_FOUND/, "Preview must preserve the public entitlement gate");
});

await test(async () => {
  const calls = [];
  const builder = {
    select(value) { calls.push(["select", value]); return builder; },
    eq(...args) { calls.push(["eq", ...args]); return builder; },
    in(...args) { calls.push(["in", ...args]); return builder; },
    is(...args) { calls.push(["is", ...args]); return builder; },
    maybeSingle() { return Promise.resolve({ data: { id: "brand" }, error: null }); },
  };
  const catalogModule = load("lib/data/public-home-catalog.ts", { ...database().stubs, "@/lib/supabase/admin": { createAdminClient: () => ({ from: () => builder }) } });
  assert.equal(await catalogModule.isPublicHomeMenuSlug("../admin"), false);
  assert.equal(calls.length, 0);
  assert.equal(await catalogModule.isPublicHomeMenuSlug("brand"), true);
  assert(calls.some(call => JSON.stringify(call) === JSON.stringify(["eq", "is_public", true])));
  assert(calls.some(call => JSON.stringify(call) === JSON.stringify(["in", "status", ["active", "published"]])));
  assert(calls.some(call => JSON.stringify(call) === JSON.stringify(["is", "deleted_at", null])));
});

if (process.argv.includes("--live")) {
  process.loadEnvFile(path.join(root, ".env.local"));
  const { getPublicHomeCatalog } = load("lib/data/public-home-catalog.ts", {});
  const catalog = await getPublicHomeCatalog();
  assert.deepEqual(catalog.errors, { plans: false, partners: false, menus: false }, "Live public catalog failed");
  const { createAdminClient } = load("lib/supabase/admin.ts", {});
  const admin = createAdminClient();
  const [{ count: planCount, error: planError }, { count: partnerCount, error: partnerError }] = await Promise.all([
    admin.from("platform_plans").select("id", { count: "exact", head: true }).eq("active", true).gt("price_sar", 0).neq("id", "owner_trial_7d"),
    admin.from("cafes").select("id", { count: "exact", head: true }).is("deleted_at", null).neq("id", "2e08901c-5aac-4bec-8c97-a135058e508b"),
  ]);
  assert.equal(planError, null);
  assert.equal(partnerError, null);
  assert.equal(catalog.plans.length, planCount);
  assert.equal(catalog.partners.length, partnerCount);
  const logos = catalog.partners.filter(partner => partner.logoUrl);
  for (const partner of logos) {
    const response = await fetch(new URL(partner.logoUrl, "https://barndaksa.com"), { method: "HEAD" });
    assert.equal(response.status, 200, "A signed partner logo is unavailable");
  }
  const evidence = { executedAt: new Date().toISOString(), node: process.version, plans: planCount, partners: partnerCount, menus: catalog.menus.length, availableLogos: logos.length, allNonDemoBrandsIncluded: true, databaseWrites: 0, inputHashes: Object.fromEntries(["lib/data/public-home-catalog.ts", "lib/platform/public-home-catalog.ts", "app/api/public/home-catalog/route.ts", "app/menu/[slug]/page.tsx", "components/dashboard/pages/subscription-page.tsx", "scripts/check-public-home-catalog.mjs", "lib/data/feature-entitlements.ts", "lib/platform/active-subscription.ts", "lib/platform/feature-access.ts", "lib/platform/feature-registry.ts", "lib/platform/subscription-durations.ts", "package-lock.json"].map(file => [file, dependency("node:crypto").createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex")])) };
  fs.writeFileSync(path.join(root, ".git/home-catalog-fast-live.json"), JSON.stringify(evidence, null, 2));
  console.log(`Live catalog passed: ${planCount} public active plans, ${partnerCount} partners, ${catalog.menus.length} public active menus, ${logos.length} available logos; no writes`);
}
console.log(`Public homepage catalog: ${checks} grouped checks passed`);
