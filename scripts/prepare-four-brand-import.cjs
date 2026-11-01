// Reviewed source-only preparation; --upload writes immutable private assets, never database rows
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict'), sharp = require('sharp');
require('@next/env').loadEnvConfig(process.cwd());
const { createClient } = require('@supabase/supabase-js');
const manifestPath = 'data/imports/four-brands-20261102.json';
const manifestBytes = fs.readFileSync(manifestPath);
const source = JSON.parse(manifestBytes.toString('utf8'));
const dir = 'output/four-brands';
const migration = '20261101231912_four_brand_catalog_identity';
const uploadRequested = process.argv.includes('--upload');
const assetsOnly = process.argv.includes('--assets-only');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const uuid = value => { const h = sha(`${source.importKey}:${value}`); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const quote = v => v == null ? 'NULL' : typeof v === 'boolean' || typeof v === 'number' ? String(v) : "'" + String(v).replaceAll("'", "''") + "'";
const literal = v => v != null && typeof v === 'object' ? `${quote(JSON.stringify(v))}::jsonb` : quote(v);
const insert = (table, row) => `INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(literal).join(',')});`;
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: require('next/dist/compiled/ws') } });
async function read(query) { const { data, error } = await query; if (error) throw Error(error.message); return data; }
function localBytes(asset) {
  const absolute = path.resolve(asset.localPath), root = path.resolve(process.cwd()) + path.sep;
  assert(absolute.startsWith(root), 'Source asset must stay inside this workspace');
  const bytes = fs.readFileSync(absolute);
  assert.equal(sha(bytes), asset.sha256, `Source bytes changed: ${asset.localPath}`);
  return bytes;
}
async function immutableUpload(bucket, target, bytes) {
  const existing = await client.storage.from(bucket).download(target);
  if (!existing.error) { assert(Buffer.from(await existing.data.arrayBuffer()).equals(bytes), 'Existing immutable object differs'); return; }
  if (!['404', '400'].includes(String(existing.error.statusCode))) throw Error(`Cannot inspect asset: ${existing.error.message}`);
  const result = await client.storage.from(bucket).upload(target, bytes, { contentType: 'image/webp', upsert: false, cacheControl: '31536000' });
  if (result.error) throw Error(result.error.message);
}
async function prepareAsset(brand, product, asset, index, logo = false) {
  const bytes = await sharp(localBytes(asset)).rotate().resize({ width: logo ? 900 : 1400, height: logo ? 900 : 1400, fit: 'inside', withoutEnlargement: true }).webp({ quality: logo ? 94 : 86 }).toBuffer();
  const hash = sha(bytes), id = product ? uuid(`${brand.key}/product/${product.sourceId}`) : 'identity';
  const target = `${brand.cafeId}/${id}/${source.importKey}-${logo ? 'logo' : `image-${index}`}-${hash.slice(0, 16)}.webp`;
  fs.writeFileSync(`${dir}/optimized/${brand.key}-${id}-${index}.webp`, bytes);
  if (uploadRequested) await immutableUpload(logo ? 'cafe-logos' : 'menu-products', target, bytes);
  return { bucket: logo ? 'cafe-logos' : 'menu-products', path: target, sha256: hash, sourceSha256: asset.sha256, bytes: bytes.length, provenance: asset.provenance };
}
const ids = source.brands.map(b => quote(b.cafeId)).join(',');
const snapshot = `SELECT jsonb_build_object(
  'subscriptions',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM public.subscriptions t),
  'cards',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM public.loyalty_cards t),
  'products',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM public.menu_products t WHERE cafe_id NOT IN (${ids})),
  'categories',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM public.menu_categories t WHERE cafe_id NOT IN (${ids})),
  'offers',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM public.offers t WHERE cafe_id NOT IN (${ids})),
  'programs',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY cafe_id)::text,'')) FROM public.cafe_loyalty_programs t WHERE cafe_id NOT IN (${ids})),
  'identity',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY cafe_id)::text,'')) FROM public.cafe_custom_identity t WHERE cafe_id NOT IN (${ids})),
  'settings',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY cafe_id)::text,'')) FROM public.cafe_settings t WHERE cafe_id NOT IN (${ids})))`;

