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
shared['./company-invoice-files'] = { CompanyInvoiceFiles: child('CompanyInvoiceFiles'), InvoiceFileDownloads: child('InvoiceFileDownloads') };
const snapshot = { cafe: { id: id(1), slug: 'payment-test', name: 'علامة الاختبار' }, role: 'owner', userId: id(2), accounts: [{ id: id(3), kind: 'cash', name: 'الصندوق', active: true }], parties: [{ id: id(4), name: 'العميل', kind: 'customer', active: true }], staff: [] };
const invoice = { id: id(5), number: 15, display_number: 'INV-15', kind: 'sale', party_id: id(4), account_id: id(3), created_by: id(2), created_at: '2026-11-12T10:00:00Z', total: 100, paid: 80, outstanding: 20, note: 'ملاحظة الفاتورة' };
const payment = { id: id(6), invoiceId: id(5), initial: false, number: 16, revision: 3, status: 'completed', amount: 30, effectiveAmount: 30, date: '2026-11-12', accountId: id(3), accountName: 'الصندوق المحفوظ', method: 'cash', collectorId: id(2), collectorName: 'المحصّل', reference: 'REF-16', details: 'تفاصيل التحصيل', receiptNote: 'ملاحظة الإيصال', attachments: [], canEdit: true, canChangeFinancials: true, canDelete: true, blockedReason: null };
const settlement = { ...invoice, id: id(6), number: 16, kind: 'settlement', total: 30, paid: 30, outstanding: 0, source_id: invoice.id };
const initial = { ...payment, id: invoice.id, initial: true, number: 15, amount: 50, effectiveAmount: 50, canChangeFinancials: false, canDelete: false, blockedReason: 'دفعة مرتبطة بإصدار الفاتورة' };
const detail = { document: invoice, invoice: { displayNumber: 'INV-15', number: 15, customer: { name: 'اسم العميل المحفوظ', phone: '0500000000' } }, customer: { id: id(4), name: 'العميل', details: {}, phone: '' }, payments: [initial, payment], activity: [], creator: { id: id(2), name: 'المستخدم' }, paymentCollectors: [{ id: id(2), name: 'المحصّل' }] };
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; };
let checks = 0;
function eq(a, b, message) { assert.deepEqual(a, b, message); checks++; }
function ok(a, message) { assert.ok(a, message); checks++; }
function rejects(fn, message) { assert.throws(fn, undefined, message); checks++; }
const oldWindow = global.window;
let url = '';
global.window = { addEventListener() {}, removeEventListener() {}, history: { pushState(_a, _b, href) { url = href; }, replaceState(_a, _b, href) { url = href; } } };
const input = (tree, label) => find(find(tree, n => n.type === 'label' && text(n).startsWith(label)), n => ['input', 'textarea', 'select'].includes(n.type));

function checkFilters() {
  const { customerPaymentFiltersSchema: schema, normalizeCustomerPaymentNumber: normalize } = load('lib/finance/customer-payment.ts');
  eq(normalize(' #٠٠١۲۳ '), '00123'); eq(normalize(' # INV-15 '), 'INV-15');
  eq(schema.parse({}), { offset: 0, limit: 30, sort: 'newest' });
  for (const filters of [{ offset: -1 }, { limit: 101 }, { paymentNumber: 'INV-1' }, { method: 'other' }, { status: 'paid' }, { from: '2026-11-13', to: '2026-11-12' }, { from: '2026-02-30' }]) ok(!schema.safeParse(filters).success);
  ok(schema.safeParse({ from: '2026-11-12', to: '2026-11-12', status: 'pending', method: 'credit', invoiceNumber: 'INV-15', paymentNumber: '00016' }).success);
}

