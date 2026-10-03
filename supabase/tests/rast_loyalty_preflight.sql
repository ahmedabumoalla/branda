-- Read-only production preflight. Inspect output before applying the Rast migration.
SELECT current_database() AS database_name, current_setting('server_version') AS postgres_version;

SELECT table_schema,table_name,column_name,data_type,is_nullable
FROM information_schema.columns
WHERE (table_schema='public' AND table_name IN (
  'cafes','customer_profiles','cafe_loyalty_programs','loyalty_cards','loyalty_card_events',
  'cafe_cashiers','cafe_cashier_sessions','cafe_cashier_activity_logs','customer_reward_instances',
  'customer_reward_redemptions','cafe_loyalty_experience','wallet_passes','wallet_apple_registrations',
  'wallet_notification_jobs','loyalty_scan_requests','customer_phone_otp_requests'
)) OR (table_schema='auth' AND table_name='users' AND column_name IN ('id','phone','phone_confirmed_at'))
ORDER BY table_schema,table_name,ordinal_position;

SELECT p.oid::regprocedure::text AS signature,pg_get_function_result(p.oid) AS returns,
  p.prosecdef AS security_definer,p.proconfig AS settings,p.proacl AS grants,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
  'has_cafe_permission','is_platform_admin','set_updated_at','issue_loyalty_card_for_customer','login_cafe_cashier',
  'record_loyalty_card_operation','issue_loyalty_reward_instance_from_event','make_customer_reward_code',
  'scan_loyalty_stamp','redeem_loyalty_reward','set_rast_loyalty_settings','claim_wallet_notification_jobs',
  'begin_customer_phone_otp_request','complete_customer_phone_otp_request','claim_customer_phone_otp_dispatch'
) ORDER BY p.proname;

SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl,
  (SELECT jsonb_agg(jsonb_build_object('name',pol.polname,'command',pol.polcmd,
    'using',pg_get_expr(pol.polqual,pol.polrelid),'check',pg_get_expr(pol.polwithcheck,pol.polrelid)))
    FROM pg_policy pol WHERE pol.polrelid=c.oid) AS policies
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('loyalty_cards','customer_reward_instances',
  'customer_reward_redemptions','cafe_cashier_sessions','cafe_cashier_activity_logs','cafe_loyalty_programs')
ORDER BY c.relname;

SELECT conrelid::regclass::text AS relation,conname,pg_get_constraintdef(oid) AS definition,convalidated
FROM pg_constraint WHERE conrelid IN (
  'public.loyalty_cards'::regclass,'public.customer_profiles'::regclass,'public.customer_reward_instances'::regclass,
  'public.customer_reward_redemptions'::regclass,'public.cafe_cashier_sessions'::regclass
) ORDER BY relation,conname;

SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public'
  AND tablename IN ('loyalty_cards','customer_profiles','cafe_cashiers','loyalty_card_events','customer_reward_instances');

SELECT tgrelid::regclass::text AS relation,tgname,pg_get_triggerdef(oid) AS definition
FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (
  'public.loyalty_cards'::regclass,'public.loyalty_card_events'::regclass,
  'public.customer_reward_instances'::regclass,'public.cafe_loyalty_programs'::regclass
) ORDER BY relation,tgname;

SELECT c.id,c.slug,c.status,c.deleted_at,p.cafe_id IS NOT NULL AS has_loyalty_program,p.enabled,
  (SELECT count(*) FROM public.loyalty_cards lc WHERE lc.cafe_id=c.id) AS existing_cards,
  (SELECT count(*) FROM public.customer_reward_instances r WHERE r.cafe_id=c.id AND r.source_type='loyalty') AS existing_rewards
FROM public.cafes c LEFT JOIN public.cafe_loyalty_programs p ON p.cafe_id=c.id WHERE c.slug='rast';
