BEGIN;
-- Additional supplier charge: a payable with no stock quantity or valuation movement.
CREATE TABLE public.erp_purchase_credit_notes (
 id uuid PRIMARY KEY, cafe_id uuid NOT NULL REFERENCES public.cafes(id),
 ordinal bigint GENERATED ALWAYS AS IDENTITY, code text NOT NULL DEFAULT '',
 source_document_id uuid NOT NULL, branch_id uuid, revision integer NOT NULL DEFAULT 1,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','posted','cancelled')),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'), document_id uuid,
 created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(cafe_id,id), UNIQUE(cafe_id,code),
 FOREIGN KEY(cafe_id,source_document_id) REFERENCES public.bf_documents(cafe_id,id),
 FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),
 FOREIGN KEY(branch_id,cafe_id) REFERENCES public.branches(id,cafe_id)
);
CREATE TABLE public.erp_purchase_credit_postings (
 cafe_id uuid NOT NULL, note_id uuid NOT NULL, document_id uuid PRIMARY KEY,
 reversal_document_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(cafe_id,note_id) REFERENCES public.erp_purchase_credit_notes(cafe_id,id),
 FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),
 FOREIGN KEY(cafe_id,reversal_document_id) REFERENCES public.bf_documents(cafe_id,id)
);
CREATE INDEX erp_purchase_credit_source ON public.erp_purchase_credit_notes(cafe_id,source_document_id);
CREATE INDEX erp_purchase_credit_history ON public.erp_purchase_credit_postings(cafe_id,note_id,created_at);
DO $$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['erp_purchase_credit_notes','erp_purchase_credit_postings'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('CREATE TRIGGER cancellation_archive_guard BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION brand_cancellation_private.guard_archive()',t);
  EXECUTE format('CREATE POLICY cancellation_archive_scope ON public.%I AS RESTRICTIVE FOR ALL TO anon,authenticated USING(public.brand_account_not_cancelled(cafe_id) OR public.is_platform_admin()) WITH CHECK(public.brand_account_not_cancelled(cafe_id))',t);
 END LOOP;
END $$;
INSERT INTO erp_settings_private.number_contexts VALUES('purchase_credit_note','إشعار دائن مشتريات','erp_purchase_credit_notes','code',NULL,NULL);
CREATE FUNCTION erp_purchase_private.credit_number() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$BEGIN
 NEW.code:=coalesce(erp_settings_private.allocate_number(NEW.cafe_id,'purchase_credit_note',NEW.id,NEW.created_at),'PCN-'||lpad(NEW.ordinal::text,greatest(6,length(NEW.ordinal::text)),'0'));RETURN NEW;
END $$;
CREATE TRIGGER purchase_credit_number BEFORE INSERT ON public.erp_purchase_credit_notes FOR EACH ROW EXECUTE FUNCTION erp_purchase_private.credit_number();

ALTER FUNCTION erp_purchase_private.settings(uuid) RENAME TO settings_before_credit_notes;
CREATE FUNCTION erp_purchase_private.settings(c uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('allowCreditNotes',false)||erp_purchase_private.settings_before_credit_notes(c)
$$;
CREATE FUNCTION erp_purchase_private.credit_setting_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$BEGIN
 IF NEW.payload?'allowCreditNotes' AND jsonb_typeof(NEW.payload->'allowCreditNotes') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'تفعيل الإشعارات الدائنة يتطلب قيمة صحيحة';END IF;RETURN NEW;
END $$;
CREATE TRIGGER purchase_credit_setting_guard BEFORE INSERT OR UPDATE ON public.erp_purchase_settings FOR EACH ROW EXECUTE FUNCTION erp_purchase_private.credit_setting_guard();
CREATE FUNCTION erp_purchase_private.credit_bind(c uuid,d uuid,b uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$BEGIN
 IF b IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM public.erp_branch_documents WHERE cafe_id=c AND document_id=d AND branch_id<>b) THEN RAISE EXCEPTION 'فرع الإشعار لا يطابق مصدره' USING ERRCODE='42501';END IF;
  INSERT INTO public.erp_branch_documents(cafe_id,document_id,branch_id) VALUES(c,d,b) ON CONFLICT DO NOTHING;
 END IF;
END $$;
CREATE FUNCTION public.erp_purchase_credit_read(p_cafe uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE b uuid;BEGIN
 PERFORM erp_purchase_private.authorize(p_cafe,'read');PERFORM erp_branch_private.enter(p_cafe);b:=erp_branch_private.current_branch(p_cafe);
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(n)-'cafe_id'-'created_by'||jsonb_build_object(
  'sourceNumber',coalesce((SELECT p.number FROM public.erp_purchase_documents p WHERE p.cafe_id=d.cafe_id AND p.finance_id=d.id),d.number::text),'supplierId',d.party_id,
  'outstanding',CASE WHEN n.status='posted' THEN coalesce((brand_finance_private.document_state(p_cafe,n.document_id)->>'outstanding')::numeric,0) ELSE 0 END,
  'history',coalesce((SELECT jsonb_agg(to_jsonb(h)-'cafe_id' ORDER BY h.created_at) FROM public.erp_purchase_credit_postings h WHERE h.cafe_id=p_cafe AND h.note_id=n.id),'[]')
 ) ORDER BY n.created_at DESC,n.id) FROM public.erp_purchase_credit_notes n JOIN public.bf_documents d ON d.cafe_id=n.cafe_id AND d.id=n.source_document_id
 WHERE n.cafe_id=p_cafe AND erp_branch_private.row_allowed(p_cafe,b,to_jsonb(n)) AND erp_branch_private.row_allowed(p_cafe,b,to_jsonb(d)) AND erp_branch_private.allowed_resource(p_cafe,b,'account',(n.payload->>'expenseAccountId')::uuid)),'[]');
