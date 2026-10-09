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
for (const planId of planCases) await test(`Navigation fails closed for missing package ${planId}`, () => {
  const rows = access.getSidebarFeaturesForBrand({ planId, plans: [], overrides: [{ featureId: "loyalty", enabled: true }] });
  assert.deepEqual(rows, []);
  assert.equal(permissions.cafeHasFeature("loyalty", { planId, plans: [] }), false);
});
for (const features of [[], ["menu"], ["menu", "offers"], ["loyalty"], ["settings"], ["all"]]) await test(`Only actual enabled package services are visible: ${features.join(",") || "empty"}`, () => {
  const rows = access.getSidebarFeaturesForBrand({ planId: "starter", plans: [{ id: "starter", features }] });
  const expected = access.getBrandNavigationFeatures().filter(f => features.includes("all") || features.includes(f.id)).map(f => f.id);
  assert.deepEqual(rows.map(row => row.feature.id), expected);
  assert(rows.every(row => row.access.effectiveEnabled));
});
await test("Admin override cannot open missing package services but may suspend them", () => {
  const rows = access.getSidebarFeaturesForBrand({ planId: "pro", plans: [{id: "pro", features: ["menu"]}], overrides: [{ featureId: "loyalty", enabled: true }, {featureId: "menu", enabled: false}] });
  assert.deepEqual(rows, []);
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
function sidebarElement(slug, props = {}, extraStubs = {}) {
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
    ...extraStubs,
  };
  const { DashboardSidebar } = load("components/dashboard/DashboardSidebar.tsx", stubs);
  return DashboardSidebar(props);
}
function sidebarHtml(slug, collapsed = false) {
  return renderToStaticMarkup(sidebarElement(slug, { collapsed }));
}
for (const slug of ["rast", "other", "shahi-w-hail"]) for (const collapsed of [false, true]) await test(`${slug} sidebar SSR contains exactly the requested navigation (${collapsed ? "collapsed" : "expanded"})`, () => {
  const html = sidebarHtml(slug, collapsed);
  assert(!html.includes("/dashboard/subscription"));
  assert(!html.includes("PRIVATE_PLAN_NAME") && !html.includes("249"));
  assert(!html.includes("ترقية"));
  assert(!html.includes('href="/dashboard/loyalty"'), "disabled service is hidden");
  assert.deepEqual([...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]), ["/dashboard/menu", "/dashboard/offers", "/dashboard/settings"]);
  for (const label of ["المنيو والمنتجات", "العروض", "إعدادات كوفي", "تسجيل الخروج"]) assert(html.includes(label));
  assert(html.includes('aria-current="page"'));
  assert(!html.includes("غير مفعلة في الباقة"));
});
await test("unresolved sidebar identity does not flash a plan badge", () => {
  const html = sidebarHtml("");
  assert(!html.includes("/dashboard/subscription") && !html.includes("PRIVATE_PLAN_NAME"));
});

