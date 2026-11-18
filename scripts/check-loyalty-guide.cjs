const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const React = require('react');

function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.css')) return new Proxy({}, { get: (_, key) => String(key) });
    if (name.startsWith('@/') || name.startsWith('./')) {
      const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name);
      return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '.tsx', mocks);
    }
    return require(name);
  }, exports);
  return exports;
}
const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];

(async () => {
  const bytes = fs.readFileSync('assets/guides/branda-loyalty-guide.pdf');
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), '330ea8d39e618d342cabb6b88fa9d2d1a12679cf9dd0483030741cdb96ab5b91');
  let features = [], authError = false, reads = 0, diskError = false;
  const mocks = {
    '@/lib/data/feature-entitlements': { getOwnerFeatureCodes: async () => { if (authError) throw Error('not authenticated'); return features; } },
    'node:fs/promises': { readFile: async file => { reads++; assert.equal(file, path.join(process.cwd(), 'assets/guides/branda-loyalty-guide.pdf')); if (diskError) throw Error('private path'); return bytes; } },
  };
  const { GET } = load('app/api/loyalty-guide/route.ts', mocks);
  const request = suffix => new Request('https://example.test/api/loyalty-guide' + suffix);
  for (const denied of [[], ['menu'], ['finance']]) {
    features = denied;
    assert.equal((await GET(request(''))).status, 403);
  }
  authError = true;
  assert.equal((await GET(request('?download=1'))).status, 403);
  assert.equal(reads, 0, 'Unauthorized requests never read PDF bytes');
  authError = false;
  for (const allowed of [['loyalty'], ['menu', 'loyalty'], ['finance', 'loyalty']]) {
    features = allowed;
    for (const suffix of ['', '?download=1', '?file=../../private']) {
      const response = await GET(request(suffix));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'application/pdf');
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert(response.headers.get('content-disposition').startsWith(suffix === '?download=1' ? 'attachment;' : 'inline;'));
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    }
  }
  diskError = true;
  const failed = await GET(request(''));
  assert.equal(failed.status, 503);
  assert(!(await failed.text()).includes('private path'));

  const { default: Page } = load('app/dashboard/loyalty/guide/page.tsx', mocks);
  features = [];
  assert.equal(nodes(await Page()).filter(x => x.type === 'iframe').length, 0);
  features = ['loyalty'];
  const page = nodes(await Page());
  assert.equal(page.filter(x => x.type === 'iframe').length, 1);
  assert(page.some(x => x.props?.href === '/api/loyalty-guide?download=1'));
  assert(page.some(x => x.props?.href === '#loyalty-guide-preview' && !x.props.target));
  assert(page.some(x => x.type === 'iframe' && x.props.title && x.props.src === '/api/loyalty-guide#view=FitH'));

  const navigation = load('components/dashboard/integrated-system-navigation.ts');
  for (const slug of ['fawasel', 'wahed-maasoub', 'mind-hospital', 'khayal-aldeem', 'new-brand']) {
    const items = navigation.integratedSystemGroupsForBrand(slug).find(x => x.id === 'loyalty').items;
    const index = items.findIndex(x => x.href === '/dashboard/loyalty/guide');
    assert(index > items.findIndex(x => x.href === '/dashboard/loyalty/settings'));
    for (const allowed of [[], ['menu'], ['finance'], ['loyalty'], ['finance', 'loyalty']]) {
      const href = navigation.systemItemHref(items[index], { cafeSlug: slug, enabledFeatures: allowed, isSalon: false, isGifts: false });
      assert.equal(Boolean(href), allowed.includes('loyalty'));
    }
  }
  const hooks = { ...React, useId: () => 'guide-test', useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}] };
  const { FinanceSidebarMenu } = load('components/dashboard/finance-sidebar-menu.tsx', {
    react: hooks,
    'next/navigation': { usePathname: () => '/dashboard/loyalty/guide', useSearchParams: () => new URLSearchParams() },
    './dashboard-navigation-link': { DashboardNavigationLink: 'a' },
  });
  for (const enabledFeatures of [[], ['finance'], ['loyalty'], ['finance', 'loyalty']]) {
    const tree = nodes(FinanceSidebarMenu({ collapsed: false, onExpand() {}, enabledFeatures, cafeSlug: 'fawasel' }));
    const labels = tree.filter(x => x.props?.children === 'دليل نظام الولاء');
    assert.equal(labels.length > 0, enabledFeatures.includes('loyalty'), 'Unavailable guide must be absent, not locked');
  }
  const pushes = [], replacements = [], effects = [];
  let currentPath = '/dashboard/loyalty/guide';
  const dashboardMocks = {
    react: { ...hooks, useEffect: callback => effects.push(callback), useTransition: () => [false, callback => callback()] },
    'next/navigation': { usePathname: () => currentPath, useRouter: () => ({ push: value => pushes.push(value), replace: value => replacements.push(value) }) },
    'react-dom': { useFormStatus: () => ({ pending: false }) },
    'next/link': 'a', 'next/image': 'img',
    '@/components/aldeem/use-location': { useAldeemLocation: () => ['overview', value => pushes.push('local:' + value), true] },
  };
  const dashboardSource = fs.readFileSync('components/dashboard/aldeem-clean-dashboard.tsx', 'utf8');
  for (const match of dashboardSource.matchAll(/from ["']([^"']+)["']/g)) {
    const name = match[1];
    if ((name.startsWith('./') || name.startsWith('@/')) && !name.endsWith('.css') && !(name in dashboardMocks)) {
      dashboardMocks[name] = new Proxy({}, { get: (_, key) => key === 'ALDEEM_OPERATIONAL_SECTIONS' ? {} : () => null });
    }
  }
  const { AldeemCleanDashboard } = load('components/dashboard/aldeem-clean-dashboard.tsx', dashboardMocks);
  const child = React.createElement('h1', { id: 'guide-content' }, 'Guide content');
  let dashboard = nodes(AldeemCleanDashboard({ maintenance: false, loyaltyEnabled: true, children: child }));
  effects.splice(0).forEach(effect => effect());
  assert.equal(replacements.length, 0, 'Aldeem guide must not redirect to overview');
  assert(dashboard.some(x => x.props?.id === 'guide-content'));
  dashboard.find(x => x.type === 'button' && nodes(x).some(n => n.props?.children === 'نظرة عامة')).props.onClick();
  assert.equal(pushes.pop(), '/dashboard?aldeem.section=overview');
  currentPath = '/dashboard';
  dashboard = nodes(AldeemCleanDashboard({ maintenance: false, loyaltyEnabled: false, children: child }));
  assert(!dashboard.some(x => x.props?.id === 'guide-content'));
  assert(!dashboard.some(x => x.props?.href === '/dashboard/loyalty/guide'));
  console.log('Loyalty guide passed: exact supplied PDF, authorization, no unauthorized file reads, inline/download, tenant input ignored, safe errors, page and sidebar gating/order');
})().catch(error => { console.error(error); process.exitCode = 1; });
