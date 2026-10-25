-- Forward-only treasury controls, independent of the unshipped shift drafts
BEGIN;
ALTER TABLE public.bf_accounts
 ADD COLUMN linked_bank_id uuid,
 ADD COLUMN opening_recorded_at timestamptz,
 ADD COLUMN opening_amount numeric(16,2) CHECK(opening_amount>=0 AND opening_amount<>'NaN'::numeric),
 ADD COLUMN bank_name text NOT NULL DEFAULT '' CHECK(length(bank_name)<=100),
 ADD COLUMN iban text NOT NULL DEFAULT '' CHECK(length(iban)<=34),
 ADD COLUMN terminal_id text NOT NULL DEFAULT '' CHECK(length(terminal_id)<=100),
 ADD CONSTRAINT bf_accounts_linked_bank FOREIGN KEY(cafe_id,linked_bank_id) REFERENCES public.bf_accounts(cafe_id,id);
CREATE INDEX bf_accounts_linked_bank ON public.bf_accounts(cafe_id,linked_bank_id) WHERE linked_bank_id IS NOT NULL;
-- A historical account is already in use. Do not invent another opening or rewrite its ledger
UPDATE public.bf_accounts a SET opening_recorded_at=h.first_at,opening_amount=h.opening
FROM (SELECT j.cafe_id,j.account_id,min(j.created_at) first_at,greatest(coalesce(sum(j.debit-j.credit) FILTER(WHERE d.kind='opening'),0),0) opening
 FROM public.bf_journal j JOIN public.bf_documents d ON d.id=j.document_id AND d.cafe_id=j.cafe_id GROUP BY j.cafe_id,j.account_id) h
WHERE a.id=h.account_id AND a.cafe_id=h.cafe_id AND a.kind IN('cash','bank','pos');
UPDATE public.bf_accounts a SET linked_bank_id=b.id FROM public.bf_accounts b
WHERE a.kind='pos' AND a.linked_bank_id IS NULL AND b.cafe_id=a.cafe_id AND b.code='1010' AND b.kind='bank' AND b.active;

CREATE TABLE public.bf_treasury_documents(
 cafe_id uuid NOT NULL,document_id uuid PRIMARY KEY,account_id uuid,operation text NOT NULL,reference text NOT NULL DEFAULT '' CHECK(length(reference)<=200),
 fee numeric(16,2) NOT NULL DEFAULT 0 CHECK(fee>=0 AND fee<>'NaN'::numeric),reverses_id uuid UNIQUE,
 FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),
 FOREIGN KEY(cafe_id,account_id) REFERENCES public.bf_accounts(cafe_id,id),
 FOREIGN KEY(cafe_id,reverses_id) REFERENCES public.bf_documents(cafe_id,id));
CREATE INDEX bf_treasury_documents_cafe ON public.bf_treasury_documents(cafe_id,document_id);
CREATE UNIQUE INDEX bf_treasury_settlement_reference ON public.bf_treasury_documents(cafe_id,account_id,reference) WHERE operation='pos_settle';
CREATE TABLE public.bf_treasury_reconciliations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,account_id uuid NOT NULL,
 expected_amount numeric(16,2) NOT NULL CHECK(expected_amount<>'NaN'::numeric),counted_amount numeric(16,2) NOT NULL CHECK(counted_amount>=0 AND counted_amount<>'NaN'::numeric),
 difference numeric(16,2) GENERATED ALWAYS AS(counted_amount-expected_amount) STORED,
 note text NOT NULL DEFAULT '' CHECK(length(note)<=1000),created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(cafe_id,account_id) REFERENCES public.bf_accounts(cafe_id,id),UNIQUE(cafe_id,id));
CREATE INDEX bf_treasury_reconciliations_history ON public.bf_treasury_reconciliations(cafe_id,created_at DESC,id);
CREATE TABLE public.bf_treasury_reconciliation_resolutions(
 cafe_id uuid NOT NULL,reconciliation_id uuid PRIMARY KEY,document_id uuid NOT NULL,
 FOREIGN KEY(cafe_id,reconciliation_id) REFERENCES public.bf_treasury_reconciliations(cafe_id,id),
 FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id));
