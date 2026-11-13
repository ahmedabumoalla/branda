BEGIN;
-- Reviewed financial vouchers, employee funds and bank reconciliation on the existing ledger.
CREATE SCHEMA erp_finance_private;
REVOKE ALL ON SCHEMA erp_finance_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.erp_finance_settings(cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),revision integer NOT NULL DEFAULT 1,payload jsonb NOT NULL DEFAULT '{}');
CREATE TABLE public.erp_finance_categories(cafe_id uuid NOT NULL REFERENCES public.cafes(id),id uuid NOT NULL DEFAULT gen_random_uuid(),kind text NOT NULL CHECK(kind IN('expense','receipt','settlement')),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 150),description text NOT NULL DEFAULT '' CHECK(length(description)<=4000),active boolean NOT NULL DEFAULT true,revision integer NOT NULL DEFAULT 1,PRIMARY KEY(cafe_id,id),UNIQUE(cafe_id,kind,name));
CREATE TABLE public.erp_finance_vouchers(cafe_id uuid NOT NULL REFERENCES public.cafes(id),id uuid NOT NULL DEFAULT gen_random_uuid(),number bigint GENERATED ALWAYS AS IDENTITY,kind text NOT NULL CHECK(kind IN('expense','receipt')),code text NOT NULL CHECK(length(btrim(code)) BETWEEN 1 AND 60),revision integer NOT NULL DEFAULT 1,status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','posted','reversed')),payload jsonb NOT NULL,document_id uuid,reversal_id uuid,category_id uuid,party_id uuid,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL REFERENCES auth.users(id),PRIMARY KEY(cafe_id,id),UNIQUE(cafe_id,kind,code),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),FOREIGN KEY(cafe_id,reversal_id) REFERENCES public.bf_documents(cafe_id,id),FOREIGN KEY(cafe_id,category_id) REFERENCES public.erp_finance_categories(cafe_id,id),FOREIGN KEY(cafe_id,party_id) REFERENCES public.bf_parties(cafe_id,id));
CREATE INDEX erp_finance_vouchers_list ON public.erp_finance_vouchers(cafe_id,kind,created_at DESC);
CREATE TABLE public.erp_finance_cost_allocations(cafe_id uuid NOT NULL,voucher_id uuid NOT NULL,line_index integer NOT NULL,center_id uuid NOT NULL,percentage numeric(8,5) NOT NULL CHECK(percentage>0 AND percentage<=100),base_amount numeric(18,2) NOT NULL CHECK(base_amount>=0),PRIMARY KEY(cafe_id,voucher_id,line_index,center_id),FOREIGN KEY(cafe_id,voucher_id) REFERENCES public.erp_finance_vouchers(cafe_id,id),FOREIGN KEY(cafe_id,center_id) REFERENCES public.erp_cost_centers(cafe_id,id));
CREATE TABLE public.erp_finance_custodies(cafe_id uuid NOT NULL REFERENCES public.cafes(id),id uuid NOT NULL DEFAULT gen_random_uuid(),employee_id uuid NOT NULL,code text NOT NULL CHECK(length(btrim(code)) BETWEEN 1 AND 60),status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','closed','cancelled')),revision integer NOT NULL DEFAULT 1,payload jsonb NOT NULL,account_id uuid,funding_id uuid,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL REFERENCES auth.users(id),PRIMARY KEY(cafe_id,id),UNIQUE(cafe_id,code),UNIQUE(cafe_id,account_id),FOREIGN KEY(cafe_id,employee_id) REFERENCES public.erp_hr_employees(cafe_id,id),FOREIGN KEY(cafe_id,account_id) REFERENCES public.bf_accounts(cafe_id,id),FOREIGN KEY(cafe_id,funding_id) REFERENCES public.bf_documents(cafe_id,id));
CREATE TABLE public.erp_finance_custody_movements(cafe_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),custody_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('settlement','return','reversal')),document_id uuid NOT NULL,reversal_of uuid,payload jsonb NOT NULL,amount numeric(18,2) NOT NULL CHECK(amount>0),effective_on date NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL REFERENCES auth.users(id),PRIMARY KEY(cafe_id,id),FOREIGN KEY(cafe_id,custody_id) REFERENCES public.erp_finance_custodies(cafe_id,id),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),FOREIGN KEY(cafe_id,reversal_of) REFERENCES public.erp_finance_custody_movements(cafe_id,id),UNIQUE(cafe_id,reversal_of));
CREATE TABLE public.erp_bank_statements(cafe_id uuid NOT NULL REFERENCES public.cafes(id),id uuid NOT NULL DEFAULT gen_random_uuid(),account_id uuid NOT NULL,name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 150),date_from date NOT NULL,date_to date NOT NULL,opening numeric(18,2) NOT NULL,closing numeric(18,2) NOT NULL,source_hash text NOT NULL CHECK(source_hash~'^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL REFERENCES auth.users(id),PRIMARY KEY(cafe_id,id),FOREIGN KEY(cafe_id,account_id) REFERENCES public.bf_accounts(cafe_id,id),UNIQUE(cafe_id,account_id,source_hash),CHECK(date_from<=date_to));
CREATE TABLE public.erp_bank_statement_rows(cafe_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),statement_id uuid NOT NULL,position integer NOT NULL,dated date NOT NULL,reference text NOT NULL DEFAULT '' CHECK(length(reference)<=200),description text NOT NULL DEFAULT '' CHECK(length(description)<=1000),amount numeric(18,2) NOT NULL CHECK(amount<>0),revision integer NOT NULL DEFAULT 1,PRIMARY KEY(cafe_id,id),FOREIGN KEY(cafe_id,statement_id) REFERENCES public.erp_bank_statements(cafe_id,id),UNIQUE(cafe_id,statement_id,position));
CREATE TABLE public.erp_bank_matches(cafe_id uuid NOT NULL,row_id uuid NOT NULL,journal_id uuid NOT NULL,actor uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(cafe_id,row_id,journal_id),UNIQUE(cafe_id,journal_id),FOREIGN KEY(cafe_id,row_id) REFERENCES public.erp_bank_statement_rows(cafe_id,id),FOREIGN KEY(journal_id) REFERENCES public.bf_journal(id));
CREATE TABLE public.erp_finance_schedules(cafe_id uuid NOT NULL REFERENCES public.cafes(id),id uuid NOT NULL DEFAULT gen_random_uuid(),source_voucher uuid NOT NULL,revision integer NOT NULL DEFAULT 1,active boolean NOT NULL DEFAULT false,next_date date NOT NULL,until_date date,frequency text NOT NULL CHECK(frequency IN('weekly','biweekly','fourweekly','monthly','bimonthly','quarterly','semiannual','annual','biennial')),auto_post boolean NOT NULL DEFAULT false,created_by uuid NOT NULL REFERENCES auth.users(id),last_error text NOT NULL DEFAULT '',PRIMARY KEY(cafe_id,id),FOREIGN KEY(cafe_id,source_voucher) REFERENCES public.erp_finance_vouchers(cafe_id,id),CHECK(until_date IS NULL OR until_date>=next_date));
CREATE TABLE public.erp_finance_occurrences(cafe_id uuid NOT NULL,schedule_id uuid NOT NULL,dated date NOT NULL,voucher_id uuid NOT NULL,PRIMARY KEY(cafe_id,schedule_id,dated),FOREIGN KEY(cafe_id,schedule_id) REFERENCES public.erp_finance_schedules(cafe_id,id),FOREIGN KEY(cafe_id,voucher_id) REFERENCES public.erp_finance_vouchers(cafe_id,id));
CREATE TABLE public.erp_finance_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id),record_id uuid NOT NULL,action text NOT NULL,detail jsonb NOT NULL,actor uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX erp_finance_events_record ON public.erp_finance_events(cafe_id,record_id,id DESC);
CREATE TABLE erp_finance_private.requests(cafe_id uuid NOT NULL,id uuid NOT NULL,actor uuid NOT NULL,command jsonb NOT NULL,result jsonb NOT NULL,PRIMARY KEY(cafe_id,id));
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON erp_finance_private.requests FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.erp_finance_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
DO $$DECLARE t text;domains text[];BEGIN
 FOREACH t IN ARRAY ARRAY['erp_finance_settings','erp_finance_categories','erp_finance_vouchers','erp_finance_cost_allocations','erp_finance_custodies','erp_finance_custody_movements','erp_bank_statements','erp_bank_statement_rows','erp_bank_matches','erp_finance_schedules','erp_finance_occurrences','erp_finance_events'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;
 domains:=erp_access_private.domains();IF NOT('finance'=ANY(domains)) THEN domains:=array_append(domains,'finance');EXECUTE format('CREATE OR REPLACE FUNCTION erp_access_private.domains() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path='''' AS $f$SELECT %L::text[]$f$',domains);END IF;
 UPDATE public.erp_roles SET permissions=permissions||jsonb_build_object('finance',jsonb_build_object('read',false,'create',false,'update',false,'delete',false,'approve',false,'settings',false,'files',false)) WHERE NOT(permissions?'finance');
END $$;
CREATE FUNCTION erp_finance_private.authorize(c uuid,a text DEFAULT 'read') RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE role text;BEGIN
 role:=brand_finance_private.role_for(c);IF coalesce(role,'') NOT IN('owner','manager','accountant','auditor') OR(a<>'read' AND role='auditor') OR(a='settings' AND role<>'owner') THEN RAISE EXCEPTION 'لا تملك صلاحية المالية المطلوبة' USING ERRCODE='42501';END IF;PERFORM erp_access_private.assert_allowed(c,'finance',a);RETURN role;
END $$;
CREATE FUNCTION erp_finance_private.event(c uuid,i uuid,a text,d jsonb DEFAULT '{}') RETURNS void LANGUAGE sql SET search_path='' AS $$INSERT INTO public.erp_finance_events(cafe_id,record_id,action,detail,actor) VALUES(c,i,a,d,auth.uid())$$;
CREATE FUNCTION erp_finance_private.balance(c uuid,a uuid) RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$SELECT coalesce(sum(debit-credit),0) FROM public.bf_journal WHERE cafe_id=c AND account_id=a$$;
CREATE FUNCTION erp_finance_private.document(c uuid,k text,d date,total numeric,note text,account uuid DEFAULT NULL,party uuid DEFAULT NULL,p_net numeric DEFAULT 0,p_tax numeric DEFAULT 0,p_reference uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$DECLARE i uuid:=gen_random_uuid();BEGIN
 PERFORM erp_asset_private.date_open(c,d);IF k NOT IN('expense','receipt','transfer','journal') OR total IS NULL OR total<=0 OR total>1e9 THEN RAISE EXCEPTION 'بيانات السند غير صالحة';END IF;
 INSERT INTO public.bf_documents(id,cafe_id,kind,total,paid,note,account_id,party_id,subtotal,tax,reference_id,created_by,created_at) VALUES(i,c,k,total,CASE k WHEN 'journal' THEN 0 ELSE total END,left(note,1000),account,party,p_net,p_tax,p_reference,auth.uid(),(d+time '12:00') AT TIME ZONE 'Asia/Riyadh');RETURN i;
END $$;
CREATE FUNCTION erp_finance_private.cash_account(c uuid,i uuid,needed numeric DEFAULT 0) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$BEGIN
 PERFORM erp_asset_private.account(c,i,ARRAY['cash','bank']);
 IF EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=c AND account_id=i AND status IN('open','handover')) THEN RAISE EXCEPTION 'اختر خزينة غير مرتبطة بوردية مفتوحة أو بانتظار التسليم';END IF;
 IF needed>0 AND erp_finance_private.balance(c,i)<needed THEN RAISE EXCEPTION 'رصيد الخزينة لا يكفي';END IF;
END $$;
CREATE FUNCTION erp_finance_private.validate_voucher(c uuid,k text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$DECLARE l jsonb;a uuid;rate numeric:=(p->>'exchangeRate')::numeric;currency text:=p->>'currency';amount numeric;tax numeric;net numeric:=0;vat numeric:=0;rows jsonb:='[]';allowed_tax numeric;center jsonb;centers uuid[];total_pct numeric;BEGIN
 IF k NOT IN('expense','receipt') OR jsonb_typeof(p) IS DISTINCT FROM 'object' OR jsonb_typeof(p->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'lines') NOT BETWEEN 1 AND 100 OR octet_length(p::text)>300000 OR length(btrim(coalesce(p->>'code',''))) NOT BETWEEN 1 AND 60 OR length(btrim(coalesce(p->>'note',''))) NOT BETWEEN 1 AND 4000 OR currency IS NULL OR currency!~'^[A-Z]{3}$' OR rate IS NULL OR rate<=0 OR rate>1000000 OR rate='NaN'::numeric OR(currency='SAR' AND rate<>1) THEN RAISE EXCEPTION 'راجع بيانات السند والعملة والتفاصيل';END IF;
 PERFORM erp_asset_private.date_open(c,(p->>'date')::date);PERFORM erp_asset_private.account(c,(p->>'cashAccountId')::uuid,ARRAY['cash','bank']);
 IF nullif(p->>'partyId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bf_parties WHERE cafe_id=c AND id=(p->>'partyId')::uuid AND active AND kind=CASE k WHEN 'expense' THEN 'supplier' ELSE 'customer' END) THEN RAISE EXCEPTION 'اختر جهة نشطة من هذه العلامة';END IF;
 IF nullif(p->>'categoryId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_finance_categories WHERE cafe_id=c AND id=(p->>'categoryId')::uuid AND active AND kind=k) THEN RAISE EXCEPTION 'التصنيف غير متاح';END IF;
 SELECT vat_rate INTO allowed_tax FROM public.bf_settings WHERE cafe_id=c;
 FOR l IN SELECT * FROM jsonb_array_elements(p->'lines') LOOP
  a:=(l->>'accountId')::uuid;amount:=(l->>'amount')::numeric;tax:=(l->>'taxRate')::numeric;
  PERFORM erp_asset_private.account(c,a,CASE k WHEN 'expense' THEN ARRAY['expense','equity'] ELSE ARRAY['revenue','equity'] END);
  IF amount IS NULL OR amount<=0 OR amount>1e9 OR amount='NaN'::numeric OR amount<>round(amount,2) OR tax IS NULL OR tax NOT IN(0,coalesce(allowed_tax,0)) OR length(coalesce(l->>'description',''))>1000 THEN RAISE EXCEPTION 'راجع مبلغ البند والضريبة المعتمدة';END IF;
  amount:=round(amount*rate,2);tax:=round(amount*tax/100,2);IF amount<=0 THEN RAISE EXCEPTION 'مبلغ البند بعد التحويل أقل من هللة';END IF;
  net:=net+amount;vat:=vat+tax;rows:=rows||jsonb_build_array(jsonb_build_object('accountId',a,'net',amount,'tax',tax,'description',coalesce(l->>'description','')));
  IF jsonb_typeof(coalesce(l->'costCenters','[]'))<>'array' OR jsonb_array_length(coalesce(l->'costCenters','[]'))>100 THEN RAISE EXCEPTION 'توزيع التكلفة غير صالح';END IF;centers:='{}';total_pct:=0;
  FOR center IN SELECT * FROM jsonb_array_elements(coalesce(l->'costCenters','[]')) LOOP
   IF (center->>'id')::uuid=ANY(centers) OR NOT EXISTS(SELECT 1 FROM public.erp_cost_centers WHERE cafe_id=c AND id=(center->>'id')::uuid AND active AND NOT is_group) OR coalesce((center->>'percentage')::numeric,0)<=0 OR (center->>'percentage')::numeric>100 OR (center->>'percentage')::numeric='NaN'::numeric THEN RAISE EXCEPTION 'اختر مركز تكلفة فرعيًا ونسبة صالحة دون تكرار';END IF;
   centers:=array_append(centers,(center->>'id')::uuid);total_pct:=total_pct+(center->>'percentage')::numeric;
  END LOOP;
  IF cardinality(centers)>0 AND total_pct<>100 THEN RAISE EXCEPTION 'مجموع نسب توزيع البند يجب أن يساوي مئة بالمئة';END IF;
 END LOOP;
 IF net+vat>1e9 THEN RAISE EXCEPTION 'إجمالي السند أكبر من المسموح';END IF;RETURN jsonb_build_object('net',net,'tax',vat,'total',net+vat,'lines',rows);
END $$;
CREATE FUNCTION erp_finance_private.post_voucher(c uuid,i uuid) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$DECLARE v public.erp_finance_vouchers;calculation jsonb;row jsonb;doc uuid;cash uuid;tax_account uuid;n integer:=0;allocation jsonb;allocated numeric;remaining numeric;items jsonb;last_index integer;index integer;cfg jsonb;BEGIN
 SELECT * INTO v FROM public.erp_finance_vouchers WHERE cafe_id=c AND id=i FOR UPDATE;IF NOT FOUND OR v.status<>'draft' THEN RAISE EXCEPTION 'السند غير متاح للترحيل';END IF;
 SELECT payload INTO cfg FROM public.erp_finance_settings WHERE cafe_id=c;PERFORM erp_finance_private.validate_voucher_fields(coalesce(cfg->CASE v.kind WHEN 'expense' THEN 'expenseFields' ELSE 'receiptFields' END,'[]'),coalesce(v.payload->'customValues','{}'),c,i,'voucher');
 calculation:=erp_finance_private.validate_voucher(c,v.kind,v.payload);cash:=(v.payload->>'cashAccountId')::uuid;PERFORM erp_finance_private.cash_account(c,cash,CASE v.kind WHEN 'expense' THEN(calculation->>'total')::numeric ELSE 0 END);
 doc:=erp_finance_private.document(c,v.kind,(v.payload->>'date')::date,(calculation->>'total')::numeric,v.payload->>'note',cash,v.party_id,(calculation->>'net')::numeric,(calculation->>'tax')::numeric);
 PERFORM erp_asset_private.line(c,doc,cash,CASE v.kind WHEN 'receipt' THEN(calculation->>'total')::numeric ELSE 0 END,CASE v.kind WHEN 'expense' THEN(calculation->>'total')::numeric ELSE 0 END);
 FOR row IN SELECT * FROM jsonb_array_elements(calculation->'lines') LOOP
  PERFORM erp_asset_private.line(c,doc,(row->>'accountId')::uuid,CASE v.kind WHEN 'expense' THEN(row->>'net')::numeric ELSE 0 END,CASE v.kind WHEN 'receipt' THEN(row->>'net')::numeric ELSE 0 END);
  items:=coalesce(v.payload->'lines'->n->'costCenters','[]');remaining:=(row->>'net')::numeric;last_index:=jsonb_array_length(items)-1;index:=0;
  FOR allocation IN SELECT * FROM jsonb_array_elements(items) LOOP
   allocated:=CASE WHEN index=last_index THEN remaining ELSE least(remaining,round((row->>'net')::numeric*(allocation->>'percentage')::numeric/100,2)) END;remaining:=remaining-allocated;
   INSERT INTO public.erp_finance_cost_allocations(cafe_id,voucher_id,line_index,center_id,percentage,base_amount) VALUES(c,i,n,(allocation->>'id')::uuid,(allocation->>'percentage')::numeric,allocated);index:=index+1;
  END LOOP;n:=n+1;
 END LOOP;
 IF(calculation->>'tax')::numeric>0 THEN tax_account:=brand_finance_private.account(c,CASE v.kind WHEN 'expense' THEN '1300' ELSE '2100' END);PERFORM erp_asset_private.line(c,doc,tax_account,CASE v.kind WHEN 'expense' THEN(calculation->>'tax')::numeric ELSE 0 END,CASE v.kind WHEN 'receipt' THEN(calculation->>'tax')::numeric ELSE 0 END);END IF;
 UPDATE public.erp_finance_vouchers SET document_id=doc,status='posted',revision=revision+1,payload=payload||jsonb_build_object('calculation',calculation) WHERE cafe_id=c AND id=i;
 PERFORM erp_finance_private.event(c,i,'post',jsonb_build_object('documentId',doc));RETURN doc;
END $$;
CREATE FUNCTION erp_finance_private.import_statement(c uuid,p jsonb) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$DECLARE i uuid:=gen_random_uuid();account uuid:=(p->>'accountId')::uuid;start_date date:=(p->>'from')::date;end_date date:=(p->>'to')::date;opening numeric:=(p->>'opening')::numeric;closing numeric:=(p->>'closing')::numeric;total numeric:=0;row jsonb;n integer:=0;amount numeric;BEGIN
 PERFORM erp_asset_private.account(c,account,ARRAY['bank']);
 IF length(btrim(coalesce(p->>'name',''))) NOT BETWEEN 1 AND 150 OR start_date IS NULL OR end_date IS NULL OR NOT isfinite(start_date) OR NOT isfinite(end_date) OR start_date>end_date OR end_date-start_date>3660 OR coalesce(p->>'sourceHash','')!~'^[a-f0-9]{64}$' OR opening IS NULL OR closing IS NULL OR abs(opening)>1e9 OR abs(closing)>1e9 OR opening IN('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) OR closing IN('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) OR opening<>round(opening,2) OR closing<>round(closing,2) OR jsonb_typeof(p->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'rows') NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'راجع فترة كشف البنك وأرصدته وحركاته';END IF;
 IF EXISTS(SELECT 1 FROM public.erp_bank_statements WHERE cafe_id=c AND account_id=account AND source_hash=p->>'sourceHash') THEN RAISE EXCEPTION 'سبق استيراد هذا الملف للحساب';END IF;
 INSERT INTO public.erp_bank_statements(cafe_id,id,account_id,name,date_from,date_to,opening,closing,source_hash,created_by) VALUES(c,i,account,btrim(p->>'name'),start_date,end_date,opening,closing,p->>'sourceHash',auth.uid());
 FOR row IN SELECT * FROM jsonb_array_elements(p->'rows') LOOP
  amount:=(row->>'amount')::numeric;IF amount IS NULL OR amount=0 OR abs(amount)>1e9 OR amount IN('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) OR amount<>round(amount,2) OR (row->>'date')::date NOT BETWEEN start_date AND end_date OR row->>'date' IS NULL OR length(coalesce(row->>'reference',''))>200 OR length(coalesce(row->>'description',''))>1000 THEN RAISE EXCEPTION 'راجع المبلغ والتاريخ في صف الكشف %',n+1;END IF;
  total:=total+amount;INSERT INTO public.erp_bank_statement_rows(cafe_id,statement_id,position,dated,reference,description,amount) VALUES(c,i,n,(row->>'date')::date,coalesce(row->>'reference',''),coalesce(row->>'description',''),amount);n:=n+1;
 END LOOP;
 IF opening+total<>closing THEN RAISE EXCEPTION 'رصيد الإقفال لا يساوي الافتتاحي ومجموع الحركات';END IF;
 RETURN i;
END $$;
CREATE FUNCTION erp_finance_private.match_statement(c uuid,p jsonb,remove boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$DECLARE row public.erp_bank_statement_rows;account uuid;ids uuid[];actual numeric;BEGIN
 SELECT * INTO row FROM public.erp_bank_statement_rows WHERE cafe_id=c AND id=(p->>'id')::uuid FOR UPDATE;IF NOT FOUND OR row.revision IS DISTINCT FROM(p->>'revision')::integer THEN RAISE EXCEPTION 'تغير صف المطابقة أعد تحميله' USING ERRCODE='40001';END IF;
 SELECT account_id INTO account FROM public.erp_bank_statements WHERE cafe_id=c AND id=row.statement_id;
 IF remove THEN
  IF NOT EXISTS(SELECT 1 FROM public.erp_bank_matches WHERE cafe_id=c AND row_id=row.id) THEN RAISE EXCEPTION 'الصف غير مطابق';END IF;DELETE FROM public.erp_bank_matches WHERE cafe_id=c AND row_id=row.id;
 ELSE
  IF jsonb_typeof(p->'journalIds') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'journalIds') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'اختر الحركات المطابقة';END IF;
  SELECT array_agg(value::uuid) INTO ids FROM jsonb_array_elements_text(p->'journalIds');
  IF cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids)x) OR EXISTS(SELECT 1 FROM public.erp_bank_matches WHERE cafe_id=c AND(row_id=row.id OR journal_id=ANY(ids))) OR(SELECT count(*) FROM public.bf_journal WHERE cafe_id=c AND account_id=account AND id=ANY(ids))<>cardinality(ids) THEN RAISE EXCEPTION 'الحركات مطابقة مسبقًا أو لا تخص الحساب البنكي';END IF;
  SELECT sum(debit-credit) INTO actual FROM public.bf_journal WHERE cafe_id=c AND account_id=account AND id=ANY(ids);IF actual<>row.amount THEN RAISE EXCEPTION 'مجموع حركات الحساب لا يساوي مبلغ صف البنك';END IF;
  INSERT INTO public.erp_bank_matches(cafe_id,row_id,journal_id,actor) SELECT c,row.id,x,auth.uid() FROM unnest(ids)x;
 END IF;
 UPDATE public.erp_bank_statement_rows SET revision=revision+1 WHERE cafe_id=c AND id=row.id;RETURN row.statement_id;
END $$;
CREATE FUNCTION erp_finance_private.reverse_document(c uuid,original uuid,d date,note text) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$DECLARE source public.bf_documents;doc uuid;line public.bf_journal;allocated boolean;BEGIN
 SELECT * INTO source FROM public.bf_documents WHERE cafe_id=c AND id=original;IF NOT FOUND OR d<(source.created_at AT TIME ZONE 'Asia/Riyadh')::date OR length(btrim(note)) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'راجع المستند وتاريخ العكس وسببه';END IF;
 IF EXISTS(SELECT 1 FROM public.erp_bank_matches m JOIN public.bf_journal j ON j.id=m.journal_id WHERE m.cafe_id=c AND j.cafe_id=c AND j.document_id=original) THEN RAISE EXCEPTION 'ألغ المطابقة البنكية قبل عكس المستند';END IF;
 IF to_regclass('public.erp_purchase_allocations') IS NOT NULL THEN EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.erp_purchase_allocations WHERE cafe_id=$1 AND expense_document_id=$2)' INTO allocated USING c,original;IF allocated THEN RAISE EXCEPTION 'المصروف موزع على مشتريات ولا يمكن عكس مصدره';END IF;END IF;
 FOR line IN SELECT * FROM public.bf_journal WHERE cafe_id=c AND document_id=original LOOP
  IF EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=c AND id=line.account_id AND kind IN('cash','bank')) THEN PERFORM erp_finance_private.cash_account(c,line.account_id,line.debit);END IF;
 END LOOP;
 doc:=erp_finance_private.document(c,'journal',d,source.total,note,source.account_id,source.party_id,0,0,original);
 FOR line IN SELECT * FROM public.bf_journal WHERE cafe_id=c AND document_id=original LOOP PERFORM erp_asset_private.line(c,doc,line.account_id,line.credit,line.debit);END LOOP;RETURN doc;
END $$;
DO $$DECLARE src text;BEGIN
 SELECT pg_get_functiondef('erp_payroll_private.validate_custom_values(jsonb,jsonb,uuid,uuid,text,integer,boolean)'::regprocedure) INTO src;
 src:=replace(src,'erp_payroll_private.validate_custom_values','erp_finance_private.validate_voucher_fields');src:=replace(src,'''payroll_record''','''finance_voucher''');src:=replace(src,'''contract''','''voucher''');src:=replace(src,'''erp_payroll_records''','''erp_finance_vouchers''');EXECUTE src;
 SELECT pg_get_functiondef('erp_payroll_private.validate_custom_values(jsonb,jsonb,uuid,uuid,text,integer,boolean)'::regprocedure) INTO src;
 src:=replace(src,'erp_payroll_private.validate_custom_values','erp_finance_private.validate_custody_fields');src:=replace(src,'''payroll_record''','''financial_custody''');src:=replace(src,'''contract''','''custody''');src:=replace(src,'''erp_payroll_records''','''erp_finance_custodies''');EXECUTE src;
END $$;
CREATE FUNCTION erp_finance_private.save_voucher(c uuid,p jsonb) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$DECLARE old public.erp_finance_vouchers;i uuid:=coalesce((p->>'id')::uuid,gen_random_uuid());kind text:=p->>'kind';cfg jsonb;BEGIN
 PERFORM erp_finance_private.validate_voucher(c,kind,p);
 IF p->>'id' IS NOT NULL THEN SELECT * INTO old FROM public.erp_finance_vouchers WHERE cafe_id=c AND id=i FOR UPDATE;IF NOT FOUND OR old.revision IS DISTINCT FROM (p->>'revision')::integer THEN RAISE EXCEPTION 'تغير السند أعد تحميله' USING ERRCODE='40001';END IF;IF old.status<>'draft' OR old.kind<>kind THEN RAISE EXCEPTION 'السند المرحل لا يعدل اعكسه ثم أنشئ سندًا مصححًا';END IF;END IF;
 SELECT payload INTO cfg FROM public.erp_finance_settings WHERE cafe_id=c;PERFORM erp_finance_private.validate_voucher_fields(coalesce(cfg->CASE kind WHEN 'expense' THEN 'expenseFields' ELSE 'receiptFields' END,'[]'),coalesce(p->'customValues','{}'),c,i,'voucher',0,true);
 INSERT INTO public.erp_finance_vouchers(cafe_id,id,kind,code,payload,category_id,party_id,created_by) VALUES(c,i,kind,btrim(p->>'code'),p-'calculation',nullif(p->>'categoryId','')::uuid,nullif(p->>'partyId','')::uuid,auth.uid()) ON CONFLICT(cafe_id,id) DO UPDATE SET code=excluded.code,payload=excluded.payload,category_id=excluded.category_id,party_id=excluded.party_id,revision=erp_finance_vouchers.revision+1;
 RETURN i;
END $$;
CREATE FUNCTION erp_finance_private.save_custody(c uuid,p jsonb) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$DECLARE old public.erp_finance_custodies;i uuid:=coalesce((p->>'id')::uuid,gen_random_uuid());amount numeric:=(p->>'amount')::numeric;rate numeric:=(p->>'exchangeRate')::numeric;cfg jsonb;BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.erp_hr_employees WHERE cafe_id=c AND id=(p->>'employeeId')::uuid AND active) OR length(btrim(coalesce(p->>'code',''))) NOT BETWEEN 1 AND 60 OR length(coalesce(p->>'note',''))>4000 OR coalesce(p->>'currency','')!~'^[A-Z]{3}$' OR amount IS NULL OR amount<=0 OR amount>1e9 OR amount='NaN'::numeric OR amount<>round(amount,2) OR rate IS NULL OR rate<=0 OR rate>1000000 OR rate='NaN'::numeric OR(p->>'currency'='SAR' AND rate<>1) OR round(amount*rate,2) NOT BETWEEN .01 AND 1e9 THEN RAISE EXCEPTION 'راجع الموظف وبيانات العهدة';END IF;
 PERFORM erp_asset_private.date_open(c,(p->>'date')::date);PERFORM erp_asset_private.account(c,(p->>'cashAccountId')::uuid,ARRAY['cash','bank']);
 IF p->>'id' IS NOT NULL THEN SELECT * INTO old FROM public.erp_finance_custodies WHERE cafe_id=c AND id=i FOR UPDATE;IF NOT FOUND OR old.revision IS DISTINCT FROM(p->>'revision')::integer THEN RAISE EXCEPTION 'تغيرت العهدة أعد تحميلها' USING ERRCODE='40001';END IF;IF old.status<>'draft' THEN RAISE EXCEPTION 'لا تعدل العهدة بعد صرفها';END IF;END IF;
 SELECT payload INTO cfg FROM public.erp_finance_settings WHERE cafe_id=c;PERFORM erp_finance_private.validate_custody_fields(coalesce(cfg->'custodyFields','[]'),coalesce(p->'customValues','{}'),c,i,'custody',0,true);
 INSERT INTO public.erp_finance_custodies(cafe_id,id,employee_id,code,payload,created_by) VALUES(c,i,(p->>'employeeId')::uuid,btrim(p->>'code'),p,auth.uid()) ON CONFLICT(cafe_id,id) DO UPDATE SET employee_id=excluded.employee_id,code=excluded.code,payload=excluded.payload,revision=erp_finance_custodies.revision+1;RETURN i;
END $$;
CREATE FUNCTION erp_finance_private.custody_act(c uuid,action text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$DECLARE custody public.erp_finance_custodies;movement public.erp_finance_custody_movements;account uuid;doc uuid;mid uuid:=gen_random_uuid();amount numeric;total numeric;calculation jsonb;l jsonb;cfg jsonb;employee_name text;d date:=(p->>'date')::date;BEGIN
 SELECT * INTO custody FROM public.erp_finance_custodies WHERE cafe_id=c AND id=(p->>'id')::uuid FOR UPDATE;IF NOT FOUND OR custody.revision IS DISTINCT FROM(p->>'revision')::integer THEN RAISE EXCEPTION 'تغيرت العهدة أعد تحميلها' USING ERRCODE='40001';END IF;
 SELECT payload INTO cfg FROM public.erp_finance_settings WHERE cafe_id=c;
 IF action='fund' THEN
  IF custody.status<>'draft' THEN RAISE EXCEPTION 'العهدة مصروفة أو مغلقة';END IF;d:=(custody.payload->>'date')::date;amount:=round((custody.payload->>'amount')::numeric*(custody.payload->>'exchangeRate')::numeric,2);account:=(custody.payload->>'cashAccountId')::uuid;
  PERFORM erp_finance_private.validate_custody_fields(coalesce(cfg->'custodyFields','[]'),coalesce(custody.payload->'customValues','{}'),c,custody.id,'custody');PERFORM erp_finance_private.cash_account(c,account,amount);
  SELECT first_name||' '||last_name INTO employee_name FROM public.erp_hr_employees WHERE cafe_id=c AND id=custody.employee_id AND active;IF NOT FOUND THEN RAISE EXCEPTION 'الموظف غير نشط';END IF;
  custody.account_id:=gen_random_uuid();INSERT INTO public.bf_accounts(id,cafe_id,code,name,kind) VALUES(custody.account_id,c,'ERP-CUSTODY-'||custody.id::text,left(employee_name||' — '||custody.code,100),'employee');
  doc:=erp_finance_private.document(c,'transfer',d,amount,'صرف عهدة '||custody.code,account);PERFORM erp_asset_private.line(c,doc,account,0,amount);PERFORM erp_asset_private.line(c,doc,custody.account_id,amount,0);
  UPDATE public.erp_finance_custodies SET status='active',account_id=custody.account_id,funding_id=doc,revision=revision+1 WHERE cafe_id=c AND id=custody.id;
 ELSIF action='cancel_custody' THEN
  IF custody.status<>'draft' THEN RAISE EXCEPTION 'إلغاء العهدة متاح قبل صرفها فقط';END IF;UPDATE public.erp_finance_custodies SET status='cancelled',revision=revision+1 WHERE cafe_id=c AND id=custody.id;
 ELSIF action='close_custody' THEN
  IF custody.status<>'active' OR erp_finance_private.balance(c,custody.account_id)<>0 THEN RAISE EXCEPTION 'سو العهدة وأعد الرصيد المتبقي قبل إغلاقها';END IF;UPDATE public.erp_finance_custodies SET status='closed',revision=revision+1 WHERE cafe_id=c AND id=custody.id;
 ELSE
  IF custody.status<>'active' THEN RAISE EXCEPTION 'العهدة ليست نشطة';END IF;PERFORM erp_asset_private.date_open(c,d);IF d<(custody.payload->>'date')::date THEN RAISE EXCEPTION 'تاريخ التسوية يسبق صرف العهدة';END IF;
  IF action='settle_custody' THEN
   IF NOT EXISTS(SELECT 1 FROM public.erp_finance_categories WHERE cafe_id=c AND id=(p->>'typeId')::uuid AND kind='settlement' AND active) THEN RAISE EXCEPTION 'اختر نوع تسوية نشطًا';END IF;
   calculation:=erp_finance_private.validate_voucher(c,'expense',p||jsonb_build_object('kind','expense','code',custody.code,'cashAccountId',custody.payload->'cashAccountId','currency',custody.payload->'currency','exchangeRate',custody.payload->'exchangeRate','note',coalesce(nullif(p->>'note',''),'تسوية عهدة'),'partyId',NULL,'categoryId',NULL));amount:=(calculation->>'total')::numeric;
   IF erp_finance_private.balance(c,custody.account_id)<amount THEN RAISE EXCEPTION 'التسوية تتجاوز الرصيد المتبقي للعهدة';END IF;
   doc:=erp_finance_private.document(c,'expense',d,amount,'تسوية عهدة '||custody.code,custody.account_id,NULL,(calculation->>'net')::numeric,(calculation->>'tax')::numeric);
   PERFORM erp_asset_private.line(c,doc,custody.account_id,0,amount);FOR l IN SELECT * FROM jsonb_array_elements(calculation->'lines') LOOP PERFORM erp_asset_private.line(c,doc,(l->>'accountId')::uuid,(l->>'net')::numeric,0);END LOOP;
   IF(calculation->>'tax')::numeric>0 THEN PERFORM erp_asset_private.line(c,doc,brand_finance_private.account(c,'1300'),(calculation->>'tax')::numeric,0);END IF;
   INSERT INTO public.erp_finance_custody_movements(cafe_id,id,custody_id,kind,document_id,payload,amount,effective_on,created_by) VALUES(c,mid,custody.id,'settlement',doc,p||jsonb_build_object('calculation',calculation),amount,d,auth.uid());
  ELSIF action='return_custody' THEN
   amount:=round((p->>'amount')::numeric*(custody.payload->>'exchangeRate')::numeric,2);account:=(p->>'cashAccountId')::uuid;
   IF amount IS NULL OR amount<=0 OR amount>erp_finance_private.balance(c,custody.account_id) OR amount='NaN'::numeric OR(p->>'amount')::numeric<>round((p->>'amount')::numeric,2) THEN RAISE EXCEPTION 'راجع مبلغ الإرجاع ورصيد العهدة';END IF;PERFORM erp_finance_private.cash_account(c,account);
   doc:=erp_finance_private.document(c,'transfer',d,amount,'إرجاع عهدة '||custody.code,account);PERFORM erp_asset_private.line(c,doc,account,amount,0);PERFORM erp_asset_private.line(c,doc,custody.account_id,0,amount);
   INSERT INTO public.erp_finance_custody_movements(cafe_id,id,custody_id,kind,document_id,payload,amount,effective_on,created_by) VALUES(c,mid,custody.id,'return',doc,p,amount,d,auth.uid());
  ELSIF action='reverse_custody_movement' THEN
   SELECT * INTO movement FROM public.erp_finance_custody_movements WHERE cafe_id=c AND custody_id=custody.id AND id=(p->>'movementId')::uuid;
   IF NOT FOUND OR movement.kind='reversal' OR EXISTS(SELECT 1 FROM public.erp_finance_custody_movements WHERE cafe_id=c AND reversal_of=movement.id) THEN RAISE EXCEPTION 'الحركة غير قابلة للعكس';END IF;
   total:=erp_finance_private.balance(c,custody.account_id)+movement.amount;IF total>round((custody.payload->>'amount')::numeric*(custody.payload->>'exchangeRate')::numeric,2) THEN RAISE EXCEPTION 'العكس يتجاوز قيمة العهدة المصروفة';END IF;
   doc:=erp_finance_private.reverse_document(c,movement.document_id,d,p->>'note');INSERT INTO public.erp_finance_custody_movements(cafe_id,id,custody_id,kind,document_id,reversal_of,payload,amount,effective_on,created_by) VALUES(c,mid,custody.id,'reversal',doc,movement.id,p,movement.amount,d,auth.uid());
  ELSE RAISE EXCEPTION 'إجراء العهدة غير صالح';END IF;
  UPDATE public.erp_finance_custodies SET revision=revision+1 WHERE cafe_id=c AND id=custody.id;
 END IF;
 PERFORM erp_finance_private.event(c,custody.id,action,jsonb_build_object('documentId',doc,'movementId',mid,'input',p));RETURN jsonb_build_object('id',custody.id,'documentId',doc,'movementId',mid);
END $$;
CREATE FUNCTION public.erp_finance_read(p_cafe_id uuid,p_query jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE r text;answer jsonb;o integer:=coalesce((p_query->>'offset')::integer,0);BEGIN
 r:=erp_finance_private.authorize(p_cafe_id);PERFORM brand_finance_private.seed(p_cafe_id);IF o<0 OR o>1000000 THEN RAISE EXCEPTION 'صفحة غير صالحة';END IF;
 answer:=jsonb_build_object(
 'vouchers',coalesce((SELECT jsonb_agg(to_jsonb(v)-'cafe_id' ORDER BY created_at DESC) FROM(SELECT * FROM public.erp_finance_vouchers WHERE cafe_id=p_cafe_id AND(coalesce(p_query->>'kind','')='' OR kind=p_query->>'kind') ORDER BY created_at DESC LIMIT 100 OFFSET o)v),'[]'),
 'voucherTotal',(SELECT count(*) FROM public.erp_finance_vouchers WHERE cafe_id=p_cafe_id AND(coalesce(p_query->>'kind','')='' OR kind=p_query->>'kind')),
 'custodies',coalesce((SELECT jsonb_agg(to_jsonb(v)-'cafe_id'||jsonb_build_object('remainingBase',erp_finance_private.balance(p_cafe_id,account_id),'remaining',round(erp_finance_private.balance(p_cafe_id,account_id)/(payload->>'exchangeRate')::numeric,2)) ORDER BY created_at DESC) FROM public.erp_finance_custodies v WHERE cafe_id=p_cafe_id),'[]'),
 'categories',coalesce((SELECT jsonb_agg(to_jsonb(v)-'cafe_id' ORDER BY name) FROM public.erp_finance_categories v WHERE cafe_id=p_cafe_id),'[]'),
 'statements',coalesce((SELECT jsonb_agg(to_jsonb(v)-'cafe_id'||jsonb_build_object('rows',(SELECT count(*) FROM public.erp_bank_statement_rows x WHERE x.cafe_id=p_cafe_id AND x.statement_id=v.id),'unmatched',(SELECT count(*) FROM public.erp_bank_statement_rows x WHERE x.cafe_id=p_cafe_id AND x.statement_id=v.id AND NOT EXISTS(SELECT 1 FROM public.erp_bank_matches m WHERE m.cafe_id=p_cafe_id AND m.row_id=x.id))) ORDER BY created_at DESC) FROM public.erp_bank_statements v WHERE cafe_id=p_cafe_id),'[]'),
 'schedules',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'revision',revision,'sourceId',source_voucher,'active',active,'nextDate',next_date,'untilDate',until_date,'frequency',frequency,'autoPost',auto_post,'lastError',last_error)) FROM public.erp_finance_schedules WHERE cafe_id=p_cafe_id),'[]'),
 'settings',coalesce((SELECT payload||jsonb_build_object('revision',revision) FROM public.erp_finance_settings WHERE cafe_id=p_cafe_id),'{"revision":0,"expenseFields":[],"receiptFields":[],"custodyFields":[],"expenseAccountId":null,"receiptAccountId":null,"cashAccountId":null}'::jsonb),
 'accounts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'code',code,'kind',kind,'active',active,'frozen',frozen,'is_group',is_group,'balance',erp_finance_private.balance(p_cafe_id,id)) ORDER BY code) FROM public.bf_accounts WHERE cafe_id=p_cafe_id),'[]'),
 'parties',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'kind',kind,'active',active)) FROM public.bf_parties WHERE cafe_id=p_cafe_id),'[]'),
 'employees',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',first_name||' '||last_name,'active',active)) FROM public.erp_hr_employees WHERE cafe_id=p_cafe_id),'[]'),
 'costCenters',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name,'active',active,'is_group',is_group)) FROM public.erp_cost_centers WHERE cafe_id=p_cafe_id),'[]'),
 'vatRate',(SELECT vat_rate FROM public.bf_settings WHERE cafe_id=p_cafe_id),'canWrite',r<>'auditor','canApprove',r<>'auditor','canSettings',r='owner');
 IF p_query->>'id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(answer->'vouchers')v WHERE v->>'id'=p_query->>'id') THEN answer:=jsonb_set(answer,'{vouchers}',answer->'vouchers'||coalesce((SELECT jsonb_build_array(to_jsonb(v)-'cafe_id') FROM public.erp_finance_vouchers v WHERE cafe_id=p_cafe_id AND id=(p_query->>'id')::uuid),'[]'));END IF;
 RETURN erp_access_private.mask_snapshot(p_cafe_id,'finance',answer);
END $$;
CREATE FUNCTION public.erp_finance_write(p_cafe_id uuid,p_action text,p_data jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE permission text;prior erp_finance_private.requests;cmd jsonb:=jsonb_build_object('action',p_action,'data',p_data);result jsonb;i uuid;rev integer;v public.erp_finance_vouchers;cfg jsonb;k text;BEGIN
 permission:=CASE WHEN p_action='settings' THEN 'settings' WHEN p_action IN('save_voucher','save_custody','category','schedule') THEN CASE WHEN p_data->>'id' IS NULL THEN 'create' ELSE 'update' END WHEN p_action IN('delete_voucher','delete_category') THEN 'delete' WHEN p_action='import_bank' THEN 'create' ELSE 'approve' END;
 PERFORM erp_finance_private.authorize(p_cafe_id,permission);
 IF p_request_id IS NULL OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>2500000 THEN RAISE EXCEPTION 'طلب غير صالح';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));PERFORM brand_finance_private.seed(p_cafe_id);
 SELECT * INTO prior FROM erp_finance_private.requests WHERE cafe_id=p_cafe_id AND id=p_request_id;IF FOUND THEN IF prior.actor<>auth.uid() OR prior.command<>cmd THEN RAISE EXCEPTION 'معرف الطلب مستخدم ببيانات مختلفة';END IF;RETURN prior.result||'{"duplicate":true}'::jsonb;END IF;
 i:=nullif(p_data->>'id','')::uuid;
 IF p_action='save_voucher' THEN i:=erp_finance_private.save_voucher(p_cafe_id,p_data);
 ELSIF p_action='save_custody' THEN i:=erp_finance_private.save_custody(p_cafe_id,p_data);
 ELSIF p_action IN('post','reverse','delete_voucher') THEN
  SELECT * INTO v FROM public.erp_finance_vouchers WHERE cafe_id=p_cafe_id AND id=i FOR UPDATE;IF NOT FOUND OR v.revision IS DISTINCT FROM(p_data->>'revision')::integer THEN RAISE EXCEPTION 'تغير السند أعد تحميله' USING ERRCODE='40001';END IF;
  IF p_action='post' THEN result:=jsonb_build_object('documentId',erp_finance_private.post_voucher(p_cafe_id,i));
  ELSIF p_action='reverse' THEN IF v.status<>'posted' THEN RAISE EXCEPTION 'السند غير مرحل أو معكوس';END IF;UPDATE public.erp_finance_vouchers SET status='reversed',revision=revision+1,reversal_id=erp_finance_private.reverse_document(p_cafe_id,v.document_id,(p_data->>'date')::date,p_data->>'note') WHERE cafe_id=p_cafe_id AND id=i;
  ELSE IF v.status<>'draft' THEN RAISE EXCEPTION 'لا يحذف السند المرحل';END IF;IF EXISTS(SELECT 1 FROM public.erp_files WHERE cafe_id=p_cafe_id AND entity_type='finance_voucher' AND record_id=i) THEN RAISE EXCEPTION 'احذف مرفقات المسودة أولًا';END IF;DELETE FROM public.erp_finance_vouchers WHERE cafe_id=p_cafe_id AND id=i;END IF;
 ELSIF p_action IN('fund','settle_custody','return_custody','reverse_custody_movement','close_custody','cancel_custody') THEN result:=erp_finance_private.custody_act(p_cafe_id,p_action,p_data);
 ELSIF p_action='reopen_custody' THEN UPDATE public.erp_finance_custodies SET status='active',revision=revision+1 WHERE cafe_id=p_cafe_id AND id=i AND status='closed' AND revision=(p_data->>'revision')::integer;IF NOT FOUND THEN RAISE EXCEPTION 'تغيرت العهدة أو أنها غير مغلقة' USING ERRCODE='40001';END IF;
 ELSIF p_action IN('category','delete_category') THEN
  IF i IS NOT NULL THEN SELECT revision INTO rev FROM public.erp_finance_categories WHERE cafe_id=p_cafe_id AND id=i FOR UPDATE;IF rev IS DISTINCT FROM(p_data->>'revision')::integer THEN RAISE EXCEPTION 'تغير التصنيف' USING ERRCODE='40001';END IF;END IF;
  IF p_action='delete_category' THEN IF EXISTS(SELECT 1 FROM public.erp_finance_custody_movements WHERE cafe_id=p_cafe_id AND payload->>'typeId'=i::text) THEN RAISE EXCEPTION 'نوع التسوية مستخدم';END IF;DELETE FROM public.erp_finance_categories WHERE cafe_id=p_cafe_id AND id=i;
  ELSE i:=coalesce(i,gen_random_uuid());INSERT INTO public.erp_finance_categories(cafe_id,id,kind,name,description,active) VALUES(p_cafe_id,i,p_data->>'kind',btrim(p_data->>'name'),p_data->>'description',(p_data->>'active')::boolean) ON CONFLICT(cafe_id,id) DO UPDATE SET name=excluded.name,description=excluded.description,active=excluded.active,revision=erp_finance_categories.revision+1;END IF;
 ELSIF p_action='settings' THEN
  FOREACH k IN ARRAY ARRAY['expenseFields','receiptFields','custodyFields'] LOOP PERFORM erp_manufacturing_private.validate_custom_fields(coalesce(p_data->k,'[]'));END LOOP;
  IF p_data->>'cashAccountId' IS NOT NULL THEN PERFORM erp_asset_private.account(p_cafe_id,(p_data->>'cashAccountId')::uuid,ARRAY['cash','bank']);END IF;
  IF p_data->>'expenseAccountId' IS NOT NULL THEN PERFORM erp_asset_private.account(p_cafe_id,(p_data->>'expenseAccountId')::uuid,ARRAY['expense','equity']);END IF;
  IF p_data->>'receiptAccountId' IS NOT NULL THEN PERFORM erp_asset_private.account(p_cafe_id,(p_data->>'receiptAccountId')::uuid,ARRAY['revenue','equity']);END IF;
  SELECT revision INTO rev FROM public.erp_finance_settings WHERE cafe_id=p_cafe_id FOR UPDATE;IF coalesce(rev,0) IS DISTINCT FROM(p_data->>'revision')::integer THEN RAISE EXCEPTION 'تغيرت الإعدادات' USING ERRCODE='40001';END IF;
  INSERT INTO public.erp_finance_settings(cafe_id,payload) VALUES(p_cafe_id,p_data) ON CONFLICT(cafe_id) DO UPDATE SET payload=excluded.payload,revision=erp_finance_settings.revision+1;i:=p_cafe_id;
 ELSIF p_action='schedule' THEN i:=erp_finance_private.save_schedule(p_cafe_id,p_data);
 ELSIF p_action='generate_schedule' THEN result:=erp_finance_private.generate_schedule(p_cafe_id,i);
 ELSIF p_action='import_bank' THEN i:=erp_finance_private.import_statement(p_cafe_id,p_data);
 ELSIF p_action IN('match_bank','unmatch_bank') THEN i:=erp_finance_private.match_statement(p_cafe_id,p_data,p_action='unmatch_bank');
 ELSE RAISE EXCEPTION 'إجراء مالي غير صالح';END IF;
 result:=coalesce(result,'{}')||jsonb_build_object('id',i);PERFORM erp_finance_private.event(p_cafe_id,i,p_action,p_data);
 INSERT INTO erp_finance_private.requests VALUES(p_cafe_id,p_request_id,auth.uid(),cmd,result);RETURN result;
END $$;
CREATE FUNCTION public.erp_finance_detail(p_cafe_id uuid,p_kind text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE s public.erp_bank_statements;BEGIN
 PERFORM erp_finance_private.authorize(p_cafe_id);
 IF p_kind='events' THEN RETURN coalesce((SELECT jsonb_agg(to_jsonb(x)-'cafe_id' ORDER BY id DESC) FROM public.erp_finance_events x WHERE cafe_id=p_cafe_id AND record_id=p_id),'[]');
 ELSIF p_kind='custody' THEN IF NOT EXISTS(SELECT 1 FROM public.erp_finance_custodies WHERE cafe_id=p_cafe_id AND id=p_id) THEN RAISE EXCEPTION 'العهدة غير موجودة';END IF;RETURN coalesce((SELECT jsonb_agg(to_jsonb(x)-'cafe_id' ORDER BY effective_on,created_at) FROM public.erp_finance_custody_movements x WHERE cafe_id=p_cafe_id AND custody_id=p_id),'[]');
 ELSIF p_kind='bank' THEN
  SELECT * INTO s FROM public.erp_bank_statements WHERE cafe_id=p_cafe_id AND id=p_id;IF NOT FOUND THEN RAISE EXCEPTION 'الكشف غير موجود';END IF;
  RETURN jsonb_build_object('statement',to_jsonb(s)-'cafe_id','rows',coalesce((SELECT jsonb_agg(to_jsonb(r)-'cafe_id'||jsonb_build_object('matches',coalesce((SELECT jsonb_agg(journal_id) FROM public.erp_bank_matches WHERE cafe_id=p_cafe_id AND row_id=r.id),'[]')) ORDER BY position) FROM public.erp_bank_statement_rows r WHERE cafe_id=p_cafe_id AND statement_id=p_id),'[]'),
  'journal',coalesce((SELECT jsonb_agg(jsonb_build_object('id',j.id,'document_id',j.document_id,'number',d.number,'dated',(d.created_at AT TIME ZONE 'Asia/Riyadh')::date,'amount',j.debit-j.credit,'note',d.note,'matched',EXISTS(SELECT 1 FROM public.erp_bank_matches m WHERE m.cafe_id=p_cafe_id AND m.journal_id=j.id)) ORDER BY d.created_at,j.id) FROM public.bf_journal j JOIN public.bf_documents d ON d.cafe_id=j.cafe_id AND d.id=j.document_id WHERE j.cafe_id=p_cafe_id AND j.account_id=s.account_id AND(d.created_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN s.date_from-90 AND s.date_to+90),'[]'));
 END IF;RAISE EXCEPTION 'نوع تفاصيل غير صالح';
END $$;
REVOKE ALL ON FUNCTION public.erp_finance_read(uuid,jsonb),public.erp_finance_write(uuid,text,jsonb,uuid),public.erp_finance_detail(uuid,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.erp_finance_read(uuid,jsonb),public.erp_finance_write(uuid,text,jsonb,uuid),public.erp_finance_detail(uuid,text,uuid) TO authenticated;
CREATE FUNCTION erp_finance_private.save_schedule(c uuid,p jsonb) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$DECLARE i uuid:=coalesce((p->>'id')::uuid,gen_random_uuid());old public.erp_finance_schedules;v public.erp_finance_vouchers;d date:=(p->>'nextDate')::date;stop date:=(p->>'untilDate')::date;BEGIN
 IF p->>'id' IS NOT NULL THEN SELECT * INTO old FROM public.erp_finance_schedules WHERE cafe_id=c AND id=i FOR UPDATE;IF NOT FOUND OR old.revision IS DISTINCT FROM(p->>'revision')::integer THEN RAISE EXCEPTION 'تغير التكرار أعد تحميله' USING ERRCODE='40001';END IF;END IF;
 SELECT * INTO v FROM public.erp_finance_vouchers WHERE cafe_id=c AND id=(p->>'sourceId')::uuid;IF NOT FOUND OR v.status='reversed' THEN RAISE EXCEPTION 'اختر سندًا قائمًا للتكرار';END IF;
 IF d IS NULL OR NOT isfinite(d) OR d<(v.payload->>'date')::date OR(stop IS NOT NULL AND(NOT isfinite(stop) OR stop<d)) THEN RAISE EXCEPTION 'راجع فترة التكرار';END IF;
 IF coalesce((p->>'autoPost')::boolean,false) THEN PERFORM erp_finance_private.authorize(c,'approve');END IF;
 INSERT INTO public.erp_finance_schedules(cafe_id,id,source_voucher,active,next_date,until_date,frequency,auto_post,created_by) VALUES(c,i,v.id,(p->>'active')::boolean,d,stop,p->>'frequency',(p->>'autoPost')::boolean,auth.uid()) ON CONFLICT(cafe_id,id) DO UPDATE SET source_voucher=excluded.source_voucher,active=excluded.active,next_date=excluded.next_date,until_date=excluded.until_date,frequency=excluded.frequency,auto_post=excluded.auto_post,created_by=excluded.created_by,revision=erp_finance_schedules.revision+1,last_error='';RETURN i;
END $$;
CREATE FUNCTION erp_finance_private.generate_schedule(c uuid,i uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$DECLARE s public.erp_finance_schedules;v public.erp_finance_vouchers;n uuid;d date;next_d date;step interval;BEGIN
 PERFORM erp_finance_private.authorize(c,'create');SELECT * INTO s FROM public.erp_finance_schedules WHERE cafe_id=c AND id=i FOR UPDATE;IF NOT FOUND OR NOT s.active OR s.next_date>(now() AT TIME ZONE 'Asia/Riyadh')::date THEN RAISE EXCEPTION 'التكرار غير نشط أو لم يحن موعده';END IF;
 IF s.auto_post THEN PERFORM erp_finance_private.authorize(c,'approve');END IF;
 SELECT * INTO v FROM public.erp_finance_vouchers WHERE cafe_id=c AND id=s.source_voucher;IF v.status='reversed' THEN RAISE EXCEPTION 'السند المصدر معكوس';END IF;
 d:=s.next_date;SELECT voucher_id INTO n FROM public.erp_finance_occurrences WHERE cafe_id=c AND schedule_id=i AND dated=d;
 IF n IS NULL THEN n:=erp_finance_private.save_voucher(c,v.payload||jsonb_build_object('id',NULL,'revision',0,'date',d,'code','REC-'||i::text||'-'||d::text,'customValues','{}'::jsonb));INSERT INTO public.erp_finance_occurrences VALUES(c,i,d,n);IF s.auto_post THEN PERFORM erp_finance_private.post_voucher(c,n);END IF;END IF;
 step:=CASE s.frequency WHEN 'weekly' THEN interval '7 days' WHEN 'biweekly' THEN interval '14 days' WHEN 'fourweekly' THEN interval '28 days' WHEN 'monthly' THEN interval '1 month' WHEN 'bimonthly' THEN interval '2 months' WHEN 'quarterly' THEN interval '3 months' WHEN 'semiannual' THEN interval '6 months' WHEN 'annual' THEN interval '1 year' ELSE interval '2 years' END;
 next_d:=(d+step)::date;UPDATE public.erp_finance_schedules SET next_date=CASE WHEN until_date IS NOT NULL AND next_d>until_date THEN next_date ELSE next_d END,active=(until_date IS NULL OR next_d<=until_date),revision=revision+1,last_error='' WHERE cafe_id=c AND id=i;
 PERFORM erp_finance_private.event(c,i,'generated',jsonb_build_object('voucherId',n,'date',d,'posted',s.auto_post));RETURN jsonb_build_object('voucherId',n);
END $$;
CREATE FUNCTION public.erp_finance_generate_due(p_limit integer DEFAULT 50) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE s public.erp_finance_schedules;n integer:=0;failed integer:=0;old_sub text:=current_setting('request.jwt.claim.sub',true);old_claims text:=current_setting('request.jwt.claims',true);BEGIN
 FOR s IN SELECT * FROM public.erp_finance_schedules WHERE active AND next_date<=(now() AT TIME ZONE 'Asia/Riyadh')::date ORDER BY next_date LIMIT least(greatest(p_limit,1),200) LOOP
  BEGIN PERFORM pg_advisory_xact_lock(hashtextextended(s.cafe_id::text,60412));IF NOT EXISTS(SELECT 1 FROM public.erp_finance_schedules WHERE cafe_id=s.cafe_id AND id=s.id AND active AND revision=s.revision AND next_date=s.next_date) THEN CONTINUE;END IF;PERFORM set_config('request.jwt.claim.sub',s.created_by::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',s.created_by)::text,true);PERFORM erp_finance_private.generate_schedule(s.cafe_id,s.id);n:=n+1;
  EXCEPTION WHEN OTHERS THEN UPDATE public.erp_finance_schedules SET last_error='تعذر إنشاء السند راجع الصلاحيات والفترة والحقول والرصيد',active=false,revision=revision+1 WHERE cafe_id=s.cafe_id AND id=s.id;failed:=failed+1;END;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);PERFORM set_config('request.jwt.claims',coalesce(old_claims,''),true);RETURN jsonb_build_object('generated',n,'failed',failed);
END $$;
REVOKE ALL ON FUNCTION public.erp_finance_generate_due(integer) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.erp_finance_generate_due(integer) TO service_role;
DO $$BEGIN IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN PERFORM cron.schedule('erp-finance-vouchers','35 0 * * *','SELECT public.erp_finance_generate_due(50)');END IF;END $$;
ALTER FUNCTION erp_file_private.assert_record(uuid,text,uuid,boolean) RENAME TO assert_record_before_finance;
CREATE FUNCTION erp_file_private.assert_record(p_cafe uuid,p_type text,p_record uuid,p_write boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF p_type NOT IN('finance_voucher','financial_custody') THEN PERFORM erp_file_private.assert_record_before_finance(p_cafe,p_type,p_record,p_write);RETURN;END IF;
 PERFORM erp_finance_private.authorize(p_cafe,CASE WHEN p_write THEN 'files' ELSE 'read' END);
 IF p_type='finance_voucher' THEN PERFORM 1 FROM public.erp_finance_vouchers WHERE cafe_id=p_cafe AND id=p_record FOR KEY SHARE;ELSE PERFORM 1 FROM public.erp_finance_custodies WHERE cafe_id=p_cafe AND id=p_record FOR KEY SHARE;END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'السجل المالي غير متاح' USING ERRCODE='42501';END IF;
END $$;
REVOKE ALL ON FUNCTION erp_file_private.assert_record(uuid,text,uuid,boolean),erp_file_private.assert_record_before_finance(uuid,text,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION erp_access_private.file_domain(text) RENAME TO file_domain_before_finance;
CREATE FUNCTION erp_access_private.file_domain(p_type text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$SELECT CASE WHEN p_type IN('finance_voucher','financial_custody') THEN 'finance' ELSE erp_access_private.file_domain_before_finance(p_type) END$$;
REVOKE ALL ON FUNCTION erp_access_private.file_domain(text),erp_access_private.file_domain_before_finance(text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_finance_private.file_referenced(c uuid,d uuid,f uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$SELECT EXISTS(SELECT 1 FROM public.erp_finance_vouchers WHERE cafe_id=c AND id=d AND jsonb_path_exists(coalesce(payload->'customValues','{}'),'$.** ? (@ == $file)',jsonb_build_object('file',f::text))) OR EXISTS(SELECT 1 FROM public.erp_finance_custodies WHERE cafe_id=c AND id=d AND jsonb_path_exists(coalesce(payload->'customValues','{}'),'$.** ? (@ == $file)',jsonb_build_object('file',f::text)))$$;
CREATE FUNCTION erp_finance_private.file_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$BEGIN IF OLD.entity_type IN('finance_voucher','financial_custody') AND erp_finance_private.file_referenced(OLD.cafe_id,OLD.record_id,OLD.id) THEN RAISE EXCEPTION 'الملف مرتبط ببيانات مالية';END IF;RETURN OLD;END $$;
CREATE TRIGGER erp_finance_file_guard BEFORE DELETE ON public.erp_files FOR EACH ROW EXECUTE FUNCTION erp_finance_private.file_guard();
DO $$DECLARE src text;BEGIN SELECT pg_get_functiondef('public.erp_file_delete_access(text)'::regprocedure) INTO src;EXECUTE replace(src,'public.erp_file_delete_access(','erp_finance_private.file_delete_before_finance(');END $$;
CREATE OR REPLACE FUNCTION public.erp_file_delete_access(p_path text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE f public.erp_files;BEGIN IF NOT erp_finance_private.file_delete_before_finance(p_path) THEN RETURN false;END IF;SELECT * INTO f FROM public.erp_files WHERE path=p_path FOR UPDATE;RETURN NOT(f.entity_type IN('finance_voucher','financial_custody') AND erp_finance_private.file_referenced(f.cafe_id,f.record_id,f.id));END $$;
CREATE TABLE public.erp_finance_custody_costs(cafe_id uuid NOT NULL,movement_id uuid NOT NULL,line_index integer NOT NULL,center_id uuid NOT NULL,base_amount numeric(18,2) NOT NULL CHECK(base_amount>=0),PRIMARY KEY(cafe_id,movement_id,line_index,center_id),FOREIGN KEY(cafe_id,movement_id) REFERENCES public.erp_finance_custody_movements(cafe_id,id),FOREIGN KEY(cafe_id,center_id) REFERENCES public.erp_cost_centers(cafe_id,id));
ALTER TABLE public.erp_finance_custody_costs ENABLE ROW LEVEL SECURITY;REVOKE ALL ON public.erp_finance_custody_costs FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_finance_private.custody_costs() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$DECLARE l jsonb;a jsonb;n integer:=0;j integer;remaining numeric;amount numeric;parts jsonb;net numeric;BEGIN
 IF NEW.kind<>'settlement' THEN RETURN NEW;END IF;
 FOR l IN SELECT * FROM jsonb_array_elements(NEW.payload->'lines') LOOP
  parts:=coalesce(l->'costCenters','[]');net:=(NEW.payload->'calculation'->'lines'->n->>'net')::numeric;remaining:=net;j:=0;
  FOR a IN SELECT * FROM jsonb_array_elements(parts) LOOP amount:=CASE WHEN j=jsonb_array_length(parts)-1 THEN remaining ELSE least(remaining,round(net*(a->>'percentage')::numeric/100,2)) END;remaining:=remaining-amount;INSERT INTO public.erp_finance_custody_costs VALUES(NEW.cafe_id,NEW.id,n,(a->>'id')::uuid,amount);j:=j+1;END LOOP;n:=n+1;
 END LOOP;RETURN NEW;
END $$;
CREATE TRIGGER erp_finance_custody_costs AFTER INSERT ON public.erp_finance_custody_movements FOR EACH ROW EXECUTE FUNCTION erp_finance_private.custody_costs();
CREATE FUNCTION erp_finance_private.center_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$BEGIN IF NEW.is_group AND NOT OLD.is_group AND(EXISTS(SELECT 1 FROM public.erp_finance_cost_allocations WHERE cafe_id=NEW.cafe_id AND center_id=NEW.id) OR EXISTS(SELECT 1 FROM public.erp_finance_custody_costs WHERE cafe_id=NEW.cafe_id AND center_id=NEW.id)) THEN RAISE EXCEPTION 'المركز مستخدم في سندات مالية ولا يمكن تحويله إلى رئيسي';END IF;RETURN NEW;END $$;
CREATE TRIGGER erp_finance_center_guard BEFORE UPDATE OF is_group ON public.erp_cost_centers FOR EACH ROW EXECUTE FUNCTION erp_finance_private.center_guard();
CREATE FUNCTION public.erp_finance_cost_report(p_cafe_id uuid,p_from date,p_to date,p_center uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE answer jsonb;BEGIN
 PERFORM erp_finance_private.authorize(p_cafe_id);IF p_from IS NULL OR p_to IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_to) OR p_from>p_to OR p_to-p_from>3660 THEN RAISE EXCEPTION 'راجع فترة التقرير';END IF;
 IF p_center IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_cost_centers WHERE cafe_id=p_cafe_id AND id=p_center) THEN RAISE EXCEPTION 'مركز التكلفة غير متاح';END IF;
 WITH RECURSIVE centers AS(SELECT id FROM public.erp_cost_centers WHERE cafe_id=p_cafe_id AND(id=p_center OR p_center IS NULL) UNION SELECT x.id FROM public.erp_cost_centers x JOIN centers c ON x.parent_id=c.id WHERE x.cafe_id=p_cafe_id),
 moves AS(
 SELECT a.center_id,(v.payload->>'date')::date dated,CASE WHEN v.kind='expense' THEN a.base_amount ELSE 0 END expense,CASE WHEN v.kind='receipt' THEN a.base_amount ELSE 0 END income FROM public.erp_finance_cost_allocations a JOIN public.erp_finance_vouchers v ON v.cafe_id=a.cafe_id AND v.id=a.voucher_id JOIN public.bf_accounts ac ON ac.cafe_id=a.cafe_id AND ac.id=(v.payload->'lines'->a.line_index->>'accountId')::uuid WHERE a.cafe_id=p_cafe_id AND v.document_id IS NOT NULL AND ac.kind IN('expense','revenue')
 UNION ALL SELECT a.center_id,(d.created_at AT TIME ZONE 'Asia/Riyadh')::date,CASE WHEN v.kind='expense' THEN -a.base_amount ELSE 0 END,CASE WHEN v.kind='receipt' THEN -a.base_amount ELSE 0 END FROM public.erp_finance_cost_allocations a JOIN public.erp_finance_vouchers v ON v.cafe_id=a.cafe_id AND v.id=a.voucher_id JOIN public.bf_documents d ON d.cafe_id=v.cafe_id AND d.id=v.reversal_id JOIN public.bf_accounts ac ON ac.cafe_id=a.cafe_id AND ac.id=(v.payload->'lines'->a.line_index->>'accountId')::uuid WHERE a.cafe_id=p_cafe_id AND ac.kind IN('expense','revenue')
 UNION ALL SELECT a.center_id,m.effective_on,a.base_amount,0 FROM public.erp_finance_custody_costs a JOIN public.erp_finance_custody_movements m ON m.cafe_id=a.cafe_id AND m.id=a.movement_id JOIN public.bf_accounts ac ON ac.cafe_id=a.cafe_id AND ac.id=(m.payload->'lines'->a.line_index->>'accountId')::uuid WHERE a.cafe_id=p_cafe_id AND ac.kind='expense'
 UNION ALL SELECT a.center_id,r.effective_on,-a.base_amount,0 FROM public.erp_finance_custody_costs a JOIN public.erp_finance_custody_movements m ON m.cafe_id=a.cafe_id AND m.id=a.movement_id JOIN public.erp_finance_custody_movements r ON r.cafe_id=m.cafe_id AND r.reversal_of=m.id JOIN public.bf_accounts ac ON ac.cafe_id=a.cafe_id AND ac.id=(m.payload->'lines'->a.line_index->>'accountId')::uuid WHERE a.cafe_id=p_cafe_id AND ac.kind='expense')
 SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO answer FROM(SELECT c.id AS "centerId",c.name,coalesce(sum(m.expense),0) expenses,coalesce(sum(m.income),0) receipts FROM public.erp_cost_centers c JOIN centers x ON c.id=x.id LEFT JOIN moves m ON m.center_id=c.id AND m.dated BETWEEN p_from AND p_to WHERE c.cafe_id=p_cafe_id GROUP BY c.id,c.name ORDER BY c.name)q;
 RETURN jsonb_build_object('from',p_from,'to',p_to,'rows',answer,'basis','posted_net_excluding_vat');
END $$;
REVOKE ALL ON FUNCTION public.erp_finance_cost_report(uuid,date,date,uuid) FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION public.erp_finance_cost_report(uuid,date,date,uuid) TO authenticated;
-- Preserve the existing treasury implementation and its role ceiling while enforcing ERP domain permissions server-side.
DO $$DECLARE f record;src text;helper text;args text;permission text;BEGIN
 FOR f IN SELECT p.oid,p.proname,p.proargnames FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('brand_finance_treasury_snapshot','brand_finance_treasury_statement','brand_finance_treasury_history','brand_finance_treasury_execute') LOOP
  src:=pg_get_functiondef(f.oid);helper:=replace(f.proname,'brand_finance_','before_');EXECUTE replace(src,'public.'||f.proname||'(','erp_finance_private.'||helper||'(');args:=array_to_string(f.proargnames,',');
  permission:=CASE WHEN f.proname='brand_finance_treasury_execute' THEN 'CASE WHEN p_operation=''account_save'' THEN CASE WHEN nullif(p_payload->>''id'','''') IS NULL THEN ''create'' ELSE ''update'' END WHEN p_operation=''account_delete'' THEN ''delete'' WHEN p_operation IN(''account_archive'',''account_primary'') THEN ''update'' ELSE ''approve'' END' ELSE '''read''' END;
  EXECUTE split_part(src,'AS $function$',1)||format('AS $function$BEGIN PERFORM erp_access_private.assert_allowed(%I,''finance'',%s);RETURN erp_finance_private.%I(%s);END $function$',f.proargnames[1],permission,helper,args);
 END LOOP;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_finance_private FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
