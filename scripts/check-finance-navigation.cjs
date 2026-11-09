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
const oldWindow = global.window;
global.window = { history: { pushState(_state, _unused, href) { pushes.push(href); currentUrl = new URL(href, currentUrl); } } };
const navigation = { usePathname: () => currentUrl.pathname, useSearchParams: () => currentUrl.searchParams };
let assertions = 0;
function check(condition, message) { assert.ok(condition, message); assertions++; }
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); assertions++; }

try {
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
  equal(button(tree, 'المبيعات والعملاء').props['aria-expanded'], false);
  button(tree, 'المبيعات والعملاء').props.onClick();
  tree = render();
  equal(button(tree, 'المبيعات والعملاء').props['aria-expanded'], true);
  equal(controlled(tree, button(tree, 'المبيعات والعملاء')).props.hidden, false);
  button(tree, 'المبيعات والعملاء').props.onClick();
  equal(controlled(render(), button(render(), 'المبيعات والعملاء')).props.hidden, true);

  currentUrl = new URL('https://example.test/dashboard/finance?section=parties&party=customer');
  tree = render();
  equal(button(tree, 'المبيعات والعملاء').props['aria-expanded'], true, 'A direct customer URL reveals the correct branch');
  equal(nodes(tree, true).filter(node => node.props?.['aria-current'] === 'page').map(text), ['بيانات العملاء وأرصدتهم']);
  const customerUrl = currentUrl.href;
  currentUrl = new URL('https://example.test/dashboard/finance?section=parties&party=supplier');
  equal(button(render(), 'المشتريات والموردون').props['aria-expanded'], true);
  equal(nodes(render(), true).filter(node => node.props?.['aria-current'] === 'page').map(text), ['بيانات الموردين وأرصدتهم']);
  currentUrl = new URL(customerUrl);
  equal(button(render(), 'المبيعات والعملاء').props['aria-expanded'], true, 'Back navigation reveals the old selection');
  button(render(), 'المبيعات والعملاء').props.onClick();
  equal(button(render(), 'المبيعات والعملاء').props['aria-expanded'], false, 'An active branch remains collapsible');

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
  for (const name of ['./finance-shift-monitor','./finance-cashier-management','./finance-printer-settings','@/components/dashboard/ui/modal','./finance-sale-form','./finance-customer-form','./finance-operation-form','./finance-refund-requests','./finance-receipt-dialog','./finance-treasury','./finance-trial-balance','./finance-cash-differences','./finance-cash-handovers','./finance-inventory-report','./finance-control-panel']) mocks[name] = children;
  mocks['./finance-ui'] = { Panel:children.Panel, Empty:children.Empty, Metric:children.Metric, Numeric:children.Numeric, documentKindNames:{}, financeDate:value=>value, financeDocumentStatus:()=>'', downloadFinanceCsv(){} };
  const { FinanceWorkspace } = load('components/finance/finance-workspace.tsx', mocks);
  const workspace = (slug) => workspaceHooks.render(FinanceWorkspace, { initialSnapshot:fixture, slug });
  const partyNames = tree => nodes(tree).filter(node => node.type === 'strong' && text(node).startsWith('Fixture ')).map(text);
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
  const standaloneHooks = hooks();
  const Standalone = load('components/finance/finance-workspace.tsx', {...mocks,react:standaloneHooks.api}).FinanceWorkspace;
  currentUrl = new URL('https://example.test/finance/test-brand?section=parties&party=customer');
  const standalone = () => standaloneHooks.render(Standalone,{initialSnapshot:fixture,slug:'test-brand'});
  equal(partyNames(standalone()), ['Fixture Customer','Fixture Supplier','Fixture Employee']);
  const pushCount = pushes.length;
  button(standalone(),'الموردون').props.onClick();
  equal(partyNames(standalone()), ['Fixture Supplier']);
  equal(pushes.length,pushCount,'Standalone staff filters keep their existing local navigation');

  console.log(`Finance navigation PASS: ${assertions} behavioral assertions`);
} finally {
  if (oldWindow === undefined) delete global.window; else global.window = oldWindow;
}
