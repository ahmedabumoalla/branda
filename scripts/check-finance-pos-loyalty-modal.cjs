const fs = require('node:fs'), assert = require('node:assert/strict'), crypto = require('node:crypto'), ts = require('typescript');
let checks = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; }, ok = (value, label) => { assert(value, label); checks++; };
const file = 'components/finance/finance-pos-loyalty-reader.tsx';
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const slots = [], effects = [], requests = []; let cursor = 0, pending = [], tree, language = 'ar', locks = 0, shown = 0, closed = 0, triggerFocus = 0, inputFocus = 0, chunkLoading;
const panel = { open: false, showModal() { this.open = true; shown++; }, close() { this.open = false; closed++; }, querySelector() { return { focus() { assert(panel.open, 'Input focus waits for native dialog opening'); inputFocus++; } }; } };
const react = {
  useId: () => 'loyalty-dialog',
  useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
  useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
  useEffect(run, deps) { const i = cursor++; if (!effects[i] || deps.some((v, n) => v !== effects[i].deps[n])) pending.push(() => { effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: run() }; }); },
};
const mocks = {
  react, 'next/dynamic': (_load, options) => { chunkLoading = options.loading; return 'Reader'; },
  '@/app/actions/finance-loyalty-reader': { openFinanceLoyaltyReaderAction(slug, confirm) { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); requests.push({ slug, confirm, resolve, reject }); return promise; } },
  '@/components/cashier/cashier-language': { CashierLanguageProvider: 'LanguageProvider' },
  '@/lib/ui/page-scroll-lock': { lockPageScroll() { locks++; let live = true; return () => { if (live) { live = false; locks--; } }; } },
  './finance-pos-locale': { useFinancePosLocale: () => ({ t: (ar, en) => language === 'ar' ? ar : en, language, dir: language === 'ar' ? 'rtl' : 'ltr', displayName: value => `${language}:${value}` }) },
};
const out = {};
new Function('require', 'exports', code)(key => key in mocks ? mocks[key] : key.endsWith('.css') ? new Proxy({}, { get: (_, name) => name === '__esModule' ? false : String(name) }) : require(key), out);
function nodes(value = tree) { if (Array.isArray(value)) return value.flatMap(child => nodes(child ?? null)); if (typeof value?.type === 'function' && value.type.name === 'ReaderLoading') return nodes(value.type(value.props)); return value?.props ? [value, ...nodes(value.props.children ?? null)] : []; }
function text(value) { if (Array.isArray(value)) return value.map(text).join(''); return value?.props ? text(value.props.children) : value == null || typeof value === 'boolean' ? '' : String(value); }
function render() { cursor = 0; pending = []; tree = out.FinancePosLoyaltyReader({ slug: 'mind-hospital' }); nodes().find(n => n.type === 'dialog').props.ref.current = panel; nodes().find(n => n.props['aria-haspopup'] === 'dialog').props.ref.current = { focus() { triggerFocus++; } }; pending.forEach(run => run()); return tree; }
const trigger = () => nodes().find(n => n.props['aria-haspopup'] === 'dialog');
const modal = () => nodes().find(n => n.type === 'dialog');
const reader = () => nodes().find(n => n.type === 'Reader');
const button = label => { const value = nodes().find(n => n.type === 'button' && text(n).trim() === label); assert(value, label); return value; };
const close = () => { nodes().find(n => n.type === 'button' && ['إغلاق', 'Close'].includes(n.props['aria-label'])).props.onClick(); render(); };
const flush = () => new Promise(resolve => setImmediate(resolve));
async function reply(value) { requests.at(-1).resolve(value); await flush(); render(); }
const ready = { status: 'ready', console: { cafe: { id: 'brand-a', slug: 'mind-hospital', name: 'Mind' }, cashier: { id: 'loyalty-staff', fullName: 'Actual loyalty actor' } }, identity: { slug: 'mind-hospital', name: 'Mind' } };
(async () => {
  render(); eq(requests.length, 0, 'Initial POS render performs no reader lookup'); eq(shown, 0, 'Initial dialog remains closed');
  ok(text(chunkLoading().type()).includes('جارٍ تجهيز قارئ الولاء'), 'Lazy reader chunk has localized Arabic loading feedback');
  eq(trigger().props['aria-controls'], modal().props.id, 'Trigger targets the labelled modal');
  trigger().props.onClick(); trigger().props.onClick(); eq(requests.length, 1, 'Same-tick double click cannot start duplicate auth loading');
  eq([requests[0].slug, requests[0].confirm], ['mind-hospital', false], 'Initial loader does not silently claim another cashier session');
  render(); eq(panel.open, true, 'Native modal opens'); eq(locks, 1, 'Open modal locks page scroll'); ok(nodes().some(n => n.props.role === 'status'), 'Loading is announced');
  close(); eq(panel.open, false, 'Close remains available while loading'); eq(locks, 0, 'Closing releases page scroll'); eq(triggerFocus, 1, 'Closing returns focus to trigger');
  await reply({ ok: true, data: ready }); ok(reader(), 'Loaded reader mounts even when closing during request'); eq(reader().props.active, false, 'Closed loaded reader keeps background outbox alive without camera DOM'); eq(shown, 1, 'Late response never reopens modal');
  const firstReaderKey = reader().key;
  trigger().props.onClick(); render(); eq(reader().key, firstReaderKey, 'Reopening retains original scan session during auth refresh'); eq(reader().props.active, false, 'Reader is inactive while authorization is rechecked');
  await reply({ ok: false, message: 'private server detail' }); eq(reader(), undefined, 'Authorization failure removes old reader'); ok(nodes().some(n => n.props.role === 'alert'), 'Authorization failure offers visible recovery'); ok(!text(tree).includes('private server detail'), 'Raw server details are not shown');
  button('إعادة المحاولة').props.onClick(); render(); await reply({ ok: true, data: { status: 'login_required' } });
  const login = nodes().find(n => n.type === 'a'); eq(login.props.href, '/cashier/login', 'Login-required flow links original cashier authentication'); eq(login.props.rel, 'noopener noreferrer', 'Separate login tab preserves opener boundary');
  button('متابعة بحساب كاشير الولاء').props.onClick(); eq(requests.at(-1).confirm, true, 'Using the existing loyalty actor requires explicit confirmation'); render(); await reply({ ok: true, data: ready });
  eq(reader().props.initialData.cashier.id, 'loyalty-staff', 'Original reader receives authorized server actor'); eq(reader().props.embedded, true, 'Reader uses compact embedded mode'); eq(reader().props.active, true, 'Ready open reader is active');
  ok(text(tree).includes('ar:Actual loyalty actor'), 'Visible actor is current loyalty cashier and uses POS display-name localization');
  let provider = nodes().find(n => n.type === 'LanguageProvider'); eq([provider.props.initialLocale, provider.props.fixedLocale], ['ar', 'ar'], 'Arabic POS locale controls reader');
  language = 'en'; render(); provider = nodes().find(n => n.type === 'LanguageProvider'); eq([provider.props.initialLocale, provider.props.fixedLocale], ['en', 'en'], 'Reader follows POS locale changes'); eq(modal().props.dir, 'ltr', 'Modal follows English direction');
  ok(text(chunkLoading().type()).includes('Preparing loyalty reader'), 'Lazy reader chunk loading follows English POS locale');
  let prevented = false; modal().props.onCancel({ target: {}, currentTarget: panel, preventDefault() { prevented = true; } }); render(); eq(panel.open, true, 'Camera Escape cannot close parent through event bubbling'); eq(prevented, false, 'Nested camera owns its own cancel event');
  modal().props.onCancel({ target: panel, currentTarget: panel, preventDefault() { prevented = true; } }); render(); eq(panel.open, false, 'Parent Escape closes modal'); eq(reader().props.active, false, 'Escape retains reader background work'); eq(reader().key, firstReaderKey, 'Actor key stays stable through closure');
  trigger().props.onClick(); render(); await reply({ ok: true, data: ready }); ok(inputFocus >= 3, 'Reopened modal focuses scanner after becoming visible');
  modal().props.onClose({ currentTarget: panel }); render(); eq(panel.open, true, 'Delayed native close event does not dismiss reopened modal');
  close(); trigger().props.onClick(); render(); requests.at(-1).reject(Error('network')); await flush(); render(); ok(nodes().some(n => n.props.role === 'alert'), 'Thrown network errors unlock retry');
  button('Retry').props.onClick(); render(); await reply({ ok: true, data: ready }); eq(reader().props.active, true, 'Network failure does not strand loader lock');
  effects.forEach(effect => effect?.cleanup?.()); eq(locks, 0, 'Unmount releases scroll lock');
  const pos = fs.readFileSync('components/finance/finance-pos.tsx', 'utf8'); ok(pos.includes('FinancePosLoyaltyReader key={`${data.cafe.id}:${data.userId}`} slug={data.cafe.slug}'), 'POS remounts reader across brand or actor changes');
  const files = [file, 'components/finance/finance-pos-loyalty-reader.module.css', 'components/finance/finance-pos.tsx', 'scripts/check-finance-pos-loyalty-modal.cjs', 'package-lock.json'];
  fs.mkdirSync('output/pos-loyalty-reader-20261114', { recursive: true }); fs.writeFileSync('output/pos-loyalty-reader-20261114/modal-ui.json', JSON.stringify({ at: new Date().toISOString(), runtime: process.version, passed: true, checks, scope: 'Native dialog and server boundaries mocked; actual component handlers/effects; no browser or live actions', inputs: files.map(path => ({ path, sha256: crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex') })) }, null, 2));
  console.log(JSON.stringify({ passed: true, checks }));
})().catch(error => { console.error(error); process.exitCode = 1; });
