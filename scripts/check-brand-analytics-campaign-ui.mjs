import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const dependency = createRequire(import.meta.url);
const componentPath = path.resolve("components/admin/brand-analytics-campaign.tsx");
const actionPath = "@/app/actions/brand-analytics-campaign";
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (value, expected, message) => { assert.deepEqual(value, expected, message); checks++; };
function load(file, stubs = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const target = { exports: {} }; cache.set(file, target.exports);
  new Function("require", "module", "exports", output)(name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (name === "next/link") return { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) };
    if (name.startsWith("@/")) { const next = path.resolve(name.slice(2)); return load(fs.existsSync(`${next}.tsx`) ? `${next}.tsx` : `${next}.ts`, stubs, cache); }
    return dependency(name);
  }, target, target.exports);
  return target.exports;
}
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const brand = { id: id(1), name: "علامة تجريبية" };
const generatedAt = "2026-11-04T13:00:00Z";
function audience(input, patch = {}) {
  return { generatedAt, brandId: input.brandId, segment: input.segment, inactiveDays: input.inactiveDays ?? 10,
    matched: 33, total: 30, excluded: 3, digest: "a".repeat(64), page: input.page ?? 1, pageSize: 25,
    items: [{ id: id(2), name: input.page === 2 ? "العميل في الصفحة الثانية" : "عميل اصطناعي", phone: "966500000000", lastVisitAt: null, inactiveDays: 30, visitDays: 3, averageVisitGapDays: 4 }],
    sender: { ready: true, phone: "966511111111", status: "connected" }, ...patch };
}
const actions = { loadBrandAnalyticsCampaignAudienceAction: async input => ({ ok: true, data: audience(input) }), createBrandAnalyticsCampaignAction: async () => ({ ok: true, data: { campaignId: id(3), total: 30 } }) };
const api = load(componentPath, { [actionPath]: actions });
const html = renderToStaticMarkup(React.createElement(api.BrandAnalyticsCampaign, { brand }));
check(html.includes("إنشاء رسالة أو عرض") && html.includes(brand.name), "brand-scoped CTA");
check(html.includes("<dialog") && html.includes('aria-labelledby="analytics-campaign-title"'), "native accessible modal");
check(!html.includes("966500000000"), "closed initial state contains no audience PII");
const form = load(path.resolve("lib/analytics/brand-analytics-campaign-form.ts"));
const now = Date.parse("2026-11-04T13:00:00Z");
equal(form.analyticsCampaignSaudiInput(now), "2026-11-04T16:00", "Riyadh date input independent of system zone");
equal(form.analyticsCampaignSchedule("2026-11-04T17:00", now).scheduledAt, "2026-11-04T14:00:00.000Z", "Riyadh schedule converted exactly");
for (const bad of ["", "2026-02-30T12:00", "2026-11-04T15:59", "2027-11-05T16:00", "2026-11-04T24:00", "2026-13-01T12:00"]) check(Boolean(form.analyticsCampaignSchedule(bad, now).error), "invalid/past/out-of-range schedule rejected");
check(form.analyticsCampaignMessageTemplate(brand.name, "loyal").includes(brand.name), "suggested message identifies brand");
check(!/\d|٪|%/.test(form.analyticsCampaignMessageTemplate(brand.name, "inactive")), "template invents no discount commitment");
for (const [title, body] of [["", "hello"], ["x".repeat(101), "hello"], ["title", ""], ["title", "x".repeat(3001)]]) check(Boolean(form.analyticsCampaignDraftError(title, body)), "invalid draft rejected");
const couponApi = load(path.resolve("lib/analytics/analytics-coupons.ts"));
const couponDraft = { discountType: "percentage", discountValue: "12.5", minimumOrderAmount: "0", validityDays: "7", terms: "  يسري على الخدمات المحددة  " };
const expectedCoupon = { discountType: "percentage", discountValue: 12.5, minimumOrderAmount: 0, validityDays: 7, terms: "يسري على الخدمات المحددة" };
equal(form.analyticsCampaignCouponDraft(couponDraft), { coupon: expectedCoupon, error: null }, "coupon normalizes numbers and trims authored terms");
for (const patch of [
  { discountValue: "" }, { discountValue: "0" }, { discountValue: "-1" }, { discountValue: "100.01" }, { discountValue: "1.234" }, { discountValue: "1e2" },
  { discountType: "fixed", discountValue: "100000.01" }, { minimumOrderAmount: "" }, { minimumOrderAmount: "-1" }, { minimumOrderAmount: "1000000.01" }, { minimumOrderAmount: "2.345" },
  { validityDays: "" }, { validityDays: "0" }, { validityDays: "366" }, { validityDays: "1.5" }, { terms: "ش".repeat(401) },
]) check(Boolean(form.analyticsCampaignCouponDraft({ ...couponDraft, ...patch }).error), `invalid coupon input rejected: ${JSON.stringify(patch)}`);
equal(form.analyticsCampaignCouponDraft({ ...couponDraft, discountValue: "100", validityDays: "365" }).coupon.discountValue, 100, "maximum percent and validity boundaries accepted");
equal(form.analyticsCampaignCouponDraft({ ...couponDraft, discountType: "fixed", discountValue: "100000", minimumOrderAmount: "1000000" }).coupon.discountValue, 100000, "fixed coupon money boundaries accepted");
check(Boolean(form.analyticsCampaignDraftError("عنوان", "ش".repeat(2001), "coupon")), "coupon authored body leaves room for generated terms");
check(!form.analyticsCampaignDraftError("عنوان", "ش".repeat(2000), "coupon"), "2000-character coupon body accepted");
check(!form.analyticsCampaignDraftError("عنوان", "ش".repeat(3000), "offer"), "legacy message offer length preserved");

