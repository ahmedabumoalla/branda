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
const shared = { '@/components/dashboard/ui/modal': { Modal: child('Modal') }, './finance-ui': { Field: child('Field'), Numeric: child('Numeric'), financeDate: value => value }, './company-invoice-lines': { CompanyInvoiceLines: child('CompanyInvoiceLines') }, './finance-customer-form': { FinanceCustomerForm: child('FinanceCustomerForm') } };
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const snapshot = { cafe: { id: id(1), slug: 'credit-test', name: 'علامة الاختبار' }, role: 'owner', userId: id(2), settings: { vat_rate: 15, tax_inclusive: false }, warehouses: [{ id: id(3), name: 'المستودع', active: true }], parties: [{ id: id(4), name: 'العميل', kind: 'customer', active: true }, { id: id(14), name: 'عميل آخر', kind: 'customer', active: true }], staff: [], products: [{ id: id(5), name: 'المنتج', price: 20 }], documents: [{ id: id(8), kind: 'sale', number: 80, party_id: id(4) }, { id: id(9), kind: 'sale', number: 90, party_id: id(14) }] };
const { newCreditNote } = load('lib/finance/credit-note.ts');
const payload = { ...newCreditNote(snapshot), partyId: id(4), reason: 'تصحيح بند', sourceInvoiceId: id(8), stockRequired: true, lines: [{ key: 1, productId: id(5), quantity: 20, price: 20, discount: 10, discountKind: 'percent', vatRate: 15 }] };
const record = { id: id(6), number: 1, revision: 2, status: 'issued', stockStatus: 'pending', payload, customerName: 'اسم محفوظ', warehouseName: 'مستودع محفوظ', createdByName: 'المستخدم', salespersonName: '', sourceNumber: 80, createdAt: '2026-11-12T10:00:00Z', updatedAt: '2026-11-12T10:00:00Z', issuedAt: '2026-11-12T10:00:00Z', subtotal: 400, discount: 40, tax: 54, total: 414, journalId: id(7), stockDocumentId: null, lines: [{ productId: id(5), name: 'اسم صنف محفوظ', quantity: 20, price: 20, discount: 40, net: 360, tax: 54, total: 414, description: '', vatRate: 15, itemId: id(10), unitCost: 6 }], events: [{ id: id(11), action: 'issue', actorName: 'المحاسب', createdAt: '2026-11-12T10:00:00Z', note: 'مراجعة الحساب' }] };
const draft = { ...record, status: 'draft', stockStatus: 'none', issuedAt: null };
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
let checks = 0;
function eq(a, b, message) { assert.deepEqual(a, b, message); checks++; }
function ok(a, message) { assert.ok(a, message); checks++; }
const oldWindow = global.window;
let url = '';
global.window = { addEventListener() {}, removeEventListener() {}, history: { pushState(_a, _b, href) { url = href; } } };

