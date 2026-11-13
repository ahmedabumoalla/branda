BEGIN;
-- Advance invoices retain the canonical issuer, receivable and payment engine
-- Their net amount is a customer liability, never earned sales revenue
CREATE TABLE public.erp_contracting_advance_drafts(cafe_id uuid NOT NULL,draft_id uuid NOT NULL,contract_id uuid,PRIMARY KEY(cafe_id,draft_id),FOREIGN KEY(cafe_id,contract_id) REFERENCES public.erp_contracting_documents(cafe_id,id));
CREATE TABLE public.erp_contracting_advance_invoices(
 cafe_id uuid NOT NULL,invoice_id uuid NOT NULL,draft_id uuid NOT NULL,project_id uuid NOT NULL,contract_id uuid,party_id uuid NOT NULL,
 net numeric(18,2) NOT NULL CHECK(net>0),tax numeric(18,2) NOT NULL CHECK(tax>=0),total numeric(18,2) NOT NULL CHECK(total=net+tax),tax_rate numeric(5,2) NOT NULL CHECK(tax_rate IN(0,15)),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(cafe_id,invoice_id),UNIQUE(cafe_id,draft_id),FOREIGN KEY(cafe_id,invoice_id) REFERENCES public.bf_documents(cafe_id,id) DEFERRABLE INITIALLY DEFERRED,FOREIGN KEY(cafe_id,project_id) REFERENCES public.erp_contracting_documents(cafe_id,id),FOREIGN KEY(cafe_id,contract_id) REFERENCES public.erp_contracting_documents(cafe_id,id),FOREIGN KEY(cafe_id,party_id) REFERENCES public.bf_parties(cafe_id,id)
);
CREATE TABLE public.erp_contracting_advance_assignments(cafe_id uuid NOT NULL,invoice_id uuid NOT NULL,contract_id uuid,revision integer NOT NULL DEFAULT 1,PRIMARY KEY(cafe_id,invoice_id),FOREIGN KEY(cafe_id,invoice_id) REFERENCES public.erp_contracting_advance_invoices(cafe_id,invoice_id),FOREIGN KEY(cafe_id,contract_id) REFERENCES public.erp_contracting_documents(cafe_id,id));
ALTER TABLE public.erp_contracting_advance_assignments ENABLE ROW LEVEL SECURITY;REVOKE ALL ON public.erp_contracting_advance_assignments FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cancellation_archive_guard BEFORE INSERT OR UPDATE OR DELETE ON public.erp_contracting_advance_assignments FOR EACH ROW EXECUTE FUNCTION brand_cancellation_private.guard_archive();
CREATE POLICY cancellation_archive_scope ON public.erp_contracting_advance_assignments AS RESTRICTIVE FOR ALL TO anon,authenticated USING(public.brand_account_not_cancelled(cafe_id) OR public.is_platform_admin()) WITH CHECK(public.brand_account_not_cancelled(cafe_id));
CREATE TABLE public.erp_contracting_advance_allocations(
 cafe_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),advance_id uuid NOT NULL,invoice_id uuid NOT NULL,document_id uuid NOT NULL,amount numeric(18,2) NOT NULL CHECK(amount>0),net numeric(18,2) NOT NULL CHECK(net>0),tax numeric(18,2) NOT NULL CHECK(tax>=0 AND amount=net+tax),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(cafe_id,id),UNIQUE(cafe_id,document_id),FOREIGN KEY(cafe_id,advance_id) REFERENCES public.erp_contracting_advance_invoices(cafe_id,invoice_id),FOREIGN KEY(cafe_id,invoice_id) REFERENCES public.bf_documents(cafe_id,id),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id)
);
CREATE TABLE public.erp_contracting_advance_reversals(
 cafe_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),allocation_id uuid NOT NULL,reverse_id uuid NOT NULL,document_id uuid NOT NULL,amount numeric(18,2) NOT NULL CHECK(amount>0),net numeric(18,2) NOT NULL CHECK(net>0),tax numeric(18,2) NOT NULL CHECK(tax>=0 AND amount=net+tax),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(cafe_id,id),UNIQUE(cafe_id,allocation_id,reverse_id),FOREIGN KEY(cafe_id,allocation_id) REFERENCES public.erp_contracting_advance_allocations(cafe_id,id),FOREIGN KEY(cafe_id,reverse_id) REFERENCES public.erp_contracting_documents(cafe_id,id),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id)
);
CREATE INDEX erp_advance_project ON public.erp_contracting_advance_invoices(cafe_id,project_id,contract_id);
CREATE INDEX erp_advance_party ON public.erp_contracting_advance_invoices(cafe_id,party_id);
CREATE INDEX erp_advance_allocation_source ON public.erp_contracting_advance_allocations(cafe_id,advance_id);
CREATE INDEX erp_advance_allocation_target ON public.erp_contracting_advance_allocations(cafe_id,invoice_id);
CREATE INDEX erp_advance_reversal_document ON public.erp_contracting_advance_reversals(cafe_id,document_id);
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['erp_contracting_advance_drafts','erp_contracting_advance_invoices','erp_contracting_advance_allocations','erp_contracting_advance_reversals'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
 EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable()',t);
 EXECUTE format('CREATE TRIGGER cancellation_archive_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION brand_cancellation_private.guard_archive()',t);
 EXECUTE format('CREATE POLICY cancellation_archive_scope ON public.%I AS RESTRICTIVE FOR ALL TO anon,authenticated USING(public.brand_account_not_cancelled(cafe_id) OR public.is_platform_admin()) WITH CHECK(public.brand_account_not_cancelled(cafe_id))',t);
END LOOP;END $$;
INSERT INTO erp_settings_private.number_contexts VALUES('contracting_advance_invoice','فاتورة دفعة مقدمة','bf_invoice_extensions','display_number',NULL,NULL);

CREATE FUNCTION erp_settings_private.advance_used(c uuid,a uuid) RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce((SELECT sum(amount) FROM public.erp_contracting_advance_allocations WHERE cafe_id=c AND advance_id=a),0)-coalesce((SELECT sum(r.amount) FROM public.erp_contracting_advance_reversals r JOIN public.erp_contracting_advance_allocations x ON x.cafe_id=r.cafe_id AND x.id=r.allocation_id WHERE x.cafe_id=c AND x.advance_id=a),0)
$$;
CREATE FUNCTION erp_settings_private.advance_available(c uuid,a uuid) RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce((brand_finance_private.payment_document(d)).paid,0)+coalesce((SELECT sum((brand_finance_private.payment_document(s)).total) FROM public.bf_documents s WHERE s.cafe_id=c AND s.reference_id=a AND s.kind='settlement'),0)-coalesce((SELECT sum(n.total) FROM public.bf_credit_notes n WHERE n.cafe_id=c AND n.source_invoice_id=a AND n.status='issued'),0)-erp_settings_private.advance_used(c,a) FROM public.bf_documents d WHERE d.cafe_id=c AND d.id=a
$$;

CREATE FUNCTION erp_settings_private.prepare_advance(c uuid,doc uuid,draft uuid,source uuid,inv jsonb,rows jsonb,net numeric,tax numeric,total numeric,currency text,fx numeric,shipping jsonb,adjustment uuid,issued timestamptz) RETURNS text LANGUAGE plpgsql SET search_path='' AS $$
DECLARE link public.erp_contracting_invoice_drafts;project public.erp_contracting_documents;rate numeric;v text;cfg jsonb;contract uuid;
BEGIN
 SELECT * INTO link FROM public.erp_contracting_invoice_drafts WHERE cafe_id=c AND draft_id=draft AND kind='advance';IF NOT FOUND THEN RETURN NULL;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(c::text,60412));PERFORM pg_advisory_xact_lock(hashtextextended(c::text,67131));
 SELECT * INTO project FROM public.erp_contracting_documents WHERE cafe_id=c AND id=link.project_id FOR UPDATE;
 SELECT contract_id INTO contract FROM public.erp_contracting_advance_drafts WHERE cafe_id=c AND draft_id=draft;
 IF project.kind<>'project' OR project.status<>'active' OR project.customer_id::text IS DISTINCT FROM inv->>'partyId' OR source IS NOT NULL OR currency<>'SAR' OR fx<>1 OR shipping IS NOT NULL OR adjustment IS NOT NULL OR coalesce((inv->>'applyCredit')::boolean,false) OR net<=0 THEN RAISE EXCEPTION 'بيانات فاتورة الدفعة لا تطابق المشروع أو تحتوي تعديلات غير مسموحة' USING ERRCODE='22023';END IF;
 IF contract IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_contracting_documents WHERE cafe_id=c AND id=contract AND kind='contract' AND status='active' AND project_id=project.id AND customer_id=project.customer_id) THEN RAISE EXCEPTION 'عقد الدفعة المقدمة غير متاح' USING ERRCODE='22023';END IF;
 SELECT min((e->>'vatRate')::numeric) INTO rate FROM jsonb_array_elements(rows)e;
 IF rate NOT IN(0,15) OR EXISTS(SELECT 1 FROM jsonb_array_elements(rows)e WHERE e->>'kind'<>'service' OR coalesce(e->>'productId','')<>'' OR (e->>'vatRate')::numeric<>rate) OR tax<>round(net*rate/100,2) THEN RAISE EXCEPTION 'تتطلب الدفعة بند خدمة واحدًا وضريبة موحدة دون حركة مخزون' USING ERRCODE='22023';END IF;
 INSERT INTO public.erp_contracting_advance_invoices(cafe_id,invoice_id,draft_id,project_id,contract_id,party_id,net,tax,total,tax_rate,created_at) VALUES(c,doc,draft,project.id,contract,project.customer_id,net,tax,total,rate,issued);
 INSERT INTO public.erp_contracting_advance_assignments VALUES(c,doc,contract,1);
 IF coalesce(inv->>'manualNumber','')<>'' THEN RETURN NULL;END IF;
 v:=erp_settings_private.allocate_number(c,'contracting_advance_invoice',doc,issued);
 IF v IS NOT NULL THEN RETURN brand_finance_private.invoice_number_allocate(c,'invoice','{"manual":true}',v);END IF;RETURN NULL;
