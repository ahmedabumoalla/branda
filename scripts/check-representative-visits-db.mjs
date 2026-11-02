import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE ?? path.join(tmpdir(), 'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite();
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA storage; CREATE SCHEMA auth;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA public,storage,auth TO anon,authenticated,service_role;
    GRANT ALL ON storage.objects TO anon,authenticated,service_role;
    CREATE POLICY broad_fixture ON storage.objects FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);
    CREATE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.sub',true)='admin' $$;`);
  await db.exec(await readFile('supabase/migrations/20261102123500_representative_visit_intake.sql', 'utf8'));
  const id = '00000000-0000-4000-8000-000000000011', token = '00000000-0000-4000-8000-000000000012';
  const claim = async (fingerprint = 'a'.repeat(64), requestId = id) => (await db.query('SELECT public.claim_representative_visit($1,$2,$3,$4) AS result', [requestId, fingerprint, 'b'.repeat(64), token])).rows[0].result.status;
  assert.equal(await claim(), 'claimed'); assert.equal(await claim(), 'busy');
  await db.exec("UPDATE representative_visit_claims SET lease_until=now()-interval '1 minute'");
  assert.equal(await claim('c'.repeat(64)), 'claimed', 'Corrected failed draft can retry');
  const data = { brandName: 'Test', representativeName: 'Tester', managerPhone: '', ownerPhone: '', interest: 'interested', services: ['menu'], otherService: '', latitude: 24, longitude: 46, mapsUrl: '', hasMenu: false };
  await db.query('SELECT public.finish_representative_visit($1,$2,$3)', [id, token, JSON.stringify(data)]);
  assert.equal(await claim('c'.repeat(64)), 'saved'); assert.equal(await claim(), 'conflict');
  await db.query('SELECT public.finish_representative_visit($1,$2,$3)', [id, token, JSON.stringify(data)]);
  assert.equal((await db.query('SELECT count(*)::int n FROM representative_visits')).rows[0].n, 1);
  await db.exec("UPDATE representative_visit_rate_windows SET attempts=60 WHERE key<>'global'");
  assert.equal(await claim('a'.repeat(64), '00000000-0000-4000-8000-000000000099'), 'rate');
  await db.exec("INSERT INTO storage.objects(bucket_id,name) VALUES('representative-visits','private-photo'),('other','public-photo')");
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(claim());
    await assert.rejects(db.query('SELECT * FROM representative_visit_claims'));
    if (role === 'anon') await assert.rejects(db.query('SELECT * FROM representative_visits'));
    else assert.equal((await db.query('SELECT * FROM representative_visits')).rows.length, 0);
    assert.equal((await db.query("SELECT * FROM storage.objects WHERE bucket_id='representative-visits'")).rows.length, 0);
    await assert.rejects(db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('representative-visits','forbidden')"));
    assert.equal((await db.query("SELECT * FROM storage.objects WHERE bucket_id='other'")).rows.length, 1);
    await db.exec('RESET ROLE');
  }
  await db.exec("SET ROLE authenticated; SET request.jwt.claim.sub='admin'");
  assert.equal((await db.query('SELECT * FROM representative_visits')).rows.length, 1);
  assert.equal((await db.query("SELECT * FROM storage.objects WHERE bucket_id='representative-visits'")).rows.length, 1);
  console.log('PASS visit migration, corrected retry, finalization/idempotency, rate limit, anon/owner denial, admin reads and restrictive Storage isolation');
} catch (error) { console.error(error.message); process.exitCode = 1; } finally { await db.close(); }