END $$;
CREATE FUNCTION public.erp_purchase_credit_write(p_cafe uuid,p_action text,p_payload jsonb,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid:=p_cafe;p jsonb:=p_payload;n public.erp_purchase_credit_notes%ROWTYPE;original public.bf_documents%ROWTYPE;
 prior erp_purchase_private.requests;rid uuid;doc uuid;revdoc uuid;aid uuid;b uuid;v jsonb;result jsonb;
 amount numeric;discount numeric;rate numeric;net numeric;tax numeric;total numeric;d date;entry record;
BEGIN
 PERFORM erp_purchase_private.authorize(c,'read');PERFORM erp_branch_private.enter(c);PERFORM erp_branch_private.assert_context(c);
 IF p_request IS NULL OR jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>20000 OR p_action NOT IN('save','post','draft','delete','cancel','payment') THEN RAISE EXCEPTION 'طلب الإشعار غير صالح';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(c::text,60412));
 SELECT * INTO prior FROM erp_purchase_private.requests WHERE cafe_id=c AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor IS DISTINCT FROM auth.uid() OR prior.action IS DISTINCT FROM 'credit_note_'||p_action OR prior.payload IS DISTINCT FROM p THEN RAISE EXCEPTION 'معرف الطلب مستخدم لعملية أخرى';END IF;
  SELECT to_jsonb(source_row) INTO v FROM public.bf_documents source_row WHERE source_row.cafe_id=c AND source_row.id=(prior.result->>'sourceDocumentId')::uuid;
  IF v IS NULL THEN RAISE EXCEPTION 'المصدر لم يعد متاحًا' USING ERRCODE='42501';END IF;
  PERFORM erp_branch_private.assert_input(c,v);
  PERFORM erp_branch_private.assert_input(c,jsonb_build_object('document_id',prior.result->'sourceDocumentId','branch_id',prior.result->'branchId'));
  IF NOT erp_branch_private.allowed_resource(c,erp_branch_private.current_branch(c),'account',(prior.result->>'expenseAccountId')::uuid) THEN RAISE EXCEPTION 'حساب الإشعار غير متاح في الفرع' USING ERRCODE='42501';END IF;
  RETURN prior.result;
 END IF;
 rid:=(p->>'id')::uuid;IF rid IS NULL OR jsonb_typeof(p->'revision') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'اختر الإشعار وأعد تحميل نسخته';END IF;
 SELECT * INTO n FROM public.erp_purchase_credit_notes WHERE cafe_id=c AND id=rid FOR UPDATE;
 IF coalesce(n.revision,0) IS DISTINCT FROM (p->>'revision')::integer THEN RAISE EXCEPTION 'تغير الإشعار أعد تحميله' USING ERRCODE='40001';END IF;
 IF n.id IS NULL AND p_action<>'save' THEN RAISE EXCEPTION 'الإشعار غير متاح' USING ERRCODE='42501';END IF;
 IF n.id IS NOT NULL THEN
  PERFORM erp_branch_private.assert_input(c,to_jsonb(n));
  IF NOT erp_branch_private.allowed_resource(c,erp_branch_private.current_branch(c),'account',(n.payload->>'expenseAccountId')::uuid) THEN RAISE EXCEPTION 'حساب الإشعار غير متاح في الفرع' USING ERRCODE='42501';END IF;
 END IF;
 SELECT * INTO original FROM public.bf_documents WHERE cafe_id=c AND id=CASE WHEN n.id IS NULL THEN (p->>'invoiceId')::uuid ELSE n.source_document_id END AND kind='purchase' FOR UPDATE;
 IF original.id IS NULL OR EXISTS(SELECT 1 FROM public.erp_purchase_credit_postings WHERE cafe_id=c AND document_id=original.id) THEN RAISE EXCEPTION 'اختر فاتورة شراء أصلية';END IF;
 PERFORM erp_branch_private.assert_input(c,to_jsonb(original));SELECT branch_id INTO b FROM public.erp_branch_documents WHERE cafe_id=c AND document_id=original.id;
 IF n.id IS NOT NULL AND n.branch_id IS DISTINCT FROM b THEN RAISE EXCEPTION 'تغير فرع الفاتورة الأصلية أعد مراجعة الإشعار' USING ERRCODE='40001';END IF;
 IF NOT erp_branch_private.row_allowed(c,b,p) THEN RAISE EXCEPTION 'الحساب غير متاح لفرع الفاتورة' USING ERRCODE='42501';END IF;
 IF p_action='save' THEN
  PERFORM erp_purchase_private.authorize(c,CASE WHEN n.id IS NULL THEN 'create' ELSE 'update' END);
  IF NOT coalesce((erp_purchase_private.settings(c)->>'allowCreditNotes')::boolean,false) THEN RAISE EXCEPTION 'فعّل الإشعارات الدائنة من إعدادات المشتريات';END IF;
  IF n.id IS NOT NULL AND (n.status<>'draft' OR n.source_document_id IS DISTINCT FROM (p->>'invoiceId')::uuid) THEN RAISE EXCEPTION 'حوّل الإشعار إلى مسودة قبل تعديله ولا تغير فاتورته الأصلية';END IF;
  amount:=(p->>'amount')::numeric;discount:=(p->>'discount')::numeric;rate:=(p->>'taxRate')::numeric;aid:=(p->>'expenseAccountId')::uuid;d:=(p->>'date')::date;
  IF amount IS NULL OR amount<=0 OR amount>1e9 OR amount<>round(amount,2) OR discount IS NULL OR discount<0 OR discount>=amount OR discount<>round(discount,2) OR rate IS NULL OR rate<0 OR rate>100 OR rate<>round(rate,3) OR d IS NULL OR NOT isfinite(d) OR length(btrim(coalesce(p->>'description',''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'راجع وصف الإشعار والمبلغ والخصم والضريبة والتاريخ';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=c AND id=aid AND active AND kind='expense') OR NOT erp_branch_private.allowed_resource(c,b,'account',aid) THEN RAISE EXCEPTION 'اختر حساب مصروف نشطًا متاحًا للفرع';END IF;
  net:=amount-discount;tax:=round(net*rate/100,2);total:=net+tax;
  IF total>1e9 THEN RAISE EXCEPTION 'إجمالي الإشعار يتجاوز الحد المسموح';END IF;
  v:=jsonb_build_object('date',d,'description',btrim(p->>'description'),'amount',amount,'discount',discount,'taxRate',rate,'expenseAccountId',aid,'net',net,'tax',tax,'total',total);
  IF n.id IS NULL THEN
   INSERT INTO public.erp_purchase_credit_notes(id,cafe_id,source_document_id,branch_id,payload,created_by) VALUES(rid,c,original.id,b,v,auth.uid());
  ELSE UPDATE public.erp_purchase_credit_notes SET payload=v,revision=revision+1 WHERE cafe_id=c AND id=rid;END IF;
 ELSIF p_action='post' THEN
  PERFORM erp_purchase_private.authorize(c,'approve');
  IF n.status<>'draft' OR NOT coalesce((erp_purchase_private.settings(c)->>'allowCreditNotes')::boolean,false) THEN RAISE EXCEPTION 'الإشعار ليس مسودة أو الخاصية غير مفعلة';END IF;
  v:=n.payload;d:=(v->>'date')::date;PERFORM erp_purchase_private.period(c,d);aid:=(v->>'expenseAccountId')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=c AND id=aid AND active AND kind='expense') OR NOT erp_branch_private.allowed_resource(c,b,'account',aid) THEN RAISE EXCEPTION 'حساب المصروف لم يعد متاحًا للفرع';END IF;
  net:=(v->>'net')::numeric;tax:=(v->>'tax')::numeric;total:=(v->>'total')::numeric;
  IF (p->>'expectedTotal')::numeric IS DISTINCT FROM total THEN RAISE EXCEPTION 'راجع إجمالي الإشعار قبل الإصدار' USING ERRCODE='40001';END IF;
  doc:=gen_random_uuid();
  INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,reference_id,note,created_by,subtotal,tax,total,paid,created_at)
   VALUES(doc,c,'purchase',original.party_id,original.id,'إشعار دائن مشتريات '||n.code||' — '||(v->>'description'),auth.uid(),net,tax,total,0,d::timestamp AT TIME ZONE 'Asia/Riyadh');
  PERFORM erp_purchase_private.credit_bind(c,doc,b);
  PERFORM brand_finance_private.line(c,doc,aid,net,0);
  PERFORM brand_finance_private.line(c,doc,brand_finance_private.account(c,'1300'),tax,0);
  PERFORM brand_finance_private.line(c,doc,brand_finance_private.account(c,'2000'),0,total,original.party_id);
  PERFORM erp_purchase_private.balance(c,doc);
  INSERT INTO public.erp_purchase_credit_postings(cafe_id,note_id,document_id) VALUES(c,rid,doc);
  UPDATE public.erp_purchase_credit_notes SET document_id=doc,status='posted',revision=revision+1 WHERE cafe_id=c AND id=rid;
 ELSIF p_action='draft' THEN
  PERFORM erp_purchase_private.authorize(c,'approve');
  IF n.status<>'posted' OR n.document_id IS NULL THEN RAISE EXCEPTION 'الإشعار ليس مصدرًا';END IF;
  PERFORM erp_purchase_private.period(c,(now() AT TIME ZONE 'Asia/Riyadh')::date);PERFORM erp_purchase_private.period(c,(n.payload->>'date')::date);
  IF EXISTS(SELECT 1 FROM public.bf_documents WHERE cafe_id=c AND reference_id=n.document_id) OR EXISTS(SELECT 1 FROM public.erp_purchase_credit_uses WHERE cafe_id=c AND invoice_id=n.document_id) THEN RAISE EXCEPTION 'الإشعار مرتبط بدفعة أو معاملة لاحقة ولا يقبل التحويل إلى مسودة';END IF;
  revdoc:=gen_random_uuid();
  INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,reference_id,note,created_by,subtotal,tax,total,paid)
   VALUES(revdoc,c,'refund',original.party_id,n.document_id,'عكس إصدار الإشعار الدائن '||n.code,auth.uid(),(n.payload->>'net')::numeric,(n.payload->>'tax')::numeric,(n.payload->>'total')::numeric,0);
  PERFORM erp_purchase_private.credit_bind(c,revdoc,b);
  FOR entry IN SELECT * FROM public.bf_journal WHERE cafe_id=c AND document_id=n.document_id LOOP
   PERFORM brand_finance_private.line(c,revdoc,entry.account_id,entry.credit,entry.debit,entry.party_id);
  END LOOP;
  PERFORM erp_purchase_private.balance(c,revdoc);
  UPDATE public.erp_purchase_credit_postings SET reversal_document_id=revdoc WHERE cafe_id=c AND document_id=n.document_id AND reversal_document_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'سبق عكس إصدار الإشعار' USING ERRCODE='40001';END IF;
  UPDATE public.erp_purchase_credit_notes SET status='draft',document_id=NULL,revision=revision+1 WHERE cafe_id=c AND id=rid;
 ELSIF p_action='payment' THEN
  PERFORM erp_purchase_private.authorize(c,'approve');
  IF n.status<>'posted' OR n.document_id IS NULL THEN RAISE EXCEPTION 'أصدر الإشعار قبل دفعه';END IF;
  IF NOT coalesce(isfinite((p->>'date')::date),false) THEN RAISE EXCEPTION 'تاريخ الدفعة غير صالح';END IF;
  result:=jsonb_build_object('supplierId',original.party_id,'invoiceId',n.document_id,'accountId',p->'accountId','amount',p->'amount','date',p->'date','note','دفع إشعار دائن '||n.code);
  doc:=erp_purchase_private.payment(c,result);PERFORM erp_purchase_private.credit_bind(c,doc,b);
  UPDATE public.erp_purchase_credit_notes SET revision=revision+1 WHERE cafe_id=c AND id=rid;
 ELSIF p_action IN('delete','cancel') THEN
  PERFORM erp_purchase_private.authorize(c,'delete');
  IF n.status<>'draft' THEN RAISE EXCEPTION 'يمكن حذف أو إلغاء المسودة فقط';END IF;
  IF p_action='delete' THEN
   IF EXISTS(SELECT 1 FROM public.erp_purchase_credit_postings WHERE cafe_id=c AND note_id=rid) THEN RAISE EXCEPTION 'للإشعار تاريخ مالي استخدم الإلغاء للاحتفاظ به';END IF;
   DELETE FROM public.erp_purchase_credit_notes WHERE cafe_id=c AND id=rid;
  ELSE UPDATE public.erp_purchase_credit_notes SET status='cancelled',revision=revision+1 WHERE cafe_id=c AND id=rid;END IF;
 END IF;
 result:=jsonb_build_object('id',rid,'documentId',doc,'reversalId',revdoc,'sourceDocumentId',original.id,'branchId',b,'expenseAccountId',CASE WHEN p_action='save' THEN p->'expenseAccountId' ELSE n.payload->'expenseAccountId' END);
 INSERT INTO erp_purchase_private.requests VALUES(c,p_request,auth.uid(),'credit_note_'||p_action,p,result);
 INSERT INTO public.erp_purchase_events(cafe_id,record_id,action,payload,actor) VALUES(c,rid,'credit_note_'||p_action,result,auth.uid());
 RETURN result;
