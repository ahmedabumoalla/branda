const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');

function load(file, mocks = {}) {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', compiled)(name => {
    if (name in mocks) return mocks[name];
    if (name === './use-pos-finance') return { usePosFinance: (...args) => ({ ...mocks['./use-finance'].useFinance(...args), offline: { sales: [], ready: true, online: true, logout: async () => {} } }) };
    if (name === './use-finance-printer') return { useFinancePrinter: () => ({ ready: true, autoEnabled: true, handler: () => async () => {} }) };
    if (name === '@/app/actions/finance-pos-customer') return {};
    if (name === './finance-printer-settings') return { FinancePrinterSettings() {} };
    if (name === '@/app/actions/brand-finance') return {};
    if (name.startsWith('@/app/actions/')) return new Proxy({}, { get: (_, key) => () => { throw Error('Unmocked action: '+name+':'+String(key)); } });
    if (name === 'server-only') return {};
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
let loginLocale = 'ar';
const { cashierText, cashierError } = load('lib/cashier/language.ts');
const languageMock = { CashierLanguageSwitch: function CashierLanguageSwitch() {}, useCashierLanguage: () => ({locale: loginLocale, dir: loginLocale === 'ar' ? 'rtl' : 'ltr', t: message => cashierText(loginLocale, message), errorText: message => cashierError(loginLocale, message)}) };
const shared = { 'next/link': { __esModule: true, default: function Link() {} }, 'next/image': { __esModule: true, default: ImageMock }, 'next/navigation': { useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace() {} }) }, '@/app/actions/finance-access': { createFinanceStaffAccountAction: async () => ({ ok: true }), logoutFinanceAction: async () => {} } };

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
  // Navigation is resolved by server authority, never a user-supplied return URL.
  assert.equal(find(tree, node => node.type?.name === 'Link' && text(node) === 'الإدارة المالية').props.href, '/finance/test-brand');
  const dashboardReturnTree = uiHooks.render(FinancePOS, { initialSnapshot: current, slug: 'test-brand', dashboardHref: '/dashboard/finance' });
  assert.equal(find(dashboardReturnTree, node => node.type?.name === 'Link' && text(node) === 'الإدارة المالية').props.href, '/dashboard/finance'); groups++;
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
  button(tree, 'آجل على العميل').props.onClick(); tree = render();
  await button(tree, 'تسجيل المبيعات الآجلة').props.onClick(); tree = render();
  assert.equal(saved.length, 1); assert.match(text(tree), /اختر العميل/);
  field(tree, 'العميل مطلوب للبيع الآجل').props.onChange({ target: { value: 'customer' } }); tree = render();
  await button(tree, 'تسجيل المبيعات الآجلة').props.onClick(); assert.equal(saved.length, 2); assert.equal(saved[1].payload.partyId, 'customer'); assert.equal('accountId' in saved[1].payload, false); groups++;

  tree = render(); button(tree, 'شبكة').props.onClick(); tree = render(); assert.match(text(tree), /أكمل الدفع على جهاز الشبكة/);
  button(tree, 'تحويل بنكي').props.onClick(); tree = render(); assert.match(text(tree), /وصول التحويل البنكي/); groups++;
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
  const hookState = hooks(); let cashierMessage = 'Account created; WhatsApp queued';
  const { useFinance } = load('components/finance/use-finance.ts', { ...shared, react: hookState.api, '@/app/actions/finance-access': { ...shared['@/app/actions/finance-access'], createSalesCashierAccountAction: async () => ({ok:true,message:cashierMessage}) }, '@/app/actions/brand-finance': {
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
  await hook.execute('sales_cashier_create', {name:'Cashier',phone:'0500000000',password:'Abcde!12'}); hook = renderHook(); assert.equal(hook.message,cashierMessage);
  cashierMessage = 'Account created; WhatsApp unconfirmed';
  assert(await hook.execute('sales_cashier_create', {name:'Cashier',phone:'0500000000',password:'Abcde!12'})); hook = renderHook(); assert.equal(hook.message,cashierMessage,'Do not overwrite delivery warnings with a generic success'); groups++;

  const workspaceHooks = hooks(); const { FinanceWorkspace } = load('components/finance/finance-workspace.tsx', { ...shared, react: workspaceHooks.api, './use-finance': { useFinance: () => ({ ...uiState, snapshot: { ...base, documents: [receiptDoc] }, historyMore: {} }) } });
  const workspaceRender = () => workspaceHooks.render(FinanceWorkspace, { initialSnapshot: base, slug: 'test-brand' }); let workspaceTree = workspaceRender();
  button(workspaceTree, 'المبيعات').props.onClick(); workspaceTree = workspaceRender();
  button(workspaceTree, 'تسجيل دفعة').props.onClick(); workspaceTree = workspaceRender();
  assert.equal(find(workspaceTree, node => node.type?.name === 'FinanceOperationForm').props.form.values.remaining, 25, 'Settlement form uses authoritative outstanding'); groups++;

  let dashboardQuery = 'section=sales';
  const dashboardHooks = hooks();
  const DashboardFinance = load('components/finance/finance-workspace.tsx', { ...shared, react: dashboardHooks.api, 'next/navigation': { useSearchParams: () => new URLSearchParams(dashboardQuery) }, './use-finance': { useFinance: () => ({ ...uiState, snapshot: base, historyMore: {} }) } }).FinanceWorkspace;
  const dashboardRender = () => dashboardHooks.render(DashboardFinance, { initialSnapshot: base });
  let dashboardTree = dashboardRender();
  assert(!nodes(dashboardTree).some(node => node.type === 'nav'), 'Dashboard sections belong only to sidebar');
  assert(nodes(dashboardTree).some(node => node.props.href === '/finance/test-brand/pos'), 'Dashboard opens independent POS');
  assert(nodes(dashboardTree).some(node => node.type === 'input' && node.props.type === 'date'), 'Deep-linked sales section is selected');
  dashboardQuery = 'section=overview'; dashboardTree = dashboardRender();
  assert(!nodes(dashboardTree).some(node => node.type === 'input' && node.props.type === 'date'), 'URL changes and browser history select section'); groups++;

  dashboardQuery = 'section=sales'; dashboardTree = dashboardRender();
  button(dashboardTree, 'إضافة فاتورة').props.onClick(); dashboardTree = dashboardRender();
  let invoiceControl = find(dashboardTree, node => node.type?.name === 'FinanceSaleForm');
  await invoiceControl.props.onSubmit('shift_open', { openingCash: 0 });
  dashboardTree = dashboardRender(); assert(nodes(dashboardTree).some(node => node.type?.name === 'FinanceSaleForm'), 'Opening shift keeps invoice composer mounted');
  invoiceControl = find(dashboardTree, node => node.type?.name === 'FinanceSaleForm');
  await invoiceControl.props.onSubmit('sale', {}); dashboardTree = dashboardRender();
  assert(!nodes(dashboardTree).some(node => node.type?.name === 'FinanceSaleForm'), 'Successful invoice closes composer'); groups++;

  const invoiceHooks = hooks();
  const invoices = load('components/finance/finance-sale-form.tsx', { ...shared, react: invoiceHooks.api });
  const draft = { lines: [{ key: 1, productId: 'product', quantity: 2 }], warehouseId: 'warehouse', partyId: '', paymentKind: 'cash', accountId: 'cash', discountValue: 10, discountKind: 'percent', note: ' invoice ' };
  const posted = invoices.invoicePayload(base, draft);
  assert.equal(posted.expectedTotal, 41.4); assert.equal(posted.discount, 4.6); assert.equal(posted.shiftId, 'shift'); assert.equal(posted.lines[0].expectedUnitPrice, 23); assert.equal(posted.note, 'invoice');
  assert.equal(invoices.invoicePayload({ ...base, settings: { ...base.settings, tax_inclusive: false } }, draft).expectedTotal, 47.61);
  for (const change of [{ lines: [] }, { lines: [draft.lines[0], draft.lines[0]] }, { lines: [{ ...draft.lines[0], quantity: NaN }] }, { lines: [{ ...draft.lines[0], quantity: 6 }] }, { lines: [{ ...draft.lines[0], productId: 'missing' }] }, { warehouseId: 'other' }, { discountValue: Infinity }, { discountValue: 101 }, { paymentKind: 'credit' }, { accountId: 'bank' }, { partyId: 'other' }]) assert.throws(() => invoices.invoicePayload(base, { ...draft, ...change }));
  for (const change of [{ canManage: false }, { shifts: [] }, { shifts: [{ ...base.shifts[0], user_id: 'other' }] }, { products: [{ ...base.products[0], available: false }] }]) assert.throws(() => invoices.invoicePayload({ ...base, ...change }, draft));
  const credit = invoices.invoicePayload(base, { ...draft, paymentKind: 'credit', partyId: 'customer' }); assert(!('accountId' in credit)); assert.equal(credit.partyId, 'customer'); groups++;
  const exclusiveInvoice = { ...draft, vatRate: 10, taxInclusive: false };
  const exclusivePayload = invoices.invoicePayload(base, exclusiveInvoice);
  assert.equal(exclusivePayload.expectedTotal, 45.54); assert.equal(exclusivePayload.vatRate, 10); assert.equal(exclusivePayload.taxInclusive, false);
  assert.equal(invoices.invoicePayload(base, { ...exclusiveInvoice, discountEnabled: false }).discount, 0);
  for (const vatRate of [-1, 100.01, 1.111, NaN, Infinity]) assert.throws(() => invoices.invoicePayload(base, { ...draft, vatRate }));
  for (const taxInclusive of [true, false]) {
    const previewDraft = { ...draft, lines: [{ key: 1, productId: 'product', quantity: 1 }, { key: 2, productId: 'product', quantity: 2 }], vatRate: 15, taxInclusive };
    const totals = invoices.invoicePreview(base, previewDraft), rows = invoices.invoiceLinePreview(base, previewDraft);
    for (const key of ['tax', 'discount', 'total']) assert(Math.abs(rows.reduce((sum, row) => sum + row[key], 0) - totals[key]) < .000001, key + ' rows reconcile to invoice');
    assert(invoices.invoiceLinePreview(base, { ...previewDraft, discountEnabled: false }).every(row => row.discount === 0), 'Tax rounding never appears as a discount');
  }
  groups++;

  let invoiceData = structuredClone(base), invoicePending = false, invoiceStale = false, calls = [], unblock;
  const invoiceRender = () => invoiceHooks.render(invoices.FinanceSaleForm, { snapshot: invoiceData, pending: invoicePending, stale: invoiceStale, error: '', onCancel() {}, onSubmit: async (operation, payload) => { calls.push({ operation, payload }); if (unblock) await unblock; return false; } });
  let invoiceTree = invoiceRender();
  assert(nodes(invoiceTree).some(node => node.type === 'table'), 'Invoice lines are a semantic table');
  const checkbox = label => find(invoiceTree, node => node.type === 'label' && text(node).includes(label)).props.children[0];
  checkbox('السعر شامل الضريبة').props.onChange({ target: { checked: false } }); invoiceTree = invoiceRender();
  assert.equal(checkbox('السعر شامل الضريبة').props.checked, false);
  checkbox('يوجد خصم').props.onChange({ target: { checked: true } }); invoiceTree = invoiceRender();
  assert(field(invoiceTree, 'الخصم'));
  checkbox('يوجد خصم').props.onChange({ target: { checked: false } }); invoiceTree = invoiceRender();
  assert(!nodes(invoiceTree).some(node => node.type?.name === 'Field' && node.props.label === 'الخصم'));
  checkbox('السعر شامل الضريبة').props.onChange({ target: { checked: true } }); invoiceTree = invoiceRender();
  groups++;
  const choose = label => find(invoiceTree, node => node.type?.name === 'Field' && node.props.label === label);
  choose('الصنف 1').props.children.props.onChange({ target: { value: 'product' } }); invoiceTree = invoiceRender();
  field(invoiceTree, 'الكمية 1').props.onChange({ target: { value: '2' } }); invoiceTree = invoiceRender();
  let unlock; unblock = new Promise(resolve => { unlock = resolve; });
  const submit = find(invoiceTree, node => node.type === 'form').props.onSubmit({ preventDefault() {} }); await find(invoiceTree, node => node.type === 'form').props.onSubmit({ preventDefault() {} }); assert.equal(calls.length, 1, 'Immediate double submit is locked'); unlock(); await submit; unblock = null;
  invoiceTree = invoiceRender(); assert.equal(field(invoiceTree, 'الكمية 1').props.value, 2, 'Failed save retains draft');
  invoiceStale = true; invoiceTree = invoiceRender(); await find(invoiceTree, node => node.type === 'form').props.onSubmit({ preventDefault() {} }); assert.equal(calls.length, 1); invoiceStale = false;
  invoiceData = { ...base, shifts: [] }; invoiceTree = invoiceRender(); assert.equal(button(invoiceTree, 'حفظ الفاتورة').props.disabled, true);
  button(invoiceTree, 'بدء وردية من هنا').props.onClick(); invoiceTree = invoiceRender(); assert.equal(invoiceTree.type.name, 'FinanceOperationForm');
  invoiceTree.props.onCancel(); invoiceTree = invoiceRender(); assert.equal(field(invoiceTree, 'الكمية 1').props.value, 2, 'Shift setup keeps invoice draft'); groups++;

  button(invoiceTree, 'إضافة عميل').props.onClick(); invoiceTree = invoiceRender();
  assert.equal(find(invoiceTree, node => node.type === 'form').props.inert, true, 'Invoice is inert behind customer dialog');
  let customerControl = find(invoiceTree, node => node.type?.name === 'FinanceCustomerForm');
  customerControl.props.onCancel(); invoiceTree = invoiceRender();
  assert.equal(field(invoiceTree, 'الكمية 1').props.value, 2, 'Cancel customer retains invoice');
  button(invoiceTree, 'إضافة عميل').props.onClick(); invoiceTree = invoiceRender();
  customerControl = find(invoiceTree, node => node.type?.name === 'FinanceCustomerForm');
  invoiceData = { ...base, parties: [...base.parties, { ...base.parties[0], id: 'created-customer', name: 'New customer' }] };
  customerControl.props.onSaved('created-customer'); invoiceTree = invoiceRender();
  assert.equal(field(invoiceTree, 'العميل').props.value, 'created-customer');
  assert.equal(field(invoiceTree, 'الكمية 1').props.value, 2); groups++;
  const customerHooks = hooks();
  const { customerPayload, FinanceCustomerForm } = load('components/finance/finance-customer-form.tsx', { react: customerHooks.api });
  const customerFields = new FormData(); customerFields.set('name', '  Customer  ');
  assert.throws(() => customerPayload(customerFields, 'customer-id'), /أدخل رقم جوال العميل/);
  customerFields.set('phone', '   '); assert.throws(() => customerPayload(customerFields, 'customer-id'), /أدخل رقم جوال العميل/);
  customerFields.set('phone', '  0500000000  ');
  const minimalCustomer = customerPayload(customerFields, 'customer-id'); assert.equal(minimalCustomer.name, 'Customer'); assert.equal(minimalCustomer.phone, '0500000000'); assert.deepEqual(minimalCustomer.details, {});
  customerFields.set('city', 'Riyadh'); customerFields.set('governmentId', 'optional-id'); customerFields.set('postalCode', '12345');
  assert.deepEqual(customerPayload(customerFields, 'customer-id').details, { city: 'Riyadh', postalCode: '12345', governmentId: 'optional-id' });
  customerFields.set('name', '  '); assert.throws(() => customerPayload(customerFields, 'customer-id'));
  const customerTree = customerHooks.render(FinanceCustomerForm, { pending: false, error: '', onCancel() {}, onSubmit: async () => false });
  assert.deepEqual(nodes(customerTree).filter(node => node.props.required).map(node => node.props.name), ['name', 'phone'], 'Customer name and phone are required');
  for (const name of ['phone', 'email', 'taxNumber', 'buildingNumber', 'street', 'district', 'city', 'postalCode', 'additionalNumber', 'governmentId', 'commercialRegistration', 'unifiedNumber']) assert(nodes(customerTree).some(node => node.props.name === name)); groups++;

  const customerRpcCalls = [];
  const customerCommands = load('lib/data/brand-finance.ts', {
    'server-only': {}, '@/lib/data/cafes': {}, '@/lib/menu/standalone-menu': {}, './finance-shift-alerts': {}, './finance-pos-customer-messages': {},
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) }, rpc: async (name, args) => { customerRpcCalls.push({ name, args }); return { data: name === 'brand_finance_context' ? { id: 'cafe' } : { id: 'saved' }, error: null }; } }) },
  });
  const customerCommand = payload => customerCommands.executeBrandFinanceCommand({ operation: 'party', requestId: '00000000-0000-4000-8000-000000000001', payload }, 'test-brand');
  for (const phone of [undefined, null, '', '  ', 123, '0'.repeat(31)]) await assert.rejects(customerCommand({ kind: 'customer', name: 'Customer', phone }));
  await assert.rejects(customerCommand({ name: 'Customer', details: {} }), /أدخل رقم جوال العميل/);
  assert.equal(customerRpcCalls.length, 0, 'Invalid customer phone never reaches RPC');
  await customerCommand({ kind: 'customer', name: 'Customer', phone: ' 0500000000 ', details: {} });
  assert.equal(customerRpcCalls.at(-1).args.p_payload.phone, '0500000000');
  await customerCommand({ kind: 'supplier', name: 'Supplier' });
  assert.equal(customerRpcCalls.at(-1).name, 'brand_finance_execute', 'Supplier phone remains optional'); groups++;

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
  assert.equal(nodes(cashierTree).some(node => node.type === 'button' && text(node) === 'إرجاع'), true, 'Cashier can request a refund of own sale; approval remains owner-only');
  assert.equal(nodes(cashierTree).some(node => node.type?.name === 'Link' && text(node) === 'الإدارة المالية'), false, 'Cashier is separate from financial management'); groups++;

  const refundDocument = { ...receiptDoc, total: 2283, outstanding: 0, lines: [{ id: 'line', name: 'Coffee', quantity: 20, net: 1985.22, tax: 297.78, unit_price: 115, returned_quantity: 0, returned_net: 0, returned_tax: 0 }] };
  const { refundPreview, refundPayload } = load('components/finance/finance-refund-form.tsx');
  assert.equal(refundPreview(refundDocument, { line: 1 }).total, 114.15);
  assert.equal(refundPreview(refundDocument, {}).total, 0, 'Nothing returned by default');
  const refundInput = refundPayload(refundDocument, { line: 1 }, 'cash', 'Reason', base, 'shift');
  assert.equal(refundInput.expectedPaid, 114.15); assert.equal(refundInput.paymentMethod, 'cash');
  assert.deepEqual(refundInput.lines, [{ lineId: 'line', quantity: 1, expectedReturnedQuantity: 0 }]);
  for (const quantity of [-1, 21, NaN, .0001]) assert.throws(() => refundPayload(refundDocument, { line: quantity }, 'cash', 'Reason', base, 'shift'));
  assert.throws(() => refundPayload(refundDocument, {}, 'cash', 'Reason', base, 'shift'));
  assert.throws(() => refundPayload(refundDocument, { line: 1 }, 'card', 'Reason', base));
  assert.throws(() => refundPayload(refundDocument, { line: 1 }, 'cash', 'Reason', base), 'Open drawer requires shift custody');
  assert.throws(() => refundPayload(refundDocument, { line: 1 }, 'cash', 'Reason', base, 'other'));
  const previous = { ...refundDocument, lines: [{ ...refundDocument.lines[0], returned_quantity: 1, returned_net: 99.26, returned_tax: 14.89 }] };
  assert.equal(refundPreview(previous, { line: 19 }).total, 2168.85);
  assert.equal(refundPreview(previous, { line: 19 }).total + 114.15, refundDocument.total, 'Final quantity returns exact rounding remainder');
  const refundCredit = refundPreview({ ...refundDocument, outstanding: 100 }, { line: 1 });
  assert.equal(refundCredit.debt, 100); assert.equal(refundCredit.paid, 14.15); groups++;

  const request = { id: 'request', document_id: 'doc', document_number: 1, status: 'pending', total: 114.15, paid: 114.15, created_at: receiptDoc.created_at, created_by: 'cashier', payload: { ...refundInput, lines: [{ lineId: 'line', quantity: 1, name: 'Coffee' }] } };
  const requestHooks = hooks(); const approvals = []; let approveDone;
  const { FinanceRefundRequests } = load('components/finance/finance-refund-requests.tsx', { ...shared, react: requestHooks.api });
  let reviewData = { ...base, documents: [refundDocument], refundRequests: [request] };
  const reviewProps = { pending: false, error: '', onExecute: async (operation, payload) => { approvals.push({ operation, payload }); return new Promise(resolve => { approveDone = resolve; }); }, onReceipt: id => approvals.push({ receipt: id }) };
  const reviewRender = () => requestHooks.render(FinanceRefundRequests, { ...reviewProps, snapshot: reviewData });
  let reviewTree = reviewRender(); button(reviewTree, 'مراجعة واعتماد').props.onClick(); reviewTree = reviewRender();
  assert.equal(button(reviewTree, 'اعتماد المرتجع وترحيل المبلغ').props.disabled, true);
  find(reviewTree, node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } }); reviewTree = reviewRender();
  const approving = button(reviewTree, 'اعتماد المرتجع وترحيل المبلغ').props.onClick();
  await button(reviewTree, 'اعتماد المرتجع وترحيل المبلغ').props.onClick(); assert.equal(approvals.length, 1, 'Approval double click lock');
  assert.deepEqual(approvals[0], { operation: 'refund_approve', payload: { requestId: 'request' } });
  approveDone(null); await approving; reviewTree = reviewRender(); assert(button(reviewTree, 'اعتماد المرتجع وترحيل المبلغ'), 'Failed review remains open');
  reviewData = { ...reviewData, canAdminister: false, role: 'manager' }; reviewTree = reviewRender();
  assert(!nodes(reviewTree).some(node => node.type === 'button' && text(node) === 'اعتماد المرتجع وترحيل المبلغ'), 'Manager cannot approve');
  assert(!nodes(reviewTree).some(node => node.type === 'button' && text(node) === 'رفض الطلب'), 'Manager cannot reject'); groups++;

  const settingsHooks = hooks();
  const SettingsWorkspace = load('components/finance/finance-workspace.tsx', { ...shared, react: settingsHooks.api, 'next/navigation': { useSearchParams: () => new URLSearchParams('section=settings') }, './use-finance': { useFinance: () => ({ ...uiState, snapshot: { ...base, role: 'manager', canAdminister: false } }) } }).FinanceWorkspace;
  const settingsTree = settingsHooks.render(SettingsWorkspace, { initialSnapshot: base });
  assert(nodes(settingsTree).some(node => node.props.title === 'إضافة الكاشير متاحة لمالك العلامة'), 'Settings shows explicit authority instead of silently switching overview'); groups++;

  assert.equal(button(settingsTree, 'إضافة كاشير مبيعات').props.disabled, true);
  button(workspaceTree, 'إضافة كاشير مبيعات').props.onClick(); workspaceTree = workspaceRender();
  assert.equal(find(workspaceTree, node => node.type?.name === 'FinanceOperationForm').props.form.operation, 'sales_cashier_create');
  formProps.form = { operation: 'sales_cashier_create' };
  assert.equal(renderForm().type.name, 'SalesCashierForm');
  formProps.snapshot = { ...base, canAdminister: false };
  assert.match(text(renderForm()), /مالك العلامة/); groups++;

  const salesHooks = hooks(); const submissions = []; let finishSales;
  const { SalesCashierForm } = load('components/finance/sales-cashier-form.tsx', { react: salesHooks.api });
  const salesProps = { pending: false, error: 'تعذر الحفظ', onCancel() {}, onSubmit: async (...args) => { submissions.push(args); return new Promise(resolve => { finishSales = resolve; }); } };
  let salesTree = salesHooks.render(SalesCashierForm, salesProps);
  assert(!nodes(salesTree).some(node => node.type === 'input' && node.props.type === 'email'));
  for (const name of ['name', 'phone', 'password']) assert(find(salesTree, node => node.type === 'input' && node.props.name === name).props.required);
  assert.match(text(salesTree), /تعذر الحفظ/);
  global.FormData = class { constructor(values) { this.values = values; } get(key) { return this.values.get(key); } };
  const passwordField = find(salesTree, node => node.type === 'input' && node.props.name === 'password');
  assert.equal(passwordField.props.minLength, 8);
  const nativePattern = new RegExp('^(?:' + passwordField.props.pattern + ')$', 'v');
  assert(nativePattern.test('Abcde!12')); assert(!nativePattern.test('abcdef!1')); assert(!nativePattern.test('Abcdef12'));
  await salesTree.props.onSubmit({ preventDefault() {}, currentTarget: new Map([['password', 'weak']]) });
  assert.equal(submissions.length, 0);
  salesTree = salesHooks.render(SalesCashierForm, salesProps);
  const salesEvent = { preventDefault() {}, currentTarget: new Map([['name', ' Cashier '], ['phone', ' 0500000000 '], ['password', '  Abcde!12  ']]) };
  const submission = salesTree.props.onSubmit(salesEvent); await salesTree.props.onSubmit(salesEvent);
  assert.equal(submissions.length, 1); assert.deepEqual(submissions[0], ['sales_cashier_create', { name: 'Cashier', phone: '0500000000', password: '  Abcde!12  ' }]);
  finishSales(false); await submission; global.FormData = nativeFormData;
  salesTree = salesHooks.render(SalesCashierForm, { ...salesProps, pending: true });
  assert(find(salesTree, node => node.type === 'fieldset').props.disabled); groups++;

  let loyaltyChecks = 0;
  const CashierAccessPicker = function CashierAccessPicker() {}, SalesCashierLoginStub = function SalesCashierLogin() {}, CashierLoginForm = function CashierLoginForm() {};
  const LoginPage = load('app/cashier/login/page.tsx', {
    'next/navigation': { redirect: destination => { throw Error(destination); } },
    '@/components/cashier/cashier-access-picker': { CashierAccessPicker },
    '@/components/finance/sales-cashier-login': { SalesCashierLogin: SalesCashierLoginStub },
    '@/components/cashier/cashier-login-form': { CashierLoginForm },
    '@/lib/data/cashier': { getCashierLandingPath: async () => { loyaltyChecks++; return null; } },
  }).default;
  assert.equal((await LoginPage({ searchParams: Promise.resolve({}) })).type, CashierAccessPicker);
  assert.equal((await LoginPage({ searchParams: Promise.resolve({ type: 'sales', reason: 'session' }) })).type, SalesCashierLoginStub);
  assert.equal(loyaltyChecks, 0, 'Sales mode cannot be redirected by a loyalty session');
  assert.equal((await LoginPage({ searchParams: Promise.resolve({ type: 'loyalty' }) })).type, CashierLoginForm);
  assert.equal((await LoginPage({ searchParams: Promise.resolve({ reason: 'session' }) })).type, CashierLoginForm);
  assert.equal(loyaltyChecks, 2); groups++;

  const loginHooks = hooks(); let loginResult = { ok: false, message: 'Denied' }; const loginCalls = [], destinations = [];
  const { SalesCashierLogin } = load('components/finance/sales-cashier-login.tsx', { ...shared, react: loginHooks.api,
    '@/components/cashier/cashier-language': languageMock,
    '@/components/ui/barndaksa-logo': { BarndaksaLogo: function Logo() {} },
    'next/navigation': { useRouter: () => ({ replace: path => destinations.push(path), refresh() {} }) },
    '@/app/actions/finance-access': { loginSalesCashierAction: async (...args) => { loginCalls.push(args); return loginResult; } },
  });
  const loginRender = () => loginHooks.render(SalesCashierLogin, {});
  global.FormData = class { get(key) { return key === 'phone' ? '0500000000' : 'password1234'; } };
  let resets = 0; const loginEvent = { preventDefault() {}, currentTarget: { reset() { resets++; } } };
  await find(loginRender(), node => node.type === 'form').props.onSubmit(loginEvent);
  assert.match(text(loginRender()), /Denied/); assert.equal(resets, 0); assert.equal(destinations.length, 0);
  const attemptsBeforeOtpChoice = loginCalls.length;
  button(loginRender(), 'الدخول برمز واتساب بدل كلمة المرور').props.onClick();
  assert(!nodes(loginRender()).some(node => node.type === 'input' && node.props.name === 'password'));
  assert(button(loginRender(), 'أرسل رمز واتساب'));
  assert.equal(resets, 0);assert.equal(loginCalls.length, attemptsBeforeOtpChoice, 'Choosing OTP neither resets the form nor sends a request');
  button(loginRender(), 'كلمة المرور').props.onClick();groups++;
  loginResult = { ok: true, redirectTo: '/finance/brand/pos' };
  await find(loginRender(), node => node.type === 'form').props.onSubmit(loginEvent);
  assert.deepEqual(loginCalls[1], ['0500000000', 'password1234']); assert.deepEqual(destinations, ['/finance/brand/pos']);
  loginResult = { ok: true, brands: [{ slug: 'brand', name: 'Brand' }, { slug: 'second', name: 'Second' }] };
  await find(loginRender(), node => node.type === 'form').props.onSubmit(loginEvent);
  assert(find(loginRender(), node => node.props?.href === '/finance/second/pos'));
  assert.equal(nodes(loginRender()).some(node => node.type === 'form'), false);
  global.FormData = nativeFormData; groups++;

  const otpHooks = hooks(), requestedPhones = [], verifiedCodes = [], otpDestinations = [];
  let otpResult = { ok: false, message: 'Expired code' };
  const OtpLogin = load('components/finance/sales-cashier-login.tsx', { ...shared, react: otpHooks.api,
    '@/components/cashier/cashier-language': languageMock,
    '@/components/ui/barndaksa-logo': { BarndaksaLogo: function Logo() {} },
    'next/navigation': { useRouter: () => ({ replace: path => otpDestinations.push(path), refresh() {} }) },
    '@/app/actions/finance-access': { requestSalesCashierOtpAction: async phone => { requestedPhones.push(phone); return {ok:true,message:'Code requested'}; }, verifySalesCashierOtpAction: async (...args) => { verifiedCodes.push(args); return otpResult; } },
  }).SalesCashierLogin;
  const otpRender = () => otpHooks.render(OtpLogin, {});
  button(otpRender(), 'رمز واتساب').props.onClick();
  assert(!nodes(otpRender()).some(node => node.type === 'input' && node.props.name === 'password'));
  global.FormData = class { get(key) { return key === 'phone' ? '0500000000' : '١٢٣٤٥٦'; } };
  const sendingOtp = find(otpRender(), node => node.type === 'form').props.onSubmit(loginEvent);
  await find(otpRender(), node => node.type === 'form').props.onSubmit(loginEvent);await sendingOtp;
  assert.deepEqual(requestedPhones,['0500000000']);assert(find(otpRender(), node => node.type === 'input' && node.props.name === 'phone').props.readOnly);
  assert(find(otpRender(), node => node.type === 'input' && node.props.name === 'code').props.required);
  const resetCount = resets;
  loginLocale = 'en';
  assert.equal(otpRender().props.dir, 'ltr');assert.equal(otpRender().props.lang, 'en');
  assert(text(otpRender()).includes('Sales cashier sign-in'));assert(text(otpRender()).includes('Sign-in code'));
  assert(find(otpRender(), node => node.type === 'input' && node.props.name === 'phone').props.readOnly);
  assert.equal(resets, resetCount, 'Language switching preserves the submitted phone and OTP challenge');
  otpResult={ok:false,message:'الرمز غير صحيح أو منتهي اطلب رمزًا جديدًا'};
  await find(otpRender(), node => node.type === 'form').props.onSubmit(loginEvent);
  assert(text(otpRender()).includes('The code is incorrect or expired Request a new code'));
  loginLocale='ar';otpResult={ok:false,message:'Expired code'};groups++;
  await button(otpRender(),'إعادة إرسال الرمز بعد دقيقة').props.onClick();assert.equal(requestedPhones.length,1,'Resend cooldown');
  await find(otpRender(), node => node.type === 'form').props.onSubmit(loginEvent);assert.match(text(otpRender()),/Expired code/);
  assert.deepEqual(verifiedCodes[0],['0500000000','١٢٣٤٥٦']);
  otpResult={ok:true,redirectTo:'/finance/brand/pos'};
  await find(otpRender(), node => node.type === 'form').props.onSubmit(loginEvent);assert.deepEqual(otpDestinations,['/finance/brand/pos']);
  global.FormData = nativeFormData;groups++;

  console.log(`Finance UI: ${groups} behavior groups passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
