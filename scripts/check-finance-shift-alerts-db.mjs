import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE ?? path.join(tmpdir(), 'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite(); let checks = 0;
const [owner, cashier, cafe, otherCafe, shift, otherShift, alert, otherAlert] = Array.from({length:8}, (_,i) => `00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const deny = async (fn) => { await assert.rejects(fn); checks++; };
const claim = async (target = cafe) => (await db.query('SELECT public.brand_finance_claim_shift_alerts($1,NULL,5) AS data', [target])).rows[0].data;
const complete = async (row, status = 'queued', token = row.leaseToken) => (await db.query('SELECT public.brand_finance_complete_shift_alert($1,$2,$3,$4,NULL) AS data', [row.id, token, status, status === 'queued' ? 'queue-id' : null])).rows[0].data;
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY,phone text,full_name text,status text DEFAULT 'active');
    CREATE TABLE public.cafes(id uuid PRIMARY KEY,owner_user_id uuid,name text,status text DEFAULT 'active',deleted_at timestamptz);
    CREATE TABLE public.bf_shifts(id uuid PRIMARY KEY,cafe_id uuid,user_id uuid);
    CREATE TABLE public.bf_staff(cafe_id uuid,user_id uuid,name text);
    CREATE TABLE public.bf_shift_alerts(id uuid PRIMARY KEY,cafe_id uuid,shift_id uuid,phase text,expected_cash numeric,counted_cash numeric,difference numeric,created_at timestamptz DEFAULT now());
    ALTER TABLE public.bf_shift_alerts ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.bf_shift_alerts FROM PUBLIC,anon,authenticated,service_role;
    INSERT INTO profiles VALUES('${owner}','0500000000','Owner','active'),('${cashier}','0500000001','Cashier','active');
    INSERT INTO cafes VALUES('${cafe}','${owner}','Brand A','active',NULL),('${otherCafe}','${cashier}','Brand B','active',NULL);
    INSERT INTO bf_shifts VALUES('${shift}','${cafe}','${cashier}'),('${otherShift}','${otherCafe}','${cashier}');
    INSERT INTO bf_staff VALUES('${cafe}','${cashier}','Employee name');
    INSERT INTO bf_shift_alerts(id,cafe_id,shift_id,phase,expected_cash,counted_cash,difference) VALUES('${alert}','${cafe}','${shift}','opening',100,90,-10),('${otherAlert}','${otherCafe}','${otherShift}','closing',200,220,20);`);
  await db.exec(await readFile('supabase/migrations/20261024095316_brand_finance_shift_alert_delivery.sql','utf8'));
  for (const role of ['anon','authenticated']) { await db.exec(`SET ROLE ${role}`); await deny(() => claim()); await deny(() => complete({id:alert,leaseToken:owner})); await db.exec('RESET ROLE'); }
  await db.exec('SET ROLE service_role'); await deny(() => db.query('SELECT * FROM bf_shift_alerts'));
  const rows = await claim(); check(rows.length, 1); check(rows[0].ownerPhone, '0500000000'); check(rows[0].employeeName, 'Employee name');
  check(await claim(), []); check(await complete(rows[0], 'queued', owner), false); check(await complete(rows[0]), true); check(await complete(rows[0]), false); check(await claim(), []);
  const other = (await claim(otherCafe))[0]; check(other.id, otherAlert); check(other.ownerPhone, '0500000001');
  await db.exec('RESET ROLE'); await db.query("UPDATE bf_shift_alerts SET leased_at=now()-interval '6 minutes' WHERE id=$1", [otherAlert]);
  await db.exec('SET ROLE service_role'); check(await claim(otherCafe), []); check(await complete(other), false);
  await deny(() => db.query('SELECT public.brand_finance_claim_shift_alerts(NULL,NULL,100)'));
  await db.exec('RESET ROLE'); check((await db.query('SELECT delivery_status,error_code FROM bf_shift_alerts WHERE id=$1', [otherAlert])).rows[0], {delivery_status:'unknown',error_code:'lease_expired'});
  check((await db.query('SELECT provider_message_id FROM bf_shift_alerts WHERE id=$1', [alert])).rows[0].provider_message_id, 'queue-id');
  console.log(`PASS ${checks} finance alert DB checks: service-only grants, scoped lease, real owner identity, no double claim/completion, uncertain expiry`);
} finally { await db.close(); }
