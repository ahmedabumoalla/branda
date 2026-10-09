import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { transform } from "lightningcss";

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL("../components/admin/brand-directory.tsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../components/admin/brand-directory.module.css", import.meta.url), "utf8");
const compiled = transform({ filename: "brand-directory.module.css", code: Buffer.from(css), cssModules: true });
for (const [, name] of source.matchAll(/\bs\.(\w+)/g)) assert(compiled.exports[name], `Missing style ${name}`);
for (const [, asset] of css.matchAll(/url\('([^']+)'\)/g)) assert(fs.existsSync(new URL(`../public${asset}`, import.meta.url)));

function harness(component, props, input = source, overrides = {}) {
  const state = []; let cursor = 0;
  const stubs = {
    react: { ...React,
      useState(initial) { const slot = cursor++; if (!(slot in state)) state[slot] = initial; return [state[slot], next => { state[slot] = typeof next === "function" ? next(state[slot]) : next; }]; },
      useMemo: compute => compute(), useTransition: () => [false, run => run()],
    },
    "./brand-directory.module.css": { __esModule: true, default: new Proxy({}, { get: (_, name) => name }) },
    ...overrides,
  };
  const output = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function("require", "exports", output)(name => Object.hasOwn(stubs, name) ? stubs[name] : require(name), exports);
  return { render() { cursor = 0; return exports[component](props); } };
}
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const byLabel = (h, label) => nodes(h.render()).find(node => node.props?.["aria-label"] === label);
const withClass = (h, name) => nodes(h.render()).filter(node => node.props?.className === name);
const html = h => renderToStaticMarkup(h.render());
const cafes = Array.from({ length: 25 }, (_, index) => ({ id: `brand-${index}`, name: `علامة ${index}`, slug: `brand-${index}`, maintenanceAccountNumber: `BR-TEST-${index}`, ownerName: "مالك العلامة", ownerEmail: `owner${index}@example.invalid`, ownerPhone: `05000000${index}`, status: index % 2 ? "موقوف" : "نشط", planId: "menu", planName: "باقة المنيو", hasActivePlan: index % 3 === 0, totalRevenue: index * 10, productsCount: index, offersCount: 2, experienceSubmissionsCount: 3, experienceRewardsCount: 4, supportTicketsCount: 5, planExpiresAt: "2026-11-01T00:00:00Z" }));
const props = { cafes, plans: [], onManage() {} };
const rows = h => nodes(withClass(h, "desktopTable")[0]).filter(node => node.type === "tbody")[0]?.props.children ?? [];
let checks = 1;
async function test(run) { await run(); checks++; }

await test(() => {
  const h = harness("BrandDirectory", props);
  assert.equal(rows(h).length, 12);
  assert.equal(withClass(h, "mobileCard").length, 12);
  assert.equal(byLabel(h, "الصفحة السابقة").props.disabled, true);
  byLabel(h, "الصفحة التالية").props.onClick();
  assert.equal(rows(h)[0].key, "brand-12");
  byLabel(h, "الصفحة التالية").props.onClick();
  assert.equal(rows(h).length, 1);
  assert.equal(byLabel(h, "الصفحة التالية").props.disabled, true);
  byLabel(h, "الصفحة السابقة").props.onClick();
  assert.equal(rows(h)[0].key, "brand-12");
});
await test(() => {
  const h = harness("BrandDirectory", props);
  byLabel(h, "الصفحة التالية").props.onClick();
  nodes(h.render()).find(node => node.type === "input").props.onChange({ target: { value: "  BR-TEST-24  " } });
  assert.equal(rows(h).length, 1);
  assert.equal(rows(h)[0].key, "brand-24");
  assert.equal(byLabel(h, "الصفحة السابقة").props.disabled, true);
  nodes(h.render()).find(node => node.type === "input").props.onChange({ target: { value: "OWNER1@EXAMPLE.INVALID" } });
  assert.equal(rows(h)[0].key, "brand-1");
});
await test(() => {
  const h = harness("BrandDirectory", props);
  const activeTab = nodes(h.render()).find(node => node.type === "button" && node.props.children?.[0] === "النشطة");
  activeTab.props.onClick();
  byLabel(h, "حالة الاشتراك").props.onChange({ target: { value: "inactive" } });
  assert.equal(rows(h).length, 8);
  assert(rows(h).every(row => { const cafe = cafes.find(cafe => cafe.id === row.key); return cafe.status === "نشط" && !cafe.hasActivePlan; }));
  withClass(h, "reset")[0].props.onClick();
  assert.equal(rows(h).length, 12);
});
await test(() => {
  const order = cafes.map(cafe => cafe.id);
  const h = harness("BrandDirectory", props);
  byLabel(h, "ترتيب العلامات").props.onChange({ target: { value: "products" } });
  assert.equal(rows(h)[0].key, "brand-24");
  byLabel(h, "ترتيب العلامات").props.onChange({ target: { value: "name" } });
  assert.equal(rows(h)[0].key, [...cafes].sort((a,b) => a.name.localeCompare(b.name,"ar"))[0].id);
  assert.deepEqual(cafes.map(cafe => cafe.id), order);
});
await test(() => {
  let selected;
  const h = harness("BrandDirectory", { ...props, onManage: cafe => { selected = cafe; } });
  const action = nodes(rows(h)[0]).find(node => node.type?.name === "ManageButton");
  const button = action.type(action.props);
  assert.equal(button.props["aria-haspopup"], "dialog");
  button.props.onClick();
  assert.equal(selected, cafes[0]);
  const output = html(h);
  for (const value of ["العروض", "التوثيقات", "المكافآت", "الدعم", "المنتجات", "رقم الصيانة", "BR-TEST-0"]) assert(output.includes(value));
});
await test(() => {
  for (const [expiry, expected] of [["2026-11-01T00:00:00Z", "ينتهي في"], ["invalid", "بدون تاريخ انتهاء محدد"], [undefined, "بدون تاريخ انتهاء محدد"]]) {
    const output = html(harness("BrandPlanSummary", { cafe: { ...cafes[0], planExpiresAt: expiry }, plans: [] }));
    assert(output.includes(expected)); assert(!output.includes("Invalid Date"));
  }
  assert(html(harness("BrandPlanSummary", { cafe: { ...cafes[0], planId: "", planName: "", planExpiresAt: undefined }, plans: [] })).includes("بدون اشتراك"));
});
await test(() => {
  const empty = harness("BrandDirectory", { ...props, cafes: [] });
  assert(html(empty).includes("لم تُضف علامات تجارية بعد"));
  const failed = harness("BrandDirectory", { ...props, configError: "تعذر الاتصال" });
  assert.equal(withClass(failed, "stats").length, 0);
  assert.equal(withClass(failed, "desktopTable").length, 0);
  assert(html(failed).includes('role="alert"'));
  const search = harness("BrandDirectory", props);
  nodes(search.render()).find(node => node.type === "input").props.onChange({ target: { value: "no match" } });
  assert(html(search).includes("لا توجد علامات مطابقة"));
});
await test(() => {
  const parent = fs.readFileSync(new URL("../components/admin/pages/admin-cafes-page.tsx", import.meta.url), "utf8");
  const h = harness("AdminCafesPage", { initialCafes: cafes, initialPlans: [], initialCustomers: [], initialOperations: [] }, parent, {
    "@/components/admin/brand-directory": { BrandDirectory: "brand-directory" },
    "@/components/admin/brand-details-dialog": { BrandDetailsDialog: "brand-dialog", BrandFeatureControls: "feature-controls" },
    "@/components/ui/design-system": { BentoCard: "div" },
    "@/app/actions/admin": {}, "@/lib/format": { formatSar: String },
    "@/lib/platform/feature-access": { getPlanIncludedFeatures: () => [], getBrandFeatureOverrides: () => [], getEffectiveBrandFeatureAccess: () => [] },
  });
  nodes(h.render()).find(node => node.type === "brand-directory").props.onManage(cafes[3]);
  const dialog = nodes(h.render()).find(node => node.type === "brand-dialog");
  assert.equal(dialog.props.cafe.id, "brand-3");
  assert.equal(typeof dialog.props.updatePlan, "function");
  assert.equal(typeof dialog.props.toggleStatus, "function");
  dialog.props.close();
  assert(!nodes(h.render()).some(node => node.type === "brand-dialog"));
});
await test(() => {
  const lum = hex => { const c = hex.slice(1).match(/../g).map(value => parseInt(value,16)/255).map(value => value <= .04045 ? value/12.92 : ((value+.055)/1.055)**2.4); return c[0]*.2126+c[1]*.7152+c[2]*.0722; };
  const tokens = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/gi)].map(([,key,value]) => [key,value]));
  for (const [foreground, minimum] of [["ink",4.5],["muted",4.5],["gold",4.5],["green",4.5],["red",4.5],["field",3]]) assert((lum(tokens[foreground])+.05)/(lum(tokens.surface)+.05) >= minimum, `${foreground} contrast`);
  assert(css.includes("prefers-reduced-motion: reduce"));
  assert(css.includes(".desktopTable { display: none; }"));
  assert(css.includes(".mobileCards { display: grid;"));
});
console.log(`PASS brand directory: ${checks} isolated CSS, SSR, search, filters, sort, pagination, dialog integration and contrast checks; no live mutations`);
