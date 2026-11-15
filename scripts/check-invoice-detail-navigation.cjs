const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (name.startsWith('@/') || name.startsWith('./')) throw Error('Unmocked import ' + name);
    return require(name);
  }, exports);
  return exports;
}
function hooks() {
  const slots = []; let cursor = 0, effects = [];
  const changed = (old, deps) => !old || deps.some((d, i) => !Object.is(d, old.deps[i]));
  return {
    api: { ...React,
      useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => slots[i] = typeof value === 'function' ? value(slots[i]) : value]; },
      useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
      useEffect(fn, deps) { const i = cursor++; if (changed(slots[i], deps)) { const previous = slots[i]; slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
    },
    render(component, props) { cursor = 0; effects = []; const tree = component(props); effects.forEach(fn => fn()); return tree; },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}
function nodes(tree) { return !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)]; }
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { resolve, reject, promise }; };
let checks = 0;
function equal(a, b, message) { assert.deepEqual(a, b, message); checks++; }
function truth(value, message) { assert.ok(value, message); checks++; }
const document = { id: 'invoice-a', number: 2, kind: 'sale', lines: [], party_id: 'customer-a', total: 10, paid: 2, outstanding: 8, refunded: false, created_at: '2026-11-15T00:00:00Z' };
const detail = { document, invoice: null, customer: { id: 'customer-a', name: 'Customer' }, creator: { id: 'actor-a', name: 'Owner' }, warehouse: null, metadata: {}, activity: [], related: [], payments: [], paymentCollectors: [] };
const payload = () => ({ detail: { ok: true, data: structuredClone(detail) }, extensions: { ok: true, data: { profit: null } }, settings: { ok: true, data: { settings: { advanced: {} } } } });
const snapshot = { cafe: { id: 'cafe-a', slug: 'mind-hospital', name: 'MIND' }, userId: 'actor-a', role: 'owner', canManage: true, canAdminister: true, documents: [document], accounts: [], parties: [], products: [], settings: {} };

