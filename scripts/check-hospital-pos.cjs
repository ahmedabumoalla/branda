'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto'), ts = require('typescript'), React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const inputs = new Set(), cache = new Map(); let checks = 0;
function check(value, label) { assert.ok(value, label); checks++; }
function load(file, overrides = {}) {
  if (cache.has(file) && !Object.keys(overrides).length) return cache.get(file);
  inputs.add(file); const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name in overrides) return overrides[name];
    if (name.endsWith('.css')) { inputs.add(path.join(path.dirname(file), name)); return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }; }
    if (name.startsWith('@/app/actions/')) return new Proxy({}, { get: () => () => { throw Error('No live actions in unit checks'); } });
    if (name.startsWith('@/') || name.startsWith('./')) { const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name); return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '.tsx'); }
    return require(name);
  }, exports); if (!Object.keys(overrides).length) cache.set(file, exports); return exports;
}
const model = load('lib/finance/hospital-pos-model.ts');
const line = { productId: 'p', name: 'Coffee', quantity: 1, unitPrice: 10, maxUnitPrice: 20 };
check(!model.hospitalPricesConfirmed([line], ['']), 'A descriptive range requires explicit confirmation');
check(!model.hospitalPricesConfirmed([line], [' ']), 'Whitespace is not a confirmed price');
check(model.hospitalPricesConfirmed([line], ['12.50']), 'Two-decimal price within range accepted');
for (const price of ['9.99', '20.01', '12.345', 'NaN', 'Infinity']) check(!model.hospitalPricesConfirmed([line], [price]), 'Reject invalid or out-of-range price ' + price);
check(!model.hospitalPricesConfirmed([line], []), 'Missing line price rejected');
check(!model.hospitalPricesConfirmed([], []), 'Empty checkout rejected');
const accounts = [{ id: 'own', active: true, kind: 'cash' }, { id: 'other', active: true, kind: 'cash' }, { id: 'card', active: true, kind: 'pos' }, { id: 'disabled', active: false, kind: 'pos' }], shift = { id: 'shift', account_id: 'own', status: 'open' };
check(model.hospitalCheckoutAccounts(accounts, 'cash', shift).map(a => a.id).join() === 'own', 'Cash uses own current shift drawer');
check(model.hospitalCheckoutAccounts(accounts, 'cash').length === 0, 'No cash collection without shift');
check(model.hospitalCheckoutAccounts(accounts, 'cash', { ...shift, supervisor_paused: true }).length === 0, 'Paused shift cannot collect cash');
check(model.hospitalCheckoutAccounts(accounts, 'card', shift).map(a => a.id).join() === 'card', 'Only active card account selectable');
check(model.hospitalCheckoutAccounts(accounts, 'credit', shift).length === 0, 'Credit invoice never pretends to collect payment');
const old = { id: 'old', source: 'menu', status: 'pending' }, fresh = { id: 'new', source: 'menu', status: 'pending' }, counter = { id: 'counter', source: 'counter', status: 'pending' };
check(model.unseenHospitalMenuOrder([old, counter, fresh], new Set(['old'])).id === 'new', 'Only unseen incoming menu orders notify');
check(model.unseenHospitalMenuOrder([{ ...fresh, status: 'ready' }], new Set()) === null, 'Existing workflow updates do not re-alert');
const ui = load('components/finance/hospital-ui.tsx'), { HospitalDebtsPanel } = load('components/finance/hospital-debts.tsx');
check(ui.hospitalFailure('en', 'تعذر', 'HOSPITAL_SHIFT_REQUIRED').includes('Open your shift'), 'Backend error is localized in English');
const snapshot = { cafe: { slug: 'mind-hospital' }, shifts: [], accounts: [], userId: 'u', role: 'owner' };
const ar = renderToStaticMarkup(React.createElement(HospitalDebtsPanel, { snapshot, language: 'ar' })), en = renderToStaticMarkup(React.createElement(HospitalDebtsPanel, { snapshot, language: 'en' }));
check(ar.includes('dir="rtl"') && ar.includes('العملاء والمديونيات'), 'Arabic debt panel renders RTL');
check(en.includes('dir="ltr"') && en.includes('Customers and receivables') && !/[\u0600-\u06ff]/.test(en), 'English debt panel renders LTR with English copy');

