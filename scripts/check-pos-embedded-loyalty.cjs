const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto'), ts = require('typescript'), React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
let checks = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; }, ok = (value, label) => { assert(value, label); checks++; };
function load(file, mocks = {}, cache = new Map()) {
  file = file.replaceAll('\\', '/'); if (cache.has(file)) return cache.get(file);
  const out = {}; cache.set(file, out);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(key => {
    if (key in mocks) return mocks[key];
    if (key.endsWith('.css')) return new Proxy({}, { get: (_, name) => name === '__esModule' ? false : String(name) });
    if (key.startsWith('@/') || key.startsWith('.')) { const base = key.startsWith('@/') ? key.slice(2) : path.join(path.dirname(file), key); return load(fs.existsSync(base + '.tsx') ? base + '.tsx' : base + '.ts', mocks, cache); }
    return require(key);
  }, out); return out;
}
const localeModule = load('components/cashier/cashier-language.tsx');
let cookieWrites = 0, storageWrites = 0, events = 0;
global.document = { get cookie() { return 'branda_cashier_locale=ar'; }, set cookie(value) { cookieWrites++; } };
global.window = { dispatchEvent() { events++; } }; global.localStorage = { setItem() { storageWrites++; } }; global.location = { protocol: 'https:' };
function Probe({ next }) { const language = localeModule.useCashierLanguage(); if (next) language.selectLocale(next); return React.createElement('p', { dir: language.dir, lang: language.locale }, language.t('تسجيل ختم')); }
const html = props => renderToStaticMarkup(React.createElement(localeModule.CashierLanguageProvider, props, React.createElement(Probe, { next: 'en' })));
ok(html({ initialLocale: 'ar', fixedLocale: 'en' }).includes('lang="en"'), 'Controlled POS English overrides standalone initial locale');
ok(html({ initialLocale: 'en', fixedLocale: 'ar' }).includes('dir="rtl"'), 'Controlled Arabic overrides English initial locale');
eq([cookieWrites, storageWrites, events], [0, 0, 0], 'Embedded language never mutates global preference');
html({ initialLocale: 'ar' }); eq([cookieWrites, storageWrites, events], [1, 1, 1], 'Standalone language selection still persists and publishes change');
delete global.document; delete global.window; delete global.localStorage; delete global.location;