function checkReceiptDataAndPdf() {
  const { paymentReceiptData } = load('lib/finance/payment-receipt.ts');
  const first = paymentReceiptData(invoice, detail, snapshot), later = paymentReceiptData(settlement, detail, snapshot);
  eq(first.amount, 50, 'Initial payment uses its canonical amount, not the cumulative invoice paid total'); eq(first.paymentNumber, 'دفعة عند إصدار الفاتورة', 'Initial payment has no fabricated separate receipt number');
  eq(later.amount, 30); eq(later.paymentNumber, '000016'); eq(later.invoiceNumber, 'INV-15'); eq(later.actor, 'المحصّل'); eq(later.account, 'الصندوق المحفوظ'); eq(later.reference, 'REF-16'); eq(later.customer, 'اسم العميل المحفوظ');
  eq(paymentReceiptData(settlement, { ...detail, payments: [{ ...payment, status: 'pending', effectiveAmount: 0 }] }, snapshot).status, 'pending');
  eq(paymentReceiptData(settlement, { ...detail, payments: [{ ...payment, status: 'deleted', effectiveAmount: 0 }] }, snapshot).status, 'deleted');
  class Pdf {
    constructor(options) { this.options = options; this.tables = []; }
    setLanguage() {} setProperties(value) { this.properties = value; }
  }
  const { buildPaymentReceiptPdf } = load('lib/export/payment-receipt-pdf.ts', { jspdf: { jsPDF: Pdf }, 'jspdf-autotable': { autoTable(pdf, table) { pdf.tables.push(table); } } });
  const standard = buildPaymentReceiptPdf(later, false, {}), thermal = buildPaymentReceiptPdf(first, true, {});
  eq(standard.options.format, 'a4'); eq(thermal.options.format, [80, 180]); eq(standard.properties.title, 'إيصال مدفوعات');
  ok(standard.tables[0].body.some(row => row[0] === '30.00 ريال سعودي' && row[1] === 'المبلغ المدفوع'));
  ok(thermal.tables[0].body.some(row => row[0] === 'دفعة عند إصدار الفاتورة' && row[1] === 'رقم عملية الدفع'));
  for (const invalid of [{ ...later, status: 'pending' }, { ...later, status: 'deleted' }, { ...later, amount: 0 }]) rejects(() => buildPaymentReceiptPdf(invalid, false, {}));
}

function checkPaymentDetails() {
  const h = hooks(), events = [];
  const { FinancePaymentDetail } = load('components/finance/finance-payment-detail.tsx', { ...shared, react: h.api });
  const props = { document: settlement, detail, snapshot, disabled: false, onBack: () => events.push('back'), onInvoice: () => events.push('invoice'), onEdit: value => events.push(['edit', value.id]), onDelete: value => events.push(['delete', value.id]), onReceipt: mode => events.push(['receipt', mode]), onCustomer: value => events.push(['customer', value]), onJournal: value => events.push(['journal', value]) };
  let tree = h.render(FinancePaymentDetail, props);
  eq(button(tree, 'تعديل').props.disabled, false); eq(button(tree, 'حذف').props.disabled, false);
  button(tree, 'تعديل').props.onClick(); button(tree, 'حذف').props.onClick(); eq(events.slice(-2), [['edit', payment.id], ['delete', payment.id]]);
  const event = { currentTarget: { closest: () => ({ hidePopover() {} }) } };
  button(tree, 'إيصال مدفوعات').props.onClick(event); button(tree, 'إيصال مدفوعات حراري').props.onClick(event); eq(events.slice(-2), [['receipt', 'standard'], ['receipt', 'thermal']]);
  button(tree, 'المدفوعات').props.onClick(); eq(events.at(-1), 'back');
  tree = h.render(FinancePaymentDetail, { ...props, document: invoice }); eq(button(tree, 'حذف').props.disabled, true); ok(text(tree).includes('دفعة عند إصدار الفاتورة'));
  for (const status of ['pending', 'deleted']) {
    tree = h.render(FinancePaymentDetail, { ...props, detail: { ...detail, payments: [{ ...payment, status, effectiveAmount: 0 }] } });
    eq(button(tree, 'إيصال مدفوعات').props.disabled, true); const count = events.length; button(tree, 'إيصال مدفوعات').props.onClick(event); eq(events.length, count);
  }
  tree = h.render(FinancePaymentDetail, { ...props, disabled: true }); const count = events.length;
  button(tree, 'تعديل').props.onClick(); button(tree, 'حذف').props.onClick(); button(tree, 'إيصال مدفوعات').props.onClick(event); eq(events.length, count, 'Disabled handlers cannot mutate or print');
  tree = h.render(FinancePaymentDetail, { ...props, onEdit: undefined, onDelete: undefined }); eq(button(tree, 'تعديل').props.disabled, true); eq(button(tree, 'حذف').props.disabled, true);
}

