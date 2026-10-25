-- Expected bank fees are liabilities until actually deducted from merchant funds
BEGIN;
ALTER TABLE public.bf_accounts
 ADD COLUMN transaction_fee_percent numeric(7,4) NOT NULL DEFAULT 0 CHECK(transaction_fee_percent BETWEEN 0 AND 100),
 ADD COLUMN monthly_subscription numeric(16,2) NOT NULL DEFAULT 0 CHECK(monthly_subscription>=0 AND monthly_subscription<>'NaN'::numeric),
 ADD COLUMN fee_vat_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK(fee_vat_rate BETWEEN 0 AND 100),
 ADD COLUMN fee_started_month date;
ALTER TABLE public.bf_treasury_documents
 ADD COLUMN category text NOT NULL DEFAULT '',
 ADD COLUMN subcategory text NOT NULL DEFAULT '',
 ADD COLUMN cost_center text NOT NULL DEFAULT '' CHECK(length(cost_center)<=100);

CREATE TABLE public.bf_terminal_fee_charges(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,terminal_id uuid NOT NULL,bank_id uuid NOT NULL,
 terminal_name text NOT NULL,bank_name text NOT NULL,document_id uuid NOT NULL UNIQUE,source_document_id uuid,
 kind text NOT NULL CHECK(kind IN('transaction','monthly')),billing_month date,
 base_amount numeric(16,2) NOT NULL,fee_percent numeric(7,4) NOT NULL,vat_rate numeric(5,2) NOT NULL,
 fee numeric(16,2) NOT NULL CHECK(fee>=0),tax numeric(16,2) NOT NULL CHECK(tax>=0),
 total numeric(16,2) GENERATED ALWAYS AS(fee+tax) STORED,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(cafe_id,id),FOREIGN KEY(cafe_id,terminal_id) REFERENCES public.bf_accounts(cafe_id,id),
 FOREIGN KEY(cafe_id,bank_id) REFERENCES public.bf_accounts(cafe_id,id),
 FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),
 FOREIGN KEY(cafe_id,source_document_id) REFERENCES public.bf_documents(cafe_id,id));
CREATE UNIQUE INDEX bf_terminal_transaction_once ON public.bf_terminal_fee_charges(cafe_id,terminal_id,source_document_id) WHERE kind='transaction';
CREATE UNIQUE INDEX bf_terminal_month_once ON public.bf_terminal_fee_charges(cafe_id,terminal_id,billing_month) WHERE kind='monthly';
CREATE INDEX bf_terminal_fee_history ON public.bf_terminal_fee_charges(cafe_id,terminal_id,created_at,id);
CREATE INDEX bf_terminal_fee_bank_history ON public.bf_terminal_fee_charges(cafe_id,bank_id,created_at DESC,id DESC);
CREATE TABLE public.bf_terminal_fee_allocations(
 cafe_id uuid NOT NULL,charge_id uuid NOT NULL,document_id uuid NOT NULL,amount numeric(16,2) NOT NULL CHECK(amount>0 AND amount<>'NaN'::numeric),
 PRIMARY KEY(charge_id,document_id),FOREIGN KEY(cafe_id,charge_id) REFERENCES public.bf_terminal_fee_charges(cafe_id,id),
 FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id));
