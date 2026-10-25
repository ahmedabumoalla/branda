-- Forward-only scheduling change. Existing charge amounts and billing-month identities stay immutable
BEGIN;
ALTER TABLE public.bf_accounts ADD COLUMN monthly_due_day smallint NOT NULL DEFAULT 1 CHECK(monthly_due_day BETWEEN 1 AND 31);

CREATE FUNCTION brand_finance_private.terminal_monthly_today() RETURNS date LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT (now() AT TIME ZONE 'Asia/Riyadh')::date
$$;

CREATE FUNCTION brand_finance_private.terminal_monthly_due_date(p_month date,p_day integer)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE first_day date:=date_trunc('month',p_month)::date; last_day date;
BEGIN
 IF p_month IS NULL OR p_day IS NULL OR p_day NOT BETWEEN 1 AND 31 THEN RAISE EXCEPTION 'اختر يوم استحقاق الاشتراك من ١ إلى ٣١'; END IF;
 last_day:=(first_day+interval '1 month'-interval '1 day')::date;
 RETURN first_day+least(p_day,extract(day FROM last_day)::integer)-1;
END $$;

-- Testable private clock boundary. Only server-owned wrappers supply the current Riyadh date
CREATE FUNCTION brand_finance_private.terminal_monthly_ensure_at(p_cafe uuid,p_today date,p_skip_current_terminal uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a record; month_value date; closed date; current_month date:=date_trunc('month',p_today)::date;
BEGIN
 IF p_today IS NULL THEN RAISE EXCEPTION 'Billing date required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,60412));
 SELECT closed_through INTO closed FROM public.bf_settings WHERE cafe_id=p_cafe;
 IF closed>=(now() AT TIME ZONE 'Asia/Riyadh')::date THEN RETURN; END IF;
 FOR a IN SELECT id,fee_started_month,monthly_due_day FROM public.bf_accounts WHERE cafe_id=p_cafe AND kind='pos' AND active AND monthly_subscription>0 AND fee_started_month IS NOT NULL LOOP
  FOR month_value IN SELECT generate_series(a.fee_started_month,current_month,interval '1 month')::date LOOP
   IF month_value=current_month AND a.id=p_skip_current_terminal THEN CONTINUE; END IF;
   IF brand_finance_private.terminal_monthly_due_date(month_value,a.monthly_due_day)<=p_today THEN
    PERFORM brand_finance_private.terminal_fee_accrue(p_cafe,a.id,NULL,month_value,0);
   END IF;
  END LOOP;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION brand_finance_private.terminal_monthly_ensure(p_cafe uuid)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 PERFORM brand_finance_private.terminal_monthly_ensure_at(p_cafe,brand_finance_private.terminal_monthly_today());
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
 IF p_operation='account_save' AND p_payload ? 'monthlyDueDay' THEN
  IF jsonb_typeof(p_payload->'monthlyDueDay') IS DISTINCT FROM 'number' OR (p_payload->>'monthlyDueDay')::numeric NOT BETWEEN 1 AND 31 OR (p_payload->>'monthlyDueDay')::numeric<>trunc((p_payload->>'monthlyDueDay')::numeric) THEN RAISE EXCEPTION 'اختر يوم استحقاق صحيحا من ١ إلى ٣١'; END IF;
  -- Preserve prior-month rates, but never accrue this terminal's current month under its replaced day
  PERFORM brand_finance_private.terminal_monthly_ensure_at(p_cafe_id,brand_finance_private.terminal_monthly_today(),(SELECT id FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=nullif(p_payload->>'id','')::uuid AND monthly_due_day<>(p_payload->>'monthlyDueDay')::numeric));
 ELSE
  PERFORM brand_finance_private.terminal_monthly_ensure(p_cafe_id);
 END IF;
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
  IF k<>'pos' AND ((p_payload ? 'transactionFeePercent') OR (p_payload ? 'monthlySubscription') OR (p_payload ? 'feeVatRate') OR (p_payload ? 'monthlyDueDay')) THEN RAISE EXCEPTION 'إعدادات الرسوم متاحة لنقاط الشبكة فقط'; END IF;
  IF k='pos' THEN
   UPDATE public.bf_accounts SET transaction_fee_percent=coalesce((p_payload->>'transactionFeePercent')::numeric,transaction_fee_percent),
    monthly_subscription=coalesce((p_payload->>'monthlySubscription')::numeric,monthly_subscription),
    fee_vat_rate=coalesce((p_payload->>'feeVatRate')::numeric,fee_vat_rate),
    monthly_due_day=coalesce((p_payload->>'monthlyDueDay')::numeric::smallint,monthly_due_day),
    fee_started_month=CASE WHEN coalesce((p_payload->>'monthlySubscription')::numeric,monthly_subscription)>0 THEN coalesce(fee_started_month,date_trunc('month',brand_finance_private.terminal_monthly_today())::date) ELSE NULL END
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
REVOKE ALL ON FUNCTION brand_finance_private.terminal_monthly_today(),brand_finance_private.terminal_monthly_due_date(date,integer),brand_finance_private.terminal_monthly_ensure_at(uuid,date,uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