END $$;

CREATE FUNCTION erp_settings_private.advance_credit_settle(c uuid,source uuid,credit uuid,amount numeric) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$DECLARE a public.erp_contracting_advance_invoices;used numeric;prior numeric;outstanding numeric;BEGIN
 SELECT * INTO a FROM public.erp_contracting_advance_invoices WHERE cafe_id=c AND invoice_id=source FOR UPDATE;IF NOT FOUND THEN RETURN;END IF;
 used:=erp_settings_private.advance_used(c,source);SELECT coalesce(sum(total),0) INTO prior FROM public.bf_credit_notes WHERE cafe_id=c AND source_invoice_id=source AND status='issued' AND id<>credit;
 IF amount>a.total-used-prior THEN RAISE EXCEPTION 'الإشعار يتجاوز الرصيد غير المخصص من الدفعة المقدمة' USING ERRCODE='22023';END IF;
 outstanding:=(brand_finance_private.document_state(c,source)->>'outstanding')::numeric;
 IF outstanding>0 THEN PERFORM brand_finance_private.customer_credit_apply(c,source,least(amount,outstanding));END IF;
END $$;

-- Validate backing again after mutable receipt status and new allocation changes
CREATE FUNCTION erp_settings_private.guard_advance_backing() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE c uuid:=coalesce(NEW.cafe_id,OLD.cafe_id);BEGIN
 IF EXISTS(SELECT 1 FROM public.erp_contracting_advance_invoices a WHERE a.cafe_id=c AND erp_settings_private.advance_available(c,a.invoice_id)<0) THEN RAISE EXCEPTION 'لا يمكن إلغاء تحصيل دفعة مقدمة استهلكت في مستخلص' USING ERRCODE='22023';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER erp_advance_backing AFTER INSERT OR UPDATE OR DELETE ON public.bf_invoice_payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_settings_private.guard_advance_backing();
