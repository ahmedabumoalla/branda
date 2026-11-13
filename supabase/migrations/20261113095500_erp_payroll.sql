BEGIN;
CREATE SCHEMA erp_payroll_private;
REVOKE ALL ON SCHEMA erp_payroll_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.erp_salary_components(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),name text NOT NULL,code text NOT NULL,kind text NOT NULL CHECK(kind IN('earning','deduction')),active boolean NOT NULL DEFAULT true,payload jsonb NOT NULL,revision integer NOT NULL DEFAULT 1,UNIQUE(cafe_id,id),UNIQUE(cafe_id,code),CHECK(code~'^[a-z][a-z_]{0,39}$' AND length(name) BETWEEN 1 AND 150));
CREATE TABLE public.erp_salary_structures(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),name text NOT NULL,active boolean NOT NULL DEFAULT true,payload jsonb NOT NULL,revision integer NOT NULL DEFAULT 1,UNIQUE(cafe_id,id),UNIQUE(cafe_id,name));
CREATE TABLE public.erp_payroll_records(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),kind text NOT NULL CHECK(kind IN('contract','run','payslip','loan')),number bigint GENERATED ALWAYS AS IDENTITY,name text NOT NULL,code text NOT NULL,employee_id uuid,run_id uuid,contract_id uuid,status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','approved','paid','rejected','cancelled','closed')),date_from date NOT NULL,date_to date NOT NULL,posting_date date NOT NULL,currency text NOT NULL DEFAULT 'SAR',exchange_rate numeric(18,6) NOT NULL DEFAULT 1,payload jsonb NOT NULL,calculation jsonb NOT NULL DEFAULT '{}',amount numeric(18,2) NOT NULL DEFAULT 0,paid numeric(18,2) NOT NULL DEFAULT 0,document_id uuid,payment_id uuid,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(cafe_id,id),UNIQUE(cafe_id,kind,code),FOREIGN KEY(cafe_id,employee_id) REFERENCES public.erp_hr_employees(cafe_id,id),FOREIGN KEY(cafe_id,run_id) REFERENCES public.erp_payroll_records(cafe_id,id),FOREIGN KEY(cafe_id,contract_id) REFERENCES public.erp_payroll_records(cafe_id,id),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),FOREIGN KEY(cafe_id,payment_id) REFERENCES public.bf_documents(cafe_id,id),CHECK(date_to>=date_from AND exchange_rate>0 AND exchange_rate<>'NaN'::numeric AND amount>=0 AND amount<>'NaN'::numeric AND paid>=0 AND paid<=amount),CHECK((kind='run')=(employee_id IS NULL)));
CREATE INDEX erp_payroll_employee_period ON public.erp_payroll_records(cafe_id,employee_id,kind,date_from,date_to);
CREATE INDEX erp_payroll_run ON public.erp_payroll_records(cafe_id,run_id);
CREATE TABLE public.erp_payroll_loan_installments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,loan_id uuid NOT NULL,due_on date NOT NULL,amount numeric(18,2) NOT NULL CHECK(amount>0),repaid numeric(18,2) NOT NULL DEFAULT 0 CHECK(repaid>=0 AND repaid<=amount),FOREIGN KEY(cafe_id,loan_id) REFERENCES public.erp_payroll_records(cafe_id,id),UNIQUE(cafe_id,id));
CREATE INDEX erp_payroll_loan_due ON public.erp_payroll_loan_installments(cafe_id,loan_id,due_on);
CREATE TABLE public.erp_payroll_loan_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,installment_id uuid NOT NULL,payslip_id uuid,document_id uuid NOT NULL,amount numeric(18,2) NOT NULL CHECK(amount>0),reversed boolean NOT NULL DEFAULT false,FOREIGN KEY(cafe_id,installment_id) REFERENCES public.erp_payroll_loan_installments(cafe_id,id),FOREIGN KEY(cafe_id,payslip_id) REFERENCES public.erp_payroll_records(cafe_id,id),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id));
CREATE INDEX erp_payroll_loan_payment_slip ON public.erp_payroll_loan_payments(cafe_id,payslip_id);
CREATE TABLE public.erp_payroll_commission_claims(cafe_id uuid NOT NULL,payslip_id uuid NOT NULL,commission_row_id uuid PRIMARY KEY REFERENCES public.erp_commission_rows(id),amount numeric(18,2) NOT NULL,FOREIGN KEY(cafe_id,payslip_id) REFERENCES public.erp_payroll_records(cafe_id,id));
CREATE INDEX erp_payroll_commission_slip ON public.erp_payroll_commission_claims(cafe_id,payslip_id);
CREATE TABLE public.erp_payroll_settings(cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),payload jsonb NOT NULL,email_rule_id uuid,revision integer NOT NULL DEFAULT 1,FOREIGN KEY(cafe_id,email_rule_id) REFERENCES public.erp_template_rules(cafe_id,id));
CREATE TABLE public.erp_payroll_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id),record_id uuid NOT NULL,action text NOT NULL,actor uuid NOT NULL REFERENCES auth.users(id),detail jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX erp_payroll_event_record ON public.erp_payroll_events(cafe_id,record_id,created_at);
CREATE TRIGGER erp_payroll_event_immutable BEFORE UPDATE OR DELETE ON public.erp_payroll_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TABLE erp_payroll_private.requests(cafe_id uuid NOT NULL,request_id uuid NOT NULL,actor uuid NOT NULL,action text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,PRIMARY KEY(cafe_id,request_id));
CREATE FUNCTION erp_payroll_private.authorize(p_cafe uuid,p_write boolean DEFAULT false,p_approve boolean DEFAULT false) RETURNS text LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r text;BEGIN r:=brand_finance_private.role_for(p_cafe);IF auth.uid() IS NULL OR coalesce(r,'') NOT IN('owner','manager','accountant','auditor') OR(p_write AND r='auditor') OR(p_approve AND r NOT IN('owner','manager')) THEN RAISE EXCEPTION 'لا تملك صلاحية المرتبات المطلوبة' USING ERRCODE='42501';END IF;RETURN r;END $$;
CREATE FUNCTION erp_payroll_private.access(p_cafe uuid,p_action text) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN IF to_regprocedure('erp_access_private.assert_allowed(uuid,text,text)') IS NOT NULL THEN PERFORM erp_access_private.assert_allowed(p_cafe,'payroll',p_action);END IF;END $$;
CREATE FUNCTION erp_payroll_private.eval(p jsonb,v jsonb,depth integer DEFAULT 0) RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE a numeric;b numeric;answer numeric;op text:=p->>'operator';name text:=p->>'name';BEGIN
 IF depth>24 OR octet_length(p::text)>30000 THEN RAISE EXCEPTION 'الصيغة معقدة أكثر من المسموح';END IF;
 CASE p->>'type'
 WHEN 'number' THEN answer:=(p->>'value')::numeric;
 WHEN 'variable' THEN IF NOT v?name THEN RAISE EXCEPTION 'متغير غير محسوب في صيغة الراتب: %',name;END IF;answer:=(v->>name)::numeric;
 WHEN 'unary' THEN a:=erp_payroll_private.eval(p->'value',v,depth+1);answer:=CASE op WHEN '-' THEN -a WHEN '+' THEN a WHEN '!' THEN CASE WHEN a=0 THEN 1 ELSE 0 END END;
 WHEN 'binary' THEN a:=erp_payroll_private.eval(p->'left',v,depth+1);b:=erp_payroll_private.eval(p->'right',v,depth+1);answer:=CASE op WHEN '+' THEN a+b WHEN '-' THEN a-b WHEN '*' THEN a*b WHEN '/' THEN a/b WHEN '%' THEN mod(a,b) WHEN '>' THEN (a>b)::integer WHEN '<' THEN(a<b)::integer WHEN '>=' THEN(a>=b)::integer WHEN '<=' THEN(a<=b)::integer WHEN '==' THEN(a=b)::integer WHEN '!=' THEN(a<>b)::integer WHEN '&&' THEN(a<>0 AND b<>0)::integer WHEN '||' THEN(a<>0 OR b<>0)::integer END;
 WHEN 'call' THEN a:=erp_payroll_private.eval(p->'args'->0,v,depth+1);IF name IN('min','max') THEN b:=erp_payroll_private.eval(p->'args'->1,v,depth+1);END IF;answer:=CASE name WHEN 'min' THEN least(a,b) WHEN 'max' THEN greatest(a,b) WHEN 'abs' THEN abs(a) WHEN 'round' THEN floor(a+0.5) WHEN 'floor' THEN floor(a) WHEN 'ceil' THEN ceil(a) END;
 ELSE RAISE EXCEPTION 'صيغة راتب غير صالحة';END CASE;
 IF answer IS NULL OR answer IN('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) OR abs(answer)>1000000000 THEN RAISE EXCEPTION 'نتيجة صيغة الراتب خارج الحدود المسموحة';END IF;RETURN answer;
END $$;
CREATE FUNCTION erp_payroll_private.calculate(p_cafe uuid,p jsonb,metrics jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c public.erp_salary_components;line jsonb;lines jsonb:='[]';amount numeric;basic numeric:=round((p->>'basic')::numeric,2);gross numeric;deductions numeric:=0;v jsonb;seen uuid[]:='{}';settings jsonb;expr jsonb;condition jsonb;attendance_used boolean:=false;BEGIN
 SELECT payload INTO settings FROM public.erp_payroll_settings WHERE cafe_id=p_cafe;
 IF basic IS NULL OR basic<0 OR basic>1000000000 OR basic='NaN'::numeric OR jsonb_typeof(p->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'lines')>100 THEN RAISE EXCEPTION 'راجع قيمة الراتب وبنوده';END IF;
 gross:=basic;v:='{"worked":0,"scheduled":0,"late":0,"early":0,"overtime":0,"absent":0,"leave":0,"holiday":0,"days":0,"period_days":0}'::jsonb||metrics||jsonb_build_object('basic',basic,'earnings',gross,'deductions',0);
 FOR line IN SELECT * FROM jsonb_array_elements(p->'lines') LOOP
  SELECT * INTO c FROM public.erp_salary_components WHERE cafe_id=p_cafe AND id=(line->>'componentId')::uuid AND active;
  IF NOT FOUND OR c.id=ANY(seen) OR v?c.code THEN RAISE EXCEPTION 'بند الراتب غير متاح أو مكرر أو رمزه محجوز';END IF;seen:=array_append(seen,c.id);
  expr:=CASE WHEN nullif(line->>'formula','') IS NOT NULL THEN line->'formulaAst' WHEN c.payload->>'method'='formula' THEN c.payload->'formulaAst' END;
  condition:=CASE WHEN nullif(line->>'condition','') IS NOT NULL THEN line->'conditionAst' ELSE c.payload->'conditionAst' END;
  IF expr='null'::jsonb THEN expr:=NULL;END IF;IF condition='null'::jsonb THEN condition:=NULL;END IF;
  IF (coalesce(expr::text,'')||coalesce(condition::text,''))~'"name": "(worked|scheduled|late|early|overtime|absent|leave|holiday|days)"' THEN attendance_used:=true;IF metrics?'complete' AND NOT coalesce((metrics->>'complete')::boolean,false) THEN RAISE EXCEPTION 'الصيغة تعتمد على حضور غير مكتمل أو غير معتمد';END IF;END IF;
  IF nullif(line->>'condition','') IS NOT NULL AND condition IS NULL THEN RAISE EXCEPTION 'الشرط الحسابي لم يتحقق';END IF;
  IF (nullif(line->>'formula','') IS NOT NULL OR c.payload->>'method'='formula') AND expr IS NULL THEN RAISE EXCEPTION 'الصيغة الحسابية لم تتحقق';END IF;
  amount:=CASE WHEN condition IS NOT NULL AND erp_payroll_private.eval(condition,v)=0 THEN 0 WHEN expr IS NOT NULL THEN erp_payroll_private.eval(expr,v) ELSE coalesce((line->>'amount')::numeric,(c.payload->>'amount')::numeric) END;
  IF amount IS NULL OR amount<0 OR amount>1000000000 OR amount='NaN'::numeric THEN RAISE EXCEPTION 'قيمة بند الراتب غير صالحة';END IF;amount:=round(amount,2);
  v:=v||jsonb_build_object(c.code,amount);
  IF NOT coalesce((c.payload->>'referenceOnly')::boolean,false) THEN IF c.kind='earning' THEN gross:=gross+amount;ELSE deductions:=deductions+amount;END IF;END IF;
  v:=v||jsonb_build_object('earnings',gross,'deductions',deductions);
  lines:=lines||jsonb_build_array(jsonb_build_object('componentId',c.id,'code',c.code,'name',c.name,'kind',c.kind,'amount',amount,'referenceOnly',coalesce((c.payload->>'referenceOnly')::boolean,false),'accountId',coalesce(c.payload->>'accountId',settings->>'expenseAccountId'),'formula',coalesce(nullif(line->>'formula',''),c.payload->>'formula'),'condition',coalesce(nullif(line->>'condition',''),c.payload->>'condition')));
 END LOOP;
 IF deductions>gross OR gross>1000000000 THEN RAISE EXCEPTION 'المستقطعات تتجاوز المستحقات أو إجمالي الراتب أكبر من المسموح';END IF;
 RETURN jsonb_build_object('basic',basic,'lines',lines,'gross',gross,'deductions',deductions,'net',gross-deductions,'metrics',metrics,'attendanceUsed',attendance_used);
END $$;
CREATE FUNCTION erp_payroll_private.metrics(p_cafe uuid,p_employee uuid,p_from date,p_to date,p_required boolean) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 IF to_regprocedure('erp_attendance_private.payroll_metrics(uuid,uuid,date,date)') IS NOT NULL THEN EXECUTE 'SELECT erp_attendance_private.payroll_metrics($1,$2,$3,$4)' INTO result USING p_cafe,p_employee,p_from,p_to;END IF;
 IF p_required AND NOT coalesce((result->>'complete')::boolean,false) THEN RAISE EXCEPTION 'اعتمد أيام الحضور لجميع أيام الفترة قبل حساب الراتب';END IF;
 RETURN coalesce(result,'{"complete":false}')||jsonb_build_object('period_days',p_to-p_from+1);
END $$;
CREATE FUNCTION erp_payroll_private.record(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$ SELECT jsonb_build_object('id',id,'revision',revision,'name',name,'code',code,'status',status,'employeeId',employee_id,'payload',payload||jsonb_build_object('calculation',calculation,'runId',run_id,'contractId',contract_id,'documentId',document_id,'paymentId',payment_id),'total',amount,'paid',paid,'createdAt',created_at) FROM public.erp_payroll_records WHERE id=p_id $$;
CREATE FUNCTION erp_payroll_private.leave_settlements(p_cafe uuid,p_employee uuid,p jsonb,p_slip uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE item jsonb;settlement public.erp_att_settlements;seen uuid[]:='{}';total numeric:=0;rate numeric;rows jsonb:='[]';amount numeric;BEGIN
 IF coalesce(jsonb_typeof(p),'array')<>'array' OR jsonb_array_length(coalesce(p,'[]'))>30 THEN RAISE EXCEPTION 'راجع تسويات الإجازة';END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(coalesce(p,'[]')) LOOP
  SELECT * INTO settlement FROM public.erp_att_settlements WHERE cafe_id=p_cafe AND employee_id=p_employee AND id=(item->>'id')::uuid FOR UPDATE;
  IF NOT FOUND OR settlement.status<>'approved' OR settlement.id=ANY(seen) THEN RAISE EXCEPTION 'تسوية الإجازة غير متاحة أو مكررة';END IF;
  seen:=array_append(seen,settlement.id);rate:=(item->>'dailyRate')::numeric;
  IF rate IS NULL OR rate<=0 OR rate>1000000000 OR rate='NaN'::numeric THEN RAISE EXCEPTION 'حدد قيمة يوم الإجازة بعملة القسيمة';END IF;
  amount:=round(settlement.days*rate,2);total:=total+amount;
  IF total>1000000000 THEN RAISE EXCEPTION 'إجمالي تسويات الإجازة يتجاوز الحد المسموح';END IF;
  IF p_slip IS NOT NULL THEN PERFORM erp_attendance_private.consume_settlement(p_cafe,p_employee,settlement.id,p_slip);END IF;
  rows:=rows||jsonb_build_array(jsonb_build_object('id',settlement.id,'days',settlement.days,'dailyRate',rate,'amount',amount));
 END LOOP;
 RETURN jsonb_build_object('total',total,'rows',rows);
END $$;
CREATE FUNCTION public.erp_payroll_read(p_cafe_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text;answer jsonb;k text;BEGIN role_name:=erp_payroll_private.authorize(p_cafe_id);PERFORM erp_payroll_private.access(p_cafe_id,'read');
 answer:=jsonb_build_object('canWrite',role_name<>'auditor','canApprove',role_name IN('owner','manager'),'canSettings',role_name IN('owner','manager'),'components',coalesce((SELECT jsonb_agg(payload||jsonb_build_object('id',id,'revision',revision) ORDER BY name) FROM public.erp_salary_components WHERE cafe_id=p_cafe_id),'[]'),'structures',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'revision',revision,'name',name,'status',CASE WHEN active THEN 'active' ELSE 'closed' END,'payload',payload,'createdAt','') ORDER BY name) FROM public.erp_salary_structures WHERE cafe_id=p_cafe_id),'[]'),'settings',(SELECT payload||jsonb_build_object('revision',revision) FROM public.erp_payroll_settings WHERE cafe_id=p_cafe_id),
 'employees',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',first_name||' '||last_name,'code',code,'userId',user_id,'branchId',branch_id,'departmentId',department_id,'designationId',designation_id) ORDER BY first_name) FROM public.erp_hr_employees WHERE cafe_id=p_cafe_id AND active),'[]'),
 'accounts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'kind',kind) ORDER BY code) FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND active AND NOT frozen AND NOT is_group),'[]'),
 'branches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.branches WHERE cafe_id=p_cafe_id AND active AND deleted_at IS NULL),'[]'),
 'organization',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'kind',kind)) FROM public.erp_org_units WHERE cafe_id=p_cafe_id AND active),'[]'),
 'emailTemplates',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.erp_document_templates WHERE cafe_id=p_cafe_id AND channel='email' AND layout@>'{"active":true}'),'[]'),
 'leaveSettlements',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'employeeId',x.employee_id,'name',t.name,'days',x.days,'effectiveOn',x.effective_on) ORDER BY x.effective_on) FROM public.erp_att_settlements x JOIN public.erp_att_leave_types t ON t.cafe_id=x.cafe_id AND t.id=x.leave_type_id WHERE x.cafe_id=p_cafe_id AND x.status='approved'),'[]'),
 'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'recordId',record_id,'action',action,'at',created_at,'detail',detail) ORDER BY id DESC) FROM(SELECT * FROM public.erp_payroll_events WHERE cafe_id=p_cafe_id ORDER BY id DESC LIMIT 300)x),'[]'),
 'loanInstallments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'loanId',loan_id,'due',due_on,'amount',amount,'repaid',repaid) ORDER BY due_on) FROM public.erp_payroll_loan_installments WHERE cafe_id=p_cafe_id),'[]'));
 FOREACH k IN ARRAY ARRAY['contract','run','payslip','loan'] LOOP answer:=answer||jsonb_build_object(k||'s',coalesce((SELECT jsonb_agg(erp_payroll_private.record(id) ORDER BY created_at DESC) FROM public.erp_payroll_records WHERE cafe_id=p_cafe_id AND kind=k),'[]'));END LOOP;
 answer:=answer||jsonb_build_object('loanPayments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'loanId',x.loan_id,'documentId',x.document_id,'amount',x.amount,'reversed',x.reversed,'payslipId',x.payslip_id) ORDER BY x.id) FROM(SELECT min(p.id::text)::uuid id,li.loan_id,p.document_id,sum(p.amount) amount,p.reversed,p.payslip_id FROM public.erp_payroll_loan_payments p JOIN public.erp_payroll_loan_installments li ON li.id=p.installment_id WHERE p.cafe_id=p_cafe_id GROUP BY li.loan_id,p.document_id,p.reversed,p.payslip_id)x),'[]'));
 IF to_regprocedure('erp_access_private.mask_snapshot(uuid,text,jsonb)') IS NOT NULL THEN answer:=erp_access_private.mask_snapshot(p_cafe_id,'payroll',answer);END IF;RETURN answer;
END $$;
CREATE FUNCTION erp_payroll_private.validate_custom_values(fields jsonb,vals jsonb,p_cafe uuid DEFAULT NULL,p_record uuid DEFAULT NULL,p_kind text DEFAULT NULL,depth integer DEFAULT 0,p_draft boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE f jsonb;v jsonb;t text;x jsonb;txt text;tbl text;col text;valid boolean;metric numeric;BEGIN
 IF coalesce(jsonb_typeof(vals),'')<>'object' OR octet_length(vals::text)>262144 OR depth>2 THEN RAISE EXCEPTION 'بيانات الحقول الإضافية غير صالحة';END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(coalesce(fields,'[]')) LOOP
  t:=f->>'type';IF t IN('static','separator') THEN CONTINUE;END IF;
  v:=coalesce(vals->(f->>'id'),f->'defaultValue');
  IF coalesce((f->>'required')::boolean,false) AND NOT p_draft AND (v IS NULL OR v='null'::jsonb OR v='""'::jsonb OR v='[]'::jsonb OR (t='checkbox' AND v<>'true')) THEN RAISE EXCEPTION 'أكمل الحقل المطلوب: %',f->>'label';END IF;
  IF v IS NULL OR v='null'::jsonb OR v='""'::jsonb THEN CONTINUE;END IF;
  IF t='subform' THEN
   IF jsonb_typeof(v)<>'array' OR jsonb_array_length(v)>100 OR jsonb_array_length(v)<coalesce((f->>'minimumRows')::integer,0) THEN RAISE EXCEPTION 'عدد صفوف النموذج غير صالح';END IF;
   FOR x IN SELECT value FROM jsonb_array_elements(v) LOOP PERFORM erp_payroll_private.validate_custom_values(f->'fields',x,p_cafe,p_record,p_kind,depth+1,p_draft);END LOOP;CONTINUE;
  END IF;
  IF t='location' THEN
   IF jsonb_typeof(v)<>'object' OR jsonb_typeof(v->'latitude')<>'number' OR jsonb_typeof(v->'longitude')<>'number' OR abs((v->>'latitude')::numeric)>90 OR abs((v->>'longitude')::numeric)>180 THEN RAISE EXCEPTION 'إحداثيات الموقع غير صالحة';END IF;CONTINUE;
  END IF;
  IF (t IN('number','currency') AND jsonb_typeof(v)<>'number') OR (t='checkbox' AND jsonb_typeof(v)<>'boolean') OR (t IN('multiselect','multidynamic') AND jsonb_typeof(v)<>'array') OR (t NOT IN('number','currency','checkbox','multiselect','multidynamic') AND jsonb_typeof(v)<>'string') THEN RAISE EXCEPTION 'نوع قيمة الحقل غير صالح';END IF;
  txt:=v#>>'{}';
  IF length(txt)>20000 THEN RAISE EXCEPTION 'قيمة الحقل طويلة';END IF;
  IF (t='select' AND NOT(f->'options' @> jsonb_build_array(v))) OR (t='multiselect' AND NOT(f->'options' @> v)) THEN RAISE EXCEPTION 'اختيارات الحقل غير صالحة';END IF;
  IF t='email' AND txt!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'البريد الإلكتروني غير صالح';END IF;
  IF t='url' AND txt!~'^https?://[^[:space:]]+$' THEN RAISE EXCEPTION 'الرابط غير صالح';END IF;
  IF t='time' AND txt!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'الوقت غير صالح';END IF;
  IF t='date' THEN IF txt!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'التاريخ غير صالح';END IF;PERFORM txt::date;END IF;
  IF t IN('number','currency','text','textarea','formatted') THEN
   metric:=CASE WHEN t IN('number','currency') THEN txt::numeric ELSE length(txt) END;
   IF metric<nullif(f->>'minimum','')::numeric OR metric>nullif(f->>'maximum','')::numeric THEN RAISE EXCEPTION 'قيمة الحقل خارج الحدود: %',f->>'label';END IF;
  END IF;
  IF t IN('dynamic','multidynamic') THEN
   tbl:=CASE f->>'entity' WHEN 'items' THEN 'bf_items' WHEN 'customers' THEN 'bf_parties' WHEN 'employees' THEN 'erp_hr_employees' WHEN 'warehouses' THEN 'bf_warehouses' WHEN 'accounts' THEN 'bf_accounts' WHEN 'bom' THEN 'erp_mfg_boms' WHEN 'routings' THEN 'erp_mfg_routings' WHEN 'workstations' THEN 'erp_mfg_workstations' WHEN 'orders' THEN 'erp_mfg_orders' WHEN 'sources' THEN 'bf_documents' END;
   IF tbl IS NULL OR p_cafe IS NULL THEN RAISE EXCEPTION 'الكيان المرتبط غير صالح';END IF;col:=CASE WHEN tbl='bf_staff' THEN 'user_id' ELSE 'id' END;
   FOR x IN SELECT value FROM jsonb_array_elements(CASE WHEN t='dynamic' THEN jsonb_build_array(v) ELSE v END) LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE cafe_id=$1 AND %I=$2)',tbl,col) INTO valid USING p_cafe,(x#>>'{}')::uuid;
    IF NOT valid THEN RAISE EXCEPTION 'القيمة المرتبطة غير موجودة في العلامة';END IF;
   END LOOP;
  END IF;
  IF t IN('file','image') THEN
   IF p_record IS NULL OR to_regclass('public.erp_files') IS NULL THEN RAISE EXCEPTION 'احفظ السجل وأضف المرفق أولًا';END IF;
   EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.erp_files WHERE cafe_id=$1 AND record_id=$2 AND id=$3 AND entity_type=$4 AND uploaded AND ($5<>''image'' OR mime IN(''image/jpeg'',''image/png'')))' INTO valid USING p_cafe,p_record,txt::uuid,'payroll_record',t;
   IF NOT valid THEN RAISE EXCEPTION 'المرفق غير موجود في هذا السجل';END IF;
   PERFORM 1 FROM public.erp_files f WHERE f.cafe_id=p_cafe AND f.record_id=p_record AND f.id=txt::uuid AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='erp-record-files' AND o.name=f.path) FOR KEY SHARE OF f;
   IF NOT FOUND THEN RAISE EXCEPTION 'الملف المرفق لم يعد متاحًا';END IF;
  END IF;
  IF coalesce((f->>'unique')::boolean,false) AND depth=0 AND p_kind='contract' THEN
   tbl:='erp_payroll_records';
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE cafe_id=$1 AND id IS DISTINCT FROM $2 AND payload->''customValues''->$3=$4)',tbl) INTO valid USING p_cafe,p_record,f->>'id',v;
   IF valid THEN RAISE EXCEPTION 'قيمة الحقل مستخدمة مسبقًا: %',f->>'label';END IF;
  END IF;
 END LOOP;
