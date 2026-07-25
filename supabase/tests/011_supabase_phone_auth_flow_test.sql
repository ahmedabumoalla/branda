-- pgTAP: Supabase Phone Auth rate limits and customer-profile linking.
BEGIN;
SELECT plan(11);

CREATE TEMP TABLE supabase_phone_auth_context AS
SELECT
  (array_agg(cafe.id ORDER BY cafe.created_at))[1] AS cafe_a,
  (array_agg(cafe.id ORDER BY cafe.created_at DESC))[1] AS cafe_b,
  (SELECT id FROM auth.users ORDER BY created_at LIMIT 1) AS auth_user_id
FROM public.cafes AS cafe
HAVING count(*) >= 2;

SELECT ok(
  (SELECT cafe_a IS NOT NULL AND cafe_b IS NOT NULL AND auth_user_id IS NOT NULL
   FROM supabase_phone_auth_context),
  'test has two cafes and an auth user'
);

SELECT is(
  (
    SELECT result
    FROM public.begin_customer_phone_otp_request(
      (SELECT cafe_a FROM supabase_phone_auth_context),
      '966559900001',
      'customer_signup',
      'green_api:test-instance'
    )
  ),
  'created',
  'first Supabase phone OTP request is reserved'
);

SELECT public.complete_customer_phone_otp_request(
  (
    SELECT id
    FROM public.customer_phone_otp_requests
    WHERE phone_normalized = '966559900001'
    ORDER BY created_at DESC
    LIMIT 1
  ),
  true
);

SELECT is(
  (
    SELECT result
    FROM public.begin_customer_phone_otp_request(
      (SELECT cafe_a FROM supabase_phone_auth_context),
      '966559900001',
      'customer_signup',
      'green_api:test-instance'
    )
  ),
  'cooldown',
  'resend cooldown is enforced'
);

DELETE FROM public.customer_phone_auth_identities
WHERE auth_user_id = (SELECT auth_user_id FROM supabase_phone_auth_context);
UPDATE public.customer_profiles
SET user_id = NULL
WHERE user_id = (SELECT auth_user_id FROM supabase_phone_auth_context);

SELECT is(
  (
    SELECT result
    FROM public.link_customer_after_supabase_phone_otp(
      (SELECT cafe_a FROM supabase_phone_auth_context),
      '966559900001',
      'customer_signup',
      (SELECT auth_user_id FROM supabase_phone_auth_context),
      'عميل الاختبار'
    )
  ),
  'authenticated',
  'verified Supabase signup creates a customer profile'
);

SELECT ok(
  (
    SELECT email IS NULL
      AND user_id = (SELECT auth_user_id FROM supabase_phone_auth_context)
    FROM public.customer_profiles
    WHERE cafe_id = (SELECT cafe_a FROM supabase_phone_auth_context)
      AND phone_normalized = '966559900001'
  ),
  'new phone customer has no email dependency'
);

SELECT is(
  (
    SELECT result
    FROM public.link_customer_after_supabase_phone_otp(
      (SELECT cafe_a FROM supabase_phone_auth_context),
      '966559900001',
      'customer_signup',
      (SELECT auth_user_id FROM supabase_phone_auth_context),
      'اسم لن يستبدل الاسم الحالي'
    )
  ),
  'authenticated',
  'repeated linking is idempotent'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.customer_profiles
    WHERE cafe_id = (SELECT cafe_a FROM supabase_phone_auth_context)
      AND phone_normalized = '966559900001'
  ),
  1,
  'repeated linking does not duplicate customer profile'
);

SELECT is(
  (
    SELECT result
    FROM public.link_customer_after_supabase_phone_otp(
      (SELECT cafe_b FROM supabase_phone_auth_context),
      '966559900001',
      'customer_login',
      (SELECT auth_user_id FROM supabase_phone_auth_context)
    )
  ),
  'not_found',
  'login does not create a profile in another cafe'
);

SELECT is(
  (
    SELECT result
    FROM public.link_customer_after_supabase_phone_otp(
      (SELECT cafe_b FROM supabase_phone_auth_context),
      '966559900001',
      'customer_signup',
      (SELECT auth_user_id FROM supabase_phone_auth_context),
      'عميل العلامة الثانية'
    )
  ),
  'authenticated',
  'same auth user can register in another cafe'
);

SELECT is(
  (
    SELECT count(DISTINCT cafe_id)::integer
    FROM public.customer_profiles
    WHERE phone_normalized = '966559900001'
      AND user_id = (SELECT auth_user_id FROM supabase_phone_auth_context)
  ),
  2,
  'same phone remains isolated in two cafes'
);

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.begin_customer_phone_otp_request(
      gen_random_uuid(),
      '966559900099',
      'customer_login',
      'green_api:test-instance'
    )$$,
  '42501',
  NULL,
  'phone OTP rate-limit RPC is server-only'
);

SELECT * FROM finish();
ROLLBACK;
