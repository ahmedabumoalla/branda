BEGIN;
-- Separate read surface for the administrative shifts screen. POS and all posting functions stay unchanged.
CREATE FUNCTION public.brand_finance_shift_sessions(p_cafe_id uuid,p_view text DEFAULT 'list',p_shift_id uuid DEFAULT NULL,p_filters jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text; q text; filter_account uuid; status_filter text; date_from date; date_to date; ordering text; off integer;
 sh public.bf_shifts%ROWTYPE; answer jsonb; count_rows bigint; shift_json jsonb; items jsonb;
BEGIN
 role_name:=brand_finance_private.role_for(p_cafe_id);
 IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_view IS NULL OR p_view NOT IN('list','summary','movements','invoices','refunds','payments','activity') OR jsonb_typeof(p_filters) IS DISTINCT FROM 'object' OR octet_length(p_filters::text)>2500 THEN RAISE EXCEPTION 'Invalid filters' USING ERRCODE='22023'; END IF;
 q:=lower(trim(coalesce(p_filters->>'query','')));filter_account:=nullif(p_filters->>'accountId','')::uuid;status_filter:=nullif(p_filters->>'status','');
 date_from:=nullif(p_filters->>'from','')::date;date_to:=nullif(p_filters->>'to','')::date;ordering:=coalesce(p_filters->>'sort','opened_desc');off:=coalesce((p_filters->>'offset')::integer,0);
 IF off NOT BETWEEN 0 AND 100000 OR length(q)>120 OR date_from>date_to OR (status_filter IS NOT NULL AND status_filter NOT IN('open','closed','handover')) OR ordering NOT IN('opened_desc','opened_asc','number_desc','number_asc','closed_desc','employee_asc') THEN RAISE EXCEPTION 'Invalid filters' USING ERRCODE='22023'; END IF;
 IF p_view<>'list' THEN
  SELECT * INTO sh FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND id=p_shift_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
 END IF;
 IF p_view IN('list','summary') THEN
  WITH filtered AS MATERIALIZED(
   SELECT s.*,a.name drawer_name,brand_finance_private.cash_employee_name(p_cafe_id,s.user_id) employee_name
   FROM public.bf_shifts s JOIN public.bf_accounts a ON a.cafe_id=s.cafe_id AND a.id=s.account_id
   WHERE s.cafe_id=p_cafe_id AND (p_view='list' OR s.id=p_shift_id)
   AND (filter_account IS NULL OR s.account_id=filter_account) AND (status_filter IS NULL OR s.status=status_filter)
   AND (date_from IS NULL OR s.opened_at>=date_from::timestamp AT TIME ZONE 'Asia/Riyadh')
   AND (date_to IS NULL OR s.opened_at<(date_to+1)::timestamp AT TIME ZONE 'Asia/Riyadh')
   AND (q='' OR position(q IN lower(concat(s.shift_number,' ',a.name,' ',brand_finance_private.cash_employee_name(p_cafe_id,s.user_id))))>0)
  ),paged AS MATERIALIZED(
   SELECT *,row_number() OVER(ORDER BY
    CASE WHEN ordering='number_asc' THEN shift_number END ASC,CASE WHEN ordering='number_desc' THEN shift_number END DESC,
    CASE WHEN ordering='employee_asc' THEN employee_name END ASC,CASE WHEN ordering='closed_desc' THEN closed_at END DESC NULLS LAST,
    CASE WHEN ordering='opened_asc' THEN opened_at END ASC,CASE WHEN ordering='opened_desc' THEN opened_at END DESC,id DESC) ordinal
   FROM filtered ORDER BY ordinal LIMIT 30 OFFSET CASE WHEN p_view='list' THEN off ELSE 0 END
  ),enriched AS(
   SELECT p.*,CASE WHEN p.status='closed' THEN p.expected_cash ELSE (SELECT coalesce(sum(j.debit-j.credit),0) FROM public.bf_journal j WHERE j.cafe_id=p_cafe_id AND j.account_id=p.account_id) END current_expected,
    d.last_seen_at,coalesce(d.pending_count,0) pending_count,coalesce(d.conflict_count,0) conflict_count,coalesce(d.device_count,0) device_count,
    CASE WHEN p.status='closed' THEN 'closed' WHEN p.supervisor_paused THEN 'paused' WHEN d.last_seen_at IS NULL OR d.last_seen_at<now()-interval '90 seconds' OR d.pending_count>0 THEN 'stalled' ELSE 'active' END monitor_status,
    coalesce(t.sales_total,0) sales_total,coalesce(t.refunded_total,0) refunded_total,coalesce(t.sales_total,0)-coalesce(t.refunded_total,0) net_sales
   FROM paged p
   LEFT JOIN LATERAL(SELECT max(last_seen_at) last_seen_at,sum(pending_count) pending_count,sum(conflict_count) conflict_count,count(*) device_count FROM public.bf_shift_devices WHERE cafe_id=p_cafe_id AND shift_id=p.id) d ON true
   LEFT JOIN LATERAL(SELECT sum(total) FILTER(WHERE kind='sale') sales_total,sum(total) FILTER(WHERE kind='refund') refunded_total FROM public.bf_documents WHERE cafe_id=p_cafe_id AND shift_id=p.id AND kind IN('sale','refund')) t ON true
  ) SELECT (SELECT count(*) FROM filtered),coalesce((SELECT jsonb_agg(to_jsonb(e)-'ordinal' ORDER BY ordinal) FROM enriched e),'[]') INTO count_rows,items;
  IF p_view='list' THEN RETURN jsonb_build_object('rows',items,'total',count_rows,'offset',off,'limit',30); END IF;
  shift_json:=items->0;
  RETURN jsonb_build_object('shift',shift_json,'analytics',public.brand_finance_shift_analytics(p_cafe_id,p_shift_id),'counts',jsonb_build_object(
   'invoices',(SELECT count(*) FROM public.bf_documents WHERE cafe_id=p_cafe_id AND shift_id=p_shift_id AND kind='sale'),
   'refunds',(SELECT count(*) FROM public.bf_documents WHERE cafe_id=p_cafe_id AND shift_id=p_shift_id AND kind='refund'),
   'movements',(SELECT count(*) FROM public.bf_documents WHERE cafe_id=p_cafe_id AND shift_id=p_shift_id AND kind IN('receipt','expense','purchase','transfer') AND CASE WHEN kind='purchase' THEN paid ELSE total END>0),
   'payments',(SELECT count(*) FROM public.bf_documents d WHERE d.cafe_id=p_cafe_id AND d.shift_id=p_shift_id AND ((d.kind='sale' AND d.paid>0) OR (d.kind='settlement' AND d.total>0 AND EXISTS(SELECT 1 FROM public.bf_documents i WHERE i.cafe_id=p_cafe_id AND i.id=d.reference_id AND i.kind='sale')))),
   'activity',1+CASE WHEN sh.closed_at IS NOT NULL THEN 1 ELSE 0 END+(SELECT count(*) FROM public.bf_shift_supervision WHERE cafe_id=p_cafe_id AND shift_id=p_shift_id)));
 END IF;
 IF p_view='activity' THEN
  WITH events AS(
   SELECT sh.id::text||':open' id,'open' action,sh.opened_at created_at,brand_finance_private.cash_employee_name(p_cafe_id,sh.user_id) actor,''::text note
   UNION ALL SELECT sh.id::text||':closed','closed',sh.closed_at,'غير مسجل',sh.note WHERE sh.closed_at IS NOT NULL
   UNION ALL SELECT id::text,action,created_at,actor_name,reason FROM public.bf_shift_supervision WHERE cafe_id=p_cafe_id AND shift_id=p_shift_id
  ),paged AS(SELECT * FROM events ORDER BY created_at DESC,id LIMIT 30 OFFSET off)
  SELECT (SELECT count(*) FROM events),coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'action',action,'createdAt',created_at,'actor',actor,'note',note) ORDER BY created_at DESC,id) FROM paged),'[]') INTO count_rows,items;
  RETURN jsonb_build_object('rows',items,'total',count_rows,'offset',off,'limit',30);
 END IF;
 WITH sources AS MATERIALIZED(
  SELECT d.* FROM public.bf_documents d WHERE d.cafe_id=p_cafe_id AND d.shift_id=p_shift_id AND
   CASE p_view WHEN 'invoices' THEN d.kind='sale' WHEN 'refunds' THEN d.kind='refund'
    WHEN 'movements' THEN d.kind IN('receipt','expense','purchase','transfer') AND CASE WHEN d.kind='purchase' THEN d.paid ELSE d.total END>0
    WHEN 'payments' THEN (d.kind='sale' AND d.paid>0) OR (d.kind='settlement' AND d.total>0 AND EXISTS(SELECT 1 FROM public.bf_documents i WHERE i.cafe_id=p_cafe_id AND i.id=d.reference_id AND i.kind='sale')) ELSE false END
 ),paged AS MATERIALIZED(SELECT * FROM sources ORDER BY created_at DESC,id LIMIT 30 OFFSET off)
 SELECT (SELECT count(*) FROM sources),coalesce((SELECT jsonb_agg(jsonb_build_object(
  'id',d.id,'number',d.number,'kind',d.kind,'createdAt',d.created_at,'customerName',coalesce(p.name,'عميل نقدي'),
  'creatorName',brand_finance_private.cash_employee_name(p_cafe_id,d.created_by),'total',d.total,'paid',CASE WHEN d.kind='purchase' THEN d.paid ELSE d.total END,
  'outstanding',CASE WHEN d.kind='sale' THEN (brand_finance_private.document_state(p_cafe_id,d.id)->>'outstanding')::numeric ELSE 0 END,
  'refundedTotal',CASE WHEN d.kind='sale' THEN (brand_finance_private.document_state(p_cafe_id,d.id)->>'refunded_total')::numeric ELSE 0 END,
  'accountName',coalesce(a.name,'غير مسجل'),'note',d.note,'invoiceId',inv.id,'invoiceNumber',coalesce(ext.display_number,inv.number::text),
  'payment',CASE WHEN p_view='payments' THEN brand_finance_private.invoice_payment_record(d::public.bf_documents,inv) ELSE NULL END
 ) ORDER BY d.created_at DESC,d.id) FROM paged d
 LEFT JOIN public.bf_documents inv ON inv.cafe_id=p_cafe_id AND inv.kind='sale' AND inv.id=CASE WHEN d.kind='sale' THEN d.id ELSE d.reference_id END
 LEFT JOIN public.bf_invoice_extensions ext ON ext.cafe_id=p_cafe_id AND ext.document_id=inv.id
 LEFT JOIN public.bf_parties p ON p.cafe_id=p_cafe_id AND p.id=coalesce(inv.party_id,d.party_id)
 LEFT JOIN public.bf_accounts a ON a.cafe_id=p_cafe_id AND a.id=d.account_id),'[]') INTO count_rows,items;
 RETURN jsonb_build_object('rows',items,'total',count_rows,'offset',off,'limit',30);
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_shift_sessions(uuid,text,uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_shift_sessions(uuid,text,uuid,jsonb) TO authenticated;
COMMIT;
