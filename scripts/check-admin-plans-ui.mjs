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
const catalog = load(path.resolve("lib/platform/feature-access.ts")).getBrandNavigationFeatures();
const fixture = (id, features, categoryId = "cafes_coffee") => ({ id, name: `Plan ${id}`, description: "", categoryId,
  priceMonthly: 100, offerEnabled: false, durationCount: 1, durationUnit: "month", active: true,
  isDefault: false, features, maxOrdersMonthly: 42, maxBranches: 3, maxProductsMonthly: 20,
});
const request = { id: "request-1", cafeName: "Brand", planName: "Plan", paymentMethod: "bank_transfer", amount: 100, status: "pending_review", createdAt: "2026-10-09T10:00:00Z" };
function harness(initialPlans, initialRequests = [], overrides = {}) {
  let index = 0;
  const values = [];
  const calls = [];
  const hooks = { ...React, useState(initial) {
    const slot = index++;
    if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial;
    return [values[slot], (next) => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }];
  }, useRef(initial) { const slot = index++; if (!(slot in values)) values[slot] = { current: initial }; return values[slot]; } };
  const actions = {
    savePlatformPlansAction: async (plans) => { calls.push(["save", plans]); return { ok: true, data: plans }; },
    approveSubscriptionRequestAction: async (id) => { calls.push(["approve", id]); return { ok: true, data: [{ ...request, status: "approved" }] }; },
    rejectSubscriptionRequestAction: async (id, reason) => { calls.push(["reject", id, reason]); return { ok: true, data: [{ ...request, status: "rejected" }] }; },
    ...overrides,
  };
  const { AdminPlansPage } = load(path.resolve("components/admin/pages/admin-plans-page.tsx"), { react: hooks, "@/app/actions/admin": actions });
  return { calls, values, render() { index = 0; return AdminPlansPage({ initialPlans, initialRequests }); } };
}
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (tree == null || typeof tree === "boolean") return "";
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (typeof tree === "object") return text(tree.props?.children);
  return String(tree);
}
function button(tree, label) { return nodes(tree).find(node => node.type === "button" && text(node) === label); }
function featureButton(tree, id) { const feature = catalog.find(item => item.id === id); return nodes(tree).find(node => node.props?.className === "feature" && text(node).startsWith(feature.sidebarLabel ?? feature.titleAr)); }

const initial = [fixture("one", ["menu"]), fixture("two", ["loyalty"]), fixture("other", ["all"], "restaurants")];
const view = harness(initial, [request]);
let tree = view.render();
let html = renderToStaticMarkup(tree);
assert.equal(nodes(tree).filter(node => node.props?.className === "editor").length, 1, "only one editor renders regardless of plan count");
assert.equal(nodes(tree).filter(node => node.props?.className === "feature").length, catalog.length);
for (const feature of catalog) assert.ok(html.includes(feature.sidebarLabel ?? feature.titleAr));
assert.equal(featureButton(tree, "menu").props["aria-pressed"], true);
assert.equal(featureButton(tree, "loyalty").props["aria-pressed"], false);
assert.ok(!html.includes("عدد الفروع") && !html.includes("عدد الطلبات"), "archived commerce controls are absent");
featureButton(tree, "offers").props.onClick();
tree = view.render();
assert.equal(featureButton(tree, "offers").props["aria-pressed"], true);
await nodes(tree).find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
assert.deepEqual(view.calls[0][1][0].features, ["menu", "offers"]);
assert.equal(view.calls[0][1][0].maxOrdersMonthly, 42, "hidden commerce configuration is preserved");
assert.equal(view.calls[0][1][0].maxBranches, 3);
assert.deepEqual(view.calls[0][1][1], initial[1], "editing one plan preserves another plan");
assert.ok(renderToStaticMarkup(view.render()).includes("تم حفظ الباقات"));

const wildcard = harness([fixture("all", ["all"])]);
tree = wildcard.render();
assert.ok(catalog.every(feature => featureButton(tree, feature.id).props["aria-pressed"]));
featureButton(tree, "loyalty").props.onClick();
tree = wildcard.render();
assert.equal(featureButton(tree, "loyalty").props["aria-pressed"], false);
await nodes(tree).find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
assert.deepEqual(wildcard.calls[0][1][0].features, catalog.filter(feature => feature.id !== "loyalty").map(feature => feature.id), "wildcard expands to explicit shared navigation services");

