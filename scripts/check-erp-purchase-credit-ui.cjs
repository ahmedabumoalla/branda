'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict'), ts = require('typescript'), React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const cache = new Map(), inputs = new Set(); let checks = 0;
const eq = (a, b, reason) => { assert.deepEqual(a, b, reason); checks++; };
const id = suffix => `a7000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const cafe = id(1), invoice = id(2), account = id(3), supplier = id(4), record = id(5);
let hook = 0, state = {}, prints = [], calls = [], clientError = null, contextError = false;
const mocks = {
  react: { ...React, useRef: initial => ({ current: initial }), useState: initial => { const index = hook++; return [index in state ? state[index] : typeof initial === 'function' ? initial() : initial, value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; } },
  'server-only': {}, 'next/cache': { revalidatePath() {} },
  '@/lib/performance/finance-route-invalidation': { invalidateFinanceViews() {} },
  '@/lib/data/erp-purchases': { purchasesContext: async slug => { calls.push({ context: slug }); if (contextError) throw Error('لا تملك صلاحية المشتريات'); return { cafe: { id: cafe, slug }, client: { rpc: async (name, args) => { calls.push({ name, args }); return { data: [], error: clientError }; } } }; }, purchasesError(error) { if (error) throw Error('تعذر إكمال العملية'); } },
  '@/lib/data/erp-branches': { branchRpc: async (_client, tenant, name, args, input) => { calls.push({ tenant, name, args, input }); return { data: { id: record, documentId: id(7) }, error: clientError }; } },
  '@/components/erp/branches/context': { withBranchScope: (input, snapshot) => ({ ...input, branchScope: snapshot.branchScope }) },
  '@/components/erp/settings/preferences': { useSystemFormat: () => ({ money: value => Number(value).toFixed(2), date: value => value }) },
  '@/components/erp/navigation': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) },
  '@/components/dashboard/ui/modal': { Modal: ({ open, children, title }) => open ? React.createElement('section', { 'aria-label': title }, children) : null },
  '@/components/erp/templates/document-template-print': { DocumentTemplatePrint: props => { prints.push(props); return React.createElement('button', null, 'طباعة'); } },
  '@/app/actions/erp-accounting': { getErpAccountingDocument: async () => ({ ok: false, message: 'غير متاح' }) },
};
function load(file) {
  file = file.replaceAll('\\', '/'); if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports); inputs.add(file);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.startsWith('@/') || name.startsWith('.')) { const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name); const target = [base, base + '.ts', base + '.tsx'].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()); if (!target) throw Error(base); return load(target); }
    return require(name);
  }, exports); return exports;
}
(async () => {
  const domain = load('lib/erp/purchase-credit-notes.ts');
  const value = { id: record, revision: 0, invoiceId: invoice, date: '2026-11-13', description: 'رسوم المورد', amount: 100, discount: 10, taxRate: 15, expenseAccountId: account };
  eq(domain.purchaseCreditInput.safeParse(value).success, true, 'valid non-stock supplier charge');
  eq(domain.purchaseCreditTotals(value), { net: 90, tax: 13.5, total: 103.5 }, 'discount applied before tax');
  eq(domain.purchaseCreditTotals({ amount: .1, discount: .01, taxRate: 15 }), { net: .09, tax: .01, total: .1 }, 'cent rounding uses net after discount');
  for (const patch of [{ amount: NaN }, { amount: Infinity }, { amount: -1 }, { discount: 100 }, { discount: -1 }, { taxRate: 101 }, { date: '-infinity' }, { expenseAccountId: '' }, { amount: .001 }, { sourceTenant: cafe }]) eq(domain.purchaseCreditInput.safeParse({ ...value, ...patch }).success, false, 'invalid/foreign input denied');
  const action = load('app/actions/erp-purchase-credit-notes.ts'), scope = { branchId: id(6), revision: 9 };
  eq((await action.actPurchaseCreditNote('tenant-slug', {}, id(8))).ok, false, 'invalid input rejected');
  eq(calls.length, 0, 'invalid input never requests context');
  eq((await action.actPurchaseCreditNote('tenant-slug', { action: 'save', payload: value }, 'bad')).ok, false, 'invalid idempotency key denied');
  contextError = true; eq((await action.actPurchaseCreditNote('tenant-slug', { action: 'save', payload: value }, id(8))).ok, false, 'permission rejection surfaced safely'); contextError = false;
  const command = { action: 'save', payload: value, branchScope: scope };
  eq((await action.actPurchaseCreditNote('tenant-slug', command, id(8))).ok, true, 'save uses actual server action');
  const call = calls.findLast(row => row.name === 'erp_purchase_credit_write');
  eq(call.tenant, cafe, 'tenant comes from authenticated context'); eq(call.args.p_cafe, cafe, 'RPC tenant bound');
  eq(call.input.branchScope, scope, 'rendered branch scope reaches dispatcher'); eq(call.args.p_payload, value, 'financial input unchanged');
  eq(call.args.p_request, id(8), 'idempotency key preserved');
  clientError = { code: '42501', message: 'private details' }; const denied = await action.actPurchaseCreditNote('tenant-slug', command, id(9)); eq(denied.ok, false, 'RPC permission failure'); eq(denied.message.includes('private details'), false, 'raw server message not exposed'); clientError = null;
  eq((await action.refreshPurchaseCreditNotes('tenant-slug')).ok, true, 'read action uses current tenant');
  eq(calls.at(-1).args.p_cafe, cafe, 'read never accepts arbitrary tenant ID');
  const Component = load('components/erp/purchases/credit-notes.tsx').PurchaseCreditNotes;
  const row = { id: record, code: 'PCN-2026-0001', revision: 2, source_document_id: invoice, sourceNumber: 'PUR-0001', supplierId: supplier, branch_id: null, status: 'posted', document_id: id(7), created_at: '2026-11-13T12:00:00Z', outstanding: 103.5, payload: { ...value, ...domain.purchaseCreditTotals(value) }, history: [{ document_id: id(7), reversal_document_id: null, created_at: '2026-11-13T12:00:00Z' }] };
  const snapshot = { slug: 'tenant-slug', brand: 'العلامة', branchScope: scope, creditNotes: [row], settings: { allowCreditNotes: true }, suppliers: [{ id: supplier, name: 'المورد' }], invoices: [{ id: invoice, kind: 'purchase', number: 11, displayNumber: 'PUR-0001', party_id: supplier }], finance: { accounts: [{ id: account, active: true, kind: 'expense', name: 'المصروف' }] }, canCreate: true, canUpdate: true, canApprove: true, canDelete: true };
  function render(overrides = {}, snap = snapshot, source, initialId) { hook = 0; state = overrides; prints = []; return renderToStaticMarkup(React.createElement(Component, { snapshot: snap, templates: [], invoiceId: source, initialId })); }
  let html = render(); eq(html.includes(row.code), true, 'list uses configured note number'); eq(html.includes('PUR-0001'), true, 'source invoice display code'); eq(html.includes('103.50'), true, 'actual posted payable amount');
  html = render({}, { ...snapshot, canCreate: false }); eq(html.includes('إنشاء إشعار دائن'), false, 'readonly hides creation');
  html = render({}, { ...snapshot, settings: { allowCreditNotes: false } }); eq(/disabled=""[^>]*>إنشاء إشعار دائن/.test(html), true, 'disabled setting blocks new creation');
  html = render({}, snapshot, id(99)); eq(html.includes(row.code), false, 'source panel does not show another invoice note');
  html = render({ 3: record }); eq(html.includes('إضافة دفعة'), true, 'posted note permits payment'); eq(html.includes('تحويل إلى مسودة'), true, 'reversal path exposed'); eq(html.includes('عرض قيد الإصدار'), true, 'actual journal action present');
  html = render({}, snapshot, undefined, record); eq(html.includes('عرض قيد الإصدار'), true, 'report deep link opens the actual selected note');
  eq(prints[0].values.رقم_المستند, row.code, 'print receives actual note code'); eq(prints[0].values.رقم_الفاتورة, row.sourceNumber, 'print references original invoice'); eq(prints[0].values.المبلغ, 103.5, 'print uses persisted amount');
  html = render({ 3: record }, { ...snapshot, canApprove: false }); eq(html.includes('إضافة دفعة'), false, 'approval ceiling enforced in UI');
  html = render({ 2: value }); eq(html.includes('حساب المصروف'), true, 'expense account explicitly selected'); eq(html.includes('القيمة بالريال قبل الضريبة'), true, 'currency and tax meaning explicit'); eq(html.includes('المستودع'), false, 'non-stock charge does not collect stock data');
  html = render({ 8: { action: 'draft', payload: { id: record, revision: 2 } } }); eq(html.includes('قيد عكسي'), true, 'undo explains immutable posting history');
  const files = [...inputs, 'package.json', 'package-lock.json', 'tsconfig.json'];
  const result = { passed: true, checks, at: new Date().toISOString(), runtime: process.version, scope: 'Actual schemas/server actions and rendered supplier credit note controls, source scoping, permissions, print values and totals; network and native print mocked', inputs: Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])) };
  fs.writeFileSync('output/integrated-system/erp-purchase-credit-ui-verification.json', JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify({ passed: true, checks, at: result.at }));
})().catch(error => { console.error(error); process.exitCode = 1; });
