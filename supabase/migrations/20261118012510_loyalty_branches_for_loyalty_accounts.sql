BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
-- Extend loyalty branches without modifying any brand, branch, cashier or plan settings.
-- Loco and Wahed retain their original branch entitlement checks.
CREATE OR REPLACE FUNCTION loyalty_branch_private.assert_owner(p_cafe uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active')
  OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND (slug NOT IN('brand-9a8c97305195','brand-3c0437f1733a') OR platform_access_private.service_enabled(id,'branches')) AND deleted_at IS NULL AND status IN('active','published'))
  OR NOT public.brand_account_not_cancelled(p_cafe) OR NOT platform_access_private.service_enabled(p_cafe,'loyalty')
  OR NOT (public.is_cafe_owner(p_cafe) OR public.is_platform_admin())
 THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
END $$;
REVOKE ALL ON FUNCTION loyalty_branch_private.assert_owner(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.issue_branch_loyalty_card(p_customer_profile_id uuid, p_branch uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_profile public.customer_profiles%ROWTYPE; v_card public.loyalty_cards%ROWTYPE;
BEGIN
  IF p_branch IS NULL THEN RETURN public.issue_rast_loyalty_card(p_customer_profile_id); END IF;
  PERFORM 1 FROM public.branches b JOIN public.customer_profiles cp ON cp.cafe_id=b.cafe_id AND cp.id=p_customer_profile_id
    JOIN public.cafes c ON c.id=b.cafe_id AND (c.slug NOT IN('brand-9a8c97305195','brand-3c0437f1733a') OR platform_access_private.service_enabled(c.id,'branches'))
    WHERE b.id=p_branch AND b.active AND b.loyalty_enabled AND b.deleted_at IS NULL FOR SHARE OF b;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loyalty branch unavailable'; END IF;
  SELECT cp.* INTO v_profile FROM public.customer_profiles cp
  JOIN public.cafes c ON c.id=cp.cafe_id AND c.deleted_at IS NULL
    AND platform_access_private.service_enabled(c.id,'loyalty')
  JOIN public.cafe_loyalty_programs p ON p.cafe_id=c.id AND p.enabled
  WHERE cp.id=p_customer_profile_id AND NOT cp.phone_auth_conflict
    AND cp.status='active' AND cp.blocked_at IS NULL AND cp.phone_normalized ~ '^9665[0-9]{8}$'
  FOR SHARE OF cp,p;
  IF v_profile.id IS NULL THEN RAISE EXCEPTION 'Loyalty enrollment unavailable'; END IF;
  INSERT INTO public.loyalty_cards(cafe_id,customer_profile_id,customer_name,customer_phone,customer_email,loyalty_branch_id)
  VALUES(v_profile.cafe_id,v_profile.id,v_profile.full_name,v_profile.phone,v_profile.email,p_branch)
  ON CONFLICT(cafe_id,customer_profile_id) DO NOTHING;
  SELECT * INTO v_card FROM public.loyalty_cards WHERE cafe_id=v_profile.cafe_id AND customer_profile_id=v_profile.id;
  IF v_card.status<>'active' THEN RAISE EXCEPTION 'Loyalty card suspended'; END IF;
  RETURN v_card.card_code;
END;
$function$
;
REVOKE ALL ON FUNCTION public.issue_branch_loyalty_card(uuid,uuid) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.issue_branch_loyalty_card(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.enroll_branch_loyalty_customer(p_cafe_id uuid, p_full_name text, p_phone text, p_client_key text, p_branch uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_phone text:=public.normalize_customer_phone(p_phone); v_name text:=regexp_replace(btrim(p_full_name),'\s+',' ','g');
  v_profile public.customer_profiles%ROWTYPE; v_count integer; v_returning boolean; v_bucket record; v_attempts integer; v_complete_name boolean := false;
BEGIN
  IF p_branch IS NULL THEN RETURN public.enroll_loyalty_customer_direct(p_cafe_id,p_full_name,p_phone,p_client_key);END IF;
  PERFORM 1 FROM public.branches b JOIN public.cafes c ON c.id=b.cafe_id AND (c.slug NOT IN('brand-9a8c97305195','brand-3c0437f1733a') OR platform_access_private.service_enabled(c.id,'branches'))
    WHERE b.id=p_branch AND b.cafe_id=p_cafe_id AND b.active AND b.loyalty_enabled AND b.deleted_at IS NULL FOR SHARE OF b;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','branch_unavailable');END IF;
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
    IF v_profile.status<>'active' OR v_profile.blocked_at IS NOT NULL OR v_profile.phone_auth_conflict THEN
      RETURN jsonb_build_object('ok',false,'reason','identity_unavailable');
    END IF;
    IF lower(regexp_replace(btrim(v_profile.full_name),'\s+',' ','g'))<>lower(v_name) THEN
      -- Only the exact unclaimed placeholder issued by the phone cashier can be
      -- completed. A customer-chosen name or existing account is never replaced
      v_complete_name := v_profile.full_name='عميل الولاء'
        AND v_profile.user_id IS NULL AND v_profile.phone_verified_at IS NULL
        AND v_profile.email IS NULL AND v_profile.password_hash IS NULL
        AND v_profile.session_token_hash IS NULL AND v_profile.password_reset_token_hash IS NULL
        AND EXISTS (
          SELECT 1 FROM loyalty_read_private.card_link_jobs j
          JOIN public.loyalty_cards c ON c.id=j.card_id AND c.cafe_id=j.cafe_id
            AND c.customer_profile_id=j.profile_id
          WHERE j.profile_id=v_profile.id AND j.cafe_id=p_cafe_id AND j.card_created
        );
      IF NOT coalesce(v_complete_name,false) THEN
        RETURN jsonb_build_object('ok',false,'reason','identity_unavailable');
      END IF;
    END IF;
    IF EXISTS(SELECT 1 FROM public.loyalty_cards WHERE cafe_id=p_cafe_id AND customer_profile_id=v_profile.id AND status<>'active') THEN
      RETURN jsonb_build_object('ok',false,'reason','identity_unavailable');
    END IF;
    IF v_complete_name THEN
      -- Parent row and the original per-brand/phone lock serialize first claim
      -- Only display names change; card IDs, codes, numbers and balances survive
      UPDATE public.customer_profiles SET full_name=v_name WHERE id=v_profile.id AND cafe_id=p_cafe_id;
      UPDATE public.loyalty_cards SET customer_name=v_name
        WHERE cafe_id=p_cafe_id AND customer_profile_id=v_profile.id AND status='active';
    END IF;
  ELSE
    INSERT INTO public.customer_profiles(cafe_id,full_name,phone,phone_verification_required)
    VALUES(p_cafe_id,v_name,v_phone,false) RETURNING * INTO v_profile;
    PERFORM public.record_customer_registration_source(v_profile.id,'loyalty');
    -- Deliberately leave user_id, phone_verified_at and all account credentials unset.
  END IF;
  PERFORM public.issue_branch_loyalty_card(v_profile.id,p_branch);
  RETURN jsonb_build_object('ok',true,'profile_id',v_profile.id,'returning_customer',v_returning);
END;
$function$
;
REVOKE ALL ON FUNCTION public.enroll_branch_loyalty_customer(uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.enroll_branch_loyalty_customer(uuid,text,text,text,uuid) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
