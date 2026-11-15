const fs = require('node:fs'), assert = require('node:assert/strict'), crypto = require('node:crypto'), ts = require('typescript'), React = require('react');
let count = 0;
const check = (value, label) => { assert(value, label); count++; }, equal = (a, b, label) => { assert.deepEqual(a, b, label); count++; };
function load(file, mocks = {}) {
  const out = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(name => name in mocks ? mocks[name] : require(name), out);
  return out;
}
const invoiceModel = load('lib/platform/subscription-invoices.ts');
const quoteModel = load('lib/platform/subscription-quotes.ts', { './subscription-invoices': invoiceModel });
const scopeModel = load('lib/platform/subscription-scope.ts');
function nodes(value) {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  return [value, ...nodes(value.props.children)];
}
function text(value) {
  if (Array.isArray(value)) return value.map(text).join(' ');
  if (value == null || typeof value === 'boolean') return '';
  if (typeof value !== 'object') return String(value);
  return 'props' in value ? text(value.props.children) : '';
}
const css = new Proxy({}, { get: (_, key) => key === '__esModule' ? false : String(key) });
function hooks() {
  const states = [], refs = []; let si = 0, ri = 0;
  return { reset() { si = 0; ri = 0; }, refs, api: { ...React,
    useState(initial) { const i = si++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useRef(initial) { const i = ri++; if (!(i in refs)) refs[i] = { current: initial }; return refs[i]; }, useEffect() {},
  } };
}
const calls = { saves: [], conversions: [], previews: [] };
let failSave = true, failConvert = true, loadedQuote, invoiceNotices = 0;
const actions = {
  fetchSubscriptionQuotesAction: async () => ({ ok: true, data: { rows: [], total: 0, page: 0, search: '' } }),
  getSubscriptionQuoteAction: async () => ({ ok: true, data: loadedQuote }),
  saveSubscriptionQuoteAction: async input => { calls.saves.push(structuredClone(input)); if (failSave) return { ok: false, message: 'تعذر تأكيد الحفظ' }; loadedQuote = { ...quoteModel.previewSubscriptionQuote(input.draft, input.id), revision: input.revision + 1, number: 'QT-TEST-1' }; return { ok: true, data: loadedQuote }; },
  previewSubscriptionQuoteAction: async input => { calls.previews.push(input); return { ok: true, data: { pdf: Buffer.from('%PDF-test').toString('base64') } }; },
  convertSubscriptionQuoteAction: async input => { calls.conversions.push(structuredClone(input)); if (failConvert) return { ok: false, message: 'تعذر تأكيد التحويل' }; return { ok: true, data: { ...loadedQuote, id: crypto.randomUUID(), number: 'INV-TEST-1', customer: input.customer } }; },
};
const h = hooks();
const panel = load('components/admin/pages/subscription-quotes-panel.tsx', {
  react: h.api, '@/components/admin/brand-details-dialog': { BrandDialog: 'Dialog' }, '@/app/actions/subscription-quotes': actions,
  '@/lib/platform/subscription-invoices': invoiceModel, '@/lib/platform/subscription-quotes': quoteModel,
  '@/lib/platform/subscription-scope': scopeModel,
  './subscription-invoices-page.module.css': css, './subscription-quotes-panel.module.css': css,
});
let tree;
function render() { h.reset(); tree = panel.SubscriptionQuotesPanel({ active: true, onInvoiceCreated() { invoiceNotices++; } }); h.refs[0].current = { reportValidity: () => true, scrollIntoView() {} }; return tree; }
const by = (key, value) => nodes(tree).find(n => n.props[key] === value);
const button = label => nodes(tree).find(n => n.type === 'button' && text(n).trim() === label);
const change = (key, value, next) => { const control = by(key, value); assert(control, `Missing ${key} ${value}`); control.props.onChange({ target: { value: next } }); render(); };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function submitMain() { nodes(tree).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await tick(); render(); }

(async () => {
  render();
  check(tree.props.className === 'page' && tree.props.dir === 'rtl', 'quote reuses original RTL page and tokens');
  check(by('id', 'quote-scope').props.maxLength === 12000, 'scope is a bounded independent-page text field');
  const originalScope = fs.readFileSync('output/subscription-scope-20261114/original.txt', 'utf8').trim();
  change('id', 'quote-scope', originalScope);
  const scopePreview = by('aria-label', 'معاينة نطاق العمل');
  equal(nodes(scopePreview).filter(n => n.type === 'p').length, 6, 'six author paragraphs remain separate in live preview');
  equal(nodes(scopePreview).filter(n => n.type === 'strong').length, 6, 'six original titles rendered as bold text');
  equal(nodes(scopePreview).filter(n => n.type === 'bdi').map(n => n.props.children.join('')), ['1.', '2.', '3.', '4.', '5.', '6.'], 'ordered markers remain explicit and bidi isolated');
  check(!text(scopePreview).includes('**'), 'paired emphasis markers hidden in formatted preview');
  equal(by('id', 'quote-scope').props.value, originalScope, 'formatting does not mutate original author content');
  check(text(tree).includes('صفحة مستقلة') && text(tree).includes('ليس فاتورة ضريبية'), 'scope separation and quote identity explained');
  check(!nodes(tree).some(n => n.type === 'select' && text(n).includes('برندة')), 'quote custom names do not require a catalog plan');
  change('id', 'quote-customer', 'عميل تجريبي');
  change('aria-label', 'اسم البند 1', 'إدارة المنصة');
  change('aria-label', 'مدة البند 1 بالأشهر', '12');
  change('aria-label', 'سعر البند 1', '115.00');
  button('إضافة بند').props.onClick(); render();
  change('aria-label', 'نوع البند 2', 'item');
  change('aria-label', 'اسم البند 2', 'طباعة');
  change('aria-label', 'كمية البند 2', '3');
  change('aria-label', 'سعر البند 2', '10');
  change('id', 'quote-scope', 'التصميم والطباعة\nالتسليم وفق الاتفاق');
  check(text(nodes(tree).find(n => n.type === 'aside')).includes('145.00'), 'subscription amount is full duration and item quantity multiplies unit price');
  equal(nodes(tree).filter(n => n.props['aria-label']?.startsWith('حذف البند')).length, 2, 'mixed custom line types remain independent');
  await submitMain();
  equal(calls.saves.length, 1, 'save submitted once');
  equal(calls.saves[0].draft.lines, [{ kind: 'subscription', name: 'إدارة المنصة', months: 12, amountCents: 11500 }, { kind: 'item', name: 'طباعة', quantity: 3, unitPriceCents: 1000 }], 'exact typed mixed-line payload');
  equal(calls.saves[0].draft.scopeWork, 'التصميم والطباعة\nالتسليم وفق الاتفاق', 'scope text retained');
  check(text(tree).includes('تعذر تأكيد الحفظ'), 'uncertain save does not claim success');
  failSave = false; await submitMain();
  equal(calls.saves[0], calls.saves[1], 'retry retains quote id request id revision and payload');
  check(button('حفظ التعديلات').props.disabled, 'unchanged saved quote does not create another revision');
  check(!button('تحويل إلى فاتورة ضريبية').props.disabled, 'saved unchanged quote can convert');
  change('aria-label', 'سعر البند 2', '12');
  check(button('تحويل إلى فاتورة ضريبية').props.disabled, 'unsaved commercial changes cannot convert stale quote');
  await submitMain();
  equal(calls.saves[2].revision, 1, 'saved quote edit carries expected revision');
  check(calls.saves[2].requestId !== calls.saves[1].requestId, 'new payload gets a new mutation id');
  button('تحويل إلى فاتورة ضريبية').props.onClick(); render();
  const conversionDialog = nodes(tree).find(n => n.type === 'Dialog' && n.props.title.includes('تحويل'));
  const conversionForm = nodes(conversionDialog).find(n => n.type === 'form');
  check(conversionForm.props.className.includes('page') && conversionForm.props.className.includes('conversion'), 'conversion dialog retains original field colors and font tokens');
  const customerFields = nodes(conversionDialog).find(n => typeof n.type === 'function' && n.props.prefix === 'quote-convert-customer');
  customerFields.props.onChange({ ...customerFields.props.customer, vatNumber: '312345678901233', cr: '1234567890', street: 'شارع الاختبار', fullAddress: 'العنوان الوطني الكامل', nationalAddress: 'TEST1234' }); render();
  const convertSubmit = () => nodes(tree).find(n => n.type === 'Dialog' && n.props.title.includes('تحويل')).props.children.props.onSubmit({ preventDefault() {} });
  convertSubmit(); await tick(); render();
  equal(calls.conversions.length, 1, 'conversion submitted once');
  equal(calls.conversions[0].customer.fullAddress, 'العنوان الوطني الكامل', 'optional customer address completed after saved quote');
  equal(calls.conversions[0].customer.nationalAddress, 'TEST1234', 'short address preserved separately');
  equal(calls.conversions[0].revision, 2, 'conversion uses current saved revision');
  failConvert = false; convertSubmit(); await tick(); render();
  equal(calls.conversions[0], calls.conversions[1], 'conversion retry retains exact request to prevent duplicate invoice');
  equal(invoiceNotices, 1, 'successful conversion refreshes invoice history once');
  check(!button('تحويل إلى فاتورة ضريبية'), 'converted quote cannot be converted again');
  check(nodes(tree).filter(n => n.type === 'fieldset').every(n => n.props.disabled), 'converted quote is read-only');
  check(nodes(tree).some(n => n.type === 'a' && n.props.href.startsWith('/api/admin/subscription-invoices/')), 'converted invoice uses original protected PDF endpoint');

  const wrapperHooks = hooks();
  const wrapper = load('components/admin/pages/subscription-invoices-page.tsx', {
    react: wrapperHooks.api, '@/components/admin/brand-details-dialog': { BrandDialog: 'Dialog' }, '@/app/actions/subscription-invoices': {},
    '@/lib/platform/subscription-invoices': invoiceModel, './subscription-invoices-page.module.css': css, './subscription-quotes-panel.module.css': css,
    './subscription-quotes-panel': { SubscriptionQuotesPanel: 'QuotesPanel' },
  });
  const wrap = () => { wrapperHooks.reset(); return wrapper.SubscriptionInvoicesPage({ plans: [], initialInvoices: { rows: [], total: 0, page: 0, search: '' } }); };
  let wrapped = wrap(), panels = nodes(wrapped).filter(n => n.type === 'div' && typeof n.props.hidden === 'boolean');
  equal(panels.map(n => n.props.hidden), [false, true], 'legacy invoices remain default');
  nodes(wrapped).find(n => n.type === 'button' && text(n).trim() === 'عروض الأسعار').props.onClick(); wrapped = wrap();
  panels = nodes(wrapped).filter(n => n.type === 'div' && typeof n.props.hidden === 'boolean');
  equal(panels.map(n => n.props.hidden), [true, false], 'tabs change visibility without unmounting invoice editor');
  nodes(wrapped).find(n => n.type === 'QuotesPanel').props.onInvoiceCreated(); wrapped = wrap();
  equal(nodes(wrapped).find(n => typeof n.type === 'function').props.refresh, 1, 'conversion marks invoice list for refresh');
  const paths = ['components/admin/pages/subscription-quotes-panel.tsx', 'components/admin/pages/subscription-quotes-panel.module.css', 'components/admin/pages/subscription-invoices-page.tsx', 'components/admin/pages/subscription-invoices-page.module.css', 'lib/platform/subscription-quotes.ts', 'lib/platform/subscription-invoices.ts', 'lib/platform/subscription-scope.ts', 'output/subscription-scope-20261114/original.txt', 'scripts/check-subscription-quotes-ui.cjs', 'package-lock.json'];
  fs.mkdirSync('output/subscription-quotes-20261114', { recursive: true });
  fs.writeFileSync('output/subscription-quotes-20261114/ui-verification.json', JSON.stringify({ at: new Date().toISOString(), runtime: process.version, passed: true, checks: count, limits: ['React hooks and server actions mocked', 'Actual quote money/schema helpers', 'No browser, database writes or messages'], inputs: Object.fromEntries(paths.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])) }, null, 2));
  console.log(JSON.stringify({ passed: true, checks: count }));
})().catch(error => { console.error(error); process.exitCode = 1; });
