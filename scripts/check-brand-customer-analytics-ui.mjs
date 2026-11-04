import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const file = path.resolve("components/admin/pages/brand-analytics-page.tsx");
const actionModule = "@/app/actions/brand-customer-analytics";
let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; }
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
function load(modulePath, stubs = {}, cache = new Map()) {
  if (cache.has(modulePath)) return cache.get(modulePath);
  const loadedModule = { exports: {} };
  const localRequire = id => {
    if (Object.hasOwn(stubs, id)) return stubs[id];
    if (id.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (id === actionModule) return {};
    if (id.startsWith("@/")) {
      const base = path.resolve(id.slice(2));
      return load(fs.existsSync(`${base}.tsx`) ? `${base}.tsx` : `${base}.ts`, stubs, cache);
    }
    return require(id);
  };
  const output = ts.transpileModule(fs.readFileSync(modulePath, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", output)(localRequire, loadedModule, loadedModule.exports);
  cache.set(modulePath, loadedModule.exports);
  return loadedModule.exports;
}
const generatedAt = "2026-11-04T10:00:00Z";
const brands = Array.from({ length: 18 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, name: i ? `علامة اختبار ${i}` : "مَقْهَى ألوان", slug: `fixture-${i}`, category: "cafe",
  registeredCustomers: 30 + i, cardholders: 25, activeCustomers: 10, inactiveCustomers: 8, returningCustomers: 12, loyalCustomers: 4, walletCustomers: 14, visitsInPeriod: 50,
  averageVisitGapDays: 3.5, retention: [7, 14, 30].map(days => ({ days, eligible: 20, retained: 10, rate: 50 })), lastVisitAt: generatedAt,
}));
const report = { generatedAt, timeZone: "Asia/Riyadh", days: 30, recordingStartedAt: generatedAt, walletRecordingStartedAt: generatedAt,
  summary: { brands: brands.length, registeredCustomers: 600, cardholders: 500, activeCustomers: 180, inactiveCustomers: 140, returningCustomers: 200, loyalCustomers: 70, walletCustomers: 250 }, brands };
const customer = {
  id: "10000000-0000-4000-8000-000000000000", name: "عميل اختبار اصطناعي", phone: "0500000000", email: "fixture@example.invalid", status: "active", identityMatch: "phone",
  joinedAt: "2026-10-01T08:00:00Z", cardIssuedAt: "2026-10-01T08:05:00Z", cardCount: 1, currentStamps: 2, totalStamps: 14, rewardsRedeemed: 2,
  lastStampAt: "2026-10-20T09:00:00Z", lastRedemptionAt: "2026-10-18T09:00:00Z", lastVisitAt: "2026-10-20T09:00:00Z", inactiveDays: 15,
  isInactive: true, visitDays: 6, averageVisitGapDays: 3.5, isLoyal: false, firstReturnAt: "2026-10-04T09:00:00Z",
  wallet: { firstDownloadAt: "2026-10-01T08:10:00Z", lastDownloadAt: "2026-10-02T08:10:00Z", downloads: 2, firstGoogleSaveAt: null, lastGoogleSaveAt: null, googleSaveLinks: 0, firstInstalledAt: "2026-10-01T08:11:00Z", lastInstalledAt: "2026-10-01T08:11:00Z", installedDevices: 1 },
};
function detailFor(filters) { return { generatedAt, days: filters.days, brand: brands.find(brand => brand.id === filters.brandId),
  heatmap: [{ day: 0, hour: 12, visits: 3 }, { day: 4, hour: 18, visits: 9 }],
  cohorts: [{ month: "2026-10", issued: 25, retention: brands[0].retention }], customers: [{ ...customer, name: filters.page === 2 ? "عميل الصفحة الثانية" : customer.name }], total: 30, page: filters.page || 1, pageSize: 25,
}; }
const customerDetails = { generatedAt, customer, events: [{ id: "fixture-event-1", at: customer.lastStampAt, kind: "stamp", provider: null, origin: "live", stampsDelta: 1, rewardName: null }], total: 26, page: 1, pageSize: 25 };
const { BrandAnalyticsPage } = load(file);
const html = renderToStaticMarkup(React.createElement(BrandAnalyticsPage, { initialReport: report }));
check(html.includes("تحليلات العلامات التجارية"), "Arabic page heading");
equal((html.match(/scope="row"/g) || []).length, 15, "overview paginates brand rows");
for (const copy of ["إجمالي تسجيلات العلامات", "نشطون خلال ١٠ أيام", "منتظمون خلال ٤ أيام", "لا يتوفر تأكيد تثبيت Google", "لا يمثل عدد أشخاص مستقلين", "أكمل مدة القياس"]) check(html.includes(copy), `honest metric explanation: ${copy}`);
const unavailable = renderToStaticMarkup(React.createElement(BrandAnalyticsPage, { initialReport: null }));
check(unavailable.includes('role="alert"'), "unavailable data is an error");
check(!unavailable.includes("إجمالي تسجيلات العلامات"), "missing report is not rendered as zero totals");
const empty = renderToStaticMarkup(React.createElement(BrandAnalyticsPage, { initialReport: { ...report, brands: [] } }));
check(empty.includes("لا توجد علامات تطابق البحث"), "empty brand search state");

function nodes(tree) { if (!tree || typeof tree !== "object") return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.action), ...nodes(tree.props?.children)]; }
function text(tree) { if (tree == null || typeof tree === "boolean") return ""; if (Array.isArray(tree)) return tree.map(text).join(""); return typeof tree === "object" ? text(tree.props?.children) : String(tree); }
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function harness(overrides = {}) {
  const values = []; let cursor = 0;
  const calls = { overview: [], detail: [], customer: [], export: [], pdf: [] };
  const hooks = { ...React,
    useState(initial) { const slot = cursor++; if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial; return [values[slot], next => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }]; },
    useRef(initial) { const slot = cursor++; if (!(slot in values)) values[slot] = { current: initial }; return values[slot]; },
  };
  const actions = {
    loadBrandCustomerAnalyticsAction: async days => { calls.overview.push(days); return { ok: true, data: { ...report, days } }; },
    loadBrandAnalyticsDetailAction: async filters => { calls.detail.push(filters); return { ok: true, data: detailFor(filters) }; },
    loadBrandAnalyticsCustomerAction: async (...args) => { calls.customer.push(args); return { ok: true, data: { ...customerDetails, page: args[2] } }; },
    loadBrandAnalyticsExportAction: async (...args) => { calls.export.push(args); return { ok: true, data: { report: detailFor({ brandId: args[0], days: args[1], page: 1 }), customers: [customer], recordingStartedAt: generatedAt, walletRecordingStartedAt: generatedAt, generatedAt } }; },
    ...overrides,
  };
  const { BrandAnalyticsPage: Page } = load(file, { react: hooks, [actionModule]: actions, "@/lib/export/brand-analytics-pdf": { downloadBrandAnalyticsPdf: async data => calls.pdf.push(data) } });
  return { calls, render() { cursor = 0; return Page({ initialReport: report }); } };
}
function button(tree, label) { const node = nodes(tree).find(item => item.type === "button" && text(item) === label); assert.ok(node, `button exists: ${label}`); return node; }
const ui = harness();
let tree = ui.render();
nodes(tree).find(node => node.type === "input" && node.props.placeholder === "اسم العلامة أو رابطها").props.onChange({ target: { value: "مقهي الوان" } });
tree = ui.render();
equal(nodes(tree).filter(node => node.type === "tr" && node.props["data-selected"] !== undefined).length, 1, "Arabic brand search normalizes diacritics and variants");
nodes(tree).find(node => node.type === "button" && node.props["aria-controls"] === "brand-analytics-detail").props.onClick();
await settle(); tree = ui.render();
equal(ui.calls.detail[0].brandId, brands[0].id, "selected brand scope goes to action");
check(text(tree).includes("التقرير بهوية برندا ويضم جميع عملاء العلامة"), "full export scope is explicit");
check(text(tree).includes(customer.name), "customer identity appears after selecting brand");
check(text(tree).includes("بيانات العملاء وتواريخهم والأختام والمكافآت ومتوسط العودة تراكمية"), "customer period semantics are explicit");
const phoneMarkup = renderToStaticMarkup(tree);
check(phoneMarkup.includes('href="tel:0500000000"') && phoneMarkup.includes('class="phone"'), "customer phone is usable and direction-isolated by CSS");
button(tree, "منقطعون ١٠ أيام").props.onClick(); await settle(); tree = ui.render();
equal(ui.calls.detail.at(-1).segment, "inactive", "inactive segment calls server filtering");
equal(ui.calls.detail.at(-1).page, 1, "filter change resets pagination");
nodes(tree).find(node => node.type === "input" && node.props.placeholder === "ابحث في جميع عملاء العلامة").props.onChange({ target: { value: "  0500000000  " } });
tree = ui.render(); nodes(tree).find(node => node.type === "form").props.onSubmit({ preventDefault() {} }); await settle(); tree = ui.render();
equal(ui.calls.detail.at(-1).search, "0500000000", "customer search is applied server-side and trimmed");
const customerPager = nodes(tree).find(node => typeof node.type === "function" && node.props.label === "صفحات عملاء العلامة");
customerPager.props.onPage(2); await settle(); tree = ui.render();
equal(ui.calls.detail.at(-1).asOf, generatedAt, "customer pagination preserves snapshot");
equal(ui.calls.detail.at(-1).page, 2, "customer pagination requests next page");
check(text(tree).includes("عميل الصفحة الثانية"), "next page replaces customers");
const exportPromise = button(tree, "تقرير العلامة الكامل PDF").props.onClick();
tree = ui.render();
check(nodes(tree).filter(node => node.type === "button" && node.props["aria-controls"] === "brand-analytics-detail").every(node => node.props.disabled), "brand selection disabled while export is in flight");
check(button(tree, "آخر ٧ يومًا").props.disabled, "period selection disabled while export is in flight");
await exportPromise; await settle(); tree = ui.render();
equal(ui.calls.export[0], [brands[0].id, 30], "full PDF export sends brand and period without customer filters or page");
equal(ui.calls.pdf.length, 1, "PDF formatter receives successful full export");

