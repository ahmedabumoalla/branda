import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import ts from "typescript";
import { transform } from "lightningcss";

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL("../components/admin/brand-details-dialog.tsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../components/admin/brand-details.module.css", import.meta.url), "utf8");
const compiledCss = transform({ filename: "brand-details.module.css", code: Buffer.from(css), cssModules: true });
for (const name of ["maintenanceActions", "maintenanceButton", "maintenanceError", "primaryButton"]) assert(compiledCss.exports[name], `Missing CSS class ${name}`);
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;

function harness(action = async () => ({ ok: true, redirectTo: "/dashboard" }), code = "BR-TEST-12345678") {
  const state = [], calls = [];
  let cursor = 0;
  const hooks = {
    ...React,
    useEffect() {},
    useState(initial) {
      const slot = cursor++;
      if (!(slot in state)) state[slot] = initial;
      return [state[slot], value => { state[slot] = value; }];
    },
    useRef(initial) {
      const slot = cursor++;
      if (!(slot in state)) state[slot] = { current: initial };
      return state[slot];
    },
  };
  const stubs = {
    react: hooks,
    "next/navigation": { useRouter: () => ({ push: path => calls.push(["navigate", path]) }) },
    "@/app/actions/maintenance": { enterMaintenanceModeAction: async code => { calls.push(["enter", code]); return action(); } },
    "@/lib/performance/dashboard-shell-client": { clearDashboardShellSnapshot: () => calls.push(["clearSnapshot"]) },
    "@/lib/format": { formatSar: value => String(value) },
    "./standalone-menu-control": { StandaloneMenuControl: () => null },
    "./brand-operations-panel": { BrandOperationsPanel: () => null },
    "./brand-analytics-panel": { BrandAnalyticsPanel: () => null },
    "./brand-details.module.css": { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) },
  };
  const exports = {};
  new Function("require", "exports", compiled)(name => Object.hasOwn(stubs, name) ? stubs[name] : require(name), exports);
  return {
    calls,
    render() {
      cursor = 0;
      return exports.BrandDetailsDialog({ cafe: { id: "brand-test", name: "علامة الاختبار", maintenanceAccountNumber: code, totalRevenue: 0 }, plans: [], close() {} });
    },
  };
}
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function button(h) { return nodes(h.render()).find(node => node.type === "button" && node.props.className?.includes("maintenanceButton")); }
function error(h) { return nodes(h.render()).find(node => node.props?.role === "alert"); }
let checks = 1;
async function test(run) { await run(); checks++; }

await test(async () => {
  const h = harness();
  assert.equal(button(h).props.disabled, false);
  await button(h).props.onClick();
  assert.deepEqual(h.calls, [["enter", "BR-TEST-12345678"], ["clearSnapshot"], ["navigate", "/dashboard"]]);
  assert.equal(button(h).props.disabled, true);
  assert.equal(button(h).props["aria-busy"], true);
});
await test(async () => {
  let finish;
  const h = harness(() => new Promise(resolve => { finish = resolve; }));
  const click = button(h).props.onClick;
  const pending = click();
  await click();
  assert.equal(h.calls.length, 1, "Duplicate clicks must not start multiple sessions");
  assert.equal(button(h).props.disabled, true);
  assert.equal(button(h).props["aria-busy"], true);
  finish({ ok: false, message: "رقم الصيانة غير صحيح أو غير موجود" });
  await pending;
  assert.equal(error(h).props.children, "رقم الصيانة غير صحيح أو غير موجود");
  assert.equal(button(h).props.disabled, false);
  assert.equal(button(h).props["aria-busy"], false);
  assert.deepEqual(h.calls, [["enter", "BR-TEST-12345678"]]);
});
await test(async () => {
  let attempts = 0;
  const h = harness(async () => { if (++attempts === 1) throw Error("denied or offline"); return { ok: true, redirectTo: "/dashboard" }; });
  await button(h).props.onClick();
  assert.equal(error(h).props.children, "تعذر الدخول إلى وضع الصيانة حاول مجددًا");
  assert.equal(button(h).props.disabled, false);
  assert.deepEqual(h.calls, [["enter", "BR-TEST-12345678"]]);
  await button(h).props.onClick();
  assert.equal(error(h), undefined);
  assert.deepEqual(h.calls.slice(1), [["enter", "BR-TEST-12345678"], ["clearSnapshot"], ["navigate", "/dashboard"]]);
});
await test(async () => {
  const h = harness(undefined, "");
  assert.equal(button(h).props.disabled, true);
  await button(h).props.onClick();
  assert.deepEqual(h.calls, []);
});
console.log(`PASS brand maintenance entry: ${checks} CSS and isolated handler checks; no live maintenance session created`);