const states = [], refs = []; let si = 0, ri = 0, outboxCalls = 0, pendingSave, failCommit = true, formatter;
const formattedNames = [];
const queued = [], committed = [], inspected = [];
const hooks = { useState(initial) { const i = si++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; }, useRef(initial) { return refs[ri++] ??= { current: initial }; }, useEffect() {} };
const reward = { sourceType: 'loyalty', rewardCode: 'REWARD123', canRedeem: true, customerName: 'Customer', rewardTitle: 'Coffee' };
const { RastCashier } = load('components/rast-loyalty/rast-cashier.tsx', {
  react: hooks,
  './rast-camera-scanner': { RastCameraScanner: 'Camera' }, './rast-brand': { RastBrand: 'Brand' },
  '@/components/cashier/staff-screen-link': { StaffScreenLink: 'StaffLink' },
  '@/components/cashier/analytics-coupon-redemption': { AnalyticsCouponRedemption: 'Coupons' },
  '@/components/cashier/cashier-language': { useCashierLanguage: () => ({ locale: 'ar', dir: 'rtl', t: value => typeof value === 'string' ? value : value.text, errorText: value => value }), CashierLanguageSwitch: 'LanguageSwitch' },
  './use-customer-summary': { useCustomerSummary: () => ({ state: { id: null, status: 'idle' }, lookup: () => null, clear() {}, confirm() {} }) },
  './use-read-outbox': { useReadOutbox: () => { outboxCalls++; return { rows: [], authPaused: true, storageError: false, save(method, value) { queued.push({ method, value }); return new Promise(resolve => { pendingSave = resolve; }); } }; } },
  '@/app/actions/cashier': { logoutCashierAction() { throw Error('No logout expected'); } },
  '@/app/actions/cashier-loyalty-phone': { lookupCashierLoyaltyPhoneAction: async () => ({ ok: true, cardCode: 'CARD123' }) },
  '@/app/actions/loyalty-experience': { lookupRastCashierCardAction: async () => ({}), lookupRastCashierRewardAction: async value => { inspected.push(value); return reward; }, scanLoyaltyExperienceAction: async input => { committed.push(input); if (failCommit) throw Error('network'); return { status: 'redeemed', customerName: 'Receipt Customer' }; } },
});
const initialData = { cafe: { id: 'brand', slug: 'mind-hospital', name: 'Mind' }, cashier: { id: 'cashier', fullName: 'Operator', canUsePager: true } };
let tree;
function render(embedded = true, active = true) { si = 0; ri = 0; tree = RastCashier({ initialData, embedded, active, displayName: formatter }); return tree; }
function nodes(value = tree) { if (Array.isArray(value)) return value.flatMap(child => nodes(child ?? null)); return value?.props ? [value, ...nodes(value.props.children ?? null)] : []; }
function text(value) { if (Array.isArray(value)) return value.map(text).join(''); return value?.props ? text(value.props.children) : value == null || typeof value === 'boolean' ? '' : String(value); }
const button = label => { const n = nodes().find(n => n.type === 'button' && text(n).trim() === label); assert(n, label); return n; };
const input = value => { nodes().find(n => n.props.id === 'rast-scan-code').props.onChange({ target: { value } }); render(); };
const submit = () => nodes().find(n => n.type === 'form' && n.props.onSubmit).props.onSubmit({ preventDefault() {} });
const flush = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  render(false); eq(tree.type, 'main', 'Standalone semantic main is preserved');
  ok(nodes().some(n => n.type === 'header') && nodes().some(n => n.type === 'Coupons'), 'Standalone branding and coupon tools preserved');
  ok(nodes().some(n => n.type === 'StaffLink'), 'Standalone pager navigation preserved');
  render(); eq(tree.type, 'div', 'Embedded reader avoids nested main landmark');
  ok(tree.props.className.includes('embedded'), 'Embedded container removes viewport minimum height');
  eq(nodes().filter(n => ['header', 'Coupons', 'StaffLink', 'LanguageSwitch', 'Brand'].includes(n.type)).length, 0, 'Modal excludes standalone branding logout language pager and coupons');
  eq(nodes().filter(n => n.props.href).length, 0, 'Embedded reader does not navigate away from POS');
  ok(nodes().some(n => n.type === 'Camera'), 'Original camera entry remains');
  ok(nodes().some(n => n.props['aria-label'] === 'حالة المزامنة'), 'Original synchronization feedback remains');
  input('CARD123'); submit(); submit(); eq(queued, [{ method: 'code', value: 'CARD123' }], 'Hardware Enter path keeps durable queue and duplicate guard');
  const before = outboxCalls; render(true, false); eq(tree, null, 'Closed reader removes camera and input DOM'); eq(outboxCalls, before + 1, 'Closed reader retains outbox hook');
  pendingSave({ duplicate: false }); await flush(); render();
  eq(nodes().find(n => n.props.id === 'rast-scan-code').props.value, '', 'Durable save finishes while dialog is closed');
  button('رقم الجوال').props.onClick(); render(); input('0501234567'); submit(); pendingSave({ duplicate: false }); await flush(); render();
  eq(queued.at(-1), { method: 'phone', value: '0501234567' }, 'Phone stamp entry reuses original outbox');
  button('البطاقة أو الباركود').props.onClick(); render(); nodes().find(n => n.type === 'Camera').props.onDetected('CARD456'); render();
  eq(nodes().find(n => n.props.id === 'rast-scan-code').props.value, 'CARD456', 'Original camera detection fills original input');
  button('صرف مكافأة').props.onClick(); render(); input('CARD123'); submit(); await flush(); render();
  eq(inspected, ['CARD123'], 'Redeem uses original reward lookup'); eq(committed.length, 0, 'Lookup never redeems before confirmation');
  eq(text(nodes().find(n => n.props.id === 'rast-scan-preview')), 'Customer', 'Standalone default preserves original customer name');
  formatter = name => { formattedNames.push(name); return `English ${name}`; }; render();
  eq(text(nodes().find(n => n.props.id === 'rast-scan-preview')), 'English Customer', 'Embedded preview uses supplied English personal-name formatter');
  eq(reward.customerName, 'Customer', 'Display formatting never mutates saved identity');
  render(true, false); render(); ok(button('تأكيد تسليم المكافأة وصرفها'), 'Reward preview survives closing and reopening');
  button('تأكيد تسليم المكافأة وصرفها').props.onClick(); await flush(); render();
  render(true, false); failCommit = false; render(); button('تأكيد تسليم المكافأة وصرفها').props.onClick(); await flush(); render();
  eq(committed[0].requestId, committed[1].requestId, 'Uncertain reward retry preserves request identity across dialog closure');
  eq(committed[0].expectedScope, { cafeId: initialData.cafe.id, cashierId: initialData.cashier.id }, 'Redemption is pinned to the displayed brand and cashier');
  eq(committed[1].expectedScope, committed[0].expectedScope, 'Retry cannot silently adopt a changed cashier cookie');
  eq(committed[1].value, 'REWARD123', 'Confirmation stays pinned to inspected reward');
  ok(formattedNames.includes('Receipt Customer'), 'Successful operation customer passes through supplied display formatter');
  button('تسجيل ختم').props.onClick(); render();
  const summary = nodes().find(n => n.type?.name === 'CashierCustomerSummary');
  eq(summary.props.displayName, formatter, 'Original customer summary receives the POS formatter');
  const summaryState = { status: 'ready', confirmed: true, summary: { customerName: 'Customer', stampsInCycle: 1, purchasesRequired: 5, availableRewards: 0 } };
  ok(text(summary.type({ state: summaryState, saved: false, displayName: formatter })).includes('English Customer'), 'Customer summary formats its visible name');
  ok(text(summary.type({ state: summaryState, saved: false })).includes('Customer'), 'Standalone summary keeps unmodified identity without formatter');
  eq(summaryState.summary.customerName, 'Customer', 'Summary formatting does not change stored identity');
  const inputs = ['components/rast-loyalty/rast-cashier.tsx', 'components/rast-loyalty/cashier-customer-summary.tsx', 'components/rast-loyalty/rast-cashier.module.css', 'components/cashier/cashier-language.tsx', 'components/rast-loyalty/rast-camera-scanner.tsx', 'scripts/check-pos-embedded-loyalty.cjs', 'package-lock.json'];
  fs.mkdirSync('output/pos-loyalty-reader-20261114', { recursive: true });
  fs.writeFileSync('output/pos-loyalty-reader-20261114/embedded-reader.json', JSON.stringify({ at: new Date().toISOString(), runtime: process.version, checks, passed: true, scope: 'Mocked actions and component handlers plus actual React language-provider SSR; no browser or real reads/writes', inputs: inputs.map(path => ({ path, sha256: crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex') })) }, null, 2));
  console.log(JSON.stringify({ passed: true, checks }));
})().catch(error => { console.error(error); process.exitCode = 1; });
