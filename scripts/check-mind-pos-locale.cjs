const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const filename = path.resolve('scripts/check-butcher-pos.cjs');
let harness = fs.readFileSync(filename, 'utf8').split('async function main()')[0];
harness = harness.replace("normalized: 'forbidden-phone', payload() { throw Error('Customer payload must not run for butcher'); }", "normalized: '', payload() { return {}; }");
harness = harness.replace('const { FinancePOS, PosProductImage } = load(', "Object.assign(mocks, { './finance-pos-locale': localeMock, './pos-purchase-cache': {loadPosPurchases(){}}, './finance-pos-shift-report': { FinancePosShiftReport(){} }, './finance-pos-loyalty-reader': {FinancePosLoyaltyReader(){}}, './finance-pos-points': { usePosPoints: () => ({value:0, points:0, issue:()=>'', reset(){}}), FinancePosPoints() {} }, './hospital-orders-toolbar': { HospitalOrdersToolbar() {} }, './use-finance-printer': { useFinancePrinter: () => ({}) } }); const { FinancePOS, PosProductImage } = load(");
harness = harness.replace('return FinancePOS({ initialSnapshot: data });', 'const wrapper = FinancePOS({ initialSnapshot: data }); return wrapper.props.children.type(wrapper.props.children.props);');
const extra = `
const locale = load('lib/finance/pos-locale.ts');
let currentLanguage = 'en';
const localeMock = {
 FinancePosLocaleProvider() {}, FinancePosModal: function Modal() {}, PosNumeric() {},
 useFinancePosLocale: () => ({
  language: currentLanguage, dir: currentLanguage === 'ar' ? 'rtl' : 'ltr', setLanguage: value => { currentLanguage = value; },
  t: (ar, en) => locale.financePosText(currentLanguage, ar, en),
  productName: product => locale.financePosProductName(product, currentLanguage),
  categoryName: value => locale.financePosCategoryName(value, currentLanguage),
  displayName: value => locale.financePosDisplayName(value, currentLanguage),
  money: value => String(value) + ' SAR', number: String, date: value => String(value || '')
 })
};
async function main() {
 const original = { name: 'محمد أحمد', phone: '0500000000' };
 assert.equal(locale.financePosDisplayName(original.name, 'en'), 'Mohammed Ahmed');
 assert.equal(locale.financePosDisplayName(original.name, 'ar'), original.name);
 assert.equal(original.name, 'محمد أحمد');
 assert.equal(locale.financePosProductName({ name: 'أمريكانو' }, 'en'), 'Americano');
 assert.equal(locale.financePosCategoryName('القهوة', 'en'), 'Coffee');
 assert.equal(locale.financePosText('en', 'طلب المستشفى', 'Hospital order'), 'Hospital order');
 assert.equal(locale.financePosText('ar', 'طلب المستشفى', 'Hospital order'), 'طلب المستشفى');
 assert(!/[\\u0600-\\u06ff]/.test(locale.financePosDisplayName('دكتور إبراهيم ياسر ١٢', 'en')));
 const coffee = { ...product, name: 'أمريكانو', category: 'القهوة', price: 15, butcherDetails: null };
 const data = { ...snapshot, cafe: { id: 'mind', name: 'مايند', slug: 'mind-hospital', businessCategory: 'cafes' }, products: [coffee], accounts:snapshot.accounts.filter(a=>a.id!=='occupied'), mindDrawerShifts:[{id:'shift', user_id:'user', account_id:'cash',status:'open'}], warehouses: [{ id: 'warehouse', name: 'المخزن الرئيسي', active: true }], shifts: [{ id: 'shift', user_id: 'user', status: 'open', account_id: 'cash' }] };
 const h = harness(data); let tree = h.render();
 assert.equal(tree.props.dir, 'ltr'); assert.equal(tree.props.lang, 'en');
 assert(text(tree).includes('Americano')); assert(text(tree).includes('Coffee')); assert(text(tree).includes('Cashier'));
 assert(nodes(tree).some(n => n.type?.name === 'HospitalOrdersToolbar'));
 assert(!nodes(tree).some(n => n.type?.name === 'FinancePosPager'));
 find(tree, n => n.type === 'button' && n.props?.['aria-label']?.startsWith('Add Americano')).props.onClick();
 tree = h.render(); assert(!button(tree, 'Confirm payment and issue receipt').props.disabled);
 await button(tree, 'Confirm payment and issue receipt').props.onClick();
 assert.equal(h.calls[0][0], 'sale'); assert.equal(h.calls[0][1].shiftId, 'shift'); assert.equal(h.calls[0][1].expectedTotal, 15);
 assert.equal(h.calls[0][1].lines[0].productId, coffee.id);
 const picker = find(h.render(), n => n.type === 'select' && Object.hasOwn(n.props, 'data-pos-language-toggle'));
 picker.props.onChange({target:{value:'fr'}}); tree = h.render();
 assert.equal(tree.props.lang, 'fr'); assert.equal(tree.props.dir, 'ltr'); assert(text(tree).includes('Caisse'));
 assert.equal(locale.financePosText('fr', 'إقفال الوردية وطباعة التقرير', 'Close shift and print report'), 'Clôturer la session et imprimer le rapport');
 picker.props.onChange({target:{value:'ar'}});
 tree = h.render(); assert.equal(tree.props.dir, 'rtl'); assert(text(tree).includes('أمريكانو')); assert(text(tree).includes('الكاشير المالي'));
 currentLanguage = 'en';
 const realLocale = load('components/finance/finance-pos-locale.tsx', { '@/components/dashboard/ui/modal': { Modal() {} } });
 const receiptModule = load('components/finance/finance-pos-receipt.tsx', { './finance-pos-locale': realLocale, './finance-ui': { documentKindNames: {} } });
 const receiptDoc = { id: 'invoice', kind: 'sale', party_id: 'doctor', account_id: 'cash', number: 1, created_at: '2026-11-14T12:00:00Z', total: 15, subtotal: 15, discount: 0, tax: 0, paid: 15, outstanding: 0, lines: [{ id: 'line', name: coffee.name, quantity: 1, unit_price: 15, net: 15, tax: 0 }] };
 const props = { document:receiptDoc, snapshot:{ ...data, parties:[{id:'doctor',name:original.name}], documents:[] } };
 const receiptTree = receiptModule.FinanceReceipt(props);
 assert.equal(receiptTree.type,realLocale.FinancePosLocaleProvider);
 assert.equal(receiptTree.props.enabled,false);
 const markup = require('react-dom/server').renderToStaticMarkup(receiptTree);
 assert(markup.includes('lang="ar"') && markup.includes('dir="rtl"'));
 assert(markup.includes(original.name) && markup.includes(coffee.name));
 assert(!markup.includes('Americano') && !markup.includes('Mohammed Ahmed'));
 assert.notEqual(receiptModule.FinanceReceipt({...props,copy:'preparation'}).type,realLocale.FinancePosLocaleProvider);
 const previous = { window: global.window, localStorage: global.localStorage };
 const storage = new Map(), events = new EventTarget(); let blocked = false, cleanup;
 global.window = events; global.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { if (blocked) throw Error('Storage blocked'); storage.set(key, value); } };
 try {
  const hooks = { ...React, useCallback: fn => fn, useSyncExternalStore: (subscribe, read, server) => { assert.equal(server(), 'ar'); cleanup ??= subscribe(() => {}); return read(); } };
  const makeProvider = () => load('components/finance/finance-pos-locale.tsx', { react: hooks, '@/components/dashboard/ui/modal': { Modal() {} } });
  let provider = makeProvider(); const renderProvider = (enabled = true) => provider.FinancePosLocaleProvider({ children: null, enabled }).props.value;
  assert.equal(renderProvider().language, 'ar'); renderProvider().setLanguage('en');
  assert.equal(renderProvider().language, 'en'); assert.equal(renderProvider(false).language, 'ar');
  provider = makeProvider(); assert.equal(renderProvider().language, 'en');
  renderProvider().setLanguage('fr'); assert.equal(provider.FinancePosLocaleProvider({children:null,allowFrench:true}).props.value.language,'fr');
  assert.equal(renderProvider().language,'ar');
  storage.set(locale.FINANCE_POS_LANGUAGE_KEY, 'ar'); events.dispatchEvent(new Event('storage')); assert.equal(renderProvider().language, 'ar');
  blocked = true; renderProvider().setLanguage('en'); assert.equal(renderProvider().language, 'en'); assert.equal(storage.get(locale.FINANCE_POS_LANGUAGE_KEY), 'ar');
 } finally { cleanup?.(); global.window = previous.window; global.localStorage = previous.localStorage; }
 console.log('PASS MIND locale: Arabic/English switch, direction, catalog/search labels, doctor-name display, hospital-only toolbar, unchanged sale payload, localized receipt, persistence/storage failure and non-MIND isolation');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
`;
const moduleInstance = new Module(filename, module);
moduleInstance.filename = filename;
moduleInstance.paths = Module._nodeModulePaths(path.dirname(filename));
moduleInstance._compile(harness + extra, filename);
