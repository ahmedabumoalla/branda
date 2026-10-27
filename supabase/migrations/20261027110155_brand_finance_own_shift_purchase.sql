BEGIN;
-- Cashier purchasing is an own-shift operation, never general accounting permission
ALTER FUNCTION public.brand_finance_execute(uuid,text,jsonb,uuid) RENAME TO execute_before_own_shift_purchase;
ALTER FUNCTION public.execute_before_own_shift_purchase(uuid,text,jsonb,uuid) SET SCHEMA brand_finance_private;
REVOKE ALL ON FUNCTION brand_finance_private.execute_before_own_shift_purchase(uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.brand_finance_execute(p_cafe_id uuid,p_operation text,p_payload jsonb,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sh public.bf_shifts%ROWTYPE; prior public.bf_requests%ROWTYPE; cfg public.bf_settings%ROWTYPE;
 doc uuid:=gen_random_uuid(); num bigint; result jsonb; supplier uuid; supplier_name text; supplier_phone text; note text; wid uuid;
 item public.bf_items%ROWTYPE; entry jsonb; lines jsonb:='[]'; qty numeric; price numeric; subtotal numeric:=0; tax numeric; total numeric; net numeric;
 rate numeric; inclusive boolean; available numeric; remaining numeric; tax_left numeric; ln numeric; lt numeric; cost numeric; pos integer:=0; ids uuid[]; matched integer;
BEGIN
 IF p_operation IS DISTINCT FROM 'shift_purchase' THEN RETURN brand_finance_private.execute_before_own_shift_purchase(p_cafe_id,p_operation,p_payload,p_request_id); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 IF brand_finance_private.role_for(p_cafe_id) NOT IN('owner','manager','cashier') THEN RAISE EXCEPTION 'لا تملك صلاحية شراء مخزون من الوردية' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>100000 OR p_payload::text ~* '"[-+]?(nan|infinity)"' THEN RAISE EXCEPTION 'بيانات فاتورة الشراء غير صالحة'; END IF;
 SELECT * INTO prior FROM public.bf_requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.operation<>p_operation OR prior.payload IS DISTINCT FROM p_payload OR prior.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'معرف الطلب مستخدم لعملية أخرى'; END IF;
  RETURN prior.result||'{"duplicate":true}'::jsonb;
 END IF;
 SELECT * INTO sh FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND id=(p_payload->>'shiftId')::uuid AND user_id=auth.uid() AND status='open' FOR UPDATE;
 IF sh.id IS NULL THEN RAISE EXCEPTION 'الشراء متاح من ورديتك المفتوحة فقط' USING ERRCODE='42501'; END IF;
 IF sh.supervisor_paused THEN RAISE EXCEPTION 'الوردية موقوفة إداريًا لا يمكن الشراء حتى استئنافها'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=sh.account_id AND kind='cash' AND active AND deleted_at IS NULL) THEN RAISE EXCEPTION 'صندوق الوردية غير متاح للشراء'; END IF;
 SELECT * INTO STRICT cfg FROM public.bf_settings WHERE cafe_id=p_cafe_id FOR UPDATE;
 IF cfg.closed_through IS NOT NULL AND (now() AT TIME ZONE 'Asia/Riyadh')::date<=cfg.closed_through THEN RAISE EXCEPTION 'الفترة المالية مقفلة'; END IF;
 IF coalesce(p_payload->>'payment','cash')<>'cash' OR p_payload ? 'accountId' OR p_payload ? 'paid' OR p_payload ? 'discount' THEN RAISE EXCEPTION 'شراء الوردية نقدي من صندوقها فقط'; END IF;
 supplier_name:=btrim(coalesce(p_payload->>'supplierName',''));supplier_phone:=btrim(coalesce(p_payload->>'supplierPhone',''));note:=btrim(coalesce(p_payload->>'note',''));
 IF length(supplier_name) NOT BETWEEN 1 AND 150 OR length(supplier_phone) NOT BETWEEN 5 AND 30 OR length(note)>500 THEN RAISE EXCEPTION 'راجع اسم المورد ورقم جواله وبيان الفاتورة'; END IF;
 IF jsonb_typeof(p_payload->'vatRate') IS DISTINCT FROM 'number' OR jsonb_typeof(p_payload->'taxInclusive') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'راجع إعداد ضريبة فاتورة الشراء'; END IF;
 rate:=(p_payload->>'vatRate')::numeric;inclusive:=(p_payload->>'taxInclusive')::boolean;
 IF rate<0 OR rate>100 OR rate<>round(rate,2) THEN RAISE EXCEPTION 'نسبة الضريبة غير صالحة'; END IF;
 wid:=(p_payload->>'warehouseId')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.bf_warehouses WHERE cafe_id=p_cafe_id AND id=wid AND active) THEN RAISE EXCEPTION 'مستودع الاستلام غير متاح'; END IF;
 IF jsonb_typeof(p_payload->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'lines') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'أضف أصناف فاتورة الشراء'; END IF;
 IF (SELECT count(DISTINCT value->>'itemId') FROM jsonb_array_elements(p_payload->'lines'))<>jsonb_array_length(p_payload->'lines') THEN RAISE EXCEPTION 'ادمج كميات الصنف المكرر في بند واحد'; END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_payload->'lines') LOOP
  IF jsonb_typeof(entry->'quantity') IS DISTINCT FROM 'number' OR jsonb_typeof(entry->'unitPrice') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'كمية الصنف وسعره غير صالحين'; END IF;
  qty:=(entry->>'quantity')::numeric;price:=(entry->>'unitPrice')::numeric;
  IF qty<=0 OR qty>1000000 OR qty<>round(qty,3) OR price<0 OR price>10000000 OR price<>round(price,2) THEN RAISE EXCEPTION 'راجع كمية الصنف وسعر الشراء'; END IF;
  SELECT * INTO item FROM public.bf_items WHERE cafe_id=p_cafe_id AND id=(entry->>'itemId')::uuid AND active;
  IF item.id IS NULL THEN RAISE EXCEPTION 'صنف الشراء غير متاح'; END IF;
  subtotal:=subtotal+round(qty*price,2);
  lines:=lines||jsonb_build_array(jsonb_build_object('itemId',item.id,'name',item.name,'quantity',qty,'unitPrice',price,'lineSubtotal',round(qty*price,2)));
 END LOOP;
 tax:=CASE WHEN inclusive THEN round(subtotal-subtotal/(1+rate/100),2) ELSE round(subtotal*rate/100,2) END;
 total:=CASE WHEN inclusive THEN subtotal ELSE subtotal+tax END;net:=total-tax;
 IF total<=0 OR total>999999999 THEN RAISE EXCEPTION 'إجمالي فاتورة الشراء غير صالح'; END IF;
 IF p_payload ? 'expectedTotal' AND (jsonb_typeof(p_payload->'expectedTotal') IS DISTINCT FROM 'number' OR (p_payload->>'expectedTotal')::numeric IS DISTINCT FROM total) THEN RAISE EXCEPTION 'تغير إجمالي الشراء راجع الأسعار والضريبة'; END IF;
 SELECT coalesce(sum(debit-credit),0) INTO available FROM public.bf_journal WHERE cafe_id=p_cafe_id AND account_id=sh.account_id;
 IF total>available THEN RAISE EXCEPTION 'رصيد صندوق الوردية لا يكفي لفاتورة الشراء'; END IF;
 IF jsonb_typeof(coalesce(p_payload->'attachmentIds','[]'::jsonb)) IS DISTINCT FROM 'array' OR jsonb_array_length(coalesce(p_payload->'attachmentIds','[]'::jsonb))>100 THEN RAISE EXCEPTION 'مرفقات الشراء غير صالحة'; END IF;
 SELECT coalesce(array_agg(value::uuid),'{}'::uuid[]) INTO ids FROM jsonb_array_elements_text(coalesce(p_payload->'attachmentIds','[]'::jsonb));
 IF cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RAISE EXCEPTION 'المرفق مكرر في الفاتورة'; END IF;
 PERFORM 1 FROM public.bf_shift_attachments WHERE id=ANY(ids) AND cafe_id=p_cafe_id AND shift_id=sh.id AND uploader_id=auth.uid() AND uploaded AND document_id IS NULL ORDER BY id FOR UPDATE;
 GET DIAGNOSTICS matched=ROW_COUNT;
 IF matched<>cardinality(ids) THEN RAISE EXCEPTION 'أكمل رفع المرفقات وتأكد أنها تخص ورديتك' USING ERRCODE='42501'; END IF;
 SELECT id INTO supplier FROM public.bf_parties WHERE cafe_id=p_cafe_id AND kind='supplier' AND name=supplier_name AND phone=supplier_phone AND active ORDER BY id LIMIT 1;
 IF supplier IS NULL THEN INSERT INTO public.bf_parties(cafe_id,kind,name,phone) VALUES(p_cafe_id,'supplier',supplier_name,supplier_phone) RETURNING id INTO supplier; END IF;
 INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,shift_id,account_id,warehouse_id,subtotal,tax,total,paid,note,created_by,vat_rate,tax_inclusive)
 VALUES(doc,p_cafe_id,'purchase',supplier,sh.id,sh.account_id,wid,subtotal,tax,total,total,note,auth.uid(),rate,inclusive) RETURNING number INTO num;
 remaining:=net;tax_left:=tax;
 FOR entry IN SELECT value FROM jsonb_array_elements(lines) LOOP
  pos:=pos+1;qty:=(entry->>'quantity')::numeric;
  ln:=least(remaining,round(net*(entry->>'lineSubtotal')::numeric/subtotal,2));lt:=least(tax_left,round(tax*(entry->>'lineSubtotal')::numeric/subtotal,2));remaining:=remaining-ln;tax_left:=tax_left-lt;
  IF pos=jsonb_array_length(lines) THEN ln:=ln+remaining;lt:=lt+tax_left; END IF;
  cost:=brand_finance_private.stock_move(p_cafe_id,doc,(entry->>'itemId')::uuid,wid,qty,ln/qty);
  INSERT INTO public.bf_document_lines(cafe_id,document_id,item_id,name,quantity,unit_price,net,tax,cost)
  VALUES(p_cafe_id,doc,(entry->>'itemId')::uuid,entry->>'name',qty,(entry->>'unitPrice')::numeric,ln,lt,cost);
 END LOOP;
 PERFORM brand_finance_private.line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'1200'),net,0);
 PERFORM brand_finance_private.line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'1300'),tax,0);
 PERFORM brand_finance_private.line(p_cafe_id,doc,sh.account_id,0,total);
 INSERT INTO public.bf_shift_supplier_payouts(document_id,cafe_id,shift_id,supplier_name,supplier_phone) VALUES(doc,p_cafe_id,sh.id,supplier_name,supplier_phone);
 UPDATE public.bf_shift_attachments SET document_id=doc WHERE id=ANY(ids);
 result:=jsonb_build_object('id',doc,'number',num,'status','posted');
 INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by) VALUES(p_cafe_id,p_request_id,p_operation,p_payload,result,auth.uid());
 INSERT INTO public.bf_treasury_audit(cafe_id,actor_id,operation,entity_id,after_data) VALUES(p_cafe_id,auth.uid(),p_operation,doc,jsonb_build_object('shiftId',sh.id,'accountId',sh.account_id,'amount',total,'warehouseId',wid));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_execute(uuid,text,jsonb,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_execute(uuid,text,jsonb,uuid) TO authenticated;
-- Existing report's supplier payouts include this cash outflow; expose purchase subtotal separately
ALTER FUNCTION public.brand_finance_pos_shift_report(uuid,uuid) RENAME TO pos_report_before_own_purchase;
ALTER FUNCTION public.pos_report_before_own_purchase(uuid,uuid) SET SCHEMA brand_finance_private;
REVOKE ALL ON FUNCTION brand_finance_private.pos_report_before_own_purchase(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.brand_finance_pos_shift_report(p_cafe_id uuid,p_shift_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE answer jsonb;
BEGIN
 answer:=brand_finance_private.pos_report_before_own_purchase(p_cafe_id,p_shift_id);
 RETURN answer||jsonb_build_object('purchaseTotal',coalesce((SELECT sum(total) FROM public.bf_documents WHERE cafe_id=p_cafe_id AND shift_id=p_shift_id AND kind='purchase'),0));
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_pos_shift_report(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_pos_shift_report(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