let restoredFocus = 0;
nodes(tree).find(node => node.type === "button" && node.props["aria-haspopup"] === "dialog").props.onClick({ currentTarget: { focus() { restoredFocus++; } } });
await settle(); tree = ui.render();
equal(ui.calls.customer[0], [brands[0].id, customer.id, 1], "customer timeline preserves brand and identity");
let dialog = nodes(tree).find(node => node.type === "dialog");
check(Boolean(dialog), "customer opens a native dialog");
let opened = 0;
dialog.props.ref({ open: false, showModal() { opened++; } });
equal(opened, 1, "native modal provides focus trap");
check(nodes(dialog).find(node => node.type === "button" && node.props.autoFocus), "close control receives initial focus");
const dialogHtml = renderToStaticMarkup(tree);
for (const label of ["أول ملف بطاقة Apple", "آخر ملف بطاقة Apple", "أول رابط حفظ Google", "آخر رابط حفظ Google", "أول تسجيل على جهاز Apple", "آخر صرف مكافأة", "تسجيل ختم ناجح"]) check(dialogHtml.includes(label), `detailed customer date present: ${label}`);
const timelinePager = nodes(dialog).find(node => typeof node.type === "function" && node.props.label === "صفحات السجل الزمني للعميل");
timelinePager.props.onPage(2); await settle(); tree = ui.render();
equal(ui.calls.customer.at(-1)[2], 2, "timeline pagination reaches server");
nodes(tree).find(node => node.type === "dialog").props.onCancel(); tree = ui.render();
check(!nodes(tree).some(node => node.type === "dialog"), "Escape closes timeline");
check(restoredFocus > 0, "closing returns focus to triggering customer button");

