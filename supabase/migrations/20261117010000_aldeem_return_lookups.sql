BEGIN;

-- Bounded read-only views for the independent Aldeem return workspace.
-- Posting, approval, balances and stock remain on the original financial ledger.
CREATE FUNCTION public.aldeem_sales_return_lookup(
  p_cafe_id uuid, p_mode text, p_query text DEFAULT '', p_offset integer DEFAULT 0, p_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; query_text text; numeric_query text; branch_id uuid;
BEGIN
  IF auth.uid() IS NULL OR brand_finance_private.role_for(p_cafe_id) IS DISTINCT FROM 'owner'
    OR NOT EXISTS (SELECT 1 FROM public.cafes WHERE id = p_cafe_id AND slug = 'khayal-aldeem')
  THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('invoices', 'requests', 'settlement')
    OR p_offset IS NULL OR p_offset < 0 OR p_offset > 100000
    OR p_query IS NULL OR length(p_query) > 100
  THEN RAISE EXCEPTION 'Invalid return lookup' USING ERRCODE = '22023'; END IF;
  PERFORM erp_branch_private.enter(p_cafe_id);
  branch_id := erp_branch_private.current_branch(p_cafe_id);

  IF p_mode = 'invoices' THEN
    query_text := btrim(translate(p_query, '٠١٢٣٤٥٦٧٨٩', '0123456789'));
    IF query_text ~ '^#?[[:space:]]*[0-9]+$' THEN
      numeric_query := coalesce(nullif(ltrim(regexp_replace(query_text, '^#?[[:space:]]*', ''), '0'), ''), '0');
    END IF;
    WITH candidates AS MATERIALIZED (
      SELECT d.id, d.number, coalesce(nullif(e.display_number, ''), nullif(c.snapshot->>'displayNumber', ''), d.number::text) AS display_number,
        coalesce(nullif(c.snapshot#>>'{customer,name}', ''), nullif(p.name, ''), 'عميل نقدي') AS customer_name,
        d.created_at, d.total
      FROM public.bf_documents d
      LEFT JOIN public.bf_parties p ON p.cafe_id = d.cafe_id AND p.id = d.party_id
      LEFT JOIN public.bf_invoice_extensions e ON e.cafe_id = d.cafe_id AND e.document_id = d.id
      LEFT JOIN public.bf_company_invoices c ON c.cafe_id = d.cafe_id AND c.document_id = d.id
      WHERE d.cafe_id = p_cafe_id AND d.kind = 'sale' AND e.source_id IS NULL
        AND erp_branch_private.row_allowed(p_cafe_id, branch_id, to_jsonb(d), '')
        AND coalesce(c.snapshot->>'documentType', 'invoice') = 'invoice'
        AND (query_text = '' OR d.number::text = numeric_query
          OR strpos(lower(coalesce(e.display_number, c.snapshot->>'displayNumber', '')), lower(query_text)) > 0
          OR strpos(lower(coalesce(c.snapshot#>>'{customer,name}', '') || ' ' || coalesce(p.name, '') || ' ' || coalesce(p.phone, '') || ' ' || coalesce(d.customer_phone, '')), lower(query_text)) > 0)
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(brand_finance_private.refund_lines(p_cafe_id, d.id, false)) AS line(value)
          WHERE (line.value->>'quantity')::numeric > coalesce((line.value->>'returned_quantity')::numeric, 0)
        )
      ORDER BY d.created_at DESC, d.id DESC OFFSET p_offset LIMIT 31
    ), page AS (
      SELECT * FROM candidates ORDER BY created_at DESC, id DESC LIMIT 30
    )
    SELECT jsonb_build_object('items', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'number', number, 'displayNumber', display_number, 'customerName', customer_name, 'createdAt', created_at, 'total', total
    ) ORDER BY created_at DESC, id DESC) FROM page), '[]'::jsonb), 'hasMore', (SELECT count(*) > 30 FROM candidates)) INTO result;
    RETURN result;
  ELSIF p_mode = 'requests' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(request_row) ORDER BY request_row.created_at DESC, request_row.id DESC), '[]'::jsonb) INTO result
    FROM (
      SELECT r.id, r.document_id, r.document_number, r.status, r.payload, r.total, r.paid, r.created_by, r.created_at,
        r.reviewed_by, r.reviewed_at, r.refund_document_id, r.rejection_reason, coalesce(a.name, '') AS "accountName"
      FROM public.bf_refund_requests r
      LEFT JOIN public.bf_accounts a ON a.cafe_id = r.cafe_id AND a.id::text = r.payload->>'accountId'
      WHERE r.cafe_id = p_cafe_id AND ((p_id IS NULL AND r.status = 'pending') OR r.id = p_id)
        AND EXISTS (SELECT 1 FROM public.bf_documents d WHERE d.cafe_id = p_cafe_id AND d.id = r.document_id
          AND erp_branch_private.row_allowed(p_cafe_id, branch_id, to_jsonb(d), ''))
      ORDER BY r.created_at DESC, r.id DESC LIMIT 100
    ) request_row;
    RETURN result;
  END IF;

  RETURN jsonb_build_object(
    'accounts', (SELECT coalesce(jsonb_agg(to_jsonb(account) ORDER BY account.name, account.id), '[]'::jsonb) FROM (
      SELECT a.id, a.name, a.code, a.kind, a.active, a.is_primary, a.is_cashier_drawer,
        coalesce((SELECT sum(j.debit - j.credit) FROM public.bf_journal j WHERE j.cafe_id = a.cafe_id AND j.account_id = a.id), 0) AS balance
      FROM public.bf_accounts a WHERE a.cafe_id = p_cafe_id AND a.active AND a.kind IN ('cash', 'bank')
        AND erp_branch_private.row_allowed(p_cafe_id, branch_id, to_jsonb(a), 'account')
        AND NOT EXISTS (SELECT 1 FROM public.bf_shifts h WHERE h.cafe_id = a.cafe_id AND h.account_id = a.id AND h.status = 'handover')
    ) account),
    'shifts', (SELECT coalesce(jsonb_agg(to_jsonb(shift) ORDER BY shift.opened_at DESC, shift.id DESC), '[]'::jsonb) FROM (
      SELECT s.id, s.shift_number, s.user_id, s.account_id, s.status, s.opening_cash, s.expected_cash, s.counted_cash,
        s.variance, s.opened_at, s.closed_at, s.handover_to, s.note, s.supervisor_paused
      FROM public.bf_shifts s JOIN public.bf_accounts a ON a.cafe_id = s.cafe_id AND a.id = s.account_id
      WHERE s.cafe_id = p_cafe_id AND s.status = 'open' AND a.active AND a.kind = 'cash'
        AND erp_branch_private.row_allowed(p_cafe_id, branch_id, to_jsonb(s), '')
    ) shift)
  );
END $$;

REVOKE ALL ON FUNCTION public.aldeem_sales_return_lookup(uuid, text, text, integer, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aldeem_sales_return_lookup(uuid, text, text, integer, uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
