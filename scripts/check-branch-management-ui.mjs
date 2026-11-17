import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transform } from "lightningcss";

const root = fileURLToPath(new URL("..", import.meta.url)), dependency = createRequire(import.meta.url);
const css = transform({ filename: "branch-menus-page.module.css", code: fs.readFileSync(path.join(root, "components/dashboard/pages/branch-menus-page.module.css")), cssModules: true });
assert(Object.keys(css.exports).length > 20);
function load(relative, stubs) {
  const filename = path.isAbsolute(relative) ? relative : path.join(root, relative), exports = {};
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "exports", output)(name => {
    if (name in stubs) return stubs[name];
    if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (name.startsWith("@/") || name.startsWith(".")) { const base = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name); return load([`${base}.ts`, `${base}.tsx`].find(file => fs.existsSync(file)), stubs); }
    return dependency(name);
  }, exports);
  return exports;
}
function nodes(node, predicate) { if (!node || typeof node !== "object") return []; if (Array.isArray(node)) return node.flatMap(child => nodes(child, predicate)); return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)]; }
function text(node) { if (node == null || typeof node === "boolean") return ""; if (typeof node !== "object") return String(node); if (Array.isArray(node)) return node.map(text).join(""); return text(node.props?.children); }
const button = (tree, label) => { const found = nodes(tree, node => node.type === "button" && text(node) === label)[0]; assert(found, label); return found; };
const field = (tree, id) => { const found = nodes(tree, node => node.props?.id === id)[0]; assert(found, id); return found; };
const submit = tree => nodes(tree, node => node.type === "form")[0].props.onSubmit({ preventDefault() {} });
const branch = { id: "branch-1", name: "فرع الربيع", slug: "rabi", primary: false, active: true, lat: 24, lng: 46, address: "", city: "الرياض", welcomeMessage: "", usesBrandMenu: false, brandMenuRoot: false, updatedAt: "revision-1", sortOrder: 1 };
const calls = []; let saveImpl = async input => ({ ...branch, ...input, updatedAt: "revision-2" }), sourceImpl = async input => ({ ...branch, ...input, updatedAt: "revision-2" }), resolveImpl = async () => ({ latitude: 25, longitude: 47 });
const actions = { async saveMenuBranchAction(input) { calls.push({ kind: "save", input }); return saveImpl(input); }, async setMenuBranchSourceAction(input) { calls.push({ kind: "source", input }); return sourceImpl(input); }, async resolveMenuBranchLocationAction(url) { calls.push({ kind: "location", url }); return resolveImpl(url); } };
function harness(props = { branches: [], slug: "brand" }, inherited = false) {
  const values = [], effects = [], cleanups = new Map(); let cursor = 0, refreshes = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const hooks = { ...React, useState(initial) { const slot = cursor++; if (!(slot in values)) values[slot] = initial; return [values[slot], next => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }]; }, useRef(initial) { const slot = cursor++; if (!(slot in values)) values[slot] = { current: initial }; return values[slot]; }, useEffect(fn, deps) { const slot = cursor++; if (!same(values[slot], deps)) { values[slot] = deps; effects.push(() => { cleanups.get(slot)?.(); cleanups.set(slot, fn()); }); } } };
  const exports = load(`components/dashboard/pages/${inherited ? "branch-inherited-menu" : "branch-menus-page"}.tsx`, { react: hooks, "next/link": { __esModule: true, default: ({ children, ...rest }) => React.createElement("a", rest, children) }, "next/navigation": { useRouter: () => ({ refresh() { refreshes++; } }) }, "@/app/actions/menu-branches": actions, "@/components/ui/design-system": { DashboardPageShell: ({ children }) => React.createElement("main", null, children) } });
  return { render() { cursor = 0; const tree = (inherited ? exports.BranchInheritedMenu : exports.BranchMenusPage)(props); effects.splice(0).forEach(effect => effect()); return tree; }, unmount() { cleanups.forEach(cleanup => cleanup?.()); }, get refreshes() { return refreshes; } };
}
let count = 0;
async function check(name, run) { await run(); count++; console.log(`PASS ${name}`); }
await check("opening a generic brand has add actions and no writes or location permission requests", () => { const before = calls.length, h = harness(); const tree = h.render(); assert.equal(nodes(tree, node => node.type === "button" && text(node) === "إضافة فرع").length, 2); assert.equal(calls.length, before); const markup = renderToStaticMarkup(tree); assert.match(markup, /dir="rtl"/); assert.match(markup, /حتى 10 مواقع/); h.unmount(); });
await check("invalid coordinate pairs are not persisted", async () => { const before = calls.length, h = harness(); button(h.render(), "إضافة فرع").props.onClick(); let tree = h.render(); field(tree, "branch-name").props.onChange({ target: { value: "فرع جديد" } }); field(tree, "branch-lat").props.onChange({ target: { value: "24" } }); await submit(h.render()); assert.equal(calls.length, before); assert.match(text(h.render()), /خط العرض وخط الطول معًا/); h.unmount(); });
await check("failed create preserves entered data and retry UUID while duplicate submissions are blocked", async () => {
  let fail; saveImpl = () => new Promise((_, reject) => { fail = reject; }); const before = calls.length, h = harness(); button(h.render(), "إضافة فرع").props.onClick(); let tree = h.render(); field(tree, "branch-name").props.onChange({ target: { value: "فرع جديد" } }); tree = h.render(); const first = submit(tree); await submit(tree); assert.equal(calls.length, before + 1); const id = calls.at(-1).input.id; fail(new Error("offline")); await first;
  tree = h.render(); assert.equal(field(tree, "branch-name").props.value, "فرع جديد"); saveImpl = async input => ({ ...branch, ...input }); await submit(tree); assert.equal(calls.at(-1).input.id, id); assert.equal(calls.at(-1).input.expectedUpdatedAt, null); assert.equal(calls.at(-1).input.lat, null); assert.equal(nodes(h.render(), node => node.type === "form").length, 0); h.unmount();
});
await check("closing the editor invalidates a delayed map response", async () => { let finish; resolveImpl = () => new Promise(resolve => { finish = resolve; }); const h = harness(); button(h.render(), "إضافة فرع").props.onClick(); field(h.render(), "branch-map-url").props.onChange({ target: { value: "https://maps.app.goo.gl/example" } }); const work = button(h.render(), "تحديد الموقع من الرابط").props.onClick(); button(h.render(), "إلغاء").props.onClick(); button(h.render(), "إضافة فرع").props.onClick(); finish({ latitude: 25, longitude: 47 }); await work; assert.equal(field(h.render(), "branch-lat").props.value, ""); h.unmount(); });
await check("root branch cannot adopt itself or be deactivated and links are correctly scoped", () => { const h = harness({ branches: [{ ...branch, brandMenuRoot: true }], slug: "brand" }); let tree = h.render(); assert(!nodes(tree, node => node.type === "button" && text(node) === "اعتماد المنيو الأساسي للعلامة").length); assert(nodes(tree, node => node.props?.href === "/dashboard/menu?branch=branch-1").length); button(tree, "تعديل بيانات الفرع").props.onClick(); tree = h.render(); assert.equal(nodes(tree, node => node.type === "input" && node.props.type === "checkbox")[0].props.disabled, true); h.unmount(); });
await check("adopting main menu sends branch revision and updates source without product writes", async () => { const h = harness({ branches: [branch], slug: "brand" }); await button(h.render(), "اعتماد المنيو الأساسي للعلامة").props.onClick(); assert.deepEqual(calls.at(-1), { kind: "source", input: { id: "branch-1", expectedUpdatedAt: "revision-1", usesBrandMenu: true } }); assert.match(text(h.render()), /استعادة منيو الفرع المستقل/); h.unmount(); });
await check("coverage shows excluded eleventh location and inactive previews are absent", () => { const branches = Array.from({ length: 11 }, (_, index) => ({ ...branch, id: `id-${index}`, lat: index, sortOrder: index })); branches.push({ ...branch, id: "inactive", active: false, slug: "inactive" }); const h = harness({ branches, slug: "brand" }), tree = h.render(); assert.match(text(tree), /خارج حد المواقع العشرة/); assert(!nodes(tree, node => node.props?.href === "/menu/brand?branch=inactive").length); h.unmount(); });
await check("inherited menu is read only and independent switch refreshes once", async () => { const h = harness({ branch: { ...branch, usesBrandMenu: true }, products: [], categories: [], mainMenuHref: "/dashboard/menu?branch=main" }, true); const tree = h.render(); assert.equal(nodes(tree, node => node.type === "form").length, 0); assert(nodes(tree, node => node.props?.href === "/dashboard/menu?branch=main").length); await button(tree, "استعادة منيو الفرع المستقل").props.onClick(); assert.equal(h.refreshes, 1); assert.equal(calls.at(-1).input.usesBrandMenu, false); h.unmount(); });
console.log(`Branch management UI checks passed: ${count}`);