button(tree, "أوقات الذروة").props.onClick(); tree = ui.render();
let rendered = renderToStaticMarkup(tree);
equal((rendered.match(/class="heatCell"/g) || []).length, 168, "peak chart contains seven days and twenty-four hours");
check(rendered.includes("عدد زيارات العملاء حسب اليوم والساعة"), "peak chart has accessible table caption");
check(rendered.includes('tabindex="0"') && rendered.includes('tabindex="-1"'), "heatmap uses one keyboard entry with arrow navigation");
check(rendered.includes("عمليات العميل المتعددة في اليوم نفسه تُحسب زيارة واحدة"), "daily visits are explained");
const heatmapComponent = nodes(tree).find(node => typeof node.type === "function" && node.props.cells);
const heatTree = heatmapComponent.type(heatmapComponent.props);
const heatButtons = nodes(heatTree).filter(node => node.type === "button" && node.props["data-level"] !== undefined);
let focusedCell = -1, prevented = 0;
const keyEvent = key => ({ key, preventDefault() { prevented++; }, currentTarget: { closest: () => ({ querySelectorAll: () => heatButtons.map((_, index) => ({ focus() { focusedCell = index; } })) }) } });
heatButtons[0].props.onKeyDown(keyEvent("ArrowLeft"));
equal(focusedCell, 1, "heatmap ArrowLeft follows RTL hour sequence");
heatButtons[0].props.onKeyDown(keyEvent("ArrowDown"));
equal(focusedCell, 24, "heatmap ArrowDown advances one weekday");
heatButtons[30].props.onKeyDown(keyEvent("Home"));
equal(focusedCell, 24, "heatmap Home reaches start of current day");
heatButtons[30].props.onKeyDown(keyEvent("End"));
equal(focusedCell, 47, "heatmap End reaches final hour of current day");
equal(prevented, 4, "heatmap navigation prevents page scroll");
button(tree, "الاحتفاظ بالعملاء").props.onClick(); tree = ui.render(); rendered = renderToStaticMarkup(tree);
check(rendered.includes("عادوا من") && rendered.includes("مؤهلين"), "retention shows numerator and mature denominator");
check(rendered.includes("لا تُحسب البطاقات الجديدة كعملاء مفقودين"), "immature cohorts are explained");

