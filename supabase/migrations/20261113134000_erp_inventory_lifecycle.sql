BEGIN;
ALTER TABLE public.erp_inventory_documents DROP CONSTRAINT erp_inventory_documents_kind_check;
ALTER TABLE public.erp_inventory_documents ADD CONSTRAINT erp_inventory_documents_kind_check CHECK(kind IN('receipt','issue','transfer','stocktake','request','assembly','disassembly'));
CREATE TABLE erp_inventory_private.reservation_context(transaction_id bigint NOT NULL,cafe_id uuid NOT NULL,request_id uuid NOT NULL,PRIMARY KEY(transaction_id,cafe_id));
REVOKE ALL ON erp_inventory_private.reservation_context FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_inventory_private.reserved(c uuid,i uuid,w uuid,exclude_request uuid DEFAULT NULL) RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(sum(l.quantity*l.factor),0) FROM public.erp_inventory_documents d JOIN public.erp_inventory_lines l ON l.cafe_id=d.cafe_id AND l.document_id=d.id
 WHERE d.cafe_id=c AND d.warehouse_id=w AND l.item_id=i AND d.kind='request' AND d.status='pending' AND d.payload->>'reserveStock'='true' AND d.id IS DISTINCT FROM exclude_request
$$;
CREATE FUNCTION erp_inventory_private.stock_reservation_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$DECLARE reserved numeric;excluded uuid;BEGIN
 IF NEW.quantity>=OLD.quantity THEN RETURN NEW;END IF;
 SELECT request_id INTO excluded FROM erp_inventory_private.reservation_context WHERE transaction_id=txid_current() AND cafe_id=NEW.cafe_id;
 reserved:=erp_inventory_private.reserved(NEW.cafe_id,NEW.item_id,NEW.warehouse_id,excluded);
 IF reserved>0 AND NEW.quantity<reserved THEN RAISE EXCEPTION 'الكمية متاحة لطلبات محجوزة أخرى ألغ الحجز أو استخدم المتاح فقط';END IF;RETURN NEW;
END $$;
CREATE TRIGGER erp_inventory_reserved_stock BEFORE UPDATE OF quantity ON public.bf_stock FOR EACH ROW EXECUTE FUNCTION erp_inventory_private.stock_reservation_guard();
CREATE FUNCTION erp_inventory_private.quantity_at(c uuid,i uuid,w uuid,day date) RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce((SELECT quantity FROM public.bf_stock WHERE cafe_id=c AND item_id=i AND warehouse_id=w),0)-coalesce((SELECT sum(m.quantity) FROM public.bf_movements m JOIN public.bf_documents d ON d.cafe_id=m.cafe_id AND d.id=m.document_id WHERE m.cafe_id=c AND m.item_id=i AND m.warehouse_id=w AND(d.created_at AT TIME ZONE 'Asia/Riyadh')::date>day),0)
$$;
CREATE FUNCTION erp_inventory_private.count_quantity(c uuid,i uuid,d public.erp_inventory_documents) RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN d.payload->>'countByDate'='true' THEN erp_inventory_private.quantity_at(c,i,d.warehouse_id,d.effective_on) ELSE coalesce((SELECT quantity FROM public.bf_stock WHERE cafe_id=c AND item_id=i AND warehouse_id=d.warehouse_id),0) END
$$;
-- The count difference is applied today to physical stock, dated on the count document
-- Later movements remain intact and concurrent changes require an explicit resync
DO $$DECLARE source text;needle text;BEGIN
 SELECT pg_get_functiondef('erp_inventory_private.post(uuid,uuid)'::regprocedure) INTO source;
 needle:='SELECT coalesce(sum(quantity),0) INTO actual FROM public.bf_stock WHERE cafe_id=p_cafe AND warehouse_id=d.warehouse_id AND item_id=l.item_id;';
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Stocktaking post baseline changed';END IF;
 source:=replace(source,needle,'SELECT erp_inventory_private.count_quantity(p_cafe,l.item_id,d) INTO actual;');EXECUTE source;
