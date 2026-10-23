-- Additive operational ledger. Existing subscription billing and loyalty stay independent.
-- Forward-only: never drop posted financial records to roll back a release.
BEGIN;
CREATE SCHEMA brand_finance_private;
REVOKE ALL ON SCHEMA brand_finance_private FROM PUBLIC,anon,authenticated;
CREATE TABLE public.bf_settings(cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),vat_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK(vat_rate BETWEEN 0 AND 100),tax_inclusive boolean NOT NULL DEFAULT true,currency text NOT NULL DEFAULT 'SAR' CHECK(currency='SAR'),closed_through date);
CREATE TABLE public.bf_staff(cafe_id uuid NOT NULL REFERENCES public.cafes(id),user_id uuid NOT NULL REFERENCES auth.users(id),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),role text NOT NULL CHECK(role IN('manager','cashier')),active boolean NOT NULL DEFAULT true,PRIMARY KEY(cafe_id,user_id));
CREATE INDEX bf_staff_user ON public.bf_staff(user_id,cafe_id) WHERE active;
CREATE TABLE public.bf_accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),code text NOT NULL,kind text NOT NULL CHECK(kind IN('cash','bank','pos','employee','receivable','payable','inventory','revenue','expense','equity','vat_input','vat_output')),active boolean NOT NULL DEFAULT true,UNIQUE(cafe_id,id),UNIQUE(cafe_id,code));
CREATE TABLE public.bf_parties(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 150),kind text NOT NULL CHECK(kind IN('customer','supplier','employee')),phone text NOT NULL DEFAULT '' CHECK(length(phone)<=30),email text NOT NULL DEFAULT '' CHECK(length(email)<=254),tax_number text NOT NULL DEFAULT '' CHECK(length(tax_number)<=30),active boolean NOT NULL DEFAULT true,UNIQUE(cafe_id,id));
CREATE TABLE public.bf_warehouses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),active boolean NOT NULL DEFAULT true,UNIQUE(cafe_id,id),UNIQUE(cafe_id,name));
CREATE TABLE public.bf_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 150),sku text NOT NULL CHECK(length(sku) BETWEEN 1 AND 60),unit text NOT NULL DEFAULT 'وحدة' CHECK(length(unit) BETWEEN 1 AND 30),menu_product_id uuid REFERENCES public.menu_products(id),min_quantity numeric(16,3) NOT NULL DEFAULT 0 CHECK(min_quantity>=0),active boolean NOT NULL DEFAULT true,UNIQUE(cafe_id,id),UNIQUE(cafe_id,sku),UNIQUE(cafe_id,menu_product_id));
CREATE TABLE public.bf_stock(cafe_id uuid NOT NULL,warehouse_id uuid NOT NULL,item_id uuid NOT NULL,quantity numeric(16,3) NOT NULL DEFAULT 0 CHECK(quantity>=0),average_cost numeric(18,6) NOT NULL DEFAULT 0 CHECK(average_cost>=0),PRIMARY KEY(cafe_id,warehouse_id,item_id),FOREIGN KEY(cafe_id,warehouse_id) REFERENCES public.bf_warehouses(cafe_id,id),FOREIGN KEY(cafe_id,item_id) REFERENCES public.bf_items(cafe_id,id));
ALTER TABLE public.bf_stock ADD COLUMN value numeric(16,2) NOT NULL DEFAULT 0 CHECK(value>=0);
CREATE INDEX bf_stock_item ON public.bf_stock(cafe_id,item_id);
CREATE TABLE public.bf_shifts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),user_id uuid NOT NULL REFERENCES auth.users(id),account_id uuid NOT NULL,status text NOT NULL DEFAULT 'open' CHECK(status IN('open','closed','handover')),opening_cash numeric(16,2) NOT NULL CHECK(opening_cash>=0),expected_cash numeric(16,2) NOT NULL DEFAULT 0,counted_cash numeric(16,2),variance numeric(16,2),opened_at timestamptz NOT NULL DEFAULT now(),closed_at timestamptz,handover_to uuid REFERENCES auth.users(id),note text NOT NULL DEFAULT '',UNIQUE(cafe_id,id),FOREIGN KEY(cafe_id,account_id) REFERENCES public.bf_accounts(cafe_id,id));
CREATE UNIQUE INDEX bf_one_live_shift ON public.bf_shifts(cafe_id,user_id) WHERE status IN('open','handover');
CREATE UNIQUE INDEX bf_one_live_drawer ON public.bf_shifts(cafe_id,account_id) WHERE status IN('open','handover');
CREATE TABLE public.bf_documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),number bigint GENERATED ALWAYS AS IDENTITY,kind text NOT NULL CHECK(kind IN('sale','purchase','refund','stock_adjust','stock_transfer','receipt','expense','transfer','opening','settlement','journal','shift_variance')),party_id uuid,shift_id uuid,account_id uuid,warehouse_id uuid,subtotal numeric(16,2) NOT NULL DEFAULT 0,discount numeric(16,2) NOT NULL DEFAULT 0 CHECK(discount>=0),tax numeric(16,2) NOT NULL DEFAULT 0,total numeric(16,2) NOT NULL DEFAULT 0 CHECK(total>=0),paid numeric(16,2) NOT NULL DEFAULT 0 CHECK(paid>=0 AND paid<=total),reference_id uuid,note text NOT NULL DEFAULT '' CHECK(length(note)<=1000),created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL REFERENCES auth.users(id),UNIQUE(cafe_id,id),FOREIGN KEY(cafe_id,party_id) REFERENCES public.bf_parties(cafe_id,id),FOREIGN KEY(cafe_id,shift_id) REFERENCES public.bf_shifts(cafe_id,id),FOREIGN KEY(cafe_id,account_id) REFERENCES public.bf_accounts(cafe_id,id),FOREIGN KEY(cafe_id,warehouse_id) REFERENCES public.bf_warehouses(cafe_id,id),FOREIGN KEY(cafe_id,reference_id) REFERENCES public.bf_documents(cafe_id,id));
CREATE UNIQUE INDEX bf_one_full_refund ON public.bf_documents(cafe_id,reference_id) WHERE kind='refund';
CREATE INDEX bf_documents_history ON public.bf_documents(cafe_id,created_at DESC);
CREATE INDEX bf_documents_reference ON public.bf_documents(reference_id,kind,cafe_id) WHERE reference_id IS NOT NULL;
CREATE TABLE public.bf_document_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,document_id uuid NOT NULL,product_id uuid REFERENCES public.menu_products(id),item_id uuid,name text NOT NULL,quantity numeric(16,3) NOT NULL CHECK(quantity>0),unit_price numeric(16,2) NOT NULL CHECK(unit_price>=0),net numeric(16,2) NOT NULL,tax numeric(16,2) NOT NULL DEFAULT 0,cost numeric(16,2) NOT NULL DEFAULT 0 CHECK(cost>=0),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),FOREIGN KEY(cafe_id,item_id) REFERENCES public.bf_items(cafe_id,id));
CREATE INDEX bf_lines_document ON public.bf_document_lines(cafe_id,document_id);
CREATE TABLE public.bf_journal(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,document_id uuid NOT NULL,account_id uuid NOT NULL,debit numeric(16,2) NOT NULL DEFAULT 0,credit numeric(16,2) NOT NULL DEFAULT 0,party_id uuid,memo text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),CHECK(debit>=0 AND credit>=0 AND ((debit>0 AND credit=0) OR (credit>0 AND debit=0))),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),FOREIGN KEY(cafe_id,account_id) REFERENCES public.bf_accounts(cafe_id,id),FOREIGN KEY(cafe_id,party_id) REFERENCES public.bf_parties(cafe_id,id));
CREATE INDEX bf_journal_account ON public.bf_journal(cafe_id,account_id,created_at);
CREATE INDEX bf_journal_document ON public.bf_journal(cafe_id,document_id);
CREATE INDEX bf_journal_party ON public.bf_journal(cafe_id,party_id,account_id) WHERE party_id IS NOT NULL;
CREATE TABLE public.bf_movements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,document_id uuid NOT NULL,item_id uuid NOT NULL,warehouse_id uuid NOT NULL,quantity numeric(16,3) NOT NULL CHECK(quantity<>0),unit_cost numeric(18,6) NOT NULL CHECK(unit_cost>=0),created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),FOREIGN KEY(cafe_id,item_id) REFERENCES public.bf_items(cafe_id,id),FOREIGN KEY(cafe_id,warehouse_id) REFERENCES public.bf_warehouses(cafe_id,id));
CREATE INDEX bf_movements_item ON public.bf_movements(cafe_id,item_id,created_at);
CREATE TABLE public.bf_requests(cafe_id uuid NOT NULL REFERENCES public.cafes(id),request_id uuid NOT NULL,operation text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(cafe_id,request_id));
-- PostgreSQL numeric accepts NaN (including whitespace when cast from text).
-- Every stored numeric rejects it, independently of JSON validation and API callers.
DO $$ DECLARE col record; BEGIN FOR col IN SELECT c.relname,a.attname FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'bf_%' AND a.atttypid='numeric'::regtype AND a.attnum>0 AND NOT a.attisdropped LOOP EXECUTE format('ALTER TABLE public.%I ADD CHECK (%I <> ''NaN''::numeric)',col.relname,col.attname); END LOOP; END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['settings','staff','accounts','parties','warehouses','items','stock','shifts','documents','document_lines','journal','movements','requests'] LOOP EXECUTE format('ALTER TABLE public.bf_%I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('REVOKE ALL ON public.bf_%I FROM PUBLIC,anon,authenticated',t); END LOOP; END $$;
-- RPC-only tables: no permissive direct-write policy can bypass posting invariants.
CREATE FUNCTION brand_finance_private.role_for(p_cafe uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active') OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND deleted_at IS NULL AND status IN('active','published')) OR NOT platform_access_private.service_enabled(p_cafe,'finance') THEN RAISE EXCEPTION 'Finance access denied' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND owner_user_id=auth.uid()) THEN RETURN 'owner'; END IF;
 SELECT role INTO r FROM public.bf_staff WHERE cafe_id=p_cafe AND user_id=auth.uid() AND active FOR SHARE;
 IF r IS NULL THEN RAISE EXCEPTION 'Finance staff access denied' USING ERRCODE='42501'; END IF;
 RETURN r;
END $$;
CREATE FUNCTION brand_finance_private.seed(p_cafe uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.bf_settings(cafe_id) VALUES(p_cafe) ON CONFLICT DO NOTHING;
 INSERT INTO public.bf_accounts(cafe_id,code,name,kind) SELECT p_cafe,v.code,v.name,v.kind FROM (VALUES('1000','الخزينة الرئيسية','cash'),('1010','الحساب البنكي','bank'),('1020','تسويات نقاط البيع','pos'),('1030','عهد الموظفين','employee'),('1100','ذمم العملاء','receivable'),('1200','المخزون','inventory'),('1300','ضريبة المدخلات','vat_input'),('2000','ذمم الموردين','payable'),('2100','ضريبة المخرجات','vat_output'),('3000','حقوق الملكية والأرصدة الافتتاحية','equity'),('4000','إيرادات المبيعات','revenue'),('5000','تكلفة المبيعات','expense'),('5100','المصروفات التشغيلية','expense'),('5200','تسويات المخزون','expense'),('5300','فروقات الصندوق','expense')) v(code,name,kind) ON CONFLICT(cafe_id,code) DO NOTHING;
 INSERT INTO public.bf_warehouses(cafe_id,name) VALUES(p_cafe,'المخزن الرئيسي') ON CONFLICT(cafe_id,name) DO NOTHING;
END $$;
CREATE FUNCTION brand_finance_private.account(p_cafe uuid,p_code text) RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS $$ SELECT id FROM public.bf_accounts WHERE cafe_id=p_cafe AND code=p_code $$;
CREATE FUNCTION brand_finance_private.line(p_cafe uuid,p_doc uuid,p_account uuid,p_debit numeric,p_credit numeric,p_party uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=p_cafe AND account_id=p_account AND status='handover') THEN RAISE EXCEPTION 'الخزينة قيد تسليم الوردية انتظر قبول الاستلام'; END IF;
 IF round(p_debit,2)=0 AND round(p_credit,2)=0 THEN RETURN; END IF;
 INSERT INTO public.bf_journal(cafe_id,document_id,account_id,debit,credit,party_id) VALUES(p_cafe,p_doc,p_account,round(p_debit,2),round(p_credit,2),p_party); END $$;
CREATE FUNCTION brand_finance_private.stock_move(p_cafe uuid,p_doc uuid,p_item uuid,p_warehouse uuid,p_quantity numeric,p_cost numeric) RETURNS numeric LANGUAGE plpgsql SET search_path='' AS $$
DECLARE s public.bf_stock%ROWTYPE; c numeric; movement_value numeric; next_value numeric;
BEGIN
 IF p_quantity=0 OR p_quantity IS NULL OR p_cost<0 OR p_cost IS NULL THEN RAISE EXCEPTION 'Invalid stock movement'; END IF;
 INSERT INTO public.bf_stock(cafe_id,warehouse_id,item_id) VALUES(p_cafe,p_warehouse,p_item) ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT s FROM public.bf_stock WHERE cafe_id=p_cafe AND warehouse_id=p_warehouse AND item_id=p_item FOR UPDATE;
 IF s.quantity+p_quantity<0 THEN RAISE EXCEPTION 'الكمية المتاحة في المخزون غير كافية'; END IF;
 movement_value:=CASE WHEN p_quantity<0 AND abs(p_quantity)=s.quantity THEN s.value ELSE round(abs(p_quantity)*CASE WHEN p_quantity<0 THEN s.average_cost ELSE p_cost END,2) END;
 c:=movement_value/abs(p_quantity); next_value:=s.value+CASE WHEN p_quantity<0 THEN -movement_value ELSE movement_value END;
 UPDATE public.bf_stock SET quantity=s.quantity+p_quantity,value=next_value,average_cost=CASE WHEN s.quantity+p_quantity=0 THEN 0 ELSE next_value/(s.quantity+p_quantity) END WHERE cafe_id=p_cafe AND warehouse_id=p_warehouse AND item_id=p_item;
 INSERT INTO public.bf_movements(cafe_id,document_id,item_id,warehouse_id,quantity,unit_cost) VALUES(p_cafe,p_doc,p_item,p_warehouse,p_quantity,c);
 RETURN movement_value;
END $$;
CREATE FUNCTION brand_finance_private.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'Posted finance records are immutable'; END $$;
CREATE FUNCTION brand_finance_private.balance_check() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN IF EXISTS(SELECT 1 FROM public.bf_journal WHERE cafe_id=NEW.cafe_id AND document_id=NEW.document_id GROUP BY document_id HAVING sum(debit)<>sum(credit)) THEN RAISE EXCEPTION 'Journal is not balanced'; END IF; RETURN NULL; END $$;
CREATE CONSTRAINT TRIGGER bf_balanced AFTER INSERT ON public.bf_journal DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION brand_finance_private.balance_check();
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['documents','document_lines','journal','movements','requests'] LOOP EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.bf_%I FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable()',t); END LOOP; END $$;
CREATE FUNCTION public.brand_finance_execute(p_cafe_id uuid,p_operation text,p_payload jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE r text; pos integer:=0; old public.bf_requests%ROWTYPE; cfg public.bf_settings%ROWTYPE; d public.bf_documents%ROWTYPE; original public.bf_documents%ROWTYPE; sh public.bf_shifts%ROWTYPE; entry jsonb; prod record; it public.bf_items%ROWTYPE; id uuid:=gen_random_uuid(); aid uuid; aid2 uuid; pid uuid; wid uuid; iid uuid; sid uuid; uid uuid; qty numeric; price numeric; amount numeric; cost numeric:=0; subtotal numeric:=0; discount numeric:=0; tax numeric:=0; total numeric:=0; paid numeric:=0; net numeric; expected numeric; counted numeric; remaining numeric; tax_left numeric; line_tax numeric; note text:=coalesce(p_payload->>'note',''); result jsonb; kind text; n bigint; lines jsonb:='[]'; saved record;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 r:=brand_finance_private.role_for(p_cafe_id);
 SELECT NULL::uuid AS id,NULL::text AS name,NULL::numeric AS price,NULL::uuid AS item_id INTO prod;
 IF p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>100000 OR p_payload::text ~* '"[-+]?(nan|infinity)"' THEN RAISE EXCEPTION 'Invalid command'; END IF;
 -- One tenant posting lock gives deterministic document, stock and account ordering.
 SELECT * INTO old FROM public.bf_requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN IF old.operation<>p_operation OR old.payload<>p_payload OR old.created_by<>auth.uid() THEN RAISE EXCEPTION 'Request identifier conflict'; END IF; RETURN old.result||'{"duplicate":true}'::jsonb; END IF;
 IF r='cashier' AND p_operation NOT IN('sale','shift_open','shift_close','shift_handover','shift_accept') THEN RAISE EXCEPTION 'Finance manager required' USING ERRCODE='42501'; END IF;
 IF p_operation IN('settings','staff') AND r<>'owner' THEN RAISE EXCEPTION 'Finance owner required' USING ERRCODE='42501'; END IF;
 PERFORM brand_finance_private.seed(p_cafe_id);
 SELECT * INTO STRICT cfg FROM public.bf_settings WHERE cafe_id=p_cafe_id FOR UPDATE;
 IF cfg.closed_through IS NOT NULL AND (now() AT TIME ZONE 'Asia/Riyadh')::date<=cfg.closed_through AND p_operation NOT IN('settings','staff') THEN RAISE EXCEPTION 'الفترة المالية مقفلة'; END IF;
 aid:=nullif(p_payload->>'accountId','')::uuid; pid:=nullif(p_payload->>'partyId','')::uuid; wid:=nullif(p_payload->>'warehouseId','')::uuid; iid:=nullif(p_payload->>'itemId','')::uuid; sid:=nullif(p_payload->>'shiftId','')::uuid;
 IF aid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE bf_accounts.id=aid AND cafe_id=p_cafe_id AND active) THEN RAISE EXCEPTION 'Invalid account'; END IF;
 IF aid IS NOT NULL AND p_operation IN('purchase','settlement') AND NOT EXISTS(SELECT 1 FROM public.bf_accounts a WHERE a.id=aid AND a.cafe_id=p_cafe_id AND a.kind IN('cash','bank','pos')) THEN RAISE EXCEPTION 'Treasury payment account required'; END IF;
 IF pid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bf_parties WHERE bf_parties.id=pid AND cafe_id=p_cafe_id AND active) THEN RAISE EXCEPTION 'Invalid party'; END IF;
 IF wid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bf_warehouses WHERE bf_warehouses.id=wid AND cafe_id=p_cafe_id AND active) THEN RAISE EXCEPTION 'Invalid warehouse'; END IF;
 IF iid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bf_items WHERE bf_items.id=iid AND cafe_id=p_cafe_id AND active) THEN RAISE EXCEPTION 'Invalid item'; END IF;
 IF p_operation='settings' THEN
  IF nullif(p_payload->>'closedThrough','')::date < cfg.closed_through OR (cfg.closed_through IS NOT NULL AND nullif(p_payload->>'closedThrough','') IS NULL) THEN RAISE EXCEPTION 'Closed period cannot be reopened'; END IF;
  UPDATE public.bf_settings SET vat_rate=(p_payload->>'vatRate')::numeric,tax_inclusive=(p_payload->>'taxInclusive')::boolean,closed_through=nullif(p_payload->>'closedThrough','')::date WHERE cafe_id=p_cafe_id; id:=p_cafe_id;
 ELSIF p_operation='staff' THEN
  IF nullif(p_payload->>'userId','') IS NOT NULL THEN
   SELECT s.user_id INTO uid FROM public.bf_staff s WHERE s.cafe_id=p_cafe_id AND s.user_id=(p_payload->>'userId')::uuid;
  ELSE
   SELECT u.id INTO uid FROM auth.users u JOIN public.profiles p ON p.id=u.id AND p.status='active' WHERE lower(u.email)=lower(btrim(p_payload->>'email'));
  END IF;
  IF uid IS NULL THEN RAISE EXCEPTION 'الموظف يحتاج حسابا مسجلا ونشطا بهذا البريد'; END IF;
  IF NOT coalesce((p_payload->>'active')::boolean,true) AND EXISTS(SELECT 1 FROM public.bf_shifts s WHERE s.cafe_id=p_cafe_id AND s.status IN('open','handover') AND (s.user_id=uid OR s.handover_to=uid)) THEN RAISE EXCEPTION 'أغلق وردية الموظف أو أكمل التسليم قبل إيقاف صلاحياته'; END IF;
  INSERT INTO public.bf_staff(cafe_id,user_id,name,role,active) VALUES(p_cafe_id,uid,btrim(p_payload->>'name'),p_payload->>'role',coalesce((p_payload->>'active')::boolean,true)) ON CONFLICT(cafe_id,user_id) DO UPDATE SET name=excluded.name,role=excluded.role,active=excluded.active; id:=uid;
 ELSIF p_operation='party' THEN
  id:=coalesce(nullif(p_payload->>'id','')::uuid,id);
  IF EXISTS(SELECT 1 FROM public.bf_parties p WHERE p.id=id AND p.cafe_id<>p_cafe_id) THEN RAISE EXCEPTION 'Invalid party'; END IF;
  INSERT INTO public.bf_parties(id,cafe_id,name,kind,phone,email,tax_number,active) VALUES(id,p_cafe_id,btrim(p_payload->>'name'),p_payload->>'kind',coalesce(p_payload->>'phone',''),coalesce(p_payload->>'email',''),coalesce(p_payload->>'taxNumber',''),coalesce((p_payload->>'active')::boolean,true)) ON CONFLICT ON CONSTRAINT bf_parties_cafe_id_id_key DO UPDATE SET name=excluded.name,phone=excluded.phone,email=excluded.email,tax_number=excluded.tax_number,active=excluded.active;
 ELSIF p_operation='account' THEN
  IF p_payload->>'kind' NOT IN('cash','bank','pos','employee') THEN RAISE EXCEPTION 'Invalid treasury account type'; END IF;
  INSERT INTO public.bf_accounts(id,cafe_id,name,code,kind) VALUES(id,p_cafe_id,btrim(p_payload->>'name'),'U-'||id::text,p_payload->>'kind');
 ELSIF p_operation='warehouse' THEN INSERT INTO public.bf_warehouses(id,cafe_id,name) VALUES(id,p_cafe_id,btrim(p_payload->>'name'));
 ELSIF p_operation='item' THEN
  id:=coalesce(nullif(p_payload->>'id','')::uuid,id); uid:=nullif(p_payload->>'menuProductId','')::uuid;
  IF uid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.menu_products WHERE cafe_id=p_cafe_id AND menu_products.id=uid AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Invalid menu product'; END IF;
  INSERT INTO public.bf_items(id,cafe_id,name,sku,unit,menu_product_id,min_quantity) VALUES(id,p_cafe_id,btrim(p_payload->>'name'),btrim(p_payload->>'sku'),coalesce(nullif(p_payload->>'unit',''),'وحدة'),uid,coalesce((p_payload->>'minQuantity')::numeric,0)) ON CONFLICT ON CONSTRAINT bf_items_cafe_id_id_key DO UPDATE SET name=excluded.name,sku=excluded.sku,unit=excluded.unit,min_quantity=excluded.min_quantity;
 ELSIF p_operation='shift_open' THEN
  IF NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND bf_accounts.id=aid AND bf_accounts.kind='cash' AND active) THEN RAISE EXCEPTION 'Cash drawer required'; END IF;
  amount:=round((p_payload->>'openingCash')::numeric,2);
  SELECT coalesce(sum(debit-credit),0) INTO expected FROM public.bf_journal WHERE cafe_id=p_cafe_id AND account_id=aid;
  IF amount IS NULL OR amount<0 OR amount<>expected THEN RAISE EXCEPTION 'رصيد بداية الوردية يجب أن يطابق رصيد الخزينة سجل الرصيد الافتتاحي أولا'; END IF;
  INSERT INTO public.bf_shifts(id,cafe_id,user_id,account_id,opening_cash,expected_cash) VALUES(id,p_cafe_id,auth.uid(),aid,amount,amount);
 ELSIF p_operation IN('shift_close','shift_handover','shift_accept') THEN
  SELECT * INTO sh FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND bf_shifts.id=sid FOR UPDATE;
  IF sh.id IS NULL THEN RAISE EXCEPTION 'Shift not found'; END IF;
  counted:=round((p_payload->>'countedCash')::numeric,2); IF counted IS NULL OR counted<0 THEN RAISE EXCEPTION 'Cash count required'; END IF;
  SELECT coalesce(sum(debit-credit),0) INTO expected FROM public.bf_journal WHERE cafe_id=p_cafe_id AND account_id=sh.account_id;
  IF p_operation='shift_accept' THEN
   IF sh.status<>'handover' OR sh.handover_to<>auth.uid() OR counted<>sh.counted_cash OR counted<>expected THEN RAISE EXCEPTION 'استلام الوردية يتطلب مطابقة المبلغ المسلم'; END IF;
   UPDATE public.bf_shifts SET status='closed',closed_at=now() WHERE bf_shifts.id=sh.id;
   INSERT INTO public.bf_shifts(id,cafe_id,user_id,account_id,opening_cash,expected_cash) VALUES(id,p_cafe_id,auth.uid(),sh.account_id,counted,counted);
  ELSE
   IF sh.user_id<>auth.uid() OR sh.status<>'open' THEN RAISE EXCEPTION 'Only current cashier can close own open shift'; END IF;
   IF p_operation='shift_handover' THEN
    uid:=(p_payload->>'toUserId')::uuid;
    IF uid=auth.uid() OR NOT(EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=p_cafe_id AND user_id=uid AND active) OR EXISTS(SELECT 1 FROM public.cafes WHERE cafes.id=p_cafe_id AND owner_user_id=uid)) THEN RAISE EXCEPTION 'Invalid handover recipient'; END IF;
   END IF;
   IF counted<>expected THEN
    INSERT INTO public.bf_documents(id,cafe_id,kind,shift_id,account_id,total,paid,note,created_by) VALUES(id,p_cafe_id,'shift_variance',sh.id,sh.account_id,abs(counted-expected),abs(counted-expected),note,auth.uid());
    PERFORM brand_finance_private.line(p_cafe_id,id,sh.account_id,greatest(counted-expected,0),greatest(expected-counted,0));
    PERFORM brand_finance_private.line(p_cafe_id,id,brand_finance_private.account(p_cafe_id,'5300'),greatest(expected-counted,0),greatest(counted-expected,0));
   END IF;
   UPDATE public.bf_shifts SET expected_cash=expected,counted_cash=counted,variance=counted-expected,status=CASE WHEN p_operation='shift_close' THEN 'closed' ELSE 'handover' END,closed_at=CASE WHEN p_operation='shift_close' THEN now() ELSE NULL END,handover_to=uid,note=left(note,1000) WHERE bf_shifts.id=sh.id; id:=sh.id;
  END IF;
 ELSIF p_operation IN('sale','purchase') THEN
  IF jsonb_typeof(p_payload->'lines')<>'array' OR jsonb_array_length(p_payload->'lines') NOT BETWEEN 1 AND 100 OR wid IS NULL THEN RAISE EXCEPTION 'Invoice lines and warehouse required'; END IF;
  IF p_operation='sale' THEN
   SELECT * INTO sh FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND bf_shifts.id=sid AND user_id=auth.uid() AND status='open' FOR UPDATE;
   IF sh.id IS NULL THEN RAISE EXCEPTION 'ابدأ وردية قبل تسجيل المبيعات'; END IF;
   IF aid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND bf_accounts.id=aid AND bf_accounts.kind IN('cash','bank','pos')) THEN RAISE EXCEPTION 'Invalid sale payment account'; END IF;
   IF EXISTS(SELECT 1 FROM public.bf_accounts WHERE bf_accounts.id=aid AND bf_accounts.kind='cash') AND aid<>sh.account_id THEN RAISE EXCEPTION 'Cash sale must use shift drawer'; END IF;
   IF pid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bf_parties WHERE bf_parties.id=pid AND bf_parties.kind='customer') THEN RAISE EXCEPTION 'Customer required'; END IF;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM public.bf_parties WHERE bf_parties.id=pid AND cafe_id=p_cafe_id AND bf_parties.kind='supplier') THEN RAISE EXCEPTION 'Supplier required'; END IF;
  END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_payload->'lines') LOOP
   qty:=(entry->>'quantity')::numeric; IF qty IS NULL OR qty<=0 OR qty>1000000 OR qty<>round(qty,3) THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
   IF p_operation='sale' THEN
    SELECT mp.id,mp.name,mp.price,bi.id item_id INTO prod FROM public.menu_products mp LEFT JOIN public.bf_items bi ON bi.menu_product_id=mp.id AND bi.cafe_id=p_cafe_id AND bi.active WHERE mp.id=(entry->>'productId')::uuid AND mp.cafe_id=p_cafe_id AND mp.deleted_at IS NULL AND mp.available FOR SHARE OF mp;
    IF prod.id IS NULL THEN RAISE EXCEPTION 'الصنف غير متاح للبيع'; END IF; price:=prod.price; iid:=prod.item_id;
    IF (entry->>'expectedUnitPrice')::numeric IS DISTINCT FROM price THEN RAISE EXCEPTION 'تغير سعر الصنف حدث المنتجات وراجع الإجمالي قبل تأكيد البيع'; END IF;
   ELSE
    SELECT * INTO it FROM public.bf_items WHERE bf_items.id=(entry->>'itemId')::uuid AND cafe_id=p_cafe_id AND active;
    IF it.id IS NULL THEN RAISE EXCEPTION 'Invalid purchase item'; END IF; price:=round((entry->>'unitPrice')::numeric,2); iid:=it.id;
   END IF;
   IF price IS NULL OR price<0 OR price>10000000 THEN RAISE EXCEPTION 'Invalid unit price'; END IF;
   subtotal:=subtotal+round(qty*price,2);
   lines:=lines||jsonb_build_array(jsonb_build_object('productId',CASE WHEN p_operation='sale' THEN prod.id ELSE NULL END,'itemId',iid,'name',CASE WHEN p_operation='sale' THEN prod.name ELSE it.name END,'quantity',qty,'price',price));
  END LOOP;
  discount:=round(coalesce((p_payload->>'discount')::numeric,0),2); IF discount<0 OR discount>subtotal THEN RAISE EXCEPTION 'Invalid discount'; END IF;
  amount:=subtotal-discount; tax:=CASE WHEN cfg.tax_inclusive THEN round(amount-amount/(1+cfg.vat_rate/100),2) ELSE round(amount*cfg.vat_rate/100,2) END; total:=CASE WHEN cfg.tax_inclusive THEN amount ELSE amount+tax END; net:=total-tax;
  IF total<=0 THEN RAISE EXCEPTION 'Invoice total must be positive'; END IF;
  IF p_operation='sale' AND (p_payload->>'expectedTotal')::numeric IS DISTINCT FROM total THEN RAISE EXCEPTION 'تغير إجمالي البيع حدث المنتجات وراجع الخصم والضريبة'; END IF;
  paid:=CASE WHEN p_operation='sale' THEN CASE WHEN aid IS NULL THEN 0 ELSE total END ELSE round(coalesce((p_payload->>'paid')::numeric,0),2) END;
  IF paid<0 OR paid>total OR (paid>0 AND aid IS NULL) OR (paid<total AND pid IS NULL) THEN RAISE EXCEPTION 'Invalid invoice payment'; END IF;
  INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,shift_id,account_id,warehouse_id,subtotal,discount,tax,total,paid,note,created_by) VALUES(id,p_cafe_id,p_operation,pid,CASE WHEN p_operation='sale' THEN sid ELSE NULL END,aid,wid,subtotal,discount,tax,total,paid,note,auth.uid()) RETURNING number INTO n;
  remaining:=net; tax_left:=tax;
  FOR entry IN SELECT value FROM jsonb_array_elements(lines) LOOP
   pos:=pos+1;
   qty:=(entry->>'quantity')::numeric; price:=(entry->>'price')::numeric; iid:=(entry->>'itemId')::uuid;
   amount:=least(remaining,round(net*(qty*price)/subtotal,2)); remaining:=remaining-amount;
   line_tax:=least(tax_left,round(tax*(qty*price)/subtotal,2)); tax_left:=tax_left-line_tax;
   IF pos=jsonb_array_length(lines) THEN amount:=amount+remaining; remaining:=0; line_tax:=line_tax+tax_left; tax_left:=0; END IF;
   cost:=0; IF iid IS NOT NULL THEN cost:=brand_finance_private.stock_move(p_cafe_id,id,iid,wid,CASE WHEN p_operation='sale' THEN -qty ELSE qty END,CASE WHEN p_operation='purchase' THEN amount/qty ELSE 0 END); END IF;
   INSERT INTO public.bf_document_lines(cafe_id,document_id,product_id,item_id,name,quantity,unit_price,net,tax,cost) VALUES(p_cafe_id,id,(entry->>'productId')::uuid,iid,entry->>'name',qty,price,amount,line_tax,cost);
   IF p_operation='sale' THEN PERFORM brand_finance_private.line(p_cafe_id,id,brand_finance_private.account(p_cafe_id,'5000'),cost,0); PERFORM brand_finance_private.line(p_cafe_id,id,brand_finance_private.account(p_cafe_id,'1200'),0,cost); END IF;
  END LOOP;
  IF p_operation='sale' THEN
   PERFORM brand_finance_private.line(p_cafe_id,id,aid,paid,0); PERFORM brand_finance_private.line(p_cafe_id,id,brand_finance_private.account(p_cafe_id,'1100'),total-paid,0,pid); PERFORM brand_finance_private.line(p_cafe_id,id,brand_finance_private.account(p_cafe_id,'4000'),0,net); PERFORM brand_finance_private.line(p_cafe_id,id,brand_finance_private.account(p_cafe_id,'2100'),0,tax);
  ELSE
   PERFORM brand_finance_private.line(p_cafe_id,id,brand_finance_private.account(p_cafe_id,'1200'),net,0); PERFORM brand_finance_private.line(p_cafe_id,id,brand_finance_private.account(p_cafe_id,'1300'),tax,0); PERFORM brand_finance_private.line(p_cafe_id,id,aid,0,paid); PERFORM brand_finance_private.line(p_cafe_id,id,brand_finance_private.account(p_cafe_id,'2000'),0,total-paid,pid);
  END IF;
 ELSIF p_operation='refund' THEN
  SELECT * INTO original FROM public.bf_documents WHERE cafe_id=p_cafe_id AND bf_documents.id=(p_payload->>'documentId')::uuid AND bf_documents.kind IN('sale','purchase') FOR UPDATE;
  IF original.id IS NULL OR EXISTS(SELECT 1 FROM public.bf_documents WHERE reference_id=original.id AND bf_documents.kind='refund') THEN RAISE EXCEPTION 'تم رد المستند أو تسويته مسبقا'; END IF;
  INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,account_id,warehouse_id,subtotal,discount,tax,total,paid,reference_id,note,created_by) VALUES(id,p_cafe_id,'refund',original.party_id,original.account_id,original.warehouse_id,original.subtotal,original.discount,original.tax,original.total,original.paid+coalesce((SELECT sum(s.total) FROM public.bf_documents s WHERE s.reference_id=original.id AND s.kind='settlement'),0),original.id,note,auth.uid()) RETURNING number INTO n;
  FOR saved IN SELECT * FROM public.bf_document_lines WHERE document_id=original.id LOOP
   cost:=0; IF saved.item_id IS NOT NULL THEN cost:=brand_finance_private.stock_move(p_cafe_id,id,saved.item_id,original.warehouse_id,CASE WHEN original.kind='sale' THEN saved.quantity ELSE -saved.quantity END,saved.cost/saved.quantity); END IF;
   INSERT INTO public.bf_document_lines(cafe_id,document_id,product_id,item_id,name,quantity,unit_price,net,tax,cost) VALUES(p_cafe_id,id,saved.product_id,saved.item_id,saved.name,saved.quantity,saved.unit_price,saved.net,saved.tax,cost);
   IF original.kind='purchase' AND cost<>saved.cost THEN PERFORM brand_finance_private.line(p_cafe_id,id,brand_finance_private.account(p_cafe_id,'5200'),greatest(cost-saved.cost,0),greatest(saved.cost-cost,0)); PERFORM brand_finance_private.line(p_cafe_id,id,brand_finance_private.account(p_cafe_id,'1200'),greatest(saved.cost-cost,0),greatest(cost-saved.cost,0)); END IF;
  END LOOP;
  FOR saved IN SELECT * FROM public.bf_journal WHERE cafe_id=p_cafe_id AND (document_id=original.id OR document_id IN(SELECT s.id FROM public.bf_documents s WHERE s.cafe_id=p_cafe_id AND s.reference_id=original.id AND s.kind='settlement')) LOOP PERFORM brand_finance_private.line(p_cafe_id,id,saved.account_id,saved.credit,saved.debit,saved.party_id); END LOOP;
 ELSIF p_operation='settlement' THEN
  SELECT * INTO original FROM public.bf_documents WHERE cafe_id=p_cafe_id AND bf_documents.id=(p_payload->>'documentId')::uuid AND bf_documents.kind IN('sale','purchase') FOR UPDATE;
  IF original.id IS NULL OR EXISTS(SELECT 1 FROM public.bf_documents WHERE reference_id=original.id AND bf_documents.kind='refund') OR aid IS NULL THEN RAISE EXCEPTION 'Invalid settlement'; END IF;
  SELECT original.total-original.paid-coalesce(sum(bf_documents.total),0) INTO remaining FROM public.bf_documents WHERE reference_id=original.id AND bf_documents.kind='settlement';
  amount:=round((p_payload->>'amount')::numeric,2); IF amount IS NULL OR amount<=0 OR amount>remaining THEN RAISE EXCEPTION 'مبلغ التسوية يتجاوز الرصيد المستحق'; END IF;
  INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,account_id,total,paid,reference_id,note,created_by) VALUES(id,p_cafe_id,'settlement',original.party_id,aid,amount,amount,original.id,note,auth.uid()) RETURNING number INTO n;
  IF original.kind='sale' THEN PERFORM brand_finance_private.line(p_cafe_id,id,aid,amount,0); PERFORM brand_finance_private.line(p_cafe_id,id,brand_finance_private.account(p_cafe_id,'1100'),0,amount,original.party_id);
  ELSE PERFORM brand_finance_private.line(p_cafe_id,id,brand_finance_private.account(p_cafe_id,'2000'),amount,0,original.party_id); PERFORM brand_finance_private.line(p_cafe_id,id,aid,0,amount); END IF;
 ELSIF p_operation IN('stock_adjust','stock_transfer') THEN
  SELECT coalesce(sum(s.quantity),0) INTO expected FROM public.bf_stock s WHERE s.cafe_id=p_cafe_id AND s.item_id=iid AND s.warehouse_id=wid;
  IF p_payload ? 'expectedQuantity' AND (p_payload->>'expectedQuantity')::numeric IS DISTINCT FROM expected THEN RAISE EXCEPTION 'تغير رصيد المخزون حدث الكميات قبل اعتماد الجرد'; END IF;
  IF p_operation='stock_adjust' AND p_payload ? 'countedQuantity' THEN
   counted:=(p_payload->>'countedQuantity')::numeric;
   IF counted IS NULL OR counted<0 OR NOT(p_payload ? 'expectedQuantity') THEN RAISE EXCEPTION 'Invalid stock count'; END IF;
   qty:=counted-expected;
  ELSE qty:=(p_payload->>'quantity')::numeric; END IF;
  IF iid IS NULL OR wid IS NULL OR qty IS NULL OR (qty=0 AND NOT(p_payload ? 'countedQuantity')) OR abs(qty)>1000000 OR qty<>round(qty,3) THEN RAISE EXCEPTION 'Invalid stock quantity'; END IF;
  INSERT INTO public.bf_documents(id,cafe_id,kind,warehouse_id,note,created_by) VALUES(id,p_cafe_id,p_operation,wid,note,auth.uid()) RETURNING number INTO n;
  IF p_operation='stock_transfer' THEN
   aid2:=(p_payload->>'toWarehouseId')::uuid; IF qty<=0 OR aid2=wid OR NOT EXISTS(SELECT 1 FROM public.bf_warehouses WHERE bf_warehouses.id=aid2 AND cafe_id=p_cafe_id AND active) THEN RAISE EXCEPTION 'Invalid destination'; END IF;
   cost:=brand_finance_private.stock_move(p_cafe_id,id,iid,wid,-qty,0); PERFORM brand_finance_private.stock_move(p_cafe_id,id,iid,aid2,qty,cost/qty);
  ELSE
   price:=coalesce((p_payload->>'unitCost')::numeric,0); IF price<0 THEN RAISE EXCEPTION 'Invalid stock cost'; END IF;
   cost:=CASE WHEN qty=0 THEN 0 ELSE brand_finance_private.stock_move(p_cafe_id,id,iid,wid,qty,price) END;
   PERFORM brand_finance_private.line(p_cafe_id,id,brand_finance_private.account(p_cafe_id,'1200'),CASE WHEN qty>0 THEN cost ELSE 0 END,CASE WHEN qty<0 THEN cost ELSE 0 END);
   PERFORM brand_finance_private.line(p_cafe_id,id,brand_finance_private.account(p_cafe_id,'5200'),CASE WHEN qty<0 THEN cost ELSE 0 END,CASE WHEN qty>0 THEN cost ELSE 0 END);
  END IF;
 ELSIF p_operation='treasury' THEN
  kind:=p_payload->>'kind'; amount:=round((p_payload->>'amount')::numeric,2); aid2:=nullif(p_payload->>'toAccountId','')::uuid;
  IF kind NOT IN('receipt','expense','transfer','opening') OR amount IS NULL OR amount<=0 OR aid IS NULL OR NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE bf_accounts.id=aid AND bf_accounts.kind IN('cash','bank','pos','employee')) THEN RAISE EXCEPTION 'Invalid treasury entry'; END IF;
  IF kind='transfer' AND (aid2 IS NULL OR aid=aid2 OR NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE bf_accounts.id=aid2 AND cafe_id=p_cafe_id AND active AND bf_accounts.kind IN('cash','bank','pos','employee'))) THEN RAISE EXCEPTION 'Invalid transfer destination'; END IF;
  IF EXISTS(SELECT 1 FROM public.bf_accounts a WHERE a.cafe_id=p_cafe_id AND a.id IN(aid,aid2) AND a.kind='employee') AND NOT EXISTS(SELECT 1 FROM public.bf_parties p WHERE p.cafe_id=p_cafe_id AND p.id=pid AND p.kind='employee' AND p.active) THEN RAISE EXCEPTION 'اختر الموظف صاحب العهدة'; END IF;
  INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,account_id,total,paid,note,created_by) VALUES(id,p_cafe_id,kind,pid,aid,amount,amount,note,auth.uid()) RETURNING number INTO n;
  IF kind IN('opening','receipt') THEN PERFORM brand_finance_private.line(p_cafe_id,id,aid,amount,0,pid); PERFORM brand_finance_private.line(p_cafe_id,id,brand_finance_private.account(p_cafe_id,CASE WHEN kind='opening' THEN '3000' ELSE '4000' END),0,amount);
  ELSIF kind='expense' THEN PERFORM brand_finance_private.line(p_cafe_id,id,brand_finance_private.account(p_cafe_id,'5100'),amount,0); PERFORM brand_finance_private.line(p_cafe_id,id,aid,0,amount,pid);
  ELSE PERFORM brand_finance_private.line(p_cafe_id,id,aid2,amount,0,pid); PERFORM brand_finance_private.line(p_cafe_id,id,aid,0,amount,pid); END IF;
 ELSIF p_operation='journal' THEN
  IF jsonb_typeof(p_payload->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'lines') NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'Invalid journal'; END IF;
  INSERT INTO public.bf_documents(id,cafe_id,kind,note,created_by) VALUES(id,p_cafe_id,'journal',note,auth.uid()) RETURNING number INTO n;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_payload->'lines') LOOP
   aid:=(entry->>'accountId')::uuid; amount:=round((entry->>'debit')::numeric,2); paid:=round((entry->>'credit')::numeric,2);
   IF NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE bf_accounts.id=aid AND cafe_id=p_cafe_id AND active AND bf_accounts.kind NOT IN('inventory','receivable','payable','employee')) OR amount IS NULL OR paid IS NULL THEN RAISE EXCEPTION 'Invalid journal account'; END IF;
   PERFORM brand_finance_private.line(p_cafe_id,id,aid,amount,paid);
  END LOOP;
  IF (SELECT count(*) FROM public.bf_journal j WHERE j.document_id=id)<2 THEN RAISE EXCEPTION 'Journal requires two positive entries'; END IF;
 ELSE RAISE EXCEPTION 'Unknown finance operation'; END IF;
 -- Reject overdrawing physical custody while allowing bank/clearing timing balances.
 IF EXISTS(SELECT 1 FROM public.bf_accounts a JOIN public.bf_journal j ON j.account_id=a.id WHERE a.cafe_id=p_cafe_id AND a.kind IN('cash','employee') GROUP BY a.id HAVING sum(j.debit-j.credit)<0) THEN RAISE EXCEPTION 'الرصيد النقدي أو رصيد العهدة غير كاف'; END IF;
 IF EXISTS(SELECT 1 FROM public.bf_accounts a JOIN public.bf_journal j ON j.account_id=a.id WHERE a.cafe_id=p_cafe_id AND a.kind='employee' GROUP BY a.id,j.party_id HAVING sum(j.debit-j.credit)<0) THEN RAISE EXCEPTION 'رصيد عهدة هذا الموظف غير كاف'; END IF;
 IF EXISTS(SELECT 1 FROM public.bf_journal WHERE cafe_id=p_cafe_id AND document_id=id GROUP BY document_id HAVING sum(debit)<>sum(credit)) THEN RAISE EXCEPTION 'Unbalanced journal'; END IF;
 result:=jsonb_build_object('id',id,'number',n);
 INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by) VALUES(p_cafe_id,p_request_id,p_operation,p_payload,result,auth.uid());
 RETURN result;
