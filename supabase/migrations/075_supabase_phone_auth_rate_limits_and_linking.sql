-- Supabase Phone Auth request limits and customer-profile linking.
-- The legacy custom OTP challenge functions remain available but are no longer
-- used by customer signup or login.
BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_phone_otp_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  phone_normalized text NOT NULL,
  purpose text NOT NULL,
  provider_instance text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT customer_phone_otp_requests_phone_check
    CHECK (phone_normalized ~ '^9665[0-9]{8}$'),
  CONSTRAINT customer_phone_otp_requests_purpose_check
    CHECK (purpose IN ('customer_signup', 'customer_login')),
  CONSTRAINT customer_phone_otp_requests_status_check
    CHECK (status IN ('pending', 'accepted', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_customer_phone_otp_requests_rate
  ON public.customer_phone_otp_requests (
    cafe_id,
    phone_normalized,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_customer_phone_otp_requests_global
  ON public.customer_phone_otp_requests (
    provider_instance,
    created_at DESC
  )
  WHERE status IN ('pending', 'accepted');

ALTER TABLE public.customer_phone_otp_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_phone_otp_requests
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.customer_phone_otp_requests TO service_role;

CREATE OR REPLACE FUNCTION public.begin_customer_phone_otp_request(
  p_cafe_id uuid,
  p_phone_normalized text,
  p_purpose text,
  p_provider_instance text,
  p_resend_seconds integer DEFAULT 60,
  p_hourly_limit integer DEFAULT 3,
  p_daily_limit integer DEFAULT 5,
  p_global_daily_limit integer DEFAULT 20
)
RETURNS TABLE (
  request_id uuid,
  result text,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_latest_at timestamptz;
  v_hourly_count integer;
  v_daily_count integer;
  v_global_count integer;
  v_phone_seen_today boolean;
  v_request_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_cafe_id::text || ':' || p_phone_normalized, 0)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended('customer-phone-otp-global:' || p_provider_instance, 0)
  );

  SELECT request.created_at
  INTO v_latest_at
  FROM public.customer_phone_otp_requests AS request
  WHERE request.cafe_id = p_cafe_id
    AND request.phone_normalized = p_phone_normalized
    AND request.status IN ('pending', 'accepted')
  ORDER BY request.created_at DESC
  LIMIT 1;

  IF v_latest_at IS NOT NULL
    AND v_latest_at + make_interval(secs => p_resend_seconds) > now()
  THEN
    RETURN QUERY SELECT
      NULL::uuid,
      'cooldown'::text,
      GREATEST(
        1,
        ceil(extract(epoch FROM (
          v_latest_at + make_interval(secs => p_resend_seconds) - now()
        )))::integer
      );
    RETURN;
  END IF;

  SELECT count(*)::integer
  INTO v_hourly_count
  FROM public.customer_phone_otp_requests AS request
  WHERE request.cafe_id = p_cafe_id
    AND request.phone_normalized = p_phone_normalized
    AND request.status IN ('pending', 'accepted')
    AND request.created_at >= now() - interval '1 hour';

  IF v_hourly_count >= p_hourly_limit THEN
    RETURN QUERY SELECT NULL::uuid, 'hourly_limit'::text, NULL::integer;
    RETURN;
  END IF;

  SELECT count(*)::integer
  INTO v_daily_count
  FROM public.customer_phone_otp_requests AS request
  WHERE request.cafe_id = p_cafe_id
    AND request.phone_normalized = p_phone_normalized
    AND request.status IN ('pending', 'accepted')
    AND request.created_at >= now() - interval '24 hours';

  IF v_daily_count >= p_daily_limit THEN
    RETURN QUERY SELECT NULL::uuid, 'daily_limit'::text, NULL::integer;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.customer_phone_otp_requests AS request
    WHERE request.provider_instance = p_provider_instance
      AND request.phone_normalized = p_phone_normalized
      AND request.status IN ('pending', 'accepted')
      AND request.created_at >= date_trunc('day', now())
  )
  INTO v_phone_seen_today;

  SELECT count(DISTINCT request.phone_normalized)::integer
  INTO v_global_count
  FROM public.customer_phone_otp_requests AS request
  WHERE request.provider_instance = p_provider_instance
    AND request.status IN ('pending', 'accepted')
    AND request.created_at >= date_trunc('day', now());

  IF NOT v_phone_seen_today AND v_global_count >= p_global_daily_limit THEN
    RETURN QUERY SELECT NULL::uuid, 'global_limit'::text, NULL::integer;
    RETURN;
  END IF;

  INSERT INTO public.customer_phone_otp_requests (
    cafe_id,
    phone_normalized,
    purpose,
    provider_instance
  )
  VALUES (
    p_cafe_id,
    p_phone_normalized,
    p_purpose,
    p_provider_instance
  )
  RETURNING id INTO v_request_id;

  RETURN QUERY SELECT v_request_id, 'created'::text, p_resend_seconds;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_customer_phone_otp_request(
  p_request_id uuid,
  p_accepted boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.customer_phone_otp_requests
  SET
    status = CASE WHEN p_accepted THEN 'accepted' ELSE 'failed' END,
    completed_at = now()
  WHERE id = p_request_id
    AND status = 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.link_customer_after_supabase_phone_otp(
  p_cafe_id uuid,
  p_phone_normalized text,
  p_purpose text,
  p_auth_user_id uuid
)
RETURNS TABLE (
  profile_id uuid,
  result text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.customer_profiles%ROWTYPE;
  v_profile_count integer;
  v_identity_user_id uuid;
BEGIN
  IF p_purpose NOT IN ('customer_signup', 'customer_login') THEN
    RETURN QUERY SELECT NULL::uuid, 'invalid_purpose'::text;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_cafe_id::text || ':' || p_phone_normalized, 0)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended('customer-phone-identity:' || p_phone_normalized, 0)
  );

  SELECT count(*)::integer
  INTO v_profile_count
  FROM public.customer_profiles AS profile
  WHERE profile.cafe_id = p_cafe_id
    AND profile.phone_normalized = p_phone_normalized;

  IF v_profile_count > 1 THEN
    UPDATE public.customer_profiles
    SET phone_auth_conflict = true
    WHERE cafe_id = p_cafe_id
      AND phone_normalized = p_phone_normalized;

    INSERT INTO public.customer_phone_auth_conflicts (
      cafe_id,
      phone_masked,
      profile_count
    )
    VALUES (
      p_cafe_id,
      substring(p_phone_normalized FROM 1 FOR 4)
        || '****'
        || right(p_phone_normalized, 4),
      v_profile_count
    )
    ON CONFLICT (cafe_id, phone_masked) WHERE status = 'open'
    DO UPDATE SET
      profile_count = EXCLUDED.profile_count,
      detected_at = now();

    RETURN QUERY SELECT NULL::uuid, 'profile_conflict'::text;
    RETURN;
  END IF;

  SELECT identity.auth_user_id
  INTO v_identity_user_id
  FROM public.customer_phone_auth_identities AS identity
  WHERE identity.phone_normalized = p_phone_normalized
  FOR UPDATE;

  IF v_identity_user_id IS NOT NULL
    AND v_identity_user_id <> p_auth_user_id
  THEN
    RETURN QUERY SELECT NULL::uuid, 'identity_conflict'::text;
    RETURN;
  END IF;

  SELECT profile.*
  INTO v_profile
  FROM public.customer_profiles AS profile
  WHERE profile.cafe_id = p_cafe_id
    AND profile.phone_normalized = p_phone_normalized
  LIMIT 1
  FOR UPDATE;

  IF v_profile.id IS NULL AND p_purpose = 'customer_login' THEN
    RETURN QUERY SELECT NULL::uuid, 'not_found'::text;
    RETURN;
  END IF;

  INSERT INTO public.customer_phone_auth_identities (
    phone_normalized,
    auth_user_id,
    updated_at
  )
  VALUES (p_phone_normalized, p_auth_user_id, now())
  ON CONFLICT (phone_normalized)
  DO UPDATE SET updated_at = now()
  WHERE customer_phone_auth_identities.auth_user_id = EXCLUDED.auth_user_id;

  IF v_profile.id IS NULL THEN
    INSERT INTO public.customer_profiles (
      cafe_id,
      user_id,
      full_name,
      phone,
      phone_normalized,
      email,
      phone_auth_conflict
    )
    VALUES (
      p_cafe_id,
      p_auth_user_id,
      'عميل',
      p_phone_normalized,
      p_phone_normalized,
      NULL,
      false
    )
    RETURNING * INTO v_profile;
  ELSE
    IF v_profile.phone_auth_conflict THEN
      RETURN QUERY SELECT NULL::uuid, 'profile_conflict'::text;
      RETURN;
    END IF;

    UPDATE public.customer_profiles
    SET
      user_id = p_auth_user_id,
      phone = p_phone_normalized,
      phone_normalized = p_phone_normalized,
      last_visit_at = now()
    WHERE id = v_profile.id
    RETURNING * INTO v_profile;
  END IF;

  RETURN QUERY SELECT v_profile.id, 'authenticated'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_customer_phone_otp_request(
  uuid, text, text, text, integer, integer, integer, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_customer_phone_otp_request(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.link_customer_after_supabase_phone_otp(
  uuid, text, text, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.begin_customer_phone_otp_request(
  uuid, text, text, text, integer, integer, integer, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_customer_phone_otp_request(uuid, boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.link_customer_after_supabase_phone_otp(
  uuid, text, text, uuid
) TO service_role;

COMMIT;
