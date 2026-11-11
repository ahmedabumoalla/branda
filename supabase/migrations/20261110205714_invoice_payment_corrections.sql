BEGIN;
-- Original fiscal documents, stock and journal rows remain immutable
CREATE TABLE public.bf_invoice_payments (
 cafe_id uuid NOT NULL, source_id uuid PRIMARY KEY, invoice_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=20000),
 status text NOT NULL CHECK(status IN('completed','pending','deleted')),
 financial_at timestamptz NOT NULL,
 updated_by uuid NOT NULL REFERENCES auth.users(id), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(cafe_id,source_id) REFERENCES public.bf_documents(cafe_id,id),
 FOREIGN KEY(cafe_id,invoice_id) REFERENCES public.bf_documents(cafe_id,id)
);
CREATE INDEX bf_invoice_payments_invoice ON public.bf_invoice_payments(cafe_id,invoice_id);
CREATE INDEX bf_invoice_payments_actor ON public.bf_invoice_payments(updated_by);
CREATE TABLE public.bf_invoice_payment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cafe_id uuid NOT NULL, source_id uuid NOT NULL, invoice_id uuid NOT NULL,
 revision integer NOT NULL, action text NOT NULL CHECK(action IN('save','delete')),
 before_state jsonb NOT NULL, after_state jsonb NOT NULL, correction_id uuid,
 reason text NOT NULL DEFAULT '', created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(cafe_id,source_id,revision), FOREIGN KEY(cafe_id,source_id) REFERENCES public.bf_documents(cafe_id,id),
 FOREIGN KEY(cafe_id,invoice_id) REFERENCES public.bf_documents(cafe_id,id),
 FOREIGN KEY(cafe_id,correction_id) REFERENCES public.bf_documents(cafe_id,id)
);
CREATE INDEX bf_invoice_payment_events_invoice ON public.bf_invoice_payment_events(cafe_id,invoice_id,created_at DESC);
CREATE INDEX bf_invoice_payment_events_correction ON public.bf_invoice_payment_events(cafe_id,correction_id);
CREATE INDEX bf_invoice_payment_events_actor ON public.bf_invoice_payment_events(created_by);
ALTER TABLE public.bf_invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bf_invoice_payment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_invoice_payments,public.bf_invoice_payment_events FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.bf_invoice_payment_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION brand_finance_private.payment_document(d public.bf_documents) RETURNS public.bf_documents
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN p.source_id IS NULL THEN d ELSE jsonb_populate_record(d,
  jsonb_build_object('paid',CASE WHEN p.status='completed' THEN (p.payload->>'amount')::numeric ELSE 0 END,'account_id',p.payload->>'accountId')
  ||CASE WHEN d.kind='settlement' THEN jsonb_build_object('total',CASE WHEN p.status='completed' THEN (p.payload->>'amount')::numeric ELSE 0 END) ELSE '{}'::jsonb END) END
 FROM (SELECT 1) seed LEFT JOIN public.bf_invoice_payments p ON p.cafe_id=d.cafe_id AND p.source_id=d.id
$$;
REVOKE ALL ON FUNCTION brand_finance_private.payment_document(public.bf_documents) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION brand_finance_private.document_state(p_cafe uuid,p_doc uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('paid',d.paid,'account_id',d.account_id,
  'outstanding',CASE WHEN d.kind IN('sale','purchase') THEN greatest(d.total-d.paid-coalesce(s.paid,0)-coalesce(r.total,0)+coalesce(r.paid,0),0) ELSE 0 END,
  'refunded_total',coalesce(r.total,0),'refunded_paid',coalesce(r.paid,0),
  'refunded',d.kind IN('sale','purchase') AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(brand_finance_private.refund_lines(p_cafe,p_doc,false)) l WHERE (l->>'returned_quantity')::numeric<(l->>'quantity')::numeric),
  'reference_number',(SELECT number FROM public.bf_documents WHERE cafe_id=p_cafe AND id=d.reference_id))
  ||CASE WHEN d.kind='settlement' THEN jsonb_build_object('total',d.total) ELSE '{}'::jsonb END
 FROM (SELECT (brand_finance_private.payment_document(raw)).* FROM public.bf_documents raw WHERE cafe_id=p_cafe AND id=p_doc) d
 LEFT JOIN LATERAL(SELECT sum(total) total,sum(paid) paid FROM public.bf_documents WHERE cafe_id=p_cafe AND reference_id=d.id AND kind='refund') r ON true
 LEFT JOIN LATERAL(SELECT sum((brand_finance_private.payment_document(payment)).total) paid FROM public.bf_documents payment WHERE cafe_id=p_cafe AND reference_id=d.id AND kind='settlement') s ON true