END $$;
INSERT INTO erp_branch_private.procedures(name,oid,domain,mutates) VALUES('erp_purchase_credit_write','public.erp_purchase_credit_write(uuid,text,jsonb,uuid)'::regprocedure,'purchases',true);
-- Keep the existing invoice view free of the additional payable's posting artifacts.
ALTER FUNCTION public.erp_purchases_read(uuid) RENAME TO purchases_read_before_credit_notes;
ALTER FUNCTION public.purchases_read_before_credit_notes(uuid) SET SCHEMA erp_purchase_private;
CREATE FUNCTION public.erp_purchases_read(p_cafe_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE j jsonb;BEGIN
 j:=erp_purchase_private.purchases_read_before_credit_notes(p_cafe_id);
 j:=jsonb_set(j,'{invoices}',coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements(j->'invoices')x WHERE NOT EXISTS(SELECT 1 FROM public.erp_purchase_credit_postings h WHERE h.cafe_id=p_cafe_id AND (h.document_id=(x->>'id')::uuid OR h.reversal_document_id=(x->>'id')::uuid))),'[]'));
 RETURN j||jsonb_build_object('creditNotes',public.erp_purchase_credit_read(p_cafe_id));
END $$;
REVOKE ALL ON FUNCTION erp_purchase_private.credit_number(),erp_purchase_private.credit_bind(uuid,uuid,uuid),erp_purchase_private.settings(uuid),erp_purchase_private.settings_before_credit_notes(uuid),erp_purchase_private.purchases_read_before_credit_notes(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_purchase_private.credit_setting_guard() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.erp_purchase_credit_read(uuid),public.erp_purchase_credit_write(uuid,text,jsonb,uuid),public.erp_purchases_read(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.erp_purchase_credit_read(uuid),public.erp_purchase_credit_write(uuid,text,jsonb,uuid),public.erp_purchases_read(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
