-- Read-only compact cashier preview. Mutations/audit remain in the stamp path.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE INDEX IF NOT EXISTS idx_reward_instances_available_card
  ON public.customer_reward_instances(cafe_id, loyalty_card_id, expires_at)
  WHERE status = 'available';

CREATE FUNCTION public.get_cashier_loyalty_summary(
  p_session_token text, p_expected_cafe_id uuid, p_expected_cashier_id uuid,
  p_method text, p_value text, p_owner_verified boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  s public.cafe_cashier_sessions;
  c public.cafe_cashiers;
  card public.loyalty_cards;
  required integer;
  result jsonb;
BEGIN
  -- Re-check the current session, cashier, brand and feature entitlement on every read.
  PERFORM platform_access_private.assert_cashier_loyalty(p_session_token);
  SELECT * INTO STRICT s FROM public.cafe_cashier_sessions WHERE token = p_session_token;
  IF s.cafe_id IS DISTINCT FROM p_expected_cafe_id OR s.cashier_id IS DISTINCT FROM p_expected_cashier_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'session_scope_changed');
  END IF;
  SELECT * INTO STRICT c FROM public.cafe_cashiers WHERE id = s.cashier_id AND cafe_id = s.cafe_id;
  -- Owner / maintenance sessions additionally require the existing server Auth
  -- and maintenance-cookie validation. No customer data precedes this gate.
  IF c.owner_user_id IS NOT NULL THEN
    IF p_owner_verified IS DISTINCT FROM true THEN
      RETURN jsonb_build_object('ok', false, 'code', 'owner_auth_required');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = c.owner_user_id AND status = 'active') THEN
      RETURN jsonb_build_object('ok', false, 'code', 'permission_denied');
    END IF;
  END IF;
  IF p_method IS NULL OR p_method NOT IN ('phone', 'code') OR p_value IS NULL OR length(p_value) > 100
    OR (p_method = 'phone' AND p_value !~ '^9665[0-9]{8}$')
    OR (p_method = 'code' AND p_value !~ '^([1-9][0-9]{0,4}|[A-Z0-9_-]{4,100})$') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_input');
  END IF;
  SELECT purchases_required INTO required FROM public.cafe_loyalty_programs WHERE cafe_id = s.cafe_id AND enabled;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'permission_denied'); END IF;
  -- Separate indexable branches avoid a cross-table OR and never search another tenant.
  BEGIN
  IF p_method = 'phone' THEN
    SELECT lc.* INTO STRICT card FROM public.customer_profiles cp JOIN public.loyalty_cards lc
      ON lc.customer_profile_id = cp.id AND lc.cafe_id = cp.cafe_id
      WHERE cp.cafe_id = s.cafe_id AND cp.phone_normalized = p_value AND cp.phone_auth_conflict = false
      AND cp.status = 'active' AND cp.blocked_at IS NULL AND lc.status = 'active';
  ELSIF p_value ~ '^[1-9][0-9]{0,4}$' THEN
    SELECT lc.* INTO STRICT card FROM public.loyalty_cards lc JOIN public.customer_profiles cp
      ON cp.id = lc.customer_profile_id AND cp.cafe_id = lc.cafe_id
      WHERE lc.cafe_id = s.cafe_id AND lc.display_number = p_value::integer
      AND lc.status = 'active' AND cp.status = 'active' AND cp.blocked_at IS NULL AND cp.phone_auth_conflict = false;
  ELSE
    SELECT lc.* INTO STRICT card FROM public.loyalty_cards lc JOIN public.customer_profiles cp
      ON cp.id = lc.customer_profile_id AND cp.cafe_id = lc.cafe_id
      WHERE lc.cafe_id = s.cafe_id AND lc.card_code = p_value
      AND lc.status = 'active' AND cp.status = 'active' AND cp.blocked_at IS NULL AND cp.phone_auth_conflict = false;
  END IF;
  EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END;
  IF card.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'not_found'); END IF;
  -- One final statement snapshot keeps stamps and reward count consistent even
  -- if a queued stamp commits while the identifier is being resolved.
  SELECT jsonb_build_object('ok', true, 'summary', jsonb_build_object(
    'customerName', lc.customer_name, 'stampsInCycle', lc.stamps_in_cycle,
    'purchasesRequired', lp.purchases_required, 'availableRewards', (
      SELECT count(*) FROM public.customer_reward_instances r
      WHERE r.cafe_id = s.cafe_id AND r.loyalty_card_id = lc.id AND r.status = 'available'
      AND (r.expires_at IS NULL OR r.expires_at > now())
    ))) INTO result
  FROM public.loyalty_cards lc JOIN public.cafe_loyalty_programs lp ON lp.cafe_id = lc.cafe_id AND lp.enabled
  JOIN public.customer_profiles cp ON cp.id = lc.customer_profile_id AND cp.cafe_id = lc.cafe_id
  WHERE lc.id = card.id AND lc.cafe_id = s.cafe_id AND lc.status = 'active'
    AND cp.status = 'active' AND cp.blocked_at IS NULL AND cp.phone_auth_conflict = false;
  RETURN coalesce(result, jsonb_build_object('ok', false, 'code', 'not_found'));
END $$;
REVOKE ALL ON FUNCTION public.get_cashier_loyalty_summary(text,uuid,uuid,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cashier_loyalty_summary(text,uuid,uuid,text,text,boolean) TO service_role;
COMMENT ON FUNCTION public.get_cashier_loyalty_summary(text,uuid,uuid,text,text,boolean)
  IS 'Service-only tenant-scoped read preview; owner flag is set only after server Auth and maintenance validation';
COMMIT;
