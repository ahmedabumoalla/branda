const fs = require('node:fs'), assert = require('node:assert/strict'), crypto = require('node:crypto'), ts = require('typescript'), React = require('react');
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };
const equal = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
function load(file, mocks) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('require', 'exports', output)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === 'react/jsx-runtime') return require(name);
    if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    throw Error(`Unmocked import ${name}`);
  }, exports);
  return exports;
}
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const byType = (tree, type) => nodes(tree).find(node => node.type === type);
const copy = tree => Array.isArray(tree) ? tree.map(copy).join('') : tree && typeof tree === 'object' ? copy(tree.props?.children) : typeof tree === 'string' ? tree : '';
const program = { enabled: true, appleWalletEnabled: true, googleWalletEnabled: true, purchasesRequired: 8, rewardName: 'Reward', terms: '', stampStyle: 'ceramic' };
let section = 'settings', stateIndex = 0;
const dashboardModule = load('components/rast-loyalty/rast-dashboard.tsx', {
  react: { ...React, useState: value => { const index = stateIndex++; return [index === 0 ? section : value, () => {}]; }, useRef: value => ({ current: value }) },
  'next/link': { __esModule: true, default: 'Link' }, 'next/navigation': { useRouter: () => ({ refresh() {} }) },
  'lucide-react': new Proxy({}, { get: (_, key) => key }),
  '@/components/loyalty/customer-directory': { LoyaltyCustomerDirectory: 'CustomerDirectory' },
  '@/components/loyalty/wallet-message-history': { WalletMessageHistory: 'MessageHistory' },
  '@/app/actions/loyalty-experience': { saveRastLoyaltySettingsAction() { throw Error('Unexpected save'); }, sendLoyaltyWalletAnnouncementAction() { throw Error('Unexpected message'); } },
  './rast-brand': { RastBrand: 'Brand' }, './qr-code': { RastQrCode: 'Qr' }, './rast-stamp-card': { RastStampCard: 'StampCard' },
  '@/lib/loyalty/stamp-style': { loyaltyStampStyle: value => value },
  '@/lib/loyalty/brand-stamp-artwork': { brandStampArtwork: () => null, brandStampStyle: (_, value) => value },
  './loyalty-theme': { loyaltyTheme: () => ({}) },
});
function render(view) { stateIndex = 0; return dashboardModule.RastLoyaltyDashboard({ view, identity: { name: 'Test', slug: 'test' }, initialDashboard: { program }, initialExperience: { nearbyMessage: 'Nearby', rewardValidityDays: 30 }, walletAvailability: { apple: true, google: true }, signupUrl: 'https://example.test/loyalty/test', activityLog: React.createElement('Activity') }); }