async function checkEditor() {
  let hold = deferred(), calls = [], saved = 0, cancelled = 0;
  const make = (selected = payment, deleting = false, disabled = false) => {
    const h = hooks(); const { FinancePaymentEditor } = load('components/finance/finance-payment-editor.tsx', { ...shared, react: h.api, '@/app/actions/finance-payment-management': { manageInvoicePaymentAction: (...args) => { calls.push(args); return hold.promise; } } });
    return () => h.render(FinancePaymentEditor, { payment: selected, invoiceNumber: 15, snapshot, collectors: detail.paymentCollectors, deleting, disabled, onSaved: () => saved++, onCancel: () => cancelled++ });
  };
  const render = make(); let tree = render(); submit(tree); submit(tree); eq(calls.length, 1); eq(calls[0][0].revision, 3); eq(calls[0][0].paymentId, payment.id); eq(calls[0][0].invoiceId, invoice.id); eq(calls[0][1], snapshot.cafe.slug);
  hold.reject(Error('Network')); await flush(); tree = render(); ok(text(tree).includes('أعد المحاولة بنفس البيانات'));
  hold = deferred(); submit(tree); eq(calls[1][0].requestId, calls[0][0].requestId); hold.resolve({ ok: true }); await flush(); eq(saved, 1);
  tree = render(); input(tree, 'مبلغ الدفع').props.onChange({ target: { value: '25.01' } }); tree = render(); hold = deferred(); submit(tree); eq(calls.at(-1)[0].payload.amount, 25.01); ok(calls.at(-1)[0].requestId !== calls[0][0].requestId, 'Changed payload gets a new idempotency identity'); hold.resolve({ ok: true }); await flush();
  tree = render(); input(tree, 'مبلغ الدفع').props.onChange({ target: { value: '1.001' } }); tree = render(); const count = calls.length; submit(tree); await flush(); eq(calls.length, count); ok(text(render()).includes('بمنزلتين عشريتين'));
  tree = render(); button(tree, 'إلغاء').props.onClick(); eq(cancelled, 1);
  const initialRender = make(initial); tree = initialRender(); eq(input(tree, 'مبلغ الدفع').props.disabled, true); eq(input(tree, 'وسيلة الدفع').props.disabled, true); eq(input(tree, 'حالة الدفع').props.disabled, true);
  const blocked = make(payment, false, true); submit(blocked()); eq(calls.length, count);
  const cannotEdit = make({ ...payment, canEdit: false }); submit(cannotEdit()); eq(calls.length, count);
  const deleting = make(payment, true); tree = deleting(); button(tree, 'لا').props.onClick(); eq(cancelled, 2); eq(calls.length, count);
  hold = deferred(); button(tree, 'نعم').props.onClick(); button(tree, 'نعم').props.onClick(); eq(calls.length, count + 1); eq(calls.at(-1)[0].action, 'delete'); hold.resolve({ ok: true }); await flush();
  const denied = make({ ...payment, canDelete: false }, true); tree = denied(); eq(button(tree, 'نعم').props.disabled, true); const before = calls.length; button(tree, 'نعم').props.onClick(); eq(calls.length, before);
}

async function checkServerActions() {
  let role = 'owner', response = { data: { items: [], total: 0 }, error: null }, authorized = true;
  const calls = [], contexts = [];
  const actions = load('app/actions/finance-customer-payments.ts', {
    '@/lib/data/brand-finance': { getBrandFinanceContext: async slug => {
      contexts.push(slug); if (!authorized) throw Error('جلسة غير متاحة');
      return { cafe: { id: snapshot.cafe.id, role }, client: { rpc: async (...args) => { calls.push(args); return response; } } };
    } },
  });
  let result = await actions.readCustomerPaymentsAction('verified-brand', { paymentNumber: ' #٠٠١٦ ' });
  eq(result.ok, true); eq(contexts.at(-1), 'verified-brand'); eq(calls.at(-1), ['brand_finance_customer_payments', { p_cafe_id: snapshot.cafe.id, p_filters: { paymentNumber: '0016', offset: 0, limit: 30, sort: 'newest' } }]);
  const before = calls.length;
  for (const filters of [{ cafeId: id(99) }, { limit: 101 }, { offset: -1 }, { paymentNumber: 'x' }, { from: '2026-11-14', to: '2026-11-12' }]) eq((await actions.readCustomerPaymentsAction('verified-brand', filters)).ok, false);
  eq((await actions.readCustomerPaymentAction('not-an-id', 'verified-brand')).ok, false); eq(calls.length, before);
  role = 'warehouse'; eq((await actions.readCustomerPaymentsAction('verified-brand')).ok, false); eq((await actions.readCustomerPaymentAction(payment.id, 'verified-brand')).ok, false); eq(calls.length, before);
  role = 'auditor'; eq((await actions.readCustomerPaymentAction(payment.id, 'verified-brand')).ok, true); eq(calls.at(-1)[1], { p_cafe_id: snapshot.cafe.id, p_id: payment.id });
  const authenticated = calls.length; authorized = false; eq((await actions.readCustomerPaymentsAction('verified-brand')).ok, false); eq(calls.length, authenticated); authorized = true;
  for (const code of ['PGRST202', '42P01', '42883']) {
    response = { data: null, error: { code, message: 'Internal relation details' } }; result = await actions.readCustomerPaymentsAction('verified-brand'); eq(result.ok, false); ok(result.message.includes('تحديث قاعدة البيانات'));
  }
  response = { data: null, error: { code: 'XX000', message: 'Internal relation details' } }; result = await actions.readCustomerPaymentsAction('verified-brand'); eq(result.ok, false); ok(!result.message.includes('Internal'));
  response = { data: null, error: null }; result = await actions.readCustomerPaymentAction(payment.id, 'verified-brand'); eq(result.ok, false); ok(result.message.includes('غير موجودة'));
}

