const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    if (name === 'server-only') return {};
    if (name.endsWith('.css')) return new Proxy({}, { get: (_, key) => key });
    if (name.startsWith('@/') || name.startsWith('./')) {
      const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name);
      return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '.tsx', mocks);
    }
    return require(name);
  }, exports);
  return exports;
}
const sourceId = '10000000-0000-4000-8000-000000000001', returnId = '10000000-0000-4000-8000-000000000002';
const line = { id: 'line', name: 'Test item', quantity: 1, price: 115, unit_price: 115, discount: 0, net: 100, tax: 15, total: 115, returned_quantity: 0 };
const record = { id: returnId, number: 4, sourceId, sourceNumber: 3, customerName: 'Stored customer', createdAt: '2026-11-15T00:00:00Z', subtotal: 115, discount: 0, total: 115, tax: 15, paid: 50, debtReduced: 65, warehouseName: '', taxInclusive: true, note: 'Return reason', lines: [line] };
const original = { id: sourceId, number: 3, kind: 'sale', total: 115, tax: 15, outstanding: 65, lines: [line], created_at: '2026-11-14T12:00:00Z', receipt_seller: { name: 'Archived seller', vatNumber: '300000000000003' } };
const detail = { document: original, related: [{ ...original, id: returnId, kind: 'refund', reference_id: sourceId, paid: 50, created_at: record.createdAt }] };
const snapshot = { cafe: { id: 'tenant', slug: 'mind-hospital', name: 'Current name' }, userId: 'owner', ownerUserId: 'owner', role: 'owner', canAdminister: true, canManage: true, accounts: [{ id: 'cash', kind: 'cash', active: true }], shifts: [], documents: [original] };
const { salesReturnPreview } = load('lib/finance/sales-return-print.ts');
const model = salesReturnPreview(record, snapshot, detail);
assert.equal(model.brand, 'Archived seller');
assert.equal(model.total, 115); assert.equal(model.tax, 15);
assert.equal(model.salesReturn.fiscal.invoiceType, 'simplified');
assert.equal(model.salesReturn.paid, 50); assert.equal(model.salesReturn.debtReduced, 65);
assert.throws(() => salesReturnPreview(record, snapshot, { ...detail, document: { ...original, id: 'wrong' } }));
assert.throws(() => salesReturnPreview(record, snapshot, { ...detail, related: [] }));
const legacy = salesReturnPreview(record, snapshot, { ...detail, document: { ...original, receipt_seller: null }, related: detail.related.map(d => ({ ...d, receipt_seller: null })) });
assert.equal(legacy.salesReturn.fiscal, undefined);
const standard = salesReturnPreview(record, snapshot, { ...detail, invoice: { type: 'standard', number: 3, displayNumber: 'INV-003', issuedAt: original.created_at, seller: { ...model.salesReturn.fiscal, name: 'Original company', vatNumber: '300000000000003', address: 'Original seller address' }, customer: { name: 'Original buyer', vatNumber: '300000000000013', address: 'Original buyer address' } } });
assert.equal(standard.salesReturn.sourceNumber, 'INV-003'); assert.equal(standard.salesReturn.fiscal.invoiceType, 'standard');
assert.equal(standard.taxNumber, '300000000000013'); assert.equal(standard.brand, 'Original company');
const calls = [];
const autoTable = require('jspdf-autotable').autoTable;
const pdf = load('lib/export/company-invoice-preview-pdf.ts', { 'jspdf-autotable': { autoTable(doc, options) { calls.push(options); return autoTable(doc, options); } } });
const bytes = Buffer.from(pdf.companyInvoiceQr(model), 'base64');
const tags = {}; for (let i = 0; i < bytes.length;) { const tag = bytes[i++], len = bytes[i++]; tags[tag] = bytes.subarray(i, i + len).toString('utf8'); i += len; }
assert.equal(tags[1], 'Archived seller'); assert.equal(tags[2], '300000000000003'); assert.equal(tags[4], '115.00'); assert.equal(tags[5], '15.00');
assert.throws(() => pdf.companyInvoiceQr(legacy));
const fonts = { regular: fs.readFileSync('public/fonts/tajawal-regular.ttf').toString('base64'), bold: fs.readFileSync('public/fonts/tajawal-bold.ttf').toString('base64') };
const document = pdf.buildCompanyInvoicePreviewPdf(model, fonts);
const content = JSON.stringify(calls);
assert.match(content, /إشعار دائن ضريبي مبسط/); assert.match(content, /رقم الفاتورة الأصلية/); assert.match(content, /سبب المرتجع/); assert.match(content, /الرقم الضريبي للبائع/);
assert.doesNotMatch(content, /المتبقي عند الإصدار/);
assert.match(document.output(), /^%PDF/);
assert.equal(document.getNumberOfPages(), 1);
fs.mkdirSync('output/invoice-returns-20261115', { recursive: true });
fs.writeFileSync('output/invoice-returns-20261115/synthetic-credit-note.pdf', Buffer.from(document.output('arraybuffer')));
const passthrough = ({ children }) => React.createElement('section', null, children);
const ui = { Field: passthrough, Panel: passthrough, Numeric: ({ value }) => String(value), financeDate: v => v };
const shared = { './finance-pos-locale': { PosNumeric: ui.Numeric, FinancePosModal: passthrough, useFinancePosLocale: () => ({ t: x => x, date: x => x }) }, './finance-ui': ui };
const { refundPreview, refundPayload } = load('components/finance/finance-refund-form.tsx', shared);
for (const [balance, debt, cash] of [[115, 115, 0], [65, 65, 50], [0, 0, 115]]) {
  const preview = refundPreview({ ...original, outstanding: balance }, { line: 1 });
  assert.equal(preview.debt, debt); assert.equal(preview.paid, cash);
}
assert.throws(() => refundPayload(original, { line: 1 }, '', 'Reason', snapshot));
const request = { id: 'request', document_id: sourceId, document_number: 3, status: 'pending', total: 115, paid: 50, created_at: record.createdAt, payload: { lines: [{ lineId: 'line', quantity: 1 }], note: 'Reason' } };
function requestHtml(acting) {
  let slot = 0;
  const { FinanceRefundRequests } = load('components/finance/finance-refund-requests.tsx', { ...shared, react: { ...React, useRef: () => ({ current: false }), useState: initial => [slot++ === 0 ? request.id : initial, () => {}] } });
  return renderToStaticMarkup(FinanceRefundRequests({ snapshot: { ...snapshot, userId: acting ? 'admin' : 'owner', refundRequests: [request] }, pending: false, error: '', onExecute: async () => null, onReceipt() {} }));
}
assert.match(requestHtml(false), /اعتماد المرتجع وترحيل المبلغ/);
assert.match(requestHtml(true), /اعتماد المرتجع وترحيل المبلغ/);
assert.match(requestHtml(true), /سيُسجل اعتماد المرتجع أو رفضه باسمك/);
async function serverChecks() {
  const rpcCalls = [];
  let role = 'owner';
  const actions = load('app/actions/finance-sales-returns.ts', { '@/lib/data/brand-finance': { getBrandFinanceContext: async () => ({ cafe: { ...snapshot.cafe, role }, client: { rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: name === 'brand_finance_sales_returns' ? record : detail, error: null }; } } }) }, '@/lib/performance/finance-route-invalidation': {} });
  const result = await actions.readSalesReturnPrintAction(returnId, snapshot.cafe.slug);
  assert.equal(result.ok, true); assert.equal(result.data.total, 115);
  assert.equal(rpcCalls.length, 2); assert.ok(rpcCalls.every(call => call.args.p_cafe_id === 'tenant'));
  role = 'cashier'; rpcCalls.length = 0;
  assert.equal((await actions.readSalesReturnPrintAction(returnId, snapshot.cafe.slug)).ok, false); assert.equal(rpcCalls.length, 0);
  assert.equal((await actions.readSalesReturnPrintAction('invalid', snapshot.cafe.slug)).ok, false); assert.equal(rpcCalls.length, 0);
}
serverChecks().then(() => console.log('PASS: return allocation, archived identity, original-invoice binding, QR/PDF, owner/maintenance UI and print-action authorization; no business writes')).catch(error => { console.error(error); process.exitCode = 1; });
