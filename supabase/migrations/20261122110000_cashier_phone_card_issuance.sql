BEGIN;
SET LOCAL lock_timeout='5s';

-- Records issuance without scheduling a WhatsApp stamp notice for a points invoice.
CREATE TABLE loyalty_read_private.cashier_issued_cards (
  card_id uuid PRIMARY KEY REFERENCES public.loyalty_cards(id) ON DELETE CASCADE
);
ALTER TABLE loyalty_read_private.cashier_issued_cards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON loyalty_read_private.cashier_issued_cards FROM PUBLIC,anon,authenticated,service_role;

-- Both enrollment entry points already check for the exact unclaimed placeholder,
-- absence of credentials, ownership, and the same membership ID. Extend only the
-- recorded provenance predicate to cover issuance without a stamp-message job.
DO $migration$
DECLARE signature regprocedure; definition text;
  old_proof text := 'AND j.card_created';
  new_proof text := 'AND j.card_created
          UNION ALL SELECT 1 FROM loyalty_read_private.cashier_issued_cards issued
          JOIN public.loyalty_cards issued_card ON issued_card.id=issued.card_id
          WHERE issued_card.cafe_id=p_cafe_id AND issued_card.customer_profile_id=v_profile.id';
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.enroll_loyalty_customer_direct(uuid,text,text,text)'::regprocedure,
    'public.enroll_branch_loyalty_customer(uuid,text,text,text,uuid)'::regprocedure
  ] LOOP
    definition:=pg_get_functiondef(signature);
    IF array_length(string_to_array(definition,old_proof),1) IS DISTINCT FROM 2 THEN
      RAISE EXCEPTION 'Unexpected enrollment provenance definition: %',signature;
    END IF;
    EXECUTE replace(definition,old_proof,new_proof);
  END LOOP;
END $migration$;

