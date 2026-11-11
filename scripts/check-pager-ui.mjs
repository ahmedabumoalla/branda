import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { transform } from 'lightningcss';

const require = createRequire(import.meta.url);
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
function load(file, stubs = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('require', 'exports', output)(name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name === '@/components/cashier/cashier-language') return { CashierLanguageSwitch: () => null, useCashierLanguage: () => ({ locale: 'ar', dir: 'rtl', t: value => typeof value === 'string' ? value : value.text.replace(/\{(\w+)\}/g, (_, key) => String(value.values[key])), errorText: value => value }) };
    if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (name.startsWith('@/') || name.startsWith('./')) {
      const base = name.startsWith('@/') ? path.resolve(name.slice(2)) : path.resolve(path.dirname(file), name);
      return load(fs.existsSync(base + '.tsx') ? base + '.tsx' : base + '.ts', stubs);
    }
    return require(name);
  }, exports);
  return exports;
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
function text(tree) { return tree == null || typeof tree === 'boolean' ? '' : Array.isArray(tree) ? tree.map(text).join('') : typeof tree === 'object' ? text(tree.props?.children) : String(tree); }
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const order = { id: randomUUID(), cafeId: randomUUID(), invoiceNumber: '  00012-A / ب  ', phone: '966500000001', status: 'waiting', createdAt: '2026-10-10T21:01:00Z', readyAt: null, receivedAt: null, createdBy: 'الموظف', createdStation: 'البار', calledBy: null, calledStation: null, rating: null, notes: '', ratedAt: null, messageStatus: null, lastMessageAt: null, messageCount: 0 };
const page = { orders: [order], page: 0, pageSize: 30, total: 1, metrics: { total: 1, waiting: 1, ready: 0, received: 0, cancelled: 0, averagePreparationSeconds: null, averageCollectionSeconds: null, averageRating: null, ratedCount: 0 } };
const context = { cafeId: order.cafeId, cafeName: 'علامة الاختبار', actorName: 'الموظف', station: 'البار', kind: 'staff', canUseLoyalty: false };
globalThis.window = { setTimeout, clearTimeout, setInterval, clearInterval, addEventListener() {}, removeEventListener() {}, confirm: () => true };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
if (!globalThis.crypto) globalThis.crypto = { randomUUID };
globalThis.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };

function harness(file, exportName, props, actions = {}, additions = {}) {
  const state = [], effects = [], calls = []; let cursor = 0;
  const hooks = { ...React, useEffect(fn) { effects.push(fn); }, useCallback(fn) { return fn; }, useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], v => state[i] = typeof v === 'function' ? v(state[i]) : v]; }, useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; } };
  const module = load(file, { react: hooks, 'next/link': { __esModule: true, default: ({ children, ...p }) => React.createElement('a', p, children) }, 'react-dom': { createPortal: (children) => children }, '@/app/actions/cashier': { logoutCashierAction: async () => {} }, '@/app/actions/pager': {
    fetchPagerPageAction: async (...args) => { calls.push(['fetch', ...args]); return page; },
    createPagerOrderAction: async input => { calls.push(['create', input]); return { ok: true, order: { ...order, ...input } }; },
    updatePagerOrderAction: async (...args) => { calls.push(['update', ...args]); return { ok: true, order }; },
    submitPagerFeedbackAction: async (...args) => { calls.push(['feedback', ...args]); return { ok: true }; }, ...actions,
  }, ...additions });
  return { effects, calls, render() { cursor = 0; effects.length = 0; return module[exportName](props); } };
}
const consoleHarness = (actions = {}, props = {}, additions = {}) => harness('components/pager/pager-console.tsx', 'PagerConsole', { context, initialPage: page, ...props }, actions, additions);
const button = (h, label) => nodes(h.render()).find(n => n.type === 'button' && text(n).trim() === label);
const input = (h, name) => nodes(h.render()).find(n => n.type === 'input' && n.props.name === name);
const form = h => nodes(h.render()).find(n => n.type === 'form' && n.props.onSubmit);
const html = h => renderToStaticMarkup(h.render());