CREATE INDEX bf_terminal_allocation_document ON public.bf_terminal_fee_allocations(cafe_id,document_id);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['bf_terminal_fee_charges','bf_terminal_fee_allocations'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
 EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable()',t);
END LOOP; END $$;

CREATE FUNCTION brand_finance_private.terminal_fee_paid(p_cafe uuid,p_charge uuid) RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(sum(a.amount),0) FROM public.bf_terminal_fee_allocations a WHERE a.cafe_id=p_cafe AND a.charge_id=p_charge
 AND NOT EXISTS(SELECT 1 FROM public.bf_treasury_documents r WHERE r.cafe_id=a.cafe_id AND r.reverses_id=a.document_id)
$$;
CREATE FUNCTION brand_finance_private.terminal_fees_due(p_cafe uuid,p_terminal uuid) RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(sum(c.total-brand_finance_private.terminal_fee_paid(p_cafe,c.id)),0) FROM public.bf_terminal_fee_charges c WHERE c.cafe_id=p_cafe AND c.terminal_id=p_terminal
$$;
CREATE FUNCTION brand_finance_private.terminal_fee_seed(p_cafe uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 INSERT INTO public.bf_accounts(cafe_id,code,name,kind) VALUES
 (p_cafe,'2010','رسوم الشبكات المستحقة','payable'),(p_cafe,'5110','عمولات واشتراكات الشبكات','expense'),
 (p_cafe,'4010','الإيرادات الأخرى','revenue'),(p_cafe,'3010','مسحوبات المالك','equity') ON CONFLICT(cafe_id,code) DO NOTHING;
END $$;
CREATE FUNCTION brand_finance_private.terminal_fee_accrue(p_cafe uuid,p_terminal uuid,p_source uuid,p_month date,p_base numeric) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.bf_accounts%ROWTYPE; f numeric; tax numeric; doc uuid:=gen_random_uuid(); k text; bank_label text;
BEGIN
 SELECT * INTO a FROM public.bf_accounts WHERE cafe_id=p_cafe AND id=p_terminal AND kind='pos' AND active;
 IF NOT FOUND OR a.linked_bank_id IS NULL THEN RETURN; END IF;
 k:=CASE WHEN p_month IS NULL THEN 'transaction' ELSE 'monthly' END;
 IF EXISTS(SELECT 1 FROM public.bf_terminal_fee_charges WHERE cafe_id=p_cafe AND terminal_id=p_terminal AND kind=k AND (source_document_id=p_source OR billing_month=p_month)) THEN RETURN; END IF;
 f:=CASE WHEN k='monthly' THEN a.monthly_subscription ELSE round(p_base*a.transaction_fee_percent/100,2) END;
 IF f<=0 THEN RETURN; END IF;
 tax:=round(f*a.fee_vat_rate/100,2);
 PERFORM brand_finance_private.terminal_fee_seed(p_cafe);
 SELECT name INTO bank_label FROM public.bf_accounts WHERE id=a.linked_bank_id AND cafe_id=p_cafe;
 INSERT INTO public.bf_documents(id,cafe_id,kind,account_id,reference_id,subtotal,tax,total,paid,note,created_by)
 VALUES(doc,p_cafe,'expense',p_terminal,p_source,f,tax,f+tax,0,CASE WHEN k='monthly' THEN 'اشتراك شبكة عن شهر '||p_month::text ELSE 'عمولة شبكة على التحصيل' END,auth.uid());
 PERFORM brand_finance_private.line(p_cafe,doc,brand_finance_private.account(p_cafe,'5110'),f,0);
 PERFORM brand_finance_private.line(p_cafe,doc,brand_finance_private.account(p_cafe,'1300'),tax,0);
 PERFORM brand_finance_private.line(p_cafe,doc,brand_finance_private.account(p_cafe,'2010'),0,f+tax);
 INSERT INTO public.bf_terminal_fee_charges(cafe_id,terminal_id,bank_id,terminal_name,bank_name,document_id,source_document_id,kind,billing_month,base_amount,fee_percent,vat_rate,fee,tax)
 VALUES(p_cafe,p_terminal,a.linked_bank_id,a.name,bank_label,doc,p_source,k,p_month,p_base,a.transaction_fee_percent,a.fee_vat_rate,f,tax);
END $$;
CREATE FUNCTION brand_finance_private.terminal_monthly_ensure(p_cafe uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a record; month_value date; closed date; current_month date:=date_trunc('month',now() AT TIME ZONE 'Asia/Riyadh')::date;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,60412));
 SELECT closed_through INTO closed FROM public.bf_settings WHERE cafe_id=p_cafe;
 -- Never post into a closed current period. Catch-up stays observable on next open posting date
 IF closed>=(now() AT TIME ZONE 'Asia/Riyadh')::date THEN RETURN; END IF;
 FOR a IN SELECT id,fee_started_month FROM public.bf_accounts WHERE cafe_id=p_cafe AND kind='pos' AND active AND monthly_subscription>0 AND fee_started_month IS NOT NULL LOOP
  FOR month_value IN SELECT generate_series(a.fee_started_month,current_month,interval '1 month')::date LOOP
   PERFORM brand_finance_private.terminal_fee_accrue(p_cafe,a.id,NULL,month_value,0);
  END LOOP;
 END LOOP;
END $$;
CREATE FUNCTION brand_finance_private.terminal_sale_fee() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE d public.bf_documents%ROWTYPE;
BEGIN
 IF NEW.debit<=0 OR NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=NEW.cafe_id AND id=NEW.account_id AND kind='pos') THEN RETURN NEW; END IF;
 SELECT * INTO d FROM public.bf_documents WHERE cafe_id=NEW.cafe_id AND id=NEW.document_id;
 IF d.kind='sale' OR (d.kind='settlement' AND EXISTS(SELECT 1 FROM public.bf_documents WHERE cafe_id=d.cafe_id AND id=d.reference_id AND kind='sale')) THEN
  PERFORM brand_finance_private.terminal_monthly_ensure(NEW.cafe_id);
  PERFORM brand_finance_private.terminal_fee_accrue(NEW.cafe_id,NEW.account_id,NEW.document_id,NULL,NEW.debit);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bf_terminal_sale_fee AFTER INSERT ON public.bf_journal FOR EACH ROW EXECUTE FUNCTION brand_finance_private.terminal_sale_fee();

CREATE FUNCTION brand_finance_private.terminal_fee_allocate(p_cafe uuid,p_terminal uuid,p_doc uuid,p_amount numeric) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c record; remaining numeric:=p_amount; part numeric;
BEGIN
 IF p_amount>brand_finance_private.terminal_fees_due(p_cafe,p_terminal) THEN RAISE EXCEPTION 'مبلغ الرسوم المسددة يتجاوز الرسوم المستحقة'; END IF;
 FOR c IN SELECT id,total-brand_finance_private.terminal_fee_paid(p_cafe,id) due FROM public.bf_terminal_fee_charges WHERE cafe_id=p_cafe AND terminal_id=p_terminal ORDER BY created_at,id LOOP
  EXIT WHEN remaining<=0;
  part:=least(c.due,remaining);
  IF part>0 THEN INSERT INTO public.bf_terminal_fee_allocations(cafe_id,charge_id,document_id,amount) VALUES(p_cafe,c.id,p_doc,part); remaining:=remaining-part; END IF;
 END LOOP;
END $$;




