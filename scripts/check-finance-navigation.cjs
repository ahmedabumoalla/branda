const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');

// Exercise component output and event handlers without a browser or a live account.
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
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
let instance = 0;
function hooks() {
  const slots = [], prefix = `test-${++instance}`;
  let cursor = 0;
  return {
    api: {
      ...React,
      useState(initial) {
        const i = cursor++;
        if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
        return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
      },
      useId() { return `${prefix}-${cursor++}`; },
      useRef(initial) { const i=cursor++; if(!(i in slots))slots[i]={current:initial}; return slots[i]; },
    },
    render(Component, props) { cursor = 0; return Component(props); },
  };
}
function nodes(tree, visibleOnly = false) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(node => nodes(node, visibleOnly));
  if (visibleOnly && tree.props?.hidden) return [];
  return [tree, ...nodes(tree.props?.children, visibleOnly)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree && typeof tree === 'object') return text(tree.props?.children);
  return tree == null || typeof tree === 'boolean' ? '' : String(tree);
}
const find = (tree, predicate) => {
  const node = nodes(tree).find(predicate);
  assert.ok(node, 'Expected rendered control');
  return node;
};
const button = (tree, label) => find(tree, node => node.type === 'button' && (text(node) === label || node.props['aria-label'] === label));
const link = (tree, label) => find(tree, node => node.props?.href && text(node) === label);
const controlled = (tree, control) => find(tree, node => node.props?.id === control.props['aria-controls']);
const Link = function Link() {};
let currentUrl = new URL('https://example.test/dashboard/finance');
const pushes = [];
const assignments = [];
const oldWindow = global.window;
global.window = { location:{assign(href){assignments.push(href)}}, history: { pushState(_state, _unused, href) { pushes.push(href); currentUrl = new URL(href, currentUrl); }, replaceState(_state, _unused, href) { currentUrl = new URL(href, currentUrl); } } };
const navigation = { usePathname: () => currentUrl.pathname, useSearchParams: () => currentUrl.searchParams };
let assertions = 0;
function check(condition, message) { assert.ok(condition, message); assertions++; }
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); assertions++; }

