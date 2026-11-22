BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- The existing RPCs serve the dedicated loyalty directory on deployed clients.
-- Cashier enrollment issues one card per (cafe_id, customer_profile_id).
CREATE INDEX IF NOT EXISTS loyalty_directory_card_events_idx
  ON public.loyalty_card_events(cafe_id, card_id, event_type, invoice_barcode);

CREATE FUNCTION public.loyalty_customer_directory_page(
  p_cafe uuid, p_page integer, p_query text, p_members_only boolean
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  total_rows bigint;
  actual_page integer;
  pattern text;
  items jsonb;
  program_mode text;
  milestones jsonb;
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
  SELECT points_mode, points_milestones INTO program_mode, milestones
  FROM public.cafe_loyalty_programs WHERE cafe_id = p_cafe;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'name', coalesce(nullif(r.full_name, ''), 'عميل بدون اسم'), 'joinedAt', r.created_at,
    'loyalty', CASE WHEN r.card_id IS NOT NULL THEN jsonb_build_object(
      'stampsCollected', events.stamps, 'rewardsRedeemed', events.redeemed + receipts.legacy_redeemed,
      'availableStampRewards', receipts.available, 'pointsBalance', r.available_loyalty_points,
      'affordablePointRewards', CASE WHEN program_mode = 'points' THEN (
        SELECT count(*) FROM jsonb_array_elements(milestones) tier
        WHERE (tier->>'points')::integer <= r.available_loyalty_points
      ) END
    ) END
  ) ORDER BY r.created_at DESC, r.id DESC), '[]'::jsonb) INTO items
  FROM (
    SELECT p.id, p.full_name, p.created_at, c.id AS card_id, c.available_loyalty_points
    FROM public.customer_profiles p
    LEFT JOIN public.loyalty_cards c ON (c.cafe_id, c.customer_profile_id) = (p.cafe_id, p.id)
    WHERE p.cafe_id = p_cafe AND p.full_name ILIKE pattern AND (NOT p_members_only OR c.id IS NOT NULL)
    ORDER BY p.created_at DESC, p.id DESC LIMIT 20 OFFSET actual_page * 20
  ) r
  CROSS JOIN LATERAL (
    SELECT coalesce(sum(e.stamps_added) FILTER (WHERE e.event_type = 'stamp' AND e.stamps_added > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.loyalty_card_events v
        WHERE v.cafe_id = e.cafe_id AND v.card_id = e.card_id AND v.event_type = 'void'
          AND v.invoice_barcode = e.invoice_barcode AND v.created_at >= e.created_at
      )), 0) AS stamps,
      count(*) FILTER (WHERE e.event_type = 'redeem') AS redeemed
    FROM public.loyalty_card_events e WHERE e.cafe_id = p_cafe AND e.card_id = r.card_id
  ) events
  CROSS JOIN LATERAL (
    SELECT count(*) FILTER (WHERE i.status = 'available' AND (i.expires_at IS NULL OR i.expires_at > now())) AS available,
      count(*) FILTER (WHERE i.status = 'redeemed' AND NOT EXISTS (
        SELECT 1 FROM public.loyalty_card_events e
        WHERE e.cafe_id = i.cafe_id AND e.card_id = i.loyalty_card_id AND e.event_type = 'redeem'
          AND (e.invoice_barcode = i.reward_code OR e.invoice_barcode = 'POS-' || (i.metadata->>'financeDocumentNumber'))
      )) AS legacy_redeemed
    FROM public.customer_reward_instances i
    WHERE i.cafe_id = p_cafe AND i.loyalty_card_id = r.card_id AND i.source_type = 'loyalty'
  ) receipts;

  RETURN jsonb_build_object('rows', items, 'total', total_rows, 'page', actual_page, 'pageSize', 20);
END $$;

REVOKE ALL ON FUNCTION public.loyalty_customer_directory_page(uuid,integer,text,boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.loyalty_customer_directory_page(uuid,integer,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.finance_loyalty_customers_read(
  p_cafe uuid, p_page integer DEFAULT 0, p_query text DEFAULT ''
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT public.loyalty_customer_directory_page(p_cafe, p_page, p_query, true)
$$;

CREATE OR REPLACE FUNCTION public.finance_loyalty_customer_detail(p_cafe uuid, p_customer uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT coalesce(brand_finance_private.loyalty_directory_authorized(p_cafe), false) THEN
    RAISE EXCEPTION 'LOYALTY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id', p.id, 'name', coalesce(nullif(p.full_name, ''), 'عميل بدون اسم'), 'phone', p.phone,
    'birthdayEnabled', public.loyalty_birthday_enabled(p_cafe), 'birthDate', p.birth_date
  ) INTO result
  FROM public.customer_profiles p
  JOIN public.loyalty_cards c ON (c.cafe_id, c.customer_profile_id) = (p.cafe_id, p.id)
  WHERE p.cafe_id = p_cafe AND p.id = p_customer;
  IF result IS NULL THEN RAISE EXCEPTION 'LOYALTY_CUSTOMER_UNAVAILABLE'; END IF;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.finance_loyalty_customers_read(uuid,integer,text),
  public.finance_loyalty_customer_detail(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finance_loyalty_customers_read(uuid,integer,text),
  public.finance_loyalty_customer_detail(uuid,uuid) TO authenticated;
COMMIT;
