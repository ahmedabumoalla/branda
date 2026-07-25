-- Require and atomically persist a customer name after verified phone signup.
BEGIN;

DROP FUNCTION IF EXISTS public.link_customer_after_supabase_phone_otp(
  uuid, text, text, uuid
);

CREATE FUNCTION public.link_customer_after_supabase_phone_otp(
  p_cafe_id uuid,
  p_phone_normalized text,
  p_purpose text,
  p_auth_user_id uuid,
  p_full_name text DEFAULT NULL
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
  v_full_name text;
BEGIN
  IF p_purpose NOT IN ('customer_signup', 'customer_login') THEN
    RETURN QUERY SELECT NULL::uuid, 'invalid_purpose'::text;
    RETURN;
  END IF;

  v_full_name := btrim(coalesce(p_full_name, ''));
  IF p_purpose = 'customer_signup'
    AND char_length(v_full_name) NOT BETWEEN 2 AND 120
  THEN
    RETURN QUERY SELECT NULL::uuid, 'invalid_name'::text;
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
      v_full_name,
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

REVOKE ALL ON FUNCTION public.link_customer_after_supabase_phone_otp(
  uuid, text, text, uuid, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.link_customer_after_supabase_phone_otp(
  uuid, text, text, uuid, text
) TO service_role;

COMMIT;