END $$;
CREATE FUNCTION erp_payroll_private.validate(p_cafe uuid,p_kind text,p jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE employee uuid:=(p->>'employeeId')::uuid;d date;BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>200000 THEN RAISE EXCEPTION 'بيانات المرتبات أكبر من المسموح';END IF;
 IF p_kind IN('contract','payslip','loan') AND NOT EXISTS(SELECT 1 FROM public.erp_hr_employees WHERE cafe_id=p_cafe AND id=employee AND active) THEN RAISE EXCEPTION 'اختر موظفًا نشطًا من هذه العلامة';END IF;
 IF p_kind IN('contract','payslip','loan') AND (coalesce(p->>'currency','')!~'^[A-Z]{3}$' OR coalesce((p->>'exchangeRate')::numeric,0)<=0 OR (p->>'exchangeRate')::numeric>1000000 OR (p->>'exchangeRate')::numeric='NaN'::numeric OR (p->>'currency'='SAR' AND (p->>'exchangeRate')::numeric<>1)) THEN RAISE EXCEPTION 'راجع عملة الراتب وسعر صرفها إلى الريال';END IF;
 IF p_kind IN('run','payslip') AND ((p->>'from')::date IS NULL OR (p->>'to')::date IS NULL OR (p->>'to')::date<(p->>'from')::date OR (p->>'to')::date-(p->>'from')::date>366 OR NOT isfinite((p->>'from')::date) OR NOT isfinite((p->>'to')::date)) THEN RAISE EXCEPTION 'فترة المرتبات غير صالحة أو تتجاوز سنة';END IF;
 IF p_kind IN('contract','structure') AND coalesce(p->>'frequency','') NOT IN('weekly','biweekly','monthly','quarterly','semiannual','annual') THEN RAISE EXCEPTION 'اختر دورة قبض صالحة';END IF;
 IF p_kind='contract' THEN
  PERFORM erp_payroll_private.validate_custom_values(coalesce((SELECT payload->'contractFields' FROM public.erp_payroll_settings WHERE cafe_id=p_cafe),'[]'),coalesce(p->'customValues','{}'),p_cafe,(p->>'id')::uuid,'contract',0,true);
  IF length(btrim(coalesce(p->>'code',''))) NOT BETWEEN 1 AND 60 OR (p->>'startDate')::date IS NULL OR (p->>'endDate')::date IS NULL OR (p->>'endDate')::date<(p->>'startDate')::date OR NOT isfinite((p->>'endDate')::date) OR (p->>'probationEnd')::date<(p->>'joinDate')::date THEN RAISE EXCEPTION 'راجع كود العقد وتواريخه';END IF;
  IF p->>'parentId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_payroll_records WHERE cafe_id=p_cafe AND kind='contract' AND employee_id=employee AND id=(p->>'parentId')::uuid AND id IS DISTINCT FROM (p->>'id')::uuid) THEN RAISE EXCEPTION 'العقد الأساسي غير متاح لهذا الموظف';END IF;
  IF p->>'designationId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_org_units WHERE cafe_id=p_cafe AND id=(p->>'designationId')::uuid AND kind='designation' AND active) THEN RAISE EXCEPTION 'المسمى الوظيفي غير متاح';END IF;
  IF p->>'levelId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_org_units WHERE cafe_id=p_cafe AND id=(p->>'levelId')::uuid AND kind='level' AND active) THEN RAISE EXCEPTION 'المستوى الوظيفي غير متاح';END IF;
 END IF;
 IF p_kind='loan' AND (coalesce((p->>'amount')::numeric,0)<=0 OR (p->>'amount')::numeric>1000000000 OR (p->>'amount')::numeric='NaN'::numeric OR coalesce((p->>'installmentAmount')::numeric,0)<=0 OR (p->>'installmentAmount')::numeric>(p->>'amount')::numeric OR (p->>'installmentAmount')::numeric='NaN'::numeric OR coalesce(p->>'frequency','') NOT IN('weekly','monthly','quarterly','annual') OR (p->>'startsOn')::date IS NULL OR NOT isfinite((p->>'startsOn')::date)) THEN RAISE EXCEPTION 'راجع مبلغ السلفة ومواعيد أقساطها';END IF;
 IF p_kind IN('run','payslip','loan') THEN d:=CASE WHEN p_kind='loan' THEN(p->>'applicationDate')::date ELSE(p->>'postingDate')::date END;PERFORM erp_asset_private.date_open(p_cafe,d);END IF;
END $$;
CREATE FUNCTION erp_payroll_private.save_record(p_cafe uuid,p_kind text,p jsonb,p_run uuid DEFAULT NULL,p_contract uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE old public.erp_payroll_records;rid uuid:=coalesce((p->>'id')::uuid,gen_random_uuid());calc jsonb:='{}';metrics jsonb;name text;code text;df date;dt date;posting date;total numeric:=0;employee uuid:=(p->>'employeeId')::uuid;BEGIN
 PERFORM erp_payroll_private.validate(p_cafe,p_kind,p);
 IF p->>'id' IS NOT NULL THEN SELECT * INTO old FROM public.erp_payroll_records WHERE cafe_id=p_cafe AND id=rid AND kind=p_kind FOR UPDATE;IF NOT FOUND OR old.revision<>(p->>'revision')::integer THEN RAISE EXCEPTION 'تغير السجل أعد تحميله' USING ERRCODE='40001';END IF;IF old.status NOT IN('draft','rejected') THEN RAISE EXCEPTION 'ألغ الاعتماد قبل تعديل السجل';END IF;END IF;
 IF p_kind='contract' THEN df:=(p->>'startDate')::date;dt:=(p->>'endDate')::date;posting:=coalesce((p->>'signDate')::date,current_date);code:=p->>'code';
 ELSE df:=(p->>'from')::date;dt:=(p->>'to')::date;posting:=(p->>'postingDate')::date;code:=coalesce(old.code,upper(left(p_kind,2))||'-'||left(rid::text,8));END IF;
 IF p_kind='loan' THEN df:=(p->>'startsOn')::date;dt:=df;posting:=(p->>'applicationDate')::date;total:=round((p->>'amount')::numeric,2);END IF;
 IF p_kind='run' THEN name:=btrim(p->>'name');IF length(name) NOT BETWEEN 1 AND 150 THEN RAISE EXCEPTION 'أدخل اسم مسير الرواتب';END IF;
 ELSE SELECT first_name||' '||last_name INTO name FROM public.erp_hr_employees WHERE cafe_id=p_cafe AND id=employee;END IF;
 IF p_kind IN('contract','payslip') THEN
  metrics:=CASE WHEN p_kind='payslip' THEN erp_payroll_private.metrics(p_cafe,employee,df,dt,coalesce((p->>'validateAttendance')::boolean,false)) ELSE '{}'::jsonb END;
  calc:=erp_payroll_private.calculate(p_cafe,p,metrics);total:=(calc->>'net')::numeric;
 END IF;
 IF p_kind='payslip' THEN calc:=calc||jsonb_build_object('leaveSettlement',erp_payroll_private.leave_settlements(p_cafe,employee,p->'leaveSettlements'));total:=total+coalesce((calc->'leaveSettlement'->>'total')::numeric,0);END IF;
 IF p_kind='payslip' AND EXISTS(SELECT 1 FROM public.erp_payroll_records WHERE cafe_id=p_cafe AND employee_id=employee AND kind='payslip' AND id<>rid AND status NOT IN('cancelled','rejected') AND date_from<=dt AND date_to>=df) THEN RAISE EXCEPTION 'توجد قسيمة لهذا الموظف تتداخل مع الفترة المختارة';END IF;
 INSERT INTO public.erp_payroll_records(id,cafe_id,kind,name,code,employee_id,run_id,contract_id,date_from,date_to,posting_date,currency,exchange_rate,payload,calculation,amount) VALUES(rid,p_cafe,p_kind,name,code,employee,p_run,p_contract,df,dt,posting,coalesce(p->>'currency','SAR'),coalesce((p->>'exchangeRate')::numeric,1),p,calc,total)
 ON CONFLICT(id) DO UPDATE SET name=excluded.name,code=excluded.code,employee_id=excluded.employee_id,date_from=excluded.date_from,date_to=excluded.date_to,posting_date=excluded.posting_date,currency=excluded.currency,exchange_rate=excluded.exchange_rate,payload=excluded.payload,calculation=excluded.calculation,amount=excluded.amount,status='draft',revision=erp_payroll_records.revision+1,updated_at=now();RETURN rid;
END $$;
CREATE FUNCTION erp_payroll_private.generate(p_cafe uuid,p_run uuid) RETURNS integer LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r public.erp_payroll_records;c public.erp_payroll_records;e public.erp_hr_employees;p jsonb;count integer:=0;settings jsonb;df date;dt date;ratio numeric;BEGIN
 SELECT * INTO r FROM public.erp_payroll_records WHERE cafe_id=p_cafe AND id=p_run AND kind='run' FOR UPDATE;
 IF NOT FOUND OR r.status<>'draft' OR EXISTS(SELECT 1 FROM public.erp_payroll_records WHERE cafe_id=p_cafe AND run_id=p_run) THEN RAISE EXCEPTION 'المسير غير متاح للتوليد أو يحتوي قسائم بالفعل';END IF;
 SELECT payload INTO settings FROM public.erp_payroll_settings WHERE cafe_id=p_cafe;
 FOR e IN SELECT * FROM public.erp_hr_employees WHERE cafe_id=p_cafe AND active ORDER BY id LOOP
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(r.payload->'excludedIds') x WHERE x.value=e.id::text) THEN CONTINUE;END IF;
  IF r.payload->>'selection'='employees' THEN IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(r.payload->'employeeIds')x WHERE x.value=e.id::text) THEN CONTINUE;END IF;
  ELSE
   IF jsonb_array_length(r.payload->'branchIds')>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(r.payload->'branchIds')x WHERE x.value=e.branch_id::text) THEN CONTINUE;END IF;
   IF jsonb_array_length(r.payload->'departmentIds')>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(r.payload->'departmentIds')x WHERE x.value=e.department_id::text) THEN CONTINUE;END IF;
   IF jsonb_array_length(r.payload->'designationIds')>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(r.payload->'designationIds')x WHERE x.value=e.designation_id::text) THEN CONTINUE;END IF;
  END IF;
  SELECT * INTO c FROM public.erp_payroll_records WHERE cafe_id=p_cafe AND employee_id=e.id AND kind='contract' AND status='active' AND date_from<=r.date_to AND date_to>=r.date_from ORDER BY date_from DESC LIMIT 1;
  IF NOT FOUND THEN IF r.payload->>'selection'='employees' THEN RAISE EXCEPTION 'الموظف % لا يملك عقدًا نشطًا للفترة',e.first_name;ELSE CONTINUE;END IF;END IF;
  IF jsonb_array_length(r.payload->'frequencies')>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(r.payload->'frequencies')x WHERE x.value=c.payload->>'frequency') THEN CONTINUE;END IF;
  IF (SELECT count(*) FROM public.erp_payroll_records WHERE cafe_id=p_cafe AND employee_id=e.id AND kind='contract' AND status='active' AND date_from<=r.date_to AND date_to>=r.date_from)>1 THEN RAISE EXCEPTION 'قسّم الفترة عند تغيير عقد الموظف %',e.first_name;END IF;
  df:=greatest(r.date_from,c.date_from,(e.payload->>'joinDate')::date);dt:=least(r.date_to,c.date_to,coalesce((e.payload->>'endDate')::date,r.date_to));IF dt<df THEN CONTINUE;END IF;
  ratio:=CASE WHEN coalesce((settings->>'prorate')::boolean,true) THEN (dt-df+1)::numeric/(r.date_to-r.date_from+1) ELSE 1 END;
  p:=jsonb_build_object('id',NULL,'revision',0,'employeeId',e.id,'postingDate',r.posting_date,'from',r.date_from,'to',r.date_to,'currency',c.currency,'exchangeRate',c.exchange_rate,'basic',round((c.payload->>'basic')::numeric*ratio,2),'lines',c.payload->'lines','note','','validateAttendance',coalesce((r.payload->>'validateAttendance')::boolean,false));
  PERFORM erp_payroll_private.save_record(p_cafe,'payslip',p,p_run,c.id);count:=count+1;IF count>500 THEN RAISE EXCEPTION 'قسّم المسير إلى مجموعات لا تتجاوز 500 موظف';END IF;
 END LOOP;
 IF count=0 THEN RAISE EXCEPTION 'لا توجد عقود موظفين مطابقة لهذه الفترة والمرشحات';END IF;
 UPDATE public.erp_payroll_records SET revision=revision+1 WHERE id=p_run;RETURN count;
