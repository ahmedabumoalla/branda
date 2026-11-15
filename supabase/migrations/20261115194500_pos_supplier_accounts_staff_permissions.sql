BEGIN;
ALTER TABLE public.bf_staff ADD COLUMN pos_permissions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(pos_permissions)='object');

CREATE FUNCTION erp_purchase_private.set_staff_permissions(c uuid,u uuid,p jsonb,actor uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE k text;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) x WHERE x NOT IN('createItem','createSupplier','credit','supplierPayout')) THEN RAISE EXCEPTION 'صلاحيات الكاشير غير صالحة'; END IF;
 FOREACH k IN ARRAY ARRAY['createItem','createSupplier','credit','supplierPayout'] LOOP
  IF p?k AND jsonb_typeof(p->k) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'صلاحيات الكاشير غير صالحة'; END IF;
 END LOOP;
 UPDATE public.bf_staff SET pos_permissions=p WHERE cafe_id=c AND user_id=u;
 IF NOT FOUND THEN RAISE EXCEPTION 'الموظف غير مرتبط بالعلامة'; END IF;
 INSERT INTO public.audit_logs(actor_id,cafe_id,action,entity_table,entity_id,new_data)
 VALUES(coalesce(auth.uid(),actor),c,'cashier_permissions_updated','bf_staff',u,p);
END $$;

