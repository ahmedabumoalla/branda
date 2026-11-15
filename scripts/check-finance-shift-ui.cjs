const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');

function hooks() {
  const slots = []; let cursor = 0;
  return { api: { ...React, useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; }, useEffect() { cursor++; }, useRef(value) { const i = cursor++; return slots[i] ?? (slots[i] = { current: value }); } }, render(component, props) { cursor = 0; return component(props); } };
}
function load(file, mocks) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', source)(name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.css')) return new Proxy({}, { get: (_, key) => key });
    if (name.startsWith('@/') || name.startsWith('./')) { const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name); return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '.tsx', mocks); }
    return require(name);
  }, exports);
  return exports;
}
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : tree && typeof tree === 'object' ? text(tree.props?.children) : tree == null || typeof tree === 'boolean' ? '' : String(tree);
const find = (tree, predicate) => { const node = nodes(tree).find(predicate); assert.ok(node, 'Expected control exists'); return node; };
const NamedField = ({ children }) => children;
const mocksFor = state => ({ react: state.api, './finance-ui': { Field: NamedField, Numeric: ({ value }) => value, financeDate: value => value || '—', Empty: () => null }, './finance-shift-attachments': { FinanceShiftAttachments: () => null }, '@/components/dashboard/ui/modal': { Modal: ({ children }) => children }, '@/app/actions/finance-shifts': { fetchFinanceShiftDetailAction: async () => ({ ok: false, message: 'test' }) } });
const base = { cafe: { id: 'brand', name: 'Brand', slug: 'brand' }, userId: 'cashier', initialized: true, canInitialize: false, canAdminister: false, accounts: [{ id: 'cash', active: true, kind: 'cash', name: 'Drawer', balance: 100 }], drawerAvailability: [{ account_id: 'cash', balance: 100, busy: false }], shifts: [{ id: 'shift', user_id: 'cashier', account_id: 'cash', status: 'open', opening_cash: 100, expected_cash: 125, cash_sales: 50, pos_sales: 80, bank_sales: 0, supplier_payouts: 25 }], staff: [], parties: [{ id: 'supplier', kind: 'supplier', active: true, name: 'Supplier' }], warehouses: [{ id: 'warehouse', active: true, name: 'Warehouse' }], items: [{ id: 'stock', active: true, name: 'Stock', sku: 'STOCK' }] };
const OriginalFormData = global.FormData;
global.FormData = class { constructor(values = {}) { this.values = values; } get(name) { return this.values[name] ?? null; } };