END $$;
CREATE FUNCTION erp_inventory_private.validate_bundle(c uuid,i uuid,p jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$DECLARE x jsonb;BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'array' OR jsonb_array_length(p)>100 THEN RAISE EXCEPTION 'مكونات التجميعة غير صالحة';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p) AS component(value) GROUP BY component.value->>'itemId' HAVING count(*)>1) THEN RAISE EXCEPTION 'مكونات التجميعة مكررة';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p) LOOP
  IF jsonb_typeof(x->'quantity') IS DISTINCT FROM 'number' OR (x->>'quantity')::numeric<=0 OR(x->>'quantity')::numeric>1000000 OR(x->>'quantity')::numeric<>round((x->>'quantity')::numeric,3) OR(x->>'itemId')::uuid=i OR NOT EXISTS(SELECT 1 FROM public.erp_inventory_items m JOIN public.bf_items b ON b.cafe_id=m.cafe_id AND b.id=m.item_id WHERE m.cafe_id=c AND m.item_id=(x->>'itemId')::uuid AND m.kind='product' AND m.status='active' AND b.active) THEN RAISE EXCEPTION 'اختر مكونات مخزنية نشطة وكميات موجبة بالوحدة الأساسية';END IF;
 END LOOP;
END $$;
CREATE FUNCTION erp_inventory_private.post_bundle(c uuid,i uuid) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$DECLARE d public.erp_inventory_documents;l public.erp_inventory_lines;parent uuid;q numeric;cost numeric:=0;actual numeric;part numeric;allocated numeric:=0;weight numeric;remaining integer;fid uuid:=gen_random_uuid();BEGIN
 SELECT * INTO STRICT d FROM public.erp_inventory_documents WHERE cafe_id=c AND id=i FOR UPDATE;
 IF d.status='posted' THEN RETURN d.finance_document_id;END IF;
 IF d.kind NOT IN('assembly','disassembly') OR d.status<>'draft' OR d.source_mode<>'standalone' THEN RAISE EXCEPTION 'التجميعة غير متاحة للترحيل';END IF;
 PERFORM erp_inventory_private.assert_open(c,d.effective_on);PERFORM erp_inventory_private.assert_open(c,current_date);
 IF NOT erp_inventory_private.warehouse_allowed(c,d.warehouse_id,'write') OR NOT EXISTS(SELECT 1 FROM public.bf_warehouses WHERE cafe_id=c AND id=d.warehouse_id AND active) THEN RAISE EXCEPTION 'المستودع غير متاح' USING ERRCODE='42501';END IF;
 parent:=(d.payload->>'bundleItemId')::uuid;q:=(d.payload->>'bundleQuantity')::numeric;
 IF parent IS NULL OR q IS NULL OR q<=0 OR q>1000000 OR q<>round(q,3) OR NOT EXISTS(SELECT 1 FROM public.erp_inventory_items WHERE cafe_id=c AND item_id=parent AND kind='product' AND status='active') OR NOT EXISTS(SELECT 1 FROM public.erp_inventory_lines WHERE cafe_id=c AND document_id=i) OR EXISTS(SELECT 1 FROM public.erp_inventory_lines WHERE cafe_id=c AND document_id=i AND(item_id=parent OR quantity<=0)) THEN RAISE EXCEPTION 'راجع الصنف المركب وكميات المكونات';END IF;
 INSERT INTO public.bf_documents(id,cafe_id,kind,warehouse_id,note,created_by,created_at) VALUES(fid,c,'stock_adjust',d.warehouse_id,left(d.code||' / '||coalesce(d.payload->>'note',''),1000),auth.uid(),CASE WHEN d.effective_on=current_date THEN now() ELSE d.effective_on::timestamp AT TIME ZONE 'Asia/Riyadh' END);
 IF d.kind='assembly' THEN
  FOR l IN SELECT * FROM public.erp_inventory_lines WHERE cafe_id=c AND document_id=i ORDER BY item_id LOOP
   IF NOT EXISTS(SELECT 1 FROM public.bf_stock WHERE cafe_id=c AND item_id=l.item_id AND warehouse_id=d.warehouse_id AND quantity>=l.quantity*l.factor AND cost_known) THEN RAISE EXCEPTION 'مكونات التجميع غير كافية أو تكلفتها غير معروفة';END IF;
   PERFORM erp_inventory_private.stage_tracking(c,fid,l.item_id,d.warehouse_id,-l.quantity*l.factor,coalesce(l.payload->'tracking','[]'));
   cost:=cost+brand_finance_private.stock_move(c,fid,l.item_id,d.warehouse_id,-l.quantity*l.factor,0);
  END LOOP;
  PERFORM erp_inventory_private.stage_tracking(c,fid,parent,d.warehouse_id,q,coalesce(d.payload->'bundleTracking','[]'));
  actual:=brand_finance_private.stock_move(c,fid,parent,d.warehouse_id,q,cost/q);
  IF actual IS DISTINCT FROM cost THEN RAISE EXCEPTION 'تختلف قيمة الإنتاج عن تكلفة مكوناته';END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.bf_stock WHERE cafe_id=c AND item_id=parent AND warehouse_id=d.warehouse_id AND quantity>=q AND cost_known) THEN RAISE EXCEPTION 'الصنف المركب غير كاف أو تكلفته غير معروفة';END IF;
  PERFORM erp_inventory_private.stage_tracking(c,fid,parent,d.warehouse_id,-q,coalesce(d.payload->'bundleTracking','[]'));cost:=brand_finance_private.stock_move(c,fid,parent,d.warehouse_id,-q,0);
  SELECT sum(quantity*unit_cost),count(*) INTO weight,remaining FROM public.erp_inventory_lines WHERE cafe_id=c AND document_id=i;
  IF cost>0 AND weight<=0 THEN RAISE EXCEPTION 'حدد أوزان توزيع التكلفة على مكونات التفكيك';END IF;
  FOR l IN SELECT * FROM public.erp_inventory_lines WHERE cafe_id=c AND document_id=i ORDER BY item_id LOOP
   remaining:=remaining-1;part:=CASE WHEN remaining=0 THEN cost-allocated WHEN weight>0 THEN round(cost*l.quantity*l.unit_cost/weight,2) ELSE 0 END;
   PERFORM erp_inventory_private.stage_tracking(c,fid,l.item_id,d.warehouse_id,l.quantity*l.factor,coalesce(l.payload->'tracking','[]'));
   actual:=brand_finance_private.stock_move(c,fid,l.item_id,d.warehouse_id,l.quantity*l.factor,part/(l.quantity*l.factor));allocated:=allocated+actual;
  END LOOP;
  IF allocated IS DISTINCT FROM cost THEN RAISE EXCEPTION 'تختلف تكلفة المكونات عن تكلفة الصنف المفكك';END IF;
 END IF;
 UPDATE public.erp_inventory_documents SET status='posted',finance_document_id=fid,posted_at=now(),revision=revision+1,payload=payload||jsonb_build_object('actualCost',cost) WHERE cafe_id=c AND id=i;
 RETURN fid;