(async () => {
  assert.equal(source.brands.length, 4);
  assert.equal(new Set(source.brands.map(b => b.cafeId)).size, 4);
  for (const bucket of ['menu-products', 'cafe-logos']) {
    const data = await read(client.storage.getBucket(bucket)); assert.equal(data.public, false, `${bucket} must be private`);
  }
  fs.mkdirSync(`${dir}/optimized`, { recursive: true });
  const assets = {}, rows = { categories: [], products: [], offers: [] }, brands = [], missing = [];
  for (const brand of source.brands) {
    const live = await read(client.from('cafes').select('id,slug,status').eq('id', brand.cafeId).is('deleted_at', null).single());
    assert.equal(live.slug, brand.slug); assert.equal(live.status, 'active');
    assert(brand.products.every(p => Number.isFinite(p.price) && p.price >= 0));
    assert.equal(new Set(brand.products.map(p => p.sourceId)).size, brand.products.length);
    const logo = fs.existsSync(brand.logo.localPath) && brand.logo.sha256 ? await prepareAsset(brand, null, brand.logo, 0, true) : null;
    if (!logo) missing.push(`${brand.key}/logo`);
    assets[`${brand.key}/logo`] = logo;
    const categories = new Map(brand.categories.map((c, ci) => {
      const row = { id: uuid(`${brand.key}/category/${c.sourceId}`), cafe_id: brand.cafeId, branch_id: null, name: c.name, description: c.description || null, sort_order: ci, visible: true };
      rows.categories.push(row); return [c.sourceId, row.id];
    }));
    let next = 0;
    const prepared = new Array(brand.products.length);
    await Promise.all(Array.from({ length: 5 }, async () => {
      for (;;) {
        const index = next++; if (index >= brand.products.length) return;
        const p = brand.products[index];
        assert(categories.has(p.categorySourceId), `Unknown category ${p.name}`);
        assert(!p.available || p.price > 0, `Published zero price ${p.name}`);
        if (p.available && !p.images.length) missing.push(`${brand.key}/${p.sourceId}`);
        const media = [];
        for (const [i, asset] of p.images.entries()) {
          const result = await prepareAsset(brand, p, asset, i);
          assets[`${brand.key}/${p.sourceId}/${i}`] = result; media.push(result.path);
        }
        const description = [p.description, p.nameEn, p.allergens ? `مسببات الحساسية: ${p.allergens}` : null].filter(Boolean).join('\n');
        const options = p.priceOptions || []; assert(options.length <= 10 && options.every(v => typeof v === 'number' && v >= 0));
        const row = { id: uuid(`${brand.key}/product/${p.sourceId}`), cafe_id: brand.cafeId, branch_id: null, category_id: categories.get(p.categorySourceId), name: p.name, description, price: p.price, price_options: `{${options.join(',')}}`, calories: p.calories, sort_order: index, available: p.available, catalog_kind: p.catalogKind, image_storage_path: media[0] || null, gallery_storage_paths: `{${media.slice(1).join(',')}}` };
        prepared[index] = row;
      }
    }));
    rows.products.push(...prepared);
    const featured = brand.products.filter(p => p.featured && p.available);
    assert.equal(featured.length, 3, `Three reviewed highlights required for ${brand.key}`);
    for (const p of featured) {
      const productId = uuid(`${brand.key}/product/${p.sourceId}`);
      rows.offers.push({ id: uuid(`${brand.key}/offer/${p.sourceId}`), cafe_id: brand.cafeId, branch_id: null, title: p.name, description: `اكتشف ${p.name} من ${brand.name}`, offer_type: 'عرض مخصص', status: 'active', placement: 'both', visible_in_cafe: true, target_type: 'products', linked_product_id: productId, discount_percent: null, offer_rules: { selectedProductIds: [productId] } });
    }
    brands.push({ ...brand, logoPath: logo?.path });
  }
  const plan = { at: new Date().toISOString(), sourceSha256: sha(manifestBytes), migration, missing, assets, rows, brands: brands.map(b => ({ key: b.key, cafeId: b.cafeId, slug: b.slug, logoPath: b.logoPath })) };
  fs.writeFileSync(`${dir}/import-plan.json`, JSON.stringify(plan, null, 2));
  if (assetsOnly) { console.log(JSON.stringify({ mode: uploadRequested ? 'available immutable assets uploaded' : 'assets prepared', missing, assetCount: Object.keys(assets).length })); return; }
  assert.equal(missing.length, 0, `Missing publishable assets: ${missing.join(', ')}`);
  let sql = `-- Verified four-brand catalog import; unavailable owner-review drafts never appear publicly\nBEGIN;\nSET LOCAL lock_timeout='5s';\nCREATE TEMP TABLE four_catalog_before ON COMMIT DROP AS ${snapshot} snapshot;\n`;
  sql += `DO $identity$ BEGIN\n`;
  for (const b of brands) sql += `IF NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=${quote(b.cafeId)} AND slug=${quote(b.slug)} AND status='active' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Brand identity changed: ${b.key}';END IF;\n`;
  sql += `END $identity$;\n`;
  for (const [table, key] of [['menu_categories', 'categories'], ['menu_products', 'products'], ['offers', 'offers']]) {
    const temp = `four_expected_${key}`, columns = Object.keys(rows[key][0]).join(',');
    sql += `CREATE TEMP TABLE ${temp} ON COMMIT DROP AS SELECT * FROM public.${table} WITH NO DATA;\n`;
    sql += rows[key].map(row => insert(temp, row)).join('\n') + '\n';
    sql += `DO $catalog$ BEGIN IF EXISTS(SELECT 1 FROM public.${table} WHERE cafe_id IN (${ids})) AND (EXISTS(SELECT ${columns} FROM public.${table} WHERE cafe_id IN (${ids}) EXCEPT SELECT ${columns} FROM ${temp}) OR EXISTS(SELECT ${columns} FROM ${temp} EXCEPT SELECT ${columns} FROM public.${table} WHERE cafe_id IN (${ids}))) THEN RAISE EXCEPTION 'Existing ${key} differ; preserve owner changes and review import'; END IF; END $catalog$;\n`;
    sql += `INSERT INTO public.${table}(${columns}) SELECT ${columns} FROM ${temp} ON CONFLICT(id) DO NOTHING;\n`;
  }
  for (const b of brands) {
    sql += `DO $logo$ BEGIN IF EXISTS(SELECT 1 FROM public.cafe_settings WHERE cafe_id=${quote(b.cafeId)} AND (logo_storage_path IS NOT NULL AND logo_storage_path IS DISTINCT FROM ${quote(b.logoPath)} OR logo_url IS NOT NULL)) OR EXISTS(SELECT 1 FROM public.cafe_custom_identity WHERE cafe_id=${quote(b.cafeId)} AND (logo_storage_path IS NOT NULL AND logo_storage_path IS DISTINCT FROM ${quote(b.logoPath)} OR logo_url IS NOT NULL)) THEN RAISE EXCEPTION 'Existing logo differs: ${b.key}';END IF;END $logo$;\n`;
    sql += `UPDATE public.cafe_settings SET logo_storage_path=${quote(b.logoPath)},logo_url=null,description=coalesce(description,${quote(b.description)}::text),updated_at=now() WHERE cafe_id=${quote(b.cafeId)} AND (logo_storage_path,logo_url,description) IS DISTINCT FROM (${quote(b.logoPath)},null::text,coalesce(description,${quote(b.description)}::text));\n`;
    const identity = { cafe_id: b.cafeId, logo_storage_path: b.logoPath, logo_url: null, palette: b.palette };
    sql += insert('public.cafe_custom_identity', identity).replace(/;$/, ` ON CONFLICT(cafe_id) DO UPDATE SET logo_storage_path=excluded.logo_storage_path,logo_url=null,palette=excluded.palette,updated_at=now() WHERE (cafe_custom_identity.logo_storage_path,cafe_custom_identity.logo_url,cafe_custom_identity.palette) IS DISTINCT FROM (excluded.logo_storage_path,null::text,excluded.palette);`) + '\n';
    sql += `UPDATE public.cafe_loyalty_programs SET card_background=${quote(b.palette.primary)},card_foreground=${quote(b.palette.text)},card_accent=${quote(b.palette.accent)},updated_at=now() WHERE cafe_id=${quote(b.cafeId)} AND (card_background,card_foreground,card_accent) IS DISTINCT FROM (${quote(b.palette.primary)},${quote(b.palette.text)},${quote(b.palette.accent)});\n`;
  }
  sql += `DO $verify$ DECLARE actual jsonb; BEGIN ${snapshot} INTO actual;IF actual IS DISTINCT FROM (SELECT snapshot FROM four_catalog_before) THEN RAISE EXCEPTION 'Other brands, subscriptions or customer cards changed';END IF;\n`;
  sql += `IF (SELECT count(*) FROM public.menu_products WHERE cafe_id IN (${ids}))<>${rows.products.length} OR (SELECT count(*) FROM public.menu_products WHERE cafe_id IN (${ids}) AND available AND image_storage_path IS NOT NULL)<>${rows.products.filter(p => p.available).length} OR (SELECT count(*) FROM public.offers WHERE cafe_id IN (${ids}))<>12 THEN RAISE EXCEPTION 'Import count or published media mismatch';END IF;END $verify$;\nCOMMIT;\n`;
  fs.writeFileSync(`supabase/migrations/${migration}.sql`, sql);
  fs.writeFileSync(`${dir}/import.sql`, sql);
  fs.writeFileSync(`${dir}/import-rollback.sql`, sql.replace(/COMMIT;\s*$/, 'ROLLBACK;'));
  console.log(JSON.stringify({ mode: uploadRequested ? 'immutable assets uploaded; SQL not applied' : 'prepared only', categories: rows.categories.length, products: rows.products.length, published: rows.products.filter(p => p.available).length, drafts: rows.products.filter(p => !p.available).length, highlights: rows.offers.length, migration }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
