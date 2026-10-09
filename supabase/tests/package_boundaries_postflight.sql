-- Read-only: no customer writes, synthetic telemetry or changed auth sessions.
SELECT
  to_regprocedure('platform_access_private.service_enabled(uuid,text)') IS NOT NULL AS service_guard_present,
  NOT has_table_privilege('anon','platform_access_private.archived_rpc_grants','SELECT') AS archive_private_anon,
  NOT has_table_privilege('authenticated','platform_access_private.archived_rpc_grants','SELECT') AS archive_private_authenticated,
  NOT EXISTS(SELECT 1 FROM unnest(ARRAY['menu_products','menu_categories','offers','cafe_settings','cafe_loyalty_programs','cafe_loyalty_experience','loyalty_cards','loyalty_card_events','cafe_cashiers','customer_reward_instances','customer_reward_redemptions','loyalty_accounts','loyalty_transactions','loyalty_rules','loyalty_rewards']) name
    WHERE to_regclass('public.'||name) IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=name AND policyname='package_service_access' AND permissive='RESTRICTIVE')) AS service_policies_complete,
  EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND policyname='package_asset_access' AND permissive='RESTRICTIVE') AS separate_storage_guard,
  NOT has_function_privilege('anon','public.record_brand_engagement(text,text,uuid,text)','EXECUTE') AS telemetry_server_only,
  NOT EXISTS(SELECT 1 FROM platform_access_private.archived_rpc_grants g WHERE
    has_function_privilege('anon',g.signature,'EXECUTE') OR has_function_privilege('authenticated',g.signature,'EXECUTE')) AS storefront_rpcs_closed;
SELECT c.relname,t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 WHERE t.tgname IN ('package_service_write','package_settings_write') AND NOT t.tgisinternal ORDER BY c.relname;
SELECT count(*) AS cafes_without_menu FROM public.cafes WHERE deleted_at IS NULL
 AND NOT platform_access_private.service_enabled(id,'menu');
