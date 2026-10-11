import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { transform } from 'lightningcss';

const require = createRequire(import.meta.url);
const source = fs.readFileSync('components/loyalty/customer-directory.tsx', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
let checks = 0;
const check = (label, fn) => { fn(); checks++; console.log(`PASS ${label}`); };
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => tree == null || typeof tree === 'boolean' ? '' : Array.isArray(tree) ? tree.map(text).join('') : typeof tree === 'object' ? text(tree.props?.children) : String(tree);
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const row = { id: 'customer-a', name: 'عميل الاختبار', joinedAt: '2026-10-11T01:00:00Z' };
const page = { rows: [row], page: 0, pageSize: 20, total: 21 };
const detail = { id: row.id, name: row.name, phone: '+966500000001' };
const timers = new Map(); let timerId = 0;
globalThis.window = { setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; }, clearTimeout(id) { timers.delete(id); } };
const runTimers = () => { const queued = [...timers.values()]; timers.clear(); queued.forEach(timer => timer.fn()); };
class Element { isConnected = true; focused = 0; focus() { this.focused++; } }
globalThis.HTMLElement = Element;
globalThis.document = { activeElement: new Element() };

function harness(exportName = 'LoyaltyCustomerDirectory', props = {}, overrides = {}) {
  const slots = []; let cursor = 0; const pending = []; const calls = [];
  const hooks = { ...React,
    useId() { const i = cursor++; return `test-${i}`; },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useCallback(fn) { cursor++; return fn; },
    useEffect(fn, dependencies) { const i = cursor++; const old = slots[i]; if (!old || dependencies.some((value, index) => !Object.is(value, old.dependencies[index]))) { old?.cleanup?.(); slots[i] = { dependencies }; pending.push(() => { slots[i].cleanup = fn(); }); } },
  };
  const exports = {};
  const actions = {
    loadLoyaltyCustomersAction: async input => { calls.push(['list', input]); return { ok: true, data: page }; },
    loadLoyaltyCustomerDetailAction: async id => { calls.push(['detail', id]); return { ok: true, data: detail }; }, ...overrides,
  };
  new Function('require', 'exports', compiled)(name => {
    if (name === 'react') return hooks;
    if (name === '@/app/actions/loyalty-customers') return actions;
    if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    return require(name);
  }, exports);
  const modal = { open: false, opens: 0, closes: 0, showModal() { this.open = true; this.opens++; }, close() { this.open = false; this.closes++; } };
  return { calls, modal,
    render() { cursor = 0; const tree = exports[exportName](props); const dialog = nodes(tree).find(node => node.type === 'dialog'); if (dialog) dialog.props.ref.current = modal; return tree; },
    effects() { pending.splice(0).forEach(fn => fn()); },
    cleanup() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}
const element = (h, predicate) => nodes(h.render()).find(predicate);
const button = (h, label) => element(h, n => n.type === 'button' && (n.props['aria-label'] === label || text(n) === label));
const html = h => renderToStaticMarkup(h.render());
const boot = async h => { h.render(); h.effects(); runTimers(); await settle(); return h; };

const h = harness();
check('initial state announces loading and sends no detail query', () => { assert.match(html(h), /جار تحميل سجل العملاء/); assert.equal(h.calls.length, 0); });
h.effects(); runTimers(); await settle();
check('directory requests one bounded name page only on mount', () => { assert.deepEqual(h.calls, [['list', { page: 0, query: '' }]]); });
check('semantic table displays names without phone or hidden contact data', () => { const value = html(h); assert.match(value, /<table/); assert.match(value, /scope="col"/); assert.match(value, /عميل الاختبار/); assert.ok(!value.includes(detail.phone)); assert.ok(!value.includes('رقم الجوال')); });
check('name is a keyboard accessible button that opens an individual dialog', () => { const target = button(h, `عرض ملف ${row.name}`); assert.equal(target.props['aria-haspopup'], 'dialog'); target.props.onClick(); const child = element(h, node => typeof node.type === 'function' && node.type.name === 'LoyaltyCustomerDetailDialog'); assert.equal(child.props.customer.id, row.id); assert.equal(h.calls.length, 1); child.props.onClose(); assert.ok(!element(h, node => typeof node.type === 'function' && node.type.name === 'LoyaltyCustomerDetailDialog')); });
button(h, 'الصفحة التالية').props.onClick(); h.render(); h.effects(); runTimers(); await settle();
check('next page calls server with zero-based index', () => assert.equal(h.calls.at(-1)[1].page, 1));
element(h, node => node.type === 'input').props.onChange({ target: { value: '  نورة ' } }); h.render(); h.effects();
check('name search is debounced and resets pagination', () => { assert.equal([...timers.values()][0].delay, 300); assert.equal(h.calls.length, 2); });
runTimers(); await settle();
check('search sends trimmed query on first page', () => assert.deepEqual(h.calls.at(-1)[1], { page: 0, query: 'نورة' }));
button(h, 'مسح البحث').props.onClick(); h.render(); h.effects(); runTimers(); await settle();
check('clear search resets name filter', () => assert.deepEqual(h.calls.at(-1)[1], { page: 0, query: '' }));
h.cleanup();

const deferred = [];
const stale = harness(undefined, {}, { loadLoyaltyCustomersAction: input => new Promise(resolve => deferred.push({ input, resolve })) });
stale.render(); stale.effects(); runTimers();
element(stale, node => node.type === 'input').props.onChange({ target: { value: 'جديد' } }); stale.render(); stale.effects(); runTimers();
deferred[1].resolve({ ok: true, data: { ...page, rows: [{ ...row, name: 'النتيجة الجديدة' }] } }); await settle();
deferred[0].resolve({ ok: true, data: { ...page, rows: [{ ...row, name: 'النتيجة القديمة' }] } }); await settle();
check('late search responses cannot replace newer results', () => { assert.match(html(stale), /النتيجة الجديدة/); assert.ok(!html(stale).includes('النتيجة القديمة')); }); stale.cleanup();

let attempt = 0;
const retry = await boot(harness(undefined, {}, { loadLoyaltyCustomersAction: async () => { if (++attempt === 1) throw Error('network'); return { ok: true, data: page }; } }));
check('transport failure renders actionable alert', () => { assert.match(html(retry), /role="alert"/); assert.ok(button(retry, 'إعادة المحاولة')); });
button(retry, 'إعادة المحاولة').props.onClick(); retry.render(); retry.effects(); runTimers(); await settle();
check('retry replaces failure with real data', () => { assert.equal(attempt, 2); assert.match(html(retry), /<table/); assert.ok(!html(retry).includes('role="alert"')); }); retry.cleanup();

const empty = await boot(harness(undefined, {}, { loadLoyaltyCustomersAction: async () => ({ ok: true, data: { ...page, rows: [], total: 0 } }) }));
check('empty directory gives honest enrollment state without invented records', () => { assert.match(html(empty), /تظهر أسماء العملاء هنا بعد تسجيلهم/); assert.ok(!html(empty).includes('<table')); assert.ok(!button(empty, 'الصفحة التالية')); }); empty.cleanup();
const denial = await boot(harness(undefined, {}, { loadLoyaltyCustomersAction: async () => ({ ok: false, message: 'غير مصرح بعرض العملاء' }) }));
check('server authorization error is shown without stale names or counts', () => { assert.match(html(denial), /غير مصرح/); assert.ok(!html(denial).includes(row.name)); }); denial.cleanup();

let closed = 0;
const opener = document.activeElement;
const modal = harness('LoyaltyCustomerDetailDialog', { customer: row, onClose: () => { closed++; } });
check('detail starts without any phone or copy-all control', () => { assert.ok(!html(modal).includes(detail.phone)); assert.ok(!html(modal).includes('نسخ')); });
modal.effects(); await settle();
check('opening selected customer invokes one dedicated detail query', () => { assert.deepEqual(modal.calls, [['detail', row.id]]); assert.equal(modal.modal.opens, 1); assert.match(html(modal), /\+966500000001/); assert.match(html(modal), /<bdi dir="ltr">/); });
check('detail name text remains safely escaped', () => { const safe = harness('LoyaltyCustomerDetailDialog', { customer: { ...row, name: '<script>alert(1)</script>' }, onClose() {} }); assert.match(html(safe), /&lt;script&gt;/); assert.ok(!html(safe).includes('<script>')); });
const dialog = element(modal, n => n.type === 'dialog'); let prevented = false;
dialog.props.onCancel({ preventDefault() { prevented = true; } });
check('Escape delegates close to parent state', () => { assert.equal(prevented, true); assert.equal(closed, 1); });
button(modal, 'إغلاق ملف العميل').props.onClick();
check('visible close action dismisses the individual profile', () => assert.equal(closed, 2));
modal.cleanup();
check('dialog cleanup closes native modal and restores opener focus', () => { assert.equal(modal.modal.closes, 1); assert.equal(opener.focused, 1); });

let lateResolve;
const late = harness('LoyaltyCustomerDetailDialog', { customer: row, onClose() {} }, { loadLoyaltyCustomerDetailAction: () => new Promise(resolve => { lateResolve = resolve; }) });
late.render(); late.effects(); late.cleanup(); lateResolve({ ok: true, data: detail }); await settle();
check('closing before request completion discards the phone response', () => assert.ok(!html(late).includes(detail.phone)));
let detailAttempts = 0;
const detailRetry = harness('LoyaltyCustomerDetailDialog', { customer: row, onClose() {} }, { loadLoyaltyCustomerDetailAction: async () => ++detailAttempts === 1 ? { ok: false, message: 'تعذر التحميل' } : { ok: true, data: { ...detail, phone: null } } });
detailRetry.render(); detailRetry.effects(); await settle();
button(detailRetry, 'إعادة المحاولة').props.onClick(); detailRetry.render(); detailRetry.effects(); await settle();
check('detail retry supports missing phone without invented number', () => { assert.equal(detailAttempts, 2); assert.match(html(detailRetry), /رقم الجوال غير متوفر/); assert.ok(!html(detailRetry).includes(detail.phone)); }); detailRetry.cleanup();

const css = fs.readFileSync('components/loyalty/customer-directory.module.css', 'utf8');
transform({ filename: 'customer-directory.module.css', code: Buffer.from(css), minify: false });
check('CSS compiles and covers narrow screens long names focus and reduced motion', () => { for (const value of ['max-width: 640px', 'overflow-wrap: anywhere', ':focus-visible', 'prefers-reduced-motion', 'min-height: 48px']) assert.ok(css.includes(value)); });
check('phone is not artificially unselectable or masked by client tricks', () => { assert.ok(!css.includes('user-select: none')); assert.ok(!source.includes('onCopy')); assert.ok(!source.includes('navigator.clipboard')); });
console.log(`${checks} loyalty directory UI checks passed`);
