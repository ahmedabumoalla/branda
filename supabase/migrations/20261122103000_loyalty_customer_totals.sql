BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE INDEX loyalty_scan_points_by_card_idx ON public.loyalty_scan_requests(cafe_id,target_code)
  WHERE operation IN ('points','spend_points');

-- Shared by the bounded directory page and the selected profile. Only the two
-- authenticated RPCs can call this helper, after checking the current tenant.
CREATE FUNCTION brand_finance_private.loyalty_customer_balance(p_cafe uuid, p_card uuid)
RETURNS jsonb LANGUAGE sql STABLE STRICT SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'mode', coalesce(program.points_mode, 'stamps'),
    'stampsCollected', events.stamps, 'stampsInCycle', card.stamps_in_cycle,
    'rewardsRedeemed', events.redeemed + rewards.legacy_redeemed,
    'availableStampRewards', rewards.available,
    'pointsBalance', card.available_loyalty_points,
    'pointsEarned', points.earned, 'pointsSpent', points.spent,
    'affordablePointRewards', CASE WHEN program.points_mode = 'points' THEN (
      SELECT count(*) FROM jsonb_array_elements(program.points_milestones) tier
      WHERE (tier->>'points')::integer <= card.available_loyalty_points
    ) END
  )
  FROM public.loyalty_cards card
  LEFT JOIN public.cafe_loyalty_programs program ON program.cafe_id = card.cafe_id
  CROSS JOIN LATERAL (
    SELECT coalesce(sum(e.stamps_added) FILTER (WHERE e.event_type = 'stamp' AND e.stamps_added > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.loyalty_card_events v
        WHERE v.cafe_id = e.cafe_id AND v.card_id = e.card_id AND v.event_type = 'void'
          AND v.invoice_barcode = e.invoice_barcode AND v.created_at >= e.created_at
      )), 0) AS stamps,
      count(*) FILTER (WHERE e.event_type = 'redeem') AS redeemed
    FROM public.loyalty_card_events e WHERE e.cafe_id = card.cafe_id AND e.card_id = card.id
  ) events
  CROSS JOIN LATERAL (
    SELECT count(*) FILTER (WHERE i.status = 'available' AND (i.expires_at IS NULL OR i.expires_at > now())) AS available,
      count(*) FILTER (WHERE i.status = 'redeemed' AND NOT EXISTS (
        SELECT 1 FROM public.loyalty_card_events e
        WHERE e.cafe_id = i.cafe_id AND e.card_id = i.loyalty_card_id AND e.event_type = 'redeem'
          AND (e.invoice_barcode = i.reward_code OR e.invoice_barcode = 'POS-' || (i.metadata->>'financeDocumentNumber'))
      )) AS legacy_redeemed
    FROM public.customer_reward_instances i
    WHERE i.cafe_id = card.cafe_id AND i.loyalty_card_id = card.id AND i.source_type = 'loyalty'
  ) rewards
  CROSS JOIN LATERAL (
    -- One committed receipt per request. Approval aliases and retries refer to
    -- the original transaction. Historical earnings use the posted award.
    SELECT coalesce(sum((s.result->>'pointsAdded')::numeric) FILTER (
        WHERE s.operation = 'points' AND s.result->>'status' = 'points_added'), 0) AS earned,
      coalesce(sum((s.result->>'pointsSpent')::numeric) FILTER (
        WHERE s.operation = 'spend_points' AND s.result->>'status' = 'points_redeemed'), 0) AS spent
    FROM public.loyalty_scan_requests s
    WHERE s.cafe_id = card.cafe_id AND s.target_code = card.card_code
      AND s.operation IN ('points','spend_points') AND s.result @> '{"ok":true}'::jsonb
  ) points
  WHERE card.cafe_id = p_cafe AND card.id = p_card
$$;
REVOKE ALL ON FUNCTION brand_finance_private.loyalty_customer_balance(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.loyalty_customer_directory_page(
  p_cafe uuid, p_page integer, p_query text, p_members_only boolean
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  total_rows bigint;
  actual_page integer;
  pattern text;
  items jsonb;
BEGIN
  IF NOT coalesce(brand_finance_private.loyalty_directory_authorized(p_cafe), false) THEN
    RAISE EXCEPTION 'LOYALTY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_page IS NULL OR p_page NOT BETWEEN 0 AND 100000 OR p_query IS NULL OR length(p_query) > 100 OR p_members_only IS NULL THEN
    RAISE EXCEPTION 'LOYALTY_INVALID_INPUT';
  END IF;
  pattern := '%' || replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  SELECT count(*) INTO total_rows
  FROM public.customer_profiles p
  LEFT JOIN public.loyalty_cards c ON (c.cafe_id, c.customer_profile_id) = (p.cafe_id, p.id)
  WHERE p.cafe_id = p_cafe AND p.full_name ILIKE pattern AND (NOT p_members_only OR c.id IS NOT NULL);

  actual_page := least(p_page, greatest(0, ceil(total_rows / 20.0)::integer - 1));
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'name', coalesce(nullif(r.full_name, ''), 'عميل بدون اسم'), 'joinedAt', r.created_at,
    'loyalty', brand_finance_private.loyalty_customer_balance(p_cafe, r.card_id)
  ) ORDER BY r.created_at DESC, r.id DESC), '[]'::jsonb) INTO items
  FROM (
    SELECT p.id, p.full_name, p.created_at, c.id AS card_id
    FROM public.customer_profiles p
    LEFT JOIN public.loyalty_cards c ON (c.cafe_id, c.customer_profile_id) = (p.cafe_id, p.id)
    WHERE p.cafe_id = p_cafe AND p.full_name ILIKE pattern AND (NOT p_members_only OR c.id IS NOT NULL)
    ORDER BY p.created_at DESC, p.id DESC LIMIT 20 OFFSET actual_page * 20
  ) r;
  RETURN jsonb_build_object('rows', items, 'total', total_rows, 'page', actual_page, 'pageSize', 20);
END $$;

CREATE FUNCTION public.loyalty_customer_directory_detail(p_cafe uuid, p_customer uuid, p_members_only boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF NOT coalesce(brand_finance_private.loyalty_directory_authorized(p_cafe), false) THEN
    RAISE EXCEPTION 'LOYALTY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_members_only IS NULL THEN RAISE EXCEPTION 'LOYALTY_INVALID_INPUT'; END IF;
  SELECT jsonb_build_object(
    'id', p.id, 'name', coalesce(nullif(p.full_name, ''), 'عميل بدون اسم'), 'phone', p.phone,
    'birthdayEnabled', public.loyalty_birthday_enabled(p_cafe), 'birthDate', p.birth_date,
    'loyalty', brand_finance_private.loyalty_customer_balance(p_cafe, c.id)
  ) INTO result
  FROM public.customer_profiles p
  LEFT JOIN public.loyalty_cards c ON (c.cafe_id, c.customer_profile_id) = (p.cafe_id, p.id)
  WHERE p.cafe_id = p_cafe AND p.id = p_customer AND (NOT p_members_only OR c.id IS NOT NULL);
  IF result IS NULL THEN RAISE EXCEPTION 'LOYALTY_CUSTOMER_UNAVAILABLE'; END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.finance_loyalty_customer_detail(p_cafe uuid, p_customer uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT public.loyalty_customer_directory_detail(p_cafe, p_customer, true)
$$;

REVOKE ALL ON FUNCTION public.loyalty_customer_directory_detail(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.loyalty_customer_directory_detail(uuid,uuid,boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