CREATE OR REPLACE FUNCTION public.brand_finance_treasury_execute(p_cafe_id uuid,p_operation text,p_payload jsonb,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); r text; prior public.bf_requests%ROWTYPE; a public.bf_accounts%ROWTYPE; b public.bf_accounts%ROWTYPE;
 aid uuid; other_id uuid; doc uuid:=gen_random_uuid(); n bigint; amount numeric; fee numeric; counted numeric; balance numeric; note text; result jsonb; before_row jsonb; k text; linked uuid; category text; subcategory text; center text; fee_mode text; due numeric;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 r:=brand_finance_private.role_for(p_cafe_id);
 IF r NOT IN('owner','manager') THEN RAISE EXCEPTION 'Finance manager required' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>100000 OR p_payload::text ~* '"[-+]?(nan|infinity)"' THEN RAISE EXCEPTION 'Invalid command'; END IF;
 SELECT * INTO prior FROM public.bf_requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.operation<>'treasury:'||p_operation OR prior.payload<>p_payload OR prior.created_by<>actor THEN RAISE EXCEPTION 'Request identifier conflict'; END IF;
  RETURN prior.result||'{"duplicate":true}'::jsonb;
 END IF;
 PERFORM brand_finance_private.treasury_seed(p_cafe_id);
 IF EXISTS(SELECT 1 FROM public.bf_settings WHERE cafe_id=p_cafe_id AND closed_through>=(now() AT TIME ZONE 'Asia/Riyadh')::date) THEN RAISE EXCEPTION 'الفترة المالية مقفلة'; END IF;
 PERFORM brand_finance_private.terminal_monthly_ensure(p_cafe_id);
 note:=btrim(coalesce(p_payload->>'note',''));
 IF length(note)>1000 THEN RAISE EXCEPTION 'Note too long'; END IF;
 aid:=nullif(p_payload->>'accountId','')::uuid;
 IF p_operation='account_save' THEN aid:=nullif(p_payload->>'id','')::uuid; END IF;
 IF aid IS NOT NULL THEN
  SELECT * INTO a FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=aid;
  IF NOT FOUND OR a.kind NOT IN('cash','bank','pos') THEN RAISE EXCEPTION 'Invalid treasury account'; END IF;
  before_row:=to_jsonb(a)-'cafe_id';
 END IF;
 IF p_operation='account_save' THEN
  k:=p_payload->>'kind'; linked:=nullif(p_payload->>'linkedBankId','')::uuid;
  IF k NOT IN('cash','bank','pos') OR length(btrim(coalesce(p_payload->>'name',''))) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid treasury account'; END IF;
  IF k='pos' AND linked IS NULL THEN RAISE EXCEPTION 'اختر البنك المرتبط بنقطة الشبكة'; END IF;
  IF k<>'pos' AND linked IS NOT NULL THEN RAISE EXCEPTION 'Only POS accounts can link a bank'; END IF;
  IF aid IS NULL THEN
   aid:=gen_random_uuid();
   INSERT INTO public.bf_accounts(id,cafe_id,name,code,kind,linked_bank_id,bank_name,iban,terminal_id)
   VALUES(aid,p_cafe_id,btrim(p_payload->>'name'),'T-'||replace(aid::text,'-',''),k,linked,coalesce(p_payload->>'bankName',''),upper(replace(coalesce(p_payload->>'iban',''),' ','')),coalesce(p_payload->>'terminalId',''));
  ELSE
   IF a.kind<>k OR NOT a.active OR p_payload ? 'openingAmount' THEN RAISE EXCEPTION 'الرصيد الافتتاحي يسجل من إجراء مستقل لمرة واحدة'; END IF;
   UPDATE public.bf_accounts SET name=btrim(p_payload->>'name'),linked_bank_id=linked,bank_name=coalesce(p_payload->>'bankName',''),iban=upper(replace(coalesce(p_payload->>'iban',''),' ','')),terminal_id=coalesce(p_payload->>'terminalId','') WHERE id=aid;
  END IF;
  IF k<>'pos' AND ((p_payload ? 'transactionFeePercent') OR (p_payload ? 'monthlySubscription') OR (p_payload ? 'feeVatRate')) THEN RAISE EXCEPTION 'إعدادات الرسوم متاحة لنقاط الشبكة فقط'; END IF;
  IF k='pos' THEN
   UPDATE public.bf_accounts SET transaction_fee_percent=coalesce((p_payload->>'transactionFeePercent')::numeric,transaction_fee_percent),
    monthly_subscription=coalesce((p_payload->>'monthlySubscription')::numeric,monthly_subscription),
    fee_vat_rate=coalesce((p_payload->>'feeVatRate')::numeric,fee_vat_rate),
    fee_started_month=CASE WHEN coalesce((p_payload->>'monthlySubscription')::numeric,monthly_subscription)>0 THEN coalesce(fee_started_month,date_trunc('month',now() AT TIME ZONE 'Asia/Riyadh')::date) ELSE NULL END
   WHERE id=aid;
   PERFORM brand_finance_private.terminal_monthly_ensure(p_cafe_id);
  END IF;
  IF p_payload ? 'openingAmount' THEN
   amount:=round((p_payload->>'openingAmount')::numeric,2);
   IF amount IS NULL OR amount<0 THEN RAISE EXCEPTION 'Invalid opening amount'; END IF;
   UPDATE public.bf_accounts SET opening_recorded_at=now(),opening_amount=amount WHERE id=aid;
   INSERT INTO public.bf_documents(id,cafe_id,kind,account_id,total,paid,note,created_by) VALUES(doc,p_cafe_id,'opening',aid,amount,amount,note,actor) RETURNING number INTO n;
   PERFORM brand_finance_private.line(p_cafe_id,doc,aid,amount,0);
   PERFORM brand_finance_private.line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'3000'),0,amount);
   INSERT INTO public.bf_treasury_documents(cafe_id,document_id,operation) VALUES(p_cafe_id,doc,'opening');
  END IF;
  result:=jsonb_build_object('id',aid,'document_id',CASE WHEN n IS NOT NULL THEN doc ELSE NULL END,'number',n);
 ELSIF p_operation='account_archive' THEN
  IF aid IS NULL OR NOT (p_payload ? 'active') OR jsonb_typeof(p_payload->'active')<>'boolean' THEN RAISE EXCEPTION 'Invalid archive request'; END IF;
  UPDATE public.bf_accounts SET active=(p_payload->>'active')::boolean WHERE id=aid;
  result:=jsonb_build_object('id',aid);
 ELSE
  IF aid IS NULL OR NOT a.active THEN RAISE EXCEPTION 'اختر حسابا نشطا'; END IF;
  balance:=brand_finance_private.treasury_balance(p_cafe_id,aid);
  amount:=round((p_payload->>'amount')::numeric,2);
  IF p_operation='reconcile' THEN
   counted:=round((p_payload->>'countedAmount')::numeric,2);
   IF counted IS NULL OR counted<0 OR (p_payload->>'expectedBalance')::numeric IS DISTINCT FROM balance THEN RAISE EXCEPTION 'تغير الرصيد حدث البيانات ثم أعد المطابقة'; END IF;
   INSERT INTO public.bf_treasury_reconciliations(id,cafe_id,account_id,expected_amount,counted_amount,note,created_by) VALUES(doc,p_cafe_id,aid,balance,counted,note,actor);
   result:=jsonb_build_object('id',doc,'difference',counted-balance);
  ELSE
   IF amount IS NULL OR amount<0 OR (p_operation NOT IN('opening','pos_settle','pos_fee_pay') AND amount=0) THEN RAISE EXCEPTION 'Invalid amount'; END IF;
   IF p_operation='opening' THEN
    IF a.opening_recorded_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.bf_journal WHERE cafe_id=p_cafe_id AND account_id=aid) OR EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND account_id=aid AND status IN('open','handover')) THEN RAISE EXCEPTION 'سبق بدء الحساب ولا يمكن تكرار الرصيد الافتتاحي'; END IF;
    UPDATE public.bf_accounts SET opening_recorded_at=now(),opening_amount=amount WHERE id=aid;
    k:='opening'; other_id:=brand_finance_private.account(p_cafe_id,'3000');
   ELSIF p_operation='voucher' THEN
    k:=p_payload->>'kind'; other_id:=nullif(p_payload->>'counterAccountId','')::uuid;
    category:=coalesce(p_payload->>'category',''); subcategory:=coalesce(p_payload->>'subcategory',''); center:=btrim(coalesce(p_payload->>'costCenter',''));
    IF length(center)>100 THEN RAISE EXCEPTION 'اسم مركز التكلفة يجب ألا يتجاوز مئة حرف'; END IF;
    IF category<>'' THEN
     IF NOT ((k='receipt' AND category IN('other_income','owner_funding')) OR (k='expense' AND category IN('operating_expense','owner_draw'))) THEN RAISE EXCEPTION 'اختر تصنيفا مناسبا لسند القبض أو الصرف'; END IF;
     IF subcategory<>'' AND (category<>'operating_expense' OR subcategory NOT IN('rent','utilities','maintenance','wages','other')) THEN RAISE EXCEPTION 'اختر تصنيفا فرعيا صحيحا للمصروف التشغيلي'; END IF;
     PERFORM brand_finance_private.terminal_fee_seed(p_cafe_id);
     linked:=brand_finance_private.account(p_cafe_id,CASE category WHEN 'other_income' THEN '4010' WHEN 'owner_funding' THEN '3000' WHEN 'owner_draw' THEN '3010' ELSE '5100' END);
     IF other_id IS NOT NULL AND other_id<>linked THEN RAISE EXCEPTION 'الحساب المقابل لا يطابق تصنيف السند'; END IF;
     other_id:=linked;
    ELSIF subcategory<>'' THEN RAISE EXCEPTION 'اختر تصنيف السند قبل التصنيف الفرعي'; END IF;
    IF k NOT IN('receipt','expense') OR a.kind='pos' OR length(note)<3 OR NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=other_id AND active AND kind IN('revenue','expense','equity')) THEN RAISE EXCEPTION 'اختر الحساب المقابل واكتب بيان السند'; END IF;
    IF k='expense' AND balance<amount THEN RAISE EXCEPTION 'الرصيد غير كاف'; END IF;
   ELSIF p_operation='transfer' THEN
    k:='transfer'; other_id:=nullif(p_payload->>'toAccountId','')::uuid;
    IF a.kind NOT IN('cash','bank') OR other_id=aid OR NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=other_id AND active AND kind IN('cash','bank')) OR balance<amount OR length(note)<3 THEN RAISE EXCEPTION 'تحقق من حسابي التحويل والرصيد والبيان'; END IF;
   ELSIF p_operation IN('pos_settle','pos_fee_pay') THEN
    k:='transfer'; other_id:=a.linked_bank_id; fee_mode:=coalesce(p_payload->>'feeTreatment','legacy');
    due:=brand_finance_private.terminal_fees_due(p_cafe_id,aid);
    IF fee_mode NOT IN('legacy','net','gross') THEN RAISE EXCEPTION 'اختر طريقة إيداع البنك بالإجمالي أو بالصافي'; END IF;
    fee:=round(coalesce((p_payload->>'feesDeducted')::numeric,CASE WHEN p_operation='pos_fee_pay' THEN amount ELSE NULL END,(p_payload->>'fee')::numeric,0),2);
    IF a.kind<>'pos' OR other_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=other_id AND kind='bank' AND active) OR fee<0 OR length(btrim(coalesce(p_payload->>'reference',''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'تحقق من نقطة الشبكة والبنك المرتبط ومرجع العملية'; END IF;
    IF p_operation='pos_fee_pay' THEN
     IF (p_payload ? 'feesDeducted' AND round((p_payload->>'feesDeducted')::numeric,2) IS DISTINCT FROM amount) OR (p_payload ? 'fee' AND round((p_payload->>'fee')::numeric,2) IS DISTINCT FROM amount) THEN RAISE EXCEPTION 'مبلغ سداد الرسوم لا يطابق المبلغ المدخل'; END IF;
     fee:=amount; fee_mode:='net'; amount:=0;
     IF fee<=0 OR fee>due OR brand_finance_private.treasury_balance(p_cafe_id,other_id)<fee THEN RAISE EXCEPTION 'تحقق من مبلغ الرسوم المستحقة ورصيد البنك المتاح للسداد'; END IF;
    ELSE
     IF amount<=0 OR balance<amount OR fee>amount THEN RAISE EXCEPTION 'مبلغ التسوية يجب ألا يتجاوز رصيد الشبكة والرسوم يجب ألا تتجاوز التسوية'; END IF;
     IF fee_mode='gross' AND fee<>0 THEN RAISE EXCEPTION 'الإيداع بالإجمالي لا يتضمن خصم رسوم من المبلغ المودع'; END IF;
     IF fee_mode<>'legacy' AND fee>due THEN RAISE EXCEPTION 'الرسوم المخصومة تتجاوز الرسوم المستحقة على الشبكة'; END IF;
     IF fee_mode='legacy' AND (due>0 OR a.transaction_fee_percent>0 OR a.monthly_subscription>0 OR p_payload ? 'feesDeducted') THEN RAISE EXCEPTION 'اختر الإيداع بالإجمالي أو بالصافي لتجنب خصم الرسوم مرتين'; END IF;
    END IF;
    IF EXISTS(SELECT 1 FROM public.bf_treasury_documents WHERE cafe_id=p_cafe_id AND account_id=aid AND operation IN('pos_settle','pos_fee_pay') AND reference=btrim(p_payload->>'reference')) THEN RAISE EXCEPTION 'سبق تسجيل مرجع البنك لهذه الشبكة'; END IF;
   ELSE RAISE EXCEPTION 'Unknown treasury operation'; END IF;
   INSERT INTO public.bf_documents(id,cafe_id,kind,account_id,total,paid,note,created_by) VALUES(doc,p_cafe_id,k,aid,CASE WHEN p_operation='pos_fee_pay' THEN fee ELSE amount END,CASE WHEN p_operation='pos_fee_pay' THEN fee ELSE amount END,note,actor) RETURNING number INTO n;
   IF p_operation='pos_fee_pay' THEN
    PERFORM brand_finance_private.line(p_cafe_id,doc,other_id,0,fee);
    PERFORM brand_finance_private.line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'2010'),fee,0);
    PERFORM brand_finance_private.terminal_fee_allocate(p_cafe_id,aid,doc,fee);
   ELSIF p_operation='pos_settle' AND fee_mode<>'legacy' THEN
    PERFORM brand_finance_private.line(p_cafe_id,doc,aid,0,amount);
    PERFORM brand_finance_private.line(p_cafe_id,doc,other_id,amount-fee,0);
    IF fee>0 THEN
     PERFORM brand_finance_private.line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'2010'),fee,0);
     PERFORM brand_finance_private.terminal_fee_allocate(p_cafe_id,aid,doc,fee);
    END IF;
   ELSIF k IN('opening','receipt') THEN
    PERFORM brand_finance_private.line(p_cafe_id,doc,aid,amount,0); PERFORM brand_finance_private.line(p_cafe_id,doc,other_id,0,amount);
   ELSE
    PERFORM brand_finance_private.line(p_cafe_id,doc,aid,0,amount); PERFORM brand_finance_private.line(p_cafe_id,doc,other_id,amount-coalesce(fee,0),0);
    IF coalesce(fee,0)>0 THEN PERFORM brand_finance_private.line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'5100'),fee,0); END IF;
   END IF;
   INSERT INTO public.bf_treasury_documents(cafe_id,document_id,account_id,operation,reference,fee,category,subcategory,cost_center) VALUES(p_cafe_id,doc,aid,p_operation,btrim(coalesce(p_payload->>'reference','')),coalesce(fee,0),coalesce(category,''),coalesce(subcategory,''),coalesce(center,''));
   result:=jsonb_build_object('id',doc,'number',n);
  END IF;
 END IF;
 INSERT INTO public.bf_treasury_audit(cafe_id,actor_id,operation,entity_id,before_data,after_data)
 VALUES(p_cafe_id,actor,p_operation,(result->>'id')::uuid,before_row,CASE WHEN p_operation IN('account_save','account_archive','opening') THEN (SELECT to_jsonb(x)-'cafe_id' FROM public.bf_accounts x WHERE id=aid) ELSE p_payload||result END);
 INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by) VALUES(p_cafe_id,p_request_id,'treasury:'||p_operation,p_payload,result,actor);
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION brand_finance_private.treasury_account_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE cap integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.cafe_id::text,60412));
 IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=NEW.cafe_id AND code=NEW.code) THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND (NEW.cafe_id<>OLD.cafe_id OR NEW.kind<>OLD.kind OR NEW.code<>OLD.code) THEN RAISE EXCEPTION 'Account identity is immutable'; END IF;
 IF TG_OP='UPDATE' AND OLD.kind='pos' AND (OLD.linked_bank_id IS DISTINCT FROM NEW.linked_bank_id OR (OLD.active AND NOT NEW.active)) AND brand_finance_private.terminal_fees_due(NEW.cafe_id,NEW.id)>0 THEN RAISE EXCEPTION 'سدد رسوم الشبكة المستحقة قبل أرشفتها أو تغيير البنك المرتبط'; END IF;
 IF NEW.kind IN('cash','bank','pos') THEN
  cap:=CASE NEW.kind WHEN 'bank' THEN 5 ELSE 3 END;
  IF NEW.active AND (TG_OP='INSERT' OR NOT OLD.active) AND (SELECT count(*) FROM public.bf_accounts WHERE cafe_id=NEW.cafe_id AND kind=NEW.kind AND active AND id<>NEW.id)>=cap THEN RAISE EXCEPTION 'تم الوصول إلى الحد المسموح للحسابات من هذا النوع'; END IF;
  IF NEW.linked_bank_id IS NOT NULL AND (NEW.kind<>'pos' OR NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=NEW.cafe_id AND id=NEW.linked_bank_id AND kind='bank' AND active)) THEN RAISE EXCEPTION 'اختر حسابا بنكيا نشطا لنقطة الشبكة'; END IF;
  IF TG_OP='UPDATE' AND OLD.linked_bank_id IS DISTINCT FROM NEW.linked_bank_id AND brand_finance_private.treasury_balance(NEW.cafe_id,NEW.id)<>0 THEN RAISE EXCEPTION 'سو رصيد الشبكة قبل تغيير الحساب البنكي المرتبط'; END IF;
  IF TG_OP='UPDATE' AND OLD.active AND NOT NEW.active THEN
   IF brand_finance_private.treasury_balance(NEW.cafe_id,NEW.id)<>0 OR EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=NEW.cafe_id AND account_id=NEW.id AND status IN('open','handover')) THEN RAISE EXCEPTION 'لا يمكن أرشفة حساب له رصيد أو وردية مفتوحة'; END IF;
   IF EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=NEW.cafe_id AND active AND linked_bank_id=NEW.id) THEN RAISE EXCEPTION 'الحساب مرتبط بنقطة شبكة نشطة'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.brand_finance_treasury_snapshot(p_cafe_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 r:=brand_finance_private.role_for(p_cafe_id);
 IF r NOT IN('owner','manager') THEN RAISE EXCEPTION 'Finance manager required' USING ERRCODE='42501'; END IF;
 PERFORM brand_finance_private.treasury_seed(p_cafe_id);
 PERFORM brand_finance_private.terminal_monthly_ensure(p_cafe_id);
 RETURN jsonb_build_object(
  'fee_charges',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id) FROM (
   SELECT c.*,s.number source_number,brand_finance_private.terminal_fee_paid(p_cafe_id,c.id) paid,c.total-brand_finance_private.terminal_fee_paid(p_cafe_id,c.id) remaining
   FROM public.bf_terminal_fee_charges c LEFT JOIN public.bf_documents s ON s.cafe_id=c.cafe_id AND s.id=c.source_document_id WHERE c.cafe_id=p_cafe_id ORDER BY c.created_at DESC,c.id LIMIT 500) x),'[]'::jsonb),
  'fee_charges_total',(SELECT count(*) FROM public.bf_terminal_fee_charges WHERE cafe_id=p_cafe_id),
  'accounts',coalesce((SELECT jsonb_agg(to_jsonb(a)-'cafe_id'||jsonb_build_object('balance',brand_finance_private.treasury_balance(p_cafe_id,a.id),'fees_due',brand_finance_private.terminal_fees_due(p_cafe_id,a.id),'expected_net',brand_finance_private.treasury_balance(p_cafe_id,a.id)-brand_finance_private.terminal_fees_due(p_cafe_id,a.id)) ORDER BY a.code) FROM public.bf_accounts a WHERE a.cafe_id=p_cafe_id),'[]'::jsonb),
  'reconciliations',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id) FROM (
   SELECT r.id,r.account_id,r.expected_amount expected_balance,r.counted_amount,r.difference variance,r.note,r.created_at,
   brand_finance_private.treasury_actor_name(p_cafe_id,r.created_by) actor_name,s.document_id adjustment_document_id
   FROM public.bf_treasury_reconciliations r LEFT JOIN public.bf_treasury_reconciliation_resolutions s ON s.cafe_id=r.cafe_id AND s.reconciliation_id=r.id
   WHERE r.cafe_id=p_cafe_id ORDER BY r.created_at DESC,r.id LIMIT 100) x),'[]'::jsonb),
  'audit',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id) FROM (
   SELECT a.id,coalesce(nullif(a.after_data->>'accountId','')::uuid,CASE WHEN a.operation IN('account_save','account_archive','opening') THEN nullif(a.after_data->>'id','')::uuid END,d.account_id) account_id,
   a.operation,coalesce(a.after_data->>'reason',a.after_data->>'note','') note,a.created_at,brand_finance_private.treasury_actor_name(p_cafe_id,a.actor_id) actor_name,d.id document_id
   FROM public.bf_treasury_audit a LEFT JOIN public.bf_documents d ON d.cafe_id=a.cafe_id AND d.id=a.entity_id WHERE a.cafe_id=p_cafe_id ORDER BY a.created_at DESC,a.id LIMIT 100) x),'[]'::jsonb),
  'reconciliationsTotal',(SELECT count(*) FROM public.bf_treasury_reconciliations WHERE cafe_id=p_cafe_id),
  'auditTotal',(SELECT count(*) FROM public.bf_treasury_audit WHERE cafe_id=p_cafe_id),'canCorrect',false);
