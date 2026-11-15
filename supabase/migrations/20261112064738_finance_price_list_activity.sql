BEGIN;

-- Existing settings audit is private (RLS enabled, no client table grants).
-- Project its selected list only; the existing (cafe_id, revision) index serves the cursor.
CREATE FUNCTION public.brand_finance_price_list_activity(
  p_cafe_id uuid,
  p_list_id uuid,
  p_before_revision integer DEFAULT NULL,
  p_limit integer DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  role_name text;
  answer jsonb;
  next_cursor integer;
BEGIN
  role_name := brand_finance_private.role_for(p_cafe_id);
  IF auth.uid() IS NULL OR coalesce(role_name, '') NOT IN ('owner','manager','accountant','auditor') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_list_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 30 OR p_before_revision <= 0 THEN
    RAISE EXCEPTION 'Invalid activity cursor' USING ERRCODE = '22023';
  END IF;

  WITH candidates AS MATERIALIZED (
    SELECT e.id, e.revision, e.created_at, e.created_by,
      e.before_settings #> '{advanced,priceLists}' before_lists,
      e.after_settings #> '{advanced,priceLists}' after_lists
    FROM public.bf_invoice_settings_events e
    WHERE e.cafe_id = p_cafe_id AND (p_before_revision IS NULL OR e.revision < p_before_revision)
    ORDER BY e.revision DESC LIMIT 201
  ), scanned AS MATERIALIZED (
    SELECT * FROM candidates ORDER BY revision DESC LIMIT 200
  ), selected AS MATERIALIZED (
    SELECT e.id, e.revision, e.created_at, e.created_by,
      (SELECT item FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e.before_lists) = 'array' THEN e.before_lists ELSE '[]'::jsonb END) item WHERE item ->> 'id' = p_list_id::text LIMIT 1) previous,
      (SELECT item FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e.after_lists) = 'array' THEN e.after_lists ELSE '[]'::jsonb END) item WHERE item ->> 'id' = p_list_id::text LIMIT 1) current
    FROM scanned e
  ), matching AS MATERIALIZED (
    SELECT * FROM selected WHERE previous IS DISTINCT FROM current ORDER BY revision DESC LIMIT p_limit + 1
  ), page AS MATERIALIZED (
    SELECT * FROM matching ORDER BY revision DESC LIMIT p_limit
  ), projected AS (
    SELECT p.revision, jsonb_build_object(
      'id', p.id, 'revision', p.revision, 'createdAt', p.created_at,
      'actor', coalesce((SELECT nullif(s.name, '') FROM public.bf_staff s WHERE s.cafe_id = p_cafe_id AND s.user_id = p.created_by), (SELECT nullif(pr.full_name, '') FROM public.profiles pr WHERE pr.id = p.created_by), 'مستخدم غير مسمى'),
      'action', CASE WHEN p.previous IS NULL THEN 'created' WHEN p.current IS NULL THEN 'deleted' ELSE 'updated' END,
      'changes', coalesce((
        SELECT jsonb_agg(jsonb_build_object('field', changes.field, 'productId', changes.product_id, 'before', changes.before_value, 'after', changes.after_value) ORDER BY changes.ordinal, changes.product_id)
        FROM (
          SELECT 'name'::text field, NULL::text product_id, p.previous -> 'name' before_value, p.current -> 'name' after_value, 1 ordinal WHERE p.previous -> 'name' IS DISTINCT FROM p.current -> 'name'
          UNION ALL
          SELECT 'active', NULL, p.previous -> 'active', p.current -> 'active', 2 WHERE p.previous -> 'active' IS DISTINCT FROM p.current -> 'active'
          UNION ALL
          SELECT 'customers', NULL, to_jsonb(jsonb_array_length(coalesce(p.previous -> 'partyIds', '[]'::jsonb))), to_jsonb(jsonb_array_length(coalesce(p.current -> 'partyIds', '[]'::jsonb))), 3 WHERE coalesce(p.previous -> 'partyIds', '[]'::jsonb) IS DISTINCT FROM coalesce(p.current -> 'partyIds', '[]'::jsonb)
          UNION ALL
          SELECT 'price', coalesce(b.item ->> 'productId', a.item ->> 'productId'), b.item -> 'price', a.item -> 'price', 4
          FROM jsonb_array_elements(coalesce(p.previous -> 'prices', '[]'::jsonb)) b(item)
          FULL JOIN jsonb_array_elements(coalesce(p.current -> 'prices', '[]'::jsonb)) a(item) ON a.item ->> 'productId' = b.item ->> 'productId'
          WHERE b.item -> 'price' IS DISTINCT FROM a.item -> 'price'
        ) changes
      ), '[]'::jsonb)
    ) item
    FROM page p
  )
  SELECT coalesce((SELECT jsonb_agg(item ORDER BY revision DESC) FROM projected), '[]'::jsonb),
    CASE WHEN (SELECT count(*) FROM matching) > p_limit THEN (SELECT min(revision) FROM page)
      WHEN (SELECT count(*) FROM candidates) > 200 THEN (SELECT min(revision) FROM scanned)
      ELSE NULL END
  INTO answer, next_cursor;

  RETURN jsonb_build_object('items', answer, 'nextCursor', next_cursor, 'limit', p_limit);
END;
$$;

REVOKE ALL ON FUNCTION public.brand_finance_price_list_activity(uuid,uuid,integer,integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_price_list_activity(uuid,uuid,integer,integer) TO authenticated;
COMMENT ON FUNCTION public.brand_finance_price_list_activity(uuid,uuid,integer,integer) IS 'Tenant-authorized price-list audit projection; no settings snapshots or unrelated lists; scans at most 200 revisions per cursor page';
NOTIFY pgrst, 'reload schema';
COMMIT;