END $$;
CREATE FUNCTION erp_payroll_private.approve(p_cafe uuid,p_id uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r public.erp_payroll_records;settings jsonb;calc jsonb;line jsonb;doc uuid;cash uuid;account uuid;metrics jsonb;base_net numeric:=0;n numeric;remaining numeric;portion numeric;commission numeric:=0;loan_deduction numeric:=0;leave_total numeric:=0;leave_result jsonb;loanrow record;comm record;row record;due date;i integer:=0;BEGIN
 SELECT * INTO r FROM public.erp_payroll_records WHERE cafe_id=p_cafe AND id=p_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'draft' THEN RAISE EXCEPTION 'اعتمد سجلًا في حالة مسودة';END IF;
 IF r.kind='contract' THEN
  PERFORM erp_payroll_private.validate_custom_values(coalesce((SELECT payload->'contractFields' FROM public.erp_payroll_settings WHERE cafe_id=p_cafe),'[]'),coalesce(r.payload->'customValues','{}'),p_cafe,r.id,'contract');
  IF EXISTS(SELECT 1 FROM public.erp_payroll_records WHERE cafe_id=p_cafe AND kind='contract' AND employee_id=r.employee_id AND status='active' AND id<>r.id AND date_from<=r.date_to AND date_to>=r.date_from) THEN RAISE EXCEPTION 'يتداخل العقد مع عقد نشط للموظف';END IF;
  UPDATE public.erp_payroll_records SET status='active',revision=revision+1 WHERE id=r.id;RETURN;
 ELSIF r.kind='run' THEN
  IF NOT EXISTS(SELECT 1 FROM public.erp_payroll_records WHERE run_id=r.id) THEN RAISE EXCEPTION 'ولّد قسائم المسير أولًا';END IF;
  FOR row IN SELECT id,status FROM public.erp_payroll_records WHERE cafe_id=p_cafe AND run_id=r.id ORDER BY id LOOP IF row.status='draft' THEN PERFORM erp_payroll_private.approve(p_cafe,row.id);ELSIF row.status NOT IN('approved','paid') THEN RAISE EXCEPTION 'راجع القسائم المرفوضة أو الملغاة قبل اعتماد المسير';END IF;END LOOP;
  UPDATE public.erp_payroll_records SET status='approved',amount=(SELECT coalesce(sum((calculation->>'baseNet')::numeric),0) FROM public.erp_payroll_records WHERE run_id=r.id),revision=revision+1 WHERE id=r.id;RETURN;
 END IF;
 SELECT payload INTO settings FROM public.erp_payroll_settings WHERE cafe_id=p_cafe;IF settings IS NULL THEN RAISE EXCEPTION 'احفظ حسابات إعدادات المرتبات أولًا';END IF;
 PERFORM erp_asset_private.account(p_cafe,(settings->>'expenseAccountId')::uuid,ARRAY['expense']);PERFORM erp_asset_private.account(p_cafe,(settings->>'payableAccountId')::uuid,ARRAY['other_liability','payable']);PERFORM erp_asset_private.account(p_cafe,(settings->>'receivableAccountId')::uuid,ARRAY['other_asset','receivable']);
 IF r.kind='loan' THEN
  cash:=(r.payload->>'cashAccountId')::uuid;PERFORM erp_asset_private.account(p_cafe,cash,ARRAY['cash','bank']);n:=round(r.amount*r.exchange_rate,2);
  IF coalesce((SELECT sum(debit-credit) FROM public.bf_journal WHERE cafe_id=p_cafe AND account_id=cash),0)<n THEN RAISE EXCEPTION 'رصيد الخزينة غير كاف لصرف السلفة';END IF;
  doc:=erp_asset_private.document(p_cafe,r.posting_date,n,'صرف سلفة موظف #'||r.code,auth.uid());PERFORM erp_asset_private.line(p_cafe,doc,(settings->>'receivableAccountId')::uuid,n,0);PERFORM erp_asset_private.line(p_cafe,doc,cash,0,n);
  remaining:=r.amount;WHILE remaining>0 LOOP
   due:=CASE r.payload->>'frequency' WHEN 'weekly' THEN r.date_from+i*7 ELSE(r.date_from+make_interval(months=>i*CASE r.payload->>'frequency' WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 3 ELSE 12 END))::date END;
   portion:=least(remaining,round((r.payload->>'installmentAmount')::numeric,2));IF portion<=0 THEN RAISE EXCEPTION 'القسط أقل من أصغر وحدة للعملة';END IF;
   INSERT INTO public.erp_payroll_loan_installments(cafe_id,loan_id,due_on,amount) VALUES(p_cafe,r.id,due,portion);remaining:=remaining-portion;i:=i+1;IF i>600 THEN RAISE EXCEPTION 'عدد أقساط السلفة يتجاوز 600 قسط';END IF;
  END LOOP;
  UPDATE public.erp_payroll_records SET status='active',document_id=doc,calculation=jsonb_build_object('settings',settings,'baseAmount',n),date_to=due,revision=revision+1 WHERE id=r.id;RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM public.erp_payroll_records WHERE cafe_id=p_cafe AND kind='payslip' AND employee_id=r.employee_id AND id<>r.id AND status IN('approved','paid') AND date_from<=r.date_to AND date_to>=r.date_from) THEN RAISE EXCEPTION 'توجد قسيمة معتمدة متداخلة لهذا الموظف';END IF;
 metrics:=erp_payroll_private.metrics(p_cafe,r.employee_id,r.date_from,r.date_to,coalesce((r.payload->>'validateAttendance')::boolean,false));calc:=erp_payroll_private.calculate(p_cafe,r.payload,metrics);
 doc:=erp_asset_private.document(p_cafe,r.posting_date,round((calc->>'gross')::numeric*r.exchange_rate,2),'استحقاق راتب #'||r.code,auth.uid());
 n:=round((calc->>'basic')::numeric*r.exchange_rate,2);base_net:=n;PERFORM erp_asset_private.line(p_cafe,doc,(settings->>'expenseAccountId')::uuid,n,0);
 FOR line IN SELECT * FROM jsonb_array_elements(calc->'lines') LOOP
  IF (line->>'referenceOnly')::boolean THEN CONTINUE;END IF;account:=(line->>'accountId')::uuid;n:=round((line->>'amount')::numeric*r.exchange_rate,2);
  PERFORM erp_asset_private.account(p_cafe,account,CASE WHEN line->>'kind'='earning' THEN ARRAY['expense'] ELSE ARRAY['expense','other_liability','payable','other_asset','receivable'] END);
  IF line->>'kind'='earning' THEN base_net:=base_net+n;PERFORM erp_asset_private.line(p_cafe,doc,account,n,0);ELSE base_net:=base_net-n;PERFORM erp_asset_private.line(p_cafe,doc,account,0,n);END IF;
 END LOOP;
 leave_result:=erp_payroll_private.leave_settlements(p_cafe,r.employee_id,r.payload->'leaveSettlements',r.id);leave_total:=round((leave_result->>'total')::numeric*r.exchange_rate,2);base_net:=base_net+leave_total;PERFORM erp_asset_private.line(p_cafe,doc,(settings->>'expenseAccountId')::uuid,leave_total,0);
 IF coalesce((settings->>'includeCommissions')::boolean,false) THEN
  PERFORM erp_asset_private.account(p_cafe,(settings->>'commissionAccountId')::uuid,ARRAY['expense']);
  FOR comm IN SELECT cr.id,cr.total FROM public.erp_commission_rows cr JOIN public.erp_commission_periods cp ON cp.id=cr.period_id JOIN public.erp_hr_employees e ON e.user_id=cr.employee_id AND e.cafe_id=cr.cafe_id WHERE cr.cafe_id=p_cafe AND e.id=r.employee_id AND cp.status='approved' AND cp.date_from>=r.date_from AND cp.date_to<=r.date_to AND NOT EXISTS(SELECT 1 FROM public.erp_payroll_commission_claims WHERE commission_row_id=cr.id) ORDER BY cr.id FOR UPDATE OF cp,cr LOOP
   INSERT INTO public.erp_payroll_commission_claims(cafe_id,payslip_id,commission_row_id,amount) VALUES(p_cafe,r.id,comm.id,comm.total);commission:=commission+comm.total;
  END LOOP;
  base_net:=base_net+commission;PERFORM erp_asset_private.line(p_cafe,doc,(settings->>'commissionAccountId')::uuid,commission,0);
 END IF;
 FOR loanrow IN SELECT li.id,li.loan_id,li.amount-li.repaid remaining,l.exchange_rate,l.calculation,l.currency FROM public.erp_payroll_loan_installments li JOIN public.erp_payroll_records l ON l.id=li.loan_id WHERE li.cafe_id=p_cafe AND l.employee_id=r.employee_id AND l.kind='loan' AND l.status='active' AND coalesce((l.payload->>'repayFromPayslip')::boolean,false) AND li.due_on<=r.date_to AND li.amount>li.repaid ORDER BY li.due_on,li.id FOR UPDATE OF li,l LOOP
  n:=round(loanrow.remaining*loanrow.exchange_rate,2);loan_deduction:=loan_deduction+n;base_net:=base_net-n;
  account:=(loanrow.calculation->'settings'->>'receivableAccountId')::uuid;PERFORM erp_asset_private.account(p_cafe,account,ARRAY['other_asset','receivable']);PERFORM erp_asset_private.line(p_cafe,doc,account,0,n);
  UPDATE public.erp_payroll_loan_installments SET repaid=amount WHERE id=loanrow.id;
  INSERT INTO public.erp_payroll_loan_payments(cafe_id,installment_id,payslip_id,document_id,amount) VALUES(p_cafe,loanrow.id,r.id,doc,loanrow.remaining);
  UPDATE public.erp_payroll_records SET paid=paid+loanrow.remaining,status=CASE WHEN paid+loanrow.remaining=amount THEN 'closed' ELSE 'active' END,revision=revision+1 WHERE id=loanrow.loan_id;
 END LOOP;
 IF base_net<0 THEN RAISE EXCEPTION 'الأقساط والمستقطعات تتجاوز صافي الراتب راجع مواعيد الاستحقاق';END IF;
 PERFORM erp_asset_private.line(p_cafe,doc,(settings->>'payableAccountId')::uuid,0,base_net);
 calc:=calc||jsonb_build_object('baseNet',base_net,'commission',commission,'loanDeduction',loan_deduction,'leaveSettlement',leave_result,'leaveSettlementBase',leave_total,'settings',settings,'metrics',metrics,'net',round(base_net/r.exchange_rate,2));
 UPDATE public.erp_payroll_records SET status='approved',document_id=doc,calculation=calc,amount=round(base_net/r.exchange_rate,2),revision=revision+1,updated_at=now() WHERE id=r.id;
