import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const dependency = createRequire(import.meta.url);
const events=[];
globalThis.window={dispatchEvent:event=>{events.push(event.type);return true;}};
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
const durations = load(path.resolve("lib/platform/subscription-durations.ts"));
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
  const values = []; let index = 0; const calls = []; const previews = []; const effects = new Map(); let queuedEffects = [];
  const hooks = { ...React, useState(initial) { const slot = index++; if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial; return [values[slot], next => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }]; }, useRef(initial) { const slot = index++; if (!(slot in values)) values[slot] = { current: initial }; return values[slot]; },
    useEffect(effect, deps) {
      const slot = index++; const previous = effects.get(slot);
      if (previous && deps?.length === previous.deps?.length && deps.every((item, position) => Object.is(item, previous.deps[position]))) return;
      queuedEffects.push(() => { previous?.cleanup?.(); effects.set(slot, { deps, cleanup: effect() }); });
    },
  };
  const { SubscriptionPageClient } = load(path.resolve("components/dashboard/pages/subscription-page.tsx"), {
    react: hooks, "next/navigation": { useRouter: () => ({ refresh: () => calls.push(["refresh"]) }) },
    "@/lib/performance/dashboard-shell-client": { clearDashboardShellSnapshot: () => calls.push(["clear-cache"]) },
    "@/app/actions/subscription": {
      previewBankSubscriptionAction: async (id, months, coupon) => {
        previews.push([id, months, coupon]);
        const pricing = durations.calculateSubscriptionPricing((props.initialPlans ?? plans).find(plan => plan.id === id), months);
        return { ok: true, data: { baseAmount: pricing.baseAmount, annualDiscountAmount: pricing.discountAmount, couponDiscountAmount: 0, totalAmount: pricing.totalAmount, couponCode: null, upgradeCreditAmount: 0, upgradeCredits: [], extendedDays: 0 } };
      },
      createBankSubscriptionRequestAction: async (...args) => { calls.push(["create", ...args]); return { ok: true, data: [request] }; },
      uploadSubscriptionReceiptAction: async (id, form) => { calls.push(["upload", id, form.get("receipt")]); return { ok: true, data: [{ ...request, status: "pending_review" }] }; },
      submitSubscriptionWhatsappAction: async id => { calls.push(["whatsapp", id]); return { ok: true, data: [{ ...request, status: "pending_review", receiptChannel: "whatsapp" }] }; },
      refreshSubscriptionRequestsAction: async () => ({ ok: true, data: [{ ...request, status: "approved" }] }), ...actions,
    },
  });
  const view = { calls, previews, values,
    render() { index = 0; const tree = SubscriptionPageClient({ ...base, ...props }); const pendingEffects = queuedEffects; queuedEffects = []; pendingEffects.forEach(effect => effect()); return tree; },
    async flush() { let tree; for (let pass = 0; pass < 4; pass++) { await Promise.resolve(); tree = view.render(); } return tree; },
    unmount() { for (const effect of effects.values()) effect.cleanup?.(); effects.clear(); },
  };
  return view;
}
function nodes(tree) { if (!tree || typeof tree !== "object") return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
function text(tree) { if (tree == null || typeof tree === "boolean") return ""; if (Array.isArray(tree)) return tree.map(text).join(""); return typeof tree === "object" ? text(tree.props?.children) : String(tree); }
function button(tree, label) { return nodes(tree).find(node => node.type === "button" && text(node) === label); }

const view = harness();
const financePlan = { ...plans[1], id: "finance", name: "برندة المالية", features: ["finance"], priceMonthly: 1099, durationOptions: [1, 3] };
const financeView = harness({ initialPlans: [financePlan] });
let financeTree = financeView.render();
assert.ok(!text(financeTree).includes("الاشتراك السنوي") && text(financeTree).includes("ثلاثة أشهر بخصم ٢٠٪"));
button(financeTree, "اختيار اشتراك ثلاثة أشهر").props.onClick();
financeTree = await financeView.flush();
const financeDuration = nodes(financeTree).find(node => node.type === "select" && node.props.value === 3);
assert.deepEqual(nodes(financeDuration).filter(node => node.type === "option").map(node => node.props.value), [1, 3]);
await button(financeTree, "متابعة وإرسال إيصال التحويل").props.onClick();
assert.deepEqual(financeView.calls[0], ["create", "finance", 3, undefined, 2637.6, 0, 0]);
financeView.unmount();
const wildcardFinance = harness({ initialPlans: plans.map(plan => ({ ...plan, features: ["all"] })) });
const wildcardFinanceRows = nodes(wildcardFinance.render()).filter(node => node.type === "li" && text(node).includes("برندة المالية"));
assert.ok(wildcardFinanceRows.length > 0 && wildcardFinanceRows.every(row => row.props.className === "excluded"), "legacy all-package comparison never advertises paid finance as included");
wildcardFinance.unmount();
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
tree = await view.flush();
await button(tree, "متابعة وإرسال إيصال التحويل").props.onClick();
assert.deepEqual(view.calls[0], ["create", "loyalty", 12, undefined, 2760, 0, 0]);
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
assert.ok(events.includes("barndaksa:subscription-updated"),"approved renewal immediately reloads sidebar and expiry guard");

const upload = harness({ initialRequests: [request] });
tree = upload.render();
const file = new File(["%PDF-1.7 test"], "receipt.pdf", { type: "application/pdf" });
nodes(tree).find(node => node.type === "input" && node.props.type === "file").props.onChange({ target: { files: [file] } });
await button(upload.render(), "إرسال الإيصال للمراجعة").props.onClick();
assert.equal(upload.calls[0][0], "upload");
assert.equal(upload.calls[0][2].name, "receipt.pdf");
assert.ok(renderToStaticMarkup(upload.render()).includes("طلبك لدى فريق المراجعة"));

const failure = harness({}, { createBankSubscriptionRequestAction: async () => { throw new Error("Request unavailable"); } });
await button(await failure.flush(), "متابعة وإرسال إيصال التحويل").props.onClick();
assert.ok(renderToStaticMarkup(failure.render()).includes('role="alert"'));
assert.ok(renderToStaticMarkup(failure.render()).includes("تعذر الاتصال لإكمال الطلب"));
assert.ok(!renderToStaticMarkup(failure.render()).includes("Request unavailable"));
const rejected = harness({}, { createBankSubscriptionRequestAction: async () => ({ ok: false, message: "لديك طلب مفتوح" }) });
await button(await rejected.flush(), "متابعة وإرسال إيصال التحويل").props.onClick();
assert.ok(renderToStaticMarkup(rejected.render()).includes("لديك طلب مفتوح"));
assert.ok(renderToStaticMarkup(harness({ initialActivePlanId: "", currentSubscription: null }).render()).includes("انتهى اشتراككم مع برندة"));
const bank = harness({ bankDetails: { beneficiary: "Configured recipient", bankName: "Configured bank", iban: "TEST-ONLY", accountNumber: "ACCOUNT-TEST" } });
html = renderToStaticMarkup(bank.render());
assert.ok(html.includes("Configured recipient") && html.includes("TEST-ONLY") && html.includes("ACCOUNT-TEST"));
const annualOfferPlans = plans.map(plan => plan.id === "loyalty" ? { ...plan, priceMonthly: 295, annualDiscountPercent: 20 } : plan);
const annualView = harness({ initialPlans: annualOfferPlans });
tree = annualView.render();
const offer = nodes(tree).find(node => node.props?.role === "group" && node.props["aria-label"]?.startsWith("عرض الاشتراك السنوي"));
assert.ok(offer, "discounted plan advertises annual offer");
const arabicMoney = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 });
assert.ok(text(offer).includes(arabicMoney.format(2832)), "annual total is twelve months after the configured discount");
assert.ok(text(offer).includes(arabicMoney.format(708)), "savings shown in riyals");
assert.equal(text(nodes(offer).find(node => node.type === "del")), `${arabicMoney.format(3540)} ر.س`);
assert.ok(!renderToStaticMarkup(harness().render()).includes("عرض الاشتراك السنوي"), "no annual offer when discount is absent");
button(tree, "اختيار الاشتراك السنوي").props.onClick();
tree = annualView.render();
assert.ok(nodes(tree).some(node => node.type === "select" && node.props.value === 12), "annual CTA selects annual checkout");
assert.equal(annualView.calls.length, 0, "selecting annual does not create a payment request");
await button(await annualView.flush(), "متابعة وإرسال إيصال التحويل").props.onClick();
assert.deepEqual(annualView.calls[0], ["create", "loyalty", 12, undefined, 2832, 0, 0]);
const monthlyView = harness({ initialPlans: annualOfferPlans });
button(monthlyView.render(), "اختيار الاشتراك السنوي").props.onClick();
button(monthlyView.render(), "اختيار الاشتراك الشهري").props.onClick();
assert.ok(nodes(monthlyView.render()).some(node => node.type === "select" && node.props.value === 1), "monthly option stays available");
assert.equal(button(harness({ initialPlans: annualOfferPlans, configError: "غير متاح" }).render(), "اختيار الاشتراك السنوي").props.disabled, true);
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

