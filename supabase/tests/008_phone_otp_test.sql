-- pgTAP: GREEN-API customer registration OTP security and rate limits.
BEGIN;
SELECT plan(15);

CREATE TEMP TABLE otp_test_context (
  cafe_id uuid NOT NULL,
  challenge_id uuid,
  code_hash text NOT NULL,
  grant_hash text NOT NULL
);

INSERT INTO otp_test_context (cafe_id, code_hash, grant_hash)
SELECT id, repeat('a', 64), repeat('b', 64)
FROM public.cafes
ORDER BY created_at
LIMIT 1;

SELECT ok(
  (SELECT cafe_id IS NOT NULL FROM otp_test_context),
  'OTP test cafe exists'
);

SELECT is(
  (
    SELECT result
    FROM public.begin_phone_verification_challenge(
      (SELECT cafe_id FROM otp_test_context),
      '966500000001',
      'customer_registration',
      repeat('a', 64),
      'green_api:test-instance'
    )
  ),
  'created',
  'first OTP challenge is created'
);

UPDATE otp_test_context
SET challenge_id = (
  SELECT id
  FROM public.phone_verification_challenges
  WHERE phone_normalized = '966500000001'
  ORDER BY created_at DESC
  LIMIT 1
);

SELECT lives_ok(
  format(
    'SELECT public.complete_phone_verification_delivery(%L::uuid, true, %L)',
    (SELECT challenge_id FROM otp_test_context),
    'provider-message-1'
  ),
  'provider acceptance marks challenge sent'
);

SELECT is(
  (
    SELECT result
    FROM public.begin_phone_verification_challenge(
      (SELECT cafe_id FROM otp_test_context),
      '966500000001',
      'customer_registration',
      repeat('c', 64),
      'green_api:test-instance'
    )
  ),
  'cooldown',
  'resend is rejected during cooldown'
);

SELECT is(
  (
    SELECT result
    FROM public.verify_phone_verification_challenge(
      (SELECT cafe_id FROM otp_test_context),
      '966500000001',
      'customer_registration',
      repeat('f', 64),
      repeat('b', 64)
    )
  ),
  'invalid',
  'wrong OTP is rejected'
);

SELECT public.verify_phone_verification_challenge(
  (SELECT cafe_id FROM otp_test_context),
  '966500000001',
  'customer_registration',
  repeat('f', 64),
  repeat('b', 64)
) FROM generate_series(1, 3);

SELECT is(
  (
    SELECT result
    FROM public.verify_phone_verification_challenge(
      (SELECT cafe_id FROM otp_test_context),
      '966500000001',
      'customer_registration',
      repeat('f', 64),
      repeat('b', 64)
    )
  ),
  'locked',
  'fifth wrong OTP locks verification'
);

INSERT INTO public.phone_verification_challenges (
  cafe_id, phone_normalized, purpose, code_hash, status, expires_at,
  resend_available_at, provider, provider_message_id
)
VALUES (
  (SELECT cafe_id FROM otp_test_context),
  '966500000002',
  'customer_registration',
  repeat('a', 64),
  'sent',
  now() - interval '1 second',
  now() - interval '1 second',
  'green_api:test-instance',
  'provider-message-expired'
);

SELECT is(
  (
    SELECT result
    FROM public.verify_phone_verification_challenge(
      (SELECT cafe_id FROM otp_test_context),
      '966500000002',
      'customer_registration',
      repeat('a', 64),
      repeat('b', 64)
    )
  ),
  'expired',
  'expired OTP is rejected'
);

INSERT INTO public.phone_verification_challenges (
  cafe_id, phone_normalized, purpose, code_hash, status, expires_at,
  resend_available_at, provider, provider_message_id
)
VALUES (
  (SELECT cafe_id FROM otp_test_context),
  '966500000003',
  'customer_registration',
  repeat('a', 64),
  'sent',
  now() + interval '5 minutes',
  now() + interval '1 minute',
  'green_api:test-instance',
  'provider-message-valid'
);

SELECT is(
  (
    SELECT result
    FROM public.verify_phone_verification_challenge(
      (SELECT cafe_id FROM otp_test_context),
      '966500000003',
      'customer_registration',
      repeat('a', 64),
      repeat('b', 64)
    )
  ),
  'verified',
  'correct OTP is verified'
);

