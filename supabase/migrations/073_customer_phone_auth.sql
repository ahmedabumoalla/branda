-- Phone-only customer authentication after external GREEN-API OTP verification.
BEGIN;

ALTER TABLE public.phone_verification_challenges
  DROP CONSTRAINT IF EXISTS phone_verification_challenges_purpose_check;

ALTER TABLE public.phone_verification_challenges
  ADD CONSTRAINT phone_verification_challenges_purpose_check
  CHECK (purpose IN (
    'customer_registration',
    'customer_signup',
    'customer_login'
  ));

ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS phone_normalized text,
  ADD COLUMN IF NOT EXISTS phone_auth_conflict boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.normalize_customer_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT CASE
    WHEN regexp_replace(p_phone, '[^0-9]', '', 'g') ~ '^05[0-9]{8}$'
      THEN '966' || substring(regexp_replace(p_phone, '[^0-9]', '', 'g') FROM 2)
    WHEN regexp_replace(p_phone, '[^0-9]', '', 'g') ~ '^5[0-9]{8}$'
      THEN '966' || regexp_replace(p_phone, '[^0-9]', '', 'g')
    WHEN regexp_replace(p_phone, '[^0-9]', '', 'g') ~ '^009665[0-9]{8}$'
      THEN substring(regexp_replace(p_phone, '[^0-9]', '', 'g') FROM 3)
    WHEN regexp_replace(p_phone, '[^0-9]', '', 'g') ~ '^9665[0-9]{8}$'
      THEN regexp_replace(p_phone, '[^0-9]', '', 'g')
    ELSE NULL
  END
$$;

UPDATE public.customer_profiles
SET phone_normalized = public.normalize_customer_phone(phone)
WHERE phone_normalized IS NULL
  AND phone IS NOT NULL;

UPDATE public.customer_profiles AS p
SET phone_auth_conflict = true
WHERE p.phone_normalized IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.customer_profiles AS duplicate
    WHERE duplicate.cafe_id = p.cafe_id
      AND duplicate.phone_normalized = p.phone_normalized
      AND duplicate.id <> p.id
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_profiles_cafe_phone_normalized
  ON public.customer_profiles (cafe_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL
    AND phone_auth_conflict = false;

CREATE TABLE IF NOT EXISTS public.customer_phone_auth_identities (
  phone_normalized text PRIMARY KEY,
  auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_phone_auth_identity_phone_check
    CHECK (phone_normalized ~ '^9665[0-9]{8}$')
);

CREATE TABLE IF NOT EXISTS public.customer_phone_auth_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  phone_masked text NOT NULL,
  profile_count integer NOT NULL CHECK (profile_count > 1),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_phone_auth_conflict_open
  ON public.customer_phone_auth_conflicts (cafe_id, phone_masked)
  WHERE status = 'open';

CREATE OR REPLACE FUNCTION public.sync_customer_phone_normalized()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_normalized text;
BEGIN
  v_normalized := public.normalize_customer_phone(NEW.phone);

  IF TG_OP = 'UPDATE'
    AND OLD.phone_normalized IS NOT NULL
    AND OLD.phone_normalized IS DISTINCT FROM v_normalized
    AND EXISTS (
      SELECT 1
      FROM public.customer_phone_auth_identities AS identity
      WHERE identity.phone_normalized = OLD.phone_normalized
        AND identity.auth_user_id = OLD.user_id
    )
  THEN
    RAISE EXCEPTION 'CUSTOMER_PHONE_CHANGE_REQUIRES_VERIFICATION';
  END IF;

  NEW.phone_normalized := v_normalized;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_customer_phone_normalized
  ON public.customer_profiles;
CREATE TRIGGER sync_customer_phone_normalized
  BEFORE INSERT OR UPDATE OF phone
  ON public.customer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_customer_phone_normalized();

INSERT INTO public.customer_phone_auth_identities (
  phone_normalized,
  auth_user_id
)
SELECT
  p.phone_normalized,
  min(p.user_id::text)::uuid
FROM public.customer_profiles AS p
WHERE p.phone_normalized IS NOT NULL
  AND p.user_id IS NOT NULL
GROUP BY p.phone_normalized
HAVING count(DISTINCT p.user_id) = 1
ON CONFLICT DO NOTHING;

ALTER TABLE public.customer_phone_auth_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_phone_auth_conflicts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.customer_phone_auth_identities
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.customer_phone_auth_conflicts
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.customer_phone_auth_identities TO service_role;
GRANT ALL ON TABLE public.customer_phone_auth_conflicts TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_customer_phone_auth(
  p_challenge_id uuid,
  p_verification_token_hash text,
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
  v_challenge public.phone_verification_challenges%ROWTYPE;
  v_profile public.customer_profiles%ROWTYPE;
  v_profile_count integer;
  v_identity_user_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_cafe_id::text || ':' || p_phone_normalized, 0)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended('customer-phone-identity:' || p_phone_normalized, 0)
  );

  SELECT challenge.*
  INTO v_challenge
  FROM public.phone_verification_challenges AS challenge
  WHERE challenge.id = p_challenge_id
  FOR UPDATE;

  IF v_challenge.id IS NULL
    OR v_challenge.cafe_id <> p_cafe_id
    OR v_challenge.phone_normalized <> p_phone_normalized
    OR v_challenge.purpose <> p_purpose
    OR p_purpose NOT IN ('customer_signup', 'customer_login')
    OR v_challenge.status <> 'verified'
    OR v_challenge.verification_token_hash IS DISTINCT FROM p_verification_token_hash
    OR v_challenge.expires_at <= now()
    OR v_challenge.consumed_at IS NOT NULL
  THEN
    RETURN QUERY SELECT NULL::uuid, 'verification_required'::text;
    RETURN;
  END IF;

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

    UPDATE public.phone_verification_challenges
    SET
      status = 'consumed',
      consumed_at = now(),
      code_hash = encode(gen_random_bytes(32), 'hex'),
      verification_token_hash = NULL
    WHERE id = v_challenge.id;

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
    UPDATE public.phone_verification_challenges
    SET
      status = 'consumed',
      consumed_at = now(),
      code_hash = encode(gen_random_bytes(32), 'hex'),
      verification_token_hash = NULL
    WHERE id = v_challenge.id;

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
    UPDATE public.phone_verification_challenges
    SET
      status = 'consumed',
      consumed_at = now(),
      code_hash = encode(gen_random_bytes(32), 'hex'),
      verification_token_hash = NULL
    WHERE id = v_challenge.id;

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
      UPDATE public.phone_verification_challenges
      SET
        status = 'consumed',
        consumed_at = now(),
        code_hash = encode(gen_random_bytes(32), 'hex'),
        verification_token_hash = NULL
      WHERE id = v_challenge.id;

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

  UPDATE public.phone_verification_challenges
  SET
    status = 'consumed',
    consumed_at = now(),
    code_hash = encode(gen_random_bytes(32), 'hex'),
    verification_token_hash = NULL
  WHERE id = v_challenge.id;

  RETURN QUERY SELECT v_profile.id, 'authenticated'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_customer_phone(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_customer_phone_normalized()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_customer_phone_auth(
  uuid, text, uuid, text, text, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.normalize_customer_phone(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_customer_phone_auth(
  uuid, text, uuid, text, text, uuid
) TO service_role;

COMMIT;
