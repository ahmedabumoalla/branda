const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');

function load(file, mocks = {}) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', js)(name => {
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
function nodes(tree) { return !tree || typeof tree !== 'object' ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)]; }
const { integratedSystemGroups: groups, systemItemHref } = load('components/dashboard/integrated-system-navigation.ts');
const { financeSections } = load('components/finance/finance-navigation.ts');
assert.equal(groups.length, 32);
assert.equal(new Set(groups.map(group => group.id)).size, 32);
assert.deepEqual([...new Set(groups.flatMap(group => group.items.map(item => item.section).filter(Boolean)))].sort(), financeSections.map(item => item.id).sort(), 'Every existing finance screen remains reachable');
const context = { cafeSlug: 'test brand', enabledFeatures: ['finance'], isSalon: false, isGifts: false };
const item = group => groups.find(entry => entry.id === group).items[0];
for (const group of ['store', 'bookings', 'loyalty', 'branches', 'requests', 'manufacturing', 'insurance', 'payroll']) assert.equal(systemItemHref(item(group), context), null);
assert.equal(systemItemHref(item('pos'), context), '/finance/test%20brand/pos');
assert.equal(systemItemHref(item('pos'), { ...context, cafeSlug: '' }), null);
assert.equal(systemItemHref(item('store'), { ...context, enabledFeatures: ['menu'] }), '/dashboard/menu');
assert.equal(systemItemHref(item('bookings'), { ...context, enabledFeatures: ['menu'] }), null);
assert.equal(systemItemHref(item('bookings'), { ...context, enabledFeatures: ['menu'], isSalon: true }), '/dashboard/bookings');
assert.equal(systemItemHref(item('requests'), { ...context, enabledFeatures: ['menu'], isGifts: true }), '/dashboard/orders');

let states = [], cursor = 0, pathname = '/dashboard/finance', search = 'section=sales', expanded = 0, navigated = 0;
const history = [];
const mocks = {
  react: { ...React, useId: () => 'test-system', useState: initial => { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], value => states[index] = typeof value === 'function' ? value(states[index]) : value]; } },
  'next/navigation': { usePathname: () => pathname, useSearchParams: () => new URLSearchParams(search), useRouter: () => ({ push() {} }) },
  './dashboard-navigation-link': { DashboardNavigationLink: 'a' },
};
const { FinanceSidebarMenu } = load('components/dashboard/finance-sidebar-menu.tsx', mocks);
const render = (collapsed = false) => { cursor = 0; return FinanceSidebarMenu({ ...context, collapsed, onExpand: () => expanded++, onNavigate: () => navigated++ }); };
const control = (tree, group) => nodes(tree).find(node => node.props?.['aria-controls'] === `test-system-${group}`);
const panel = (tree, group) => nodes(tree).find(node => node.props?.id === `test-system-${group}`);
let tree = render();
assert.equal(panel(tree, 'sections').props.hidden, false);
assert.equal(panel(tree, 'sales').props.hidden, false);
assert.equal(nodes(tree).filter(node => node.props?.['aria-current'] === 'page').length, 1);
control(tree, 'manufacturing').props.onClick(); tree = render();
assert.equal(panel(tree, 'sales').props.hidden, true);
assert.equal(panel(tree, 'manufacturing').props.hidden, false);
assert(nodes(panel(tree, 'manufacturing')).some(node => node.props?.['aria-disabled'] === 'true'));
assert(!nodes(panel(tree, 'manufacturing')).some(node => node.props?.href));
control(tree, 'manufacturing').props.onClick(); tree = render();
assert.equal(panel(tree, 'manufacturing').props.hidden, true);
control(tree, 'sections').props.onClick(); tree = render();
assert.equal(panel(tree, 'sections').props.hidden, true);
control(render(true), 'sections').props.onClick(); tree = render();
assert.equal(expanded, 1); assert.equal(panel(tree, 'sections').props.hidden, false);
for (const section of financeSections) {
  search = `section=${section.id}`; tree = render();
  const current = nodes(tree).find(node => node.props?.['aria-current'] === 'page');
  assert.equal(current.props.href, `/dashboard/finance?section=${section.id}`);
  const group = groups.find(group => group.items.some(item => item.section === section.id));
  assert.equal(panel(tree, group.id).props.hidden, false);
}
const salesItems = groups.find(group => group.id === 'sales').items;
assert.equal(salesItems.length, 9);
assert.equal(salesItems.filter(item => systemItemHref(item, context)).length, 9);
assert.deepEqual(salesItems.filter(item => item.unavailable).map(item => item.id), []);
for (const item of salesItems.filter(item => !item.unavailable)) {
  search = systemItemHref(item, context).split('?')[1]; tree = render();
  const current = nodes(tree).filter(node => node.props?.['aria-current'] === 'page');
  assert.equal(current.length, 1); assert.equal(current[0].props.href, systemItemHref(item, context));
  assert.equal(panel(tree, 'sales').props.hidden, false);
}
search = 'section=sales&view=invoice&invoice=test'; tree = render();
assert.equal(nodes(tree).find(node => node.props?.['aria-current'] === 'page').props.href, '/dashboard/finance?section=sales');
for (const view of ['credit-create', 'credit-note']) {
  search = `section=sales&view=${view}&creditNote=test`; tree = render();
  const current = nodes(tree).filter(node => node.props?.['aria-current'] === 'page');
  assert.equal(current.length, 1);
  assert.equal(current[0].props.href, '/dashboard/finance?section=sales&view=credit-notes');
  assert.equal(panel(tree, 'sales').props.hidden, false);
}
search = 'section=sales&view=return-detail&return=returned-document'; tree = render();
assert.equal(nodes(tree).filter(node => node.props?.['aria-current'] === 'page').length, 1);
assert.equal(nodes(tree).find(node => node.props?.['aria-current'] === 'page').props.href, '/dashboard/finance?section=sales&view=returns');
assert.equal(panel(tree, 'sales').props.hidden, false);
for (const view of ['recurring-create', 'recurring-detail']) {
  search = `section=sales&view=${view}&recurring=subscription`; tree = render();
  const current = nodes(tree).filter(node => node.props?.['aria-current'] === 'page');
  assert.equal(current.length, 1);
  assert.equal(current[0].props.href, '/dashboard/finance?section=sales&view=recurring');
  assert.equal(panel(tree, 'sales').props.hidden, false);
}
for (const view of ['payment-detail', 'payment-edit', 'payment-delete']) {
  search = `section=sales&view=${view}&payment=payment`; tree = render();
  const current = nodes(tree).filter(node => node.props?.['aria-current'] === 'page');
  assert.equal(current.length, 1);
  assert.equal(current[0].props.href, '/dashboard/finance?section=sales&view=payments');
  assert.equal(panel(tree, 'sales').props.hidden, false);
}
global.window = { history: { pushState: (_state, _title, href) => history.push(href) } };
let prevented = 0;
const sales = nodes(tree).find(node => node.props?.href === '/dashboard/finance?section=sales');
sales.props.onClick({ button: 0, preventDefault: () => prevented++ });
assert.equal(prevented, 1); assert.deepEqual(history, ['/dashboard/finance?section=sales']);
sales.props.onClick({ button: 0, ctrlKey: true, preventDefault: () => prevented++ });
assert.equal(prevented, 1); assert.equal(navigated, 2);
pathname = '/dashboard/menu'; search = ''; tree = render();
assert.equal(nodes(tree).filter(node => node.props?.['aria-current'] === 'page').length, 0, 'Unentitled menu is never selected');
delete global.window;

