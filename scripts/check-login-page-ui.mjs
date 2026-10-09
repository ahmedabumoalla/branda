import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transform } from "lightningcss";

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../app/login/login.module.css", import.meta.url), "utf8");
const compiledCss = transform({ filename: "login.module.css", code: Buffer.from(css), cssModules: true, minify: true });
assert(compiledCss.code.length > 0);
for (const [, name] of source.matchAll(/styles\.(\w+)/g)) assert(compiledCss.exports[name], `Missing CSS class ${name}`);

function harness(actions = {}) {
  const state = [];
  const calls = [];
  let cursor = 0;
  const hooks = {
    ...React,
    useState(initial) {
      const slot = cursor++;
      if (!(slot in state)) state[slot] = initial;
      return [state[slot], next => { state[slot] = typeof next === "function" ? next(state[slot]) : next; }];
    },
    useRef(initial) {
      const slot = cursor++;
      if (!(slot in state)) state[slot] = { current: initial };
      return state[slot];
    },
  };
  const stubs = {
    react: hooks,
    "next/link": { __esModule: true, default: "a" },
    "next/navigation": { useRouter: () => ({ replace: path => calls.push(["navigate", path]) }) },
    "@/components/ui/barndaksa-logo": { BarndaksaLogo: () => React.createElement("span", null, "برندة") },
    "./login.module.css": { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) },
    "@/app/actions/auth": {
      loginOwnerAction: async (...args) => { calls.push(["login", ...args]); return { ok: true, redirectTo: "/dashboard" }; },
      requestPasswordResetAction: async email => { calls.push(["reset", email]); return { message: "تحقق من بريدك" }; },
      ...actions,
    },
  };
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function("require", "exports", output)(name => Object.hasOwn(stubs, name) ? stubs[name] : require(name), exports);
  return { calls, render() { cursor = 0; return exports.default(); } };
}
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function byId(tree, id) { return nodes(tree).find(node => node.props?.id === id); }
function byLabel(tree, label) { return nodes(tree).find(node => node.props?.["aria-label"] === label); }
function forms(tree) { return nodes(tree).filter(node => node.type === "form"); }
const submit = { preventDefault() {} };
function fill(h, identity = "owner@example.invalid", password = "test-password") {
  byId(h.render(), "login-identity").props.onChange({ target: { value: identity } });
  byId(h.render(), "login-password").props.onChange({ target: { value: password } });
}
let checks = 1;
async function test(run) { await run(); checks++; }

