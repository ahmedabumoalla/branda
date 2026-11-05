import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const requireDependency = createRequire(import.meta.url);
const componentFile = path.resolve("components/cashier/analytics-coupon-redemption.tsx");
const actionModule = "@/app/actions/analytics-coupons";
const languageModule = "@/components/cashier/cashier-language";
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (value, expected, message) => { assert.deepEqual(value, expected, message); checks++; };
function load(file, mocks = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const target = { exports: {} }; cache.set(file, target.exports);
  new Function("require", "module", "exports", output)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (name.startsWith("@/")) return load(path.resolve(`${name.slice(2)}.ts`), mocks, cache);
    return requireDependency(name);
  }, target, target.exports);
  return target.exports;
}
const couponCode = `BC-${"A".repeat(32)}`;
const customerPhone = "966500000000";
const preview = (input, patch = {}) => ({
  couponId: "00000000-0000-4000-8000-000000000001", title: "عرض اصطناعي", customerName: "عميل الاختبار",
  discountType: "percentage", discountValue: 12.34, minimumOrderAmount: 50, subtotal: input.subtotal,
  discountAmount: 12.34, totalAfterDiscount: input.subtotal - 12.34, expiresAt: "2026-11-12T13:00:00Z",
  terms: "مرة واحدة على مشتريات العميل", status: "available", redeemedAt: null, ...patch,
});
const actions = {
  loadAnalyticsCouponAction: async input => ({ ok: true, data: preview(input) }),
  redeemAnalyticsCouponAction: async input => ({ ok: true, data: preview(input, { status: "redeemed", redeemedAt: "2026-11-05T11:30:00Z" }) }),
};
const flatten = tree => !tree || typeof tree !== "object" ? [] : Array.isArray(tree) ? tree.flatMap(flatten) : [tree, ...flatten(tree.props?.children)];
const text = tree => tree == null || typeof tree === "boolean" ? "" : Array.isArray(tree) ? tree.map(text).join("") : typeof tree === "object" ? text(tree.props?.children) : String(tree);
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function harness(overrides = {}, locale = "ar") {
  let cursor = 0; const slots = [], effects = [], calls = { lookup: [], redeem: [] }, dom = { focus: 0 };
  const hooks = { ...React,
    startTransition(work) { void work(); },
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useEffect(effect, deps) { const index = cursor++, previous = slots[index]; if (!previous || deps.some((value, n) => value !== previous[n])) { slots[index] = deps; effects.push(effect); } },
  };
  const mocked = {
    loadAnalyticsCouponAction: async input => { calls.lookup.push(structuredClone(input)); return overrides.lookup ? overrides.lookup(input) : actions.loadAnalyticsCouponAction(input); },
    redeemAnalyticsCouponAction: async input => { calls.redeem.push(structuredClone(input)); return overrides.redeem ? overrides.redeem(input) : actions.redeemAnalyticsCouponAction(input); },
  };
  const Component = load(componentFile, { react: hooks, [actionModule]: mocked, [languageModule]: { useCashierLanguage: () => ({ locale }) } }).AnalyticsCouponRedemption;
  function render() {
    cursor = 0; const tree = Component();
    for (const node of flatten(tree)) if (node.props?.ref && typeof node.props.ref === "object") node.props.ref.current = { focus() { dom.focus++; } };
    while (effects.length) effects.shift()();
    return tree;
  }
  const find = predicate => { const node = flatten(render()).find(predicate); assert.ok(node, "Expected UI element exists"); return node; };
  const field = name => find(node => node.type === "input" && node.props.id === `analytics-coupon-${name}`);
  const edit = (name, value) => field(name).props.onChange({ target: { value } });
  const button = label => find(node => node.type === "button" && text(node) === label);
  const click = async label => { const node = button(label); assert(!node.props.disabled, `${label} must be enabled`); node.props.onClick(); await settle(); return render(); };
  const submit = async () => { find(node => node.type === "form").props.onSubmit({ preventDefault() {} }); await settle(); return render(); };
  const fill = () => { edit("code", couponCode); edit("phone", "0500000000"); edit("subtotal", "100"); };
  return { render, find, field, edit, button, click, submit, fill, calls, dom };
}

const ssrApi = load(componentFile, { [actionModule]: actions, [languageModule]: { useCashierLanguage: () => ({ locale: "ar" }) } });
const html = renderToStaticMarkup(React.createElement(ssrApi.AnalyticsCouponRedemption));
check(html.includes('aria-labelledby="analytics-coupon-heading"'), "Coupon panel has a semantic accessible heading");
for (const field of ["code", "phone", "subtotal"]) check(html.includes(`for="analytics-coupon-${field}"`) && html.includes(`id="analytics-coupon-${field}"`), `${field} has a connected visible label`);
check(!html.includes(customerPhone) && !html.includes(couponCode), "Initial SSR contains no customer or coupon information");
check(html.includes('inputMode="decimal"') && html.includes('type="tel"'), "Money and phone use appropriate keyboard hints");