CREATE TABLE public.bf_treasury_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),actor_id uuid NOT NULL REFERENCES auth.users(id),
 operation text NOT NULL,entity_id uuid NOT NULL,before_data jsonb,after_data jsonb,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX bf_treasury_audit_history ON public.bf_treasury_audit(cafe_id,created_at DESC,id);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['bf_treasury_documents','bf_treasury_reconciliations','bf_treasury_reconciliation_resolutions','bf_treasury_audit'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
 EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable()',t);
END LOOP; END $$;

CREATE FUNCTION brand_finance_private.treasury_balance(p_cafe uuid,p_account uuid) RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(sum(debit-credit),0) FROM public.bf_journal WHERE cafe_id=p_cafe AND account_id=p_account
$$;
CREATE FUNCTION brand_finance_private.treasury_account_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE cap integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.cafe_id::text,60412));
 IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=NEW.cafe_id AND code=NEW.code) THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND (NEW.cafe_id<>OLD.cafe_id OR NEW.kind<>OLD.kind OR NEW.code<>OLD.code) THEN RAISE EXCEPTION 'Account identity is immutable'; END IF;
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
CREATE TRIGGER bf_treasury_account_guard BEFORE INSERT OR UPDATE ON public.bf_accounts FOR EACH ROW EXECUTE FUNCTION brand_finance_private.treasury_account_guard();

CREATE FUNCTION brand_finance_private.treasury_seed(p_cafe uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 PERFORM brand_finance_private.seed(p_cafe);
 UPDATE public.bf_accounts a SET linked_bank_id=b.id FROM public.bf_accounts b
 WHERE a.cafe_id=p_cafe AND a.kind='pos' AND a.linked_bank_id IS NULL AND b.cafe_id=a.cafe_id AND b.code='1010' AND b.kind='bank' AND b.active;
END $$;
CREATE FUNCTION brand_finance_private.treasury_actor_name(p_cafe uuid,p_actor uuid) RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce((SELECT name FROM public.bf_staff WHERE cafe_id=p_cafe AND user_id=p_actor),
 CASE WHEN EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND owner_user_id=p_actor) THEN 'مالك العلامة'
 WHEN EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='platform_admin') THEN 'إدارة برندة' ELSE 'مستخدم سابق' END)
$$;

CREATE FUNCTION public.brand_finance_treasury_execute(p_cafe_id uuid,p_operation text,p_payload jsonb,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); r text; prior public.bf_requests%ROWTYPE; a public.bf_accounts%ROWTYPE; b public.bf_accounts%ROWTYPE;
 aid uuid; other_id uuid; doc uuid:=gen_random_uuid(); n bigint; amount numeric; fee numeric; counted numeric; balance numeric; note text; result jsonb; before_row jsonb; k text; linked uuid;
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
   IF amount IS NULL OR amount<0 OR (p_operation<>'opening' AND amount=0) THEN RAISE EXCEPTION 'Invalid amount'; END IF;
   IF p_operation='opening' THEN
    IF a.opening_recorded_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.bf_journal WHERE cafe_id=p_cafe_id AND account_id=aid) OR EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND account_id=aid AND status IN('open','handover')) THEN RAISE EXCEPTION 'سبق بدء الحساب ولا يمكن تكرار الرصيد الافتتاحي'; END IF;
    UPDATE public.bf_accounts SET opening_recorded_at=now(),opening_amount=amount WHERE id=aid;
    k:='opening'; other_id:=brand_finance_private.account(p_cafe_id,'3000');
   ELSIF p_operation='voucher' THEN
    k:=p_payload->>'kind'; other_id:=nullif(p_payload->>'counterAccountId','')::uuid;
    IF k NOT IN('receipt','expense') OR a.kind='pos' OR length(note)<3 OR NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=other_id AND active AND kind IN('revenue','expense','equity')) THEN RAISE EXCEPTION 'اختر الحساب المقابل واكتب بيان السند'; END IF;
    IF k='expense' AND balance<amount THEN RAISE EXCEPTION 'الرصيد غير كاف'; END IF;
   ELSIF p_operation='transfer' THEN
    k:='transfer'; other_id:=nullif(p_payload->>'toAccountId','')::uuid;
    IF a.kind NOT IN('cash','bank') OR other_id=aid OR NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=other_id AND active AND kind IN('cash','bank')) OR balance<amount OR length(note)<3 THEN RAISE EXCEPTION 'تحقق من حسابي التحويل والرصيد والبيان'; END IF;
   ELSIF p_operation='pos_settle' THEN
    k:='transfer'; other_id:=a.linked_bank_id; fee:=round(coalesce((p_payload->>'fee')::numeric,0),2);
    IF a.kind<>'pos' OR other_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=other_id AND kind='bank' AND active) OR fee<0 OR fee>amount OR balance<amount OR length(btrim(coalesce(p_payload->>'reference',''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'تحقق من مبلغ التسوية والرسوم ومرجع البنك'; END IF;
    IF EXISTS(SELECT 1 FROM public.bf_treasury_documents WHERE cafe_id=p_cafe_id AND account_id=aid AND operation='pos_settle' AND reference=btrim(p_payload->>'reference')) THEN RAISE EXCEPTION 'سبق تسجيل مرجع التسوية لهذه الشبكة'; END IF;
   ELSE RAISE EXCEPTION 'Unknown treasury operation'; END IF;
   INSERT INTO public.bf_documents(id,cafe_id,kind,account_id,total,paid,note,created_by) VALUES(doc,p_cafe_id,k,aid,amount,amount,note,actor) RETURNING number INTO n;
   IF k IN('opening','receipt') THEN
    PERFORM brand_finance_private.line(p_cafe_id,doc,aid,amount,0); PERFORM brand_finance_private.line(p_cafe_id,doc,other_id,0,amount);
   ELSE
    PERFORM brand_finance_private.line(p_cafe_id,doc,aid,0,amount); PERFORM brand_finance_private.line(p_cafe_id,doc,other_id,amount-coalesce(fee,0),0);
    IF coalesce(fee,0)>0 THEN PERFORM brand_finance_private.line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'5100'),fee,0); END IF;
   END IF;
   INSERT INTO public.bf_treasury_documents(cafe_id,document_id,account_id,operation,reference,fee) VALUES(p_cafe_id,doc,aid,p_operation,btrim(coalesce(p_payload->>'reference','')),coalesce(fee,0));
   result:=jsonb_build_object('id',doc,'number',n);
  END IF;
 END IF;
 INSERT INTO public.bf_treasury_audit(cafe_id,actor_id,operation,entity_id,before_data,after_data)
 VALUES(p_cafe_id,actor,p_operation,(result->>'id')::uuid,before_row,CASE WHEN p_operation IN('account_save','account_archive','opening') THEN (SELECT to_jsonb(x)-'cafe_id' FROM public.bf_accounts x WHERE id=aid) ELSE p_payload||result END);
 INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by) VALUES(p_cafe_id,p_request_id,'treasury:'||p_operation,p_payload,result,actor);
 RETURN result;