const flatten = tree => !tree || typeof tree !== "object" ? [] : Array.isArray(tree) ? tree.flatMap(flatten) : [tree, ...flatten(tree.props?.children)];
const textOf = tree => tree == null || typeof tree === "boolean" ? "" : Array.isArray(tree) ? tree.map(textOf).join("") : typeof tree === "object" ? textOf(tree.props?.children) : String(tree);
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function harness(overrides = {}) {
  let cursor = 0; const slots = [], effects = [], calls = { audience: [], create: [] }, dom = { open: false, shown: 0, closed: 0, focus: 0 };
  const hooks = { ...React,
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useEffect(effect, deps) { const index = cursor++, previous = slots[index]; if (!previous || deps?.some((value, n) => value !== previous.deps?.[n])) { slots[index] = { deps }; effects.push(effect); } },
  };
  const mocked = {
    loadBrandAnalyticsCampaignAudienceAction: async input => { calls.audience.push(input); return overrides.audience ? overrides.audience(input) : { ok: true, data: audience(input) }; },
    createBrandAnalyticsCampaignAction: async input => { calls.create.push(input); return overrides.create ? overrides.create(input) : { ok: true, data: { campaignId: id(3), total: 30 } }; },
  };
  const Component = load(componentPath, { react: hooks, [actionPath]: mocked }).BrandAnalyticsCampaign;
  function render() {
    cursor = 0; const tree = Component({ brand });
    for (const node of flatten(tree)) {
      if (node.props?.ref && typeof node.props.ref === "object") node.props.ref.current = node.type === "dialog"
        ? { get open() { return dom.open; }, showModal() { dom.open = true; dom.shown++; }, close() { dom.open = false; dom.closed++; } }
        : { focus() { dom.focus++; } };
    }
    while (effects.length) effects.shift()();
    return tree;
  }
  const find = predicate => { const node = flatten(render()).find(predicate); assert.ok(node, "node found"); return node; };
  const button = label => find(node => node.type === "button" && (textOf(node) === label || node.props["aria-label"] === label));
  const field = id => find(node => node.props?.id === id);
  const click = async label => { const node = button(label); assert(!node.props.disabled, `${label} enabled`); node.props.onClick(); await settle(); return render(); };
  const edit = (id, value) => field(id).props.onChange({ target: { value } });
  return { render, find, button, field, click, edit, calls, dom };
}

