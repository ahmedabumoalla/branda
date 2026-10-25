BEGIN;
-- Requests are non-posting audit records. Only actual brand owners can approve sales refunds.
CREATE TABLE public.bf_refund_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 cafe_id uuid NOT NULL REFERENCES public.cafes(id),
 document_id uuid NOT NULL REFERENCES public.bf_documents(id),
 document_number bigint NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 total numeric(18,2) NOT NULL CHECK(total>=0),
 paid numeric(18,2) NOT NULL CHECK(paid>=0 AND paid<=total),
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid REFERENCES auth.users(id),reviewed_at timestamptz,
 refund_document_id uuid UNIQUE REFERENCES public.bf_documents(id),rejection_reason text,
 CHECK((status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND refund_document_id IS NULL AND rejection_reason IS NULL) OR
       (status='approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND refund_document_id IS NOT NULL AND rejection_reason IS NULL) OR
       (status='rejected' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND refund_document_id IS NULL AND nullif(btrim(rejection_reason),'') IS NOT NULL))
);
CREATE INDEX bf_refund_requests_tenant_status ON public.bf_refund_requests(cafe_id,status,created_at DESC);
CREATE INDEX bf_refund_requests_source ON public.bf_refund_requests(document_id);
ALTER TABLE public.bf_refund_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_refund_requests FROM PUBLIC,anon,authenticated;
CREATE FUNCTION brand_finance_private.refund_quote(p_cafe uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE original public.bf_documents%ROWTYPE; source jsonb; entry jsonb; available jsonb; selections jsonb; prepared jsonb:='[]'; state jsonb;
 qty numeric; before_qty numeric; line_net numeric; line_tax numeric; line_cost numeric; line_gross numeric; net numeric:=0; tax numeric:=0; gross numeric:=0; total numeric; discount numeric; debt numeric; paid numeric; actual_cost numeric; aid uuid; number bigint; item uuid; r text; sh public.bf_shifts%ROWTYPE;
BEGIN
 r:=brand_finance_private.role_for(p_cafe);
 SELECT * INTO original FROM public.bf_documents WHERE cafe_id=p_cafe AND id=(p_payload->>'documentId')::uuid AND kind IN('sale','purchase') FOR UPDATE;
 IF original.id IS NULL THEN RAISE EXCEPTION 'الفاتورة غير متاحة للإرجاع'; END IF;
 IF original.kind<>'sale' OR (r='cashier' AND original.created_by<>auth.uid()) THEN RAISE EXCEPTION 'Sale refund access denied' USING ERRCODE='42501'; END IF;
 available:=brand_finance_private.refund_lines(p_cafe,original.id,true);
 state:=brand_finance_private.document_state(p_cafe,original.id);
 IF (state->>'refunded')::boolean THEN RAISE EXCEPTION 'تم إرجاع جميع كميات الفاتورة'; END IF;
 IF p_payload ? 'lines' THEN selections:=p_payload->'lines'; ELSE
  SELECT jsonb_agg(jsonb_build_object('lineId',l->>'id','quantity',(l->>'quantity')::numeric-(l->>'returned_quantity')::numeric)) INTO selections FROM jsonb_array_elements(available) l WHERE (l->>'quantity')::numeric>(l->>'returned_quantity')::numeric;
 END IF;
 IF jsonb_typeof(selections) IS DISTINCT FROM 'array' OR jsonb_array_length(selections) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'حدد الأصناف والكميات المرتجعة'; END IF;
 IF (SELECT count(DISTINCT e->>'lineId') FROM jsonb_array_elements(selections) e)<>jsonb_array_length(selections) THEN RAISE EXCEPTION 'لا تكرر الصنف في طلب المرتجع'; END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(selections) LOOP
  SELECT l INTO source FROM jsonb_array_elements(available) l WHERE l->>'id'=entry->>'lineId';
  IF source IS NULL THEN RAISE EXCEPTION 'الصنف لا ينتمي إلى الفاتورة'; END IF;
  qty:=(entry->>'quantity')::numeric; before_qty:=(source->>'returned_quantity')::numeric;
  IF qty IS NULL OR qty<=0 OR qty<>round(qty,3) OR qty>(source->>'quantity')::numeric-before_qty THEN RAISE EXCEPTION 'الكمية المرتجعة تتجاوز الكمية المتبقية'; END IF;
  IF entry ? 'expectedReturnedQuantity' AND (entry->>'expectedReturnedQuantity')::numeric IS DISTINCT FROM before_qty THEN RAISE EXCEPTION 'تغيرت الكمية المرتجعة حدث الفاتورة ثم أعد المحاولة'; END IF;
  line_net:=round((source->>'net')::numeric*(before_qty+qty)/(source->>'quantity')::numeric,2)-(source->>'returned_net')::numeric;
  line_tax:=round((source->>'tax')::numeric*(before_qty+qty)/(source->>'quantity')::numeric,2)-(source->>'returned_tax')::numeric;
  line_cost:=round((source->>'cost')::numeric*(before_qty+qty)/(source->>'quantity')::numeric,2)-(source->>'returned_cost')::numeric;
  line_gross:=round(qty*(source->>'unit_price')::numeric,2);
  net:=net+line_net; tax:=tax+line_tax; gross:=gross+line_gross;
  prepared:=prepared||jsonb_build_array(source||jsonb_build_object('return_quantity',qty,'return_net',line_net,'return_tax',line_tax,'return_cost',line_cost));
 END LOOP;
 total:=net+tax;
 IF p_payload ? 'lines' AND (p_payload->>'expectedTotal')::numeric IS DISTINCT FROM total THEN RAISE EXCEPTION 'تغير إجمالي المرتجع راجع الكميات'; END IF;
 discount:=greatest(0,gross-net-CASE WHEN coalesce(original.tax_inclusive,true) THEN tax ELSE 0 END);
 debt:=least(total,(state->>'outstanding')::numeric); paid:=total-debt;
 IF (p_payload->>'expectedPaid')::numeric IS DISTINCT FROM paid THEN RAISE EXCEPTION 'تغير المبلغ المدفوع للعميل ارفض الطلب وأنشئ طلبا محدثا'; END IF;
 IF nullif(btrim(p_payload->>'note'),'') IS NULL THEN RAISE EXCEPTION 'أدخل سبب المرتجع'; END IF;
 aid:=nullif(p_payload->>'accountId','')::uuid;
 IF paid>0 THEN
  IF p_payload->>'paymentMethod' NOT IN('cash','bank') OR p_payload->>'paymentMethod' IS NULL THEN RAISE EXCEPTION 'حدد دفع المرتجع نقدا أو بتحويل بنكي'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe AND id=aid AND active AND kind=p_payload->>'paymentMethod') THEN RAISE EXCEPTION 'حساب الدفع لا يطابق طريقة دفع المرتجع'; END IF;
  IF p_payload->>'paymentMethod'='cash' THEN
   SELECT * INTO sh FROM public.bf_shifts WHERE cafe_id=p_cafe AND account_id=aid AND status IN('open','handover') FOR UPDATE;
   IF sh.id IS NOT NULL THEN
    IF sh.status<>'open' OR nullif(p_payload->>'shiftId','')::uuid IS DISTINCT FROM sh.id OR (r='cashier' AND sh.user_id<>auth.uid()) OR (p_payload ? 'shiftUserId' AND (p_payload->>'shiftUserId')::uuid IS DISTINCT FROM sh.user_id) THEN RAISE EXCEPTION 'تغيرت عهدة الوردية أو حالتها أنشئ طلبا محدثا'; END IF;
   ELSIF nullif(p_payload->>'shiftId','') IS NOT NULL OR r='cashier' THEN RAISE EXCEPTION 'اختر وردية مفتوحة تابعة للكاشير لصرف المرتجع النقدي'; END IF;
  ELSIF nullif(p_payload->>'shiftId','') IS NOT NULL THEN RAISE EXCEPTION 'الصرف من الوردية متاح للدفع النقدي فقط'; END IF;
 ELSE aid:=NULL;
 END IF;
 SELECT jsonb_agg(jsonb_build_object('lineId',l->>'id','name',l->>'name','quantity',(l->>'return_quantity')::numeric,'expectedReturnedQuantity',(l->>'returned_quantity')::numeric,'unitPrice',(l->>'unit_price')::numeric,'net',(l->>'return_net')::numeric,'tax',(l->>'return_tax')::numeric)) INTO selections FROM jsonb_array_elements(prepared) l;
 RETURN jsonb_build_object('documentId',original.id,'documentNumber',original.number,'lines',selections,'expectedTotal',total,'expectedPaid',paid,'paymentMethod',CASE WHEN paid>0 THEN p_payload->>'paymentMethod' ELSE NULL END,'accountId',aid,'shiftId',sh.id,'shiftUserId',sh.user_id,'note',left(p_payload->>'note',1000));
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.refund_quote(uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION brand_finance_private.post_refund(p_cafe uuid,p_payload jsonb,p_id uuid) RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE original public.bf_documents%ROWTYPE; source jsonb; entry jsonb; available jsonb; selections jsonb; prepared jsonb:='[]'; state jsonb;
 qty numeric; before_qty numeric; line_net numeric; line_tax numeric; line_cost numeric; line_gross numeric; net numeric:=0; tax numeric:=0; gross numeric:=0; total numeric; discount numeric; debt numeric; paid numeric; actual_cost numeric; aid uuid; number bigint; item uuid;
BEGIN
 IF brand_finance_private.role_for(p_cafe) NOT IN('owner','manager') THEN RAISE EXCEPTION 'Finance manager required' USING ERRCODE='42501'; END IF;
 SELECT * INTO original FROM public.bf_documents WHERE cafe_id=p_cafe AND id=(p_payload->>'documentId')::uuid AND kind IN('sale','purchase') FOR UPDATE;
 IF original.kind='sale' AND NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND owner_user_id=auth.uid()) THEN RAISE EXCEPTION 'Brand owner required' USING ERRCODE='42501'; END IF;
 IF original.id IS NULL THEN RAISE EXCEPTION 'الفاتورة غير متاحة للإرجاع'; END IF;
 available:=brand_finance_private.refund_lines(p_cafe,original.id,true);
 state:=brand_finance_private.document_state(p_cafe,original.id);
 IF (state->>'refunded')::boolean THEN RAISE EXCEPTION 'تم إرجاع جميع كميات الفاتورة'; END IF;
 IF p_payload ? 'lines' THEN selections:=p_payload->'lines'; ELSE
  SELECT jsonb_agg(jsonb_build_object('lineId',l->>'id','quantity',(l->>'quantity')::numeric-(l->>'returned_quantity')::numeric)) INTO selections FROM jsonb_array_elements(available) l WHERE (l->>'quantity')::numeric>(l->>'returned_quantity')::numeric;
 END IF;
 IF jsonb_typeof(selections) IS DISTINCT FROM 'array' OR jsonb_array_length(selections) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'حدد الأصناف والكميات المرتجعة'; END IF;
 IF (SELECT count(DISTINCT e->>'lineId') FROM jsonb_array_elements(selections) e)<>jsonb_array_length(selections) THEN RAISE EXCEPTION 'لا تكرر الصنف في طلب المرتجع'; END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(selections) LOOP
  SELECT l INTO source FROM jsonb_array_elements(available) l WHERE l->>'id'=entry->>'lineId';
  IF source IS NULL THEN RAISE EXCEPTION 'الصنف لا ينتمي إلى الفاتورة'; END IF;
  qty:=(entry->>'quantity')::numeric; before_qty:=(source->>'returned_quantity')::numeric;
  IF qty IS NULL OR qty<=0 OR qty<>round(qty,3) OR qty>(source->>'quantity')::numeric-before_qty THEN RAISE EXCEPTION 'الكمية المرتجعة تتجاوز الكمية المتبقية'; END IF;
  IF entry ? 'expectedReturnedQuantity' AND (entry->>'expectedReturnedQuantity')::numeric IS DISTINCT FROM before_qty THEN RAISE EXCEPTION 'تغيرت الكمية المرتجعة حدث الفاتورة ثم أعد المحاولة'; END IF;
  line_net:=round((source->>'net')::numeric*(before_qty+qty)/(source->>'quantity')::numeric,2)-(source->>'returned_net')::numeric;
  line_tax:=round((source->>'tax')::numeric*(before_qty+qty)/(source->>'quantity')::numeric,2)-(source->>'returned_tax')::numeric;
  line_cost:=round((source->>'cost')::numeric*(before_qty+qty)/(source->>'quantity')::numeric,2)-(source->>'returned_cost')::numeric;
  line_gross:=round(qty*(source->>'unit_price')::numeric,2);
  net:=net+line_net; tax:=tax+line_tax; gross:=gross+line_gross;
  prepared:=prepared||jsonb_build_array(source||jsonb_build_object('return_quantity',qty,'return_net',line_net,'return_tax',line_tax,'return_cost',line_cost));
 END LOOP;
 total:=net+tax;
 IF p_payload ? 'lines' AND (p_payload->>'expectedTotal')::numeric IS DISTINCT FROM total THEN RAISE EXCEPTION 'تغير إجمالي المرتجع راجع الكميات'; END IF;
 discount:=greatest(0,gross-net-CASE WHEN coalesce(original.tax_inclusive,true) THEN tax ELSE 0 END);
 debt:=least(total,(state->>'outstanding')::numeric); paid:=total-debt;
 aid:=nullif(p_payload->>'accountId','')::uuid;
 IF paid>0 AND aid IS NULL THEN
  aid:=original.account_id;
  IF aid IS NULL THEN SELECT account_id INTO aid FROM public.bf_documents WHERE cafe_id=p_cafe AND reference_id=original.id AND kind='settlement' ORDER BY created_at DESC,id LIMIT 1; END IF;
 END IF;
 IF paid>0 AND NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe AND id=aid AND active AND kind IN('cash','bank','pos')) THEN RAISE EXCEPTION 'اختر حساب تسوية المبلغ المرتجع'; END IF;
 IF paid=0 THEN aid:=NULL; END IF;
 INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,shift_id,account_id,warehouse_id,subtotal,discount,tax,total,paid,reference_id,note,created_by,vat_rate,tax_inclusive)
 VALUES(p_id,p_cafe,'refund',original.party_id,CASE WHEN original.kind='sale' THEN nullif(p_payload->>'shiftId','')::uuid ELSE NULL END,aid,original.warehouse_id,gross,discount,tax,total,paid,original.id,coalesce(p_payload->>'note',''),auth.uid(),original.vat_rate,original.tax_inclusive) RETURNING bf_documents.number INTO number;
 FOR entry IN SELECT value FROM jsonb_array_elements(prepared) LOOP
  qty:=(entry->>'return_quantity')::numeric; line_net:=(entry->>'return_net')::numeric; line_tax:=(entry->>'return_tax')::numeric; line_cost:=(entry->>'return_cost')::numeric; item:=(entry->>'item_id')::uuid;
  actual_cost:=0;
  IF item IS NOT NULL THEN actual_cost:=brand_finance_private.stock_move(p_cafe,p_id,item,original.warehouse_id,CASE WHEN original.kind='sale' THEN qty ELSE -qty END,CASE WHEN original.kind='sale' THEN line_cost/qty ELSE 0 END); END IF;
  INSERT INTO public.bf_document_lines(cafe_id,document_id,reference_line_id,product_id,item_id,name,quantity,unit_price,net,tax,cost)
  VALUES(p_cafe,p_id,(entry->>'id')::uuid,(entry->>'product_id')::uuid,item,entry->>'name',qty,(entry->>'unit_price')::numeric,line_net,line_tax,line_cost);
  IF original.kind='sale' THEN
   PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'1200'),line_cost,0);
   PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'5000'),0,line_cost);
  ELSE
   PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'1200'),0,actual_cost);
   PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'5200'),greatest(actual_cost-line_net,0),greatest(line_net-actual_cost,0));
  END IF;
 END LOOP;
 IF original.kind='sale' THEN
  PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'4000'),net,0);
  PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'2100'),tax,0);
  PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'1100'),0,debt,original.party_id);
  PERFORM brand_finance_private.line(p_cafe,p_id,aid,0,paid);
 ELSE
  PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'1300'),0,tax);
  PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'2000'),debt,0,original.party_id);
  PERFORM brand_finance_private.line(p_cafe,p_id,aid,paid,0);
 END IF;
 RETURN number;