CREATE FUNCTION loyalty_read_private.ensure_cashier_phone_card(
  p_session_token text,p_phone text,p_request_id uuid,p_program_mode text,
  p_amount_sar numeric DEFAULT NULL,p_expected_rate_sar numeric DEFAULT NULL,p_expected_rate_quantity integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_normalized_phone text:=public.normalize_customer_phone(p_phone);
  cashier_session public.cafe_cashier_sessions;
  cashier_branch uuid;
  program public.cafe_loyalty_programs;
  profile public.customer_profiles;
  card public.loyalty_cards;
  matches integer;
  gain numeric;
  client_key text;
  approval jsonb;
  payload jsonb;
  enrollment jsonb;
  answer jsonb;
  old_sub text:=current_setting('request.jwt.claim.sub',true);
  old_claims text:=current_setting('request.jwt.claims',true);
BEGIN
  IF v_normalized_phone IS NULL OR v_normalized_phone !~ '^9665[0-9]{8}$' OR p_request_id IS NULL OR p_program_mode IS NULL OR p_program_mode NOT IN('points','stamps') THEN
    RAISE EXCEPTION 'Invalid phone scan' USING ERRCODE='22023';
  END IF;
  IF p_program_mode='points' AND (p_amount_sar IS NULL OR p_amount_sar NOT BETWEEN 0.01 AND 1000000 OR p_amount_sar<>round(p_amount_sar,2)) THEN
    RAISE EXCEPTION 'Invalid invoice amount' USING ERRCODE='22023';
  END IF;
  PERFORM public.brand_finance_loyalty_session_guard(p_session_token);
  SELECT s.* INTO cashier_session FROM public.cafe_cashier_sessions s
    JOIN public.cafe_cashiers k ON k.id=s.cashier_id AND k.cafe_id=s.cafe_id AND k.active AND k.can_use_loyalty
    JOIN public.cafes b ON b.id=s.cafe_id AND b.status IN('active','published') AND b.deleted_at IS NULL
    WHERE s.token=p_session_token AND s.revoked_at IS NULL AND s.expires_at>now()
      AND platform_access_private.service_enabled(s.cafe_id,'loyalty')
      AND (k.owner_user_id IS NULL OR EXISTS (SELECT 1 FROM public.profiles u WHERE u.id=k.owner_user_id
        AND u.status='active' AND (b.owner_user_id=u.id OR u.role='platform_admin')))
    FOR SHARE OF s,k;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid cashier session' USING ERRCODE='42501'; END IF;
  SELECT loyalty_branch_id INTO cashier_branch FROM public.cafe_cashiers WHERE id=cashier_session.cashier_id AND cafe_id=cashier_session.cafe_id;

  IF cashier_session.finance_user_id IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub',cashier_session.finance_user_id::text,true),
      set_config('request.jwt.claims',jsonb_build_object('sub',cashier_session.finance_user_id)::text,true);
    IF employee_access_private.allows(cashier_session.cafe_id,'loyalty.read',true) IS NOT TRUE OR
       employee_access_private.allows(cashier_session.cafe_id,'loyalty.stamp',true) IS NOT TRUE THEN
      RAISE EXCEPTION 'Employee loyalty permission denied' USING ERRCODE='42501';
    END IF;
  END IF;

  <<resolve_card>>
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(cashier_session.cafe_id::text||p_request_id::text,0));
    PERFORM pg_advisory_xact_lock(hashtextextended('loyalty-enroll:'||cashier_session.cafe_id::text||':'||v_normalized_phone,0));
    SELECT count(*) INTO matches FROM public.customer_profiles p WHERE p.cafe_id=cashier_session.cafe_id AND p.phone_normalized=v_normalized_phone;
    IF matches>1 THEN answer:=jsonb_build_object('ok',false,'errorCode','card_unavailable'); EXIT resolve_card; END IF;
    SELECT p.* INTO profile FROM public.customer_profiles p WHERE p.cafe_id=cashier_session.cafe_id AND p.phone_normalized=v_normalized_phone FOR SHARE;
    IF FOUND THEN
      IF profile.status<>'active' OR profile.blocked_at IS NOT NULL OR profile.phone_auth_conflict THEN
        answer:=jsonb_build_object('ok',false,'errorCode','card_unavailable'); EXIT resolve_card;
      END IF;
      SELECT c.* INTO card FROM public.loyalty_cards c WHERE c.cafe_id=cashier_session.cafe_id AND c.customer_profile_id=profile.id;
      IF FOUND THEN
        IF card.status='active' THEN
          answer:=jsonb_build_object('ok',true,'cardCode',card.card_code,'cardCreated',false,'profileId',profile.id,'cardId',card.id);
        ELSE
          answer:=jsonb_build_object('ok',false,'errorCode','card_unavailable');
        END IF;
        EXIT resolve_card;
      END IF;
    END IF;

    -- A replay for an issued card is delegated above to the original scanner,
    -- whose receipt survives program/rate changes. A different phone cannot
    -- enroll a new member with an already-posted scan's request ID.
    IF EXISTS(SELECT 1 FROM public.loyalty_scan_requests WHERE cafe_id=cashier_session.cafe_id AND request_id=p_request_id)
      OR EXISTS(SELECT 1 FROM employee_access_private.loyalty_scan_aliases WHERE cafe_id=cashier_session.cafe_id AND request_id=p_request_id AND user_id=cashier_session.finance_user_id) THEN
      RAISE EXCEPTION 'Scan request conflict';
    END IF;
    SELECT * INTO program FROM public.cafe_loyalty_programs WHERE cafe_id=cashier_session.cafe_id AND enabled FOR SHARE;
    IF NOT FOUND OR program.points_mode<>p_program_mode THEN
      answer:=jsonb_build_object('ok',false,'errorCode','points_mode_changed'); EXIT resolve_card;
    END IF;
    IF p_program_mode='points' THEN
      IF (p_expected_rate_sar IS NOT NULL AND program.points_rate_sar<>p_expected_rate_sar) OR
        (p_expected_rate_quantity IS NOT NULL AND program.points_rate_quantity<>p_expected_rate_quantity) THEN
        answer:=jsonb_build_object('ok',false,'errorCode','points_rate_changed'); EXIT resolve_card;
      END IF;
      gain:=floor(p_amount_sar*program.points_rate_quantity/program.points_rate_sar);
      IF gain=0 OR gain>2147483647 THEN
        answer:=jsonb_build_object('ok',false,'errorCode',CASE WHEN gain=0 THEN 'zero_points' ELSE 'points_limit' END); EXIT resolve_card;
      END IF;
    END IF;
    IF cashier_session.finance_user_id IS NOT NULL THEN
      IF employee_access_private.allows(cashier_session.cafe_id,'loyalty.issue',false) IS NOT TRUE THEN
        RAISE EXCEPTION 'Loyalty issue denied' USING ERRCODE='42501';
      END IF;
      payload:=jsonb_build_object('cashierId',cashier_session.cashier_id,'name',coalesce(profile.full_name,'عميل الولاء'),'phone',v_normalized_phone,'loyaltyBranchId',cashier_branch);
      approval:=employee_access_private.loyalty_request(cashier_session.cafe_id,'loyalty.issue','loyalty.issue',payload,
        md5('cashier-phone-issue:'||p_request_id::text)::uuid);
      IF coalesce(approval->>'status','') NOT IN('ready','approved') THEN
        answer:=jsonb_build_object('ok',false,'errorCode','approval_'||(approval->>'status'),
          'status','approval_'||(approval->>'status'),'requestId',approval->'requestId'); EXIT resolve_card;
      END IF;
    END IF;

    IF profile.id IS NULL THEN
      SELECT encode(extensions.hmac('phone:'||v_normalized_phone,secret,'sha256'),'hex') INTO STRICT client_key
        FROM loyalty_read_private.settings WHERE singleton;
      enrollment:=public.enroll_branch_loyalty_customer(cashier_session.cafe_id,'عميل الولاء',v_normalized_phone,client_key,cashier_branch);
      IF enrollment->>'ok' IS DISTINCT FROM 'true' THEN
        answer:=jsonb_build_object('ok',false,'errorCode',CASE WHEN enrollment->>'reason'='rate_limited' THEN 'enrollment_rate_limited' ELSE 'card_unavailable' END);
        EXIT resolve_card;
      END IF;
      profile.id:=(enrollment->>'profile_id')::uuid;
    ELSE
      BEGIN
        PERFORM public.issue_branch_loyalty_card(profile.id,cashier_branch);
      EXCEPTION WHEN raise_exception THEN
        IF SQLERRM NOT IN ('Loyalty branch unavailable','Loyalty enrollment unavailable','Loyalty card suspended') THEN RAISE; END IF;
        answer:=jsonb_build_object('ok',false,'errorCode','card_unavailable'); EXIT resolve_card;
      END;
    END IF;
    SELECT c.* INTO STRICT card FROM public.loyalty_cards c WHERE c.cafe_id=cashier_session.cafe_id AND c.customer_profile_id=profile.id AND c.status='active';
    IF cashier_session.finance_user_id IS NOT NULL THEN
      PERFORM employee_access_private.assert_and_consume(cashier_session.cafe_id,'loyalty.issue','loyalty.issue',payload,(approval->>'requestId')::uuid);
    END IF;
    INSERT INTO loyalty_read_private.cashier_issued_cards(card_id) VALUES(card.id);
    answer:=jsonb_build_object('ok',true,'cardCode',card.card_code,'cardCreated',true,'profileId',profile.id,'cardId',card.id);
  END resolve_card;
  IF cashier_session.finance_user_id IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub',coalesce(old_sub,''),true),set_config('request.jwt.claims',coalesce(old_claims,''),true);
  END IF;
  RETURN answer;
