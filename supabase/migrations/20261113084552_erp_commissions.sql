BEGIN;
CREATE SCHEMA erp_commission_private;
REVOKE ALL ON SCHEMA erp_commission_private FROM PUBLIC,anon,authenticated;
CREATE TABLE public.erp_commission_rules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 150),active boolean NOT NULL DEFAULT true,payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=100000),revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(cafe_id,id),UNIQUE(cafe_id,name));
CREATE TABLE public.erp_commission_periods(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),number bigint GENERATED ALWAYS AS IDENTITY,date_from date NOT NULL,date_to date NOT NULL CHECK(date_to>=date_from AND date_to-date_from<=366),status text NOT NULL DEFAULT 'open' CHECK(status IN('open','approved','rejected','paid')),total numeric(16,2) NOT NULL DEFAULT 0 CHECK(total>=0 AND total<>'NaN'::numeric),revision integer NOT NULL DEFAULT 1,criteria jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),payout_id uuid,FOREIGN KEY(cafe_id,payout_id) REFERENCES public.bf_documents(cafe_id,id),UNIQUE(cafe_id,id));
CREATE INDEX erp_commission_period_dates ON public.erp_commission_periods(cafe_id,date_from,date_to);
CREATE TABLE public.erp_commission_rows(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,period_id uuid NOT NULL,employee_id uuid NOT NULL REFERENCES auth.users(id),employee_name text NOT NULL,rule_id uuid NOT NULL,rule_name text NOT NULL,rule_snapshot jsonb NOT NULL,target numeric NOT NULL,achievement numeric NOT NULL,total numeric(16,2) NOT NULL,lines jsonb NOT NULL,FOREIGN KEY(cafe_id,period_id) REFERENCES public.erp_commission_periods(cafe_id,id) ON DELETE CASCADE,FOREIGN KEY(cafe_id,rule_id) REFERENCES public.erp_commission_rules(cafe_id,id),UNIQUE(cafe_id,period_id,employee_id,rule_id),CHECK(target>0 AND target<>'NaN'::numeric AND achievement>=0 AND achievement<>'NaN'::numeric AND total>=0 AND total<>'NaN'::numeric));
CREATE INDEX erp_commission_rows_rule ON public.erp_commission_rows(cafe_id,rule_id,employee_id);
CREATE TABLE public.erp_commission_sales(cafe_id uuid NOT NULL,document_id uuid NOT NULL,employee_id uuid NOT NULL REFERENCES auth.users(id),branch_id uuid,revision integer NOT NULL DEFAULT 1,PRIMARY KEY(cafe_id,document_id),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),FOREIGN KEY(branch_id,cafe_id) REFERENCES public.branches(id,cafe_id));
CREATE INDEX erp_commission_sales_employee ON public.erp_commission_sales(cafe_id,employee_id);
CREATE TABLE public.erp_commission_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id),record_id uuid NOT NULL,actor uuid NOT NULL REFERENCES auth.users(id),action text NOT NULL,detail jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX erp_commission_events_record ON public.erp_commission_events(cafe_id,record_id,created_at);
CREATE TRIGGER erp_commission_events_immutable BEFORE UPDATE OR DELETE ON public.erp_commission_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TABLE erp_commission_private.requests(cafe_id uuid NOT NULL,request_id uuid NOT NULL,actor uuid NOT NULL,action text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,PRIMARY KEY(cafe_id,request_id));
CREATE FUNCTION erp_commission_private.authorize(p_cafe uuid,p_write boolean DEFAULT false,p_approve boolean DEFAULT false) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text;
BEGIN
 r:=brand_finance_private.role_for(p_cafe);
 IF auth.uid() IS NULL OR coalesce(r,'') NOT IN('owner','manager','accountant','auditor') OR (p_write AND r='auditor') OR (p_approve AND r NOT IN('owner','accountant')) THEN RAISE EXCEPTION 'لا تملك صلاحية إدارة عمولات المبيعات' USING ERRCODE='42501';END IF;
 RETURN r;
