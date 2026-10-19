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
const folder = path.join(root, "components/marketing-campaigns");
const css = transform({ filename: "campaigns.module.css", code: fs.readFileSync(path.join(folder, "campaigns.module.css")), cssModules: true });
const source = fs.readFileSync(path.join(folder, "campaign-console.tsx"), "utf8");
for (const [, name] of source.matchAll(/styles\.(\w+)/g)) assert(css.exports[name], `Missing CSS ${name}`);
function load(file, stubs = {}) {
  const exports = {};
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "exports", output)((name) => {
    if (name in stubs) return stubs[name];
    if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (name.startsWith(".")) return load(path.resolve(path.dirname(file), `${name}.ts`), stubs);
    return dependency(name);
  }, exports);
  return exports;
}
const helpers = load(path.join(folder, "campaign-form.ts"));
const checks = [];
async function check(name, run) { await run(); checks.push(name); console.log(`PASS ${name}`); }
const audience = [{ id: "customer:11111111-1111-4111-8111-111111111111", name: "عميل أول", phone: "966511111111", suppressed: false, source: "both" }, { id: "loyalty:22222222-2222-4222-8222-222222222222", name: "عميل ولاء", phone: "966522222222", suppressed: false, source: "loyalty" }, { id: "customer:33333333-3333-4333-8333-333333333333", name: "عميل موقوف", phone: "966533333333", suppressed: true, source: "customer" }];
const base = { brandName: "علامة الاختبار", eligible: true, configured: true, optOutCount: 1, connection: null, campaigns: [], audience };
const connected = { ...base, connection: { status: "connected", phone: "966511111111", verifiedPhone: "966511111111", lastError: null } };
function harness(initial = base) {
  const values = [], effects = [], cleanups = new Map(); let cursor = 0;
  const same = (left, right) => left && right && left.length === right.length && left.every((value, i) => Object.is(value, right[i]));
  const hooks = { ...React, useState(initialValue) { const slot = cursor++; if (!(slot in values)) values[slot] = initialValue; return [values[slot], value => { values[slot] = typeof value === "function" ? value(values[slot]) : value; }]; }, useRef(initialValue) { const slot = cursor++; if (!(slot in values)) values[slot] = { current: initialValue }; return values[slot]; }, useCallback(fn, deps) { const slot = cursor++; if (!same(values[slot]?.deps, deps)) values[slot] = { fn, deps }; return values[slot].fn; }, useEffect(fn, deps) { const slot = cursor++; if (!same(values[slot], deps)) { values[slot] = deps; effects.push(() => { cleanups.get(slot)?.(); const cleanup = fn(); cleanups.set(slot, cleanup); return cleanup; }); } } };
  const { CampaignConsole } = load(path.join(folder, "campaign-console.tsx"), { react: hooks, "@/components/ui/design-system": { DashboardPageShell: ({ title, action, children }) => React.createElement("main", null, React.createElement("h1", null, title), action, children) }, "@/components/dashboard/feature-blocked-state": { DashboardFeatureBlockedState: () => React.createElement("div", null, "FEATURE_BLOCKED") } });
  return { effects, flushEffects() { effects.splice(0).forEach(effect => effect()); }, unmount() { cleanups.forEach(cleanup => cleanup?.()); cleanups.clear(); }, render() { cursor = 0; effects.length = 0; return CampaignConsole({ initialDashboard: initial }); } };
}
function all(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(item => all(item, predicate));
  return [...(predicate(node) ? [node] : []), ...all(node.props?.action, predicate), ...all(node.props?.children, predicate)];
}
function text(node) { if (node == null || typeof node === "boolean") return ""; if (typeof node !== "object") return String(node); if (Array.isArray(node)) return node.map(text).join(""); return text(node.props?.children); }
function button(tree, label) { const found = all(tree, n => n.type === "button" && text(n) === label)[0]; assert(found, `Button ${label}`); return found; }
function field(tree, id) { const found = all(tree, n => n.props?.id === id)[0]; assert(found, `Field ${id}`); return found; }
function formFor(tree, id) { return all(tree, n => n.type === "form" && all(n.props.children, child => child.props?.id === id).length > 0)[0]; }
const requests = [];
const realFetch = globalThis.fetch;
const realWindow = globalThis.window;
globalThis.window = { setTimeout, clearTimeout };
globalThis.fetch = async (url, options) => { requests.push({ url, ...options, json: options.body ? JSON.parse(options.body) : null }); return { ok: true, json: async () => ({ ok: true, data: { dashboard: connected } }) }; };
try {
  await check("Saudi recipient normalization and deduplication", () => {
    assert.deepEqual(helpers.parseCampaignRecipients("+966511111111\n00966511111111،٩٦٦٥٢٢٢٢٢٢٢٢"), { phones: ["966511111111", "966522222222"], invalid: [], duplicates: 1 });
    assert.deepEqual(helpers.parseCampaignRecipients("0511111111 511111111").phones, ["966511111111"]);
    assert.equal(helpers.parseCampaignRecipients("+12025550123").invalid.length, 1);
    assert.equal(helpers.parseCampaignRecipients("bad.example").invalid.length, 1);
  });
  await check("consent and future schedule are required before review", () => {
    const draft = { title: "حملة", body: "رسالة", customerIds: [audience[0].id], consent: false, scheduledAt: "" };
    assert.match(helpers.campaignDraftError(draft), /موافقة/);
    assert.match(helpers.campaignDraftError({ ...draft, consent: true, scheduledAt: "2020-01-01T10:00" }), /لاحقًا/);
    assert.equal(helpers.campaignDraftError({ ...draft, consent: true }), null);
  });
  await check("QR accepts only bounded inline PNG payloads", () => {
    assert.equal(helpers.campaignQrSource("aGVsbG8="), "data:image/png;base64,aGVsbG8=");
    assert.equal(helpers.campaignQrSource("https://evil.example/qr"), null);
    assert.equal(helpers.campaignQrSource("data:image/svg+xml;base64,abcd"), null);
    assert.equal(helpers.campaignQrSource("a".repeat(300001)), null);
  });
  await check("blocked entitlement never renders sender or composer", () => {
    const markup = renderToStaticMarkup(harness({ ...base, eligible: false }).render());
    assert.match(markup, /FEATURE_BLOCKED/); assert.doesNotMatch(markup, /sender-phone|campaign-body/);
  });
  await check("configuration and offline connection disable launch honestly", () => {
    for (const data of [base, { ...connected, configured: false }, { ...connected, connection: { ...connected.connection, status: "mismatch" } }]) assert.equal(button(harness(data).render(), "مراجعة الحملة").props.disabled, true);
    const markup = renderToStaticMarkup(harness({ ...base, configured: false }).render());
    assert.match(markup, /غير جاهزة/); assert.doesNotMatch(markup, /partnerToken|GREEN_API|0\.40|200 عميل|50 طلب/);
  });
  await check("expired subscription keeps disconnect and optout available but blocks launch", () => {
    const tree = harness({ ...connected, eligible: false }).render();
    assert.equal(button(tree, "فصل الرقم أو تغييره").props.disabled, false);
    assert.equal(button(tree, "إيقاف الإرسال").props.disabled, false);
    assert.equal(button(tree, "مراجعة الحملة").props.disabled, true);
    const pairing = harness({ ...connected, eligible: false, connection: { ...connected.connection, status: "pairing" } }).render();
    assert.equal(button(pairing, "إظهار رمز الربط").props.disabled, true);
  });
  await check("manual sender request uses the chosen phone only after submission", async () => {
    const h = harness(); let tree = h.render(); const before = requests.length;
    field(tree, "sender-phone").props.onChange({ target: { value: "+966533333333" } }); tree = h.render();
    assert.equal(requests.length, before);
    await formFor(tree, "sender-phone").props.onSubmit({ preventDefault() {} });
    assert.deepEqual(requests.at(-1).json, { action: "connect", phone: "966533333333" });
  });
  await check("review precedes explicit launch and uncertain retry reuses idempotency key", async () => {
    const h = harness(connected); let tree = h.render();
    for (const [id, value] of [["campaign-title", "عرض العملاء"], ["campaign-body", "رسالة تجريبية لا ترسل"]]) { field(tree, id).props.onChange({ target: { value } }); tree = h.render(); }
    all(tree, n => n.type === "input" && n.props["aria-label"] === `اختيار ${audience[0].name} ${audience[0].phone}`)[0].props.onChange({ target: { checked: true } }); tree = h.render();
    all(tree, n => n.type === "input" && n.props.type === "checkbox" && !n.props["aria-label"])[0].props.onChange({ target: { checked: true } }); tree = h.render();
    const before = requests.length;
    formFor(tree, "campaign-title").props.onSubmit({ preventDefault() {} }); tree = h.render();
    assert.equal(requests.length, before); assert(button(tree, "تأكيد بدء الإرسال"));
    const preview = all(tree, node => node.type === "aside" && node.props["aria-label"] === "معاينة رسالة واتساب")[0];
    assert.match(text(preview), /رسالة تجريبية لا ترسل\n\nلإيقاف الرسائل أرسل إيقاف أو استخدم الرابط\n\[رابط إيقاف الرسائل الخاص بالعميل\]/);
    assert.doesNotMatch(text(preview), /token=|https?:\/\//);
    assert.equal(all(preview, node => node.type === "a").length, 0);
    const successFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => { requests.push({ url, json: JSON.parse(options.body) }); throw new Error("network unavailable"); };
    button(tree, "تأكيد بدء الإرسال").props.onClick(); await new Promise(resolve => setTimeout(resolve, 0)); tree = h.render();
    const failed = requests.at(-1).json; assert.equal(failed.action, "createCampaign"); assert.deepEqual(failed.customerIds, [audience[0].id]); assert.equal(failed.consent, true); assert(!("recipients" in failed));
    assert.equal(failed.body, "رسالة تجريبية لا ترسل", "unsubscribe footer is appended by the worker once, not submitted in the draft");
    globalThis.fetch = successFetch;
    button(tree, "تأكيد بدء الإرسال").props.onClick(); await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(requests.at(-1).json.idempotencyKey, failed.idempotencyKey);
    tree = h.render(); assert.equal(field(tree, "campaign-body").props.value, "");
  });
  await check("campaign history separates accepted delivered read and uncertain", () => {
    const h = harness({ ...connected, campaigns: [{ id: "id1", title: "حملة محفوظة", body: "النص الفعلي", status: "completed", createdAt: "2026-10-19T10:00:00Z", scheduledAt: "", total: 15, queued: 1, accepted: 5, delivered: 3, read: 2, failed: 1, uncertain: 1, cancelled: 1, suppressed: 1 }] });
    const markup = renderToStaticMarkup(h.render());
    for (const word of ["النص الفعلي", "مقبولة للإرسال", "تم التسليم", "تمت القراءة", "لم يتأكد الإرسال", "مستبعدة"]) assert(markup.includes(word));
  });
  await check("disconnect cannot mutate until explicit confirmation", async () => {
    const h = harness(connected); let tree = h.render(); const before = requests.length;
    button(tree, "فصل الرقم أو تغييره").props.onClick(); tree = h.render(); assert.equal(requests.length, before);
    assert.match(text(tree), /تُلغى الحملات النشطة/); assert.match(text(tree), /لن تُستأنف عند ربط رقم مجددًا/);
    await button(tree, "تأكيد فصل الرقم").props.onClick(); assert.equal(requests.at(-1).json.action, "disconnect");
  });
  await check("pairing QR requires an explicit request and provides device instructions", async () => {
    const pairing = { ...connected, connection: { ...connected.connection, status: "pairing", verifiedPhone: null } };
    const h = harness(pairing); let tree = h.render();
    assert.equal(all(tree, node => node.type === "img").length, 0);
    const successFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, data: { dashboard: pairing, qr: "aGVsbG8=" } }) });
    button(tree, "إظهار رمز الربط").props.onClick(); await new Promise(resolve => setTimeout(resolve, 0)); tree = h.render();
    assert.equal(all(tree, node => node.type === "img")[0].props.src, "data:image/png;base64,aGVsbG8=");
    assert.match(renderToStaticMarkup(tree), /الأجهزة المرتبطة/);
    globalThis.fetch = successFetch;
  });
  await check("uncertain provisioning can reconcile the same sender and disconnect can retry", async () => {
    for (const status of ["uncertain", "provisioning", "error"]) {
      const h = harness({ ...connected, connection: { ...connected.connection, status, verifiedPhone: null } });
      const before = requests.length, tree = h.render(); assert.equal(requests.length, before, "render never provisions automatically");
      button(tree, "استكمال ربط الرقم").props.onClick(); await new Promise(resolve => setTimeout(resolve, 0));
      assert.deepEqual(requests.at(-1).json, { action: "connect", phone: connected.connection.phone });
    }
    const pending = harness({ ...connected, connection: { ...connected.connection, status: "disconnecting" } });
    assert.equal(button(pending.render(), "فصل الرقم أو تغييره").props.disabled, false);
  });
  await check("customer stop button submits a customer identity and removes selection", async () => {
    const h = harness(connected); let tree = h.render();
    const choose = () => all(tree, n => n.type === "input" && n.props["aria-label"] === `اختيار ${audience[0].name} ${audience[0].phone}`)[0];
    choose().props.onChange({ target: { checked: true } }); tree = h.render(); assert.equal(choose().props.checked, true);
    const oldFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => { requests.push({ json: JSON.parse(options.body) }); return { ok: true, json: async () => ({ ok: true, data: { dashboard: { ...connected, audience: audience.map((customer, index) => ({ ...customer, suppressed: index === 0 || customer.suppressed })) } } }) }; };
    await button(tree, "إيقاف الإرسال").props.onClick(); assert.deepEqual(requests.at(-1).json, { action: "optOut", customerId: audience[0].id }); tree = h.render();
    assert.equal(choose().props.checked, false); assert.equal(choose().props.disabled, true);
    assert.equal(all(tree, n => n.props?.id === "optout-phone" || n.props?.id === "campaign-recipients").length, 0);
    globalThis.fetch = oldFetch;
  });
  await check("audience search select-all pagination and suppressed state use actual customers", () => {
    const h = harness(connected); let tree = h.render();
    const selectAll = () => all(tree, n => n.type === "input" && n.props["aria-label"] === "تحديد كل العملاء الظاهرين في البحث")[0];
    assert.match(text(tree), /تحميل بطاقته لا يعني موافقته/);
    selectAll().props.onChange({ target: { checked: true } }); tree = h.render();
    const customers = all(tree, n => n.type === "input" && n.props["aria-label"]?.startsWith("اختيار "));
    assert.equal(customers.filter(n => n.props.checked).length, 2); assert.equal(customers[2].props.disabled, true); assert.equal(customers[2].props.checked, false);
    field(tree, "audience-search").props.onChange({ target: { value: "522222222" } }); tree = h.render();
    assert.equal(all(tree, n => n.type === "li").length, 1);
    selectAll().props.onChange({ target: { checked: false } }); tree = h.render();
    assert.equal(all(tree, n => n.type === "input" && n.props["aria-label"]?.startsWith("اختيار "))[0].props.checked, false);
    const many = harness({ ...connected, audience: Array.from({ length: 25 }, (_, i) => ({ ...audience[0], id: `customer:${i}`, name: `عميل ${i}` })) });
    tree = many.render(); assert.equal(all(tree, n => n.type === "li").length, 20);
    button(tree, "التالي").props.onClick(); tree = many.render(); assert.equal(all(tree, n => n.type === "li").length, 5);
    const empty = renderToStaticMarkup(harness({ ...connected, audience: [] }).render()); assert.match(empty, /سيظهر هنا عملاء علامتك/);
  });
  await check("audience refresh invalidates a reviewed selection before launch", async () => {
    const h = harness(connected); let tree = h.render();
    for (const [id, value] of [["campaign-title", "حملة"], ["campaign-body", "رسالة"]]) { field(tree, id).props.onChange({ target: { value } }); tree = h.render(); }
    all(tree, n => n.type === "input" && n.props["aria-label"] === "تحديد كل العملاء الظاهرين في البحث")[0].props.onChange({ target: { checked: true } }); tree = h.render();
    all(tree, n => n.type === "input" && n.props.type === "checkbox" && !n.props["aria-label"])[0].props.onChange({ target: { checked: true } }); tree = h.render();
    formFor(tree, "campaign-title").props.onSubmit({ preventDefault() {} }); tree = h.render(); assert(button(tree, "تأكيد بدء الإرسال"));
    const oldFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, data: { dashboard: { ...connected, audience: audience.filter((_, index) => index !== 0) } } }) });
    button(tree, "تحديث الحالة").props.onClick(); await new Promise(resolve => setTimeout(resolve, 0)); tree = h.render();
    assert.equal(all(tree, n => n.type === "button" && text(n) === "تأكيد بدء الإرسال").length, 0); assert(button(tree, "مراجعة الحملة"));
    globalThis.fetch = oldFetch;
  });
  await check("QR intent retries timeout automatically with bounded lifecycle and no mutation replay", async () => {
    const saved = { window: globalThis.window, document: globalThis.document, navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"), fetch: globalThis.fetch, now: Date.now };
    let now = 1000000, nextId = 0;
    const timers = new Map(), events = new Map(), qrCalls = [];
    const pairing = { ...connected, connection: { ...connected.connection, status: "pairing", verifiedPhone: null } };
    let data = { dashboard: pairing, qrStatus: "timeout" }, status = 200;
    const flush = () => new Promise(resolve => setTimeout(resolve, 0));
    const runPoll = async (h, millis = 5000) => { now += millis; [...timers.values()].forEach(fn => fn()); await flush(); const tree = h.render(); h.flushEffects(); return tree; };
    try {
      Date.now = () => now;
      globalThis.document = { visibilityState: "visible", addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
      Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: true } });
      globalThis.window = { setTimeout, clearTimeout, setInterval(fn) { timers.set(++nextId, fn); return nextId; }, clearInterval(id) { timers.delete(id); }, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
      globalThis.fetch = async (_url, options) => { const action = options.body ? JSON.parse(options.body).action : "get"; qrCalls.push(action); return { ok: status < 400, status, json: async () => ({ ok: status < 400, message: "انتهت صلاحية الوصول", data }) }; };
      const h = harness(pairing); let tree = h.render(); h.flushEffects();
      await runPoll(h); assert(!qrCalls.includes("qr"), "no QR request without user intent");
      button(tree, "إظهار رمز الربط").props.onClick(); await flush(); tree = h.render(); h.flushEffects();
      assert.match(text(tree), /حتى خمس دقائق/); assert.equal(qrCalls.at(-1), "qr");
      tree = await runPoll(h); assert.equal(qrCalls.filter(action => action === "qr").length, 2);
      globalThis.document.visibilityState = "hidden"; const beforeHidden = qrCalls.length; await runPoll(h); assert.equal(qrCalls.length, beforeHidden);
      globalThis.document.visibilityState = "visible"; globalThis.navigator.onLine = false; await runPoll(h); assert.equal(qrCalls.length, beforeHidden);
      globalThis.navigator.onLine = true; data = { dashboard: pairing, qrStatus: "qrCode", qr: "aGVsbG8=" };
      tree = await runPoll(h); assert.equal(all(tree, n => n.type === "img").length, 1);
      const gotQr = qrCalls.filter(action => action === "qr").length;
      await runPoll(h); await runPoll(h); await runPoll(h); assert.equal(qrCalls.filter(action => action === "qr").length, gotQr);
      await runPoll(h); assert.equal(qrCalls.filter(action => action === "qr").length, gotQr + 1);
      tree = await runPoll(h, 300000); const afterDeadline = qrCalls.filter(action => action === "qr").length;
      assert.match(text(tree), /انتهت مهلة/); assert.equal(all(tree, n => n.type === "img").length, 0);
      await runPoll(h); assert.equal(qrCalls.filter(action => action === "qr").length, afterDeadline);
      assert(!qrCalls.includes("connect") && !qrCalls.includes("createCampaign"));
      h.unmount(); assert.equal(timers.size, 0); assert.equal(events.size, 0);

      for (const qrStatus of ["error", "passkeyRequired", "alreadyLogged"]) {
        data = { dashboard: pairing, qrStatus }; status = 200;
        const terminal = harness(pairing); tree = terminal.render(); terminal.flushEffects();
        button(tree, "إظهار رمز الربط").props.onClick(); await flush(); tree = terminal.render(); terminal.flushEffects();
        const count = qrCalls.filter(action => action === "qr").length;
        await runPoll(terminal); assert.equal(qrCalls.filter(action => action === "qr").length, count, `${qrStatus} stops QR retry`);
        assert.equal(all(tree, n => n.type === "img").length, 0); terminal.unmount();
      }
      for (const code of [400, 409]) {
        status = code; data = { dashboard: pairing, qrStatus: "timeout" };
        const rejected = harness(pairing); tree = rejected.render(); rejected.flushEffects();
        button(tree, "إظهار رمز الربط").props.onClick(); await flush(); tree = rejected.render(); rejected.flushEffects();
        const count = qrCalls.filter(action => action === "qr").length; await runPoll(rejected); assert.equal(qrCalls.filter(action => action === "qr").length, count); assert.doesNotMatch(text(tree), /حتى خمس دقائق/); rejected.unmount();
      }
      for (const code of [401, 403]) {
        status = code; data = { dashboard: pairing, qrStatus: "timeout" };
        const denied = harness(pairing); tree = denied.render(); denied.flushEffects();
        button(tree, "إظهار رمز الربط").props.onClick(); await flush(); tree = denied.render(); denied.flushEffects();
        const count = qrCalls.length; await runPoll(denied); await runPoll(denied); assert.equal(qrCalls.length, count); denied.unmount();
      }
      status = 200; data = { dashboard: connected };
      const completed = harness(pairing); tree = completed.render(); completed.flushEffects();
      button(tree, "إظهار رمز الربط").props.onClick(); await flush(); completed.render(); completed.flushEffects();
      const count = qrCalls.filter(action => action === "qr").length;
      await runPoll(completed); assert.equal(qrCalls.filter(action => action === "qr").length, count); completed.unmount();
    } finally {
      Date.now = saved.now; globalThis.window = saved.window; globalThis.fetch = saved.fetch;
      if (saved.document === undefined) delete globalThis.document; else globalThis.document = saved.document;
      if (saved.navigator) Object.defineProperty(globalThis, "navigator", saved.navigator); else delete globalThis.navigator;
    }
  });
  await check("polling and unmount release requests timers and listeners", async () => {
    const events = new Set(); let interval, cleared = false;
    globalThis.document = { visibilityState: "hidden", addEventListener: name => events.add(name), removeEventListener: name => events.delete(name) };
    globalThis.window = { setTimeout, clearTimeout, setInterval(fn) { interval = fn; return 17; }, clearInterval(id) { assert.equal(id, 17); cleared = true; }, addEventListener: name => events.add(name), removeEventListener: name => events.delete(name) };
    const h = harness(connected); h.render(); const cleanups = h.effects.map(effect => effect()).filter(Boolean); const before = requests.length;
    interval(); interval(); interval(); assert.equal(requests.length, before);
    cleanups.forEach(cleanup => cleanup()); assert(cleared); assert.equal(events.size, 0);
    delete globalThis.document;
  });
} finally { globalThis.fetch = realFetch; globalThis.window = realWindow; }
console.log(`Marketing campaign UI: ${checks.length} groups passed; mocked requests only`);