CREATE CONSTRAINT TRIGGER erp_advance_backing AFTER INSERT ON public.erp_contracting_advance_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_settings_private.guard_advance_backing();
CREATE CONSTRAINT TRIGGER erp_advance_backing AFTER INSERT OR UPDATE ON public.bf_credit_notes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_settings_private.guard_advance_backing();

CREATE FUNCTION erp_settings_private.guard_advance_refund() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$BEGIN
 IF NEW.kind='refund' AND EXISTS(SELECT 1 FROM public.erp_contracting_advance_invoices WHERE cafe_id=NEW.cafe_id AND invoice_id=NEW.reference_id) THEN RAISE EXCEPTION 'ترد الدفعة المقدمة بإشعار دائن ثم رد رصيد العميل للحفاظ على الضريبة والتخصيصات' USING ERRCODE='22023';END IF;RETURN NEW;
END $$;
CREATE TRIGGER erp_advance_refund_guard BEFORE INSERT ON public.bf_documents FOR EACH ROW EXECUTE FUNCTION erp_settings_private.guard_advance_refund();

CREATE FUNCTION erp_settings_private.apply_advance_recovery(c uuid,invoice uuid,amount numeric,certificate uuid) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE cert public.erp_contracting_documents;target public.bf_documents;a public.erp_contracting_advance_invoices;available numeric;remaining numeric:=amount;part numeric;tax_part numeric;used numeric;capacity numeric;payment uuid;last_payment uuid;aid uuid;
BEGIN
 SELECT * INTO target FROM public.bf_documents WHERE cafe_id=c AND id=invoice FOR UPDATE;
 SELECT * INTO cert FROM public.erp_contracting_documents WHERE cafe_id=c AND id=certificate AND kind='certificate' AND status='approved' FOR UPDATE;
 IF cert.id IS NULL OR cert.customer_id<>target.party_id OR amount<=0 OR amount>(brand_finance_private.document_state(c,invoice)->>'outstanding')::numeric THEN RAISE EXCEPTION 'استرداد الدفعة لا يطابق المستخلص' USING ERRCODE='22023';END IF;
 aid:=brand_finance_private.customer_credit_account(c);
 FOR a IN SELECT m.* FROM public.erp_contracting_advance_invoices m JOIN public.erp_contracting_advance_assignments z ON z.cafe_id=m.cafe_id AND z.invoice_id=m.invoice_id WHERE m.cafe_id=c AND m.project_id=cert.project_id AND m.party_id=cert.customer_id AND z.contract_id=cert.source_id ORDER BY erp_settings_private.advance_available(c,m.invoice_id) DESC,m.created_at,m.invoice_id FOR UPDATE OF m,z LOOP
  EXIT WHEN remaining=0;available:=erp_settings_private.advance_available(c,a.invoice_id);IF available<=0 THEN CONTINUE;END IF;
  SELECT coalesce(sum(l.net+l.tax),0)-coalesce((SELECT sum(x.amount) FROM public.erp_contracting_advance_allocations x JOIN public.erp_contracting_advance_invoices z ON z.cafe_id=x.cafe_id AND z.invoice_id=x.advance_id WHERE x.cafe_id=c AND x.invoice_id=invoice AND z.tax_rate=a.tax_rate),0) INTO capacity FROM public.bf_document_lines l WHERE l.cafe_id=c AND l.document_id=invoice AND l.vat_rate=a.tax_rate;
  part:=least(available,remaining,greatest(capacity,0));IF part<=0 THEN CONTINUE;END IF;
  used:=erp_settings_private.advance_used(c,a.invoice_id);tax_part:=round((used+part)*a.tax/a.total,2)-round(used*a.tax/a.total,2);payment:=gen_random_uuid();
  INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,total,paid,reference_id,note,created_by) VALUES(payment,c,'settlement',target.party_id,part,part,invoice,'تسوية فاتورة دفعة مقدمة للمستخلص',auth.uid());
  PERFORM brand_finance_private.invoice_line(c,payment,aid,part-tax_part,0,target.party_id,'استرداد صافي الدفعة المقدمة');
  PERFORM brand_finance_private.invoice_line(c,payment,brand_finance_private.account(c,'2100'),tax_part,0,NULL,'تسوية ضريبة الدفعة المقدمة');
  PERFORM brand_finance_private.invoice_line(c,payment,brand_finance_private.account(c,'1100'),0,part,target.party_id,'تسوية ذمة المستخلص');
  INSERT INTO public.erp_contracting_advance_allocations(cafe_id,advance_id,invoice_id,document_id,amount,net,tax) VALUES(c,a.invoice_id,invoice,payment,part,part-tax_part,tax_part);
  INSERT INTO public.erp_contracting_links(cafe_id,project_id,document_id,relation,amount) VALUES(c,cert.project_id,payment,'advance_invoice_recovery',part);remaining:=remaining-part;last_payment:=payment;
 END LOOP;
 IF remaining>0 THEN last_payment:=brand_finance_private.customer_credit_apply(c,invoice,remaining);END IF;
 RETURN last_payment;
