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
const snapshot = { cafe: { id: id(1), slug: 'recurring-test', name: 'علامة الاختبار' }, role: 'owner', userId: id(2), settings: { vat_rate: 15, tax_inclusive: false, currency: 'SAR' }, warehouses: [{ id: id(3), name: 'المستودع', active: true }], parties: [{ id: id(4), name: 'العميل', kind: 'customer', active: true }], staff: [], products: [{ id: id(5), name: 'المنتج', price: 20, available: true, imageUrl: null, stockTracked: false, quantity: 0 }], documents: [], accounts: [], items: [], stock: [] };
const { invoiceDraftSchema } = load('lib/finance/invoice-draft.ts');
const payload = { name: 'اشتراك شهري', interval: 1, unit: 'month', count: 3, firstDate: '2027-01-31', leadDays: 5, paymentTermsDays: 10, showPeriod: true, active: true,
  document: invoiceDraftSchema.parse({ invoice: { lines: [{ key: 1, productId: id(5), quantity: 20, price: 20, discount: 10, discountKind: 'percent', vatRate: 15 }], warehouseId: id(3), partyId: id(4), accountId: '', paymentKind: 'credit', discountValue: 0, discountKind: 'amount', discountEnabled: false, vatRate: 15, taxInclusive: false, note: 'بيانات الاشتراك' }, template: 'standard', extraFields: [], deliveryMethod: 'print' }),
};
const { recurrencePreview } = load('lib/finance/recurring-invoice.ts');
const record = { id: id(6), number: 1, revision: 2, name: payload.name, interval: 1, unit: 'month', customerName: 'اسم العميل المحفوظ', warehouseName: 'المستودع', subtotal: 400, discount: 40, tax: 54, total: 414, generatedCount: 1, count: 3, nextDate: '2027-02-28', nextIssueDate: '2027-02-23', lastIssuedAt: '2027-01-26T10:00:00Z', lastError: null, status: 'active', updatedAt: '2027-01-26T10:00:00Z', payload,
  lines: [{ productId: id(5), name: 'الصنف المحفوظ', kind: 'product', description: '', quantity: 20, price: 20, discount: 40, net: 360, tax: 54, total: 414, vatRate: 15 }],
  invoices: [{ id: id(7), index: 0, scheduledDate: '2027-01-31', issuedAt: '2027-01-26T10:00:00Z', invoiceId: id(8), invoiceNumber: 101, displayNumber: 'INV-101', total: 414, dueDate: '2027-02-10', periodStart: '2027-01-31', periodEnd: '2027-02-27' }], historyTotal: 1, historyOffset: 0, upcoming: recurrencePreview(payload, 1, 5),
};
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
let checks = 0;
function eq(a, b, message) { assert.deepEqual(a, b, message); checks++; }
function ok(a, message) { assert.ok(a, message); checks++; }
function rejects(fn, message) { assert.throws(fn, undefined, message); checks++; }
const oldWindow = global.window;
let url = '';
global.window = { addEventListener() {}, removeEventListener() {}, history: { pushState(_a, _b, href) { url = href; }, replaceState(_a, _b, href) { url = href; } } };

