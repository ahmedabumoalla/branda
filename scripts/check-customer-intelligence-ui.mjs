import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { transform } from 'lightningcss';
const dependency = createRequire(import.meta.url);
const file = 'components/admin/pages/admin-customers-page.tsx';
function load(file, stubs = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('require', 'exports', output)(name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (name.startsWith('@/')) return load(path.resolve(name.slice(2) + '.ts'), stubs);
    return dependency(name);
  }, exports);
  return exports;
}
const brand = { id: 'brand-one', name: 'علامة أولى', slug: 'one', joinedAt: '2026-10-01T11:00:00Z', status: 'active', stamps: 4, scans: 7, rewards: 1 };
const person = { id: 'customer-one', name: 'عميل الاختبار', phone: '966500000001', email: 'customer@example.invalid', status: 'active', joinedAt: '2026-10-01T11:00:00Z', brands: [brand, { ...brand, id: 'two', name: 'علامة ثانية' }, { ...brand, id: 'three', name: 'علامة ثالثة' }], brandCount: 3, identityMatch: 'phone', lastActivity: { at: '2026-10-10T10:20:00Z', kind: 'scan', brandName: brand.name, source: 'loyalty' }, lastSeenAt: null, device: null, activeSeconds: null, sessions: 0, menuSessions: 0, loyaltySessions: 0, scans: 7, stamps: 4, rewards: 1 };
const page = { customers: [person], total: 45, page: 1, pageSize: 20, brands: [brand], summary: { customers: 45, shared: 9, activeToday: 6, measured: 0, activeSeconds: 0 }, recordingStartedAt: '2026-10-10T00:00:00Z', generatedAt: '2026-10-10T10:00:00Z' };
const device = { type: 'mobile', name: 'iPhone', os: 'iOS', browser: 'Safari' };
const event = { id: 'event-one', at: '2026-10-10T10:15:00Z', kind: 'loyalty_qr_visit', source: 'browser', brandName: brand.name, outcome: 'success', activeSeconds: 90, device, detail: null };
const detail = { customer: { ...person, device, lastSeenAt: event.at, activeSeconds: 90, sessions: 2, menuSessions: 1, loyaltySessions: 1 }, events: [event], total: 21, page: 1, pageSize: 20, recordingStartedAt: page.recordingStartedAt, generatedAt: page.generatedAt };
function harness(props = {}, actions = {}) {
  const state = [], calls = [], effects = []; let cursor = 0;
  const hooks = { ...React, useEffect(fn) { effects.push(fn); }, useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], value => state[i] = typeof value === 'function' ? value(state[i]) : value]; }, useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; } };
  const module = load(file, { react: hooks, '@/app/actions/customer-intelligence': {
    fetchCustomerIntelligenceAction: async input => { calls.push(['page', input]); return { ok: true, data: { ...page, page: input.page } }; },
    fetchCustomerIntelligenceDetailAction: async input => { calls.push(['detail', input]); return { ok: true, data: { ...detail, page: input.page } }; }, ...actions,
  } });
  return { calls, effects, module, render() { cursor = 0; effects.length = 0; return module.AdminCustomersPage({ initialData: page, ...props }); } };
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
function text(tree) { return tree == null || typeof tree === 'boolean' ? '' : Array.isArray(tree) ? tree.map(text).join('') : typeof tree === 'object' ? text(tree.props?.children) : String(tree); }
const button = (h, label) => nodes(h.render()).find(node => node.type === 'button' && text(node).trim() === label);
const ariaButton = (h, label) => nodes(h.render()).find(node => node.type === 'button' && node.props['aria-label'] === label);
const html = h => renderToStaticMarkup(h.render());
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

const h = harness();
for (const value of [person.name, person.phone, 'قراءة بطاقة الولاء', '٤٥', '٩', 'غير متاح', 'لم يبدأ القياس لهذا العميل', '2026-10-10', 'ولا يشمل وقت الخلفية']) assert.ok(html(h).includes(value), value);
assert.ok(!html(h).includes('إيقاف العميل'), 'no fake local-only mutation');
assert.equal(h.module.customerDuration(null), 'غير متاح');
assert.equal(h.module.customerDuration(0), '٠ ثانية');
assert.equal(h.module.customerDuration(3661), '١ ساعة و١ دقيقة');
button(h, 'التالي').props.onClick(); await settle();
assert.equal(h.calls.at(-1)[1].page, 2);
button(h, 'أكثر من علامة').props.onClick(); await settle();
assert.equal(h.calls.at(-1)[1].page, 1); assert.equal(h.calls.at(-1)[1].segment, 'shared');
const search = nodes(h.render()).find(node => node.type === 'input');
search.props.onChange({ target: { value: 'عميل' } });
nodes(h.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); await settle();
assert.equal(h.calls.at(-1)[1].search, 'عميل');
const selects = nodes(h.render()).filter(node => node.type === 'select');
selects[0].props.onChange({ target: { value: brand.id } }); await settle();
assert.equal(h.calls.at(-1)[1].brandId, brand.id); assert.equal(h.calls.at(-1)[1].search, 'عميل');
selects[1].props.onChange({ target: { value: 'time' } }); await settle();
assert.equal(h.calls.at(-1)[1].sort, 'time');

