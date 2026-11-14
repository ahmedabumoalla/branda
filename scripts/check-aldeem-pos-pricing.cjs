'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), ts = require('typescript');
let assertions = 0, calls = [], mode = 'success';
const inputs = new Set();
const admin = { from(table) { assert.equal(table, 'menu_products'); return { select(columns) { assert.equal(columns, 'id,commerce_details'); return { eq(column, cafe) { assert.equal(column, 'cafe_id'); return { async in(column, ids) { assert.equal(column, 'id'); calls.push({ cafe, ids }); return mode === 'error' ? { data: null, error: { code: 'unavailable' } } : { error: null, data: [{ id: 'quoted', commerce_details: { quoteOnly: true } }, { id: 'priced', commerce_details: { quoteOnly: false } }] }; } }; } }; } }; } };
function load(file) {
  inputs.add(file); const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name === 'server-only') return {};
    if (name === '@/lib/supabase/admin') return { createAdminClient: () => admin };
    if (name === '@/lib/menu/standalone-menu') return { isOwnedMenuAsset: () => false };
    if (name.startsWith('@/') || name.startsWith('./')) { const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name); return load(base + '.ts'); }
    return require(name);
  }, exports); return exports;
}
function check(value, message) { assert.ok(value, message); assertions++; }
(async () => {
  const { financeProductMedia } = load('lib/finance/product-media-server.ts');
  const products = [{ id: 'quoted', price: 0, name: 'Quoted', imageUrl: null }, { id: 'priced', price: 125, name: 'Priced', imageUrl: null }, { id: 'unknown', price: 0, name: 'Unknown', imageUrl: null }];
  const cafe = { id: 'authorized-cafe', slug: 'khayal-aldeem' };
  const result = await financeProductMedia(cafe, products);
  check(result[0].quoteOnly === true, 'Quote-only product cannot masquerade as a zero-price sale');
  check(result[1].quoteOnly === false && result[1].price === 125, 'Approved price preserved');
  check(result[2].quoteOnly === true, 'Missing menu metadata fails closed');
  check(calls.length === 1 && calls[0].cafe === cafe.id && calls[0].ids.join(',') === 'quoted,priced,unknown', 'Admin query restricted to already authorized tenant and snapshot products');
  const other = await financeProductMedia({ id: 'other', slug: 'other-brand' }, products);
  check(calls.length === 1 && !Object.hasOwn(other[0], 'quoteOnly'), 'Other brands retain existing pricing semantics');
  mode = 'error';
  await assert.rejects(() => financeProductMedia(cafe, products), /تسعير/); assertions++;
  const source = fs.readFileSync('components/finance/finance-pos.tsx', 'utf8'); inputs.add('components/finance/finance-pos.tsx');
  check(source.includes('quantity >= 9999 || product.quoteOnly'), 'Quote-only product cards disabled');
  check(source.includes('lines.some(line => line.product.quoteOnly)'), 'Restored carts also blocked at checkout');
  check(source.includes('if (product.quoteOnly)') && source.includes('quoteOnlyLabel'), 'Product action and displayed price respect quote-only state');
  const evidence = { at: new Date().toISOString(), command: 'node scripts/check-aldeem-pos-pricing.cjs', runtime: process.version, assertions, passed: true, inputs: Object.fromEntries([...inputs].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])), limits: ['Authorized DAL boundary mocked', 'No production writes or real invoices'] };
  fs.mkdirSync('output/aldeem-lab-ui', { recursive: true }); fs.writeFileSync('output/aldeem-lab-ui/pricing.json', JSON.stringify(evidence, null, 2)); console.log(JSON.stringify({ passed: true, assertions, at: evidence.at }));
})().catch(error => { console.error(error); process.exitCode = 1; });
