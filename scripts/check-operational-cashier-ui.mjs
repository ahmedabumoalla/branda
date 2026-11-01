import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import ts from "typescript";
import { transform } from "lightningcss";

const require = createRequire(import.meta.url);
const source = fs.readFileSync("components/dashboard/pages/operational-cashier-page.tsx", "utf8");
const css = transform({ filename: "operational-cashier-page.module.css", code: fs.readFileSync("components/dashboard/pages/operational-cashier-page.module.css"), cssModules: true });
for (const [, key] of source.matchAll(/styles\.(\w+)/g)) assert(css.exports[key], key);
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
function harness(dashboard, actions = {}) {
  const state = [], exports = {}; let cursor = 0;
  const stubs = {
    react: { ...React, useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], next => { state[i] = typeof next === "function" ? next(state[i]) : next; }]; }, useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; }, useMemo: fn => fn(), useEffect() {}, useActionState: action => ["", action, false] },
    "next/link": { __esModule: true, default: "a" },
    "@/app/actions/cashier": actions,
    "@/app/actions/loyalty-cards": actions,
    "@/components/ui/design-system": { DashboardPageShell: "main", SoftCard: "section" },
    "./operational-cashier-page.module.css": { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) },
  };
  new Function("require", "exports", code)(name => stubs[name] ?? require(name), exports);
  return () => { cursor = 0; return exports.OperationalCashierPageClient({ initialDashboard: dashboard }); };
}
const nodes = tree => !tree || typeof tree !== "object" ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => tree == null || typeof tree === "boolean" ? "" : Array.isArray(tree) ? tree.map(text).join("") : typeof tree === "object" ? text(tree.props?.children) : String(tree);
const button = (tree, label) => nodes(tree).find(node => node.type === "button" && text(node) === label);
const fixture = { cafeId: "brand", cafeSlug: "brand", cafeName: "علامة اختبار", businessCategory: "cafes_coffee", canOpenAsOwner: true, cashiers: [], activities: [] };
const employee = { id: "employee", fullName: "موظف الاختبار", phone: "+966500000001", authMethod: "whatsapp_otp", active: true, canUseLoyalty: true, canUsePager: false, lastLoginAt: null };
globalThis.HTMLElement = class {};
globalThis.document = { activeElement: null };
globalThis.window = { location: { origin: "https://brand.test" } };
let copied = "";
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async value => { copied = value; } } } });
let checks = 1;
let render = harness(fixture);
assert(text(render()).includes("فريقك يبدأ من أول موظف"));
assert(text(render()).includes("لا تحتاج تعيين كلمة مرور للحساب الجديد"));
assert(!text(render()).includes("حدّد الجوال وكلمة المرور"));
assert(button(render(), "الدخول باسمي"));
assert(text(render()).includes("تتطلب الصلاحيات تفعيل الخدمة في باقة العلامة"));
checks++;
await button(render(), "نسخ رابط الدخول").props.onClick();
await Promise.resolve();
assert.equal(copied, "https://brand.test/cashier/login");
assert(text(render()).includes("تم نسخ رابط الدخول"));
checks++;
render = harness({ ...fixture, canOpenAsOwner: false });
assert(!button(render(), "الدخول باسمي"));
const link = nodes(render()).find(node => node.type === "a" && node.props.href === "/cashier/login");
assert.equal(link.props.target, "_blank");
assert.equal(link.props.rel, "noopener noreferrer");
checks++;
let createCalls = [];
render = harness(fixture, { createLoyaltyCashierAction: async payload => { createCalls.push(payload); return { cashier: employee, whatsappStatus: "queued" }; } });
button(render(), "إضافة أول موظف").props.onClick();
let dialog = nodes(render()).find(node => node.type === "dialog");
assert.equal(dialog.props["aria-labelledby"], "cashier-dialog-title");
assert(text(dialog).includes("يدخل برمز تحقق يصله على جواله"));
assert(!nodes(dialog).some(node => node.type === "input" && node.props.type === "password"));
let form = nodes(dialog).find(node => node.type === "form");
form.props.onSubmit({ preventDefault() {} }); await Promise.resolve();
assert.equal(createCalls.length, 0);
assert(text(render()).includes("أدخل اسمًا واضحًا للموظف"));
checks++;
let inputs = nodes(render()).filter(node => node.type === "input");
inputs[0].props.onChange({ target: { value: "موظف الاختبار" } });
inputs[1].props.onChange({ target: { value: "0500000001" } });
form = nodes(nodes(render()).find(node => node.type === "dialog")).find(node => node.type === "form");
form.props.onSubmit({ preventDefault() {} }); await Promise.resolve(); await Promise.resolve();
assert.equal(createCalls.length, 1);
assert.equal(createCalls[0].canUseLoyalty, true);
assert.equal(createCalls[0].canUsePager, false);
assert(text(render()).includes("وجدولة رسالة واتساب"));
checks++;
let toggles = [];
render = harness({ ...fixture, cashiers: [employee, { ...employee, id: "owner", fullName: "المالك", ownerUserId: "owner-user" }] }, { setLoyaltyCashierStatusAction: async (...args) => { toggles.push(args); } });
const ownerRows = nodes(render()).filter(node => ["tr", "article"].includes(node.type) && text(node).includes("المالك"));
for (const row of ownerRows) assert(!nodes(row).some(node => node.type === "button"));
button(render(), "تعطيل").props.onClick(); await Promise.resolve(); await Promise.resolve();
assert.deepEqual(toggles, [["employee", false]]);
assert(button(render(), "تفعيل"));
checks++;
let permissionCalls = [];
render = harness({ ...fixture, cashiers: [employee] }, { updateCashierPermissionsAction: async payload => { permissionCalls.push(payload); return payload; } });
button(render(), "تعديل الصلاحيات").props.onClick();
dialog = nodes(render()).find(node => node.type === "dialog");
assert(text(dialog).includes("ستنتهي جلساته الحالية"));
nodes(dialog).find(node => node.type === "select").props.onChange({ target: { value: "pager" } });
dialog = nodes(render()).find(node => node.type === "dialog");
assert(text(dialog).includes("من دون صلاحية الولاء"));
nodes(dialog).find(node => node.type === "form").props.onSubmit({ preventDefault() {} }); await Promise.resolve(); await Promise.resolve();
assert.equal(permissionCalls[0].cashierId, "employee");
assert.equal(permissionCalls[0].canUseLoyalty, false);
assert.equal(permissionCalls[0].canUsePager, true);
assert(text(render()).includes("يسجل الموظف الدخول مجددًا"));
checks++;
const styleText = fs.readFileSync("components/dashboard/pages/operational-cashier-page.module.css", "utf8");
assert(styleText.includes("@media(max-width:720px)"));
assert(styleText.includes("prefers-reduced-motion"));
assert(styleText.includes(":focus-visible"));
assert(styleText.includes("min-height:46px"));
checks++;
console.log(`PASS ${checks} operations UI, actor permissions, OTP, clipboard, modal and responsive CSS checks`);