END $$;
CREATE FUNCTION erp_payroll_private.reverse(p_cafe uuid,p_document uuid,p_date date,p_note text) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE doc uuid;line record;n numeric;BEGIN SELECT total INTO n FROM public.bf_documents WHERE cafe_id=p_cafe AND id=p_document;IF NOT FOUND THEN RAISE EXCEPTION 'القيد الأصلي غير متاح';END IF;doc:=erp_asset_private.document(p_cafe,p_date,n,p_note,auth.uid());FOR line IN SELECT * FROM public.bf_journal WHERE cafe_id=p_cafe AND document_id=p_document LOOP PERFORM erp_asset_private.line(p_cafe,doc,line.account_id,line.credit,line.debit);END LOOP;RETURN doc;END $$;
CREATE FUNCTION erp_payroll_private.commission_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN IF EXISTS(SELECT 1 FROM public.erp_payroll_commission_claims c JOIN public.erp_commission_rows r ON r.id=c.commission_row_id WHERE r.period_id=OLD.id) AND(TG_OP='DELETE' OR NEW.status IS DISTINCT FROM OLD.status) THEN RAISE EXCEPTION 'الفترة مرتبطة بقسيمة راتب ألغ اعتماد القسيمة أولًا';END IF;IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END $$;
CREATE TRIGGER erp_payroll_commission_guard BEFORE UPDATE OR DELETE ON public.erp_commission_periods FOR EACH ROW EXECUTE FUNCTION erp_payroll_private.commission_guard();
CREATE FUNCTION erp_payroll_private.renew(p_cafe uuid,p_id uuid) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r public.erp_payroll_records;rid uuid;months integer;next_end date;p jsonb;BEGIN
 SELECT * INTO r FROM public.erp_payroll_records WHERE cafe_id=p_cafe AND id=p_id AND kind='contract' AND status IN('active','closed') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'العقد غير متاح للتجديد';END IF;
 IF EXISTS(SELECT 1 FROM public.erp_payroll_records WHERE cafe_id=p_cafe AND kind='contract' AND payload->>'parentId'=r.id::text AND status<>'cancelled') THEN RAISE EXCEPTION 'سبق تجديد هذا العقد';END IF;
 months:=(extract(year FROM r.date_to+1)-extract(year FROM r.date_from))::integer*12+(extract(month FROM r.date_to+1)-extract(month FROM r.date_from))::integer;
 next_end:=CASE WHEN months>0 AND(r.date_from+make_interval(months=>months))::date=r.date_to+1 THEN(r.date_to+1+make_interval(months=>months))::date-1 ELSE r.date_to+(r.date_to-r.date_from+1) END;
 p:=r.payload||jsonb_build_object('id',NULL,'revision',0,'code',left(r.code,42)||'-'||left(gen_random_uuid()::text,8),'parentId',r.id,'startDate',r.date_to+1,'endDate',next_end,'signDate',current_date);
 rid:=erp_payroll_private.save_record(p_cafe,'contract',p);PERFORM erp_payroll_private.approve(p_cafe,rid);RETURN rid;