function checkCalendarAndMoney() {
  const { recurringOccurrenceDate: date, recurrencePreview: preview, recurringInvoiceAmounts: amounts, recurringInvoiceSchema } = load('lib/finance/recurring-invoice.ts');
  for (const [first, unit, every, index, expected] of [
    ['2027-01-31', 'month', 1, 0, '2027-01-31'],
    ['2027-01-31', 'month', 1, 1, '2027-02-28'],
    ['2027-01-31', 'month', 1, 2, '2027-03-31'],
    ['2028-01-31', 'month', 1, 1, '2028-02-29'],
    ['2027-01-30', 'month', 1, 1, '2027-02-28'],
    ['2027-01-30', 'month', 1, 2, '2027-03-30'],
    ['2024-02-29', 'year', 1, 1, '2025-02-28'],
    ['2024-02-29', 'year', 1, 4, '2028-02-29'],
    ['2026-12-28', 'week', 1, 1, '2027-01-04'],
    ['2027-01-31', 'month', 2, 1, '2027-03-31'],
    ['2027-03-31', 'day', 1, 1, '2027-04-01'],
    ['2027-12-31', 'day', 1, 1, '2028-01-01'],
  ]) eq(date(first, unit, every, index), expected, 'Occurrence is calculated from the original anchor, not the previous clipped month');
  rejects(() => date('2027-02-30', 'month', 1, 1)); rejects(() => date('2027-01-31', 'month', 0, 1)); rejects(() => date('2027-01-31', 'month', 1, -1));
  rejects(() => date('2027-01-31', 'month', 1.5, 1)); rejects(() => date('9999-12-31', 'month', 1, 1));
  rejects(() => date('0099-01-31', 'month', 1, 1), 'Unsupported pre1900 dates cannot silently shift by1900 years');
  const upcoming = preview(payload, 0, 5);
  eq(upcoming.length, 3, 'Count limits future invoices'); eq(upcoming[0].issueDate, '2027-01-26'); eq(upcoming[0].dueDate, '2027-02-10');
  eq(upcoming[0].periodEnd, '2027-02-27'); eq(upcoming[1].periodStart, '2027-02-28'); eq(upcoming[1].periodEnd, '2027-03-30');
  eq(preview(payload, 3), [], 'Exhausted schedules have no phantom upcoming invoice'); eq(preview(payload, 2).map(p => p.index), [2]);
  eq(preview({ ...payload, count: 0 }, 4, 100).length, 30, 'Unbounded schedule previews remain bounded in the UI');
  eq(amounts(payload).total, 414); eq(amounts(payload).discount, 40); eq(amounts(payload).tax, 54);
  const inactiveDiscount = { ...payload, document: { ...payload.document, invoice: { ...payload.document.invoice, discountValue: 10, discountEnabled: false } } };
  eq(amounts(inactiveDiscount).total, 414, 'Disabled document discount does not affect preview');
  eq(amounts({ ...payload, document: { ...payload.document, invoice: { ...payload.document.invoice, discountValue: 15, discountKind: 'percent', discountEnabled: true } } }).total, 351.9);
  ok(!recurringInvoiceSchema.safeParse({ ...payload, name: '' }).success); ok(!recurringInvoiceSchema.safeParse({ ...payload, interval: 0 }).success); ok(!recurringInvoiceSchema.safeParse({ ...payload, count: -1 }).success);
}

function checkUpcomingDocument() {
  const { recurringInvoicePreview, RecurringInvoiceDocument } = load('components/finance/recurring-invoice-document.tsx', shared);
  const model = recurringInvoicePreview(payload, { ...snapshot, settings: { vat_rate: 100, tax_inclusive: true } }, record);
  eq(model.total, 414); eq(model.tax, 54, 'Preview uses the subscription tax settings'); eq(model.customer, record.customerName);
  eq(model.recurring.date, '2027-02-28'); eq(model.recurring.issueDate, '2027-02-23'); eq(model.recurring.dueDate, '2027-03-10');
  eq(model.recurring.periodEnd, '2027-03-30'); eq(model.recurring.taxInclusive, false);
  eq(model.lines[0].name, 'الصنف المحفوظ');
  const editedPayload = { ...payload, document: { ...payload.document, invoice: { ...payload.document.invoice, lines: [{ ...payload.document.invoice.lines[0], price: 30 }] } } };
  const canonical = recurringInvoicePreview(editedPayload, snapshot, record);
  eq(canonical.total, 414, 'Saved detail uses canonical totals, even if draft inputs differ'); eq(canonical.lines[0].price, 20);
  const editable = recurringInvoicePreview(editedPayload, snapshot, record, false);
  eq(editable.total, 621, 'Editor preview recalculates changed prices'); eq(editable.lines[0].price, 30);
  ok(!model.issued && !model.quote && !model.creditNote, 'Upcoming preview never invents issued invoice or credit metadata');
  eq(recurringInvoicePreview({ ...payload, showPeriod: false }, snapshot).recurring.periodStart, undefined);
  const tree = RecurringInvoiceDocument({ model });
  ok(text(tree).includes('معاينة قبل الإصدار')); ok(text(tree).includes('يُخصص رقم الفاتورة عند إصدارها'));
  class Pdf {
    constructor() { this.tables = []; this.internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } }; }
    setLanguage() { return this; } setProperties(value) { this.properties = value; return this; }
    setPage() { return this; } setFont() { return this; } setFontSize() { return this; }
    setTextColor() { return this; } setDrawColor() { return this; } setLineWidth() { return this; }
    line() { return this; } text() { return this; } getNumberOfPages() { return 1; }
  }
  const { buildCompanyInvoicePreviewPdf } = load('lib/export/company-invoice-preview-pdf.ts', { jspdf: { jsPDF: Pdf }, 'jspdf-autotable': { autoTable(doc, options) { doc.tables.push(options); doc.lastAutoTable = { finalY: 20 }; } }, 'qrcode-generator': () => { throw Error('Upcoming invoice cannot have an issued fiscal QR'); } });
  const pdf = buildCompanyInvoicePreviewPdf(model, {}), rows = pdf.tables.flatMap(table => table.body);
  eq(pdf.properties.title, 'معاينة فاتورة دورية غير صادرة');
  ok(rows.some(row => row[0] === '2027-02-28' && row[1] === 'تاريخ الفاتورة'));
  ok(rows.some(row => row[0] === '2027-03-10' && row[1] === 'تاريخ الاستحقاق'));
  ok(rows.some(row => row[0] === '2027-03-30' && row[1] === 'الفترة حتى'));
  ok(!rows.some(row => row[1] === 'رقم الفاتورة'), 'No fabricated invoice number appears before issuance');
}