(async () => {
  const globals = { window: global.window, document: global.document, sessionStorage: global.sessionStorage, setTimeout: global.setTimeout, clearTimeout: global.clearTimeout, setInterval: global.setInterval, clearInterval: global.clearInterval };
  const states = [], effects = [], timers = new Map(), intervals = new Map(), listeners = new Map(), storage = new Map(); let nextTimer = 1, channelConfig, eventCallback, removed = 0, calls = 0, rows = [old], deferred;
  const tick = () => new Promise(resolve => globals.setTimeout(resolve, 0));
  global.window = { addEventListener: (key, fn) => listeners.set('window:' + key, fn), removeEventListener: key => listeners.delete('window:' + key) };
  global.document = { visibilityState: 'visible', addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) };
  global.sessionStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  global.setTimeout = fn => { const id = nextTimer++; timers.set(id, fn); return id; }; global.clearTimeout = id => timers.delete(id);
  global.setInterval = (fn, ms) => { const id = nextTimer++; intervals.set(id, { fn, ms }); return id; }; global.clearInterval = id => intervals.delete(id);
  const channel = { on: (_type, config, callback) => { channelConfig = config; eventCallback = callback; return channel; }, subscribe: () => channel };
  try {
    const { useHospitalInbox } = load('components/finance/use-hospital-inbox.ts', {
      react: { useState: initial => { const slot = { value: initial }; states.push(slot); return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value; }]; }, useRef: value => ({ current: value }), useCallback: fn => fn, useEffect: fn => effects.push(fn) },
      '@/app/actions/hospital-orders': { readHospitalOrdersAction: async () => { calls++; if (deferred) return new Promise(resolve => { deferred.resolve = resolve; }); return { ok: true, orders: rows }; } },
      '@/lib/supabase/client': { createClient: () => ({ channel: () => channel, removeChannel: async () => { removed++; } }) },
    });
    const inbox = useHospitalInbox('mind-hospital', 'tenant-id', 'user-id'), cleanup = effects[0]();
    check(channelConfig.filter === 'cafe_id=eq.tenant-id' && channelConfig.table === 'hospital_orders', 'Realtime subscribes only to the current tenant');
    check([...intervals.values()][0].ms === 15000, 'Modest polling fallback configured');
    for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } await tick();
    check(states[3].value === true && states[1].value === null, 'Initial historical pending orders load without popup');
    rows = [fresh, old]; eventCallback(); await tick();
    check(states[1].value.id === 'new', 'Realtime arrival shows new order popup');
    inbox.dismiss(); eventCallback(); await tick(); check(states[1].value === null, 'Repeated realtime events never duplicate popup');
    check([...storage.values()].every(value => value.includes('new') && !value.includes('customerName')), 'Only notification identifiers stored');
    const before = calls; global.document.visibilityState = 'hidden'; [...intervals.values()][0].fn(); await tick(); check(calls === before, 'Background polling is paused');
    global.document.visibilityState = 'visible'; deferred = {}; const inFlight = inbox.refresh(); eventCallback(); await tick(); const resolve = deferred.resolve; deferred = null; rows = [{ ...fresh, id: 'queued-new' }, fresh, old]; resolve({ ok: true, orders: [fresh, old] }); await inFlight; await tick();
    check(states[1].value.id === 'queued-new', 'Realtime event during a read is replayed immediately');
    cleanup(); check(intervals.size === 0 && listeners.size === 0 && removed === 1, 'Unmount removes timer, listeners and realtime channel');
  } finally { Object.assign(global, globals); }
  const evidence = { at: new Date().toISOString(), command: 'node scripts/check-hospital-pos.cjs', runtime: process.version, checks, passed: true, inputs: Object.fromEntries([...inputs, 'package.json', 'package-lock.json'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])) };
  fs.mkdirSync('output/mind-hospital-20261114', { recursive: true }); fs.writeFileSync('output/mind-hospital-20261114/pos-checks.json', JSON.stringify(evidence, null, 2)); console.log(JSON.stringify({ checks, passed: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