END $$;
CREATE FUNCTION erp_payroll_private.pay(p_cafe uuid,p_id uuid,p_cash uuid,p_date date) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r public.erp_payroll_records;row record;n numeric;doc uuid;BEGIN
 SELECT * INTO r FROM public.erp_payroll_records WHERE cafe_id=p_cafe AND id=p_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'approved' OR r.kind NOT IN('run','payslip') THEN RAISE EXCEPTION 'الصرف متاح لقسيمة أو مسير معتمد فقط';END IF;
 IF r.kind='run' THEN FOR row IN SELECT id,status FROM public.erp_payroll_records WHERE cafe_id=p_cafe AND run_id=r.id ORDER BY id LOOP IF row.status='approved' THEN PERFORM erp_payroll_private.pay(p_cafe,row.id,p_cash,p_date);ELSIF row.status<>'paid' THEN RAISE EXCEPTION 'المسير يحتوي قسائم غير معتمدة';END IF;END LOOP;UPDATE public.erp_payroll_records SET paid=amount,status='paid',revision=revision+1 WHERE id=r.id;RETURN;END IF;
 PERFORM erp_asset_private.account(p_cafe,p_cash,ARRAY['cash','bank']);PERFORM erp_asset_private.date_open(p_cafe,p_date);n:=(r.calculation->>'baseNet')::numeric;
 IF n>0 THEN
  IF coalesce((SELECT sum(debit-credit) FROM public.bf_journal WHERE cafe_id=p_cafe AND account_id=p_cash),0)<n THEN RAISE EXCEPTION 'رصيد الخزينة غير كاف لصرف الراتب';END IF;
  PERFORM erp_asset_private.account(p_cafe,(r.calculation->'settings'->>'payableAccountId')::uuid,ARRAY['other_liability','payable']);
  doc:=erp_asset_private.document(p_cafe,p_date,n,'صرف راتب #'||r.code,auth.uid());PERFORM erp_asset_private.line(p_cafe,doc,(r.calculation->'settings'->>'payableAccountId')::uuid,n,0);PERFORM erp_asset_private.line(p_cafe,doc,p_cash,0,n);
 END IF;
 UPDATE public.erp_payroll_records SET paid=amount,status='paid',payment_id=doc,revision=revision+1 WHERE id=r.id;
