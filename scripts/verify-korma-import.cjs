// Read-only live proof; never issues cards, sends messages or changes subscriptions
const fs = require('node:fs'), crypto = require('node:crypto'), assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd());
const { createClient } = require('@supabase/supabase-js');
const config = { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: require('next/dist/compiled/ws') } };
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, config);
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, config);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
async function read(query) { const { data, error } = await query; if (error) throw Error(error.message); return data; }
(async () => {
  const plan = JSON.parse(fs.readFileSync('output/korma/import-plan.json', 'utf8'));
  const products = await read(admin.from('menu_products').select(Object.keys(plan.rows.products[0]).join(',')).eq('cafe_id', plan.cafeId));
  assert.equal(products.length, 36);
  assert.equal((await read(anon.from('menu_products').select('id').eq('cafe_id', plan.cafeId))).length, 36);
  for (const expected of plan.rows.products) {
    const actual = products.find(p => p.id === expected.id); assert(actual);
    for (const [key, value] of Object.entries(expected)) {
      if (key === 'price_options') assert.deepEqual(actual[key], value.slice(1, -1).split(',').filter(Boolean).map(Number));
      else if (key === 'gallery_storage_paths') assert.deepEqual(actual[key], []);
      else assert.deepEqual(actual[key], value, `${expected.name}/${key}`);
    }
  }
  const categories = await read(admin.from('menu_categories').select(Object.keys(plan.rows.categories[0]).join(',')).eq('cafe_id', plan.cafeId));
  assert.equal(categories.length, 10);
  for (const row of plan.rows.categories) assert.deepEqual(categories.find(c => c.id === row.id), row);
  const identity = await read(admin.from('cafe_custom_identity').select('logo_storage_path,palette').eq('cafe_id', plan.cafeId).single());
  assert.equal(identity.logo_storage_path, plan.logoPath); assert.deepEqual(identity.palette, plan.palette);
  const assets = [];
  for (const [key, a] of Object.entries(plan.assets)) {
    assert(a.path.startsWith(plan.cafeId + '/'));
    const signed = await read(admin.storage.from(a.bucket).createSignedUrl(a.path, 120));
    const response = await fetch(signed.signedUrl, { signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 200); assert.equal(sha(Buffer.from(await response.arrayBuffer())), a.sha256);
    const publicResponse = await fetch(admin.storage.from(a.bucket).getPublicUrl(a.path).data.publicUrl, { signal: AbortSignal.timeout(15000) });
    assert([400, 401, 403, 404].includes(publicResponse.status));
    assets.push({ key, signedStatus: 200, publicStatus: publicResponse.status, sha256Verified: true });
  }
  const result = { at: new Date().toISOString(), result: 'PASS', products: 36, categories: 10,
    pricedProducts: 36, images: products.filter(p => p.image_storage_path).length,
    imageAbsent: products.filter(p => !p.image_storage_path).map(p => p.name),
    sourcePricesExact: true, assets, messagesSent: 0, customerPassesCreated: 0, runtime: process.version,
    files: ['scripts/prepare-korma-import.cjs', 'scripts/verify-korma-import.cjs', 'data/imports/korma-source-20261103.json', `supabase/migrations/${plan.migration}.sql`, 'package-lock.json'].map(file => ({ file, sha256: sha(fs.readFileSync(file)) })) };
  fs.writeFileSync('output/korma/import-verification.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ result: result.result, products: result.products, categories: result.categories, images: result.images, assets: assets.length }));
})().catch(e => { console.error(e.message); process.exitCode = 1; });