const normal = harness();
await normal.click("إنشاء رسالة أو عرض");
check(normal.dom.shown === 1 && normal.dom.open, "native modal opens on explicit CTA");
equal(normal.calls.audience[0], { brandId: brand.id, segment: "inactive", inactiveDays: 10, page: 1 }, "default audience fixed to brand and inactivity");
check(textOf(normal.render()).includes("٣٠") && textOf(normal.render()).includes("مستبعد"), "total audience and exclusions visible");
check(normal.calls.create.length === 0, "opening composer does not create a campaign");
await normal.click("التالي");
equal(normal.calls.audience.at(-1).page, 2, "server audience pagination");
check(textOf(normal.render()).includes("العميل في الصفحة الثانية"), "next page displays returned recipients");
await normal.click("مدة غياب أحددها"); normal.edit("campaign-absence-days", "42");
check(normal.button("مراجعة الحملة قبل الإرسال").props.disabled, "dirty day threshold invalidates old audience");
await normal.click("عرض العملاء");
equal(normal.calls.audience.at(-1).inactiveDays, 42, "custom absence threshold passed");
normal.edit("campaign-absence-days", "0");
check(normal.button("عرض العملاء").props.disabled, "invalid custom threshold blocked");
await normal.click("الأكثر ولاء وانتظامًا");
equal(normal.calls.audience.at(-1).segment, "loyal", "loyal audience query");
equal(normal.calls.audience.at(-1).inactiveDays, 10, "fixed segment normalization");
await normal.click("استخدام رسالة مقترحة");
check(normal.field("analytics-campaign-body").props.value.includes(brand.name), "template includes selected brand");
await normal.click("عرض خاص");
normal.edit("analytics-campaign-subject", "عرض من العلامة"); normal.edit("analytics-campaign-body", "عرض فعلي محدد من العلامة بشروطه");
const countBefore = normal.calls.audience.length;
await normal.click("مراجعة الحملة قبل الإرسال");
check(normal.calls.audience.length === countBefore + 1, "review reloads live audience before confirmation");
check(normal.calls.create.length === 0, "review does not send");
check(textOf(normal.render()).includes("عرض فعلي محدد من العلامة بشروطه"), "review body matches exact authored offer");
check(textOf(normal.render()).includes("من لم يعد يطابقها وقت الإرسال"), "dispatch-time audience changes explained");
await normal.click("تأكيد الإرسال إلى ٣٠ عميل");
equal(normal.calls.create.length, 1, "explicit final button creates once");
equal(normal.calls.create[0].contentKind, "offer", "offer type preserved");
equal(normal.calls.create[0].body, "عرض فعلي محدد من العلامة بشروطه", "message text unchanged");
check(!("phones" in normal.calls.create[0]) && !("page" in normal.calls.create[0]) && normal.calls.create[0].audienceDigest === "a".repeat(64), "full digest audience, not visible page or client phones");
check(textOf(normal.render()).includes("أُضيفت الحملة إلى قائمة الإرسال"), "success does not claim delivered messages");
await normal.click("العودة للتحليلات"); check(!normal.dom.open, "modal closes after success");

