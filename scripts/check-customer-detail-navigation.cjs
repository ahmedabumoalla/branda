const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');

function load(file, mocks) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.css')) return new Proxy({}, { get: (_, key) => key });
    if (name.startsWith('@/') || name.startsWith('./')) throw Error('Unmocked import: ' + name);
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
      useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
      useId() { cursor++; return 'customer'; },
      useMemo(fn, deps) { const i = cursor++; if (changed(slots[i], deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
      useEffect(fn, deps) { const i = cursor++; if (changed(slots[i], deps)) { const previous = slots[i]; slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
    },
    render(component, props) { cursor = 0; effects = []; const tree = component(props); effects.forEach(fn => fn()); return tree; },
  };
}
function nodes(tree, hidden = false) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(value => nodes(value, hidden));
  if (!hidden && tree.props?.hidden) return [];
  return [tree, ...nodes(tree.props?.children, hidden)];
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { resolve, reject, promise }; };
let checks = 0;
const equal = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };
const truth = (value, message) => { assert.ok(value, message); checks++; };
const party = { id: 'customer-a', name: 'Example', active: true, phone: '0500000000', details: {}, balance: 0 };
const detail = (tab = 'details', page = 1) => ({ customer: party, tab, page, pageSize: 25, total: 30, hasMore: true, counts: { invoices: 30, payments: 0, quotes: 0, messages: 0 }, summary: { balance: 0, invoiceTotal: 30, outstanding: 0, refundedTotal: 0, collected: 30, unpaidCount: 0 }, invoices: [], payments: [], quotes: [], messages: [], balance: [], timeline: [] });

