// Reviewed Together Plants source import. This script never mutates database rows.
// --upload writes only immutable, cafe-scoped original assets into existing private buckets.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict'), sharp = require('sharp');
require('@next/env').loadEnvConfig(process.cwd());
const { createClient } = require('@supabase/supabase-js');
const source = JSON.parse(fs.readFileSync('data/imports/together-20261101.json', 'utf8'));
const cafe = '4e5a661a-7029-40ec-a3bc-dc75959a05bb', slug = 'brand-871ec6e243c0', dir = 'output/together';
const migration = '20261031235639_together_catalog_identity_loyalty';
const uuid = value => { const h = crypto.createHash('sha256').update(`together-20261101:${value}`).digest('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`; };
const quote = value => value == null ? 'NULL' : typeof value === 'boolean' || typeof value === 'number' ? String(value) : "'" + String(value).replaceAll("'", "''") + "'";
const json = value => quote(JSON.stringify(value)) + '::jsonb';
const insert = (table, row) => `INSERT INTO public.${table}(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(v => v !== null && typeof v === 'object' ? json(v) : quote(v)).join(',')});`;
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, realtime: { transport: require('next/dist/compiled/ws') } });
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function read(query) { const { data, error } = await query; if (error) throw Error(error.message); return data; }
async function upload(bucket, target, bytes, contentType) {
  const { data: existing, error } = await client.storage.from(bucket).download(target);
  if (!error) { assert(Buffer.from(await existing.arrayBuffer()).equals(bytes), 'Immutable existing asset differs'); return; }
  const result = await client.storage.from(bucket).upload(target, bytes, { contentType, upsert: false, cacheControl: '31536000' });
  if (result.error) throw Error(result.error.message);
}
(async () => {
  const brand = await read(client.from('cafes').select('id,slug,status,business_category').eq('id', cafe).single());
  assert.equal(brand.slug, slug); assert.equal(brand.status, 'active'); assert.equal(brand.business_category, 'cafes_coffee');
  assert.equal(source.products.length, 88);
  const originals = source.products.flatMap(p => p.images.map(image => ({ ...image, ownerSourceId: p.sourceId })));
  const assets = {}; let next = 0;
  fs.mkdirSync(`${dir}/optimized`, { recursive: true });
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (;;) {
      const i = next++; if (i >= originals.length) return; const original = originals[i];
      const sourceBytes = fs.readFileSync(original.localPath); assert.equal(sha(sourceBytes), original.sha256);
      const bytes = await sharp(sourceBytes).rotate().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
      const hash = sha(bytes), key = path.basename(original.localPath).replace(/\.[^.]+$/, ''), target = `${cafe}/${uuid(`product/${original.ownerSourceId}`)}/together-20261101-${key}-${hash.slice(0,12)}.webp`;
      assets[`${original.ownerSourceId}:${original.sourceUrl}`] = { path: target, sha256: hash, sourceSha256: original.sha256, bytes: bytes.length };
      fs.writeFileSync(`${dir}/optimized/${key}.webp`, bytes);
      if (process.argv.includes('--upload')) await upload('menu-products', target, bytes, 'image/webp');
    }
  }));
  const logo = fs.readFileSync(source.brand.logo.localPath), logoHash = sha(logo), logoPath = `${cafe}/together-20261101/logo-${logoHash.slice(0,12)}.jpg`;
  if (process.argv.includes('--upload')) await upload('cafe-logos', logoPath, logo, 'image/jpeg');
  const order = ['1513706','1513707','1513712','1514691','1529385','1529430','1323984','1759396','1759445','1435189','1283873'];
  const rows = { categories: [], products: [] };
  for (const category of source.categories) rows.categories.push({ id: uuid(`category/${category.sourceId}`), cafe_id: cafe, name: category.name, description: category.parentSourceId ? `ضمن ${source.categories.find(c => c.sourceId === category.parentSourceId)?.name ?? ''}` : '', sort_order: order.indexOf(category.sourceId), visible: true });
  for (const [index,p] of source.products.entries()) {
    const gallery = p.images.map(i => ({ type: 'image', assetId: assets[`${p.sourceId}:${i.sourceUrl}`].path, alt: i.alt }));
    const attributes = [{ label: 'رمز المنتج', value: p.sku }];
    if (p.originalPrice > p.price) attributes.push({ label: 'السعر قبل التخفيض', value: `${p.originalPrice.toFixed(2)} ريال` });
    const commerce = { sourceUrl: p.sourceUrl, quoteOnly: p.quoteOnly, stock: p.stockQuantity, attributes,
      optionGroups: p.commerceDetails.optionGroups.map(g => ({ id: g.id, label: g.label, type: g.type, required: g.required, hint: g.hint, minChoices: g.minChoices, maxChoices: g.maxChoices, ...(g.type === 'text' ? {} : { choices: g.choices }) })) };
    rows.products.push({ id: uuid(`product/${p.sourceId}`), cafe_id: cafe, category_id: uuid(`category/${p.categorySourceId}`), name: p.name, description: p.description, price: p.price,
      catalog_kind: p.itemKind, commerce_details: commerce, sort_order: index, available: p.available, image_storage_path: gallery[0].assetId,
      image_gallery: gallery.slice(1), media: gallery.map((image,i) => ({ ...image, primary: i === 0 })), available_for_pickup: false });
  }
  const tables = { cafes: ['id','id'], products: ['menu_products','cafe_id'], categories: ['menu_categories','cafe_id'], programs: ['cafe_loyalty_programs','cafe_id'], identity: ['cafe_custom_identity','cafe_id'], settings: ['cafe_settings','cafe_id'], subscriptions: ['subscriptions','cafe_id'], overrides: ['brand_feature_overrides','cafe_id'], store_settings: ['gift_store_settings','cafe_id'] };
  const snapshotParts = Object.entries(tables).map(([key,[table,column]]) => `${quote(key)},(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text) FROM public.${table === 'id' ? 'cafes' : table} t WHERE ${column}<>${quote(cafe)}::uuid)`);
  const snapshot = `SELECT jsonb_build_object(${snapshotParts.join(',')},'plans',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM public.platform_plans t))`;
  let sql = `-- Together Plants: source-verified catalog, original identity and four-stamp loyalty\n-- Apply only after 20261031235252_gift_commerce_orders_and_finance\nBEGIN;\nSET TRANSACTION ISOLATION LEVEL REPEATABLE READ;\nSET LOCAL lock_timeout='5s';\nSELECT id FROM public.cafes WHERE id=${quote(cafe)} FOR UPDATE;\nCREATE TEMP TABLE together_before AS ${snapshot} AS snapshot;\nDO $guard$ BEGIN\nIF NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=${quote(cafe)} AND slug=${quote(slug)} AND business_category='cafes_coffee' AND status='active' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Together brand identity changed';END IF;\nIF EXISTS(SELECT 1 FROM public.menu_products WHERE cafe_id=${quote(cafe)}) OR EXISTS(SELECT 1 FROM public.menu_categories WHERE cafe_id=${quote(cafe)}) OR EXISTS(SELECT 1 FROM public.cafe_loyalty_programs WHERE cafe_id=${quote(cafe)}) OR EXISTS(SELECT 1 FROM public.gift_orders WHERE cafe_id=${quote(cafe)}) THEN RAISE EXCEPTION 'Together is already configured; inspect before changing data';END IF;\nEND $guard$;\n`;
  sql += `UPDATE public.cafes SET business_category='gifts_flowers',updated_at=now() WHERE id=${quote(cafe)};\n`;
  for (const row of rows.categories) sql += insert('menu_categories', row) + '\n';
  for (const row of rows.products) sql += insert('menu_products', row) + '\n';
  sql += `UPDATE public.cafe_settings SET logo_storage_path=${quote(logoPath)},logo_url=NULL,description='اكتشف عالمنا الأخضر — نباتات وهدايا وتجارب تنمو معك',instagram='https://www.instagram.com/togethr_sa',whatsapp='966567874278',google_maps_url='https://www.google.com/maps?q=18.284294575165912,42.66589913517237',google_maps_latitude=18.284294575165912,google_maps_longitude=42.66589913517237,updated_at=now() WHERE cafe_id=${quote(cafe)};\n`;
  sql += insert('cafe_custom_identity', { cafe_id: cafe, logo_storage_path: logoPath, logo_url: null, palette: { primary: '#38571a', secondary: '#eff2e8', accent: '#38571a', text: '#193b2b', background: '#fafbf5' } }).replace(/;$/, ' ON CONFLICT(cafe_id) DO UPDATE SET logo_storage_path=excluded.logo_storage_path,logo_url=excluded.logo_url,palette=excluded.palette,updated_at=now();') + '\n';
  sql += insert('cafe_loyalty_programs', { cafe_id: cafe, enabled: true, purchases_required: 4, reward_name: 'خصم 10%', card_title: 'بطاقة ولاء Together Plants', card_subtitle: 'كل زيارة تنمّي مكافأتك', stamp_label: 'الأختام', terms: 'اجمع 4 أختام واحصل على خصم 10%', card_background: '#eff2e8', card_foreground: '#193b2b', card_accent: '#38571a', wallet_enabled: true, apple_wallet_enabled: true, google_wallet_enabled: true, card_design: { layoutVersion: 'brand-stamps-v1', stampStyle: 'ceramic' } }) + '\n';
  // Finance remains disabled: the current trial does not include finance.
  // Do not invent a paid subscription or change a shared plan to grant access.
  sql += `DO $verify$ DECLARE actual jsonb;BEGIN ${snapshot} INTO actual;IF actual IS DISTINCT FROM (SELECT snapshot FROM together_before) THEN RAISE EXCEPTION 'Another brand or shared plan changed';END IF;IF (SELECT count(*) FROM public.menu_products WHERE cafe_id=${quote(cafe)})<>88 OR (SELECT count(*) FROM public.menu_products WHERE cafe_id=${quote(cafe)} AND catalog_kind='service')<>12 OR (SELECT count(*) FROM public.menu_products WHERE cafe_id=${quote(cafe)} AND NOT available)<>15 THEN RAISE EXCEPTION 'Together catalog verification failed';END IF;END $verify$;\nCOMMIT;\n`;
  fs.writeFileSync(`supabase/migrations/${migration}.sql`, sql); fs.writeFileSync(`${dir}/import.sql`, sql); fs.writeFileSync(`${dir}/import-rollback.sql`, sql.replace(/COMMIT;\s*$/, 'ROLLBACK;'));
  fs.writeFileSync(`${dir}/import-plan.json`, JSON.stringify({ at: new Date().toISOString(), cafe, slug, sourceSha256: sha(fs.readFileSync('data/imports/together-20261101.json')), financeEnabled: false, financeNote: 'Current trial excludes finance; no subscription or shared plan change is made', assets, logoPath, logoHash, rows }, null, 2));
  console.log({ mode: process.argv.includes('--upload') ? 'immutable assets uploaded; SQL NOT applied' : 'prepared only', products: rows.products.length, categories: rows.categories.length, privatePhotos: Object.keys(assets).length, services: rows.products.filter(p=>p.catalog_kind==='service').length, unavailable: rows.products.filter(p=>!p.available).length, migration });
})().catch(error => { console.error(error.message); process.exitCode = 1; });
