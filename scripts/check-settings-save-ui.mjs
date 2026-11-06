import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";

const root = fileURLToPath(new URL("..", import.meta.url));
const dependency = createRequire(import.meta.url);
function load(relative, stubs) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "exports", code)(name => {
    if (name in stubs) return stubs[name];
    return dependency(name);
  }, exports);
  return exports;
}
function nodes(node, predicate) {
  if (node == null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(value => nodes(value, predicate));
  return [...(predicate(node) ? [node] : []), ...nodes(node.props?.action, predicate), ...nodes(node.props?.children, predicate)];
}
function text(node) { if (node == null || typeof node === "boolean") return ""; if (typeof node !== "object") return String(node); if (Array.isArray(node)) return node.map(text).join(""); return text(node.props?.children); }
function saveButton(tree) { const button = nodes(tree, node => node.props?.onClick && ["حفظ الإعدادات", "جاري الحفظ"].includes(text(node)))[0]; assert(button); return button; }
function nameField(tree) { const field = nodes(tree, node => node.props?.label === "اسم العلامة" && node.props?.onChange)[0]; assert(field); return field; }
const initial = { cafeSlug: "brand-8ad185ee82e3", cafeName: "ضباب", businessCategory: "cafes_coffee", ownerName: "المالك", ownerEmail: "", ownerPhone: "", description: "", logoDataUrl: "https://example.test/old-logo.webp" };
const events = [], toasts = [], submitted = [];
let clears = 0, action = async settings => ({ ...settings, cafeName: settings.cafeName.trim() });
let upload = async () => { throw new Error("Unexpected upload"); };
let optimize = async () => { throw new Error("Unexpected image edit"); };
const revoked = [];
function harness() {
  const values = [], pendingEffects = []; let cursor = 0;
  const hooks = { ...React, useState(value) { const slot = cursor++; if (!(slot in values)) values[slot] = value; return [values[slot], next => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }]; }, useRef(value) { const slot = cursor++; if (!(slot in values)) values[slot] = { current: value }; return values[slot]; }, useEffect(fn, deps) { const slot = cursor++; if (!values[slot] || deps.some((value, i) => value !== values[slot][i])) { values[slot] = deps; pendingEffects.push(fn); } } };
  const pass = ({ children }) => children;
  const { SettingsPageClient } = load("components/dashboard/pages/settings-page.tsx", {
    react: hooks,
    "@/components/cafe/cafe-logo": { CafeLogo: () => null },
    "@/app/actions/auth": { changeOwnerPasswordAction: async () => ({ ok: true }) },
    "@/app/actions/settings": { saveSettingsAction: settings => { submitted.push(settings); return action(settings); } },
    "@/app/actions/upload": { uploadImageAction: (...args) => upload(...args) },
    "@/lib/cafe/image-asset-pipeline": { ImagePipelineError: Error, optimizeImageForStorage: (...args) => optimize(...args) },
    "@/lib/cafe/local-asset-store": { deleteLocalAsset: async () => {}, FIXED_ASSET_IDS: {}, revokeObjectUrl: value => { if (value) revoked.push(value); } },
    "@/components/ui/app-toast": { AppToast: () => null, useAppToast: () => ({ toast: null, showToast: value => toasts.push(value), setToast: value => toasts.push(value) }) },
    "@/lib/cafe/use-resolved-cafe-logo": { useResolvedCafeLogoUrl: () => undefined },
    "@/components/ui/design-system": Object.fromEntries(["BentoCard", "BentoGrid", "DashboardPageShell", "NeumoInput", "NeumoTextarea", "PrimaryButton", "SoftCard", "StatPill"].map(name => [name, pass])),
    "@/lib/platform/business-copy": { getBusinessCopy: () => ({ casualNoun: "العلامة" }) },
    "@/lib/performance/dashboard-shell-client": { clearDashboardShellSnapshot: () => clears++ },
  });
  return { render() { cursor = 0; const tree = SettingsPageClient({ initialSettings: initial }); pendingEffects.splice(0).forEach(effect => effect()); return tree; } };
}
const old = { window: globalThis.window, sessionStorage: globalThis.sessionStorage };
const storage = new Map(), redirects = [];
globalThis.window = { dispatchEvent(event) { events.push(event.type); return true; }, location: { replace: value => redirects.push(value) } };
globalThis.sessionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
let count = 0;
async function check(name, run) { await run(); count++; console.log(`PASS ${name}`); }
try {
  await check("save waits for the server before success or shell invalidation", async () => {
    let finish; action = () => new Promise(resolve => { finish = resolve; }); const h = harness(); let tree = h.render();
    nameField(tree).props.onChange("  بار ضباب  "); tree = h.render(); const saving = saveButton(tree).props.onClick();
    assert.equal(submitted.at(-1).cafeName, "  بار ضباب  "); assert.equal(submitted.at(-1).logoDataUrl, undefined); assert.equal(clears, 0); assert.equal(events.length, 0); assert.equal(toasts.filter(toast => toast.type === "success").length, 0); assert.equal(saveButton(h.render()).props.disabled, true);
    const saved = { ...initial, cafeName: "بار ضباب", logoDataUrl: "https://example.test/fresh-logo.webp" }; finish(saved); await saving; tree = h.render();
    assert.equal(nameField(tree).props.value, "بار ضباب", "Canonical response wins over the unnormalized local draft"); assert.equal(clears, 1); assert.deepEqual(events, ["barndaksa:settings-updated"]); assert.equal(toasts.at(-1).type, "success"); assert.equal(saveButton(tree).props.disabled, false);
  });
  await check("failed persistence keeps the draft and never claims a successful save", async () => {
    const before = { clears, events: events.length, success: toasts.filter(toast => toast.type === "success").length };
    action = async () => { throw new Error("تعذر حفظ اسم العلامة"); }; const h = harness(); let tree = h.render(); nameField(tree).props.onChange("بار ضباب"); tree = h.render(); await saveButton(tree).props.onClick(); tree = h.render();
    assert.equal(nameField(tree).props.value, "بار ضباب"); assert.equal(toasts.at(-1).type, "error"); assert.equal(toasts.at(-1).message, "تعذر حفظ اسم العلامة"); assert.equal(clears, before.clears); assert.equal(events.length, before.events); assert.equal(toasts.filter(toast => toast.type === "success").length, before.success); assert.equal(saveButton(tree).props.disabled, false);
  });
  await check("settings success uses persisted readback instead of echoing submitted data", async () => {
    action = async () => ({ ...initial, cafeName: "الاسم المحفوظ فعليًا" }); const h = harness(); let tree = h.render(); nameField(tree).props.onChange("مسودة محلية"); tree = h.render(); await saveButton(tree).props.onClick();
    assert.equal(nameField(h.render()).props.value, "الاسم المحفوظ فعليًا");
  });
  await check("failed settings save retains the selected logo for an explicit retry", async () => {
    const logo = new Blob(["test-image"], { type: "image/webp" }); let uploads = 0;
    optimize = async () => ({ blob: logo }); upload = async () => { uploads++; return { storagePath: "brand/logo-new.webp" }; };
    action = async () => { throw new Error("تعذر حفظ الإعدادات"); }; const h = harness(); let tree = h.render();
    await nodes(tree, node => node.props?.type === "file")[0].props.onChange({ target: { files: [new File(["test-image"], "logo.png", { type: "image/png" })], value: "logo.png" } }); tree = h.render();
    const preview = nodes(tree, node => node.type === "img")[0].props.src; assert(preview.startsWith("blob:")); const beforeRevoked = revoked.length;
    await saveButton(tree).props.onClick(); tree = h.render(); assert.equal(nodes(tree, node => node.type === "img")[0]?.props.src, preview); assert.equal(revoked.length, beforeRevoked); assert.equal(toasts.at(-1).type, "error");
    action = async settings => ({ ...settings, logoDataUrl: "https://example.test/saved.webp" }); await saveButton(tree).props.onClick(); tree = h.render();
    assert.equal(submitted.at(-1).logoAssetId, "brand/logo-new.webp"); assert.equal(uploads, 2); assert.equal(toasts.at(-1).type, "success"); assert(revoked.includes(preview)); assert(!nodes(tree, node => node.type === "img").some(node => node.props.src === preview));
    URL.revokeObjectURL(preview);
  });
  await check("old shell read cannot repopulate storage or clear a newer pending request", async () => {
    storage.clear(); const requests = [];
    const cache = load("lib/performance/dashboard-shell-client.ts", { "@/app/actions/dashboard-shell": { fetchOwnerDashboardShellAction: () => new Promise(resolve => requests.push(resolve)) } });
    const stale = cache.getCachedDashboardShellSnapshot(); assert.equal(cache.getCachedDashboardShellSnapshot(), stale);
    cache.clearDashboardShellSnapshot(); const fresh = cache.getCachedDashboardShellSnapshot(); assert.notEqual(fresh, stale); assert.equal(requests.length, 2);
    requests[0]({ settings: initial, serviceSubscriptions: [] }); await stale;
    assert.equal(storage.size, 0); assert.equal(cache.getCachedDashboardShellSnapshot(), fresh); assert.equal(requests.length, 2);
    const saved = { settings: { ...initial, cafeName: "بار ضباب" }, serviceSubscriptions: [] }; requests[1](saved); await fresh;
    assert.equal((await cache.getCachedDashboardShellSnapshot()).settings.cafeName, "بار ضباب"); assert.equal(JSON.parse([...storage.values()][0]).value.settings.cafeName, "بار ضباب");
  });
  await check("a late stale response cannot overwrite an already cached new name", async () => {
    storage.clear(); const requests = [];
    const cache = load("lib/performance/dashboard-shell-client.ts", { "@/app/actions/dashboard-shell": { fetchOwnerDashboardShellAction: () => new Promise(resolve => requests.push(resolve)) } });
    const stale = cache.getCachedDashboardShellSnapshot(); cache.clearDashboardShellSnapshot(); const fresh = cache.getCachedDashboardShellSnapshot();
    requests[1]({ settings: { ...initial, cafeName: "بار ضباب" }, serviceSubscriptions: [] }); await fresh; requests[0]({ settings: initial, serviceSubscriptions: [] }); await stale;
    assert.equal((await cache.getCachedDashboardShellSnapshot()).settings.cafeName, "بار ضباب");
  });
  await check("invalidated unauthenticated reads cannot redirect a newer signed-in context", async () => {
    storage.clear(); const requests = [], before = redirects.length;
    const cache = load("lib/performance/dashboard-shell-client.ts", { "@/app/actions/dashboard-shell": { fetchOwnerDashboardShellAction: () => new Promise(resolve => requests.push(resolve)) } });
    const stale = cache.getCachedDashboardShellSnapshot(); cache.clearDashboardShellSnapshot(); const fresh = cache.getCachedDashboardShellSnapshot(); requests[0]({ unauthenticated: true, serviceSubscriptions: [] }); await stale; assert.equal(redirects.length, before);
    requests[1]({ settings: initial, serviceSubscriptions: [] }); await fresh;
    cache.clearDashboardShellSnapshot(); const active = cache.getCachedDashboardShellSnapshot(); requests[2]({ unauthenticated: true, serviceSubscriptions: [] }); await active; assert.equal(redirects.length, before + 1); assert.equal(redirects.at(-1), "/login");
  });
  await check("actual dashboard layout ignores an old read after the committed-settings event", async () => {
    const previousWindow = globalThis.window, listeners = new Map(), requests = [], cleanups = [], pending = [], values = []; let cursor = 0, invalidations = 0;
    const hooks = { ...React, useState(initialValue) { const slot = cursor++; if (!(slot in values)) values[slot] = initialValue; return [values[slot], next => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }]; }, useEffect(fn, deps) { const slot = cursor++; if (!values[slot] || deps.some((value, i) => value !== values[slot][i])) { values[slot] = deps; pending.push(() => { cleanups[slot]?.(); cleanups[slot] = fn(); }); } }, useMemo: fn => fn(), useTransition: () => [false, fn => fn()] };
    globalThis.window = { ...previousWindow, addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name) { listeners.delete(name); }, dispatchEvent(event) { listeners.get(event.type)?.(); return true; } };
    try {
      const noop = () => null;
      const { DashboardAppLayout } = load("components/dashboard/dashboard-app-layout.tsx", {
        react: hooks,
        "next/navigation": { usePathname: () => "/dashboard/settings", useRouter: () => ({ refresh() {} }) },
        "@/app/actions/maintenance": { exitMaintenanceModeAction: async () => {} },
        "@/components/dashboard/DashboardSidebar": { DashboardSidebar: noop },
        "@/components/dashboard/feature-blocked-state": { DashboardFeatureBlockedState: noop },
        "@/components/dashboard/subscription-expired-state": { SubscriptionExpiredState: noop },
        "@/components/ui/responsive-app-shell": { ResponsiveAppShell: noop },
        "@/lib/performance/dashboard-shell-client": { clearDashboardShellSnapshot: () => invalidations++, getCachedDashboardShellSnapshot: () => new Promise(resolve => requests.push(resolve)) },
        "@/lib/platform/admin-data": { dashboardPlatformFeatures: [] },
        "@/lib/platform/permissions": { cafeHasFeature: () => true },
        "@/lib/platform/service-subscriptions": { getServiceSubscriptionAccess: () => ({ planId: "active", features: [], nextChangeAt: null, subscription: null }) },
      });
      const render = () => { cursor = 0; const tree = DashboardAppLayout({ children: null }); pending.splice(0).forEach(fn => fn()); return tree; };
      render(); assert.equal(requests.length, 1); assert(listeners.has("barndaksa:settings-updated"));
      window.dispatchEvent(new Event("barndaksa:settings-updated")); assert.equal(invalidations, 1); assert.equal(requests.length, 2);
      requests[1]({ settings: { ...initial, cafeName: "بار ضباب" }, plans: [], serviceSubscriptions: [], featureOverrides: [] }); await new Promise(resolve => setImmediate(resolve));
      assert.equal(render().props.sidebar(() => {}).props.snapshot.settings.cafeName, "بار ضباب");
      requests[0]({ settings: initial, plans: [], serviceSubscriptions: [], featureOverrides: [] }); await new Promise(resolve => setImmediate(resolve));
      assert.equal(render().props.sidebar(() => {}).props.snapshot.settings.cafeName, "بار ضباب", "Previous request cannot roll the sidebar back");
    } finally { cleanups.forEach(cleanup => cleanup?.()); assert(!listeners.has("barndaksa:settings-updated")); globalThis.window = previousWindow; }
  });
  console.log(`PASS ${count} settings UI and stale-cache regression groups`);
} finally { globalThis.window = old.window; globalThis.sessionStorage = old.sessionStorage; }
