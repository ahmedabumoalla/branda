import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Reuse the same real legacy engine/migrations and baseline rollback suite.
// The appended suite exercises the additive delivery migration, not a mock copy.
const baseline = await readFile('scripts/check-loyalty-read-queue-db.mjs', 'utf8');
const marker = "  await db.exec(await readFile('supabase/tests/loyalty_read_queue_rollback.sql','utf8'));";
assert.equal(baseline.split(marker).length, 2, 'Expected existing integration fixture boundary');
const extended = baseline.replace(marker, `${marker}
  await db.exec(await readFile('supabase/migrations/20261108183724_loyalty_read_delivery.sql','utf8'));
  await db.exec(await readFile('supabase/tests/loyalty_read_delivery_rollback.sql','utf8'));
  console.log('PASS scoped wallet claims and v2 invitation rollback assertions');`);
await import(`data:text/javascript;base64,${Buffer.from(extended).toString('base64')}`);