END $$;
CREATE FUNCTION erp_commission_private.sales(p_cafe uuid,p_from date,p_to date) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',l->>'id','documentId',d.id,'number',d.number::text,'productId',l->>'product_id','category',coalesce(c.name,''),'name',l->>'name','quantity',(l->>'quantity')::numeric-coalesce((l->>'returned_quantity')::numeric,0),'net',greatest(0,(l->>'net')::numeric-coalesce((l->>'returned_net')::numeric,0)),'employeeId',coalesce(a.employee_id,d.created_by),'branchId',a.branch_id,'issuedAt',d.created_at) ORDER BY d.created_at,d.id,l->>'id'),'[]')
 FROM public.bf_documents d CROSS JOIN LATERAL jsonb_array_elements(brand_finance_private.refund_lines(p_cafe,d.id,false)) l
 LEFT JOIN public.erp_commission_sales a ON a.cafe_id=d.cafe_id AND a.document_id=d.id
 LEFT JOIN public.menu_products p ON p.cafe_id=d.cafe_id AND p.id::text=l->>'product_id'
 LEFT JOIN public.menu_categories c ON c.cafe_id=p.cafe_id AND c.id=p.category_id
 WHERE d.cafe_id=p_cafe AND d.kind='sale' AND (d.created_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN p_from AND p_to
 AND coalesce((brand_finance_private.document_state(p_cafe,d.id)->>'outstanding')::numeric,1)<=0.009
 AND (l->>'quantity')::numeric>coalesce((l->>'returned_quantity')::numeric,0)
$$;
CREATE FUNCTION public.erp_commissions_read(p_cafe_id uuid,p_id uuid DEFAULT NULL,p_page integer DEFAULT 1,p_query text DEFAULT '',p_status text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text;
BEGIN
 r:=erp_commission_private.authorize(p_cafe_id);
 IF p_page NOT BETWEEN 1 AND 100000 OR length(p_query)>120 OR p_status NOT IN('','open','approved','rejected','paid') THEN RAISE EXCEPTION 'Invalid commission filter' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('totalPeriods',(SELECT count(*) FROM public.erp_commission_periods WHERE cafe_id=p_cafe_id AND (p_id IS NULL OR id=p_id) AND (p_status='' OR status=p_status) AND (p_query='' OR number::text ILIKE '%'||p_query||'%' OR EXISTS(SELECT 1 FROM public.erp_commission_rows matched WHERE matched.cafe_id=p_cafe_id AND matched.period_id=erp_commission_periods.id AND (matched.employee_name ILIKE '%'||p_query||'%' OR matched.rule_name ILIKE '%'||p_query||'%')))),

 'rules',coalesce((SELECT jsonb_agg(payload||jsonb_build_object('id',id,'revision',revision,'createdAt',created_at) ORDER BY name,id) FROM public.erp_commission_rules WHERE cafe_id=p_cafe_id),'[]'),
 'periods',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'number',p.number,'from',p.date_from,'to',p.date_to,'status',p.status,'revision',p.revision,'total',p.total,'createdAt',p.created_at,'payoutId',p.payout_id,'rows',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'employeeId',x.employee_id,'employeeName',x.employee_name,'ruleId',x.rule_id,'ruleName',x.rule_name,'target',x.target,'achievement',x.achievement,'total',x.total,'lines',CASE WHEN p_id=p.id THEN x.lines ELSE '[]'::jsonb END) ORDER BY employee_name,rule_name) FROM public.erp_commission_rows x WHERE x.cafe_id=p_cafe_id AND x.period_id=p.id),'[]')) ORDER BY p.created_at DESC) FROM (SELECT * FROM public.erp_commission_periods WHERE cafe_id=p_cafe_id AND (p_id IS NULL OR id=p_id) AND (p_status='' OR status=p_status) AND (p_query='' OR number::text ILIKE '%'||p_query||'%' OR EXISTS(SELECT 1 FROM public.erp_commission_rows matched WHERE matched.cafe_id=p_cafe_id AND matched.period_id=erp_commission_periods.id AND (matched.employee_name ILIKE '%'||p_query||'%' OR matched.rule_name ILIKE '%'||p_query||'%'))) ORDER BY created_at DESC,id LIMIT 50 OFFSET (p_page-1)*50) p),'[]'),
 'staff',coalesce((SELECT jsonb_agg(x ORDER BY name) FROM (SELECT user_id id,name,role FROM public.bf_staff WHERE cafe_id=p_cafe_id AND active UNION SELECT owner_user_id,name,'owner' FROM public.cafes WHERE id=p_cafe_id) x),'[]'),
 'products',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'category',coalesce(c.name,'')) ORDER BY p.name) FROM public.menu_products p LEFT JOIN public.menu_categories c ON c.cafe_id=p.cafe_id AND c.id=p.category_id WHERE p.cafe_id=p_cafe_id AND p.deleted_at IS NULL),'[]'),
 'departments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.erp_org_units WHERE cafe_id=p_cafe_id AND kind='department' AND active),'[]'),
 'designations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.erp_org_units WHERE cafe_id=p_cafe_id AND kind='designation' AND active),'[]'),
 'branches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.branches WHERE cafe_id=p_cafe_id AND active AND deleted_at IS NULL),'[]'),
 'accounts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND active AND kind IN('cash','bank')),'[]'),
 'events',coalesce((SELECT jsonb_agg(to_jsonb(e)-'cafe_id'-'actor' ORDER BY created_at DESC) FROM (SELECT * FROM public.erp_commission_events WHERE cafe_id=p_cafe_id AND record_id=p_id ORDER BY created_at DESC LIMIT 300) e),'[]'),
 'canWrite',r<>'auditor','canApprove',r IN('owner','accountant'),'canConfigure',r IN('owner','manager'));