async function checkEditor() {
  const issuer = { name: 'المنشأة', vatNumber: '300000000000003', address: 'عنوان المنشأة المفصل' };
  const saved = { ...record, payload: { ...payload, document: { ...payload.document, issuer } } };
  let response = deferred(), calls = [], savedCalls = [], cancelCalls = 0;
  const make = (initial = saved, disabled = false, editorSnapshot = snapshot) => {
    const h = hooks();
    const { RecurringInvoiceEditor, newRecurringInvoice } = load('components/finance/recurring-invoice-editor.tsx', {
      ...shared, react: h.api,
      '@/app/actions/finance-recurring-invoices': { saveRecurringInvoiceAction: (...args) => { calls.push(args); return response.promise; } },
      '@/app/actions/finance-company-invoices': { companyInvoiceIssuerAction: async () => ({ ok: true, data: { ...issuer, fromAccountSettings: true } }) },
    });
    return { render: () => h.render(RecurringInvoiceEditor, { snapshot: editorSnapshot, saved: initial, disabled, onSaved: value => savedCalls.push(value), onCancel: () => cancelCalls++, onCreateCustomer: async () => true }), defaults: newRecurringInvoice(editorSnapshot) };
  };
  const editor = make(); let tree = editor.render();
  eq(editor.defaults.document.invoice.paymentKind, 'credit'); eq(editor.defaults.document.deliveryMethod, 'print');
  eq(field(tree, 'إصدار فاتورة كل').props.disabled, true); eq(field(tree, 'وحدة التكرار').props.disabled, true); eq(field(tree, 'تاريخ أول فاتورة').props.disabled, true);
  eq(field(tree, 'طريقة التسليم').props.disabled, true);
  eq(nodes(field(tree, 'وحدة التكرار')).filter(n => n.type === 'option').map(text), ['يوم', 'أسبوع', 'شهر', 'سنة']);
  eq(nodes(field(tree, 'قالب الفاتورة')).filter(n => n.type === 'option').map(text), ['التصميم القياسي', 'التصميم الحراري']);
  eq(find(tree, n => n.type?.name === 'CompanyInvoiceLines').props.amounts[0].total, 414, 'Editor line totals include the saved discount and tax');
  for (const label of ['أرسل لي نسخة من الفاتورة المنشأة', 'تفعيل الدفع التلقائي لهذه الفاتورة']) {
    const control = find(find(tree, n => n.type === 'label' && text(n) === label), n => n.type === 'input');
    eq(control.props.disabled, true); eq(control.props.checked, false);
  }
  ok(hasButton(tree, 'حفظ وتفعيل الاشتراك')); ok(text(tree).includes('يصدر فواتير آجلة تلقائيًا'));
  button(tree, 'معاينة الفاتورة القادمة').props.onClick(); tree = editor.render();
  eq(find(tree, n => n.type?.name === 'RecurringInvoiceDocument').props.model.recurring.date, '2027-02-28', 'Editing a previously issued schedule previews the next occurrence');
  find(tree, n => n.type?.name === 'Modal' && n.props.open).props.onClose(); tree = editor.render();
  submit(tree); submit(tree); eq(calls.length, 1, 'Save is single flight even before rerender');
  eq(calls[0][0].id, saved.id); eq(calls[0][0].revision, saved.revision); eq(calls[0][1], snapshot.cafe.slug);
  eq(calls[0][0].payload.document.invoice.paymentKind, 'credit'); eq(calls[0][0].payload.active, true);
  response.resolve({ ok: false, message: 'تعذر الحفظ' }); await flush(); tree = editor.render(); ok(text(tree).includes('تعذر الحفظ'));
  response = deferred(); submit(tree); eq(calls[1][0].id, calls[0][0].id); eq(calls[1][0].revision, calls[0][0].revision, 'Retry preserves the expected revision');
  response.resolve({ ok: true, data: { ...saved, revision: 3 } }); await flush(); eq(savedCalls.length, 1);
  tree = editor.render(); button(tree, 'رجوع').props.onClick(); eq(cancelCalls, 1, 'Saved editor exits without a discard prompt');

  const editable = make({ ...saved, generatedCount: 0 }); tree = editable.render();
  eq(field(tree, 'تاريخ أول فاتورة').props.disabled, false);
  field(tree, 'تاريخ أول فاتورة').props.onChange({ target: { value: '' } }); tree = editable.render();
  eq(button(tree, 'معاينة الفاتورة القادمة').props.disabled, true, 'A cleared date does not crash rendering');
  const before = calls.length; submit(tree); await flush(); eq(calls.length, before); ok(text(editable.render()).includes('راجع اسم الاشتراك'));
  field(tree, 'تاريخ أول فاتورة').props.onChange({ target: { value: payload.firstDate } }); tree = editable.render();
  field(tree, 'إصدار فاتورة كل').props.onChange({ target: { value: '' } }); tree = editable.render(); eq(button(tree, 'معاينة الفاتورة القادمة').props.disabled, true);
  field(tree, 'إصدار فاتورة كل').props.onChange({ target: { value: '2' } }); tree = editable.render();
  const active = find(find(tree, n => n.type === 'label' && text(n) === 'نشط'), n => n.type === 'input'); active.props.onChange({ target: { checked: false } }); tree = editable.render();
  ok(hasButton(tree, 'حفظ الاشتراك'));
  field(tree, 'العميل').props.onChange({ target: { value: '' } }); tree = editable.render(); submit(tree); await flush(); eq(calls.length, before); ok(text(editable.render()).includes('اختر العميل'));
  tree = editable.render(); button(tree, 'رجوع').props.onClick(); tree = editable.render(); ok(hasButton(tree, 'متابعة التعديل')); eq(cancelCalls, 1);
  button(tree, 'متابعة التعديل').props.onClick(); tree = editable.render(); button(tree, 'رجوع').props.onClick(); tree = editable.render(); button(tree, 'تجاهل التعديلات').props.onClick(); eq(cancelCalls, 2);
  const blocked = make(saved, true); tree = blocked.render(); eq(button(tree, 'حفظ وتفعيل الاشتراك').props.disabled, true); submit(tree); eq(calls.length, before);
  const invalidIssuer = make({ ...saved, payload: { ...saved.payload, document: { ...saved.payload.document, issuer: { ...issuer, vatNumber: '123' } } } });
  submit(invalidIssuer.render()); await flush(); eq(calls.length, before); ok(text(invalidIssuer.render()).includes('رقمها الضريبي'));
  const emptyAmount = make({ ...saved, payload: { ...saved.payload, document: { ...saved.payload.document, invoice: { ...payload.document.invoice, lines: [{ key: 1, productId: id(5), quantity: 1, price: 0 }] } } } });
  submit(emptyAmount.render()); await flush(); eq(calls.length, before); ok(text(emptyAmount.render()).includes('مبلغ الفاتورة'));

  const blank = make(null); tree = blank.render(); await flush(); tree = blank.render();
  field(tree, 'اسم الاشتراك').props.onChange({ target: { value: 'اشتراك جديد' } }); tree = blank.render();
  field(tree, 'العميل').props.onChange({ target: { value: id(4) } }); tree = blank.render();
  find(tree, n => n.type?.name === 'CompanyInvoiceLines').props.onChange(payload.document.invoice.lines); tree = blank.render();
  eq(find(tree, n => n.type?.name === 'CompanyInvoiceLines').props.lines[0].name, 'المنتج', 'Product names are captured into the recurring payload');
  response = deferred(); submit(tree); submit(tree); eq(calls.length, before + 1); const firstNew = calls.at(-1)[0]; ok(firstNew.id); eq(firstNew.revision, 0);
  eq(firstNew.payload.document.issuer, issuer, 'Account Settings provenance does not enter the strict saved invoice issuer');
  response.resolve({ ok: false, message: 'أعد المحاولة' }); await flush(); tree = blank.render(); response = deferred(); submit(tree); eq(calls.at(-1)[0].id, firstNew.id, 'Unsaved retry reuses its generated identity');
  response.resolve({ ok: true, data: { ...saved, id: firstNew.id, revision: 1 } }); await flush();
  const completed = make({ ...saved, generatedCount: 3, status: 'completed', upcoming: [] }); tree = completed.render();
  eq(button(tree, 'معاينة الفاتورة القادمة').props.disabled, true, 'An exhausted subscription cannot preview an already issued occurrence');
  const changedCustomer = make(saved, false, { ...snapshot, parties: [...snapshot.parties, { id: id(10), kind: 'customer', active: true, name: 'عميل جديد' }] });
  tree = changedCustomer.render(); field(tree, 'العميل').props.onChange({ target: { value: id(10) } }); tree = changedCustomer.render(); button(tree, 'معاينة الفاتورة القادمة').props.onClick(); tree = changedCustomer.render();
  eq(find(tree, n => n.type?.name === 'RecurringInvoiceDocument').props.model.customer, 'عميل جديد', 'Changed customer is not replaced by an old snapshot name');
  const paused = make({ ...saved, generatedCount: 0 }); tree = paused.render();
  find(find(tree, n => n.type === 'label' && text(n) === 'نشط'), n => n.type === 'input').props.onChange({ target: { checked: false } }); tree = paused.render();
  response = deferred(); submit(tree); eq(calls.at(-1)[0].payload.active, false, 'An inactive save does not activate scheduled issuance');
  response.resolve({ ok: true, data: { ...saved, status: 'paused' } }); await flush();
  const editedAmount = make(saved); tree = editedAmount.render();
  find(tree, n => n.type?.name === 'CompanyInvoiceLines').props.onChange([{ ...payload.document.invoice.lines[0], quantity: 1, price: 30, discount: 0 }]); tree = editedAmount.render();
  button(tree, 'معاينة الفاتورة القادمة').props.onClick(); tree = editedAmount.render();
  eq(find(tree, n => n.type?.name === 'RecurringInvoiceDocument').props.model.total, 34.5, 'Editor never reuses saved totals after changing lines');
}

