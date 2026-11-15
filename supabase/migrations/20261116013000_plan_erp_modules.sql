BEGIN;
-- Platform admin: which sections of the integrated system a package includes (Branda Finance, Branda Employees,
-- Branda Manufacturing). NULL means every section, so every existing package keeps its current behaviour.
ALTER TABLE public.platform_plans ADD COLUMN IF NOT EXISTS erp_modules jsonb CHECK(erp_modules IS NULL OR jsonb_typeof(erp_modules)='array');
COMMIT;
