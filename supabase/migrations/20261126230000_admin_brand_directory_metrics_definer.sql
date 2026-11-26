-- The brand directory metrics read ~7,400 rows through row policies that call
-- per-row access functions, so an admin read took 5.5 s on average and often hit
-- the 8 s authenticated statement timeout. Both functions already refuse anyone
-- who is not an active platform admin (v2 reads v1 first), so they run as owner.
BEGIN;
ALTER FUNCTION public.admin_brand_directory_metrics(uuid[]) SECURITY DEFINER;
ALTER FUNCTION public.admin_brand_directory_metrics_v2(uuid[]) SECURITY DEFINER;
COMMIT;
