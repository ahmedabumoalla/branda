// One-time, explicitly scoped rollout requested on 2026-09-07
// Read-only by default; --apply enables publication for these existing brands only
const assert = require('node:assert/strict');
const { createClient } = require('@supabase/supabase-js');
const targets = {
  'bb404c1a-a439-41ab-aed8-ea0c17875bd9': 'double-b-bistro',
  'bb1c5670-b8e0-4973-895a-c8082933db6e': 'h9t',
  '9018ddfc-bd63-4a7c-84b5-24f5b96f2752': 'test-zone',
  '1657836c-94f6-4fe4-9b6d-2edee88931e6': 'bab-al-saqifah',
  '9add7e16-ad6b-48cd-ad33-6a41cb1148e1': 'basilico',
  '92c03c84-3601-4e65-bfa5-8163a20449b7': 'test',
  '2e08901c-5aac-4bec-8c97-a135058e508b': 'test-cafe',
  'fc2039be-1ae8-40a8-9a99-a15ee15f60db': 'my-brand',
  'd894f559-0fed-49db-9a19-490206b66f17': 'dobamin',
  'c5bf1e2e-37c5-4d35-a57d-2430a1f661df': 'loung-zie-alhwa',
  'de1a95a6-faf7-4370-b689-987694ff9bba': 'sahar2-loung',
  '966d39b9-1985-412c-8602-a3829566e27b': 'sahar-loung2',
  '83b37bcd-353a-43e2-aa1a-735ba21d65ed': 'shahi-w-hail',
  '461b7a5b-3066-4e22-a91b-b9a98a311ead': 'shay-baker',
  '595c9f7c-3e71-4427-ab51-d71209fb041e': 'eshiq-roz',
  '97caeede-c975-4253-b268-a2abf35249d2': 'barnda-event',
  '6f1259df-111d-4de8-97e1-2669a43cfadc': 'rashfa-w-jamra',
  'e426ea06-d2cb-4a64-9537-5575f52196ba': 'meknes-loung',
  '3cc5e304-9db7-4e29-a0f0-22c017fc27f1': 'shawaya-sara',
  'af4ef688-19e5-412b-8271-7115ed542d13': 'barnda-resturant',
  'fbd92cd0-c4b6-41b5-81dd-1d45a01d01e8': 'kat-coffe',
  'f9cbcae4-38cb-4947-ba13-827371f23ac6': 'wans-alkif',
};
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }, realtime: { transport: require('next/dist/compiled/ws') },
});
async function result(query) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}
async function run() {
  const ids = Object.keys(targets);
  const brands = await result(client.from('cafes').select('id,name,slug,status').in('id', ids).is('deleted_at', null));
  assert.equal(brands.length, ids.length, 'Target deleted or missing; inspect before proceeding');
  for (const brand of brands) assert.equal(brand.slug, targets[brand.id], 'Target slug changed');
  const prior = await result(client.from('brand_feature_overrides').select('cafe_id,enabled').in('cafe_id', ids).eq('feature_id', 'standalone_menu'));
  const priorById = new Map(prior.map(row => [row.cafe_id, row.enabled]));
  const changes = brands.filter(brand => priorById.get(brand.id) !== true);
  console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'read-only', prior, toEnable: changes.map(brand => brand.slug) }));
  if (process.argv.includes('--apply') && changes.length) {
    // Only publication flags are touched; account status, plans and catalog data are unchanged
    await result(client.from('brand_feature_overrides').upsert(changes.map(brand => ({
      cafe_id: brand.id, feature_id: 'standalone_menu', enabled: true,
    })), { onConflict: 'cafe_id,feature_id' }));
  }
  if (!process.argv.includes('--verify')) return;
  const flags = await result(client.from('brand_feature_overrides').select('cafe_id,enabled').in('cafe_id', ids).eq('feature_id', 'standalone_menu'));
  assert.equal(flags.length, ids.length);
  assert.ok(flags.every(flag => flag.enabled === true));
  let total = 0;
  for (const brand of brands) {
    const categories = await result(client.from('menu_categories').select('id').eq('cafe_id', brand.id).eq('visible', true).is('deleted_at', null));
    const visible = new Set(categories.map(row => row.id));
    const products = [];
    for (let offset = 0; ; offset += 500) {
      const page = await result(client.from('menu_products').select('id,category_id').eq('cafe_id', brand.id).is('deleted_at', null).order('id').range(offset, offset + 499));
      products.push(...page.filter(row => !row.category_id || visible.has(row.category_id)));
      if (page.length < 500) break;
    }
    const url = `https://barndaksa.com/menu/${brand.slug}`;
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(60000) });
    assert.equal(response.status, 200, `Public response for ${brand.slug}`);
    const html = await response.text();
    assert.ok(html.includes('referenceMenu'), `Shared reference theme for ${brand.slug}`);
    assert.ok(html.includes('brandWordmark'), `Shared brand identity header for ${brand.slug}`);
    const processedLogos = [...html.matchAll(/\/menu-logos\/[^"<>\\\s]+/g)].map(match => match[0]);
    assert.ok(processedLogos.every(url => brand.slug === 'kat-coffe' && url === '/menu-logos/kath-transparent-v1.webp'), 'Only the approved Kath cutout may be published');
    const cardIds = [...html.matchAll(/data-product-id="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(cardIds.sort(), products.map(row => row.id).sort(), `Tenant products for ${brand.slug}`);
    assert.ok(!html.includes('lucide-shopping-cart'));
    assert.ok(html.includes(brand.name.replaceAll('&', '&amp;')), `Brand name for ${brand.slug}`);
    total += products.length;
    console.log(JSON.stringify({ name: brand.name, url, published: true, products: products.length, verified: true }));
  }
  const after = await result(client.from('cafes').select('id,status').in('id', ids));
  for (const brand of brands) assert.equal(after.find(row => row.id === brand.id).status, brand.status);
  console.log(`PASS: ${brands.length} independent menus, ${total} tenant-scoped product cards, account statuses unchanged`);
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