END $$;
CREATE OR REPLACE FUNCTION public.brand_finance_treasury_correct(p_cafe_id uuid,p_actor_id uuid,p_maintenance_expires_at timestamptz,p_operation text,p_payload jsonb,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE audit_record record; prior public.bf_requests%ROWTYPE; original public.bf_documents%ROWTYPE; recon public.bf_treasury_reconciliations%ROWTYPE;
 a public.bf_accounts%ROWTYPE; line record; doc uuid:=gen_random_uuid(); n bigint; aid uuid; amount numeric; balance numeric; reason text; result jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor_id AND role='platform_admin' AND status='active') OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND deleted_at IS NULL AND status IN('active','published')) OR NOT platform_access_private.service_enabled(p_cafe_id,'finance') THEN RAISE EXCEPTION 'Maintenance administrator required' USING ERRCODE='42501'; END IF;
 SELECT action,new_data INTO audit_record FROM public.audit_logs WHERE actor_id=p_actor_id AND cafe_id=p_cafe_id AND action IN('maintenance_mode_started','maintenance_mode_ended') ORDER BY created_at DESC,id DESC LIMIT 1;
 IF NOT FOUND OR audit_record.action<>'maintenance_mode_started' OR p_maintenance_expires_at IS NULL OR p_maintenance_expires_at<=now() OR (audit_record.new_data->>'expires_at')::timestamptz IS DISTINCT FROM p_maintenance_expires_at THEN RAISE EXCEPTION 'Active matching maintenance session required' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>100000 OR p_payload::text ~* '"[-+]?(nan|infinity)"' THEN RAISE EXCEPTION 'Invalid command'; END IF;
 reason:=btrim(coalesce(p_payload->>'reason',''));
 IF length(reason) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'سبب التصحيح مطلوب'; END IF;
 SELECT * INTO prior FROM public.bf_requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.operation<>'treasury_correct:'||p_operation OR prior.payload<>p_payload OR prior.created_by<>p_actor_id THEN RAISE EXCEPTION 'Request identifier conflict'; END IF;
  RETURN prior.result||'{"duplicate":true}'::jsonb;
 END IF;
 IF EXISTS(SELECT 1 FROM public.bf_settings WHERE cafe_id=p_cafe_id AND closed_through>=(now() AT TIME ZONE 'Asia/Riyadh')::date) THEN RAISE EXCEPTION 'الفترة المالية مقفلة'; END IF;
 IF p_operation='reverse' THEN
  SELECT d.* INTO original FROM public.bf_documents d JOIN public.bf_treasury_documents t ON t.cafe_id=d.cafe_id AND t.document_id=d.id
  WHERE d.cafe_id=p_cafe_id AND d.id=(p_payload->>'documentId')::uuid AND t.operation IN('opening','voucher','transfer','pos_settle','pos_fee_pay');
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.bf_treasury_documents WHERE cafe_id=p_cafe_id AND reverses_id=original.id) THEN RAISE EXCEPTION 'المستند غير قابل للعكس أو سبق عكسه'; END IF;
  IF EXISTS(SELECT 1 FROM public.bf_terminal_fee_allocations paid JOIN public.bf_terminal_fee_charges charge ON charge.id=paid.charge_id JOIN public.bf_accounts terminal ON terminal.id=charge.terminal_id WHERE paid.cafe_id=p_cafe_id AND paid.document_id=original.id AND terminal.linked_bank_id IS DISTINCT FROM charge.bank_id) THEN RAISE EXCEPTION 'أعد ربط الشبكة بالبنك الأصلي قبل عكس سداد الرسوم'; END IF;
  IF EXISTS(SELECT 1 FROM public.bf_journal j JOIN public.bf_accounts acc ON acc.cafe_id=j.cafe_id AND acc.id=j.account_id WHERE j.cafe_id=p_cafe_id AND j.document_id=original.id AND NOT acc.active) THEN RAISE EXCEPTION 'أعد تفعيل الحساب المؤرشف قبل عكس مستنده'; END IF;
  IF EXISTS(SELECT 1 FROM public.bf_journal j JOIN public.bf_shifts s ON s.cafe_id=j.cafe_id AND s.account_id=j.account_id WHERE j.cafe_id=p_cafe_id AND j.document_id=original.id AND s.status IN('open','handover')) THEN RAISE EXCEPTION 'أغلق الوردية قبل تصحيح حسابها'; END IF;
  INSERT INTO public.bf_documents(id,cafe_id,kind,account_id,total,reference_id,note,created_by) VALUES(doc,p_cafe_id,'journal',original.account_id,original.total,original.id,reason,p_actor_id) RETURNING number INTO n;
  FOR line IN SELECT * FROM public.bf_journal WHERE cafe_id=p_cafe_id AND document_id=original.id LOOP
   PERFORM brand_finance_private.line(p_cafe_id,doc,line.account_id,line.credit,line.debit,line.party_id);
  END LOOP;
  INSERT INTO public.bf_treasury_documents(cafe_id,document_id,operation,reverses_id) VALUES(p_cafe_id,doc,'reverse',original.id);
 ELSE
  IF p_operation='reconcile_adjust' THEN
   SELECT * INTO recon FROM public.bf_treasury_reconciliations WHERE cafe_id=p_cafe_id AND id=(p_payload->>'reconciliationId')::uuid;
   IF NOT FOUND OR recon.difference=0 OR EXISTS(SELECT 1 FROM public.bf_treasury_reconciliation_resolutions WHERE cafe_id=p_cafe_id AND reconciliation_id=recon.id) THEN RAISE EXCEPTION 'المطابقة غير قابلة للتسوية'; END IF;
   aid:=recon.account_id; amount:=recon.difference;
   IF brand_finance_private.treasury_balance(p_cafe_id,aid)<>recon.expected_amount THEN RAISE EXCEPTION 'تغير الرصيد سجل مطابقة جديدة قبل التسوية'; END IF;
  ELSIF p_operation='reset' THEN
   aid:=nullif(p_payload->>'accountId','')::uuid; balance:=brand_finance_private.treasury_balance(p_cafe_id,aid);
   IF balance IS DISTINCT FROM (p_payload->>'expectedBalance')::numeric THEN RAISE EXCEPTION 'تغير الرصيد حدث البيانات قبل التصحيح'; END IF;
   amount:=-balance;
  ELSE RAISE EXCEPTION 'Unknown treasury correction'; END IF;
  SELECT * INTO a FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=aid AND kind IN('cash','bank','pos') AND active;
  IF NOT FOUND OR amount IS NULL OR amount=0 THEN RAISE EXCEPTION 'Invalid correction account or amount'; END IF;
  IF EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND account_id=aid AND status IN('open','handover')) THEN RAISE EXCEPTION 'أغلق الوردية قبل تصحيح حسابها'; END IF;
  INSERT INTO public.bf_documents(id,cafe_id,kind,account_id,total,note,created_by) VALUES(doc,p_cafe_id,'journal',aid,abs(amount),reason,p_actor_id) RETURNING number INTO n;
  PERFORM brand_finance_private.line(p_cafe_id,doc,aid,greatest(amount,0),greatest(-amount,0));
  PERFORM brand_finance_private.line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,CASE WHEN p_operation='reset' THEN '3000' ELSE '5300' END),greatest(-amount,0),greatest(amount,0));
  INSERT INTO public.bf_treasury_documents(cafe_id,document_id,operation) VALUES(p_cafe_id,doc,p_operation);
  IF p_operation='reconcile_adjust' THEN INSERT INTO public.bf_treasury_reconciliation_resolutions(cafe_id,reconciliation_id,document_id) VALUES(p_cafe_id,recon.id,doc); END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.bf_accounts acc JOIN public.bf_journal j ON j.cafe_id=acc.cafe_id AND j.account_id=acc.id WHERE acc.cafe_id=p_cafe_id AND acc.kind IN('cash','bank','pos') AND acc.id IN(SELECT account_id FROM public.bf_journal WHERE cafe_id=p_cafe_id AND document_id=doc) GROUP BY acc.id HAVING sum(j.debit-j.credit)<0) THEN RAISE EXCEPTION 'التصحيح يؤدي إلى رصيد سالب'; END IF;
 result:=jsonb_build_object('id',doc,'number',n);
 INSERT INTO public.bf_treasury_audit(cafe_id,actor_id,operation,entity_id,after_data) VALUES(p_cafe_id,p_actor_id,p_operation,doc,p_payload||result);
 INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by) VALUES(p_cafe_id,p_request_id,'treasury_correct:'||p_operation,p_payload,result,p_actor_id);
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.brand_finance_treasury_statement(p_cafe_id uuid,p_account_id uuid,p_offset integer DEFAULT 0,p_limit integer DEFAULT 100,p_from date DEFAULT NULL,p_to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; result jsonb;
BEGIN
 r:=brand_finance_private.role_for(p_cafe_id);
 IF r NOT IN('owner','manager') THEN RAISE EXCEPTION 'Finance manager required' USING ERRCODE='42501'; END IF;
 IF p_offset IS NULL OR p_offset<0 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_from>p_to OR NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=p_account_id) THEN RAISE EXCEPTION 'Invalid account statement'; END IF;
 WITH ledger AS (
  SELECT j.id,j.document_id,d.number,d.kind,d.created_at,d.created_by,d.note,j.debit,j.credit,
   sum(j.debit-j.credit) OVER(ORDER BY d.created_at,d.number,j.id ROWS UNBOUNDED PRECEDING) balance,
   (d.created_at AT TIME ZONE 'Asia/Riyadh')::date posting_date
  FROM public.bf_journal j JOIN public.bf_documents d ON d.cafe_id=j.cafe_id AND d.id=j.document_id WHERE j.cafe_id=p_cafe_id AND j.account_id=p_account_id
 ), selected AS (SELECT * FROM ledger WHERE (p_from IS NULL OR posting_date>=p_from) AND (p_to IS NULL OR posting_date<=p_to)),
 totals AS (SELECT coalesce((SELECT sum(debit-credit) FROM ledger WHERE p_from IS NOT NULL AND posting_date<p_from),0) opening,coalesce(sum(debit),0) debit,coalesce(sum(credit),0) credit,count(*) total FROM selected),
 page AS (SELECT s.id,s.document_id,s.number,s.kind,s.created_at,brand_finance_private.treasury_actor_name(p_cafe_id,s.created_by) actor_name,s.note,s.debit,s.credit,s.balance,
  (SELECT category FROM public.bf_treasury_documents WHERE cafe_id=p_cafe_id AND document_id=s.document_id) category,
  (SELECT subcategory FROM public.bf_treasury_documents WHERE cafe_id=p_cafe_id AND document_id=s.document_id) subcategory,
  (SELECT cost_center FROM public.bf_treasury_documents WHERE cafe_id=p_cafe_id AND document_id=s.document_id) cost_center,
  EXISTS(SELECT 1 FROM public.bf_treasury_documents t WHERE t.cafe_id=p_cafe_id AND t.document_id=s.document_id AND t.operation IN('opening','voucher','transfer','pos_settle','pos_fee_pay') AND NOT EXISTS(SELECT 1 FROM public.bf_treasury_documents rev WHERE rev.cafe_id=p_cafe_id AND rev.reverses_id=t.document_id)) can_reverse
  FROM selected s ORDER BY s.created_at DESC,s.number DESC,s.id DESC OFFSET p_offset LIMIT p_limit)
 SELECT jsonb_build_object('opening',t.opening,'debit',t.debit,'credit',t.credit,'closing',t.opening+t.debit-t.credit,'total',t.total,'rows',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC,p.number DESC,p.id DESC) FROM page p),'[]'::jsonb)) INTO result FROM totals t;
 RETURN result;
