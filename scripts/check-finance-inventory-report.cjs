const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file, mocks = {}) {
  const output = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name.endsWith('.module.css')) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
    throw new Error(`Unexpected import ${name}`);
  }, output);
  return output;
}
const lib = load('lib/finance/inventory-report.ts');
const item = { id: 'beans', name: 'بن', sku: 'B-1', unit: 'كيلو', active: true, min_quantity: 3, menu_product_id: 'coffee', quantity: 17, average_cost: 999 };
const snapshot = {
  items: [item, { ...item, id: 'milk', name: '=HYPERLINK("bad")', sku: '\t@attack', unit: 'لتر', min_quantity: 0, menu_product_id: null },
    { ...item, id: 'sugar', name: 'سكر', menu_product_id: null }, { ...item, id: 'old', name: 'مؤرشف', active: false }],
  warehouses: [{ id: 'a', name: 'الفرع', active: true }, { id: 'b', name: 'المركزي', active: true }, { id: 'old', name: 'قديم', active: false }],
  products: [{ id: 'coffee', name: 'قهوة' }],
  stock: [
    { item_id: 'beans', warehouse_id: 'a', quantity: -3, average_cost: 5, cost_known: true },
    { item_id: 'beans', warehouse_id: 'b', quantity: 20, average_cost: 9, cost_known: true },
    { item_id: 'milk', warehouse_id: 'a', quantity: 7, average_cost: 0, cost_known: true },
    { item_id: 'sugar', warehouse_id: 'a', quantity: 1, average_cost: 20, cost_known: false },
    { item_id: 'old', warehouse_id: 'a', quantity: 1, average_cost: 2, cost_known: true },
    { item_id: 'beans', warehouse_id: 'old', quantity: 4, average_cost: 2, cost_known: true },
  ],
};
const untouched = JSON.stringify(snapshot);
const all = lib.buildInventoryReport(snapshot);
assert.equal(all.rows.length, 6, 'Each active item/warehouse pair exists including missing balances');
assert.equal(all.summary.items, 3);
assert.equal(all.summary.warehouses, 2);
assert.equal(all.summary.negative, 1, 'Positive global quantity must never hide a negative warehouse');
assert.equal(all.summary.zero, 2);
assert.equal(all.summary.low, 1);
assert.equal(all.summary.estimatedValue, 165, 'Signed warehouse valuation uses 20*9 minus 3*5 with known zero preserved');
assert.equal(all.summary.negativeEstimatedValue, -15);
assert.equal(all.summary.missingCost, 1, 'Positive undocumented cost is not evidence of a known valuation');
assert.equal(all.rows[0].quantity, -3, 'Negative balances sorted first and never clamped');
assert.equal(all.rows[0].belowMinimum, 6);
assert.equal(all.rows.find(row => row.item.id === 'milk' && row.warehouseId === 'a').estimatedValue, 0, 'Known zero-cost stock stays valued');
assert.equal(all.rows.find(row => row.item.id === 'sugar' && row.warehouseId === 'a').estimatedValue, null);
assert.equal(lib.buildInventoryReport(snapshot, { warehouseId: 'a' }).summary.estimatedValue, -15, 'Selected warehouse never uses global item average');
assert.equal(lib.buildInventoryReport(snapshot, { status: 'negative' }).rows.length, 1);
assert.equal(lib.buildInventoryReport(snapshot, { status: 'missing_cost' }).rows.length, 1);
assert.equal(lib.buildInventoryReport(snapshot, { status: 'unlinked' }).rows.length, 4);
assert.equal(lib.buildInventoryReport(snapshot, { search: 'قهوة' }).rows.length, 2, 'Search matches linked menu product');
const linkedSnapshot = { ...snapshot, items: [{ ...item, menu_product_id: null, barcode: '123456', product_links: [{ product_id: 'coffee', quantity: .25 }] }] };
assert.ok(lib.buildInventoryReport(linkedSnapshot, { search: '123456' }).rows.length, 'Barcode search finds the stored item');
assert.ok(lib.buildInventoryReport(linkedSnapshot, { search: 'قهوة' }).rows.length, 'Component product names remain searchable');
assert.equal(lib.buildInventoryReport(linkedSnapshot, { status: 'unlinked' }).rows.length, 0, 'Multiple-product link is not classified as independent');
assert.equal(lib.buildInventoryReport(snapshot, { warehouseId: 'b', search: ' B-1 ' }).rows.length, 2, 'Search trims query and matches SKU');
assert.equal(lib.buildInventoryReport(snapshot, { warehouseId: 'not-a-warehouse' }).rows.length, 0);
assert.equal(lib.buildInventoryReport(snapshot, { includeInactive: true }).rows.length, 8, 'Archived balances visible only when requested');
assert.equal(JSON.stringify(snapshot), untouched, 'Reporting is pure and never mutates stock');
assert.equal(lib.buildInventoryReport({ ...snapshot, movements: [{ quantity: 999999 }] }).summary.estimatedValue, 165, 'Capped movement history cannot alter current balances');
const legacy = { ...snapshot, stock: [{ item_id: 'beans', warehouse_id: 'a', quantity: 2, average_cost: 80 }] };
assert.equal(lib.buildInventoryReport(legacy, { status: 'missing_cost' }).rows.length, 1, 'Missing cost provenance is not invented from a positive average');
assert.equal(lib.buildInventoryReport({ items: [], warehouses: [], products: [], stock: [] }).summary.estimatedValue, 0);

const icons = new Proxy({}, { get: () => () => null });
const brand = load('lib/finance/brand-finance.ts');
const ui = load('components/finance/finance-ui.tsx', {
  'lucide-react': icons, '@/lib/finance/brand-finance': brand, './finance-receipt-print': {},
});
const exported = lib.inventoryReportCsvRows(all.rows);
const csv = ui.financeCsv(exported);
assert.ok(csv.includes("'=HYPERLINK"), 'Formula-like customer authored item name escaped by existing finance serializer');
assert.ok(csv.includes("'\t@attack"), 'Leading whitespace formula payload escaped');
assert.ok(csv.includes('"-3"'), 'Numeric negative quantities retain numeric CSV cells');
assert.ok(exported.some(row => row[7] === 'غير مكتملة'), 'Unknown valuation is never exported as zero');

const component = load('components/finance/finance-inventory-report.tsx', {
  'lucide-react': icons, '@/lib/finance/inventory-report': lib, './finance-ui': ui,
  'next/image': { default: () => null }, '@/lib/finance/inventory-catalog': { inventoryImageUrl: () => '/image' },
});
const readonly = renderToStaticMarkup(React.createElement(component.FinanceInventoryReport, { snapshot }));
assert.ok(!readonly.includes('تعديل الصنف'), 'No mutation controls without parent capability callbacks');
assert.ok(readonly.includes('dir="ltr">-3'), 'Negative quantity sign remains visually unambiguous in RTL');
assert.ok(readonly.includes('role="region"') && readonly.includes('tabindex="0"'), 'Scrollable table is keyboard reachable');
assert.ok(readonly.includes('التكلفة الصفرية الموثقة مقبولة'));
const editable = renderToStaticMarkup(React.createElement(component.FinanceInventoryReport, { snapshot, disabled: true, onAdjust: () => {}, onItemEdit: () => {} }));
assert.ok(editable.includes('تعديل الصنف') && editable.includes('disabled=""'), 'Allowed controls respect pending/disabled state');
console.log('PASS inventory report: warehouse valuation, signed shortages, known zero cost, provenance, filters, archived balances, pure snapshots, safe CSV and read-only UI');
