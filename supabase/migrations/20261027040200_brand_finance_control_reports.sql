BEGIN;
CREATE FUNCTION public.brand_finance_control_report(p_cafe_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF brand_finance_private.role_for(p_cafe_id) NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Financial reporting permission required' USING ERRCODE='42501'; END IF;
 WITH balances AS (
  SELECT a.kind,a.code,coalesce(sum(j.debit),0) debit,coalesce(sum(j.credit),0) credit
  FROM public.bf_accounts a LEFT JOIN public.bf_journal j ON j.account_id=a.id AND j.cafe_id=p_cafe_id
  WHERE a.cafe_id=p_cafe_id GROUP BY a.kind,a.code
 ), totals AS (
  SELECT coalesce(sum(debit),0) debit,coalesce(sum(credit),0) credit,
   coalesce(sum(debit-credit) FILTER(WHERE kind='inventory'),0) inventory,
   coalesce(sum(credit-debit) FILTER(WHERE kind='revenue'),0) revenue,
   coalesce(sum(debit-credit) FILTER(WHERE code='5000'),0) cost,
   coalesce(sum(debit-credit) FILTER(WHERE kind='expense' AND code<>'5000'),0) expenses,
   coalesce(sum(debit-credit) FILTER(WHERE kind='vat_input'),0) vat_input,
   coalesce(sum(credit-debit) FILTER(WHERE kind='vat_output'),0) vat_output FROM balances
 ), quality AS (
  SELECT count(*) total,
   count(*) FILTER(WHERE l.cost_status NOT IN('known','estimated') AND NOT(l.cost_status='legacy' AND l.item_id IS NOT NULL AND l.cost>0)) unknown,
   count(*) FILTER(WHERE l.cost_status='estimated') estimated,
   count(*) FILTER(WHERE l.cost_status='legacy') legacy
  FROM public.bf_document_lines l JOIN public.bf_documents d ON d.id=l.document_id AND d.cafe_id=p_cafe_id
  LEFT JOIN public.bf_documents original ON original.id=d.reference_id AND original.cafe_id=p_cafe_id
  WHERE l.cafe_id=p_cafe_id AND (d.kind='sale' OR (d.kind='refund' AND original.kind='sale'))
 ) SELECT jsonb_build_object('generatedAt',now(),'debit',t.debit,'credit',t.credit,
  'inventoryLedger',t.inventory,'inventoryStock',(SELECT coalesce(sum(value),0) FROM public.bf_stock WHERE cafe_id=p_cafe_id),
  'revenue',t.revenue,'cost',t.cost,'otherExpenses',t.expenses,'bookProfit',t.revenue-t.cost-t.expenses,
  'vatInput',t.vat_input,'vatOutput',t.vat_output,'costLines',q.total,'unknownCostLines',q.unknown,'estimatedCostLines',q.estimated,'legacyCostLines',q.legacy,
  'closedThrough',(SELECT closed_through FROM public.bf_settings WHERE cafe_id=p_cafe_id)) INTO result FROM totals t CROSS JOIN quality q;
 RETURN result;
END $$;

CREATE FUNCTION public.brand_finance_journal_export(p_cafe_id uuid,p_from date DEFAULT NULL,p_to date DEFAULT NULL,p_query text DEFAULT '',p_as_of timestamptz DEFAULT NULL,p_after_time timestamptz DEFAULT NULL,p_after_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE cutoff timestamptz:=coalesce(p_as_of,statement_timestamp()); result jsonb;
BEGIN
 IF brand_finance_private.role_for(p_cafe_id) NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Financial reporting permission required' USING ERRCODE='42501'; END IF;
 IF length(coalesce(p_query,''))>120 OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>p_to) OR cutoff>statement_timestamp() OR ((p_after_time IS NULL)<>(p_after_id IS NULL)) THEN RAISE EXCEPTION 'Invalid export filter'; END IF;
 WITH filtered AS MATERIALIZED (
  SELECT j.id,j.created_at,j.document_id,d.number document_number,a.code account_code,a.name account_name,j.memo,j.debit,j.credit
  FROM public.bf_journal j JOIN public.bf_accounts a ON a.id=j.account_id AND a.cafe_id=p_cafe_id
  JOIN public.bf_documents d ON d.id=j.document_id AND d.cafe_id=p_cafe_id
  WHERE j.cafe_id=p_cafe_id AND j.created_at<=cutoff
   AND (p_from IS NULL OR j.created_at>=(p_from::timestamp AT TIME ZONE 'Asia/Riyadh'))
   AND (p_to IS NULL OR j.created_at<((p_to+1)::timestamp AT TIME ZONE 'Asia/Riyadh'))
   AND (coalesce(p_query,'')='' OR strpos(lower(a.name||' '||coalesce(j.memo,'')||' '||d.number::text),lower(p_query))>0)
 ), page AS (
  SELECT * FROM filtered WHERE p_after_time IS NULL OR (created_at,id)>(p_after_time,p_after_id) ORDER BY created_at,id LIMIT 500
 ) SELECT jsonb_build_object('asOf',cutoff,'total',(SELECT count(*) FROM filtered),
  'debit',(SELECT coalesce(sum(debit),0) FROM filtered),'credit',(SELECT coalesce(sum(credit),0) FROM filtered),
  'rows',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY created_at,id) FROM page p),'[]'::jsonb),
  'next',(SELECT jsonb_build_object('time',created_at,'id',id) FROM page ORDER BY created_at DESC,id DESC LIMIT 1)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_control_report(uuid),public.brand_finance_journal_export(uuid,date,date,text,timestamptz,timestamptz,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_control_report(uuid),public.brand_finance_journal_export(uuid,date,date,text,timestamptz,timestamptz,uuid) TO authenticated;
COMMIT;