END $$;
CREATE FUNCTION erp_payroll_private.configure_email(p_cafe uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE settings public.erp_payroll_settings;rule_id uuid;template_id uuid;enabled boolean;body jsonb;BEGIN
 SELECT * INTO settings FROM public.erp_payroll_settings WHERE cafe_id=p_cafe FOR UPDATE;enabled:=coalesce((settings.payload->>'sendApprovedEmail')::boolean,false);template_id:=(settings.payload->>'emailTemplateId')::uuid;
 IF enabled AND NOT EXISTS(SELECT 1 FROM public.erp_document_templates WHERE cafe_id=p_cafe AND id=template_id AND channel='email' AND layout@>'{"active":true}') THEN RAISE EXCEPTION 'اختر قالب بريد نشطًا لقسائم الرواتب';END IF;
 IF template_id IS NULL THEN IF settings.email_rule_id IS NOT NULL THEN UPDATE public.erp_template_rules SET active=false,payload=jsonb_set(payload,'{active}','false'),revision=revision+1 WHERE cafe_id=p_cafe AND id=settings.email_rule_id;END IF;RETURN;END IF;
 rule_id:=coalesce(settings.email_rule_id,gen_random_uuid());
 body:=jsonb_build_object('id',rule_id,'revision',0,'name','مشاركة قسائم الرواتب المعتمدة','entity','payroll','payment','any','status','','anchor','created','timing','immediate','offset',0,'unit','days','channel','email','recipient','employee','template_id',template_id,'active',enabled,'expires_after',0,'expires_unit','days');
 INSERT INTO public.erp_template_rules(cafe_id,id,name,template_id,active,payload) VALUES(p_cafe,rule_id,body->>'name',template_id,enabled,body) ON CONFLICT(cafe_id,id) DO UPDATE SET template_id=excluded.template_id,active=excluded.active,payload=excluded.payload,revision=erp_template_rules.revision+1;
 UPDATE public.erp_payroll_settings SET email_rule_id=rule_id WHERE cafe_id=p_cafe;
END $$;
CREATE FUNCTION erp_payroll_private.cancel(p_cafe uuid,p_id uuid,p_date date) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r public.erp_payroll_records;row record;doc uuid;BEGIN
 SELECT * INTO r FROM public.erp_payroll_records WHERE cafe_id=p_cafe AND id=p_id FOR UPDATE;
 IF r.status='paid' OR(r.kind='loan' AND r.paid>0) THEN RAISE EXCEPTION 'اعكس الصرف أو التحصيل قبل إلغاء الاعتماد';END IF;
 IF r.status='cancelled' THEN RAISE EXCEPTION 'السجل ملغى بالفعل';END IF;
 IF r.kind='run' THEN FOR row IN SELECT id FROM public.erp_payroll_records WHERE cafe_id=p_cafe AND run_id=r.id ORDER BY id LOOP PERFORM erp_payroll_private.cancel(p_cafe,row.id,p_date);END LOOP;
 ELSIF r.document_id IS NOT NULL THEN
  doc:=erp_payroll_private.reverse(p_cafe,r.document_id,p_date,'عكس استحقاق مرتبات #'||r.code);
  IF r.kind='payslip' THEN
   FOR row IN SELECT x.*,li.loan_id FROM public.erp_payroll_loan_payments x JOIN public.erp_payroll_loan_installments li ON li.id=x.installment_id WHERE x.cafe_id=p_cafe AND x.payslip_id=r.id AND NOT x.reversed FOR UPDATE OF x,li LOOP
    UPDATE public.erp_payroll_loan_installments SET repaid=repaid-row.amount WHERE id=row.installment_id;
    UPDATE public.erp_payroll_records SET paid=paid-row.amount,status='active',revision=revision+1 WHERE id=row.loan_id;
    UPDATE public.erp_payroll_loan_payments SET reversed=true WHERE id=row.id;
   END LOOP;
   DELETE FROM public.erp_payroll_commission_claims WHERE cafe_id=p_cafe AND payslip_id=r.id;
   FOR row IN SELECT value FROM jsonb_array_elements(coalesce(r.calculation->'leaveSettlement'->'rows','[]')) LOOP PERFORM erp_attendance_private.release_settlement(p_cafe,(row.value->>'id')::uuid,r.id);END LOOP;
  END IF;
 END IF;
 UPDATE public.erp_payroll_records SET status='cancelled',revision=revision+1 WHERE id=r.id;
 INSERT INTO public.erp_payroll_events(cafe_id,record_id,action,actor,detail) VALUES(p_cafe,r.id,'cancel',auth.uid(),jsonb_build_object('reversalDocumentId',doc));
END $$;
CREATE FUNCTION erp_payroll_private.validate_mudad(p_cafe uuid,p jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE field text;item text;seen text[]:='{}';BEGIN
 IF p IS NULL THEN RETURN;END IF;
 IF jsonb_typeof(p)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p)k WHERE k NOT IN('basic','housing','transport')) THEN RAISE EXCEPTION 'تعيين حقول مدد غير صالح';END IF;
 FOREACH field IN ARRAY ARRAY['basic','housing','transport'] LOOP
  IF jsonb_typeof(p->field) IS DISTINCT FROM 'array' OR jsonb_array_length(p->field)>100 THEN RAISE EXCEPTION 'اختر بنود حقول مدد';END IF;
  FOR item IN SELECT jsonb_array_elements_text(p->field) LOOP
   IF item=ANY(seen) OR NOT(item='basic' AND field='basic') AND NOT EXISTS(SELECT 1 FROM public.erp_salary_components WHERE cafe_id=p_cafe AND id::text=item AND active AND kind='earning' AND NOT coalesce((payload->>'referenceOnly')::boolean,false)) THEN RAISE EXCEPTION 'بند مدد غير متاح أو مكرر';END IF;
   seen:=array_append(seen,item);
  END LOOP;
 END LOOP;
