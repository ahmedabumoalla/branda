const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');

function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(name => {
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
function hooks() {
  const slots = []; let cursor = 0, effects = [];
  return {
    api: { ...React,
      useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => slots[i] = typeof value === 'function' ? value(slots[i]) : value]; },
      useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
      useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((d, n) => !Object.is(d, slots[i].deps[n]))) { const previous = slots[i]; slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
    },
    render(Component, props) { cursor = 0; effects = []; const tree = Component(props); for (const fn of effects) fn(); return tree; },
  };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (tree.props?.hidden || tree.props?.open === false) return [];
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) { return Array.isArray(tree) ? tree.map(text).join('') : tree && typeof tree === 'object' ? text(tree.props?.children) : tree == null || typeof tree === 'boolean' ? '' : String(tree); }
const find = (tree, predicate) => { const n = nodes(tree).find(predicate); assert(n, 'Expected rendered control'); return n; };
const button = (tree, label) => find(tree, n => n.type === 'button' && text(n) === label);
const hasButton = (tree, label) => nodes(tree).some(n => n.type === 'button' && text(n) === label);
const field = (tree, label) => find(tree, n => n.props?.label === label).props.children;
const submit = tree => find(tree, n => n.type === 'form').props.onSubmit({ preventDefault() {} });
const child = name => Object.defineProperty(function Child() {}, 'name', { value: name });
const shared = { '@/components/dashboard/ui/modal': { Modal: child('Modal') }, './finance-ui': { Field: child('Field'), Numeric: child('Numeric'), Panel: child('Panel'), financeDate: value => value }, './company-invoice-lines': { CompanyInvoiceLines: child('CompanyInvoiceLines') }, './finance-customer-form': { FinanceCustomerForm: child('FinanceCustomerForm') } };
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const snapshot = { cafe: { id: id(1), slug: 'returns-test', name: 'علامة الاختبار' }, userId: id(2), role: 'owner', canAdminister: true, canManage: true, settings: { vat_rate: 15, tax_inclusive: false }, accounts: [{ id: id(3), name: 'الحساب البنكي', active: true, kind: 'bank' }], shifts: [], staff: [], parties: [{ id: id(4), name: 'اسم العميل الحالي', kind: 'customer', active: true }], warehouses: [{ id: id(5), name: 'المستودع', active: true }], documents: [], refundRequests: [] };
const original = { id: id(6), number: 10, kind: 'sale', party_id: id(4), warehouse_id: id(5), outstanding: 0, total: 11.5, paid: 11.5, refunded: false, lines: [{ id: id(7), name: 'بند أصلي', quantity: 3, net: 10, tax: 1.5, unit_price: 10 / 3, returned_quantity: 1, returned_net: 3.33, returned_tax: 0.5 }] };
const request = { id: id(8), document_id: original.id, document_number: 10, total: 7.67, paid: 7.67, status: 'pending', created_at: '2026-11-12T11:00:00Z', payload: { accountId: id(3), paymentMethod: 'bank', note: 'سبب الإرجاع', lines: [{ lineId: id(7), quantity: 2, name: 'بند أصلي' }] } };
const returned = {
  id: id(9), number: 20, sourceId: original.id, sourceNumber: 10, partyId: id(4), customerName: 'اسم العميل المحفوظ', createdAt: '2026-11-12T12:00:00Z', createdByName: 'المحاسب',
  subtotal: 40, discount: 4, tax: 5.4, total: 41.4, paid: 20, debtReduced: 21.4, paymentStatus: 'mixed', paymentMethod: 'bank', accountName: 'حساب التسوية',
  stockStatus: 'pending', warehouseName: 'مستودع المرتجعات', stockRevision: 1, stockDocumentId: null, note: 'سبب المرتجع المحفوظ', taxInclusive: false,
  lines: [{ id: id(10), name: 'اسم الصنف المحفوظ', description: 'وصف تاريخي', quantity: 2, price: 20, discount: 4, net: 36, tax: 5.4, total: 41.4 }],
  stockLines: [{ id: id(11), itemName: 'المكون المخزني', quantity: 3, receivedQuantity: 0, unitCost: 6, total: 18, costStatus: 'known' }],
  events: [{ id: id(12), action: 'created', actorName: 'منشئ الطلب', createdAt: '2026-11-12T11:00:00Z', note: 'سبب المرتجع' }, { id: id(13), action: 'approved', actorName: 'المالك', createdAt: '2026-11-12T12:00:00Z', note: 'اعتماد المرتجع' }],
};
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
let checks = 0;
function eq(a, b, message) { assert.deepEqual(a, b, message); checks++; }
function ok(a, message) { assert.ok(a, message); checks++; }
function rejects(fn, message) { assert.throws(fn, undefined, message); checks++; }
const { normalizeSalesReturnQuery } = load('lib/finance/sales-return.ts');
eq(normalizeSalesReturnQuery('#000001'), '1', 'Search accepts the displayed padded return number');
eq(normalizeSalesReturnQuery('  # ٠٠٠٠١٢ '), '12', 'Search accepts Arabic numerals and surrounding spaces');
eq(normalizeSalesReturnQuery('000'), '0');
eq(normalizeSalesReturnQuery('  Customer 100  '), 'Customer 100', 'Customer queries retain meaningful text');
eq(normalizeSalesReturnQuery('عميل ١٠'), 'عميل ١٠', 'Customer names preserve their original numeral characters');
eq(normalizeSalesReturnQuery(undefined), '');
const oldWindow = global.window;
let url = '';
global.window = { addEventListener() {}, removeEventListener() {}, history: { pushState(_a, _b, href) { url = href; } } };

