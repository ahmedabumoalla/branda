SELECT
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscription_payment_requests' AND column_name='receipt_channel') AS receipt_channel_present,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='platform_settings' AND column_name='subscription_bank_details') AS bank_configuration_present,
  has_function_privilege('authenticated','public.create_bank_subscription_request(text,integer)','EXECUTE') AS owner_can_request,
  NOT has_function_privilege('anon','public.create_bank_subscription_request(text,integer)','EXECUTE') AS anonymous_request_denied,
  NOT has_function_privilege('anon','public.submit_subscription_whatsapp_receipt(uuid)','EXECUTE') AS anonymous_whatsapp_denied,
  NOT has_table_privilege('authenticated','public.subscription_payment_requests','INSERT,UPDATE,DELETE') AS requests_no_direct_mutation,
  (SELECT prosecdef AND proconfig @> ARRAY['search_path=""'] FROM pg_proc WHERE oid='public.create_bank_subscription_request(text,integer)'::regprocedure) AS request_function_safe_path,
  position('is_platform_admin' IN pg_get_functiondef('public.admin_approve_subscription_request(uuid)'::regprocedure)) > 0 AS approval_requires_admin,
  position('receipt_channel' IN pg_get_functiondef('public.admin_approve_subscription_request(uuid)'::regprocedure)) > 0 AS approval_supports_reviewed_whatsapp,
  EXISTS(SELECT 1 FROM storage.buckets WHERE id='subscription-receipts' AND public=false) AS receipt_bucket_private;