const coupon = harness();
await coupon.click("إنشاء رسالة أو عرض"); await coupon.click("كوبون شخصي");
equal(coupon.field("analytics-coupon-value").props.value, "", "coupon discount requires deliberate value input");
equal(coupon.field("analytics-coupon-minimum").props.value, "0", "coupon minimum defaults to zero");
await coupon.click("استخدام رسالة مقترحة");
check(coupon.button("كوبون شخصي").props["aria-pressed"], "suggested message keeps selected coupon mode");
await coupon.click("مراجعة الحملة قبل الإرسال");
check(textOf(coupon.render()).includes("أدخل قيمة خصم"), "missing discount prevents review with actionable message");
equal(coupon.calls.create.length, 0, "missing coupon never creates a campaign");
coupon.edit("analytics-campaign-subject", "كوبون محدد"); coupon.edit("analytics-campaign-body", "  عرض لك من علامة تجريبية  ");
coupon.edit("analytics-coupon-value", "12.5"); coupon.edit("analytics-coupon-terms", couponDraft.terms);
const expectedPreview = couponApi.buildAnalyticsCouponMessage("عرض لك من علامة تجريبية", expectedCoupon, "كود خاص لكل عميل", generatedAt);
equal(textOf(coupon.find(node => node.props?.className === "bubble").props.children[0]), expectedPreview, "preview uses exact shared per-recipient coupon formatter");
check(textOf(coupon.render()).includes("وقت الانتهاء تقديري"), "immediate coupon expiry estimate labeled clearly");
await coupon.click("مراجعة الحملة قبل الإرسال");
equal(textOf(coupon.find(node => node.props?.className === "reviewBody")), expectedPreview, "final coupon review shows exact normalized terms and placeholder");
check(textOf(coupon.render()).includes("كوبون شخصي قابل للصرف") && textOf(coupon.render()).includes("يُصرف مرة واحدة"), "coupon review clarifies redeemable single-use behavior");
await coupon.click("تأكيد الإرسال إلى ٣٠ عميل");
equal(coupon.calls.create[0].coupon, expectedCoupon, "confirmation submits structured coupon config exactly as reviewed");
equal(coupon.calls.create[0].body, "عرض لك من علامة تجريبية", "only authored body submitted while server assigns personal code");
equal(coupon.calls.create[0].contentKind, "coupon", "coupon creation is explicit mode");
check(!JSON.stringify(coupon.calls.create[0]).includes("كود خاص لكل عميل"), "preview placeholder never submitted as actual coupon code");

const couponAsMessage = harness();
await couponAsMessage.click("إنشاء رسالة أو عرض"); await couponAsMessage.click("كوبون شخصي");
couponAsMessage.edit("analytics-coupon-value", "15"); await couponAsMessage.click("رسالة تواصل");
await couponAsMessage.click("استخدام رسالة مقترحة"); await couponAsMessage.click("مراجعة الحملة قبل الإرسال"); await couponAsMessage.click("تأكيد الإرسال إلى ٣٠ عميل");
check(!Object.hasOwn(couponAsMessage.calls.create[0], "coupon"), "switching back to message never submits hidden coupon config");

const offline = harness({ audience: input => ({ ok: true, data: audience(input, { sender: { ready: false, phone: null, status: "disconnected" } }) }) });
await offline.click("إنشاء رسالة أو عرض"); check(offline.button("مراجعة الحملة قبل الإرسال").props.disabled, "disconnected sender blocks new campaign");
check(textOf(offline.render()).includes("واتساب غير جاهز"), "sender state visible");
const empty = harness({ audience: input => ({ ok: true, data: audience(input, { matched: 0, total: 0, excluded: 0, items: [] }) }) });
await empty.click("إنشاء رسالة أو عرض"); check(empty.button("مراجعة الحملة قبل الإرسال").props.disabled, "zero audience never becomes all customers");
check(textOf(empty.render()).includes("لا يوجد مستلمون متاحون"), "empty segment clear");

let uncertainAttempt = "uncertain";
const uncertain = harness({ create: () => uncertainAttempt ? { ok: false, code: uncertainAttempt, message: "نتيجة غير مؤكدة" } : { ok: true, data: { campaignId: id(3), total: 30 } } });
await uncertain.click("إنشاء رسالة أو عرض"); await uncertain.click("كوبون شخصي"); await uncertain.click("استخدام رسالة مقترحة");
uncertain.edit("analytics-coupon-value", "20"); uncertain.edit("analytics-coupon-minimum", "90"); uncertain.edit("analytics-coupon-terms", "شروط الكوبون ثابتة أثناء إعادة المحاولة");
await uncertain.click("مراجعة الحملة قبل الإرسال");
await uncertain.click("تأكيد الإرسال إلى ٣٠ عميل");
check(uncertain.button("إغلاق إنشاء الحملة").props.disabled, "uncertain attempt cannot abandon review via close");
check(!flatten(uncertain.render()).some(node => node.type === "button" && textOf(node) === "العودة للتعديل"), "uncertain payload cannot be edited");
const uncertainDialog = uncertain.find(node => node.type === "dialog"); let prevented = false; uncertainDialog.props.onCancel({ preventDefault() { prevented = true; } });
check(prevented && uncertain.dom.open, "Escape cannot lose uncertain attempt");
uncertainAttempt = "unauthorized"; await uncertain.click("التحقق والمتابعة بنفس الحملة");
check(uncertain.button("إغلاق إنشاء الحملة").props.disabled, "expired auth after uncertain result cannot abandon original attempt");
uncertainAttempt = "unavailable"; await uncertain.click("التحقق والمتابعة بنفس الحملة");
check(uncertain.button("إغلاق إنشاء الحملة").props.disabled, "unavailable retry preserves uncertain lock");
uncertainAttempt = ""; await uncertain.click("التحقق والمتابعة بنفس الحملة");
check(uncertain.calls.create.every(call => JSON.stringify(call) === JSON.stringify(uncertain.calls.create[0])), "every retry keeps identical immutable payload and idempotency key");
equal(uncertain.calls.create.at(-1).coupon, { discountType: "percentage", discountValue: 20, minimumOrderAmount: 90, validityDays: 7, terms: "شروط الكوبون ثابتة أثناء إعادة المحاولة" }, "uncertain retries preserve full structured coupon and terms");