END $$;

CREATE FUNCTION erp_settings_private.reverse_advance_recovery(c uuid,invoice uuid,reverse_id uuid,amount numeric) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE x public.erp_contracting_advance_allocations;a public.erp_contracting_advance_invoices;remaining numeric:=amount;part numeric;prior numeric;prior_tax numeric;tax_part numeric;doc uuid;aid uuid;
BEGIN
 IF EXISTS(SELECT 1 FROM public.erp_contracting_advance_reversals WHERE cafe_id=c AND erp_contracting_advance_reversals.reverse_id=reverse_advance_recovery.reverse_id) THEN RETURN;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.erp_contracting_reversals r JOIN public.erp_contracting_documents d ON d.cafe_id=r.cafe_id AND d.id=r.document_id JOIN public.erp_contracting_documents s ON s.cafe_id=r.cafe_id AND s.id=r.source_id WHERE r.cafe_id=c AND r.document_id=reverse_id AND s.invoice_id=invoice AND d.recovery=amount AND r.credit_note_id IS NOT NULL) THEN RAISE EXCEPTION 'سياق عكس استرداد الدفعة غير صالح' USING ERRCODE='22023';END IF;
 aid:=brand_finance_private.customer_credit_account(c);
 FOR x IN SELECT * FROM public.erp_contracting_advance_allocations WHERE cafe_id=c AND invoice_id=invoice ORDER BY created_at DESC,id FOR UPDATE LOOP
  EXIT WHEN remaining<=0;SELECT * INTO a FROM public.erp_contracting_advance_invoices WHERE cafe_id=c AND invoice_id=x.advance_id FOR UPDATE;
  SELECT coalesce(sum(r.amount),0),coalesce(sum(r.tax),0) INTO prior,prior_tax FROM public.erp_contracting_advance_reversals r WHERE r.cafe_id=c AND r.allocation_id=x.id;
  part:=least(remaining,x.amount-prior);IF part<=0 THEN CONTINUE;END IF;tax_part:=CASE WHEN prior+part=x.amount THEN x.tax-prior_tax ELSE round((prior+part)*x.tax/x.amount,2)-prior_tax END;
  IF part>brand_finance_private.customer_credit_balance(c,a.party_id) THEN RAISE EXCEPTION 'رصيد الإشعار لا يكفي لإعادة الدفعة' USING ERRCODE='22023';END IF;doc:=gen_random_uuid();
  INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,total,note,created_by) VALUES(doc,c,'journal',a.party_id,part,'إعادة دفعة مقدمة بعد مستخلص عكسي',auth.uid());
  PERFORM brand_finance_private.invoice_line(c,doc,aid,part,0,a.party_id,'تحويل رصيد المستخلص العكسي');PERFORM brand_finance_private.invoice_line(c,doc,aid,0,part-tax_part,a.party_id,'إعادة صافي التزام الدفعة');PERFORM brand_finance_private.invoice_line(c,doc,brand_finance_private.account(c,'2100'),0,tax_part,NULL,'إعادة ضريبة الدفعة المقدمة');
  INSERT INTO public.bf_customer_credit_events(cafe_id,party_id,document_id,invoice_id,action,amount,delta,created_by) VALUES(c,a.party_id,doc,invoice,'apply',part,-part,auth.uid());
  INSERT INTO public.erp_contracting_advance_reversals(cafe_id,allocation_id,reverse_id,document_id,amount,net,tax) VALUES(c,x.id,reverse_id,doc,part,part-tax_part,tax_part);remaining:=remaining-part;
 END LOOP;
END $$;

