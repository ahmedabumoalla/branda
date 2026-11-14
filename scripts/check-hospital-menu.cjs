"use strict";
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict"), crypto = require("node:crypto"), ts = require("typescript"), React = require("react");
const inputs = new Set(), cache = new Map(), states = [], refs = [];
let cursor = 0, mode = "harness", response, calls = [];
const mockReact = { ...React, useState(initial) { if (mode !== "harness") return React.useState(initial); const index = cursor++; if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial; return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }]; }, useRef(initial) { if (mode !== "harness") return React.useRef(initial); const index = cursor++; return refs[index] ||= { current: initial }; }, useEffect(effect, deps) { if (mode !== "harness") return React.useEffect(effect, deps); } };
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports); inputs.add(file);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "exports", code)(name => {
    if (name === "react") return mockReact;
    if (name === "server-only") throw Error("Client menu imported a server-only module");
    if (name === "@/app/actions/hospital-orders") return { submitHospitalOrderAction: async input => { calls.push(input); return response(input); } };
    if (name.endsWith(".css")) { inputs.add(path.join(path.dirname(file), name)); return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }; }
    if (name.startsWith("@/") || name.startsWith("./")) { const base = name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(file), name); return load(fs.existsSync(base + ".ts") ? base + ".ts" : base + ".tsx"); }
    return require(name);
  }, exports); return exports;
}
function nodes(node) { return Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === "object" && node.props ? [node, ...nodes(node.props.children)] : []; }
function words(node) { return Array.isArray(node) ? node.map(words).join(" ") : node && typeof node === "object" && node.props ? words(node.props.children) : typeof node === "string" || typeof node === "number" ? String(node) : ""; }
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
const { hospitalProductName, hospitalCategoryName, hospitalProductDescription } = load("lib/commerce/hospital-labels.ts");
const { hospitalProductPrice, hospitalCartTotal } = load("lib/commerce/hospital-menu-cart.ts");
const source = JSON.parse(fs.readFileSync("data/imports/dabab-hospital-20261108.json", "utf8")); inputs.add("data/imports/dabab-hospital-20261108.json");
for (const p of source.products) check(hospitalProductName(p.name, "en") === p.nameEn, "Original English name " + p.sourceId);
check(hospitalProductName("Owner-authored addition", "en") === "Owner-authored addition", "Unknown names stay authored");
check(hospitalCategoryName("الأحد", "en") === "Sunday", "Actual weekday category translation");
check(hospitalProductDescription("250 مل", "en") === "250 ml", "Portion ml translated");
check(hospitalProductDescription("180 جم", "en") === "180 g", "Portion grams translated");
const product = { id: "00000000-0000-4000-8000-000000000001", name: "أمريكانو", category: "القهوة", categoryId: "coffee", description: "250 مل", price: 9, priceRange: { min: 9, max: 14 }, available: true, images: [{ url: "https://example.test/coffee.jpg", alt: "Coffee" }], videos: [], ingredients: [] };
assert.deepEqual(hospitalProductPrice(product), { min: 9, max: 14 }); checks++;
assert.deepEqual(hospitalCartTotal([product], [{ productId: product.id, quantity: 2 }]), { min: 18, max: 28 }); checks++;
check(hospitalProductPrice({ ...product, priceOptions: [10, 12] }) === null, "Explicit actual price option required");
assert.deepEqual(hospitalProductPrice({ ...product, priceOptions: [10, 12] }, 1), { min: 12, max: 12 }); checks++;
check(hospitalProductPrice({ ...product, available: false }) === null, "Unavailable product cannot enter cart");
check(hospitalCartTotal([product], [{ productId: product.id, quantity: 0 }]) === null, "Invalid quantity rejected");
check(hospitalCartTotal([], [{ productId: product.id, quantity: 1 }]) === null, "Missing product rejected");
const menu = { name: "مايند", slug: "mind-hospital", logoUrl: null, description: null, categories: [{ id: "coffee", name: "القهوة", description: null }], products: [product], contacts: { feedbackEnabled: false, instagramUrl: null, location: null } };
const { HospitalMenu } = load("components/menu/hospital-menu.tsx");
let tree;
function render() { cursor = 0; tree = HospitalMenu({ menu }); return tree; }
function find(predicate) { const found = nodes(tree).find(predicate); assert.ok(found, "Expected UI control"); return found; }
function button(text) { return find(n => n.type === "button" && words(n).trim() === text); }
function input(predicate, value) { find(n => n.type === "input" && predicate(n.props)).props.onChange({ target: { value } }); render(); }
const tick = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  render(); check(tree.props.dir === "rtl" && tree.props.lang === "ar", "Arabic first render");
  find(n => n.type === "button" && n.props["aria-label"] === "Switch to English").props.onClick(); render();
  check(tree.props.dir === "ltr" && tree.props.lang === "en", "Language toggle changes locale and direction");
  check(words(tree).includes("Americano") && words(tree).includes("Coffee"), "English catalog uses original translations");
  find(n => n.type === "button" && n.props["aria-label"] === "Product details Americano").props.onClick(); render();
  check(words(tree).includes("Prices are estimates"), "Range explicitly identified as estimated");
  check(!nodes(tree).some(n => n.type === "input" && n.props.type === "radio"), "Range endpoints never become invented size options");
  button("Add to order").props.onClick(); render();
  find(n => n.type === "button" && n.props.className === "cartBar").props.onClick(); render();
  input(p => p.placeholder === "For example, ground floor or floor 2", "2");
  input(p => p.placeholder === "Clinic name or number", "Clinic 10");
  input(p => p.autoComplete === "name", "Test Doctor");
  input(p => p.type === "tel", "0500000000");
  let reject;
  response = () => new Promise((_, rejectPromise) => { reject = rejectPromise; });
  find(n => n.type === "form").props.onSubmit({ preventDefault() {} });
  find(n => n.type === "form").props.onSubmit({ preventDefault() {} });
  check(calls.length === 1, "In-flight double submit rejected synchronously");
  reject(Error("Synthetic network failure")); await tick(); render();
  check(words(tree).includes("We could not confirm your order"), "Ambiguous failure is not shown as success");
  const requestId = calls[0].requestId;
  response = async () => ({ ok: true, order: { id: "00000000-0000-4000-8000-000000000002", number: 12, total: 9, totalMax: 14, needsPriceConfirmation: true, status: "pending" } });
  find(n => n.type === "form").props.onSubmit({ preventDefault() {} }); await tick(); render();
  check(calls.length === 2 && calls[1].requestId === requestId, "Retry reuses idempotency key for same payload");
  check(calls[1].floor === "2" && calls[1].clinic === "Clinic 10" && calls[1].language === "en", "Destination and language reach server action");
  check(!("price" in calls[1].items[0]) && !("priceOptionIndex" in calls[1].items[0]), "Range order sends neither client price nor invented option");
  check(words(tree).includes("Awaiting cashier review") && !nodes(tree).some(n => n.type === "button" && n.props.className === "cartBar"), "Success uses actual receipt and clears submitted cart");
  mode = "SSR";
  const { renderToStaticMarkup } = require("react-dom/server");
  const html = renderToStaticMarkup(React.createElement(HospitalMenu, { menu }));
  check(html.includes('lang="ar"') && html.includes("dabab-hospital-logo-v1.webp"), "Server rendering preserves original MIND identity");
  require("postcss").parse(fs.readFileSync("components/menu/hospital-menu.module.css", "utf8")); checks++;
  inputs.add("package.json"); inputs.add("package-lock.json"); inputs.add("scripts/check-hospital-menu.cjs");
  fs.mkdirSync("output/mind-hospital-20261114", { recursive: true });
  const result = { at: new Date().toISOString(), runtime: process.version, command: "node scripts/check-hospital-menu.cjs", checks, passed: true, inputs: Object.fromEntries([...inputs].map(f => [f, crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex")])), limits: ["Hook harness and SSR, no browser or live orders"] };
  fs.writeFileSync("output/mind-hospital-20261114/menu-check.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ checks, passed: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