END $$;
CREATE FUNCTION erp_commission_private.calculate(p_rule jsonb,p_lines jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE line jsonb;item jsonb;achievement numeric:=0;commission numeric:=0;amount numeric;contribution numeric;percentage numeric;lower_t jsonb;upper_t jsonb;tier_value numeric:=0;included jsonb:='[]';
BEGIN
 FOR line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  SELECT x.value INTO item FROM jsonb_array_elements(p_rule->'items') WITH ORDINALITY x(value,position) WHERE x.value->>'kind'='all' OR (x.value->>'kind'='product' AND x.value->'targets' ? (line->>'productId')) OR (x.value->>'kind'='category' AND x.value->'targets' ? (line->>'category')) ORDER BY CASE x.value->>'kind' WHEN 'product' THEN 0 WHEN 'category' THEN 1 ELSE 2 END,x.position LIMIT 1;
  IF item IS NULL THEN CONTINUE;END IF;
  contribution:=CASE p_rule->>'targetType' WHEN 'volume' THEN (line->>'quantity')::numeric ELSE (line->>'net')::numeric END;
  IF p_rule->>'type'='tiers' THEN contribution:=contribution*(item->>'amount')::numeric/100;END IF;
  achievement:=achievement+contribution;
  amount:=CASE WHEN p_rule->>'type'='flat' THEN round(CASE item->>'amountType' WHEN 'percentage' THEN (line->>'net')::numeric*(item->>'amount')::numeric/100 ELSE (item->>'amount')::numeric END,2) ELSE 0 END;
  commission:=commission+amount;included:=included||jsonb_build_array(line||jsonb_build_object('contribution',contribution,'commission',amount,'itemId',item->>'id'));
 END LOOP;
 percentage:=achievement/(p_rule->>'targetAmount')::numeric*100;
 IF p_rule->>'type'='tiers' THEN
  SELECT value INTO lower_t FROM jsonb_array_elements(p_rule->'tiers') t WHERE (t->>'target')::numeric<=percentage ORDER BY (t->>'target')::numeric DESC LIMIT 1;
  SELECT value INTO upper_t FROM jsonb_array_elements(p_rule->'tiers') t WHERE (t->>'target')::numeric>percentage ORDER BY (t->>'target')::numeric LIMIT 1;
  IF p_rule->>'interpolation'='steps' OR upper_t IS NULL THEN tier_value:=coalesce((lower_t->>'value')::numeric,0);
  ELSE lower_t:=coalesce(lower_t,'{"target":0,"value":0}');tier_value:=(lower_t->>'value')::numeric+((upper_t->>'value')::numeric-(lower_t->>'value')::numeric)*(percentage-(lower_t->>'target')::numeric)/((upper_t->>'target')::numeric-(lower_t->>'target')::numeric);END IF;
  commission:=CASE p_rule->>'tierType' WHEN 'percentage' THEN achievement*tier_value/100 ELSE tier_value END;
 END IF;
 RETURN jsonb_build_object('achievement',round(achievement,3),'percentage',percentage,'total',round(commission,2),'lines',included);
END $$;
CREATE FUNCTION erp_commission_private.validate_rule(p_cafe uuid,p jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE item jsonb;entry jsonb;target text;key text;value text;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>100000 OR length(btrim(coalesce(p->>'name',''))) NOT BETWEEN 1 AND 150 OR length(coalesce(p->>'description',''))>10000 OR coalesce(p->>'type','') NOT IN('flat','tiers') OR coalesce(p->>'targetType','') NOT IN('revenue','volume') OR coalesce(p->>'tierType','') NOT IN('fixed','percentage') OR coalesce(p->>'interpolation','') NOT IN('linear','steps') OR jsonb_typeof(p->'targetAmount') IS DISTINCT FROM 'number' OR (p->>'targetAmount')::numeric NOT BETWEEN 0.000001 AND 1000000000 OR jsonb_typeof(p->'active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'راجع بيانات قاعدة العمولة' USING ERRCODE='22023';END IF;
 IF jsonb_typeof(p->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'items') NOT BETWEEN 1 AND 100 OR jsonb_typeof(p->'tiers') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'tiers')>50 OR (p->>'type'='tiers' AND jsonb_array_length(p->'tiers')=0) THEN RAISE EXCEPTION 'أضف البنود ومستويات العمولة المطلوبة' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'items') x GROUP BY x->>'id' HAVING count(*)>1) OR EXISTS(SELECT 1 FROM jsonb_array_elements(p->'tiers') x GROUP BY (x->>'target')::numeric HAVING count(*)>1) THEN RAISE EXCEPTION 'البنود أو المستويات مكررة' USING ERRCODE='22023';END IF;
 FOR item IN SELECT x FROM jsonb_array_elements(p->'items') x LOOP
  IF coalesce(item->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'معرف بند العمولة غير صالح' USING ERRCODE='22023';END IF;
  IF coalesce(item->>'kind','') NOT IN('all','product','category') OR coalesce(item->>'amountType','') NOT IN('percentage','fixed') OR jsonb_typeof(item->'amount') IS DISTINCT FROM 'number' OR (item->>'amount')::numeric NOT BETWEEN 0 AND (CASE WHEN item->>'amountType'='percentage' OR p->>'type'='tiers' THEN 100 ELSE 1000000000 END) OR jsonb_typeof(item->'targets') IS DISTINCT FROM 'array' OR jsonb_array_length(item->'targets')>200 OR (item->>'kind'<>'all' AND jsonb_array_length(item->'targets')=0) THEN RAISE EXCEPTION 'راجع بنود قاعدة العمولة' USING ERRCODE='22023';END IF;
  FOR target IN SELECT jsonb_array_elements_text(item->'targets') LOOP
   IF (item->>'kind'='product' AND NOT EXISTS(SELECT 1 FROM public.menu_products WHERE cafe_id=p_cafe AND id::text=target AND deleted_at IS NULL)) OR (item->>'kind'='category' AND NOT EXISTS(SELECT 1 FROM public.menu_categories WHERE cafe_id=p_cafe AND name=target)) THEN RAISE EXCEPTION 'البند لا ينتمي إلى هذه العلامة' USING ERRCODE='42501';END IF;
  END LOOP;
 END LOOP;
 FOR entry IN SELECT x FROM jsonb_array_elements(p->'tiers') x LOOP
  IF jsonb_typeof(entry->'target') IS DISTINCT FROM 'number' OR jsonb_typeof(entry->'value') IS DISTINCT FROM 'number' OR (entry->>'target')::numeric NOT BETWEEN 0 AND 1000000000 OR (entry->>'value')::numeric NOT BETWEEN 0 AND (CASE p->>'tierType' WHEN 'percentage' THEN 100 ELSE 1000000000 END) THEN RAISE EXCEPTION 'قيم مستوى العمولة غير صالحة' USING ERRCODE='22023';END IF;
 END LOOP;
 FOREACH key IN ARRAY ARRAY['staffIds','roles','departmentIds','branchIds'] LOOP
  IF jsonb_typeof(p->key) IS DISTINCT FROM 'array' OR jsonb_array_length(p->key)>500 THEN RAISE EXCEPTION 'تعيين القاعدة غير صالح' USING ERRCODE='22023';END IF;
  FOR value IN SELECT jsonb_array_elements_text(p->key) LOOP
   IF (key='staffIds' AND NOT erp_org_private.staff(p_cafe,value::uuid)) OR (key='roles' AND value NOT IN('manager','cashier','accountant','warehouse','auditor')) OR (key='departmentIds' AND NOT EXISTS(SELECT 1 FROM public.erp_org_units WHERE cafe_id=p_cafe AND id::text=value AND kind='department' AND active)) OR (key='branchIds' AND NOT EXISTS(SELECT 1 FROM public.branches WHERE cafe_id=p_cafe AND id::text=value AND active AND deleted_at IS NULL)) THEN RAISE EXCEPTION 'أحد تعيينات القاعدة غير متاح' USING ERRCODE='22023';END IF;
  END LOOP;
 END LOOP;
 IF jsonb_array_length(p->'staffIds')+jsonb_array_length(p->'roles')+jsonb_array_length(p->'departmentIds')+jsonb_array_length(p->'branchIds')=0 THEN RAISE EXCEPTION 'اختر تعيينًا واحدًا على الأقل' USING ERRCODE='22023';END IF;
END $$;
CREATE FUNCTION erp_commission_private.fill_period(p_cafe uuid,p_id uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE period public.erp_commission_periods;rule public.erp_commission_rules;all_lines jsonb;matched jsonb;calc jsonb;employee uuid;employee_name text;employee_role text;dep uuid;designation uuid;
BEGIN
 SELECT * INTO STRICT period FROM public.erp_commission_periods WHERE cafe_id=p_cafe AND id=p_id FOR UPDATE;
 IF period.status<>'open' THEN RAISE EXCEPTION 'الفترة المغلقة لا تقبل إعادة الاحتساب' USING ERRCODE='22023';END IF;
 all_lines:=erp_commission_private.sales(p_cafe,period.date_from,period.date_to);
 IF jsonb_array_length(all_lines)>10000 THEN RAISE EXCEPTION 'الفترة تحتوي معاملات كثيرة اختر فترة أقصر' USING ERRCODE='22023';END IF;
 DELETE FROM public.erp_commission_rows WHERE cafe_id=p_cafe AND period_id=p_id;
 FOR rule IN SELECT * FROM public.erp_commission_rules WHERE cafe_id=p_cafe AND active AND (jsonb_array_length(period.criteria->'ruleIds')=0 OR period.criteria->'ruleIds' ? id::text) LOOP
  FOR employee IN SELECT DISTINCT (l->>'employeeId')::uuid FROM jsonb_array_elements(all_lines) l LOOP
   IF NOT erp_org_private.staff(p_cafe,employee) OR (jsonb_array_length(period.criteria->'staffIds')>0 AND NOT(period.criteria->'staffIds' ? employee::text)) THEN CONTINUE;END IF;
   SELECT name,role INTO employee_name,employee_role FROM public.bf_staff WHERE cafe_id=p_cafe AND user_id=employee;
   IF employee_name IS NULL THEN SELECT name,'owner' INTO employee_name,employee_role FROM public.cafes WHERE id=p_cafe AND owner_user_id=employee;END IF;
   SELECT department_id,designation_id INTO dep,designation FROM public.erp_org_assignments WHERE cafe_id=p_cafe AND user_id=employee;
   IF (period.criteria->>'departmentId' IS NOT NULL AND period.criteria->>'departmentId' IS DISTINCT FROM dep::text) OR (period.criteria->>'designationId' IS NOT NULL AND period.criteria->>'designationId' IS DISTINCT FROM designation::text) THEN CONTINUE;END IF;
   SELECT coalesce(jsonb_agg(l),'[]') INTO matched FROM jsonb_array_elements(all_lines) l WHERE l->>'employeeId'=employee::text AND (period.criteria->>'branchId' IS NULL OR l->>'branchId'=period.criteria->>'branchId') AND (rule.payload->'staffIds' ? employee::text OR rule.payload->'roles' ? employee_role OR rule.payload->'departmentIds' ? dep::text OR rule.payload->'branchIds' ? (l->>'branchId'));
   calc:=erp_commission_private.calculate(rule.payload,matched);
   IF jsonb_array_length(calc->'lines')=0 THEN CONTINUE;END IF;
   IF EXISTS(SELECT 1 FROM public.erp_commission_rows x JOIN public.erp_commission_periods p ON p.cafe_id=x.cafe_id AND p.id=x.period_id WHERE x.cafe_id=p_cafe AND x.rule_id=rule.id AND x.employee_id=employee AND p.id<>p_id AND p.status<>'rejected' AND p.date_from<=period.date_to AND p.date_to>=period.date_from) THEN RAISE EXCEPTION 'توجد فترة عمولة متداخلة للموظف والقاعدة نفسها' USING ERRCODE='22023';END IF;
   INSERT INTO public.erp_commission_rows(cafe_id,period_id,employee_id,employee_name,rule_id,rule_name,rule_snapshot,target,achievement,total,lines) VALUES(p_cafe,p_id,employee,employee_name,rule.id,rule.name,rule.payload,(rule.payload->>'targetAmount')::numeric,(calc->>'achievement')::numeric,(calc->>'total')::numeric,calc->'lines');
  END LOOP;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.erp_commission_rows WHERE cafe_id=p_cafe AND period_id=p_id) THEN RAISE EXCEPTION 'لا توجد مبيعات مدفوعة مؤهلة للموظفين والقواعد المختارة' USING ERRCODE='22023';END IF;
 UPDATE public.erp_commission_periods SET total=(SELECT sum(total) FROM public.erp_commission_rows WHERE cafe_id=p_cafe AND period_id=p_id) WHERE cafe_id=p_cafe AND id=p_id;
END $$;
CREATE FUNCTION public.erp_commissions_write(p_cafe_id uuid,p_action text,p_data jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text;v_id uuid:=nullif(p_data->>'id','')::uuid;rule public.erp_commission_rules;period public.erp_commission_periods;previous erp_commission_private.requests;v_result jsonb;v_revision integer;v_target text;v_key text;v_employee uuid;v_branch uuid;v_doc public.bf_documents;
BEGIN
 r:=erp_commission_private.authorize(p_cafe_id,true,p_action IN('approve','reject','reopen','payout'));
 IF p_request_id IS NULL OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>100000 OR p_action IS NULL OR p_action NOT IN('save_rule','delete_rule','create_period','refresh','delete_period','approve','reject','reopen','payout','assign_sale') THEN RAISE EXCEPTION 'عملية العمولة غير صالحة' USING ERRCODE='22023';END IF;
 -- Finance lock first: payout and sales settlement use this same lock order.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,84552));
 SELECT * INTO previous FROM erp_commission_private.requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN IF previous.actor<>auth.uid() OR previous.action<>p_action OR previous.payload<>p_data THEN RAISE EXCEPTION 'معرف العملية مستخدم لبيانات مختلفة' USING ERRCODE='22023';END IF;RETURN previous.result;END IF;
 IF p_action IN('save_rule','delete_rule') THEN
  IF r NOT IN('owner','manager') THEN RAISE EXCEPTION 'تعديل قواعد العمولة متاح للمالك والمدير' USING ERRCODE='42501';END IF;
  IF v_id IS NOT NULL THEN SELECT * INTO rule FROM public.erp_commission_rules WHERE cafe_id=p_cafe_id AND id=v_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'القاعدة غير موجودة' USING ERRCODE='42501';END IF;END IF;
  IF coalesce(rule.revision,0) IS DISTINCT FROM (p_data->>'revision')::integer THEN RAISE EXCEPTION 'تغيرت القاعدة أعد تحميلها' USING ERRCODE='40001';END IF;
  IF p_action='save_rule' THEN
   PERFORM erp_commission_private.validate_rule(p_cafe_id,p_data);v_id:=coalesce(v_id,gen_random_uuid());
   INSERT INTO public.erp_commission_rules(id,cafe_id,name,active,payload) VALUES(v_id,p_cafe_id,p_data->>'name',(p_data->>'active')::boolean,p_data-'id'-'revision') ON CONFLICT(id) DO UPDATE SET name=excluded.name,active=excluded.active,payload=excluded.payload,revision=erp_commission_rules.revision+1;
  ELSE
   IF v_id IS NULL THEN RAISE EXCEPTION 'حدد القاعدة' USING ERRCODE='22023';END IF;DELETE FROM public.erp_commission_rules WHERE cafe_id=p_cafe_id AND id=v_id;
  END IF;
 ELSIF p_action='create_period' THEN
  IF jsonb_typeof(p_data->'ruleIds') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'ruleIds')>100 OR jsonb_typeof(p_data->'staffIds') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'staffIds')>500 THEN RAISE EXCEPTION 'راجع معايير الفترة' USING ERRCODE='22023';END IF;
  FOR v_target IN SELECT jsonb_array_elements_text(p_data->'ruleIds') LOOP IF NOT EXISTS(SELECT 1 FROM public.erp_commission_rules WHERE cafe_id=p_cafe_id AND id::text=v_target AND active) THEN RAISE EXCEPTION 'القاعدة المحددة غير متاحة' USING ERRCODE='22023';END IF;END LOOP;
  FOR v_target IN SELECT jsonb_array_elements_text(p_data->'staffIds') LOOP IF NOT erp_org_private.staff(p_cafe_id,v_target::uuid) THEN RAISE EXCEPTION 'الموظف المحدد غير متاح' USING ERRCODE='22023';END IF;END LOOP;
  FOREACH v_key IN ARRAY ARRAY['departmentId','designationId'] LOOP IF p_data->>v_key IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_org_units WHERE cafe_id=p_cafe_id AND id::text=p_data->>v_key AND active AND kind=CASE v_key WHEN 'departmentId' THEN 'department' ELSE 'designation' END) THEN RAISE EXCEPTION 'معيار الهيكل التنظيمي غير متاح' USING ERRCODE='22023';END IF;END LOOP;
  IF p_data->>'branchId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.branches WHERE cafe_id=p_cafe_id AND id::text=p_data->>'branchId' AND active AND deleted_at IS NULL) THEN RAISE EXCEPTION 'الفرع غير متاح' USING ERRCODE='22023';END IF;
  v_id:=gen_random_uuid();INSERT INTO public.erp_commission_periods(id,cafe_id,date_from,date_to,criteria) VALUES(v_id,p_cafe_id,(p_data->>'from')::date,(p_data->>'to')::date,p_data);PERFORM erp_commission_private.fill_period(p_cafe_id,v_id);
 ELSIF p_action='assign_sale' THEN
  v_employee:=(p_data->>'employeeId')::uuid;v_branch:=nullif(p_data->>'branchId','')::uuid;
  IF NOT erp_org_private.staff(p_cafe_id,v_employee) OR (v_branch IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.branches WHERE cafe_id=p_cafe_id AND id=v_branch AND active AND deleted_at IS NULL)) THEN RAISE EXCEPTION 'الموظف أو الفرع غير متاح' USING ERRCODE='22023';END IF;
  SELECT * INTO v_doc FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=v_id AND kind='sale' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'فاتورة المبيعات غير موجودة' USING ERRCODE='42501';END IF;
  IF EXISTS(SELECT 1 FROM public.erp_commission_rows x JOIN public.erp_commission_periods p ON p.id=x.period_id WHERE x.cafe_id=p_cafe_id AND p.status<>'rejected' AND EXISTS(SELECT 1 FROM jsonb_array_elements(x.lines) line WHERE line->>'documentId'=v_id::text)) THEN RAISE EXCEPTION 'الفاتورة ضمن فترة عمولات احذف الفترة المفتوحة أو ارفضها قبل إعادة التعيين' USING ERRCODE='22023';END IF;
  SELECT revision INTO v_revision FROM public.erp_commission_sales WHERE cafe_id=p_cafe_id AND document_id=v_id;
  IF coalesce(v_revision,0) IS DISTINCT FROM (p_data->>'revision')::integer THEN RAISE EXCEPTION 'تغير تعيين الفاتورة أعد التحميل' USING ERRCODE='40001';END IF;
  INSERT INTO public.erp_commission_sales(cafe_id,document_id,employee_id,branch_id) VALUES(p_cafe_id,v_id,v_employee,v_branch) ON CONFLICT(cafe_id,document_id) DO UPDATE SET employee_id=excluded.employee_id,branch_id=excluded.branch_id,revision=erp_commission_sales.revision+1;
 ELSE
  SELECT * INTO period FROM public.erp_commission_periods WHERE cafe_id=p_cafe_id AND id=v_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'فترة المبيعات غير موجودة' USING ERRCODE='42501';END IF;
  IF period.revision IS DISTINCT FROM (p_data->>'revision')::integer THEN RAISE EXCEPTION 'تغيرت الفترة أعد تحميلها' USING ERRCODE='40001';END IF;
  IF p_action='refresh' THEN PERFORM erp_commission_private.fill_period(p_cafe_id,v_id);
  ELSIF p_action='delete_period' THEN IF period.status NOT IN('open','rejected') THEN RAISE EXCEPTION 'الفترة المعتمدة أو المصروفة محمية من الحذف' USING ERRCODE='22023';END IF;DELETE FROM public.erp_commission_periods WHERE cafe_id=p_cafe_id AND id=v_id;
  ELSIF p_action IN('approve','reject') THEN
   IF period.status<>'open' THEN RAISE EXCEPTION 'يجب أن تكون الفترة مفتوحة' USING ERRCODE='22023';END IF;
   UPDATE public.erp_commission_periods SET status=CASE p_action WHEN 'approve' THEN 'approved' ELSE 'rejected' END WHERE cafe_id=p_cafe_id AND id=v_id;
  ELSIF p_action='reopen' THEN
   IF period.status NOT IN('approved','rejected') THEN RAISE EXCEPTION 'الفترة المصروفة لا يمكن إعادة فتحها دون عكس التسوية المالية' USING ERRCODE='22023';END IF;
   IF EXISTS(SELECT 1 FROM public.erp_commission_rows x JOIN public.erp_commission_rows other ON other.cafe_id=x.cafe_id AND other.rule_id=x.rule_id AND other.employee_id=x.employee_id JOIN public.erp_commission_periods p ON p.id=other.period_id WHERE x.period_id=v_id AND p.id<>v_id AND p.status<>'rejected' AND p.date_from<=period.date_to AND p.date_to>=period.date_from) THEN RAISE EXCEPTION 'تتداخل الفترة مع فترة أخرى قائمة' USING ERRCODE='22023';END IF;
   UPDATE public.erp_commission_periods SET status='open' WHERE cafe_id=p_cafe_id AND id=v_id;
   PERFORM erp_commission_private.fill_period(p_cafe_id,v_id);
  ELSIF p_action='payout' THEN
   IF period.status<>'approved' OR period.total<=0 THEN RAISE EXCEPTION 'اعتمد فترة بعمولة موجبة قبل الصرف' USING ERRCODE='22023';END IF;
   IF NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=(p_data->>'accountId')::uuid AND active AND kind IN('cash','bank')) THEN RAISE EXCEPTION 'اختر حساب صرف نشطًا' USING ERRCODE='22023';END IF;
   v_result:=public.brand_finance_execute(p_cafe_id,'treasury',jsonb_build_object('kind','expense','accountId',p_data->>'accountId','amount',period.total,'note','صرف عمولات فترة المبيعات #'||period.number),gen_random_uuid());
   IF v_result->>'id' IS NULL THEN RAISE EXCEPTION 'لم يتأكد قيد صرف العمولة' USING ERRCODE='22023';END IF;
   UPDATE public.erp_commission_periods SET status='paid',payout_id=(v_result->>'id')::uuid WHERE cafe_id=p_cafe_id AND id=v_id;
  END IF;
  IF p_action<>'delete_period' THEN UPDATE public.erp_commission_periods SET revision=revision+1 WHERE cafe_id=p_cafe_id AND id=v_id;END IF;
 END IF;
 INSERT INTO public.erp_commission_events(cafe_id,record_id,actor,action,detail) VALUES(p_cafe_id,v_id,auth.uid(),p_action,p_data);
 v_result:=jsonb_build_object('id',v_id);INSERT INTO erp_commission_private.requests VALUES(p_cafe_id,p_request_id,auth.uid(),p_action,p_data,v_result);RETURN v_result;
