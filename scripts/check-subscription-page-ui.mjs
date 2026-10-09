import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const dependency = createRequire(import.meta.url);
function load(file, stubs = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  new Function("require", "exports", output)((name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (name.startsWith("@/") || name.startsWith(".")) {
      const next = name.startsWith("@/") ? path.resolve(name.slice(2)) : path.resolve(path.dirname(file), name);
      return load(fs.existsSync(`${next}.tsx`) ? `${next}.tsx` : `${next}.ts`, stubs, cache);
    }
    return dependency(name);
  }, exports);
  return exports;
}

const access = load(path.resolve("lib/platform/feature-access.ts"));
const plans = [
  { id: "owner_trial_7d", name: "Trial", priceMonthly: 0, active: true, features: ["menu", "settings"], durationUnit: "day", durationCount: 7 },
  { id: "paid", name: "Menu plan", description: "Menu only", priceMonthly: 115, offerEnabled: false, active: true, features: ["menu"], durationOptions: [1, 12] },
  { id: "loyalty", name: "Loyalty plan", description: "Menu and loyalty", priceMonthly: 230, offerEnabled: false, active: true, features: ["menu", "loyalty"], durationOptions: [1, 12] },
];
const request = { id: "00000000-0000-4000-8000-000000000001", planId: "loyalty", planName: "Loyalty plan", amount: 230, durationMonths: 1, status: "awaiting_receipt", createdAt: "2026-10-09T10:00:00Z", receiptChannel: "upload" };
const base = { initialPlans: plans, initialActivePlanId: "owner_trial_7d", initialHistory: [], initialPending: null,
  initialFeatureAccess: access.getEffectiveBrandFeatureAccess(["menu", "settings"]),
  currentSubscription: { id: "current", planId: "owner_trial_7d", status: "trialing", startedAt: "2026-10-09T10:00:00Z", expiresAt: "2026-10-16T10:00:00Z" },
  bankDetails: null, initialRequests: [], customerName: "Test Customer", referenceTime: Date.parse("2026-10-09T10:00:00Z"),
};
function harness(props = {}, actions = {}) {
  const values = []; let index = 0; const calls = [];
  const hooks = { ...React, useState(initial) { const slot = index++; if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial; return [values[slot], next => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }]; }, useRef(initial) { const slot = index++; if (!(slot in values)) values[slot] = { current: initial }; return values[slot]; } };
  const { SubscriptionPageClient } = load(path.resolve("components/dashboard/pages/subscription-page.tsx"), {
    react: hooks, "next/navigation": { useRouter: () => ({ refresh: () => calls.push(["refresh"]) }) },
    "@/lib/performance/dashboard-shell-client": { clearDashboardShellSnapshot: () => calls.push(["clear-cache"]) },
    "@/app/actions/subscription": {
      createBankSubscriptionRequestAction: async (...args) => { calls.push(["create", ...args]); return { ok: true, data: [request] }; },
      uploadSubscriptionReceiptAction: async (id, form) => { calls.push(["upload", id, form.get("receipt")]); return { ok: true, data: [{ ...request, status: "pending_review" }] }; },
      submitSubscriptionWhatsappAction: async id => { calls.push(["whatsapp", id]); return { ok: true, data: [{ ...request, status: "pending_review", receiptChannel: "whatsapp" }] }; },
      refreshSubscriptionRequestsAction: async () => ({ ok: true, data: [{ ...request, status: "approved" }] }), ...actions,
    },
  });
  return { calls, values, render() { index = 0; return SubscriptionPageClient({ ...base, ...props }); } };
}
function nodes(tree) { if (!tree || typeof tree !== "object") return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
function text(tree) { if (tree == null || typeof tree === "boolean") return ""; if (Array.isArray(tree)) return tree.map(text).join(""); return typeof tree === "object" ? text(tree.props?.children) : String(tree); }
function button(tree, label) { return nodes(tree).find(node => node.type === "button" && text(node) === label); }

const view = harness();
let tree = view.render();
let html = renderToStaticMarkup(tree);
assert.ok(html.includes("أنت الآن في الفترة التجريبية") && html.includes("Trial"));
assert.equal(nodes(tree).filter(node => node.type === "article").length, 2, "trial displayed as current but not offered for purchase");
assert.ok(html.includes("المنيو والمنتجات") && html.includes("الولاء والمكافآت"));
assert.ok(html.includes("العنوان الحصري") && html.includes("0508424401"));
assert.ok(!html.includes("paypal") && !html.includes("Paymob"));
assert.ok(html.includes("24 ساعة"));
const choices = nodes(tree).filter(node => node.type === "button" && text(node) === "اختيار الباقة");
choices[1].props.onClick();
tree = view.render();
assert.ok(renderToStaticMarkup(tree).includes("72 ساعة"));
const duration = nodes(tree).find(node => node.type === "select" && node.props.value === 1);
duration.props.onChange({ target: { value: "12" } });
tree = view.render();
await button(tree, "متابعة وإرسال إيصال التحويل").props.onClick();
assert.deepEqual(view.calls[0], ["create", "loyalty", 12, undefined]);
tree = view.render();
assert.ok(renderToStaticMarkup(tree).includes("بانتظار الإيصال"));
const whatsappLink = nodes(tree).find(node => node.type === "a" && text(node).includes("فتح واتساب"));
assert.equal(whatsappLink.props.target, "_blank");
assert.ok(decodeURIComponent(whatsappLink.props.href).includes("Test Customer"));
assert.ok(decodeURIComponent(whatsappLink.props.href).includes(request.id));
assert.equal(button(tree, "إشعار الإدارة للمراجعة").props.disabled, true);
assert.equal(view.calls.length, 1, "rendering or opening WhatsApp does not activate or submit review");
nodes(tree).find(node => node.type === "input" && node.props.type === "checkbox").props.onChange({ target: { checked: true } });
await button(view.render(), "إشعار الإدارة للمراجعة").props.onClick();
assert.deepEqual(view.calls[1], ["whatsapp", request.id]);
assert.ok(renderToStaticMarkup(view.render()).includes("طلبك لدى فريق المراجعة"));
await button(view.render(), "تحديث حالة الطلب").props.onClick();
assert.deepEqual(view.calls.slice(-2), [["clear-cache"], ["refresh"]], "approved review updates shell and page");

const upload = harness({ initialRequests: [request] });
tree = upload.render();
const file = new File(["%PDF-1.7 test"], "receipt.pdf", { type: "application/pdf" });
nodes(tree).find(node => node.type === "input" && node.props.type === "file").props.onChange({ target: { files: [file] } });
await button(upload.render(), "إرسال الإيصال للمراجعة").props.onClick();
assert.equal(upload.calls[0][0], "upload");
assert.equal(upload.calls[0][2].name, "receipt.pdf");
assert.ok(renderToStaticMarkup(upload.render()).includes("طلبك لدى فريق المراجعة"));

const failure = harness({}, { createBankSubscriptionRequestAction: async () => { throw new Error("Request unavailable"); } });
await button(failure.render(), "متابعة وإرسال إيصال التحويل").props.onClick();
assert.ok(renderToStaticMarkup(failure.render()).includes('role="alert"'));
assert.ok(renderToStaticMarkup(failure.render()).includes("تعذر الاتصال لإكمال الطلب"));
assert.ok(!renderToStaticMarkup(failure.render()).includes("Request unavailable"));
const rejected = harness({}, { createBankSubscriptionRequestAction: async () => ({ ok: false, message: "لديك طلب مفتوح" }) });
await button(rejected.render(), "متابعة وإرسال إيصال التحويل").props.onClick();
assert.ok(renderToStaticMarkup(rejected.render()).includes("لديك طلب مفتوح"));
assert.ok(renderToStaticMarkup(harness({ initialActivePlanId: "", currentSubscription: null }).render()).includes("انتهى اشتراككم مع برندة"));
const bank = harness({ bankDetails: { beneficiary: "Configured recipient", bankName: "Configured bank", iban: "TEST-ONLY", accountNumber: "ACCOUNT-TEST" } });
html = renderToStaticMarkup(bank.render());
assert.ok(html.includes("Configured recipient") && html.includes("TEST-ONLY") && html.includes("ACCOUNT-TEST"));
const durations = load(path.resolve("lib/platform/subscription-durations.ts"));
assert.deepEqual(durations.getPlanDurationOptions({durationOptions:[1]}).map(item=>item.months), [1,3,6,12]);
for (const months of [1,3,6]) assert.equal(durations.calculateSubscriptionAmount({priceMonthly:115,annualDiscountPercent:20},months),115*months);
assert.equal(durations.calculateSubscriptionAmount({priceMonthly:115,annualDiscountPercent:20},12),1104);
assert.equal(durations.formatSubscriptionDuration(24),"سنتين");
assert.throws(()=>durations.calculateSubscriptionAmount({priceMonthly:115},2));
let resolvePreview;
const couponView = harness({}, { previewBankSubscriptionAction: async () => ({ok:true,data:{baseAmount:115,annualDiscountAmount:0,couponDiscountAmount:23,totalAmount:92,couponCode:"MONTH20"}}) });
tree=couponView.render();
nodes(tree).find(node=>node.props?.id==='subscription-coupon').props.onChange({target:{value:'MONTH20'}});
assert.equal(button(couponView.render(),"متابعة وإرسال إيصال التحويل").props.disabled,true);
await button(couponView.render(),"تطبيق الكوبون").props.onClick();
assert.equal(button(couponView.render(),"متابعة وإرسال إيصال التحويل").props.disabled,false);
await button(couponView.render(),"متابعة وإرسال إيصال التحويل").props.onClick();
assert.equal(couponView.calls[0][3],"MONTH20");
const stale = harness({}, {previewBankSubscriptionAction: () => new Promise(resolve=>{resolvePreview=resolve;})});
nodes(stale.render()).find(node=>node.props?.id==='subscription-coupon').props.onChange({target:{value:'YEAR20'}});
const pending=button(stale.render(),"تطبيق الكوبون").props.onClick();
nodes(stale.render()).find(node=>node.type==='select' && node.props.value===1).props.onChange({target:{value:'12'}});
resolvePreview({ok:true,data:{baseAmount:115,annualDiscountAmount:0,couponDiscountAmount:23,totalAmount:92,couponCode:"YEAR20"}});
await pending;
assert.equal(button(stale.render(),"متابعة وإرسال إيصال التحويل").props.disabled,true,'stale coupon response cannot price a changed duration');
const css = await fs.promises.readFile("components/dashboard/pages/subscription-page.module.css", "utf8");
const source = await fs.promises.readFile("components/dashboard/pages/subscription-page.tsx", "utf8");
for (const [, className] of source.matchAll(/styles\.([a-zA-Z]+)/g)) assert.ok(css.includes(`.${className}`), `defined ${className}`);
assert.ok(css.includes(":focus-visible") && css.includes("prefers-reduced-motion") && css.includes("max-width: 560px"));
console.log("PASS subscription UI: actual SSR/handlers, current trial/remaining, paid choices, shared services, durations, bank details fallback, receipt upload, WhatsApp explicit review and approved refresh.");
