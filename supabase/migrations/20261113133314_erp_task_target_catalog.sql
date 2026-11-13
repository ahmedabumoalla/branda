BEGIN;
CREATE TABLE erp_task_private.target_catalog(kind text PRIMARY KEY,label text NOT NULL,domain text NOT NULL,source_table text NOT NULL,predicate text NOT NULL);
INSERT INTO erp_task_private.target_catalog VALUES
('customer','العملاء','customers','bf_parties','r->>''kind''=''customer'' AND (r->>''active'')::boolean'),
('supplier','الموردون','purchases','bf_parties','r->>''kind''=''supplier'' AND (r->>''active'')::boolean'),
('invoice','الفواتير','','bf_documents','r->>''kind''=''sale'''),
('expense','المصروفات','finance','bf_documents','r->>''kind''=''expense'''),
('purchase','فواتير المشتريات','purchases','bf_documents','r->>''kind''=''purchase'''),
('item','الأصناف','inventory','bf_items','(r->>''active'')::boolean'),
('warehouse','المستودعات','inventory','bf_warehouses','(r->>''active'')::boolean AND erp_inventory_private.warehouse_allowed($1,(r->>''id'')::uuid,''read'')'),
('employee','الموظفون','','',''),
('purchase_request','طلبات الشراء','purchases','erp_purchase_documents','r->>''kind''=''request'''),
('purchase_rfq','طلبات عروض الأسعار','purchases','erp_purchase_documents','r->>''kind''=''rfq'''),
('purchase_quotation','عروض أسعار الموردين','purchases','erp_purchase_documents','r->>''kind''=''quotation'''),
('purchase_order','أوامر الشراء','purchases','erp_purchase_documents','r->>''kind''=''order'''),
('purchase_document','مستندات المشتريات','purchases','erp_purchase_documents','true'),
('work_order','أوامر الشغل','work_orders','erp_work_orders','true'),
('appointment','مواعيد أوامر الشغل','work_orders','erp_work_order_activities','true'),
('customer_appointment','مواعيد العملاء','customers','erp_customer_appointments','true'),
('asset','الأصول المحاسبية','assets','erp_assets','true'),
('asset_unit','وحدات الأصول','assets','erp_asset_units','true'),
('employee_asset','أصول الموظفين','custody','erp_employee_assets','true'),
('custody','عهد الموظفين','custody','erp_employee_assets','r->>''holder_kind''=''employee'''),
('asset_type','أنواع عهد الموظفين','custody','erp_employee_asset_types','(r->>''active'')::boolean'),
('asset_location','مواقع الأصول','assets','erp_asset_locations','true'),
('workflow','سجلات دورات العمل','workflows','erp_workflow_records','EXISTS(SELECT 1 FROM public.erp_workflow_types t WHERE t.cafe_id=$1 AND t.id=(r->>''type_id'')::uuid AND erp_workflow_private.allowed($1,t.config,''read'',r->>''status''))'),
('workflow_type','أنواع دورات العمل','workflows','erp_workflow_types','erp_workflow_private.allowed($1,r->''config'',''read'')'),
('booking','الحجوزات','bookings','erp_bookings','true'),
('booking_service','خدمات الحجز','bookings','erp_booking_services','(r->>''active'')::boolean'),
('booking_package','باقات الحجز','bookings','erp_booking_packages','(r->>''active'')::boolean'),
('rental_reservation','حجوزات الوحدات','rentals','erp_rental_reservations','true'),
('rental_contract','عقود الإيجار','rentals','erp_rental_contracts','true'),
('rental_unit','الوحدات الإيجارية','rentals','erp_rental_units','true'),
('rental_installment','أقساط عقود الإيجار','rentals','erp_rental_installments','true'),
('contract','عقود الموظفين','payroll','','contracts'),
('payslip','قسائم الرواتب','payroll','','payslips'),
('payrun','مسيرات الرواتب','payroll','','runs'),
('loan','السلف','payroll','','loans'),
('salary_component','بنود الراتب','payroll','erp_salary_components','(r->>''active'')::boolean'),
('salary_structure','قوالب الراتب','payroll','erp_salary_structures','(r->>''active'')::boolean'),
('cheque_book','دفاتر الشيكات','cheques','erp_cheque_books','true'),
('payable_cheque','الشيكات المدفوعة','cheques','erp_cheques','r->>''kind''=''payable'''),
('receivable_cheque','الشيكات المستلمة','cheques','erp_cheques','r->>''kind''=''receivable'''),
('receipt','سندات القبض','finance','bf_documents','r->>''kind''=''receipt'''),
('journal','القيود اليومية','accounting','bf_documents','r->>''kind''=''journal'''),
('account','الحسابات المالية','accounting','bf_accounts','(r->>''active'')::boolean AND r->>''deleted_at'' IS NULL'),
('cost_center','مراكز التكلفة','accounting','erp_cost_centers','(r->>''active'')::boolean'),
('financial_custody','العهد المالية','finance','erp_finance_custodies','true'),
('inventory_document','الأذون المخزنية','inventory','erp_inventory_documents','true'),
('stocktake','جرد المخزون','inventory','erp_inventory_documents','r->>''kind''=''stocktake'''),
('inventory_request','الطلبات المخزنية','inventory','erp_inventory_documents','r->>''kind''=''request'''),
('time_entry','سجلات الوقت','time','erp_time_entries','true'),
('time_project','مشاريع تتبع الوقت','time','erp_time_catalogs','r->>''kind''=''project'' AND (r->>''active'')::boolean'),
('time_activity','أنشطة تتبع الوقت','time','erp_time_catalogs','r->>''kind''=''activity'' AND (r->>''active'')::boolean'),
('task','المهام','tasks','erp_tasks','true'),
('task_type','أنواع المهام','tasks','erp_task_types','(r->>''active'')::boolean'),
('task_template','قوالب المهام','tasks','erp_task_templates','(r->>''active'')::boolean'),
('task_flow','مسارات المهام','tasks','erp_task_flows','true');
REVOKE ALL ON erp_task_private.target_catalog FROM PUBLIC,anon,authenticated,service_role;
DO $$DECLARE r record;BEGIN FOR r IN SELECT conname FROM pg_constraint WHERE conrelid='public.erp_tasks'::regclass AND contype='c' AND pg_get_constraintdef(oid)LIKE'%target_kind%' AND pg_get_constraintdef(oid)LIKE'%customer%' LOOP EXECUTE format('ALTER TABLE public.erp_tasks DROP CONSTRAINT %I',r.conname);END LOOP;END$$;
ALTER TABLE public.erp_tasks ADD CONSTRAINT erp_tasks_target_catalog_check CHECK(target_kind IS NULL OR target_kind=ANY(ARRAY['customer','supplier','invoice','expense','purchase','item','warehouse','employee','purchase_request','purchase_rfq','purchase_quotation','purchase_order','purchase_document','work_order','appointment','customer_appointment','asset','asset_unit','employee_asset','custody','asset_type','asset_location','workflow','workflow_type','booking','booking_service','booking_package','rental_reservation','rental_contract','rental_unit','rental_installment','contract','payslip','payrun','loan','salary_component','salary_structure','cheque_book','payable_cheque','receivable_cheque','receipt','journal','account','cost_center','financial_custody','inventory_document','stocktake','inventory_request','time_entry','time_project','time_activity','task','task_type','task_template','task_flow']::text[]));
CREATE FUNCTION erp_task_private.default_targets()RETURNS text[]LANGUAGE sql IMMUTABLE SET search_path=''AS $$SELECT ARRAY['customer','supplier','invoice','expense','purchase','item','warehouse','employee','purchase_request','purchase_order','work_order','appointment','asset','employee_asset','custody']::text[]$$;
CREATE FUNCTION erp_task_private.target_branch_allowed(c uuid,r jsonb,k text DEFAULT '')RETURNS boolean LANGUAGE plpgsql STABLE SET search_path=''AS $$DECLARE ok boolean;BEGIN IF to_regprocedure('erp_branch_private.row_allowed(uuid,uuid,jsonb,text)')IS NULL THEN RETURN true;END IF;EXECUTE 'SELECT erp_branch_private.row_allowed($1,erp_branch_private.current_branch($1),$2,$3)'INTO ok USING c,r||jsonb_build_object('customerId',coalesce(r->'customerId',r->'customer_id'),'itemId',coalesce(r->'itemId',r->'item_id'),'branchId',coalesce(r->'branchId',r->'branch_id')),CASE WHEN k IN('customer','supplier','item','account','cost_center','unit_template')THEN k ELSE ''END;RETURN coalesce(ok,false);END$$;
CREATE FUNCTION erp_task_private.target_scope_visible(c uuid,k text,i uuid)RETURNS boolean LANGUAGE plpgsql STABLE SET search_path=''AS $$DECLARE config erp_task_private.target_catalog;r jsonb;BEGIN IF k IS NULL AND i IS NULL THEN RETURN true;END IF;SELECT * INTO config FROM erp_task_private.target_catalog WHERE kind=k;IF config.kind IS NULL THEN RETURN false;END IF;IF config.domain<>''AND NOT erp_access_private.allowed(c,config.domain,'read')THEN RETURN false;END IF;IF config.source_table=''THEN RETURN erp_task_private.target_name(c,k,i)IS NOT NULL;END IF;IF to_regclass('public.'||config.source_table)IS NULL THEN RETURN false;END IF;EXECUTE format('SELECT to_jsonb(t)FROM public.%I t WHERE cafe_id=$1 AND id=$2',config.source_table)INTO r USING c,i;IF r IS NULL THEN RETURN true;END IF;IF k IN('workflow','workflow_type')AND erp_task_private.target_name(c,k,i)IS NULL THEN RETURN false;END IF;RETURN erp_task_private.target_branch_allowed(c,r,k);END$$;
CREATE FUNCTION erp_task_private.task_visible(c uuid,i uuid)RETURNS boolean LANGUAGE plpgsql STABLE SET search_path=''AS $$DECLARE r public.erp_tasks;seen uuid[]:='{}';BEGIN FOR depth IN 1..20 LOOP IF i=ANY(seen)THEN RETURN false;END IF;seen:=array_append(seen,i);SELECT * INTO r FROM public.erp_tasks WHERE cafe_id=c AND id=i;IF r.id IS NULL OR NOT erp_task_private.target_branch_allowed(c,to_jsonb(r))THEN RETURN false;END IF;IF r.target_kind IS NULL THEN RETURN true;END IF;IF r.target_kind='task'THEN i:=r.target_id;CONTINUE;END IF;RETURN erp_task_private.target_scope_visible(c,r.target_kind,r.target_id);END LOOP;RETURN false;END$$;
UPDATE erp_task_private.target_catalog SET predicate='erp_task_private.task_visible($1,(r->>''id'')::uuid)'WHERE kind='task';
CREATE FUNCTION erp_task_private.target_rows(c uuid,k text,q text DEFAULT '',record_id uuid DEFAULT NULL)RETURNS TABLE(id uuid,label text)LANGUAGE plpgsql STABLE SET search_path=''AS $$DECLARE config erp_task_private.target_catalog;statement text;snapshot jsonb;BEGIN
 SELECT * INTO config FROM erp_task_private.target_catalog WHERE kind=k;IF config.kind IS NULL THEN RETURN;END IF;
 IF config.domain<>'' AND NOT coalesce(erp_access_private.allowed(c,config.domain,'read'),false)THEN RETURN;END IF;
 IF k='employee' THEN statement:='SELECT (r->>''id'')::uuid,r->>''name'' FROM(SELECT jsonb_build_object(''id'',owner_user_id,''name'',name)r FROM public.cafes WHERE id=$1 UNION SELECT jsonb_build_object(''id'',user_id,''name'',name)r FROM public.bf_staff WHERE cafe_id=$1 AND active';IF to_regclass('public.erp_hr_employees')IS NOT NULL AND erp_access_private.allowed(c,'hr','read')THEN statement:=statement||' UNION SELECT to_jsonb(e)||jsonb_build_object(''name'',concat_ws('' — '',e.code,btrim(e.first_name||'' ''||e.last_name)))FROM public.erp_hr_employees e WHERE e.cafe_id=$1 AND e.active';END IF;statement:=statement||')x WHERE($3::uuid IS NULL OR(r->>''id'')::uuid=$3)AND erp_task_private.target_branch_allowed($1,r,''employee'')AND(r->>''name''ILIKE''%''||$2||''%''OR r->>''id''=$2)ORDER BY 2 LIMIT 100';RETURN QUERY EXECUTE statement USING c,q,record_id;RETURN;END IF;
 IF config.source_table='' THEN snapshot:=public.erp_payroll_read(c);RETURN QUERY SELECT(x->>'id')::uuid,concat_ws(' — ',nullif(x->>'code',''),nullif(x->>'name',''))FROM jsonb_array_elements(snapshot->config.predicate)x WHERE(record_id IS NULL OR(x->>'id')::uuid=record_id)AND erp_task_private.target_branch_allowed(c,x)AND(concat_ws(' ',x->>'code',x->>'name')ILIKE'%'||q||'%'OR x->>'id'=q)ORDER BY x->>'name' LIMIT 100;RETURN;END IF;
 IF to_regclass('public.'||config.source_table) IS NULL THEN RETURN;END IF;
 statement:=format('SELECT (r->>''id'')::uuid,concat_ws('' — '',nullif(r->>''code'',''''),coalesce(nullif(r->>''title'',''''),nullif(r->>''name'',''''),nullif(r#>>''{config,name}'',''''),nullif(r#>>''{payload,title}'',''''),nullif(r->>''number'',''''),nullif(r->>''code'',''''),''#''||left(r->>''id'',8))) FROM(SELECT to_jsonb(t)r FROM public.%I t WHERE cafe_id=$1)x WHERE (%s) AND($3::uuid IS NULL OR(r->>''id'')::uuid=$3) AND(concat_ws('' '',r->>''title'',r->>''name'',r->>''code'',r#>>''{config,name}'',r->>''number'') ILIKE ''%%''||$2||''%%'' OR r->>''id''=$2)ORDER BY 2 LIMIT 100',config.source_table,config.predicate);
 statement:=replace(statement,'WHERE (','WHERE erp_task_private.target_branch_allowed($1,r,$4) AND (');RETURN QUERY EXECUTE statement USING c,q,record_id,k;
END$$;
CREATE OR REPLACE FUNCTION erp_task_private.target_name(p_cafe uuid,p_kind text,p_id uuid)RETURNS text LANGUAGE sql STABLE SET search_path=''AS $$SELECT label FROM erp_task_private.target_rows(p_cafe,p_kind,'',p_id)WHERE id=p_id LIMIT 1$$;
CREATE OR REPLACE FUNCTION erp_task_private.validate_target(p_cafe uuid,p_kind text,p_id uuid)RETURNS void LANGUAGE plpgsql SET search_path=''AS $$DECLARE enabled text[];BEGIN IF p_kind IS NULL AND p_id IS NULL THEN RETURN;END IF;SELECT enabled_targets INTO enabled FROM public.erp_task_settings WHERE cafe_id=p_cafe;enabled:=coalesce(enabled,erp_task_private.default_targets());IF p_kind IS NULL OR p_id IS NULL OR NOT(p_kind=ANY(enabled)) OR erp_task_private.target_name(p_cafe,p_kind,p_id)IS NULL THEN RAISE EXCEPTION 'السجل المرتبط غير متاح أو صلاحية القسم لا تسمح بربطه' USING ERRCODE='42501';END IF;END$$;
CREATE OR REPLACE FUNCTION public.erp_tasks_targets(p_cafe_id uuid,p_kind text,p_query text DEFAULT '')RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$DECLARE enabled text[];result jsonb;BEGIN PERFORM erp_task_private.access(p_cafe_id);PERFORM erp_access_private.assert_allowed(p_cafe_id,'tasks','read');IF p_query IS NULL OR length(p_query)>120 OR p_kind IS NULL OR NOT EXISTS(SELECT 1 FROM erp_task_private.target_catalog WHERE kind=p_kind)THEN RAISE EXCEPTION 'معيار البحث غير صالح';END IF;SELECT enabled_targets INTO enabled FROM public.erp_task_settings WHERE cafe_id=p_cafe_id;IF NOT(p_kind=ANY(coalesce(enabled,erp_task_private.default_targets())))THEN RAISE EXCEPTION 'القسم غير مفعل للربط في إعدادات المهام' USING ERRCODE='42501';END IF;SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]')INTO result FROM erp_task_private.target_rows(p_cafe_id,p_kind,p_query)r;RETURN result;END$$;
DO $$DECLARE source text;reader regprocedure:=coalesce(to_regprocedure('erp_access_private.snapshot_erp_tasks_read(uuid,jsonb)'),to_regprocedure('public.erp_tasks_read(uuid,jsonb)'));before text:='ARRAY[''customer'',''supplier'',''invoice'',''expense'',''purchase'',''item'',''warehouse'',''employee'']::text[]';replacement text:='ARRAY[''customer'',''supplier'',''invoice'',''expense'',''purchase'',''item'',''warehouse'',''employee'',''purchase_request'',''purchase_rfq'',''purchase_quotation'',''purchase_order'',''purchase_document'',''work_order'',''appointment'',''customer_appointment'',''asset'',''asset_unit'',''employee_asset'',''custody'',''asset_type'',''asset_location'',''workflow'',''workflow_type'',''booking'',''booking_service'',''booking_package'',''rental_reservation'',''rental_contract'',''rental_unit'',''rental_installment'',''contract'',''payslip'',''payrun'',''loan'',''salary_component'',''salary_structure'',''cheque_book'',''payable_cheque'',''receivable_cheque'',''receipt'',''journal'',''account'',''cost_center'',''financial_custody'',''inventory_document'',''stocktake'',''inventory_request'',''time_entry'',''time_project'',''time_activity'',''task'',''task_type'',''task_template'',''task_flow'']::text[]';BEGIN
 source:=pg_get_functiondef('public.erp_tasks_execute(uuid,text,jsonb,uuid)'::regprocedure);IF position(before IN source)=0 THEN RAISE EXCEPTION 'Review task settings validator before extending';END IF;source:=replace(source,before,replacement);
 IF position('SELECT * INTO previous FROM erp_task_private.requests'IN source)=0 THEN RAISE EXCEPTION 'Review task mutation scope guard placement';END IF;
 source:=replace(source,'SELECT * INTO previous FROM erp_task_private.requests',
 'IF v_id IS NOT NULL THEN
 IF EXISTS(SELECT 1 FROM public.erp_tasks WHERE cafe_id=p_cafe_id AND id=v_id)AND NOT erp_task_private.task_visible(p_cafe_id,v_id)THEN RAISE EXCEPTION ''المهمة خارج نطاق السجلات المسموحة'' USING ERRCODE=''42501'';END IF;
 IF(p_action=''save_flow''OR(p_action=''delete''AND p_data->>''kind''=''flow''))AND EXISTS(SELECT 1 FROM public.erp_tasks child WHERE child.cafe_id=p_cafe_id AND child.flow_id=v_id AND NOT erp_task_private.task_visible(p_cafe_id,child.id))THEN RAISE EXCEPTION ''المسار يحتوي مهام خارج النطاق المسموح'' USING ERRCODE=''42501'';END IF;
 IF(p_action=''save_template''OR(p_action=''delete''AND p_data->>''kind''=''template''))AND EXISTS(SELECT 1 FROM public.erp_task_templates t CROSS JOIN LATERAL jsonb_array_elements(t.lines)x WHERE t.cafe_id=p_cafe_id AND t.id=v_id AND NOT erp_task_private.target_scope_visible(p_cafe_id,nullif(x->>''targetKind'',''''),nullif(x->>''targetId'','''')::uuid))THEN RAISE EXCEPTION ''القالب يحتوي سجلات خارج النطاق المسموح'' USING ERRCODE=''42501'';END IF;
 END IF;
 IF p_action=''save_flow''AND nullif(p_data->>''templateId'','''')IS NOT NULL AND EXISTS(SELECT 1 FROM public.erp_task_templates t CROSS JOIN LATERAL jsonb_array_elements(t.lines)x WHERE t.cafe_id=p_cafe_id AND t.id=(p_data->>''templateId'')::uuid AND NOT erp_task_private.target_scope_visible(p_cafe_id,nullif(x->>''targetKind'',''''),nullif(x->>''targetId'','''')::uuid))THEN RAISE EXCEPTION ''قالب المسار خارج النطاق المسموح'' USING ERRCODE=''42501'';END IF;
 SELECT * INTO previous FROM erp_task_private.requests');EXECUTE source;
 source:=pg_get_functiondef(reader);before:='''{"revision":0,"enabledTargets":["customer","supplier","invoice","expense","purchase","item","warehouse","employee"]}''::jsonb';IF position(before IN source)=0 THEN RAISE EXCEPTION 'Review task defaults before extending';END IF;source:=replace(source,before,'jsonb_build_object(''revision'',0,''enabledTargets'',erp_task_private.default_targets())');
 IF position('WHERE t.cafe_id=p_cafe_id AND'IN source)=0 THEN RAISE EXCEPTION 'Review task list scope before extending';END IF;source:=replace(source,'WHERE t.cafe_id=p_cafe_id AND','WHERE t.cafe_id=p_cafe_id AND erp_task_private.task_visible(p_cafe_id,t.id)AND');
 source:=replace(source,'FROM public.erp_task_templates t WHERE cafe_id=p_cafe_id)','FROM public.erp_task_templates t WHERE cafe_id=p_cafe_id AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(t.lines)x WHERE NOT erp_task_private.target_scope_visible(p_cafe_id,nullif(x->>''targetKind'',''''),nullif(x->>''targetId'','''')::uuid)))');
 source:=replace(source,'FROM public.erp_task_flows f WHERE cafe_id=p_cafe_id)','FROM public.erp_task_flows f WHERE cafe_id=p_cafe_id AND NOT EXISTS(SELECT 1 FROM public.erp_tasks child WHERE child.cafe_id=p_cafe_id AND child.flow_id=f.id AND NOT erp_task_private.task_visible(p_cafe_id,child.id)))');
 source:=replace(source,'WHERE cafe_id=p_cafe_id AND ((v_id','WHERE cafe_id=p_cafe_id AND(task_id IS NULL OR erp_task_private.task_visible(p_cafe_id,task_id))AND(flow_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.erp_tasks child WHERE child.cafe_id=p_cafe_id AND child.flow_id=erp_task_events.flow_id AND NOT erp_task_private.task_visible(p_cafe_id,child.id)))AND ((v_id');
 source:=replace(source,'WHERE cafe_id=p_cafe_id AND task_id=v_id)','WHERE cafe_id=p_cafe_id AND task_id=v_id AND erp_task_private.task_visible(p_cafe_id,task_id))');EXECUTE source;
END$$;
ALTER TABLE public.erp_task_settings ALTER COLUMN enabled_targets SET DEFAULT erp_task_private.default_targets();
REVOKE ALL ON FUNCTION erp_task_private.default_targets(),erp_task_private.target_branch_allowed(uuid,jsonb,text),erp_task_private.target_scope_visible(uuid,text,uuid),erp_task_private.task_visible(uuid,uuid),erp_task_private.target_rows(uuid,text,text,uuid),erp_task_private.target_name(uuid,text,uuid),erp_task_private.validate_target(uuid,text,uuid)FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.erp_tasks_targets(uuid,text,text)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION public.erp_tasks_targets(uuid,text,text)TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
