import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(file, stubs = {}, cache = new Map(), globals = {}) {
  file = path.normalize(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, console, Date, Intl, Error, URL, URLSearchParams, AbortSignal, fetch, ...globals, require: name => {
    if (name in stubs) return stubs[name];
    if (name === "server-only") return {};
    if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name === "next/link") return { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) };
    if (name.startsWith("@/") || name.startsWith(".")) {
      const base = name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(file), name);
      return load(base + (fs.existsSync(base + ".tsx") ? ".tsx" : ".ts"), stubs, cache, globals);
    }
    return require(name);
  } }); return exports;
}
const language = load("lib/cashier/language.ts");
const messages = load("lib/cashier/messages.ts").cashierEnglish;
const stubs = { "@/app/actions/cashier": {}, "@/app/actions/loyalty-experience": {}, "@/app/actions/pager": {} };
function render(file, name, props = {}, locale = "en") {
  const cache = new Map();
  const provider = load("components/cashier/cashier-language.tsx", stubs, cache).CashierLanguageProvider;
  return renderToStaticMarkup(React.createElement(provider, { initialLocale: locale }, React.createElement(load(file, stubs, cache)[name], props)));
}
test("Arabic and English render on the server with correct direction and translated login errors", () => {
  for (const locale of ["ar", "en"]) {
    const html = render("components/cashier/cashier-login-form.tsx", "CashierLoginForm", { initialMessage: "بيانات الكاشير غير صحيحة أو الحساب معطل" }, locale);
    assert(html.includes(`dir="${locale === "ar" ? "rtl" : "ltr"}"`));
    assert(html.includes(locale === "ar" ? "دخول نقطة التشغيل" : "Your shift starts here"));
    assert(html.includes(locale === "ar" ? "الحساب معطل" : "inactive account"));
    assert.match(html, /type="email" dir="ltr"/);
    assert.match(html, /aria-pressed="true"/);
  }
});
test("reward product, description and earned terms all use the chosen language without mutating the reward", () => {
  const reward = { rewardTitle: "قهوة مجانية", rewardDescription: "حجم وسط", metadata: { termsSnapshot: { rewardKind: "product", rewardProductName: "قهوة اليوم", terms: "تُصرف مرة واحدة" } }, catalog: { unavailable: false, fields: { title: { ar: "قهوة مجانية", en: "Free coffee" }, description: { ar: "حجم وسط", en: "Medium size" }, product: { ar: "قهوة اليوم", en: "Coffee of the day" }, terms: { ar: "تُصرف مرة واحدة", en: "Redeem once" } } } };
  const before = JSON.stringify(reward);
  const html = render("components/rast-loyalty/rast-cashier.tsx", "RastCashierRewardDetails", { reward });
  for (const label of ["Coffee of the day", "Medium size", "Redeem once", "Reward product"]) assert(html.includes(label));
  assert(!html.includes("قهوة اليوم")); assert.equal(JSON.stringify(reward), before);
  const ar = render("components/rast-loyalty/rast-cashier.tsx", "RastCashierRewardDetails", { reward }, "ar");
  assert(ar.includes("قهوة اليوم")); assert(!ar.includes("Coffee of the day"));
});
test("pager status, delivery status, duration and accessible actions are localized", () => {
  const order = { id: "order", invoiceNumber: "00012-A", phone: "966500000001", status: "ready", createdAt: "2026-10-14T10:00:00Z", readyAt: "2026-10-14T10:05:00Z", messageStatus: "provider_queued", messageCount: 1 };
  const html = render("components/pager/pager-order-card.tsx", "PagerOrderCard", { order, onChange() {} });
  for (const label of ["Ready for pickup", "Accepted by the WhatsApp provider", "5 min", "Cancel invoice 00012-A", "966500000001"]) assert(html.includes(label), label);
  assert(!html.includes("قيد التجهيز"));
});
test("all literal interface translation keys have reviewed English copy", () => {
  const files = ["components/cashier/cashier-login-form.tsx", "components/cashier/cashier-unavailable.tsx", "components/rast-loyalty/rast-cashier.tsx", "components/rast-loyalty/rast-camera-scanner.tsx", "components/pager/pager-console.tsx", "components/pager/pager-order-card.tsx", "components/pager/pager-downloads.tsx", "app/cashier/error.tsx", "app/pager/error.tsx"];
  for (const file of files) {
    const tree = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = node => {
      if (ts.isCallExpression(node) && node.expression.getText(tree) === "t") {
        const inspect = child => { if (ts.isStringLiteral(child) && /[\u0600-\u06ff]/.test(child.text)) assert(messages[child.text], `${file}: ${child.text}`); else ts.forEachChild(child, inspect); };
        node.arguments.forEach(inspect);
      }
      if (ts.isJsxText(node)) assert(!/[\u0600-\u06ff]/.test(node.text), `${file}: untranslated JSX`);
      ts.forEachChild(node, visit);
    }; visit(tree);
  }
});
test("language choice persists in a shared cookie and updates live subscribers without navigation", () => {
  let cookie = "", savedCookie = "", stored, updates = 0;
  const events = new Map();
  const doc = { get cookie() { return cookie; }, set cookie(value) { savedCookie = value; cookie = value.split(";")[0]; } };
  const hooks = { ...React, useContext: () => "ar", useMemo: run => run(), useSyncExternalStore: (subscribe, get) => { subscribe(() => updates++); return get(); } };
  const module = load("components/cashier/cashier-language.tsx", { react: hooks }, new Map(), { document: doc, location: { protocol: "https:" }, Event: class { constructor(type) { this.type = type; } }, localStorage: { setItem: (key, value) => { stored = [key, value]; } }, window: { addEventListener: (key, fn) => events.set(key, fn), removeEventListener() {}, dispatchEvent: event => events.get(event.type)?.() } });
  const first = module.useCashierLanguage(); assert.equal(first.locale, "ar"); first.selectLocale("en");
  assert.equal(module.useCashierLanguage().locale, "en"); assert.equal(updates, 1);
  assert(savedCookie.includes("Path=/") && savedCookie.includes("SameSite=Lax") && savedCookie.includes("Secure"));
  assert.deepEqual(stored, ["branda-cashier-language", "en"]);
  module.useCashierLanguage().selectLocale("ar"); assert.equal(module.useCashierLanguage().dir, "rtl");
});
test("catalog translation batches identical text once, handles failures honestly and preserves originals", async () => {
  const calls = [];
  const module = load("lib/cashier/catalog-translation.ts", {}, new Map(), { fetch: async url => { calls.push(url); if (url.searchParams.get("q").includes("فشل")) throw Error("network"); return { ok: true, json: async () => [[["Coffee of the day"]]] }; } });
  const result = await module.localizeCashierCatalog({ title: "قهوة اليوم", product: "قهوة اليوم", terms: "فشل الترجمة" });
  assert.equal(calls.length, 2); assert.equal(result.fields.product.en, "Coffee of the day");
  assert.equal(result.fields.product.ar, "قهوة اليوم"); assert.equal(result.fields.terms.en, "فشل الترجمة"); assert.equal(result.unavailable, true);
  await module.localizeCashierCatalog({ title: "قهوة اليوم" }); assert.equal(calls.length, 2);
});
test("catalog lookup authorizes first and never sends customer identity or codes for translation", async () => {
  const calls = []; let allowed = false;
  const generic = new Proxy({}, { get: () => ({}) });
  const imports = { ...generic, "@/lib/data/loyalty-experience": { lookupRastCashierCard: async () => { if (!allowed) throw Error("denied"); return { customerName: "Private Customer", rewardName: "قهوة اليوم" }; } }, "@/lib/cashier/catalog-translation": { localizeCashierCatalog: async input => { calls.push(input); return {}; } } };
  // Only the two relevant imported services execute; other action dependencies remain untouched
  const source = fs.readFileSync("app/actions/loyalty-experience.ts", "utf8");
  for (const match of source.matchAll(/from "([^"]+)"/g)) if (!(match[1] in imports) && match[1] !== "zod") imports[match[1]] = {};
  const actions = load("app/actions/loyalty-experience.ts", imports);
  await assert.rejects(actions.lookupRastCashierCardAction("PRIVATECODE")); assert.equal(calls.length, 0);
  allowed = true; await actions.lookupRastCashierCardAction("PRIVATECODE");
  assert.equal(JSON.stringify(calls), JSON.stringify([{ rewardName: "قهوة اليوم" }]));
});
test("changing language preserves a scanned reward and the same uncertain redemption request", async () => {
  let locale = "ar", cursor = 0, calls = [], lookups = 0, failures = true;
  const slots = [];
  const hooks = { ...React, useEffect() {}, useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; }, useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], value => slots[i] = typeof value === "function" ? value(slots[i]) : value]; } };
  const reward = { customerName: "Fixture Customer", rewardCode: "REWARD123", rewardTitle: "قهوة اليوم", sourceType: "loyalty", canRedeem: true, expiresAt: "2099-01-01T00:00:00Z", metadata: {}, catalog: { fields: { title: { ar: "قهوة اليوم", en: "Coffee of the day" } } } };
  const imports = { react: hooks, "@/components/cashier/cashier-language": { CashierLanguageSwitch: () => null, useCashierLanguage: () => ({ locale, dir: locale === "ar" ? "rtl" : "ltr", t: value => language.cashierText(locale, value), errorText: value => language.cashierError(locale, value) }) }, "@/app/actions/cashier": {}, "@/app/actions/loyalty-experience": { lookupRastCashierCardAction: async () => ({}), lookupRastCashierRewardAction: async () => { lookups++; return reward; }, scanLoyaltyExperienceAction: async input => { calls.push(input); if (failures) throw Error("network"); return { status: "redeemed", ok: true }; } } };
  const module = load("components/rast-loyalty/rast-cashier.tsx", imports, new Map(), { crypto: { randomUUID: () => "request-fixture" } });
  const renderTree = () => { cursor = 0; return module.RastCashier({ initialData: { cafe: { slug: "rast", name: "Fixture" }, cashier: { fullName: "Operator" } } }); };
  const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : !node || typeof node !== "object" ? [] : [node, ...nodes(node.props?.children)];
  nodes(renderTree()).find(node => node.type === "button" && node.key === "redeem").props.onClick();
  nodes(renderTree()).find(node => node.type === "input").props.onChange({ target: { value: "CARD123" } });
  nodes(renderTree()).find(node => node.type === "form" && node.props.onSubmit).props.onSubmit({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  locale = "en";
  let tree = renderTree(); assert.equal(tree.props.dir, "ltr");
  assert.equal(nodes(tree).find(node => node.type === "input").props.value, "CARD123");
  assert.equal(lookups, 1); assert.equal(calls.length, 0);
  const confirm = () => nodes(renderTree()).find(node => node.type === "button" && JSON.stringify(node.props.children).includes(locale === "en" ? "Confirm handover" : "تأكيد تسليم"));
  confirm().props.onClick(); await new Promise(resolve => setImmediate(resolve));
  locale = "ar"; failures = false; confirm().props.onClick(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 2); assert.equal(calls[0].requestId, calls[1].requestId); assert.equal(calls[0].value, "REWARD123"); assert.equal(lookups, 1);
});
