BEGIN;
DO $$BEGIN
 IF to_regclass('public.erp_contracting_advance_invoices') IS NULL OR to_regclass('public.erp_purchase_credit_postings') IS NULL THEN
  RAISE EXCEPTION 'Apply the actual advance invoice and purchase credit note contracts first';
 END IF;
END $$;
ALTER FUNCTION erp_reports_private.financial_facts(uuid,text,date,date) RENAME TO financial_facts_before_commercial_adjustments;
CREATE FUNCTION erp_reports_private.financial_facts(c uuid,s text,f date,t date) RETURNS SETOF jsonb LANGUAGE plpgsql SET search_path='' AS $$BEGIN
 IF s='sales-lines' THEN
  RETURN QUERY SELECT r.value FROM erp_reports_private.financial_facts_before_commercial_adjustments(c,s,f,t) AS r(value)
   WHERE NOT EXISTS(SELECT 1 FROM public.bf_document_lines l JOIN public.bf_documents d ON d.cafe_id=l.cafe_id AND d.id=l.document_id
    JOIN public.erp_contracting_advance_invoices a ON a.cafe_id=d.cafe_id AND a.invoice_id IN(d.id,d.reference_id)
    WHERE l.cafe_id=c AND l.id::text=r.value->>'id');
 ELSIF s='purchase-documents' THEN
  RETURN QUERY SELECT CASE WHEN n.id IS NULL THEN r.value ELSE r.value||jsonb_build_object(
   'number',n.code,'kind','إشعار دائن مشتريات','href','/dashboard/system/purchases/credit-notes/'||n.id,
   'status',CASE WHEN h.reversal_document_id IS NOT NULL THEN 'reversal' WHEN (r.value->>'outstanding')::numeric=0 THEN 'paid'
    WHEN (r.value->>'outstanding')::numeric<(r.value->>'amount')::numeric THEN 'partial' ELSE 'unpaid' END,
   'paid',CASE WHEN h.reversal_document_id IS NOT NULL THEN 0 ELSE (r.value->>'amount')::numeric-(r.value->>'outstanding')::numeric END
  ) END
  FROM erp_reports_private.financial_facts_before_commercial_adjustments(c,s,f,t) AS r(value)
  LEFT JOIN public.erp_purchase_credit_postings h ON h.cafe_id=c AND h.document_id::text=r.value->>'id'
  LEFT JOIN public.erp_purchase_credit_notes n ON n.cafe_id=h.cafe_id AND n.id=h.note_id;
 ELSE RETURN QUERY SELECT * FROM erp_reports_private.financial_facts_before_commercial_adjustments(c,s,f,t);
 END IF;
END $$;
REVOKE ALL ON FUNCTION erp_reports_private.financial_facts(uuid,text,date,date),erp_reports_private.financial_facts_before_commercial_adjustments(uuid,text,date,date) FROM PUBLIC,anon,authenticated,service_role;
-- Keep tax invoice/payment-position sources complete. Business revenue excludes advance liabilities.
INSERT INTO erp_reports_private.sources(id,title,domain,columns)
 SELECT 'business-sales','مبيعات الأعمال دون الدفعات المقدمة',domain,columns FROM erp_reports_private.sources WHERE id='sales';
ALTER FUNCTION erp_reports_private.facts(uuid,text,date,date) RENAME TO facts_before_commercial_adjustments;
CREATE FUNCTION erp_reports_private.facts(c uuid,s text,f date,t date) RETURNS SETOF jsonb LANGUAGE plpgsql SET search_path='' AS $$BEGIN
 IF s='business-sales' THEN
  PERFORM erp_reports_private.authorize_source(c,s);
  RETURN QUERY SELECT r.value FROM erp_reports_private.facts_before_commercial_adjustments(c,'sales',f,t) AS r(value)
   WHERE NOT EXISTS(SELECT 1 FROM public.erp_contracting_advance_invoices a WHERE a.cafe_id=c AND a.invoice_id::text=r.value->>'id');
 ELSE RETURN QUERY SELECT * FROM erp_reports_private.facts_before_commercial_adjustments(c,s,f,t);
 END IF;
END $$;
REVOKE ALL ON FUNCTION erp_reports_private.facts(uuid,text,date,date),erp_reports_private.facts_before_commercial_adjustments(uuid,text,date,date) FROM PUBLIC,anon,authenticated,service_role;
UPDATE erp_reports_private.catalog SET source='business-sales',definition=jsonb_set(definition,'{source}','"business-sales"') WHERE id IN('sales','customer-sales');
ALTER FUNCTION erp_reports_private.customer_facts(uuid,text,date,date) RENAME TO customer_facts_before_advance_invoices;
CREATE FUNCTION erp_reports_private.customer_facts(c uuid,s text,f date,t date) RETURNS SETOF jsonb LANGUAGE plpgsql SET search_path='' AS $$BEGIN
 RETURN QUERY SELECT * FROM erp_reports_private.customer_facts_before_advance_invoices(c,s,f,t);
 IF s='customer-credits' THEN
  RETURN QUERY SELECT erp_reports_private.fact('advance-invoice:'||d.id::text,NULL,jsonb_build_object(
   'number',coalesce(e.display_number,d.number::text),'customer',p.name,'customerId',p.id,'name',p.name,
   'amount',(state->>'available')::numeric,'remaining',(state->>'available')::numeric,
   'status',CASE WHEN p.active THEN 'active' ELSE 'inactive' END,
   'href','/dashboard/finance?section=sales&view=invoice&invoice='||d.id)||erp_reports_private.document_branch(c,to_jsonb(d)))
  FROM public.erp_contracting_advance_invoices a JOIN public.bf_documents d ON d.cafe_id=a.cafe_id AND d.id=a.invoice_id
  JOIN public.bf_parties p ON p.cafe_id=d.cafe_id AND p.id=d.party_id
  LEFT JOIN public.bf_invoice_extensions e ON e.cafe_id=d.cafe_id AND e.document_id=d.id
  CROSS JOIN LATERAL(SELECT erp_settings_private.advance_state(c,d.id) state) q
  WHERE a.cafe_id=c AND (state->>'available')::numeric>0;
 END IF;
END $$;
REVOKE ALL ON FUNCTION erp_reports_private.customer_facts(uuid,text,date,date),erp_reports_private.customer_facts_before_advance_invoices(uuid,text,date,date) FROM PUBLIC,anon,authenticated,service_role;
UPDATE erp_reports_private.catalog SET definition=jsonb_set(definition,'{basis}',to_jsonb((coalesce(definition->>'basis','')||' — تستبعد فواتير الدفعات المقدمة من إيراد الأعمال وتبقى تحصيلاتها في تقارير النقد')::text)) WHERE source IN('business-sales','sales-lines');
UPDATE erp_reports_private.catalog SET definition=jsonb_set(definition,'{basis}',to_jsonb((coalesce(definition->>'basis','')||' — تظهر الإشعارات الدائنة للمشتريات بأرقامها وسدادها مع الاحتفاظ بقيود الإصدار المعكوسة')::text)) WHERE source='purchase-documents';
NOTIFY pgrst,'reload schema';
UPDATE erp_reports_private.catalog SET definition=jsonb_set(definition,'{basis}',to_jsonb('الرصيد المتاح الحالي للعميل ويشمل فواتير الدفعات المقدمة المحصلة بعد الإشعارات والتخصيصات والعكس ولا يمثل رصيدًا تاريخيًا'::text)) WHERE source='customer-credits';
COMMIT;