END $$;
CREATE FUNCTION public.brand_finance_context(p_slug text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.cafes%ROWTYPE; r text;
BEGIN
 SELECT * INTO c FROM public.cafes WHERE slug=lower(btrim(p_slug)) AND deleted_at IS NULL;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Finance access denied' USING ERRCODE='42501'; END IF;
 r:=brand_finance_private.role_for(c.id);
 RETURN jsonb_build_object('id',c.id,'name',c.name,'slug',c.slug,'role',r);
END $$;
CREATE FUNCTION public.brand_finance_snapshot(p_cafe_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; managed boolean; answer jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 r:=brand_finance_private.role_for(p_cafe_id); managed:=r IN('owner','manager');
 PERFORM brand_finance_private.seed(p_cafe_id);
 SELECT jsonb_build_object(
  'cafe',(SELECT jsonb_build_object('id',id,'name',name,'slug',slug) FROM public.cafes WHERE id=p_cafe_id),
  'userId',auth.uid(),'role',r,'canManage',managed,'canAdminister',r='owner',
  'settings',(SELECT to_jsonb(s)-'cafe_id' FROM public.bf_settings s WHERE cafe_id=p_cafe_id),
  'accounts',coalesce((SELECT jsonb_agg(to_jsonb(a)-'cafe_id'||jsonb_build_object('balance',CASE WHEN managed THEN coalesce((SELECT sum(j.debit-j.credit) FROM public.bf_journal j WHERE j.cafe_id=p_cafe_id AND j.account_id=a.id),0) ELSE 0 END) ORDER BY a.code) FROM public.bf_accounts a WHERE cafe_id=p_cafe_id AND (managed OR kind IN('cash','bank','pos'))),'[]'::jsonb),
  'parties',coalesce((SELECT jsonb_agg(to_jsonb(p)-'cafe_id'||jsonb_build_object('balance',CASE WHEN managed THEN coalesce((SELECT sum(CASE WHEN p.kind='supplier' THEN j.credit-j.debit ELSE j.debit-j.credit END) FROM public.bf_journal j JOIN public.bf_accounts a ON a.id=j.account_id WHERE j.cafe_id=p_cafe_id AND j.party_id=p.id AND a.kind=CASE p.kind WHEN 'customer' THEN 'receivable' WHEN 'supplier' THEN 'payable' ELSE 'employee' END),0) ELSE 0 END) ORDER BY p.name) FROM public.bf_parties p WHERE cafe_id=p_cafe_id AND (managed OR kind='customer')),'[]'::jsonb),
  'warehouses',coalesce((SELECT jsonb_agg(to_jsonb(w)-'cafe_id' ORDER BY w.name) FROM public.bf_warehouses w WHERE cafe_id=p_cafe_id),'[]'::jsonb),
  'products',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'price',p.price,'imageUrl',p.image_url,'imageStoragePath',p.image_storage_path,'category',coalesce(c.name,''),'available',p.available,'stockTracked',i.id IS NOT NULL,'itemId',i.id,'quantity',coalesce((SELECT sum(quantity) FROM public.bf_stock WHERE cafe_id=p_cafe_id AND item_id=i.id),0)) ORDER BY p.sort_order,p.name) FROM public.menu_products p LEFT JOIN public.menu_categories c ON c.id=p.category_id AND c.cafe_id=p_cafe_id LEFT JOIN public.bf_items i ON i.menu_product_id=p.id AND i.cafe_id=p_cafe_id AND i.active WHERE p.cafe_id=p_cafe_id AND p.deleted_at IS NULL),'[]'::jsonb),
  'items',coalesce((SELECT jsonb_agg(to_jsonb(i)-'cafe_id'||jsonb_build_object('quantity',coalesce((SELECT sum(quantity) FROM public.bf_stock WHERE cafe_id=p_cafe_id AND item_id=i.id),0),'average_cost',CASE WHEN managed THEN coalesce((SELECT sum(quantity*average_cost)/nullif(sum(quantity),0) FROM public.bf_stock WHERE cafe_id=p_cafe_id AND item_id=i.id),0) ELSE 0 END) ORDER BY i.name) FROM public.bf_items i WHERE cafe_id=p_cafe_id),'[]'::jsonb),
  'stock',coalesce((SELECT jsonb_agg(to_jsonb(s)-'cafe_id'-'value'||CASE WHEN managed THEN '{}'::jsonb ELSE '{"average_cost":0}'::jsonb END) FROM public.bf_stock s WHERE cafe_id=p_cafe_id),'[]'::jsonb),
  'documents',coalesce((SELECT jsonb_agg(to_jsonb(d)-'cafe_id'-'created_by'||jsonb_build_object('outstanding',CASE WHEN EXISTS(SELECT 1 FROM public.bf_documents ref WHERE ref.reference_id=d.id AND ref.kind='refund') THEN 0 ELSE greatest(d.total-d.paid-coalesce((SELECT sum(settle.total) FROM public.bf_documents settle WHERE settle.reference_id=d.id AND settle.kind='settlement'),0),0) END,'refunded',EXISTS(SELECT 1 FROM public.bf_documents f WHERE f.cafe_id=p_cafe_id AND f.reference_id=d.id AND f.kind='refund'),'lines',coalesce((SELECT jsonb_agg(to_jsonb(l)-'cafe_id'-'document_id'||CASE WHEN managed THEN '{}'::jsonb ELSE '{"cost":0}'::jsonb END) FROM public.bf_document_lines l WHERE l.cafe_id=p_cafe_id AND l.document_id=d.id),'[]'::jsonb)) ORDER BY d.created_at DESC,d.id) FROM (SELECT * FROM public.bf_documents WHERE cafe_id=p_cafe_id AND (managed OR (created_by=auth.uid() AND kind='sale')) ORDER BY created_at DESC,id LIMIT 500) d),'[]'::jsonb),
  'shifts',coalesce((SELECT jsonb_agg(to_jsonb(s)-'cafe_id'||jsonb_build_object('expected_cash',CASE WHEN s.status='closed' THEN s.expected_cash ELSE coalesce((SELECT sum(j.debit-j.credit) FROM public.bf_journal j WHERE j.cafe_id=p_cafe_id AND j.account_id=s.account_id),0) END) ORDER BY opened_at DESC) FROM (SELECT * FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND (managed OR user_id=auth.uid() OR handover_to=auth.uid()) ORDER BY opened_at DESC LIMIT 200) s),'[]'::jsonb),
  'staff',coalesce((SELECT jsonb_agg(to_jsonb(s)-'cafe_id') FROM public.bf_staff s WHERE cafe_id=p_cafe_id AND (managed OR active)),'[]'::jsonb)||jsonb_build_array((SELECT jsonb_build_object('user_id',owner_user_id,'name','مالك العلامة','role','manager','active',true) FROM public.cafes WHERE id=p_cafe_id)),
  'journal',CASE WHEN managed THEN coalesce((SELECT jsonb_agg(to_jsonb(j)-'cafe_id'-'party_id' ORDER BY j.created_at DESC,j.id) FROM (SELECT * FROM public.bf_journal WHERE cafe_id=p_cafe_id ORDER BY created_at DESC,id LIMIT 2000) j),'[]'::jsonb) ELSE '[]'::jsonb END,
  'movements',CASE WHEN managed THEN coalesce((SELECT jsonb_agg(to_jsonb(m)-'cafe_id' ORDER BY m.created_at DESC,m.id) FROM (SELECT * FROM public.bf_movements WHERE cafe_id=p_cafe_id ORDER BY created_at DESC,id LIMIT 1000) m),'[]'::jsonb) ELSE '[]'::jsonb END,
  'trialBalance',CASE WHEN managed THEN coalesce((SELECT jsonb_agg(jsonb_build_object('account_id',a.id,'name',a.name,'kind',a.kind,'debit',coalesce(j.debit,0),'credit',coalesce(j.credit,0),'balance',coalesce(j.debit-j.credit,0)) ORDER BY a.code) FROM public.bf_accounts a LEFT JOIN(SELECT account_id,sum(debit) debit,sum(credit) credit FROM public.bf_journal WHERE cafe_id=p_cafe_id GROUP BY account_id) j ON j.account_id=a.id WHERE a.cafe_id=p_cafe_id),'[]'::jsonb) ELSE '[]'::jsonb END,
  'summary',jsonb_build_object('sales',CASE WHEN managed THEN coalesce((SELECT sum(j.credit-j.debit) FROM public.bf_journal j JOIN public.bf_accounts a ON a.id=j.account_id WHERE j.cafe_id=p_cafe_id AND a.kind='revenue'),0) ELSE 0 END,'purchases',CASE WHEN managed THEN coalesce((SELECT sum(CASE WHEN d.kind='purchase' THEN d.total ELSE -d.total END) FROM public.bf_documents d LEFT JOIN public.bf_documents orig ON orig.id=d.reference_id WHERE d.cafe_id=p_cafe_id AND (d.kind='purchase' OR (d.kind='refund' AND orig.kind='purchase'))),0) ELSE 0 END,'expenses',CASE WHEN managed THEN coalesce((SELECT sum(j.debit-j.credit) FROM public.bf_journal j JOIN public.bf_accounts a ON a.id=j.account_id WHERE j.cafe_id=p_cafe_id AND a.kind='expense'),0) ELSE 0 END,'profit',0,'receivables',CASE WHEN managed THEN coalesce((SELECT sum(j.debit-j.credit) FROM public.bf_journal j JOIN public.bf_accounts a ON a.id=j.account_id WHERE j.cafe_id=p_cafe_id AND a.kind='receivable'),0) ELSE 0 END,'payables',CASE WHEN managed THEN coalesce((SELECT sum(j.credit-j.debit) FROM public.bf_journal j JOIN public.bf_accounts a ON a.id=j.account_id WHERE j.cafe_id=p_cafe_id AND a.kind='payable'),0) ELSE 0 END,'inventoryValue',CASE WHEN managed THEN coalesce((SELECT sum(value) FROM public.bf_stock WHERE cafe_id=p_cafe_id),0) ELSE 0 END),
  'truncated',(SELECT count(*)>500 FROM public.bf_documents WHERE cafe_id=p_cafe_id) OR (SELECT count(*)>2000 FROM public.bf_journal WHERE cafe_id=p_cafe_id)
 ) INTO answer;
 answer:=jsonb_set(answer,'{summary,profit}',to_jsonb((answer#>>'{summary,sales}')::numeric-(answer#>>'{summary,expenses}')::numeric));
 RETURN answer;
END $$;
CREATE FUNCTION public.brand_finance_history(p_cafe_id uuid,p_kind text,p_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; rows jsonb; more boolean;
BEGIN
 r:=brand_finance_private.role_for(p_cafe_id);
 IF r='cashier' OR p_offset<0 OR p_offset>10000000 OR p_kind NOT IN('documents','journal','movements') THEN RAISE EXCEPTION 'Finance history access denied' USING ERRCODE='42501'; END IF;
 IF p_kind='documents' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(d)-'cafe_id'-'created_by'||jsonb_build_object('outstanding',CASE WHEN EXISTS(SELECT 1 FROM public.bf_documents f WHERE f.reference_id=d.id AND f.kind='refund') THEN 0 ELSE greatest(d.total-d.paid-coalesce((SELECT sum(s.total) FROM public.bf_documents s WHERE s.reference_id=d.id AND s.kind='settlement'),0),0) END,'refunded',EXISTS(SELECT 1 FROM public.bf_documents f WHERE f.reference_id=d.id AND f.kind='refund'),'lines',coalesce((SELECT jsonb_agg(to_jsonb(l)-'cafe_id'-'document_id') FROM public.bf_document_lines l WHERE l.document_id=d.id),'[]'::jsonb)) ORDER BY d.created_at DESC,d.id),'[]'::jsonb) INTO rows FROM (SELECT * FROM public.bf_documents WHERE cafe_id=p_cafe_id ORDER BY created_at DESC,id OFFSET p_offset LIMIT 100) d;
  SELECT EXISTS(SELECT 1 FROM public.bf_documents WHERE cafe_id=p_cafe_id OFFSET p_offset+100 LIMIT 1) INTO more;
 ELSIF p_kind='journal' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(j)-'cafe_id'-'party_id' ORDER BY j.created_at DESC,j.id),'[]'::jsonb) INTO rows FROM (SELECT * FROM public.bf_journal WHERE cafe_id=p_cafe_id ORDER BY created_at DESC,id OFFSET p_offset LIMIT 100) j;
  SELECT EXISTS(SELECT 1 FROM public.bf_journal WHERE cafe_id=p_cafe_id OFFSET p_offset+100 LIMIT 1) INTO more;
 ELSE
  SELECT coalesce(jsonb_agg(to_jsonb(m)-'cafe_id' ORDER BY m.created_at DESC,m.id),'[]'::jsonb) INTO rows FROM (SELECT * FROM public.bf_movements WHERE cafe_id=p_cafe_id ORDER BY created_at DESC,id OFFSET p_offset LIMIT 100) m;
  SELECT EXISTS(SELECT 1 FROM public.bf_movements WHERE cafe_id=p_cafe_id OFFSET p_offset+100 LIMIT 1) INTO more;
 END IF;
 RETURN jsonb_build_object('rows',rows,'hasMore',more);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA brand_finance_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.brand_finance_execute(uuid,text,jsonb,uuid),public.brand_finance_snapshot(uuid),public.brand_finance_context(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_execute(uuid,text,jsonb,uuid),public.brand_finance_snapshot(uuid),public.brand_finance_context(text) TO authenticated;
REVOKE ALL ON FUNCTION public.brand_finance_history(uuid,text,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_history(uuid,text,integer) TO authenticated;
COMMIT;