await test(() => {
  const tree = harness().render();
  const html = renderToStaticMarkup(tree);
  assert.equal(nodes(tree).filter(node => node.type === "h1").length, 1);
  assert.equal(byId(tree, "login-password").props.type, "password");
  assert.equal(byId(tree, "login-identity").props.autoComplete, "username");
  assert.equal(byId(tree, "login-password").props.autoComplete, "current-password");
  for (const input of nodes(tree).filter(node => node.type === "input")) {
    assert(nodes(tree).some(node => node.type === "label" && node.props.htmlFor === input.props.id));
    assert(input.props.required);
  }
  assert(html.includes('href="/register"'));
  assert(html.includes('aria-labelledby="reset-title"'));
  assert(!/<dialog[^>]*\sopen(?:\s|>)/.test(html));
});
await test(() => {
  const h = harness();
  byLabel(h.render(), "إظهار كلمة المرور").props.onClick();
  assert.equal(byId(h.render(), "login-password").props.type, "text");
  assert.equal(byLabel(h.render(), "إخفاء كلمة المرور").props["aria-pressed"], true);
  byLabel(h.render(), "إخفاء كلمة المرور").props.onClick();
  assert.equal(byId(h.render(), "login-password").props.type, "password");
});
await test(async () => {
  const h = harness(); fill(h, "0511111111");
  await forms(h.render())[0].props.onSubmit(submit);
  assert.deepEqual(h.calls, [["login", "0511111111", "test-password"], ["navigate", "/dashboard"]]);
});
await test(async () => {
  const h = harness({ loginOwnerAction: async () => ({ ok: false, message: "راجع بيانات الدخول" }) }); fill(h);
  await forms(h.render())[0].props.onSubmit(submit);
  const tree = h.render();
  assert.equal(byId(tree, "login-message").props.children, "راجع بيانات الدخول");
  assert.equal(byId(tree, "login-message").props.role, "alert");
  assert.equal(byId(tree, "login-password").props.value, "test-password");
  assert.equal(forms(tree)[0].props["aria-busy"], false);
  assert.equal(h.calls.length, 0);
});
await test(async () => {
  const h = harness({ loginOwnerAction: async () => { throw Error("offline"); } }); fill(h);
  await forms(h.render())[0].props.onSubmit(submit);
  assert.equal(byId(h.render(), "login-message").props.children, "تعذر تسجيل الدخول حاول مجددًا");
  assert.equal(forms(h.render())[0].props["aria-busy"], false);
});
await test(async () => {
  let finish, attempts = 0;
  const h = harness({ loginOwnerAction: () => { attempts++; return new Promise(resolve => { finish = resolve; }); } }); fill(h);
  const pending = forms(h.render())[0].props.onSubmit(submit);
  assert.equal(forms(h.render())[0].props["aria-busy"], true);
  assert.equal(nodes(h.render()).find(node => node.type === "fieldset").props.disabled, true);
  await forms(h.render())[0].props.onSubmit(submit);
  assert.equal(attempts, 1);
  finish({ ok: true, redirectTo: "/admin" }); await pending;
  assert.deepEqual(h.calls, [["navigate", "/admin"]]);
});
await test(() => {
  const h = harness(); fill(h);
  const tree = h.render();
  let opened = 0, closed = 0, focused = 0;
  const dialog = nodes(tree).find(node => node.type === "dialog");
  const trigger = nodes(tree).find(node => node.props?.["aria-haspopup"] === "dialog");
  dialog.props.ref.current = { showModal: () => opened++, close: () => closed++ };
  trigger.props.ref.current = { focus: () => focused++ };
  trigger.props.onClick();
  assert.equal(opened, 1);
  assert.equal(byId(h.render(), "reset-email").props.value, "owner@example.invalid");
  byLabel(h.render(), "إغلاق استعادة كلمة المرور").props.onClick();
  dialog.props.onClose();
  assert.equal(closed, 1); assert.equal(focused, 1);
  fill(h, "0511111111");
  nodes(h.render()).find(node => node.props?.["aria-haspopup"] === "dialog").props.onClick();
  assert.equal(byId(h.render(), "reset-email").props.value, "");
});
await test(async () => {
  const h = harness();
  byId(h.render(), "reset-email").props.onChange({ target: { value: "owner@example.invalid" } });
  await forms(h.render())[1].props.onSubmit(submit);
  assert.deepEqual(h.calls, [["reset", "owner@example.invalid"]]);
  assert.equal(forms(h.render())[1].props["aria-busy"], false);
  assert(renderToStaticMarkup(h.render()).includes("تحقق من بريدك"));
});
await test(async () => {
  const h = harness({ requestPasswordResetAction: async () => { throw Error("offline"); } });
  await forms(h.render())[1].props.onSubmit(submit);
  assert.equal(forms(h.render())[1].props["aria-busy"], false);
  assert(renderToStaticMarkup(h.render()).includes("تعذر إرسال رابط الاستعادة حاول مجددًا"));
});

function luminance(hex) {
  const rgb = hex.replace("#", "").match(/.{2}/g).map(channel => parseInt(channel, 16) / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
await test(() => {
  const tokens = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/gi)].map(([, key, value]) => [key, value]));
  for (const [foreground, background, minimum] of [["muted", "paper", 4.5], ["accent", "soft", 4.5], ["gold", "night", 4.5], ["muted-dark", "night", 4.5], ["danger", "danger-bg", 4.5], ["field-border", "paper", 3]]) {
    const values = [luminance(tokens[foreground]), luminance(tokens[background])].sort((a, b) => b - a);
    assert((values[0] + .05) / (values[1] + .05) >= minimum, `Contrast: ${foreground}/${background}`);
  }
  for (const asset of [...css.matchAll(/url\("([^"\)]+)"\)/g)]) assert(fs.existsSync(fileURLToPath(new URL(`../public${asset[1]}`, import.meta.url))));
});
console.log(`PASS login UI: ${checks} isolated SSR, form, recovery, CSS and contrast checks; no live authentication or email`);