const queueTrigger = (h, label) => nodes(h.render()).find(n => n.type === 'button' && n.props['aria-haspopup'] === 'dialog' && text(n).startsWith(label));
const openQueue = (h, label = 'جاهز للاستلام') => queueTrigger(h, label).props.onClick({ currentTarget: { focus() {} } });
const h = consoleHarness();
check('home keeps the entry and queue buttons without squeezing invoice cards underneath', () => { assert.ok(form(h)); assert.ok(queueTrigger(h, 'جاهز للاستلام')); assert.ok(!nodes(h.render()).some(n => n.type?.name === 'PagerOrderCard' || n.type === 'dialog')); });
openQueue(h); await tick();
check('pickup trigger opens a labelled dialog containing the invoice and preserves entry draft', () => { assert.ok(nodes(h.render()).some(n => n.type === 'dialog' && n.props['aria-labelledby'] === 'pager-queue-title')); assert.match(html(h), /00012-A/); });
check('invoice reference remains text with leading zero and original whitespace', () => { assert.equal(input(h, 'invoiceNumber').props.type, undefined); assert.match(html(h), /00012-A \/ ب/); });
check('staff without loyalty permission sees no loyalty link', () => assert.ok(!html(h).includes('href="/cashier"')));
check('permitted staff can switch to loyalty', () => assert.ok(html(consoleHarness({}, { context: { ...context, canUseLoyalty: true } })).includes('href="/cashier"')));
check('owner has staff management link', () => assert.ok(html(consoleHarness({}, { mode: 'owner' })).includes('/dashboard/cashier')));
input(h, 'invoiceNumber').props.onChange({ target: { value: order.invoiceNumber } });
input(h, 'phone').props.onChange({ target: { value: '0500000001' } });
await form(h).props.onSubmit({ preventDefault() {} });
check('create sends exact invoice reference and only explicit phone without automatically calling the customer', () => { assert.ok(!h.calls.some(c => c[0] === 'update')); assert.ok(!html(h).includes('قيد التجهيز')); const call = h.calls.find(c => c[0] === 'create')[1]; assert.equal(call.invoiceNumber, order.invoiceNumber); assert.equal(call.phone, '0500000001'); assert.match(call.id, /^[0-9a-f-]{36}$/); });
check('successful create resets both fields and refreshes queue', () => { assert.equal(input(h, 'invoiceNumber').props.value, ''); assert.equal(input(h, 'phone').props.value, ''); assert.ok(h.calls.some(c => c[0] === 'fetch')); });

const attempts = [];
const retry = consoleHarness({ createPagerOrderAction: async input => { attempts.push(input); throw Error('network'); } });
input(retry, 'invoiceNumber').props.onChange({ target: { value: '0001' } }); input(retry, 'phone').props.onChange({ target: { value: '0500000001' } });
await form(retry).props.onSubmit({ preventDefault() {} }); await form(retry).props.onSubmit({ preventDefault() {} });
check('uncertain create retry reuses id and preserves fields', () => { assert.equal(attempts[0].id, attempts[1].id); assert.equal(input(retry, 'invoiceNumber').props.value, '0001'); assert.match(html(retry), /role="alert"/); });
input(retry, 'invoiceNumber').props.onChange({ target: { value: '0002' } }); await form(retry).props.onSubmit({ preventDefault() {} });
check('changed draft gets a new idempotency key', () => assert.notEqual(attempts[1].id, attempts[2].id));

let resolveCreate; let createCalls = 0;
const double = consoleHarness({ createPagerOrderAction: () => { createCalls++; return new Promise(resolve => { resolveCreate = resolve; }); } });
const pending = form(double).props.onSubmit({ preventDefault() {} }); await form(double).props.onSubmit({ preventDefault() {} });
check('double submission cannot create two requests', () => assert.equal(createCalls, 1));
resolveCreate({ ok: true, order }); await pending;

