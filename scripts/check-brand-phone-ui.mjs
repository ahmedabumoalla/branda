import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transform } from "lightningcss";

const root = fileURLToPath(new URL("..", import.meta.url));
const dependency = createRequire(import.meta.url);
const file = "components/dashboard/pages/brand-phone-page.tsx";
const cssSource = fs.readFileSync(path.join(root, "components/dashboard/pages/brand-phone-page.module.css"), "utf8");
const css = transform({ filename: "brand-phone-page.module.css", code: Buffer.from(cssSource), cssModules: true });
function load(relative, stubs = {}) {
  const exports = {};
  const filename = path.isAbsolute(relative) ? relative : path.join(root, relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "exports", compiled)(name => {
    if (name in stubs) return stubs[name];
    if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (name.startsWith("@/") || name.startsWith(".")) {
      const base = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name);
      return load([`${base}.ts`, `${base}.tsx`].find(candidate => fs.existsSync(candidate)), stubs);
    }
    return dependency(name);
  }, exports);
  return exports;
}
function nodes(node, predicate = () => true) {
  if (node == null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(item => nodes(item, predicate));
  return [...(predicate(node) ? [node] : []), ...nodes(node.props?.action, predicate), ...nodes(node.props?.children, predicate)];
}
function text(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node !== "object") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return text(node.props?.children);
}
function button(tree, label) { const found = nodes(tree, node => node.type === "button" && text(node) === label)[0]; assert(found, `Missing button ${label}`); return found; }
function field(tree) { const found = nodes(tree, node => node.props?.id === "brand-whatsapp-phone")[0]; assert(found); return found; }
function form(tree) { const found = nodes(tree, node => node.type === "form")[0]; assert(found); return found; }
const flush = () => new Promise(resolve => setImmediate(resolve));
const base = { brandName: "لوكو", configured: true, transactionalEnabled: false, connection: null };
const pairing = { ...base, connection: { status: "pairing", phone: "966511111111", verifiedPhone: null, lastError: null } };
const connected = { ...pairing, transactionalEnabled: true, connection: { ...pairing.connection, status: "connected", verifiedPhone: "966511111111" } };
const png = "data:image/png;base64,aGVsbG8=";
const response = (dashboard, extra = {}) => ({ status: 200, ok: true, json: async () => ({ ok: true, data: { dashboard, ...extra } }) });
const requests = [];
const timers = new Map(), intervals = new Map();
let timerId = 0, now = 100000, handleRequest = async () => response(base);
const real = { fetch: globalThis.fetch, window: globalThis.window, document: globalThis.document, navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"), now: Date.now };
globalThis.window = { setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; }, clearTimeout(id) { timers.delete(id); }, setInterval(fn, delay) { intervals.set(++timerId, { fn, delay }); return timerId; }, clearInterval(id) { intervals.delete(id); }, addEventListener() {}, removeEventListener() {} };
globalThis.document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: true } });
Date.now = () => now;
globalThis.fetch = async (url, options) => {
  const request = { url, ...options, action: options.body ? JSON.parse(options.body) : null };
  requests.push(request);
  assert.equal(url, "/api/brand-whatsapp");
  if (request.action) assert(["connect", "refresh", "qr", "disconnect"].includes(request.action.action));
  return handleRequest(request);
};
function harness(initialDashboard = base) {
  const values = [], effects = [], cleanups = new Map(); let cursor = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const hooks = { ...React, useState(initial) { const slot = cursor++; if (!(slot in values)) values[slot] = initial; return [values[slot], next => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }]; }, useRef(initial) { const slot = cursor++; if (!(slot in values)) values[slot] = { current: initial }; return values[slot]; }, useCallback(fn, deps) { const slot = cursor++; if (!same(values[slot]?.deps, deps)) values[slot] = { fn, deps }; return values[slot].fn; }, useEffect(fn, deps) { const slot = cursor++; if (!same(values[slot], deps)) { values[slot] = deps; effects.push(() => { cleanups.get(slot)?.(); cleanups.set(slot, fn()); }); } } };
  const { BrandPhonePage } = load(file, { react: hooks, "@/components/ui/design-system": { DashboardPageShell: ({ title, subtitle, children }) => React.createElement("main", null, React.createElement("h1", null, title), React.createElement("p", null, subtitle), children) } });
  return { render() { cursor = 0; const tree = BrandPhonePage({ initialDashboard }); effects.splice(0).forEach(effect => effect()); return tree; }, unmount() { cleanups.forEach(cleanup => cleanup?.()); cleanups.clear(); } };
}
async function tick(ms = 5000) { now += ms; for (const timer of [...intervals.values()]) timer.fn(); await flush(); }
let checks = 0;
async function check(name, run) { await run(); checks++; assert.equal(intervals.size, 0, `Leaked interval after ${name}`); assert.equal(timers.size, 0, `Leaked timeout after ${name}`); console.log(`PASS ${name}`); }
try {
  await check("connection-only page explains linking and brand-primary-backup order", () => {
    const h = harness(); const markup = renderToStaticMarkup(h.render());
    for (const phrase of ["ربط رقم العلامة التجارية", "الإعدادات أو القائمة ثم الأجهزة المرتبطة", "اختر ربط جهاز وامسح الرمز", "رسائل الولاء من رقم لوكو فقط", "دون استخدام رقم المنصة"]) assert(markup.includes(phrase));
    assert.doesNotMatch(markup, /campaign-body|createCampaign|مراجعة الحملة|إرسال تجريبي|partnerToken|apiToken/);
    assert.equal(requests.length, 0, "Opening the page does not begin a connection or send anything"); h.unmount();
  });
  await check("invalid and multiple numbers never reach the API", async () => {
    const before = requests.length; const h = harness(); let tree = h.render();
    for (const phone of ["invalid", "+12025550123", "0511111111 0522222222"]) { field(tree).props.onChange({ target: { value: phone } }); tree = h.render(); await form(tree).props.onSubmit({ preventDefault() {} }); tree = h.render(); assert.match(text(tree), /رقم واتساب سعوديًا صحيحًا/); }
    assert.equal(requests.length, before); h.unmount();
  });
  await check("one connect click normalizes the phone and automatically obtains QR", async () => {
    const before = requests.length; handleRequest = async req => response(pairing, req.action.action === "qr" ? { qr: "aGVsbG8=", qrStatus: "qrCode" } : {});
    const h = harness(); let tree = h.render(); field(tree).props.onChange({ target: { value: "٠٥١١١١١١١١" } }); tree = h.render(); await form(tree).props.onSubmit({ preventDefault() {} }); await flush(); tree = h.render();
    assert.deepEqual(requests.slice(before).map(req => req.action), [{ action: "connect", phone: "966511111111" }, { action: "qr" }]);
    assert.equal(nodes(tree, node => node.type === "img")[0].props.src, png); assert.match(text(tree), /امسح الرمز من جوالك/); h.unmount();
  });
  await check("duplicate clicks cannot create parallel connection requests", async () => {
    let finish; const before = requests.length; handleRequest = () => new Promise(resolve => { finish = resolve; });
    const h = harness(); let tree = h.render(); field(tree).props.onChange({ target: { value: "0511111111" } }); tree = h.render();
    const submit = form(tree).props.onSubmit; void submit({ preventDefault() {} }); void submit({ preventDefault() {} });
    assert.equal(requests.length, before + 1); assert.equal(button(h.render(), "جارٍ تجهيز الاتصال").props.disabled, true);
    finish(response(connected)); await flush(); assert.match(text(h.render()), /رقم لوكو متصل وجاهز/); h.unmount();
  });
  await check("provisioning progresses to QR through bounded polling", async () => {
    handleRequest = async req => response(req.action.action === "connect" ? { ...pairing, connection: { ...pairing.connection, status: "provisioning" } } : pairing, req.action.action === "qr" ? { qr: png } : {});
    const h = harness(); let tree = h.render(); field(tree).props.onChange({ target: { value: "0511111111" } }); tree = h.render(); await form(tree).props.onSubmit({ preventDefault() {} }); h.render();
    await tick(); h.render(); await tick(); tree = h.render(); assert.equal(nodes(tree, node => node.type === "img")[0].props.src, png);
    const before = requests.filter(req => req.action?.action === "qr").length; await tick(5000); h.render(); assert.equal(requests.filter(req => req.action?.action === "qr").length, before);
    await tick(15000); h.render(); assert.equal(requests.filter(req => req.action?.action === "qr").length, before + 1); h.unmount();
  });
  await check("pairing does not claim scan readiness or request QR without explicit intent", async () => {
    const before = requests.length; handleRequest = async () => response(pairing);
    const h = harness(pairing); let tree = h.render(); assert.equal(text(nodes(tree, node => node.props?.className === "badge")[0]), "جاهز لطلب رمز الربط");
    await tick(15000); tree = h.render(); assert(requests.slice(before).every(req => req.action?.action === "refresh")); assert.equal(nodes(tree, node => node.type === "img").length, 0); h.unmount();
  });
  await check("waiting permits a manual QR retry that replaces a delayed quiet request", async () => {
    let qrRequests = 0, finishQuiet; const before = requests.length;
    handleRequest = req => {
      if (req.action.action !== "qr") return Promise.resolve(response(pairing));
      qrRequests++;
      if (qrRequests === 1) return Promise.resolve(response(pairing, { qrStatus: "timeout" }));
      if (qrRequests === 2) return new Promise(resolve => { finishQuiet = resolve; });
      return Promise.resolve(response(pairing, { qrStatus: "qrCode", qr: png }));
    };
    const h = harness(pairing); button(h.render(), "إظهار رمز الربط").props.onClick();
    let tree = h.render(); assert.equal(button(tree, "إعادة طلب الرمز").props.disabled, true, "A foreground request remains locked");
    button(tree, "إعادة طلب الرمز").props.onClick(); assert.equal(qrRequests, 1, "Repeated foreground click cannot submit in parallel");
    await flush(); tree = h.render(); assert.equal(button(tree, "إعادة طلب الرمز").props.disabled, false); assert.equal(text(nodes(tree, node => node.props?.className === "badge")[0]), "جارٍ تجهيز رمز الربط");
    await tick(); tree = h.render(); const quietSignal = requests.at(-1).signal; assert.equal(qrRequests, 2); assert.equal(button(tree, "إعادة طلب الرمز").props.disabled, false);
    button(tree, "إعادة طلب الرمز").props.onClick(); assert.equal(quietSignal.aborted, true); await flush(); tree = h.render();
    assert.equal(qrRequests, 3); assert.equal(nodes(tree, node => node.type === "img")[0].props.src, png); assert.equal(text(nodes(tree, node => node.props?.className === "badge")[0]), "بانتظار مسح الرمز");
    finishQuiet(response(pairing, { qr: "c3RhbGU=", qrStatus: "qrCode" })); await flush(); assert.equal(nodes(h.render(), node => node.type === "img")[0].props.src, png, "Cancelled quiet response cannot replace the new QR");
    assert(requests.slice(before).every(req => req.action.action === "qr")); h.unmount();
  });
  await check("delayed QR is rejected at five minutes even before the next polling tick", async () => {
    let finish; handleRequest = () => new Promise(resolve => { finish = resolve; });
    const h = harness(pairing); button(h.render(), "إظهار رمز الربط").props.onClick(); now += 300000;
    finish(response(pairing, { qr: png, qrStatus: "qrCode" })); await flush(); let tree = h.render();
    assert.equal(nodes(tree, node => node.type === "img").length, 0); assert.match(text(tree), /انتهت مهلة الربط/); assert.equal(button(tree, "إظهار رمز الربط").props.disabled, false); assert.equal(text(nodes(tree, node => node.props?.className === "badge")[0]), "جاهز لطلب رمز الربط");
    const before = requests.length; handleRequest = async () => response(pairing); await tick(10000); h.render(); assert(requests.slice(before).every(req => req.action.action === "refresh"), "Expired intent never restarts QR polling");
    handleRequest = async () => response(pairing, { qr: png, qrStatus: "qrCode" }); button(h.render(), "إظهار رمز الربط").props.onClick(); await flush(); tree = h.render(); assert.equal(nodes(tree, node => node.type === "img")[0].props.src, png); h.unmount();
  });
  await check("unsafe QR sources never render and five-minute intent expires", async () => {
    for (const qr of ["https://host.invalid/qr", "data:image/svg+xml;base64,abcd", "a".repeat(300001)]) {
      handleRequest = async () => response(pairing, { qr }); const h = harness(pairing); button(h.render(), "إظهار رمز الربط").props.onClick(); await flush(); assert.equal(nodes(h.render(), node => node.type === "img").length, 0); h.unmount();
    }
    handleRequest = async () => response(pairing, { qr: png }); const h = harness(pairing); button(h.render(), "إظهار رمز الربط").props.onClick(); await flush(); h.render();
    await tick(300000); const tree = h.render(); assert.equal(nodes(tree, node => node.type === "img").length, 0); assert.match(text(tree), /انتهت مهلة الربط/); assert.equal(button(tree, "إظهار رمز الربط").props.disabled, false); h.unmount();
  });
  await check("provider QR outcomes explain recovery without leaking provider details", async () => {
    for (const [qrStatus, phrase] of [["passkeyRequired", /التأكيد الإضافي/], ["error", /أعد طلبه بعد قليل/], ["alreadyLogged", /جارٍ التحقق من رقم العلامة/]]) {
      handleRequest = async () => response(pairing, { qrStatus }); const h = harness(pairing); button(h.render(), "إظهار رمز الربط").props.onClick(); await flush(); const tree = h.render(); assert.match(text(tree), phrase); assert.equal(nodes(tree, node => node.type === "img").length, 0); h.unmount();
    }
  });
  await check("existing verified campaign connection is activated without another QR", async () => {
    handleRequest = async () => response(connected); const before = requests.length;
    const h = harness({ ...connected, transactionalEnabled: false }); let tree = h.render(); assert.match(text(tree), /متصل ويحتاج تفعيل الخدمة/); button(tree, "تفعيل الرقم لرسائل العملاء").props.onClick(); await flush(); tree = h.render();
    assert.deepEqual(requests.slice(before).map(req => req.action), [{ action: "connect", phone: "966511111111" }]); assert.match(text(tree), /رقم لوكو متصل وجاهز/); h.unmount();
  });
  await check("disconnect requires explicit review and describes scheduled-message impact", async () => {
    const before = requests.length; handleRequest = async () => response(base); const h = harness(connected); let tree = h.render();
    button(tree, "فصل الرقم أو تغييره").props.onClick(); tree = h.render(); assert.match(text(tree), /تتوقف الرسائل المجدولة/); assert.match(text(tree), /تنتظر رسائل الولاء إعادة ربطه/); assert.match(text(tree), /رموز التحقق عبر أرقام برندة/); assert.equal(requests.length, before);
    button(tree, "الاحتفاظ بالاتصال").props.onClick(); assert.equal(nodes(h.render(), node => node.props?.id === "disconnect-title").length, 0);
    button(h.render(), "فصل الرقم أو تغييره").props.onClick(); button(h.render(), "تأكيد فصل الرقم").props.onClick(); await flush(); tree = h.render(); assert.equal(requests.at(-1).action.action, "disconnect"); assert(field(tree)); assert.match(text(tree), /تم طلب فصل الرقم/); h.unmount();
  });
  await check("authorization loss hides QR and private connection data and stops polling", async () => {
    handleRequest = async () => response(pairing, { qr: png }); const h = harness(pairing); button(h.render(), "إظهار رمز الربط").props.onClick(); await flush(); h.render();
    handleRequest = async () => ({ status: 403, ok: false, json: async () => ({ ok: false, message: "secret provider token" }) }); button(h.render(), "تحديث الحالة").props.onClick(); await flush(); let tree = h.render(); assert.equal(nodes(tree, node => node.type === "img").length, 0); assert.doesNotMatch(text(tree), /966511111111|secret provider token/); assert.match(text(tree), /صلاحية الحساب/);
    const before = requests.length; await tick(30000); assert.equal(requests.length, before); handleRequest = async () => response(base); button(tree, "إعادة المحاولة").props.onClick(); await flush(); tree = h.render(); assert(field(tree)); h.unmount();
  });
  await check("initial load failure can recover with a read-only request", async () => {
    handleRequest = async () => response(base); const h = harness(null); button(h.render(), "إعادة المحاولة").props.onClick(); await flush(); assert.equal(requests.at(-1).method, "GET"); assert.equal(requests.at(-1).body, undefined); assert(field(h.render())); h.unmount();
  });
  await check("network failure is generic and preserves the entered number", async () => {
    handleRequest = async () => { throw new Error("provider token private"); }; const h = harness(); let tree = h.render(); field(tree).props.onChange({ target: { value: "0511111111" } }); tree = h.render(); await form(tree).props.onSubmit({ preventDefault() {} }); tree = h.render(); assert.match(text(tree), /تحقق من الاتصال/); assert.doesNotMatch(text(tree), /provider token/); assert.equal(field(tree).props.value, "0511111111"); assert.equal(button(tree, "ربط الرقم").props.disabled, false); h.unmount();
  });
  await check("request timeout releases controls and clears the aborted attempt", async () => {
    handleRequest = req => new Promise((_resolve, reject) => { req.signal.addEventListener("abort", () => reject(new Error("aborted"))); });
    const h = harness(); let tree = h.render(); field(tree).props.onChange({ target: { value: "0511111111" } }); tree = h.render(); void form(tree).props.onSubmit({ preventDefault() {} });
    assert.equal(button(h.render(), "جارٍ تجهيز الاتصال").props.disabled, true); const timeout = [...timers.values()].find(timer => timer.delay === 45000); assert(timeout); timeout.fn(); await flush(); tree = h.render(); assert.match(text(tree), /استغرق الطلب وقتًا طويلًا/); assert.equal(button(tree, "ربط الرقم").props.disabled, false); assert.equal(requests.at(-1).signal.aborted, true); h.unmount();
  });
  await check("foreground refresh replaces an older polling response without stale state", async () => {
    const completions = []; handleRequest = req => new Promise(resolve => { completions.push({ req, resolve }); });
    const h = harness(pairing); h.render(); await tick(); assert.equal(completions.length, 1);
    button(h.render(), "تحديث الحالة").props.onClick(); assert.equal(completions.length, 2); assert.equal(completions[0].req.signal.aborted, true);
    completions[1].resolve(response({ ...pairing, connection: { ...pairing.connection, status: "mismatch" } })); await flush(); assert.match(text(h.render()), /الرقم المرتبط مختلف/);
    completions[0].resolve(response(connected)); await flush(); const tree = h.render(); assert.match(text(tree), /الرقم المرتبط مختلف/); assert.doesNotMatch(text(tree), /رقم لوكو متصل وجاهز/); h.unmount();
  });
  await check("background and offline tabs do not poll and unmount aborts stale work", async () => {
    handleRequest = async () => response(pairing); const h = harness(pairing); h.render(); const before = requests.length;
    document.visibilityState = "hidden"; await tick(30000); assert.equal(requests.length, before); document.visibilityState = "visible"; navigator.onLine = false; await tick(30000); assert.equal(requests.length, before); navigator.onLine = true;
    let finish; handleRequest = () => new Promise(resolve => { finish = resolve; }); button(h.render(), "تحديث الحالة").props.onClick(); const signal = requests.at(-1).signal; h.unmount(); assert.equal(signal.aborted, true); finish(response(connected)); await flush();
  });
  await check("configuration and unverified status never claim readiness", () => {
    const h = harness({ ...base, configured: false }); let tree = h.render(); assert.equal(button(tree, "ربط الرقم").props.disabled, true); assert.match(text(tree), /غير جاهزة/); assert.equal(intervals.size, 0); h.unmount();
    const other = harness({ ...connected, connection: { ...connected.connection, verifiedPhone: null } }); tree = other.render(); assert.match(text(tree), /جارٍ التحقق من الرقم/); assert.doesNotMatch(text(tree), /رقم لوكو متصل وجاهز/); other.unmount();
  });
  await check("all connection states have honest labels and mismatch recovery", () => {
    for (const [status, phrase] of [["disconnected", "غير متصل"], ["provisioning", "جارٍ تجهيز الاتصال"], ["pairing", "جاهز لطلب رمز الربط"], ["mismatch", "الرقم المرتبط مختلف"], ["uncertain", "جارٍ التحقق من الاتصال"], ["error", "تعذر الاتصال"], ["disconnecting", "جارٍ فصل الرقم"]]) { const h = harness({ ...pairing, connection: { ...pairing.connection, status } }); const tree = h.render(); assert(text(tree).includes(phrase)); if (status === "mismatch") assert.match(text(tree), /افصل الاتصال ثم اربط رقم لوكو الصحيح/); h.unmount(); }
  });
  await check("server route rejects other stable brand IDs before reading connection data", async () => {
    let cafe = null, reads = 0, fail403 = false;
    class BrandWhatsAppError extends Error { constructor() { super("forbidden"); this.status = 403; } }
    const { default: Route } = load("app/dashboard/brand-phone/page.tsx", { "next/navigation": { notFound() { throw new Error("NOT_FOUND"); } }, "@/components/dashboard/pages/brand-phone-page": { BrandPhonePage: () => null }, "@/lib/data/cafes": { getOwnerCafeContext: async () => cafe }, "@/lib/data/brand-whatsapp": { BrandWhatsAppError, getBrandWhatsAppDashboard: async () => { reads++; if (fail403) throw new BrandWhatsAppError(); return base; } } });
    await assert.rejects(Route(), /NOT_FOUND/); cafe = { id: "other", slug: "brand-9a8c97305195" }; await assert.rejects(Route(), /NOT_FOUND/); assert.equal(reads, 0);
    cafe = { id: "321fd305-1883-48df-ab69-829cf7d1bc48" }; const result = await Route(); assert.equal(result.props.initialDashboard, base); fail403 = true; await assert.rejects(Route(), /NOT_FOUND/);
  });
  await check("sidebar exposes the route only for LOCO and preserves collapsed/mobile behavior", () => {
    let pathname = "/dashboard/brand-phone", navigations = 0;
    const blank = () => null;
    const { DashboardSidebar } = load("components/dashboard/DashboardSidebar.tsx", { "./dashboard-navigation-link": { DashboardNavigationLink: "a" }, "./finance-sidebar-menu": { FinanceSidebarMenu: blank }, "next/navigation": { usePathname: () => pathname, useRouter: () => ({ push() {} }) }, "@/components/dashboard/subscription-countdown": { SubscriptionCountdown: blank }, "@/components/cafe/cafe-logo": { CafeLogo: blank }, "@/components/dashboard/notifications-panel": { NotificationsPanel: blank }, "@/components/ui/barndaksa-logo": { BarndaksaLogo: blank }, "@/lib/cafe/use-resolved-cafe-logo": { useResolvedCafeLogoUrl: () => null }, "@/lib/platform/auth": { logoutBarndaksaAuth: async () => {} }, "@/lib/platform/feature-access": { getSidebarFeaturesForBrand: () => [] } });
    const snapshot = { settings: { cafeSlug: "brand-9a8c97305195", cafeName: "لوكو", businessCategory: "restaurants" }, notifications: [], plans: [], featureOverrides: [], planId: "loyalty" };
    for (const props of [{}, { snapshot: { ...snapshot, settings: { ...snapshot.settings, cafeSlug: "another-brand" } }, servicesAvailable: true }, { snapshot, servicesAvailable: false }]) assert.equal(nodes(DashboardSidebar(props), node => node.props?.href === "/dashboard/brand-phone").length, 0);
    for (const collapsed of [false, true]) { const link = nodes(DashboardSidebar({ snapshot, servicesAvailable: true, collapsed, onNavigate: () => navigations++ }), node => node.props?.href === "/dashboard/brand-phone")[0]; assert(link); assert.equal(link.props["aria-current"], "page"); assert.equal(link.props["aria-label"], "ربط رقم العلامة التجارية"); assert.match(link.props.className, /min-h-11/); if (collapsed) assert.equal(link.props.title, "ربط رقم العلامة التجارية"); link.props.onClick(); }
    assert.equal(navigations, 2); pathname = "/dashboard"; assert.equal(nodes(DashboardSidebar({ snapshot, servicesAvailable: true }), node => node.props?.href === "/dashboard/brand-phone")[0].props["aria-current"], undefined);
  });
  await check("styles resolve and preserve readable mobile QR keyboard focus and touch targets", () => {
    for (const [, name] of fs.readFileSync(path.join(root, file), "utf8").matchAll(/styles\.(\w+)/g)) assert(css.exports[name], `Missing CSS ${name}`);
    assert.match(cssSource, /min-height:46px/); assert.match(cssSource, /:focus-visible/); assert.match(cssSource, /@media\(max-width:780px\).*grid-template-columns:minmax\(0,1fr\)/); assert.match(cssSource, /\.qr\{[^}]+max-width:100%;height:auto/); assert.doesNotMatch(cssSource, /animation:/);
  });
  console.log(`PASS ${checks} brand phone UI groups; mocked requests only`);
} finally {
  globalThis.fetch = real.fetch; globalThis.window = real.window; globalThis.document = real.document;
  if (real.navigator) Object.defineProperty(globalThis, "navigator", real.navigator); else delete globalThis.navigator;
  Date.now = real.now;
}