const plusPlan = { id: "plus", name: "برندة بلس", priceMonthly: 480, active: true, features: ["menu", "loyalty", "marketing_campaigns"], durationOptions: [1, 12], isUpgradeBundle: true };
const upgradePlans = [...plans, plusPlan];
const upgradeCredit = { subscriptionId: "paid-menu", planId: "paid", planName: "باقة المنيو", paidAmount: 125, totalDays: 30, remainingDays: 20, creditAmount: 83.33 };
const upgradeQuote = { baseAmount: 480, annualDiscountAmount: 0, couponDiscountAmount: 0, totalAmount: 396.67, couponCode: null, upgradeCreditAmount: 83.33, upgradeCredits: [upgradeCredit], extendedDays: 0 };
const currentSubscriptions = [
  { id: "menu-current", planId: "paid", planName: "باقة المنيو الحالية", status: "active", startedAt: "2026-10-01T00:00:00Z", expiresAt: "2026-11-01T00:00:00Z" },
  { id: "loyalty-current", planId: "loyalty", planName: "باقة الولاء الحالية", status: "active", startedAt: "2026-10-02T00:00:00Z", expiresAt: "2026-11-02T00:00:00Z" },
];
const multiple = harness({ initialPlans: upgradePlans, currentSubscription: currentSubscriptions[1], currentSubscriptions, initialActivePlanId: "loyalty" });
tree = multiple.render(); html = renderToStaticMarkup(tree);
assert.ok(html.includes("٢ باقات تعمل معًا"));
const activeList = nodes(tree).find(node => node.props?.["aria-label"] === "الباقات المفعلة");
assert.equal(nodes(activeList).filter(node => node.type === "article").length, 2);
assert.ok(text(activeList).includes("باقة المنيو الحالية") && text(activeList).includes("باقة الولاء الحالية"));
assert.equal(nodes(tree).filter(node => node.type === "button" && text(node) === "تجديد الباقة").length, 2);
assert.ok(!renderToStaticMarkup(harness({ currentSubscriptions: [{ ...currentSubscriptions[0], expiresAt: "2026-10-01T00:00:00Z" }, { ...currentSubscriptions[1], startedAt: "2026-11-01T00:00:00Z" }] }).render()).includes("باقة مفعلة"));