CREATE OR REPLACE FUNCTION erp_purchase_private.pos_permissions(c uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN brand_finance_private.role_for(c)='owner' THEN '{"createItem":true,"createSupplier":true,"credit":true,"supplierPayout":true}'::jsonb ELSE
 jsonb_build_object('createItem',coalesce((p->>'createItem')::boolean,brand_finance_private.role_for(c)='manager' OR coalesce((s->>'cashierCreateItem')::boolean,false)),
 'createSupplier',coalesce((p->>'createSupplier')::boolean,(s->>'cashierCreateSupplier')::boolean,true),
 'credit',coalesce((p->>'credit')::boolean,(s->>'cashierCreditPurchase')::boolean,false),
 'supplierPayout',coalesce((p->>'supplierPayout')::boolean,true)) END
 FROM(SELECT erp_purchase_private.settings(c) s,coalesce((SELECT pos_permissions FROM public.bf_staff WHERE cafe_id=c AND user_id=auth.uid() AND active),'{}') p)x
$$;

-- Both the original staff assignment and its permissions commit together.
CREATE FUNCTION public.brand_finance_cashier_with_permissions(p_cafe uuid,p_mode text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;u uuid;
BEGIN
 IF auth.uid() IS NULL OR brand_finance_private.role_for(p_cafe) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'الصلاحيات يحددها مالك العلامة فقط' USING ERRCODE='42501'; END IF;
 IF p_mode='add' THEN result:=public.brand_finance_add_sales_cashier(p_cafe,(p_payload->>'userId')::uuid,p_payload->>'name');
 ELSIF p_mode='link' THEN result:=public.brand_finance_link_sales_cashier(p_cafe,p_payload->>'phone',p_payload->>'name');
 ELSE RAISE EXCEPTION 'عملية الموظف غير صالحة'; END IF;
 u:=(result->>'id')::uuid;
 PERFORM erp_purchase_private.set_staff_permissions(p_cafe,u,p_payload->'posPermissions');
 RETURN result;
END $$;

-- Keep the existing service-only maintenance authorization intact.
ALTER FUNCTION public.brand_finance_maintenance_cashier(uuid,uuid,timestamptz,text,jsonb) SET SCHEMA erp_purchase_private;
ALTER FUNCTION erp_purchase_private.brand_finance_maintenance_cashier(uuid,uuid,timestamptz,text,jsonb) RENAME TO maintenance_before_staff_permissions;
CREATE FUNCTION public.brand_finance_maintenance_cashier(p_cafe_id uuid,p_actor_id uuid,p_maintenance_expires_at timestamptz,p_operation text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 result:=erp_purchase_private.maintenance_before_staff_permissions(p_cafe_id,p_actor_id,p_maintenance_expires_at,p_operation,p_payload);
 IF p_operation<>'authorize' AND p_payload?'posPermissions' THEN
  PERFORM erp_purchase_private.set_staff_permissions(p_cafe_id,(result->>'id')::uuid,p_payload->'posPermissions',p_actor_id);
 END IF;
 RETURN result;
END $$;

ALTER FUNCTION public.brand_finance_snapshot(uuid) SET SCHEMA erp_purchase_private;
ALTER FUNCTION erp_purchase_private.brand_finance_snapshot(uuid) RENAME TO snapshot_before_staff_permissions;
CREATE FUNCTION public.brand_finance_snapshot(p_cafe_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 result:=erp_purchase_private.snapshot_before_staff_permissions(p_cafe_id);
 RETURN result||jsonb_build_object('posPermissions',erp_purchase_private.pos_permissions(p_cafe_id),'staff',
 coalesce((SELECT jsonb_agg(s||jsonb_build_object('posPermissions',coalesce(b.pos_permissions,'{}'))) FROM jsonb_array_elements(result->'staff')s LEFT JOIN public.bf_staff b ON b.cafe_id=p_cafe_id AND b.user_id=(s->>'user_id')::uuid),'[]'));
END $$;

ALTER FUNCTION public.brand_finance_pos_purchase_catalog(uuid,uuid) SET SCHEMA erp_purchase_private;
ALTER FUNCTION erp_purchase_private.brand_finance_pos_purchase_catalog(uuid,uuid) RENAME TO catalog_before_supplier_balances;
CREATE FUNCTION public.brand_finance_pos_purchase_catalog(p_cafe_id uuid,p_shift_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;balances jsonb;
BEGIN
 result:=erp_purchase_private.catalog_before_supplier_balances(p_cafe_id,p_shift_id);
 SELECT coalesce(jsonb_object_agg(id,balance),'{}') INTO balances FROM (
 SELECT p.id,coalesce(sum(j.credit-j.debit) FILTER(WHERE a.kind IN('payable','receivable') AND erp_branch_private.row_allowed(p_cafe_id,erp_branch_private.current_branch(p_cafe_id),to_jsonb(d))),0) balance
 FROM jsonb_to_recordset(result->'suppliers') p(id uuid)
 LEFT JOIN public.bf_journal j ON j.cafe_id=p_cafe_id AND j.party_id=p.id
 LEFT JOIN public.bf_accounts a ON a.cafe_id=j.cafe_id AND a.id=j.account_id
 LEFT JOIN public.bf_documents d ON d.cafe_id=j.cafe_id AND d.id=j.document_id GROUP BY p.id)x;
 RETURN result||jsonb_build_object('supplierBalances',balances);
END $$;

-- The execute wrapper and own-shift supplier payment core follow below.

CREATE FUNCTION erp_purchase_private.supplier_payout_by_id(p_cafe_id uuid,p_operation text,p_payload jsonb,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sh public.bf_shifts%ROWTYPE; prior public.bf_requests%ROWTYPE; cfg public.bf_settings%ROWTYPE;
 amount numeric; available numeric; supplier_name text; supplier_phone text; note text; party uuid;
 doc uuid:=gen_random_uuid(); num bigint; ids uuid[]; matched integer; result jsonb;
BEGIN
 IF p_operation IS DISTINCT FROM 'supplier_payout' THEN RAISE EXCEPTION 'Unsupported operation'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 PERFORM brand_finance_private.role_for(p_cafe_id);
 IF auth.uid() IS NULL OR NOT(erp_purchase_private.pos_permissions(p_cafe_id)->>'supplierPayout')::boolean THEN RAISE EXCEPTION 'Supplier payment permission required' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>100000 THEN RAISE EXCEPTION 'بيانات السداد غير صالحة'; END IF;
 SELECT * INTO prior FROM public.bf_requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.operation<>p_operation OR prior.payload IS DISTINCT FROM p_payload OR prior.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'معرف الطلب مستخدم لعملية أخرى'; END IF;
  RETURN prior.result||'{"duplicate":true}'::jsonb;
 END IF;
 SELECT * INTO sh FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND id=(p_payload->>'shiftId')::uuid AND user_id=auth.uid() AND status='open' FOR UPDATE;
 IF sh.id IS NULL THEN RAISE EXCEPTION 'السداد متاح من ورديتك المفتوحة فقط حدث الصفحة وتحقق من الوردية' USING ERRCODE='42501'; END IF;
 IF sh.supervisor_paused THEN RAISE EXCEPTION 'الوردية موقوفة إداريًا لا يمكن الصرف حتى استئنافها'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=sh.account_id AND kind='cash' AND active AND deleted_at IS NULL) THEN RAISE EXCEPTION 'صندوق الوردية غير متاح للسداد'; END IF;
 SELECT * INTO STRICT cfg FROM public.bf_settings WHERE cafe_id=p_cafe_id FOR UPDATE;
 IF cfg.closed_through IS NOT NULL AND (now() AT TIME ZONE 'Asia/Riyadh')::date<=cfg.closed_through THEN RAISE EXCEPTION 'الفترة المالية مقفلة'; END IF;
 supplier_name:=btrim(coalesce(p_payload->>'supplierName','')); supplier_phone:=btrim(coalesce(p_payload->>'supplierPhone','')); note:=btrim(coalesce(p_payload->>'note',''));
 IF jsonb_typeof(p_payload->'amount') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'أدخل مبلغًا صحيحًا للسداد'; END IF;
 amount:=(p_payload->>'amount')::numeric;
 IF amount<=0 OR amount>999999999 OR amount<>round(amount,2) OR length(supplier_name)>160 OR length(supplier_phone)>30 OR length(note)>500 THEN RAISE EXCEPTION 'راجع اسم المورد ورقم جواله ومبلغ السداد والبيان'; END IF;
 SELECT coalesce(sum(debit-credit),0) INTO available FROM public.bf_journal WHERE cafe_id=p_cafe_id AND account_id=sh.account_id;
 IF amount>available THEN RAISE EXCEPTION 'رصيد صندوق الوردية لا يكفي لهذا السداد'; END IF;
 IF jsonb_typeof(coalesce(p_payload->'attachmentIds','[]'::jsonb)) IS DISTINCT FROM 'array' OR jsonb_array_length(coalesce(p_payload->'attachmentIds','[]'::jsonb))>100 THEN RAISE EXCEPTION 'مرفقات السداد غير صالحة'; END IF;
 SELECT coalesce(array_agg(value::uuid),'{}'::uuid[]) INTO ids FROM jsonb_array_elements_text(coalesce(p_payload->'attachmentIds','[]'::jsonb));
 IF cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RAISE EXCEPTION 'المرفق مكرر في السداد'; END IF;
 PERFORM 1 FROM public.bf_shift_attachments WHERE id=ANY(ids) AND cafe_id=p_cafe_id AND shift_id=sh.id AND uploader_id=auth.uid() AND uploaded AND document_id IS NULL ORDER BY id FOR UPDATE;
 GET DIAGNOSTICS matched=ROW_COUNT;
 IF matched<>cardinality(ids) THEN RAISE EXCEPTION 'أكمل رفع المرفقات وتأكد أنها تخص ورديتك' USING ERRCODE='42501'; END IF;
 PERFORM erp_purchase_private.pos_assert(p_cafe_id,sh.id);
 IF p_payload?'branchScope' THEN PERFORM set_config('erp.branch_expected',(p_payload->'branchScope')::text,true);PERFORM erp_branch_private.assert_context(p_cafe_id); END IF;
 PERFORM erp_branch_private.enter(p_cafe_id);
 PERFORM erp_branch_private.assert_input(p_cafe_id,to_jsonb(sh));
 IF p_payload->'newSupplier' IS NOT NULL AND p_payload->'newSupplier'<>'null'::jsonb THEN
  IF NOT(erp_purchase_private.pos_permissions(p_cafe_id)->>'createSupplier')::boolean THEN RAISE EXCEPTION 'Supplier creation permission required' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.bf_parties WHERE id=(p_payload->'newSupplier'->>'id')::uuid) OR coalesce((p_payload->'newSupplier'->>'revision')::int,-1)<>0 THEN RAISE EXCEPTION 'New supplier required'; END IF;
  party:=erp_purchase_private.pos_supplier(p_cafe_id,p_payload->'newSupplier'||jsonb_build_object('posShiftId',sh.id));
  IF party IS DISTINCT FROM (p_payload->>'supplierId')::uuid THEN RAISE EXCEPTION 'Supplier identity mismatch'; END IF;
 ELSE party:=nullif(p_payload->>'supplierId','')::uuid;
 END IF;
 IF party IS NULL THEN
  SELECT id INTO party FROM public.bf_parties WHERE cafe_id=p_cafe_id AND kind='supplier' AND active AND name=supplier_name AND phone=supplier_phone ORDER BY id LIMIT 1;
 END IF;
 SELECT name,phone INTO supplier_name,supplier_phone FROM public.bf_parties WHERE cafe_id=p_cafe_id AND id=party AND kind='supplier' AND active FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Select an active supplier' USING ERRCODE='42501'; END IF;
 PERFORM erp_branch_private.assert_resource(p_cafe_id,erp_branch_private.current_branch(p_cafe_id),'supplier',party);
 INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,shift_id,account_id,total,paid,note,created_by)
 VALUES(doc,p_cafe_id,'settlement',party,sh.id,sh.account_id,amount,amount,note,auth.uid()) RETURNING number INTO num;
 INSERT INTO public.bf_shift_supplier_payouts VALUES(doc,p_cafe_id,sh.id,supplier_name,supplier_phone);
 PERFORM brand_finance_private.line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'2000'),amount,0,party);
 PERFORM brand_finance_private.line(p_cafe_id,doc,sh.account_id,0,amount);
 UPDATE public.bf_shift_attachments SET document_id=doc WHERE id=ANY(ids);
 result:=jsonb_build_object('id',doc,'number',num,'status','posted');
 INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by) VALUES(p_cafe_id,p_request_id,p_operation,p_payload,result,auth.uid());
 INSERT INTO public.bf_treasury_audit(cafe_id,actor_id,operation,entity_id,after_data) VALUES(p_cafe_id,auth.uid(),'supplier_payout',doc,jsonb_build_object('shiftId',sh.id,'accountId',sh.account_id,'amount',amount,'supplierName',supplier_name));
 RETURN result;
