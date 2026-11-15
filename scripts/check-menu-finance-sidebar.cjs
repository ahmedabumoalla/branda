const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');

function load(file, mocks) {
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
const noop = () => null;
const mocks = {
  'next/navigation': { usePathname: () => '/dashboard/system/inventory/items', useRouter: () => ({ push() {} }) },
  './dashboard-navigation-link': { DashboardNavigationLink: 'a' },
  './finance-sidebar-menu': { FinanceSidebarMenu: 'IntegratedSystem' },
  '@/components/dashboard/subscription-countdown': { SubscriptionCountdown: noop },
  '@/components/cafe/cafe-logo': { CafeLogo: noop },
  '@/components/dashboard/notifications-panel': { NotificationsPanel: noop },
  '@/components/ui/barndaksa-logo': { BarndaksaLogo: noop },
  '@/lib/cafe/use-resolved-cafe-logo': { useResolvedCafeLogoUrl: () => null },
  '@/lib/platform/auth': { logoutBarndaksaAuth: noop },
  '@/lib/whatsapp/brand-connection-types': { LOCO_BRAND_SLUG: 'loco' },
};
const { DashboardSidebar } = load('components/dashboard/DashboardSidebar.tsx', mocks);
let checks = 0;
for (const [features, overrides, available, financeActive] of [
  [['menu', 'finance', 'loyalty'], [], true, true],
  [['menu'], [], true, false],
  [['menu', 'finance'], [{ featureId: 'finance', enabled: false }], true, false],
  [['menu'], [{ featureId: 'finance', enabled: true }], true, false],
  [['menu', 'finance'], [], false, false],
]) {
  for (const collapsed of [false, true]) {
    const snapshot = { planId: 'assigned', plans: [{ id: 'assigned', features }], featureOverrides: overrides, settings: { cafeSlug: 'brand', cafeName: 'Brand', businessCategory: 'cafes_coffee' }, notifications: [] };
    const tree = DashboardSidebar({ snapshot, servicesAvailable: available, collapsed });
    const nav = nodes(tree).find(node => node.type === 'nav');
    const entries = nodes(nav);
    assert.equal(entries.some(node => node.type === 'IntegratedSystem'), financeActive);
    assert.equal(entries.some(node => node.props?.href === '/dashboard/menu'), available && !financeActive, 'Finance brands manage their menu through inventory, menu-only brands keep the standalone entry');
    assert.equal(entries.some(node => node.props?.href === '/dashboard/branches'), available, 'Branch navigation remains available');
    checks += 3;
  }
}
async function checkMenuRedirect() {
  let features = ['menu', 'finance'], menuReads = 0;
  const { default: DashboardMenuPage } = load('app/dashboard/menu/page.tsx', {
    'next/navigation': { redirect: destination => { throw Object.assign(new Error('NEXT_REDIRECT'), { destination }); } },
    '@/components/dashboard/pages/menu-page': { MenuPageClient: 'MenuPageClient' },
    '@/components/dashboard/feature-blocked-state': { DashboardFeatureBlockedState: 'Blocked' },
    '@/lib/barndaksa/env': { isSupabaseConfigured: () => true },
    '@/lib/data/feature-entitlements': { getOwnerFeatureCodes: async () => features },
    '@/lib/data/menu-branches': { getOwnerMenuBranches: async () => ({ branches: [{ id: 'branch-id', primary: true }] }) },
    '@/lib/data/menu': { getOwnerMenu: async () => { menuReads++; return { products: [], categories: [], cafe: { slug: 'brand', businessCategory: 'cafes_coffee' } }; } },
  });
  await assert.rejects(DashboardMenuPage({ searchParams: Promise.resolve({ branch: 'branch/id?query' }) }), error => error.destination === '/dashboard/system/inventory/items?view=products&branch=branch%2Fid%3Fquery');
  await assert.rejects(DashboardMenuPage({ searchParams: Promise.resolve({}) }), error => error.destination === '/dashboard/system/inventory/items?view=products');
  assert.equal(menuReads, 0, 'Finance menu redirects before loading the old catalogue');
  features = ['menu'];
  assert.equal((await DashboardMenuPage({ searchParams: Promise.resolve({}) })).type, 'MenuPageClient', 'Menu-only brands keep the existing route');
  features = [];
  assert.equal((await DashboardMenuPage({ searchParams: Promise.resolve({}) })).type, 'Blocked', 'Existing service authorization remains enforced');
  console.log(`PASS menu/finance navigation: ${checks} sidebar checks and 5 redirect checks, entitlement gating and branch preservation`);
}
checkMenuRedirect().catch(error => { console.error(error); process.exitCode = 1; });