const normal = harness();
normal.edit("code", couponCode.toLowerCase()); normal.edit("phone", "٠٥٠٠٠٠٠٠٠٠"); normal.edit("subtotal", "١٠٠٫٠٠");
await normal.submit();
equal(normal.calls.lookup[0], { code: couponCode, phone: customerPhone, subtotal: 100 }, "Arabic digits and lowercase code normalize to exact server inputs");
check(normal.calls.redeem.length === 0, "Preview never redeems a coupon");
check(text(normal.render()).includes("راجع الخصم قبل التأكيد") && text(normal.render()).includes("عميل الاختبار"), "Review shows explicit confirmation and server customer identity");
check(text(normal.render()).includes("١٢٫٣٤") && text(normal.render()).includes("٨٧٫٦٦"), "Discount and payable are displayed from server amounts");
check(text(normal.render()).includes("بتوقيت الرياض") && text(normal.render()).includes("مرة واحدة على مشتريات العميل"), "Expiry zone and immutable terms are displayed");
check(normal.dom.focus > 0, "Preview receives keyboard focus");
await normal.click("تأكيد الخصم وصرف الكوبون");
check(normal.calls.redeem.length === 1 && /^[0-9a-f-]{36}$/.test(normal.calls.redeem[0].idempotencyKey), "Explicit confirmation creates one idempotent request");
equal({ ...normal.calls.redeem[0], idempotencyKey: undefined }, { ...normal.calls.lookup[0], idempotencyKey: undefined }, "Redeem binds reviewed code phone and invoice amount");
check(text(normal.render()).includes("تم تسجيل صرف الكوبون") && !flatten(normal.render()).some(node => node.type === "button" && text(node) === "تأكيد الخصم وصرف الكوبون"), "Success receipt replaces redeem action");
check(text(normal.render()).includes("لا يمكن صرفه مرة أخرى"), "Success explains one-use state");
await normal.click("كوبون آخر");
equal([normal.field("code").props.value, normal.field("phone").props.value, normal.field("subtotal").props.value], ["", "", ""], "Explicit next-coupon action clears prior customer fields");

for (const [field, value] of [["code", "BC-123"], ["code", `BC-${"A".repeat(24)}`], ["phone", "051"], ["phone", "not-a-phone"], ["subtotal", ""], ["subtotal", "0"], ["subtotal", "-1"], ["subtotal", "1e2"], ["subtotal", "1.001"], ["subtotal", "1000000.01"]]) {
  const invalid = harness(); invalid.fill(); invalid.edit(field, value); await invalid.submit();
  check(invalid.calls.lookup.length === 0 && text(invalid.render()).includes(field === "code" ? "رمز الكوبون كاملًا" : field === "phone" ? "رقم جوال العميل المسجل" : "أدخل مبلغ الفاتورة"), `Invalid ${field} blocks lookup and gives corrective feedback`);
}
for (const [field, value] of [["code", `BC-${"B".repeat(32)}`], ["phone", "0511111111"], ["subtotal", "101"]]) {
  const dirty = harness(); dirty.fill(); await dirty.submit(); dirty.edit(field, value);
  check(!flatten(dirty.render()).some(node => node.type === "button" && text(node) === "تأكيد الخصم وصرف الكوبون"), `Editing ${field} invalidates preview`);
  check(dirty.calls.redeem.length === 0, `Editing ${field} does not redeem`);
}
for (const failure of ["not_available", "unauthorized", "already_redeemed"]) {
  const denied = harness({ lookup: async () => ({ ok: false, code: failure, message: "لا يمكن استخدام الكوبون" }) }); denied.fill(); await denied.submit();
  check(denied.calls.redeem.length === 0 && !text(denied.render()).includes("راجع الخصم قبل التأكيد"), `${failure} does not expose a redeem action`);
}

let resolveLookup;
const reading = harness({ lookup: input => new Promise(resolve => { resolveLookup = () => resolve({ ok: true, data: preview(input) }); }) });
reading.fill(); await reading.submit(); await reading.submit(); reading.edit("phone", "0511111111");
check(reading.calls.lookup.length === 1 && reading.find(node => node.type === "fieldset").props.disabled, "In-flight preview blocks parallel requests and disables fields");
equal(reading.field("phone").props.value, "0500000000", "In-flight input event cannot change reviewed customer");
resolveLookup(); await settle();

let resolveRedeem;
const confirming = harness({ redeem: input => new Promise(resolve => { resolveRedeem = () => resolve({ ok: true, data: preview(input, { status: "redeemed", redeemedAt: "2026-11-05T11:30:00Z" }) }); }) });
confirming.fill(); await confirming.submit();
const confirmButton = confirming.button("تأكيد الخصم وصرف الكوبون"); confirmButton.props.onClick(); confirmButton.props.onClick(); await settle();
check(confirming.calls.redeem.length === 1, "Rapid repeated confirmation makes one request even before rerender");
check(confirming.find(node => node.type === "fieldset").props.disabled, "Redemption locks all invoice inputs");
resolveRedeem(); await settle();