async function checkListAndNavigation() {
  const h = hooks(), calls = [], details = [], events = [];
  let hold = deferred(), detailHold = deferred();
  const children = { FinancePaymentDetail: child('FinancePaymentDetail'), FinancePaymentEditor: child('FinancePaymentEditor'), PaymentReceiptDialog: child('PaymentReceiptDialog') };
  const { FinanceCustomerPayments } = load('components/finance/finance-customer-payments.tsx', {
    ...shared, react: h.api,
    './finance-payment-detail': children, './finance-payment-editor': children, './payment-receipt-dialog': children,
    '@/app/actions/finance-customer-payments': {
      readCustomerPaymentsAction: (...args) => { calls.push(args); return hold.promise; },
      readCustomerPaymentAction: (...args) => { details.push(args); return detailHold.promise; },
    },
  });
  const row = { id: payment.id, invoiceId: invoice.id, initial: false, number: 16, invoiceNumber: 15, invoiceDisplayNumber: 'INV-15', invoiceStatus: 'partial', customerId: id(4), customerName: 'العميل', amount: 30, effectiveAmount: 30, date: payment.date, status: 'completed', method: 'cash', accountName: 'الصندوق', reference: 'REF-16' };
  let props = { snapshot, view: 'payments', paymentId: null, disabled: false, onChanged: () => events.push('changed'), onInvoice: id => events.push(['invoice', id]), onCustomer: (...args) => events.push(['customer', ...args]), onJournal: (...args) => events.push(['journal', ...args]) };
  const render = () => h.render(FinanceCustomerPayments, props);
  let tree = render(); eq(calls.length, 1); eq(calls[0], [snapshot.cafe.slug, { offset: 0, limit: 30, sort: 'newest' }]); ok(text(tree).includes('جار تحميل'));
  hold.resolve({ ok: true, data: { items: [row, { ...row, id: invoice.id, initial: true, number: null, amount: 50 }], total: 31 } }); await flush(); tree = render();
  ok(text(tree).includes('دفعة عند إصدار الفاتورة')); ok(text(tree).includes('مدفوعة جزئيًا')); eq(button(tree, 'السابق').props.disabled, true); eq(button(tree, 'التالي').props.disabled, false);
  button(tree, '#000016').props.onClick(); eq(url, `/dashboard/finance?section=sales&view=payment-detail&payment=${payment.id}`);
  button(tree, 'INV-15').props.onClick(); eq(events.at(-1), ['invoice', invoice.id]); button(tree, 'العميل').props.onClick(); eq(events.at(-1), ['customer', id(4), payment.id]);
  hold = deferred(); button(tree, 'التالي').props.onClick(); tree = render(); eq(calls.at(-1)[1].offset, 30); ok(!text(tree).includes('REF-16'), 'Old rows disappear during a new request');
  hold.resolve({ ok: true, data: { items: [{ ...row, status: 'pending', effectiveAmount: 0 }], total: 31 } }); await flush(); tree = render(); eq(button(tree, 'التالي').props.disabled, true); ok(text(tree).includes('غير محتسب ضمن التحصيل'));
  button(tree, 'بحث متقدم').props.onClick(); tree = render(); eq(button(tree, 'بحث متقدم').props['aria-expanded'], true);
  field(tree, 'رقم عملية الدفع').props.onChange({ target: { value: ' #٠٠١٦ ' } }); tree = render(); const before = calls.length; eq(calls.length, before, 'Typing does not issue requests'); hold = deferred(); submit(tree); tree = render(); eq(calls.at(-1)[1].paymentNumber, '0016'); eq(calls.at(-1)[1].offset, 0);
  hold.resolve({ ok: true, data: { items: [], total: 0 } }); await flush(); tree = render(); ok(text(tree).includes('لا توجد دفعات مطابقة'));
  field(tree, 'من تاريخ').props.onChange({ target: { value: '2026-11-13' } }); tree = render(); field(tree, 'إلى تاريخ').props.onChange({ target: { value: '2026-11-12' } }); tree = render(); const invalid = calls.length; submit(tree); tree = render(); eq(calls.length, invalid); ok(nodes(tree).some(n => n.props?.role === 'alert'));
  hold = deferred(); button(tree, 'إلغاء الفلتر').props.onClick(); tree = render(); eq(calls.at(-1)[1], { offset: 0, limit: 30, sort: 'newest' }); hold.reject(Error('Network')); await flush(); tree = render(); ok(text(tree).includes('تعذر تحميل'));
  const stale = deferred(); hold = stale; button(tree, 'إعادة المحاولة').props.onClick(); tree = render();
  const fresh = deferred(); hold = fresh; props = { ...props, snapshot: { ...snapshot, cafe: { ...snapshot.cafe, id: id(99), slug: 'new-brand' } } }; tree = render(); eq(calls.at(-1)[0], 'new-brand'); fresh.resolve({ ok: true, data: { items: [{ ...row, reference: 'CURRENT-BRAND' }], total: 1 } }); await flush(); stale.resolve({ ok: true, data: { items: [{ ...row, reference: 'STALE-BRAND' }], total: 1 } }); await flush(); tree = render(); ok(text(tree).includes('CURRENT-BRAND')); ok(!text(tree).includes('STALE-BRAND'));
  props = { ...props, snapshot, view: 'payment-detail', paymentId: payment.id }; tree = render(); eq(details.at(-1), [payment.id, snapshot.cafe.slug]); detailHold.resolve({ ok: true, data: { document: settlement, detail, payment } }); await flush(); tree = render();
  let page = find(tree, n => n.type === children.FinancePaymentDetail); page.props.onInvoice(); eq(events.at(-1), ['invoice', invoice.id]); page.props.onJournal(payment.id); eq(events.at(-1), ['journal', payment.id, payment.id]);
  page.props.onReceipt('thermal'); tree = render(); const receipt = find(tree, n => n.type === children.PaymentReceiptDialog); eq(receipt.props.initialMode, 'thermal'); eq(receipt.props.data.amount, 30); receipt.props.onClose();
  page.props.onEdit(payment); eq(url, `/dashboard/finance?section=sales&view=payment-edit&payment=${payment.id}`); page.props.onDelete(payment); eq(url, `/dashboard/finance?section=sales&view=payment-delete&payment=${payment.id}`);
  detailHold = deferred(); props = { ...props, view: 'payment-edit' }; tree = render(); ok(!nodes(tree).some(n => n.type === children.FinancePaymentEditor), 'Editor waits for fresh capabilities'); detailHold.resolve({ ok: true, data: { document: settlement, detail, payment } }); await flush(); tree = render(); let editor = find(tree, n => n.type === children.FinancePaymentEditor); eq(editor.props.disabled, false); eq(editor.props.payment.revision, 3); editor.props.onCancel(); eq(url, `/dashboard/finance?section=sales&view=payment-detail&payment=${payment.id}`);
  props = { ...props, disabled: true }; tree = render(); eq(find(tree, n => n.type === children.FinancePaymentEditor).props.disabled, true);
  props = { ...props, disabled: false }; tree = render(); editor = find(tree, n => n.type === children.FinancePaymentEditor); detailHold = deferred(); editor.props.onSaved(); tree = render(); eq(events.at(-1), 'changed'); ok(text(tree).includes('جار تحميل')); detailHold.resolve({ ok: true, data: { document: settlement, detail, payment: { ...payment, revision: 4 } } }); await flush(); tree = render(); eq(find(tree, n => n.type === children.FinancePaymentEditor).props.payment.revision, 4);
  detailHold = deferred(); props = { ...props, snapshot: { ...snapshot, role: 'auditor' } }; tree = render(); detailHold.resolve({ ok: true, data: { document: settlement, detail, payment } }); await flush(); tree = render(); eq(find(tree, n => n.type === children.FinancePaymentEditor).props.disabled, true);
  const denied = calls.length + details.length; props = { ...props, snapshot: { ...snapshot, role: 'warehouse' } }; tree = render(); eq(calls.length + details.length, denied); ok(text(tree).includes('لا تملك صلاحية')); ok(!nodes(tree).some(n => n.type === children.FinancePaymentEditor));
  detailHold = deferred(); props = { ...props, snapshot, view: 'payment-detail', paymentId: '' }; tree = render(); eq(details.at(-1)[0], ''); detailHold.resolve({ ok: false, message: 'الدفعة غير متاحة' }); await flush(); tree = render(); ok(text(tree).includes('الدفعة غير متاحة')); button(tree, 'المدفوعات').props.onClick(); eq(url, '/dashboard/finance?section=sales&view=payments');
}

