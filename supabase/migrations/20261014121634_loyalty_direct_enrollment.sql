-- Name/phone enrollment grants access to loyalty only, never Supabase Auth.
CREATE SCHEMA IF NOT EXISTS loyalty_enrollment_private;
REVOKE ALL ON SCHEMA loyalty_enrollment_private FROM PUBLIC, anon, authenticated;
CREATE TABLE loyalty_enrollment_private.attempt_buckets (
  bucket_key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 1
);
ALTER TABLE loyalty_enrollment_private.attempt_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON loyalty_enrollment_private.attempt_buckets FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.issue_rast_loyalty_card(p_customer_profile_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_profile public.customer_profiles%ROWTYPE; v_card public.loyalty_cards%ROWTYPE;
BEGIN
  SELECT cp.* INTO v_profile FROM public.customer_profiles cp
  JOIN public.cafes c ON c.id=cp.cafe_id AND c.deleted_at IS NULL
    AND platform_access_private.service_enabled(c.id,'loyalty')
  JOIN public.cafe_loyalty_programs p ON p.cafe_id=c.id AND p.enabled
  WHERE cp.id=p_customer_profile_id AND NOT cp.phone_auth_conflict
    AND cp.status='active' AND cp.blocked_at IS NULL AND cp.phone_normalized ~ '^9665[0-9]{8}$'
  FOR SHARE OF cp,p;
  IF v_profile.id IS NULL THEN RAISE EXCEPTION 'Loyalty enrollment unavailable'; END IF;
  INSERT INTO public.loyalty_cards(cafe_id,customer_profile_id,customer_name,customer_phone,customer_email)
  VALUES(v_profile.cafe_id,v_profile.id,v_profile.full_name,v_profile.phone,v_profile.email)
  ON CONFLICT(cafe_id,customer_profile_id) DO NOTHING;
  SELECT * INTO v_card FROM public.loyalty_cards WHERE cafe_id=v_profile.cafe_id AND customer_profile_id=v_profile.id;
  IF v_card.status<>'active' THEN RAISE EXCEPTION 'Loyalty card suspended'; END IF;
  RETURN v_card.card_code;
END;
$$;
REVOKE ALL ON FUNCTION public.issue_rast_loyalty_card(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_rast_loyalty_card(uuid) TO service_role;

CREATE FUNCTION public.enroll_loyalty_customer_direct(p_cafe_id uuid,p_full_name text,p_phone text,p_client_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_phone text:=public.normalize_customer_phone(p_phone); v_name text:=regexp_replace(btrim(p_full_name),'\s+',' ','g');
  v_profile public.customer_profiles%ROWTYPE; v_count integer; v_returning boolean; v_bucket record; v_attempts integer;
BEGIN
  IF v_phone IS NULL OR v_name IS NULL OR length(v_name) NOT BETWEEN 2 AND 120
    OR p_client_key IS NULL OR p_client_key !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_input');
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.cafes c JOIN public.cafe_loyalty_programs p ON p.cafe_id=c.id AND p.enabled
    WHERE c.id=p_cafe_id AND c.deleted_at IS NULL AND platform_access_private.service_enabled(c.id,'loyalty')) THEN
    RETURN jsonb_build_object('ok',false,'reason','unavailable');
  END IF;
  -- Fixed-order atomic counters survive rejected name matches and concurrent calls.
  FOR v_bucket IN SELECT * FROM (VALUES
    ('client:'||p_client_key,30),
    ('phone:'||p_cafe_id::text||':'||md5(v_phone),10)
  ) AS limits(key,max_attempts) ORDER BY key LOOP
    INSERT INTO loyalty_enrollment_private.attempt_buckets AS b(bucket_key) VALUES(v_bucket.key)
    ON CONFLICT(bucket_key) DO UPDATE SET
      attempts=CASE WHEN b.window_started_at < now()-interval '15 minutes' THEN 1 ELSE b.attempts+1 END,
      window_started_at=CASE WHEN b.window_started_at < now()-interval '15 minutes' THEN now() ELSE b.window_started_at END
    RETURNING attempts INTO v_attempts;
    IF v_attempts>v_bucket.max_attempts THEN RETURN jsonb_build_object('ok',false,'reason','rate_limited'); END IF;
  END LOOP;
  -- Serialize enrollment per brand/normalized phone; legacy ambiguous identities fail closed.
  PERFORM pg_advisory_xact_lock(hashtextextended('loyalty-enroll:'||p_cafe_id::text||':'||v_phone,0));
  SELECT count(*) INTO v_count FROM public.customer_profiles WHERE cafe_id=p_cafe_id AND phone_normalized=v_phone;
  IF v_count>1 THEN RETURN jsonb_build_object('ok',false,'reason','identity_unavailable'); END IF;
  SELECT * INTO v_profile FROM public.customer_profiles WHERE cafe_id=p_cafe_id AND phone_normalized=v_phone FOR UPDATE;
  v_returning:=FOUND;
  IF v_returning THEN
    IF v_profile.status<>'active' OR v_profile.blocked_at IS NOT NULL OR v_profile.phone_auth_conflict
      OR lower(regexp_replace(btrim(v_profile.full_name),'\s+',' ','g'))<>lower(v_name) THEN
      RETURN jsonb_build_object('ok',false,'reason','identity_unavailable');
    END IF;
    IF EXISTS(SELECT 1 FROM public.loyalty_cards WHERE cafe_id=p_cafe_id AND customer_profile_id=v_profile.id AND status<>'active') THEN
      RETURN jsonb_build_object('ok',false,'reason','identity_unavailable');
    END IF;
  ELSE
    INSERT INTO public.customer_profiles(cafe_id,full_name,phone,phone_verification_required)
    VALUES(p_cafe_id,v_name,v_phone,false) RETURNING * INTO v_profile;
    PERFORM public.record_customer_registration_source(v_profile.id,'loyalty');
    -- Deliberately leave user_id, phone_verified_at and all account credentials unset.
  END IF;
  PERFORM public.issue_rast_loyalty_card(v_profile.id);
  RETURN jsonb_build_object('ok',true,'profile_id',v_profile.id,'returning_customer',v_returning);
END;
$$;
REVOKE ALL ON FUNCTION public.enroll_loyalty_customer_direct(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_loyalty_customer_direct(uuid,text,text,text) TO service_role;
