BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.cafe_loyalty_programs
  ADD COLUMN points_mode text NOT NULL DEFAULT 'stamps' CHECK (points_mode IN ('stamps','points')),
  ADD COLUMN points_rate_sar numeric(9,2) NOT NULL DEFAULT 1 CHECK (points_rate_sar BETWEEN 0.01 AND 1000000),
  ADD COLUMN points_rate_quantity integer NOT NULL DEFAULT 1 CHECK (points_rate_quantity BETWEEN 1 AND 1000000),
  ADD COLUMN points_milestones jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(points_milestones)='array'),
  ADD CONSTRAINT points_mode_demo_only CHECK (cafe_id='2e08901c-5aac-4bec-8c97-a135058e508b'
    OR (points_mode='stamps' AND points_rate_sar=1 AND points_rate_quantity=1 AND points_milestones='[]'::jsonb));
ALTER TABLE public.loyalty_cards ADD COLUMN available_loyalty_points integer NOT NULL DEFAULT 0 CHECK (available_loyalty_points>=0);
CREATE FUNCTION loyalty_read_private.protect_available_points() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF current_user NOT IN ('postgres','supabase_admin','service_role') AND
    (CASE WHEN TG_OP='INSERT' THEN NEW.available_loyalty_points<>0 ELSE NEW.available_loyalty_points<>OLD.available_loyalty_points END) THEN
    RAISE EXCEPTION 'Use the cashier points operation' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION loyalty_read_private.protect_available_points() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER protect_available_points BEFORE INSERT OR UPDATE OF available_loyalty_points ON public.loyalty_cards
  FOR EACH ROW EXECUTE FUNCTION loyalty_read_private.protect_available_points();

-- The existing cashier ledger serializes idempotency across stamps, redemptions and points.
ALTER TABLE public.loyalty_scan_requests DROP CONSTRAINT loyalty_scan_requests_operation_check,
  ADD CONSTRAINT loyalty_scan_requests_operation_check CHECK (operation IN ('stamp','redeem','points','spend_points'));

-- Applies even to a privileged direct write or a new program inserted outside the owner UI.
CREATE FUNCTION loyalty_read_private.validate_points_program() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE tier jsonb; threshold integer; prior integer:=0;
BEGIN
  IF NEW.points_mode='stamps' AND NEW.points_milestones='[]'::jsonb AND NEW.points_rate_sar=1 AND NEW.points_rate_quantity=1
    AND (TG_OP='INSERT' OR (OLD.points_mode='stamps' AND OLD.points_milestones='[]'::jsonb)) THEN RETURN NEW; END IF;
  IF current_user NOT IN ('postgres','supabase_admin','service_role') THEN RAISE EXCEPTION 'Use the loyalty settings operation' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(NEW.points_milestones) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid milestones' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(NEW.points_milestones) NOT BETWEEN (CASE WHEN NEW.points_mode='points' THEN 1 ELSE 0 END) AND 20
    THEN RAISE EXCEPTION 'Invalid milestone count' USING ERRCODE='22023'; END IF;
  FOR tier IN SELECT value FROM jsonb_array_elements(NEW.points_milestones) LOOP
    IF jsonb_typeof(tier) IS DISTINCT FROM 'object' OR jsonb_typeof(tier->'points') IS DISTINCT FROM 'number'
      OR jsonb_typeof(tier->'reward') IS DISTINCT FROM 'string' OR tier - 'points' - 'reward' <> '{}'::jsonb
      OR (tier->>'points') !~ '^[1-9][0-9]{0,9}$' OR (tier->>'points')::numeric>1000000000
      OR length(btrim(tier->>'reward')) NOT BETWEEN 1 AND 100 OR btrim(tier->>'reward')<>tier->>'reward' THEN
      RAISE EXCEPTION 'Invalid milestone' USING ERRCODE='22023';
    END IF;
    threshold:=(tier->>'points')::integer;
    IF threshold<=prior THEN RAISE EXCEPTION 'Milestones must increase' USING ERRCODE='22023'; END IF;
    prior:=threshold;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION loyalty_read_private.validate_points_program() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER validate_points_program BEFORE INSERT OR UPDATE OF points_mode,points_milestones,points_rate_quantity,points_rate_sar
  ON public.cafe_loyalty_programs FOR EACH ROW EXECUTE FUNCTION loyalty_read_private.validate_points_program();

