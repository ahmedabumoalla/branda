-- pgTAP: phone-only customer signup/login, legacy linking, conflicts, and isolation.
BEGIN;
SELECT plan(13);

CREATE TEMP TABLE customer_phone_auth_test_context (
  cafe_a uuid NOT NULL,
  cafe_b uuid NOT NULL,
  auth_user_id uuid NOT NULL,
  challenge_id uuid,
  grant_hash text NOT NULL DEFAULT repeat('b', 64)
);

INSERT INTO customer_phone_auth_test_context (cafe_a, cafe_b, auth_user_id)
SELECT
  (array_agg(c.id ORDER BY c.created_at))[1],
  (array_agg(c.id ORDER BY c.created_at DESC))[1],
  (SELECT id FROM auth.users ORDER BY created_at LIMIT 1)
FROM public.cafes AS c
HAVING count(*) >= 2;

SELECT ok(
  (SELECT cafe_a IS NOT NULL AND cafe_b IS NOT NULL AND auth_user_id IS NOT NULL
   FROM customer_phone_auth_test_context),
  'test has two cafes and one auth user'
);

DELETE FROM public.customer_phone_auth_identities
WHERE auth_user_id = (SELECT auth_user_id FROM customer_phone_auth_test_context);

UPDATE public.customer_profiles
SET user_id = NULL
WHERE user_id = (SELECT auth_user_id FROM customer_phone_auth_test_context);

SELECT is(
  public.normalize_customer_phone('0551234567'),
  '966551234567',
  'Saudi local phone is normalized'
);

SELECT is(
  public.normalize_customer_phone('+966 55 123 4567'),
  '966551234567',
  'Saudi international phone is normalized'
);

INSERT INTO public.phone_verification_challenges (
  cafe_id,
  phone_normalized,
  purpose,
  code_hash,
  verification_token_hash,
  status,
  expires_at,
  resend_available_at,
  provider,
  provider_message_id,
  verified_at
)
VALUES (
  (SELECT cafe_a FROM customer_phone_auth_test_context),
  '966551234567',
  'customer_signup',
  repeat('a', 64),
  repeat('b', 64),
  'verified',
  now() + interval '5 minutes',
  now(),
  'green_api:test-instance',
  'signup-message',
  now()
);

CREATE TEMP TABLE signup_challenge AS
SELECT id
FROM public.phone_verification_challenges
WHERE provider_message_id = 'signup-message';

SELECT is(
  (
    SELECT result
    FROM public.finalize_customer_phone_auth(
      (SELECT id FROM signup_challenge),
      repeat('b', 64),
      (SELECT cafe_a FROM customer_phone_auth_test_context),
      '966551234567',
      'customer_signup',
      (SELECT auth_user_id FROM customer_phone_auth_test_context)
    )
  ),
  'authenticated',
  'verified signup creates customer profile'
);

SELECT ok(
  (
    SELECT email IS NULL
      AND phone_normalized = '966551234567'
      AND user_id = (SELECT auth_user_id FROM customer_phone_auth_test_context)
    FROM public.customer_profiles
    WHERE cafe_id = (SELECT cafe_a FROM customer_phone_auth_test_context)
      AND phone_normalized = '966551234567'
  ),
  'signup profile needs no email and links auth user'
);

SELECT is(
  (
    SELECT result
    FROM public.finalize_customer_phone_auth(
      (SELECT id FROM signup_challenge),
      repeat('b', 64),
      (SELECT cafe_a FROM customer_phone_auth_test_context),
      '966551234567',
      'customer_signup',
      (SELECT auth_user_id FROM customer_phone_auth_test_context)
    )
  ),
  'verification_required',
  'consumed signup OTP cannot be reused'
);

INSERT INTO public.customer_profiles (
  cafe_id,
  user_id,
  full_name,
  phone,
  phone_normalized,
  email
)
VALUES (
  (SELECT cafe_b FROM customer_phone_auth_test_context),
  NULL,
  'Legacy Customer',
  '0551234567',
  '966551234567',
  'legacy-phone-auth@example.invalid'
);

INSERT INTO public.phone_verification_challenges (
  cafe_id, phone_normalized, purpose, code_hash, verification_token_hash,
  status, expires_at, resend_available_at, provider, provider_message_id, verified_at
)
VALUES (
  (SELECT cafe_b FROM customer_phone_auth_test_context),
  '966551234567',
  'customer_login',
  repeat('a', 64),
  repeat('b', 64),
  'verified',
  now() + interval '5 minutes',
  now(),
  'green_api:test-instance',
  'login-message',
  now()
);

