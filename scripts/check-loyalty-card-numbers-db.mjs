// Extend the actual queue/delivery integration fixture, preserving its production functions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MIGRATION,DIR,sha,read} from './prepare-loyalty-card-numbers.mjs';
const baseline=fs.readFileSync('scripts/check-loyalty-read-queue-db.mjs','utf8');
const marker="  await db.exec(await readFile('supabase/tests/loyalty_read_queue_rollback.sql','utf8'));";
assert.equal(baseline.split(marker).length,2);
const inspection=read(`${DIR}/db-inspect-result.json`).data.rows[0].inspection;
const extension=`
  await db.exec(await readFile('supabase/migrations/20261108183724_loyalty_read_delivery.sql','utf8'));
  await db.exec("CREATE TABLE IF NOT EXISTS public.loyalty_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid,details jsonb DEFAULT '{}');INSERT INTO public.loyalty_transactions(cafe_id,details) VALUES('10000000-0000-4000-8000-000000000001',jsonb_build_object('historical',true))");
  const liveFunctions=${JSON.stringify(inspection.functions.filter(f=>['assign_display_number','enqueue_loyalty_read','process_one'].includes(f.name)))};
  for(const f of liveFunctions)await db.exec(f.definition);
  let candidate=await readFile('supabase/migrations/${MIGRATION}.sql','utf8');
  // Equivalent pg_get_functiondef formatting is version-specific in the local engine.
  for(const f of liveFunctions){const actual=await scalar('SELECT md5(pg_get_functiondef($1::regprocedure))',[f.signature]);candidate=candidate.replace("<> '"+f.md5+"'","<> '"+actual+"'").replace("<>"+"'"+f.md5+"'","<>"+"'"+actual+"'");}
  await db.exec(candidate);
  await db.exec(await readFile('supabase/tests/loyalty_read_queue_rollback.sql','utf8'));
  await db.exec(await readFile('supabase/tests/loyalty_read_delivery_rollback.sql','utf8'));
  await db.exec(await readFile('supabase/tests/loyalty_card_numbers_rollback.sql','utf8'));
  console.log('PASS sequential allocator, legacy preservation, scoped short-number queue and delivery rollback assertions');
`;
const extended=baseline.replace(marker,()=>extension);
await import(`data:text/javascript;base64,${Buffer.from(extended).toString('base64')}`);
if(!process.exitCode){
 const files=['scripts/prepare-loyalty-card-numbers.mjs','scripts/check-loyalty-card-numbers-db.mjs','scripts/check-loyalty-read-queue-db.mjs',`supabase/migrations/${MIGRATION}.sql`,'supabase/tests/loyalty_card_numbers_rollback.sql','supabase/tests/loyalty_read_queue_rollback.sql','supabase/tests/loyalty_read_delivery_rollback.sql',`${DIR}/db-inspect-result.json`];
 const assertions=fs.readFileSync('supabase/tests/loyalty_card_numbers_rollback.sql','utf8').match(/\bASSERT\b/g).length;
 fs.writeFileSync(`${DIR}/db-checks.json`,JSON.stringify({at:new Date().toISOString(),result:'PASS',runtime:process.version,engine:'PGlite',newAssertions:assertions,inheritedQueueAndDelivery:true,fixtureCryptoAdapters:true,concurrencyNotProvenBySingleConnection:true,inputs:Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(f))]))},null,2)+'\n');
 console.log(JSON.stringify({result:'PASS',newAssertions:assertions}));
}
