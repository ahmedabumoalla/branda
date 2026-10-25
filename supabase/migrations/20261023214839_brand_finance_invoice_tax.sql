BEGIN;
-- Per-document tax snapshots; historical immutable documents stay unknown (NULL).
ALTER TABLE public.bf_documents
 ADD COLUMN vat_rate numeric(5,2) CHECK(vat_rate BETWEEN 0 AND 100),
 ADD COLUMN tax_inclusive boolean;
-- Preserve all posting, idempotency, tenant, shift, price and closed-period guards.
-- Overrides affect the local cfg record only, never bf_settings.
CREATE OR REPLACE FUNCTION public.brand_finance_execute(p_cafe_id uuid,p_operation text,p_payload jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
  SELECT * INTO original FROM public.bf_documents WHERE cafe_id=p_cafe_id AND bf_documents.id=(p_payload->>'documentId')::uuid AND bf_documents.kind IN('sale','purchase') FOR UPDATE;
  IF original.id IS NULL OR EXISTS(SELECT 1 FROM public.bf_documents WHERE reference_id=original.id AND bf_documents.kind='refund') THEN RAISE EXCEPTION 'تم رد المستند أو تسويته مسبقا'; END IF;
  INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,account_id,warehouse_id,subtotal,discount,tax,total,paid,reference_id,note,created_by,vat_rate,tax_inclusive) VALUES(id,p_cafe_id,'refund',original.party_id,original.account_id,original.warehouse_id,original.subtotal,original.discount,original.tax,original.total,original.paid+coalesce((SELECT sum(s.total) FROM public.bf_documents s WHERE s.reference_id=original.id AND s.kind='settlement'),0),original.id,note,auth.uid(),original.vat_rate,original.tax_inclusive) RETURNING number INTO n;
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
COMMIT;
