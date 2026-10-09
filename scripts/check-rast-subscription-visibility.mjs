import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Actual TS/React code with deterministic state and isolated data adapters.
// No browser, provider, database or subscription mutation is involved.
const root = fileURLToPath(new URL("..", import.meta.url));
const dependency = createRequire(import.meta.url);
function load(relative, stubs = {}, cache = new Map()) {
  relative = relative.replaceAll("\\", "/");
  if (cache.has(relative)) return cache.get(relative);
  const output = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {}; cache.set(relative, exports);
  new Function("require", "exports", output)((name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.startsWith("@/") || name.startsWith(".")) {
      const next = name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(relative), name);
      return load(fs.existsSync(path.join(root, `${next}.tsx`)) ? `${next}.tsx` : `${next}.ts`, stubs, cache);
    }
    return dependency(name);
  }, exports);
  return exports;
}
let checks = 0;
async function test(label, run) {
  try { await run(); checks++; } catch (error) { throw new Error(label, { cause: error }); }
}
const access = load("lib/platform/feature-access.ts");
const registry = load("lib/platform/feature-registry.ts");
const permissions = load("lib/platform/permissions.ts");
const planCases = [...Object.keys(registry.platformPlanFeatureDefaults), "missing-plan", "all-plan"];
for (const planId of planCases) await test(`Every brand has the same three entries for ${planId} without granting permissions`, () => {
  const plans = planId === "all-plan" ? [{ id: planId, features: ["all"] }] : [];
  const overrides = [{ featureId: "loyalty", enabled: false }];
  const context = { planId, plans, overrides };
  const rows = access.getSidebarFeaturesForBrand({ ...context, cafeSlug: "rast" });
  const featureIds = rows.map((row) => row.feature.id);
  assert.deepEqual(featureIds, ["menu", "loyalty", "settings"]);
  const loyalty = rows.find((row) => row.feature.id === "loyalty");
  assert.equal(loyalty.access.effectiveEnabled, false);
  assert.equal(loyalty.access.result, "disabled_by_admin");
  assert.equal(permissions.cafeHasFeature("loyalty", context), false, "hiding billing does not bypass feature permission");
  assert.deepEqual(access.getSidebarFeaturesForBrand({ ...context, cafeSlug: "other" }).map(row => row.feature.id), featureIds);
});
for (const features of [[], ["menu"], ["loyalty"], ["menu", "loyalty"], ["all"]]) await test(`Actual package controls navigation access: ${features.join(",") || "empty"}`, () => {
  const rows = access.getSidebarFeaturesForBrand({ planId: "starter", plans: [{ id: "starter", features }] });
  assert.deepEqual(rows.map(row => row.feature.id), ["menu", "loyalty", "settings"]);
  for (const id of ["menu", "loyalty"]) assert.equal(rows.find(row => row.feature.id === id).access.effectiveEnabled, features.includes(id) || features.includes("all"));
});
await test("Missing package fails closed while explicit admin enable is respected", () => {
  const rows = access.getSidebarFeaturesForBrand({ planId: "pro", plans: [], overrides: [{ featureId: "loyalty", enabled: true }] });
  assert.equal(rows.find(row => row.feature.id === "menu").access.effectiveEnabled, false);
  assert.equal(rows.find(row => row.feature.id === "loyalty").access.effectiveEnabled, true);
  assert(rows.some(row => row.feature.id === "settings"));
});

function serverPage({ slug = "rast", configured = true, missing = false, contextError = false } = {}) {
  const calls = [];
  const plans = [{ id: "all-plan", features: ["all"] }];
  const history = [{ id: "history" }];
  const pending = { id: "pending" };
  const SubscriptionPageClient = () => React.createElement("div", { "data-subscription-client": true });
  const reads = (name, value) => async () => { calls.push(name); return value; };
  const stubs = {
    "next/link": { __esModule: true, default: "a" },
    "next/navigation": { redirect: (target) => { const error = new Error("NEXT_REDIRECT"); error.target = target; throw error; } },
    "@/components/dashboard/pages/subscription-page": { SubscriptionPageClient },
    "@/lib/barndaksa/env": { isSupabaseConfigured: () => configured },
    "@/lib/data/cafes": { getOwnerCafeContext: async () => { calls.push("context"); if (contextError) throw new Error("unavailable"); return missing ? null : { id: "cafe", slug }; } },
    "@/lib/data/admin": { getCafeFeatureOverrides: reads("overrides", []), getOwnerActivePlanId: reads("active-plan", "all-plan") },
    "@/lib/data/subscription": {
      getAvailablePlans: reads("plans", plans), getOwnerPendingSubscription: reads("pending", pending), getOwnerSubscriptionHistory: reads("history", history),
    },
  };
  return { Page: load("app/dashboard/subscription/page.tsx", stubs).default, calls, plans, pending, history, SubscriptionPageClient };
}
await test("direct Rast subscription URL redirects before any subscription read and escapes error catch", async () => {
  const ctx = serverPage();
  await assert.rejects(() => ctx.Page(), (error) => error.message === "NEXT_REDIRECT" && error.target === "/dashboard/menu");
  assert.deepEqual(ctx.calls, ["context"]);
});
await test("other brand subscription page preserves data and client", async () => {
  const ctx = serverPage({ slug: "other" });
  const element = await ctx.Page();
  assert.equal(element.type, ctx.SubscriptionPageClient);
  assert.deepEqual(element.props.initialPlans, ctx.plans);
  assert.deepEqual(element.props.initialHistory, ctx.history);
  assert.deepEqual(element.props.initialPending, ctx.pending);
  assert.equal(element.props.initialActivePlanId, "all-plan");
  assert.deepEqual(ctx.calls.sort(), ["context", "plans", "history", "pending", "active-plan", "overrides"].sort());
});
for (const options of [{ configured: false }, { missing: true }, { contextError: true }]) await test(`missing brand stays neutral: ${JSON.stringify(options)}`, async () => {
  const ctx = serverPage(options);
  const html = renderToStaticMarkup(await ctx.Page());
  assert(html.includes('role="alert"') && html.includes('href="/dashboard/menu"'));
  assert(!html.includes("subscription") && !html.includes("data-subscription-client"));
  assert(ctx.calls.every((call) => call === "context"));
});

