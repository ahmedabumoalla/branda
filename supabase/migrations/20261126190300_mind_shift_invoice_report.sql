BEGIN;

-- A cashier can close a shared MIND drawer. Keep access to that receipt after
-- close using the authenticated command record, even when a colleague opened it.
CREATE INDEX bf_shift_close_receipt_actor ON public.bf_requests(cafe_id, created_by, (result->>'id'))
  WHERE operation = 'shift_close';
DO $migration$
DECLARE
  definition text := pg_get_functiondef('brand_finance_private.pos_report_before_supplier_payout(uuid,uuid)'::regprocedure);
  previous text := $guard$(r='cashier' AND sh.user_id<>auth.uid())$guard$;
BEGIN
  IF strpos(definition, previous) = 0 THEN RAISE EXCEPTION 'Unexpected cashier report guard'; END IF;
  EXECUTE replace(definition, previous, $guard$(
    r='cashier' AND sh.user_id<>auth.uid() AND NOT EXISTS (
      SELECT FROM public.bf_requests cmd JOIN public.cafes c ON c.id = cmd.cafe_id
      WHERE c.id = p_cafe_id AND c.slug = 'mind-hospital' AND cmd.created_by = auth.uid()
        AND cmd.operation = 'shift_close' AND cmd.result->>'id' = sh.id::text
        AND cmd.payload->>'shiftId' = sh.id::text
    )
  )$guard$);
END $migration$;

CREATE FUNCTION public.mind_pos_shift_report(p_cafe_id uuid, p_shift_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  report jsonb;
  by_method jsonb;
  next_start timestamptz;
BEGIN
  -- The original reader checks the current user's tenant, role, cashier and closed shift.
  report := public.brand_finance_pos_shift_report(p_cafe_id, p_shift_id);
  IF NOT EXISTS (SELECT FROM public.cafes WHERE id = p_cafe_id AND slug = 'mind-hospital') THEN
    RAISE EXCEPTION 'MIND shift report unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT successor.opened_at INTO next_start
  FROM public.bf_shifts original JOIN public.bf_shifts successor
    ON successor.cafe_id = original.cafe_id AND successor.account_id = original.account_id
    AND (successor.opened_at, successor.shift_number, successor.id) >
        (original.opened_at, original.shift_number, original.id)
  WHERE original.cafe_id = p_cafe_id AND original.id = p_shift_id
  ORDER BY successor.opened_at, successor.shift_number, successor.id LIMIT 1;

  -- One bucket per original sale. Later collections, payment edits and refunds
  -- remain in the existing collections section and never count as new invoices.
  SELECT coalesce(jsonb_agg(to_jsonb(totals) ORDER BY kind), '[]'::jsonb) INTO by_method
  FROM (
    SELECT CASE
      WHEN d.total > 0 AND d.paid = 0 THEN 'receivable'
      WHEN d.paid > 0 AND d.paid < d.total THEN 'partial'
      WHEN a.kind IN ('cash','pos','bank') THEN a.kind
      ELSE 'other'
    END AS kind, count(*) AS count, sum(d.total) AS total
    FROM public.bf_documents d
    LEFT JOIN public.bf_accounts a ON a.cafe_id = d.cafe_id AND a.id = d.account_id
    WHERE d.cafe_id = p_cafe_id AND d.shift_id = p_shift_id AND d.kind = 'sale'
      AND d.created_at <= (report#>>'{shift,closed_at}')::timestamptz
      AND (next_start IS NULL OR d.created_at < next_start)
    GROUP BY 1
  ) totals;

  RETURN report || jsonb_build_object('invoicesAtClose', by_method);
END $$;
REVOKE ALL ON FUNCTION public.mind_pos_shift_report(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mind_pos_shift_report(uuid,uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
