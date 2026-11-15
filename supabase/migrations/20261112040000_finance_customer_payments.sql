BEGIN;
CREATE INDEX bf_customer_payment_sources ON public.bf_documents(cafe_id,created_at DESC,id) WHERE (kind='sale' AND paid>0) OR (kind='settlement' AND total>0);

CREATE FUNCTION public.brand_finance_customer_payments(p_cafe_id uuid,p_id uuid DEFAULT NULL,p_filters jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text;source public.bf_documents%ROWTYPE;invoice public.bf_documents%ROWTYPE;payment jsonb;document jsonb;invoice_document jsonb;archived jsonb;meta jsonb;detail jsonb;
 filter_party uuid;filter_method text;filter_status text;q text;invoice_num text;payment_num text;date_from date;date_to date;ordering text;off integer;lim integer;answer jsonb;cnt bigint;
BEGIN
 role_name:=brand_finance_private.role_for(p_cafe_id);
 IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 IF p_id IS NOT NULL THEN
  SELECT * INTO source FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=p_id AND ((kind='sale' AND paid>0) OR (kind='settlement' AND total>0));
  IF NOT FOUND THEN RETURN NULL;END IF;
  SELECT * INTO invoice FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=CASE WHEN source.kind='sale' THEN source.id ELSE source.reference_id END AND kind='sale';
  IF NOT FOUND THEN RETURN NULL;END IF;
  payment:=brand_finance_private.invoice_payment_record(source,invoice);
  invoice_document:=brand_finance_private.invoice_detail_document(p_cafe_id,invoice.id);
  document:=CASE WHEN source.id=invoice.id THEN invoice_document ELSE brand_finance_private.invoice_detail_document(p_cafe_id,source.id) END;
  SELECT snapshot INTO archived FROM public.bf_company_invoices WHERE cafe_id=p_cafe_id AND document_id=invoice.id;
  SELECT metadata INTO meta FROM public.bf_invoice_management WHERE cafe_id=p_cafe_id AND document_id=invoice.id;
  meta:=coalesce(meta,'{}');IF NOT(meta ? 'delivery') AND archived->'delivery' IS NOT NULL THEN meta:=meta||jsonb_build_object('delivery',archived->'delivery');END IF;
  detail:=jsonb_build_object('document',invoice_document,'invoice',archived,'metadata',meta,'payments',jsonb_build_array(payment),
   'related',CASE WHEN source.id=invoice.id THEN '[]'::jsonb ELSE jsonb_build_array(document) END,'movements','[]'::jsonb,'journal','[]'::jsonb,'activity','[]'::jsonb,
   'customer',(SELECT jsonb_build_object('id',id,'name',name,'phone',phone,'email',email,'tax_number',tax_number,'details',details) FROM public.bf_parties WHERE cafe_id=p_cafe_id AND id=invoice.party_id),
   'warehouse',(SELECT jsonb_build_object('id',id,'name',name) FROM public.bf_warehouses WHERE cafe_id=p_cafe_id AND id=invoice.warehouse_id),
   'creator',jsonb_build_object('id',invoice.created_by,'name',coalesce((SELECT nullif(name,'') FROM public.bf_staff WHERE cafe_id=p_cafe_id AND user_id=invoice.created_by),(SELECT nullif(full_name,'') FROM public.profiles WHERE id=invoice.created_by),'مستخدم غير مسمى')),
   'paymentCollectors',coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',u.name) ORDER BY u.name,u.id) FROM (SELECT c.owner_user_id id,coalesce(nullif(p.full_name,''),'مالك العلامة') name FROM public.cafes c JOIN public.profiles p ON p.id=c.owner_user_id AND p.status='active' WHERE c.id=p_cafe_id UNION SELECT s.user_id,coalesce(nullif(s.name,''),nullif(p.full_name,''),'مستخدم غير مسمى') FROM public.bf_staff s JOIN public.profiles p ON p.id=s.user_id AND p.status='active' WHERE s.cafe_id=p_cafe_id AND s.active AND s.role IN('manager','accountant','cashier') AND s.user_id<>(SELECT owner_user_id FROM public.cafes WHERE id=p_cafe_id)) u),'[]'::jsonb));
  RETURN jsonb_build_object('document',document,'detail',detail,'payment',payment);
 END IF;
 IF jsonb_typeof(p_filters) IS DISTINCT FROM 'object' OR octet_length(p_filters::text)>2500 THEN RAISE EXCEPTION 'Invalid filters';END IF;
 filter_party:=nullif(p_filters->>'partyId','')::uuid;filter_method:=p_filters->>'method';filter_status:=p_filters->>'status';q:=lower(trim(coalesce(p_filters->>'query','')));
 invoice_num:=trim(coalesce(p_filters->>'invoiceNumber',''));payment_num:=trim(coalesce(p_filters->>'paymentNumber',''));ordering:=coalesce(p_filters->>'sort','newest');
 date_from:=nullif(p_filters->>'from','')::date;date_to:=nullif(p_filters->>'to','')::date;off:=coalesce((p_filters->>'offset')::integer,0);lim:=coalesce((p_filters->>'limit')::integer,30);
 IF off NOT BETWEEN 0 AND 100000 OR lim NOT BETWEEN 1 AND 100 OR length(q)>100 OR length(invoice_num)>40 OR payment_num!~'^\d{0,20}$' OR (filter_method IS NOT NULL AND filter_method NOT IN('cash','bank','pos','credit')) OR (filter_status IS NOT NULL AND filter_status NOT IN('completed','pending','deleted')) OR ordering NOT IN('newest','oldest','amount_desc','amount_asc') OR date_from>date_to THEN RAISE EXCEPTION 'راجع خيارات البحث والفترة المحددة';END IF;
 WITH candidates AS NOT MATERIALIZED(
 SELECT s.id,s.created_at,s.number,inv.id invoice_id,inv.number invoice_number,coalesce(ext.display_number,inv.number::text) invoice_display_number,inv.party_id,
 coalesce(p.name,'عميل نقدي') customer_name,s.id=inv.id initial,coalesce(m.status,'completed') status,
 coalesce((m.payload->>'amount')::numeric,CASE WHEN s.kind='sale' THEN s.paid ELSE s.total END) amount,
 coalesce((m.payload->>'date')::date,(s.created_at AT TIME ZONE 'Asia/Riyadh')::date) payment_date,
 coalesce((m.payload->>'accountId')::uuid,s.account_id) account_id,coalesce((m.payload->>'collectorId')::uuid,s.created_by) collector_id,
 CASE WHEN EXISTS(SELECT 1 FROM public.bf_customer_credit_events e WHERE e.cafe_id=s.cafe_id AND e.document_id=s.id AND e.action='apply') THEN 'credit' ELSE a.kind END method,
 CASE WHEN EXISTS(SELECT 1 FROM public.bf_customer_credit_events e WHERE e.cafe_id=s.cafe_id AND e.document_id=s.id AND e.action='apply') THEN 'رصيد العميل' ELSE coalesce(a.name,'غير مسجل') END account_name,
 coalesce(m.payload->>'reference','') reference
 FROM public.bf_documents s JOIN public.bf_documents inv ON inv.cafe_id=s.cafe_id AND inv.kind='sale' AND inv.id=CASE WHEN s.kind='sale' THEN s.id ELSE s.reference_id END
 LEFT JOIN public.bf_invoice_payments m ON m.cafe_id=s.cafe_id AND m.source_id=s.id
 LEFT JOIN public.bf_parties p ON p.cafe_id=inv.cafe_id AND p.id=inv.party_id
 LEFT JOIN public.bf_invoice_extensions ext ON ext.cafe_id=inv.cafe_id AND ext.document_id=inv.id
 LEFT JOIN public.bf_accounts a ON a.cafe_id=s.cafe_id AND a.id=coalesce((m.payload->>'accountId')::uuid,s.account_id)
 WHERE s.cafe_id=p_cafe_id AND ((s.kind='sale' AND s.paid>0) OR (s.kind='settlement' AND s.total>0)) AND (filter_party IS NULL OR inv.party_id=filter_party)
 ),matching AS MATERIALIZED(
 SELECT * FROM candidates c WHERE (CASE WHEN filter_status IS NULL THEN c.status<>'deleted' ELSE c.status=filter_status END)
 AND (filter_method IS NULL OR c.method=filter_method) AND (date_from IS NULL OR c.payment_date>=date_from) AND (date_to IS NULL OR c.payment_date<=date_to)
 AND (invoice_num='' OR lower(c.invoice_display_number)=lower(invoice_num) OR (invoice_num~'^\d+$' AND c.invoice_number::numeric=CASE WHEN invoice_num~'^\d+$' THEN invoice_num::numeric ELSE NULL END))
 AND (payment_num='' OR (NOT c.initial AND c.number::numeric=CASE WHEN payment_num<>'' THEN payment_num::numeric ELSE NULL END))
 AND (q='' OR position(q IN lower(c.customer_name||' '||c.invoice_display_number||' '||c.reference||' '||CASE WHEN c.initial THEN '' ELSE c.number::text END))>0)
 ),page AS MATERIALIZED(
 SELECT *,row_number() OVER(ORDER BY CASE WHEN ordering='amount_desc' THEN amount END DESC,CASE WHEN ordering='amount_asc' THEN amount END ASC,CASE WHEN ordering='oldest' THEN payment_date END ASC,CASE WHEN ordering<>'oldest' THEN payment_date END DESC,created_at DESC,id) ordinal FROM matching
 ORDER BY ordinal LIMIT lim OFFSET off
 ),invoice_states AS MATERIALIZED(SELECT d.id,d.total,brand_finance_private.document_state(p_cafe_id,d.id) state FROM public.bf_documents d JOIN(SELECT DISTINCT invoice_id FROM page) ids ON ids.invoice_id=d.id WHERE d.cafe_id=p_cafe_id)
 SELECT (SELECT count(*) FROM matching),coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'invoiceId',x.invoice_id,'initial',x.initial,'number',CASE WHEN x.initial THEN NULL ELSE x.number END,'invoiceNumber',x.invoice_number,'invoiceDisplayNumber',x.invoice_display_number,
 'invoiceStatus',CASE WHEN coalesce((i.state->>'refunded')::boolean,false) AND (i.state->>'refunded_total')::numeric>0 THEN 'returned' WHEN (i.state->>'outstanding')::numeric<=0 THEN 'paid' WHEN (i.state->>'outstanding')::numeric<greatest(i.total-(i.state->>'refunded_total')::numeric,0) THEN 'partial' ELSE 'unpaid' END,
 'customerId',x.party_id,'customerName',x.customer_name,'amount',x.amount,'effectiveAmount',CASE WHEN x.status='completed' THEN x.amount ELSE 0 END,'date',x.payment_date,'status',x.status,'method',x.method,'accountId',x.account_id,'accountName',x.account_name,'reference',x.reference,
 'collectorName',coalesce((SELECT nullif(name,'') FROM public.bf_staff WHERE cafe_id=p_cafe_id AND user_id=x.collector_id),(SELECT nullif(full_name,'') FROM public.profiles WHERE id=x.collector_id),'مستخدم غير مسمى')) ORDER BY x.ordinal) FROM page x JOIN invoice_states i ON i.id=x.invoice_id),'[]') INTO cnt,answer;
 RETURN jsonb_build_object('items',answer,'total',cnt,'offset',off,'limit',lim);
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_customer_payments(uuid,uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_customer_payments(uuid,uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