$$;

CREATE FUNCTION brand_finance_private.payment_financial_guard(source public.bf_documents,invoice public.bf_documents,account uuid,financial_at timestamptz) RETURNS text
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE a public.bf_accounts%ROWTYPE; today date:=(now() AT TIME ZONE 'Asia/Riyadh')::date;
BEGIN
 IF EXISTS(SELECT 1 FROM public.bf_settings WHERE cafe_id=source.cafe_id AND (closed_through>=today OR closed_through>=(source.created_at AT TIME ZONE 'Asia/Riyadh')::date))
  OR EXISTS(SELECT 1 FROM public.bf_gl_periods WHERE cafe_id=source.cafe_id AND closed AND (today BETWEEN period_start AND period_end OR (source.created_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN period_start AND period_end)) THEN RETURN 'الفترة المالية للدفعة أو التصحيح مقفلة'; END IF;
 IF invoice.shift_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=source.cafe_id AND id=invoice.shift_id AND status<>'open') THEN RETURN 'وردية الفاتورة مغلقة أو في التسليم ولا يمكن تغيير مبالغها'; END IF;
 IF source.shift_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=source.cafe_id AND id=source.shift_id AND status<>'open') THEN RETURN 'وردية الدفعة مغلقة أو في التسليم'; END IF;
 IF EXISTS(SELECT 1 FROM public.bf_refund_requests WHERE cafe_id=source.cafe_id AND document_id=invoice.id AND status='pending') THEN RETURN 'راجع طلب المرتجع المعلق قبل تغيير الدفعة'; END IF;
 SELECT * INTO a FROM public.bf_accounts WHERE cafe_id=source.cafe_id AND id=account;
 IF NOT FOUND OR NOT a.active OR a.deleted_at IS NOT NULL OR a.frozen OR a.is_group THEN RETURN 'حساب التحصيل غير نشط أو مجمد'; END IF;
 IF a.is_cashier_drawer AND NOT EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=source.cafe_id AND id=coalesce(source.shift_id,invoice.shift_id) AND account_id=a.id AND status='open') THEN RETURN 'صندوق الكاشير لا يتبع وردية الفاتورة المفتوحة'; END IF;
 IF EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=source.cafe_id AND account_id=a.id AND status IN('open','handover') AND (status='handover' OR id IS DISTINCT FROM coalesce(source.shift_id,invoice.shift_id))) THEN RETURN 'حساب التحصيل مرتبط بعهدة وردية أخرى'; END IF;
 IF EXISTS(SELECT 1 FROM public.bf_terminal_fee_charges f WHERE f.cafe_id=source.cafe_id AND (f.source_document_id=source.id OR f.source_document_id IN(SELECT correction_id FROM public.bf_invoice_payment_events WHERE cafe_id=source.cafe_id AND source_id=source.id))) THEN RETURN 'الدفعة مرتبطة برسوم شبكة مرحلة وتتطلب تصحيح الرسوم المرتبطة أولًا'; END IF;
 IF a.kind='pos' AND EXISTS(SELECT 1 FROM public.bf_treasury_documents t JOIN public.bf_documents d ON d.cafe_id=t.cafe_id AND d.id=t.document_id WHERE t.cafe_id=source.cafe_id AND t.account_id=a.id AND t.operation='pos_settle' AND d.created_at>=financial_at AND NOT EXISTS(SELECT 1 FROM public.bf_treasury_documents rev WHERE rev.cafe_id=t.cafe_id AND rev.reverses_id=d.id)) THEN RETURN 'تمت تسوية الشبكة بعد هذه الدفعة ولا يمكن تغيير التحصيل المسوى'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.payment_financial_guard(public.bf_documents,public.bf_documents,uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION brand_finance_private.invoice_payment_record(source public.bf_documents,invoice public.bf_documents) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE p public.bf_invoice_payments%ROWTYPE; values jsonb; paid numeric; state text; account public.bf_accounts%ROWTYPE; collector uuid; guard text; deletion_guard text; editable boolean;
BEGIN
 SELECT * INTO p FROM public.bf_invoice_payments WHERE cafe_id=source.cafe_id AND source_id=source.id;
 state:=coalesce(p.status,'completed');
 values:=coalesce(p.payload,jsonb_build_object('amount',CASE WHEN source.kind='sale' THEN source.paid ELSE source.total END,'date',(source.created_at AT TIME ZONE 'Asia/Riyadh')::date,'accountId',source.account_id,'status','completed','collectorId',source.created_by,'reference','','details',CASE WHEN source.kind='sale' THEN '' ELSE source.note END,'receiptNote','','attachments','[]'::jsonb));
 paid:=CASE WHEN state='completed' THEN (values->>'amount')::numeric ELSE 0 END;
 SELECT * INTO account FROM public.bf_accounts WHERE cafe_id=source.cafe_id AND id=(values->>'accountId')::uuid;
 collector:=(values->>'collectorId')::uuid;
 guard:=brand_finance_private.payment_financial_guard(source,invoice,account.id,coalesce(p.financial_at,source.created_at));
 deletion_guard:=guard;
 IF invoice.party_id IS NULL AND paid>0 THEN deletion_guard:=coalesce(deletion_guard,'ربط العميل مطلوب قبل تحويل الدفعة إلى رصيد مستحق'); END IF;
 IF paid>0 AND (brand_finance_private.payment_document(invoice)).paid+coalesce((SELECT sum((brand_finance_private.payment_document(s)).total) FROM public.bf_documents s WHERE s.cafe_id=source.cafe_id AND s.reference_id=invoice.id AND s.kind='settlement'),0)-paid<coalesce((SELECT sum(r.paid) FROM public.bf_documents r WHERE r.cafe_id=source.cafe_id AND r.reference_id=invoice.id AND r.kind='refund'),0) THEN deletion_guard:=coalesce(deletion_guard,'لا يمكن حذف دفعة استندت إليها مبالغ معادة للعميل'); END IF;
 IF paid>0 AND brand_finance_private.treasury_balance(source.cafe_id,account.id)<paid THEN deletion_guard:=coalesce(deletion_guard,'رصيد حساب التحصيل لا يكفي لعكس هذه الدفعة'); END IF;
 editable:=coalesce(brand_finance_private.role_for(source.cafe_id),'') IN('owner','manager','accountant') AND state<>'deleted';
 RETURN jsonb_build_object('id',source.id,'invoiceId',invoice.id,'initial',source.id=invoice.id,'number',source.number,'revision',coalesce(p.revision,0),'status',state,
  'amount',(values->>'amount')::numeric,'effectiveAmount',paid,'date',values->>'date','accountId',account.id,'accountName',account.name,'method',account.kind,
  'collectorId',collector,'collectorName',coalesce((SELECT nullif(name,'') FROM public.bf_staff WHERE cafe_id=source.cafe_id AND user_id=collector),(SELECT nullif(full_name,'') FROM public.profiles WHERE id=collector),'مستخدم غير مسمى'),
  'reference',values->>'reference','details',values->>'details','receiptNote',values->>'receiptNote',
  'attachments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'name',f.original_name,'size',f.size_bytes) ORDER BY a.ordinality) FROM jsonb_array_elements_text(values->'attachments') WITH ORDINALITY a(id,ordinality) JOIN public.bf_company_invoice_files f ON f.id=a.id::uuid AND f.cafe_id=source.cafe_id AND f.uploaded),'[]'::jsonb),
  'canEdit',editable,'canChangeFinancials',editable AND guard IS NULL,'canDelete',editable AND (paid=0 OR deletion_guard IS NULL),'blockedReason',CASE WHEN state='deleted' THEN 'تم حذف الدفعة مع حفظ أثر التصحيح' ELSE coalesce(guard,deletion_guard) END);
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.invoice_payment_record(public.bf_documents,public.bf_documents) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.brand_finance_manage_invoice_payment(p_cafe_id uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source public.bf_documents%ROWTYPE; invoice public.bf_documents%ROWTYPE; existing public.bf_invoice_payments%ROWTYPE; prior public.bf_requests%ROWTYPE;
 old_value jsonb; new_value jsonb; before_record jsonb; after_record jsonb; requested_action text; state text; request uuid; input_source uuid; input_invoice uuid; old_account uuid; new_account uuid; collector uuid;
 old_paid numeric; new_paid numeric; collected numeric; refund_total numeric; refund_paid numeric; correction uuid; next_revision integer; reason text; guard text; account_row public.bf_accounts%ROWTYPE; amount numeric; financial_changed boolean; payment_date date; result jsonb; event_time timestamptz:=clock_timestamp();
BEGIN
 IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR octet_length(p_input::text)>30000 OR p_input::text ~* '"[-+]?(nan|infinity)"' THEN RAISE EXCEPTION 'Invalid input' USING ERRCODE='22023'; END IF;
 request:=(p_input->>'requestId')::uuid; input_source:=(p_input->>'paymentId')::uuid; input_invoice:=(p_input->>'invoiceId')::uuid; requested_action:=p_input->>'action';
 IF request IS NULL OR input_source IS NULL OR input_invoice IS NULL OR coalesce(requested_action,'') NOT IN('save','delete') OR coalesce((p_input->>'revision')::integer,-1)<0 THEN RAISE EXCEPTION 'Invalid input' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 SELECT * INTO prior FROM public.bf_requests WHERE cafe_id=p_cafe_id AND request_id=request;
 IF FOUND THEN
  IF prior.operation<>'invoice_payment' OR prior.payload<>p_input OR prior.created_by<>auth.uid() THEN RAISE EXCEPTION 'معرف الطلب مستخدم لعملية مختلفة' USING ERRCODE='40001'; END IF;
  RETURN prior.result||jsonb_build_object('duplicate',true);
 END IF;
 SELECT * INTO invoice FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=input_invoice AND kind='sale' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO source FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=input_source AND ((id=invoice.id AND kind='sale' AND paid>0) OR (reference_id=invoice.id AND kind='settlement' AND total>0)) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO existing FROM public.bf_invoice_payments WHERE cafe_id=p_cafe_id AND source_id=source.id FOR UPDATE;
 IF coalesce(existing.revision,0)<>(p_input->>'revision')::integer THEN RAISE EXCEPTION 'Payment revision conflict' USING ERRCODE='40001'; END IF;
 IF existing.status='deleted' THEN RAISE EXCEPTION 'الدفعة محذوفة ولا يمكن تعديلها'; END IF;
 before_record:=brand_finance_private.invoice_payment_record(source,invoice);
 old_value:=coalesce(existing.payload,jsonb_build_object('amount',CASE WHEN source.kind='sale' THEN source.paid ELSE source.total END,'date',(source.created_at AT TIME ZONE 'Asia/Riyadh')::date,'accountId',source.account_id,'status','completed','collectorId',source.created_by,'reference','','details',CASE WHEN source.kind='sale' THEN '' ELSE source.note END,'receiptNote','','attachments','[]'::jsonb));
 old_paid:=(before_record->>'effectiveAmount')::numeric;old_account:=(old_value->>'accountId')::uuid;
 IF requested_action='delete' THEN
  reason:=btrim(coalesce(p_input->>'reason','')); IF length(reason) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'أدخل سبب حذف الدفعة'; END IF;
  new_value:=old_value; state:='deleted';new_paid:=0;new_account:=old_account;
 ELSE
  new_value:=p_input->'payload';state:=new_value->>'status';
  IF jsonb_typeof(new_value) IS DISTINCT FROM 'object' OR coalesce(state,'') NOT IN('completed','pending') OR jsonb_typeof(new_value->'amount') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'راجع بيانات الدفعة'; END IF;
  amount:=(new_value->>'amount')::numeric;
  IF amount<0.01 OR amount>1000000000 OR amount<>round(amount,2) OR coalesce(new_value->>'date','') !~ '^\d{4}-\d{2}-\d{2}$'
   OR jsonb_typeof(new_value->'reference') IS DISTINCT FROM 'string' OR length(new_value->>'reference')>160
   OR jsonb_typeof(new_value->'details') IS DISTINCT FROM 'string' OR length(new_value->>'details')>1000
   OR jsonb_typeof(new_value->'receiptNote') IS DISTINCT FROM 'string' OR length(new_value->>'receiptNote')>500
   OR jsonb_typeof(new_value->'attachments') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'راجع مبلغ الدفعة وتاريخها وأطوال الحقول'; END IF;
  payment_date:=(new_value->>'date')::date;
  IF NOT isfinite(payment_date) OR payment_date>(now() AT TIME ZONE 'Asia/Riyadh')::date THEN RAISE EXCEPTION 'اختر تاريخ تحصيل صحيحًا لا يتجاوز اليوم'; END IF;
  new_account:=nullif(new_value->>'accountId','')::uuid;collector:=nullif(new_value->>'collectorId','')::uuid;
  SELECT * INTO account_row FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=new_account AND kind IN('cash','bank','pos');
  IF NOT FOUND THEN RAISE EXCEPTION 'اختر حساب تحصيل تابعًا للعلامة'; END IF;
  IF collector IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=collector AND status='active') OR NOT (EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND owner_user_id=collector) OR EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=p_cafe_id AND user_id=collector AND active AND role IN('manager','accountant','cashier'))) THEN RAISE EXCEPTION 'اختر محصلًا نشطًا تابعًا للعلامة'; END IF;
  IF jsonb_array_length(new_value->'attachments')>20 OR (SELECT count(*)<>count(DISTINCT value) FROM jsonb_array_elements_text(new_value->'attachments')) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(new_value->'attachments') a WHERE NOT EXISTS(SELECT 1 FROM public.bf_company_invoice_files f WHERE f.cafe_id=p_cafe_id AND f.id=a::uuid AND f.uploaded)) THEN RAISE EXCEPTION 'أحد المرفقات غير جاهز أو لا يتبع العلامة'; END IF;
  new_paid:=CASE WHEN state='completed' THEN amount ELSE 0 END;
 END IF;
 financial_changed:=new_paid<>old_paid OR (new_paid>0 AND new_account IS DISTINCT FROM old_account);
 IF financial_changed THEN
  guard:=brand_finance_private.payment_financial_guard(source,invoice,old_account,coalesce(existing.financial_at,source.created_at));
  IF guard IS NOT NULL THEN RAISE EXCEPTION '%',guard; END IF;
  SELECT * INTO account_row FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=new_account;
  IF NOT FOUND OR NOT account_row.active OR account_row.deleted_at IS NOT NULL OR account_row.frozen OR account_row.is_group THEN RAISE EXCEPTION 'حساب التحصيل الجديد غير نشط أو مجمد'; END IF;
  IF account_row.is_cashier_drawer AND NOT EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND id=coalesce(source.shift_id,invoice.shift_id) AND account_id=new_account AND status='open') THEN RAISE EXCEPTION 'اختر صندوق وردية الفاتورة المفتوحة أو حسابًا إداريًا'; END IF;
  IF EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND account_id=new_account AND status IN('open','handover') AND (status='handover' OR id IS DISTINCT FROM coalesce(source.shift_id,invoice.shift_id))) THEN RAISE EXCEPTION 'حساب التحصيل الجديد مرتبط بعهدة وردية أخرى'; END IF;
  SELECT (brand_finance_private.payment_document(invoice)).paid+coalesce(sum((brand_finance_private.payment_document(d)).total),0) INTO collected FROM public.bf_documents d WHERE cafe_id=p_cafe_id AND reference_id=invoice.id AND kind='settlement';
  SELECT coalesce(sum(total),0),coalesce(sum(paid),0) INTO refund_total,refund_paid FROM public.bf_documents WHERE cafe_id=p_cafe_id AND reference_id=invoice.id AND kind='refund';
  collected:=collected-old_paid+new_paid;
  IF collected<refund_paid THEN RAISE EXCEPTION 'لا يمكن خفض التحصيل عن المبالغ المعادة للعميل'; END IF;
  IF collected>invoice.total-refund_total+refund_paid THEN RAISE EXCEPTION 'قيمة الدفعة تتجاوز الرصيد المتاح للفاتورة'; END IF;
  IF invoice.party_id IS NULL AND collected<invoice.total-refund_total+refund_paid THEN RAISE EXCEPTION 'ربط العميل مطلوب قبل تحويل الدفعة إلى رصيد مستحق'; END IF;
  PERFORM brand_finance_private.gl_date_open(p_cafe_id,(now() AT TIME ZONE 'Asia/Riyadh')::date);
  correction:=gen_random_uuid();
  INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,account_id,shift_id,total,reference_id,note,created_by)
   VALUES(correction,p_cafe_id,'journal',invoice.party_id,new_account,coalesce(source.shift_id,invoice.shift_id),abs(new_paid-old_paid),source.id,CASE WHEN requested_action='delete' THEN 'حذف دفعة بتصحيح محاسبي: '||reason ELSE 'تصحيح دفعة الفاتورة رقم '||invoice.number END,auth.uid());
  IF old_account=new_account THEN
   PERFORM brand_finance_private.line(p_cafe_id,correction,new_account,greatest(new_paid-old_paid,0),greatest(old_paid-new_paid,0));
  ELSE
   PERFORM brand_finance_private.line(p_cafe_id,correction,old_account,0,old_paid);
   PERFORM brand_finance_private.line(p_cafe_id,correction,new_account,new_paid,0);
  END IF;
  PERFORM brand_finance_private.line(p_cafe_id,correction,brand_finance_private.account(p_cafe_id,'1100'),greatest(old_paid-new_paid,0),greatest(new_paid-old_paid,0),invoice.party_id);
  IF EXISTS(SELECT 1 FROM public.bf_accounts a WHERE a.cafe_id=p_cafe_id AND a.id IN(old_account,new_account) AND a.kind IN('cash','bank','pos') AND coalesce((SELECT sum(j.debit-j.credit) FROM public.bf_journal j WHERE j.cafe_id=p_cafe_id AND j.account_id=a.id),0)<0) THEN RAISE EXCEPTION 'التصحيح سيجعل رصيد حساب التحصيل سالبًا'; END IF;
  IF account_row.kind='pos' AND (new_paid>old_paid OR (new_paid>0 AND old_account<>new_account)) THEN
   PERFORM brand_finance_private.terminal_monthly_ensure(p_cafe_id);
   PERFORM brand_finance_private.terminal_fee_accrue(p_cafe_id,new_account,correction,NULL,CASE WHEN old_account=new_account THEN new_paid-old_paid ELSE new_paid END);
  END IF;
 END IF;
 next_revision:=coalesce(existing.revision,0)+1;
 INSERT INTO public.bf_invoice_payments(cafe_id,source_id,invoice_id,revision,payload,status,financial_at,updated_by)
  VALUES(p_cafe_id,source.id,invoice.id,next_revision,new_value,state,CASE WHEN financial_changed THEN event_time ELSE coalesce(existing.financial_at,source.created_at) END,auth.uid())
  ON CONFLICT(source_id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,status=excluded.status,financial_at=excluded.financial_at,updated_by=excluded.updated_by,updated_at=clock_timestamp();
 after_record:=brand_finance_private.invoice_payment_record(source,invoice);
 INSERT INTO public.bf_invoice_payment_events(cafe_id,source_id,invoice_id,revision,action,before_state,after_state,correction_id,reason,created_by)
  VALUES(p_cafe_id,source.id,invoice.id,next_revision,requested_action,before_record,after_record,correction,coalesce(reason,''),auth.uid());
 INSERT INTO public.bf_invoice_activity(cafe_id,document_id,action,created_by) VALUES(p_cafe_id,invoice.id,CASE WHEN requested_action='delete' THEN 'حذف دفعة بتصحيح محاسبي' WHEN financial_changed THEN 'تعديل تحصيل دفعة' ELSE 'تعديل بيانات دفعة' END,auth.uid());
 result:=jsonb_build_object('id',source.id,'revision',next_revision,'duplicate',false);
 INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by) VALUES(p_cafe_id,request,'invoice_payment',p_input,result,auth.uid());
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_manage_invoice_payment(uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_manage_invoice_payment(uuid,jsonb) TO authenticated;

-- Keep every existing authorization boundary; amend only payment reads
DO $patch$
DECLARE body text; old text; item regprocedure;
BEGIN
 item:='public.brand_finance_invoice_detail(uuid,uuid)'::regprocedure;
 SELECT pg_get_functiondef(item) INTO body;
 old:='RETURN jsonb_build_object(';
 IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Unexpected invoice detail baseline'; END IF;
 body:=replace(body,old,$replacement$RETURN jsonb_build_object(
 'payments',coalesce((SELECT jsonb_agg(brand_finance_private.invoice_payment_record(payment,source) ORDER BY payment.created_at,payment.id) FROM public.bf_documents payment WHERE payment.cafe_id=p_cafe_id AND ((payment.id=p_id AND payment.paid>0) OR (payment.reference_id=p_id AND payment.kind='settlement' AND payment.total>0))),'[]'::jsonb),
 'paymentCollectors',coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',u.name) ORDER BY u.name,u.id) FROM (SELECT c.owner_user_id id,coalesce(nullif(p.full_name,''),'مالك العلامة') name FROM public.cafes c JOIN public.profiles p ON p.id=c.owner_user_id AND p.status='active' WHERE c.id=p_cafe_id UNION SELECT s.user_id,coalesce(nullif(s.name,''),nullif(p.full_name,''),'مستخدم غير مسمى') FROM public.bf_staff s JOIN public.profiles p ON p.id=s.user_id AND p.status='active' WHERE s.cafe_id=p_cafe_id AND s.active AND s.role IN('manager','accountant','cashier') AND s.user_id<>(SELECT owner_user_id FROM public.cafes WHERE id=p_cafe_id)) u),'[]'::jsonb),$replacement$);
 EXECUTE body;
 item:='public.brand_finance_shift_analytics(uuid,uuid)'::regprocedure;
 SELECT pg_get_functiondef(item) INTO body;
 old:='SELECT d.* FROM public.bf_documents d';
 IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Unexpected shift analytics baseline'; END IF;
 EXECUTE replace(body,old,'SELECT (brand_finance_private.payment_document(d)).* FROM public.bf_documents d');
 item:='brand_finance_private.pos_report_before_supplier_payout(uuid,uuid)'::regprocedure;
 SELECT pg_get_functiondef(item) INTO body;
 old:='SELECT d.id,d.total,d.paid,d.account_id FROM public.bf_documents d';
 IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Unexpected POS report sales baseline'; END IF;
 body:=replace(body,old,'SELECT d.id,d.total,(brand_finance_private.payment_document(d)).paid paid,(brand_finance_private.payment_document(d)).account_id account_id FROM public.bf_documents d');
 old:='SELECT d.kind,d.total,d.paid,d.account_id FROM public.bf_documents d';
 IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Unexpected POS report related baseline'; END IF;
 EXECUTE replace(body,old,'SELECT d.kind,(brand_finance_private.payment_document(d)).total total,(brand_finance_private.payment_document(d)).paid paid,(brand_finance_private.payment_document(d)).account_id account_id FROM public.bf_documents d');
 item:='brand_finance_private.post_refund(uuid,jsonb,uuid)'::regprocedure;
 SELECT pg_get_functiondef(item) INTO body;
 old:='aid:=original.account_id;';
 IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Unexpected refund account baseline'; END IF;
 body:=replace(body,old,'aid:=CASE WHEN (brand_finance_private.payment_document(original)).paid>0 THEN (brand_finance_private.payment_document(original)).account_id ELSE NULL END;');
 old:='SELECT account_id INTO aid FROM public.bf_documents WHERE cafe_id=p_cafe AND reference_id=original.id AND kind=''settlement'' ORDER BY created_at DESC,id LIMIT 1;';
 IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Unexpected refund settlement baseline'; END IF;
 EXECUTE replace(body,old,'SELECT (brand_finance_private.payment_document(d)).account_id INTO aid FROM public.bf_documents d WHERE cafe_id=p_cafe AND reference_id=original.id AND kind=''settlement'' AND (brand_finance_private.payment_document(d)).paid>0 ORDER BY created_at DESC,id LIMIT 1;');
 item:='brand_finance_private.customer_message_receipt(uuid,uuid)'::regprocedure;
 SELECT pg_get_functiondef(item) INTO body;
 old:='''paid'',d.paid';
 IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Unexpected customer receipt baseline'; END IF;
 body:=replace(body,old,'''paid'',coalesce((state.value->>''paid'')::numeric,d.paid)');
 EXECUTE replace(body,'a.id=d.account_id','a.id=(brand_finance_private.payment_document(d)).account_id');
END $patch$;
NOTIFY pgrst,'reload schema';
COMMIT;