(async()=>{try {
  const h = hooks();
  let expanded = 0, navigated = 0;
  const props = { slug: 'test-brand', collapsed: false, onExpand: () => expanded++, onNavigate: () => navigated++ };
  const { FinanceSidebarMenu } = load('components/dashboard/finance-sidebar-menu.tsx', {
    react: h.api, 'next/navigation': navigation, './dashboard-navigation-link': { DashboardNavigationLink: Link },
  });
  const render = () => h.render(FinanceSidebarMenu, props);
  let tree = render();
  equal(nodes(tree, true).filter(node => node.props?.href)[0].props.href, '/dashboard/finance?section=overview', 'Overview is first');
  equal(nodes(tree, true).filter(node => node.props?.['aria-current'] === 'page').map(text), ['نظرة عامة']);
  equal(button(tree, 'المبيعات').props['aria-expanded'], false);
  button(tree, 'المبيعات').props.onClick();
  tree = render();
  equal(button(tree, 'المبيعات').props['aria-expanded'], true);
  equal(controlled(tree, button(tree, 'المبيعات')).props.hidden, false);
  const salesPanel = controlled(tree, button(tree, 'المبيعات'));
  equal(salesPanel.props.children[0].map(node => text(node).replace('غير مفعّل','')), ['إدارة الفواتير','إنشاء فاتورة','إدارة عروض الأسعار','إنشاء عرض سعر','إشعارات دائنة','الفواتير المرتجعة','الفواتير الدورية','مدفوعات العملاء','إعدادات المبيعات']);
  const unavailable = nodes(salesPanel).filter(node => node.props?.['aria-disabled']);
  equal(unavailable.length, 2);
  check(unavailable.every(node => !node.props.href && !node.props.onClick && node.type !== 'a'), 'Unavailable entries cannot navigate or mutate');
  for (const [label, view] of [['إدارة عروض الأسعار','quotes'],['إنشاء عرض سعر','quote-create'],['إنشاء فاتورة','create'],['الفواتير المرتجعة','returns'],['مدفوعات العملاء','payments'],['إعدادات المبيعات','sales-settings']]) {
    equal(new URL(link(tree,label).props.href,currentUrl).searchParams.get('view'),view);
  }
  button(tree, 'المبيعات').props.onClick();
  equal(controlled(render(), button(render(), 'المبيعات')).props.hidden, true);

  currentUrl = new URL('https://example.test/dashboard/finance?section=parties&party=customer');
  tree = render();
  equal(button(tree, 'الإعدادات والفريق').props['aria-expanded'], true, 'A direct customer URL reveals the correct branch');
  equal(nodes(tree, true).filter(node => node.props?.['aria-current'] === 'page').map(text), ['بيانات العملاء وأرصدتهم']);
  const customerUrl = currentUrl.href;
  currentUrl = new URL('https://example.test/dashboard/finance?section=parties&party=supplier');
  equal(button(render(), 'المشتريات والموردون').props['aria-expanded'], true);
  equal(nodes(render(), true).filter(node => node.props?.['aria-current'] === 'page').map(text), ['بيانات الموردين وأرصدتهم']);
  currentUrl = new URL(customerUrl);
  equal(button(render(), 'الإعدادات والفريق').props['aria-expanded'], true, 'Back navigation reveals the old selection');
  button(render(), 'الإعدادات والفريق').props.onClick();
  equal(button(render(), 'الإعدادات والفريق').props['aria-expanded'], false, 'An active branch remains collapsible');

  const event = (extras = {}) => ({ button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, prevented: false, preventDefault() { this.prevented = true; }, ...extras });
  let e = event();
  link(render(), 'فواتير المشتريات').props.onClick(e);
  equal(e.prevented, true);
  equal(currentUrl.searchParams.get('section'), 'purchases');
  equal(navigated, 1, 'Mobile navigation callback still fires');
  const count = pushes.length;
  for (const extras of [{ctrlKey:true}, {metaKey:true}, {shiftKey:true}, {altKey:true}, {button:1}]) {
    e = event(extras); link(render(), 'نظرة عامة').props.onClick(e); equal(e.prevented, false);
  }
  equal(pushes.length, count, 'Modified links use normal browser navigation');

  currentUrl = new URL('https://example.test/dashboard/finance/ledger?document=fixture');
  tree = render();
  equal(button(tree, 'الحسابات والخزينة').props['aria-expanded'], true);
  equal(nodes(tree, true).filter(node => node.props?.['aria-current'] === 'page').map(text), ['الدفاتر والتقارير']);
  e = event(); link(tree, 'نظرة عامة').props.onClick(e); equal(e.prevented, false, 'Ledger must navigate through the router to the workspace');
  props.collapsed = true;
  equal(button(render(), 'برندة المالية').props['aria-expanded'], false);
  button(render(), 'برندة المالية').props.onClick();
  equal(expanded, 1);
  props.collapsed = false;
  equal(button(render(), 'برندة المالية').props['aria-expanded'], true);
  button(render(), 'برندة المالية').props.onClick();
  equal(controlled(render(), button(render(), 'برندة المالية')).props.hidden, true);

  const otherHooks = hooks();
  const OtherMenu = load('components/dashboard/finance-sidebar-menu.tsx', { react: otherHooks.api, 'next/navigation': navigation, './dashboard-navigation-link': { DashboardNavigationLink: Link } }).FinanceSidebarMenu;
  const otherTree = otherHooks.render(OtherMenu, props);
  const ids = nodes(render()).filter(node => node.props?.id).map(node => node.props.id);
  const otherIds = nodes(otherTree).filter(node => node.props?.id).map(node => node.props.id);
  equal(ids.filter(id => otherIds.includes(id)), [], 'Desktop and mobile control IDs do not collide');
  for (const control of nodes(otherTree).filter(node => node.props?.['aria-controls'])) {
    check(!!controlled(otherTree, control), 'Every disclosure references a panel');
    check(control.props.className.includes('focus-visible:'), 'Disclosure has visible keyboard focus');
    check(control.props.className.includes('min-h-11'), 'Disclosure retains a 44px minimum target');
  }
  const reachable = new Set(nodes(otherTree).filter(node => node.props?.href?.startsWith('/dashboard/finance?')).map(node => new URL(node.props.href, currentUrl).searchParams.get('section')));
  equal([...reachable].sort(), ['overview','sales','purchases','parties','inventory','treasury','cashiers','shifts','reports','printer','settings'].sort(), 'All established sections remain reachable');
  equal(link(otherTree, 'فتح كاشير المالية').props.href, '/finance/test-brand/pos');

  const workspaceHooks = hooks();
  const componentCache = {};
  const children = new Proxy({}, { get: (_, name) => componentCache[name] ??= Object.defineProperty(function Child() {}, 'name', { value: name }) });
  const fixture = {
    cafe: { id: 'fixture-brand', name: 'Fixture', slug: 'test-brand' }, userId: 'owner', role: 'owner', canManage: true, canAdminister: true,
    settings: { vat_rate: 15, tax_inclusive: true, currency: 'SAR', closed_through: null },
    accounts: [], products: [], items: [], warehouses: [], stock: [], documents: [], journal: [], movements: [], trialBalance: [], shifts: [], staff: [],
    parties: [
      { id:'customer', name:'Fixture Customer', kind:'customer', phone:'', email:'', balance:0, active:true },
      { id:'supplier', name:'Fixture Supplier', kind:'supplier', phone:'', email:'', balance:0, active:true },
      { id:'employee', name:'Fixture Employee', kind:'employee', phone:'', email:'', balance:0, active:true },
    ],
    summary: { sales:0, purchases:0, expenses:0, profit:0, receivables:0, payables:0, inventoryValue:0 },
  };
  const state = { snapshot: fixture, pending:false, stale:false, error:'', message:'', historyMore:{movements:true}, refresh(){}, clearFeedback(){}, execute(){ throw Error('No mutation is expected'); } };
  const mocks = { react:workspaceHooks.api, 'next/navigation':navigation, 'next/link':{__esModule:true,default:Link}, './use-finance':{useFinance:()=>state}, '@/lib/finance/ledger':{ledgerPilotEnabled:()=>false} };
  const sourceReads=[],sourceCopies=[];
  let sourceDetail={document:{id:'source-invoice',number:50,kind:'sale',party_id:'customer',warehouse_id:'warehouse',subtotal:100,discount:0,tax:15,total:115,outstanding:75,paid:40,refunded:false,note:'Source note',vat_rate:15,tax_inclusive:false,lines:[{id:'source-line',product_id:'product',quantity:1,unit_price:100,net:100,tax:15}]},invoice:null,paymentCollectors:[],payments:[{id:'source-payment',invoiceId:'source-invoice',amount:40,accountId:'bank',details:'Actual payment note',canDelete:true}]};
  mocks['@/app/actions/finance-invoice-management']={async readInvoiceDetailAction(id,slug){sourceReads.push({id,slug});return{ok:true,data:sourceDetail}}};
  mocks['@/app/actions/finance-invoice-drafts']={async saveInvoiceDraftAction(input,slug){sourceCopies.push({input,slug});return{ok:true,data:{id:input.id,revision:1}}}};
  mocks['./finance-payment-editor']=children;
  mocks['./finance-invoice-detail'] = children;
  mocks['./finance-customer-detail'] = children;
  mocks['./finance-journal-detail'] = children;
  mocks['./finance-invoice-settings'] = children;
  for (const name of ['./finance-shift-monitor','./finance-cashier-management','./finance-printer-settings','@/components/dashboard/ui/modal','./finance-sale-form','./finance-quotes','./finance-invoices','./finance-customer-form','./finance-operation-form','./finance-refund-requests','./finance-receipt-dialog','./finance-treasury','./finance-trial-balance','./finance-cash-differences','./finance-cash-handovers','./finance-inventory-report','./finance-control-panel']) mocks[name] = children;
  mocks['./finance-ui'] = { Panel:children.Panel, Empty:children.Empty, Metric:children.Metric, Numeric:children.Numeric, documentKindNames:{}, financeDate:value=>value, financeDocumentStatus:()=>'', downloadFinanceCsv(){} };
  const { FinanceWorkspace } = load('components/finance/finance-workspace.tsx', mocks);
  const workspace = (slug) => workspaceHooks.render(FinanceWorkspace, { initialSnapshot:fixture, slug });
  const partyNames = tree => nodes(tree).filter(node => ['strong','button'].includes(node.type) && text(node).startsWith('Fixture ')).map(text);
  currentUrl = new URL('https://example.test/dashboard/finance?section=parties&party=customer');
  equal(partyNames(workspace()), ['Fixture Customer']);
  currentUrl = new URL('https://example.test/dashboard/finance?section=parties&party=supplier');
  equal(partyNames(workspace()), ['Fixture Supplier']);
  button(workspace(), 'العملاء').props.onClick();
  equal(currentUrl.searchParams.get('party'), 'customer');
  equal(partyNames(workspace()), ['Fixture Customer']);
  button(workspace(), 'الكل').props.onClick();
  equal(currentUrl.searchParams.get('party'), null);
  equal(partyNames(workspace()), ['Fixture Customer','Fixture Supplier','Fixture Employee']);
  currentUrl.searchParams.set('party', 'unknown');
  equal(partyNames(workspace()), ['Fixture Customer','Fixture Supplier','Fixture Employee'], 'Malformed filters safely show all parties');
  currentUrl.searchParams.set('party', 'employee');
  equal(partyNames(workspace()), ['Fixture Employee']);

  const inventory = view => {
    currentUrl = new URL('https://example.test/dashboard/finance?section=inventory' + (view == null ? '' : '&view='+view));
    const rendered = workspace();
    return [nodes(rendered).some(node=>node.type?.name==='FinanceInventoryReport'), nodes(rendered).some(node=>node.props?.title==='حركات المخزون'), nodes(rendered).some(node=>node.type==='button' && text(node)==='تحميل حركات مخزون أقدم')];
  };
  equal(inventory('items'), [true,false,false]);
  equal(inventory('movements'), [false,true,true]);
  equal(inventory(null), [true,true,true], 'Legacy inventory URL keeps the full view');
  equal(inventory('unknown'), [true,true,true]);
  const sales = view => {
    currentUrl = new URL('https://example.test/dashboard/finance?section=sales' + (view ? '&view='+view : ''));
    return workspace();
  };
  fixture.documents = [
    {id:'sale-a',number:1,kind:'sale',party_id:'customer',total:100,outstanding:40,paid:60,refunded:false,note:'',created_at:'2026-11-09T10:00:00Z'},
    {id:'sale-b',number:2,kind:'sale',party_id:'customer',total:80,outstanding:0,paid:80,refunded:false,refunded_total:20,note:'',created_at:'2026-11-09T10:00:00Z'},
    {id:'purchase',number:3,kind:'purchase',party_id:'supplier',total:30,outstanding:0,paid:30,refunded:true,note:'',created_at:'2026-11-09T10:00:00Z'},
  ];
  const invoiceManager = view => nodes(sales(view)).find(node=>node.type?.name==='FinanceInvoices');
  check(!!invoiceManager(), 'Invoice management route renders the dedicated invoice manager');
  invoiceManager().props.onReceipt('sale-a');
  equal(currentUrl.search, '?section=sales&view=invoice&invoice=sale-a', 'Clicking an invoice opens its addressable detail page');
  const detailPage = () => nodes(workspace()).find(node=>node.type?.name==='FinanceInvoiceDetail');
  equal(detailPage().props.id, 'sale-a');
  equal(detailPage().props.onChanged, state.refresh, 'Payment corrections refresh the canonical finance snapshot');
  check(!nodes(workspace()).some(node=>node.type?.name==='FinanceReceiptDialog'), 'Opening details does not open the old receipt modal');
  detailPage().props.onNavigate('sale-b'); equal(detailPage().props.id, 'sale-b');
  detailPage().props.onPrint(fixture.documents[1]);
  let receipt = nodes(workspace()).find(node=>node.type?.name==='FinanceReceiptDialog');
  equal(receipt.props.document.id, 'sale-b'); receipt.props.onClose();
  const older = {...fixture.documents[0], id:'older-unloaded', number:100};
  detailPage().props.onRefund(older);
  const refundForm = nodes(workspace()).find(node=>node.type?.name==='FinanceOperationForm');
  equal(refundForm.props.form.values.documentId, older.id);
  check(refundForm.props.snapshot.documents.some(document=>document.id===older.id), 'Direct-linked older invoices remain available to the refund form');
  refundForm.props.onCancel();
  detailPage().props.onSettle(older, 50);
  const installmentForm = nodes(workspace()).find(node=>node.type?.name==='FinanceOperationForm');
  equal(installmentForm.props.form.operation,'settlement');
  equal(installmentForm.props.form.values.amount,50,'Installment remaining amount reaches the actual payment review form');
  equal(installmentForm.props.form.values.documentId,older.id);
  installmentForm.props.onCancel();
  detailPage().props.onCustomer('customer');
  equal(currentUrl.searchParams.get('returnPayment'),null,'Agreement customer navigation does not invent an initial payment');
  find(workspace(),node=>node.type?.name==='FinanceCustomerDetail').props.onBack();
  detailPage().props.onBack(); equal(currentUrl.search, '?section=sales');
  currentUrl = new URL('https://example.test/dashboard/finance?section=sales&view=invoice&invoice=sale-a&payment=pay-44');
  equal(detailPage().props.initialPaymentId,'pay-44','Addressable payment is passed through to invoice details');
  detailPage().props.onCustomer('customer','pay-44');
  let customerDetail=find(workspace(),node=>node.type?.name==='FinanceCustomerDetail');
  equal(customerDetail.props.id,'customer');equal(currentUrl.searchParams.get('returnInvoice'),'sale-a');equal(currentUrl.searchParams.get('returnPayment'),'pay-44');
  check(!nodes(workspace()).some(node=>node.props?.title==='الأطراف والأرصدة'),'Customer detail does not render the party list');
  customerDetail.props.onBack();equal(detailPage().props.initialPaymentId,'pay-44');
  detailPage().props.onJournal('journal-source','pay-44');
  let journalDetail=find(workspace(),node=>node.type?.name==='FinanceJournalDetail');equal(journalDetail.props.id,'journal-source');
  check(!nodes(workspace()).some(node=>node.type?.name==='FinanceControlPanel'&&node.props.visible),'Journal detail hides report overview');
  check(!nodes(workspace()).some(node=>node.props?.title==='القيود المحاسبية'),'Journal detail hides general journal list');
  journalDetail.props.onNavigate('correction-journal');journalDetail=find(workspace(),node=>node.type?.name==='FinanceJournalDetail');equal(journalDetail.props.id,'correction-journal');equal(currentUrl.searchParams.get('returnInvoice'),'sale-a');equal(currentUrl.searchParams.get('returnPayment'),'pay-44');journalDetail.props.onBack();equal(detailPage().props.initialPaymentId,'pay-44');
  detailPage().props.onCustomer('customer','pay-44');customerDetail=find(workspace(),node=>node.type?.name==='FinanceCustomerDetail');customerDetail.props.onJournal('customer-journal');journalDetail=find(workspace(),node=>node.type?.name==='FinanceJournalDetail');equal(currentUrl.searchParams.get('returnCustomer'),'customer');journalDetail.props.onBack();customerDetail=find(workspace(),node=>node.type?.name==='FinanceCustomerDetail');equal(customerDetail.props.id,'customer');
  customerDetail.props.onPayment('sale-b','second-payment');equal(detailPage().props.id,'sale-b');equal(detailPage().props.initialPaymentId,'second-payment');
  detailPage().props.onCustomer('customer','second-payment');customerDetail=find(workspace(),node=>node.type?.name==='FinanceCustomerDetail');
  const olderCustomer={...fixture.parties[0],id:'customer-not-in-snapshot',name:'Actual older customer'};
  customerDetail.props.onCreateInvoice(olderCustomer);let customerCreation=find(workspace(),node=>node.type?.name==='FinanceSaleForm');equal(customerCreation.props.initialCustomerId,olderCustomer.id);check(customerCreation.props.snapshot.parties.some(party=>party.id===olderCustomer.id),'Customer omitted from snapshot is available for exact-ID preselection');
  currentUrl=new URL('https://example.test/dashboard/finance?section=parties&view=customer&customer=customer');customerDetail=find(workspace(),node=>node.type?.name==='FinanceCustomerDetail');customerDetail.props.onCreateQuote(olderCustomer);const customerQuote=find(workspace(),node=>node.type?.name==='FinanceQuotes');equal(customerQuote.props.initialCustomerId,olderCustomer.id);equal(customerQuote.props.create,true);check(customerQuote.props.snapshot.parties.some(party=>party.id===olderCustomer.id));
  equal(nodes(sales('returns')).filter(node=>node.type==='strong'&&text(node).startsWith('#')).map(text),['#2'],'Sales returns never list purchase returns');
  check(nodes(sales('payments')).some(node=>node.type==='th'&&text(node)==='المحصّل بعد الاسترداد'));
  equal(nodes(sales('payments')).filter(node=>node.type==='button'&&text(node)==='تسجيل دفعة').length,1);
  let creation = nodes(sales('create')).find(node=>node.type?.name==='FinanceSaleForm');
  check(!!creation,'Create route opens existing sale form directly');
  creation.props.onCancel();equal(currentUrl.search,'?section=sales');
  check(!nodes(sales('sales-settings')).some(node=>node.type?.name==='FinanceSaleForm'));
  const settingsPage=()=>find(sales('sales-settings'),node=>node.type?.name==='FinanceSalesSettings');
  equal(settingsPage().props.settings,fixture.settings,'Settings hub uses actual finance defaults');
  check(text(sales('sales-settings')).includes('إعدادات المبيعات'));
  check(!text(sales('sales-settings')).includes('حركة علامتك بالأرقام'),'Settings hub hides unrelated financial overview');
  check(!text(sales('sales-settings')).includes('الجداول تعرض أحدث العمليات'),'Settings hub hides financial history notice');
  settingsPage().props.onEditInvoices();
  const settingsForm=find(workspace(),node=>node.type?.name==='FinanceOperationForm');
  equal(settingsForm.props.form.operation,'settings');equal(settingsForm.props.form.values.vatRate,15);settingsForm.props.onCancel();
  const settingsHooks=hooks(),{FinanceSalesSettings,salesSettingsGroups}=load('components/finance/finance-sales-settings.tsx',{react:settingsHooks.api,'./finance-invoice-settings':children});
  equal(salesSettingsGroups.map(group=>group.cards.length),[9,1,1]);
  equal(salesSettingsGroups[0].cards.map(card=>card.title),['إعدادات الفواتير','إعدادات الفاتورة الإلكترونية','تصميمات الفواتير وعروض الأسعار','حقول الفواتير الإضافية','ملاحظات البنود','قوائم الأسعار','مصادر الطلب','خيارات الشحن','العروض']);
  let edits=0;const settingsProps={slug:fixture.cafe.slug,settings:fixture.settings,disabled:false,onEditInvoices:()=>edits++};const renderSettings=()=>settingsHooks.render(FinanceSalesSettings,settingsProps);
  let hub=renderSettings();equal(nodes(hub).filter(node=>node.type==='h2').map(text),['الفواتير والمدفوعات','عروض الأسعار','أوامر البيع']);equal(nodes(hub).filter(node=>node.type==='h3').length,11);equal(nodes(hub).filter(node=>node.type==='article').length,10,'Unspecified settings remain content cards rather than fake working controls');
  find(hub,node=>node.type==='button'&&text(node).includes('إعدادات الفواتير')).props.onClick();hub=renderSettings();equal(hub.type.name,'FinanceInvoiceSettings');equal(hub.props.slug,fixture.cafe.slug);equal(hub.props.settings,fixture.settings);equal(hub.props.canEdit,true);hub.props.onEditTax();equal(edits,1);settingsProps.disabled=true;hub=renderSettings();equal(hub.props.disabled,true);settingsProps.onEditInvoices=undefined;hub=renderSettings();equal(hub.props.canEdit,false);equal(hub.props.onEditTax,undefined);hub.props.onBack();equal(nodes(renderSettings()).filter(node=>node.type==='h3').length,11);
  fixture.role='auditor';fixture.canAdminister=false;
  check(!nodes(sales('create')).some(node=>node.type?.name==='FinanceSaleForm'),'Read-only role cannot create invoices');
  check(!nodes(sales('sales-settings')).some(node=>node.type==='button'&&text(node).includes('تعديل إعدادات المبيعات')),'Read-only role cannot edit settings');
  equal(settingsPage().props.onEditInvoices,undefined,'Auditor cannot open the settings mutation form');
  fixture.role='owner';fixture.canAdminister=true;
  check(!!invoiceManager('unknown'), 'Unknown sales views fall back to invoice management');
  const standaloneHooks = hooks();
  const Standalone = load('components/finance/finance-workspace.tsx', {...mocks,react:standaloneHooks.api}).FinanceWorkspace;
  currentUrl = new URL('https://example.test/finance/test-brand?section=parties&party=customer');
  const standalone = () => standaloneHooks.render(Standalone,{initialSnapshot:fixture,slug:'test-brand'});
  equal(partyNames(standalone()), ['Fixture Customer','Fixture Supplier','Fixture Employee']);
  const pushCount = pushes.length;
  button(standalone(),'الموردون').props.onClick();
  equal(partyNames(standalone()), ['Fixture Supplier']);
  equal(pushes.length,pushCount,'Standalone staff filters keep their existing local navigation');

  currentUrl=new URL('https://example.test/dashboard/finance?section=reports&view=journal&entry=source-payment');
  const sourceJournal={document:{id:'source-payment',kind:'settlement'},invoiceId:'source-invoice'};
  let sourcePage=find(workspace(),node=>node.type?.name==='FinanceJournalDetail');sourcePage.props.onOpenDraft('actual-draft');equal(assignments.at(-1),'/dashboard/finance/ledger?draft=actual-draft');
  await sourcePage.props.onCopySource(sourceJournal);let sourceForm=find(workspace(),node=>node.type?.name==='FinanceOperationForm');equal(sourceReads.at(-1),{id:'source-invoice',slug:'test-brand'});equal(sourceForm.props.form.operation,'settlement');equal(sourceForm.props.form.values.documentId,'source-invoice');equal(sourceForm.props.form.values.amount,40);equal(sourceForm.props.form.values.remaining,75);equal(sourceCopies.length,0,'Copy payment opens review, never creates invoice draft');sourceForm.props.onCancel();
  await sourcePage.props.onReverseSource(sourceJournal);let confirmation=find(workspace(),node=>node.type?.name==='FinancePaymentEditor');equal(confirmation.props.deleting,true);equal(confirmation.props.payment.id,'source-payment');confirmation.props.onCancel();
  sourceDetail.payments[0].canDelete=false;await assert.rejects(sourcePage.props.onReverseSource(sourceJournal),/لا يمكن عكس/);assertions++;sourceDetail.payments[0].canDelete=true;
  sourceDetail.document.outstanding=0;await assert.rejects(sourcePage.props.onCopySource(sourceJournal),/لا يوجد مبلغ مستحق/);assertions++;sourceDetail.document.outstanding=75;
  const saleJournal={document:{id:'source-invoice',kind:'sale'},invoiceId:'source-invoice'};
  await sourcePage.props.onReverseSource(saleJournal);sourceForm=find(workspace(),node=>node.type?.name==='FinanceOperationForm');equal(sourceForm.props.form.operation,'refund');equal(sourceForm.props.form.values.documentId,'source-invoice');check(sourceForm.props.snapshot.documents.some(row=>row.id==='source-invoice'),'Business reversal review contains exact source invoice');sourceForm.props.onCancel();
  await sourcePage.props.onCopySource(saleJournal);equal(sourceCopies.length,1);equal(sourceCopies[0].input.revision,0);equal(sourceCopies[0].input.payload.invoice.paymentKind,'credit');equal(sourceCopies[0].input.payload.deposit.paid,false);equal(currentUrl.searchParams.get('draft'),sourceCopies[0].input.id);check(currentUrl.searchParams.get('view')==='create','Copy sale routes to unissued draft editor');
  currentUrl=new URL('https://example.test/dashboard/finance?section=reports&view=journal&entry=source-payment');state.stale=true;sourcePage=find(workspace(),node=>node.type?.name==='FinanceJournalDetail');const readsBefore=sourceReads.length;await assert.rejects(sourcePage.props.onCopySource(sourceJournal),/الإجراء غير متاح/);assertions++;equal(sourceReads.length,readsBefore);state.stale=false;

  const crypto=require('node:crypto');
  const evidenceInputs=['scripts/check-finance-navigation.cjs','components/finance/finance-workspace.tsx','components/finance/finance-navigation.ts','components/dashboard/finance-sidebar-menu.tsx','components/finance/finance-sale-form.tsx','components/finance/finance-quotes.tsx','components/finance/finance-payment-detail.tsx','components/finance/finance-invoice-detail.tsx','components/finance/finance-customer-detail.tsx','components/finance/finance-customer-detail.module.css','components/finance/finance-journal-detail.tsx','components/finance/finance-journal-detail.module.css','lib/finance/invoice-copy.ts','lib/finance/permissions.ts','package-lock.json','tsconfig.json'];
  fs.mkdirSync('output/customer-journal-links',{recursive:true});fs.writeFileSync('output/customer-journal-links/navigation.json',JSON.stringify({at:new Date().toISOString(),runtime:process.version,command:[process.execPath,'scripts/check-finance-navigation.cjs'],assertions,inputs:Object.fromEntries(evidenceInputs.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]))},null,2)+'\n');
  console.log(`Finance navigation PASS: ${assertions} behavioral assertions`);
} finally {
  if (oldWindow === undefined) delete global.window; else global.window = oldWindow;
}})().catch(error=>{console.error(error);process.exitCode=1});