CREATE FUNCTION public.save_loyalty_points_program(
  p_cafe_id uuid, p_mode text, p_rate_sar numeric, p_rate_quantity integer,
  p_milestones jsonb, p_expected jsonb DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE program public.cafe_loyalty_programs;
BEGIN
  IF auth.uid() IS NULL OR p_cafe_id IS DISTINCT FROM '2e08901c-5aac-4bec-8c97-a135058e508b'::uuid
    OR NOT EXISTS (SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND slug='test-cafe' AND deleted_at IS NULL)
    OR platform_access_private.service_enabled(p_cafe_id,'loyalty') IS NOT TRUE
    OR (public.is_cafe_owner(p_cafe_id) OR public.is_platform_admin()) IS NOT TRUE THEN
    RAISE EXCEPTION 'Loyalty settings denied' USING ERRCODE='42501';
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('stamps','points') THEN RAISE EXCEPTION 'Invalid mode' USING ERRCODE='22023'; END IF;
  INSERT INTO public.cafe_loyalty_programs(cafe_id) VALUES(p_cafe_id) ON CONFLICT(cafe_id) DO NOTHING;
  SELECT * INTO STRICT program FROM public.cafe_loyalty_programs WHERE cafe_id=p_cafe_id FOR UPDATE;
  IF p_expected IS NOT NULL AND p_expected IS DISTINCT FROM jsonb_build_object('mode',program.points_mode,
    'rateSar',program.points_rate_sar,'rateQuantity',program.points_rate_quantity,'milestones',program.points_milestones) THEN
    RAISE EXCEPTION 'Loyalty settings changed' USING ERRCODE='40001';
  END IF;
  IF p_mode='stamps' THEN
    UPDATE public.cafe_loyalty_programs SET points_mode='stamps',updated_at=clock_timestamp()
      WHERE cafe_id=p_cafe_id AND points_mode<>'stamps';
    RETURN;
  END IF;
  IF p_rate_sar IS NULL OR p_rate_sar NOT BETWEEN 0.01 AND 1000000 OR p_rate_sar<>round(p_rate_sar,2)
    OR p_rate_quantity IS NULL OR p_rate_quantity NOT BETWEEN 1 AND 1000000
    OR jsonb_typeof(p_milestones) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid points settings' USING ERRCODE='22023'; END IF;
  UPDATE public.cafe_loyalty_programs SET points_mode=p_mode,points_rate_sar=p_rate_sar,points_rate_quantity=p_rate_quantity,
    points_milestones=p_milestones,updated_at=clock_timestamp() WHERE cafe_id=p_cafe_id;
END $$;
REVOKE ALL ON FUNCTION public.save_loyalty_points_program(uuid,text,numeric,integer,jsonb,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.save_loyalty_points_program(uuid,text,numeric,integer,jsonb,jsonb) TO authenticated;

CREATE FUNCTION loyalty_read_private.points_options(p_catalog jsonb,p_balance integer) RETURNS jsonb
LANGUAGE sql IMMUTABLE STRICT SET search_path='' AS $$
  SELECT coalesce(jsonb_agg(item ORDER BY (item->>'points')::integer),'[]'::jsonb)
  FROM jsonb_array_elements(p_catalog) AS items(item) WHERE (item->>'points')::integer<=p_balance
$$;
REVOKE ALL ON FUNCTION loyalty_read_private.points_options(jsonb,integer) FROM PUBLIC,anon,authenticated,service_role;

-- One cashier transaction boundary for pricing, spendable balance and employee approvals.
CREATE FUNCTION loyalty_read_private.run_card_points(
  p_operation text,p_session_token text,p_card_code text,p_request_id uuid,p_amount_sar numeric,
  p_expected_rate_sar numeric,p_expected_rate_quantity integer,p_cost integer,p_reward text,p_expected_balance integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  session_row public.cafe_cashier_sessions; program public.cafe_loyalty_programs; card public.loyalty_cards;
  prior public.loyalty_scan_requests; cached employee_access_private.loyalty_scan_aliases;
  intent jsonb; payload jsonb; approval jsonb; approval_id uuid; result jsonb;
  code text:=upper(btrim(p_card_code)); gain numeric; balance integer; reward_code text; reward_id uuid;
  permission text:=CASE p_operation WHEN 'points' THEN 'loyalty.stamp' WHEN 'spend_points' THEN 'loyalty.redeem' ELSE 'loyalty.read' END;
BEGIN
  IF code IS NULL OR code !~ '^[A-Z0-9_-]{1,100}$' OR p_operation NOT IN ('options','points','spend_points')
    OR (p_operation<>'options' AND p_request_id IS NULL) THEN RAISE EXCEPTION 'Invalid points request' USING ERRCODE='22023'; END IF;
  IF p_operation='points' AND (p_amount_sar IS NULL OR p_amount_sar NOT BETWEEN 0.01 AND 1000000 OR p_amount_sar<>round(p_amount_sar,2)) THEN
    RAISE EXCEPTION 'Invalid invoice amount' USING ERRCODE='22023';
  END IF;
  IF p_operation='spend_points' AND (p_cost IS NULL OR p_cost NOT BETWEEN 1 AND 1000000000 OR p_reward IS NULL
    OR length(btrim(p_reward)) NOT BETWEEN 1 AND 100 OR p_reward<>btrim(p_reward)) THEN
    RAISE EXCEPTION 'Invalid points redemption' USING ERRCODE='22023';
  END IF;
  PERFORM public.brand_finance_loyalty_session_guard(p_session_token);
  SELECT s.* INTO session_row FROM public.cafe_cashier_sessions s
    JOIN public.cafe_cashiers c ON c.id=s.cashier_id AND c.cafe_id=s.cafe_id AND c.active AND c.can_use_loyalty
    JOIN public.cafes b ON b.id=s.cafe_id AND b.slug='test-cafe' AND b.deleted_at IS NULL
    WHERE s.token=p_session_token AND s.cafe_id='2e08901c-5aac-4bec-8c97-a135058e508b' AND s.expires_at>now()
      AND s.revoked_at IS NULL AND platform_access_private.service_enabled(s.cafe_id,'loyalty') FOR SHARE OF s,c;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid cashier session' USING ERRCODE='42501'; END IF;
  IF session_row.finance_user_id IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub',session_row.finance_user_id::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',session_row.finance_user_id)::text,true);
    IF employee_access_private.allows(session_row.cafe_id,'loyalty.read',true) IS NOT TRUE OR
      (p_operation<>'options' AND employee_access_private.allows(session_row.cafe_id,permission,true) IS NOT TRUE) THEN
      RAISE EXCEPTION 'Employee loyalty permission denied' USING ERRCODE='42501';
    END IF;
  END IF;
  IF p_operation<>'options' THEN
    intent:=CASE WHEN p_operation='points' THEN jsonb_build_object('amountSar',p_amount_sar)
      ELSE jsonb_build_object('pointsSpent',p_cost,'reward',p_reward) END;
    payload:=jsonb_build_object('kind',p_operation,'code',code,'cashierId',session_row.cashier_id)||intent;
    PERFORM pg_advisory_xact_lock(hashtextextended(session_row.cafe_id::text||p_request_id::text,0));
    SELECT * INTO prior FROM public.loyalty_scan_requests WHERE cafe_id=session_row.cafe_id AND request_id=p_request_id;
    IF FOUND THEN
      IF prior.operation<>p_operation OR prior.target_code<>code OR prior.cashier_id IS DISTINCT FROM session_row.cashier_id
        OR prior.actor_id IS DISTINCT FROM session_row.finance_user_id OR NOT (prior.result @> intent) THEN RAISE EXCEPTION 'Scan request conflict'; END IF;
      RETURN prior.result||jsonb_build_object('replayed',true);
    END IF;
    SELECT * INTO cached FROM employee_access_private.loyalty_scan_aliases
      WHERE cafe_id=session_row.cafe_id AND user_id=session_row.finance_user_id AND request_id=p_request_id;
    IF FOUND THEN
      IF NOT (cached.payload @> payload) THEN RAISE EXCEPTION 'Scan request conflict'; END IF;
      RETURN cached.result||jsonb_build_object('replayed',true);
    END IF;
  END IF;
  SELECT * INTO program FROM public.cafe_loyalty_programs WHERE cafe_id=session_row.cafe_id AND enabled FOR SHARE;
  IF NOT FOUND OR program.points_mode<>'points' THEN RETURN jsonb_build_object('ok',false,'errorCode','points_mode_changed'); END IF;
  -- Every earn and redemption locks the same card before checking its current balance.
  SELECT lc.* INTO card FROM public.loyalty_cards lc JOIN public.customer_profiles cp ON cp.id=lc.customer_profile_id
    AND cp.cafe_id=lc.cafe_id AND cp.status='active' AND cp.blocked_at IS NULL
    WHERE lc.cafe_id=session_row.cafe_id AND lc.status='active' AND lc.card_code=code FOR UPDATE OF lc FOR SHARE OF cp;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'errorCode','card_unavailable'); END IF;
  balance:=card.available_loyalty_points;
  IF p_operation='options' THEN
    RETURN jsonb_build_object('ok',true,'status','points_options','cardCode',code,'pointsBalance',balance,
      'affordableRewards',loyalty_read_private.points_options(program.points_milestones,balance));
  ELSIF p_operation='points' THEN
    IF (p_expected_rate_sar IS NOT NULL AND program.points_rate_sar<>p_expected_rate_sar)
      OR (p_expected_rate_quantity IS NOT NULL AND program.points_rate_quantity<>p_expected_rate_quantity) THEN
      RETURN jsonb_build_object('ok',false,'errorCode','points_rate_changed'); END IF;
    gain:=floor(p_amount_sar*program.points_rate_quantity/program.points_rate_sar);
    IF gain=0 THEN RETURN jsonb_build_object('ok',false,'errorCode','zero_points'); END IF;
    IF gain+balance>2147483647 THEN RETURN jsonb_build_object('ok',false,'errorCode','points_limit'); END IF;
    balance:=gain+balance;
    payload:=payload||jsonb_build_object('rateSar',program.points_rate_sar,'rateQuantity',program.points_rate_quantity,'pointsAdded',gain);
  ELSE
    IF NOT (program.points_milestones @> jsonb_build_array(jsonb_build_object('points',p_cost,'reward',p_reward))) THEN
      RETURN jsonb_build_object('ok',false,'errorCode','points_reward_changed'); END IF;
    IF balance<p_cost THEN RETURN jsonb_build_object('ok',false,'errorCode','insufficient_points'); END IF;
    IF p_expected_balance IS NOT NULL AND balance<>p_expected_balance THEN RETURN jsonb_build_object('ok',false,'errorCode','points_balance_changed'); END IF;
    balance:=balance-p_cost;
    payload:=payload||jsonb_build_object('priorBalance',card.available_loyalty_points);
  END IF;
  IF session_row.finance_user_id IS NOT NULL THEN
    approval:=employee_access_private.loyalty_request(session_row.cafe_id,permission,permission,payload,p_request_id);
    approval_id:=(approval->>'requestId')::uuid;
    IF approval->>'status' NOT IN ('ready','approved') THEN RETURN jsonb_build_object('ok',false,
      'status','approval_'||(approval->>'status'),'errorCode','approval_'||(approval->>'status'),'requestId',approval_id); END IF;
    PERFORM employee_access_private.assert_and_consume(session_row.cafe_id,permission,permission,payload,approval_id);
  END IF;

  -- Save the receipt directly as redeemed. It can never be scanned as an available voucher.
  IF p_operation='spend_points' THEN
    reward_code:=public.make_customer_reward_code('LOY');
    INSERT INTO public.customer_reward_instances(cafe_id,customer_id,loyalty_card_id,source_type,reward_title,
      reward_description,reward_code,qr_payload,status,redeemed_at,metadata)
    VALUES(card.cafe_id,card.customer_profile_id,card.id,'loyalty',p_reward,p_reward,reward_code,'BARNDAKSA_REWARD:'||reward_code,
      'redeemed',now(),jsonb_build_object('source','invoice_points','pointsCost',p_cost,'requestId',p_request_id,
        'redeemedByCashierId',session_row.cashier_id)) RETURNING id INTO reward_id;
    INSERT INTO public.customer_reward_redemptions(cafe_id,reward_instance_id,customer_id,redeemed_by_cashier_id,scanned_code)
      VALUES(card.cafe_id,reward_id,card.customer_profile_id,session_row.cashier_id,reward_code);
    INSERT INTO public.loyalty_card_events(cafe_id,card_id,cashier_id,event_type,invoice_barcode,reward_delta,stamps_after,rewards_after)
      VALUES(card.cafe_id,card.id,session_row.cashier_id,'redeem',reward_code,0,card.stamps_in_cycle,card.available_rewards);
  END IF;
  UPDATE public.loyalty_cards SET available_loyalty_points=balance,total_purchases=total_purchases+(CASE WHEN p_operation='points' THEN 1 ELSE 0 END),
    updated_at=clock_timestamp(),last_used_at=now() WHERE id=card.id;
  result:=intent||jsonb_build_object('ok',true,'cardCode',code,'pointsBalance',balance,
    'affordableRewards',loyalty_read_private.points_options(program.points_milestones,balance));
  IF p_operation='points' THEN result:=result||jsonb_build_object('status','points_added','pointsAdded',gain,
    'rateSar',program.points_rate_sar,'rateQuantity',program.points_rate_quantity);
  ELSE result:=result||jsonb_build_object('status','points_redeemed','rewardInstanceId',reward_id); END IF;
  INSERT INTO public.loyalty_scan_requests(cafe_id,request_id,operation,target_code,cashier_id,actor_id,result)
    VALUES(card.cafe_id,p_request_id,p_operation,code,session_row.cashier_id,session_row.finance_user_id,result);
  IF approval_id IS NOT NULL AND approval_id<>p_request_id THEN
    INSERT INTO employee_access_private.loyalty_scan_aliases(cafe_id,user_id,request_id,payload,result)
      VALUES(card.cafe_id,session_row.finance_user_id,approval_id,payload,result);
  END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION loyalty_read_private.run_card_points(text,text,text,uuid,numeric,numeric,integer,integer,text,integer) FROM PUBLIC,anon,authenticated,service_role;