(async () => { try {
  const { creditNotePreview, CreditNoteDocument } = load('components/finance/credit-note-document.tsx', shared);
  const authoritative = { ...record, displayNumber: 'CN-2026-007', total: 415, tax: 55, lines: [{ ...record.lines[0], total: 415, tax: 55 }] };
  const preview = creditNotePreview(payload, snapshot, authoritative);
  eq(preview.total, 415, 'Printed document uses saved monetary totals'); eq(preview.lines[0].tax, 55, 'Printed rows use canonical saved amounts');
  eq(preview.customer, record.customerName); eq(preview.lines[0].name, record.lines[0].name); eq(preview.creditNote.draft, false);
  ok(!preview.issued, 'No invented fiscal QR metadata'); eq(creditNotePreview(payload, snapshot).creditNote.draft, true);
  ok(text(CreditNoteDocument({ model: preview })).includes('إشعار دائن'));
  eq(preview.creditNote.number, record.number, 'Preview preserves numeric identity');
  eq(preview.creditNote.displayNumber, 'CN-2026-007', 'Preview carries saved display number');
  ok(text(CreditNoteDocument({ model: preview })).includes('#CN-2026-007'), 'Canonical document renders display number verbatim');
  ok(text(CreditNoteDocument({ model: creditNotePreview(payload, snapshot, record) })).includes('#000001'), 'Legacy document retains padded numeric number');

  let transitionCalls = [], readCalls = [], changed = 0;
  let pendingTransition = deferred();
  const actions = { transitionCreditNoteAction: async (input, slug) => { transitionCalls.push({ input, slug }); return pendingTransition.promise; }, readCreditNotesAction: async (slug, filters) => { readCalls.push({ slug, filters }); return { ok: true, data: { items: [record], total: 31 } }; }, readCreditNoteAction: async () => ({ ok: true, data: record }), saveCreditNoteAction: async () => { throw Error('Unexpected save'); } };
  const h = hooks();
  const { CreditNoteDetails, FinanceCreditNotes, navigateCreditNotes } = load('components/finance/finance-credit-notes.tsx', { ...shared, react: h.api, '@/app/actions/finance-credit-notes': actions, './credit-note-editor': { CreditNoteEditor: child('CreditNoteEditor') } });
  let props = { record: { ...record, displayNumber: 'CN-2026-007' }, snapshot, disabled: false, onChanged: () => changed++, onPrint() {} };
  let tree = h.render(CreditNoteDetails, props);
  ok(text(tree).includes('#CN-2026-007'), 'Actual detail heading uses saved display number');
  ok(!hasButton(tree, 'تعديل المسودة')); ok(!hasButton(tree, 'حذف المسودة')); ok(hasButton(tree, 'نسخ كمسودة جديدة'));
  button(tree, 'سجل النشاطات').props.onClick(); tree = h.render(CreditNoteDetails, props); ok(text(tree).includes('المحاسب')); ok(text(tree).includes('مراجعة الحساب'));
  button(tree, 'الأذون المخزنية').props.onClick(); tree = h.render(CreditNoteDetails, props); ok(hasButton(tree, 'تأكيد الاستلام')); ok(hasButton(tree, 'رفض الاستلام'));
  button(tree, 'تأكيد الاستلام').props.onClick(); tree = h.render(CreditNoteDetails, props);
  const firstTransition = button(tree, 'تأكيد').props.onClick(); button(tree, 'تأكيد').props.onClick();
  eq(transitionCalls.length, 1, 'Receipt confirmation is single-flight'); pendingTransition.resolve({ ok: false, message: 'retry' }); await firstTransition; await flush();
  tree = h.render(CreditNoteDetails, props); const requestId = transitionCalls[0].input.requestId;
  pendingTransition = deferred(); const retry = button(tree, 'تأكيد').props.onClick(); pendingTransition.resolve({ ok: true, data: { ...record, stockStatus: 'received' } }); await retry; await flush();
  eq(transitionCalls[1].input.requestId, requestId, 'Retry preserves operation identity'); eq(changed, 1);
  props = { ...props, snapshot: { ...snapshot, role: 'auditor' } }; tree = h.render(CreditNoteDetails, props);
  ok(!hasButton(tree, 'تأكيد الاستلام')); ok(!hasButton(tree, 'نسخ كمسودة جديدة'));
  props = { ...props, record: draft, snapshot }; tree = h.render(CreditNoteDetails, props); ok(hasButton(tree, 'تعديل المسودة')); ok(hasButton(tree, 'حذف المسودة')); ok(hasButton(tree, 'إصدار الإشعار'));

  const rejectHooks = hooks();
  const RejectDetails = load('components/finance/finance-credit-notes.tsx', { ...shared, react: rejectHooks.api, '@/app/actions/finance-credit-notes': actions, './credit-note-editor': { CreditNoteEditor: child('CreditNoteEditor') } }).CreditNoteDetails;
  const rejectProps = { ...props, record };
  tree = rejectHooks.render(RejectDetails, rejectProps); button(tree, 'الأذون المخزنية').props.onClick(); tree = rejectHooks.render(RejectDetails, rejectProps); button(tree, 'رفض الاستلام').props.onClick(); tree = rejectHooks.render(RejectDetails, rejectProps);
  const before = transitionCalls.length; await button(tree, 'تأكيد').props.onClick(); tree = rejectHooks.render(RejectDetails, rejectProps); eq(transitionCalls.length, before, 'Reject requires reason before issuing a server action'); ok(text(tree).includes('اكتب سبب رفض الاستلام'));

  const listHooks = hooks();
  const List = load('components/finance/finance-credit-notes.tsx', { ...shared, react: listHooks.api, '@/app/actions/finance-credit-notes': actions, './credit-note-editor': { CreditNoteEditor: child('CreditNoteEditor') } }).FinanceCreditNotes;
  let listProps = { snapshot, view: 'credit-notes', noteId: null, copy: false, stale: false, pending: false, onChanged() {}, onCreateCustomer: async () => true };
  tree = listHooks.render(List, listProps); ok(text(tree).includes('جار تحميل')); await flush(); tree = listHooks.render(List, listProps);
  eq(readCalls.length, 1); eq(button(tree, 'السابق').props.disabled, true); eq(button(tree, 'التالي').props.disabled, false);
  button(tree, 'التالي').props.onClick(); tree = listHooks.render(List, listProps); await flush(); tree = listHooks.render(List, listProps); eq(readCalls.at(-1).filters.offset, 30); eq(button(tree, 'التالي').props.disabled, true);
  field(tree, 'رقم الإشعار أو اسم العميل').props.onChange({ target: { value: '  sample  ' } }); tree = listHooks.render(List, listProps); submit(tree); tree = listHooks.render(List, listProps); await flush(); tree = listHooks.render(List, listProps);
  eq(readCalls.at(-1).filters.query, 'sample'); eq(readCalls.at(-1).filters.offset, 0);
  listProps = { ...listProps, snapshot: { ...snapshot, role: 'auditor' }, view: 'credit-create' }; tree = listHooks.render(List, listProps); ok(text(tree).includes('لا تملك صلاحية')); ok(!nodes(tree).some(n => n.type?.name === 'CreditNoteEditor'));
  navigateCreditNotes('credit-create', record.id, true); eq(new URL(url, 'https://test').searchParams.get('copy'), '1');

  let saveCalls = [], saves = [], savePending = deferred(), issueCalls = [], issuePending = deferred(), cancel = 0;
  const editorActions = { saveCreditNoteAction: async (input, slug) => { saveCalls.push({ input, slug }); return savePending.promise; }, transitionCreditNoteAction: async (input, slug) => { issueCalls.push({ input, slug }); return issuePending.promise; } };
  const editorHooks = hooks();
  const Editor = load('components/finance/credit-note-editor.tsx', { ...shared, react: editorHooks.api, '@/app/actions/finance-credit-notes': editorActions }).CreditNoteEditor;
  const editorProps = { snapshot, saved: { ...draft, displayNumber: 'CN-2026-007' }, copy: true, disabled: false, onSaved: (...args) => saves.push(args), onCancel: () => cancel++, onCreateCustomer: async () => true };
  tree = editorHooks.render(Editor, editorProps);
  const sources = field(tree, 'الفاتورة الأصلية').props.children.filter(Boolean).flat();
  ok(!sources.some(n => n?.props?.value === id(9)), 'Other-customer invoices are not offered as references');
  button(tree, 'حفظ كمسودة').props.onClick(); button(tree, 'حفظ كمسودة').props.onClick(); eq(saveCalls.length, 1, 'Saving double-click posts once');
  ok(saveCalls[0].input.id !== draft.id, 'Copy creates a new identity'); eq(saveCalls[0].input.revision, 0);
  savePending.resolve({ ok: false, message: 'retry' }); await flush(); tree = editorHooks.render(Editor, editorProps);
  savePending = deferred(); button(tree, 'حفظ كمسودة').props.onClick(); eq(saveCalls[1].input.id, saveCalls[0].input.id, 'Save retries same draft identity');
  savePending.resolve({ ok: true, data: { ...draft, id: saveCalls[1].input.id } }); await flush(); tree = editorHooks.render(Editor, editorProps); eq(saves.length, 1); eq(saves[0][1], false);
  button(tree, 'حفظ وطباعة').props.onClick(); tree = editorHooks.render(Editor, editorProps); button(tree, 'تأكيد الإصدار').props.onClick(); await flush();
  eq(issueCalls.length, 1); eq(saveCalls.length, 2, 'An already saved clean draft is issued without another save');
  issuePending.resolve({ ok: true, data: { ...record, id: saveCalls[1].input.id } }); await flush(); tree = editorHooks.render(Editor, editorProps); eq(saves.at(-1)[1], true, 'Save-and-print requests PDF only after issue succeeds');
  eq(button(tree, 'حفظ كمسودة').props.disabled, true, 'Issued editor is read-only');

  const emptyHooks = hooks();
  const EmptyEditor = load('components/finance/credit-note-editor.tsx', { ...shared, react: emptyHooks.api, '@/app/actions/finance-credit-notes': editorActions }).CreditNoteEditor;
  const emptyProps = { ...editorProps, saved: undefined, copy: false };
  tree = emptyHooks.render(EmptyEditor, emptyProps); submit(tree); tree = emptyHooks.render(EmptyEditor, emptyProps); button(tree, 'تأكيد الإصدار').props.onClick(); await flush(); tree = emptyHooks.render(EmptyEditor, emptyProps);
  eq(issueCalls.length, 1, 'Incomplete credit note never issues'); ok(nodes(tree).some(n => n.props?.role === 'alert'));
  button(tree, 'رجوع').props.onClick(); tree = emptyHooks.render(EmptyEditor, emptyProps); ok(text(tree).includes('لديك تعديلات لم تُحفظ')); button(tree, 'متابعة التعديل').props.onClick(); eq(cancel, 0);

  console.log(`PASS credit notes UI: ${checks} behavioral assertions (draft/issue/receipt, permissions, canonical preview, pagination/filter, retry identity, navigation)`);
} finally { global.window = oldWindow; } })().catch(error => { console.error(error); process.exitCode = 1; });