-- Exact guarded edits of both live issuer variants preserve inventory, tax and branch logic
DO $patch$DECLARE src text;fn text;old_number text:='display_number:=brand_finance_private.invoice_number_allocate(p_cafe_id,CASE WHEN p_source_id IS NULL THEN ''invoice'' ELSE ''debit'' END,advanced->CASE WHEN p_source_id IS NULL THEN ''numbering'' ELSE ''debitNumbering'' END,coalesce(inv->>''manualNumber'',''''));';old_insert text:='INSERT INTO public.bf_company_invoices(document_id,cafe_id,draft_id,snapshot) VALUES(doc,p_cafe_id,p_draft_id,result);';BEGIN
 FOREACH fn IN ARRAY ARRAY['issue_company_invoice_actor','issue_manual_invoice_shipping_actor'] LOOP
  SELECT pg_get_functiondef(to_regprocedure('brand_finance_private.'||fn||'(uuid,boolean,uuid,uuid,integer,numeric,uuid,text)')) INTO src;
  IF src IS NULL OR (length(src)-length(replace(src,old_number,'')))/length(old_number)<>1 OR position(old_insert IN src)=0 THEN RAISE EXCEPTION 'Canonical invoice source changed: %',fn;END IF;
  src:=replace(src,old_number,'display_number:=coalesce(erp_settings_private.prepare_advance(p_cafe_id,doc,p_draft_id,p_source_id,inv,final_rows,sar_net,sar_tax,sar_total,currency_code,fx,'||CASE WHEN fn='issue_manual_invoice_shipping_actor' THEN 'shipping_charge' ELSE 'NULL' END||',adjustment_id,issue_at),brand_finance_private.invoice_number_allocate(p_cafe_id,CASE WHEN p_source_id IS NULL THEN ''invoice'' ELSE ''debit'' END,advanced->CASE WHEN p_source_id IS NULL THEN ''numbering'' ELSE ''debitNumbering'' END,coalesce(inv->>''manualNumber'','''')));');
  IF position('brand_finance_private.account(p_cafe_id,''4000''),0,sar_net' IN src)=0 THEN RAISE EXCEPTION 'Invoice revenue posting changed';END IF;
  src:=replace(src,'brand_finance_private.account(p_cafe_id,''4000''),0,sar_net','CASE WHEN EXISTS(SELECT 1 FROM public.erp_contracting_advance_invoices WHERE cafe_id=p_cafe_id AND invoice_id=doc) THEN brand_finance_private.customer_credit_account(p_cafe_id) ELSE brand_finance_private.account(p_cafe_id,''4000'') END,0,sar_net');
  src:=replace(src,old_insert,'IF EXISTS(SELECT 1 FROM public.erp_contracting_advance_invoices WHERE cafe_id=p_cafe_id AND invoice_id=doc) THEN result:=result||jsonb_build_object(''documentType'',''advance'',''invoiceTypeCode'',''386'',''advancePayment'',true);END IF; '||old_insert||' SELECT snapshot INTO result FROM public.bf_company_invoices WHERE cafe_id=p_cafe_id AND document_id=doc;');
  src:=replace(src,'sar_net-sar_adjustment_net,NULL,journal_note','sar_net-sar_adjustment_net,CASE WHEN EXISTS(SELECT 1 FROM public.erp_contracting_advance_invoices WHERE cafe_id=p_cafe_id AND invoice_id=doc) THEN customer.id ELSE NULL END,journal_note');
  src:=replace(src,'sar_net-sar_adjustment_net-shipping_sar_net,NULL,journal_note','sar_net-sar_adjustment_net-shipping_sar_net,CASE WHEN EXISTS(SELECT 1 FROM public.erp_contracting_advance_invoices WHERE cafe_id=p_cafe_id AND invoice_id=doc) THEN customer.id ELSE NULL END,journal_note');
  EXECUTE src;
 END LOOP;
 SELECT pg_get_functiondef('brand_finance_private.contracting_invoice_link()'::regprocedure) INTO src;
 IF position('payment_id:=brand_finance_private.customer_credit_apply(cert.cafe_id,NEW.document_id,remaining);' IN src)=0 THEN RAISE EXCEPTION 'Certificate recovery source changed';END IF;
 src:=replace(src,'payment_id:=brand_finance_private.customer_credit_apply(cert.cafe_id,NEW.document_id,remaining);','payment_id:=erp_settings_private.apply_advance_recovery(cert.cafe_id,NEW.document_id,remaining,cert.id);');
 src:=replace(src,' UPDATE public.erp_contracting_documents SET invoice_id=NEW.document_id,',' NEW.snapshot:=NEW.snapshot||jsonb_build_object(''advanceApplications'',coalesce((SELECT jsonb_agg(jsonb_build_object(''invoiceId'',a.invoice_id,''number'',e.display_number,''issuedAt'',a.created_at,''invoiceTypeCode'',''386'',''amount'',x.amount,''net'',x.net,''tax'',x.tax)) FROM public.erp_contracting_advance_allocations x JOIN public.erp_contracting_advance_invoices a ON a.cafe_id=x.cafe_id AND a.invoice_id=x.advance_id LEFT JOIN public.bf_invoice_extensions e ON e.cafe_id=a.cafe_id AND e.document_id=a.invoice_id WHERE x.cafe_id=NEW.cafe_id AND x.invoice_id=NEW.document_id),''[]''::jsonb),''advanceTaxAdjusted'',coalesce((SELECT sum(tax) FROM public.erp_contracting_advance_allocations WHERE cafe_id=NEW.cafe_id AND invoice_id=NEW.document_id),0)); UPDATE public.erp_contracting_documents SET invoice_id=NEW.document_id,');
 EXECUTE src;
END $patch$;
-- The original credit-note issuer now reverses the actual liability for an advance
DO $patch$DECLARE f record;src text;cnt integer:=0;anchor text:='PERFORM brand_finance_private.invoice_line(p_cafe_id,d,brand_finance_private.account(p_cafe_id,''4000''),(v->>''total'')::numeric-(v->>''tax'')::numeric,0,n.party_id,''إشعار دائن'');';event text:='INSERT INTO public.bf_customer_credit_events(cafe_id,party_id,document_id,invoice_id,action,amount,delta,created_by) VALUES(p_cafe_id,n.party_id,d,n.source_invoice_id,''credit_note'',(v->>''total'')::numeric,(v->>''total'')::numeric,auth.uid());';BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','brand_finance_private','erp_branch_private','erp_access_private','erp_settings_private') AND p.prokind='f' AND position(anchor IN p.prosrc)>0 LOOP
  src:=pg_get_functiondef(f.oid);IF position(event IN src)=0 THEN RAISE EXCEPTION 'Credit note event source changed';END IF;
  src:=replace(src,anchor,'PERFORM brand_finance_private.invoice_line(p_cafe_id,d,CASE WHEN EXISTS(SELECT 1 FROM public.erp_contracting_advance_invoices WHERE cafe_id=p_cafe_id AND invoice_id=n.source_invoice_id) THEN aid ELSE brand_finance_private.account(p_cafe_id,''4000'') END,(v->>''total'')::numeric-(v->>''tax'')::numeric,0,n.party_id,''إشعار دائن'');');
  src:=replace(src,event,event||' PERFORM erp_settings_private.advance_credit_settle(p_cafe_id,n.source_invoice_id,n.id,(v->>''total'')::numeric);');EXECUTE src;cnt:=cnt+1;
 END LOOP;IF cnt<>1 THEN RAISE EXCEPTION 'Expected one canonical credit-note issuer, found %',cnt;END IF;
END $patch$;