function hooks(state) {
  let cursor = 0;
  return { ...React, useState: () => [state[cursor++], () => {}], useEffect: () => {}, useMemo: (compute) => compute(), useTransition: () => [false, () => {}] };
}
function sidebarHtml(slug, collapsed = false) {
  const plans = [{ id: "all-plan", features: ["all"], name: "PRIVATE_PLAN_NAME" }];
  const stubs = {
    react: hooks([{ planId: "all-plan", plans, featureOverrides: [{ featureId: "loyalty", enabled: false }], settings: { cafeSlug: slug, cafeName: "Brand", businessCategory: "cafes_coffee" }, notifications: [] }]),
    "next/link": { __esModule: true, default: "a" },
    "next/navigation": { usePathname: () => "/dashboard/menu", useRouter: () => ({ push: () => {} }) },
    "@/components/cafe/cafe-logo": { CafeLogo: () => null },
    "@/components/dashboard/notifications-panel": { NotificationsPanel: () => null },
    "@/components/ui/barndaksa-logo": { BarndaksaLogo: () => null },
    "@/lib/cafe/use-resolved-cafe-logo": { useResolvedCafeLogoUrl: () => null },
    "@/lib/platform/auth": {},
    "@/lib/performance/dashboard-shell-client": {},
  };
  const { DashboardSidebar } = load("components/dashboard/DashboardSidebar.tsx", stubs);
  return renderToStaticMarkup(React.createElement(DashboardSidebar, { collapsed }));
}
for (const slug of ["rast", "other", "shahi-w-hail"]) for (const collapsed of [false, true]) await test(`${slug} sidebar SSR contains exactly the requested navigation (${collapsed ? "collapsed" : "expanded"})`, () => {
  const html = sidebarHtml(slug, collapsed);
  assert(!html.includes("/dashboard/subscription"));
  assert(!html.includes("PRIVATE_PLAN_NAME") && !html.includes("249"));
  assert(!html.includes("ترقية"));
  assert(html.includes('href="/dashboard/loyalty"'), "locked feature keeps its own guarded route");
  assert.deepEqual([...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]), ["/dashboard/menu", "/dashboard/loyalty", "/dashboard/settings"]);
  for (const label of ["المنيو والمنتجات", "الولاء والمكافآت", "إعدادات كوفي", "تسجيل الخروج"]) assert(html.includes(label));
  assert(html.includes('aria-current="page"'));
  assert(html.includes("غير مفعلة في الباقة"));
});
await test("unresolved sidebar identity does not flash a plan badge", () => {
  const html = sidebarHtml("");
  assert(!html.includes("/dashboard/subscription") && !html.includes("PRIVATE_PLAN_NAME"));
});

function layoutHtml(slug, allow = false) {
  const guard = { loading: false, cafeSlug: slug, activePlanId: "all-plan", plans: [{ id: "all-plan", features: ["all"] }], featureOverrides: [{ featureId: "loyalty", enabled: allow }] };
  const stubs = {
    react: hooks([guard, false]),
    "next/link": { __esModule: true, default: "a" },
    "next/navigation": { usePathname: () => "/dashboard/loyalty" },
    "@/app/actions/maintenance": {},
    "@/components/dashboard/DashboardSidebar": { DashboardSidebar: () => null },
    "@/components/ui/responsive-app-shell": { ResponsiveAppShell: ({ children }) => React.createElement("main", null, children) },
    "@/lib/performance/dashboard-shell-client": {},
  };
  const { DashboardAppLayout } = load("components/dashboard/dashboard-app-layout.tsx", stubs);
  return renderToStaticMarkup(React.createElement(DashboardAppLayout, null, "PROTECTED_FEATURE_CONTENT"));
}
for (const slug of ["rast", ""]) await test(`disabled feature has neutral copy without billing for identity '${slug}'`, () => {
  const html = layoutHtml(slug);
  assert(!html.includes("PROTECTED_FEATURE_CONTENT"));
  assert(!html.includes("/dashboard/subscription") && !html.includes("باقة") && !html.includes("ترقية") && !html.includes("اشتراك"));
  assert(html.includes('href="/dashboard/menu"'));
});
await test("other brand keeps upgrade prompt when feature is disabled", () => {
  const html = layoutHtml("other");
  assert(!html.includes("PROTECTED_FEATURE_CONTENT"));
  assert(html.includes('href="/dashboard/subscription"') && html.includes("ترقية الباقة"));
});
await test("Rast authorized feature still renders its protected content", () => {
  const html = layoutHtml("rast", true);
  assert(html.includes("PROTECTED_FEATURE_CONTENT") && !html.includes("/dashboard/subscription"));
});
console.log(`PASS shared brand navigation and subscription visibility: ${checks} checks; actual server routing, package permissions and React SSR, no browser.`);