(async () => {
  let tree = render('rewards');
  check(copy(tree).includes('إدارة مكافآت الولاء'), 'finance main view is reward management');
  check(byType(tree, 'StampCard') && byType(tree, 'Qr') && byType(tree, 'form'), 'rewards retain saved program form and card preview');
  check(!byType(tree, 'MessageHistory') && !byType(tree, 'CustomerDirectory') && !byType(tree, 'Activity') && !byType(tree, 'nav'), 'finance rewards exclude unrelated panels and old tab navigation');
  tree = render('messages');
  check(copy(tree).includes('خلك قريب منهم'), 'dedicated messaging has requested heading');
  check(byType(tree, 'MessageHistory') && byType(tree, 'dialog'), 'messages preserve review dialog and history');
  equal(nodes(tree).filter(n => n.type === 'form').length, 1, 'messages contain only the original announcement form');
  check(!byType(tree, 'StampCard') && !byType(tree, 'Qr') && !byType(tree, 'CustomerDirectory'), 'messages do not mount reward editing or directory');
  check(nodes(tree).some(n => n.type === 'input' && n.props.maxLength === 80) && nodes(tree).some(n => n.type === 'textarea' && n.props.maxLength === 240), 'message title and body validation preserved');
  tree = render('customers');
  equal(byType(tree, 'CustomerDirectory').props.downloadedOnly, true, 'finance customers require downloaded card membership');
  check(!byType(tree, 'MessageHistory') && !byType(tree, 'form') && !byType(tree, 'StampCard'), 'customer route mounts only its directory');
  tree = render(undefined);
  check(byType(tree, 'nav') && byType(tree, 'MessageHistory') && byType(tree, 'Activity') && byType(tree, 'StampCard'), 'nonfinance default retains original all-in-one sections');
  section = 'customers'; tree = render(undefined);
  equal(byType(tree, 'CustomerDirectory').props.downloadedOnly, false, 'legacy directory retains all original customers');
  section = 'settings';

  let features = ['loyalty', 'finance', 'menu'], calls = [];
  const mocks = {
    'next/navigation': { redirect: url => { throw Error(`redirect:${url}`); } },
    '@/components/dashboard/feature-blocked-state': { DashboardFeatureBlockedState: 'Blocked' },
    '@/lib/data/feature-entitlements': { getOwnerFeatureCodes: async () => features },
    '@/lib/platform/feature-gates': { featureCodesAllow: (values, code) => values.includes(code) },
    '@/lib/data/loyalty-cards': { getOwnerLoyaltyProgramSettings: async () => ({ cafeId: 'cafe', cafeSlug: 'test', program }), getOwnerLoyaltyRewardProducts: async () => { calls.push('products'); return []; } },
    '@/components/rast-loyalty/rast-dashboard': { RastLoyaltyDashboard: 'Dashboard' },
    '@/lib/data/loyalty-experience': { getLoyaltyBrand: async () => ({ identity: { name: 'Test', slug: 'test' } }), getLoyaltyExperience: async () => { calls.push('experience'); return {}; } },
    '@/lib/loyalty/experience-types': { defaultLoyaltyExperience: {} },
    '@/lib/wallet': { getWalletReadiness: () => ({ apple: true, google: true }) },
    '@/components/loyalty/loyalty-activity-log': { LoyaltyActivityLog: 'Activity' },
    '@/app/actions/loyalty-activity': { loadLoyaltyActivityAction: async () => { calls.push('activity'); return { ok: true, data: {} }; } },
    '@/lib/loyalty/activity-types': { defaultLoyaltyActivityFilters: () => ({ page: 1 }) },
  };
  const { OwnerLoyaltyPage } = load('components/loyalty/owner-loyalty-page.tsx', mocks);
  tree = await OwnerLoyaltyPage(); equal(byType(tree, 'Dashboard').props.view, 'rewards', 'finance feature selects rewards view server-side');
  check(!calls.includes('activity'), 'reward route does not fetch unused activity log');
  for (const view of ['customers', 'messages']) {
    calls = []; tree = await OwnerLoyaltyPage({ requestedView: view });
    equal(byType(tree, 'Dashboard').props.view, view, `dedicated ${view} route selects its view`);
    equal(calls, [], `dedicated ${view} avoids unused settings products and activity queries`);
  }
  features = ['loyalty', 'menu']; calls = []; tree = await OwnerLoyaltyPage();
  equal(byType(tree, 'Dashboard').props.view, 'all', 'nonfinance brand retains original server behavior');
  check(calls.includes('activity') && calls.includes('experience'), 'nonfinance all-in-one retains complete data');
  for (const view of ['customers', 'messages']) { await assert.rejects(() => OwnerLoyaltyPage({ requestedView: view }), /redirect:\/dashboard\/loyalty/); checks++; }
  features = ['finance']; equal((await OwnerLoyaltyPage()).type, 'Blocked', 'finance without loyalty never bypasses entitlement');

  const operations = load('app/dashboard/read-operations/page.tsx', { ...mocks, '@/components/dashboard/pages/read-operations-page': { ReadOperationsPage: 'ReadQueue' }, '@/lib/data/loyalty-read-operations': { getOwnerLoyaltyReads: async () => ({ items: [{ cardCreated: true }] }) } });
  features = ['loyalty', 'finance']; tree = await operations.default();
  check(byType(tree, 'Activity') && byType(tree, 'ReadQueue'), 'finance operations includes redemption activity and original reads / new card / retry queue');
  features = ['loyalty']; calls = []; tree = await operations.default();
  check(!byType(tree, 'Activity') && byType(tree, 'ReadQueue') && !calls.includes('activity'), 'nonfinance read operations remain original');
  for (const [file, requestedView] of [['app/dashboard/loyalty/page.tsx', undefined], ['app/dashboard/loyalty/customers/page.tsx', 'customers'], ['app/dashboard/loyalty/messages/page.tsx', 'messages']]) {
    const route = load(file, { '@/components/loyalty/owner-loyalty-page': { OwnerLoyaltyPage: 'OwnerPage' } });
    equal(route.default().props.requestedView, requestedView, `${file} points to authenticated shared loader`);
  }
  const files = ['components/rast-loyalty/rast-dashboard.tsx', 'components/loyalty/owner-loyalty-page.tsx', 'components/loyalty/customer-directory.tsx', 'app/dashboard/loyalty/page.tsx', 'app/dashboard/loyalty/customers/page.tsx', 'app/dashboard/loyalty/messages/page.tsx', 'app/dashboard/read-operations/page.tsx', 'lib/data/loyalty-customers.ts', 'app/actions/loyalty-customers.ts', 'scripts/check-finance-loyalty-sections.cjs', 'package-lock.json'];
  fs.mkdirSync('output/finance-loyalty-sections-20261114', { recursive: true });
  fs.writeFileSync('output/finance-loyalty-sections-20261114/verification.json', JSON.stringify({ at: new Date().toISOString(), runtime: process.version, passed: true, checks, limits: ['Mocked render and authorization only', 'No browser or external reads / writes / messages'], inputs: Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])) }, null, 2));
  console.log(`PASS ${checks} finance-only loyalty view route and data-loading checks`);
})().catch(error => { console.error(error); process.exitCode = 1; });