async function main() {
  let calls = 0, response = deferred();
  const { createCustomerDetailLoader } = load('lib/finance/customer-detail-loader.ts', { '@/app/actions/finance-customer-detail': { fetchCustomerDetailAction: () => { calls++; return response.promise; } } });
  const scope = { id: party.id, slug: 'mind-hospital', revision: 0, context: {} };
  const reader = createCustomerDetailLoader(scope);
  const first = reader.load('details', 1);
  equal(first, reader.load('details', 1), 'StrictMode/in-flight reads share one request');
  response.resolve({ ok: true, data: detail() }); await first;
  await reader.load('details', 1); equal(calls, 1, 'Revisit uses successful page data');
  response = deferred(); const failed = reader.load('payments', 1); response.resolve({ ok: false, message: 'denied' }); await failed;
  equal(reader.peek('payments', 1), undefined, 'Authorization failures are never cached');
  response = deferred(); const retry = reader.load('payments', 1); response.resolve({ ok: true, data: detail('payments') }); await retry;
  equal(calls, 3, 'Failed read can retry');
  response = deferred(); const network = reader.load('invoices', 1); response.reject(Error('offline')); await assert.rejects(network); checks++;
  response = deferred(); const recover = reader.load('invoices', 1); response.resolve({ ok: true, data: detail('invoices') }); await recover;
  equal(calls, 5, 'Rejected promise is released');
  for (const replacement of [{ ...scope, revision: 1 }, { ...scope, id: 'customer-b' }, { ...scope, slug: 'other' }, { ...scope, context: {} }]) {
    equal(createCustomerDetailLoader(replacement).peek('details', 1), undefined, 'New instance/context has no previous customer data');
  }

  let uiCalls = [];
  const loaderModule = load('lib/finance/customer-detail-loader.ts', { '@/app/actions/finance-customer-detail': { fetchCustomerDetailAction: async (id, tab, page, slug) => { uiCalls.push({ id, tab, page, slug }); return { ok: true, data: detail(tab, page) }; } } });
  const h = hooks();
  const { FinanceCustomerDetail } = load('components/finance/finance-customer-detail.tsx', {
    react: h.api,
    '@/lib/finance/customer-detail-loader': loaderModule,
    '@/lib/finance/sales-features': load('lib/finance/sales-features.ts', {}),
    '@/lib/finance/permissions': { canFinance: () => true },
    '@/lib/finance/quotation': { quoteStatus: () => '', quoteStatusLabels: {} },
    './finance-ui': { Numeric: () => null, financeDate: value => value, financeDocumentStatus: () => '', documentKindNames: {} },
    './customer-credit-panel': { CustomerCreditPanel: () => null },
  });
  let props = { id: party.id, snapshot: { cafe: { slug: scope.slug }, userId: 'owner-a', canAdminister: true, role: 'owner', accounts: [], documents: [] }, disabled: false, onBack() {}, onInvoice() {}, onPayment() {}, onEdit() {}, onCreateInvoice() {}, onCreateQuote() {}, profile: { customer: party, actions: null, sections: [{ id: 'files', label: 'Files', content: React.createElement('div', { 'data-test': 'files' }) }] } };
  let tree;
  const render = () => tree = h.render(FinanceCustomerDetail, props);
  const find = predicate => { const value = nodes(tree).find(predicate); assert(value, 'Rendered control exists'); return value; };
  const tab = name => find(n => n.props?.role === 'tab' && n.props.id === 'customer-' + name);
  render(); await flush(); render();
  equal(uiCalls.length, 1, 'Initial read once');
  props = { ...props, snapshot: JSON.parse(JSON.stringify(props.snapshot)), profile: { ...props.profile, customer: { ...party } } }; render(); await flush(); render();
  equal(uiCalls.length, 1, 'Equivalent RSC snapshots do not create a read/render loop');
  equal(nodes(tree).filter(n => n.type === 'header').length, 1, 'One identity header');
  equal(nodes(tree).filter(n => n.props?.role === 'tablist').length, 1, 'One financial tab bar');
  equal(nodes(tree).some(n => n.props?.id === 'customer-quotes'), false, 'MIND quote tab remains hidden');
  tab('invoices').props.onClick(); render(); await flush(); render(); equal(uiCalls.length, 2, 'First new tab fetches once');
  tab('details').props.onClick(); render(); equal(uiCalls.length, 2, 'Returning summary has no request');
  equal(find(n => n.props?.['aria-label'] === 'تفاصيل العميل').props['aria-busy'], false, 'Cached tab has no loading frame');
  tab('details').props.onClick(); render(); equal(uiCalls.length, 2, 'Clicking active tab has no request');
  find(n => n.type === 'select').props.onChange({ target: { value: 'files' } }); render();
  truth(nodes(tree).some(n => n.props?.['data-test'] === 'files'), 'Selected auxiliary panel visible');
  tab('invoices').props.onClick(); render(); equal(uiCalls.length, 2, 'Returning from auxiliary panel preserves finance');
  truth(nodes(tree, true).some(n => n.props?.['data-test'] === 'files'), 'Visited auxiliary panel remains mounted');
  equal(nodes(tree).some(n => n.props?.['data-test'] === 'files'), false, 'Inactive auxiliary panel hidden');
  const credit = find(n => n.type === 'button' && React.Children.toArray(n.props.children).includes('الرصيد المقدم'));
  // Locate by direct child text because icon + Arabic label share one button.
  credit.props.onClick(); render();
  find(n => typeof n.props?.onChanged === 'function').props.onChanged(); render(); await flush(); render();
  equal(uiCalls.length, 3, 'Financial save invalidates loaded data');
  tab('details').props.onClick(); render(); await flush(); render(); equal(uiCalls.length, 4, 'Mutation invalidates other cached pages too');
  props = { ...props, snapshot: { ...props.snapshot, role: 'viewer' } }; render(); await flush(); render(); equal(uiCalls.length, 5, 'New server snapshot/role invalidates data');
  props = { ...props, snapshot: { ...props.snapshot, userId: 'owner-b' } }; render(); await flush(); render(); equal(uiCalls.length, 6, 'Actor change invalidates cached data');
  props = { ...props, snapshot: { ...props.snapshot, documents: [{ id: 'payment', total: 10 }] } }; render(); await flush(); render(); equal(uiCalls.length, 7, 'Financial data change invalidates cached data');
  find(n => n.type === 'button' && React.Children.toArray(n.props.children).includes('تحديث')).props.onClick(); render(); await flush(); render();
  equal(uiCalls.length, 8, 'Explicit refresh requests fresh authorized data');
  props = { ...props, snapshot: { ...props.snapshot, cafe: { slug: 'another-brand' } }, profile: undefined }; render(); await flush(); render();
  truth(nodes(tree).some(n => n.props?.id === 'customer-quotes'), 'Other brands keep quotes and standalone layout');
  console.log(JSON.stringify({ checks, result: 'PASS', scope: 'Actual loader and component hooks with mocked read transport; no business writes' }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
