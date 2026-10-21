import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = fileURLToPath(new URL("..", import.meta.url));
const dependency = createRequire(import.meta.url);
const unavailable = Symbol("notFound");
const navigation = {
  notFound: () => { throw unavailable; },
  redirect: (url) => { throw new Error(`redirect:${url}`); },
};
function load(file, stubs = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function("require", "exports", output)((name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name === "next/link") return { __esModule: true, default: "a" };
    if (name === "next/navigation") return navigation;
    if (name === "react") return { ...React, cache: (fn) => fn };
    if (name.startsWith("@/")) {
      const relative = name.slice(2);
      return load(`${relative}${fs.existsSync(path.join(root, `${relative}.tsx`)) ? ".tsx" : ".ts"}`, stubs);
    }
    return dependency(name);
  }, exports);
  return exports;
}
const render = (element) => renderToStaticMarkup(element);
const assertUnavailable = (html) => {
  assert(html.includes("عذرًا تعذر التحميل"));
  assert(html.includes("تصفح منتجات برندة"));
  assert(html.includes('href="/"'));
  assert(!/انته|اشتراك|باقة/.test(html));
};
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }

await check("Menu loyalty card and cashier failures share generic recovery with no billing disclosure", () => {
  for (const file of ["app/menu/[slug]/not-found.tsx", "app/loyalty/[slug]/not-found.tsx", "app/loyalty-card/[cardCode]/not-found.tsx"]) {
    assertUnavailable(render(React.createElement(load(file).default)));
  }
  assertUnavailable(render(React.createElement(load("components/cashier/cashier-unavailable.tsx").CashierServiceUnavailable)));
});

await check("Unavailable menu still follows the server guarded not-found path", async () => {
  const { default: Page } = load("app/menu/[slug]/page.tsx", {
    "@/lib/data/standalone-menu": { getStandaloneMenu: async () => null },
    "@/components/menu/bistro-menu": { BistroMenu: () => { throw new Error("must not render private content"); } },
    "@/components/analytics/public-page-analytics": { PublicPageAnalytics: () => null },
    "@/components/menu/menu-auto-refresh": { MenuAutoRefresh: () => null },
    "@/lib/data/public-home-catalog": { isPublicHomeMenuSlug: async () => true },
  });
  await assert.rejects(Page({ params: Promise.resolve({ slug: "test" }) }), (error) => error === unavailable);
});

await check("Unavailable loyalty cannot render membership or enrollment", async () => {
  const forbidden = () => { throw new Error("must not load protected membership"); };
  const { default: Page } = load("app/loyalty/[slug]/page.tsx", {
    "@/lib/data/loyalty-experience": { getLoyaltyBrand: async () => null, getLoyaltyMembership: forbidden },
    "@/lib/auth/rast-loyalty-session": { getLoyaltyCustomerProfile: async () => null },
    "@/lib/wallet": { getWalletReadiness: forbidden },
    "@/components/rast-loyalty/rast-enrollment": { RastEnrollment: forbidden },
    "@/components/rast-loyalty/rast-member-card": { RastMemberCard: forbidden },
    "@/components/analytics/public-page-analytics": { PublicPageAnalytics: forbidden },
    "@/lib/analytics/brand-analytics": { loyaltyVisitKind: forbidden },
  });
  await assert.rejects(Page({ params: Promise.resolve({ slug: "test" }), searchParams: Promise.resolve({}) }), (error) => error === unavailable);
});

const cashier = (overrides = {}) => load("app/cashier/page.tsx", {
  "@/lib/data/cashier": {
    getCashierLandingPath: async () => "/cashier",
    getCashierConsole: async () => null,
    requireCashierSessionContext: async () => ({ cafeId: "test" }),
    getCashierToken: async () => "session-token",
    ...overrides,
  },
  "@/lib/data/loyalty-experience": { getLoyaltyBrand: async () => null },
  "@/components/rast-loyalty/rast-cashier": { RastCashier: () => React.createElement("div", null, "authorized-cashier") },
}).default;
await check("Legacy loyalty card links deny missing entitlement before rendering customer content", async () => {
  const { default: Page } = load("app/loyalty-card/[cardCode]/page.tsx", {
    "@/lib/data/loyalty-cards": { getLoyaltyCardViewByCode: async () => ({ cafeSlug: "test", card: {}, program: {} }) },
    "@/lib/data/loyalty": { getPublicLoyaltyBySlug: async () => null },
    "@/lib/data/feature-entitlements": { getPublicCafeFeatureCodesBySlug: async () => [] },
    "@/lib/platform/business-copy": { getBusinessCopy: () => ({}) },
    "@/components/loyalty/public-loyalty-card-view": { PublicLoyaltyCardView: () => assert.fail("must not render card") },
  });
  await assert.rejects(Page({ params: Promise.resolve({ cardCode: "TEST-CARD" }) }), (error) => error === unavailable);
});
await check("Valid staff session missing service access shows unavailable without clearing session", async () => {
  assertUnavailable(render(await cashier({ getCashierToken: () => assert.fail("must not clear valid session") })()));
});
await check("Invalid staff sessions and anonymous visits retain secure login handling", async () => {
  const invalidSession = { requireCashierSessionContext: async () => { throw new Error("expired"); } };
  await assert.rejects(cashier(invalidSession)(), /redirect:\/cashier\/session\/clear\?reason=invalid/);
  await assert.rejects(cashier({ ...invalidSession, getCashierToken: async () => null })(), /redirect:\/cashier\/login/);
});
await check("Authorized cashier and pager continue to their existing services", async () => {
  assert(render(await cashier({ getCashierConsole: async () => ({ cafe: { slug: "test" } }) })()).includes("authorized-cashier"));
  await assert.rejects(cashier({ getCashierLandingPath: async () => "/pager" })(), /redirect:\/pager/);
});
await check("Cashier login with valid service-disabled session reaches guarded cashier page", async () => {
  const { default: Login } = load("app/cashier/login/page.tsx", {
    "@/lib/data/cashier": { getCashierLandingPath: async () => "/cashier" },
    "@/components/cashier/cashier-login-form": { CashierLoginForm: () => assert.fail("valid session must not re-login") },
  });
  await assert.rejects(Login({ searchParams: Promise.resolve({}) }), /redirect:\/cashier$/);
});
console.log(`Public service unavailable checks passed (${checks} groups)`);