const { PagerOrderCard } = load('components/pager/pager-order-card.tsx');
const card = props => renderToStaticMarkup(React.createElement(PagerOrderCard, { order, ...props }));
check('ready action only on waiting order', () => assert.match(card({ onChange() {} }), /الطلب جاهز/));
check('received action replaces ready action after dispatch', () => { const value = card({ order: { ...order, status: 'ready', readyAt: '2026-10-10T21:02:00Z' }, onChange() {} }); assert.ok(!value.includes('الطلب جاهز')); assert.ok(value.includes('تم الاستلام')); });
check('received orders have no mutation controls', () => assert.ok(!card({ order: { ...order, status: 'received' }, onChange() {} }).includes('<button')));
check('provider acceptance is not claimed as delivery', () => { const value = card({ order: { ...order, messageStatus: 'provider_queued' } }); assert.match(value, /قبلها مزود واتساب للإرسال/); assert.ok(!value.includes('تم التسليم')); });
check('malicious invoice and notes are escaped', () => { const value = card({ order: { ...order, invoiceNumber: '<script>x</script>', rating: 3, notes: '<img src=x onerror=alert(1)>' } }); assert.ok(value.includes('&lt;script&gt;')); assert.ok(!value.includes('<script>')); assert.ok(!value.includes('<img src=x')); });
check('lifecycle timing uses Riyadh year month day', () => assert.match(card({}), /2026\/10\/11 00:01/));
check('admin mode card is read only', () => assert.ok(!card({}).includes('<button')));

const feedback = harness('components/pager/pager-feedback.tsx', 'PagerFeedbackForm', { token: 'a'.repeat(64), initialFeedback: { brandName: 'العلامة', invoiceNumber: '0001-A', rating: null, notes: '', submitted: false } });
await form(feedback).props.onSubmit({ preventDefault() {} });
check('rating is required before submission', () => { assert.equal(feedback.calls.length, 0); assert.match(html(feedback), /اختر تقييمك/); });
nodes(feedback.render()).find(n => n.type === 'button' && n.props['aria-label']?.startsWith('4 ')).props.onClick();
nodes(feedback.render()).find(n => n.type === 'textarea').props.onChange({ target: { value: 'خدمة جميلة' } });
await form(feedback).props.onSubmit({ preventDefault() {} });
check('feedback sends selected rating with notes then closes form', () => { assert.deepEqual(feedback.calls[0], ['feedback', 'a'.repeat(64), 4, 'خدمة جميلة']); assert.ok(!html(feedback).includes('<form')); assert.match(html(feedback), /شكرًا لرأيك/); });