END $$;
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.brand_finance_snapshot(uuid)'::regprocedure) INTO definition;
 definition:=replace(definition,'a.kind=''payable''),0) ELSE 0 END','a.kind=''payable'' AND a.code<>''2010''),0) ELSE 0 END');
 definition:=replace(definition,'''purchases'',CASE WHEN managed','''otherIncome'',CASE WHEN managed THEN coalesce((SELECT sum(j.credit-j.debit) FROM public.bf_journal j JOIN public.bf_accounts a ON a.id=j.account_id WHERE j.cafe_id=p_cafe_id AND a.kind=''revenue'' AND a.code<>''4000''),0) ELSE 0 END,''purchases'',CASE WHEN managed');
 EXECUTE definition;
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.terminal_fee_paid(uuid,uuid),brand_finance_private.terminal_fees_due(uuid,uuid),brand_finance_private.terminal_fee_seed(uuid),brand_finance_private.terminal_fee_accrue(uuid,uuid,uuid,date,numeric),brand_finance_private.terminal_monthly_ensure(uuid),brand_finance_private.terminal_sale_fee(),brand_finance_private.terminal_fee_allocate(uuid,uuid,uuid,numeric) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.brand_finance_terminal_fee_history(p_cafe_id uuid,p_account_id uuid DEFAULT NULL,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; answer jsonb;
BEGIN
 r:=brand_finance_private.role_for(p_cafe_id);
 IF r NOT IN('owner','manager') THEN RAISE EXCEPTION 'Finance manager required' USING ERRCODE='42501'; END IF;
 IF p_offset IS NULL OR p_offset<0 OR (p_account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=p_account_id AND kind IN('bank','pos'))) THEN RAISE EXCEPTION 'اختر حسابا بنكيا أو نقطة شبكة لعرض سجل الرسوم'; END IF;
 WITH filtered AS (
  SELECT c.*,s.number source_number,brand_finance_private.terminal_fee_paid(p_cafe_id,c.id) paid,c.total-brand_finance_private.terminal_fee_paid(p_cafe_id,c.id) remaining
  FROM public.bf_terminal_fee_charges c LEFT JOIN public.bf_documents s ON s.cafe_id=c.cafe_id AND s.id=c.source_document_id
  WHERE c.cafe_id=p_cafe_id AND (p_account_id IS NULL OR c.terminal_id=p_account_id OR c.bank_id=p_account_id)
 ), page AS(SELECT * FROM filtered ORDER BY created_at DESC,id DESC OFFSET p_offset LIMIT 100)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'rows',coalesce((SELECT jsonb_agg(to_jsonb(p)-'cafe_id' ORDER BY p.created_at DESC,p.id DESC) FROM page p),'[]'::jsonb)) INTO answer;
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_terminal_fee_history(uuid,uuid,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_terminal_fee_history(uuid,uuid,integer) TO authenticated;

COMMIT;
