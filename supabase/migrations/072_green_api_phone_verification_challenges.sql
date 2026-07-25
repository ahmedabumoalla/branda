-- GREEN-API customer registration OTP challenges.
-- OTP values and verification grants are stored only as HMAC-SHA256 hashes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.phone_verification_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  phone_normalized text NOT NULL,
  purpose text NOT NULL,
  code_hash text NOT NULL,
  verification_token_hash text,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  resend_available_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  send_count integer NOT NULL DEFAULT 1,
  locked_until timestamptz,
  provider text NOT NULL,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  consumed_at timestamptz,
  CONSTRAINT phone_verification_challenges_phone_check
    CHECK (phone_normalized ~ '^9665[0-9]{8}$'),
  CONSTRAINT phone_verification_challenges_purpose_check
    CHECK (purpose IN ('customer_registration')),
  CONSTRAINT phone_verification_challenges_status_check
    CHECK (
      status IN (
        'pending',
        'sent',
        'verified',
        'consumed',
        'superseded',
        'expired',
        'locked',
        'failed'
      )
    ),
  CONSTRAINT phone_verification_challenges_attempt_count_check
    CHECK (attempt_count >= 0),
  CONSTRAINT phone_verification_challenges_send_count_check
    CHECK (send_count >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_phone_verification_one_active
  ON public.phone_verification_challenges (cafe_id, phone_normalized, purpose)
  WHERE status IN ('pending', 'sent', 'verified');

CREATE INDEX IF NOT EXISTS idx_phone_verification_rate_limits
  ON public.phone_verification_challenges (
    cafe_id,
    phone_normalized,
    purpose,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_phone_verification_provider_daily
  ON public.phone_verification_challenges (provider, created_at DESC)
  WHERE provider_message_id IS NOT NULL;

ALTER TABLE public.phone_verification_challenges ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.phone_verification_challenges FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.phone_verification_challenges TO service_role;

CREATE OR REPLACE FUNCTION public.begin_phone_verification_challenge(
  p_cafe_id uuid,
  p_phone_normalized text,
  p_purpose text,
  p_code_hash text,
  p_provider text,
  p_ttl_seconds integer DEFAULT 300,
  p_resend_seconds integer DEFAULT 60,
  p_hourly_limit integer DEFAULT 3,
  p_daily_limit integer DEFAULT 5,
  p_global_daily_limit integer DEFAULT 20
)
RETURNS TABLE (
  challenge_id uuid,
  result text,
  retry_after_seconds integer,
  attempts_remaining integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_latest public.phone_verification_challenges%ROWTYPE;
  v_hourly_count integer;
  v_daily_count integer;
  v_global_count integer;
  v_phone_seen_today boolean;
  v_challenge_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_cafe_id::text || ':' || p_phone_normalized || ':' || p_purpose,
      0
    )
  );

  PERFORM pg_advisory_xact_lock(hashtextextended('phone-otp-global:' || p_provider, 0));

  SELECT c.*
    INTO v_latest
  FROM public.phone_verification_challenges AS c
  WHERE c.cafe_id = p_cafe_id
    AND c.phone_normalized = p_phone_normalized
    AND c.purpose = p_purpose
  ORDER BY c.created_at DESC
  LIMIT 1;

  IF v_latest.id IS NOT NULL
    AND v_latest.status = 'locked'
    AND v_latest.locked_until > now()
  THEN
    RETURN QUERY
      SELECT
        NULL::uuid,
        'locked'::text,
        GREATEST(1, ceil(extract(epoch FROM (v_latest.locked_until - now())))::integer),
        0;
    RETURN;
  END IF;

  IF v_latest.id IS NOT NULL
    AND v_latest.resend_available_at > now()
  THEN
    RETURN QUERY
      SELECT
        NULL::uuid,
        'cooldown'::text,
        GREATEST(1, ceil(extract(epoch FROM (v_latest.resend_available_at - now())))::integer),
        NULL::integer;
    RETURN;
  END IF;

  SELECT count(*)::integer
    INTO v_hourly_count
  FROM public.phone_verification_challenges AS c
  WHERE c.cafe_id = p_cafe_id
    AND c.phone_normalized = p_phone_normalized
    AND c.purpose = p_purpose
    AND c.created_at >= now() - interval '1 hour';

  IF v_hourly_count >= p_hourly_limit THEN
    RETURN QUERY SELECT NULL::uuid, 'hourly_limit'::text, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  SELECT count(*)::integer
    INTO v_daily_count
  FROM public.phone_verification_challenges AS c
  WHERE c.cafe_id = p_cafe_id
    AND c.phone_normalized = p_phone_normalized
    AND c.purpose = p_purpose
    AND c.created_at >= now() - interval '24 hours';

  IF v_daily_count >= p_daily_limit THEN
    RETURN QUERY SELECT NULL::uuid, 'daily_limit'::text, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.phone_verification_challenges AS c
    WHERE c.provider = p_provider
      AND c.phone_normalized = p_phone_normalized
      AND c.status IN ('pending', 'sent', 'verified', 'consumed', 'superseded')
      AND c.created_at >= date_trunc('day', now())
  )
  INTO v_phone_seen_today;

  SELECT count(DISTINCT c.phone_normalized)::integer
    INTO v_global_count
  FROM public.phone_verification_challenges AS c
  WHERE c.provider = p_provider
    AND c.status IN ('pending', 'sent', 'verified', 'consumed', 'superseded')
    AND c.created_at >= date_trunc('day', now());

  IF NOT v_phone_seen_today AND v_global_count >= p_global_daily_limit THEN
    RETURN QUERY SELECT NULL::uuid, 'global_limit'::text, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  UPDATE public.phone_verification_challenges AS c
  SET status = 'superseded'
  WHERE c.cafe_id = p_cafe_id
    AND c.phone_normalized = p_phone_normalized
    AND c.purpose = p_purpose
    AND c.status IN ('pending', 'sent', 'verified');

  INSERT INTO public.phone_verification_challenges (
    cafe_id,
    phone_normalized,
    purpose,
    code_hash,
    status,
    expires_at,
    resend_available_at,
    send_count,
    provider
  )
  VALUES (
    p_cafe_id,
    p_phone_normalized,
    p_purpose,
    p_code_hash,
    'pending',
    now() + make_interval(secs => p_ttl_seconds),
    now() + make_interval(secs => p_resend_seconds),
    v_daily_count + 1,
    p_provider
  )
  RETURNING id INTO v_challenge_id;

  RETURN QUERY
    SELECT v_challenge_id, 'created'::text, p_resend_seconds, p_hourly_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_phone_verification_delivery(
  p_challenge_id uuid,
  p_delivered boolean,
  p_provider_message_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.phone_verification_challenges
  SET
    status = CASE WHEN p_delivered THEN 'sent' ELSE 'failed' END,
    provider_message_id = CASE WHEN p_delivered THEN p_provider_message_id ELSE NULL END
  WHERE id = p_challenge_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PHONE_OTP_CHALLENGE_NOT_PENDING';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_phone_verification_challenge(
  p_cafe_id uuid,
  p_phone_normalized text,
  p_purpose text,
  p_code_hash text,
  p_verification_token_hash text,
  p_max_attempts integer DEFAULT 5,
  p_lock_seconds integer DEFAULT 900
)
RETURNS TABLE (
  challenge_id uuid,
  result text,
  retry_after_seconds integer,
  attempts_remaining integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_challenge public.phone_verification_challenges%ROWTYPE;
  v_next_attempt_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_cafe_id::text || ':' || p_phone_normalized || ':' || p_purpose,
      0
    )
  );

  SELECT c.*
    INTO v_challenge
  FROM public.phone_verification_challenges AS c
  WHERE c.cafe_id = p_cafe_id
    AND c.phone_normalized = p_phone_normalized
    AND c.purpose = p_purpose
  ORDER BY c.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_challenge.id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'invalid'::text, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  IF v_challenge.status IN ('verified', 'consumed') THEN
    RETURN QUERY SELECT v_challenge.id, 'already_used'::text, NULL::integer, 0;
    RETURN;
  END IF;

  IF v_challenge.status = 'locked' THEN
    RETURN QUERY
      SELECT
        v_challenge.id,
        'locked'::text,
        CASE
          WHEN v_challenge.locked_until > now()
          THEN GREATEST(
            1,
            ceil(extract(epoch FROM (v_challenge.locked_until - now())))::integer
          )
          ELSE NULL::integer
        END,
        0;
    RETURN;
  END IF;

  IF v_challenge.status <> 'sent' THEN
    RETURN QUERY SELECT v_challenge.id, 'invalid'::text, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  IF v_challenge.expires_at <= now() THEN
    UPDATE public.phone_verification_challenges
    SET status = 'expired'
    WHERE id = v_challenge.id;
    RETURN QUERY SELECT v_challenge.id, 'expired'::text, NULL::integer, 0;
    RETURN;
  END IF;

  IF v_challenge.code_hash = p_code_hash THEN
    UPDATE public.phone_verification_challenges
    SET
      status = 'verified',
      verification_token_hash = p_verification_token_hash,
      verified_at = now()
    WHERE id = v_challenge.id;

    RETURN QUERY
      SELECT
        v_challenge.id,
        'verified'::text,
        NULL::integer,
        GREATEST(0, p_max_attempts - v_challenge.attempt_count);
    RETURN;
  END IF;

  v_next_attempt_count := v_challenge.attempt_count + 1;

  IF v_next_attempt_count >= p_max_attempts THEN
    UPDATE public.phone_verification_challenges
    SET
      attempt_count = v_next_attempt_count,
      status = 'locked',
      locked_until = now() + make_interval(secs => p_lock_seconds)
    WHERE id = v_challenge.id;

    RETURN QUERY SELECT v_challenge.id, 'locked'::text, p_lock_seconds, 0;
    RETURN;
  END IF;

  UPDATE public.phone_verification_challenges
  SET attempt_count = v_next_attempt_count
  WHERE id = v_challenge.id;

  RETURN QUERY
    SELECT
      v_challenge.id,
      'invalid'::text,
      NULL::integer,
      p_max_attempts - v_next_attempt_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_verified_customer(
  p_challenge_id uuid,
  p_verification_token_hash text,
  p_cafe_id uuid,
  p_phone_normalized text,
  p_full_name text,
  p_email text,
  p_password_hash text
)
RETURNS public.customer_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_challenge public.phone_verification_challenges%ROWTYPE;
  v_profile public.customer_profiles%ROWTYPE;