END $$;

ALTER FUNCTION public.brand_finance_execute(uuid,text,jsonb,uuid) SET SCHEMA erp_purchase_private;
ALTER FUNCTION erp_purchase_private.brand_finance_execute(uuid,text,jsonb,uuid) RENAME TO execute_before_staff_permissions;
CREATE FUNCTION public.brand_finance_execute(p_cafe_id uuid,p_operation text,p_payload jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;u uuid;
BEGIN
 IF p_operation='supplier_payout' THEN RETURN erp_purchase_private.supplier_payout_by_id(p_cafe_id,p_operation,p_payload,p_request_id); END IF;
 IF p_operation='staff' AND p_payload?'posPermissions' AND (auth.uid() IS NULL OR brand_finance_private.role_for(p_cafe_id) IS DISTINCT FROM 'owner') THEN RAISE EXCEPTION 'Only the brand owner can set cashier permissions' USING ERRCODE='42501'; END IF;
 result:=erp_purchase_private.execute_before_staff_permissions(p_cafe_id,p_operation,p_payload,p_request_id);
 IF p_operation='staff' AND p_payload?'posPermissions' THEN
  u:=nullif(p_payload->>'userId','')::uuid;
  IF u IS NULL THEN SELECT id INTO u FROM auth.users WHERE lower(email)=lower(p_payload->>'email'); END IF;
  PERFORM erp_purchase_private.set_staff_permissions(p_cafe_id,u,p_payload->'posPermissions');
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION erp_purchase_private.set_staff_permissions(uuid,uuid,jsonb,uuid),erp_purchase_private.maintenance_before_staff_permissions(uuid,uuid,timestamptz,text,jsonb),erp_purchase_private.snapshot_before_staff_permissions(uuid),erp_purchase_private.catalog_before_supplier_balances(uuid,uuid),erp_purchase_private.supplier_payout_by_id(uuid,text,jsonb,uuid),erp_purchase_private.execute_before_staff_permissions(uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.brand_finance_execute(uuid,text,jsonb,uuid),public.brand_finance_snapshot(uuid),public.brand_finance_pos_purchase_catalog(uuid,uuid),public.brand_finance_cashier_with_permissions(uuid,text,jsonb),public.brand_finance_maintenance_cashier(uuid,uuid,timestamptz,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_execute(uuid,text,jsonb,uuid),public.brand_finance_snapshot(uuid),public.brand_finance_pos_purchase_catalog(uuid,uuid),public.brand_finance_cashier_with_permissions(uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.brand_finance_maintenance_cashier(uuid,uuid,timestamptz,text,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
