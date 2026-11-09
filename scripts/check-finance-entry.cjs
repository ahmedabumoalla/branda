const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, mocks) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', source)(name => {
    if (name in mocks) return mocks[name];
    if (name === 'server-only') return {};
    if (name.startsWith('@/')) { const path = name.slice(2); return load(fs.existsSync(path + '.ts') ? path + '.ts' : path + '.tsx', mocks); }
    return require(name);
  }, exports);
  return exports;
}
async function main() {
  let user = null, dashboard = null, allowed = true, pilot = true, reads = 0;
  let snapshot = { role: 'owner', canManage: true, cafe: { id: 'brand', slug: 'brand-test' } };
  const mocks = {
    '@/lib/supabase/server': { getSessionUser: async () => user },
    '@/lib/data/cafes': { getOwnerCafeContext: async () => dashboard },
    '@/lib/data/brand-finance': { getBrandFinanceSnapshot: async slug => { assert.equal(slug, 'brand-test'); reads++; if (!allowed) throw Error('Denied'); return snapshot; } },
    '@/lib/finance/ledger': { ledgerPilotEnabled: () => pilot },
    'next/navigation': { redirect: url => { throw Error('REDIRECT ' + url); }, notFound: () => { throw Error('NOT_FOUND'); } },
    '@/components/finance/finance-login': { FinanceLogin: function TeamLogin() {} },
    '@/components/finance/sales-cashier-login': { SalesCashierLogin: function CashierLogin() {} },
    '@/components/finance/finance-access-denied': { FinanceAccessDenied: function Denied() {} },
    '@/components/finance/finance-workspace': { FinanceWorkspace: function Workspace() {} },
    '@/components/finance/ledger-workspace': { LedgerWorkspace: function Ledger() {} },
  };
  const login = load('app/finance/[slug]/login/page.tsx', mocks).default;
  const workspace = load('app/finance/[slug]/page.tsx', mocks).default;
  const ledger = load('app/finance/[slug]/ledger/page.tsx', mocks).default;
  const args = (search = {}, slug = 'brand-test') => ({ params: Promise.resolve({ slug }), searchParams: Promise.resolve(search) });
  const redirects = async (promise, url) => assert.rejects(promise, error => error.message === 'REDIRECT ' + url);
  await redirects(login(args({ access: 'management' })), '/login');
  assert.equal(reads, 0, 'Anonymous management entry never reads brand data');
  assert.equal((await login(args({ access: 'team' }))).type.name, 'TeamLogin');
  assert.equal((await login(args())).type.name, 'CashierLogin');
  await redirects(workspace(args()), '/finance/brand-test/login?access=team');
  await redirects(ledger(args()), '/finance/brand-test/login?access=team');
  await assert.rejects(login(args({ access: 'management' }, '../bad')), /NOT_FOUND/);
  user = { id: 'owner' }; dashboard = { id: 'brand' };
  await redirects(login(args({ access: 'management' })), '/dashboard/finance');
  await redirects(login(args({ access: 'team' })), '/dashboard/finance');
  await redirects(workspace(args()), '/dashboard/finance');
  await redirects(workspace(args({ section: 'parties', view: 'customer' })), '/dashboard/finance?section=parties&view=customer');
  await redirects(workspace(args({ section: 'parties', party: 'supplier' })), '/dashboard/finance?section=parties&party=supplier');
  await redirects(ledger(args({ document: 'doc&1', section: 'accounts' })), '/dashboard/finance/ledger?document=doc%261&section=accounts');
  assert.equal((await login(args())).type.name, 'CashierLogin', 'Explicit cashier entry remains available');
  allowed = false;
  for (const page of [login, workspace, ledger]) assert.equal((await page(args({ access: 'management' }))).type.name, 'Denied');
  assert.equal((await login(args({ access: 'team' }))).type.name, 'TeamLogin', 'A different signed-in account can authenticate authorized staff without a denial loop');
  allowed = true; pilot = false;
  assert.equal((await ledger(args())).type.name, 'Denied', 'Owner redirect cannot bypass pilot gate');
  pilot = true; dashboard = { id: 'other-brand' };
  await redirects(login(args({ access: 'management' })), '/finance/brand-test');
  assert.equal((await workspace(args())).type.name, 'Workspace');
  assert.equal((await ledger(args())).type.name, 'Ledger');
  dashboard = null;
  for (const role of ['manager', 'accountant', 'warehouse', 'auditor']) {
    snapshot = { ...snapshot, role };
    await redirects(login(args({ access: 'team' })), '/finance/brand-test');
    assert.equal((await workspace(args())).type.name, 'Workspace');
  }
  snapshot = { ...snapshot, role: 'cashier', canManage: false }; dashboard = { id: 'brand' };
  await redirects(login(args({ access: 'team' })), '/finance/brand-test/pos');
  await redirects(workspace(args()), '/finance/brand-test/pos');
  assert.equal((await ledger(args())).type.name, 'Denied');
  console.log('PASS finance entry: normal owner login, authenticated dashboard redirects, preserved sections/document, tenant and entitlement denials, finance staff and explicit cashier entry');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
