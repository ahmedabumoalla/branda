-- Preserve existing menu-branch access before making it independently editable
-- No subscription, branch, invoice or customer records are modified
-- Forward rollback may remove the added code only after restoring old guards
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
UPDATE public.platform_plans SET features=features || '["branches"]'::jsonb
 WHERE jsonb_typeof(features)='array' AND (features ? 'menu' OR features ? 'all') AND NOT features ? 'branches';
-- These sections were previously always visible outside the configurable catalog
UPDATE public.platform_plans p SET erp_modules=(SELECT jsonb_agg(DISTINCT item) FROM jsonb_array_elements(p.erp_modules || '["overview","tracking","families"]'::jsonb) item)
 WHERE erp_modules IS NOT NULL;
COMMIT;
