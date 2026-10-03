import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const dependency = createRequire(import.meta.url);
const source = readFileSync(path.join(root, "components/rast-loyalty/rast-dashboard.tsx"), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

// Match the project's deterministic hook harness: real component/event handlers,
// mocked actions and router, no browser or services and no private-state assertions.
function mount({ enabled = false, apple = false, google = false, appleReady = true, googleReady = false } = {}) {
  const slots = []; let cursor = 0, refreshes = 0;
  const payloads = [];
  let response = async () => ({ ok: true });
  const react = {
    useState(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial;
      return [slots[slot], (value) => { slots[slot] = typeof value === "function" ? value(slots[slot]) : value; }];
    },
    useRef(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = { current: initial };
      return slots[slot];
    },
  };
  const stubs = {
    react,
    "next/navigation": { useRouter: () => ({ refresh: () => refreshes++ }) },
    "next/link": { __esModule: true, default: "a" },
    "@/app/actions/loyalty-experience": {
      saveRastLoyaltySettingsAction: async (payload) => { payloads.push(structuredClone(payload)); return response(); },
      sendLoyaltyWalletAnnouncementAction: () => assert.fail("Unexpected announcement"),
    },
    "./rast-brand": { RastBrand: "rast-brand" },
    "./qr-code": { RastQrCode: "rast-qr-code" },
    "./rast-stamp-card": { RastStampCard: "rast-stamp-card" },
    "./rast-loyalty.module.css": { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) },
  };
  const exports = {};
  new Function("require", "exports", code)((name) => Object.hasOwn(stubs, name) ? stubs[name] : dependency(name), exports);
  const props = {
    initialDashboard: { program: {
      enabled, appleWalletEnabled: apple, googleWalletEnabled: google, purchasesRequired: 7,
      rewardName: "Merchant reward", terms: "Original terms", cardTitle: "Rast card", rewardProductId: null,
    } },
    initialExperience: { rewardKind: "custom", rewardValidityDays: 30, nearbyMessage: "Welcome", latitude: null, longitude: null },
    identity: { slug: "rast", name: "Rast", logoUrl: null },
    signupUrl: "https://example.test/loyalty/rast",
    walletAvailability: { apple: appleReady, google: googleReady },
  };
  const render = () => { cursor = 0; return exports.RastLoyaltyDashboard(props); };
  const nodes = (node) => Array.isArray(node) ? node.flatMap(nodes) : !node || typeof node !== "object" ? [] : [node, ...nodes(node.props?.children)];
  const text = (node) => Array.isArray(node) ? node.map(text).join("") : node == null || typeof node === "boolean" ? "" : typeof node === "object" ? text(node.props?.children) : String(node);
  const find = (predicate) => {
    const matches = nodes(render()).filter(predicate);
    assert.equal(matches.length, 1, "Expected one matching control/status"); return matches[0];
  };
  const input = (name) => find((node) => node.type === "input" && node.props.name === name);
  const status = () => text(find((node) => node.props["data-testid"] === "rast-saved-activation"));
  const settings = () => find((node) => node.type === "form" && nodes(node).some((child) => child.type === "input" && child.props.name === "enabled"));
  return {
    payloads, input, status,
    refreshes: () => refreshes,
    messages: () => nodes(render()).filter((node) => node.props.role === "status").map(text),
    alerts: () => nodes(render()).filter((node) => node.props.role === "alert").map(text),
    notificationDisabled: () => find((node) => node.type === "fieldset" && node.props.className === "notificationFields").props.disabled,
    change(name, checked) {
      const control = input(name); assert.equal(control.props.type, "checkbox");
      assert.ok(!control.props.disabled, `${name} must be enabled before user interaction`);
      control.props.onChange({ target: { checked } }); render();
    },
    save: () => settings().props.onSubmit({ preventDefault() {} }),
    respondWith: (handler) => { response = handler; },
  };
}

