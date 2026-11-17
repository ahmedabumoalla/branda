const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, mocks = {}) {
  const result = {};
  new Function('require', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText)(name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts', mocks);
    return require(name);
  }, result);
  return result;
}
const { resolveBranchMenuSource } = load('lib/menu/branch-source.ts');
const root = { id: '11111111-1111-4111-8111-111111111111', active: true, menu_slug: 'legacy', uses_brand_menu: false, is_brand_menu_root: true };
const inherited = { ...root, id: '22222222-2222-4222-8222-222222222222', menu_slug: 'new', uses_brand_menu: true, is_brand_menu_root: false };
const independent = { ...inherited, uses_brand_menu: false };
const cafeId = '33333333-3333-4333-8333-333333333333';
const recordId = '44444444-4444-4444-8444-444444444444';
assert.deepEqual(resolveBranchMenuSource([], null, true), { branch: null, sourceBranchId: null });
assert.equal(resolveBranchMenuSource([inherited], null, true).sourceBranchId, null);
assert.equal(resolveBranchMenuSource([independent], null, true).sourceBranchId, null);
assert.equal(resolveBranchMenuSource([inherited, root], inherited.id, true).sourceBranchId, root.id);
assert.equal(resolveBranchMenuSource([independent, root], independent.id, true).sourceBranchId, independent.id);
assert.equal(resolveBranchMenuSource([root], 'foreign', true), null);
assert.equal(resolveBranchMenuSource([{ ...root, deleted_at: 'deleted' }], null, true), null);
assert.equal(resolveBranchMenuSource([{ ...root, active: false }, inherited], inherited.id, true), null);
assert.equal(resolveBranchMenuSource([{ ...root, active: false }, independent], independent.id, true).sourceBranchId, independent.id);
assert.equal(resolveBranchMenuSource([{ ...root, active: false }], null, false).sourceBranchId, root.id);
assert.equal(resolveBranchMenuSource([root, { ...root, id: 'duplicate' }], null, true), null);
assert.equal(resolveBranchMenuSource([{ ...root, uses_brand_menu: true }], null, true), null);