END $$;

CREATE FUNCTION public.brand_finance_treasury_snapshot(p_cafe_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 r:=brand_finance_private.role_for(p_cafe_id);
 IF r NOT IN('owner','manager') THEN RAISE EXCEPTION 'Finance manager required' USING ERRCODE='42501'; END IF;
 PERFORM brand_finance_private.treasury_seed(p_cafe_id);
 RETURN jsonb_build_object(
  'accounts',coalesce((SELECT jsonb_agg(to_jsonb(a)-'cafe_id'||jsonb_build_object('balance',brand_finance_private.treasury_balance(p_cafe_id,a.id)) ORDER BY a.code) FROM public.bf_accounts a WHERE a.cafe_id=p_cafe_id),'[]'::jsonb),
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

CREATE FUNCTION public.brand_finance_treasury_statement(p_cafe_id uuid,p_account_id uuid,p_offset integer DEFAULT 0,p_limit integer DEFAULT 100,p_from date DEFAULT NULL,p_to date DEFAULT NULL)
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
  EXISTS(SELECT 1 FROM public.bf_treasury_documents t WHERE t.cafe_id=p_cafe_id AND t.document_id=s.document_id AND t.operation IN('opening','voucher','transfer','pos_settle') AND NOT EXISTS(SELECT 1 FROM public.bf_treasury_documents rev WHERE rev.cafe_id=p_cafe_id AND rev.reverses_id=t.document_id)) can_reverse
  FROM selected s ORDER BY s.created_at DESC,s.number DESC,s.id DESC OFFSET p_offset LIMIT p_limit)
 SELECT jsonb_build_object('opening',t.opening,'debit',t.debit,'credit',t.credit,'closing',t.opening+t.debit-t.credit,'total',t.total,'rows',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC,p.number DESC,p.id DESC) FROM page p),'[]'::jsonb)) INTO result FROM totals t;
 RETURN result;
END $$;