END $$;
CREATE OR REPLACE FUNCTION public.brand_finance_execute(p_cafe_id uuid,p_operation text,p_payload jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE approval public.bf_refund_requests%ROWTYPE; canonical jsonb; result_status text; r text; pos integer:=0; old public.bf_requests%ROWTYPE; cfg public.bf_settings%ROWTYPE; d public.bf_documents%ROWTYPE; original public.bf_documents%ROWTYPE; sh public.bf_shifts%ROWTYPE; entry jsonb; prod record; it public.bf_items%ROWTYPE; id uuid:=gen_random_uuid(); aid uuid; aid2 uuid; pid uuid; wid uuid; iid uuid; sid uuid; uid uuid; qty numeric; price numeric; amount numeric; cost numeric:=0; subtotal numeric:=0; discount numeric:=0; tax numeric:=0; total numeric:=0; paid numeric:=0; net numeric; expected numeric; counted numeric; remaining numeric; tax_left numeric; line_tax numeric; note text:=coalesce(p_payload->>'note',''); result jsonb; kind text; n bigint; lines jsonb:='[]'; saved record;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 r:=brand_finance_private.role_for(p_cafe_id);
 SELECT NULL::uuid AS id,NULL::text AS name,NULL::numeric AS price,NULL::uuid AS item_id INTO prod;
 IF p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>100000 OR p_payload::text ~* '"[-+]?(nan|infinity)"' THEN RAISE EXCEPTION 'Invalid command'; END IF;
 -- One tenant posting lock gives deterministic document, stock and account ordering.
 SELECT * INTO old FROM public.bf_requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN IF old.operation<>p_operation OR old.payload<>p_payload OR old.created_by<>auth.uid() THEN RAISE EXCEPTION 'Request identifier conflict'; END IF; RETURN old.result||'{"duplicate":true}'::jsonb; END IF;
 IF r='cashier' AND p_operation NOT IN('sale','refund','shift_open','shift_close','shift_handover','shift_accept') THEN RAISE EXCEPTION 'Finance manager required' USING ERRCODE='42501'; END IF;
 IF p_operation IN('refund_approve','refund_reject') AND (r<>'owner' OR NOT EXISTS(SELECT 1 FROM public.cafes c WHERE c.id=p_cafe_id AND c.owner_user_id=auth.uid())) THEN RAISE EXCEPTION 'Brand owner approval required' USING ERRCODE='42501'; END IF;
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
  IF p_payload ? 'vatRate' OR p_payload ? 'taxInclusive' THEN
   IF p_operation<>'sale' OR r NOT IN('owner','manager') THEN RAISE EXCEPTION 'Invoice tax override requires financial management' USING ERRCODE='42501'; END IF;
   IF jsonb_typeof(p_payload->'vatRate') IS DISTINCT FROM 'number' OR jsonb_typeof(p_payload->'taxInclusive') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid invoice tax options'; END IF;
   amount:=(p_payload->>'vatRate')::numeric;
   IF amount<0 OR amount>100 OR amount<>round(amount,2) THEN RAISE EXCEPTION 'Invalid invoice tax rate'; END IF;
   cfg.vat_rate:=amount; cfg.tax_inclusive:=(p_payload->>'taxInclusive')::boolean;
  END IF;
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
  INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,shift_id,account_id,warehouse_id,subtotal,discount,tax,total,paid,note,created_by,vat_rate,tax_inclusive) VALUES(id,p_cafe_id,p_operation,pid,CASE WHEN p_operation='sale' THEN sid ELSE NULL END,aid,wid,subtotal,discount,tax,total,paid,note,auth.uid(),cfg.vat_rate,cfg.tax_inclusive) RETURNING number INTO n;
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
  SELECT * INTO original FROM public.bf_documents WHERE cafe_id=p_cafe_id AND bf_documents.id=(p_payload->>'documentId')::uuid;
  IF original.kind='sale' THEN
   canonical:=brand_finance_private.refund_quote(p_cafe_id,p_payload);
   INSERT INTO public.bf_refund_requests(id,cafe_id,document_id,document_number,payload,total,paid,created_by)
   VALUES(id,p_cafe_id,original.id,original.number,canonical,(canonical->>'expectedTotal')::numeric,(canonical->>'expectedPaid')::numeric,auth.uid());
   result_status:='pending';
  ELSE n:=brand_finance_private.post_refund(p_cafe_id,p_payload,id); END IF;
 ELSIF p_operation IN('refund_approve','refund_reject') THEN
  SELECT * INTO approval FROM public.bf_refund_requests WHERE cafe_id=p_cafe_id AND bf_refund_requests.id=(p_payload->>'requestId')::uuid FOR UPDATE;
  IF approval.id IS NULL OR approval.status<>'pending' THEN RAISE EXCEPTION 'طلب المرتجع غير متاح أو تمت مراجعته مسبقا'; END IF;
  IF p_operation='refund_reject' THEN
   IF nullif(btrim(note),'') IS NULL THEN RAISE EXCEPTION 'أدخل سبب رفض المرتجع'; END IF;
   UPDATE public.bf_refund_requests SET status='rejected',reviewed_by=auth.uid(),reviewed_at=now(),rejection_reason=left(note,1000) WHERE bf_refund_requests.id=approval.id;
   id:=approval.id; result_status:='rejected';
  ELSE
   canonical:=brand_finance_private.refund_quote(p_cafe_id,approval.payload);
   IF (p_payload ? 'expectedTotal' AND (p_payload->>'expectedTotal')::numeric IS DISTINCT FROM approval.total) OR (p_payload ? 'expectedPaid' AND (p_payload->>'expectedPaid')::numeric IS DISTINCT FROM approval.paid) THEN RAISE EXCEPTION 'تغير مبلغ المرتجع حدث البيانات قبل الاعتماد'; END IF;
   IF approval.paid>0 AND approval.paid>coalesce((SELECT sum(debit-credit) FROM public.bf_journal WHERE cafe_id=p_cafe_id AND account_id=(canonical->>'accountId')::uuid),0) THEN RAISE EXCEPTION 'رصيد حساب الدفع غير كاف لصرف المرتجع'; END IF;
   n:=brand_finance_private.post_refund(p_cafe_id,canonical,id);
   UPDATE public.bf_refund_requests SET status='approved',reviewed_by=auth.uid(),reviewed_at=now(),refund_document_id=id WHERE bf_refund_requests.id=approval.id;
   result_status:='approved';
  END IF;
 ELSIF p_operation='settlement' THEN
  SELECT * INTO original FROM public.bf_documents WHERE cafe_id=p_cafe_id AND bf_documents.id=(p_payload->>'documentId')::uuid AND bf_documents.kind IN('sale','purchase') FOR UPDATE;
  IF original.id IS NULL OR aid IS NULL THEN RAISE EXCEPTION 'Invalid settlement'; END IF;
  remaining:=(brand_finance_private.document_state(p_cafe_id,original.id)->>'outstanding')::numeric;
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
 result:=jsonb_build_object('id',id,'number',n)||CASE WHEN result_status IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('status',result_status) END;
 INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by) VALUES(p_cafe_id,p_request_id,p_operation,p_payload,result,auth.uid());
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.brand_finance_snapshot(p_cafe_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
  'parties',coalesce((SELECT jsonb_agg((to_jsonb(p)-'cafe_id'-CASE WHEN managed THEN '__internal_none__' ELSE 'details' END)||jsonb_build_object('balance',CASE WHEN managed THEN coalesce((SELECT sum(CASE WHEN p.kind='supplier' THEN j.credit-j.debit ELSE j.debit-j.credit END) FROM public.bf_journal j JOIN public.bf_accounts a ON a.id=j.account_id WHERE j.cafe_id=p_cafe_id AND j.party_id=p.id AND a.kind=CASE p.kind WHEN 'customer' THEN 'receivable' WHEN 'supplier' THEN 'payable' ELSE 'employee' END),0) ELSE 0 END) ORDER BY p.name) FROM public.bf_parties p WHERE cafe_id=p_cafe_id AND (managed OR kind='customer')),'[]'::jsonb),
  'warehouses',coalesce((SELECT jsonb_agg(to_jsonb(w)-'cafe_id' ORDER BY w.name) FROM public.bf_warehouses w WHERE cafe_id=p_cafe_id),'[]'::jsonb),
  'products',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'price',p.price,'imageUrl',p.image_url,'imageStoragePath',p.image_storage_path,'category',coalesce(c.name,''),'available',p.available,'stockTracked',i.id IS NOT NULL,'itemId',i.id,'quantity',coalesce((SELECT sum(quantity) FROM public.bf_stock WHERE cafe_id=p_cafe_id AND item_id=i.id),0)) ORDER BY p.sort_order,p.name) FROM public.menu_products p LEFT JOIN public.menu_categories c ON c.id=p.category_id AND c.cafe_id=p_cafe_id LEFT JOIN public.bf_items i ON i.menu_product_id=p.id AND i.cafe_id=p_cafe_id AND i.active WHERE p.cafe_id=p_cafe_id AND p.deleted_at IS NULL),'[]'::jsonb),
  'items',coalesce((SELECT jsonb_agg(to_jsonb(i)-'cafe_id'||jsonb_build_object('quantity',coalesce((SELECT sum(quantity) FROM public.bf_stock WHERE cafe_id=p_cafe_id AND item_id=i.id),0),'average_cost',CASE WHEN managed THEN coalesce((SELECT sum(quantity*average_cost)/nullif(sum(quantity),0) FROM public.bf_stock WHERE cafe_id=p_cafe_id AND item_id=i.id),0) ELSE 0 END) ORDER BY i.name) FROM public.bf_items i WHERE cafe_id=p_cafe_id),'[]'::jsonb),
  'stock',coalesce((SELECT jsonb_agg(to_jsonb(s)-'cafe_id'-'value'||CASE WHEN managed THEN '{}'::jsonb ELSE '{"average_cost":0}'::jsonb END) FROM public.bf_stock s WHERE cafe_id=p_cafe_id),'[]'::jsonb),
  'documents',coalesce((SELECT jsonb_agg(to_jsonb(d)-'cafe_id'-'created_by'||brand_finance_private.document_state(p_cafe_id,d.id)||jsonb_build_object('lines',brand_finance_private.refund_lines(p_cafe_id,d.id,managed)) ORDER BY d.created_at DESC,d.id) FROM (SELECT * FROM public.bf_documents WHERE cafe_id=p_cafe_id AND (managed OR (created_by=auth.uid() AND kind='sale') OR (kind='refund' AND EXISTS(SELECT 1 FROM public.bf_refund_requests rr WHERE rr.cafe_id=p_cafe_id AND rr.refund_document_id=bf_documents.id AND rr.created_by=auth.uid()))) ORDER BY created_at DESC,id LIMIT 500) d),'[]'::jsonb),
  'refundRequests',coalesce((SELECT jsonb_agg(to_jsonb(rr)-'cafe_id' ORDER BY rr.created_at DESC,rr.id) FROM (SELECT * FROM public.bf_refund_requests WHERE cafe_id=p_cafe_id AND (managed OR created_by=auth.uid()) ORDER BY (status='pending') DESC,created_at DESC LIMIT 500) rr),'[]'::jsonb),
  'shifts',coalesce((SELECT jsonb_agg(to_jsonb(s)-'cafe_id'||jsonb_build_object('expected_cash',CASE WHEN s.status='closed' THEN s.expected_cash ELSE coalesce((SELECT sum(j.debit-j.credit) FROM public.bf_journal j WHERE j.cafe_id=p_cafe_id AND j.account_id=s.account_id),0) END) ORDER BY opened_at DESC) FROM (SELECT * FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND (managed OR user_id=auth.uid() OR handover_to=auth.uid()) ORDER BY opened_at DESC LIMIT 200) s),'[]'::jsonb),
  'staff',coalesce((SELECT jsonb_agg(to_jsonb(s)-'cafe_id') FROM public.bf_staff s WHERE cafe_id=p_cafe_id AND (managed OR active)),'[]'::jsonb)||jsonb_build_array((SELECT jsonb_build_object('user_id',owner_user_id,'name','مالك العلامة','role','manager','active',true) FROM public.cafes WHERE id=p_cafe_id)),
  'journal',CASE WHEN managed THEN coalesce((SELECT jsonb_agg(to_jsonb(j)-'cafe_id'-'party_id' ORDER BY j.created_at DESC,j.id) FROM (SELECT * FROM public.bf_journal WHERE cafe_id=p_cafe_id ORDER BY created_at DESC,id LIMIT 2000) j),'[]'::jsonb) ELSE '[]'::jsonb END,
  'movements',CASE WHEN managed THEN coalesce((SELECT jsonb_agg(to_jsonb(m)-'cafe_id' ORDER BY m.created_at DESC,m.id) FROM (SELECT * FROM public.bf_movements WHERE cafe_id=p_cafe_id ORDER BY created_at DESC,id LIMIT 1000) m),'[]'::jsonb) ELSE '[]'::jsonb END,
  'trialBalance',CASE WHEN managed THEN coalesce((SELECT jsonb_agg(jsonb_build_object('account_id',a.id,'name',a.name,'kind',a.kind,'debit',coalesce(j.debit,0),'credit',coalesce(j.credit,0),'balance',coalesce(j.debit-j.credit,0)) ORDER BY a.code) FROM public.bf_accounts a LEFT JOIN(SELECT account_id,sum(debit) debit,sum(credit) credit FROM public.bf_journal WHERE cafe_id=p_cafe_id GROUP BY account_id) j ON j.account_id=a.id WHERE a.cafe_id=p_cafe_id),'[]'::jsonb) ELSE '[]'::jsonb END,
  'summary',jsonb_build_object('salesGross',CASE WHEN managed THEN coalesce((SELECT sum(CASE WHEN d.kind='sale' THEN d.total ELSE -d.total END) FROM public.bf_documents d LEFT JOIN public.bf_documents orig ON orig.id=d.reference_id AND orig.cafe_id=d.cafe_id WHERE d.cafe_id=p_cafe_id AND (d.kind='sale' OR (d.kind='refund' AND orig.kind='sale'))),0) ELSE 0 END,'salesTax',CASE WHEN managed THEN coalesce((SELECT sum(CASE WHEN d.kind='sale' THEN d.tax ELSE -d.tax END) FROM public.bf_documents d LEFT JOIN public.bf_documents orig ON orig.id=d.reference_id AND orig.cafe_id=d.cafe_id WHERE d.cafe_id=p_cafe_id AND (d.kind='sale' OR (d.kind='refund' AND orig.kind='sale'))),0) ELSE 0 END,'sales',CASE WHEN managed THEN coalesce((SELECT sum(j.credit-j.debit) FROM public.bf_journal j JOIN public.bf_accounts a ON a.id=j.account_id WHERE j.cafe_id=p_cafe_id AND a.kind='revenue'),0) ELSE 0 END,'purchases',CASE WHEN managed THEN coalesce((SELECT sum(CASE WHEN d.kind='purchase' THEN d.total ELSE -d.total END) FROM public.bf_documents d LEFT JOIN public.bf_documents orig ON orig.id=d.reference_id WHERE d.cafe_id=p_cafe_id AND (d.kind='purchase' OR (d.kind='refund' AND orig.kind='purchase'))),0) ELSE 0 END,'expenses',CASE WHEN managed THEN coalesce((SELECT sum(j.debit-j.credit) FROM public.bf_journal j JOIN public.bf_accounts a ON a.id=j.account_id WHERE j.cafe_id=p_cafe_id AND a.kind='expense'),0) ELSE 0 END,'profit',0,'receivables',CASE WHEN managed THEN coalesce((SELECT sum(j.debit-j.credit) FROM public.bf_journal j JOIN public.bf_accounts a ON a.id=j.account_id WHERE j.cafe_id=p_cafe_id AND a.kind='receivable'),0) ELSE 0 END,'payables',CASE WHEN managed THEN coalesce((SELECT sum(j.credit-j.debit) FROM public.bf_journal j JOIN public.bf_accounts a ON a.id=j.account_id WHERE j.cafe_id=p_cafe_id AND a.kind='payable'),0) ELSE 0 END,'inventoryValue',CASE WHEN managed THEN coalesce((SELECT sum(value) FROM public.bf_stock WHERE cafe_id=p_cafe_id),0) ELSE 0 END),
  'truncated',(SELECT count(*)>500 FROM public.bf_documents WHERE cafe_id=p_cafe_id) OR (SELECT count(*)>2000 FROM public.bf_journal WHERE cafe_id=p_cafe_id)
 ) INTO answer;
 answer:=jsonb_set(answer,'{summary,profit}',to_jsonb((answer#>>'{summary,sales}')::numeric-(answer#>>'{summary,expenses}')::numeric));
 answer:=jsonb_set(answer,'{summary,sales}',to_jsonb((answer#>>'{summary,salesGross}')::numeric-(answer#>>'{summary,salesTax}')::numeric));
 RETURN answer;
END $$;
COMMIT;