let branchRows = [root, inherited];
let recordBranch = inherited.id;
let writes = 0;
const client = {
  from(table) {
    let rows = table === 'branches' ? branchRows.map(branch => ({ ...branch, cafe_id: cafeId })) : [{ id: recordId, cafe_id: cafeId, branch_id: recordBranch, available: true, visible: true }];
    let payload;
    const chain = {
      select() { return chain; },
      eq(key, value) { rows = rows.filter(row => row[key] === value); return chain; },
      is(key, value) { rows = rows.filter(row => (row[key] ?? null) === value); return chain; },
      in(key, values) { rows = rows.filter(row => values.includes(row[key])); return chain; },
      or(filter) { const [key, operator, value] = filter.split('.'); rows = rows.filter(row => operator === 'is' ? (row[key] ?? null) === null : row[key] === value); return chain; },
      order() { return chain; },
      update(value) { writes++; payload = value; return chain; },
      insert(value) { writes++; payload = value; return chain; },
      single: async () => ({ data: { id: recordId, ...payload }, error: null }),
      maybeSingle: async () => ({ data: rows[0] ? { ...rows[0], ...payload } : null, error: null }),
      then(resolve, reject) { return Promise.resolve({ data: rows, count: 0, error: null }).then(resolve, reject); },
    };
    return chain;
  },
};
const dal = load('lib/data/menu.ts', {
  'next/cache': { revalidatePath() {} },
  '@/lib/supabase/server': { createClient: async () => client },
  '@/lib/supabase/admin': { createAdminClient: () => client },
  '@/lib/data/cafes': { requireOwnerCafeContext: async () => ({ id: cafeId, slug: 'brand', businessCategory: 'cafes' }), getPublicCafeBySlugAdmin: async () => ({ id: cafeId, slug: 'brand' }) },
  '@/lib/performance/server-memory-cache': { clearServerMemoryCache() {} },
  '@/lib/menu/standalone-menu': {},
  '@/lib/data/mappers': { mapDbCategoryToRecord: (_, row) => row, mapDbProductToMenuProduct: row => row },
});
const product = { id: recordId, name: 'Item', price: 12, loyaltyPoints: 0, redeemableWithPoints: false, availableForPickup: true, ingredients: [], available: true, imageVariant: 'latte' };
const category = { id: recordId, name: 'Category', sortOrder: 0, visible: true, featured: false };
async function run() {
  for (const write of [() => dal.upsertMenuProduct(product), () => dal.upsertMenuProduct({ ...product, branchId: null }), () => dal.softDeleteMenuProduct(recordId), () => dal.upsertMenuCategory(category), () => dal.softDeleteMenuCategory(recordId)]) {
    await assert.rejects(write, /المنيو الأساسي/);
  }
  assert.equal(writes, 0, 'Old inherited product/category records are immutable even when a request moves them to base');
  recordBranch = null;
  await assert.rejects(() => dal.upsertMenuProduct({ ...product, branchId: inherited.id }), /المنيو الأساسي/);
  await assert.rejects(() => dal.upsertMenuCategory({ ...category, branchId: '55555555-5555-4555-8555-555555555555' }), /الحساب/);
  assert.equal(writes, 0, 'Inherited and foreign target branches reject before mutations');
  branchRows = [root, independent];
  recordBranch = independent.id;
  await dal.upsertMenuProduct({ ...product, branchId: independent.id });
  await dal.upsertMenuCategory({ ...category, branchId: independent.id });
  assert.equal(writes, 2, 'Independent mode restores editing of original records');
  const main = await dal.getOwnerMenu('main');
  assert.equal(main.products.length, 0, 'Main reads root only, never first new independent records');
  await assert.rejects(() => dal.getOwnerMenu('55555555-5555-4555-8555-555555555555'), /غير متاح/);
  assert.equal((await dal.getPublicMenuBySlug('brand')).products.length, 0, 'Public product readers exclude independent branch products from main');
  recordBranch = root.id;
  assert.equal((await dal.getPublicMenuBySlug('brand')).products.length, 1, 'Public product readers use the fixed root');
  branchRows = [{ ...root, active: false }];
  recordBranch = null;
  assert.equal((await dal.getPublicMenuBySlug('brand')).products.length, 0, 'Inactive root does not expose the base catalogue through product readers');
  branchRows = [independent];
  assert.equal((await dal.getPublicMenuBySlug('brand')).products.length, 1, 'No marked root preserves base even when the first branch is independent');
  let ownerBranches = [{ id: inherited.id, name: 'New branch', slug: 'new', usesBrandMenu: true, brandMenuRoot: false }];
  let features = ['menu'];
  const readIds = [];
  const DashboardMenuPage = load('app/dashboard/menu/page.tsx', {
    '@/components/dashboard/pages/menu-page': { MenuPageClient: 'editor' },
    '@/components/dashboard/pages/branch-inherited-menu': { BranchInheritedMenu: 'inherited-view' },
    '@/components/dashboard/feature-blocked-state': { DashboardFeatureBlockedState: 'blocked-view' },
    '@/lib/barndaksa/env': { isSupabaseConfigured: () => true },
    '@/lib/data/feature-entitlements': { getOwnerFeatureCodes: async () => features },
    '@/lib/data/cafes': { requireOwnerCafeContext: async () => ({ id: cafeId, staff: null }) },
    '@/lib/data/menu': { getOwnerMenu: async id => { readIds.push(id); return { cafe: { slug: 'brand' }, products: [], categories: [] }; } },
    '@/lib/data/menu-branches': { getOwnerMenuBranches: async () => ({ branches: ownerBranches }) },
    'next/navigation': { redirect: destination => { throw new Error(`redirect:${destination}`); } },
  }).default;
  let page = await DashboardMenuPage({ searchParams: Promise.resolve({}) });
  assert.equal(page.type, 'editor');assert.equal(page.props.branchId, null);assert.equal(readIds.pop(), 'main');
  assert.equal(page.props.branches[0].id, 'main', 'The unbranched main editor remains explicitly reachable');
  page = await DashboardMenuPage({ searchParams: Promise.resolve({ branch: inherited.id }) });
  assert.equal(page.type, 'inherited-view');assert.equal(page.props.branch.id, inherited.id);assert.equal(readIds.pop(), inherited.id);
  ownerBranches = [...ownerBranches, { id: root.id, name: 'Legacy root', slug: 'legacy', brandMenuRoot: true, usesBrandMenu: false }];
  page = await DashboardMenuPage({ searchParams: Promise.resolve({ branch: 'main' }) });
  assert.equal(page.props.branchId, root.id, 'Main writes preserve the marked legacy root rather than creating a new catalogue');
  ownerBranches[0].usesBrandMenu = false;
  page = await DashboardMenuPage({ searchParams: Promise.resolve({ branch: inherited.id }) });
  assert.equal(page.type, 'editor');assert.equal(page.props.branchId, inherited.id);
  features = [];
  assert.equal((await DashboardMenuPage({ searchParams: Promise.resolve({}) })).type, 'blocked-view');
  features = ['menu', 'finance'];
  await assert.rejects(() => DashboardMenuPage({ searchParams: Promise.resolve({ branch: 'main' }) }), /^Error: redirect:\/dashboard\/system\/inventory\/items\?view=products$/);
  console.log('Branch source selection and owner write guards passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
