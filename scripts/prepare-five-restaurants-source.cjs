// Normalize visually reviewed menu transcriptions; never infer prices or photo matches.
const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const base = 'output/five-restaurants';
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const accounts = read(`${base}/accounts.json`).accounts;
const ids = { hulm: '948d09e1-93bd-4b23-be49-f1599603f4ba', arabi: 'f4c0146b-f2c3-4ced-a8dd-d505bb2e847d', masala: '80e930af-0795-4d79-aa5c-d9999bc46c1d', nineteen: '757079d2-1ada-4a1f-80e8-7abf5174d6a4', rayhan: '486af4c2-4a99-4dbd-881b-1f66f06dd247' };
const expected = { hulm: 21, arabi: 32, masala: 17, nineteen: 47, rayhan: 26 };
const imageFile = `${base}/product-assets.json`, identityFile = `${base}/identity-assets.json`;
const imageMap = {};
for (const assetFile of [imageFile, `${base}/generated-product-assets.json`]) {
  if (!fs.existsSync(assetFile)) continue;
  const input = read(assetFile);
  const entries = Array.isArray(input.products) ? input.products : Object.entries(input).flatMap(([brand, products]) => Object.entries(products).map(([sourceId, entry]) => ({ ...entry, brand, sourceId })));
  for (const entry of entries) {
    if (!entry.localPath || entry.status === 'needs-generation') continue;
    assert(ids[entry.brand], `Unknown image brand ${entry.brand}`);
    assert(entry.sourceId && /^[a-f0-9]{64}$/.test(entry.sha256), 'Image identifier and digest required');
    assert.equal(hash(entry.localPath), entry.sha256, `Source asset changed ${entry.brand}/${entry.sourceId}`);
    imageMap[entry.brand] ||= {};
    assert(!imageMap[entry.brand][entry.sourceId], `Duplicate photo assignment ${entry.brand}/${entry.sourceId}`);
    imageMap[entry.brand][entry.sourceId] = entry;
  }
}
const identityMap = fs.existsSync(identityFile) ? read(identityFile) : {};
const brands = Object.entries(ids).map(([key, id]) => {
  const account = accounts.find(a => a.id === id); assert(account);
  const file = key === 'rayhan' ? `${base}/rayhan-source/reviewed.json` : `${base}/extracted/${key}-reviewed.json`;
  const input = read(file);
  const products = input.products.map((p, index) => {
    const sourceId = key === 'rayhan' ? p.sourceId : `${key}-p${String(index + 1).padStart(3, '0')}`;
    const price = p.price, verified = Number.isFinite(price) && price > 0;
    return { sourceId, name: p.name || p.name_ar, nameEn: p.name_en || null,
      category: p.category || p.category_ar, price, available: verified && p.available !== false,
      priceStatus: p.priceStatus || (verified ? 'source-pdf-verified' : 'missing-disabled'),
      description: p.description || '', calories: p.calories_kcal ?? p.calories ?? null,
      variants: p.variants || [], sourcePage: p.source_page || p.sourcePage,
      sourcePosition: p.source_position || p.sourcePosition, priceEvidence: p.priceEvidence || null,
      uncertainties: p.uncertainties || [], image: imageMap[key]?.[sourceId] || null };
  });
  assert.equal(products.length, expected[key]);
  assert.equal(new Set(products.map(p => p.sourceId)).size, products.length);
  assert(products.every(p => p.name && p.category));
  const categories = input.categories || input.categoryOrder;
  assert(products.every(p => categories.includes(p.category)));
  return { key, cafeId: account.id, slug: account.slug, brandName: account.name,
    importKey: `five-restaurants-${key}-20261103`, sourceManifest: file, sourceSha256: hash(file),
    sourceDocument: input.source_pdf ? { localPath: input.source_pdf, sha256: input.source_pdf_sha256 } : input.menu,
    sourceCurrency: input.currency, currency: 'SAR', categories, products,
    identity: identityMap[key] || null, loyalty: { stamps: 6, rewardKind: 'discount', discountPercent: 10 } };
});
fs.mkdirSync('data/imports', { recursive: true });
const result = { version: 1, importKey: 'five-restaurants-20261103', brands };
fs.writeFileSync('data/imports/five-restaurants-source-20261103.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ brands: brands.map(b => ({ key: b.key, products: b.products.length, active: b.products.filter(p => p.available).length, photos: b.products.filter(p => p.image).length, identityReady: !!b.identity })), total: brands.reduce((n,b) => n + b.products.length, 0) }));
