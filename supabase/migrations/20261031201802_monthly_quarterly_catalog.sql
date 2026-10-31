-- Catalog data only. Preserve prices, discounts, trials, feature grants and all history.
-- Forward-only: product limits are intentionally retired, not backed up for reinstatement.
BEGIN;
SET LOCAL lock_timeout = '5s';
UPDATE public.platform_plans
SET duration_options=ARRAY[1,3],max_products_monthly=NULL
WHERE duration_options IS DISTINCT FROM ARRAY[1,3] OR max_products_monthly IS NOT NULL;
COMMIT;
