const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');

function load(file, mocks) {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', compiled)(name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.css')) return new Proxy({}, { get: (_, key) => key });
    if (name.startsWith('@/') || name.startsWith('./')) {
      const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name);
      return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '.tsx', mocks);
    }
    return require(name);
  }, exports);
  return exports;
}
const named = name => Object.defineProperty(() => null, 'name', { value: name });
const children = {
  './finance-shift-monitor': ['FinanceShiftMonitor'], './finance-printer-settings': ['FinancePrinterSettings'],
  './finance-sale-form': ['FinanceSaleForm'], './finance-customer-form': ['FinanceCustomerForm'],
  './finance-operation-form': ['FinanceOperationForm'], './finance-refund-requests': ['FinanceRefundRequests'],
  './finance-receipt-dialog': ['FinanceReceiptDialog'], './finance-treasury': ['FinanceTreasury'],
  './finance-trial-balance': ['FinanceTrialBalance'], './finance-cash-differences': ['FinanceCashDifferences'],
  './finance-cash-handovers': ['FinanceCashHandovers'], './finance-inventory-report': ['FinanceInventoryReport'],
  './finance-control-panel': ['FinanceControlPanel', 'FinanceJournalExport', 'FinancePeriodHistory'],
  './finance-shift-details': ['FinanceShiftDetails'],
};
const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.props?.children), ...nodes(value.props?.action)] : [];
const text = value => Array.isArray(value) ? value.map(text).join('') : value && typeof value === 'object' ? text(value.props?.children) : value == null || typeof value === 'boolean' ? '' : String(value);
const byName = (tree, name) => nodes(tree).find(node => node.type?.name === name);
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && text(node) === label);
const snapshot = {
  cafe: { id: 'brand', name: 'Brand', slug: 'brand' }, userId: 'user', role: 'owner', canAdminister: true, canManage: true,
  accounts: [], parties: [{ id: 'customer', name: 'Customer', phone: '', email: '', kind: 'customer', balance: 0, active: true }],
  products: [], items: [], warehouses: [], stock: [], journal: [], movements: [], staff: [], shifts: [], trialBalance: [],
  settings: { vat_rate: 15, tax_inclusive: true, closed_through: null }, summary: {},
  documents: [{ id: 'sale', number: 1, party_id: 'customer', kind: 'sale', total: 100, outstanding: 50, refunded: false, note: '', created_at: '2026-10-27T00:00:00Z', lines: [] }],
};
function harness(role, section) {
  let cursor = 0; const slots = [], saves = [];
  const state = { snapshot: { ...snapshot, role, canAdminister: role === 'owner', canManage: ['owner', 'manager'].includes(role) }, pending: false, stale: false, historyMore: {}, clearFeedback() {}, refresh() {}, execute: async (...args) => { saves.push(args); return { id: 'saved' }; } };
  const route = { section };
  const mocks = {
    react: { ...React, useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; } },
    'next/link': { __esModule: true, default: named('Link') },
    'next/navigation': { useSearchParams: () => new URLSearchParams({ section: route.section }) },
    '@/components/dashboard/ui/modal': { Modal: named('Modal') },
    './use-finance': { useFinance: () => state },
    './finance-ui': { Panel: named('Panel'), Empty: named('Empty'), Numeric: named('Numeric'), Metric: named('Metric'), documentKindNames: {}, financeDate: value => value, financeDocumentStatus: () => 'unpaid', downloadFinanceCsv() {} },
  };
  for (const [source, names] of Object.entries(children)) mocks[source] = Object.fromEntries(names.map(name => [name, named(name)]));
  const { FinanceWorkspace } = load('components/finance/finance-workspace.tsx', mocks);
  return { state, route, saves, render() { cursor = 0; return FinanceWorkspace({ initialSnapshot: state.snapshot }); } };
}
async function main() {
  let groups = 0;
  for (const role of ['owner', 'accountant', 'auditor', 'warehouse']) {
    const h = harness(role, 'inventory'); let tree = h.render();
    const writable = role === 'owner' || role === 'warehouse';
    assert.equal(!!button(tree, 'جرد وتسوية كمية'), writable, role + ' inventory adjustment control');
    assert.equal(!!button(tree, 'تحويل مخزون'), false, role + ' no transfer without two active warehouses');
    assert.equal(!!button(tree, 'إضافة صنف مخزني'), writable);
    assert.equal(typeof byName(tree, 'FinanceInventoryReport').props.onAdjust === 'function', writable);
    assert.equal(typeof byName(tree, 'FinanceInventoryReport').props.onItemEdit === 'function', writable);
    assert.equal(!!button(tree, 'إضافة كاشير مبيعات'), role === 'owner');
    assert.equal(nodes(tree).some(node => node.props?.href === '/dashboard/menu'), role === 'owner');
    h.route.section = 'settings'; tree = h.render();
    assert.equal(nodes(tree).some(node => node.props?.title === 'السياسة المحاسبية'), role === 'owner', 'Direct settings URL cannot escalate role');
    assert.equal(!!byName(tree, 'FinanceInventoryReport'), role === 'warehouse', 'Warehouse fallback stays within inventory');
    h.route.section = 'treasury'; tree = h.render();
    assert.equal(!!byName(tree, 'FinanceTreasury'), role !== 'warehouse');
    assert.equal(!!byName(tree, 'FinanceInventoryReport'), role === 'warehouse', 'Unauthorized treasury URL resolves to allowed section');
    h.route.section = 'reports'; tree = h.render();
    assert.equal(!!byName(tree, 'FinancePeriodHistory'), role !== 'warehouse');
    if (role !== 'warehouse') {
      assert.equal(byName(tree, 'FinancePeriodHistory').props.visible, true);
      assert.equal(byName(tree, 'FinanceControlPanel').props.visible, true);
      assert.equal(!!button(tree, 'ترحيل قيد يدوي متوازن'), role !== 'auditor');
    }
    h.route.section = 'parties'; tree = h.render();
    assert.equal(!!button(tree, 'تعديل'), role === 'owner' || role === 'accountant');
    h.route.section = 'sales'; tree = h.render();
    assert.equal(!!button(tree, 'تسجيل دفعة'), role === 'owner' || role === 'accountant');
    assert.equal(!!button(tree, 'مرتجع'), role === 'owner' || role === 'accountant');
    assert.equal(!!button(tree, 'التفاصيل'), role !== 'warehouse');
    h.route.section = 'shifts'; tree = h.render();
    assert.equal(!!byName(tree, 'FinanceShiftMonitor'), role !== 'warehouse');
    if (role !== 'warehouse') assert.equal(byName(tree, 'FinanceCashDifferences').props.role, role);
    groups++;
  }
  {
    const h = harness('warehouse', 'inventory'); let tree = h.render();
    button(tree, 'جرد وتسوية كمية').props.onClick(); tree = h.render();
    assert.equal(byName(tree, 'FinanceOperationForm').props.form.operation, 'stock_adjust');
    await byName(tree, 'FinanceOperationForm').props.onSubmit('journal', {});
    assert.equal(h.saves.length, 0, 'Unauthorized operation rejected before request');
    h.state.snapshot = { ...h.state.snapshot, role: 'auditor' }; tree = h.render();
    assert.equal(byName(tree, 'Modal').props.open, false, 'Revoked form is closed');
    assert.ok(!byName(tree, 'FinanceOperationForm'), 'Revoked form is unmounted'); groups++;
  }
  {
    const h = harness('accountant', 'sales'); let tree = h.render();
    button(tree, 'التفاصيل').props.onClick(); tree = h.render(); assert.ok(byName(tree, 'FinanceReceiptDialog'));
    h.state.snapshot = { ...h.state.snapshot, role: 'warehouse' }; tree = h.render();
    assert.ok(!byName(tree, 'FinanceReceiptDialog'), 'Previous financial receipt disappears after role downgrade'); groups++;
  }
  for (const role of ['cashier', 'unexpected-role']) {
    const tree = harness(role, 'reports').render();
    assert.equal(tree.type.name, 'Empty'); assert.ok(!byName(tree, 'FinanceInventoryReport')); groups++;
  }
  console.log(`PASS dashboard role UI ${groups} groups: direct section authorization, inventory mutations, readonly reports, role downgrade and operation preflight`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
