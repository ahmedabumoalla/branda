-- Append-only loyalty audit. Existing reward terms and program activation are unchanged.
-- Forward-only migration; rollback requires a reviewed follow-up migration retaining history.
BEGIN;

CREATE SCHEMA IF NOT EXISTS loyalty_audit_private;
REVOKE ALL ON SCHEMA loyalty_audit_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE loyalty_audit_private.settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  recording_started_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE loyalty_audit_private.settings ENABLE ROW LEVEL SECURITY;
INSERT INTO loyalty_audit_private.settings DEFAULT VALUES;

CREATE TABLE public.loyalty_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Logical references intentionally have no destructive cascade: deleting a cashier,
  -- card or customer must not erase or rewrite historical evidence.
  cafe_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  kind text NOT NULL CHECK (kind IN ('scan','stamp','redeem','void')),
  outcome text NOT NULL CHECK (outcome IN ('success','denied','failed','duplicate')),
  origin text NOT NULL DEFAULT 'live' CHECK (origin IN ('live','historical')),
  cashier_id uuid,
  actor_name text,
  actor_type text NOT NULL CHECK (actor_type IN ('cashier','owner','unknown')),
  card_id uuid,
  card_suffix text CHECK (card_suffix IS NULL OR char_length(card_suffix) <= 4),
  customer_name text,
  stamps_delta integer NOT NULL DEFAULT 0,
  rewards_delta integer NOT NULL DEFAULT 0,
  stamps_before integer,
  rewards_before integer,
  stamps_after integer,
  rewards_after integer,
  reward_name text,
  reward_suffix text CHECK (reward_suffix IS NULL OR char_length(reward_suffix) <= 4),
  reward_kind text,
  reward_discount_percent integer,
  reward_expires_at timestamptz,
  reward_terms text,
  reason_code text CHECK (reason_code IS NULL OR reason_code ~ '^[a-z_]{1,60}$'),
  request_id uuid,
  source_event_id uuid UNIQUE,
  source_redemption_id uuid UNIQUE
);
CREATE INDEX loyalty_activity_cafe_time_idx ON public.loyalty_activity_events(cafe_id,occurred_at DESC,id DESC);
CREATE INDEX loyalty_activity_cashier_time_idx ON public.loyalty_activity_events(cafe_id,cashier_id,occurred_at DESC,id DESC);
ALTER TABLE public.loyalty_activity_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.loyalty_activity_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.loyalty_activity_events TO authenticated,service_role;

CREATE FUNCTION loyalty_audit_private.can_read(p_cafe_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.status='active') AND EXISTS (
    SELECT 1 FROM public.cafes c WHERE c.id=p_cafe_id AND c.deleted_at IS NULL AND (
      c.owner_user_id=auth.uid() OR public.is_platform_admin() OR EXISTS (
        SELECT 1 FROM public.cafe_members m WHERE m.cafe_id=c.id AND m.user_id=auth.uid() AND m.role IN ('owner','manager')
      )
    )
  );