button(tree, "آخر ٧ يومًا").props.onClick(); await settle(); tree = ui.render();
equal(ui.calls.overview.at(-1), 7, "period loads new report");
equal(ui.calls.detail.at(-1).days, 7, "selected brand follows loaded report period");
equal(ui.calls.detail.at(-1).asOf, undefined, "period change creates fresh snapshot");

let resolveOld;
const races = harness({ loadBrandAnalyticsDetailAction: filters => filters.brandId === brands[0].id ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({ ok: true, data: detailFor(filters) }) });
tree = races.render();
const selectors = nodes(tree).filter(node => node.type === "button" && node.props["aria-controls"] === "brand-analytics-detail");
selectors[0].props.onClick(); selectors[1].props.onClick(); await settle();
resolveOld({ ok: true, data: detailFor({ brandId: brands[0].id, days: 30, page: 1 }) }); await settle(); tree = races.render();
const selectedSection = nodes(tree).find(node => node.type === "section" && node.props.id === "brand-analytics-detail");
check(text(selectedSection).includes(brands[1].name), "late old-brand response cannot overwrite current brand");
check(!button(tree, "تقرير العلامة الكامل PDF").props.disabled, "current detail remains exportable after stale response ignored");

const errors = harness({ loadBrandAnalyticsDetailAction: async () => ({ ok: false, message: "خطأ اختبار التفاصيل" }) });
tree = errors.render(); nodes(tree).find(node => node.type === "button" && node.props["aria-controls"] === "brand-analytics-detail").props.onClick(); await settle(); tree = errors.render();
check(text(tree).includes("خطأ اختبار التفاصيل"), "detail errors are shown");
check(button(tree, "تقرير العلامة الكامل PDF").props.disabled, "failed detail cannot export a mismatching brand");
const css = fs.readFileSync("components/admin/pages/brand-analytics-page.module.css", "utf8");
check(css.includes("position: sticky") && css.includes("overflow: auto"), "tables retain headers inside scroll regions");
check(css.includes("@media (max-width: 650px)") && css.includes("prefers-reduced-motion"), "responsive and reduced-motion rules present");
check(css.includes("unicode-bidi: isolate") && css.includes(":focus-visible"), "phone direction and visible focus are defined");
console.log(`Brand customer analytics UI: ${checks} SSR, interaction, scope, race and accessibility checks passed`);