CREATE FUNCTION public.erp_contracting_advance_draft(p_cafe uuid,p_input jsonb,p_request uuid,p_scope jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;draft uuid;contract uuid:=nullif(p_input->>'contract_id','')::uuid;project uuid:=(p_input->>'id')::uuid;old_scope text:=current_setting('erp.branch_expected',true);linked public.erp_contracting_invoice_drafts;
BEGIN
 PERFORM set_config('erp.branch_expected',coalesce(p_scope::text,''),true);PERFORM erp_branch_private.enter(p_cafe);PERFORM erp_branch_private.assert_context(p_cafe);PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,60412));PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,67131));PERFORM erp_access_private.assert_allowed(p_cafe,'contracting','create');PERFORM erp_branch_private.assert_input(p_cafe,p_input);
 IF contract IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_contracting_documents WHERE cafe_id=p_cafe AND id=contract AND kind='contract' AND status='active' AND project_id=project) THEN RAISE EXCEPTION 'اختر عقدًا نشطًا داخل المشروع' USING ERRCODE='22023';END IF;
 result:=public.erp_contracting(p_cafe,'project_invoice',p_input||jsonb_build_object('invoice_kind','invoice'),p_request);draft:=(result->>'draft_id')::uuid;
 SELECT * INTO linked FROM public.erp_contracting_invoice_drafts WHERE cafe_id=p_cafe AND draft_id=draft FOR UPDATE;
 IF linked.kind='advance' THEN PERFORM set_config('erp.branch_expected',coalesce(old_scope,''),true);RETURN result;END IF;
 IF EXISTS(SELECT 1 FROM public.bf_company_invoices WHERE cafe_id=p_cafe AND draft_id=linked.draft_id) THEN RAISE EXCEPTION 'الفاتورة صدرت بالفعل' USING ERRCODE='22023';END IF;
 UPDATE public.erp_contracting_invoice_drafts SET kind='advance' WHERE cafe_id=p_cafe AND draft_id=draft;
 INSERT INTO public.erp_contracting_advance_drafts VALUES(p_cafe,draft,contract);
 INSERT INTO public.erp_contracting_events(cafe_id,document_id,action,note,actor) VALUES(p_cafe,project,'advance_invoice_draft',coalesce(contract::text,''),auth.uid());
 PERFORM set_config('erp.branch_expected',coalesce(old_scope,''),true);RETURN result;
END $$;
CREATE FUNCTION public.erp_contracting_advances(p_cafe uuid,p_project uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE permitted jsonb;result jsonb;BEGIN
 permitted:=public.erp_contracting(p_cafe,'read');
 SELECT coalesce(jsonb_agg(to_jsonb(a)-'cafe_id'||jsonb_build_object('contract_id',(SELECT z.contract_id FROM public.erp_contracting_advance_assignments z WHERE z.cafe_id=a.cafe_id AND z.invoice_id=a.invoice_id),'assignment_revision',(SELECT z.revision FROM public.erp_contracting_advance_assignments z WHERE z.cafe_id=a.cafe_id AND z.invoice_id=a.invoice_id),'displayNumber',coalesce(e.display_number,d.number::text),'number',d.number,'available',erp_settings_private.advance_available(p_cafe,a.invoice_id),'used',erp_settings_private.advance_used(p_cafe,a.invoice_id),'outstanding',brand_finance_private.document_state(p_cafe,a.invoice_id)->'outstanding','allocations',coalesce((SELECT jsonb_agg(to_jsonb(x)-'cafe_id') FROM public.erp_contracting_advance_allocations x WHERE x.cafe_id=p_cafe AND x.advance_id=a.invoice_id),'[]'::jsonb)) ORDER BY a.created_at DESC),'[]'::jsonb) INTO result FROM public.erp_contracting_advance_invoices a JOIN public.bf_documents d ON d.cafe_id=a.cafe_id AND d.id=a.invoice_id LEFT JOIN public.bf_invoice_extensions e ON e.cafe_id=a.cafe_id AND e.document_id=a.invoice_id WHERE a.cafe_id=p_cafe AND(p_project IS NULL OR a.project_id=p_project) AND EXISTS(SELECT 1 FROM jsonb_array_elements(permitted->'documents') x WHERE x->>'id'=a.project_id::text) AND erp_branch_private.row_allowed(p_cafe,erp_branch_private.current_branch(p_cafe),jsonb_build_object('id',a.invoice_id),'');RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.erp_contracting_advance_draft(uuid,jsonb,uuid,jsonb),public.erp_contracting_advances(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.erp_contracting_advance_draft(uuid,jsonb,uuid,jsonb),public.erp_contracting_advances(uuid,uuid) TO authenticated;
DO $$DECLARE r record;BEGIN FOR r IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='erp_settings_private' AND p.proname IN('prepare_advance','advance_used','advance_available','apply_advance_recovery','reverse_advance_recovery','advance_credit_settle','guard_advance_backing','guard_advance_refund') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.signature);END LOOP;END $$;

CREATE TABLE public.erp_contracting_advance_credit_drafts(cafe_id uuid NOT NULL,note_id uuid NOT NULL,invoice_id uuid NOT NULL,net numeric(18,2) NOT NULL,tax numeric(18,2) NOT NULL,payload jsonb NOT NULL,PRIMARY KEY(cafe_id,note_id),FOREIGN KEY(cafe_id,invoice_id) REFERENCES public.erp_contracting_advance_invoices(cafe_id,invoice_id),FOREIGN KEY(note_id) REFERENCES public.bf_credit_notes(id) DEFERRABLE INITIALLY DEFERRED);
ALTER TABLE public.erp_contracting_advance_credit_drafts ENABLE ROW LEVEL SECURITY;REVOKE ALL ON public.erp_contracting_advance_credit_drafts FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.erp_contracting_advance_credit_drafts FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TRIGGER cancellation_archive_guard BEFORE INSERT OR UPDATE OR DELETE ON public.erp_contracting_advance_credit_drafts FOR EACH ROW EXECUTE FUNCTION brand_cancellation_private.guard_archive();
CREATE POLICY cancellation_archive_scope ON public.erp_contracting_advance_credit_drafts AS RESTRICTIVE FOR ALL TO anon,authenticated USING(public.brand_account_not_cancelled(cafe_id) OR public.is_platform_admin()) WITH CHECK(public.brand_account_not_cancelled(cafe_id));
DO $$DECLARE src text;BEGIN SELECT pg_get_functiondef('brand_finance_private.credit_note_validate(uuid,jsonb,boolean)'::regprocedure) INTO src;EXECUTE replace(src,'brand_finance_private.credit_note_validate(','erp_settings_private.credit_note_validate_before_advance(');END $$;
CREATE OR REPLACE FUNCTION brand_finance_private.credit_note_validate(cafe uuid,p jsonb,strict_refs boolean) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$DECLARE n uuid:=nullif(current_setting('erp.advance_credit',true),'')::uuid;x public.erp_contracting_advance_credit_drafts;v jsonb;BEGIN
 IF n IS NULL THEN RETURN erp_settings_private.credit_note_validate_before_advance(cafe,p,strict_refs);END IF;
 SELECT * INTO x FROM public.erp_contracting_advance_credit_drafts WHERE cafe_id=cafe AND note_id=n;
 IF x.note_id IS NULL OR p IS DISTINCT FROM x.payload THEN RAISE EXCEPTION 'بيانات إشعار الدفعة تغيرت' USING ERRCODE='40001';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bf_parties WHERE cafe_id=cafe AND id=(p->>'partyId')::uuid AND active AND kind='customer') THEN RAISE EXCEPTION 'عميل الدفعة غير متاح' USING ERRCODE='42501';END IF;
 v:=erp_settings_private.credit_note_validate_before_advance(cafe,p,false);
 RETURN v||jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('productId','','name','رد فاتورة دفعة مقدمة','description',p->>'reason','itemId',NULL,'unitCost',0,'components','[]'::jsonb,'quantity',1,'price',x.net,'discount',0,'net',x.net,'tax',x.tax,'total',x.net+x.tax,'vatRate',p->'vatRate')),'subtotal',x.net,'discount',0,'tax',x.tax,'total',x.net+x.tax);