END $$;
CREATE FUNCTION public.erp_payroll_write(p_cafe_id uuid,p_action text,p_data jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<command>>
DECLARE role_name text;rid uuid:=(p_data->>'id')::uuid;kind text:=p_data->>'kind';r public.erp_payroll_records;previous erp_payroll_private.requests;result jsonb;rev integer;doc uuid;row record;portion numeric;remaining numeric;amount numeric;settings jsonb;p jsonb;BEGIN
 role_name:=erp_payroll_private.authorize(p_cafe_id,true,p_action IN('approve','cancel','pay','reverse_payment','repay','reverse_repayment','renew','settings'));
 PERFORM erp_payroll_private.access(p_cafe_id,CASE WHEN p_action='settings' THEN 'settings' WHEN p_action='delete' THEN 'delete' WHEN p_action IN('component','structure','contract','run','payslip','loan') THEN CASE WHEN coalesce((p_data->>'revision')::integer,0)=0 THEN 'create' ELSE 'update' END WHEN p_action IN('generate','related_form') THEN 'create' ELSE 'approve' END);
 IF p_action='renew' THEN PERFORM erp_payroll_private.access(p_cafe_id,'create');END IF;
 IF p_request_id IS NULL OR p_action NOT IN('component','structure','contract','run','payslip','loan','settings','delete','approve','reject','cancel','renew','generate','pay','reverse_payment','repay','reverse_repayment','related_form') OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>500000 THEN RAISE EXCEPTION 'طلب المرتبات غير صالح';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,95500));
 SELECT * INTO previous FROM erp_payroll_private.requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN IF previous.actor<>auth.uid() OR previous.action<>p_action OR previous.payload<>p_data THEN RAISE EXCEPTION 'معرف الطلب مستخدم لعملية أخرى' USING ERRCODE='22023';END IF;RETURN previous.result;END IF;
 IF p_action='component' THEN
  IF length(btrim(coalesce(p_data->>'name',''))) NOT BETWEEN 1 AND 150 OR coalesce(p_data->>'code','')!~'^[a-z][a-z_]{0,39}$' OR p_data->>'code'=ANY(ARRAY['basic','days','period_days','worked','scheduled','late','early','overtime','absent','leave','holiday','earnings','deductions']) OR coalesce(p_data->>'kind','') NOT IN('earning','deduction') OR coalesce(p_data->>'method','') NOT IN('amount','formula') OR jsonb_typeof(p_data->'active') IS DISTINCT FROM 'boolean' OR coalesce((p_data->>'amount')::numeric,-1)<0 OR(p_data->>'amount')::numeric>1000000000 OR(p_data->>'amount')::numeric='NaN'::numeric THEN RAISE EXCEPTION 'راجع بيانات بند الراتب ورمزه';END IF;
  IF p_data->>'accountId' IS NOT NULL THEN PERFORM erp_asset_private.account(p_cafe_id,(p_data->>'accountId')::uuid,CASE WHEN p_data->>'kind'='earning' THEN ARRAY['expense'] ELSE ARRAY['expense','other_liability','payable','other_asset','receivable'] END);END IF;
  IF rid IS NOT NULL THEN SELECT revision INTO rev FROM public.erp_salary_components WHERE cafe_id=p_cafe_id AND id=rid FOR UPDATE;IF NOT FOUND OR rev<>(p_data->>'revision')::integer THEN RAISE EXCEPTION 'تغير البند أعد تحميله' USING ERRCODE='40001';END IF;END IF;
  rid:=coalesce(rid,gen_random_uuid());INSERT INTO public.erp_salary_components(id,cafe_id,name,code,kind,active,payload) VALUES(rid,p_cafe_id,btrim(p_data->>'name'),p_data->>'code',p_data->>'kind',(p_data->>'active')::boolean,p_data) ON CONFLICT(id) DO UPDATE SET name=excluded.name,code=excluded.code,kind=excluded.kind,active=excluded.active,payload=excluded.payload,revision=erp_salary_components.revision+1;
 ELSIF p_action='structure' THEN
  PERFORM erp_payroll_private.validate(p_cafe_id,'structure',p_data);PERFORM erp_payroll_private.calculate(p_cafe_id,p_data);
  IF length(btrim(coalesce(p_data->>'name',''))) NOT BETWEEN 1 AND 150 OR jsonb_typeof(p_data->'active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'أدخل اسم القالب وحالته';END IF;
  IF rid IS NOT NULL THEN SELECT revision INTO rev FROM public.erp_salary_structures WHERE cafe_id=p_cafe_id AND id=rid FOR UPDATE;IF NOT FOUND OR rev<>(p_data->>'revision')::integer THEN RAISE EXCEPTION 'تغير القالب أعد تحميله' USING ERRCODE='40001';END IF;END IF;
  rid:=coalesce(rid,gen_random_uuid());INSERT INTO public.erp_salary_structures(id,cafe_id,name,active,payload) VALUES(rid,p_cafe_id,btrim(p_data->>'name'),(p_data->>'active')::boolean,p_data) ON CONFLICT(id) DO UPDATE SET name=excluded.name,active=excluded.active,payload=excluded.payload,revision=erp_salary_structures.revision+1;
 ELSIF p_action IN('contract','run','payslip','loan') THEN rid:=erp_payroll_private.save_record(p_cafe_id,p_action,p_data);
 ELSIF p_action='related_form' THEN
  SELECT * INTO r FROM public.erp_payroll_records WHERE cafe_id=p_cafe_id AND id=rid AND erp_payroll_records.kind='contract' FOR UPDATE;
  IF NOT FOUND OR r.revision<>(p_data->>'revision')::integer THEN RAISE EXCEPTION 'تغير العقد أعد تحميله' USING ERRCODE='40001';END IF;
  SELECT value INTO p FROM public.erp_payroll_settings st CROSS JOIN LATERAL jsonb_array_elements(st.payload->'relatedForms') WHERE st.cafe_id=p_cafe_id AND value->>'id'=p_data->>'formId' AND(value->>'active')::boolean;
  IF p IS NULL THEN RAISE EXCEPTION 'النموذج غير متاح';END IF;
  PERFORM erp_payroll_private.validate_custom_values(p->'fields',coalesce(p_data->'values','{}'),p_cafe_id,rid,NULL);
  INSERT INTO public.erp_payroll_events(cafe_id,record_id,action,actor,detail) VALUES(p_cafe_id,rid,'related_form',auth.uid(),jsonb_build_object('formId',p->>'id','name',p->>'name','fields',p->'fields','values',p_data->'values'));
  UPDATE public.erp_payroll_records SET revision=revision+1 WHERE id=rid;
 ELSIF p_action='settings' THEN
  PERFORM erp_payroll_private.validate_mudad(p_cafe_id,p_data->'mudad');
  PERFORM erp_manufacturing_private.validate_custom_fields(coalesce(p_data->'contractFields','[]'));
  IF jsonb_typeof(coalesce(p_data->'relatedForms','[]'))<>'array' OR jsonb_array_length(coalesce(p_data->'relatedForms','[]'))>30 THEN RAISE EXCEPTION 'قائمة النماذج غير صالحة';END IF;
  FOR p IN SELECT * FROM jsonb_array_elements(coalesce(p_data->'relatedForms','[]')) LOOP
   IF coalesce(p->>'id','')!~'^[a-z][a-z0-9_]{0,59}$' OR length(btrim(coalesce(p->>'name',''))) NOT BETWEEN 1 AND 150 OR jsonb_typeof(p->'active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'بيانات النموذج غير صالحة';END IF;PERFORM erp_manufacturing_private.validate_custom_fields(p->'fields');
  END LOOP;
  PERFORM erp_asset_private.account(p_cafe_id,(p_data->>'expenseAccountId')::uuid,ARRAY['expense']);PERFORM erp_asset_private.account(p_cafe_id,(p_data->>'payableAccountId')::uuid,ARRAY['other_liability','payable']);PERFORM erp_asset_private.account(p_cafe_id,(p_data->>'receivableAccountId')::uuid,ARRAY['other_asset','receivable']);PERFORM erp_asset_private.account(p_cafe_id,(p_data->>'commissionAccountId')::uuid,ARRAY['expense']);
  IF p_data->>'emailTemplateId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_document_templates WHERE cafe_id=p_cafe_id AND id=(p_data->>'emailTemplateId')::uuid AND channel='email') THEN RAISE EXCEPTION 'قالب البريد غير متاح';END IF;
  SELECT revision INTO rev FROM public.erp_payroll_settings WHERE cafe_id=p_cafe_id FOR UPDATE;IF coalesce(rev,0)<>(p_data->>'revision')::integer THEN RAISE EXCEPTION 'تغيرت إعدادات المرتبات' USING ERRCODE='40001';END IF;
  INSERT INTO public.erp_payroll_settings(cafe_id,payload) VALUES(p_cafe_id,p_data) ON CONFLICT(cafe_id) DO UPDATE SET payload=excluded.payload,revision=erp_payroll_settings.revision+1;rid:=p_cafe_id;PERFORM erp_payroll_private.configure_email(p_cafe_id);
 ELSIF kind IN('component','structure') THEN
  IF p_action<>'delete' THEN RAISE EXCEPTION 'الإجراء غير مناسب لهذا النوع';END IF;
  IF kind='component' THEN
   IF EXISTS(SELECT 1 FROM public.erp_payroll_settings st WHERE st.cafe_id=p_cafe_id AND jsonb_path_exists(st.payload->'mudad','$.** ? (@ == $item)',jsonb_build_object('item',rid::text))) THEN RAISE EXCEPTION 'البند مرتبط بإعدادات مدد أزل التعيين قبل الحذف';END IF;
   IF EXISTS(SELECT 1 FROM public.erp_salary_structures WHERE cafe_id=p_cafe_id AND EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'lines')x WHERE x->>'componentId'=rid::text)) OR EXISTS(SELECT 1 FROM public.erp_payroll_records WHERE cafe_id=p_cafe_id AND EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'lines')x WHERE x->>'componentId'=rid::text)) THEN RAISE EXCEPTION 'البند مستخدم في قالب أو مستند عطله بدل حذفه';END IF;
   DELETE FROM public.erp_salary_components WHERE cafe_id=p_cafe_id AND id=rid AND revision=(p_data->>'revision')::integer;
  ELSE IF EXISTS(SELECT 1 FROM public.erp_payroll_records WHERE cafe_id=p_cafe_id AND payload->>'structureId'=rid::text) THEN RAISE EXCEPTION 'القالب مستخدم في عقد';END IF;DELETE FROM public.erp_salary_structures WHERE cafe_id=p_cafe_id AND id=rid AND revision=(p_data->>'revision')::integer;END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'تغير السجل أو لم يعد موجودًا' USING ERRCODE='40001';END IF;
 ELSE
  SELECT * INTO r FROM public.erp_payroll_records WHERE cafe_id=p_cafe_id AND id=rid AND erp_payroll_records.kind=command.kind FOR UPDATE;
  IF NOT FOUND OR r.revision<>(p_data->>'revision')::integer THEN RAISE EXCEPTION 'تغير السجل أعد تحميله' USING ERRCODE='40001';END IF;
  IF p_action='approve' THEN PERFORM erp_payroll_private.approve(p_cafe_id,rid);
  ELSIF p_action='generate' THEN IF r.kind<>'run' THEN RAISE EXCEPTION 'التوليد متاح للمسير فقط';END IF;PERFORM erp_payroll_private.generate(p_cafe_id,rid);
  ELSIF p_action='pay' THEN PERFORM erp_payroll_private.pay(p_cafe_id,rid,(p_data->>'accountId')::uuid,(p_data->>'date')::date);
  ELSIF p_action='cancel' THEN PERFORM erp_payroll_private.cancel(p_cafe_id,rid,coalesce((p_data->>'date')::date,current_date));
  ELSIF p_action='reject' THEN IF r.status<>'draft' THEN RAISE EXCEPTION 'رفض المسودة فقط';END IF;UPDATE public.erp_payroll_records SET status='rejected',revision=revision+1 WHERE id=rid;
  ELSIF p_action='delete' THEN IF r.status NOT IN('draft','rejected') THEN RAISE EXCEPTION 'السجل المعتمد محمي من الحذف';END IF;DELETE FROM public.erp_payroll_records WHERE id=rid;
  ELSIF p_action='reverse_payment' THEN
   IF r.kind<>'payslip' OR r.status<>'paid' THEN RAISE EXCEPTION 'اعكس صرف قسيمة مدفوعة';END IF;
   IF r.payment_id IS NOT NULL THEN doc:=erp_payroll_private.reverse(p_cafe_id,r.payment_id,(p_data->>'date')::date,'عكس صرف راتب #'||r.code);END IF;
   UPDATE public.erp_payroll_records SET status='approved',paid=0,payment_id=NULL,revision=revision+1 WHERE id=rid;
   UPDATE public.erp_payroll_records SET status='approved',paid=0,revision=revision+1 WHERE id=r.run_id AND status='paid';
  ELSIF p_action='renew' THEN
   IF r.kind<>'contract' OR r.status NOT IN('active','closed') THEN RAISE EXCEPTION 'جدد عقدًا نشطًا أو منتهيًا';END IF;
   rid:=erp_payroll_private.renew(p_cafe_id,r.id);
  ELSIF p_action='reverse_repayment' THEN
   IF r.kind<>'loan' OR r.status NOT IN('active','closed') THEN RAISE EXCEPTION 'اعكس تحصيل سلفة قائمة';END IF;
   SELECT x.document_id INTO doc FROM public.erp_payroll_loan_payments x JOIN public.erp_payroll_loan_installments li ON li.id=x.installment_id WHERE x.cafe_id=p_cafe_id AND x.id=(p_data->>'paymentId')::uuid AND li.loan_id=r.id AND x.payslip_id IS NULL AND NOT x.reversed;
   IF NOT FOUND THEN RAISE EXCEPTION 'التحصيل غير متاح للعكس أو مرتبط بقسيمة راتب';END IF;
   SELECT sum(x.amount) INTO amount FROM public.erp_payroll_loan_payments x JOIN public.erp_payroll_loan_installments li ON li.id=x.installment_id WHERE x.cafe_id=p_cafe_id AND x.document_id=doc AND li.loan_id=r.id AND NOT x.reversed;
   FOR row IN SELECT x.* FROM public.erp_payroll_loan_payments x JOIN public.erp_payroll_loan_installments li ON li.id=x.installment_id WHERE x.cafe_id=p_cafe_id AND x.document_id=doc AND li.loan_id=r.id AND NOT x.reversed FOR UPDATE OF x,li LOOP
    UPDATE public.erp_payroll_loan_installments SET repaid=repaid-row.amount WHERE id=row.installment_id;UPDATE public.erp_payroll_loan_payments SET reversed=true WHERE id=row.id;
   END LOOP;
   doc:=erp_payroll_private.reverse(p_cafe_id,doc,(p_data->>'date')::date,'عكس تحصيل سلفة #'||r.code);
   UPDATE public.erp_payroll_records SET paid=paid-command.amount,status='active',revision=revision+1 WHERE id=r.id;
  ELSIF p_action='repay' THEN
   amount:=round((p_data->>'amount')::numeric,2);IF r.kind<>'loan' OR r.status<>'active' OR amount IS NULL OR amount<=0 OR amount>r.amount-r.paid OR amount='NaN'::numeric THEN RAISE EXCEPTION 'مبلغ سداد السلفة غير صالح';END IF;
   PERFORM erp_asset_private.account(p_cafe_id,(p_data->>'accountId')::uuid,ARRAY['cash','bank']);settings:=r.calculation->'settings';PERFORM erp_asset_private.account(p_cafe_id,(settings->>'receivableAccountId')::uuid,ARRAY['other_asset','receivable']);
   doc:=erp_asset_private.document(p_cafe_id,(p_data->>'date')::date,round(amount*r.exchange_rate,2),'تحصيل سلفة #'||r.code,auth.uid());PERFORM erp_asset_private.line(p_cafe_id,doc,(p_data->>'accountId')::uuid,round(amount*r.exchange_rate,2),0);PERFORM erp_asset_private.line(p_cafe_id,doc,(settings->>'receivableAccountId')::uuid,0,round(amount*r.exchange_rate,2));remaining:=amount;
   FOR row IN SELECT * FROM public.erp_payroll_loan_installments WHERE cafe_id=p_cafe_id AND loan_id=r.id AND repaid<erp_payroll_loan_installments.amount ORDER BY due_on,id FOR UPDATE LOOP
    portion:=least(remaining,row.amount-row.repaid);EXIT WHEN portion<=0;UPDATE public.erp_payroll_loan_installments SET repaid=repaid+portion WHERE id=row.id;INSERT INTO public.erp_payroll_loan_payments(cafe_id,installment_id,document_id,amount) VALUES(p_cafe_id,row.id,doc,portion);remaining:=remaining-portion;
   END LOOP;
   IF remaining<>0 THEN RAISE EXCEPTION 'لا يطابق مبلغ السداد جدول الأقساط';END IF;
   UPDATE public.erp_payroll_records SET paid=paid+command.amount,status=CASE WHEN paid+command.amount=erp_payroll_records.amount THEN 'closed' ELSE 'active' END,revision=revision+1 WHERE id=r.id;
  END IF;
 END IF;
 IF p_action<>'related_form' THEN INSERT INTO public.erp_payroll_events(cafe_id,record_id,action,actor,detail) VALUES(p_cafe_id,rid,p_action,auth.uid(),jsonb_build_object('documentId',doc));END IF;
 result:=jsonb_build_object('id',rid);INSERT INTO erp_payroll_private.requests VALUES(p_cafe_id,p_request_id,auth.uid(),p_action,p_data,result);RETURN result;
END $$;
CREATE FUNCTION public.erp_payroll_renew_due(p_limit integer DEFAULT 50) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item record;r public.erp_payroll_records;rid uuid;done integer:=0;failed integer:=0;BEGIN
 FOR item IN SELECT p.id,p.cafe_id,c.owner_user_id FROM public.erp_payroll_records p JOIN public.cafes c ON c.id=p.cafe_id WHERE p.kind='contract' AND p.status='active' AND coalesce((p.payload->>'autoRenew')::boolean,false) AND p.date_to<(now() AT TIME ZONE 'Asia/Riyadh')::date AND c.status='active' AND c.deleted_at IS NULL AND platform_access_private.service_enabled(c.id,'finance') AND NOT EXISTS(SELECT 1 FROM public.erp_payroll_records child WHERE child.cafe_id=p.cafe_id AND child.kind='contract' AND child.payload->>'parentId'=p.id::text AND child.status<>'cancelled') ORDER BY p.date_to,p.id LIMIT greatest(1,least(p_limit,100)) LOOP
  BEGIN
   PERFORM pg_advisory_xact_lock(hashtextextended(item.cafe_id::text,60412));PERFORM pg_advisory_xact_lock(hashtextextended(item.cafe_id::text,95500));
   SELECT * INTO r FROM public.erp_payroll_records WHERE id=item.id AND status='active' AND coalesce((payload->>'autoRenew')::boolean,false) FOR UPDATE;
   IF NOT FOUND OR EXISTS(SELECT 1 FROM public.erp_payroll_records WHERE cafe_id=item.cafe_id AND payload->>'parentId'=item.id::text AND status<>'cancelled') THEN CONTINUE;END IF;
   rid:=erp_payroll_private.renew(item.cafe_id,item.id);INSERT INTO public.erp_payroll_events(cafe_id,record_id,action,actor,detail) VALUES(item.cafe_id,rid,'auto_renew',item.owner_user_id,jsonb_build_object('previousContractId',item.id));done:=done+1;
  EXCEPTION WHEN OTHERS THEN failed:=failed+1;INSERT INTO public.erp_payroll_events(cafe_id,record_id,action,actor,detail) VALUES(item.cafe_id,item.id,'auto_renew_failed',item.owner_user_id,jsonb_build_object('code',SQLSTATE));END;
 END LOOP;RETURN jsonb_build_object('renewed',done,'failed',failed);
