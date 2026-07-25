-- pgTAP: customer signup names are required and preserved atomically.
BEGIN;
SELECT plan(12);

CREATE TEMP TABLE customer_signup_name_context AS
SELECT
  (array_agg(cafe.id ORDER BY cafe.created_at))[1] AS cafe_a,
  (array_agg(cafe.id ORDER BY cafe.created_at DESC))[1] AS cafe_b,
  (SELECT id FROM auth.users ORDER BY created_at LIMIT 1) AS auth_user_id
FROM public.cafes AS cafe
HAVING count(*) >= 2;

DELETE FROM public.customer_phone_auth_identities
WHERE phone_normalized = '966559900012'
   OR auth_user_id = (SELECT auth_user_id FROM customer_signup_name_context);
UPDATE public.customer_profiles
SET user_id = NULL
WHERE user_id = (SELECT auth_user_id FROM customer_signup_name_context);
DELETE FROM public.customer_profiles
WHERE phone_normalized = '966559900012';

SELECT is(
  (
    SELECT result
    FROM public.link_customer_after_supabase_phone_otp(
      (SELECT cafe_a FROM customer_signup_name_context),
      '966559900012',
      'customer_signup',
      (SELECT auth_user_id FROM customer_signup_name_context),
      NULL
    )
  ),
  'invalid_name',
  'signup rejects a missing name'
);

SELECT is(
  (
    SELECT result
    FROM public.link_customer_after_supabase_phone_otp(
      (SELECT cafe_a FROM customer_signup_name_context),
      '966559900012',
      'customer_signup',
      (SELECT auth_user_id FROM customer_signup_name_context),
      ' '
    )
  ),
  'invalid_name',
  'signup rejects a whitespace-only name'
);

SELECT is(
  (
    SELECT result
    FROM public.link_customer_after_supabase_phone_otp(
      (SELECT cafe_a FROM customer_signup_name_context),
      '966559900012',
      'customer_signup',
      (SELECT auth_user_id FROM customer_signup_name_context),
      'أ'
    )
  ),
  'invalid_name',
  'signup rejects a one-character name'
);

SELECT is(
  (
    SELECT result
    FROM public.link_customer_after_supabase_phone_otp(
      (SELECT cafe_a FROM customer_signup_name_context),
      '966559900012',
      'customer_signup',
      (SELECT auth_user_id FROM customer_signup_name_context),
      '  عميل الاختبار  '
    )
  ),
  'authenticated',
  'signup accepts a valid name'
);

SELECT is(
  (
    SELECT full_name
    FROM public.customer_profiles
    WHERE cafe_id = (SELECT cafe_a FROM customer_signup_name_context)
      AND phone_normalized = '966559900012'
  ),
  'عميل الاختبار',
  'signup trims and persists the supplied name'
);

SELECT is(
  (
    SELECT result
    FROM public.link_customer_after_supabase_phone_otp(
      (SELECT cafe_a FROM customer_signup_name_context),
      '966559900012',
      'customer_signup',
      (SELECT auth_user_id FROM customer_signup_name_context),
      'اسم بديل'
    )
  ),
  'authenticated',
  'repeated signup remains idempotent'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.customer_profiles
    WHERE cafe_id = (SELECT cafe_a FROM customer_signup_name_context)
      AND phone_normalized = '966559900012'
  ),
  1,
  'repeated signup does not create a duplicate'
);

SELECT is(
  (
    SELECT full_name
    FROM public.customer_profiles
    WHERE cafe_id = (SELECT cafe_a FROM customer_signup_name_context)
      AND phone_normalized = '966559900012'
  ),
  'عميل الاختبار',
  'repeated signup does not replace the existing name'
);

SELECT is(
  (
    SELECT result
    FROM public.link_customer_after_supabase_phone_otp(
      (SELECT cafe_a FROM customer_signup_name_context),
      '966559900012',
      'customer_login',
      (SELECT auth_user_id FROM customer_signup_name_context)
    )
  ),
  'authenticated',
  'login does not require a name'
);

SELECT is(
  (
    SELECT full_name
    FROM public.customer_profiles
    WHERE cafe_id = (SELECT cafe_a FROM customer_signup_name_context)
      AND phone_normalized = '966559900012'
  ),
  'عميل الاختبار',
  'login does not change the existing name'
);

SELECT is(
  (
    SELECT result
    FROM public.link_customer_after_supabase_phone_otp(
      (SELECT cafe_b FROM customer_signup_name_context),
      '966559900012',
      'customer_signup',
      (SELECT auth_user_id FROM customer_signup_name_context),
      'عميل العلامة الثانية'
    )
  ),
  'authenticated',
  'the same phone can sign up in a second cafe'
);

SELECT is(
  (
    SELECT count(DISTINCT cafe_id)::integer
    FROM public.customer_profiles
    WHERE phone_normalized = '966559900012'
      AND user_id = (SELECT auth_user_id FROM customer_signup_name_context)
  ),
  2,
  'the same phone remains isolated between cafes'
);

SELECT * FROM finish();
ROLLBACK;
