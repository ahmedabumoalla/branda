import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transform } from "lightningcss";

const dependency = createRequire(import.meta.url);
function load(file, stubs = {}) {
  const exports = {};
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "exports", output)(name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (name.startsWith("@/")) return load(path.resolve(`${name.slice(2)}.ts`), stubs);
    return dependency(name);
  }, exports);
  return exports;
}
const componentPath = path.resolve("components/admin/marketing-campaign-history.tsx");
const { MarketingCampaignHistoryList } = load(componentPath);
const campaign = { id: "11111111-1111-4111-8111-111111111111", title: "حملة العرض الأول", body: "السطر الأول\nالسطر الثاني <script>alert(1)</script>", status: "completed", createdAt: "2026-10-21T09:00:00Z", scheduledAt: "2026-10-21T10:00:00Z", mediaKind: "image", total: 20, sent: 12, pending: 3, failed: 2, uncertain: 1, cancelled: 1, suppressed: 1 };
const data = { page: 0, total: 21, campaigns: [campaign] };
const brandA = { brandId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", brandName: "العلامة الأولى", from: "2026-10-01", to: "2026-10-21" };
const brandB = { ...brandA, brandId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", brandName: "العلامة الثانية" };
function nodes(tree) { if (!tree || typeof tree !== "object") return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
function text(tree) { if (tree == null || typeof tree === "boolean") return ""; if (Array.isArray(tree)) return tree.map(text).join(""); return typeof tree === "object" ? text(tree.props?.children) : String(tree); }
function button(tree, label) { const match = nodes(tree).find(node => node.type === "button" && text(node) === label); assert(match, `Missing ${label}`); return match; }
const markup = tree => renderToStaticMarkup(tree);
function harness(initial = brandA) {
  const values = [], effects = new Map(); let cursor = 0, pending = [], props = initial;
  const hooks = { ...React,
    useId() { return `history-${cursor++}`; },
    useState(initialValue) { const slot = cursor++; if (!(slot in values)) values[slot] = typeof initialValue === "function" ? initialValue() : initialValue; return [values[slot], next => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }]; },
    useEffect(effect, deps) { const slot = cursor++; const before = effects.get(slot); if (before && deps.length === before.deps.length && deps.every((value, index) => Object.is(value, before.deps[index]))) return; pending.push(() => { before?.cleanup?.(); effects.set(slot, { deps, cleanup: effect() }); }); },
  };
  const { MarketingCampaignHistory } = load(componentPath, { react: hooks });
  const view = {
    render(nextProps = props) { props = nextProps; cursor = 0; const tree = MarketingCampaignHistory(props); const jobs = pending; pending = []; jobs.forEach(job => job()); return tree; },
    async settle() { let tree; for (let pass = 0; pass < 6; pass++) { await Promise.resolve(); tree = view.render(); } return tree; },
    unmount() { for (const effect of effects.values()) effect.cleanup?.(); effects.clear(); },
  };
  return view;
}
const response = value => ({ ok: true, json: async () => value });
let checks = 0;
async function check(name, run) { await run(); checks++; console.log(`PASS ${name}`); }
const originalFetch = globalThis.fetch, originalWindow = globalThis.window;
globalThis.window = { setTimeout, clearTimeout };
try {
  await check("history list renders escaped exact content media and independent statuses", () => {
    const html = markup(React.createElement(MarketingCampaignHistoryList, { data }));
    for (const label of [campaign.title, "السطر الأول", "السطر الثاني", "صورة مرفقة", "إرسال مقبول", "تعذر الإرسال", "لم يتأكد الإرسال", "ملغاة", "مستبعدة"]) assert(html.includes(label));
    assert(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;") && !html.includes("<script>"));
    assert(html.includes('dateTime="2026-10-21T09:00:00Z"'));
    assert(markup(React.createElement(MarketingCampaignHistoryList, { data: { ...data, campaigns: [{ ...campaign, mediaKind: "video", status: "paused" }] } })).includes("فيديو مرفق"));
    const empty = markup(React.createElement(MarketingCampaignHistoryList, { data: { page: 0, total: 0, campaigns: [] } }));
    assert(empty.includes("لا توجد حملات أنشئت خلال الفترة"));
    const beyond = markup(React.createElement(MarketingCampaignHistoryList, { data: { page: 2, total: 21, campaigns: [] } }));
    assert(beyond.includes("ارجع إلى الصفحة السابقة"));
  });
  await check("request carries exact loaded Saudi period and pagination with refresh returning to first page", async () => {
    const requests = [];
    globalThis.fetch = async (url, options) => { const params = new URL(url, "https://test.invalid").searchParams; requests.push({ url, options, params }); return response({ ...data, page: Number(params.get("page")), campaigns: [{ ...campaign, title: `عنوان الصفحة ${params.get("page")}` }] }); };
    const h = harness(); let tree = h.render();
    assert(markup(tree).includes("جارٍ تحميل سجل الحملات"));
    tree = await h.settle();
    const first = requests[0]; assert.equal(first.params.get("brandId"), brandA.brandId); assert.equal(first.params.get("from"), brandA.from); assert.equal(first.params.get("to"), brandA.to); assert.equal(first.params.get("page"), "0");
    assert.equal(first.options.cache, "no-store"); assert(first.options.signal instanceof AbortSignal);
    assert.equal(button(tree, "السابق").props.disabled, true); assert.equal(button(tree, "التالي").props.disabled, false);
    assert(markup(tree).includes("عنوان الصفحة 0"));
    button(tree, "التالي").props.onClick(); tree = h.render(); assert(!markup(tree).includes("عنوان الصفحة 0"));
    tree = await h.settle(); assert.equal(first.options.signal.aborted, true); assert.equal(requests.at(-1).params.get("page"), "1"); assert.equal(button(tree, "التالي").props.disabled, true);
    button(tree, "تحديث السجل").props.onClick(); tree = h.render(); assert(!markup(tree).includes("عنوان الصفحة 1"));
    tree = await h.settle(); assert.equal(requests.at(-1).params.get("page"), "0");
    assert(markup(tree).includes("لا يثبت وصولها أو قراءتها")); h.unmount(); assert.equal(requests.at(-1).options.signal.aborted, true);
  });
  await check("switching brand or period hides old data immediately and ignores late prior response", async () => {
    const requests = [];
    globalThis.fetch = (url, options) => new Promise(resolve => requests.push({ url, options, resolve }));
    const h = harness(); h.render(); requests[0].resolve(response(data)); let tree = await h.settle(); assert(markup(tree).includes(campaign.title));
    button(tree, "التالي").props.onClick(); h.render();
    tree = h.render(brandB); assert(!markup(tree).includes(campaign.title)); assert(markup(tree).includes(brandB.brandName)); assert.equal(requests[1].options.signal.aborted, true);
    assert.equal(new URL(requests[2].url, "https://test.invalid").searchParams.get("page"), "0");
    requests[2].resolve(response({ ...data, campaigns: [{ ...campaign, title: "حملة العلامة الثانية" }] })); tree = await h.settle(); assert(markup(tree).includes("حملة العلامة الثانية"));
    requests[1].resolve(response({ ...data, page: 1, campaigns: [{ ...campaign, title: "محتوى قديم يجب ألا يظهر" }] })); tree = await h.settle(); assert(!markup(tree).includes("محتوى قديم يجب ألا يظهر")); assert(markup(tree).includes("حملة العلامة الثانية"));
    tree = h.render({ ...brandB, from: "2026-10-10", to: "2026-10-11" }); assert(!markup(tree).includes("حملة العلامة الثانية"));
    const last = requests.at(-1); const params = new URL(last.url, "https://test.invalid").searchParams; assert.equal(params.get("from"), "2026-10-10"); assert.equal(params.get("to"), "2026-10-11");
    h.unmount(); last.resolve(response(data)); await h.settle(); assert.equal(last.options.signal.aborted, true);
    h.unmount();
  });
  await check("failed or malformed history is hidden and retry retains requested page without backend disclosure", async () => {
    let mode = "success"; const requests = [];
    globalThis.fetch = async (url) => { const page = Number(new URL(url, "https://test.invalid").searchParams.get("page")); requests.push(page); return mode === "success" ? response({ ...data, page }) : mode === "bad" ? response({ ...data, campaigns: [{ ...campaign, sent: -1, body: "secret backend value" }] }) : { ok: false, json: async () => ({ error: "private backend diagnostic" }) }; };
    const h = harness(); let tree = await h.settle();
    mode = "failure"; button(tree, "التالي").props.onClick(); h.render(); tree = await h.settle();
    assert(markup(tree).includes('role="alert"')); assert(!markup(tree).includes(campaign.title)); assert(!markup(tree).includes("private backend diagnostic"));
    mode = "bad"; button(tree, "إعادة المحاولة").props.onClick(); h.render(); tree = await h.settle(); assert(!markup(tree).includes("secret backend value")); assert.equal(requests.at(-1), 1);
    mode = "success"; button(tree, "إعادة المحاولة").props.onClick(); h.render(); tree = await h.settle(); assert.equal(requests.at(-1), 1); assert(markup(tree).includes(campaign.title)); h.unmount();
  });
  await check("unbounded period omits dates and empty history stays an honest empty state", async () => {
    let request;
    globalThis.fetch = async url => { request = new URL(url, "https://test.invalid"); return response({ page: 0, total: 0, campaigns: [] }); };
    const h = harness({ ...brandA, from: null, to: null }); const tree = await h.settle();
    assert(!request.searchParams.has("from") && !request.searchParams.has("to"));
    assert(markup(tree).includes("لا توجد حملات أنشئت خلال الفترة")); assert.equal(button(tree, "التالي").props.disabled, true); h.unmount();
  });
  await check("request timeout surfaces retry and cleanup releases timeout", async () => {
    let timeout; const cleared = [];
    globalThis.window = { setTimeout(fn) { timeout = fn; return 7; }, clearTimeout(id) { cleared.push(id); } };
    globalThis.fetch = (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("abort"))));
    const h = harness(); h.render(); timeout(); const tree = await h.settle();
    assert(markup(tree).includes('role="alert"')); assert(button(tree, "إعادة المحاولة")); assert(cleared.includes(7)); h.unmount();
  });
  await check("styles define every used class and retain responsive readable history", () => {
    for (const [source, stylesheet] of [[componentPath, "components/admin/marketing-campaign-history.module.css"], ["components/admin/pages/operations-report-page.tsx", "components/admin/pages/operations-report-page.module.css"]]) {
      const cssText = fs.readFileSync(stylesheet, "utf8"); const compiled = transform({ filename: stylesheet, code: Buffer.from(cssText), cssModules: true });
      for (const [, name] of fs.readFileSync(source, "utf8").matchAll(/styles\.(\w+)/g)) assert(compiled.exports[name], `Missing ${name}`);
      assert(cssText.includes("focus-visible") && cssText.includes("@media"));
    }
  });
} finally { globalThis.fetch = originalFetch; globalThis.window = originalWindow; }
console.log(`Marketing report UI passed (${checks} groups); mocked admin requests only`);
