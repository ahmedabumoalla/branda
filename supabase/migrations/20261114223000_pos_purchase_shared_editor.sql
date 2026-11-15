BEGIN;
-- POS reuses the ERP purchase document/valuation pipeline with an own-shift boundary.
-- This cache also records ERP suppliers, whose phone is optional and name may be 160 chars.
-- The legacy payout RPC retains its own mandatory-phone validation unchanged.
ALTER TABLE public.bf_shift_supplier_payouts DROP CONSTRAINT bf_shift_supplier_payouts_supplier_name_check,DROP CONSTRAINT bf_shift_supplier_payouts_supplier_phone_check;
ALTER TABLE public.bf_shift_supplier_payouts ADD CONSTRAINT bf_shift_supplier_payouts_supplier_name_check CHECK(length(supplier_name) BETWEEN 1 AND 160),ADD CONSTRAINT bf_shift_supplier_payouts_supplier_phone_check CHECK(length(supplier_phone)<=30);
ALTER FUNCTION erp_purchase_private.settings(uuid) RENAME TO settings_before_pos_permissions;
CREATE FUNCTION erp_purchase_private.settings(c uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('cashierCreateItem',false,'cashierCreateSupplier',true,'cashierCreditPurchase',false)||erp_purchase_private.settings_before_pos_permissions(c)
$$;
CREATE FUNCTION erp_purchase_private.pos_permissions(c uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('createItem',brand_finance_private.role_for(c) IN('owner','manager') OR coalesce((s->>'cashierCreateItem')::boolean,false),'createSupplier',brand_finance_private.role_for(c)='owner' OR coalesce((s->>'cashierCreateSupplier')::boolean,true),'credit',brand_finance_private.role_for(c)='owner' OR coalesce((s->>'cashierCreditPurchase')::boolean,false)) FROM(SELECT erp_purchase_private.settings(c) s)x
$$;
CREATE FUNCTION erp_purchase_private.pos_setting_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE k text;fallback boolean;oldvalue boolean;newvalue boolean;previous jsonb;
BEGIN
 IF TG_OP='UPDATE' THEN previous:=OLD.payload;ELSE SELECT payload INTO previous FROM public.erp_purchase_settings WHERE cafe_id=NEW.cafe_id;END IF;
 FOREACH k IN ARRAY ARRAY['cashierCreateItem','cashierCreateSupplier','cashierCreditPurchase'] LOOP
  fallback:=k='cashierCreateSupplier';
  IF previous IS NOT NULL AND NOT(NEW.payload?k) THEN NEW.payload:=NEW.payload||jsonb_build_object(k,coalesce((previous->>k)::boolean,fallback));END IF;
  IF NEW.payload?k AND jsonb_typeof(NEW.payload->k) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'راجع صلاحيات مشتريات الكاشير';END IF;
  oldvalue:=coalesce((previous->>k)::boolean,fallback);
  newvalue:=coalesce((NEW.payload->>k)::boolean,fallback);
  IF oldvalue IS DISTINCT FROM newvalue AND brand_finance_private.role_for(NEW.cafe_id) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'تعديل صلاحيات مشتريات الكاشير يتطلب صلاحية المالك' USING ERRCODE='42501';END IF;
 END LOOP;RETURN NEW;
END$$;
CREATE TRIGGER erp_purchase_pos_permission_guard BEFORE INSERT OR UPDATE ON public.erp_purchase_settings FOR EACH ROW EXECUTE FUNCTION erp_purchase_private.pos_setting_guard();

CREATE FUNCTION erp_purchase_private.pos_assert(c uuid,shift uuid) RETURNS public.bf_shifts LANGUAGE plpgsql SET search_path='' AS $$
DECLARE sh public.bf_shifts%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(c),'') NOT IN('owner','manager','cashier') THEN RAISE EXCEPTION 'لا تملك صلاحية مشتريات الوردية' USING ERRCODE='42501';END IF;
 SELECT * INTO sh FROM public.bf_shifts WHERE cafe_id=c AND id=shift AND user_id=auth.uid() AND status='open' FOR UPDATE;
 IF sh.id IS NULL OR sh.supervisor_paused THEN RAISE EXCEPTION 'تسجيل المشتريات متاح من ورديتك المفتوحة وغير الموقوفة' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=c AND id=sh.account_id AND kind='cash' AND active AND deleted_at IS NULL AND NOT frozen AND NOT is_group) THEN RAISE EXCEPTION 'صندوق الوردية غير متاح للشراء';END IF;
 RETURN sh;