let createResolve;
const duplicate = harness({ create: () => new Promise(resolve => { createResolve = resolve; }) });
await duplicate.click("إنشاء رسالة أو عرض"); await duplicate.click("استخدام رسالة مقترحة"); await duplicate.click("مراجعة الحملة قبل الإرسال");
const send = duplicate.button("تأكيد الإرسال إلى ٣٠ عميل"); send.props.onClick(); send.props.onClick(); await settle();
equal(duplicate.calls.create.length, 1, "rapid confirmation double click sends one request");
createResolve({ ok: true, data: { campaignId: id(3), total: 30 } }); await settle();

const changed = harness({ create: () => ({ ok: false, code: "audience_changed", message: "تغيرت الشريحة" }) });
await changed.click("إنشاء رسالة أو عرض"); await changed.click("استخدام رسالة مقترحة"); await changed.click("مراجعة الحملة قبل الإرسال"); await changed.click("تأكيد الإرسال إلى ٣٠ عميل");
check(changed.field("analytics-campaign-body").props.value.includes(brand.name), "audience conflict preserves draft for new review");
check(changed.calls.audience.length === 3, "audience conflict reloads recipients");

const scheduled = harness();
await scheduled.click("إنشاء رسالة أو عرض"); await scheduled.click("استخدام رسالة مقترحة"); await scheduled.click("جدولة لوقت لاحق");
const future = form.analyticsCampaignSaudiInput(Date.now() + 3600000);
scheduled.edit("analytics-campaign-time", future);
await scheduled.click("مراجعة الحملة قبل الإرسال");
check(textOf(scheduled.render()).includes("بتوقيت الرياض"), "schedule review states correct timezone");
await scheduled.click("تأكيد الجدولة إلى ٣٠ عميل");
equal(scheduled.calls.create[0].scheduledAt, form.analyticsCampaignSchedule(future).scheduledAt, "scheduled request carries exact Riyadh conversion");
check(textOf(scheduled.render()).includes("تمت جدولة الحملة"), "scheduled success accurately names queue state");

const scheduledCoupon = harness();
await scheduledCoupon.click("إنشاء رسالة أو عرض"); await scheduledCoupon.click("كوبون شخصي"); await scheduledCoupon.click("مبلغ ثابت");
await scheduledCoupon.click("استخدام رسالة مقترحة"); scheduledCoupon.edit("analytics-coupon-value", "25.75");
scheduledCoupon.edit("analytics-coupon-minimum", "100.5"); scheduledCoupon.edit("analytics-coupon-validity", "14");
await scheduledCoupon.click("جدولة لوقت لاحق"); scheduledCoupon.edit("analytics-campaign-time", future);
const fixedCoupon = { discountType: "fixed", discountValue: 25.75, minimumOrderAmount: 100.5, validityDays: 14, terms: "" };
const fixedExpected = couponApi.buildAnalyticsCouponMessage(scheduledCoupon.field("analytics-campaign-body").props.value, fixedCoupon, "كود خاص لكل عميل", form.analyticsCampaignSchedule(future).scheduledAt);
await scheduledCoupon.click("مراجعة الحملة قبل الإرسال");
equal(textOf(scheduledCoupon.find(node => node.props?.className === "reviewBody")), fixedExpected, "scheduled coupon expiry anchored exactly to selected Riyadh send time");
check(textOf(scheduledCoupon.render()).includes("موعد الإرسال المحدد"), "scheduled coupon review states validity start");
await scheduledCoupon.click("العودة للتعديل"); scheduledCoupon.edit("analytics-coupon-validity", "21");
scheduledCoupon.edit("analytics-coupon-terms", "شرط مراجع قبل التأكيد"); await scheduledCoupon.click("مراجعة الحملة قبل الإرسال");
check(textOf(scheduledCoupon.render()).includes("شرط مراجع قبل التأكيد"), "edited coupon terms require fresh review before send");
await scheduledCoupon.click("تأكيد الجدولة إلى ٣٠ عميل");
equal(scheduledCoupon.calls.create[0].coupon, { ...fixedCoupon, validityDays: 21, terms: "شرط مراجع قبل التأكيد" }, "scheduled payload matches revised fixed coupon review");
equal(scheduledCoupon.calls.create[0].scheduledAt, form.analyticsCampaignSchedule(future).scheduledAt, "coupon schedule survives review edits exactly");

