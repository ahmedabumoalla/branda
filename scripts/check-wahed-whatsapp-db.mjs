import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Extend the existing private-connection integration fixture, with no network
const baseline=await readFile('scripts/check-brand-whatsapp-db.mjs','utf8');
const marker='  await mkdir("output/loco-brand-phone", { recursive:true });';
assert.equal(baseline.split(marker).length,2);
const extra=await readFile('supabase/tests/wahed_optional_whatsapp_fixture.sql','utf8');
const migration='supabase/migrations/20261117103000_wahed_optional_private_whatsapp.sql';
const assertions=await readFile('supabase/tests/wahed_optional_whatsapp_assertions.sql','utf8');
const extended=baseline.replace(marker,()=>`
  await db.exec(${JSON.stringify(extra)});
  await db.exec(await readFile(${JSON.stringify(migration)},'utf8'));
  await db.exec(${JSON.stringify(assertions)});
  paths.push(${JSON.stringify(migration)},'supabase/tests/wahed_optional_whatsapp_fixture.sql','supabase/tests/wahed_optional_whatsapp_assertions.sql');
  check(true,'Wahed opt-in authorization, service-only claims, sender routing matrix, archive and unchanged connection assertions passed');
${marker}`);
try { await import(`data:text/javascript;base64,${Buffer.from(extended).toString('base64')}`); }
catch(error) { console.error(error.message,error.where??'');process.exitCode=1; }
