const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const exportsForTest = {};
let role = 'owner', menuEnabled = true, branchCafe = 'brand', productCafe = 'brand';
let requestedBranch, menuReads = 0;
const mocks = {
  'server-only': {},
  '@/lib/data/brand-finance': { getBrandFinanceContext: async () => ({ cafe: { id: 'brand', role } }) },
  '@/lib/data/feature-entitlements': { hasBrandFeature: async (id, feature) => { assert.equal(id, 'brand'); assert.equal(feature, 'menu'); return menuEnabled; } },
  '@/lib/data/menu-branches': { getOwnerMenuBranches: async () => ({ cafe: { id: branchCafe }, branches: [{ id: 'primary', primary: true }, { id: 'second' }] }) },
  '@/lib/data/menu': { getOwnerMenu: async branch => { requestedBranch = branch; menuReads++; return { cafe: { id: productCafe }, products: [{ id: 'original-product' }], categories: [] }; } },
};
const js = ts.transpileModule(fs.readFileSync('lib/data/inventory-menu-link.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function('require', 'exports', js)(name => { if (!(name in mocks)) throw new Error(`Unexpected dependency ${name}`); return mocks[name]; }, exportsForTest);
(async () => {
  const { readInventoryMenu } = exportsForTest;
  for (const deniedRole of ['cashier', 'manager', 'warehouse', 'auditor']) {
    role = deniedRole; await assert.rejects(readInventoryMenu());
  }
  assert.equal(menuReads, 0);
  role = 'owner'; menuEnabled = false;
  await assert.rejects(readInventoryMenu()); assert.equal(menuReads, 0);
  menuEnabled = true;
  assert.equal((await readInventoryMenu()).menu.products[0].id, 'original-product');
  assert.equal(requestedBranch, 'primary');
  await readInventoryMenu('second'); assert.equal(requestedBranch, 'second');
  await readInventoryMenu('unbranched'); assert.equal(requestedBranch, null);
  const before = menuReads;
  await assert.rejects(readInventoryMenu('foreign-branch')); assert.equal(menuReads, before);
  branchCafe = 'other'; await assert.rejects(readInventoryMenu()); assert.equal(menuReads, before);
  branchCafe = 'brand'; productCafe = 'other'; await assert.rejects(readInventoryMenu());
  console.log('PASS inventory/menu boundary: owner and menu entitlement, tenant isolation, primary/explicit/unbranched scope, original menu identity without creating stock');
})().catch(error => { console.error(error); process.exitCode = 1; });
