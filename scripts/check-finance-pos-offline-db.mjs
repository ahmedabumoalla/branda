import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const migration = 'supabase/migrations/20261025223826_brand_finance_offline_sale_contract.sql';
const test = 'scripts/check-finance-pos-offline-db.sql';
const fixture = 'scripts/check-finance-pos-customer-db.mjs';
let source = await fs.readFile(fixture, 'utf8');
const anchor = " eq(await scalar(\"SELECT jsonb_agg(pg_get_functiondef(oid) ORDER BY oid) FROM pg_proc WHERE proname IN('scan_loyalty_stamp'";
const at = source.indexOf(anchor);
assert(at >= 0, 'POS customer fixture insertion anchor missing');
source = source.slice(0, at) + ` await db.exec(await readFile('${migration}','utf8'));\n` + source.slice(at);
const end = source.indexOf(" console.log(JSON.stringify({ok:true,checks,engine:'PGlite'");
assert(end >= 0, 'POS customer fixture final anchor missing');
source = source.slice(0, end) + `
 const offlineResults=await db.exec((await readFile('${test}','utf8'))
  .replaceAll('__CAFE_ID__',cafe).replaceAll('__OTHER_CAFE_ID__',otherCafe)
  .replaceAll('__STAFF_ID__',staff).replaceAll('__PRODUCT_ID__',product)
  .replaceAll('__DRAWER_ID__',drawer).replaceAll('__WAREHOUSE_ID__',warehouse).replaceAll('__SHIFT_ID__',shift));
 const offlineChecks=offlineResults.flatMap(result=>result.rows??[]).find(row=>'passed_checks' in row)?.passed_checks;
 assert.equal(offlineChecks,29,'All offline SQL contract checks completed');
 console.log(JSON.stringify({offlineDatabaseChecks:offlineChecks}));
` + source.slice(end);

const logs = [], originalLog = console.log;
try {
  console.log = (...args) => { logs.push(args.join(' ')); originalLog(...args); };
  await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
} finally { console.log = originalLog; }
if (process.exitCode) throw new Error('POS database fixture failed');
assert(logs.some(line => line.includes('"offlineDatabaseChecks":29')), 'Offline checks did not execute');
assert(logs.some(line => line.includes('"ok":true') && line.includes('"checks":112')), 'Legacy POS checks did not complete');
const hashes = {};
for (const file of [migration, test, fixture, 'scripts/check-finance-pos-offline-db.mjs']) {
  hashes[file] = crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
}
await fs.mkdir('output', { recursive: true });
await fs.writeFile('output/pos-offline-db-local.json', JSON.stringify({
  at: new Date().toISOString(), engine: 'PGlite local fixture, no external effects', runtime: process.version, hashes, logs,
}, null, 2));