END$$;
CREATE FUNCTION erp_purchase_private.pos_cash(c uuid,a uuid,p jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE sh public.bf_shifts;
BEGIN sh:=erp_purchase_private.pos_assert(c,(p->>'posShiftId')::uuid);IF a IS DISTINCT FROM sh.account_id THEN RAISE EXCEPTION 'سداد المشتريات متاح من صندوق ورديتك فقط' USING ERRCODE='42501';END IF;END$$;

-- Clone the currently installed, tracked posting core rather than reimplement financial math.
-- Exact one-occurrence assertions abort if the source changes; all other bytes stay intact.
DO $$DECLARE source text;needle text;BEGIN
 SELECT pg_get_functiondef('erp_purchase_private.post(uuid,public.erp_purchase_documents,numeric)'::regprocedure) INTO source;
 source:=replace(source,'FUNCTION erp_purchase_private.post(','FUNCTION erp_purchase_private.pos_post(');
 needle:='PERFORM brand_finance_private.assert_job_access(c,''brand_finance_execute'',''purchase'');';
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'POS purchase posting authorization baseline mismatch';END IF;
 source:=replace(source,needle,'PERFORM erp_purchase_private.pos_assert(c,(p->>''posShiftId'')::uuid);');
 needle:='PERFORM erp_purchase_private.cash(c,aid);';
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'POS purchase cash baseline mismatch';END IF;
 source:=replace(source,needle,'PERFORM erp_purchase_private.pos_cash(c,aid,p);');
 needle:='paid,note,created_at,created_by,vat_rate,tax_inclusive)';
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'POS purchase document columns baseline mismatch';END IF;
 source:=replace(source,needle,'paid,note,shift_id,created_at,created_by,vat_rate,tax_inclusive)');
 needle:=',1000),(p->>''date'')::date::timestamp AT TIME ZONE ''Asia/Riyadh'',auth.uid(),0,false)';
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'POS purchase document timestamp baseline mismatch';END IF;
 source:=replace(source,needle,',1000),(p->>''posShiftId'')::uuid,now(),auth.uid(),0,false)');
 needle:='IF(cfg->>''autoApplyCredit'')::boolean THEN';
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'POS supplier advance-credit baseline mismatch';END IF;
 source:=replace(source,needle,'IF brand_finance_private.role_for(c)=''owner'' AND(cfg->>''autoApplyCredit'')::boolean THEN');EXECUTE source;
 SELECT pg_get_functiondef('erp_purchase_private.save(uuid,jsonb)'::regprocedure) INTO source;
 source:=replace(source,'FUNCTION erp_purchase_private.save(','FUNCTION erp_purchase_private.pos_save(');
 needle:='PERFORM erp_purchase_private.authorize(c,CASE WHEN r.id IS NULL THEN ''create'' ELSE ''update'' END);';
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'POS purchase save baseline mismatch';END IF;
 source:=replace(source,needle,'PERFORM erp_purchase_private.pos_assert(c,(p->>''posShiftId'')::uuid);');EXECUTE source;
 SELECT pg_get_functiondef('erp_purchase_private.supplier(uuid,jsonb)'::regprocedure) INTO source;
 source:=replace(source,'FUNCTION erp_purchase_private.supplier(','FUNCTION erp_purchase_private.pos_supplier(');
 needle:='PERFORM erp_purchase_private.authorize(c,CASE WHEN EXISTS(SELECT 1 FROM public.bf_parties WHERE cafe_id=c AND id=i) THEN ''update'' ELSE ''create'' END);';
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'POS purchase supplier baseline mismatch';END IF;
 source:=replace(source,needle,'PERFORM erp_purchase_private.pos_assert(c,(p->>''posShiftId'')::uuid);');EXECUTE source;
END$$;

CREATE FUNCTION public.brand_finance_pos_purchase_catalog(p_cafe_id uuid,p_shift_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid:=p_cafe_id;cfg jsonb;units jsonb;defaults jsonb;suppliers jsonb;result jsonb;sh public.bf_shifts;
BEGIN
 sh:=erp_purchase_private.pos_assert(c,p_shift_id);PERFORM erp_branch_private.enter(c);PERFORM erp_branch_private.assert_input(c,to_jsonb(sh));cfg:=erp_purchase_private.settings(c);
 SELECT coalesce(jsonb_agg(jsonb_build_object('itemId',id,'name',unit,'factor',1)),'[]') INTO units FROM public.bf_items WHERE cafe_id=c AND active;
 SELECT units||coalesce(jsonb_agg(jsonb_build_object('itemId',i.item_id,'name',u->>'name','factor',u->'factor')),'[]') INTO units FROM public.erp_inventory_items i JOIN public.erp_inventory_catalogs cat ON cat.cafe_id=i.cafe_id AND cat.id=i.unit_template_id CROSS JOIN LATERAL jsonb_array_elements(cat.payload->'units')u WHERE i.cafe_id=c;
 SELECT coalesce(jsonb_object_agg(i.item_id,i.payload||jsonb_build_object('trackingMode',i.tracking_mode)),'{}') INTO defaults FROM public.erp_inventory_items i WHERE i.cafe_id=c AND erp_branch_private.allowed_resource(c,erp_branch_private.current_branch(c),'item',i.item_id);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'revision',coalesce(s.revision,0),'name',b.name,'phone',b.phone,'email',b.email,'taxNumber',b.tax_number,'active',b.active,'firstName','','lastName','','mobile','','commercialRegistration','','number','','currency','SAR','address',jsonb_build_object('building','','street','','additional','','district','','city','','postal','','short','','country','SA'),'contacts','[]'::jsonb,'addresses','[]'::jsonb,'note','','openingBalance',0,'openingDate',current_date)||coalesce(s.payload,'{}')||jsonb_build_object('id',b.id,'revision',coalesce(s.revision,0),'name',b.name,'active',b.active,'openingBalance',0) ORDER BY b.name),'[]') INTO suppliers FROM public.bf_parties b LEFT JOIN public.erp_purchase_suppliers s ON s.cafe_id=b.cafe_id AND s.id=b.id WHERE b.cafe_id=c AND b.kind='supplier' AND b.active;
 result:=jsonb_build_object('settings',cfg,'branchScope',erp_branch_private.scope(c),'permissions',erp_purchase_private.pos_permissions(c),'suppliers',suppliers,'units',units,'itemDefaults',defaults,'costCenters',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.erp_cost_centers WHERE cafe_id=c AND active AND NOT is_group),'[]'),'categories',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.erp_inventory_catalogs WHERE cafe_id=c AND kind='category' AND active),'[]'),'blockedItems',coalesce((SELECT jsonb_agg(id) FROM public.bf_items WHERE cafe_id=c AND erp_branch_private.allowed_resource(c,erp_branch_private.current_branch(c),'item',id) AND erp_purchase_private.item_blocked(c,id,cfg)),'[]'));
 RETURN erp_branch_private.filter_json(c,erp_branch_private.current_branch(c),result);
