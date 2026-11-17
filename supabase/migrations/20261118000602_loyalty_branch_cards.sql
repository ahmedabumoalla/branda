BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
ALTER TABLE public.loyalty_cards ADD COLUMN loyalty_branch_id uuid,
 ADD CONSTRAINT loyalty_card_branch_same_cafe FOREIGN KEY(loyalty_branch_id,cafe_id) REFERENCES public.branches(id,cafe_id);
CREATE INDEX loyalty_card_branch ON public.loyalty_cards(loyalty_branch_id,cafe_id) WHERE loyalty_branch_id IS NOT NULL;
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
    JOIN public.cafes c ON c.id=b.cafe_id AND (c.slug='brand-1c2b6f7e028f' OR platform_access_private.service_enabled(c.id,'branches'))
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
  PERFORM 1 FROM public.branches b JOIN public.cafes c ON c.id=b.cafe_id AND (c.slug='brand-1c2b6f7e028f' OR platform_access_private.service_enabled(c.id,'branches'))
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
CREATE OR REPLACE FUNCTION loyalty_read_private.process_one_before_employee_policy(p_cafe_id uuid, p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE q loyalty_read_private.operations; c public.cafe_cashiers; b public.cafes;
 card public.loyalty_cards; r jsonb; reason text; transient boolean:=false; owner_profile public.profiles;
 member public.customer_profiles; member_count integer; new_card boolean:=false; invitation loyalty_read_private.card_link_jobs;
BEGIN
 SELECT * INTO STRICT q FROM loyalty_read_private.operations WHERE cafe_id=p_cafe_id AND request_id=p_request_id FOR UPDATE;
 IF q.status<>'pending' THEN RETURN; END IF;
 UPDATE loyalty_read_private.operations SET attempts=attempts+1,automatic_attempts=automatic_attempts+1,updated_at=clock_timestamp()
 WHERE cafe_id=p_cafe_id AND request_id=p_request_id RETURNING * INTO q;
 BEGIN
  IF q.created_at<clock_timestamp()-interval '30 days' OR q.identifier IS NULL THEN RAISE EXCEPTION 'Read operation expired'; END IF;
  SELECT * INTO c FROM public.cafe_cashiers WHERE id=q.cashier_id AND cafe_id=q.cafe_id FOR SHARE;
  IF NOT FOUND OR NOT c.active OR NOT c.can_use_loyalty THEN RAISE EXCEPTION 'Cashier disabled'; END IF;
  SELECT * INTO b FROM public.cafes WHERE id=q.cafe_id FOR SHARE;
  IF NOT FOUND OR b.deleted_at IS NOT NULL OR b.status NOT IN('active','published') THEN RAISE EXCEPTION 'Brand disabled'; END IF;
  IF c.owner_user_id IS NOT NULL THEN
   SELECT * INTO owner_profile FROM public.profiles WHERE id=c.owner_user_id AND status='active' FOR SHARE;
   IF NOT FOUND OR (b.owner_user_id IS DISTINCT FROM c.owner_user_id AND owner_profile.role<>'platform_admin') THEN RAISE EXCEPTION 'Cashier disabled'; END IF;
  END IF;
  IF NOT platform_access_private.service_enabled(q.cafe_id,'loyalty') THEN RAISE EXCEPTION 'Loyalty program disabled'; END IF;
  IF q.method='phone' THEN
   -- Same lock and original profile rules as direct enrollment. A cashier adds
   -- loyalty membership only, never an Auth account, verified phone or login link.
   PERFORM pg_advisory_xact_lock(hashtextextended('loyalty-enroll:'||q.cafe_id::text||':'||q.identifier,0));
   SELECT count(*) INTO member_count FROM public.customer_profiles WHERE cafe_id=q.cafe_id AND phone_normalized=q.identifier;
   IF member_count>1 THEN RAISE EXCEPTION 'Loyalty card unavailable'; END IF;
   SELECT * INTO member FROM public.customer_profiles WHERE cafe_id=q.cafe_id AND phone_normalized=q.identifier FOR UPDATE;
   IF FOUND THEN
    IF member.status<>'active' OR member.blocked_at IS NOT NULL OR member.phone_auth_conflict THEN RAISE EXCEPTION 'Loyalty card unavailable'; END IF;
    new_card:=NOT EXISTS(SELECT 1 FROM public.loyalty_cards WHERE cafe_id=q.cafe_id AND customer_profile_id=member.id);
    PERFORM public.issue_branch_loyalty_card(member.id,c.loyalty_branch_id);
   ELSE
    r:=public.enroll_branch_loyalty_customer(q.cafe_id,'عميل الولاء',q.identifier,q.identifier_hash,c.loyalty_branch_id);
    IF r->>'ok' IS DISTINCT FROM 'true' THEN
     IF r->>'reason'='rate_limited' THEN RAISE EXCEPTION 'Enrollment temporarily limited'; END IF;
     RAISE EXCEPTION 'Loyalty card unavailable';
    END IF;
    SELECT * INTO STRICT member FROM public.customer_profiles WHERE id=(r->>'profile_id')::uuid AND cafe_id=q.cafe_id;
    new_card:=true;
   END IF;
   SELECT * INTO card FROM public.loyalty_cards WHERE cafe_id=q.cafe_id AND customer_profile_id=member.id FOR UPDATE;
  ELSIF q.identifier ~ '^[1-9][0-9]{0,4}$' THEN
   SELECT * INTO card FROM public.loyalty_cards WHERE cafe_id=q.cafe_id AND display_number=q.identifier::integer FOR UPDATE;
   IF NOT FOUND THEN SELECT * INTO card FROM public.loyalty_cards WHERE cafe_id=q.cafe_id AND card_code=q.identifier FOR UPDATE; END IF;
  ELSE
   SELECT * INTO card FROM public.loyalty_cards WHERE cafe_id=q.cafe_id AND card_code=q.identifier FOR UPDATE;
  END IF;
  IF card.id IS NULL OR card.status<>'active' OR NOT EXISTS(SELECT 1 FROM public.customer_profiles cp WHERE cp.id=card.customer_profile_id AND cp.cafe_id=q.cafe_id AND cp.status='active' AND cp.blocked_at IS NULL AND NOT cp.phone_auth_conflict) THEN
   RAISE EXCEPTION 'Loyalty card unavailable';
  END IF;
  PERFORM 1 FROM public.customer_profiles WHERE id=card.customer_profile_id AND cafe_id=q.cafe_id FOR SHARE;
  -- No preview, synthetic login or alternate stamp algorithm. The existing core
  -- locks the card and request; its reward/audit/wallet triggers commit with this row.
  r:=public.apply_rast_loyalty_stamp(q.cafe_id,card.card_code,q.request_id,q.cashier_id,NULL);
  IF coalesce(r->>'status','') NOT IN('stamped','reward_issued','recent_scan') THEN RAISE EXCEPTION 'Unexpected stamp result'; END IF;
  IF r->>'status'='recent_scan' THEN
   PERFORM loyalty_audit_private.append_attempt(q.cafe_id,q.cashier_id,card.id,'stamp','duplicate','recent_scan',q.request_id);
  END IF;
  IF q.method='phone' AND r->>'status' IN('stamped','reward_issued')

   AND NOT EXISTS(SELECT 1 FROM public.wallet_apple_registrations WHERE cafe_id=q.cafe_id AND card_id=card.id) THEN
   SELECT * INTO invitation FROM loyalty_read_private.card_link_jobs WHERE card_id=card.id
    AND (created_at>clock_timestamp()-interval '24 hours' OR status IN('pending','dispatching','unknown')) ORDER BY created_at DESC LIMIT 1;
   IF NOT FOUND THEN
    INSERT INTO loyalty_read_private.card_link_jobs(cafe_id,profile_id,card_id,card_created)
    VALUES(q.cafe_id,card.customer_profile_id,card.id,new_card)
    ON CONFLICT(card_id,delivery_day) DO NOTHING RETURNING * INTO invitation;
   END IF;
  END IF;
  UPDATE loyalty_read_private.operations SET status=CASE WHEN r->>'status'='recent_scan' THEN 'duplicate' ELSE 'succeeded' END,
   retryable=false,error_code=CASE WHEN r->>'status'='recent_scan' THEN 'recent_scan' END,
   result=(r-'cardCode'-'rewardCode')||jsonb_build_object('cardCreated',new_card,'cardId',card.id),identifier=NULL,completed_at=clock_timestamp(),updated_at=clock_timestamp(),
   invitation_job_id=invitation.id,invitation_status=invitation.status
  WHERE cafe_id=q.cafe_id AND request_id=q.request_id;
 EXCEPTION WHEN OTHERS THEN
  reason:=CASE SQLERRM WHEN 'Read operation expired' THEN 'operation_expired' WHEN 'Cashier disabled' THEN 'cashier_disabled'
   WHEN 'Brand disabled' THEN 'brand_disabled' WHEN 'Loyalty program disabled' THEN 'program_disabled'
   WHEN 'Loyalty card not found' THEN 'card_unavailable' WHEN 'Loyalty card unavailable' THEN 'card_unavailable' WHEN 'Loyalty card suspended' THEN 'card_unavailable'
   WHEN 'Loyalty enrollment unavailable' THEN 'program_disabled'
   WHEN 'Invalid scan request' THEN 'invalid_identifier' WHEN 'Daily stamp limit reached' THEN 'daily_stamp_limit' WHEN 'Scan request conflict' THEN 'request_conflict' ELSE 'operation_failed' END;
  transient:=reason='operation_failed' AND q.attempts<20 AND q.created_at>=clock_timestamp()-interval '30 days';
  UPDATE loyalty_read_private.operations SET status=CASE WHEN transient AND q.automatic_attempts<5 THEN 'pending' ELSE 'failed' END,
   retryable=transient,error_code=reason,available_at=clock_timestamp()+make_interval(secs=>least(900,5*power(3,q.automatic_attempts)::integer)),
   identifier=CASE WHEN transient THEN identifier ELSE NULL END,completed_at=CASE WHEN transient AND q.automatic_attempts<5 THEN NULL ELSE clock_timestamp() END,
   updated_at=clock_timestamp() WHERE cafe_id=q.cafe_id AND request_id=q.request_id;
 END;
END $function$
;
COMMIT;