async function checkReceiptDialog() {
  const { paymentReceiptData } = load('lib/finance/payment-receipt.ts');
  const data = paymentReceiptData(settlement, detail, snapshot); let pdfCalls = [], hold = deferred();
  const h = hooks(); const { PaymentReceiptDialog } = load('components/finance/payment-receipt-dialog.tsx', { ...shared, react: h.api, '@/lib/export/payment-receipt-pdf': { createPaymentReceiptPdf: (...args) => { pdfCalls.push(args); return hold.promise; } } });
  let props = { data, initialMode: 'standard', onClose() {} }; let tree = h.render(PaymentReceiptDialog, props); await flush();
  eq(pdfCalls[0][1], false); ok(text(tree).includes('جار تجهيز'));
  hold.resolve(new Blob(['standard'])); await flush(); tree = h.render(PaymentReceiptDialog, props); eq(find(tree, n => n.type === 'iframe').props.title, 'معاينة إيصال مدفوعات');
  hold = deferred(); button(tree, 'إيصال مدفوعات حراري').props.onClick(); tree = h.render(PaymentReceiptDialog, props); await flush(); eq(pdfCalls.at(-1)[1], true);
  hold.reject(Error('Failed')); await flush(); tree = h.render(PaymentReceiptDialog, props); ok(text(tree).includes('تعذر تجهيز'));
  hold = deferred(); button(tree, 'إعادة المحاولة').props.onClick(); tree = h.render(PaymentReceiptDialog, props); await flush(); hold.resolve(new Blob(['thermal'])); await flush(); tree = h.render(PaymentReceiptDialog, props); eq(find(tree, n => n.type === 'iframe').props.title, 'معاينة إيصال مدفوعات حراري');
  for (const status of ['pending', 'deleted']) { props = { ...props, data: { ...data, status } }; tree = h.render(PaymentReceiptDialog, props); eq(button(tree, 'إيصال مدفوعات').props.disabled, true); ok(!nodes(tree).some(n => n.type === 'iframe')); }
  const before = pdfCalls.length; props = { ...props, data: { ...data, amount: 0 } }; tree = h.render(PaymentReceiptDialog, props); eq(pdfCalls.length, before);
  const race = hooks(), first = deferred(), second = deferred(); let calls = 0;
  const Racing = load('components/finance/payment-receipt-dialog.tsx', { ...shared, react: race.api, '@/lib/export/payment-receipt-pdf': { createPaymentReceiptPdf: () => ++calls === 1 ? first.promise : second.promise } }).PaymentReceiptDialog;
  tree = race.render(Racing, { data, initialMode: 'standard', onClose() {} }); await flush(); button(tree, 'إيصال مدفوعات حراري').props.onClick(); tree = race.render(Racing, { data, initialMode: 'standard', onClose() {} }); await flush();
  second.resolve(new Blob(['thermal'])); await flush(); tree = race.render(Racing, { data, initialMode: 'standard', onClose() {} }); const src = find(tree, n => n.type === 'iframe').props.src;
  first.resolve(new Blob(['stale standard'])); await flush(); tree = race.render(Racing, { data, initialMode: 'standard', onClose() {} }); eq(find(tree, n => n.type === 'iframe').props.src, src, 'A stale PDF cannot replace the selected receipt format');
}

(async () => { try {
  checkFilters(); checkReceiptDataAndPdf(); checkPaymentDetails(); await checkEditor(); await checkReceiptDialog(); await checkListAndNavigation(); await checkServerActions();
  console.log(`PASS customer payments UI: ${checks} behavioral assertions`);
} finally { global.window = oldWindow; } })().catch(error => { console.error(error); process.exitCode = 1; });
