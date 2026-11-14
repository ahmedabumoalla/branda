'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const files = ['lib/commerce/business-category.ts','lib/data/gift-orders.ts','lib/data/menu.ts','lib/data/standalone-menu.ts','app/dashboard/orders/page.tsx','supabase/migrations/20261114024408_clothing_store_commerce.sql','scripts/check-clothing-commerce-db.mjs','scripts/verify-clothing-commerce.cjs','package.json','package-lock.json'];
// Include the actual isolated fixture chain and SQL inputs, without private env files.
const visited = new Set();
function inputs(file) {
  if (visited.has(file) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return;
  visited.add(file);
  const content = fs.readFileSync(file,'utf8');
  for (const match of content.matchAll(/(?:readFile\(|readFileSync\()['"]([^'"]+)['"]/g)) {
    if (/^(scripts|supabase)\//.test(match[1])) inputs(match[1]);
  }
  for (const match of content.matchAll(/['"](20\d{12}_[a-z0-9_]+\.sql)['"]/g)) inputs('supabase/migrations/' + match[1]);
}
files.forEach(inputs);
const hashes = () => Object.fromEntries([...visited].sort().map(file => [file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
const startedAt = new Date().toISOString(), before = hashes();
const result = cp.spawnSync(process.execPath,['scripts/check-clothing-commerce-db.mjs'],{encoding:'utf8',timeout:120000});
const after = hashes(), stable = JSON.stringify(before) === JSON.stringify(after);
const evidence = {startedAt,finishedAt:new Date().toISOString(),command:'node scripts/check-clothing-commerce-db.mjs',runtime:process.version,platform:process.platform,exitCode:result.status,inputStable:stable,inputHashes:after,stdout:result.stdout,stderr:result.stderr,productionMigration:'NOT APPLIED: both available Management API access tokens returned HTTP 401; no business data mutated',security:'Reuses existing order reservation, settlement, RLS and private Storage path authorization; only category predicates expanded'};
fs.mkdirSync('output/fawasel-backend-20261114',{recursive:true});
fs.writeFileSync(path.join('output/fawasel-backend-20261114','verification.json'),JSON.stringify(evidence,null,2));
console.log(JSON.stringify({exitCode:result.status,inputStable:stable,stdout:result.stdout,inputs:visited.size}));
process.exitCode = result.status === 0 && stable ? 0 : 1;