END$$;

CREATE FUNCTION erp_purchase_private.pos_execute(c uuid,input jsonb,request uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE sh public.bf_shifts;prior public.bf_requests%ROWTYPE;p jsonb;permissions jsonb;entry jsonb;supplier jsonb;doc public.erp_purchase_documents%ROWTYPE;result jsonb;fid uuid;rid uuid;unit_name text;paid numeric;total numeric;available numeric;ids uuid[];matched integer;number bigint;
BEGIN
 IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(c),'') NOT IN('owner','manager','cashier') THEN RAISE EXCEPTION 'لا تملك صلاحية مشتريات الوردية' USING ERRCODE='42501';END IF;
 IF request IS NULL OR jsonb_typeof(input) IS DISTINCT FROM 'object' OR octet_length(input::text)>100000 OR input::text ~* '"[-+]?(nan|infinity)"' THEN RAISE EXCEPTION 'بيانات المشتريات غير صالحة';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(c::text,60412));
 SELECT * INTO prior FROM public.bf_requests WHERE cafe_id=c AND request_id=request;
 IF FOUND THEN IF prior.operation<>'shift_purchase' OR prior.payload IS DISTINCT FROM input OR prior.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'معرف الطلب مستخدم لعملية أخرى';END IF;RETURN prior.result||'{"duplicate":true}'::jsonb;END IF;
 sh:=erp_purchase_private.pos_assert(c,(input->>'shiftId')::uuid);
 PERFORM set_config('erp.branch_expected',coalesce((input->'branchScope')::text,''),true);PERFORM erp_branch_private.assert_context(c);PERFORM erp_branch_private.enter(c);PERFORM erp_branch_private.assert_input(c,input->'invoice');PERFORM erp_branch_private.assert_input(c,to_jsonb(sh));
 PERFORM 1 FROM public.erp_purchase_settings WHERE cafe_id=c FOR UPDATE;
 permissions:=erp_purchase_private.pos_permissions(c);p:=input->'invoice';
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p->>'kind' IS DISTINCT FROM 'invoice' OR (p->>'revision')::integer IS DISTINCT FROM 0 OR nullif(p->>'sourceId','') IS NOT NULL OR EXISTS(SELECT 1 FROM public.erp_purchase_documents WHERE id=(p->>'id')::uuid) OR EXISTS(SELECT 1 FROM public.bf_documents WHERE id=(p->>'id')::uuid) THEN RAISE EXCEPTION 'المطلوب فاتورة مشتريات جديدة غير مرتبطة بمستند سابق';END IF;
 IF jsonb_typeof(p->'paid') IS DISTINCT FROM 'number' OR jsonb_typeof(input->'expectedTotal') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'راجع المبلغ المدفوع وإجمالي الفاتورة';END IF;
 IF nullif(p->>'accountId','')::uuid IS DISTINCT FROM sh.account_id THEN RAISE EXCEPTION 'سداد المشتريات متاح من صندوق ورديتك فقط' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(coalesce(input->'newItems','[]')) IS DISTINCT FROM 'array' OR jsonb_array_length(coalesce(input->'newItems','[]'))>100 THEN RAISE EXCEPTION 'الأصناف الجديدة غير صالحة';END IF;
 IF jsonb_array_length(coalesce(input->'newItems','[]'))>0 AND NOT(permissions->>'createItem')::boolean THEN RAISE EXCEPTION 'المالك لم يسمح بإنشاء أصناف من الكاشير' USING ERRCODE='42501';END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(coalesce(input->'newItems','[]')) LOOP
  IF jsonb_typeof(entry->'name') IS DISTINCT FROM 'string' OR jsonb_typeof(entry->'sku') IS DISTINCT FROM 'string' OR length(btrim(entry->>'name')) NOT BETWEEN 1 AND 150 OR length(btrim(entry->>'sku')) NOT BETWEEN 1 AND 60 OR EXISTS(SELECT 1 FROM public.bf_items WHERE id=(entry->>'id')::uuid) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'lines')x WHERE x->>'itemId'=entry->>'id') THEN RAISE EXCEPTION 'راجع بيانات الصنف الجديد';END IF;
  SELECT name INTO unit_name FROM public.bf_item_units WHERE cafe_id=c AND id=(entry->>'unitId')::uuid;IF unit_name IS NULL THEN RAISE EXCEPTION 'وحدة القياس لا تخص العلامة' USING ERRCODE='42501';END IF;
  INSERT INTO public.bf_items(id,cafe_id,name,sku,unit,unit_id,barcode,min_quantity,active,cost_mode) VALUES((entry->>'id')::uuid,c,btrim(entry->>'name'),btrim(entry->>'sku'),unit_name,(entry->>'unitId')::uuid,nullif(btrim(entry->>'barcode'),''),0,true,'full');
 END LOOP;
 supplier:=input->'newSupplier';
 IF supplier IS NOT NULL AND jsonb_typeof(supplier)<>'null' THEN
  IF NOT(permissions->>'createSupplier')::boolean THEN RAISE EXCEPTION 'المالك لم يسمح بإنشاء موردين من الكاشير' USING ERRCODE='42501';END IF;
  IF jsonb_typeof(supplier) IS DISTINCT FROM 'object' OR supplier->>'id' IS DISTINCT FROM p->>'supplierId' OR (supplier->>'revision')::integer IS DISTINCT FROM 0 OR (supplier->>'openingBalance')::numeric IS DISTINCT FROM 0 OR EXISTS(SELECT 1 FROM public.bf_parties WHERE id=(supplier->>'id')::uuid) THEN RAISE EXCEPTION 'المورد الجديد لا يسمح برصيد افتتاحي أو تعديل مورد محفوظ';END IF;
  PERFORM erp_purchase_private.pos_supplier(c,supplier||jsonb_build_object('posShiftId',sh.id));
 END IF;
 p:=p||jsonb_build_object('posShiftId',sh.id);total:=(erp_purchase_private.validate(c,p)->>'total')::numeric;paid:=round((p->>'paid')::numeric*(p->>'exchangeRate')::numeric,2);
 IF paid<0 OR paid>total OR paid<>round(paid,2) THEN RAISE EXCEPTION 'المبلغ المدفوع غير صالح';END IF;
 IF paid<total AND NOT(permissions->>'credit')::boolean THEN RAISE EXCEPTION 'المالك لم يسمح بالشراء الآجل من الكاشير' USING ERRCODE='42501';END IF;
 SELECT coalesce(sum(debit-credit),0) INTO available FROM public.bf_journal WHERE cafe_id=c AND account_id=sh.account_id;
 IF paid>available THEN RAISE EXCEPTION 'رصيد صندوق الوردية لا يكفي لسداد الفاتورة';END IF;
 IF jsonb_typeof(coalesce(input->'attachmentIds','[]')) IS DISTINCT FROM 'array' OR jsonb_array_length(coalesce(input->'attachmentIds','[]'))>100 THEN RAISE EXCEPTION 'المرفقات غير صالحة';END IF;
 SELECT coalesce(array_agg(value::uuid),'{}'::uuid[]) INTO ids FROM jsonb_array_elements_text(coalesce(input->'attachmentIds','[]'));
 IF cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids)x) THEN RAISE EXCEPTION 'المرفق مكرر';END IF;
 PERFORM 1 FROM public.bf_shift_attachments WHERE id=ANY(ids) AND cafe_id=c AND shift_id=sh.id AND uploader_id=auth.uid() AND uploaded AND document_id IS NULL ORDER BY id FOR UPDATE;GET DIAGNOSTICS matched=ROW_COUNT;
 IF matched<>cardinality(ids) THEN RAISE EXCEPTION 'المرفقات لا تخص ورديتك أو لم يكتمل رفعها' USING ERRCODE='42501';END IF;
 rid:=erp_purchase_private.pos_save(c,p);SELECT * INTO STRICT doc FROM public.erp_purchase_documents WHERE cafe_id=c AND id=rid;
 fid:=erp_purchase_private.pos_post(c,doc,(input->>'expectedTotal')::numeric);
 SELECT d.number INTO number FROM public.bf_documents d WHERE d.cafe_id=c AND d.id=fid;
 IF paid>0 THEN INSERT INTO public.bf_shift_supplier_payouts(document_id,cafe_id,shift_id,supplier_name,supplier_phone) SELECT fid,c,sh.id,name,phone FROM public.bf_parties WHERE cafe_id=c AND id=doc.supplier_id;END IF;
 UPDATE public.bf_shift_attachments SET document_id=fid WHERE id=ANY(ids);
 result:=jsonb_build_object('id',fid,'number',number,'status','posted','purchaseId',rid);
 INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by) VALUES(c,request,'shift_purchase',input,result,auth.uid());
 INSERT INTO public.bf_treasury_audit(cafe_id,actor_id,operation,entity_id,after_data) VALUES(c,auth.uid(),'shift_purchase',fid,jsonb_build_object('shiftId',sh.id,'accountId',sh.account_id,'amount',paid,'credit',total-paid));
 INSERT INTO public.erp_purchase_events(cafe_id,record_id,actor,action,payload) VALUES(c,rid,auth.uid(),'pos_post',jsonb_build_object('financeId',fid,'shiftId',sh.id));
 RETURN result;