const upgrade = harness({ initialPlans: upgradePlans, initialActivePlanId: "plus", currentSubscriptions }, { previewBankSubscriptionAction: async () => ({ ok: true, data: upgradeQuote }) });
tree = upgrade.render();
assert.equal(button(tree, "متابعة وإرسال إيصال التحويل").props.disabled, true, "checkout waits for server-authoritative automatic quote");
assert.ok(renderToStaticMarkup(tree).includes("جارٍ احتساب السعر ورصيد اشتراكاتك"));
tree = await upgrade.flush(); html = renderToStaticMarkup(tree);
assert.ok(html.includes("١٢٥ ر.س ÷ ٣٠ يوم × ٢٠ يوم") && html.includes("٨٣٫٣٣") && html.includes("٣٩٦٫٦٧"), "unused 20 of 30 menu days show 83.33 credit and 396.67 remaining");
assert.ok(html.includes("تبقى باقاتك متاحة حتى اعتماد الترقية"));
await button(tree, "متابعة وإرسال إيصال التحويل").props.onClick();
assert.deepEqual(upgrade.calls[0], ["create", "plus", 1, undefined, 396.67, 83.33, 0]);

const quoteResolvers = [];
const racing = harness({}, { previewBankSubscriptionAction: (id, months) => new Promise(resolve => quoteResolvers.push({ id, months, resolve })) });
tree = racing.render();
nodes(tree).find(node => node.type === "select" && node.props.value === "paid").props.onChange({ target: { value: "loyalty" } });
tree = racing.render();
nodes(tree).find(node => node.type === "select" && node.props.value === 1).props.onChange({ target: { value: "12" } });
tree = racing.render();
assert.deepEqual(quoteResolvers.map(item => [item.id, item.months]), [["paid", 1], ["loyalty", 1], ["loyalty", 12]]);
assert.equal(button(tree, "متابعة وإرسال إيصال التحويل").props.disabled, true);
quoteResolvers[2].resolve({ ok: true, data: { ...upgradeQuote, baseAmount: 2760, totalAmount: 2760, upgradeCreditAmount: 0, upgradeCredits: [] } });
await racing.flush();
quoteResolvers[0].resolve({ ok: true, data: { ...upgradeQuote, totalAmount: 999 } });
quoteResolvers[1].resolve({ ok: false, message: "رد قديم يجب تجاهله" });
tree = await racing.flush(); html = renderToStaticMarkup(tree);
assert.ok(!html.includes("رد قديم يجب تجاهله") && !html.includes("٩٩٩"));
await button(tree, "متابعة وإرسال إيصال التحويل").props.onClick();
assert.deepEqual(racing.calls[0], ["create", "loyalty", 12, undefined, 2760, 0, 0], "stale plan and duration responses cannot replace newest authoritative quote");

