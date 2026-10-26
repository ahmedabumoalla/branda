BEGIN;
-- Narrow read-only report; cashier access is limited to their own closed shifts.
-- No direct table grants, ledger changes or dependency on unpublished shift modules.
CREATE FUNCTION public.brand_finance_pos_shift_report(p_cafe_id uuid,p_shift_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; sh public.bf_shifts%ROWTYPE; result jsonb;
BEGIN
 r:=brand_finance_private.role_for(p_cafe_id);
 SELECT * INTO sh FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND id=p_shift_id;
 IF sh.id IS NULL OR sh.status<>'closed' OR r NOT IN('owner','manager','cashier') OR (r='cashier' AND sh.user_id<>auth.uid()) THEN
  RAISE EXCEPTION 'Closed shift report access denied' USING ERRCODE='42501';
 END IF;
 WITH sales AS MATERIALIZED (
  SELECT d.id,d.total,d.paid,d.account_id FROM public.bf_documents d WHERE d.cafe_id=p_cafe_id AND d.shift_id=p_shift_id AND d.kind='sale'
 ), related AS MATERIALIZED (
  SELECT d.kind,d.total,d.paid,d.account_id FROM public.bf_documents d JOIN sales s ON s.id=d.reference_id WHERE d.cafe_id=p_cafe_id AND d.kind IN('refund','settlement')
 ), events AS (
  SELECT account_id,paid collected,0::numeric refunded FROM sales
  UNION ALL SELECT account_id,CASE WHEN kind='settlement' THEN total ELSE 0 END,CASE WHEN kind='refund' THEN paid ELSE 0 END FROM related
 ), payments AS (
  SELECT a.kind,sum(e.collected) collected,sum(e.refunded) refunded FROM events e JOIN public.bf_accounts a ON a.cafe_id=p_cafe_id AND a.id=e.account_id GROUP BY a.kind
 ), totals AS (
  SELECT (SELECT count(*) FROM sales) invoice_count,(SELECT coalesce(sum(total),0) FROM sales) sales_total,(SELECT coalesce(sum(total),0) FROM related WHERE kind='refund') refunds_total
 )
 SELECT jsonb_build_object(
  'shift',jsonb_build_object('id',sh.id,'user_id',sh.user_id,'account_id',sh.account_id,'status',sh.status,'shift_number',sh.shift_number,'opening_cash',sh.opening_cash,'expected_cash',sh.expected_cash,'counted_cash',sh.counted_cash,'variance',sh.variance,'opened_at',sh.opened_at,'closed_at',sh.closed_at,'handover_to',sh.handover_to,'note',sh.note),
  'brandName',(SELECT name FROM public.cafes WHERE id=p_cafe_id),
  'accountName',(SELECT name FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=sh.account_id),
  'generatedAt',now(),'invoiceCount',invoice_count,'salesTotal',sales_total,'refundsTotal',refunds_total,'netSales',sales_total-refunds_total,
  'payments',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.kind) FROM payments p),'[]'::jsonb)
 ) INTO result FROM totals;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_pos_shift_report(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_pos_shift_report(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
