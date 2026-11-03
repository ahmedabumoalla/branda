// Reviewed originals and user-approved illustrations. --upload writes immutable private media, never database rows.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict'), sharp = require('sharp');
require('@next/env').loadEnvConfig(process.cwd());
const { createClient } = require('@supabase/supabase-js');
const sourcePath = 'data/imports/korma-source-20261103.json';
const sourceBytes = fs.readFileSync(sourcePath), source = JSON.parse(sourceBytes);
const dir = 'output/korma', migration = '20261103055000_korma_catalog_identity';
const cafeId = '540dd021-399e-49b0-b6bd-33fb66abfb3b', slug = 'brand-b042ca7f1a93';
const importKey = 'korma-20261103', upload = process.argv.includes('--upload');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const uuid = value => { const h = sha(`${importKey}:${value}`); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const q = value => value == null ? 'NULL' : typeof value === 'boolean' || typeof value === 'number' ? String(value) : "'" + String(value).replaceAll("'", "''") + "'";
const literal = value => value != null && typeof value === 'object' ? `${q(JSON.stringify(value))}::jsonb` : q(value);
const insert = (table, row) => `INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(literal).join(',')});`;
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: require('next/dist/compiled/ws') } });
async function read(query) { const { data, error } = await query; if (error) throw Error(error.message); return data; }
const palette = { primary: '#123D32', secondary: '#FFF6E6', accent: '#F49B49', background: '#123D32', text: '#FFF6E6' };
const assets = {};
async function asset(entry, key, logo = false) {
  const absolute = path.resolve(entry.localPath), roots = [path.resolve(process.cwd()), path.resolve(source.sourceDirectory)];
  assert(roots.some(root => absolute.startsWith(root + path.sep)), 'Asset outside reviewed roots');
  const original = fs.readFileSync(absolute);
  if (entry.sha256) assert.equal(sha(original), entry.sha256, `Changed original ${key}`);
  const bytes = await sharp(original).rotate().resize({ width: logo ? 900 : 1400, height: logo ? 900 : 1400, fit: 'inside', withoutEnlargement: true }).webp(logo ? { lossless: true } : { quality: 86 }).toBuffer();
  const hash = sha(bytes), bucket = logo ? 'cafe-logos' : 'menu-products';
  const target = `${cafeId}/${logo ? 'identity' : uuid(`product/${key}`)}/${importKey}-${hash.slice(0, 16)}.webp`;
  const optimizedPath = `${dir}/optimized/${key}.webp`;
  fs.writeFileSync(optimizedPath, bytes);
  if (upload) {
    const existing = await client.storage.from(bucket).download(target);
    if (!existing.error) assert(Buffer.from(await existing.data.arrayBuffer()).equals(bytes), 'Immutable existing asset changed');
    else {
      assert(['400', '404'].includes(String(existing.error.statusCode)), 'Cannot inspect existing storage object');
      const { error } = await client.storage.from(bucket).upload(target, bytes, { contentType: 'image/webp', upsert: false, cacheControl: '31536000' });
      if (error) throw Error(error.message);
    }
  }
  assets[key] = { bucket, path: target, optimizedPath, sha256: hash, sourceSha256: sha(original), sourcePath: entry.localPath, provenance: entry.provenance, bytes: bytes.length };
  return target;
}
const preserved = [
  ['subscriptions', 'id', ''], ['loyalty_cards', 'id', ''], ['cafe_loyalty_programs', 'cafe_id', ''], ['cafe_loyalty_experience', 'cafe_id', ''], ['offers', 'id', ''], ['cafes', 'id', ''],
  ['menu_products', 'id', `WHERE cafe_id<>${q(cafeId)}`], ['menu_categories', 'id', `WHERE cafe_id<>${q(cafeId)}`], ['cafe_custom_identity', 'cafe_id', `WHERE cafe_id<>${q(cafeId)}`], ['cafe_settings', 'cafe_id', `WHERE cafe_id<>${q(cafeId)}`], ['brand_feature_overrides', 'id', ''],
];
const snapshot = `SELECT jsonb_build_object(${preserved.map(([table, order, where]) => `${q(table)},(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY ${order})::text,'')) FROM public.${table} t ${where})`).join(',')})`;
(async () => {
  assert.equal(source.products.length, 36);
  assert.equal(new Set(source.products.map(p => p.sourceId)).size, 36);
  const variantCount = source.products.reduce((count, p) => count + (p.variants?.length || 0), 0);
  fs.mkdirSync(`${dir}/optimized`, { recursive: true });
  for (const bucket of ['menu-products', 'cafe-logos']) assert.equal((await read(client.storage.getBucket(bucket))).public, false, 'Private bucket required');
  const cafe = await read(client.from('cafes').select('id,slug,status').eq('id', cafeId).is('deleted_at', null).single());
  assert.equal(cafe.slug, slug); assert.equal(cafe.status, 'active');
  const logoPath = await asset(source.assets.menuLogo, 'logo', true);
  const categories = source.categories.map((name, index) => ({ id: uuid(`category/${index}`), cafe_id: cafeId, branch_id: null, name, description: null, sort_order: index, visible: true }));
  const products = [];
  for (const [index, p] of source.products.entries()) {
    assert.equal(p.priceStatus, 'source-api-verified');
    const variants = p.variants || [];
    assert(Number.isFinite(p.price) && p.price > 0, 'Confirmed price required');
    assert(variants.every(v => Number.isFinite(v.price) && v.price > 0));
    if (variants.length) assert.equal(p.price, Math.min(...variants.map(v => v.price)));
    const category = categories.find(c => c.name === p.category); assert(category);
    const media = p.image ? await asset(p.image, p.sourceId) : null;
    const namedPrices = variants.map(v => `${v.name}: ${v.price} ر.س`).join('\n');
    // A scalar calorie field represents the complete item, never a per-skewer or per-100ml value
    const calories = Number.isFinite(p.calories) && (!p.calorieUnit || p.calorieUnit === 'item') ? p.calories : null;
    products.push({ id: uuid(`product/${p.sourceId}`), cafe_id: cafeId, branch_id: null, category_id: category.id, name: p.name, description: [variants.length > 1 ? namedPrices : '', p.description || ''].filter(Boolean).join('\n'), price: p.price, price_options: `{${[...new Set(variants.map(v => v.price))].sort((a,b) => a-b).join(',')}}`, calories, sort_order: index, available: true, catalog_kind: 'product', image_storage_path: media, gallery_storage_paths: '{}', commerce_details: variants.length ? { options: variants.map((v, vi) => ({ id: `variant-${vi + 1}`, label: v.name, price: v.price, available: true })) } : {} });
  }
  const plan = { at: new Date().toISOString(), sourceSha256: sha(sourceBytes), migration, cafeId, slug, logoPath, palette, assets, rows: { categories, products }, loyaltyChanged: false, subscriptionsChanged: false };
  fs.writeFileSync(`${dir}/import-plan.json`, JSON.stringify(plan, null, 2));
  let sql = `-- Reviewed Korma menu import; no billing, offers, loyalty or customer mutations\nBEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='30s';\nCREATE TEMP TABLE korma_before ON COMMIT DROP AS ${snapshot} snapshot;\n`;
  sql += `DO $identity$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=${q(cafeId)} AND slug=${q(slug)} AND status='active' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Korma brand identity changed';END IF;END $identity$;\n`;
  for (const [table, key, rows] of [['menu_categories', 'categories', categories], ['menu_products', 'products', products]]) {
    const temp = `korma_expected_${key}`, columns = Object.keys(rows[0]).join(',');
    sql += `CREATE TEMP TABLE ${temp} ON COMMIT DROP AS SELECT * FROM public.${table} WITH NO DATA;\n${rows.map(row => insert(temp, row)).join('\n')}\n`;
    sql += `DO $catalog$ BEGIN IF EXISTS(SELECT 1 FROM public.${table} WHERE cafe_id=${q(cafeId)}) AND (EXISTS(SELECT ${columns} FROM public.${table} WHERE cafe_id=${q(cafeId)} EXCEPT SELECT ${columns} FROM ${temp}) OR EXISTS(SELECT ${columns} FROM ${temp} EXCEPT SELECT ${columns} FROM public.${table} WHERE cafe_id=${q(cafeId)})) THEN RAISE EXCEPTION 'Existing ${key} differ; preserve owner changes';END IF;END $catalog$;\n`;
    sql += `INSERT INTO public.${table}(${columns}) SELECT ${columns} FROM ${temp} ON CONFLICT(id) DO NOTHING;\n`;
  }
  sql += `DO $logo$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.cafe_settings WHERE cafe_id=${q(cafeId)}) THEN RAISE EXCEPTION 'Korma settings missing';END IF;IF EXISTS(SELECT 1 FROM public.cafe_settings WHERE cafe_id=${q(cafeId)} AND ((logo_storage_path IS NOT NULL AND logo_storage_path IS DISTINCT FROM ${q(logoPath)}) OR logo_url IS NOT NULL)) OR EXISTS(SELECT 1 FROM public.cafe_custom_identity WHERE cafe_id=${q(cafeId)} AND (logo_storage_path IS DISTINCT FROM ${q(logoPath)} OR logo_url IS NOT NULL OR palette IS DISTINCT FROM ${literal(palette)})) THEN RAISE EXCEPTION 'Existing Korma identity differs; preserve owner changes';END IF;END $logo$;\n`;
  sql += `UPDATE public.cafe_settings SET logo_storage_path=${q(logoPath)},updated_at=now() WHERE cafe_id=${q(cafeId)} AND logo_storage_path IS DISTINCT FROM ${q(logoPath)};\n`;
  sql += insert('public.cafe_custom_identity', { cafe_id: cafeId, logo_storage_path: logoPath, logo_url: null, palette }).replace(/;$/, ' ON CONFLICT(cafe_id) DO NOTHING;') + '\n';
  sql += `DO $verify$ DECLARE actual jsonb;BEGIN ${snapshot} INTO actual;IF actual IS DISTINCT FROM(SELECT snapshot FROM korma_before) THEN RAISE EXCEPTION 'Protected brands, loyalty, billing or customer data changed';END IF;IF(SELECT count(*) FROM public.menu_products WHERE cafe_id=${q(cafeId)} AND available AND price>0)<>36 OR(SELECT count(*) FROM public.menu_categories WHERE cafe_id=${q(cafeId)})<>10 OR(SELECT sum(coalesce(jsonb_array_length(commerce_details->'options'),0)) FROM public.menu_products WHERE cafe_id=${q(cafeId)})<>${variantCount} THEN RAISE EXCEPTION 'Korma count, prices or media mismatch';END IF;END $verify$;\nCOMMIT;\n`;
  const migrationPath = `supabase/migrations/${migration}.sql`;
  if (fs.existsSync(`${dir}/applied.json`)) assert.equal(fs.readFileSync(migrationPath, 'utf8'), sql, 'Applied migration is immutable');
  fs.writeFileSync(migrationPath, sql);
  fs.writeFileSync(`${dir}/import.sql`, sql);
  fs.writeFileSync(`${dir}/import-rollback.sql`, sql.replace(/COMMIT;\s*$/, 'ROLLBACK;'));
  const body = sql.replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '');
  const version = migration.split('_')[0], md5 = crypto.createHash('md5').update(sql).digest('hex');
  fs.writeFileSync(`${dir}/apply.sql`, `BEGIN;DO $history$ BEGIN IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version=${q(version)} AND md5(array_to_string(statements,E'\\n')) IS DISTINCT FROM ${q(md5)}) THEN RAISE EXCEPTION 'Migration history differs';END IF;END $history$;\n${body}\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES(${q(version)},'korma_catalog_identity',ARRAY[${q(sql)}]) ON CONFLICT(version) DO NOTHING;COMMIT;`);
  const twice = `${body}\nDROP TABLE korma_before,korma_expected_categories,korma_expected_products;\n${body}`;
  fs.writeFileSync(`${dir}/full-rollback.sql`, `BEGIN;${twice}\nSET LOCAL ROLE anon;DO $anon$ BEGIN IF(SELECT count(*) FROM public.menu_products WHERE cafe_id=${q(cafeId)})<>36 THEN RAISE EXCEPTION 'Anonymous menu visibility failed';END IF;END $anon$;RESET ROLE;ROLLBACK;SELECT 'PASS repeat import, 36 public cards, correct variants, protected data unchanged; rolled back' result;`);
  console.log(JSON.stringify({ mode: upload ? 'Uploaded immutable reviewed assets; SQL NOT applied' : 'Prepared only', products: products.length, categories: categories.length, variants: variantCount, assets: Object.keys(assets).length, migration, md5 }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
