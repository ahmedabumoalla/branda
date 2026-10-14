const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { test } = require('node:test');
const source = fs.readFileSync('lib/data/menu.ts', 'utf8');
const owner = source.slice(source.indexOf('export async function getOwnerMenu()'), source.indexOf('\nconst ', source.indexOf('export async function getOwnerMenu()')));
const compiled = ts.transpileModule(owner, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
async function run(authorized = true) {
  const signedPaths = [];
  const rows = [{ id: 'one', imageAssetId: 'own/main.webp', imageGallery: [{ imageAssetId: 'own/gallery.webp' }] }, { id: 'two', imageAssetId: 'foreign/private.webp', imageGallery: [] }];
  const supabase = { from(table) { const q = { select: () => q, eq: () => q, is: () => q, order: async () => ({ data: table === 'menu_products' ? rows : [] }) }; return q; } };
  const exports = {};
  new Function('exports', 'requireOwnerCafeContext', 'createClient', 'createAdminClient', 'mapDbProductToMenuProduct', 'mapDbCategoryToRecord', 'attachEventTicketSettings', 'isOwnedMenuAsset', compiled)(exports,
    async () => { if (!authorized) throw Error('denied'); return { id: 'own', slug: 'taza' }; }, async () => supabase,
    () => ({ storage: { from: () => ({ createSignedUrls: async (paths, ttl) => { assert.equal(ttl, 600); signedPaths.push(...paths); return { data: paths.map(path => ({ path, signedUrl: `https://storage.test/${path}` })) }; } }) } }),
    row => structuredClone(row), row => row, async (_, __, products) => products,
    (path, id) => path.startsWith(`${id}/`) && !path.includes('..') && !path.includes('\\') && !path.includes('%'));
  return { get: exports.getOwnerMenu, signedPaths };
}
test('authorized owner receives main and gallery images without public visibility; foreign paths are not signed', async () => {
  const { get, signedPaths } = await run(); const result = await get();
  assert.deepEqual(signedPaths, ['own/main.webp', 'own/gallery.webp']);
  assert.equal(result.products[0].imageDataUrl, 'https://storage.test/own/main.webp');
  assert.equal(result.products[0].imageGallery[0].imageDataUrl, 'https://storage.test/own/gallery.webp');
  assert.equal(result.products[1].imageDataUrl, undefined);
});
test('unauthorized context cannot sign media', async () => {
  const { get, signedPaths } = await run(false); await assert.rejects(get, /denied/); assert.deepEqual(signedPaths, []);
});
test('public getter does not acquire the owner signing capability', () => {
  const publicBody = source.slice(source.indexOf('export async function getPublicMenuBySlug'), source.indexOf('export async function getOwnerMenu'));
  assert(!publicBody.includes('createSignedUrls'));
});