-- These managed request settings can be changed transaction-locally, not in
-- CREATE FUNCTION's SET clause. Restore the caller's context on every normal
-- return. A raised error rolls back both the request settings and the operation.
CREATE FUNCTION loyalty_read_private.card_points(
  p_operation text,p_session_token text,p_card_code text,p_request_id uuid,p_amount_sar numeric,
  p_expected_rate_sar numeric,p_expected_rate_quantity integer,p_cost integer,p_reward text,p_expected_balance integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  previous_sub text:=current_setting('request.jwt.claim.sub',true);
  previous_claims text:=current_setting('request.jwt.claims',true);
  result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
  result:=loyalty_read_private.run_card_points(p_operation,p_session_token,p_card_code,p_request_id,p_amount_sar,
    p_expected_rate_sar,p_expected_rate_quantity,p_cost,p_reward,p_expected_balance);
  PERFORM set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true),
    set_config('request.jwt.claims',coalesce(previous_claims,''),true);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION loyalty_read_private.card_points(text,text,text,uuid,numeric,numeric,integer,integer,text,integer) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_loyalty_points_options(p_session_token text,p_card_code text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT loyalty_read_private.card_points('options',p_session_token,p_card_code,NULL,NULL,NULL,NULL,NULL,NULL,NULL)
$$;
CREATE FUNCTION public.scan_loyalty_invoice_points(
  p_session_token text,p_card_code text,p_request_id uuid,p_amount_sar numeric,
  p_expected_rate_sar numeric DEFAULT NULL,p_expected_rate_quantity integer DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT loyalty_read_private.card_points('points',p_session_token,p_card_code,p_request_id,p_amount_sar,p_expected_rate_sar,p_expected_rate_quantity,NULL,NULL,NULL)
$$;
CREATE FUNCTION public.redeem_loyalty_points_reward(
  p_session_token text,p_card_code text,p_request_id uuid,p_cost integer,p_reward text,p_expected_balance integer DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT loyalty_read_private.card_points('spend_points',p_session_token,p_card_code,p_request_id,NULL,NULL,NULL,p_cost,p_reward,p_expected_balance)
$$;
REVOKE ALL ON FUNCTION public.get_loyalty_points_options(text,text),public.scan_loyalty_invoice_points(text,text,uuid,numeric,numeric,integer),
  public.redeem_loyalty_points_reward(text,text,uuid,integer,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_loyalty_points_options(text,text),public.scan_loyalty_invoice_points(text,text,uuid,numeric,numeric,integer),
  public.redeem_loyalty_points_reward(text,text,uuid,integer,text,integer) TO service_role;

-- Last line of defense for every historic stamp entry. An exception rolls the
-- stamp and its preceding balance update back in the same transaction.
CREATE FUNCTION loyalty_read_private.prevent_points_mode_stamp() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE mode text;
BEGIN
  SELECT points_mode INTO mode FROM public.cafe_loyalty_programs WHERE cafe_id=NEW.cafe_id FOR SHARE;
  IF mode='points' THEN RAISE EXCEPTION 'Invoice amount required for points'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION loyalty_read_private.prevent_points_mode_stamp() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER prevent_points_mode_stamp BEFORE INSERT ON public.loyalty_card_events
  FOR EACH ROW WHEN (NEW.cafe_id='2e08901c-5aac-4bec-8c97-a135058e508b' AND NEW.stamps_added>0)
  EXECUTE FUNCTION loyalty_read_private.prevent_points_mode_stamp();

-- Keep all subsequent changes to these functions, including employee approval,
-- daily limits, branch identity and public visibility. Fail closed on drift.
DO $update$
DECLARE def text; anchor text; replacement text; signature text;
BEGIN
  signature:='brand_finance_private.stamp_sale_customer(uuid,uuid)';
  def:=pg_get_functiondef(signature::regprocedure);
  anchor:='SELECT * INTO STRICT p FROM public.cafe_loyalty_programs WHERE cafe_id=s.cafe_id AND enabled FOR SHARE;';
  IF position(anchor IN def)=0 THEN RAISE EXCEPTION 'Unexpected POS loyalty baseline'; END IF;
  EXECUTE replace(def,anchor,anchor||$sql$
    IF p.points_mode='points' THEN
      UPDATE public.bf_sale_customers SET card_id=p_card,loyalty_status='unavailable' WHERE document_id=s.document_id;
      RETURN;
    END IF;$sql$);
  FOREACH signature IN ARRAY ARRAY['loyalty_read_private.process_one_before_employee_policy(uuid,uuid)',
    'employee_access_private.execute_loyalty_before_policy(text,text,uuid,text)'] LOOP
    def:=pg_get_functiondef(signature::regprocedure);
    anchor:='WHEN ''Scan request conflict'' THEN ''request_conflict''';
    IF position(anchor IN def)=0 THEN RAISE EXCEPTION 'Unexpected scanner baseline: %',signature; END IF;
    EXECUTE replace(def,anchor,'WHEN ''Invoice amount required for points'' THEN ''points_invoice_required'' '||anchor);
  END LOOP;
  signature:='public.snapshot_rast_loyalty_reward()';
  def:=pg_get_functiondef(signature::regprocedure);
  anchor:='NEW.metadata := NEW.metadata || jsonb_build_object(''termsSnapshot''';
  IF position(anchor IN def)=0 THEN RAISE EXCEPTION 'Unexpected loyalty reward terms baseline'; END IF;
  EXECUTE replace(def,anchor,$sql$
    IF NEW.cafe_id='2e08901c-5aac-4bec-8c97-a135058e508b' AND NEW.metadata->>'source'='invoice_points' THEN
      NEW.metadata:=NEW.metadata||jsonb_build_object('termsSnapshot',jsonb_build_object('rewardName',NEW.reward_title,
        'rewardKind','custom','pointsCost',NEW.metadata->'pointsCost','validityDays',v_days,'terms',v_program.terms));
      RETURN NEW;
    END IF;
    $sql$||anchor);
  signature:='public.get_loyalty_brand_read_snapshot(text)';
  def:=pg_get_functiondef(signature::regprocedure);
  anchor:='''google_wallet_enabled'',p.google_wallet_enabled) END';
  replacement:=$sql$'google_wallet_enabled',p.google_wallet_enabled) ||
    CASE WHEN c.id='2e08901c-5aac-4bec-8c97-a135058e508b' THEN jsonb_build_object('points_mode',p.points_mode,
      'points_rate_sar',p.points_rate_sar,'points_rate_quantity',p.points_rate_quantity,'points_milestones',p.points_milestones)
    ELSE '{}'::jsonb END END$sql$;
  IF position(anchor IN def)=0 THEN RAISE EXCEPTION 'Unexpected public loyalty snapshot baseline'; END IF;
  EXECUTE replace(def,anchor,replacement);
END $update$;
NOTIFY pgrst,'reload schema';
COMMIT;