async function checkOriginalRefundFlow() {
  const { refundPreview, refundPayload } = load('components/finance/finance-refund-form.tsx', shared);
  const preview = refundPreview(original, { [id(7)]: 2 });
  eq(preview.total, 7.67, 'Final partial refund carries the cumulative rounding remainder');
  eq(preview.tax, 1); eq(preview.lines[0].available, 2);
  const input = refundPayload(original, { [id(7)]: 2 }, id(3), '  سبب  ', snapshot);
  eq(input.lines[0].expectedReturnedQuantity, 1, 'Submission protects concurrent return quantities');
  eq(input.expectedTotal, 7.67); eq(input.note, 'سبب');
  eq('deferStock' in input, false, 'Existing refunds retain immediate stock receipt by default');
  const deferredStock = refundPayload(original, { [id(7)]: 2 }, id(3), 'reason', snapshot, '', true);
  eq(deferredStock.deferStock, true, 'Separate stock receipt is explicit opt-in');
  eq(deferredStock.expectedPaid, input.expectedPaid, 'Deferral does not alter refund settlement');
  eq('deferStock' in refundPayload({ ...original, kind: 'purchase' }, { [id(7)]: 2 }, id(3), 'reason', snapshot, '', true), false, 'Purchase returns are unaffected');
  rejects(() => refundPayload(original, { [id(7)]: 2.001 }, id(3), 'reason', snapshot), 'Cannot exceed remaining sold quantity');
  rejects(() => refundPayload(original, { [id(7)]: NaN }, id(3), 'reason', snapshot));
  rejects(() => refundPayload(original, { [id(7)]: 0 }, id(3), 'reason', snapshot));
  rejects(() => refundPayload(original, { [id(7)]: 1 }, '', 'reason', snapshot), 'Cash settlement requires an eligible account');
  rejects(() => refundPayload(original, { [id(7)]: 1 }, id(3), '', snapshot), 'Reason is mandatory');
  rejects(() => refundPayload({ ...original, refunded: true }, { [id(7)]: 1 }, id(3), 'reason', snapshot));

  const h = hooks();
  const { FinanceRefundRequests } = load('components/finance/finance-refund-requests.tsx', { ...shared, react: h.api });
  let calls = [], receipts = [], hold = deferred();
  const props = { snapshot: { ...snapshot, documents: [original], refundRequests: [request] }, pending: false, error: '', onExecute: async (operation, payload) => { calls.push({ operation, payload }); return hold.promise; }, onReceipt: id => receipts.push(id) };
  let tree = h.render(FinanceRefundRequests, props);
  button(tree, 'مراجعة واعتماد').props.onClick(); tree = h.render(FinanceRefundRequests, props);
  eq(button(tree, 'اعتماد المرتجع وترحيل المبلغ').props.disabled, true);
  await button(tree, 'اعتماد المرتجع وترحيل المبلغ').props.onClick(); eq(calls.length, 0, 'Owner must confirm review before posting');
  find(tree, n => n.type === 'input' && n.props.type === 'checkbox').props.onChange({ target: { checked: true } }); tree = h.render(FinanceRefundRequests, props);
  const submit = button(tree, 'اعتماد المرتجع وترحيل المبلغ').props.onClick(); button(tree, 'اعتماد المرتجع وترحيل المبلغ').props.onClick(); eq(calls.length, 1, 'Approval double-click submits once');
  eq(calls[0], { operation: 'refund_approve', payload: { requestId: request.id } });
  hold.resolve({ id: id(9), status: 'approved' }); await submit; eq(receipts, [id(9)], 'Receipt opens the actual refund document');
  const staff = { ...props, snapshot: { ...props.snapshot, role: 'manager', canAdminister: false } };
  tree = h.render(FinanceRefundRequests, staff); button(tree, 'تفاصيل الطلب').props.onClick(); tree = h.render(FinanceRefundRequests, staff);
  ok(!hasButton(tree, 'اعتماد المرتجع وترحيل المبلغ'), 'Manager cannot bypass owner approval');
  ok(!hasButton(tree, 'رفض الطلب'));
}

