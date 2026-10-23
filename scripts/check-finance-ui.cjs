const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');

function load(file, mocks = {}) {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', compiled)(name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.css')) return new Proxy({}, { get: (_, key) => key });
    if (name.startsWith('@/') || name.startsWith('./')) {
      const base = name.startsWith('@/') ? name.slice(2) : require('node:path').join(require('node:path').dirname(file), name);
      return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '.tsx', mocks);
    }
    return require(name);
  }, exports);
  return exports;
}
function hooks() {
  let slots = [], cursor = 0;
  return {
    api: { ...React, useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; }, useRef(initial) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); }, useEffect() { cursor++; }, useMemo(fn) { cursor++; return fn(); } },
    render(fn, props) { cursor = 0; return fn(props); },
  };
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.footer)]; }
function text(tree) { if (Array.isArray(tree)) return tree.map(text).join(''); if (tree && typeof tree === 'object') return text(tree.props?.children); return tree == null || typeof tree === 'boolean' ? '' : String(tree); }
const find = (tree, predicate) => { const result = nodes(tree).find(predicate); assert.ok(result, 'Expected UI control'); return result; };
const button = (tree, label) => find(tree, node => node.type === 'button' && text(node) === label);
const field = (tree, label) => find(tree, node => node.type?.name === 'Field' && node.props.label === label).props.children;
const base = {
  cafe: { id: 'cafe', name: 'Test Brand', slug: 'test-brand' }, userId: 'owner', canManage: true, canAdminister: true, role: 'owner',
  settings: { vat_rate: 15, tax_inclusive: true, currency: 'SAR', closed_through: null },
  products: [{ id: 'product', name: 'قهوة', price: 23, imageUrl: '/api/finance/test-brand/media?path=tenant/coffee.webp', category: 'مشروبات', available: true, stockTracked: true, itemId: 'item', quantity: 5 }],
  items: [{ id: 'item', name: 'قهوة', sku: 'COFFEE', unit: 'قطعة', menu_product_id: 'product', min_quantity: 1, active: true, quantity: 5, average_cost: 3 }],
  warehouses: [{ id: 'warehouse', name: 'الرئيسي', active: true }], stock: [{ item_id: 'item', warehouse_id: 'warehouse', quantity: 5, average_cost: 3 }],
  accounts: [{ id: 'cash', kind: 'cash', name: 'صندوق', code: '100', balance: 100, active: true }, { id: 'card', kind: 'pos', name: 'الشبكة', code: '110', balance: 0, active: true }, { id: 'bank', kind: 'bank', name: 'البنك', code: '120', balance: 0, active: true }, { id: 'inventory', kind: 'inventory', name: 'المخزون', code: '130', balance: 0, active: true }],
  parties: [{ id: 'customer', name: 'عميل', kind: 'customer', phone: '', email: '', tax_number: '', balance: 0, active: true }],
  shifts: [{ id: 'shift', user_id: 'owner', account_id: 'cash', status: 'open', opening_cash: 100, expected_cash: 100, counted_cash: null, variance: null, opened_at: '2026-10-23T12:00:00Z', closed_at: null, handover_to: null, note: '' }],
  staff: [{ user_id: 'cashier', name: 'موظف', role: 'cashier', active: true }], documents: [], journal: [], movements: [], trialBalance: [], summary: { sales: 0, purchases: 0, expenses: 0, profit: 0, receivables: 0, payables: 0, inventoryValue: 15 }, truncated: false,
};
const ImageMock = function Image() {};
const shared = { 'next/link': { __esModule: true, default: function Link() {} }, 'next/image': { __esModule: true, default: ImageMock }, 'next/navigation': { useRouter: () => ({ replace() {} }) }, '@/app/actions/finance-access': { createFinanceStaffAccountAction: async () => ({ ok: true }), logoutFinanceAction: async () => {} } };