const noop = () => null;
const sidebarMocks = { ...mocks,
  './finance-sidebar-menu': { FinanceSidebarMenu: 'IntegratedSystem' },
  '@/components/dashboard/subscription-countdown': { SubscriptionCountdown: noop },
  '@/components/cafe/cafe-logo': { CafeLogo: noop },
  '@/components/dashboard/notifications-panel': { NotificationsPanel: noop },
  '@/components/ui/barndaksa-logo': { BarndaksaLogo: noop },
  '@/lib/cafe/use-resolved-cafe-logo': { useResolvedCafeLogoUrl: () => null },
  '@/lib/platform/auth': { logoutBarndaksaAuth: noop },
  '@/lib/whatsapp/brand-connection-types': { LOCO_BRAND_SLUG: 'loco' },
};
const { DashboardSidebar } = load('components/dashboard/DashboardSidebar.tsx', sidebarMocks);
for (const [features, overrides, available, expected] of [
  [['menu', 'finance', 'loyalty'], [], true, true],
  [['menu'], [], true, false],
  [['finance'], [{ featureId: 'finance', enabled: false }], true, false],
  [['menu'], [{ featureId: 'finance', enabled: true }], true, false],
  [['finance'], [], false, false],
]) {
  const snapshot = { planId: 'assigned', plans: [{ id: 'assigned', features }], featureOverrides: overrides, settings: { cafeSlug: 'brand', cafeName: 'Brand', businessCategory: 'cafes_coffee' }, notifications: [] };
  tree = DashboardSidebar({ snapshot, servicesAvailable: available });
  const nav = nodes(tree).find(node => node.type === 'nav');
  const entries = React.Children.toArray(nav.props.children);
  assert.equal(entries.some(node => node.type === 'IntegratedSystem'), expected);
  if (expected) assert.equal(entries[0].type, 'IntegratedSystem', 'Integrated system is first only with finance entitlement');
}
console.log('PASS integrated sidebar: 32 groups, all 11 finance destinations, unavailable states, package/category gates, first position, disclosure, collapsed/mobile callbacks, deep links and native history');