(async () => {
  let cases = 0;
  {
    const state = hooks(); const { FinanceShiftForm } = load('components/finance/finance-shift-forms.tsx', mocksFor(state)); const submitted = [];
    const props = { form: { operation: 'shift_open' }, snapshot: base, pending: false, error: '', onCancel() {}, onSubmit: async (...args) => { submitted.push(args); return true; } };
    let tree = state.render(FinanceShiftForm, props);
    assert.equal(find(tree, node => node.type === 'input' && node.props.type === 'number').props.value, '', 'Opening count starts empty');
    assert.equal(nodes(tree).some(node => node.type?.name === 'Numeric'), false, 'Opening balance is not rendered');
    await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {}, currentTarget: {} });
    assert.equal(submitted.length, 0, 'Empty count cannot be submitted as zero');
    find(tree, node => node.type === 'input' && node.props.type === 'number').props.onChange({ target: { value: '95' } });
    tree = state.render(FinanceShiftForm, props);
    assert.doesNotMatch(text(tree), /عجز نقدي|زيادة نقدية|مطابقة|رصيد الصندوق المسجل/);
    assert.equal(nodes(tree).some(node => node.type?.name === 'Numeric'), false, 'No expected balance or variance value before submission');
    await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {}, currentTarget: {} });
    assert.equal(submitted[0][1].openingCash, 95); assert.equal(submitted[0][1].accountId, 'cash'); cases++;
    assert.equal('expectedCash' in submitted[0][1], false, 'Server computes comparison');
    find(tree, node => node.type === 'input' && node.props.type === 'number').props.onChange({ target: { value: '100' } });
    tree = state.render(FinanceShiftForm, props);
    assert.doesNotMatch(text(tree), /عجز نقدي|زيادة نقدية|مطابقة|رصيد الصندوق المسجل/);
    assert.equal(nodes(tree).some(node => node.type?.name === 'Numeric'), false, 'Matching count does not reveal a match');
    find(tree, node => node.type === 'input' && node.props.type === 'number').props.onChange({ target: { value: '0' } });
    tree = state.render(FinanceShiftForm, props);
    await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {}, currentTarget: {} });
    assert.equal(submitted[1][1].openingCash, 0, 'Explicit zero is accepted'); cases++;
    const busy = { ...props, snapshot: { ...base, drawerAvailability: [{ account_id: 'cash', balance: 100, busy: true }] } };
    tree = state.render(FinanceShiftForm, busy);
    assert.equal(find(tree, node => node.type === 'option' && node.props.value === 'cash').props.disabled, true); cases++;
  }
  {
    const state = hooks(); const { FinanceShiftForm } = load('components/finance/finance-shift-forms.tsx', mocksFor(state));
    const props = { form: { operation: 'shift_close', values: { shiftId: 'shift' } }, snapshot: base, pending: false, error: '', onCancel() {}, onSubmit: async () => true };
    let tree = state.render(FinanceShiftForm, props);
    assert.match(text(tree), /المبيعات النقدية/);
    assert.match(text(tree), /النقدية المتوقعة في الصندوق/);
    find(tree, node => node.type === 'input' && node.props.type === 'number').props.onChange({ target: { value: '120' } });
    tree = state.render(FinanceShiftForm, props);
    assert.match(text(tree), /عجز نقدي/); cases++;
  }
  {
    const state = hooks(); const { FinanceShiftForm } = load('components/finance/finance-shift-forms.tsx', mocksFor(state)); const submitted = [];
    const props = { form: { operation: 'supplier_payout', values: { shiftId: 'shift' } }, snapshot: base, pending: false, error: '', onCancel() {}, onSubmit: async (...args) => submitted.push(args) };
    let tree = state.render(FinanceShiftForm, props);
    await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {}, currentTarget: { supplierName: 'Supplier', supplierPhone: '', amount: '10' } });
    assert.equal(submitted.length, 0); cases++;
    await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {}, currentTarget: { supplierName: 'Supplier', supplierPhone: '0500000000', amount: '10' } });
    assert.deepEqual(submitted[0][1].attachmentIds, []); assert.equal(submitted[0][1].amount, 10); cases++;
    find(tree, node => typeof node.props?.onBusyChange === 'function').props.onBusyChange(true); tree = state.render(FinanceShiftForm, props);
    assert.equal(find(tree, node => node.type === 'button' && text(node).includes('رفع')).props.disabled, true); cases++;
  }
  {
    const state = hooks(); const { FinanceShiftPurchaseForm } = load('components/finance/finance-shift-purchase-form.tsx', mocksFor(state)); const submitted = [];
    const props = { form: { operation: 'shift_purchase', values: { shiftId: 'shift' } }, snapshot: base, pending: false, error: '', onCancel() {}, onSubmit: async (...args) => submitted.push(args) };
    let tree = state.render(FinanceShiftPurchaseForm, props);
    assert.equal(find(tree, node => node.type === 'input' && node.props.max === '100').props.value, 15); cases++;
    find(tree, node => node.type === 'select' && node.props.required && !node.props.name && !node.props['aria-label']).props.onChange({ target: { value: 'supplier' } });
    find(tree, node => node.type === 'select' && node.props['aria-label']).props.onChange({ target: { value: 'stock' } });
    find(tree, node => node.type === 'input' && node.props['aria-label']?.startsWith('سعر')).props.onChange({ target: { value: '20' } });
    tree = state.render(FinanceShiftPurchaseForm, props);
    find(tree, node => node.type === 'select' && node.props.value === 'cash').props.onChange({ target: { value: 'credit' } });
    tree = state.render(FinanceShiftPurchaseForm, props);
    await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {}, currentTarget: { warehouseId: 'warehouse' } });
    assert.equal(submitted[0][0], 'shift_purchase'); assert.equal(submitted[0][1].payment, 'credit'); assert.equal(submitted[0][1].vatRate, 15); assert.equal(submitted[0][1].supplierId, 'supplier'); assert.equal(submitted[0][1].lines[0].unitPrice, 20); cases++;
  }
  {
    const state = hooks(); const { shiftDuration } = load('components/finance/finance-shift-report.tsx', mocksFor(state));
    assert.match(shiftDuration('2026-10-24T08:00:00Z', '2026-10-24T09:30:00Z'), /1.*30/); assert.match(shiftDuration('2026-10-24T08:00:00Z', null), /جارية/); cases++;
    const source = fs.readFileSync('components/finance/finance-shift-report.tsx', 'utf8'); assert.ok(!source.includes('detail.sales.map')); assert.ok(source.includes('printThermalReceipt')); cases++;
    const detail = fs.readFileSync('components/finance/finance-shift-details.tsx', 'utf8'); assert.ok(detail.includes('product.cost_known && product.cost !== null')); assert.ok(detail.includes('snapshot.canAdminister && variance.status === "pending"')); cases++;
  }
  console.log(`Finance shift UI: ${cases} behavior groups passed`);
})().finally(() => { global.FormData = OriginalFormData; });