CREATE TEMP TABLE login_challenge AS
SELECT id
FROM public.phone_verification_challenges
WHERE provider_message_id = 'login-message';

SELECT is(
  (
    SELECT result
    FROM public.finalize_customer_phone_auth(
      (SELECT id FROM login_challenge),
      repeat('b', 64),
      (SELECT cafe_b FROM customer_phone_auth_test_context),
      '966551234567',
      'customer_login',
      (SELECT auth_user_id FROM customer_phone_auth_test_context)
    )
  ),
  'authenticated',
  'legacy customer logs in by phone without duplicate profile'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.customer_profiles
    WHERE cafe_id = (SELECT cafe_b FROM customer_phone_auth_test_context)
      AND phone_normalized = '966551234567'
  ),
  1,
  'legacy login preserves exactly one profile'
);

SELECT is(
  (
    SELECT count(DISTINCT cafe_id)::integer
    FROM public.customer_profiles
    WHERE phone_normalized = '966551234567'
      AND user_id = (SELECT auth_user_id FROM customer_phone_auth_test_context)
  ),
  2,
  'one auth user links isolated profiles in two cafes'
);

INSERT INTO public.phone_verification_challenges (
  cafe_id, phone_normalized, purpose, code_hash, verification_token_hash,
  status, expires_at, resend_available_at, provider, provider_message_id, verified_at
)
VALUES (
  (SELECT cafe_a FROM customer_phone_auth_test_context),
  '966551234568',
  'customer_login',
  repeat('a', 64),
  repeat('b', 64),
  'verified',
  now() + interval '5 minutes',
  now(),
  'green_api:test-instance',
  'missing-message',
  now()
);

CREATE TEMP TABLE missing_challenge AS
SELECT id
FROM public.phone_verification_challenges
WHERE provider_message_id = 'missing-message';

SELECT is(
  (
    SELECT result
    FROM public.finalize_customer_phone_auth(
      (SELECT id FROM missing_challenge),
      repeat('b', 64),
      (SELECT cafe_a FROM customer_phone_auth_test_context),
      '966551234568',
      'customer_login',
      gen_random_uuid()
    )
  ),
  'not_found',
  'login does not create a missing customer'
);

INSERT INTO public.customer_profiles (
  cafe_id, full_name, phone, phone_normalized, phone_auth_conflict
)
VALUES
  (
    (SELECT cafe_a FROM customer_phone_auth_test_context),
    'Conflict One',
    '966551234569',
    '966551234569',
    true
  ),
  (
    (SELECT cafe_a FROM customer_phone_auth_test_context),
    'Conflict Two',
    '0551234569',
    '966551234569',
    true
  );

INSERT INTO public.phone_verification_challenges (
  cafe_id, phone_normalized, purpose, code_hash, verification_token_hash,
  status, expires_at, resend_available_at, provider, provider_message_id, verified_at
)
VALUES (
  (SELECT cafe_a FROM customer_phone_auth_test_context),
  '966551234569',
  'customer_login',
  repeat('a', 64),
  repeat('b', 64),
  'verified',
  now() + interval '5 minutes',
  now(),
  'green_api:test-instance',
  'conflict-message',
  now()
);

CREATE TEMP TABLE conflict_challenge AS
SELECT id
FROM public.phone_verification_challenges
WHERE provider_message_id = 'conflict-message';

SELECT is(
  (
    SELECT result
    FROM public.finalize_customer_phone_auth(
      (SELECT id FROM conflict_challenge),
      repeat('b', 64),
      (SELECT cafe_a FROM customer_phone_auth_test_context),
      '966551234569',
      'customer_login',
      gen_random_uuid()
    )
  ),
  'profile_conflict',
  'duplicate same-cafe phone profiles block login'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.customer_phone_auth_conflicts
    WHERE cafe_id = (SELECT cafe_a FROM customer_phone_auth_test_context)
      AND phone_masked = '9665****4569'
      AND status = 'open'
  ),
  'duplicate phone is logged masked for administrative review'
);

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.finalize_customer_phone_auth(
      gen_random_uuid(),
      repeat('b', 64),
      gen_random_uuid(),
      '966551234567',
      'customer_login',
      gen_random_uuid()
    )$$,
  '42501',
  NULL,
  'phone auth finalization is server-only'
);

SELECT * FROM finish();
ROLLBACK;
