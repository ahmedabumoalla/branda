import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE ?? path.join(tmpdir(), 'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite();
const migration = await readFile('supabase/migrations/20261101224311_platform_marketing_campaigns.sql', 'utf8');
const rollback = await readFile('supabase/tests/platform_marketing_campaigns_rollback.sql', 'utf8');
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text,status text);
    CREATE TABLE public.cafes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),slug text UNIQUE,name text,owner_user_id uuid,status text,deleted_at timestamptz);
    CREATE TABLE public.customer_profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid REFERENCES public.cafes(id),full_name text,phone text,status text DEFAULT 'active',blocked_at timestamptz,phone_auth_conflict boolean DEFAULT false);
    CREATE TABLE public.loyalty_cards(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid,customer_profile_id uuid,customer_name text,customer_phone text,status text);
    CREATE TABLE public.brand_marketing_suppressions(cafe_id uuid,phone text,reason text,PRIMARY KEY(cafe_id,phone));
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA public,storage TO anon,authenticated,service_role;
    GRANT ALL ON storage.objects TO anon,authenticated,service_role;
    CREATE POLICY fixture_broad_policy ON storage.objects FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);
    INSERT INTO public.profiles VALUES('00000000-0000-4000-8000-000000000001','platform_admin','active');`);
  const normalization = await readFile('supabase/migrations/073_customer_phone_auth.sql', 'utf8');
  await db.exec(normalization.slice(normalization.indexOf('CREATE OR REPLACE FUNCTION public.normalize_customer_phone'), normalization.indexOf('UPDATE public.customer_profiles')));
  // Model the live trigger boundary that requires a current admin JWT for fixtures
  // without a paid subscription; this must not be bypassed by disabling triggers.
  await db.exec(`CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
      SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='platform_admin') $$;
    CREATE FUNCTION public.fixture_package_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Service unavailable for current subscription' USING ERRCODE='42501'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fixture_service_write BEFORE INSERT OR UPDATE ON public.customer_profiles FOR EACH ROW EXECUTE FUNCTION public.fixture_package_guard();`);
  const profileGuard = await readFile('supabase/migrations/003_barndaksa_security_hardening.sql', 'utf8');
  await db.exec(profileGuard.slice(profileGuard.indexOf('CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()'),profileGuard.indexOf('CREATE POLICY profiles_insert_own')));
  await db.exec(migration);
  await db.exec(rollback);
  assert.equal((await db.query('SELECT count(*)::int n FROM public.platform_marketing_campaigns')).rows[0].n, 0, 'Rollback leaves no campaigns');
  assert.equal((await db.query('SELECT count(*)::int n FROM public.cafes')).rows[0].n, 0, 'Rollback leaves no brand fixtures');
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(db.query("SELECT public.platform_marketing_audience('00000000-0000-4000-8000-000000000001')"));
    await assert.rejects(db.query('SELECT public.platform_marketing_claim_job()'));
    await assert.rejects(db.query('SELECT * FROM public.platform_marketing_media'));
    await assert.rejects(db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('platform-marketing-media','forbidden')"));
    await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('other-bucket','allowed')");
    await db.exec('RESET ROLE');
  }
  console.log('PASS platform marketing rollback assertions, RLS/RPC grants, private Storage isolation and no persisted fixtures');
} finally { await db.close(); }
