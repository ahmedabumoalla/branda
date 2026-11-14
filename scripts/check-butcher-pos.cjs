const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const styles = new Proxy({}, { get: (_, key) => key });
function load(file, mocks = {}) {
  const exported = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.css')) return { __esModule: true, default: styles };
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts', mocks);
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + '.ts'), mocks);
    return require(name);
  }, exported);
  return exported;
}
const selection = load('lib/finance/pos-product-selection.ts');
const { createFinanceReceiptPreview } = load('lib/finance/receipt-preview.ts');
const { previewFinanceTotals } = load('lib/finance/brand-finance.ts');
const offline = load('lib/finance/pos-offline.ts');
const product = { id: 'product', name: 'لحم عجل', price: 75, available: true, stockTracked: false, itemId: null, imageUrl: null, category: 'اللحوم', butcherDetails: { meatType: 'calf', origin: 'بلدي', units: [{ id: 'kg', label: 'كيلو', price: 75 }, { id: 'g', label: 'جرام', price: .075 }, { id: 'half', label: 'نصف ذبيحة', price: 800 }] } };
const snapshot = { cafe: { id: 'cafe', name: 'ملحمة', slug: 'brand', businessCategory: 'butcher_shops' }, userId: 'user', role: 'cashier', canManage: false, warehouses: [{ id: 'warehouse', name: 'المستودع', active: true }], products: [product], shifts: [], accounts: [{ id: 'occupied', kind: 'cash', active: true, is_cashier_drawer: true, availableWithoutShift: false, is_primary: true }, { id: 'cash', kind: 'cash', active: true, is_cashier_drawer: true, availableWithoutShift: true }, { id: 'pos', kind: 'pos', active: true }], stock: [], settings: { vat_rate: 15, tax_inclusive: true }, parties: [], documents: [], staff: [] };
const receipt = (lines, data = snapshot) => createFinanceReceiptPreview({ lines, settings: data.settings, discount: 0, paymentKind: 'cash', accountId: 'cash', note: '', createdAt: '2026-11-07T12:00:00Z' });
const cashierProduct = { ...product, price: 0, butcherDetails: { ...product.butcherDetails, units: [{ id: 'quarter', label: 'ربع ذبيحة', price: 0, priceMode: 'cashier' }, { id: 'half', label: 'نصف ذبيحة', price: 800 }] } };
let checks = 0;
function test(name, run) { run(); checks++; }
test('Cashier price is required, bounded and cannot override fixed or non-butcher products', () => {
  for (const invalid of [undefined, null, '', '450', 0, -1, NaN, Infinity, 1000001, .1234567]) assert.throws(() => selection.financeProductSelection(cashierProduct, 'quarter', true, invalid));
  assert.equal(selection.financeProductSelection(cashierProduct, 'quarter', true, 450.25).product.price, 450.25);
  assert.throws(() => selection.financeProductSelection(cashierProduct, 'half', true, 1));
  assert.throws(() => selection.financeProductSelection(cashierProduct, undefined, false, 1));
  assert.equal(selection.financeSelectedCartLines([{ productId: product.id, unitId: 'quarter', quantity: 1 }], [cashierProduct], true).length, 0);
});
test('Independent cashier prices survive receipt tax and stock calculation', () => {
  const tracked = { ...cashierProduct, stockTracked: true, itemId: 'meat', stock_components: [{ item_id: 'meat', quantity: 1 }], butcherDetails: { ...cashierProduct.butcherDetails, units: [{ id: 'carcass', label: 'ذبيحة', price: 2000 }, ...cashierProduct.butcherDetails.units] } };
  const cart = [450.25, 500.5].map(unitPrice => ({ productId: product.id, unitId: 'quarter', quantity: 1, unitPrice, cashierPrice: true }));
  assert.notEqual(selection.financeCartKey(cart[0]), selection.financeCartKey(cart[1]));
  const lines = selection.financeSelectedCartLines(cart, [tracked], true);
  assert(lines.every(line => !line.priceChanged));
  const doc = receipt(lines); doc.warehouse_id = 'warehouse';
  assert.equal(doc.total, 950.75); assert.equal(doc.tax, 124.01);
  assert.deepEqual(doc.lines.map(line => line.unit_price), [450.25, 500.5]);
  assert(doc.lines.every(line => line.stock_unit_factor === .25));
  assert.equal(offline.offlineStockDeductions({ ...snapshot, products: [tracked] }, doc).reduce((sum, line) => sum + line.quantity, 0), .5);
});
test('Gram pricing keeps six decimals and rounds invoice amount', () => {
  const lines = selection.financeSelectedCartLines([{ productId: product.id, unitId: 'g', quantity: 250 }], [product], true);
  const doc = receipt(lines);
  assert.equal(doc.total, 18.75); assert.equal(doc.lines[0].unit_price, .075); assert.equal(doc.lines[0].unit_id, 'g'); assert.equal(doc.lines[0].stock_unit_factor, .001);
  assert.match(doc.lines[0].name, /جرام/); assert.equal(doc.customer_phone, null);
});
test('Same product remains distinct for independent units', () => {
  const cart = [{ productId: product.id, unitId: 'kg', quantity: 1.333 }, { productId: product.id, unitId: 'g', quantity: 250 }];
  const lines = selection.financeSelectedCartLines(cart, [product], true);
  assert.equal(lines.length, 2); assert.notEqual(selection.financeCartKey(cart[0]), selection.financeCartKey(cart[1])); assert.equal(receipt(lines).total, 118.73);
});
test('Invalid/removed unit never silently substitutes a new price', () => {
  assert.throws(() => selection.financeProductSelection(product, 'removed', true));
  assert.equal(selection.financeSelectedCartLines([{ productId: product.id, unitId: 'removed', quantity: 1 }], [product], true).length, 0);
  assert.throws(() => selection.financeProductSelection(product, 'g', false));
  assert.equal(selection.financeProductSelection({ ...product, butcherDetails: null }, undefined, true).product.price, 75);
});
test('Stock family conversion and unsupported conversion', () => {
  assert.equal(selection.butcherStockFactor('kg', 'g'), .001); assert.equal(selection.butcherStockFactor('g', 'kg'), 1000);
  assert.equal(selection.butcherStockFactor('carcass', 'quarter'), .25); assert.equal(selection.butcherStockFactor('half', 'quarter'), .5);
  assert.equal(selection.butcherStockFactor('kg', 'half'), null); assert.equal(selection.butcherStockFactor('custom-a', 'custom-a'), 1);
  assert.throws(() => selection.financeProductSelection({ ...product, stockTracked: true }, 'half', true));
});
test('Offline inventory deductions use immutable sale unit conversion', () => {
  const tracked = { ...product, stockTracked: true, itemId: 'meat', stock_components: [{ item_id: 'meat', quantity: 1 }] };
  const doc = receipt(selection.financeSelectedCartLines([{ productId: tracked.id, unitId: 'g', quantity: 250 }], [tracked], true));
  doc.warehouse_id = 'warehouse';
  assert.deepEqual(offline.offlineStockDeductions({ ...snapshot, products: [tracked] }, doc), [{ item_id: 'meat', warehouse_id: 'warehouse', quantity: .25 }]);
});
test('Optional shift only for butcher; supplied stale/paused shift still rejects', () => {
  assert.doesNotThrow(() => selection.validatePosSaleShift(snapshot, undefined));
  assert.throws(() => selection.validatePosSaleShift({ ...snapshot, cafe: { ...snapshot.cafe, businessCategory: 'cafes' } }, undefined));
  assert.throws(() => selection.validatePosSaleShift(snapshot, 'missing'));
  assert.throws(() => selection.validatePosSaleShift({ ...snapshot, shifts: [{ id: 'shift', user_id: 'user', status: 'open', supervisor_paused: true }] }, 'shift'));
});
test('Changed catalog price or tax total cannot silently reprice a local receipt', () => {
  assert.doesNotThrow(() => selection.validatePosExpectedAmount(.075, .075, 1000000));
  assert.throws(() => selection.validatePosExpectedAmount(.075, .076, 1000000));
  assert.throws(() => selection.validatePosExpectedAmount(18.75, 21.56, 100));
  assert.throws(() => selection.validatePosExpectedAmount(undefined, 18.75, 100));
});
test('Cart preserves reviewed unit prices until explicit acceptance', () => {
  const cart = [{ productId: product.id, unitId: 'g', quantity: 250, unitPrice: .075 }];
  const changed = { ...product, butcherDetails: { ...product.butcherDetails, units: product.butcherDetails.units.map(unit => unit.id === 'g' ? { ...unit, price: .08 } : unit) } };
  const [line] = selection.financeSelectedCartLines(cart, [changed], true);
  assert.equal(line.product.price, .075); assert.equal(line.currentUnitPrice, .08); assert.equal(line.priceChanged, true);
  assert.equal(receipt([line]).total, 18.75);
  const [accepted] = selection.financeSelectedCartLines([{ ...cart[0], unitPrice: .08 }], [changed], true);
  assert.equal(accepted.priceChanged, false); assert.equal(receipt([accepted]).total, 20);
});
test('Half-cent unit price uses the same subtotal for full discount and receipt', () => {
  const lines = [{ quantity: 1, price: .145 }];
  const before = previewFinanceTotals(lines, 0, 15, true);
  assert.equal(before.subtotal, .15);
  assert.equal(previewFinanceTotals(lines, before.subtotal, 15, true).total, 0);
});
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.footer)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : tree && typeof tree === 'object' ? text(tree.props?.children) : tree == null || typeof tree === 'boolean' ? '' : String(tree);
const find = (tree, predicate) => { const result = nodes(tree).find(predicate); assert.ok(result, 'Expected control'); return result; };
const button = (tree, label) => find(tree, node => node.type === 'button' && text(node) === label);
function harness(data) {
  const slots = [], calls = [], messageLoads = []; let index = 0;
  const hooks = { ...React, useMemo: fn => fn(), useEffect() {}, useState(initial) { const slot = index++; if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial; return [slots[slot], next => slots[slot] = typeof next === 'function' ? next(slots[slot]) : next]; }, useRef(initial) { const slot = index++; return slots[slot] ??= { current: initial }; } };
  const customer = { normalized: 'forbidden-phone', payload() { throw Error('Customer payload must not run for butcher'); }, reset() {} };
  const state = { snapshot: data, pending: false, stale: false, error: '', message: '', clearFeedback() {}, refresh() {}, offline: { sales: [], ready: true, pending: [] }, execute: async (...args) => { calls.push(args); return { id: 'sale', offline: true }; } };
  const mocks = { react: hooks, 'next/navigation': { useRouter: () => ({ replace() {} }) }, 'next/link': { default: function Link() {}, __esModule: true }, 'next/image': { default: function Image() {}, __esModule: true }, '@/app/actions/finance-access': { logoutFinanceAction() {} }, '@/components/dashboard/ui/modal': { Modal() {} }, './finance-operation-form': { FinanceOperationForm() {} }, './finance-ui': { Empty() {}, Field() {}, Numeric() {}, financeDate: String, financeDocumentStatus: () => '' }, './finance-refund-requests': { FinanceRefundRequests() {} }, './finance-receipt-dialog': { FinanceReceiptDialog() {} }, './finance-pos-fullscreen': { FinancePosFullscreen() {} }, './finance-pos-actions': { FinancePosActions() {} }, './finance-pos-customer': { usePosCustomer: () => customer, FinancePosCustomerField() {}, FinancePosPager() {}, financePosCustomerNotice: () => '' }, './use-pos-finance': { usePosFinance: () => state }, './finance-pos-offline-status': { FinancePosOfflineStatus() {} }, './use-finance-printer': { useFinancePrinter: () => ({ ready: false, autoEnabled: false }) }, './use-finance-invoice-messages': { useFinanceInvoiceMessages: args => { messageLoads.push(args); return { entries: {}, loading: false }; } }, './finance-invoice-message-status': { FinanceInvoiceMessageStatus() {} } };
  const { FinancePOS } = load('components/finance/finance-pos.tsx', mocks);
  return { calls, messageLoads, render() { index = 0; const tree = FinancePOS({ initialSnapshot: data }); return tree.type?.name === 'StandardFinancePOS' ? tree.type(tree.props) : tree; } };
}
async function main() {
  const manual = harness({ ...snapshot, products: [cashierProduct] });
  const openManual = () => find(manual.render(), node => node.type === 'button' && node.props?.['aria-label'] === `إضافة ${product.name} وتحديد السعر`).props.onClick();
  const manualInput = hint => find(manual.render(), node => node.type === 'input' && node.props?.['aria-describedby'] === hint);
  openManual(); manualInput('butcher-quantity-hint').props.onChange({ target: { value: '1' } });
  for (const value of ['', '0', '-1', '1000001', '.1234567']) {
    manualInput('butcher-price-hint').props.onChange({ target: { value } });
    assert.equal(button(manual.render(), 'إضافة إلى الطلب').props.disabled, true);
  }
  manualInput('butcher-price-hint').props.onChange({ target: { value: '450.25' } });
  assert.equal(button(manual.render(), 'إضافة إلى الطلب').props.disabled, false);
  button(manual.render(), 'إضافة إلى الطلب').props.onClick();
  openManual(); assert.equal(manualInput('butcher-price-hint').props.value, '', 'Every new selection asks the cashier for its price');
  manualInput('butcher-quantity-hint').props.onChange({ target: { value: '1' } });
  manualInput('butcher-price-hint').props.onChange({ target: { value: '500.5' } });
  button(manual.render(), 'إضافة إلى الطلب').props.onClick();
  let manualLines = nodes(manual.render()).filter(node => node.type === 'input' && node.props?.['aria-label']?.startsWith('كمية لحم'));
  assert.equal(manualLines.length, 2);
  manualLines[0].props.onChange({ target: { value: '2' } });
  await button(manual.render(), 'تأكيد الاستلام وإصدار إيصال').props.onClick();
  assert.equal(manual.calls[0][1].expectedTotal, 1401);
  assert.deepEqual(manual.calls[0][1].lines.map(line => ({ price: line.unitPrice, expected: line.expectedUnitPrice, quantity: line.quantity })), [{ price: 450.25, expected: 450.25, quantity: 2 }, { price: 500.5, expected: 500.5, quantity: 1 }]);
  checks++;
  const picker = harness(snapshot);
  const openPicker = () => find(picker.render(), node => node.type === 'button' && node.props?.['aria-label']?.startsWith('إضافة لحم')).props.onClick();
  const quantityInput = () => find(picker.render(), node => node.type === 'input' && node.props?.['aria-describedby'] === 'butcher-quantity-hint');
  openPicker();
  assert.equal(quantityInput().props.value, '');
  assert.equal(quantityInput().props['aria-invalid'], false);
  assert.equal(button(picker.render(), 'إضافة إلى الطلب').props.disabled, true);
  button(picker.render(), 'إضافة إلى الطلب').props.onClick();
  assert.equal(button(picker.render(), 'تأكيد الاستلام وإصدار إيصال').props.disabled, true);
  quantityInput().props.onChange({ target: { value: '1.25' } });
  assert.equal(button(picker.render(), 'إضافة إلى الطلب').props.disabled, false);
  find(picker.render(), node => node.type === 'button' && node.props?.['aria-pressed'] === false && text(node).startsWith('جرام')).props.onClick();
  assert.equal(quantityInput().props.value, '', 'Switching units requires a fresh quantity');
  assert.equal(nodes(picker.render()).filter(node => node.type === 'button' && node.props.className === 'unit' && node.props?.['aria-pressed'] === true).length, 1);
  assert.ok(nodes(picker.render()).some(node => node.type === 'i' && node.props.className === 'selectionMark' && node.props.children), 'Selected unit has a visible non-color indicator');
  for (const value of ['0', '-1', '10000', '0.0001']) {
    quantityInput().props.onChange({ target: { value } });
    assert.equal(button(picker.render(), 'إضافة إلى الطلب').props.disabled, true);
  }
  quantityInput().props.onChange({ target: { value: '250' } });
  button(picker.render(), 'إضافة إلى الطلب').props.onClick();
  openPicker(); assert.equal(quantityInput().props.value, '', 'Reopening after adding starts empty');
  quantityInput().props.onChange({ target: { value: '2' } });
  find(picker.render(), node => node.type?.name === 'Modal' && node.props.title === product.name).props.onClose();
  openPicker(); assert.equal(quantityInput().props.value, '', 'Reopening after cancellation starts empty');
  checks++;
  const h = harness(snapshot); let tree = h.render();
  assert.ok(!nodes(tree).some(node => ['FinancePosCustomerField', 'FinancePosPager'].includes(node.type?.name)));
  assert.ok(h.messageLoads.every(args => !args.visible && args.documentIds.length === 0)); checks++;
  find(tree, node => node.type === 'button' && node.props?.['aria-label']?.startsWith('إضافة لحم')).props.onClick(); tree = h.render();
  find(tree, node => node.type === 'button' && node.props?.['aria-pressed'] === false && text(node).startsWith('جرام')).props.onClick(); tree = h.render();
  find(tree, node => node.type === 'input' && node.props?.['aria-describedby'] === 'butcher-quantity-hint').props.onChange({ target: { value: '250' } }); tree = h.render();
  assert.equal(button(tree, 'إضافة إلى الطلب').props.disabled, false); button(tree, 'إضافة إلى الطلب').props.onClick(); tree = h.render();
  assert.ok(!button(tree, 'تأكيد الاستلام وإصدار إيصال').props.disabled);
  await button(tree, 'تأكيد الاستلام وإصدار إيصال').props.onClick();
  const [operation, payload] = h.calls[0]; assert.equal(operation, 'sale'); assert.equal(payload.accountId, 'cash'); assert.equal(payload.expectedTotal, 18.75);
  assert.deepEqual(payload.lines, [{ productId: 'product', quantity: 250, expectedUnitPrice: .075, unitId: 'g' }]);
  for (const field of ['shiftId', 'customerPhone', 'redeemRewardId']) assert.ok(!(field in payload)); checks++;
  const changedData = structuredClone(snapshot), priceChange = harness(changedData); tree = priceChange.render();
  find(tree, node => node.type === 'button' && node.props?.['aria-label']?.startsWith('إضافة لحم')).props.onClick(); tree = priceChange.render();
  find(tree, node => node.type === 'input' && node.props?.['aria-describedby'] === 'butcher-quantity-hint').props.onChange({ target: { value: '1' } }); tree = priceChange.render();
  button(tree, 'إضافة إلى الطلب').props.onClick(); tree = priceChange.render();
  changedData.products[0].butcherDetails.units[0].price = 80;
  tree = priceChange.render(); assert.equal(button(tree, 'تأكيد الاستلام وإصدار إيصال').props.disabled, true);
  find(tree, node => node.type === 'input' && node.props?.['aria-label']?.startsWith('كمية لحم')).props.onChange({ target: { value: '2' } });
  tree = priceChange.render(); assert.equal(button(tree, 'تأكيد الاستلام وإصدار إيصال').props.disabled, true, 'Quantity edits do not accept repricing');
  find(tree, node => node.type === 'button' && text(node).startsWith('اعتماد السعر الجديد')).props.onClick();
  tree = priceChange.render(); assert.ok(!button(tree, 'تأكيد الاستلام وإصدار إيصال').props.disabled);
  await button(tree, 'تأكيد الاستلام وإصدار إيصال').props.onClick();
  assert.equal(priceChange.calls[0][1].expectedTotal, 160); assert.equal(priceChange.calls[0][1].lines[0].expectedUnitPrice, 80); checks++;
  const normal = harness({ ...snapshot, cafe: { ...snapshot.cafe, businessCategory: 'cafes' }, products: [{ ...product, butcherDetails: null }] }); tree = normal.render();
  assert.ok(nodes(tree).some(node => node.type?.name === 'FinancePosCustomerField'));
  find(tree, node => node.type === 'button' && node.props?.['aria-label']?.startsWith('إضافة لحم')).props.onClick(); tree = normal.render();
  assert.equal(button(tree, 'تأكيد الاستلام وإصدار إيصال').props.disabled, true); checks++;
  console.log(`PASS butcher POS ${checks} groups: weighted pricing, unit identity, stock conversion, no-shift checkout, no customer UI/payload/polls, existing-category shift gate`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