function layoutElement(slug, allow = false, props = {}, extraStubs = {}) {
  const guard = { loading: false, cafeSlug: slug, activePlanId: "all-plan", plans: [{ id: "all-plan", features: ["all"] }], featureOverrides: [{ featureId: "loyalty", enabled: allow }] };
  const stubs = {
    react: hooks([guard, false]),
    "next/link": { __esModule: true, default: "a" },
    "next/navigation": { usePathname: () => "/dashboard/loyalty" },
    "@/app/actions/maintenance": {},
    "@/components/dashboard/DashboardSidebar": { DashboardSidebar: () => null },
    "@/components/ui/responsive-app-shell": { ResponsiveAppShell: ({ children }) => React.createElement("main", null, children) },
    "@/lib/performance/dashboard-shell-client": {},
    ...extraStubs,
  };
  const { DashboardAppLayout } = load("components/dashboard/dashboard-app-layout.tsx", stubs);
  return DashboardAppLayout({ children: "PROTECTED_FEATURE_CONTENT", ...props });
}
function layoutHtml(slug, allow = false) {
  return renderToStaticMarkup(layoutElement(slug, allow));
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
const maintenanceSession = { cafeName: "علامة الصيانة", maintenanceAccountNumber: "BR-TEST", expiresAt: Date.UTC(2026, 9, 9, 17) };
function findElement(element, predicate) {
  if (!element || typeof element !== "object") return null;
  if (predicate(element)) return element;
  for (const child of React.Children.toArray(element.props?.children)) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}
await test("Maintenance notice precedes content and sidebar exits maintenance, including collapsed mode", async () => {
  const element = layoutElement("other", true, { maintenanceSession });
  const html = renderToStaticMarkup(element);
  assert(html.indexOf("أنت في وضع الصيانة") < html.indexOf("PROTECTED_FEATURE_CONTENT"));
  assert(html.includes("إنهاء وضع الصيانة والعودة للأدمن"));
  assert.equal(element.props.mobileTitle, "لوحة التحكم — وضع الصيانة");
  assert.equal(typeof element.props.sidebar(() => {}).props.onEndMaintenance, "function");
  for (const collapsed of [false, true]) {
    const calls = [];
    const sidebar = sidebarElement("other", { collapsed, onEndMaintenance: () => calls.push("exit-maintenance") }, {
      "@/lib/platform/auth": { logoutBarndaksaAuth: () => calls.push("sign-out") },
    });
    const exit = findElement(sidebar, item => item.type === "button" && item.props["aria-label"] === "إنهاء وضع الصيانة");
    assert(exit);
    assert(!renderToStaticMarkup(sidebar).includes("تسجيل الخروج"));
    await exit.props.onClick();
    assert.deepEqual(calls, ["exit-maintenance"]);
  }
});
await test("Normal owner retains normal sign-out and no maintenance notice", async () => {
  assert(!renderToStaticMarkup(layoutElement("other", true)).includes("أنت في وضع الصيانة"));
  const calls = [];
  let finishLogout;
  const sidebar = sidebarElement("other", {}, {
    "@/lib/platform/auth": { logoutBarndaksaAuth: () => new Promise(resolve => { finishLogout = resolve; }) },
    "next/navigation": { usePathname: () => "/dashboard", useRouter: () => ({ push: target => calls.push(target) }) },
  });
  const pending = findElement(sidebar, item => item.props["aria-label"] === "تسجيل الخروج").props.onClick();
  assert.deepEqual(calls, [], "never navigate before sign-out completes");
  finishLogout();
  await pending;
  assert.deepEqual(calls, ["/login"]);
});
for (const failure of [false, true]) await test(`Maintenance completion ${failure ? "failure stays recoverable" : "clears cache before admin navigation"}`, async () => {
  const calls = [];
  const state = [];
  let transition;
  let finish;
  const baseHooks = hooks([{ loading: true }, false, ""]);
  const element = layoutElement("other", true, { maintenanceSession }, {
    react: { ...baseHooks, useState: initial => { const pair = baseHooks.useState(initial); return [pair[0], value => state.push(value)]; }, useTransition: () => [false, action => { transition = action(); }] },
    "@/app/actions/maintenance": { exitMaintenanceModeAction: () => new Promise((resolve, reject) => { calls.push("exit"); finish = () => failure ? reject(new Error("network")) : resolve({ ok: true }); }) },
    "@/lib/performance/dashboard-shell-client": { clearDashboardShellSnapshot: () => calls.push("clear-cache") },
  });
  const previousWindow = globalThis.window;
  globalThis.window = { location: { assign: target => calls.push(target) } };
  try {
    element.props.sidebar(() => {}).props.onEndMaintenance();
    assert.deepEqual(calls, ["exit"]);
    finish();
    await transition;
    assert.deepEqual(calls, failure ? ["exit"] : ["exit", "clear-cache", "/admin/maintenance"]);
    if (failure) assert.equal(state.at(-1), "تعذر إنهاء وضع الصيانة. حاول مرة أخرى.");
  } finally { globalThis.window = previousWindow; }
});
await test("Pending maintenance exit disables both controls and error is announced", () => {
  const element = layoutElement("other", true, { maintenanceSession }, {
    react: { ...hooks([{ loading: true }, false, "تعذر إنهاء وضع الصيانة"]), useTransition: () => [true, () => { throw new Error("duplicate exit"); }] },
  });
  const button = findElement(element, item => item.type === "button");
  assert.equal(button.props.disabled, true);
  assert(findElement(element, item => item.props?.role === "alert"));
  const sidebarProps = element.props.sidebar(() => {}).props;
  sidebarProps.onEndMaintenance();
  const sidebar = sidebarElement("other", sidebarProps);
  assert.equal(findElement(sidebar, item => item.props["aria-label"] === "جاري إنهاء الصيانة").props.disabled, true);
});
console.log(`PASS shared navigation, maintenance exit and subscription visibility: ${checks} checks; actual server routing, UI handlers and React SSR, no browser.`);