let previews = 0;
const freshCount = harness({ audience: input => ({ ok: true, data: audience(input, ++previews > 1 ? { total: 29, excluded: 4 } : {}) }) });
await freshCount.click("إنشاء رسالة أو عرض"); await freshCount.click("استخدام رسالة مقترحة"); await freshCount.click("مراجعة الحملة قبل الإرسال");
check(Boolean(freshCount.button("تأكيد الإرسال إلى ٢٩ عميل")), "final confirmation displays refreshed recipient count");
const oversized = harness({ audience: input => ({ ok: true, data: audience(input, { matched: 10001, total: 10001, excluded: 0 }) }) });
await oversized.click("إنشاء رسالة أو عرض"); await oversized.click("استخدام رسالة مقترحة"); await oversized.click("مراجعة الحملة قبل الإرسال");
check(textOf(oversized.render()).includes("الحملة تستوعب حتى ١٠ آلاف"), "oversized campaign requires smaller segment");
check(oversized.calls.create.length === 0, "oversized segment never queued");

const pending = [];
const stale = harness({ audience: input => new Promise(resolve => pending.push({ input, resolve })) });
stale.button("إنشاء رسالة أو عرض").props.onClick(); stale.render();
stale.button("الأكثر ولاء وانتظامًا").props.onClick(); stale.render();
pending[1].resolve({ ok: true, data: audience(pending[1].input, { items: [{ ...audience(pending[1].input).items[0], name: "النتيجة الحديثة" }] }) }); await settle(); stale.render();
pending[0].resolve({ ok: true, data: audience(pending[0].input, { items: [{ ...audience(pending[0].input).items[0], name: "النتيجة القديمة" }] }) }); await settle();
check(textOf(stale.render()).includes("النتيجة الحديثة") && !textOf(stale.render()).includes("النتيجة القديمة"), "late old segment response ignored");

let closeResolve;
const closed = harness({ audience: input => new Promise(resolve => { closeResolve = () => resolve({ ok: true, data: audience(input) }); }) });
closed.button("إنشاء رسالة أو عرض").props.onClick(); closed.render();
await closed.click("إغلاق إنشاء الحملة"); closeResolve(); await settle();
check(!closed.dom.open && !textOf(closed.render()).includes("عميل اصطناعي"), "late audience reply after close is discarded");

const source = fs.readFileSync(componentPath, "utf8"), css = fs.readFileSync("components/admin/brand-analytics-campaign.module.css", "utf8");
check(source.includes('role="alert"') && source.includes("errorPanel.current?.focus"), "focusable and announced validation summary");
check(source.includes('dir="ltr"') && source.includes("<bdi"), "phone direction isolated in RTL");
check(css.includes("100dvh") && css.includes("max-width: 480px") && css.includes("grid-template-columns: 1fr"), "dialog small viewport and stacked composer styles");
check(css.includes("min-height: 44px") && css.includes(":focus-visible"), "touch targets and keyboard focus");
console.log(`Brand analytics campaign UI: ${checks} checks passed`);
