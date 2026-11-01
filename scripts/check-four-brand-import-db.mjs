import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE ?? path.join(tmpdir(), 'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href);
const source = JSON.parse(await readFile('data/imports/four-brands-20261102.json', 'utf8'));
const loyalty = await readFile('supabase/migrations/20261101231356_four_brand_loyalty_six_stamps.sql', 'utf8');
const catalog = await readFile('supabase/migrations/20261101231912_four_brand_catalog_identity.sql', 'utf8');
assert(catalog.length > 1000, 'Final reviewed catalog migration is required');
const db = new PGlite();
let checks = 0;
const ok = (condition, label) => { assert(condition, label); checks++; };
const first = async (sql, args = []) => (await db.query(sql, args)).rows[0];
try {
  await db.exec(`
    CREATE TABLE cafes(id uuid PRIMARY KEY,slug text UNIQUE,name text,status text,deleted_at timestamptz);
    CREATE TABLE subscriptions(id uuid PRIMARY KEY,cafe_id uuid,expires_at timestamptz,amount_sar numeric);
    CREATE TABLE loyalty_cards(id uuid PRIMARY KEY,cafe_id uuid,purchases_count integer);
    CREATE TABLE cafe_settings(cafe_id uuid PRIMARY KEY REFERENCES cafes(id),logo_storage_path text,logo_url text,description text,updated_at timestamptz DEFAULT now());
    CREATE TABLE cafe_custom_identity(cafe_id uuid PRIMARY KEY REFERENCES cafes(id),logo_storage_path text,logo_url text,palette jsonb,updated_at timestamptz DEFAULT now());
    CREATE TABLE menu_categories(id uuid PRIMARY KEY,cafe_id uuid REFERENCES cafes(id),branch_id uuid,name text,description text,sort_order int,visible boolean);
    CREATE TABLE menu_products(id uuid PRIMARY KEY,cafe_id uuid REFERENCES cafes(id),branch_id uuid,category_id uuid REFERENCES menu_categories(id),name text,description text,price numeric CHECK(price>=0),price_options numeric[],calories integer,sort_order integer,available boolean,catalog_kind text,image_storage_path text,gallery_storage_paths text[]);
    CREATE TABLE offers(id uuid PRIMARY KEY,cafe_id uuid REFERENCES cafes(id),branch_id uuid,title text,description text,offer_type text,status text,placement text,visible_in_cafe boolean,target_type text,linked_product_id uuid REFERENCES menu_products(id),discount_percent integer,offer_rules jsonb);
    CREATE TABLE cafe_loyalty_programs(cafe_id uuid PRIMARY KEY REFERENCES cafes(id),enabled boolean,purchases_required integer,reward_product_id uuid,reward_name text,card_title text,card_subtitle text,stamp_label text,terms text,wallet_enabled boolean,apple_wallet_enabled boolean,google_wallet_enabled boolean,card_design jsonb,card_background text,card_foreground text,card_accent text,updated_at timestamptz DEFAULT now());
    CREATE TABLE cafe_loyalty_experience(cafe_id uuid PRIMARY KEY REFERENCES cafes(id),reward_kind text,reward_discount_percent integer,nearby_message text,reward_validity_days integer DEFAULT 30,updated_at timestamptz DEFAULT now());
  `);
  for (const b of source.brands) {
    await db.query("INSERT INTO cafes VALUES($1,$2,$3,'active',null)", [b.cafeId, b.slug, b.name]);
    await db.query('INSERT INTO cafe_settings(cafe_id) VALUES($1)', [b.cafeId]);
    await db.query('INSERT INTO subscriptions VALUES($1,$1,null,0)', [b.cafeId]);
    for (const p of b.products) {
      ok(p.available ? p.images.length > 0 && p.price > 0 : p.ownerReviewRequired, 'Published images and prices / explicit review draft');
      ok(p.sourcePrice == null ? !p.available && p.price === 0 : p.price === p.sourcePrice, 'No invented source prices');
    }
  }
  const subscriptionBefore = (await db.query('SELECT * FROM subscriptions ORDER BY id')).rows;
  await db.exec(loyalty);
  await db.exec(catalog);
  ok((await first('SELECT count(*)::int n FROM menu_products')).n === 117, 'All 117 imported rows');
  ok((await first('SELECT count(*)::int n FROM menu_products WHERE available')).n === 114, '114 published products');
  ok((await first('SELECT count(*)::int n FROM menu_products WHERE NOT available')).n === 3, 'Three private owner-review drafts');
  ok((await first('SELECT count(*)::int n FROM menu_products WHERE available AND image_storage_path IS NULL')).n === 0, 'No published image gaps');
  ok((await first('SELECT count(*)::int n FROM offers WHERE discount_percent IS NOT NULL')).n === 0, 'Highlights do not invent discounts');
  ok((await first('SELECT count(*)::int n FROM offers')).n === 12, 'Three highlights per brand');
  ok((await first('SELECT count(*)::int n FROM cafe_loyalty_programs WHERE enabled AND purchases_required=6 AND apple_wallet_enabled AND google_wallet_enabled')).n === 4, 'All four loyalty programs ready');
  ok((await first("SELECT count(*)::int n FROM cafe_loyalty_experience WHERE reward_kind='discount' AND reward_discount_percent=10 AND reward_validity_days=30")).n === 4, 'Actual discount semantics');
  const snapshot = (await first("SELECT jsonb_build_object('products',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM menu_products t),'identity',(SELECT jsonb_agg(to_jsonb(t) ORDER BY cafe_id) FROM cafe_custom_identity t),'programs',(SELECT jsonb_agg(to_jsonb(t) ORDER BY cafe_id) FROM cafe_loyalty_programs t)) value")).value;
  await db.exec(loyalty);
  await db.exec(catalog);
  assert.deepEqual((await first("SELECT jsonb_build_object('products',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM menu_products t),'identity',(SELECT jsonb_agg(to_jsonb(t) ORDER BY cafe_id) FROM cafe_custom_identity t),'programs',(SELECT jsonb_agg(to_jsonb(t) ORDER BY cafe_id) FROM cafe_loyalty_programs t)) value")).value, snapshot); checks++;
  assert.deepEqual((await db.query('SELECT * FROM subscriptions ORDER BY id')).rows, subscriptionBefore); checks++;
  const product = await first('SELECT id,price FROM menu_products WHERE available ORDER BY id LIMIT 1');
  await db.query('UPDATE menu_products SET price=price+1 WHERE id=$1', [product.id]);
  await assert.rejects(db.exec(catalog), /Existing products differ/); checks++;
  await db.exec('ROLLBACK');
  ok(Number((await first('SELECT price FROM menu_products WHERE id=$1', [product.id])).price) === Number(product.price) + 1, 'Owner-edited price is never overwritten');
  console.log(`PASS four-brand import ${checks} checks: catalog, original prices, images, private drafts, real loyalty, idempotency and owner-change protection`);
} finally { await db.close(); }
