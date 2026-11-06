-- Add butcher shops to the existing administrator-created business categories.
-- No account, subscription, default-plan, Auth, Storage or permission changes.
-- Roll back with a separate forward migration only while no butcher rows/defaults exist.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.cafes, public.category_default_plans IN ACCESS EXCLUSIVE MODE;

DO $guard$
BEGIN
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
      WHERE conrelid='public.cafes'::regclass AND conname='cafes_business_category_check')
      IS DISTINCT FROM 'f795913966da56b9de77af44e1b4d82b'
    OR (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
      WHERE conrelid='public.category_default_plans'::regclass AND conname='category_default_plans_category_check')
      IS DISTINCT FROM 'fd9725b51f3bd9b6a2acee2061e77702'
    OR md5(pg_get_functiondef('public.admin_prepare_brand_account(uuid,uuid,jsonb,text,text)'::regprocedure))
      <> '62773818f80b66c71aed425b39acb537' THEN
    RAISE EXCEPTION 'Unexpected business category schema; review before enabling butcher shops';
  END IF;
END $guard$;

ALTER TABLE public.cafes DROP CONSTRAINT cafes_business_category_check;
ALTER TABLE public.cafes ADD CONSTRAINT cafes_business_category_check CHECK (business_category IN (
  'cafes_coffee','restaurants','massage_centers','beauty_centers','hair_salons','clinics_health_centers',
  'gyms_fitness','retail_stores','clothing_stores','furniture','events_conferences','gifts_flowers','butcher_shops'
)) NOT VALID;
ALTER TABLE public.cafes VALIDATE CONSTRAINT cafes_business_category_check;

ALTER TABLE public.category_default_plans DROP CONSTRAINT category_default_plans_category_check;
ALTER TABLE public.category_default_plans ADD CONSTRAINT category_default_plans_category_check CHECK (category_id IN (
  'cafes_coffee','restaurants','hair_salons','events_conferences','gifts_flowers','butcher_shops'
)) NOT VALID;
ALTER TABLE public.category_default_plans VALIDATE CONSTRAINT category_default_plans_category_check;

-- Change exactly the category allowlist, preserving actor checks, locking, idempotency,
-- configured free-trial fallback and service-role-only execute grants.
DO $onboarding$
DECLARE
  definition text := pg_get_functiondef('public.admin_prepare_brand_account(uuid,uuid,jsonb,text,text)'::regprocedure);
  previous text := 'NOT IN (''cafes_coffee'',''restaurants'',''hair_salons'',''gifts_flowers'')';
BEGIN
  IF (length(definition)-length(replace(definition,previous,'')))/length(previous) <> 1 THEN
    RAISE EXCEPTION 'Unexpected onboarding category guard';
  END IF;
  EXECUTE replace(definition,previous,'NOT IN (''cafes_coffee'',''restaurants'',''hair_salons'',''gifts_flowers'',''butcher_shops'')');
END $onboarding$;

DO $permissions$
BEGIN
  IF has_function_privilege('anon','public.admin_prepare_brand_account(uuid,uuid,jsonb,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.admin_prepare_brand_account(uuid,uuid,jsonb,text,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.admin_prepare_brand_account(uuid,uuid,jsonb,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected administrator onboarding grants';
  END IF;
END $permissions$;
COMMIT;
