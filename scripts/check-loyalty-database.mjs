// Execute the migration and committed pgTAP regression on isolated PostgreSQL WASM.
// PGlite is a verification tool only; point PGLITE_MODULE_PATH at a temporary install.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PGLITE_MODULE_PATH;
assert(modulePath, 'Set PGLITE_MODULE_PATH to a temporary @electric-sql/pglite/dist/index.js install');
const { PGlite } = await import(pathToFileURL(resolve(modulePath)).href);
const { pgtap } = await import(pathToFileURL(resolve(dirname(modulePath), 'pgtap/index.js')).href);
const db = new PGlite({ extensions: { pgtap } });
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA extensions;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY);
    CREATE TABLE public.cafes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text DEFAULT 'Test cafe', slug text DEFAULT 'test', created_at timestamptz DEFAULT now());
    CREATE TABLE public.menu_products(id uuid PRIMARY KEY, cafe_id uuid REFERENCES public.cafes(id), deleted_at timestamptz);
    CREATE TABLE public.customer_profiles(id uuid PRIMARY KEY, cafe_id uuid REFERENCES public.cafes(id), full_name text, phone text);
    CREATE TABLE public.experience_reward_submissions(id uuid PRIMARY KEY, cafe_id uuid, status text, used_at timestamptz, used_by_cashier_id uuid, updated_at timestamptz);
    CREATE FUNCTION public.gen_random_bytes(n integer) RETURNS bytea LANGUAGE SQL AS 'SELECT decode(repeat(''00'', n), ''hex'')';
    CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE SQL AS 'SELECT gen_random_uuid()';
    -- PGlite omits pgcrypto. These STRICT test-only adapters preserve NULL semantics;
    -- actual bcrypt cryptography is outside this isolated runtime test's scope.
    CREATE FUNCTION extensions.gen_salt(kind text) RETURNS text LANGUAGE SQL STRICT AS 'SELECT ''test-salt''';
    CREATE FUNCTION extensions.crypt(password text, salt text) RETURNS text LANGUAGE SQL STRICT AS 'SELECT ''testhash:'' || md5(password)';
    CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN NEW.updated_at := now(); RETURN NEW; END';
    CREATE FUNCTION public.has_cafe_permission(cafe_id uuid, permission text) RETURNS boolean LANGUAGE SQL AS 'SELECT COALESCE(cafe_id = NULLIF(current_setting(''test.cafe_id'',true),'''')::uuid, false)';
    CREATE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE SQL AS 'SELECT false';
    CREATE EXTENSION pgtap;
    INSERT INTO public.cafes(id,created_at) VALUES ('20000001-0001-4001-8001-000000000001',now()-interval '1 day'),('20000001-0001-4001-8001-000000000002',now());
  `);
  const base = await readFile('supabase/migrations/013_barndaksa_loyapro_wallet_loyalty_system.sql', 'utf8');
  await db.exec(base.slice(base.indexOf('CREATE TABLE IF NOT EXISTS public.cafe_loyalty_programs'), base.indexOf('ALTER TABLE public.cafe_loyalty_programs')));
  await db.exec(base.slice(base.indexOf('CREATE OR REPLACE FUNCTION public.set_cafe_loyalty_program'), base.indexOf('CREATE OR REPLACE FUNCTION public.issue_loyalty_card_for_customer')));
  await db.exec('ALTER TABLE public.cafe_cashier_sessions ADD COLUMN revoked_at timestamptz');
  const cashier = await readFile('supabase/migrations/015_barndaksa_cashier_loyalty_stable_fix.sql', 'utf8');
  const logs = cashier.match(/CREATE TABLE IF NOT EXISTS public\.cafe_cashier_activity_logs[\s\S]*?\n\);/)[0];
  await db.exec(logs);
  await db.exec(`
    CREATE UNIQUE INDEX customer_profiles_id_cafe_id_unique ON public.customer_profiles(id,cafe_id);
    CREATE UNIQUE INDEX loyalty_cards_id_cafe_id_unique ON public.loyalty_cards(id,cafe_id);
    CREATE UNIQUE INDEX cafe_cashiers_id_cafe_id_unique ON public.cafe_cashiers(id,cafe_id);
  `);
  const rewards = await readFile('supabase/migrations/064_customer_reward_instances.sql', 'utf8');
  await db.exec(rewards.slice(rewards.indexOf('CREATE TABLE IF NOT EXISTS public.customer_reward_instances'), rewards.indexOf('ALTER TABLE public.customer_reward_instances')));
  await db.exec(rewards.slice(rewards.indexOf('CREATE OR REPLACE FUNCTION public.make_customer_reward_code'), rewards.indexOf('INSERT INTO public.customer_reward_instances (\n  cafe_id,\n  customer_id,\n  source_type')));
  await db.exec(`
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT SELECT ON public.cafe_loyalty_programs TO authenticated;
    ALTER TABLE public.cafe_loyalty_programs ENABLE ROW LEVEL SECURITY;
    CREATE POLICY program_owner ON public.cafe_loyalty_programs FOR ALL TO authenticated
      USING (public.has_cafe_permission(cafe_id,'loyalty')) WITH CHECK (public.has_cafe_permission(cafe_id,'loyalty'));
    GRANT EXECUTE ON FUNCTION public.set_cafe_loyalty_program(uuid,boolean,text,text,integer,uuid,text,text,text,text,text,text) TO authenticated;
  `);
  await db.exec(await readFile(process.env.LOYALTY_MIGRATION_PATH ?? 'supabase/migrations/20261002234900_loyalty_experience_atomic_scanner.sql', 'utf8'));
  const checks = await db.exec(await readFile('supabase/tests/013_loyalty_experience_atomic_scanner_test.sql', 'utf8'));
  const lines = checks.flatMap(result => result.rows.map(row => Object.values(row).join(' ')));
  const failures = lines.filter(line => /^(not ok|# Looks like)/.test(line));
  if (failures.length) console.error(failures.join('\n'));
  assert.equal(failures.length, 0, 'pgTAP assertions failed');
  assert.equal(lines.filter(line => /^ok \d+/.test(line)).length, 64, 'Expected all 64 database assertions');
  console.log('PASS: migration executes; 64 PostgreSQL pgTAP assertions passed (isolated dependency schema; test-only pgcrypto adapter).');
} catch (error) {
  console.error(`Database verification failed: ${error.message} (${error.code ?? 'assertion'})`);
  process.exitCode = 1;
} finally {
  await db.close();
}