async function main() {
  let calls = 0, sourceCalls = 0, pageResponse = payload(), sourceResponse = { ok: true, data: { name: 'Counter', recorded: true } };
  const module = load('lib/finance/invoice-detail-loader.ts', {
    '@/app/actions/finance-invoice-management': { readInvoiceDetailPageAction: () => { calls++; return Promise.resolve(pageResponse); } },
    '@/app/actions/finance-order-sources': { getFinanceIssuedOrderSource: () => { sourceCalls++; return Promise.resolve(sourceResponse); } },
  });
  const scope = (value = snapshot, id = document.id) => ({ id, slug: value.cafe.slug, session: module.invoiceDetailSession(value), context: module.invoiceDetailContext(value) });
  const cache = module.createInvoiceDetailCache();
  let reader = cache.get(scope());
  await Promise.all([reader.detail(), reader.advanced(), reader.detail()]);
  equal(calls, 1, 'Concurrent strict-effect detail/options reads share one request');
  equal(cache.get(scope(structuredClone(snapshot))), reader, 'Equivalent RSC snapshots retain authorized reader');
  await reader.detail(); await reader.advanced(); equal(calls, 1, 'Completed successful detail/options reused');
  await Promise.all([reader.orderSource.load(), reader.orderSource.load()]); await reader.orderSource.load();
  equal(sourceCalls, 1, 'Order source concurrent reads and revisits reuse result');
  const other = cache.get(scope(snapshot, 'invoice-b')); await other.detail();
  equal(cache.get(scope()), reader, 'Invoice revisit returns same private reader');
  const held = reader; cache.clear(); reader = cache.get(scope());
  equal(held.peek(), undefined, 'Explicit refresh revokes old data'); equal(reader.peek(), undefined, 'Refresh requests live data');
  const waiting = deferred(); pageResponse = waiting.promise; const pending = reader.detail(); cache.clear(); waiting.resolve(payload()); await pending;
  equal(reader.peek(), undefined, 'Late response cannot repopulate cleared cache'); pageResponse = payload();
  for (const changed of [{ ...snapshot, userId: 'actor-b' }, { ...snapshot, role: 'viewer' }, { ...snapshot, cafe: { ...snapshot.cafe, id: 'cafe-b', slug: 'other' } }, { ...snapshot, documents: [{ ...document, outstanding: 3 }] }]) {
    reader = cache.get(scope(changed)); equal(reader.peek(), undefined, 'Actor/role/tenant/financial scope never exposes previous result'); await reader.detail();
  }
  equal(module.createInvoiceDetailCache().get(scope()).peek(), undefined, 'Other workspace/session has no shared data');
  cache.clear(); const oldest = cache.get(scope(snapshot, 'oldest')); await oldest.detail();
  for (let i = 0; i < 24; i++) cache.get(scope(snapshot, 'invoice-' + i));
  equal(oldest.peek(), undefined, 'Private cache retains at most 24 invoices');
  cache.clear(); reader = cache.get(scope()); pageResponse = { ...payload(), detail: { ok: false, message: 'denied' } };
  equal((await reader.detail()).ok, false, 'Authorization error is returned'); equal(reader.peek(), undefined, 'Errors are not reusable successful cache entries');
  pageResponse = payload(); await reader.detail(); truth(reader.peek()?.ok, 'Failed read can retry');
  sourceResponse = { ok: false, message: 'source denied' }; equal((await reader.orderSource.load()).ok, false, 'Source failure remains visible'); equal(reader.orderSource.peek(), undefined, 'Failed source is not cached');
  sourceResponse = { ok: true, data: { name: 'Counter', recorded: true } }; await reader.orderSource.load();
  reader.advanced.invalidate(); pageResponse = { ...payload(), extensions: { ok: false, message: 'options denied' } };
  equal((await reader.advanced()).extensions.ok, false, 'Options failure surfaced separately'); truth(reader.peek()?.ok, 'Optional failure preserves successful invoice');
  equal(reader.advanced.peek(), undefined, 'Options failure not cached'); pageResponse = payload(); await reader.advanced();

  const h = hooks();
  const advanced = load('components/finance/invoice-advanced-tools.tsx', { react: h.api, '@/app/actions/finance-invoice-extensions': {}, '@/app/actions/finance-invoice-settings': {}, '@/lib/finance/company-invoice': {}, './finance-ui': {} });
  const noop = () => null;
  const { FinanceInvoiceDetail } = load('components/finance/finance-invoice-detail.tsx', {
    react: h.api, '@/lib/finance/invoice-detail-loader': module,
    '@/app/actions/finance-invoice-management': { updateInvoiceManagementAction: async () => ({ ok: true }) },
    '@/lib/finance/sales-features': { isMindSalesSimplified: () => true }, '@/app/actions/finance-invoice-drafts': {}, '@/app/actions/finance-invoice-line-notes': {}, '@/app/actions/finance-invoice-shipping-charge': {}, '@/lib/finance/permissions': { canFinance: role => role !== 'none' }, '@/lib/finance/invoice-copy': {}, './company-invoice-files': { InvoiceFileDownloads: noop }, './finance-ui': { financeDate: value => value, Numeric: noop }, './finance-payment-editor': { FinancePaymentEditor: noop }, './finance-payment-detail': { FinancePaymentDetail: noop }, './finance-journal-detail': { FinanceJournalPreview: noop }, './payment-receipt-dialog': { PaymentReceiptDialog: noop }, '@/lib/finance/payment-receipt': {}, './invoice-details-view': { renderInvoiceDetails: (d, s, action) => React.createElement('button', { 'data-statement': true, onClick: action }) }, './invoice-order-source-summary': { InvoiceOrderSourceSummary: noop }, './invoice-payments-view': { renderInvoicePayments: noop }, './invoice-stock-installments': { renderInvoiceStock: noop, renderInvoiceInstallments: noop }, './invoice-installment-editor': { newInvoiceSchedule: () => ({}), InvoiceInstallmentEditor: noop }, './invoice-advanced-tools': advanced, './invoice-returns-panel': { InvoiceReturnsPanel: noop }, './invoice-activity-timeline': { InvoiceActivityTimeline: noop },
  });
  let props = { id: document.id, snapshot, invoiceDetailCache: cache, disabled: false, onBack: noop, onNavigate: noop, onPrint: noop, onSettle: noop };
  let tree; const render = () => tree = h.render(FinanceInvoiceDetail, props);
  const tab = key => nodes(tree).find(n => n.props?.id === 'invoice-tab-' + key);
  let before = calls; render(); await flush(); render(); equal(calls, before, 'Reopening invoice consumes warm cache immediately');
  equal(tree.props['aria-busy'], false, 'Warm invoice has no loading frame');
  props = { ...props, snapshot: structuredClone(snapshot) }; render(); await flush(); render(); equal(calls, before, 'Reference-new equal snapshot causes no request');
  tab('details').props.onClick(); render();
  const sourceNode = nodes(tree).find(n => n.props?.reader?.load); truth(sourceNode, 'Details uses shared order-source reader');
  tab('payments').props.onClick(); render(); tab('invoice').props.onClick(); render(); equal(calls, before, 'Invoice tab round trip causes no financial read');
  truth(nodes(tree).some(n => n.props?.id === 'invoice-panel-invoice'), 'Invoice preview panel remains mounted across tabs');
  let cta = nodes(tree).find(n => n.props?.className === 'paymentAction'); equal(cta.props.disabled, false, 'Outstanding invoice payment action enabled');
  props = { ...props, disabled: true }; render(); equal(nodes(tree).find(n => n.props?.className === 'paymentAction').props.disabled, true, 'External pending/stale rules block payment');
  props = { ...props, disabled: false, snapshot: { ...snapshot, userId: 'different-actor' } }; render(); equal(tree.props['aria-busy'], true, 'Account change has no stale invoice frame'); await flush(); render(); equal(calls, before + 1, 'Account change performs authorized read');
  cache.clear(); pageResponse = payload(); pageResponse.detail.data.document.outstanding = 0; render(); await flush(); render(); equal(nodes(tree).find(n => n.props?.className === 'paymentAction').props.disabled, true, 'Fully paid invoice stays disabled');
  cache.clear(); pageResponse = payload(); pageResponse.detail.data.document.refunded = true; render(); await flush(); render(); equal(nodes(tree).find(n => n.props?.className === 'paymentAction').props.disabled, true, 'Fully refunded invoice stays disabled');
  h.unmount();

  const sourceHooks = hooks();
  const { InvoiceOrderSourceSummary } = load('components/finance/invoice-order-source-summary.tsx', { react: sourceHooks.api });
  reader = cache.get(scope()); await reader.orderSource.load(); before = sourceCalls;
  tree = sourceHooks.render(InvoiceOrderSourceSummary, { reader: reader.orderSource });
  equal(sourceCalls, before, 'Remounted order source makes no new request'); equal(nodes(tree).some(n => n.props?.role === 'status'), false, 'Warm order source has no loading frame');

  const financeHooks = hooks(); let mutationResult = { ok: true, data: { id: 'saved' } };
  const { useFinance } = load('components/finance/use-finance.ts', { react: financeHooks.api, '@/lib/finance/invoice-detail-loader': module, '@/lib/finance/inventory-catalog': {}, '@/app/actions/finance-access': {}, '@/app/actions/brand-finance': { fetchBrandFinanceAction: async () => ({ ok: true, data: { ...snapshot, journal: [], movements: [] } }), executeBrandFinanceAction: async () => mutationResult } });
  const start = { ...snapshot, journal: [], movements: [] };
  let state = financeHooks.render(() => useFinance(start)); reader = state.invoiceDetailCache.get(scope()); pageResponse = payload(); await reader.detail();
  await state.refresh(); equal(reader.peek(), undefined, 'Actual finance hook refresh clears invoice cache');
  state = financeHooks.render(() => useFinance(start)); reader = state.invoiceDetailCache.get(scope()); await reader.detail();
  await state.execute('settlement', { documentId: document.id }); equal(reader.peek(), undefined, 'Actual successful finance write clears cache');
  state = financeHooks.render(() => useFinance(start)); reader = state.invoiceDetailCache.get(scope()); await reader.detail(); mutationResult = { ok: false, message: 'denied' };
  await state.execute('settlement', { documentId: document.id }); truth(reader.peek()?.ok, 'Rejected write retains unchanged authorized cache');
  console.log(JSON.stringify({ checks, result: 'PASS', scope: 'Actual read cache/component hooks with mocked transports; no database or business writes' }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