async function checkReturnManager() {
  const { salesReturnPreview, SalesReturnDocument } = load('components/finance/sales-return-document.tsx', shared);
  const preview = salesReturnPreview(returned, { ...snapshot, settings: { vat_rate: 100, tax_inclusive: true } });
  eq(preview.total, 41.4); eq(preview.tax, 5.4, 'Print ignores current tax settings');
  eq(preview.customer, returned.customerName); eq(preview.lines[0].name, returned.lines[0].name);
  eq(preview.lines[0].quantity, 2); eq(preview.salesReturn.number, 20, 'Refund number is independent of original invoice');
  eq(preview.salesReturn.sourceNumber, '10'); eq(preview.salesReturn.paid, 20); eq(preview.salesReturn.debtReduced, 21.4);
  eq(preview.salesReturn.taxInclusive, false, 'Return retains the original tax-inclusive mode');
  ok(!preview.issued, 'No invented fiscal QR fields'); ok(text(SalesReturnDocument({ model: preview })).includes('فاتورة مرتجعة'));
  class Pdf {
    constructor() { this.tables = []; this.internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } }; }
    setLanguage() { return this; } setProperties(value) { this.properties = value; return this; }
    setPage() { return this; } setFont() { return this; } setFontSize() { return this; }
    setTextColor() { return this; } setDrawColor() { return this; } setLineWidth() { return this; }
    line() { return this; } text() { return this; } getNumberOfPages() { return 1; }
  }
  const { buildCompanyInvoicePreviewPdf } = load('lib/export/company-invoice-preview-pdf.ts', {
    jspdf: { jsPDF: Pdf }, 'jspdf-autotable': { autoTable(doc, options) { doc.tables.push(options); doc.lastAutoTable = { finalY: 20 }; } },
    'qrcode-generator': () => { throw Error('Credit/return previews must not invent fiscal QR payloads'); },
  });
  const pdf = buildCompanyInvoicePreviewPdf(preview, {}), rows = pdf.tables.flatMap(table => table.body);
  eq(pdf.properties.title, 'فاتورة مرتجعة رقم 20');
  ok(rows.some(row => row[0] === '10' && row[1] === 'رقم الفاتورة الأصلية'));
  ok(rows.some(row => row[0] === returned.createdAt && row[1] === 'تاريخ المرتجع'));
  ok(rows.some(row => row[0] === 'غير شاملة الضريبة' && row[1] === 'أسعار الوحدات'));
  ok(rows.some(row => row[0] === '20.00' && row[1] === 'المبلغ المعاد للعميل'));
  ok(rows.some(row => row[0] === '21.40' && row[1] === 'تخفيض المبلغ الآجل'));
  ok(!rows.some(row => row.includes('المبلغ المستحق') || row.includes('المتبقي عند الإصدار')), 'Posted returns never print a fabricated outstanding debit');
  const creditPdf = buildCompanyInvoicePreviewPdf({ ...preview, salesReturn: undefined, creditNote: { number: 3, draft: false, date: '2026-11-12', issueDate: '2026-11-12', warehouse: 'المستودع', reason: 'سبب الإشعار' } }, {});
  eq(creditPdf.properties.title, 'إشعار دائن رقم 3', 'Shared exporter retains credit-note title');
  ok(creditPdf.tables.flatMap(table => table.body).some(row => row[1] === 'سبب الإشعار'));
  ok(!creditPdf.tables.flatMap(table => table.body).some(row => row[1] === 'رقم الفاتورة المرتجعة'));

  let calls = [], changed = 0, printCalls = 0, hold = deferred();
  const actions = { transitionSalesReturnStockAction: async (input, slug) => { calls.push({ input, slug }); return hold.promise; } };
  const h = hooks();
  const { SalesReturnDetails, navigateSalesReturns } = load('components/finance/finance-sales-returns.tsx', { ...shared, react: h.api, '@/app/actions/finance-sales-returns': actions });
  let props = { record: returned, snapshot, disabled: false, onChanged: () => changed++, onPrint: () => printCalls++ };
  let tree = h.render(SalesReturnDetails, props);
  eq(nodes(tree).filter(n => n.props?.['aria-pressed'] !== undefined).length, 3);
  ok(!hasButton(tree, 'حذف')); ok(!hasButton(tree, 'تعديل'), 'Posted refund documents are immutable');
  const source = find(tree, n => n.type === 'a' && text(n).startsWith('الفاتورة الأصلية'));
  eq(new URL(source.props.href, 'https://test').searchParams.get('invoice'), returned.sourceId);
  button(tree, 'طباعة / PDF').props.onClick(); eq(printCalls, 1);
  button(tree, 'سجل النشاطات').props.onClick(); tree = h.render(SalesReturnDetails, props); ok(text(tree).includes('منشئ الطلب')); ok(text(tree).includes('المالك'));
  button(tree, 'الأذون المخزنية').props.onClick(); tree = h.render(SalesReturnDetails, props); ok(text(tree).includes('المكون المخزني'));
  const stockRow = find(tree, n => n.type === 'tr' && text(n).includes('المكون المخزني'));
  eq(nodes(stockRow).filter(n => n.type?.name === 'Numeric').map(n => n.props.value), [6, 3, 0, 18], 'Stock components/costs use actual inventory quantities, never sales units or price');
  tree = h.render(SalesReturnDetails, { ...props, record: { ...returned, stockLines: [{ ...returned.stockLines[0], unitCost: 0, total: 0, costStatus: 'unknown' }] } });
  const unknownRow = find(tree, n => n.type === 'tr' && text(n).includes('المكون المخزني'));
  eq((text(unknownRow).match(/غير مسجلة/g) || []).length, 2, 'Unknown stock unit cost and value are not presented as known zeros');
  eq(nodes(unknownRow).filter(n => n.type?.name === 'Numeric').map(n => n.props.value), [3, 0], 'Only actual stock quantities retain numeric rendering when cost is unknown');
  tree = h.render(SalesReturnDetails, props);
  button(tree, 'تأكيد الاستلام').props.onClick(); tree = h.render(SalesReturnDetails, props);
  button(tree, 'تأكيد').props.onClick(); button(tree, 'تأكيد').props.onClick(); eq(calls.length, 1, 'Stock transition is single-flight');
  eq(calls[0].input.revision, returned.stockRevision, 'Transition sends the stock revision for optimistic concurrency');
  eq(calls[0].input.operation, 'receive'); eq(calls[0].slug, snapshot.cafe.slug);
  hold.resolve({ ok: false, message: 'retry' }); await flush(); tree = h.render(SalesReturnDetails, props);
  hold = deferred(); button(tree, 'تأكيد').props.onClick(); eq(calls.length, 2); eq(calls[1].input.requestId, calls[0].input.requestId, 'Receipt retry reuses request identity');
  hold.resolve({ ok: true, data: { ...returned, stockStatus: 'received' } }); await flush(); eq(changed, 1);
  props = { ...props, record: { ...returned, stockStatus: 'received', stockLines: [{ ...returned.stockLines[0], receivedQuantity: 3 }] } }; tree = h.render(SalesReturnDetails, props);
  ok(!hasButton(tree, 'تأكيد الاستلام')); ok(!hasButton(tree, 'رفض الاستلام'), 'Already received stock cannot receive twice');
  props = { ...props, record: returned, snapshot: { ...snapshot, role: 'auditor' } }; tree = h.render(SalesReturnDetails, props); ok(!hasButton(tree, 'تأكيد الاستلام'));
  props = { ...props, snapshot, disabled: true }; tree = h.render(SalesReturnDetails, props); eq(button(tree, 'تأكيد الاستلام').props.disabled, true);
  props = { ...props, disabled: false }; tree = h.render(SalesReturnDetails, props); button(tree, 'رفض الاستلام').props.onClick(); tree = h.render(SalesReturnDetails, props);
  const count = calls.length; button(tree, 'تأكيد').props.onClick(); await flush(); tree = h.render(SalesReturnDetails, props); eq(calls.length, count); ok(text(tree).includes('اكتب سبب رفض الاستلام'));
  field(tree, 'سبب الرفض').props.onChange({ target: { value: '  بضاعة غير مطابقة  ' } }); tree = h.render(SalesReturnDetails, props);
  hold = deferred(); button(tree, 'تأكيد').props.onClick(); eq(calls.at(-1).input.note, 'بضاعة غير مطابقة'); eq(calls.at(-1).input.operation, 'reject');
  hold.resolve({ ok: false, message: 'retry rejection' }); await flush(); tree = h.render(SalesReturnDetails, props);
  const rejectId = calls.at(-1).input.requestId;
  field(tree, 'سبب الرفض').props.onChange({ target: { value: 'سبب مختلف' } }); tree = h.render(SalesReturnDetails, props);
  hold = deferred(); button(tree, 'تأكيد').props.onClick(); ok(calls.at(-1).input.requestId !== rejectId, 'A changed rejection reason uses a new operation identity'); hold.resolve({ ok: true, data: { ...returned, stockStatus: 'rejected' } }); await flush();
  navigateSalesReturns(returned.id); eq(new URL(url, 'https://test').searchParams.get('view'), 'return-detail'); eq(new URL(url, 'https://test').searchParams.get('return'), returned.id);

  let reads = [], detailReads = [];
  const managerActions = {
    readSalesReturnsAction: async (slug, filters) => { reads.push({ slug, filters }); return { ok: true, data: { items: [returned], total: 31 } }; },
    readSalesReturnAction: async (id, slug) => { detailReads.push({ id, slug }); return { ok: true, data: returned }; },
  };
  const listHooks = hooks();
  const Manager = load('components/finance/finance-sales-returns.tsx', { ...shared, react: listHooks.api, '@/app/actions/finance-sales-returns': managerActions }).FinanceSalesReturns;
  let managerProps = { snapshot, view: 'returns', returnId: null, stale: false, pending: false, onChanged() {} };
  tree = listHooks.render(Manager, managerProps); ok(text(tree).includes('جار تحميل')); await flush(); tree = listHooks.render(Manager, managerProps);
  eq(reads.length, 1); eq(button(tree, 'السابق').props.disabled, true); eq(button(tree, 'التالي').props.disabled, false);
  const number = find(tree, n => n.type === 'button' && text(n) === '#000020'); number.props.onClick(); eq(new URL(url, 'https://test').searchParams.get('return'), returned.id);
  button(tree, 'التالي').props.onClick(); tree = listHooks.render(Manager, managerProps); await flush(); tree = listHooks.render(Manager, managerProps); eq(reads.at(-1).filters.offset, 30); eq(button(tree, 'التالي').props.disabled, true);
  field(tree, 'رقم المرتجع أو الفاتورة الأصلية').props.onChange({ target: { value: '  20  ' } }); field(tree, 'حالة تسوية المبلغ').props.onChange({ target: { value: 'mixed' } }); tree = listHooks.render(Manager, managerProps);
  button(tree, 'بحث متقدم').props.onClick(); tree = listHooks.render(Manager, managerProps); field(tree, 'حالة الإذن المخزني').props.onChange({ target: { value: 'pending' } }); tree = listHooks.render(Manager, managerProps); submit(tree);
  tree = listHooks.render(Manager, managerProps); await flush(); tree = listHooks.render(Manager, managerProps);
  eq(reads.at(-1).filters.query, '20'); eq(reads.at(-1).filters.paymentStatus, 'mixed'); eq(reads.at(-1).filters.stockStatus, 'pending'); eq(reads.at(-1).filters.offset, 0);
  managerProps = { ...managerProps, view: 'return-detail', returnId: returned.id, stale: true }; tree = listHooks.render(Manager, managerProps); await flush(); tree = listHooks.render(Manager, managerProps);
  eq(detailReads.at(-1), { id: returned.id, slug: snapshot.cafe.slug }); const detail = find(tree, n => n.type?.name === 'SalesReturnDetails'); eq(detail.props.disabled, true); eq(detail.props.record, returned);

  const errorHooks = hooks(); let failed = true;
  const ErrorManager = load('components/finance/finance-sales-returns.tsx', { ...shared, react: errorHooks.api, '@/app/actions/finance-sales-returns': { readSalesReturnsAction: async () => failed ? { ok: false, message: 'خطأ تحميل اختباري' } : { ok: true, data: { items: [], total: 0 } } } }).FinanceSalesReturns;
  const emptyProps = { ...managerProps, view: 'returns', returnId: null, stale: false };
  tree = errorHooks.render(ErrorManager, emptyProps); await flush(); tree = errorHooks.render(ErrorManager, emptyProps); ok(nodes(tree).some(n => n.props?.role === 'alert')); failed = false;
  button(tree, 'إعادة المحاولة').props.onClick(); tree = errorHooks.render(ErrorManager, emptyProps); await flush(); tree = errorHooks.render(ErrorManager, emptyProps); ok(text(tree).includes('لا توجد فواتير مرتجعة بعد'));
  eq(find(tree, n => n.type === 'a' && text(n) === 'إدارة الفواتير').props.href, '/dashboard/finance?section=sales');

  const raceHooks = hooks(), first = deferred(), second = deferred(); let readCount = 0;
  const RaceManager = load('components/finance/finance-sales-returns.tsx', { ...shared, react: raceHooks.api, '@/app/actions/finance-sales-returns': { readSalesReturnsAction: () => ++readCount === 1 ? first.promise : second.promise } }).FinanceSalesReturns;
  tree = raceHooks.render(RaceManager, emptyProps);
  const newTenant = { ...emptyProps, snapshot: { ...snapshot, cafe: { ...snapshot.cafe, id: id(100), slug: 'other-tenant' } } };
  tree = raceHooks.render(RaceManager, newTenant);
  second.resolve({ ok: true, data: { items: [{ ...returned, customerName: 'عميل العلامة الجديدة' }], total: 1 } }); await flush(); tree = raceHooks.render(RaceManager, newTenant); ok(text(tree).includes('عميل العلامة الجديدة'));
  first.resolve({ ok: true, data: { items: [{ ...returned, customerName: 'عميل علامة سابقة' }], total: 1 } }); await flush(); tree = raceHooks.render(RaceManager, newTenant);
  ok(text(tree).includes('عميل العلامة الجديدة')); ok(!text(tree).includes('عميل علامة سابقة'), 'Late data from the previous tenant never replaces the current result');
}

(async () => { try {
  await checkOriginalRefundFlow();
  await checkReturnManager();
  console.log(`PASS sales returns UI: ${checks} behavioral assertions`);
} finally { global.window = oldWindow; } })().catch(error => { console.error(error); process.exitCode = 1; });
