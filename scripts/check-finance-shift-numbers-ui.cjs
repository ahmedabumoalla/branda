const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const component = name => ({ [name]: function Placeholder() {} });
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : tree && typeof tree === 'object' ? text(tree.props?.children) : tree == null || typeof tree === 'boolean' ? '' : String(tree);
function load(file, mocks) {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', compiled)(name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (name.startsWith('./') || name.startsWith('@/')) {
      const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name);
      return load(base + (fs.existsSync(base + '.ts') ? '.ts' : '.tsx'), mocks);
    }
    return require(name);
  }, exports);
  return exports;
}
const shift = (number, status = 'open', extra = {}) => ({ id: 'private-uuid-' + (number ?? 'legacy'), shift_number: number, user_id: 'employee', account_id: 'cash', status, opened_at: '2026-10-25T10:05:37Z', closed_at: status === 'closed' ? '2026-10-25T12:00:00Z' : null, expected_cash: 0, counted_cash: null, opening_cash: 0, variance: null, ...extra });
const base = { cafe: { name: 'Brand', slug: 'brand' }, userId: 'employee', canManage: true, canAdminister: true, accounts: [{ id: 'cash', kind: 'cash', name: 'Cash', active: true }], settings: { vat_rate: 0, tax_inclusive: true }, shifts: [], warehouses: [], products: [], items: [], stock: [], documents: [], parties: [], staff: [], trialBalance: [], summary: {}, journal: [], movements: [] };
let data = base;
const mocks = {
  react: { ...React, useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}], useEffect() {}, useMemo: fn => fn(), useRef: value => ({ current: value }) },
  'next/link': { __esModule: true, default: function Link() {} }, 'next/image': { __esModule: true, default: function Image() {} },
  'next/navigation': { useRouter: () => ({}), useSearchParams: () => new URLSearchParams('section=shifts') },
  '@/app/actions/finance-access': {}, '@/components/dashboard/ui/modal': component('Modal'),
  './use-finance': { useFinance: () => ({ snapshot: data, pending: false, stale: false, historyMore: {}, clearFeedback() {} }) },
  './finance-operation-form': component('FinanceOperationForm'), './finance-shift-details': component('FinanceShiftDetails'),
  './finance-receipt-dialog': component('FinanceReceiptDialog'), './finance-refund-requests': component('FinanceRefundRequests'),
  './finance-sale-form': component('FinanceSaleForm'), './finance-customer-form': component('FinanceCustomerForm'),
  './finance-treasury': component('FinanceTreasury'), './finance-trial-balance': component('FinanceTrialBalance'),
  './finance-cash-differences': component('FinanceCashDifferences'),
  './finance-shift-report': { shiftDuration: () => '2h' },
  './finance-ui': { Numeric: function Numeric() {}, Panel: function Panel() {}, Empty: function Empty() {}, Field: function Field() {}, Metric: function Metric() {}, financeDate: value => value ?? '', financeDocumentStatus: () => '', documentKindNames: {} },
};
const { FinancePOS } = load('components/finance/finance-pos.tsx', mocks);
const { FinanceWorkspace } = load('components/finance/finance-workspace.tsx', mocks);
data = { ...base, shifts: [shift(42)] };
let tree = FinancePOS({ initialSnapshot: data });
let badge = nodes(tree).find(node => node.props?.['aria-label'] === 'رقم الوردية 42');
assert.ok(badge); assert.equal(text(badge), '#42'); assert.equal(nodes(badge).find(node => node.type === 'bdi').props.dir, 'ltr');
data = { ...base, shifts: [shift(43, 'handover')] }; tree = FinancePOS({ initialSnapshot: data });
assert.ok(nodes(tree).some(node => node.props?.['aria-label'] === 'رقم الوردية 43'));
data = { ...base, shifts: [shift(44, 'handover', { user_id: 'other', handover_to: 'employee' })] }; tree = FinancePOS({ initialSnapshot: data });
assert.ok(nodes(tree).some(node => node.props?.['aria-label'] === 'رقم الوردية 44'));
data = { ...base, shifts: [shift(45, 'closed')] }; tree = FinancePOS({ initialSnapshot: data });
assert.ok(nodes(tree).some(node => node.type === 'button' && text(node).includes('تقرير آخر وردية#45')));
data = { ...base, shifts: [shift(undefined)] }; tree = FinancePOS({ initialSnapshot: data });
assert.ok(!text(tree).includes('private-uuid')); assert.ok(!nodes(tree).some(node => String(node.props?.['aria-label']).startsWith('رقم الوردية')));
data = { ...base, shifts: [shift(42), shift(45, 'closed'), shift(undefined)] }; tree = FinanceWorkspace({ initialSnapshot: data });
assert.ok(nodes(tree).some(node => node.type === 'th' && text(node) === 'الوردية'));
assert.ok(nodes(tree).some(node => node.props?.['aria-label'] === 'رقم الوردية 42'));
assert.ok(nodes(tree).some(node => node.props?.['aria-label'] === 'رقم الوردية 45'));
assert.ok(!text(tree).includes('private-uuid')); assert.ok(text(tree).includes('—'));
console.log('PASS shift numbers: current/outgoing/incoming/last closed/history/legacy fallback and bidi isolation');
