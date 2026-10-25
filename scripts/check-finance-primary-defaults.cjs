const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');

function load(file, mocks = {}) {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', compiled)(name => {
    if (name in mocks) return mocks[name];
    if (name === './use-pos-finance') return { usePosFinance: (...args) => ({ ...mocks['./use-finance'].useFinance(...args), offline: { sales: [], ready: true, online: true, logout: async () => {} } }) };
    if (name === './use-finance-printer') return { useFinancePrinter: () => ({ ready: true, autoEnabled: true, handler: () => async () => {} }) };
    if (name === '@/app/actions/finance-pos-customer') return {};
    if (name === './finance-printer-settings') return { FinancePrinterSettings() {} };
    if (name.startsWith('@/app/actions/')) return new Proxy({}, { get: (_, key) => () => { throw Error('Unmocked action: '+name+':'+String(key)); } });
    if (name === 'server-only') return {};
    if (name.endsWith('.css')) return new Proxy({}, { get: (_, key) => key });
    if (name.startsWith('@/') || name.startsWith('./')) {
      const base = name.startsWith('@/') ? name.slice(2) : require('node:path').join(require('node:path').dirname(file), name);
      return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '.tsx', mocks);
    }
    return require(name);
  }, exports);
  return exports;
}
function hooks() {
  let slots = [], cursor = 0;
  return {
    api: { ...React, useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; }, useRef(initial) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); }, useEffect() { cursor++; }, useMemo(fn) { cursor++; return fn(); } },
    render(fn, props) { cursor = 0; return fn(props); },
  };
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.footer)]; }
function text(tree) { if (Array.isArray(tree)) return tree.map(text).join(''); if (tree && typeof tree === 'object') return text(tree.props?.children); return tree == null || typeof tree === 'boolean' ? '' : String(tree); }
const find = (tree, predicate) => { const result = nodes(tree).find(predicate); assert.ok(result, 'Expected UI control'); return result; };
const button = (tree, label) => find(tree, node => node.type === 'button' && text(node) === label);
const field = (tree, label) => find(tree, node => node.type?.name === 'Field' && node.props.label === label).props.children;
const base = {
  cafe: { id: 'cafe', name: 'Test Brand', slug: 'test-brand' }, userId: 'owner', canManage: true, canAdminister: true, role: 'owner',
  settings: { vat_rate: 15, tax_inclusive: true, currency: 'SAR', closed_through: null },
  products: [{ id: 'product', name: 'قهوة', price: 23, imageUrl: '/api/finance/test-brand/media?path=tenant/coffee.webp', category: 'مشروبات', available: true, stockTracked: true, itemId: 'item', quantity: 5 }],
  items: [{ id: 'item', name: 'قهوة', sku: 'COFFEE', unit: 'قطعة', menu_product_id: 'product', min_quantity: 1, active: true, quantity: 5, average_cost: 3 }],
  warehouses: [{ id: 'warehouse', name: 'الرئيسي', active: true }], stock: [{ item_id: 'item', warehouse_id: 'warehouse', quantity: 5, average_cost: 3 }],
  accounts: [{ id: 'cash', kind: 'cash', name: 'صندوق', code: '100', balance: 100, active: true }, { id: 'card', kind: 'pos', name: 'الشبكة', code: '110', balance: 0, active: true }, { id: 'bank', kind: 'bank', name: 'البنك', code: '120', balance: 0, active: true }, { id: 'inventory', kind: 'inventory', name: 'المخزون', code: '130', balance: 0, active: true }],
  parties: [{ id: 'customer', name: 'عميل', kind: 'customer', phone: '', email: '', tax_number: '', balance: 0, active: true }],
  shifts: [{ id: 'shift', user_id: 'owner', account_id: 'cash', status: 'open', opening_cash: 100, expected_cash: 100, counted_cash: null, variance: null, opened_at: '2026-10-23T12:00:00Z', closed_at: null, handover_to: null, note: '' }],
  staff: [{ user_id: 'cashier', name: 'موظف', role: 'cashier', active: true }], documents: [], journal: [], movements: [], trialBalance: [], summary: { sales: 0, purchases: 0, expenses: 0, profit: 0, receivables: 0, payables: 0, inventoryValue: 15 }, truncated: false,
};
const ImageMock = function Image() {};
let loginLocale = 'ar';
const { cashierText, cashierError } = load('lib/cashier/language.ts');
const languageMock = { CashierLanguageSwitch: function CashierLanguageSwitch() {}, useCashierLanguage: () => ({locale: loginLocale, dir: loginLocale === 'ar' ? 'rtl' : 'ltr', t: message => cashierText(loginLocale, message), errorText: message => cashierError(loginLocale, message)}) };
const shared = { 'next/link': { __esModule: true, default: function Link() {} }, 'next/image': { __esModule: true, default: ImageMock }, 'next/navigation': { useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace() {} }) }, '@/app/actions/finance-access': { createFinanceStaffAccountAction: async () => ({ ok: true }), logoutFinanceAction: async () => {} } };


