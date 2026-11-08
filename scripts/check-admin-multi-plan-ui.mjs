import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import ts from "typescript";
import { transform } from "lightningcss";

const require = createRequire(import.meta.url);
const compile = path => ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const load = (code, stubs) => { const exports = {}; new Function("require", "exports", code)(name => stubs[name] ?? require(name), exports); return exports; };
const deadlineHelpers = load(compile("lib/platform/subscription-deadline.ts"), {});
const detailCode = compile("components/admin/brand-details-dialog.tsx");
const deadlineCode = compile("components/admin/subscription-deadline-editor.tsx");
const css = { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
const nodes = tree => !tree || typeof tree !== "object" ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => tree == null || typeof tree === "boolean" ? "" : Array.isArray(tree) ? tree.map(text).join("") : typeof tree === "object" ? text(tree.props?.children) : String(tree);
const button = (tree, label) => nodes(tree).find(node => node.type === "button" && text(node) === label);
const input = tree => nodes(tree).find(node => node.type === "input" && node.props.type === "datetime-local");
const form = tree => nodes(tree).find(node => node.type === "form");
const fieldset = (tree, className) => nodes(tree).find(node => node.type === "fieldset" && node.props.className === className);
const planInputs = (tree, className) => nodes(fieldset(tree, className)).filter(node => node.type === "input");
const tick = (h, id, checked = true) => nodes(h.render()).find(node => node.type === "input" && node.props.value === id).props.onChange({ target: { checked } });
const changeDate = (h, value) => input(h.render()).props.onChange({ target: { value } });
const flush = () => new Promise(resolve => setImmediate(resolve));
const baseline = { id: "brand-id", name: "علامة الاختبار", planId: "a", planIds: ["a", "b"], planNames: ["الباقة الأساسية", "باقة سابقة"], subscriptionRevision: "revision-1", subscriptionExpiryMixed: false, subscriptionExpiryEditable: true, planExpiresAtExact: "2027-01-10T09:00:00.000Z", hasActivePlan: true, status: "نشط", totalRevenue: 0 };
const plans = [{ id: "a", name: "الباقة الأساسية", active: true }, { id: "b", name: "باقة سابقة", active: false }, { id: "c", name: "باقة الولاء", active: true }, { id: "d", name: "باقة الطلبات", active: true }, { id: "e", name: "باقة متوقفة", active: false }];

function harness(kind, extra = {}, handlers = {}) {
  const state = [], calls = [], removals = [], busy = [], updated = [];
  let cursor = 0, cafe = { ...baseline, ...extra };
  const hooks = { ...React, useEffect() {}, useId: () => "test-field", useState(initial) { const slot = cursor++; if (!(slot in state)) state[slot] = typeof initial === "function" ? initial() : initial; return [state[slot], next => { state[slot] = typeof next === "function" ? next(state[slot]) : next; }]; }, useRef(initial) { const slot = cursor++; if (!(slot in state)) state[slot] = { current: initial }; return state[slot]; } };
  const stub = () => null;
  const stubs = {
    react: hooks,
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "@/app/actions/maintenance": { enterMaintenanceModeAction: stub },
    "@/lib/performance/dashboard-shell-client": { clearDashboardShellSnapshot: stub },
    "@/lib/format": { formatSar: String },
    "@/lib/ui/page-scroll-lock": { lockPageScroll: () => stub },
    "@/lib/platform/subscription-deadline": deadlineHelpers,
    "./standalone-menu-control": { StandaloneMenuControl: stub },
    "./brand-operations-panel": { BrandOperationsPanel: stub },
    "./brand-analytics-panel": { BrandAnalyticsPanel: stub },
    "@/components/pager/pager-brand-panel": { PagerBrandPanel: stub },
    "./brand-deletion-control": { BrandDeletionControl: stub },
    "./brand-owner-welcome": { BrandOwnerWelcome: stub },
    "./subscription-deadline-editor": { SubscriptionDeadlineEditor: function DeadlineStub() {} },
    "./brand-details.module.css": css,
    "./subscription-deadline-editor.module.css": css,
    "@/app/actions/admin-subscription-deadline": {
      updateSubscriptionDeadlineAction: async value => { calls.push(value); return handlers.save ? handlers.save(value) : { ok: true, data: { ...cafe, planExpiresAtExact: deadlineHelpers.parseSaudiDeadline(value.localDeadline), subscriptionRevision: "revision-2", subscriptionExpiryMixed: false } }; },
      refreshSubscriptionDeadlineAction: async id => { calls.push({ refresh: id }); return handlers.refresh ? handlers.refresh() : { ok: true, data: cafe }; },
    },
  };
  const exports = load(kind === "detail" ? detailCode : deadlineCode, stubs);
  const props = { plans, services: null, activity: null, planPending: false, disabled: false, close: stub, toggleStatus: async () => {}, onDeleted: stub, onBusyChange: value => busy.push(value), onUpdated: value => { updated.push(value); cafe = value; }, updatePlan: async (...args) => { calls.push(args); return handlers.add?.(...args); }, removePlans: async (...args) => { removals.push(args); return handlers.remove?.(...args); } };
  return {
    calls, removals, busy, updated, props,
    patchCafe(next) { cafe = { ...cafe, ...next }; },
    render() { cursor = 0; return kind === "detail" ? exports.BrandDetailsDialog({ ...props, cafe }) : exports.SubscriptionDeadlineEditor({ ...props, cafe }); },
    open() { button(this.render(), "الباقات والاشتراكالباقات المفعّلة وموعد الانتهاء المشترك").props.onClick(); return this.render(); },
  };
}

let checks = 0;
async function check(run) { await run(); checks++; }

await check(() => {
  const h = harness("detail"), tree = h.open();
  const existing = planInputs(tree, "currentPlans");
  assert.deepEqual(existing.map(node => [node.props.value, node.props.checked]), [["a", true], ["b", true]]);
  assert.equal(fieldset(tree, "currentPlans").props.disabled, false);
  assert(existing.every(node => !node.props.readOnly && typeof node.props.onChange === "function"));
  assert(text(tree).includes("الباقات المرتبطة بالاشتراك"));
  assert(!text(tree).includes("الباقات المفعّلة لهذه العلامة"));
  assert(text(tree).includes("معطلة على المنصة ومضافة سابقًا لهذه العلامة"));
  assert.deepEqual(planInputs(tree, "planChoices").map(node => node.props.value), ["c", "d"]);
  assert(!text(tree).includes("ينهي الاشتراك الحالي"));
  assert.equal(button(tree, "تفعيل الباقات المحددة").props.disabled, true);
});
await check(async () => {
  const h = harness("detail"); h.open(); tick(h, "c"); tick(h, "d");
  await button(h.render(), "تفعيل الباقات المحددة").props.onClick();
  assert.deepEqual(h.calls, [["brand-id", ["c", "d"], "revision-1"]]);
  assert(text(h.render()).includes("تم تفعيل الباقات المحددة"));
  assert.equal(planInputs(h.render(), "planChoices").filter(node => node.props.checked).length, 0);
  assert(planInputs(h.render(), "currentPlans").every(node => node.props.checked));
});
await check(async () => {
  let release;
  const h = harness("detail", {}, { add: () => new Promise(resolve => { release = resolve; }) }); h.open(); tick(h, "c");
  const click = button(h.render(), "تفعيل الباقات المحددة").props.onClick;
  const pending = click(); await click();
  assert.equal(h.calls.length, 1);
  assert.equal(button(h.render(), "جار تفعيل الباقات").props.disabled, true);
  assert(nodes(h.render()).filter(node => typeof node.type === "function" && node.type.name === "BrandDialog").every(node => node.props.busy));
  assert.equal(nodes(h.render()).find(node => node.type?.name === "DeadlineStub").props.disabled, true);
  release(); await pending;
});
await check(async () => {
  const h = harness("detail", {}, { add: async () => { throw Error("offline"); } }); h.open(); tick(h, "d");
  await button(h.render(), "تفعيل الباقات المحددة").props.onClick();
  assert(nodes(h.render()).some(node => node.props?.role === "alert"));
  assert.equal(nodes(h.render()).find(node => node.props?.value === "d").props.checked, true);
  assert(!text(h.render()).includes("تم تفعيل الباقات المحددة"));
});
await check(async () => {
  for (const message of ["تغيّرت الباقات أو مواعيدها حدّث بيانات الاشتراك ثم حاول مجددًا", "أ".repeat(400), "provider error with private metadata"]) {
    const h = harness("detail", {}, { add: async () => { throw Error(message); } }); h.open(); tick(h, "c");
    await button(h.render(), "تفعيل الباقات المحددة").props.onClick();
    const alert = nodes(h.render()).find(node => node.props?.role === "alert");
    assert.equal(text(alert), message.startsWith("تغيّرت") ? message : "تعذر تأكيد تفعيل الباقات حدّث بيانات الاشتراك ثم أعد المحاولة");
    assert.equal(nodes(h.render()).find(node => node.props?.value === "c").props.checked, true);
  }
});
await check(async () => {
  const h = harness("detail"); h.open(); tick(h, "c"); h.patchCafe({ subscriptionRevision: "new-revision" });
  assert.equal(button(h.render(), "تفعيل الباقات المحددة").props.disabled, true);
  await button(h.render(), "تفعيل الباقات المحددة").props.onClick(); assert.equal(h.calls.length, 0);
  button(h.render(), "تحديث الاختيار").props.onClick(); tick(h, "d");
  await button(h.render(), "تفعيل الباقات المحددة").props.onClick();
  assert.deepEqual(h.calls[0], ["brand-id", ["d"], "new-revision"]);
});
await check(() => {
  const h = harness("detail"); h.open(); tick(h, "c"); h.props.plans = plans.map(plan => ({ ...plan, active: plan.id === "c" ? false : plan.active }));
  assert.equal(button(h.render(), "تفعيل الباقات المحددة").props.disabled, true);
  assert(button(h.render(), "تحديث الاختيار"));
});
await check(() => {
  const h = harness("detail", { subscriptionRevision: null }); const tree = h.open();
  assert(text(tree).includes("حدّث بيانات الاشتراك لإتاحة إضافة الباقات"));
  assert.equal(nodes(tree).find(node => node.type === "fieldset" && node.props.className === "planChoices").props.disabled, true);
});
await check(() => {
  const h = harness("detail", { planIds: [] }); h.props.plans = []; const tree = h.open();
  assert(text(tree).includes("بدون باقة"));
  assert(text(tree).includes("لا توجد باقات فعالة أخرى"));
  assert(!nodes(tree).some(node => node.type === "input" && node.props.checked));
});
await check(() => {
  const h = harness("detail"); h.open(); tick(h, "c");
  nodes(h.render()).find(node => node.type?.name === "DeadlineStub").props.onBusyChange(true);
  assert.equal(button(h.render(), "تفعيل الباقات المحددة").props.disabled, true);
});
await check(async () => {
  const h = harness("detail"); h.open(); tick(h, "b", false); tick(h, "b", false);
  assert.equal(planInputs(h.render(), "currentPlans").find(node => node.props.value === "b").props.checked, false);
  assert(text(h.render()).includes("سيتم إيقافها عند الحفظ"));
  assert.equal(h.removals.length, 0);
  await button(h.render(), "حفظ تغييرات الباقات").props.onClick();
  assert.deepEqual(h.removals, [["brand-id", ["b"], "revision-1"]]);
  assert.equal(h.calls.length, 0);
  assert(text(h.render()).includes("تم إيقاف الباقات المحددة"));
  assert(!button(h.render(), "حفظ تغييرات الباقات"));
});
await check(async () => {
  for (const ids of [["a"], ["a", "b"]]) {
    const h = harness("detail", { planIds: ids, planNames: ids.map(id => plans.find(plan => plan.id === id).name) }, { remove: async () => h.patchCafe({ planId: null, planIds: [], planNames: [], subscriptionRevision: "revision-2", hasActivePlan: false }) });
    h.open(); for (const id of ids) tick(h, id, false);
    assert(text(h.render()).includes("ستصبح العلامة بدون باقة بعد الحفظ"));
    assert.equal(button(h.render(), "حفظ تغييرات الباقات").props.disabled, false);
    await button(h.render(), "حفظ تغييرات الباقات").props.onClick();
    assert.deepEqual(h.removals, [["brand-id", ids, "revision-1"]]);
    assert(!fieldset(h.render(), "currentPlans"));
    assert(text(h.render()).includes("بدون باقة"));
    assert(text(h.render()).includes("تم إيقاف الباقات المحددة"));
    assert.deepEqual(planInputs(h.render(), "planChoices").map(node => node.props.value), ["a", "c", "d"]);
  }
});
await check(async () => {
  let release;
  const h = harness("detail", {}, { remove: () => new Promise(resolve => { release = resolve; }) });
  h.open(); tick(h, "c"); const staleAdd = button(h.render(), "تفعيل الباقات المحددة").props.onClick; tick(h, "c", false); tick(h, "a", false);
  const click = button(h.render(), "حفظ تغييرات الباقات").props.onClick;
  const pending = click(); await click(); await staleAdd();
  const tree = h.render();
  assert.equal(h.removals.length, 1); assert.equal(h.calls.length, 0);
  assert.equal(button(tree, "جار إيقاف الباقات").props.disabled, true);
  assert.equal(button(tree, "تفعيل الباقات المحددة").props.disabled, true);
  assert.equal(button(tree, "التراجع عن الإلغاء").props.disabled, true);
  assert.equal(fieldset(tree, "currentPlans").props.disabled, true);
  assert.equal(fieldset(tree, "planChoices").props.disabled, true);
  assert(nodes(tree).filter(node => node.type?.name === "BrandDialog").every(node => node.props.busy));
  assert.equal(nodes(tree).find(node => node.type?.name === "DeadlineStub").props.disabled, true);
  release(); await pending;
  assert.equal(fieldset(h.render(), "currentPlans").props.disabled, false);
});
await check(async () => {
  let release;
  const h = harness("detail", {}, { add: () => new Promise(resolve => { release = resolve; }) });
  h.open(); tick(h, "a", false); const staleRemove = button(h.render(), "حفظ تغييرات الباقات").props.onClick; tick(h, "a", true); tick(h, "c");
  const pending = button(h.render(), "تفعيل الباقات المحددة").props.onClick(); await staleRemove();
  assert.equal(h.calls.length, 1); assert.equal(h.removals.length, 0);
  assert.equal(fieldset(h.render(), "currentPlans").props.disabled, true);
  release(); await pending;
});
await check(async () => {
  let fail = true;
  const h = harness("detail", {}, { remove: async () => { if (fail) throw Error("offline"); } }); h.open(); tick(h, "a", false);
  await button(h.render(), "حفظ تغييرات الباقات").props.onClick();
  assert.equal(planInputs(h.render(), "currentPlans").find(node => node.props.value === "a").props.checked, false);
  assert(nodes(h.render()).some(node => node.props?.role === "alert"));
  assert(!text(h.render()).includes("تم إيقاف الباقات المحددة"));
  fail = false; await button(h.render(), "حفظ تغييرات الباقات").props.onClick();
  assert.deepEqual(h.removals, [["brand-id", ["a"], "revision-1"], ["brand-id", ["a"], "revision-1"]]);
  assert(text(h.render()).includes("تم إيقاف الباقات المحددة"));
  assert(!nodes(h.render()).some(node => node.props?.role === "alert"));
});
await check(async () => {
  for (const message of ["تغيّرت الباقات أو مواعيدها حدّث بيانات الاشتراك ثم حاول مجددًا", "أ".repeat(400), "provider error with private metadata"]) {
    const h = harness("detail", {}, { remove: async () => { throw Error(message); } }); h.open(); tick(h, "b", false);
    await button(h.render(), "حفظ تغييرات الباقات").props.onClick();
    assert.equal(text(nodes(h.render()).find(node => node.props?.role === "alert")), message.startsWith("تغيّرت") ? message : "تعذر تأكيد إيقاف الباقات حدّث بيانات الاشتراك ثم أعد المحاولة");
    assert.equal(planInputs(h.render(), "currentPlans").find(node => node.props.value === "b").props.checked, false);
  }
});
await check(async () => {
  for (const patch of [{ subscriptionRevision: "revision-3" }, { planIds: ["b"], planNames: ["باقة سابقة"] }]) {
    const h = harness("detail"); h.open(); tick(h, "a", false); h.patchCafe(patch);
    assert.equal(button(h.render(), "حفظ تغييرات الباقات").props.disabled, true);
    assert.equal(fieldset(h.render(), "currentPlans").props.disabled, true);
    await button(h.render(), "حفظ تغييرات الباقات").props.onClick(); assert.equal(h.removals.length, 0);
    button(h.render(), "تحديث اختيار الإلغاء").props.onClick(); tick(h, "b", false);
    await button(h.render(), "حفظ تغييرات الباقات").props.onClick();
    assert.deepEqual(h.removals[0], ["brand-id", ["b"], patch.subscriptionRevision ?? "revision-1"]);
  }
});
await check(() => {
  const h = harness("detail"); h.open(); tick(h, "a", false);
  assert.equal(fieldset(h.render(), "planChoices").props.disabled, true);
  assert.equal(button(h.render(), "تفعيل الباقات المحددة").props.disabled, true);
  button(h.render(), "التراجع عن الإلغاء").props.onClick();
  assert.equal(h.removals.length, 0); assert(!button(h.render(), "حفظ تغييرات الباقات"));
  assert(planInputs(h.render(), "currentPlans").every(node => node.props.checked));
  assert.equal(fieldset(h.render(), "planChoices").props.disabled, false);
  tick(h, "c"); assert.equal(fieldset(h.render(), "currentPlans").props.disabled, true);
  tick(h, "c", false); assert.equal(fieldset(h.render(), "currentPlans").props.disabled, false);
  tick(h, "b", false); tick(h, "b", true);
  assert(!button(h.render(), "حفظ تغييرات الباقات"));
  assert.equal(fieldset(h.render(), "planChoices").props.disabled, false);
});
await check(async () => {
  for (const reason of ["missing-revision", "external-plan-pending", "deadline-pending"]) {
    const h = harness("detail"); h.open(); tick(h, "a", false);
    if (reason === "missing-revision") h.patchCafe({ subscriptionRevision: null });
    if (reason === "external-plan-pending") h.props.planPending = true;
    if (reason === "deadline-pending") nodes(h.render()).find(node => node.type?.name === "DeadlineStub").props.onBusyChange(true);
    assert.equal(button(h.render(), "حفظ تغييرات الباقات").props.disabled, true);
    assert.equal(fieldset(h.render(), "currentPlans").props.disabled, true);
    await button(h.render(), "حفظ تغييرات الباقات").props.onClick(); assert.equal(h.removals.length, 0);
  }
});
await check(async () => {
  const h = harness("deadline");
  assert.equal(input(h.render()).props.value, "2027-01-10T12:00");
  changeDate(h, "2027-02-01T15:45");
  form(h.render()).props.onSubmit({ preventDefault() {} }); await flush();
  assert.deepEqual(h.calls, [{ cafeId: "brand-id", expectedRevision: "revision-1", localDeadline: "2027-02-01T15:45" }]);
  assert.equal(h.updated[0].planExpiresAtExact, "2027-02-01T12:45:00.000Z");
  assert.deepEqual(h.updated[0].planIds, ["a", "b"]);
  assert.deepEqual(h.busy, [true, false]);
  assert(text(h.render()).includes("تم توحيد موعد انتهاء جميع الباقات"));
  assert.equal(input(h.render()).props.disabled, false);
});
await check(async () => {
  const h = harness("deadline", { subscriptionExpiryMixed: true });
  assert.equal(input(h.render()).props.value, "");
  assert(text(h.render()).includes("مواعيد مختلفة"));
  changeDate(h, "2027-01-10T12:00");
  assert.equal(button(h.render(), "حفظ الموعد لجميع الباقات").props.disabled, false);
  form(h.render()).props.onSubmit({ preventDefault() {} }); await flush();
  assert.equal(h.calls.length, 1);
  assert(!text(h.render()).includes("مواعيد مختلفة"));
});
await check(() => {
  const h = harness("deadline", { trialAwaitingDelivery: true });
  assert(!input(h.render())); assert(text(h.render()).includes("يبدأ عدّاد جميع الباقات بعد إرسال تفاصيل الدخول"));
  assert(button(h.render(), "تحديث بيانات الاشتراك"));
});
await check(async () => {
  const h = harness("deadline"); changeDate(h, "2027-02-01T15:45"); h.patchCafe({ subscriptionRevision: "revision-3" });
  assert.equal(input(h.render()).props.disabled, true);
  form(h.render()).props.onSubmit({ preventDefault() {} }); await flush(); assert.equal(h.calls.length, 0);
  button(h.render(), "تحديث بيانات الاشتراك").props.onClick(); await flush();
  assert.equal(input(h.render()).props.disabled, false);
  assert.equal(input(h.render()).props.value, "2027-01-10T12:00");
});
await check(async () => {
  let resolve;
  const h = harness("deadline", {}, { save: () => new Promise(done => { resolve = done; }) }); changeDate(h, "2027-02-01T15:45");
  const submit = form(h.render()).props.onSubmit; submit({ preventDefault() {} }); submit({ preventDefault() {} });
  assert.equal(h.calls.length, 1); assert.equal(input(h.render()).props.disabled, true);
  resolve({ ok: false, message: "تغير الاشتراك حدّث البيانات" }); await flush();
  assert.equal(input(h.render()).props.value, "2027-02-01T15:45");
  assert(nodes(h.render()).some(node => node.props?.role === "alert" && text(node) === "تغير الاشتراك حدّث البيانات"));
  assert.deepEqual(h.busy, [true, false]);
});
await check(async () => {
  const h = harness("deadline");
  for (const value of ["", "2027-02-30T12:00", "2027-01-10T12:00"]) {
    changeDate(h, value); assert.equal(button(h.render(), "حفظ الموعد لجميع الباقات").props.disabled, true);
    form(h.render()).props.onSubmit({ preventDefault() {} }); await flush();
  }
  assert.equal(h.calls.length, 0);
  changeDate(h, "2020-01-01T12:00"); assert(text(h.render()).includes("ستنتهي صلاحية جميع الباقات الحالية فور الحفظ"));
});
await check(async () => {
  const h = harness("deadline", {}, { refresh: async () => { throw Error("offline"); } });
  button(h.render(), "تحديث بيانات الاشتراك").props.onClick(); await flush();
  assert(nodes(h.render()).some(node => node.props?.role === "alert"));
  assert.equal(input(h.render()).props.value, "2027-01-10T12:00");
});
await check(() => {
  for (const [sheet, names] of [["components/admin/brand-details.module.css", ["planEditor", "currentPlans", "planChoices", "planChoice", "planSubmit", "planNote", "planNotice", "planError", "planMessage"]], ["components/admin/subscription-deadline-editor.module.css", ["editor", "controls", "warning", "error", "message", "refresh"]]]) {
    const result = transform({ filename: sheet, code: fs.readFileSync(sheet), cssModules: true });
    for (const name of names) assert(result.exports[name], `Missing CSS ${name}`);
  }
});
console.log(`PASS ${checks} admin multiple-plan UI groups: addition and cancellation, last/all plans, mutual pending guards, retry/reset, revision conflicts, shared Saudi expiry, prepared trials and CSS contracts; no network or browser`);
