SELECT
  to_regclass('public.subscription_payment_requests') IS NOT NULL AS payment_requests_exist,
  to_regclass('public.platform_settings') IS NOT NULL AS platform_settings_exist,
  to_regclass('public.brand_referrals') IS NOT NULL AS referral_table_exists,
  to_regclass('public.representative_commissions') IS NOT NULL AS commissions_table_exists,
  to_regprocedure('public.admin_approve_subscription_request(uuid)') IS NOT NULL AS approval_function_exists,
  to_regprocedure('public.attach_subscription_payment_receipt(uuid,text)') IS NOT NULL AS attachment_function_exists,
  to_regprocedure('public.calculate_subscription_expiry(timestamp with time zone,text,integer)') IS NOT NULL AS expiry_function_exists,
  EXISTS(SELECT 1 FROM storage.buckets WHERE id='subscription-receipts' AND public=false) AS receipt_bucket_private,
  EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_subscription_payment_requests_open_cafe') AS one_open_request_index,
  NOT has_table_privilege('authenticated','public.subscription_payment_requests','INSERT,UPDATE,DELETE') AS requests_no_direct_mutation;