END $$;
CREATE FUNCTION public.erp_payroll_import(p_cafe_id uuid,p_kind text,p_rows jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous erp_payroll_private.requests;row jsonb;ids jsonb:='[]';rid uuid;result jsonb;body jsonb:=jsonb_build_object('kind',p_kind,'rows',p_rows);BEGIN
 PERFORM erp_payroll_private.authorize(p_cafe_id,true);
 PERFORM erp_payroll_private.access(p_cafe_id,'create');
 IF p_kind NOT IN('contract','payslip') OR p_request_id IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 100 OR octet_length(p_rows::text)>1000000 THEN RAISE EXCEPTION 'استورد من صف إلى مائة صف صالح';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,95500));
 SELECT * INTO previous FROM erp_payroll_private.requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN IF previous.actor<>auth.uid() OR previous.action<>'import' OR previous.payload<>body THEN RAISE EXCEPTION 'معرف الاستيراد مستخدم لعملية أخرى';END IF;RETURN previous.result;END IF;
 FOR row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
  IF row->>'id' IS NOT NULL OR coalesce((row->>'revision')::integer,0)<>0 THEN RAISE EXCEPTION 'الاستيراد مخصص لسجلات جديدة';END IF;
  rid:=erp_payroll_private.save_record(p_cafe_id,p_kind,row);ids:=ids||jsonb_build_array(rid);
  INSERT INTO public.erp_payroll_events(cafe_id,record_id,action,actor) VALUES(p_cafe_id,rid,'import',auth.uid());
 END LOOP;
 result:=jsonb_build_object('ids',ids,'count',jsonb_array_length(ids));INSERT INTO erp_payroll_private.requests VALUES(p_cafe_id,p_request_id,auth.uid(),'import',body,result);RETURN result;
END $$;
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['erp_salary_components','erp_salary_structures','erp_payroll_records','erp_payroll_loan_installments','erp_payroll_loan_payments','erp_payroll_commission_claims','erp_payroll_settings','erp_payroll_events'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_payroll_private FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION erp_file_private.assert_record(uuid,text,uuid,boolean) RENAME TO assert_record_before_payroll;
CREATE FUNCTION erp_file_private.assert_record(p_cafe uuid,p_type text,p_record uuid,p_write boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE found_record boolean;BEGIN
 IF p_type IS DISTINCT FROM 'payroll_record' THEN PERFORM erp_file_private.assert_record_before_payroll(p_cafe,p_type,p_record,p_write);RETURN;END IF;
 PERFORM erp_payroll_private.authorize(p_cafe,p_write);
 PERFORM erp_payroll_private.access(p_cafe,CASE WHEN p_write THEN 'files' ELSE 'read' END);
 IF p_write THEN SELECT true INTO found_record FROM public.erp_payroll_records WHERE cafe_id=p_cafe AND id=p_record FOR KEY SHARE;ELSE SELECT EXISTS(SELECT 1 FROM public.erp_payroll_records WHERE cafe_id=p_cafe AND id=p_record) INTO found_record;END IF;
 IF NOT coalesce(found_record,false) THEN RAISE EXCEPTION 'سجل المرتبات غير متاح' USING ERRCODE='42501';END IF;
END $$;
REVOKE ALL ON FUNCTION erp_file_private.assert_record(uuid,text,uuid,boolean),erp_file_private.assert_record_before_payroll(uuid,text,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER erp_file_orphan_guard BEFORE DELETE ON public.erp_payroll_records FOR EACH ROW EXECUTE FUNCTION erp_file_private.prevent_orphans('payroll_record');
CREATE FUNCTION erp_payroll_private.file_referenced(p_cafe uuid,p_record uuid,p_file uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.erp_payroll_records WHERE cafe_id=p_cafe AND id=p_record AND jsonb_path_exists(coalesce(payload->'customValues','{}'),'$.** ? (@ == $file)',jsonb_build_object('file',p_file::text))) OR EXISTS(SELECT 1 FROM public.erp_payroll_events WHERE cafe_id=p_cafe AND record_id=p_record AND action='related_form' AND jsonb_path_exists(coalesce(detail->'values','{}'),'$.** ? (@ == $file)',jsonb_build_object('file',p_file::text)))
$$;
CREATE FUNCTION erp_payroll_private.file_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN IF OLD.entity_type='payroll_record' AND erp_payroll_private.file_referenced(OLD.cafe_id,OLD.record_id,OLD.id) THEN RAISE EXCEPTION 'الملف مستخدم في بيانات العقد أو نموذج مرتبط';END IF;RETURN OLD;END $$;
CREATE TRIGGER erp_payroll_file_guard BEFORE DELETE ON public.erp_files FOR EACH ROW EXECUTE FUNCTION erp_payroll_private.file_guard();
DO $$ DECLARE source text;BEGIN source:=pg_get_functiondef('public.erp_file_delete_access(text)'::regprocedure);EXECUTE replace(source,'public.erp_file_delete_access(','erp_payroll_private.file_delete_before_payroll(');END $$;
CREATE OR REPLACE FUNCTION public.erp_file_delete_access(p_path text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f public.erp_files;BEGIN IF NOT erp_payroll_private.file_delete_before_payroll(p_path) THEN RETURN false;END IF;SELECT * INTO f FROM public.erp_files WHERE path=p_path FOR UPDATE;IF f.entity_type='payroll_record' AND erp_payroll_private.file_referenced(f.cafe_id,f.record_id,f.id) THEN RETURN false;END IF;RETURN true;END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_payroll_private FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_payroll_private.attendance_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE used boolean;BEGIN
 IF TG_TABLE_NAME='erp_att_days' THEN SELECT EXISTS(SELECT 1 FROM public.erp_payroll_records WHERE cafe_id=OLD.cafe_id AND employee_id=OLD.employee_id AND kind='payslip' AND status IN('approved','paid') AND date_from<=OLD.work_date AND date_to>=OLD.work_date AND(coalesce((payload->>'validateAttendance')::boolean,false) OR coalesce((calculation->>'attendanceUsed')::boolean,false))) INTO used;
 ELSE IF OLD.status='approved' THEN SELECT EXISTS(SELECT 1 FROM public.erp_payroll_records WHERE cafe_id=OLD.cafe_id AND kind='payslip' AND status IN('approved','paid') AND date_from<=OLD.to_date AND date_to>=OLD.from_date AND OLD.payload->'employeeIds'?employee_id::text AND(coalesce((payload->>'validateAttendance')::boolean,false) OR coalesce((calculation->>'attendanceUsed')::boolean,false))) INTO used;END IF;END IF;
 IF used THEN RAISE EXCEPTION 'الحضور مستخدم في قسيمة راتب معتمدة اعكس صرفها وألغ اعتمادها أولًا';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
CREATE TRIGGER erp_payroll_attendance_day_guard BEFORE UPDATE OR DELETE ON public.erp_att_days FOR EACH ROW EXECUTE FUNCTION erp_payroll_private.attendance_guard();
CREATE TRIGGER erp_payroll_attendance_sheet_guard BEFORE UPDATE OR DELETE ON public.erp_att_sheets FOR EACH ROW EXECUTE FUNCTION erp_payroll_private.attendance_guard();
DO $$ DECLARE source text;target record;BEGIN
 source:=pg_get_functiondef('brand_finance_private.template_context(uuid,text,uuid)'::regprocedure);EXECUTE replace(source,'brand_finance_private.template_context(','erp_payroll_private.template_context_before_payroll(');
 FOR target IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE(n.nspname='public' AND p.proname='erp_templates') OR(n.nspname='erp_access_private' AND p.proname='snapshot_erp_templates') LOOP
  source:=pg_get_functiondef(target.oid);EXECUTE replace(source,'''invoice'',''appointment'',''work_order'',''refund'',''debit'',''quotation'',''credit_note''','''invoice'',''appointment'',''work_order'',''refund'',''debit'',''quotation'',''credit_note'',''payroll'',''payroll_contract''');
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION brand_finance_private.template_context(c uuid,e text,i uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE r public.erp_payroll_records;person public.erp_hr_employees;BEGIN
 IF e NOT IN('payroll','payroll_contract') THEN RETURN erp_payroll_private.template_context_before_payroll(c,e,i);END IF;
 SELECT * INTO r FROM public.erp_payroll_records WHERE cafe_id=c AND id=i AND kind=CASE e WHEN 'payroll' THEN 'payslip' ELSE 'contract' END;
 IF NOT FOUND OR r.status='cancelled' OR(e='payroll' AND r.status NOT IN('approved','paid')) THEN RETURN NULL;END IF;
 SELECT * INTO person FROM public.erp_hr_employees WHERE cafe_id=c AND id=r.employee_id AND active;IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('date',CASE WHEN r.kind='contract' THEN r.date_to ELSE r.posting_date END,'created',r.created_at,'updated',r.updated_at,'status',r.status,'employee_email',coalesce(person.payload->>'email',''),'employee_phone',coalesce(person.payload->>'mobile',''),'customer_email','','customer_phone','','total',r.amount,'paid',r.paid,'outstanding',r.amount-r.paid,'values',jsonb_build_object('العلامة',(SELECT name FROM public.cafes WHERE id=c),'الموظف',person.first_name||' '||person.last_name,'رقم_المستند',r.code,'العنوان',CASE e WHEN 'payroll' THEN 'قسيمة راتب' ELSE 'عقد موظف' END,'التاريخ',r.posting_date,'تاريخ_البدء',r.date_from,'تاريخ_الاستحقاق',r.date_to,'المبلغ',r.amount,'المدفوع',r.paid,'المتبقي',r.amount-r.paid,'البريد',person.payload->>'email','الجوال',person.payload->>'mobile','الوصف',coalesce(r.payload->>'description',r.payload->>'note','')));
END $$;
CREATE FUNCTION erp_payroll_private.template_event() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN IF NEW.kind IN('contract','payslip') THEN PERFORM brand_finance_private.template_enqueue(NEW.cafe_id,CASE NEW.kind WHEN 'contract' THEN 'payroll_contract' ELSE 'payroll' END,NEW.id);END IF;RETURN NEW;END $$;
CREATE TRIGGER erp_payroll_template_event AFTER INSERT OR UPDATE ON public.erp_payroll_records FOR EACH ROW EXECUTE FUNCTION erp_payroll_private.template_event();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_payroll_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.erp_payroll_read(uuid),public.erp_payroll_write(uuid,text,jsonb,uuid),public.erp_payroll_import(uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_payroll_read(uuid),public.erp_payroll_write(uuid,text,jsonb,uuid),public.erp_payroll_import(uuid,text,jsonb,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.erp_payroll_renew_due(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_payroll_renew_due(integer) TO service_role;
DO $$ BEGIN IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN PERFORM cron.schedule('erp-payroll-renewals','25 0 * * *','SELECT public.erp_payroll_renew_due(50)');END IF;END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
