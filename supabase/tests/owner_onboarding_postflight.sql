SELECT
  (SELECT features='["menu","settings"]'::jsonb AND active AND duration_unit='day' AND duration_count=7 AND NOT free_after_trial FROM public.platform_plans WHERE id='owner_trial_7d') AS seven_day_menu_trial,
  NOT has_schema_privilege('anon','owner_onboarding_private','USAGE') AND NOT has_schema_privilege('authenticated','owner_onboarding_private','USAGE') AS private_challenges,
  (SELECT relrowsecurity FROM pg_class WHERE oid='owner_onboarding_private.challenges'::regclass) AS challenge_rls,
  NOT has_function_privilege('anon','public.begin_owner_onboarding(uuid,text,text,text,text,jsonb)','EXECUTE') AND NOT has_function_privilege('authenticated','public.verify_owner_onboarding(uuid,text,text)','EXECUTE') AS no_public_challenge_rpc,
  has_function_privilege('service_role','public.begin_owner_onboarding(uuid,text,text,text,text,jsonb)','EXECUTE') AS server_challenge_rpc,
  NOT has_function_privilege('authenticated','public.activate_default_trial_subscription_for_cafe(uuid)','EXECUTE') AS no_legacy_trial_bypass,
  position('owner_onboarding_private.challenges' in pg_get_functiondef('public.handle_new_user()'::regprocedure))>0 AND position('INSERT INTO public.branches' in pg_get_functiondef('public.handle_new_user()'::regprocedure))=0 AS verified_bootstrap_without_storefront;