async function checkManager() {
  let hold = deferred(), transitions = [], changed = 0, printed = 0, selectedTab = '', page = -1;
  const common = { ...shared, './recurring-invoice-editor': { RecurringInvoiceEditor: child('RecurringInvoiceEditor') }, '@/lib/finance/quotation': { riyadhDate: () => '2027-02-24' } };
  const h = hooks();
  const { RecurringInvoiceDetails, navigateRecurringInvoices } = load('components/finance/finance-recurring-invoices.tsx', { ...common, react: h.api, '@/app/actions/finance-recurring-invoices': { transitionRecurringInvoiceAction: (...args) => { transitions.push(args); return hold.promise; } } });
  let props = { record, snapshot, disabled: false, onChanged: () => changed++, onPrint: () => printed++, onTab: value => selectedTab = value, onHistoryPage: value => page = value };
  let tree = h.render(RecurringInvoiceDetails, props);
  eq(nodes(tree).filter(n => n.props?.['aria-pressed'] !== undefined).length, 3);
  ok(hasButton(tree, 'إيقاف الاشتراك')); ok(hasButton(tree, 'إصدار المستحق الآن'));
  button(tree, 'الفاتورة القادمة').props.onClick(); eq(selectedTab, 'upcoming');
  tree = h.render(RecurringInvoiceDetails, { ...props, tab: 'upcoming' });
  eq(find(tree, n => n.type?.name === 'RecurringInvoiceDocument').props.model.recurring.date, record.nextDate);
  button(tree, 'طباعة المعاينة').props.onClick(); eq(printed, 1);
  tree = h.render(RecurringInvoiceDetails, { ...props, tab: 'history', record: { ...record, historyTotal: 31 } });
  eq(button(tree, 'السابق').props.disabled, true); eq(button(tree, 'التالي').props.disabled, false);
  button(tree, 'التالي').props.onClick(); eq(page, 30);
  const link = find(tree, n => n.type === 'a' && text(n) === 'عرض وطباعة');
  eq(link.props.href, `/dashboard/finance?section=sales&view=invoice&invoice=${id(8)}`);
  let prevented = false; link.props.onClick({ button: 0, preventDefault: () => prevented = true, currentTarget: { getAttribute: () => link.props.href } }); eq(prevented, true); eq(url, link.props.href);
  prevented = false; link.props.onClick({ button: 0, ctrlKey: true, preventDefault: () => prevented = true }); eq(prevented, false, 'Modified invoice links retain native browser behavior');
  tree = h.render(RecurringInvoiceDetails, { ...props, tab: 'history', record: { ...record, historyOffset: 30, historyTotal: 31 } }); eq(button(tree, 'التالي').props.disabled, true); button(tree, 'السابق').props.onClick(); eq(page, 0);
  tree = h.render(RecurringInvoiceDetails, props); button(tree, 'إيقاف الاشتراك').props.onClick(); tree = h.render(RecurringInvoiceDetails, props);
  ok(text(tree).includes('تبقى الفواتير السابقة محفوظة')); button(tree, 'إلغاء').props.onClick(); eq(transitions.length, 0);
  tree = h.render(RecurringInvoiceDetails, props); button(tree, 'إيقاف الاشتراك').props.onClick(); tree = h.render(RecurringInvoiceDetails, props);
  button(tree, 'تأكيد').props.onClick(); button(tree, 'تأكيد').props.onClick(); eq(transitions.length, 1);
  eq(transitions[0][0].id, record.id); eq(transitions[0][0].revision, record.revision); eq(transitions[0][0].operation, 'pause'); eq(transitions[0][1], snapshot.cafe.slug);
  hold.resolve({ ok: false, message: 'خطأ مؤقت' }); await flush(); tree = h.render(RecurringInvoiceDetails, props); ok(text(tree).includes('خطأ مؤقت'));
  hold = deferred(); button(tree, 'تأكيد').props.onClick(); eq(transitions[1][0].requestId, transitions[0][0].requestId, 'Ambiguous retries retain the operation identity');
  hold.resolve({ ok: true, data: { status: 'paused' } }); await flush(); eq(changed, 1);
  props = { ...props, record: { ...record, status: 'paused', revision: 3 } }; tree = h.render(RecurringInvoiceDetails, props);
  ok(!hasButton(tree, 'إصدار المستحق الآن')); button(tree, 'تفعيل الاشتراك').props.onClick(); tree = h.render(RecurringInvoiceDetails, props); hold = deferred(); button(tree, 'تأكيد').props.onClick();
  eq(transitions.at(-1)[0].revision, 3); eq(transitions.at(-1)[0].operation, 'resume'); ok(transitions.at(-1)[0].requestId !== transitions[0][0].requestId);
  hold.resolve({ ok: true, data: { status: 'active' } }); await flush();
  props = { ...props, record: { ...record, revision: 4 } }; tree = h.render(RecurringInvoiceDetails, props); button(tree, 'إصدار المستحق الآن').props.onClick(); tree = h.render(RecurringInvoiceDetails, props);
  hold = deferred(); button(tree, 'تأكيد').props.onClick(); eq(transitions.at(-1)[0].operation, 'run');
  hold.resolve({ ok: true, data: { status: 'failed', message: 'المخزون غير كاف' } }); await flush(); tree = h.render(RecurringInvoiceDetails, props); ok(text(tree).includes('المخزون غير كاف')); eq(changed, 2, 'Failed issuance is not presented as successful');
  for (const [status, message] of [['not_due', 'لم يحن موعد الإصدار'], ['busy', 'الإصدار قيد التنفيذ']]) {
    hold = deferred(); button(tree, 'تأكيد').props.onClick(); hold.resolve({ ok: true, data: { status } }); await flush(); tree = h.render(RecurringInvoiceDetails, props);
    ok(text(tree).includes(message)); eq(changed, 2, 'Deferred and concurrent issuance are not falsely reported as success'); ok(hasButton(tree, 'إلغاء'));
  }
  button(tree, 'إلغاء').props.onClick(); tree = h.render(RecurringInvoiceDetails, props); eq(button(tree, 'حذف الاشتراك').props.disabled, true);
  button(tree, 'حذف الاشتراك').props.onClick(); tree = h.render(RecurringInvoiceDetails, props); const beforeDelete = transitions.length; button(tree, 'تأكيد').props.onClick(); eq(transitions.length, beforeDelete, 'Issued subscriptions cannot be deleted even by invoking the disabled handler');
  button(tree, 'إلغاء').props.onClick(); props = { ...props, record: { ...record, generatedCount: 0, revision: 5, invoices: [], historyTotal: 0 } }; tree = h.render(RecurringInvoiceDetails, props); button(tree, 'حذف الاشتراك').props.onClick(); tree = h.render(RecurringInvoiceDetails, props);
  ok(text(tree).includes('الذي لم يصدر فواتير')); hold = deferred(); button(tree, 'تأكيد').props.onClick(); eq(transitions.at(-1)[0].operation, 'delete');
  hold.resolve({ ok: true, data: { status: 'deleted' } }); await flush(); eq(new URL(url, 'https://test').searchParams.get('view'), 'recurring');
  tree = h.render(RecurringInvoiceDetails, { ...props, disabled: true }); eq(button(tree, 'حذف الاشتراك').props.disabled, true);
  tree = h.render(RecurringInvoiceDetails, { ...props, snapshot: { ...snapshot, role: 'auditor' } }); ok(!hasButton(tree, 'تعديل')); ok(!hasButton(tree, 'إيقاف الاشتراك')); ok(!hasButton(tree, 'حذف الاشتراك'));
  tree = h.render(RecurringInvoiceDetails, { ...props, record: { ...record, nextIssueDate: '2027-02-25' } }); ok(!hasButton(tree, 'إصدار المستحق الآن'), 'Future invoice issuance cannot be forced');
  tree = h.render(RecurringInvoiceDetails, { ...props, tab: 'upcoming', record: { ...record, status: 'completed', upcoming: [] } }); ok(!hasButton(tree, 'طباعة المعاينة')); ok(text(tree).includes('اكتمل عدد الفواتير المحدد'));
  navigateRecurringInvoices('recurring-create', record.id); eq(new URL(url, 'https://test').searchParams.get('recurring'), record.id);

  let reads = [], detailReads = [];
  const listHooks = hooks();
  const Manager = load('components/finance/finance-recurring-invoices.tsx', { ...common, react: listHooks.api, '@/app/actions/finance-recurring-invoices': {
    readRecurringInvoicesAction: async (slug, filters) => { reads.push({ slug, filters }); return { ok: true, data: { items: [record], total: 31 } }; },
    readRecurringInvoiceAction: async (...args) => { detailReads.push(args); return { ok: true, data: { ...record, historyTotal: 31, historyOffset: args[2] } }; },
  } }).FinanceRecurringInvoices;
  let managerProps = { snapshot, view: 'recurring', recurringId: null, stale: false, pending: false, onChanged() {}, onCreateCustomer: async () => true };
  const render = () => listHooks.render(Manager, managerProps);
  tree = render(); ok(text(tree).includes('جار تحميل')); await flush(); tree = render(); eq(reads.length, 1); eq(reads[0].filters, { offset: 0, limit: 30 });
  eq(button(tree, 'السابق').props.disabled, true); button(tree, 'التالي').props.onClick(); tree = render(); await flush(); tree = render(); eq(reads.at(-1).filters.offset, 30); eq(button(tree, 'التالي').props.disabled, true);
  field(tree, 'اسم الاشتراك').props.onChange({ target: { value: '  اشتراك  ' } }); tree = render(); field(tree, 'العميل').props.onChange({ target: { value: id(4) } }); tree = render();
  button(tree, 'بحث متقدم').props.onClick(); tree = render(); field(tree, 'الحالة').props.onChange({ target: { value: 'paused' } }); tree = render(); submit(tree); tree = render(); await flush(); tree = render();
  eq(reads.at(-1).filters, { query: 'اشتراك', partyId: id(4), status: 'paused', offset: 0, limit: 30 }, 'Search uses server filters and resets pagination');
  button(tree, 'إلغاء الفلتر').props.onClick(); tree = render(); await flush(); tree = render(); eq(reads.at(-1).filters, { offset: 0, limit: 30 });
  managerProps = { ...managerProps, stale: true }; tree = render(); eq(button(tree, 'اشتراك جديد').props.disabled, true);
  managerProps = { ...managerProps, stale: false, view: 'recurring-detail', recurringId: record.id }; tree = render(); await flush(); tree = render(); eq(detailReads.at(-1), [record.id, snapshot.cafe.slug, 0]);
  let detail = find(tree, n => n.type?.name === 'RecurringInvoiceDetails'); detail.props.onHistoryPage(30); tree = render(); await flush(); tree = render(); eq(detailReads.at(-1)[2], 30); eq(find(tree, n => n.type?.name === 'RecurringInvoiceDetails').props.tab, 'history');
  managerProps = { ...managerProps, recurringId: id(9) }; tree = render(); await flush(); tree = render(); eq(detailReads.at(-1)[2], 0, 'Another subscription does not inherit a history offset');
  managerProps = { ...managerProps, view: 'recurring-create', recurringId: null }; tree = render(); ok(nodes(tree).some(n => n.type?.name === 'RecurringInvoiceEditor'));
  managerProps = { ...managerProps, snapshot: { ...snapshot, role: 'auditor' } }; tree = render(); ok(!nodes(tree).some(n => n.type?.name === 'RecurringInvoiceEditor')); ok(text(tree).includes('لا تملك صلاحية'));

  const errorHooks = hooks(); let fail = true;
  const ErrorManager = load('components/finance/finance-recurring-invoices.tsx', { ...common, react: errorHooks.api, '@/app/actions/finance-recurring-invoices': { readRecurringInvoicesAction: async () => fail ? { ok: false, message: 'خطأ اختبار' } : { ok: true, data: { items: [], total: 0 } } } }).FinanceRecurringInvoices;
  const emptyProps = { ...managerProps, snapshot, view: 'recurring', recurringId: null };
  tree = errorHooks.render(ErrorManager, emptyProps); await flush(); tree = errorHooks.render(ErrorManager, emptyProps); ok(nodes(tree).some(n => n.props?.role === 'alert'));
  fail = false; button(tree, 'إعادة المحاولة').props.onClick(); tree = errorHooks.render(ErrorManager, emptyProps); await flush(); tree = errorHooks.render(ErrorManager, emptyProps); ok(text(tree).includes('لا توجد فواتير دورية بعد')); eq(button(tree, 'التالي').props.disabled, true);
  const raceHooks = hooks(), first = deferred(), second = deferred(); let count = 0;
  const RaceManager = load('components/finance/finance-recurring-invoices.tsx', { ...common, react: raceHooks.api, '@/app/actions/finance-recurring-invoices': { readRecurringInvoicesAction: () => ++count === 1 ? first.promise : second.promise } }).FinanceRecurringInvoices;
  tree = raceHooks.render(RaceManager, emptyProps); const nextTenant = { ...emptyProps, snapshot: { ...snapshot, cafe: { ...snapshot.cafe, id: id(100), slug: 'other-tenant' } } };
  tree = raceHooks.render(RaceManager, nextTenant); second.resolve({ ok: true, data: { items: [{ ...record, name: 'اشتراك العلامة الجديدة' }], total: 1 } }); await flush(); tree = raceHooks.render(RaceManager, nextTenant); ok(text(tree).includes('اشتراك العلامة الجديدة'));
  first.resolve({ ok: true, data: { items: [{ ...record, name: 'اشتراك العلامة السابقة' }], total: 1 } }); await flush(); tree = raceHooks.render(RaceManager, nextTenant); ok(text(tree).includes('اشتراك العلامة الجديدة')); ok(!text(tree).includes('اشتراك العلامة السابقة'), 'Stale tenant reads cannot overwrite current results');
}

(async () => { try {
  checkCalendarAndMoney();
  checkUpcomingDocument();
  await checkEditor();
  await checkManager();
  console.log(`PASS recurring invoices UI: ${checks} behavioral assertions`);
} finally { global.window = oldWindow; } })().catch(error => { console.error(error); process.exitCode = 1; });