END $$;
REVOKE ALL ON FUNCTION loyalty_read_private.ensure_cashier_phone_card(text,text,uuid,text,numeric,numeric,integer) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.scan_loyalty_invoice_points_by_phone(
  p_session_token text,p_phone text,p_request_id uuid,p_amount_sar numeric,
  p_expected_rate_sar numeric DEFAULT NULL,p_expected_rate_quantity integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE membership jsonb; award jsonb;
BEGIN
  BEGIN
    membership:=loyalty_read_private.ensure_cashier_phone_card(p_session_token,p_phone,p_request_id,'points',
      p_amount_sar,p_expected_rate_sar,p_expected_rate_quantity);
    IF membership->>'ok' IS DISTINCT FROM 'true' THEN RETURN membership; END IF;
    award:=public.scan_loyalty_invoice_points(p_session_token,membership->>'cardCode',p_request_id,p_amount_sar,
      p_expected_rate_sar,p_expected_rate_quantity);
    -- An independently authorized issue remains valid while the award awaits
    -- approval: retries must reference that same card. Other failed awards
    -- roll back the new membership along with any unsuccessful award writes.
    IF award->>'ok' IS DISTINCT FROM 'true' AND award->>'status' IS DISTINCT FROM 'approval_pending'
      AND membership->>'cardCreated'='true' THEN RAISE EXCEPTION 'Points not posted' USING ERRCODE='P7401'; END IF;
  EXCEPTION WHEN SQLSTATE 'P7401' THEN NULL;
  END;
  RETURN award;
END $$;
REVOKE ALL ON FUNCTION public.scan_loyalty_invoice_points_by_phone(text,text,uuid,numeric,numeric,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.scan_loyalty_invoice_points_by_phone(text,text,uuid,numeric,numeric,integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
