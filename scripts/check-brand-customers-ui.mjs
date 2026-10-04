import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Exercise the real component and route with isolated actions and a tiny hook
// harness. No browser, customer payload, live service, or production mutation.
const root = fileURLToPath(new URL("..", import.meta.url));
const dependency = createRequire(import.meta.url);
const componentPath = "components/admin/pages/brand-customers-page.tsx";
function load(relative, stubs) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function("require", "exports", code)((name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.endsWith(".module.css")) return new Proxy({}, { get: (_, key) => String(key) });
    return dependency(name);
  }, exports);
  return exports;
}
const brandA = { id: "10000000-0000-4000-8000-000000000001", name: "Fixture Brand A", slug: "fixture-a" };
const brandB = { ...brandA, id: "10000000-0000-4000-8000-000000000002", name: "Fixture Brand B", slug: "fixture-b" };
const at = "2026-10-04T12:13:14.000Z";
function customer(brand = brandA) {
  return { id: brand.id.replace("10000000", "20000000"), cardId: brand.id.replace("10000000", "30000000"),
    name: "Fixture customer", phone: "+966500000001", email: "fixture@example.test", brand, sharedBrands: [brandA, brandB],
    identityMatch: "phone", status: "active", cardSuffix: "1234", joinedAt: at, cardIssuedAt: at, lastActivityAt: at,
    stamps: 15, stampsInCycle: 1, stampTarget: 7, stampTransactions: 15, scans: 17, rewardsEarned: 2, rewardsRedeemed: 1,
    rewardsExpired: 1, rewardsAvailable: 0, isFrequent: true, firstDownloadAt: null, lastDownloadAt: null, downloadCount: 0,
    firstInstalledAt: null, installedDeviceCount: 0, walletProviders: [] };
}
function fixture() {
  return { customers: [customer()], brands: [brandA, brandB].map(brand => ({ ...brand, customers: 1, stamps: 15, rewardsRedeemed: 1 })),
    summary: { memberships: 2, uniqueCustomers: 1, sharedCustomers: 1, frequentCustomers: 1, stamps: 30, scans: 34,
      rewardsEarned: 4, rewardsRedeemed: 2, rewardsExpired: 2 }, total: 1, page: 1, pageSize: 25, recordingStartedAt: at,
    walletRecordingStartedAt: at, frequentThreshold: 10 };
}
function detail(member = customer(), marker = "Fixture employee") {
  return { customer: member, memberships: [customer(), customer(brandB)], total: 1, page: 1, pageSize: 25,
    events: [{ id: `event-${member.id}`, occurredAt: at, kind: "stamp", outcome: "success", origin: "live", actorName: marker,
      stampsDelta: 1, stampsAfter: 1, rewardsDelta: 0, rewardName: null, rewardExpiresAt: null, reasonCode: null, provider: null }] };
}
let passed = 0;
const failures = [];
async function test(name, action) { try { await action(); passed++; } catch (error) { failures.push({ name, error }); } }
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const settle = () => new Promise(setImmediate);
function text(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return text(node.props?.children);
}
function findAll(node, predicate, output = []) {
  if (Array.isArray(node)) { node.forEach(child => findAll(child, predicate, output)); return output; }
  if (!node || typeof node !== "object") return output;
  if (predicate(node)) output.push(node);
  findAll(node.props?.children, predicate, output);
  return output;
}
function one(tree, predicate) { const found = findAll(tree, predicate)[0]; assert(found, "Expected element in component tree"); return found; }
function harness(initialResult = { ok: true, data: fixture() }) {
  let active = null;
  const list = [], details = [];
  // Dispatch to React only for genuine SSR, and to isolated hook slots when
  // directly exercising an event handler. This is test infrastructure, not a component.
  const native = { state: React.useState, ref: React.useRef, effect: React.useEffect };
  const hooks = { ...React,
    useState(initial) {
      if (!active) return native.state(initial);
      const owner = active, id = owner.stateCursor++;
      if (!(id in owner.states)) owner.states[id] = typeof initial === "function" ? initial() : initial;
      return [owner.states[id], next => { owner.states[id] = typeof next === "function" ? next(owner.states[id]) : next; }];
    },
    useRef(initial) { if (!active) return native.ref(initial); const id = active.refCursor++; return active.refs[id] ??= { current: initial }; },
    useEffect(effect) { if (!active) return native.effect(effect, []); if (!active.mounted) active.effects.push(effect); },
  };
  const { BrandCustomersPage } = load(componentPath, { react: hooks, "@/app/actions/brand-customers": {
    loadBrandCustomersAction(input) { const request = { input, ...deferred() }; list.push(request); return request.promise; },
    loadBrandCustomerDetailAction(id, page) { const request = { id, page, ...deferred() }; details.push(request); return request.promise; },
  } });
  function owner(Component, props) {
    const scope = { states: [], refs: [], effects: [], cleanups: [], stateCursor: 0, refCursor: 0, mounted: false, tree: null,
      render(next = props) { scope.stateCursor = 0; scope.refCursor = 0; active = scope; try { scope.tree = Component(next); } finally { active = null; } scope.mounted = true; return scope.tree; },
      mountEffects() { scope.cleanups = scope.effects.map(effect => effect()).filter(Boolean); },
      unmount() { scope.cleanups.forEach(cleanup => cleanup()); },
    };
    return scope;
  }
  const page = owner(BrandCustomersPage, { initialResult }); page.render(); page.mountEffects();
  return { page, list, details, owner,
    render: () => page.render(),
    find: predicate => one(page.tree, predicate),
    button(label) { return one(page.tree, node => node.type === "button" && (node.props["aria-label"]?.includes(label) || text(node).includes(label))); },
    edit(value) { one(page.tree, node => node.type === "input").props.onChange({ target: { value } }); page.render(); },
    submit() { one(page.tree, node => node.type === "form").props.onSubmit({ preventDefault() {} }); page.render(); },
    dialog() { return one(page.tree, node => typeof node.type === "function" && node.props.selected); },
    pagination() { const node = one(page.tree, node => typeof node.type === "function" && typeof node.props.onPage === "function"); return node.type(node.props); },
  };
}
const { BrandCustomersPage } = load(componentPath, { "@/app/actions/brand-customers": {
  loadBrandCustomersAction() { assert.fail("SSR must not duplicate the route data request"); },
  loadBrandCustomerDetailAction() { assert.fail("SSR must not fetch a customer detail"); },
} });
const ssr = result => renderToStaticMarkup(React.createElement(BrandCustomersPage, { initialResult: result }));
await test("SSR preserves truthful global totals, accessible RTL table and shared-customer labels", () => {
  const html = ssr({ ok: true, data: fixture() });
  for (const marker of ['dir="rtl"', '<caption', 'scope="col"', 'aria-busy="false"', 'role="status"', "Fixture customer", "Fixture Brand A", "Fixture Brand B", "مشترك في 2 علامات", "عميل مميز", "2 عضوية لدى العلامات"]) assert(html.includes(marker), marker);
  assert(!html.includes("cardCode") && !html.includes("sessionToken"));
  assert(/datetime="2026-10-04T12:13:14.000Z"/i.test(html));
  assert(html.includes("03:13:14"), "Recorded UTC timestamp is displayed with Saudi hours and seconds");
});
await test("SSR distinguishes empty results from failures and never fabricates statistics", () => {
  const data = fixture(); data.customers = []; data.total = 0;
  const empty = ssr({ ok: true, data });
  assert(empty.includes("لا توجد عضويات مطابقة")); assert(!empty.includes('role="alert"')); assert(!empty.includes("<table"));
  const error = ssr({ ok: false, message: "Fixture unavailable" });
  assert(error.includes('role="alert"')); assert(error.includes("Fixture unavailable")); assert(error.includes("بانتظار البيانات"));
  assert(!error.includes("Fixture customer") && !error.includes("لا توجد عضويات مطابقة"));
});
const oldFrame = globalThis.requestAnimationFrame;
globalThis.requestAnimationFrame = callback => { callback(); return 0; };
try {
  await test("applying draft starts page one, keeps old rows pending and updates only on success", async () => {
    const ctx = harness(); ctx.edit("New customer"); ctx.submit();
    assert.equal(ctx.list[0].input.search, "New customer"); assert.equal(ctx.list[0].input.page, 1);
    assert.equal(ctx.button("عرض النتائج").props.disabled, true); assert(text(ctx.page.tree).includes("Fixture customer"));
    const data = fixture(); data.customers[0].name = "New customer"; ctx.list[0].resolve({ ok: true, data }); await settle(); ctx.render();
    assert(text(ctx.page.tree).includes("New customer")); assert(!text(ctx.page.tree).includes("Fixture customer"));
    assert.equal(ctx.button("عرض النتائج").props.disabled, false);
  });
  await test("pending list refresh either locks fields or preserves text typed after submission", async () => {
    const ctx = harness(); ctx.edit("Submitted query"); ctx.submit();
    const input = ctx.find(node => node.type === "input");
    const locked = input.props.disabled || findAll(ctx.page.tree, node => node.type === "fieldset" && node.props.disabled).length;
    if (!locked) ctx.edit("Newer unsent draft");
    ctx.list[0].resolve({ ok: true, data: fixture() }); await settle(); ctx.render();
    if (!locked) assert.equal(ctx.find(node => node.type === "input").props.value, "Newer unsent draft");
  });
  await test("failed and throwing requests preserve applied results and allow a retry", async () => {
    const ctx = harness(); ctx.edit("Unapplied"); ctx.submit();
    ctx.list[0].resolve({ ok: false, message: "Fixture action failure" }); await settle(); ctx.render();
    assert(text(ctx.page.tree).includes("Fixture action failure")); assert(text(ctx.page.tree).includes("Fixture customer"));
    ctx.button("تحديث البيانات").props.onClick(); assert.equal(ctx.list[1].input.search, "");
    ctx.list[1].reject(new Error("PRIVATE TRANSPORT DETAIL")); await settle(); ctx.render();
    assert(ctx.find(node => node.props.role === "alert")); assert(!text(ctx.page.tree).includes("PRIVATE TRANSPORT DETAIL"));
    assert.equal(ctx.button("تحديث البيانات").props.disabled, false);
  });
  await test("late list response and late failure cannot overwrite a newer result", async () => {
    for (const staleFailure of [false, true]) {
      const ctx = harness(); ctx.edit("First"); ctx.submit(); ctx.edit("Second"); ctx.submit();
      const data = fixture(); data.customers[0].name = "Newest result";
      ctx.list[1].resolve({ ok: true, data }); await settle();
      ctx.list[0].resolve(staleFailure ? { ok: false, message: "Stale error" } : { ok: true, data: fixture() }); await settle(); ctx.render();
      assert(text(ctx.page.tree).includes("Newest result")); assert(!text(ctx.page.tree).includes("Stale error"));
    }
  });
  await test("pagination and segments use applied filters, not unsent draft", async () => {
    const data = fixture(); data.total = 26; const ctx = harness({ ok: true, data });
    ctx.edit("Unsent query");
    one(ctx.pagination(), node => node.type === "button" && node.props["aria-label"] === "الصفحة التالية").props.onClick();
    assert.equal(ctx.list[0].input.search, ""); assert.equal(ctx.list[0].input.page, 2);
    const next = fixture(); next.page = 2; next.total = 26; ctx.list[0].resolve({ ok: true, data: next }); await settle(); ctx.render();
    assert(one(ctx.pagination(), node => node.props["aria-label"] === "الصفحة التالية").props.disabled);
    ctx.button("الأكثر ولاءً").props.onClick(); assert.equal(ctx.list[1].input.segment, "frequent"); assert.equal(ctx.list[1].input.page, 1);
  });
  await test("selected brand stays visible when the next result has no matching brands", async () => {
    const ctx = harness(); ctx.button("Fixture Brand A").props.onClick();
    const filtered = fixture(); filtered.customers = []; filtered.brands = []; filtered.total = 0;
    ctx.list[0].resolve({ ok: true, data: filtered }); await settle(); ctx.render();
    const select = ctx.find(node => node.type === "select" && node.props.value === brandA.id);
    assert(findAll(select, node => node.type === "option" && node.props.value === brandA.id).length, "The applied brand must not silently display as All brands");
  });
  await test("opening another membership clears prior details and rejects the late first response", async () => {
    const data = fixture(); data.customers.push(customer(brandB)); const ctx = harness({ ok: true, data });
    ctx.button("فتح ملف Fixture customer لدى Fixture Brand A").props.onClick(); ctx.render();
    ctx.button("فتح ملف Fixture customer لدى Fixture Brand B").props.onClick(); ctx.render();
    assert.equal(ctx.dialog().props.detail, null); assert.equal(ctx.dialog().props.selected.brand.id, brandB.id);
    ctx.details[1].resolve({ ok: true, data: detail(customer(brandB), "Second brand employee") }); await settle();
    ctx.details[0].resolve({ ok: true, data: detail(customer(), "First brand employee") }); await settle(); ctx.render();
    const html = renderToStaticMarkup(ctx.dialog());
    assert(html.includes("Second brand employee")); assert(!html.includes("First brand employee"));
    assert(html.includes("رحلة العميل لدى Fixture Brand B"));
  });
  await test("membership selection requests that membership and keeps honest enrollment dates", async () => {
    const ctx = harness(); ctx.button("ملف العميل").props.onClick(); ctx.render();
    ctx.details[0].resolve({ ok: true, data: detail() }); await settle(); ctx.render();
    let html = renderToStaticMarkup(ctx.dialog());
    assert(html.includes("غير مسجل")); assert(html.includes("تحميل ملف البطاقة يختلف عن تثبيتها"));
    assert(html.includes("العمليات") || html.includes("رحلة العميل"));
    ctx.dialog().props.onSelect(customer(brandB)); ctx.render();
    assert.equal(ctx.details[1].id, customer(brandB).id); assert.equal(ctx.details[1].page, 1);
    html = renderToStaticMarkup(ctx.dialog()); assert(!html.includes("Fixture employee"));
  });
  await test("close invalidates a pending detail and reopening starts a fresh request", async () => {
    const ctx = harness(); ctx.button("ملف العميل").props.onClick(); ctx.render(); ctx.dialog().props.onClose(); ctx.render();
    ctx.details[0].resolve({ ok: true, data: detail(customer(), "Closed response") }); await settle(); ctx.render();
    assert.equal(findAll(ctx.page.tree, node => typeof node.type === "function" && node.props.selected).length, 0);
    ctx.button("ملف العميل").props.onClick(); ctx.render(); assert.equal(ctx.dialog().props.detail, null); assert.equal(ctx.details.length, 2);
  });
  await test("detail failure offers retry without falsely declaring an empty history", async () => {
    const ctx = harness(); ctx.button("ملف العميل").props.onClick(); ctx.render();
    ctx.details[0].resolve({ ok: false, message: "Fixture detail failure" }); await settle(); ctx.render();
    const html = renderToStaticMarkup(ctx.dialog()); assert(html.includes('role="alert"')); assert(html.includes("إعادة المحاولة"));
    assert(!html.includes("لا توجد عمليات مسجلة لهذه العضوية"));
    ctx.dialog().props.onLoad(1); assert.equal(ctx.details[1].id, customer().id);
  });
  await test("native dialog opens modally, focuses close, handles closing and restores the opener", () => {
    const ctx = harness(); ctx.button("ملف العميل").props.onClick(); ctx.render();
    const element = ctx.dialog(), dialog = ctx.owner(element.type, element.props), tree = dialog.render();
    let shows = 0, closes = 0, closeFocus = 0, openerFocus = 0;
    const priorHTMLElement = globalThis.HTMLElement, priorDocument = globalThis.document;
    class Element { focus() { openerFocus++; } }
    globalThis.HTMLElement = Element; globalThis.document = { activeElement: new Element() };
    const native = { showModal() { shows++; }, close() { closes++; tree.props.onClose(); } };
    tree.props.ref.current = native;
    const closeButton = one(tree, node => node.type === "button" && node.props["aria-label"] === "إغلاق ملف العميل");
    closeButton.props.ref.current = { focus() { closeFocus++; } };
    try {
      dialog.mountEffects(); assert.equal(shows, 1); assert.equal(closeFocus, 1);
      assert.equal(tree.type, "dialog"); assert.equal(tree.props["aria-labelledby"], "brand-customer-title");
      assert.equal(tree.props["aria-describedby"], "brand-customer-description");
      closeButton.props.onClick(); assert.equal(closes, 1); ctx.render();
      assert.equal(findAll(ctx.page.tree, node => node.props?.selected).length, 0);
      dialog.unmount(); assert.equal(openerFocus, 1);
    } finally {
      if (priorHTMLElement === undefined) delete globalThis.HTMLElement; else globalThis.HTMLElement = priorHTMLElement;
      if (priorDocument === undefined) delete globalThis.document; else globalThis.document = priorDocument;
    }
  });
  await test("unmount invalidates pending requests before they update view state", async () => {
    const ctx = harness(); ctx.submit(); ctx.page.unmount();
    const data = fixture(); data.customers[0].name = "After unmount"; ctx.list[0].resolve({ ok: true, data }); await settle(); ctx.render();
    assert(!text(ctx.page.tree).includes("After unmount"));
  });
} finally { if (oldFrame === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = oldFrame; }

await test("route denies non-admins before fetching the privileged customer list", async () => {
  let reads = 0;
  const route = load("app/admin/brand-customers/page.tsx", {
    "next/navigation": { redirect(destination) { assert.equal(destination, "/login"); throw new Error("Redirect"); } },
    "@/components/admin/pages/brand-customers-page": { BrandCustomersPage },
    "@/lib/data/cafes": { requirePlatformAdmin: async () => { throw new Error("Denied"); } },
    "@/app/actions/brand-customers": { loadBrandCustomersAction: async () => { reads++; return { ok: true, data: fixture() }; } },
  });
  await assert.rejects(route.default, /Redirect/); assert.equal(reads, 0);
  assert.equal(route.dynamic, "force-dynamic"); assert.equal(route.fetchCache, "force-no-store");
});
await test("authorized route loads once and returns real server data", async () => {
  let reads = 0;
  const route = load("app/admin/brand-customers/page.tsx", {
    "next/navigation": { redirect() { assert.fail("Authorized admin must not redirect"); } },
    "@/components/admin/pages/brand-customers-page": { BrandCustomersPage },
    "@/lib/data/cafes": { requirePlatformAdmin: async () => ({ id: "fixture-admin" }) },
    "@/app/actions/brand-customers": { loadBrandCustomersAction: async () => { reads++; return { ok: true, data: fixture() }; } },
  });
  const element = await route.default(); assert.equal(reads, 1); assert.deepEqual(element.props.initialResult.data, fixture());
});
await test("CSS keeps mobile data labels, target sizes, focus indication, motion opt-out and readable colors", () => {
  const css = dependency("postcss").parse(fs.readFileSync(path.join(root, "components/admin/pages/brand-customers.module.css"), "utf8"));
  const media = [], declarations = [], selectors = [];
  css.walkAtRules("media", rule => media.push(rule.params));
  css.walkDecls(declaration => declarations.push(declaration)); css.walkRules(rule => selectors.push(rule.selector));
  assert(media.some(value => value.includes("760px"))); assert(media.some(value => value.includes("390px"))); assert(media.some(value => value.includes("prefers-reduced-motion")));
  assert(declarations.some(item => item.prop === "content" && item.value === "attr(data-label)"));
  assert(declarations.some(item => item.prop === "min-height" && item.value === "44px"));
  assert(selectors.some(value => value.includes(":focus-visible")));
  const tokens = Object.fromEntries(declarations.filter(item => item.prop.startsWith("--")).map(item => [item.prop, item.value]));
  const luminance = hex => hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
  const contrast = (light, dark) => (luminance(light) + .05) / (luminance(dark) + .05);
  for (const foreground of ["--text", "--muted", "--gold"]) assert(contrast(tokens[foreground], tokens["--panel"]) >= 4.5);
  for (const [foreground, background] of [["--blue", "#203043"], ["--green", "#20332b"], ["--red", "#3b2526"]]) assert(contrast(tokens[foreground], background) >= 4.5);
});
for (const failure of failures) console.error(`FAIL: ${failure.name}`, failure.error);
console.log(`Brand customer UI checks: ${passed} passed, ${failures.length} failed.`);
if (failures.length) process.exitCode = 1;