END $$;
CREATE FUNCTION public.erp_contracting_advance_credit(p_cafe uuid,p_invoice uuid,p_net numeric,p_reason text,p_request uuid,p_scope jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE a public.erp_contracting_advance_invoices;p jsonb;r jsonb;n uuid:=p_request;old_scope text:=current_setting('erp.branch_expected',true);old_credit text:=current_setting('erp.advance_credit',true);t numeric;BEGIN
 PERFORM set_config('erp.branch_expected',coalesce(p_scope::text,''),true);PERFORM erp_branch_private.enter(p_cafe);PERFORM erp_branch_private.assert_context(p_cafe);PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,60412));PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,67131));PERFORM erp_access_private.assert_allowed(p_cafe,'contracting','approve');PERFORM erp_access_private.assert_allowed(p_cafe,'finance','approve');
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.erp_contracting_advances(p_cafe)) x WHERE x->>'invoice_id'=p_invoice::text) THEN RAISE EXCEPTION 'فاتورة الدفعة غير متاحة' USING ERRCODE='42501';END IF;
 SELECT * INTO a FROM public.erp_contracting_advance_invoices WHERE cafe_id=p_cafe AND invoice_id=p_invoice FOR UPDATE;
 IF p_request IS NULL OR p_net IS NULL OR p_net<=0 OR p_net<>round(p_net,2) OR p_net>a.net OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'راجع قيمة وسبب رد الدفعة' USING ERRCODE='22023';END IF;t:=round(p_net*a.tax_rate/100,2);
 IF EXISTS(SELECT 1 FROM public.erp_contracting_advance_credit_drafts WHERE cafe_id=p_cafe AND note_id=n) THEN
  IF NOT EXISTS(SELECT 1 FROM public.erp_contracting_advance_credit_drafts WHERE cafe_id=p_cafe AND note_id=n AND invoice_id=p_invoice AND net=p_net AND payload->>'reason'=btrim(p_reason)) THEN RAISE EXCEPTION 'تغير محتوى الطلب المكرر' USING ERRCODE='40001';END IF;r:=public.brand_finance_credit_notes(p_cafe,n);PERFORM set_config('erp.branch_expected',coalesce(old_scope,''),true);RETURN r;
 END IF;
 p:=jsonb_build_object('partyId',a.party_id,'warehouseId','','date',current_date,'issueDate',current_date,'salespersonId',NULL,'sourceInvoiceId',p_invoice,'reason',btrim(p_reason),'note','','terms','','template','standard','deliveryMethod','print','stockRequired',false,'discountValue',0,'discountKind','amount','vatRate',a.tax_rate,'taxInclusive',false,'lines',jsonb_build_array(jsonb_build_object('key',1,'productId','','quantity',1,'price',p_net,'description',btrim(p_reason),'vatRate',a.tax_rate)));
 INSERT INTO public.erp_contracting_advance_credit_drafts VALUES(p_cafe,n,p_invoice,p_net,t,p);PERFORM set_config('erp.advance_credit',n::text,true);
 PERFORM public.brand_finance_save_credit_note(p_cafe,n,0,p);r:=public.brand_finance_transition_credit_note(p_cafe,n,1,'issue',gen_random_uuid(),'');
 PERFORM set_config('erp.advance_credit',coalesce(old_credit,''),true);PERFORM set_config('erp.branch_expected',coalesce(old_scope,''),true);RETURN r;
