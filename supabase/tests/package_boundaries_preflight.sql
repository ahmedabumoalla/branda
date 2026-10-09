-- Read-only; run before 20261009193000_package_service_boundaries.sql.
SELECT current_database() AS database_name,
  to_regnamespace('platform_access_private') IS NULL AS migration_not_applied,
  to_regclass('public.subscriptions') IS NOT NULL AS subscriptions_present,
  to_regclass('public.platform_plans') IS NOT NULL AS plans_present,
  to_regclass('public.brand_feature_overrides') IS NOT NULL AS overrides_present,
  to_regclass('brand_analytics_private.events') IS NOT NULL AS analytics_present,
  to_regclass('storage.objects') IS NOT NULL AS storage_present;
SELECT table_name,column_name,data_type FROM information_schema.columns
 WHERE table_schema='public' AND (
   (table_name='subscriptions' AND column_name IN ('cafe_id','plan_id','status','started_at','expires_at','created_at'))
   OR (table_name='platform_plans' AND column_name IN ('id','features','active'))
   OR (table_name='brand_feature_overrides' AND column_name IN ('cafe_id','feature_id','enabled')))
 ORDER BY table_name,ordinal_position;
SELECT p.oid::regprocedure AS signature,p.prosecdef,p.proconfig
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND p.proname IN ('is_platform_admin','get_cafe_public_settings','record_brand_engagement','create_pickup_order','get_cashier_console');