let quoteAttempts = 0;
const retryQuote = harness({ initialPlans: upgradePlans, initialActivePlanId: "plus" }, {
  previewBankSubscriptionAction: async () => ++quoteAttempts === 1 ? { ok: false, message: "تعذر احتساب السعر" } : { ok: true, data: upgradeQuote },
});
tree = await retryQuote.flush();
assert.equal(button(tree, "متابعة وإرسال إيصال التحويل").props.disabled, true);
assert.ok(renderToStaticMarkup(tree).includes('role="alert"'));
assert.equal(retryQuote.calls.length, 0, "failed preview never creates a request");
button(tree, "إعادة احتساب السعر").props.onClick();
tree = retryQuote.render();
assert.equal(button(tree, "متابعة وإرسال إيصال التحويل").props.disabled, true);
tree = await retryQuote.flush();
assert.equal(button(tree, "متابعة وإرسال إيصال التحويل").props.disabled, false);
assert.equal(quoteAttempts, 2, "retry issues a fresh quote only once");

const couponAndCredit = harness({ initialPlans: upgradePlans, initialActivePlanId: "plus", currentSubscriptions }, {
  previewBankSubscriptionAction: async (_id, _months, coupon) => ({ ok: true, data: coupon ? { ...upgradeQuote, couponCode: "PLUS10", couponDiscountAmount: 48, totalAmount: 348.67 } : upgradeQuote }),
});
tree = await couponAndCredit.flush();
nodes(tree).find(node => node.props?.id === "subscription-coupon").props.onChange({ target: { value: "PLUS10" } });
tree = couponAndCredit.render();
assert.equal(button(tree, "متابعة وإرسال إيصال التحويل").props.disabled, true);
await button(tree, "تطبيق الكوبون").props.onClick();
tree = couponAndCredit.render(); html = renderToStaticMarkup(tree);
assert.ok(html.includes("خصم الكوبون") && html.includes("خصم رصيد الباقات الحالية") && html.includes("٣٤٨٫٦٧"));
await button(tree, "متابعة وإرسال إيصال التحويل").props.onClick();
assert.deepEqual(couponAndCredit.calls[0], ["create", "plus", 1, "PLUS10", 348.67, 83.33, 0]);

