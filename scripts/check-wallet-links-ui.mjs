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
const noMutation = () => assert.fail("Rendering must not send messages or mutate cards");
const baseStubs = {
  "next/link": { __esModule: true, default: "a" },
  "next/image": { __esModule: true, default: ({ unoptimized, ...props }) => React.createElement("img", props) },
  "next/navigation": { useRouter: () => ({ refresh: noMutation }) },
  "@/app/actions/loyalty-experience": new Proxy({}, { get: () => noMutation }),
  "@/app/actions/wallet-links": { saveWalletLinksAction: noMutation },
  "@/app/actions/coffee-points-program": { saveCoffeePointsProgram: noMutation },
  "@/app/actions/cashier": { logoutCashierAction: "/test-logout" },
  "@/app/actions/cashier-loyalty-phone": { lookupCashierLoyaltyPhoneAction: noMutation },
  "@/components/cashier/analytics-coupon-redemption": { AnalyticsCouponRedemption: () => null },
};
function load(file, stubs = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {}; cache.set(file, exports);
  new Function("require", "exports", output)((name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (Object.hasOwn(baseStubs, name)) return baseStubs[name];
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.startsWith(".") || name.startsWith("@/")) {
      const relative = name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(file), name);
      return load(`${relative}${fs.existsSync(path.join(root, `${relative}.tsx`)) ? ".tsx" : ".ts"}`, stubs, cache);
    }
    return dependency(name);
  }, exports);
  return exports;
}
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const identity = { name: "علامة الاختبار", slug: "test-brand", logoUrl: "/own-logo.png", cardBackground: "#186340", cardForeground: "#ffffff", cardAccent: "#327746" };
const program = { enabled: true, purchasesRequired: 7, rewardName: "هدية الزيارة", terms: "", appleWalletEnabled: true, googleWalletEnabled: true };
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }

const { WalletLinksEditor } = load("components/loyalty/wallet-links-editor.tsx");
check("Missing wallet link schema disables editing without presenting an empty saved list", () => {
  const html = render(WalletLinksEditor, { initial: { available: false, links: [] }, brandName: identity.name });
  assert(html.includes('role="status"'));
  assert(!html.includes("<form"));
});
check("Wallet details preview renders safe links in owner order with labelled inputs", () => {
  const html = render(WalletLinksEditor, { initial: { available: true, links: [
    { id: "social", label: "حسابنا", url: "https://instagram.com/example" },
    { id: "phone", label: "اتصل بنا", url: "tel:+966500000000" },
  ] }, brandName: identity.name });
  assert(html.includes('href="https://instagram.com/example"'));
  assert(html.includes('href="tel:+966500000000"'));
  assert(html.indexOf('href="https://instagram.com/example"') < html.indexOf('href="tel:+966500000000"'));
  assert(html.includes('for="wallet-link-social-label"'));
  assert(html.includes('id="wallet-link-social-label"'));
  assert(html.includes('rel="noopener noreferrer"'));
});
check("Wallet preview does not make an unsafe address clickable", () => {
  const html = render(WalletLinksEditor, { initial: { available: true, links: [{ id: "unsafe", label: "رابط", url: "javascript:alert(1)" }] }, brandName: identity.name });
  assert(!html.includes('href="javascript:'));
});
const { RastLoyaltyDashboard } = load("components/rast-loyalty/rast-dashboard.tsx", {
  "@/components/loyalty/customer-directory": { LoyaltyCustomerDirectory: () => null },
  "@/components/loyalty/wallet-message-history": { WalletMessageHistory: () => null },
  "@/components/loyalty/nearby-schedule-editor": { NearbyScheduleEditor: () => null },
});
check("Owner rewards shows links editor while staff and messages views omit it", () => {
  const props = { identity, view: "rewards", initialDashboard: { program },
    initialExperience: { rewardValidityDays: 30, nearbyMessage: "", latitude: null, longitude: null },
    signupUrl: "https://example.com/loyalty/brand", walletAvailability: { apple: true, google: true },
    walletLinks: { available: true, links: [] } };
  assert(render(RastLoyaltyDashboard, props).includes('id="wallet-links-title"'));
  assert(!render(RastLoyaltyDashboard, { ...props, staffMode: true }).includes('id="wallet-links-title"'));
  assert(!render(RastLoyaltyDashboard, { ...props, view: "messages" }).includes('id="wallet-links-title"'));
});
console.log(`Wallet links UI: ${checks} checks passed`);