END$$;

ALTER FUNCTION public.brand_finance_execute(uuid,text,jsonb,uuid) RENAME TO execute_before_shared_pos_purchase;
ALTER FUNCTION public.execute_before_shared_pos_purchase(uuid,text,jsonb,uuid) SET SCHEMA erp_purchase_private;
CREATE FUNCTION public.brand_finance_execute(p_cafe_id uuid,p_operation text,p_payload jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_operation='shift_purchase' THEN
  IF p_payload?'invoice' THEN RETURN erp_purchase_private.pos_execute(p_cafe_id,p_payload,p_request_id);END IF;
  IF EXISTS(SELECT 1 FROM public.bf_requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id AND operation='shift_purchase' AND payload=p_payload AND created_by=auth.uid()) THEN RETURN erp_purchase_private.execute_before_shared_pos_purchase(p_cafe_id,p_operation,p_payload,p_request_id);END IF;
  -- Old clients cannot bypass the owner's supplier-creation switch.
  IF NOT(erp_purchase_private.pos_permissions(p_cafe_id)->>'createSupplier')::boolean AND NOT EXISTS(SELECT 1 FROM public.bf_parties WHERE cafe_id=p_cafe_id AND kind='supplier' AND active AND name=btrim(p_payload->>'supplierName') AND phone=btrim(p_payload->>'supplierPhone')) THEN RAISE EXCEPTION 'المالك لم يسمح بإنشاء موردين من الكاشير' USING ERRCODE='42501';END IF;
 END IF;
 RETURN erp_purchase_private.execute_before_shared_pos_purchase(p_cafe_id,p_operation,p_payload,p_request_id);
END$$;
REVOKE ALL ON FUNCTION erp_purchase_private.settings_before_pos_permissions(uuid),erp_purchase_private.settings(uuid),erp_purchase_private.pos_permissions(uuid),erp_purchase_private.pos_setting_guard(),erp_purchase_private.pos_assert(uuid,uuid),erp_purchase_private.pos_cash(uuid,uuid,jsonb),erp_purchase_private.pos_post(uuid,public.erp_purchase_documents,numeric),erp_purchase_private.pos_save(uuid,jsonb),erp_purchase_private.pos_supplier(uuid,jsonb),erp_purchase_private.pos_execute(uuid,jsonb,uuid),erp_purchase_private.execute_before_shared_pos_purchase(uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.brand_finance_execute(uuid,text,jsonb,uuid),public.brand_finance_pos_purchase_catalog(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_execute(uuid,text,jsonb,uuid),public.brand_finance_pos_purchase_catalog(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