const noPip = consoleHarness();
input(noPip, 'invoiceNumber').props.onChange({ target: { value: '0008-A' } });
input(noPip, 'phone').props.onChange({ target: { value: '0500000001' } });
await button(noPip, 'نافذة فوق التطبيقات').props.onClick(); await tick();
check('unsupported external window never silently opens an in-page dialog', () => {
  assert.ok(!nodes(noPip.render()).some(n => n.type === 'dialog'));
  assert.match(html(noPip), /تحتاج تطبيق نداء برندة/);
  assert.ok(html(noPip).includes('/pager/download'));
});
button(noPip, 'عرض مصغر داخل الصفحة').props.onClick();
check('browser without PiP opens an accessible compact dialog with working controls', () => {
  assert.ok(nodes(noPip.render()).some(n => n.type === 'dialog' && n.props['aria-label']));
  assert.ok(button(noPip, 'إرجاع للصفحة'));
  assert.equal(input(noPip, 'invoiceNumber').props.value, '0008-A');
  assert.equal(input(noPip, 'phone').props.value, '0500000001');
});
await form(noPip).props.onSubmit({ preventDefault() {} });
check('mobile compact form uses the same authorized create and refresh actions', () => {
  assert.equal(noPip.calls.find(c => c[0] === 'create')[1].invoiceNumber, '0008-A');
  assert.ok(noPip.calls.some(c => c[0] === 'fetch'));
});
input(noPip, 'invoiceNumber').props.onChange({ target: { value: '0009-B' } });
button(noPip, 'إرجاع للصفحة').props.onClick();
check('restoring full page keeps the next unsaved draft', () => {
  assert.ok(button(noPip, 'نافذة فوق التطبيقات'));
  assert.equal(input(noPip, 'invoiceNumber').props.value, '0009-B');
});
button(noPip, 'عرض مصغر داخل الصفحة').props.onClick();
let cancelled = false;
nodes(noPip.render()).find(n => n.type === 'dialog').props.onCancel({ preventDefault() { cancelled = true; } });
check('native Escape dismisses compact mode without losing form state', () => { assert.ok(cancelled); assert.ok(button(noPip, 'نافذة فوق التطبيقات')); assert.equal(input(noPip, 'invoiceNumber').props.value, '0009-B'); });
const rejectedPip = consoleHarness({}, {}, { './pager-pip': { isPagerCompanion: () => false, pagerPictureInPicture: () => ({ requestWindow: async () => { throw Error('NotAllowedError'); } }) } });
await button(rejectedPip, 'نافذة فوق التطبيقات').props.onClick(); await tick();
check('denied desktop PiP reports failure without pretending a modal is external', () => { assert.ok(!nodes(rejectedPip.render()).some(n => n.type === 'dialog')); assert.match(html(rejectedPip), /تعذر فتح النافذة الخارجية/); assert.ok(button(rejectedPip, 'عرض مصغر داخل الصفحة')); });

const { preparePagerDialog } = load('components/pager/pager-pip.ts');
const viewportListeners = {}, viewportStyles = {};
let focusCalls = 0;
globalThis.document.body = { style: { overflow: 'auto' } };
globalThis.window.visualViewport = { height: 768, offsetTop: 0, addEventListener(e, fn) { viewportListeners[e] = fn; }, removeEventListener(e) { delete viewportListeners[e]; } };
const dialog = { open: false, style: { setProperty(k, v) { viewportStyles[k] = v; } }, showModal() { this.open = true; }, close() { this.open = false; }, querySelector: () => ({ focus() { focusCalls++; } }) };
const cleanDialog = preparePagerDialog(dialog);
check('native modal opens, focuses return control and locks background scrolling', () => { assert.ok(dialog.open); assert.equal(focusCalls, 1); assert.equal(document.body.style.overflow, 'hidden'); assert.equal(viewportStyles['--pager-viewport-height'], '768px'); });
window.visualViewport.height = 290; window.visualViewport.offsetTop = 110; viewportListeners.resize();
check('compact viewport follows mobile keyboard and panned visual viewport', () => { assert.equal(viewportStyles['--pager-viewport-height'], '290px'); assert.equal(viewportStyles['--pager-viewport-top'], '110px'); });
window.visualViewport.height = 375; window.visualViewport.offsetTop = 0; viewportListeners.scroll();
check('rotation restores panel bounds', () => { assert.equal(viewportStyles['--pager-viewport-height'], '375px'); assert.equal(viewportStyles['--pager-viewport-top'], '0px'); });
cleanDialog();
check('closing compact mode restores scroll and removes viewport listeners', () => { assert.equal(document.body.style.overflow, 'auto'); assert.equal(dialog.open, false); assert.equal(Object.keys(viewportListeners).length, 0); });
delete window.visualViewport; window.innerHeight = 600;
const cleanNoViewport = preparePagerDialog(dialog);
check('browsers without VisualViewport use innerHeight', () => assert.equal(viewportStyles['--pager-viewport-height'], '600px'));
cleanNoViewport();
let opened = 0, closed = 0;
const childListeners = {};
const child = { closed: false, setTimeout, focus() {}, addEventListener(event, fn) { childListeners[event] = fn; }, removeEventListener(event) { delete childListeners[event]; }, close() { closed++; childListeners.pagehide?.(); } };
const pip = consoleHarness({}, {}, { './pager-pip': { isPagerCompanion: () => false, pagerPictureInPicture: () => ({ requestWindow: async () => { opened++; return child; } }), preparePagerWindow: () => ({}) } });
pip.render(); const cleanup = pip.effects[0]();
await button(pip, 'نافذة فوق التطبيقات').props.onClick(); await tick();
check('PiP opens only after a user action', () => assert.equal(opened, 1));
check('PiP keeps controls in React portal and opener explanatory state', () => assert.match(html(pip), /النداء يعمل في النافذة المصغرة/));
childListeners.keydown({ key: 'Escape' });
check('Escape closes PiP and restores main controls', () => { assert.equal(closed, 1); assert.ok(!html(pip).includes('النداء يعمل في النافذة المصغرة')); assert.ok(button(pip, 'نافذة فوق التطبيقات')); });
await button(pip, 'نافذة فوق التطبيقات').props.onClick(); await tick(); cleanup();
check('unmount closes floating window and removes handlers', () => { assert.equal(closed, 2); assert.equal(Object.keys(childListeners).length, 0); });