const finance = load('lib/finance/brand-finance.ts');
const accounts = [...base.accounts, ...['cash','bank','pos'].map(kind=>({id:kind+'-primary',kind,name:kind,code:'',active:true,balance:0,is_primary:true}))];
for(const kind of ['cash','bank','pos']) assert.equal(finance.getPrimaryFinanceAccount(accounts,kind).id,kind+'-primary');
assert.equal(finance.getPrimaryFinanceAccount(accounts.filter(a=>a.id==='cash')).id,'cash');
assert.equal(finance.getPrimaryFinanceAccount(accounts.map(a=>({...a,active:false}))),undefined);
const data={...base,accounts};
const uiMock={Field:function Field(){},Numeric:function Numeric(){},Empty:function Empty(){},financeDate:x=>x,accountKindNames:{cash:'cash',bank:'bank',pos:'pos'}};
const common={...shared,'./finance-ui':uiMock,'./finance-operation-form':{FinanceOperationForm:function FinanceOperationForm(){}},'./finance-shift-details':{},'./finance-refund-requests':{},'./finance-receipt-dialog':{},'./finance-customer-form':{}};
const state=hooks();
const POS=load('components/finance/finance-pos.tsx',{...common,react:state.api,'./use-finance':{useFinance:()=>({snapshot:data,pending:false,stale:false,clearFeedback(){}})}}).FinancePOS;
const render=()=>state.render(POS,{initialSnapshot:data});let tree=render();
const payment=t=>nodes(t).find(n=>n.type==='select'&&nodes(n).some(o=>o.type==='option'&&o.props.value==='credit'));
const account=t=>find(t,n=>n.type?.name==='Field'&&n.props.label==='حساب التحصيل').props.children;
assert.equal(account(tree).props.value,'cash','Active shift drawer wins over primary cash');
button(tree,'تحويل بنكي').props.onClick();tree=render();assert.equal(account(tree).props.value,'bank-primary');
account(tree).props.onChange({target:{value:'bank'}});tree=render();assert.equal(account(tree).props.value,'bank','Explicit selection preserved');
button(tree,'شبكة').props.onClick();tree=render();assert.equal(account(tree).props.value,'pos-primary');
const saleState=hooks();const Sale=load('components/finance/finance-sale-form.tsx',{...common,react:saleState.api}).FinanceSaleForm;
const saleRender=()=>saleState.render(Sale,{snapshot:data,pending:false,stale:false,error:'',onCancel(){},onSubmit:async()=>false});
tree=saleRender();assert.equal(account(tree).props.value,'cash');payment(tree).props.onChange({target:{value:'bank'}});tree=saleRender();assert.equal(account(tree).props.value,'bank-primary');account(tree).props.onChange({target:{value:'bank'}});tree=saleRender();assert.equal(account(tree).props.value,'bank');
// Shift custody now delegates to the dedicated cashier drawer flow, covered by
// check-finance-cash-handovers-ui.cjs rather than the old primary-cash selector.
const opState=hooks();const Operation=load('components/finance/finance-operation-form.tsx',{...common,react:opState.api}).FinanceOperationForm;
const props={form:{operation:'shift_open'},snapshot:data,pending:false,error:'',onCancel(){},onSubmit:async()=>false};
tree=opState.render(Operation,props);
assert.equal(tree.type.name,'FinanceCashHandoverForm');
assert.equal(tree.props.snapshot,data);
assert.equal(tree.props.form.operation,'shift_open');
console.log('PASS primary defaults: category selection, inactive exclusion, shift preservation, explicit choices, POS/invoice fallback and dedicated drawer delegation');