BEGIN
  SELECT c.*
    INTO v_challenge
  FROM public.phone_verification_challenges AS c
  WHERE c.id = p_challenge_id
  FOR UPDATE;

  IF v_challenge.id IS NULL
    OR v_challenge.cafe_id <> p_cafe_id
    OR v_challenge.phone_normalized <> p_phone_normalized
    OR v_challenge.purpose <> 'customer_registration'
    OR v_challenge.status <> 'verified'
    OR v_challenge.verification_token_hash IS DISTINCT FROM p_verification_token_hash
    OR v_challenge.expires_at <= now()
    OR v_challenge.consumed_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'PHONE_OTP_VERIFICATION_REQUIRED';
  END IF;

  INSERT INTO public.customer_profiles (
    cafe_id,
    full_name,
    phone,
    email,
    password_hash,
    password_updated_at
  )
  VALUES (
    p_cafe_id,
    trim(p_full_name),
    p_phone_normalized,
    lower(trim(p_email)),
    p_password_hash,
    now()
  )
  RETURNING * INTO v_profile;

  UPDATE public.phone_verification_challenges
  SET
    status = 'consumed',
    consumed_at = now(),
    code_hash = encode(gen_random_bytes(32), 'hex'),
    verification_token_hash = NULL
  WHERE id = v_challenge.id;

  RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_phone_verification_challenge(
  uuid, text, text, text, text, integer, integer, integer, integer, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_phone_verification_delivery(
  uuid, boolean, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_phone_verification_challenge(
  uuid, text, text, text, text, integer, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_verified_customer(
  uuid, text, uuid, text, text, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.begin_phone_verification_challenge(
  uuid, text, text, text, text, integer, integer, integer, integer, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_phone_verification_delivery(
  uuid, boolean, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_phone_verification_challenge(
  uuid, text, text, text, text, integer, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_verified_customer(
  uuid, text, uuid, text, text, text, text
) TO service_role;

COMMIT;