ariaButton(h, `عرض ملف ${person.name}`).props.onClick();
assert.ok(html(h).includes('جارٍ تحميل رحلة العميل'));
await settle();
for (const value of ['علامة ثالثة', 'علاقته بالعلامات', 'رقم الجوال المطابق', 'iPhone', 'Safari', 'فتح الولاء من رابط QR', 'لا يثبت استخدام كاميرا الهاتف', 'قد لا يتوفر طراز الجوال الدقيق', 'مكتملة', 'الزيارات المجهولة لا تنسب إلى ملفه']) assert.ok(html(h).includes(value), value);
ariaButton(h, 'صفحة النشاط التالية').props.onClick(); await settle();
assert.equal(h.calls.at(-1)[1].page, 2);
button(h, 'المحفظة').props.onClick(); await settle();
assert.deepEqual(h.calls.at(-1), ['detail', { customerId: person.id, page: 1, kind: 'wallet' }]);
ariaButton(h, 'إغلاق ملف العميل').props.onClick();
assert.ok(!html(h).includes('علاقته بالعلامات'));

// New filter responses win even when older requests finish last
const pending = [];
const race = harness({}, { fetchCustomerIntelligenceAction: input => new Promise(resolve => pending.push({ input, resolve })) });
button(race, 'أكثر من علامة').props.onClick();
button(race, 'بلا قياس للمدة').props.onClick();
pending[1].resolve({ ok: true, data: { ...page, customers: [{ ...person, name: 'النتيجة الحديثة' }] } }); await settle();
pending[0].resolve({ ok: true, data: { ...page, customers: [{ ...person, name: 'النتيجة القديمة' }] } }); await settle();
assert.ok(html(race).includes('النتيجة الحديثة')); assert.ok(!html(race).includes('النتيجة القديمة'));
const detailPending = [];
const detailRace = harness({}, { fetchCustomerIntelligenceDetailAction: input => new Promise(resolve => detailPending.push({ input, resolve })) });
ariaButton(detailRace, `عرض ملف ${person.name}`).props.onClick();
button(detailRace, 'المحفظة').props.onClick();
detailPending[1].resolve({ ok: true, data: { ...detail, events: [{ ...event, kind: 'download', source: 'wallet' }] } }); await settle();
detailPending[0].resolve({ ok: true, data: detail }); await settle();
assert.ok(html(detailRace).includes('تنزيل بطاقة المحفظة')); assert.ok(!html(detailRace).includes('فتح الولاء من رابط QR'));
// Closing invalidates in-flight details and never reopens the panel
button(detailRace, 'التصفح').props.onClick();
ariaButton(detailRace, 'إغلاق ملف العميل').props.onClick();
detailPending[2].resolve({ ok: true, data: detail }); await settle();
assert.ok(!html(detailRace).includes('علاقته بالعلامات'));

let fail = true;
const failure = harness({}, { fetchCustomerIntelligenceAction: async () => fail ? { ok: false, message: 'تعذر الاتصال' } : { ok: true, data: page } });
button(failure, 'تحديث البيانات').props.onClick(); await settle();
assert.ok(html(failure).includes('تعذر الاتصال')); fail = false;
button(failure, 'إعادة المحاولة').props.onClick(); await settle();
assert.ok(!html(failure).includes('تعذر الاتصال'));
const detailFailure = harness({}, { fetchCustomerIntelligenceDetailAction: async () => { throw new Error('offline'); } });
ariaButton(detailFailure, `عرض ملف ${person.name}`).props.onClick(); await settle();
assert.ok(html(detailFailure).includes('تعذر تحميل نشاط العميل')); assert.ok(button(detailFailure, 'إعادة تحميل النشاط'));
const empty = harness({ initialData: { ...page, customers: [], total: 0 } });
assert.ok(html(empty).includes('لا يوجد عملاء بهذه الخيارات'));
button(empty, 'مسح الفلاتر').props.onClick(); await settle();
assert.deepEqual(empty.calls.at(-1)[1], { search: '', brandId: '', segment: 'all', sort: 'recent', page: 1 });
const unavailable = harness({ initialData: null, configError: 'الخادم غير متاح' });
assert.ok(html(unavailable).includes('الخادم غير متاح'));
assert.ok(!html(unavailable).includes('ملخص جميع نتائج البحث'), 'failed reads never display invented zero totals');
button(unavailable, 'إعادة المحاولة').props.onClick(); await settle();
assert.ok(html(unavailable).includes(person.name), 'initial failure is recoverable without reload');

// Native modal API supplies focus containment and Escape semantics with explicit restoration
const focus = harness(); ariaButton(focus, `عرض ملف ${person.name}`).props.onClick(); await settle();
const tree = focus.render(); const dialog = nodes(tree).find(node => node.type === 'dialog');
let shown = 0, closed = 0, restored = 0;
class FakeHTMLElement { focus() { restored++; } }
globalThis.HTMLElement = FakeHTMLElement;
globalThis.document = { activeElement: new FakeHTMLElement(), body: { style: { overflow: 'auto' } } };
dialog.props.ref.current = { open: false, showModal() { shown++; }, close() { closed++; } };
const cleanup = focus.effects[0]();
assert.equal(shown, 1); assert.equal(document.body.style.overflow, 'hidden');
cleanup(); assert.equal(closed, 1); assert.equal(restored, 1); assert.equal(document.body.style.overflow, 'auto');
dialog.props.onCancel(); assert.ok(!html(focus).includes('علاقته بالعلامات'));
delete globalThis.document; delete globalThis.HTMLElement;

const css = fs.readFileSync('components/admin/pages/admin-customers-page.module.css', 'utf8');
const compiled = transform({ filename: 'admin-customers-page.module.css', code: Buffer.from(css), cssModules: true });
for (const [, name] of fs.readFileSync(file, 'utf8').matchAll(/\bs\.(\w+)/g)) assert.ok(compiled.exports[name], name);
assert.ok(css.includes('max-width:640px') && css.includes(':focus-visible') && css.includes('prefers-reduced-motion'));
console.log('PASS customer intelligence UI: real summary/unknown data, all brand links, source labels, filters/pagination, detail timeline, stale-response protection, error/retry, native modal focus and responsive CSS');
