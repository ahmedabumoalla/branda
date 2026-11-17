const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cafeId = 'ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef';
// Imported PostgreSQL UUIDs need not carry RFC version/variant bits
const productId = '7003dee7-c7e5-abbe-872b-4410c2bc2f37';
const categoryId = '917cf71c-01da-e10d-3d3a-0eebee1012a9';
let allowed = true, row, writes, filters;
function reset() { row = { id: productId, cafe_id: cafeId, branch_id: null, deleted_at: null, price: 8, commerce_details: { menuPriceRange: { min: 8, max: 12 } } }; writes = []; filters = []; }
const client = { from(table) {
  let selected = [row], payload;
  const chain = {
    select() { return chain; },
    eq(key, value) { filters.push([key, value]); selected = selected.filter(item => key === 'commerce_details' ? JSON.stringify(item[key]) === value : item[key] === value); return chain; },
    is(key, value) { selected = selected.filter(item => (item[key] ?? null) === value); return chain; },
    update(value) { payload = value; return chain; },
    insert() { throw Error('An existing product must not be recreated'); },
    async maybeSingle() { if (payload && selected.length) { writes.push(payload); row = { ...row, ...payload }; } return { data: selected.length ? row : null, error: null }; },
  }; return chain;
} };
const mocks = {
  'server-only': {}, 'next/cache': { revalidatePath() {} },
  '@/lib/supabase/server': { createClient: async () => client }, '@/lib/supabase/admin': { createAdminClient: () => client },
  '@/lib/data/cafes': { requireOwnerCafeContext: async () => { if (!allowed) throw Error('unauthorized'); return { id: cafeId, slug: 'mind-hospital', businessCategory: 'cafes_coffee' }; } },
  '@/lib/performance/server-memory-cache': { clearServerMemoryCache() {} }, '@/lib/menu/standalone-menu': {}, '@/lib/data/mappers': {},
};
function load(file) { const exports = {}; new Function('require', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText)(name => {
  if (name in mocks) return mocks[name];
  if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
  if (name.startsWith('.')) return load(path.join(path.dirname(file), name) + '.ts');
  return require(name);
}, exports); return exports; }
const dal = load('lib/data/menu.ts');
const product = { id: productId, categoryId, name: 'Imported item', price: 11, priceMode: 'fixed', loyaltyPoints: 0, redeemableWithPoints: false, availableForPickup: true, ingredients: [], available: true, imageVariant: 'latte' };
(async () => {
  reset(); await dal.upsertMenuProduct({ ...product, expectedCommerceDetails: row.commerce_details });
  assert.equal(row.id, productId); assert.equal(row.price, 11); assert.equal(row.category_id, categoryId); assert.deepEqual(row.commerce_details, { menuPriceMode: 'fixed' }); assert.equal(writes.length, 1);
  assert(filters.some(([key, value]) => key === 'cafe_id' && value === cafeId));
  await dal.upsertMenuProduct({ ...product, priceMode: 'cashier', expectedCommerceDetails: row.commerce_details }); assert.equal(row.price, 0); assert.equal(row.commerce_details.menuPriceMode, 'cashier');
  reset(); await assert.rejects(() => dal.upsertMenuProduct({ ...product, expectedCommerceDetails: { menuPriceMode: 'fixed' } }), /تغيرت/); assert.equal(writes.length, 0);
  for (const invalid of [{ id: 'not-an-id' }, { categoryId: 'x'.repeat(36) }, { price: -1 }, { price: NaN }, { price: Infinity }]) { reset(); await assert.rejects(() => dal.upsertMenuProduct({ ...product, ...invalid })); assert.equal(writes.length, 0); }
  reset(); row.cafe_id = '11111111-1111-4111-8111-111111111111'; await assert.rejects(() => dal.upsertMenuProduct(product)); assert.equal(writes.length, 0);
  reset(); allowed = false; await assert.rejects(() => dal.upsertMenuProduct(product), /unauthorized/); assert.equal(writes.length, 0);
  console.log('PASS imported product/category price save, fixed/cashier modes, concurrent edit protection, invalid values, foreign scope and authorization');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
