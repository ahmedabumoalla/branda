SELECT
  (SELECT count(*)=9 FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('profiles','cafes','cafe_members','cafe_settings','subscriptions','platform_plans','representative_coupons','platform_representatives','brand_referrals')) AS tables_ready,
  (SELECT count(*)=7 FROM information_schema.columns WHERE table_schema='public' AND table_name='platform_plans' AND column_name IN('id','features','duration_unit','duration_count','category_id','trial_days','free_after_trial')) AS plan_columns_ready,
  (SELECT data_type='text' FROM information_schema.columns WHERE table_schema='public' AND table_name='platform_plans' AND column_name='id') AS text_plan_id,
  (SELECT data_type='jsonb' FROM information_schema.columns WHERE table_schema='public' AND table_name='platform_plans' AND column_name='features') AS jsonb_features,
  (SELECT count(*)=3 FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name IN('phone','raw_app_meta_data','raw_user_meta_data')) AS auth_columns_ready,
  EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgfoid='public.handle_new_user()'::regprocedure AND NOT tgisinternal) AS auth_trigger_ready,
  to_regprocedure('public.activate_default_trial_subscription_for_cafe(uuid)') IS NOT NULL AS legacy_trial_rpc_exists,
  NOT EXISTS(SELECT 1 FROM public.platform_plans WHERE id='owner_trial_7d') AS dedicated_plan_id_free,
  md5(pg_get_functiondef('public.handle_new_user()'::regprocedure)) AS prior_auth_trigger_digest;
SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.subscriptions'::regclass AND contype='c';