$$;
REVOKE ALL ON FUNCTION loyalty_audit_private.can_read(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA loyalty_audit_private TO authenticated;
GRANT EXECUTE ON FUNCTION loyalty_audit_private.can_read(uuid) TO authenticated;
CREATE POLICY loyalty_activity_owner_read ON public.loyalty_activity_events FOR SELECT TO authenticated
  USING (loyalty_audit_private.can_read(cafe_id));
-- There are deliberately no INSERT, UPDATE or DELETE policies or client write grants.
CREATE FUNCTION loyalty_audit_private.reject_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'Loyalty activity is append-only'; END;
$$;
REVOKE ALL ON FUNCTION loyalty_audit_private.reject_mutation() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER loyalty_activity_immutable BEFORE UPDATE OR DELETE ON public.loyalty_activity_events
  FOR EACH ROW EXECUTE FUNCTION loyalty_audit_private.reject_mutation();
CREATE TRIGGER loyalty_activity_no_truncate BEFORE TRUNCATE ON public.loyalty_activity_events
  FOR EACH STATEMENT EXECUTE FUNCTION loyalty_audit_private.reject_mutation();

CREATE FUNCTION loyalty_audit_private.capture_ledger_event(p_event_id uuid,p_origin text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.loyalty_activity_events(
    cafe_id,occurred_at,kind,outcome,origin,cashier_id,actor_name,actor_type,card_id,card_suffix,customer_name,
    stamps_delta,rewards_delta,stamps_after,rewards_after,reward_name,reward_suffix,reward_kind,
    reward_discount_percent,reward_expires_at,reward_terms,source_event_id
  )
  SELECT e.cafe_id,CASE WHEN p_origin='historical' THEN e.created_at ELSE clock_timestamp() END,
    e.event_type,'success',p_origin,e.cashier_id,
    CASE WHEN e.cashier_id IS NOT NULL THEN ca.full_name ELSE p.full_name END,
    CASE WHEN e.cashier_id IS NOT NULL THEN 'cashier' WHEN e.performed_by IS NOT NULL THEN 'owner' ELSE 'unknown' END,
    e.card_id,CASE WHEN char_length(lc.card_code)>4 THEN right(lc.card_code,4) END,lc.customer_name,e.stamps_added,e.reward_delta,e.stamps_after,e.rewards_after,
    r.reward_title,CASE WHEN char_length(r.reward_code)>4 THEN right(r.reward_code,4) END,r.metadata->'termsSnapshot'->>'rewardKind',
    CASE WHEN (r.metadata->'termsSnapshot'->>'discountPercent') ~ '^([1-9][0-9]?|100)$'
      THEN (r.metadata->'termsSnapshot'->>'discountPercent')::integer END,
    r.expires_at,r.metadata->'termsSnapshot'->>'terms',e.id
  FROM public.loyalty_card_events e
  LEFT JOIN public.cafe_cashiers ca ON ca.id=e.cashier_id AND ca.cafe_id=e.cafe_id
  LEFT JOIN public.profiles p ON p.id=e.performed_by
  LEFT JOIN public.loyalty_cards lc ON lc.id=e.card_id AND lc.cafe_id=e.cafe_id
  LEFT JOIN LATERAL (
    SELECT ri.* FROM public.customer_reward_instances ri
    WHERE ri.cafe_id=e.cafe_id AND ri.loyalty_card_id=e.card_id AND ri.source_type='loyalty' AND
      ((e.event_type='stamp' AND ri.source_id=e.id) OR
       (e.event_type='redeem' AND ri.reward_code=e.invoice_barcode))
    ORDER BY ri.issued_at DESC,ri.id DESC LIMIT 1
  ) r ON true
  WHERE e.id=p_event_id
  ON CONFLICT(source_event_id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION loyalty_audit_private.capture_ledger_event(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION loyalty_audit_private.capture_ledger_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN PERFORM loyalty_audit_private.capture_ledger_event(NEW.id,'live'); RETURN NEW; END;
$$;
REVOKE ALL ON FUNCTION loyalty_audit_private.capture_ledger_trigger() FROM PUBLIC,anon,authenticated,service_role;
-- PostgreSQL fires same-kind triggers alphabetically. Run after reward issuance.
CREATE TRIGGER zz_loyalty_activity_capture AFTER INSERT ON public.loyalty_card_events
  FOR EACH ROW EXECUTE FUNCTION loyalty_audit_private.capture_ledger_trigger();

CREATE FUNCTION loyalty_audit_private.capture_experience_redemption(p_redemption_id uuid,p_origin text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.loyalty_activity_events(cafe_id,occurred_at,kind,outcome,origin,cashier_id,actor_name,actor_type,
    card_id,card_suffix,customer_name,rewards_delta,reward_name,reward_suffix,reward_kind,reward_expires_at,reward_terms,source_redemption_id)
  SELECT d.cafe_id,CASE WHEN p_origin='historical' THEN d.created_at ELSE clock_timestamp() END,'redeem','success',p_origin,
    d.redeemed_by_cashier_id,CASE WHEN d.redeemed_by_cashier_id IS NOT NULL THEN ca.full_name ELSE p.full_name END,
    CASE WHEN d.redeemed_by_cashier_id IS NOT NULL THEN 'cashier' WHEN d.redeemed_by IS NOT NULL THEN 'owner' ELSE 'unknown' END,
    lc.id,CASE WHEN char_length(lc.card_code)>4 THEN right(lc.card_code,4) END,coalesce(lc.customer_name,cp.full_name),-1,
    r.reward_title,CASE WHEN char_length(r.reward_code)>4 THEN right(r.reward_code,4) END,'experience',r.expires_at,
    r.metadata->'termsSnapshot'->>'terms',d.id
  FROM public.customer_reward_redemptions d
  JOIN public.customer_reward_instances r ON r.id=d.reward_instance_id AND r.cafe_id=d.cafe_id AND r.source_type='experience'
  LEFT JOIN public.cafe_cashiers ca ON ca.id=d.redeemed_by_cashier_id AND ca.cafe_id=d.cafe_id
  LEFT JOIN public.profiles p ON p.id=d.redeemed_by
  LEFT JOIN public.loyalty_cards lc ON lc.id=r.loyalty_card_id AND lc.cafe_id=d.cafe_id
  LEFT JOIN public.customer_profiles cp ON cp.id=r.customer_id AND cp.cafe_id=d.cafe_id
  WHERE d.id=p_redemption_id AND d.status='redeemed'
  ON CONFLICT(source_redemption_id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION loyalty_audit_private.capture_experience_redemption(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION loyalty_audit_private.capture_experience_redemption_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN PERFORM loyalty_audit_private.capture_experience_redemption(NEW.id,'live'); RETURN NEW; END;
$$;
REVOKE ALL ON FUNCTION loyalty_audit_private.capture_experience_redemption_trigger() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER loyalty_activity_experience_redemption AFTER INSERT ON public.customer_reward_redemptions
  FOR EACH ROW EXECUTE FUNCTION loyalty_audit_private.capture_experience_redemption_trigger();

CREATE FUNCTION loyalty_audit_private.append_attempt(
  p_cafe_id uuid,p_cashier_id uuid,p_card_id uuid,p_kind text,p_outcome text,p_reason text,p_request_id uuid DEFAULT NULL,
  p_reward_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.loyalty_activity_events(cafe_id,kind,outcome,cashier_id,actor_name,actor_type,
    card_id,card_suffix,customer_name,stamps_after,rewards_after,reason_code,request_id,
    reward_name,reward_suffix,reward_kind,reward_discount_percent,reward_expires_at,reward_terms)
  SELECT c.cafe_id,p_kind,p_outcome,c.id,c.full_name,'cashier',lc.id,CASE WHEN char_length(lc.card_code)>4 THEN right(lc.card_code,4) END,lc.customer_name,
    lc.stamps_in_cycle,lc.available_rewards,p_reason,p_request_id,
    r.reward_title,CASE WHEN char_length(r.reward_code)>4 THEN right(r.reward_code,4) END,r.metadata->'termsSnapshot'->>'rewardKind',
    CASE WHEN (r.metadata->'termsSnapshot'->>'discountPercent') ~ '^([1-9][0-9]?|100)$'
      THEN (r.metadata->'termsSnapshot'->>'discountPercent')::integer END,r.expires_at,r.metadata->'termsSnapshot'->>'terms'
  FROM public.cafe_cashiers c LEFT JOIN public.loyalty_cards lc ON lc.id=p_card_id AND lc.cafe_id=c.cafe_id
  LEFT JOIN public.customer_reward_instances r ON r.id=p_reward_id AND r.cafe_id=c.cafe_id AND r.loyalty_card_id=lc.id
  WHERE c.id=p_cashier_id AND c.cafe_id=p_cafe_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid audit actor'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION loyalty_audit_private.append_attempt(uuid,uuid,uuid,text,text,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.preview_loyalty_card(p_session_token text,p_card_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_session record; v_card public.loyalty_cards%ROWTYPE; v_program public.cafe_loyalty_programs%ROWTYPE;
  v_count integer; v_code text:=upper(btrim(p_card_code)); v_reason text;
BEGIN
  SELECT s.*,c.active INTO v_session FROM public.cafe_cashier_sessions s
    JOIN public.cafe_cashiers c ON c.id=s.cashier_id AND c.cafe_id=s.cafe_id
    JOIN public.cafes b ON b.id=s.cafe_id AND b.slug='rast' AND b.deleted_at IS NULL
    WHERE s.token=p_session_token FOR SHARE OF s,c;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'errorCode','session_invalid'); END IF;
  IF NOT v_session.active OR v_session.revoked_at IS NOT NULL OR v_session.expires_at<=now() THEN
    v_reason:='session_invalid';
  ELSIF v_code IS NULL OR v_code !~ '^[A-Z0-9_-]{4,100}$' THEN v_reason:='invalid_code';
  ELSE
    SELECT * INTO v_program FROM public.cafe_loyalty_programs WHERE cafe_id=v_session.cafe_id AND enabled FOR SHARE;
    IF NOT FOUND THEN v_reason:='program_disabled'; ELSE
      SELECT lc.* INTO v_card FROM public.loyalty_cards lc JOIN public.customer_profiles cp
        ON cp.id=lc.customer_profile_id AND cp.cafe_id=lc.cafe_id AND cp.status='active' AND cp.blocked_at IS NULL
        WHERE lc.cafe_id=v_session.cafe_id AND upper(lc.card_code)=v_code AND lc.status='active' FOR SHARE OF lc,cp;
      IF NOT FOUND THEN v_reason:='card_unavailable'; END IF;
    END IF;
  END IF;
  IF v_reason IS NOT NULL THEN
    PERFORM loyalty_audit_private.append_attempt(v_session.cafe_id,v_session.cashier_id,NULL,'scan','denied',v_reason);
    RETURN jsonb_build_object('ok',false,'errorCode',v_reason);
  END IF;
  SELECT count(*) INTO v_count FROM public.customer_reward_instances WHERE cafe_id=v_session.cafe_id
    AND loyalty_card_id=v_card.id AND status='available' AND (expires_at IS NULL OR expires_at>now());
  PERFORM loyalty_audit_private.append_attempt(v_session.cafe_id,v_session.cashier_id,v_card.id,'scan','success',NULL);
  RETURN jsonb_build_object('ok',true,'customerName',v_card.customer_name,'stampsInCycle',v_card.stamps_in_cycle,
    'purchasesRequired',v_program.purchases_required,'availableRewards',v_count,'rewardName',v_program.reward_name);
END;
$$;
REVOKE ALL ON FUNCTION public.preview_loyalty_card(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_loyalty_card(text,text) TO service_role;

CREATE FUNCTION public.preview_loyalty_reward(p_session_token text,p_reward_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_session record; v_card public.loyalty_cards%ROWTYPE; v_reward public.customer_reward_instances%ROWTYPE;
  v_code text:=upper(btrim(p_reward_code)); v_reason text;
BEGIN
  SELECT s.*,c.active INTO v_session FROM public.cafe_cashier_sessions s
    JOIN public.cafe_cashiers c ON c.id=s.cashier_id AND c.cafe_id=s.cafe_id
    JOIN public.cafes b ON b.id=s.cafe_id AND b.slug='rast' AND b.deleted_at IS NULL
    WHERE s.token=p_session_token FOR SHARE OF s,c;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'errorCode','session_invalid'); END IF;
  IF NOT v_session.active OR v_session.revoked_at IS NOT NULL OR v_session.expires_at<=now() THEN v_reason:='session_invalid';
  ELSIF v_code IS NULL OR v_code !~ '^[A-Z0-9_-]{4,100}$' THEN v_reason:='invalid_code';
  ELSE
    PERFORM 1 FROM public.cafe_loyalty_programs WHERE cafe_id=v_session.cafe_id AND enabled FOR SHARE;
    IF NOT FOUND THEN v_reason:='program_disabled'; ELSE
      SELECT * INTO v_reward FROM public.customer_reward_instances
        WHERE cafe_id=v_session.cafe_id AND upper(reward_code)=v_code AND source_type='loyalty';
      IF NOT FOUND THEN v_reason:='reward_unavailable'; ELSE
        SELECT lc.* INTO v_card FROM public.loyalty_cards lc JOIN public.customer_profiles cp
          ON cp.id=lc.customer_profile_id AND cp.cafe_id=lc.cafe_id AND cp.status='active' AND cp.blocked_at IS NULL
          WHERE lc.cafe_id=v_session.cafe_id AND lc.id=v_reward.loyalty_card_id AND lc.status='active' FOR SHARE OF lc,cp;
        IF NOT FOUND THEN v_reason:='card_unavailable'; ELSE
          SELECT * INTO v_reward FROM public.customer_reward_instances WHERE id=v_reward.id FOR SHARE;
          IF v_reward.status<>'available' OR v_reward.expires_at<=now() THEN v_reason:='reward_unavailable'; END IF;
        END IF;
      END IF;
    END IF;
  END IF;
  PERFORM loyalty_audit_private.append_attempt(v_session.cafe_id,v_session.cashier_id,v_card.id,'scan',
    CASE WHEN v_reason IS NULL THEN 'success' ELSE 'denied' END,v_reason,NULL,v_reward.id);
  -- Previously redeemed/expired rewards remain readable so the cashier can see why
  -- redemption is disabled; the scan itself records that denial explicitly.
  RETURN CASE WHEN v_reason IS NULL OR (v_reason='reward_unavailable' AND v_card.id IS NOT NULL)
    THEN jsonb_build_object('ok',true) ELSE jsonb_build_object('ok',false,'errorCode',v_reason) END;
END;
$$;
REVOKE ALL ON FUNCTION public.preview_loyalty_reward(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_loyalty_reward(text,text) TO service_role;

CREATE FUNCTION public.execute_loyalty_audited_operation(
  p_session_token text,p_code text,p_request_id uuid,p_operation text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_session record; v_result jsonb; v_card_id uuid; v_reward_id uuid; v_reason text; v_outcome text;
BEGIN
  IF p_operation IS NULL OR p_operation NOT IN ('stamp','redeem') THEN
    RETURN jsonb_build_object('ok',false,'errorCode','invalid_operation');
  END IF;
  SELECT s.*,c.active INTO v_session FROM public.cafe_cashier_sessions s
    JOIN public.cafe_cashiers c ON c.id=s.cashier_id AND c.cafe_id=s.cafe_id
    JOIN public.cafes b ON b.id=s.cafe_id AND b.slug='rast' AND b.deleted_at IS NULL
    WHERE s.token=p_session_token FOR SHARE OF s,c;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'errorCode','session_invalid'); END IF;
  IF NOT v_session.active OR v_session.revoked_at IS NOT NULL OR v_session.expires_at<=now() THEN
    PERFORM loyalty_audit_private.append_attempt(v_session.cafe_id,v_session.cashier_id,NULL,p_operation,'denied','session_invalid',p_request_id);
    RETURN jsonb_build_object('ok',false,'errorCode','session_invalid');
  END IF;
  -- Resolve only an existing card in this cashier's tenant; never retain submitted QR text.
  IF p_operation='stamp' THEN
    SELECT id INTO v_card_id FROM public.loyalty_cards WHERE cafe_id=v_session.cafe_id AND upper(card_code)=upper(btrim(p_code));
  ELSE
    SELECT loyalty_card_id,id INTO v_card_id,v_reward_id FROM public.customer_reward_instances
      WHERE cafe_id=v_session.cafe_id AND upper(reward_code)=upper(btrim(p_code)) AND source_type='loyalty';
  END IF;
  -- This subtransaction rolls back all ledger, reward and audit success writes on failure.
  BEGIN
    IF p_code IS NULL OR p_code !~ '^[A-Za-z0-9_-]{4,100}$' THEN RAISE EXCEPTION 'Invalid scan request'; END IF;
    IF p_operation='stamp' THEN v_result:=public.scan_loyalty_stamp(p_session_token,p_code,p_request_id);
    ELSE v_result:=public.redeem_loyalty_reward(p_session_token,p_code,p_request_id); END IF;
  EXCEPTION WHEN OTHERS THEN
    v_reason:=CASE SQLERRM
      WHEN 'Invalid scan request' THEN 'invalid_code'
      WHEN 'Invalid cashier session' THEN 'session_invalid'
      WHEN 'Scan request conflict' THEN 'request_conflict'
      WHEN 'Loyalty program disabled' THEN 'program_disabled'
      WHEN 'Loyalty card not found' THEN 'card_unavailable'
      WHEN 'Loyalty card unavailable' THEN 'card_unavailable'
      WHEN 'Reward not found' THEN 'reward_unavailable'
      WHEN 'Reward unavailable or expired' THEN 'reward_unavailable'
      ELSE 'operation_failed' END;
    v_outcome:=CASE WHEN v_reason='operation_failed' THEN 'failed' ELSE 'denied' END;
    PERFORM loyalty_audit_private.append_attempt(v_session.cafe_id,v_session.cashier_id,v_card_id,p_operation,v_outcome,v_reason,p_request_id,v_reward_id);
    RETURN jsonb_build_object('ok',false,'errorCode',v_reason);
  END;
  IF coalesce((v_result->>'replayed')::boolean,false) OR v_result->>'status'='recent_scan' THEN
    PERFORM loyalty_audit_private.append_attempt(v_session.cafe_id,v_session.cashier_id,v_card_id,p_operation,'duplicate',
      CASE WHEN coalesce((v_result->>'replayed')::boolean,false) THEN 'request_replayed' ELSE 'recent_scan' END,p_request_id,v_reward_id);
  END IF;
  RETURN v_result || jsonb_build_object('ok',true);
END;
$$;
REVOKE ALL ON FUNCTION public.execute_loyalty_audited_operation(text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.execute_loyalty_audited_operation(text,text,uuid,text) TO service_role;

CREATE FUNCTION public.get_owner_loyalty_activity(
  p_cafe_id uuid,p_from timestamptz DEFAULT NULL,p_to timestamptz DEFAULT NULL,
  p_cashier_id uuid DEFAULT NULL,p_kind text DEFAULT NULL,p_outcome text DEFAULT NULL,
  p_search text DEFAULT '',p_page integer DEFAULT 1,p_page_size integer DEFAULT 25
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb; v_search text:=lower(btrim(coalesce(p_search,'')));
BEGIN
  IF NOT loyalty_audit_private.can_read(p_cafe_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF p_page IS NULL OR p_page<1 OR p_page>10000 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50
    OR char_length(v_search)>80 OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>=p_to)
    OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p_to-p_from>interval '366 days')
    OR (p_kind IS NOT NULL AND p_kind NOT IN ('scan','stamp','redeem','void'))
    OR (p_outcome IS NOT NULL AND p_outcome NOT IN ('success','denied','failed','duplicate')) THEN
    RAISE EXCEPTION 'Invalid activity filters';
  END IF;
  WITH scope AS MATERIALIZED (
    SELECT e.* FROM public.loyalty_activity_events e WHERE e.cafe_id=p_cafe_id
      AND (p_from IS NULL OR e.occurred_at>=p_from) AND (p_to IS NULL OR e.occurred_at<p_to)
      AND (p_kind IS NULL OR e.kind=p_kind) AND (p_outcome IS NULL OR e.outcome=p_outcome)
      AND (v_search='' OR strpos(lower(coalesce(e.actor_name,'')||' '||coalesce(e.customer_name,'')||' '||coalesce(e.card_suffix,'')||' '||coalesce(e.reward_name,'')),v_search)>0)
  ), filtered AS MATERIALIZED (SELECT * FROM scope WHERE p_cashier_id IS NULL OR cashier_id=p_cashier_id),
  page AS (SELECT * FROM filtered ORDER BY occurred_at DESC,id DESC LIMIT p_page_size OFFSET ((p_page-1)*p_page_size)),
  employee_ids AS (SELECT id FROM public.cafe_cashiers WHERE cafe_id=p_cafe_id UNION SELECT cashier_id FROM scope WHERE cashier_id IS NOT NULL)
  SELECT jsonb_build_object(
    'events',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',id,'occurredAt',occurred_at,'recordedAt',recorded_at,'kind',kind,'outcome',outcome,'origin',origin,
      'cashierId',cashier_id,'actorName',coalesce(actor_name,''),'actorType',actor_type,'cardId',card_id,'cardSuffix',card_suffix,
      'customerName',customer_name,'stampsDelta',stamps_delta,'rewardsDelta',rewards_delta,'stampsBefore',stamps_before,
      'rewardsBefore',rewards_before,'stampsAfter',stamps_after,'rewardsAfter',rewards_after,'rewardName',reward_name,
      'rewardSuffix',reward_suffix,'rewardKind',reward_kind,'rewardDiscountPercent',reward_discount_percent,
      'rewardExpiresAt',reward_expires_at,'rewardTerms',reward_terms,'reasonCode',reason_code
    ) ORDER BY occurred_at DESC,id DESC) FROM page),'[]'::jsonb),
    'total',(SELECT count(*) FROM filtered),'page',p_page,'pageSize',p_page_size,
    'summary',(SELECT jsonb_build_object('total',count(*),
      'scans',count(*) FILTER(WHERE kind='scan' AND outcome='success'),
      'stamps',coalesce(sum(stamps_delta) FILTER(WHERE kind='stamp' AND outcome='success'),0),
      'redemptions',count(*) FILTER(WHERE kind='redeem' AND outcome='success'),
      'rewardsIssued',coalesce(sum(greatest(rewards_delta,0)) FILTER(WHERE outcome='success'),0),
      'denied',count(*) FILTER(WHERE outcome='denied'),'failed',count(*) FILTER(WHERE outcome='failed'),
      'duplicates',count(*) FILTER(WHERE outcome='duplicate'),'uniqueCards',count(DISTINCT card_id) FILTER(WHERE outcome='success'),
      'activeCashiers',count(DISTINCT cashier_id)) FROM filtered),
    'employees',coalesce((SELECT jsonb_agg(employee ORDER BY employee->>'name',employee->>'id') FROM (
      SELECT jsonb_build_object('id',i.id,'name',coalesce(c.full_name,(SELECT actor_name FROM scope WHERE cashier_id=i.id ORDER BY occurred_at DESC,id DESC LIMIT 1),''),
        'active',coalesce(c.active,false),'scans',count(s.id) FILTER(WHERE s.kind='scan' AND s.outcome='success'),
        'stamps',coalesce(sum(s.stamps_delta) FILTER(WHERE s.kind='stamp' AND s.outcome='success'),0),
        'redemptions',count(s.id) FILTER(WHERE s.kind='redeem' AND s.outcome='success'),
        'denied',count(s.id) FILTER(WHERE s.outcome='denied'),'failed',count(s.id) FILTER(WHERE s.outcome='failed'),
        'duplicates',count(s.id) FILTER(WHERE s.outcome='duplicate'),'lastActivityAt',max(s.occurred_at)) employee
      FROM employee_ids i LEFT JOIN public.cafe_cashiers c ON c.id=i.id AND c.cafe_id=p_cafe_id
      LEFT JOIN scope s ON s.cashier_id=i.id GROUP BY i.id,c.full_name,c.active
    ) employee_rows),'[]'::jsonb),
    'recordingStartedAt',(SELECT recording_started_at FROM loyalty_audit_private.settings WHERE singleton)
  ) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_owner_loyalty_activity(uuid,timestamptz,timestamptz,uuid,text,text,text,integer,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_loyalty_activity(uuid,timestamptz,timestamptz,uuid,text,text,text,integer,integer) TO authenticated;
COMMIT;
