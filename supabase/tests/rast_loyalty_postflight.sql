-- Read-only. Returns one JSON document; no customer data, credentials, or writes.
SELECT jsonb_build_object(
  'checked_at',now(),
  'tables',(SELECT jsonb_agg(jsonb_build_object(
    'table',c.relname,'rls_enabled',c.relrowsecurity,
    'anon_select',has_table_privilege('anon',c.oid,'SELECT'),
    'anon_write',has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE'),
    'authenticated_select',has_table_privilege('authenticated',c.oid,'SELECT'),
    'authenticated_insert',has_table_privilege('authenticated',c.oid,'INSERT'),
    'authenticated_update',has_table_privilege('authenticated',c.oid,'UPDATE'),
    'authenticated_delete',has_table_privilege('authenticated',c.oid,'DELETE'),
    'service_select',has_table_privilege('service_role',c.oid,'SELECT'),
    'service_insert',has_table_privilege('service_role',c.oid,'INSERT'),
    'service_update',has_table_privilege('service_role',c.oid,'UPDATE'),
    'service_delete',has_table_privilege('service_role',c.oid,'DELETE'),
    'policies',(SELECT COALESCE(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,
      'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))),'[]'::jsonb)
      FROM pg_policy p WHERE p.polrelid=c.oid)
  ) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN ('cafe_loyalty_experience','loyalty_scan_requests',
      'wallet_passes','wallet_apple_registrations','wallet_notification_jobs')),
  'functions',(SELECT jsonb_agg(jsonb_build_object(
    'signature',p.oid::regprocedure::text,'security_definer',p.prosecdef,'settings',p.proconfig,
    'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
    'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')
  ) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('scan_loyalty_stamp','scan_owner_loyalty_stamp',
      'apply_rast_loyalty_stamp','redeem_loyalty_reward','issue_rast_loyalty_card','set_rast_loyalty_settings',
      'claim_customer_phone_otp_dispatch','claim_wallet_notification_jobs','enqueue_rast_wallet_announcement',
      'record_loyalty_card_operation_legacy','issue_loyalty_card_for_customer_legacy','login_cafe_cashier')),
  'guards',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'trigger',t.tgname,'enabled',t.tgenabled)
    ORDER BY c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    WHERE NOT t.tgisinternal AND t.tgname IN ('guard_rast_card_ledger','guard_rast_reward_ledger',
      'guard_rast_event_ledger','guard_rast_redemption_ledger','preserve_rast_reward_terms',
      'snapshot_rast_loyalty_reward','guard_rast_wallet_announcement_fields','wallet_apple_device_limit')),
  'rast_program',(SELECT jsonb_build_object('exists',p.cafe_id IS NOT NULL,'enabled',p.enabled,
      'stamp_target',p.purchases_required,'apple_enabled',p.apple_wallet_enabled,'google_enabled',p.google_wallet_enabled)
    FROM public.cafes c LEFT JOIN public.cafe_loyalty_programs p ON p.cafe_id=c.id WHERE c.slug='rast' AND c.deleted_at IS NULL),
  'otp_dispatch_column',EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='customer_phone_otp_requests' AND column_name='provider_dispatched_at'),
  'cashier_null_password_guard',(SELECT bool_and(pg_get_functiondef(p.oid) ILIKE '%p_password IS NULL%'
    AND pg_get_functiondef(p.oid) ILIKE '%IS DISTINCT FROM extensions.crypt%')
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='login_cafe_cashier')
) AS rast_loyalty_postflight;