END $$;
REVOKE ALL ON FUNCTION erp_settings_private.credit_note_validate_before_advance(uuid,jsonb,boolean),public.erp_contracting_advance_credit(uuid,uuid,numeric,text,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_contracting_advance_credit(uuid,uuid,numeric,text,uuid,jsonb) TO authenticated;

CREATE FUNCTION erp_settings_private.advance_state(c uuid,a uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('invoiceId',a,'net',x.net,'tax',x.tax,'total',x.total,'actualCollected',coalesce((brand_finance_private.payment_document(d)).paid,0)+coalesce((SELECT sum((brand_finance_private.payment_document(p)).total) FROM public.bf_documents p WHERE p.cafe_id=c AND p.reference_id=a AND p.kind='settlement' AND p.account_id IS NOT NULL),0),'credited',coalesce((SELECT sum(n.total) FROM public.bf_credit_notes n WHERE n.cafe_id=c AND n.source_invoice_id=a AND n.status='issued'),0),'allocated',erp_settings_private.advance_used(c,a),'available',erp_settings_private.advance_available(c,a),'basis','current-effective-payment-status') FROM public.erp_contracting_advance_invoices x JOIN public.bf_documents d ON d.cafe_id=x.cafe_id AND d.id=x.invoice_id WHERE x.cafe_id=c AND x.invoice_id=a
$$;
REVOKE ALL ON FUNCTION erp_settings_private.advance_state(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.erp_contracting_advance_assign(p_cafe uuid,p_invoice uuid,p_contract uuid,p_revision integer,p_request uuid,p_scope jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE a public.erp_contracting_advance_invoices;z public.erp_contracting_advance_assignments;cmd jsonb;r jsonb;old_scope text:=current_setting('erp.branch_expected',true);BEGIN
 PERFORM set_config('erp.branch_expected',coalesce(p_scope::text,''),true);PERFORM erp_branch_private.enter(p_cafe);PERFORM erp_branch_private.assert_context(p_cafe);PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,60412));PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,67131));PERFORM erp_access_private.assert_allowed(p_cafe,'contracting','update');PERFORM erp_branch_private.assert_input(p_cafe,jsonb_build_object('invoiceId',p_invoice,'contract_id',p_contract));
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.erp_contracting_advances(p_cafe)) x WHERE x->>'invoice_id'=p_invoice::text) THEN RAISE EXCEPTION 'فاتورة الدفعة غير متاحة' USING ERRCODE='42501';END IF;
 SELECT * INTO a FROM public.erp_contracting_advance_invoices WHERE cafe_id=p_cafe AND invoice_id=p_invoice FOR UPDATE;SELECT * INTO z FROM public.erp_contracting_advance_assignments WHERE cafe_id=p_cafe AND invoice_id=p_invoice FOR UPDATE;
 cmd:=jsonb_build_object('action','advance_assign','invoice',p_invoice,'contract',p_contract,'revision',p_revision);SELECT result INTO r FROM public.erp_contracting_requests WHERE cafe_id=p_cafe AND id=p_request AND command=cmd;IF FOUND THEN PERFORM set_config('erp.branch_expected',coalesce(old_scope,''),true);RETURN r;END IF;
 IF p_request IS NULL OR z.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'تغير ربط الدفعة أعد تحميل الصفحة' USING ERRCODE='40001';END IF;
 IF erp_settings_private.advance_used(p_cafe,p_invoice)>0 THEN RAISE EXCEPTION 'اعكس استرداد المستخلص قبل تغيير عقد الدفعة' USING ERRCODE='22023';END IF;
 IF p_contract IS NOT NULL AND (erp_settings_private.advance_available(p_cafe,p_invoice)<=0 OR NOT EXISTS(SELECT 1 FROM public.erp_contracting_documents WHERE cafe_id=p_cafe AND id=p_contract AND project_id=a.project_id AND customer_id=a.party_id AND kind='contract' AND status='active')) THEN RAISE EXCEPTION 'اختر عقدًا نشطًا لنفس المشروع والعميل ودفعة لها رصيد متاح' USING ERRCODE='22023';END IF;
 UPDATE public.erp_contracting_advance_assignments SET contract_id=p_contract,revision=revision+1 WHERE cafe_id=p_cafe AND invoice_id=p_invoice;INSERT INTO public.erp_contracting_events(cafe_id,document_id,action,note,actor) VALUES(p_cafe,a.project_id,CASE WHEN p_contract IS NULL THEN 'advance_unassigned' ELSE 'advance_assigned' END,p_invoice::text,auth.uid());r:=jsonb_build_object('id',p_invoice,'revision',z.revision+1);INSERT INTO public.erp_contracting_requests VALUES(p_cafe,p_request,cmd,r);PERFORM set_config('erp.branch_expected',coalesce(old_scope,''),true);RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.erp_contracting_advance_assign(uuid,uuid,uuid,integer,uuid,jsonb) FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION public.erp_contracting_advance_assign(uuid,uuid,uuid,integer,uuid,jsonb) TO authenticated;

-- Contract reversals enter the same lock order before locking certificate rows
DO $$DECLARE src text;anchor text:='PERFORM erp_branch_private.enter(p_cafe_id);';BEGIN
 SELECT pg_get_functiondef('public.erp_contracting(uuid,text,jsonb,uuid)'::regprocedure) INTO src;
 IF position('PERFORM erp_branch_private.enter($1);' IN src)>0 THEN anchor:='PERFORM erp_branch_private.enter($1);';END IF;
 IF position(anchor IN src)=0 THEN RAISE EXCEPTION 'Contracting public scope wrapper changed';END IF;
 src:=replace(src,anchor,anchor||' IF p_action<>''read'' THEN PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,67131));END IF;');EXECUTE src;
END $$;
NOTIFY pgrst,'reload schema';COMMIT;