for (const throws of [false, true]) {
  let count = 0;
  const retry = harness({ redeem: async input => {
    if (!count++) { if (throws) throw new Error("Network timeout"); return { ok: false, code: "uncertain", message: "Unknown result" }; }
    return actions.redeemAnalyticsCouponAction(input);
  } });
  retry.fill(); await retry.submit(); await retry.click("تأكيد الخصم وصرف الكوبون");
  check(text(retry.render()).includes("لم يصل تأكيد الصرف") && retry.button("كوبون آخر").props.disabled, "Unknown result presents safe retry and locks reset");
  retry.edit("subtotal", "999"); await retry.submit();
  equal(retry.field("subtotal").props.value, "100", "Unknown result freezes exact invoice amount");
  check(retry.calls.lookup.length === 1, "Unknown result prevents new preview");
  await retry.click("التحقق من نتيجة الصرف");
  equal(retry.calls.redeem[1], retry.calls.redeem[0], "Unknown retry retains exact payload and idempotency key");
  check(text(retry.render()).includes("تم تسجيل صرف الكوبون"), "Replayed redemption produces confirmed receipt");
}
const rejected = harness({ redeem: async () => ({ ok: false, code: "already_redeemed", message: "هذا الكوبون مصروف مسبقًا" }) });
rejected.fill(); await rejected.submit(); await rejected.click("تأكيد الخصم وصرف الكوبون");
check(text(rejected.render()).includes("هذا الكوبون مصروف مسبقًا") && !rejected.find(node => node.type === "fieldset").props.disabled, "Definite already-used response permits correction without a success claim");
check(!text(rejected.render()).includes("تم تسجيل صرف الكوبون"), "Rejected redemption never renders successful receipt");

for (const errorCode of ["unauthorized", "unavailable", "not_available"]) {
  let attempt = 0;
  const recovering = harness({ redeem: async input => {
    attempt++;
    if (attempt === 1) return { ok: false, code: "uncertain", message: "لم يصل التأكيد" };
    if (attempt === 2) return { ok: false, code: errorCode, message: "تعذر التحقق أعد المحاولة" };
    return actions.redeemAnalyticsCouponAction(input);
  } });
  recovering.fill(); await recovering.submit(); await recovering.click("تأكيد الخصم وصرف الكوبون");
  await recovering.click("التحقق من نتيجة الصرف");
  check(recovering.button("كوبون آخر").props.disabled && recovering.find(node => node.type === "fieldset").props.disabled, `${errorCode} during uncertain reconciliation keeps original attempt frozen`);
  await recovering.click("التحقق من نتيجة الصرف");
  equal(recovering.calls.redeem[2], recovering.calls.redeem[0], `${errorCode} recovery retains the original idempotency key and payload`);
  check(text(recovering.render()).includes("تم تسجيل صرف الكوبون"), `${errorCode} recovery can reconcile successful redemption`);
}

const english = harness({ lookup: async input => ({ ok: true, data: preview(input, { discountType: "fixed", discountValue: 100, discountAmount: 100, totalAfterDiscount: 0 }) }) }, "en");
english.fill(); await english.submit();
check(text(english.render()).includes("Review the discount before confirming") && text(english.render()).includes("0.00"), "English layout and fully discounted zero-payable invoice render correctly");
check(text(english.render()).includes("does not collect the invoice payment"), "UI distinguishes redemption from payment collection");

const css = fs.readFileSync("components/cashier/analytics-coupon-redemption.module.css", "utf8");
check(css.includes("@container (max-width: 35rem)") && css.includes("grid-template-columns: minmax(0, 1fr)"), "Coupon fields and totals stack for narrow cashier panels");
check(css.includes("min-height: 46px") && css.includes(":focus-visible"), "Controls retain touch targets and visible keyboard focus");
const parent = fs.readFileSync("components/rast-loyalty/rast-cashier.tsx", "utf8");
check(parent.includes('import { AnalyticsCouponRedemption }') && parent.includes("<AnalyticsCouponRedemption />"), "Active cashier page mounts coupon redemption");
check(fs.readFileSync("app/cashier/page.tsx", "utf8").includes("<RastCashier"), "Integration targets actual cashier route");

const files = ["components/cashier/analytics-coupon-redemption.tsx", "components/cashier/analytics-coupon-redemption.module.css", "components/rast-loyalty/rast-cashier.tsx", "app/cashier/page.tsx", "lib/analytics/analytics-coupons.ts", "scripts/check-analytics-coupon-redemption-ui.mjs"];
fs.mkdirSync("output/analytics-coupons", { recursive: true });
fs.writeFileSync("output/analytics-coupons/cashier-ui-checks.json", JSON.stringify({ checkedAt: new Date().toISOString(), checks, runtime: process.version, command: "node scripts/check-analytics-coupon-redemption-ui.mjs", browserUsed: false, liveWrites: false, inputSha256: Object.fromEntries(files.map(file => [file, createHash("sha256").update(fs.readFileSync(file)).digest("hex")])) }, null, 2));
console.log(`Analytics coupon cashier UI: ${checks} checks passed with mocked actions and SSR`);