CREATE FUNCTION public.brand_finance_treasury_history(p_cafe_id uuid,p_account_id uuid,p_kind text,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; result jsonb;
BEGIN
 r:=brand_finance_private.role_for(p_cafe_id);
 IF r NOT IN('owner','manager') THEN RAISE EXCEPTION 'Finance manager required' USING ERRCODE='42501'; END IF;
 IF p_offset IS NULL OR p_offset<0 OR p_kind IS NULL OR p_kind NOT IN('audit','reconciliations') OR NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=p_account_id) THEN RAISE EXCEPTION 'Invalid account history'; END IF;
 IF p_kind='reconciliations' THEN
  WITH selected AS (
   SELECT rec.id,rec.account_id,rec.expected_amount expected_balance,rec.counted_amount,rec.difference variance,rec.note,rec.created_at,
    brand_finance_private.treasury_actor_name(p_cafe_id,rec.created_by) actor_name,s.document_id adjustment_document_id
   FROM public.bf_treasury_reconciliations rec LEFT JOIN public.bf_treasury_reconciliation_resolutions s ON s.cafe_id=rec.cafe_id AND s.reconciliation_id=rec.id
   WHERE rec.cafe_id=p_cafe_id AND rec.account_id=p_account_id
  ), page AS (SELECT * FROM selected ORDER BY created_at DESC,id DESC OFFSET p_offset LIMIT 100)
  SELECT jsonb_build_object('total',(SELECT count(*) FROM selected),'rows',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC,p.id DESC) FROM page p),'[]'::jsonb)) INTO result;
 ELSE
  WITH selected AS (
   SELECT au.id,p_account_id account_id,au.operation,coalesce(au.after_data->>'reason',au.after_data->>'note','') note,au.created_at,
    brand_finance_private.treasury_actor_name(p_cafe_id,au.actor_id) actor_name,d.id document_id
   FROM public.bf_treasury_audit au LEFT JOIN public.bf_documents d ON d.cafe_id=au.cafe_id AND d.id=au.entity_id
   WHERE au.cafe_id=p_cafe_id AND (
    (au.operation IN('account_save','account_archive','opening') AND au.after_data->>'id'=p_account_id::text)
    OR au.after_data->>'accountId'=p_account_id::text OR au.after_data->>'toAccountId'=p_account_id::text
    OR EXISTS(SELECT 1 FROM public.bf_journal j WHERE j.cafe_id=p_cafe_id AND j.document_id=au.entity_id AND j.account_id=p_account_id))
  ), page AS (SELECT * FROM selected ORDER BY created_at DESC,id DESC OFFSET p_offset LIMIT 100)
  SELECT jsonb_build_object('total',(SELECT count(*) FROM selected),'rows',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC,p.id DESC) FROM page p),'[]'::jsonb)) INTO result;
 END IF;
 RETURN result;
END $$;

-- Application verifies the signed maintenance cookie. Service-only SQL also binds
-- the exact expiry to an active audited maintenance entry; employee JWTs cannot call it
CREATE FUNCTION public.brand_finance_treasury_correct(p_cafe_id uuid,p_actor_id uuid,p_maintenance_expires_at timestamptz,p_operation text,p_payload jsonb,p_request_id uuid)
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
  WHERE d.cafe_id=p_cafe_id AND d.id=(p_payload->>'documentId')::uuid AND t.operation IN('opening','voucher','transfer','pos_settle');
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.bf_treasury_documents WHERE cafe_id=p_cafe_id AND reverses_id=original.id) THEN RAISE EXCEPTION 'المستند غير قابل للعكس أو سبق عكسه'; END IF;
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