const native = consoleHarness({}, {}, { './pager-pip': { isPagerCompanion: () => true, pagerPictureInPicture: () => null } });
native.render(); native.effects[0](); await tick();
check('native companion uses compact console without a nested modal or PiP control', () => {
  assert.match(html(native), /root compact/);
  assert.ok(!nodes(native.render()).some(n => n.type === 'dialog'));
  assert.ok(!button(native, 'نافذة فوق التطبيقات'));
  assert.ok(form(native));
});

const css = fs.readFileSync('components/pager/pager.module.css', 'utf8');
const { pagerTheme } = load('components/pager/pager-theme.ts');
const { approvedLoyaltyColors } = load('lib/loyalty/approved-design.ts');
const customColors = approvedLoyaltyColors('brand-test', { primary: '#51233c', text: '#ffffff', secondary: '#ebd0c0' });
check('pager buttons use the exact saved brand palette and safe foreground', () => {
  const theme = pagerTheme(customColors);
  assert.equal(theme['--pg-primary'], '#51233c'); assert.equal(theme['--pg-primary-text'], '#ffffff'); assert.equal(theme['--pg-accent'], '#ebd0c0');
  assert.equal(pagerTheme({ background: '#ffffff', foreground: '#ffffff', accent: '#ffffff' })['--pg-primary-text'], '#000000');
});
check('Jamila and Kawakib keep their approved colors instead of pager green', () => {
  assert.equal(pagerTheme(approvedLoyaltyColors('brand-406bf519a458'))['--pg-primary'], '#5c5c5c');
  assert.equal(pagerTheme(approvedLoyaltyColors('rast'))['--pg-primary'], '#3b1420');
  assert.equal(pagerTheme()['--pg-primary'], '#4a281d');
});
const branded = consoleHarness({}, { context: { ...context, canUseLoyalty: true, colors: customColors } });
const header = nodes(branded.render()).find(n => n.type === 'header');
check('loyalty return is visible outside options and uses the staff route', () => {
  const link = nodes(header).find(n => n.props?.href === '/cashier'); assert.ok(link); assert.equal(text(link), 'الرجوع للولاء');
  assert.ok(!nodes(nodes(header).find(n=>n.type==='details')).includes(link));
  assert.match(html(branded), /--pg-primary:#51233c/);
});
button(branded, 'عرض مصغر داخل الصفحة').props.onClick();
check('inline compact view keeps the visible loyalty return and brand colors', () => { assert.match(html(branded), /الرجوع للولاء/); assert.match(html(branded), /--pg-primary:#51233c/); });
check('owner loyalty return targets the owner loyalty page', () => assert.match(html(consoleHarness({}, { mode: 'owner', context: { ...context, canUseLoyalty: true } })), /href="\/dashboard\/loyalty"/));
let identityReads = [], allowed = true;
const identityContext = load('lib/data/pager.ts', {
  'server-only': {},
  '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => { const chain = { select:()=>chain, eq:()=>chain, maybeSingle:async()=>({data:{status:'active',deleted_at:null}}) }; return chain; } }) },
  '@/lib/supabase/server': { createClient: async () => ({auth:{getUser:async()=>({data:{user:{id:'owner'}}})}}) },
  '@/lib/barndaksa/env': {},
  '@/lib/data/cafes': { requireOwnerCafeContext: async()=>({id:order.cafeId,slug:'owner-brand',name:'Owner',role:'owner'}) },
  '@/lib/data/cashier': { requireCashierPermission: async permission=>{assert.equal(permission,'pager');if(!allowed) throw Error('denied');return {cafeId:order.cafeId,cafeSlug:'staff-brand',cafeName:'Staff brand',canUseLoyalty:true};} },
  '@/lib/data/feature-entitlements': { getCafeFeatureCodes:async()=>['pager'] },
  '@/lib/auth/phone-utils': {},
  '@/lib/data/loyalty-identity': { getLoyaltyBrandAppearance:async(...args)=>{identityReads.push(args);return {colors:customColors};} },
});
const staffIdentity = await identityContext.getStaffPagerContext();
const ownerIdentity = await identityContext.getOwnerPagerContext();
check('identity loader uses only the authorized staff and owner tenant', () => { assert.deepEqual(identityReads, [[order.cafeId,'staff-brand'],[order.cafeId,'owner-brand']]); assert.deepEqual(staffIdentity.colors,customColors); assert.deepEqual(ownerIdentity.colors,customColors); assert.ok(!('actorId' in staffIdentity)); });
allowed = false;
await assert.rejects(()=>identityContext.getStaffPagerContext());
check('failed staff authorization prevents reading brand identity', () => assert.equal(identityReads.length,2));
// Exercise the ready queue against server-filtered pages, not a slice of waiting orders.
const readyOrder = { ...order, id: randomUUID(), invoiceNumber: 'READY-61', status: 'ready', readyAt: order.createdAt };
const mixed = consoleHarness({}, { initialPage: { ...page, orders: [order, readyOrder], total: 2, metrics: { ...page.metrics, waiting: 1, ready: 1 } } });
check('single pickup queue counts both uncalled and called orders', () => { assert.equal(text(queueTrigger(mixed, 'جاهز للاستلام')), 'جاهز للاستلام2'); assert.ok(!html(mixed).includes('قيد التجهيز')); });
openQueue(mixed);
check('existing uncalled invoices stay accessible beside called invoices', () => { assert.equal(nodes(mixed.render()).filter(n => n.type?.name === 'PagerOrderCard').length, 2); assert.match(html(mixed), /READY-61/); assert.match(html(mixed), /00012-A/); assert.ok(!html(mixed).includes('قيد التجهيز')); });
let readyItems = [readyOrder];
const ready = consoleHarness({
  fetchPagerPageAction: async (filter, mode) => {
    ready.calls.push(['fetch', filter, mode]);
    return { ...page, orders: filter.status === 'active' ? readyItems : [order], total: filter.status === 'active' ? (readyItems.length ? 61 : 0) : 1, metrics: { ...page.metrics, ready: readyItems.length ? 61 : 0 } };
  },
  updatePagerOrderAction: async (id, status, mode) => { ready.calls.push(['update', id, status, mode]); if (status === 'received') readyItems = []; return { ok: true, order: { ...readyOrder, status } }; },
});
async function fetchCurrent(h) { h.render(); const cleanup = h.effects.at(-1)(); await tick(); cleanup(); }
const readyTrigger = h => queueTrigger(h, 'جاهز للاستلام');
const dialogNode = h => nodes(h.render()).find(n => n.type === 'dialog' && n.props['aria-labelledby'] === 'pager-queue-title');
input(ready, 'invoiceNumber').props.onChange({ target: { value: 'NEXT-9' } });
openQueue(ready, 'جاهز للاستلام');
await fetchCurrent(ready);
check('pickup popup queries all active orders with server pagination', () => {
  assert.deepEqual(ready.calls.find(c => c[0] === 'fetch').slice(1), [{ page: 0, status: 'active', query: '' }, 'staff']);
  assert.ok(dialogNode(ready)); assert.match(html(ready), /READY-61/); assert.ok(!html(ready).includes('00012-A'));
  assert.ok(button(ready, 'التالي'));
});
button(ready, 'التالي').props.onClick(); await fetchCurrent(ready);
check('ready popup supports later pages with server status filtering', () => assert.deepEqual(ready.calls.filter(c => c[0] === 'fetch').at(-1)[1], { page: 1, status: 'active', query: '' }));
const compactReadyTree = PagerOrderCard({ order: readyOrder, compact: true, onChange: (id, status) => ready.calls.push(['card', id, status]) });
nodes(compactReadyTree).find(n => n.type === 'button' && text(n) === 'استدعاء').props.onClick();
nodes(compactReadyTree).find(n => n.type === 'button' && text(n) === 'تم الاستلام').props.onClick();
check('ready card exposes distinct call and collection actions with exact order ID', () => assert.deepEqual(ready.calls.filter(c => c[0] === 'card'), [['card', readyOrder.id, 'ready'], ['card', readyOrder.id, 'received']]));
nodes(ready.render()).find(n => n.type?.name === 'PagerOrderCard').props.onChange(readyOrder.id, 'ready'); await tick();
check('recall preserves the durable reminder schedule without claiming a new message was sent', () => assert.match(html(ready), /الاستدعاء مفعّل والتذكير مستمر/));
nodes(ready.render()).find(n => n.type?.name === 'PagerOrderCard').props.onChange(readyOrder.id, 'received'); await tick();
check('collection removes the order and keeps confirmation inside the open dialog', () => {
  assert.ok(dialogNode(ready)); assert.ok(!html(ready).includes('READY-61')); assert.match(renderToStaticMarkup(dialogNode(ready)), /تم تأكيد الاستلام/);
  assert.ok(ready.calls.some(c => c[0] === 'update' && c[1] === readyOrder.id && c[2] === 'received' && c[3] === 'staff'));
});
await fetchCurrent(ready);
check('empty last page recovers to the first page', () => assert.equal(ready.calls.filter(c => c[0] === 'fetch').at(-1)[1].page, 0));
let readyCancelStopped = false;
dialogNode(ready).props.onCancel({ preventDefault() {}, stopPropagation() { readyCancelStopped = true; } }); await fetchCurrent(ready);
check('Escape closes only ready popup and preserves unsaved entry', () => { assert.ok(readyCancelStopped); assert.ok(!dialogNode(ready)); assert.equal(input(ready, 'invoiceNumber').props.value, 'NEXT-9'); });
openQueue(ready); await fetchCurrent(ready);
openQueue(ready); await tick();
check('pressing the current queue refreshes rather than leaving it empty and loading', () => { assert.ok(dialogNode(ready)); assert.ok(nodes(ready.render()).some(n => n.props?.['aria-busy'] === false)); });
const deny = consoleHarness({ updatePagerOrderAction: async () => ({ ok: false, error: 'تعذر تنفيذ العملية تحقق من صلاحية الدخول ثم حاول مجددًا' }) });
openQueue(deny); await tick();
nodes(deny.render()).find(n => n.type?.name === 'PagerOrderCard').props.onChange(order.id, 'ready'); await tick();
check('failed call keeps waiting order and displays server error without opening ready popup', () => { assert.match(text(dialogNode(deny)), /جاهز للاستلام/); assert.match(html(deny), /role="alert"/); assert.match(html(deny), /00012-A/); });
const called = consoleHarness();
openQueue(called); await tick();
nodes(called.render()).find(n => n.type?.name === 'PagerOrderCard').props.onChange(order.id, 'ready'); await tick();
check('successful first call opens the ready popup automatically', () => assert.ok(dialogNode(called)));
let mainTouched = false;
const ownerWindow = { innerHeight: 420, addEventListener() {}, removeEventListener() {} };
const ownerDocument = { body: { style: { overflow: 'auto' } }, defaultView: ownerWindow };
const floatingDialog = { ...dialog, ownerDocument, style: { setProperty(k, v) { if (k === '--pager-viewport-height') assert.equal(v, '420px'); } } };
const originalBody = document.body;
Object.defineProperty(document, 'body', { configurable: true, get() { mainTouched = true; return originalBody; } });
const floatingCleanup = preparePagerDialog(floatingDialog);
check('ready dialog uses the floating window viewport and scroll lock', () => { assert.equal(ownerDocument.body.style.overflow, 'hidden'); assert.equal(mainTouched, false); });
floatingCleanup();
Object.defineProperty(document, 'body', { configurable: true, value: originalBody });
check('floating modal cleanup restores only its own document', () => assert.equal(ownerDocument.body.style.overflow, 'auto'));
check('queue dialog reserves its viewport for scrollable invoices with large call targets', () => { assert.match(css, /readyDialog\[open\][^}]*display: flex/); assert.match(css, /readyDialog \.queueScroll[^}]*min-height: 0[^}]*overflow: auto/); assert.match(css, /compactCard \.invoice[^}]*font-size: 42px/); assert.match(css, /compactCard \.cardActions > button[^}]*min-height: 56px/); });
transform({ filename: 'pager.module.css', code: Buffer.from(css), minify: false });
let changedInvoice = false;
const unchanged = consoleHarness({ fetchPagerPageAction: async () => JSON.parse(JSON.stringify(changedInvoice ? { ...page, orders: [{ ...order, invoiceNumber: 'NEW-INVOICE' }] } : page)) });
openQueue(unchanged); await tick();
const initialOrder = nodes(unchanged.render()).find(n => n.type?.name === 'PagerOrderCard').props.order;
await fetchCurrent(unchanged);
check('unchanged background results preserve the existing order reference', () => assert.equal(nodes(unchanged.render()).find(n => n.type?.name === 'PagerOrderCard').props.order, initialOrder));
changedInvoice = true; await fetchCurrent(unchanged);
check('changed background results update the queue without discarding the screen', () => assert.equal(nodes(unchanged.render()).find(n => n.type?.name === 'PagerOrderCard').props.order.invoiceNumber, 'NEW-INVOICE'));
let finishBackground;
const quiet = consoleHarness({ fetchPagerPageAction: () => new Promise(resolve => { finishBackground = resolve; }) });
openQueue(quiet); finishBackground(page); await tick();
quiet.render(); const stopBackground = quiet.effects.at(-1)(); await tick();
check('restoring a screen checks in the background without a loading state over existing orders', () => {
  assert.ok(nodes(quiet.render()).some(n => n.props?.['aria-busy'] === false));
  assert.match(html(quiet), /00012-A/);
});
finishBackground(page); await tick(); stopBackground();
check('CSS compiles with compact mobile focus and reduced-motion rules', () => { assert.match(css, /max-width: 720px/); assert.match(css, /focus-visible/); assert.match(css, /prefers-reduced-motion/); assert.match(css, /overflow-wrap: anywhere/); });
console.log(`${checks} pager UI checks passed`);