const originalFrame = globalThis.requestAnimationFrame;
globalThis.requestAnimationFrame = (callback) => { callback(); return 1; };
let passed = 0;
async function test(name, run) {
  try { await run(); passed++; } catch (error) { throw new Error(name, { cause: error }); }
}
try {
  await test("disabled defaults and readiness are visible", () => {
    const view = mount();
    for (const name of ["enabled", "appleWalletEnabled", "googleWalletEnabled"]) {
      assert.equal(view.input(name).props.type, "checkbox"); assert.equal(view.input(name).props.checked, false);
    }
    assert.ok(!view.input("enabled").props.disabled); assert.ok(!view.input("appleWalletEnabled").props.disabled);
    assert.equal(view.input("googleWalletEnabled").props.disabled, true);
    assert.match(view.status(), /التسجيل متوقف/); assert.equal(view.notificationDisabled(), true);
  });
  await test("ready controls change flags and preserve them in the save payload", async () => {
    const view = mount({ googleReady: true }); const paused = view.status();
    for (const name of ["enabled", "appleWalletEnabled", "googleWalletEnabled"]) view.change(name, true);
    assert.equal(view.status(), paused, "Draft edits must not claim registration is open");
    assert.equal(view.notificationDisabled(), true, "Unsaved wallet flags must not enable announcements");
    await view.save();
    assert.equal(view.payloads.length, 1);
    for (const name of ["enabled", "appleWalletEnabled", "googleWalletEnabled"]) assert.equal(view.payloads[0].program[name], true);
    assert.equal(view.payloads[0].program.rewardName, "Merchant reward");
    assert.equal(view.payloads[0].program.terms, "Original terms");
    assert.match(view.status(), /التسجيل مفتوح/); assert.equal(view.notificationDisabled(), false); assert.equal(view.refreshes(), 1);
    for (const name of ["enabled", "appleWalletEnabled", "googleWalletEnabled"]) view.change(name, false);
    await view.save();
    for (const name of ["enabled", "appleWalletEnabled", "googleWalletEnabled"]) assert.equal(view.payloads[1].program[name], false);
    assert.match(view.status(), /التسجيل متوقف/); assert.equal(view.notificationDisabled(), true);
  });
  await test("Apple can activate while Google stays unready", async () => {
    const view = mount(); view.change("enabled", true); view.change("appleWalletEnabled", true);
    await view.save();
    assert.equal(view.payloads[0].program.enabled, true); assert.equal(view.payloads[0].program.appleWalletEnabled, true);
    assert.equal(view.payloads[0].program.googleWalletEnabled, false); assert.equal(view.input("googleWalletEnabled").props.disabled, true);
  });
  await test("successful paused save explicitly remains paused", async () => {
    const view = mount(); await view.save();
    assert.match(view.status(), /التسجيل متوقف/);
    assert.ok(view.messages().some((message) => /تم حفظ الإعدادات/.test(message) && /التسجيل ما زال متوقف/.test(message)));
    assert.equal(view.payloads[0].program.enabled, false); assert.equal(view.refreshes(), 1);
  });
  for (const initialEnabled of [false, true]) {
    for (const failure of ["result", "exception"]) await test(`failed ${failure} preserves saved ${initialEnabled ? "active" : "paused"} status`, async () => {
      const view = mount({ enabled: initialEnabled, apple: initialEnabled }); const previous = view.status();
      view.change("enabled", !initialEnabled); view.change("appleWalletEnabled", !initialEnabled);
      view.respondWith(async () => { if (failure === "exception") throw new Error("Request interrupted"); return { ok: false, message: "Save rejected" }; });
      await view.save();
      assert.equal(view.status(), previous); assert.equal(view.refreshes(), 0); assert.equal(view.payloads.length, 1);
      assert.equal(view.notificationDisabled(), !initialEnabled, "Announcement state follows persisted flags after a failed save");
      assert.equal(view.alerts().length, 1);
      assert.equal(view.input("enabled").props.checked, !initialEnabled, "The failed draft stays editable");
    });
  }
  await test("an unavailable previously enabled provider can still be switched off", async () => {
    const view = mount({ enabled: true, google: true });
    assert.ok(!view.input("googleWalletEnabled").props.disabled);
    view.change("googleWalletEnabled", false); assert.equal(view.input("googleWalletEnabled").props.disabled, true);
    await view.save(); assert.equal(view.payloads[0].program.googleWalletEnabled, false);
  });
} finally {
  if (originalFrame === undefined) delete globalThis.requestAnimationFrame;
  else globalThis.requestAnimationFrame = originalFrame;
}
console.log(`PASS: ${passed} Rast activation UI scenarios (actual component handlers; mocked hooks/actions/router; no browser or backend).`);
