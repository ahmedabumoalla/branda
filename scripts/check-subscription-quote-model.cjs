const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
function load(file) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(name => name.startsWith('./') ? load(path.join(path.dirname(file), name + '.ts')) : require(name), exports);
  return exports;
}
const model = load('lib/platform/subscription-quotes.ts');
const original = load('lib/platform/subscription-invoices.ts');
let checks = 0;
const equal = (a, b) => { assert.deepEqual(a, b); checks++; };
const customer = { name: 'عميل عرض السعر', cr: '', vatNumber: '', nationalAddress: '', buildingNumber: '', additionalNumber: '', district: '', city: '', postalCode: '', country: 'المملكة العربية السعودية' };
const draft = { customer, validUntil: '2026-12-31', taxInclusive: true, scopeWork: 'تجهيز الهوية\nتنفيذ الطباعة وفق التصميم المعتمد', lines: [
  { kind: 'subscription', name: 'خدمة إدارة المحتوى', months: 18, amountCents: 11500 },
  { kind: 'item', name: 'طباعة بطاقات', quantity: 100, unitPriceCents: 230 },
] };
const id = '11111111-1111-4111-8111-111111111111';
const quote = model.previewSubscriptionQuote(draft, id, new Date('2026-11-14T12:00:00Z'));
equal(quote.documentKind, 'quote'); equal(quote.customer.street, ''); equal(quote.customer.fullAddress, '');
equal([quote.totalCents, quote.netCents, quote.taxCents], [34500, 30000, 4500]);
equal([quote.lines[0].quantity, quote.lines[0].amountCents, quote.lines[0].months], [1, 11500, 18]);
equal([quote.lines[1].quantity, quote.lines[1].amountCents, quote.lines[1].unitPriceCents], [100, 23000, 230]);
equal(quote.scopeWork, draft.scopeWork); equal(quote.convertedInvoiceId, null);
equal(model.quoteItemTotalCents(1.005, 100), 101); equal(model.quoteItemTotalCents(0.125, 100), 13);
equal(model.quoteItemTotalCents(1.004, 100), 100); equal(model.quoteItemTotalCents(0.001, 1), 0);
equal(model.quoteItemTotalCents(1000000, 9999), 9999000000);
for (const patch of [{ scopeWork: 'x'.repeat(12001) }, { lines: [] }, { lines: Array(21).fill(draft.lines[0]) }, { validUntil: '2026-02-30' }, { customer: { ...customer, vatNumber: '123' } }, { seller: {} }]) equal(model.subscriptionQuoteDraftSchema.safeParse({ ...draft, ...patch }).success, false);
for (const line of [
  { ...draft.lines[0], name: '' }, { ...draft.lines[0], months: 0 }, { ...draft.lines[0], months: 121 }, { ...draft.lines[0], months: 1.5 },
  { ...draft.lines[0], amountCents: -1 }, { ...draft.lines[0], amountCents: 0.5 }, { ...draft.lines[0], quantity: 4 },
  { ...draft.lines[1], quantity: 0 }, { ...draft.lines[1], quantity: 1.0001 }, { ...draft.lines[1], unitPriceCents: Infinity },
  { ...draft.lines[1], quantity: 1000000, unitPriceCents: 10000 }, { ...draft.lines[1], months: 12 },
]) equal(model.quoteLineSchema.safeParse(line).success, false);
const enriched = { ...customer, vatNumber: original.INVOICE_SELLER.vatNumber, cr: original.INVOICE_SELLER.cr, street: 'شارع الملك فهد', fullAddress: 'المبنى ١٢٣٤ شارع الملك فهد الرياض', nationalAddress: 'ABCD1234', buildingNumber: '1234', city: 'الرياض', postalCode: '12345' };
equal(model.convertSubscriptionQuoteSchema.safeParse({ id, requestId: id, revision: 1, customer: enriched, dueDate: '2026-12-31' }).success, true);
equal(model.convertSubscriptionQuoteSchema.safeParse({ id, requestId: id, revision: 0, customer, dueDate: '2026-12-31' }).success, false);
equal(model.saveSubscriptionQuoteSchema.safeParse({ id, requestId: id, revision: 0, draft }).success, true);
const exclusive = model.previewSubscriptionQuote({ ...draft, taxInclusive: false }, id);
equal([exclusive.netCents, exclusive.taxCents, exclusive.totalCents], [34500, 5175, 39675]);
console.log(JSON.stringify({ passed: true, checks, scope: 'Custom quote model, exact cents, optional customer identity and bounds' }));