async function main() {
  let groups = 0;
  const { financeCsv, FinanceReceipt } = load('components/finance/finance-ui.tsx');
  assert.match(financeCsv([['=SUM(A1)', '+cmd', '-formula', '@test', 'قهوة', -2]]), /"'=SUM\(A1\)"/);
  assert.match(financeCsv([[1, 'quote"cell']]), /"quote""cell"/); groups++;

  const uiHooks = hooks(); const saved = [];
  let current = structuredClone(base);
  const uiState = { get snapshot() { return current; }, pending: false, stale: false, error: '', message: '', historyMore: {}, clearFeedback() {}, refresh: async () => {}, execute: async (operation, payload) => { saved.push({ operation, payload }); return { id: 'saved', number: 1 }; } };
  const { FinancePOS, financeDiscount, financeCartLines } = load('components/finance/finance-pos.tsx', { ...shared, react: uiHooks.api, './use-finance': { useFinance: () => uiState } });
  const render = () => uiHooks.render(FinancePOS, { initialSnapshot: current, slug: 'test-brand' });
  assert.equal(financeDiscount(46, 10, 'percent'), 4.6);
  assert.equal(financeDiscount(46, 4.6, 'amount'), 4.6);
  assert.equal(financeCartLines([{ productId: 'gone', quantity: 1 }], base.products).length, 0); groups++;
  let tree = render();
  const image = find(tree, node => node.type === ImageMock);
  assert.equal(image.props.src, current.products[0].imageUrl); assert.equal(image.props.unoptimized, true, 'Private images retain authenticated source request');
  find(tree, node => node.type === 'button' && node.props['aria-label']?.startsWith('إضافة قهوة')).props.onClick(); tree = render();
  find(tree, node => node.type === 'button' && node.props['aria-label'] === 'زيادة كمية قهوة').props.onClick(); tree = render();
  field(tree, 'الخصم').props.onChange({ target: { value: '10' } }); tree = render();
  field(tree, 'نوع الخصم').props.onChange({ target: { value: 'percent' } }); tree = render();
  await button(tree, 'تأكيد الاستلام وإصدار إيصال').props.onClick();
  assert.equal(saved.length, 1); assert.deepEqual(saved[0].payload.lines, [{ productId: 'product', quantity: 2, expectedUnitPrice: 23 }]);
  assert.equal(saved[0].payload.expectedTotal, 41.4); assert.equal(saved[0].payload.discount, 4.6); assert.equal(saved[0].payload.accountId, 'cash'); assert.equal(saved[0].payload.shiftId, 'shift');
  tree = render(); assert.ok(button(tree, 'تأكيد الاستلام وإصدار إيصال').props.disabled, 'Successful sale clears cart'); groups++;

  find(tree, node => node.type === 'button' && node.props['aria-label']?.startsWith('إضافة قهوة')).props.onClick(); tree = render();
  field(tree, 'طريقة السداد').props.onChange({ target: { value: 'credit' } }); tree = render();
  await button(tree, 'تسجيل المبيعات الآجلة').props.onClick(); tree = render();
  assert.equal(saved.length, 1); assert.match(text(tree), /اختر العميل/);
  field(tree, 'العميل مطلوب للبيع الآجل').props.onChange({ target: { value: 'customer' } }); tree = render();
  await button(tree, 'تسجيل المبيعات الآجلة').props.onClick(); assert.equal(saved.length, 2); assert.equal(saved[1].payload.partyId, 'customer'); assert.equal('accountId' in saved[1].payload, false); groups++;

  tree = render(); field(tree, 'طريقة السداد').props.onChange({ target: { value: 'pos' } }); tree = render(); assert.match(text(tree), /أكمل الدفع على جهاز الشبكة/);
  field(tree, 'طريقة السداد').props.onChange({ target: { value: 'bank' } }); tree = render(); assert.match(text(tree), /وصول التحويل البنكي/); groups++;
  current = { ...current, shifts: [] }; tree = render(); assert.ok(button(tree, 'تأكيد الاستلام وإصدار إيصال').props.disabled);
  button(tree, 'بداية وردية').props.onClick(); tree = render(); assert.equal(find(tree, node => node.type?.name === 'FinanceOperationForm').props.form.operation, 'shift_open'); groups++;

  const receiptDoc = { id: 'doc', number: 1, kind: 'sale', party_id: 'customer', shift_id: 'shift', account_id: 'cash', warehouse_id: 'warehouse', subtotal: 100, discount: 0, tax: 0, total: 100, paid: 10, outstanding: 25, refunded: false, reference_id: null, note: '', created_at: '2026-10-23T10:00:00Z', lines: [] };
  const receiptTree = FinanceReceipt({ document: receiptDoc, snapshot: base });
  assert.ok(nodes(receiptTree).some(node => node.type?.name === 'Numeric' && node.props.value === 75), 'Receipt shows cumulative paid after settlements'); groups++;

  const formHooks = hooks(); const formCalls = [];
  const { FinanceOperationForm } = load('components/finance/finance-operation-form.tsx', { react: formHooks.api });
  const formProps = { form: { operation: 'stock_adjust', title: 'جرد', values: {} }, snapshot: base, pending: false, error: '', onCancel() {}, onSubmit: async (...args) => { formCalls.push(args); return true; } };
  const renderForm = () => formHooks.render(FinanceOperationForm, formProps);
  let formTree = renderForm(); field(formTree, 'نوع التسوية').props.onChange({ target: { value: 'count' } }); formTree = renderForm();
  field(formTree, 'الصنف').props.onChange({ target: { value: 'item' } }); formTree = renderForm();
  const nativeFormData = global.FormData;
  global.FormData = class { constructor(values) { this.values = values; } [Symbol.iterator]() { return this.values[Symbol.iterator](); } get(key) { return this.values.get(key); } };
  await formTree.props.onSubmit({ preventDefault() {}, currentTarget: new Map([['itemId', 'item'], ['warehouseId', 'warehouse'], ['countedQuantity', '3'], ['unitCost', '3'], ['note', 'جرد فعلي']]) });
  assert.equal(formCalls[0][1].countedQuantity, 3); assert.equal(formCalls[0][1].expectedQuantity, 5); assert.equal('quantity' in formCalls[0][1], false); groups++;
  global.FormData = nativeFormData;

  const staffHooks = hooks(); const staffForm = load('components/finance/finance-operation-form.tsx', { react: staffHooks.api }).FinanceOperationForm;
  const staffTree = staffHooks.render(staffForm, { ...formProps, form: { operation: 'staff', title: '', values: { userId: 'cashier', name: 'Cashier', role: 'cashier', active: true } } });
  assert.equal(nodes(staffTree).some(node => node.type === 'input' && node.props.name === 'email'), false, 'Staff edits use userId and do not require invisible email'); groups++;
  const journalHooks = hooks(); const journalForm = load('components/finance/finance-operation-form.tsx', { react: journalHooks.api }).FinanceOperationForm;
  const journalTree = journalHooks.render(journalForm, { ...formProps, form: { operation: 'journal', title: '' } });
  assert.equal(nodes(journalTree).some(node => node.type === 'option' && node.props.value === 'inventory'), false, 'Manual journal excludes stock control account'); groups++;

  const actionCalls = []; let fetchFails = false; let executeResponse = { ok: false, message: 'Try again' }; let release;
  const hookState = hooks();
  const { useFinance } = load('components/finance/use-finance.ts', { ...shared, react: hookState.api, '@/app/actions/brand-finance': {
    executeBrandFinanceAction: async (command) => { actionCalls.push(structuredClone(command)); if (release === 'wait') return new Promise(resolve => { release = resolve; }); return executeResponse; },
    fetchBrandFinanceAction: async () => fetchFails ? { ok: false, message: 'Refresh unavailable' } : { ok: true, data: structuredClone(base) },
    fetchBrandFinanceHistoryAction: async () => ({ ok: true, data: { rows: [], hasMore: false } }),
  } });
  const renderHook = () => hookState.render(() => useFinance(base, 'test-brand'));
  let hook = renderHook(); const payload = { lines: [], expectedTotal: 20 };
  await hook.execute('sale', payload); hook = renderHook(); await hook.execute('sale', payload);
  assert.equal(actionCalls[0].requestId, actionCalls[1].requestId, 'Same retry reuses original idempotency key'); groups++;
  executeResponse = { ok: true, data: { id: 'saved' } }; release = 'wait'; hook = renderHook();
  const first = hook.execute('sale', payload); await hook.execute('sale', payload); assert.equal(actionCalls.length, 3, 'Double submit locked synchronously'); release(executeResponse); await first;
  release = undefined; hook = renderHook(); await hook.execute('sale', payload); assert.notEqual(actionCalls[2].requestId, actionCalls[3].requestId, 'New successful sale gets new request key'); groups++;
  fetchFails = true; hook = renderHook(); const savedDespiteRefresh = await hook.execute('sale', payload); hook = renderHook();
  assert.equal(savedDespiteRefresh.id, 'saved'); assert.equal(hook.stale, true); const count = actionCalls.length; await hook.execute('sale', payload); assert.equal(actionCalls.length, count, 'Stale state blocks new writes after successful posting');
  fetchFails = false; await hook.refresh(); hook = renderHook(); assert.equal(hook.stale, false); groups++;

  const workspaceHooks = hooks(); const { FinanceWorkspace } = load('components/finance/finance-workspace.tsx', { ...shared, react: workspaceHooks.api, './use-finance': { useFinance: () => ({ ...uiState, snapshot: { ...base, documents: [receiptDoc] }, historyMore: {} }) } });
  const workspaceRender = () => workspaceHooks.render(FinanceWorkspace, { initialSnapshot: base }); let workspaceTree = workspaceRender();
  button(workspaceTree, 'المبيعات').props.onClick(); workspaceTree = workspaceRender();
  button(workspaceTree, 'تسجيل دفعة').props.onClick(); workspaceTree = workspaceRender();
  assert.equal(find(workspaceTree, node => node.type?.name === 'FinanceOperationForm').props.form.values.remaining, 25, 'Settlement form uses authoritative outstanding'); groups++;

  const paginationHooks = hooks(); const offsets = [];
  const initialHistory = { ...base, documents: Array.from({ length: 500 }, (_, index) => ({ ...receiptDoc, id: `doc-${index}` })) };
  const pagination = load('components/finance/use-finance.ts', { ...shared, react: paginationHooks.api, '@/app/actions/brand-finance': {
    fetchBrandFinanceHistoryAction: async (kind, offset) => { offsets.push(offset); return { ok: true, data: { rows: offset === 500 ? [{ ...receiptDoc, id: 'doc-499' }, { ...receiptDoc, id: 'doc-500' }] : [], hasMore: offset === 500 } }; },
  } });
  const paged = () => paginationHooks.render(() => pagination.useFinance(initialHistory));
  let page = paged(); await page.loadMore('documents'); page = paged(); assert.equal(page.snapshot.documents.length, 501);
  await page.loadMore('documents'); assert.deepEqual(offsets, [500, 502], 'Paging advances server rows while de-duplicating concurrent inserts'); groups++;

  const cashierHooks = hooks(); const cashierData = { ...base, canManage: false, canAdminister: false, role: 'cashier', documents: [receiptDoc] };
  const cashierPOS = load('components/finance/finance-pos.tsx', { ...shared, react: cashierHooks.api, './use-finance': { useFinance: () => ({ ...uiState, snapshot: cashierData }) } }).FinancePOS;
  const cashierTree = cashierHooks.render(cashierPOS, { initialSnapshot: cashierData });
  assert.equal(nodes(cashierTree).some(node => node.type === 'button' && text(node) === 'إرجاع'), false, 'Cashier cannot start refunds');
  assert.equal(nodes(cashierTree).some(node => node.type?.name === 'Link' && text(node) === 'الإدارة المالية'), false, 'Cashier is separate from financial management'); groups++;

  console.log(`Finance UI: ${groups} behavior groups passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
