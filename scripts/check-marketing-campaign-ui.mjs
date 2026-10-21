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
    if (name.startsWith("@/")) return load(path.resolve(root, `${name.slice(2)}.ts`), stubs);
    if (name.startsWith(".")) return load(path.resolve(path.dirname(file), `${name}.ts`), stubs);
    return dependency(name);
  }, exports);
  return exports;
}
const helpers = load(path.join(folder, "campaign-form.ts"));
const mediaRules = load(path.join(root, "lib/marketing/media-rules.ts"));
let uploadFile = async () => ({ error: null });
const checks = [];
async function check(name, run) { await run(); checks.push(name); console.log(`PASS ${name}`); }
const audience = [{ id: "customer:11111111-1111-4111-8111-111111111111", name: "عميل أول", phone: "966511111111", suppressed: false, source: "both" }, { id: "loyalty:22222222-2222-4222-8222-222222222222", name: "عميل ولاء", phone: "966522222222", suppressed: false, source: "loyalty" }, { id: "customer:33333333-3333-4333-8333-333333333333", name: "عميل موقوف", phone: "966533333333", suppressed: true, source: "customer" }];
const base = { brandName: "علامة الاختبار", eligible: true, configured: true, optOutCount: 1, connection: null, campaigns: [], audience };
const connected = { ...base, connection: { status: "connected", phone: "966511111111", verifiedPhone: "966511111111", lastError: null } };
function harness(initial = base) {
  const values = [], effects = [], cleanups = new Map(); let cursor = 0;
  const same = (left, right) => left && right && left.length === right.length && left.every((value, i) => Object.is(value, right[i]));
  const hooks = { ...React, useState(initialValue) { const slot = cursor++; if (!(slot in values)) values[slot] = initialValue; return [values[slot], value => { values[slot] = typeof value === "function" ? value(values[slot]) : value; }]; }, useRef(initialValue) { const slot = cursor++; if (!(slot in values)) values[slot] = { current: initialValue }; return values[slot]; }, useCallback(fn, deps) { const slot = cursor++; if (!same(values[slot]?.deps, deps)) values[slot] = { fn, deps }; return values[slot].fn; }, useEffect(fn, deps) { const slot = cursor++; if (!same(values[slot], deps)) { values[slot] = deps; effects.push(() => { cleanups.get(slot)?.(); const cleanup = fn(); cleanups.set(slot, cleanup); return cleanup; }); } } };
  const { CampaignConsole } = load(path.join(folder, "campaign-console.tsx"), { react: hooks, "@/lib/supabase/client": { createClient: () => ({ storage: { from: bucket => ({ uploadToSignedUrl: (...args) => uploadFile(bucket, ...args) }) } }) }, "@/components/ui/design-system": { DashboardPageShell: ({ title, action, children }) => React.createElement("main", null, React.createElement("h1", null, title), action, children) }, "@/components/dashboard/feature-blocked-state": { DashboardFeatureBlockedState: () => React.createElement("div", null, "FEATURE_BLOCKED") } });
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
    assert.match(text(preview), /رسالة تجريبية لا ترسل\n\nلإيقاف الرسائل أرسل كلمة إيقاف/);
    assert.doesNotMatch(text(preview), /استخدم الرابط|رابط إيقاف الرسائل الخاص/);
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
  await check("media validation matches shared types sizes caption limits and blocked upload states", () => {
    for (const [type, rule] of Object.entries(mediaRules.MARKETING_MEDIA_TYPES)) {
      assert.equal(helpers.campaignMediaError({ type, size: rule.maxSize }), null);
      assert(helpers.campaignMediaError({ type, size: rule.maxSize + 1 }));
    }
    for (const file of [{ type: "image/svg+xml", size: 50 }, { type: "video/webm", size: 50 }, { type: "image/png", size: 0 }]) assert(helpers.campaignMediaError(file));
    const draft = { title: "حملة", body: "رسالة", consent: true, customerIds: [audience[0].id], scheduledAt: "" };
    assert.match(helpers.campaignDraftError({ ...draft, mediaStatus: "uploading" }), /انتظر/);
    assert.match(helpers.campaignDraftError({ ...draft, mediaStatus: "failed" }), /أعد رفع/);
    assert.match(helpers.campaignDraftError({ ...draft, mediaStatus: "ready" }), /تعذر التحقق/);
    assert.equal(helpers.campaignDraftError({ ...draft, mediaStatus: "ready", mediaId: "media", body: "x".repeat(mediaRules.MARKETING_MEDIA_BODY_LIMIT) }), null);
    assert.match(helpers.campaignDraftError({ ...draft, mediaId: "media", body: "x".repeat(mediaRules.MARKETING_MEDIA_BODY_LIMIT + 1) }), /اختصر/);
    assert.equal(helpers.campaignDraftError({ ...draft, body: "x".repeat(3000) }), null, "text-only campaigns retain their previous length");
  });
  await check("signed media upload verifies before review and campaign retry preserves media and idempotency", async () => {
    const oldFetch = globalThis.fetch, oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL;
    const revoked = [], mediaRequests = [], uploads = [], launches = [];
    const media = { id: "11111111-1111-4111-8111-999999999999", kind: "image", mimeType: "image/png", fileName: "offer.png", size: 20 };
    let finishUpload;
    const flush = () => new Promise(resolve => setTimeout(resolve, 0));
    try {
      URL.createObjectURL = () => "blob:campaign-image"; URL.revokeObjectURL = url => revoked.push(url);
      uploadFile = (...args) => { uploads.push(args); return new Promise(resolve => { finishUpload = resolve; }); };
      globalThis.fetch = async (url, options) => {
        const payload = JSON.parse(options.body);
        if (url === "/api/marketing/media") {
          mediaRequests.push(payload);
          return { ok: true, json: async () => ({ ok: true, data: payload.action === "prepare" ? { mediaId: media.id, bucket: "marketing-media", upload: { path: "scoped/object", token: "signed-upload-token" } } : { media } }) };
        }
        launches.push(payload);
        if (launches.length === 1) throw new Error("uncertain request");
        return { ok: true, json: async () => ({ ok: true, data: { dashboard: connected } }) };
      };
      const h = harness(connected); let tree = h.render(); h.effects[0]();
      for (const [id, value] of [["campaign-title", "عرض مصور"], ["campaign-body", "نص الرسالة مع الصورة"]]) { field(tree, id).props.onChange({ target: { value } }); tree = h.render(); }
      const scheduledAt = new Date(Date.now() + 86400_000).toISOString().slice(0, 16);
      field(tree, "campaign-date").props.onChange({ target: { value: scheduledAt } }); tree = h.render();
      all(tree, n => n.type === "input" && n.props["aria-label"] === "تحديد كل العملاء الظاهرين في البحث")[0].props.onChange({ target: { checked: true } }); tree = h.render();
      all(tree, n => n.type === "input" && n.props.type === "checkbox" && !n.props["aria-label"])[0].props.onChange({ target: { checked: true } }); tree = h.render();
      const file = new File(["sample image"], "offer.png", { type: "image/png" });
      field(tree, "campaign-media").props.onChange({ target: { files: [file], value: "local-file" } }); await flush(); tree = h.render();
      assert.equal(button(tree, "مراجعة الحملة").props.disabled, true);
      assert.equal(field(tree, "campaign-body").props.maxLength, mediaRules.MARKETING_MEDIA_BODY_LIMIT);
      assert.match(renderToStaticMarkup(tree), /blob:campaign-image/);
      formFor(tree, "campaign-title").props.onSubmit({ preventDefault() {} }); tree = h.render();
      assert.match(text(tree), /انتظر حتى يكتمل/); assert.equal(launches.length, 0);
      assert.deepEqual(mediaRequests, [{ action: "prepare", fileName: "offer.png", mimeType: "image/png", size: file.size }]);
      assert.deepEqual(uploads[0], ["marketing-media", "scoped/object", "signed-upload-token", file, { contentType: "image/png" }]);
      finishUpload({ error: null }); await flush(); tree = h.render();
      assert.deepEqual(mediaRequests.at(-1), { action: "finalize", mediaId: media.id });
      assert.equal(button(tree, "مراجعة الحملة").props.disabled, false);
      formFor(tree, "campaign-title").props.onSubmit({ preventDefault() {} }); tree = h.render();
      const review = all(tree, n => n.props?.["aria-label"] === "مراجعة الحملة قبل الإرسال")[0];
      const reviewMarkup = renderToStaticMarkup(review);
      assert.match(reviewMarkup, /offer.png/); assert.match(reviewMarkup, /blob:campaign-image/); assert.match(reviewMarkup, /نص الرسالة مع الصورة/); assert.match(reviewMarkup, /لإيقاف الرسائل أرسل كلمة إيقاف/);
      button(tree, "تأكيد جدولة الحملة").props.onClick(); await flush(); tree = h.render();
      assert.equal(launches[0].mediaId, media.id); assert.equal(launches[0].body, "نص الرسالة مع الصورة");
      assert.equal(launches[0].scheduledAt, new Date(scheduledAt).toISOString());
      assert(!("media" in launches[0]) && !("url" in launches[0]), "campaign sends only server media identity");
      assert.equal(field(tree, "campaign-body").props.value, "نص الرسالة مع الصورة");
      assert.match(renderToStaticMarkup(tree), /blob:campaign-image/); assert.equal(revoked.length, 0);
      button(tree, "تأكيد جدولة الحملة").props.onClick(); await flush(); tree = h.render();
      assert.equal(launches[1].idempotencyKey, launches[0].idempotencyKey); assert.equal(uploads.length, 1);
      assert.equal(field(tree, "campaign-body").props.value, ""); assert.deepEqual(revoked, ["blob:campaign-image"]);
      h.unmount(); assert.equal(revoked.length, 1);
    } finally { globalThis.fetch = oldFetch; URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke; uploadFile = async () => ({ error: null }); }
  });
  await check("failed media upload retains draft blocks submission and supports explicit retry or removal", async () => {
    const oldFetch = globalThis.fetch, oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL;
    const revoked = []; let prepares = 0, uploads = 0;
    const flush = () => new Promise(resolve => setTimeout(resolve, 0));
    try {
      URL.createObjectURL = () => `blob:attempt-${prepares}`; URL.revokeObjectURL = url => revoked.push(url);
      uploadFile = async () => ({ error: ++uploads === 1 ? { message: "provider private diagnostic" } : null });
      globalThis.fetch = async (_url, options) => {
        const payload = JSON.parse(options.body);
        if (payload.action === "prepare") prepares++;
        return { ok: true, json: async () => ({ ok: true, data: payload.action === "prepare" ? { mediaId: `media-${prepares}`, bucket: "marketing-media", upload: { path: "scoped", token: "token" } } : { media: { id: "media-2", kind: "image", mimeType: "image/png", fileName: "retry.png", size: 12 } } }) };
      };
      const h = harness(connected); let tree = h.render(); h.effects[0]();
      field(tree, "campaign-body").props.onChange({ target: { value: "نص محفوظ" } }); tree = h.render();
      field(tree, "campaign-media").props.onChange({ target: { files: [new File(["test"], "retry.png", { type: "image/png" })], value: "" } }); await flush(); tree = h.render();
      assert.equal(field(tree, "campaign-body").props.value, "نص محفوظ"); assert.equal(button(tree, "مراجعة الحملة").props.disabled, true);
      assert.match(text(tree), /تعذر رفع المرفق/); assert.doesNotMatch(text(tree), /provider private diagnostic/);
      button(tree, "إعادة رفع المرفق").props.onClick(); await flush(); tree = h.render();
      assert.equal(prepares, 2); assert.equal(button(tree, "مراجعة الحملة").props.disabled, false); assert.equal(revoked.length, 1);
      button(tree, "إزالة المرفق").props.onClick(); tree = h.render();
      assert.equal(field(tree, "campaign-body").props.value, "نص محفوظ"); assert.equal(field(tree, "campaign-body").props.maxLength, 3000); assert.equal(revoked.length, 2);
      const before = prepares;
      field(tree, "campaign-media").props.onChange({ target: { files: [new File(["<svg/>"], "bad.svg", { type: "image/svg+xml" })], value: "" } }); await flush(); tree = h.render();
      assert.equal(prepares, before); assert.equal(button(tree, "مراجعة الحملة").props.disabled, true); assert.match(text(tree), /اختر صورة بصيغة/);
      button(tree, "إزالة المرفق").props.onClick(); assert.equal(button(h.render(), "مراجعة الحملة").props.disabled, false);
      h.unmount();
    } finally { globalThis.fetch = oldFetch; URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke; uploadFile = async () => ({ error: null }); }
  });
  await check("replacing image with video ignores stale upload and revokes every local preview on unmount", async () => {
    const oldFetch = globalThis.fetch, oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL;
    const revoked = [], finalized = []; let finishOldUpload, sequence = 0;
    const flush = () => new Promise(resolve => setTimeout(resolve, 0));
    try {
      URL.createObjectURL = file => `blob:${file.name}`; URL.revokeObjectURL = url => revoked.push(url);
      uploadFile = async (_bucket, _path, _token, file) => file.type === "image/png" ? new Promise(resolve => { finishOldUpload = resolve; }) : { error: null };
      globalThis.fetch = async (_url, options) => {
        const payload = JSON.parse(options.body);
        if (payload.action === "prepare") return { ok: true, json: async () => ({ ok: true, data: { mediaId: `media-${++sequence}`, bucket: "marketing-media", upload: { path: "scoped", token: "token" } } }) };
        finalized.push(payload.mediaId);
        return { ok: true, json: async () => ({ ok: true, data: { media: { id: payload.mediaId, kind: "video", mimeType: "video/mp4", fileName: "new.mp4", size: 9 } } }) };
      };
      const h = harness(connected); let tree = h.render(); h.effects[0]();
      field(tree, "campaign-media").props.onChange({ target: { files: [new File(["old"], "old.png", { type: "image/png" })], value: "" } }); await flush(); tree = h.render();
      field(tree, "campaign-media").props.onChange({ target: { files: [new File(["new"], "new.mp4", { type: "video/mp4" })], value: "" } }); await flush(); tree = h.render();
      assert.deepEqual(revoked, ["blob:old.png"]); assert.deepEqual(finalized, ["media-2"]);
      let markup = renderToStaticMarkup(tree); assert.match(markup, /<video/); assert.match(markup, /controls=""/); assert.match(markup, /playsInline=""/); assert.doesNotMatch(markup, /autoPlay|blob:old.png/);
      finishOldUpload({ error: null }); await flush(); tree = h.render(); markup = renderToStaticMarkup(tree);
      assert.deepEqual(finalized, ["media-2"]); assert.match(markup, /blob:new.mp4/); assert.equal(button(tree, "مراجعة الحملة").props.disabled, false);
      h.unmount(); assert.deepEqual(revoked, ["blob:old.png", "blob:new.mp4"]);
    } finally { globalThis.fetch = oldFetch; URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke; uploadFile = async () => ({ error: null }); }
  });
  await check("server finalization failure never makes an attachment sendable", async () => {
    const oldFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (_url, options) => JSON.parse(options.body).action === "prepare" ? { ok: true, json: async () => ({ ok: true, data: { mediaId: "bad", bucket: "marketing-media", upload: { path: "scoped", token: "token" } } }) } : { ok: false, json: async () => ({ ok: false, message: "محتوى الملف لا يطابق الصيغة" }) };
      const h = harness(connected); let tree = h.render(); h.effects[0]();
      field(tree, "campaign-media").props.onChange({ target: { files: [new File(["not png"], "bad.png", { type: "image/png" })], value: "" } }); await new Promise(resolve => setTimeout(resolve, 0)); tree = h.render();
      assert.equal(button(tree, "مراجعة الحملة").props.disabled, true); assert.match(text(tree), /محتوى الملف لا يطابق الصيغة/);
      h.unmount();
    } finally { globalThis.fetch = oldFetch; }
  });
  await check("upload timeout and unmount prevent late verification and release their timers", async () => {
    const oldFetch = globalThis.fetch, oldWindow = globalThis.window;
    const timers = new Map(); let finishUpload, prepareSignal, finalized = 0;
    const flush = () => new Promise(resolve => setTimeout(resolve, 0));
    try {
      globalThis.window = { ...oldWindow, setTimeout(callback, delay) { if (delay === 180000) { timers.set(42, callback); return 42; } return setTimeout(callback, delay); }, clearTimeout(id) { if (id === 42) timers.delete(id); else clearTimeout(id); } };
      uploadFile = () => new Promise(resolve => { finishUpload = resolve; });
      globalThis.fetch = async (_url, options) => {
        const payload = JSON.parse(options.body); prepareSignal = options.signal;
        if (payload.action === "finalize") finalized++;
        return { ok: true, json: async () => ({ ok: true, data: { mediaId: "media-timeout", bucket: "marketing-media", upload: { path: "scoped", token: "token" } } }) };
      };
      const h = harness(connected); let tree = h.render(); h.effects[0]();
      field(tree, "campaign-media").props.onChange({ target: { files: [new File(["image"], "slow.png", { type: "image/png" })], value: "" } }); await flush();
      timers.get(42)(); tree = h.render();
      assert.equal(prepareSignal.aborted, true); assert.equal(button(tree, "مراجعة الحملة").props.disabled, true); assert.match(text(tree), /استغرق رفع المرفق وقتًا طويلًا/);
      finishUpload({ error: null }); await flush(); assert.equal(finalized, 0); assert.equal(timers.size, 0);
      button(tree, "إعادة رفع المرفق").props.onClick(); await flush();
      assert.equal(timers.size, 1); h.unmount(); assert.equal(timers.size, 0); assert.equal(prepareSignal.aborted, true);
      finishUpload({ error: null }); await flush(); assert.equal(finalized, 0);
    } finally { globalThis.fetch = oldFetch; globalThis.window = oldWindow; uploadFile = async () => ({ error: null }); }
  });
  await check("upload indicator follows actual prepare transfer and verification with a quiet elapsed clock", async () => {
    const saved = { fetch: globalThis.fetch, window: globalThis.window, now: Date.now };
    const intervals = new Map(); let now = 100000, timerId = 0, prepare, transfer, verify;
    const flush = () => new Promise(resolve => setTimeout(resolve, 0));
    const response = data => ({ ok: true, json: async () => ({ ok: true, data }) });
    const h = harness(connected);
    try {
      Date.now = () => now;
      globalThis.window = { ...saved.window, setInterval(fn, delay) { assert.equal(delay, 1000); intervals.set(++timerId, fn); return timerId; }, clearInterval(id) { intervals.delete(id); } };
      globalThis.fetch = (_url, options) => new Promise(resolve => { if (JSON.parse(options.body).action === "prepare") prepare = resolve; else verify = resolve; });
      uploadFile = () => new Promise(resolve => { transfer = resolve; });
      let tree = h.render(); h.effects[0]();
      field(tree, "campaign-media").props.onChange({ target: { files: [new File(["image"], "progress.png", { type: "image/png" })], value: "" } });
      const render = () => { tree = h.render(); h.flushEffects(); return tree; };
      render();
      const progress = () => all(tree, node => node.props?.role === "progressbar")[0];
      assert.equal(progress().props["aria-label"], "جارٍ تجهيز رفع المرفق"); assert.equal(progress().props["aria-valuenow"], undefined);
      assert.match(text(tree), /الوقت المنقضي 00:00/); assert.equal(intervals.size, 1);
      now += 65000; [...intervals.values()].forEach(fn => fn()); render();
      assert.match(text(tree), /الوقت المنقضي 01:05/);
      const live = all(tree, node => node.props?.role === "status").map(text).join(""); assert.doesNotMatch(live, /01:05|الوقت المنقضي/);
      assert.equal(all(tree, node => node.props?.className === "uploadElapsed")[0].props["aria-live"], "off");
      prepare(response({ mediaId: "progress", bucket: "marketing-media", upload: { path: "scoped", token: "token" } })); await flush(); render();
      assert.equal(progress().props["aria-label"], "جارٍ رفع المرفق"); assert.equal(intervals.size, 1);
      transfer({ error: null }); await flush(); render();
      assert.equal(progress().props["aria-label"], "جارٍ التحقق من المرفق"); assert.equal(button(tree, "مراجعة الحملة").props.disabled, true);
      assert.doesNotMatch(text(tree), /100%|المرفق جاهز للإرسال/);
      verify(response({ media: { id: "progress", kind: "image", mimeType: "image/png", fileName: "progress.png", size: 5 } })); await flush(); render();
      assert.equal(progress(), undefined); assert.equal(intervals.size, 0); assert.match(text(tree), /المرفق جاهز للإرسال/);
      assert.equal(button(tree, "مراجعة الحملة").props.disabled, false);
      assert.match(fs.readFileSync(path.join(folder, "campaigns.module.css"), "utf8"), /prefers-reduced-motion:reduce[^}]+animation:none/);
    } finally { h.unmount(); globalThis.fetch = saved.fetch; globalThis.window = saved.window; Date.now = saved.now; uploadFile = async () => ({ error: null }); }
  });
  await check("elapsed timers reset on replacement and release on removal timeout failure and unmount", async () => {
    const saved = { fetch: globalThis.fetch, window: globalThis.window, now: Date.now };
    const intervals = new Map(), timeouts = new Map(); let nextId = 0, now = 100000, transfers = [];
    const flush = () => new Promise(resolve => setTimeout(resolve, 0));
    try {
      Date.now = () => now;
      globalThis.window = { setInterval(fn) { intervals.set(++nextId, fn); return nextId; }, clearInterval(id) { intervals.delete(id); }, setTimeout(fn) { timeouts.set(++nextId, fn); return nextId; }, clearTimeout(id) { timeouts.delete(id); } };
      globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, data: { mediaId: "lifecycle", bucket: "marketing-media", upload: { path: "scoped", token: "token" } } }) });
      uploadFile = () => new Promise(resolve => { transfers.push(resolve); });
      for (const end of ["remove", "timeout", "failure", "unmount"]) {
        const h = harness(connected); let tree = h.render(); h.effects[0]();
        const render = () => { tree = h.render(); h.flushEffects(); };
        const choose = async () => { field(tree, "campaign-media").props.onChange({ target: { files: [new File(["image"], "lifecycle.png", { type: "image/png" })], value: "" } }); await flush(); render(); };
        await choose(); const staleTick = [...intervals.values()][0]; now += 2000; staleTick(); render(); assert.match(text(tree), /00:02/);
        await choose(); assert.equal(intervals.size, 1); assert.match(text(tree), /00:00/);
        staleTick(); render(); assert.match(text(tree), /00:00/, "replaced timer cannot update new upload");
        if (end === "remove") button(tree, "إزالة المرفق").props.onClick();
        if (end === "timeout") [...timeouts.values()][0]();
        if (end === "failure") { transfers.at(-1)({ error: { message: "failure" } }); await flush(); }
        if (end === "unmount") h.unmount(); else render();
        assert.equal(intervals.size, 0, end);
        transfers.forEach(resolve => resolve({ error: null })); transfers = []; await flush();
        h.unmount(); assert.equal(timeouts.size, 0, end);
      }
    } finally { globalThis.fetch = saved.fetch; globalThis.window = saved.window; Date.now = saved.now; uploadFile = async () => ({ error: null }); }
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
    const savedFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, options) => { requests.push({ url, ...options, json: JSON.parse(options.body) }); return { ok: true, status: 200, json: async () => ({ ok: true, data: { dashboard: { ...connected, connection: { ...connected.connection, status: "disconnected" } } } }) }; };
      await button(tree, "تأكيد فصل الرقم").props.onClick(); tree = h.render();
      assert.equal(requests.length, before + 1); assert.equal(requests.at(-1).json.action, "disconnect");
      assert.match(text(tree), /تم فصل الرقم وإلغاء الحملات النشطة/); assert.doesNotMatch(text(tree), /متصل وجاهز|تأكيد فصل الرقم/);
    } finally { globalThis.fetch = savedFetch; }
  });
  await check("failed disconnect reads stored status once and preserves the action error and explicit retry", async () => {
    const savedFetch = globalThis.fetch;
    try {
      for (const readSucceeds of [true, false]) {
        const calls = [], failureMessage = "تعذر فصل الرقم أعد المحاولة";
        globalThis.fetch = async (url, options) => {
          calls.push({ url, ...options, json: options.body ? JSON.parse(options.body) : null });
          if (options.method === "POST") return { ok: false, status: 503, json: async () => ({ ok: false, message: failureMessage }) };
          return readSucceeds
            ? { ok: true, status: 200, json: async () => ({ ok: true, data: { dashboard: { ...connected, connection: { ...connected.connection, status: "disconnecting" } } } }) }
            : { ok: false, status: 503, json: async () => ({ ok: false, message: "تعذر تحديث الحالة" }) };
        };
        const h = harness(connected); let tree = h.render(); assert.match(text(tree), /متصل وجاهز/);
        button(tree, "فصل الرقم أو تغييره").props.onClick(); tree = h.render();
        await button(tree, "تأكيد فصل الرقم").props.onClick(); tree = h.render();
        assert.deepEqual(calls.map(call => [call.method, call.json]), [["POST", { action: "disconnect" }], ["GET", null]]);
        assert.equal(calls[1].cache, "no-store"); assert.match(text(tree), new RegExp(failureMessage));
        assert.doesNotMatch(text(tree), /تم فصل الرقم وإلغاء الحملات النشطة|تعذر تحديث الحالة/);
        assert.equal(button(tree, "تأكيد فصل الرقم").props.disabled, false);
        if (readSucceeds) { assert.match(text(tree), /جارٍ فصل الرقم/); assert.doesNotMatch(text(tree), /متصل وجاهز/); assert.equal(button(tree, "مراجعة الحملة").props.disabled, true); }
        else { assert.match(text(tree), /متصل وجاهز/); assert.doesNotMatch(text(tree), /جارٍ فصل الرقم/); }
        h.render(); assert.equal(calls.length, 2, "render never repeats the disconnect mutation");
      }
    } finally { globalThis.fetch = savedFetch; }
  });
  await check("disconnect authorization failure does not issue a followup request", async () => {
    const savedFetch = globalThis.fetch, calls = [];
    try {
      globalThis.fetch = async (url, options) => { calls.push({ url, ...options }); return { ok: false, status: 403, json: async () => ({ ok: false, message: "انتهت صلاحية الجلسة" }) }; };
      const h = harness(connected); let tree = h.render();
      button(tree, "فصل الرقم أو تغييره").props.onClick(); tree = h.render();
      await button(tree, "تأكيد فصل الرقم").props.onClick(); tree = h.render();
      assert.equal(calls.length, 1); assert.equal(calls[0].method, "POST"); assert.match(text(tree), /انتهت صلاحية الجلسة/);
    } finally { globalThis.fetch = savedFetch; }
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