END $$;
CREATE FUNCTION public.erp_commissions_sales(p_cafe_id uuid,p_from date,p_to date,p_query text DEFAULT '',p_page integer DEFAULT 1) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM erp_commission_private.authorize(p_cafe_id);
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>366 OR length(p_query)>100 OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'اختر نطاق بحث صالحًا' USING ERRCODE='22023';END IF;
 RETURN (WITH filtered AS (SELECT d.id,d.number,d.created_at,d.total,coalesce(a.employee_id,d.created_by) employee_id,a.branch_id,coalesce(a.revision,0) revision,(brand_finance_private.document_state(p_cafe_id,d.id)->>'outstanding')::numeric outstanding FROM public.bf_documents d LEFT JOIN public.erp_commission_sales a ON a.cafe_id=d.cafe_id AND a.document_id=d.id WHERE d.cafe_id=p_cafe_id AND d.kind='sale' AND (d.created_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN p_from AND p_to AND (p_query='' OR d.number::text ILIKE '%'||p_query||'%')) SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'rows',coalesce((SELECT jsonb_agg(x ORDER BY created_at DESC) FROM (SELECT * FROM filtered ORDER BY created_at DESC,id LIMIT 50 OFFSET (p_page-1)*50) x),'[]')));
END $$;
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['erp_commission_rules','erp_commission_periods','erp_commission_rows','erp_commission_sales','erp_commission_events'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);END LOOP;END $$;
ALTER TABLE erp_commission_private.requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA erp_commission_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_commission_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_commissions_read(uuid,uuid,integer,text,text),public.erp_commissions_write(uuid,text,jsonb,uuid),public.erp_commissions_sales(uuid,date,date,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_commissions_read(uuid,uuid,integer,text,text),public.erp_commissions_write(uuid,text,jsonb,uuid),public.erp_commissions_sales(uuid,date,date,text,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
