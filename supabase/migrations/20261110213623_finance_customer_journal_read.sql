BEGIN;
CREATE INDEX bf_quotes_customer_history ON public.bf_quotes(cafe_id,(payload#>>'{document,invoice,partyId}'),updated_at DESC,id);

CREATE FUNCTION brand_finance_private.customer_timeline(p_cafe uuid,p_customer uuid)
RETURNS TABLE(id text,kind text,action text,event_at timestamptz,actor_id uuid,document_id uuid,quote_id uuid)
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT 'document:'||d.id,d.kind,CASE d.kind WHEN 'sale' THEN 'إنشاء فاتورة' WHEN 'settlement' THEN 'تسجيل دفعة' ELSE 'تسجيل مرتجع' END,d.created_at,d.created_by,d.id,NULL::uuid
 FROM public.bf_documents d WHERE d.cafe_id=p_cafe AND d.party_id=p_customer AND d.kind IN('sale','settlement','refund')
 UNION ALL
 SELECT 'activity:'||a.id,'activity',a.action,a.created_at,a.created_by,a.document_id,NULL::uuid
 FROM public.bf_invoice_activity a JOIN public.bf_documents d ON d.cafe_id=a.cafe_id AND d.id=a.document_id WHERE a.cafe_id=p_cafe AND d.party_id=p_customer
 UNION ALL
 SELECT 'quote-created:'||q.id,'quote','إنشاء عرض سعر',q.created_at,q.created_by,NULL::uuid,q.id
 FROM public.bf_quotes q WHERE q.cafe_id=p_cafe AND q.payload#>>'{document,invoice,partyId}'=p_customer::text
 UNION ALL
 SELECT 'quote-updated:'||q.id,'quote','تحديث عرض سعر',q.updated_at,q.updated_by,NULL::uuid,q.id
 FROM public.bf_quotes q WHERE q.cafe_id=p_cafe AND q.payload#>>'{document,invoice,partyId}'=p_customer::text AND q.updated_at>q.created_at
 UNION ALL
 SELECT 'message:'||m.id,'message',CASE WHEN m.provider_status='read' THEN 'قراءة رسالة الفاتورة' WHEN m.provider_status='delivered' THEN 'تسليم رسالة الفاتورة' WHEN m.provider_status='sent' THEN 'إرسال رسالة الفاتورة' ELSE 'قبول إرسال رسالة الفاتورة' END,coalesce(m.provider_confirmed_at,m.finished_at,m.created_at),NULL::uuid,d.id,NULL::uuid
 FROM public.bf_customer_message_jobs m JOIN public.bf_documents d ON d.cafe_id=m.cafe_id AND d.id=m.document_id
 WHERE m.cafe_id=p_cafe AND d.party_id=p_customer AND (m.state='queued' OR m.provider_status IN('sent','delivered','read'))
$$;
REVOKE ALL ON FUNCTION brand_finance_private.customer_timeline(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.brand_finance_customer_detail(p_cafe_id uuid,p_id uuid,p_tab text DEFAULT 'details',p_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE party public.bf_parties%ROWTYPE; result jsonb; start_row integer;
BEGIN
 IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 400001 OR p_tab IS NULL OR p_tab NOT IN('details','invoices','payments','quotes','messages','balance','timeline') THEN RAISE EXCEPTION 'Invalid customer page' USING ERRCODE='22023'; END IF;
 SELECT * INTO party FROM public.bf_parties WHERE cafe_id=p_cafe_id AND id=p_id AND kind='customer';
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer unavailable' USING ERRCODE='42501'; END IF;
 start_row:=(p_page-1)*25;
 WITH invoices AS MATERIALIZED (
  SELECT d AS source,brand_finance_private.document_state(p_cafe_id,d.id) state FROM public.bf_documents d WHERE d.cafe_id=p_cafe_id AND d.party_id=p_id AND d.kind='sale'
 ), payments AS MATERIALIZED (
  SELECT s AS source,i.source AS invoice,coalesce(o.payload->>'date',(s.created_at AT TIME ZONE 'Asia/Riyadh')::date::text) payment_date,(brand_finance_private.payment_document(s)).paid amount
  FROM invoices i JOIN public.bf_documents s ON s.cafe_id=p_cafe_id AND ((s.id=(i.source).id AND s.paid>0) OR (s.reference_id=(i.source).id AND s.kind='settlement' AND s.total>0))
  LEFT JOIN public.bf_invoice_payments o ON o.cafe_id=s.cafe_id AND o.source_id=s.id WHERE coalesce(o.status,'completed')<>'deleted'
 ), quotes AS MATERIALIZED (
  SELECT q AS source FROM public.bf_quotes q WHERE q.cafe_id=p_cafe_id AND q.payload#>>'{document,invoice,partyId}'=p_id::text
 ), messages AS MATERIALIZED (
  SELECT m.id,m.document_id,d.number,m.state,m.provider_status,m.created_at,m.finished_at FROM public.bf_customer_message_jobs m JOIN public.bf_documents d ON d.cafe_id=m.cafe_id AND d.id=m.document_id
  WHERE m.cafe_id=p_cafe_id AND d.party_id=p_id AND (m.state='queued' OR m.provider_status IN('sent','delivered','read'))
 ), balances AS MATERIALIZED (
  SELECT j.id,j.document_id,d.number,d.kind,j.created_at,j.memo,j.debit,j.credit,sum(j.debit-j.credit) OVER(ORDER BY j.created_at,j.id ROWS UNBOUNDED PRECEDING) running_balance
  FROM public.bf_journal j JOIN public.bf_accounts a ON a.cafe_id=j.cafe_id AND a.id=j.account_id AND a.kind='receivable' JOIN public.bf_documents d ON d.cafe_id=j.cafe_id AND d.id=j.document_id
  WHERE j.cafe_id=p_cafe_id AND j.party_id=p_id
 ), timeline AS MATERIALIZED (
  SELECT * FROM brand_finance_private.customer_timeline(p_cafe_id,p_id)
 ), counts AS (
  SELECT jsonb_build_object('invoices',(SELECT count(*) FROM invoices),'payments',(SELECT count(*) FROM payments),'quotes',(SELECT count(*) FROM quotes),'messages',(SELECT count(*) FROM messages),'balance',(SELECT count(*) FROM balances),'timeline',(SELECT count(*) FROM timeline)) value
 )
 SELECT jsonb_build_object('customer',to_jsonb(party)-'cafe_id'||jsonb_build_object('balance',coalesce((SELECT sum(debit-credit) FROM balances),0)),
  'tab',p_tab,'page',p_page,'pageSize',25,'total',coalesce((counts.value->>p_tab)::bigint,0),'hasMore',coalesce((counts.value->>p_tab)::bigint,0)>start_row+25,'counts',counts.value,
  'summary',jsonb_build_object('invoiceTotal',coalesce((SELECT sum((source).total) FROM invoices),0),'refundedTotal',coalesce((SELECT sum((state->>'refunded_total')::numeric) FROM invoices),0),
   'outstanding',coalesce((SELECT sum((state->>'outstanding')::numeric) FROM invoices),0),'balance',coalesce((SELECT sum(debit-credit) FROM balances),0),'collected',coalesce((SELECT sum(amount) FROM payments),0),
   'unpaidCount',(SELECT count(*) FROM invoices WHERE (state->>'outstanding')::numeric>0),
   'lastInvoice',(SELECT jsonb_build_object('id',(source).id,'number',(source).number,'date',(source).created_at,'total',(source).total,'outstanding',state->'outstanding') FROM invoices ORDER BY (source).created_at DESC,(source).id DESC LIMIT 1),
   'lastPayment',(SELECT brand_finance_private.invoice_payment_record(source,invoice)||jsonb_build_object('invoiceNumber',(invoice).number) FROM payments ORDER BY payment_date DESC,(source).created_at DESC,(source).id DESC LIMIT 1),
   'lastMessage',(SELECT jsonb_build_object('id',id,'invoiceId',document_id,'invoiceNumber',number,'status',state,'deliveryStatus',provider_status,'createdAt',created_at,'finishedAt',finished_at) FROM messages ORDER BY coalesce(finished_at,created_at) DESC,id DESC LIMIT 1)),
  'invoices',CASE WHEN p_tab='invoices' THEN coalesce((SELECT jsonb_agg(brand_finance_private.invoice_detail_document(p_cafe_id,(source).id) ORDER BY (source).created_at DESC,(source).id DESC) FROM (SELECT * FROM invoices ORDER BY (source).created_at DESC,(source).id DESC OFFSET start_row LIMIT 25) page),'[]'::jsonb) ELSE '[]'::jsonb END,
  'payments',CASE WHEN p_tab='payments' THEN coalesce((SELECT jsonb_agg(brand_finance_private.invoice_payment_record(source,invoice)||jsonb_build_object('invoiceNumber',(invoice).number) ORDER BY payment_date DESC,(source).created_at DESC,(source).id DESC) FROM (SELECT * FROM payments ORDER BY payment_date DESC,(source).created_at DESC,(source).id DESC OFFSET start_row LIMIT 25) page),'[]'::jsonb) ELSE '[]'::jsonb END,
  'quotes',CASE WHEN p_tab='quotes' THEN coalesce((SELECT jsonb_agg(brand_finance_private.quote_record(source) ORDER BY (source).updated_at DESC,(source).id DESC) FROM (SELECT * FROM quotes ORDER BY (source).updated_at DESC,(source).id DESC OFFSET start_row LIMIT 25) page),'[]'::jsonb) ELSE '[]'::jsonb END,
  'messages',CASE WHEN p_tab='messages' THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'invoiceId',document_id,'invoiceNumber',number,'status',state,'deliveryStatus',provider_status,'createdAt',created_at,'finishedAt',finished_at) ORDER BY coalesce(finished_at,created_at) DESC,id DESC) FROM (SELECT * FROM messages ORDER BY coalesce(finished_at,created_at) DESC,id DESC OFFSET start_row LIMIT 25) page),'[]'::jsonb) ELSE '[]'::jsonb END,
  'balance',CASE WHEN p_tab='balance' THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'documentId',document_id,'number',number,'kind',kind,'date',created_at,'memo',memo,'debit',debit,'credit',credit,'runningBalance',running_balance) ORDER BY created_at DESC,id DESC) FROM (SELECT * FROM balances ORDER BY created_at DESC,id DESC OFFSET start_row LIMIT 25) page),'[]'::jsonb) ELSE '[]'::jsonb END,
  'timeline',CASE WHEN p_tab='timeline' THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'action',action,'date',event_at,'actor',CASE WHEN actor_id IS NULL THEN 'غير مسجل' ELSE brand_finance_private.treasury_actor_name(p_cafe_id,actor_id) END,'documentId',document_id,'quoteId',quote_id) ORDER BY event_at DESC,id DESC) FROM (SELECT * FROM timeline ORDER BY event_at DESC,id DESC OFFSET start_row LIMIT 25) page),'[]'::jsonb) ELSE '[]'::jsonb END
 ) INTO result FROM counts;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_customer_detail(uuid,uuid,text,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_customer_detail(uuid,uuid,text,integer) TO authenticated;

CREATE FUNCTION public.brand_finance_journal_detail(p_cafe_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE source public.bf_documents%ROWTYPE; invoice_id uuid; payment_id uuid; result jsonb;
BEGIN
 IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO source FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Journal document unavailable' USING ERRCODE='42501'; END IF;
 IF source.kind='sale' THEN invoice_id:=source.id;IF source.paid>0 THEN payment_id:=source.id;END IF;
 ELSIF source.kind IN('settlement','refund') AND EXISTS(SELECT 1 FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=source.reference_id AND kind='sale') THEN invoice_id:=source.reference_id;payment_id:=source.id;
 ELSE SELECT e.invoice_id,e.source_id INTO invoice_id,payment_id FROM public.bf_invoice_payment_events e WHERE e.cafe_id=p_cafe_id AND e.correction_id=p_id LIMIT 1;
 END IF;
 WITH entries AS MATERIALIZED (
  SELECT j.id,j.account_id,a.code,a.name,j.debit,j.credit,j.memo,j.party_id,p.name party_name FROM public.bf_journal j JOIN public.bf_accounts a ON a.cafe_id=j.cafe_id AND a.id=j.account_id LEFT JOIN public.bf_parties p ON p.cafe_id=j.cafe_id AND p.id=j.party_id WHERE j.cafe_id=p_cafe_id AND j.document_id=p_id
 ), related AS MATERIALIZED (
  SELECT d.id,d.number,d.kind,d.created_at,d.note FROM public.bf_documents d WHERE d.cafe_id=p_cafe_id AND d.id<>p_id AND (d.id=source.reference_id OR d.reference_id=p_id OR d.id IN(SELECT e.correction_id FROM public.bf_invoice_payment_events e WHERE e.cafe_id=p_cafe_id AND e.source_id=payment_id))
 ), activity AS MATERIALIZED (
  SELECT 'document:'||source.id id,'إنشاء المستند' action,source.created_at,source.created_by
  UNION ALL
  SELECT 'payment:'||e.id,CASE WHEN e.action='delete' THEN 'حذف الدفعة بتصحيح محاسبي' WHEN e.correction_id IS NOT NULL THEN 'تصحيح تحصيل الدفعة' ELSE 'تعديل بيانات الدفعة' END,e.created_at,e.created_by FROM public.bf_invoice_payment_events e WHERE e.cafe_id=p_cafe_id AND e.source_id=payment_id
 )
 SELECT jsonb_build_object('document',jsonb_build_object('id',source.id,'number',source.number,'kind',source.kind,'createdAt',source.created_at,'note',source.note,'total',source.total,'referenceId',source.reference_id,'creatorId',source.created_by,'creatorName',brand_finance_private.treasury_actor_name(p_cafe_id,source.created_by)),
  'journal',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'accountId',account_id,'accountCode',code,'accountName',name,'debit',debit,'credit',credit,'memo',memo,'partyId',party_id,'partyName',party_name) ORDER BY id) FROM (SELECT * FROM entries ORDER BY id LIMIT 2000) page),'[]'::jsonb),
  'totals',jsonb_build_object('debit',coalesce((SELECT sum(debit) FROM entries),0),'credit',coalesce((SELECT sum(credit) FROM entries),0)),'journalCount',(SELECT count(*) FROM entries),'journalTruncated',(SELECT count(*)>2000 FROM entries),
  'invoiceId',invoice_id,'sourcePaymentId',payment_id,
  'related',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'number',number,'kind',kind,'createdAt',created_at,'note',note) ORDER BY created_at DESC,id DESC) FROM (SELECT * FROM related ORDER BY created_at DESC,id DESC LIMIT 100) page),'[]'::jsonb),'relatedCount',(SELECT count(*) FROM related),'relatedTruncated',(SELECT count(*)>100 FROM related),
  'activity',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'action',action,'createdAt',created_at,'actor',brand_finance_private.treasury_actor_name(p_cafe_id,created_by)) ORDER BY created_at DESC,id DESC) FROM (SELECT * FROM activity ORDER BY created_at DESC,id DESC LIMIT 100) page),'[]'::jsonb),'activityCount',(SELECT count(*) FROM activity),'activityTruncated',(SELECT count(*)>100 FROM activity)
 ) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_journal_detail(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_journal_detail(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