-- Preserve operational sale/refund/shift behavior while closing legacy treasury bypasses
ALTER FUNCTION public.brand_finance_execute(uuid,text,jsonb,uuid) SET SCHEMA brand_finance_private;
ALTER FUNCTION brand_finance_private.brand_finance_execute(uuid,text,jsonb,uuid) RENAME TO execute_before_treasury;
REVOKE ALL ON FUNCTION brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.brand_finance_execute(p_cafe_id uuid,p_operation text,p_payload jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; k text; mapped jsonb; prior public.bf_requests%ROWTYPE; source_account public.bf_accounts%ROWTYPE; target_account public.bf_accounts%ROWTYPE; answer jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 r:=brand_finance_private.role_for(p_cafe_id);
 -- Retries of pre-migration requests remain no-ops instead of creating a second document
 SELECT * INTO prior FROM public.bf_requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id AND operation=p_operation;
 IF FOUND THEN
  IF prior.payload IS DISTINCT FROM p_payload OR prior.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Request identifier conflict'; END IF;
  RETURN prior.result||'{"duplicate":true}'::jsonb;
 END IF;
 IF p_operation='account' AND p_payload->>'kind' IN('cash','bank','pos') THEN
  mapped:=p_payload-'active';
  IF p_payload->>'kind'='pos' AND nullif(p_payload->>'linkedBankId','') IS NULL THEN
   PERFORM brand_finance_private.treasury_seed(p_cafe_id);
   mapped:=mapped||jsonb_build_object('linkedBankId',(SELECT id FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND code='1010' AND kind='bank' AND active));
  END IF;
  RETURN public.brand_finance_treasury_execute(p_cafe_id,'account_save',mapped,p_request_id);
 ELSIF p_operation='treasury' THEN
  k:=p_payload->>'kind';
  SELECT * INTO source_account FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=nullif(p_payload->>'accountId','')::uuid;
  SELECT * INTO target_account FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=nullif(p_payload->>'toAccountId','')::uuid;
  mapped:=p_payload;
  IF length(btrim(coalesce(mapped->>'note','')))<3 THEN mapped:=mapped||jsonb_build_object('note','سند خزينة'); END IF;
  IF source_account.kind='pos' AND k='transfer' THEN
   PERFORM brand_finance_private.treasury_seed(p_cafe_id);
   SELECT * INTO source_account FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=source_account.id;
   IF target_account.kind IS DISTINCT FROM 'bank' OR target_account.id IS DISTINCT FROM source_account.linked_bank_id THEN RAISE EXCEPTION 'حوّل الشبكة إلى حسابها البنكي المرتبط'; END IF;
   mapped:=mapped||jsonb_build_object('fee',0,'reference',coalesce(nullif(p_payload->>'reference',''),'LEGACY-'||p_request_id::text));
   RETURN public.brand_finance_treasury_execute(p_cafe_id,'pos_settle',mapped,p_request_id);
  ELSIF source_account.kind IN('cash','bank','pos') AND NOT (k='transfer' AND target_account.kind='employee') THEN
   IF k='opening' THEN RETURN public.brand_finance_treasury_execute(p_cafe_id,'opening',p_payload,p_request_id);
   ELSIF k='transfer' THEN RETURN public.brand_finance_treasury_execute(p_cafe_id,'transfer',mapped,p_request_id);
   ELSE
    IF nullif(mapped->>'counterAccountId','') IS NULL THEN mapped:=mapped||jsonb_build_object('counterAccountId',brand_finance_private.account(p_cafe_id,CASE WHEN k='receipt' THEN '4000' ELSE '5100' END)); END IF;
    RETURN public.brand_finance_treasury_execute(p_cafe_id,'voucher',mapped,p_request_id);
   END IF;
  END IF;
 ELSIF p_operation='journal' AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'lines') l JOIN public.bf_accounts a ON a.id=nullif(l->>'accountId','')::uuid AND a.cafe_id=p_cafe_id WHERE a.kind IN('cash','bank','pos')) THEN
  RAISE EXCEPTION 'استخدم سندات الخزينة أو اطلب تصحيح الإدارة' USING ERRCODE='42501';
 ELSIF p_operation IN('opening_balances','finance_reset') THEN
  RAISE EXCEPTION 'استخدم إجراءات الخزينة المعتمدة' USING ERRCODE='42501';
 END IF;
 answer:=brand_finance_private.execute_before_treasury(p_cafe_id,p_operation,p_payload,p_request_id);
 IF p_operation='treasury' THEN
  INSERT INTO public.bf_treasury_audit(cafe_id,actor_id,operation,entity_id,after_data) VALUES(p_cafe_id,auth.uid(),'legacy_custody',(answer->>'id')::uuid,p_payload||answer);
 END IF;
 RETURN answer;
END $$;

REVOKE ALL ON FUNCTION public.brand_finance_treasury_execute(uuid,text,jsonb,uuid),public.brand_finance_treasury_snapshot(uuid),public.brand_finance_treasury_statement(uuid,uuid,integer,integer,date,date),public.brand_finance_execute(uuid,text,jsonb,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_treasury_execute(uuid,text,jsonb,uuid),public.brand_finance_treasury_snapshot(uuid),public.brand_finance_treasury_statement(uuid,uuid,integer,integer,date,date),public.brand_finance_execute(uuid,text,jsonb,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.brand_finance_treasury_correct(uuid,uuid,timestamptz,text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.brand_finance_treasury_correct(uuid,uuid,timestamptz,text,jsonb,uuid) TO service_role;
REVOKE ALL ON FUNCTION brand_finance_private.treasury_balance(uuid,uuid),brand_finance_private.treasury_account_guard(),brand_finance_private.treasury_seed(uuid),brand_finance_private.treasury_actor_name(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.brand_finance_treasury_history(uuid,uuid,text,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_treasury_history(uuid,uuid,text,integer) TO authenticated;
COMMIT;
