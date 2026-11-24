const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
function load(file) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "exports", code)(name => {
    if (name === "next/link") return { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) };
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (name.startsWith("@/app/actions/")) return {};
    if (name.startsWith("@/lib/")) return load(name.slice(2) + ".ts");
    return require(name);
  }, exports);
  return exports;
}
const display = load("lib/loyalty/branch-report-display.ts");
const now = "2026-11-24T15:00:00Z";
assert.equal(display.activityAge(null, now), "لا يوجد نشاط مسجل");
assert.equal(display.activityAge("2026-11-24T14:55:00Z", now), "قبل 5 دقيقة");
assert.equal(display.activityAge("2026-11-24T13:00:00Z", now), "قبل 2 ساعة");
assert.equal(display.activityAge("2026-11-22T15:00:00Z", now), "قبل 2 يوم");
assert.equal(display.activityAge("2026-11-25T15:00:00Z", now), "وقت النشاط بعد وقت التقرير");
const branchId = "00000000-0000-4000-8000-000000000001";
const summary = { issuedCards: 8, downloadedCards: 3, appleInstalledCards: 2, googleSaveLinks: 4, stamps: 17, redemptions: 1, customers: 8, staff: 1, lastActivityAt: now, lastActivityKind: "stamp" };
const filters = { from: "", to: "", branchId, search: "", page: 1 };
const data = { summary, asOf: now, total: 1, page: 1, pageSize: 25,
  branches: [{ ...summary, id: branchId, name: "فرع الاختبار", active: true, address: "", city: "", phone: "", workingHours: "", createdAt: now }],
  customers: [{ id: branchId, cardId: branchId, name: "عميل الاختبار", phone: "966500000000", branchId, branchName: "فرع الاختبار", issuedAt: now, source: "cashier", cashierId: branchId, cashierName: "الموظف", downloadedAt: null, appleInstalledAt: null, googleSaveLinkAt: null, stamps: 1, redemptions: 0, lastActivityAt: now, lastActivityKind: "issue" }],
  staff: [{ id: branchId, name: "الموظف", active: true, branchId, branchName: "فرع الاختبار", issuedCards: 8, stamps: 17, redemptions: 1, lastActivityAt: now, lastActivityKind: "stamp" }],
};
const { BranchCustomersReport } = load("components/loyalty/branch-customers-report.tsx");
const html = renderToStaticMarkup(React.createElement(BranchCustomersReport, { initial: { ok: true, data }, filters }));
for (const phrase of ["تفاصيل عملاء الفرع", "عميل الاختبار", "لم يسجل تحميل", "إضافة من الكاشير", "إنشاء رابط جوجل لا يؤكد حفظ البطاقة", "سجل عمليات الفرع", "موظفو الفرع"]) assert(html.includes(phrase), phrase);
assert(html.includes(`/api/loyalty/branches/export?branch=${branchId}`));
const errorHtml = renderToStaticMarkup(React.createElement(BranchCustomersReport, { initial: { ok: false, message: "تعذر التحميل" }, filters }));
assert(errorHtml.includes('role="alert"'));
assert(!errorHtml.includes("البطاقات الصادرة"));
const kinds = load("lib/loyalty/activity-types.ts");
const activity = { ...data, events: [], employees: [], recordingStartedAt: null, summary: { ...summary, total: 0, scans: 0, rewardsIssued: 0, denied: 0, failed: 0, duplicates: 0, uniqueCards: 0, activeCashiers: 0 } };
const { LoyaltyActivityLog } = load("components/loyalty/loyalty-activity-log.tsx");
const log = renderToStaticMarkup(React.createElement(LoyaltyActivityLog, { initialResult: { ok: true, data: activity }, initialFilters: { ...kinds.defaultLoyaltyActivityFilters(), branchId } }));
for (const phrase of ["إصدار بطاقة", "إضافة ختم", "تحميل أو حفظ بطاقة آبل", "نشاط الفروع", "تفاصيل عملاء الفرع", "جميع الفروع"]) assert(log.includes(phrase), phrase);
for (const file of ["components/loyalty/loyalty-branches.tsx", "components/dashboard/pages/branch-menus-page.tsx"]) {
  const source = fs.readFileSync(file, "utf8");
  assert(source.includes("تفاصيل عملاء الفرع"));
  assert(source.includes("/api/loyalty/branches/export"));
}
console.log("PASS branch report SSR, cashier issuance without download, honest wallet labels, branch filters/links/exports, elapsed timestamps and error state");
