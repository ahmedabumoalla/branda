const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, mocks) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'exports', code)(name => name in mocks ? mocks[name] : name === 'react/jsx-runtime' ? require(name) : {}, exports);
  return exports;
}
function hooks() {
  const slots = []; let cursor = 0, effects = [];
  const effect = (fn, deps) => { const i = cursor++, old = slots[i]; if (!old || deps.some((d, n) => d !== old[n])) { slots[i] = deps; effects.push(fn); } };
  return { api: {
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef: initial => { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
    useMemo: fn => { cursor++; return fn(); }, useCallback: fn => { cursor++; return fn; }, useEffect: effect, useLayoutEffect: effect,
  }, render(fn) { cursor = 0; effects = []; const value = fn(); for (const effect of effects) effect(); return value; } };
}
const snapshot = { cafe: { id: 'brand', slug: 'test-cafe' }, userId: 'cashier', shifts: [], documents: [] };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function scenario(kind, entry = false) {
  const h = hooks(), navigations = [], events = {}, savedSales = [{ id: 'pending-invoice' }]; let locks = 0;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: kind !== 'offline' } });
  globalThis.location = { pathname: '/finance/test-cafe/pos' };
  globalThis.window = { location: { replace: href => navigations.push(href) }, addEventListener: (name, fn) => { events[name] = fn; }, removeEventListener() {} };
  globalThis.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  globalThis.BroadcastChannel = undefined;
  const realInterval = globalThis.setInterval; globalThis.setInterval = () => 0;
  globalThis.fetch = async () => {
    if (kind === 'network') throw new Error('network');
    const status = Number(kind) || 200;
    return { status, ok: status === 200, json: async () => ({ message: 'login', snapshot: kind === 'mismatch' ? { ...snapshot, userId: 'other' } : snapshot }) };
  };
  const storage = { activeOfflineSession: async () => ({ scope: 'brand:cashier', snapshot }), getOfflineSession: async () => ({ snapshot }), listOfflineSales: async () => savedSales, lockOfflineSession: async () => { locks++; if (kind === 'lock-failure') throw new Error('storage'); }, saveOfflineSnapshot: async () => {}, withOfflineSyncLease: async (_, fn) => fn() };
  const mocks = { react: h.api, './use-finance': { useFinance: () => ({}) }, './finance-pos': { FinancePOS() {} }, '@/lib/finance/pos-offline-storage': storage,
    '@/lib/finance/pos-offline-assets': { cachedReceiptBrand: async () => null, prepareOfflineAssets: async () => ({ brand: null }) },
    '@/lib/finance/pos-offline': { posScope: s => `${s.cafe.id}:${s.userId}`, projectOfflineSales: s => s, pendingSales: s => s, drainOfflineSales: async deps => { if (kind === 'post-auth') deps.authRequired('login'); } },
  };
  try {
    const mod = load(entry ? 'components/finance/finance-offline-entry.tsx' : 'components/finance/use-pos-finance.ts', mocks);
    const render = () => h.render(() => entry ? mod.FinanceOfflineEntry() : mod.usePosFinance(snapshot));
    let state = render(); await tick(); state = render(); await tick();
    if (!entry && ['signed-out', 'lock-failure'].includes(kind)) events['branda:pos-session-locked']();
    state = render(); await tick(); render();
    const shouldRedirect = ['401', '403', 'mismatch', 'post-auth', 'signed-out', 'lock-failure'].includes(kind);
    assert.deepEqual(navigations, shouldRedirect ? ['/finance/test-cafe/login'] : [], `${entry ? 'offline shell' : 'POS'} ${kind}`);
    assert.deepEqual(savedSales, [{ id: 'pending-invoice' }], 'Invoices retained');
    if (!entry && shouldRedirect) assert.equal(state.stale, true);
    if (entry && shouldRedirect) assert.equal(locks, 1);
  } finally { globalThis.setInterval = realInterval; }
}
(async () => {
  for (const kind of ['401', '403', 'mismatch', 'post-auth', 'signed-out', 'lock-failure', 'network', '503', 'offline', 'valid']) await scenario(kind);
  for (const kind of ['401', '403', 'mismatch', 'network', '503', 'offline', 'valid']) await scenario(kind, true);
  console.log('PASS 17 POS auth recovery cases: replace-once, auth/scope/logout, durable invoices, network/server/offline continuity');
})().catch(error => { console.error(error); process.exitCode = 1; });