END $$;
ALTER FUNCTION erp_inventory_private.post(uuid,uuid) RENAME TO post_before_lifecycle;
CREATE FUNCTION erp_inventory_private.post(p_cafe uuid,p_id uuid) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$DECLARE d public.erp_inventory_documents;fid uuid;BEGIN
 SELECT * INTO STRICT d FROM public.erp_inventory_documents WHERE cafe_id=p_cafe AND id=p_id;
 IF d.kind IN('assembly','disassembly') THEN RETURN erp_inventory_private.post_bundle(p_cafe,p_id);END IF;
 IF d.request_document_id IS NOT NULL THEN INSERT INTO erp_inventory_private.reservation_context VALUES(txid_current(),p_cafe,d.request_document_id) ON CONFLICT(transaction_id,cafe_id) DO UPDATE SET request_id=excluded.request_id;END IF;
 fid:=erp_inventory_private.post_before_lifecycle(p_cafe,p_id);
 DELETE FROM erp_inventory_private.reservation_context WHERE transaction_id=txid_current() AND cafe_id=p_cafe;RETURN fid;
END $$;
ALTER FUNCTION public.erp_inventory_write(uuid,jsonb) RENAME TO erp_inventory_write_before_lifecycle;
ALTER FUNCTION public.erp_inventory_write_before_lifecycle(uuid,jsonb) SET SCHEMA erp_inventory_private;
CREATE FUNCTION public.erp_inventory_write(p_cafe uuid,p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE a text:=p_command->>'action';p jsonb:=p_command->'payload';i uuid:=nullif(p_command->>'id','')::uuid;r jsonb;d public.erp_inventory_documents;cfg jsonb;l public.erp_inventory_lines;k text;BEGIN
 PERFORM erp_inventory_private.authorize(p_cafe,'read');PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,60412));
 IF EXISTS(SELECT 1 FROM erp_inventory_private.requests WHERE cafe_id=p_cafe AND request_id=(p_command->>'requestId')::uuid) THEN RETURN erp_inventory_private.erp_inventory_write_before_lifecycle(p_cafe,p_command);END IF;
 SELECT payload INTO cfg FROM public.erp_inventory_settings WHERE cafe_id=p_cafe;
 IF a='settings' THEN
  FOREACH k IN ARRAY ARRAY['bundlesEnabled','showAvailableStock','countByDate'] LOOP IF p?k AND jsonb_typeof(p->k) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'راجع خيارات المخزون';END IF;END LOOP;
  IF nullif(p->>'defaultAdjustmentAccountId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe AND id=(p->>'defaultAdjustmentAccountId')::uuid AND active AND kind IN('expense','equity') AND NOT coalesce(is_group,false) AND NOT coalesce(frozen,false) AND deleted_at IS NULL) THEN RAISE EXCEPTION 'اختر حساب تسوية نشطًا';END IF;
 ELSIF a='item' AND coalesce(p#>'{payload,bundleComponents}','[]')<>'[]'::jsonb THEN
  IF p->>'kind'<>'product' OR NOT coalesce((cfg->>'bundlesEnabled')::boolean,false) AND NOT EXISTS(SELECT 1 FROM public.erp_inventory_items WHERE cafe_id=p_cafe AND item_id=i AND payload->'bundleComponents'=p#>'{payload,bundleComponents}') THEN RAISE EXCEPTION 'فعّل نظام التجميعات للصنف المخزني';END IF;
  PERFORM erp_inventory_private.validate_bundle(p_cafe,i,p#>'{payload,bundleComponents}');
 ELSIF a='document' THEN
  IF p#>'{payload,reserveStock}' IS NOT NULL AND jsonb_typeof(p#>'{payload,reserveStock}') IS DISTINCT FROM 'boolean' OR p#>'{payload,countByDate}' IS NOT NULL AND jsonb_typeof(p#>'{payload,countByDate}') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'راجع خيارات الحجز والجرد';END IF;
  IF p->>'kind' IN('assembly','disassembly') THEN
   IF NOT coalesce((cfg->>'bundlesEnabled')::boolean,false) AND i IS NULL THEN RAISE EXCEPTION 'فعّل نظام التجميعات من إعدادات المخزون';END IF;
   PERFORM erp_inventory_private.validate_bundle(p_cafe,(p#>>'{payload,bundleItemId}')::uuid,p->'lines');
   IF jsonb_typeof(p#>'{payload,bundleQuantity}') IS DISTINCT FROM 'number' OR(p#>>'{payload,bundleQuantity}')::numeric<=0 OR(p#>>'{payload,bundleQuantity}')::numeric>1000000 OR(p#>>'{payload,bundleQuantity}')::numeric<>round((p#>>'{payload,bundleQuantity}')::numeric,3) OR NOT EXISTS(SELECT 1 FROM public.erp_inventory_items WHERE cafe_id=p_cafe AND item_id=(p#>>'{payload,bundleItemId}')::uuid AND kind='product' AND status='active') THEN RAISE EXCEPTION 'حدد الصنف المركب والكمية';END IF;
  END IF;
 ELSIF a='submit' THEN
  SELECT * INTO d FROM public.erp_inventory_documents WHERE cafe_id=p_cafe AND id=i;
  IF d.payload->>'reserveStock'='true' THEN
   IF NOT EXISTS(SELECT 1 FROM public.erp_inventory_lines WHERE cafe_id=p_cafe AND document_id=i) THEN RAISE EXCEPTION 'أضف مكونات الحجز';END IF;
   FOR l IN SELECT * FROM public.erp_inventory_lines WHERE cafe_id=p_cafe AND document_id=i LOOP
    IF l.quantity<=0 OR coalesce((SELECT quantity FROM public.bf_stock WHERE cafe_id=p_cafe AND item_id=l.item_id AND warehouse_id=d.warehouse_id),0)-erp_inventory_private.reserved(p_cafe,l.item_id,d.warehouse_id,i)<l.quantity*l.factor THEN RAISE EXCEPTION 'الكمية المتاحة لا تكفي للحجز';END IF;
   END LOOP;
  END IF;
 END IF;
 r:=erp_inventory_private.erp_inventory_write_before_lifecycle(p_cafe,p_command);
 IF a IN('document','import_warehouse','sync_count') THEN
  SELECT * INTO d FROM public.erp_inventory_documents WHERE cafe_id=p_cafe AND id=(r->>'id')::uuid;
  IF d.kind='request' AND d.status='pending' AND d.payload->>'reserveStock'='true' THEN
   FOR l IN SELECT * FROM public.erp_inventory_lines WHERE cafe_id=p_cafe AND document_id=d.id LOOP
    IF l.quantity<=0 OR coalesce((SELECT quantity FROM public.bf_stock WHERE cafe_id=p_cafe AND item_id=l.item_id AND warehouse_id=d.warehouse_id),0)-erp_inventory_private.reserved(p_cafe,l.item_id,d.warehouse_id,d.id)<l.quantity*l.factor THEN RAISE EXCEPTION 'الكمية المتاحة لا تكفي لتعديل الحجز';END IF;
   END LOOP;
  END IF;
  IF a='document' AND nullif(d.payload->>'accountId','') IS NULL AND nullif(cfg->>'defaultAdjustmentAccountId','') IS NOT NULL THEN UPDATE public.erp_inventory_documents SET payload=payload||jsonb_build_object('accountId',cfg->>'defaultAdjustmentAccountId') WHERE cafe_id=p_cafe AND id=d.id;END IF;
  IF d.kind='stocktake' THEN
   IF NOT(d.payload?'countByDate') THEN d.payload:=d.payload||jsonb_build_object('countByDate',coalesce((cfg->>'countByDate')::boolean,false));UPDATE public.erp_inventory_documents SET payload=d.payload WHERE cafe_id=p_cafe AND id=d.id;END IF;
   IF d.payload->>'countByDate'='true' OR a='sync_count' THEN UPDATE public.erp_inventory_lines AS counted_line SET expected_quantity=erp_inventory_private.count_quantity(p_cafe,counted_line.item_id,d) WHERE counted_line.cafe_id=p_cafe AND counted_line.document_id=d.id;END IF;
  END IF;
 END IF;RETURN r;
END $$;
ALTER FUNCTION public.erp_inventory_read(uuid,jsonb) RENAME TO erp_inventory_read_before_lifecycle;
ALTER FUNCTION public.erp_inventory_read_before_lifecycle(uuid,jsonb) SET SCHEMA erp_inventory_private;
CREATE FUNCTION public.erp_inventory_read(p_cafe uuid,p_query jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE r jsonb;items jsonb;stock jsonb;BEGIN
 r:=erp_inventory_private.erp_inventory_read_before_lifecycle(p_cafe,p_query);
 SELECT coalesce(jsonb_agg(x||jsonb_build_object('reserved',q.reserved,'available',(x->>'quantity')::numeric-q.reserved)),'[]') INTO stock FROM jsonb_array_elements(r->'stock')x CROSS JOIN LATERAL(SELECT erp_inventory_private.reserved(p_cafe,(x->>'item_id')::uuid,(x->>'warehouse_id')::uuid) reserved)q;
 SELECT coalesce(jsonb_agg(x||jsonb_build_object('reserved',q.reserved,'available',(x->>'quantity')::numeric-q.reserved)),'[]') INTO items FROM jsonb_array_elements(r->'items')x CROSS JOIN LATERAL(SELECT coalesce(sum((b->>'reserved')::numeric),0) reserved FROM jsonb_array_elements(stock)b WHERE b->>'item_id'=x->>'id')q;
 RETURN r||jsonb_build_object('items',items,'stock',stock);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_inventory_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.erp_inventory_read(uuid,jsonb),public.erp_inventory_write(uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.erp_inventory_read(uuid,jsonb),public.erp_inventory_write(uuid,jsonb) TO authenticated;
COMMIT;