SELECT lives_ok(
  format(
    $sql$
      SELECT public.register_verified_customer(
        %L::uuid, %L, %L::uuid, %L, %L, %L, %L
      )
    $sql$,
    (
      SELECT id
      FROM public.phone_verification_challenges
      WHERE phone_normalized = '966500000003'
    ),
    repeat('b', 64),
    (SELECT cafe_id FROM otp_test_context),
    '966500000003',
    'OTP Test Customer',
    'otp-test@example.invalid',
    repeat('d', 64)
  ),
  'verified OTP atomically creates customer'
);

SELECT throws_ok(
  format(
    $sql$
      SELECT public.register_verified_customer(
        %L::uuid, %L, %L::uuid, %L, %L, %L, %L
      )
    $sql$,
    (
      SELECT id
      FROM public.phone_verification_challenges
      WHERE phone_normalized = '966500000003'
    ),
    repeat('b', 64),
    (SELECT cafe_id FROM otp_test_context),
    '966500000003',
    'OTP Test Customer 2',
    'otp-test-2@example.invalid',
    repeat('d', 64)
  ),
  'P0001',
  'PHONE_OTP_VERIFICATION_REQUIRED',
  'verified OTP cannot be reused'
);

INSERT INTO public.phone_verification_challenges (
  cafe_id, phone_normalized, purpose, code_hash, status, expires_at,
  resend_available_at, provider, provider_message_id, created_at
)
SELECT
  (SELECT cafe_id FROM otp_test_context),
  '966500000004',
  'customer_registration',
  repeat('a', 64),
  'superseded',
  now() + interval '5 minutes',
  now() - interval '1 second',
  'green_api:hour-instance',
  'hour-' || value,
  now() - (value * interval '2 minutes')
FROM generate_series(1, 3) AS value;

SELECT is(
  (
    SELECT result
    FROM public.begin_phone_verification_challenge(
      (SELECT cafe_id FROM otp_test_context),
      '966500000004',
      'customer_registration',
      repeat('a', 64),
      'green_api:hour-instance'
    )
  ),
  'hourly_limit',
  'three sends per hour are enforced'
);

INSERT INTO public.phone_verification_challenges (
  cafe_id, phone_normalized, purpose, code_hash, status, expires_at,
  resend_available_at, provider, provider_message_id, created_at
)
SELECT
  (SELECT cafe_id FROM otp_test_context),
  '966500000005',
  'customer_registration',
  repeat('a', 64),
  'superseded',
  now() + interval '5 minutes',
  now() - interval '1 second',
  'green_api:day-instance',
  'day-' || value,
  now() - (value * interval '2 hours')
FROM generate_series(1, 5) AS value;

SELECT is(
  (
    SELECT result
    FROM public.begin_phone_verification_challenge(
      (SELECT cafe_id FROM otp_test_context),
      '966500000005',
      'customer_registration',
      repeat('a', 64),
      'green_api:day-instance'
    )
  ),
  'daily_limit',
  'five sends per day are enforced'
);

INSERT INTO public.phone_verification_challenges (
  cafe_id, phone_normalized, purpose, code_hash, status, expires_at,
  resend_available_at, provider, provider_message_id
)
SELECT
  (SELECT cafe_id FROM otp_test_context),
  '9665' || lpad(value::text, 8, '0'),
  'customer_registration',
  repeat('a', 64),
  'sent',
  now() + interval '5 minutes',
  now() + interval '1 minute',
  'green_api:global-instance',
  'global-' || value
FROM generate_series(10, 29) AS value;

SELECT is(
  (
    SELECT result
    FROM public.begin_phone_verification_challenge(
      (SELECT cafe_id FROM otp_test_context),
      '966500000030',
      'customer_registration',
      repeat('a', 64),
      'green_api:global-instance'
    )
  ),
  'global_limit',
  'twenty unique daily recipients per instance are enforced'
);

SELECT is(
  (
    SELECT result
    FROM public.begin_phone_verification_challenge(
      (SELECT cafe_id FROM otp_test_context),
      '966500000030',
      'customer_registration',
      repeat('a', 64),
      'green_api:other-instance'
    )
  ),
  'created',
  'global recipient limit is isolated by instance'
);

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.begin_phone_verification_challenge(
      '00000000-0000-0000-0000-000000000000'::uuid,
      '966500000099',
      'customer_registration',
      repeat('a', 64),
      'green_api:test-instance'
    )$$,
  '42501',
  NULL,
  'OTP RPC is server-only'
);

SELECT * FROM finish();
ROLLBACK;