const empty = harness([]);
html = renderToStaticMarkup(empty.render());
assert.ok(html.includes("ابدأ بباقة تناسب عملاءك") && html.includes("لا توجد طلبات دفع"));
button(empty.render(), "إضافة باقة").props.onClick();
assert.deepEqual(empty.values[0][0].features, [], "new plans do not silently grant services");
const trialEditor = harness([{ ...fixture("owner_trial_7d", ["menu", "settings"]), priceMonthly: 0, durationCount: 7, durationUnit: "day" }]);
const trialTree = trialEditor.render();
assert.equal(nodes(trialTree).find(node => node.props?.className === "editor").props.disabled, true, "dedicated trial cannot be edited through package controls");
assert.ok(renderToStaticMarkup(trialTree).includes("7 أيام"));

const selection = harness(initial);
tree = selection.render();
nodes(tree).find(node => node.props?.className === "planChoice" && text(node).includes("Plan two")).props.onClick();
tree = selection.render();
assert.equal(featureButton(tree, "loyalty").props["aria-pressed"], true);
assert.equal(featureButton(tree, "menu").props["aria-pressed"], false);
button(tree, "تعيين كباقة أساسية").props.onClick();
assert.equal(selection.values[0][1].isDefault, true);
assert.equal(selection.values[0][0].isDefault, false);
assert.equal(selection.values[0][2].isDefault, initial[2].isDefault, "other category default is preserved");
tree = selection.render();
assert.equal(nodes(tree).filter(node => node.props?.className === "planChoice").length, 3, "all activity categories share one plan catalog");
assert.equal(nodes(tree).filter(node => node.props?.className === "categories").length, 0, "no activity tabs");

globalThis.window = { prompt: () => "Payment mismatch", confirm: () => true };
globalThis.requestAnimationFrame = (callback) => callback();
const review = harness(initial, [request]);
await button(review.render(), "اعتماد وتفعيل الباقة").props.onClick();
assert.deepEqual(review.calls[0], ["approve", request.id]);
assert.ok(!button(review.render(), "اعتماد وتفعيل الباقة"));
const reject = harness(initial, [request]);
await button(reject.render(), "رفض الطلب").props.onClick();
assert.deepEqual(reject.calls[0], ["reject", request.id, "Payment mismatch"]);

let resolveSave;
const pending = harness(initial, [], { savePlatformPlansAction: () => new Promise(resolve => { resolveSave = resolve; }) });
const submit = nodes(pending.render()).find(node => node.type === "form").props.onSubmit;
const saving = submit({ preventDefault() {} });
assert.equal(nodes(pending.render()).find(node => node.props?.className === "workspace").props.disabled, true);
resolveSave({ ok: true, data: initial });
await saving;
const failing = harness(initial, [], { savePlatformPlansAction: async () => { throw new Error("Save failed"); } });
featureButton(failing.render(), "offers").props.onClick();
await nodes(failing.render()).find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
html = renderToStaticMarkup(failing.render());
assert.ok(html.includes('role="alert"') && html.includes("تعذر الاتصال لحفظ الباقات") && !html.includes("Save failed"));
assert.ok(failing.values[0][0].features.includes("offers"), "failed save preserves edits");
const rejected = harness(initial, [], { savePlatformPlansAction: async () => ({ ok: false, message: "راجع بيانات الباقة" }) });
await nodes(rejected.render()).find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
assert.ok(renderToStaticMarkup(rejected.render()).includes("راجع بيانات الباقة"));

const css = fs.readFileSync("components/admin/pages/admin-plans-page.module.css", "utf8");
const source = fs.readFileSync("components/admin/pages/admin-plans-page.tsx", "utf8");
for (const [, className] of source.matchAll(/styles\.([a-zA-Z]+)/g)) assert.ok(css.includes(`.${className}`), `defined CSS class ${className}`);
assert.ok(css.includes("prefers-reduced-motion") && css.includes(":focus-visible") && css.includes("max-width: 560px"));
function luminance(hex) { return hex.match(/\w\w/g).map(channel => parseInt(channel, 16) / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0); }
for (const [foreground, background] of [["f2f3ec", "181c1b"], ["b3bdb7", "202624"], ["241b0d", "e4c58a"], ["a6dfbd", "203b2e"], ["ffc2bb", "432925"]]) {
  const a = luminance(foreground), b = luminance(background);
  assert.ok((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5, `text contrast ${foreground}/${background}`);
}
console.log("PASS admin plans: actual component SSR and handlers, shared feature catalog, wildcard toggles, save success/failure/pending, payment review and responsive style coverage.");