const zeroQuote = { ...upgradeQuote, totalAmount: 0, upgradeCreditAmount: 480, upgradeExtraCreditAmount: 20, extendedDays: 1.25, extendedSeconds: 108000, upgradeCredits: [{ ...upgradeCredit, paidAmount: 750, creditAmount: 500 }] };
const zeroRequest = { ...request, planId: "plus", planName: plusPlan.name, amount: 0, status: "pending_review", upgradeCreditAmount: 480, upgradeCredits: zeroQuote.upgradeCredits, extendedDays: 1.25 };
const creditOnly = harness({ initialPlans: upgradePlans, initialActivePlanId: "plus" }, {
  previewBankSubscriptionAction: async () => ({ ok: true, data: zeroQuote }),
  createBankSubscriptionRequestAction: async (...args) => { creditOnly.calls.push(["create", ...args]); return { ok: true, data: [zeroRequest] }; },
});
tree = await creditOnly.flush(); html = renderToStaticMarkup(tree);
assert.ok(html.includes("رصيدك يغطي السعر ويضيف ١٫٢٥ يوم"));
assert.equal(button(tree, "تأكيد الترقية من رصيد باقاتي").props.disabled, false);
await button(tree, "تأكيد الترقية من رصيد باقاتي").props.onClick();
assert.deepEqual(creditOnly.calls[0], ["create", "plus", 1, undefined, 0, 500, 108000], "request freezes all upgrade credit including excess and exact extra duration");
tree = creditOnly.render(); html = renderToStaticMarkup(tree);
assert.ok(html.includes("طلبك لدى فريق المراجعة") && html.includes("دون مبلغ تحويل"));
assert.ok(!nodes(tree).some(node => node.type === "input" && node.props.type === "file"), "credit-only request skips receipt upload");
assert.ok(!button(tree, "إشعار الإدارة للمراجعة"), "credit-only request is already pending review");
assert.ok(html.includes("رصيدك يغطي السعر ويضيف ١٫٢٥ يوم"), "extra subscription days remain visible on saved request");

let resolveUnmounted;
const unmounted = harness({}, { previewBankSubscriptionAction: () => new Promise(resolve => { resolveUnmounted = resolve; }) });
unmounted.render(); unmounted.unmount();
const valuesBeforeUnmountedResponse = JSON.stringify(unmounted.values);
resolveUnmounted({ ok: true, data: upgradeQuote });
await Promise.resolve(); await Promise.resolve();
assert.equal(JSON.stringify(unmounted.values), valuesBeforeUnmountedResponse, "unmount cleanup cancels late quote state writes");
console.log("PASS multi-package UI: concurrent subscriptions, authoritative quote gating, unused-day credit, stale plan/duration/coupon cancellation, quote retry, coupon plus credit, zero-payment review and extra days.");
const css = await fs.promises.readFile("components/dashboard/pages/subscription-page.module.css", "utf8");
const source = await fs.promises.readFile("components/dashboard/pages/subscription-page.tsx", "utf8");
for (const [, className] of source.matchAll(/styles\.([a-zA-Z]+)/g)) assert.ok(css.includes(`.${className}`), `defined ${className}`);
assert.ok(css.includes(":focus-visible") && css.includes("prefers-reduced-motion") && css.includes("max-width: 560px"));
console.log("PASS subscription UI: actual SSR/handlers, current trial/remaining, paid choices, shared services, durations, bank details fallback, receipt upload, WhatsApp explicit review and approved refresh.");

const expiredPage=renderToStaticMarkup(harness({initialActivePlanId:'',referenceTime:Date.parse('2026-11-01T00:00:00Z')}).render());
assert.ok(expiredPage.includes('انتهت مدة باقتك')&&expiredPage.includes('https://wa.me/966508424401')&&expiredPage.includes('0508424401'));
