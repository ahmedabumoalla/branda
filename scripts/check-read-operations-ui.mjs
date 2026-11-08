import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import ts from "typescript";
import { transform } from "lightningcss";

const require = createRequire(import.meta.url);
const source = fs.readFileSync("components/dashboard/pages/read-operations-page.tsx", "utf8");
const css = transform({ filename: "read-operations-page.module.css", code: fs.readFileSync("components/dashboard/pages/read-operations-page.module.css"), cssModules: true });
for (const [, key] of source.matchAll(/styles\.(\w+)/g)) assert(css.exports[key], key);
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
function harness(data, actions = {}, initialError = "") {
  const state = [], exports = {}; let cursor = 0;
  const stubs = {
    react: { ...React, useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], next => { state[i] = typeof next === "function" ? next(state[i]) : next; }]; }, useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; }, useCallback: fn => fn, useEffect() {} },
    "@/app/actions/loyalty-read-operations": actions,
    "./read-operations-page.module.css": { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) },
  };
  new Function("require", "exports", code)(name => stubs[name] ?? require(name), exports);
  return () => { cursor = 0; return exports.ReadOperationsPage({ initialData: data, initialError }); };
}
const nodes = tree => !tree || typeof tree !== "object" ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => tree == null || typeof tree === "boolean" ? "" : Array.isArray(tree) ? tree.map(text).join("") : typeof tree === "object" ? text(tree.props?.children) : String(tree);
const button = (tree, label) => nodes(tree).find(node => node.type === "button" && text(node) === label);
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const statuses = ["pending", "processing", "succeeded", "failed", "needs_review", "duplicate"];
const data = {
  items: statuses.map((status, i) => ({ requestId: `id-${i}`, status, identifierHint: "****1234", customerName: status === "pending" ? null : "عميل اختبار", cashierName: "كاشير اختبار", availableRewards: 0, rewardIssued: false, errorCode: null, errorMessage: null, retryable: status === "failed", attempts: 1, createdAt: "2026-11-08T10:30:00Z", completedAt: null })),
  total: 6, page: 1, pageSize: 25, counts: { ...Object.fromEntries(statuses.map(status => [status, 1])), retryable: 1 },
};
let render = harness(data);
let tree = render();
assert.equal(nodes(tree).filter(node => node.type === "tbody")[0].props.children.length, 6);
assert(text(tree).includes("عملية مكررة لم يُضف ختم"));
assert(text(tree).includes("لم يتأكد تسجيل الختم بعد"));
assert(text(tree).includes("****1234"));
assert(nodes(tree).some(node => node.props?.role === "region" && node.props.tabIndex === 0));
assert.equal(nodes(tree).find(node => node.type === "label").props.htmlFor, "read-status-filter");
assert.equal(button(tree, "السابق").props.disabled, true);
assert.equal(button(tree, "التالي").props.disabled, true);

render = harness(null, {}, "تعذر التحميل");
assert(text(render()).includes("السجل غير متاح الآن"));
assert(nodes(render()).some(node => node.props?.role === "alert"));
assert.equal(button(render(), "مزامنة العمليات الفاشلة").props.disabled, true);
render = harness({ ...data, items: [], total: 0, counts: { ...Object.fromEntries(statuses.map(status => [status, 0])), retryable: 0 } });
assert(text(render()).includes("لم تصل عمليات قراءة بعد"));
assert.equal(button(render(), "مزامنة العمليات الفاشلة").props.disabled, true);

render = harness({ ...data, counts: { ...data.counts, failed: 3, retryable: 0 } });
assert.equal(button(render(), "مزامنة العمليات الفاشلة").props.disabled, true, "permanent failures cannot enable retry");
render = harness({ ...data, items: [{ ...data.items[2], cardCreated: true, invitationStatus: "failed" }] });
assert(text(render()).includes("أُنشئت بطاقة ولاء جديدة"));
assert(text(render()).includes("رابط البطاقة: تعذر الإرسال ولا يؤثر ذلك على نتيجة الختم"));
assert(text(render()).includes("تم حفظ الختم في بطاقة العميل"));

let retries = 0, releaseRetry;
render = harness(data, {
  retryOwnerLoyaltyReadsAction: () => { retries++; return new Promise(resolve => { releaseRetry = resolve; }); },
  loadOwnerLoyaltyReadsAction: async () => ({ ok: true, data }),
});
const retry = button(render(), "مزامنة العمليات الفاشلة").props.onClick;
retry(); retry();
assert.equal(retries, 1, "rapid activation cannot submit two retry batches");
assert.equal(button(render(), "مزامنة العمليات الفاشلة").props.disabled, true);
releaseRetry({ ok: true, retried: 1 }); await flush();
assert(text(render()).includes("أعيدت جدولة 1 عملية للمزامنة"));
assert(text(render()).includes("ستظهر نتيجة تسجيل الأختام بعد المعالجة"));
assert(!text(render()).includes("تم تسجيل 1"));

const requests = [];
render = harness({ ...data, page: 2, total: 40 }, { loadOwnerLoyaltyReadsAction: async input => { requests.push(input); return { ok: true, data: { ...data, page: input.page } }; } });
nodes(render()).find(node => node.type === "select").props.onChange({ target: { value: "failed" } }); await flush();
assert.deepEqual(requests, [{ page: 1, status: "failed" }]);
assert.equal(nodes(render()).find(node => node.type === "select").props.value, "failed");

render = harness(data, { loadOwnerLoyaltyReadsAction: async () => ({ ok: false, message: "تعذر تحديث السجل" }) });
nodes(render()).find(node => node.type === "select").props.onChange({ target: { value: "failed" } }); await flush();
assert.equal(nodes(render()).find(node => node.type === "select").props.value, "", "failed filter load preserves matching records and selection");
assert(text(render()).includes("تعذر تحديث السجل"));
assert.equal(nodes(render()).find(node => node.type === "tbody").props.children.length, 6);

render = harness(data, { retryOwnerLoyaltyReadsAction: async () => { throw new Error("offline"); } });
button(render(), "مزامنة العمليات الفاشلة").props.onClick(); await flush();
assert(text(render()).includes("تعذر تأكيد طلب المزامنة"));
assert.equal(button(render(), "مزامنة العمليات الفاشلة").props.disabled, false);
const style = fs.readFileSync("components/dashboard/pages/read-operations-page.module.css", "utf8");
assert(style.includes("@media(max-width:640px)"));
assert(style.includes(":focus-visible"));
assert(style.includes("min-height:44px"));
const pageSource = fs.readFileSync("app/dashboard/read-operations/page.tsx", "utf8");
assert(pageSource.includes('featureCodesAllow(features, "loyalty")'));
console.log("PASS read operations UI: 6 statuses, accessible table, empty/error, idempotent retry activation, honest queued feedback, filter rollback, pagination and responsive CSS");
