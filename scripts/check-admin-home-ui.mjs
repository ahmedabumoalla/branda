import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { transform } from "lightningcss";

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL("../components/admin/pages/admin-home-page.tsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../components/admin/pages/admin-home-page.module.css", import.meta.url), "utf8");
const compiledCss = transform({ filename: "admin-home-page.module.css", code: Buffer.from(css), cssModules: true, minify: true });
for (const [, name] of source.matchAll(/\bs\.(\w+)/g)) assert(compiledCss.exports[name], `Missing CSS class ${name}`);
for (const [, asset] of css.matchAll(/url\('([^']+)'\)/g)) assert(fs.existsSync(new URL(`../public${asset}`, import.meta.url)));
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;

function harness(component, props) {
  const state = [];
  let cursor = 0;
  const stubs = {
    react: { ...React, useState(initial) { const slot = cursor++; if (!(slot in state)) state[slot] = initial; return [state[slot], value => { state[slot] = value; }]; } },
    "next/link": { __esModule: true, default: "a" },
    "./admin-home-page.module.css": { __esModule: true, default: new Proxy({}, { get: (_, name) => name }) },
  };
  const exports = {};
  new Function("require", "exports", compile(source))(name => Object.hasOwn(stubs, name) ? stubs[name] : require(name), exports);
  return { render() { cursor = 0; return exports[component](props); } };
}
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const withClass = (tree, value) => nodes(tree).filter(node => node.props?.className?.split(" ").includes(value));
const html = h => renderToStaticMarkup(h.render());
const months = Array.from({ length: 12 }, (_, index) => ({ monthKey: `2026-${String(index + 1).padStart(2, "0")}`, monthLabel: `شهر ${index + 1}`, revenue: index * 100, subscriptionsCount: index, growthPercent: null }));
const overview = { totalCafes: 23, activeCafes: 20, totalProducts: 724, totalCustomers: 121, activeSubscriptions: 23, totalExperienceSubmissions: 0, currentMonthRevenue: 1100, totalRevenueLast12Months: 6600, currentMonthGrowthPercent: 10, monthlyRevenue: months, auditItems: [
  { id: "a", title: "الدخول إلى وضع الصيانة", entityLabel: "العلامات", actorName: "أحمد", actorEmail: "admin@example.invalid", cafeName: "الكواكب", dateLabel: "١٠ أكتوبر ٢٠٢٦", timeLabel: "١ صباحًا" },
  { id: "b", title: "تعديل باقة", entityLabel: "الباقات", actorName: "النظام", actorEmail: "", cafeName: "المنصة", dateLabel: "٩ أكتوبر ٢٠٢٦", timeLabel: "١ مساءً" },
] };
let checks = 1;
async function test(run) { await run(); checks++; }

await test(() => {
  const h = harness("AdminHomePage", { overview });
  const tree = h.render();
  assert.equal(nodes(tree).filter(node => node.type === "h1").length, 1);
  assert.equal(withClass(tree, "stat").length, 5);
  assert.equal(withClass(tree, "auditTable").length, 1);
  const output = html(h);
  for (const value of ["724", "121", "23", "1,100", "6,600", "admin@example.invalid", "الكواكب"]) assert(output.includes(value));
  assert(!output.includes("سيتم البناء لاحقًا"));
  for (const link of nodes(tree).filter(node => node.props?.href)) assert(fs.existsSync(new URL(`../app${link.props.href}/page.tsx`, import.meta.url)), `Missing route ${link.props.href}`);
});
await test(() => {
  const h = harness("AdminHomePage", { overview, configError: "تعذر تحميل البيانات" });
  assert.equal(withClass(h.render(), "stat").length, 0);
  assert.equal(withClass(h.render(), "auditTable").length, 0);
  assert(html(h).includes('role="alert"'));
  assert(html(h).includes("إعادة المحاولة"));
});
await test(() => {
  const h = harness("RevenueChart", { months: months.map(month => ({ ...month, revenue: 0 })) });
  assert.equal(withClass(h.render(), "bar").length, 0, "Zero revenue must not create fake bars");
  assert(html(h).includes("لا توجد إيرادات مسجلة"));
  assert.equal(nodes(h.render()).filter(node => node.type === "tr").length, 13);
});
await test(() => {
  const h = harness("RevenueChart", { months });
  const bars = withClass(h.render(), "bar");
  assert.equal(bars.length, 12);
  assert.equal(bars[0].props.style.height, "0%");
  assert.equal(bars[11].props.style.height, "100%");
  assert.equal(withClass(h.render(), "plot")[0].props.style["--months"], 12);
  const range = nodes(h.render()).find(node => node.type === "button" && node.props.children === "٦ أشهر");
  range.props.onClick();
  assert.equal(withClass(h.render(), "bar").length, 6);
  assert.equal(withClass(h.render(), "plot")[0].props.style["--months"], 6);
  assert(html(h).includes("5,100"));
  assert.equal(nodes(h.render()).filter(node => node.type === "tr").length, 7);
  const month = withClass(h.render(), "month")[0];
  month.props.onFocus();
  assert.equal(withClass(h.render(), "month")[0].props["aria-pressed"], true);
  assert(renderToStaticMarkup(withClass(h.render(), "monthDetail")[0]).includes("600"));
  assert.equal(withClass(h.render(), "monthDetail")[0].props["aria-live"], "polite");
});
await test(() => {
  for (const [current, previous, expected, unexpected] of [[0, 0, "دون تغير", "ارتفاع"], [50, 100, "انخفاض", "ارتفاع"], [125, 100, "ارتفاع", "انخفاض"], [100, 0, "لا تتوفر مقارنة نسبية", "100%"], [100, undefined, "لا تتوفر مقارنة نسبية", "%"]]) {
    const output = html(harness("GrowthIndicator", { current, previous }));
    assert(output.includes(expected)); assert(!output.includes(unexpected));
  }
});
await test(() => {
  const h = harness("RevenueChart", { months: [] });
  assert(html(h).includes("لا توجد إيرادات مسجلة"));
  assert(!html(h).includes("NaN"));
  assert.equal(withClass(h.render(), "monthDetail").length, 0);
});
await test(() => {
  const h = harness("AdminHomePage", { overview });
  nodes(h.render()).find(node => node.type === "input").props.onChange({ target: { value: " ADMIN@EXAMPLE.INVALID " } });
  assert.equal(withClass(h.render(), "operation").length, 1);
  assert(html(h).includes("الكواكب"));
  nodes(h.render()).find(node => node.type === "select").props.onChange({ target: { value: "الباقات" } });
  assert.equal(withClass(h.render(), "operation").length, 0);
  assert(html(h).includes("لا توجد نتائج مطابقة"));
  withClass(h.render(), "resetButton")[0].props.onClick();
  assert.equal(withClass(h.render(), "operation").length, 2);
});
await test(() => {
  const h = harness("AdminHomePage", { overview: { ...overview, auditItems: [] } });
  assert(html(h).includes("لا توجد عمليات مسجلة بعد"));
  assert.equal(nodes(h.render()).filter(node => node.type === "input").length, 0);
});
await test(() => {
  const dataSource = fs.readFileSync(new URL("../lib/data/admin-dashboard.ts", import.meta.url), "utf8");
  const exports = {};
  new Function("require", "exports", `${compile(dataSource)}\nexports.label = getAuditActionLabel;`)(() => ({}), exports);
  assert.equal(exports.label("maintenance_mode_started"), "الدخول إلى وضع الصيانة");
  assert.equal(exports.label("maintenance_mode_ended"), "الخروج من وضع الصيانة");
  assert.equal(exports.label("admin_update_cafes"), "تعديل بيانات علامة");
});
await test(() => {
  const lum = hex => {
    const values = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
  };
  const tokens = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/gi)].map(([, name, color]) => [name, color]));
  for (const [front, back, minimum] of [["ink", "surface", 4.5], ["muted", "surface", 4.5], ["muted", "raised", 4.5], ["gold", "surface", 4.5], ["green", "surface", 4.5], ["red", "surface", 4.5], ["field", "surface", 3]]) {
    const values = [lum(tokens[front]), lum(tokens[back])].sort((a, b) => b - a);
    assert((values[0] + .05) / (values[1] + .05) >= minimum, `${front}/${back} contrast`);
  }
  assert(css.includes("prefers-reduced-motion: reduce"));
});
console.log(`PASS admin home: ${checks} isolated SSR, chart, filters, data labels, CSS, assets and contrast checks; no live admin requests`);
