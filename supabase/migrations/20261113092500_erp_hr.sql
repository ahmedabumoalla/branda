BEGIN;
CREATE SCHEMA erp_hr_private;
REVOKE ALL ON SCHEMA erp_hr_private FROM PUBLIC,anon,authenticated;
CREATE TABLE public.erp_hr_employees(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),number bigint GENERATED ALWAYS AS IDENTITY,code text NOT NULL,first_name text NOT NULL,last_name text NOT NULL DEFAULT '',active boolean NOT NULL DEFAULT true,user_id uuid REFERENCES auth.users(id),photo_file_id uuid REFERENCES public.erp_files(id),payload jsonb NOT NULL,branch_id uuid,department_id uuid,designation_id uuid,level_id uuid,type_id uuid,manager_id uuid,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(cafe_id,id),UNIQUE(cafe_id,code),UNIQUE(cafe_id,user_id),FOREIGN KEY(branch_id,cafe_id) REFERENCES public.branches(id,cafe_id),FOREIGN KEY(cafe_id,department_id) REFERENCES public.erp_org_units(cafe_id,id),FOREIGN KEY(cafe_id,designation_id) REFERENCES public.erp_org_units(cafe_id,id),FOREIGN KEY(cafe_id,level_id) REFERENCES public.erp_org_units(cafe_id,id),FOREIGN KEY(cafe_id,type_id) REFERENCES public.erp_org_units(cafe_id,id),FOREIGN KEY(cafe_id,manager_id) REFERENCES public.erp_hr_employees(cafe_id,id),CHECK(length(first_name) BETWEEN 1 AND 100 AND length(code) BETWEEN 1 AND 50),CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=40000));
CREATE INDEX erp_hr_employee_list ON public.erp_hr_employees(cafe_id,active,first_name,id);
CREATE INDEX erp_hr_employee_manager ON public.erp_hr_employees(cafe_id,manager_id);
CREATE INDEX erp_hr_employee_department ON public.erp_hr_employees(cafe_id,department_id);
CREATE INDEX erp_hr_employee_designation ON public.erp_hr_employees(cafe_id,designation_id);
CREATE INDEX erp_hr_employee_level ON public.erp_hr_employees(cafe_id,level_id);
CREATE INDEX erp_hr_employee_type ON public.erp_hr_employees(cafe_id,type_id);
CREATE INDEX erp_hr_employee_branch ON public.erp_hr_employees(branch_id,cafe_id);
CREATE TABLE public.erp_hr_document_types(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 150),required boolean NOT NULL DEFAULT false,expires boolean NOT NULL DEFAULT false,active boolean NOT NULL DEFAULT true,revision integer NOT NULL DEFAULT 1,UNIQUE(cafe_id,id),UNIQUE(cafe_id,name));
CREATE TABLE public.erp_hr_documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,employee_id uuid NOT NULL,type_id uuid NOT NULL,file_id uuid NOT NULL REFERENCES public.erp_files(id),number text NOT NULL DEFAULT '' CHECK(length(number)<=100),issued_on date,expires_on date,note text NOT NULL DEFAULT '' CHECK(length(note)<=2000),revision integer NOT NULL DEFAULT 1,UNIQUE(cafe_id,id),FOREIGN KEY(cafe_id,employee_id) REFERENCES public.erp_hr_employees(cafe_id,id),FOREIGN KEY(cafe_id,type_id) REFERENCES public.erp_hr_document_types(cafe_id,id),CHECK(expires_on IS NULL OR issued_on IS NULL OR expires_on>=issued_on));
CREATE INDEX erp_hr_document_employee ON public.erp_hr_documents(cafe_id,employee_id);
CREATE INDEX erp_hr_document_type ON public.erp_hr_documents(cafe_id,type_id);
CREATE INDEX erp_hr_document_file ON public.erp_hr_documents(file_id);
CREATE TABLE public.erp_hr_settings(cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),onboarding_enabled boolean NOT NULL DEFAULT false,offboarding_enabled boolean NOT NULL DEFAULT false,onboarding_template_id uuid,offboarding_template_id uuid,revision integer NOT NULL DEFAULT 1,FOREIGN KEY(cafe_id,onboarding_template_id) REFERENCES public.erp_task_templates(cafe_id,id),FOREIGN KEY(cafe_id,offboarding_template_id) REFERENCES public.erp_task_templates(cafe_id,id));
CREATE TABLE public.erp_hr_employee_flows(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,employee_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('onboarding','offboarding')),flow_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(cafe_id,employee_id) REFERENCES public.erp_hr_employees(cafe_id,id),FOREIGN KEY(cafe_id,flow_id) REFERENCES public.erp_task_flows(cafe_id,id),UNIQUE(cafe_id,employee_id,kind));
CREATE INDEX erp_hr_flow_parent ON public.erp_hr_employee_flows(cafe_id,flow_id);
CREATE TABLE public.erp_hr_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id),record_id uuid NOT NULL,action text NOT NULL,actor uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX erp_hr_event_parent ON public.erp_hr_events(cafe_id,record_id,created_at);
CREATE TRIGGER erp_hr_event_immutable BEFORE UPDATE OR DELETE ON public.erp_hr_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TABLE erp_hr_private.requests(cafe_id uuid NOT NULL,request_id uuid NOT NULL,actor uuid NOT NULL,action text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,PRIMARY KEY(cafe_id,request_id));
CREATE FUNCTION erp_hr_private.authorize(p_cafe uuid,p_write boolean DEFAULT false) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text;BEGIN r:=brand_finance_private.role_for(p_cafe);IF auth.uid() IS NULL OR coalesce(r,'') NOT IN('owner','manager','auditor') OR (p_write AND r<>'owner') THEN RAISE EXCEPTION 'لا تملك صلاحية ملفات الموظفين' USING ERRCODE='42501';END IF;RETURN r;END $$;
CREATE FUNCTION erp_hr_private.employee(p_cafe uuid,p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$ SELECT payload||jsonb_build_object('id',id,'code',code,'revision',revision,'active',active,'userId',user_id,'photoFileId',photo_file_id,'createdAt',created_at,'updatedAt',updated_at) FROM public.erp_hr_employees WHERE cafe_id=p_cafe AND id=p_id $$;
CREATE FUNCTION erp_hr_private.file(p_cafe uuid,p_employee uuid,p_file uuid,p_photo boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE f public.erp_files;BEGIN
 SELECT * INTO f FROM public.erp_files WHERE cafe_id=p_cafe AND id=p_file AND entity_type='hr_employee' AND record_id=p_employee AND uploaded FOR KEY SHARE;
 IF NOT FOUND OR (p_photo AND f.mime NOT IN('image/png','image/jpeg')) OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='erp-record-files' AND name=f.path) THEN RAISE EXCEPTION 'الملف غير متاح في مستندات هذا الموظف';END IF;
END $$;
CREATE FUNCTION erp_hr_private.validate(p_cafe uuid,p jsonb,p_id uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE k text;v text;ref uuid;expected text;BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>40000 OR length(btrim(coalesce(p->>'firstName',''))) NOT BETWEEN 1 AND 100 OR length(coalesce(p->>'middleName',''))>100 OR length(coalesce(p->>'lastName',''))>100 OR length(coalesce(p->>'code',''))>50 OR length(coalesce(p->>'note',''))>10000 OR jsonb_typeof(p->'active') IS DISTINCT FROM 'boolean' OR coalesce(p->>'country','')!~'^[A-Z]{2}$' OR coalesce(p->>'language','') NOT IN('ar','en') OR coalesce(p->>'gender','') NOT IN('','male','female') OR coalesce(p->>'citizenship','') NOT IN('','citizen','resident') THEN RAISE EXCEPTION 'راجع بيانات الموظف الأساسية' USING ERRCODE='22023';END IF;
 IF p->>'joinDate' IS NULL OR NOT isfinite((p->>'joinDate')::date) OR (p->>'birthDate')::date>=(p->>'joinDate')::date OR (p->>'birthDate')::date>current_date OR (p->>'endDate')::date<(p->>'joinDate')::date THEN RAISE EXCEPTION 'راجع تواريخ الموظف' USING ERRCODE='22023';END IF;
 FOREACH k IN ARRAY ARRAY['email','personalEmail','mobile','phone','officialId'] LOOP IF length(coalesce(p->>k,''))>254 THEN RAISE EXCEPTION 'بيانات الاتصال أطول من المسموح';END IF;END LOOP;
 FOREACH k IN ARRAY ARRAY['address','permanentAddress'] LOOP IF jsonb_typeof(p->k) IS DISTINCT FROM 'object' OR octet_length((p->k)::text)>4000 THEN RAISE EXCEPTION 'بيانات العنوان غير صالحة';END IF;END LOOP;
 IF (p->>'fiscalMonth' IS NULL)<>(p->>'fiscalDay' IS NULL) OR (p->>'fiscalMonth')::integer NOT BETWEEN 1 AND 12 OR (p->>'fiscalDay')::integer NOT BETWEEN 1 AND 31 THEN RAISE EXCEPTION 'التاريخ المالي غير صالح';END IF;
 IF p->>'fiscalMonth' IS NOT NULL THEN PERFORM make_date(2000,(p->>'fiscalMonth')::integer,(p->>'fiscalDay')::integer);END IF;
 IF p->>'userId' IS NOT NULL AND NOT erp_org_private.staff(p_cafe,(p->>'userId')::uuid) THEN RAISE EXCEPTION 'حساب الدخول لا ينتمي إلى فريق العلامة' USING ERRCODE='42501';END IF;
 IF p->>'branchId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.branches WHERE cafe_id=p_cafe AND id=(p->>'branchId')::uuid AND active AND deleted_at IS NULL) THEN RAISE EXCEPTION 'الفرع غير متاح';END IF;
 FOREACH k IN ARRAY ARRAY['department','designation','level','type'] LOOP ref:=(p->>(k||'Id'))::uuid;IF ref IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_org_units WHERE cafe_id=p_cafe AND id=ref AND kind=k AND active) THEN RAISE EXCEPTION 'ارتباط الهيكل التنظيمي غير صالح';END IF;END LOOP;
 IF p->>'designationId' IS NOT NULL AND EXISTS(SELECT 1 FROM public.erp_org_units WHERE cafe_id=p_cafe AND id=(p->>'designationId')::uuid AND parent_id IS NOT NULL AND parent_id IS DISTINCT FROM (p->>'departmentId')::uuid) THEN RAISE EXCEPTION 'المسمى الوظيفي يتبع قسمًا آخر';END IF;
 ref:=(p->>'managerId')::uuid;
 IF ref IS NOT NULL THEN
  IF ref=p_id OR NOT EXISTS(SELECT 1 FROM public.erp_hr_employees WHERE cafe_id=p_cafe AND id=ref AND active) OR EXISTS(WITH RECURSIVE chain AS(SELECT id,manager_id,ARRAY[id] path FROM public.erp_hr_employees WHERE cafe_id=p_cafe AND id=ref UNION ALL SELECT e.id,e.manager_id,c.path||e.id FROM public.erp_hr_employees e JOIN chain c ON e.id=c.manager_id WHERE e.cafe_id=p_cafe AND NOT e.id=ANY(c.path)) SELECT 1 FROM chain WHERE id=p_id) THEN RAISE EXCEPTION 'ارتباط المدير يكوّن حلقة أو يشير إلى موظف غير متاح';END IF;
 END IF;
END $$;
CREATE FUNCTION public.erp_hr_read(p_cafe_id uuid,p_filter jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text;q text:=coalesce(p_filter->>'query','');p integer:=coalesce((p_filter->>'page')::integer,1);sid uuid:=(p_filter->>'id')::uuid;status text:=coalesce(p_filter->>'status','');filter_kind text:=coalesce(p_filter->>'kind','');answer jsonb;BEGIN
 r:=erp_hr_private.authorize(p_cafe_id);IF p NOT BETWEEN 1 AND 100000 OR length(q)>120 OR status NOT IN('','active','inactive') OR filter_kind NOT IN('','user','employee') THEN RAISE EXCEPTION 'مرشحات الموظفين غير صالحة';END IF;
 WITH matching AS MATERIALIZED(SELECT * FROM public.erp_hr_employees e WHERE cafe_id=p_cafe_id AND (sid IS NULL OR id=sid) AND (q='' OR lower(code||' '||first_name||' '||last_name||' '||coalesce(payload->>'email','')) LIKE '%'||lower(q)||'%') AND (status='' OR active=(status='active')) AND (filter_kind='' OR (user_id IS NULL)=(filter_kind='employee')) AND (p_filter->>'branchId' IS NULL OR branch_id=(p_filter->>'branchId')::uuid) AND (p_filter->>'departmentId' IS NULL OR department_id=(p_filter->>'departmentId')::uuid)), page AS(SELECT * FROM matching ORDER BY first_name,last_name,id LIMIT 50 OFFSET (p-1)*50)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM matching),'employees',coalesce((SELECT jsonb_agg(erp_hr_private.employee(p_cafe_id,id) ORDER BY first_name,last_name,id) FROM page),'[]')) INTO answer;
 RETURN answer||jsonb_build_object('documentTypes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'revision',revision,'name',name,'required',required,'expires',expires,'active',active) ORDER BY name) FROM public.erp_hr_document_types WHERE cafe_id=p_cafe_id),'[]'),
 'documents',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'revision',d.revision,'employeeId',d.employee_id,'typeId',d.type_id,'fileId',d.file_id,'number',d.number,'issuedOn',d.issued_on,'expiresOn',d.expires_on,'note',d.note,'typeName',t.name,'fileName',f.name,'expired',coalesce(d.expires_on<current_date,false)) ORDER BY d.expires_on NULLS LAST) FROM public.erp_hr_documents d JOIN public.erp_hr_document_types t ON t.cafe_id=d.cafe_id AND t.id=d.type_id JOIN public.erp_files f ON f.id=d.file_id WHERE d.cafe_id=p_cafe_id AND d.employee_id=sid),'[]'),
 'settings',coalesce((SELECT jsonb_build_object('revision',revision,'onboardingEnabled',onboarding_enabled,'offboardingEnabled',offboarding_enabled,'onboardingTemplateId',onboarding_template_id,'offboardingTemplateId',offboarding_template_id) FROM public.erp_hr_settings WHERE cafe_id=p_cafe_id),'{"revision":0,"onboardingEnabled":false,"offboardingEnabled":false,"onboardingTemplateId":null,"offboardingTemplateId":null}'),
 'staff',coalesce((SELECT jsonb_agg(x ORDER BY name) FROM(SELECT user_id id,name,role FROM public.bf_staff WHERE cafe_id=p_cafe_id AND active UNION SELECT owner_user_id,name,'owner' FROM public.cafes WHERE id=p_cafe_id)x),'[]'),
 'branches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name) FROM public.branches WHERE cafe_id=p_cafe_id AND active AND deleted_at IS NULL),'[]'),
 'organization',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'name',name,'parent_id',parent_id)) FROM public.erp_org_units WHERE cafe_id=p_cafe_id AND active),'[]'),
 'managers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',first_name||' '||last_name) ORDER BY first_name) FROM public.erp_hr_employees WHERE cafe_id=p_cafe_id AND active),'[]'),
 'templates',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name) FROM public.erp_task_templates WHERE cafe_id=p_cafe_id AND active),'[]'),
 'flows',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'employeeId',employee_id,'kind',kind,'flowId',flow_id,'createdAt',created_at)) FROM public.erp_hr_employee_flows WHERE cafe_id=p_cafe_id AND employee_id=sid),'[]'),
 'events',coalesce((SELECT jsonb_agg(to_jsonb(x)-'cafe_id'-'actor' ORDER BY created_at DESC) FROM(SELECT * FROM public.erp_hr_events WHERE cafe_id=p_cafe_id AND record_id=sid ORDER BY created_at DESC LIMIT 300)x),'[]'),'canWrite',r='owner');
END $$;
CREATE FUNCTION public.erp_hr_write(p_cafe_id uuid,p_action text,p_data jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE previous erp_hr_private.requests;rid uuid:=(p_data->>'id')::uuid;old public.erp_hr_employees;doc public.erp_hr_document_types;settings public.erp_hr_settings;rev integer;result jsonb;v_code text;counter bigint;template public.erp_task_templates;flow uuid;parent uuid;manager_user uuid;sync_prior text;BEGIN
 PERFORM erp_hr_private.authorize(p_cafe_id,true);PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,83421));PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,92500));
 IF p_request_id IS NULL OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>50000 THEN RAISE EXCEPTION 'طلب الموظفين غير صالح';END IF;
 SELECT * INTO previous FROM erp_hr_private.requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN IF previous.actor<>auth.uid() OR previous.action<>p_action OR previous.payload<>p_data THEN RAISE EXCEPTION 'معرف الطلب مستخدم لعملية أخرى';END IF;RETURN previous.result;END IF;
 IF p_action='save_employee' THEN
  IF rid IS NOT NULL THEN SELECT * INTO old FROM public.erp_hr_employees WHERE cafe_id=p_cafe_id AND id=rid FOR UPDATE;IF NOT FOUND OR old.revision IS DISTINCT FROM (p_data->>'revision')::integer THEN RAISE EXCEPTION 'تغير ملف الموظف أعد تحميله' USING ERRCODE='40001';END IF;ELSE rid:=gen_random_uuid();END IF;
  PERFORM erp_hr_private.validate(p_cafe_id,p_data,rid);v_code:=btrim(coalesce(p_data->>'code',''));
  IF v_code='' THEN IF old.id IS NOT NULL THEN v_code:=old.code;ELSE SELECT coalesce(max(number),0)+1 INTO counter FROM public.erp_hr_employees WHERE cafe_id=p_cafe_id;LOOP v_code:='EMP-'||counter;EXIT WHEN NOT EXISTS(SELECT 1 FROM public.erp_hr_employees WHERE cafe_id=p_cafe_id AND erp_hr_employees.code=v_code);counter:=counter+1;END LOOP;END IF;END IF;
  INSERT INTO public.erp_hr_employees(id,cafe_id,code,first_name,last_name,active,user_id,payload,branch_id,department_id,designation_id,level_id,type_id,manager_id) VALUES(rid,p_cafe_id,v_code,btrim(p_data->>'firstName'),btrim(coalesce(p_data->>'lastName','')),(p_data->>'active')::boolean,(p_data->>'userId')::uuid,p_data-ARRAY['id','revision'],(p_data->>'branchId')::uuid,(p_data->>'departmentId')::uuid,(p_data->>'designationId')::uuid,(p_data->>'levelId')::uuid,(p_data->>'typeId')::uuid,(p_data->>'managerId')::uuid)
  ON CONFLICT(id) DO UPDATE SET code=excluded.code,first_name=excluded.first_name,last_name=excluded.last_name,active=excluded.active,user_id=excluded.user_id,payload=excluded.payload,branch_id=excluded.branch_id,department_id=excluded.department_id,designation_id=excluded.designation_id,level_id=excluded.level_id,type_id=excluded.type_id,manager_id=excluded.manager_id,revision=erp_hr_employees.revision+1,updated_at=now();
  IF p_data->>'userId' IS NOT NULL THEN
   SELECT revision INTO rev FROM public.erp_org_assignments WHERE cafe_id=p_cafe_id AND user_id=(p_data->>'userId')::uuid;
   SELECT user_id INTO manager_user FROM public.erp_hr_employees WHERE cafe_id=p_cafe_id AND id=(p_data->>'managerId')::uuid;
   sync_prior:=current_setting('erp.hr.syncing',true);PERFORM set_config('erp.hr.syncing','true',true);
   PERFORM public.erp_organization_write(p_cafe_id,'assign',jsonb_build_object('userId',p_data->>'userId','revision',coalesce(rev,0),'departmentId',p_data->'departmentId','designationId',p_data->'designationId','levelId',p_data->'levelId','typeId',p_data->'typeId','managerId',manager_user),gen_random_uuid());
   PERFORM set_config('erp.hr.syncing',coalesce(sync_prior,''),true);
  END IF;
 ELSIF p_action='photo' THEN
  IF p_data->>'fileId' IS NOT NULL THEN PERFORM erp_hr_private.file(p_cafe_id,rid,(p_data->>'fileId')::uuid,true);END IF;
  UPDATE public.erp_hr_employees SET photo_file_id=(p_data->>'fileId')::uuid,revision=revision+1,updated_at=now() WHERE cafe_id=p_cafe_id AND id=rid AND revision=(p_data->>'revision')::integer;IF NOT FOUND THEN RAISE EXCEPTION 'تغير ملف الموظف' USING ERRCODE='40001';END IF;
 ELSIF p_action='delete_employee' THEN
  DELETE FROM public.erp_hr_employees WHERE cafe_id=p_cafe_id AND id=rid AND revision=(p_data->>'revision')::integer;IF NOT FOUND THEN RAISE EXCEPTION 'تغير ملف الموظف أعد تحميله' USING ERRCODE='40001';END IF;
 ELSIF p_action='save_document_type' THEN
  IF length(btrim(coalesce(p_data->>'name',''))) NOT BETWEEN 1 AND 150 OR jsonb_typeof(p_data->'required') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_data->'expires') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_data->'active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'راجع نوع المستند';END IF;
  IF rid IS NULL THEN INSERT INTO public.erp_hr_document_types(cafe_id,name,required,expires,active) VALUES(p_cafe_id,btrim(p_data->>'name'),(p_data->>'required')::boolean,(p_data->>'expires')::boolean,(p_data->>'active')::boolean) RETURNING id INTO rid;
  ELSE UPDATE public.erp_hr_document_types SET name=btrim(p_data->>'name'),required=(p_data->>'required')::boolean,expires=(p_data->>'expires')::boolean,active=(p_data->>'active')::boolean,revision=revision+1 WHERE cafe_id=p_cafe_id AND id=rid AND revision=(p_data->>'revision')::integer;IF NOT FOUND THEN RAISE EXCEPTION 'تغير نوع المستند' USING ERRCODE='40001';END IF;END IF;
 ELSIF p_action='delete_document_type' THEN DELETE FROM public.erp_hr_document_types WHERE cafe_id=p_cafe_id AND id=rid AND revision=(p_data->>'revision')::integer;IF NOT FOUND THEN RAISE EXCEPTION 'تغير نوع المستند' USING ERRCODE='40001';END IF;
 ELSIF p_action='save_document' THEN
  parent:=(p_data->>'employeeId')::uuid;SELECT * INTO doc FROM public.erp_hr_document_types WHERE cafe_id=p_cafe_id AND id=(p_data->>'typeId')::uuid AND active;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.erp_hr_employees WHERE cafe_id=p_cafe_id AND id=parent) OR NOT EXISTS(SELECT 1 FROM public.erp_files WHERE cafe_id=p_cafe_id AND id=(p_data->>'fileId')::uuid AND entity_type='hr_employee' AND record_id=parent AND uploaded) THEN RAISE EXCEPTION 'الموظف أو نوع المستند أو الملف غير متاح';END IF;
  PERFORM erp_hr_private.file(p_cafe_id,parent,(p_data->>'fileId')::uuid);
  IF doc.expires AND p_data->>'expiresOn' IS NULL THEN RAISE EXCEPTION 'حدد تاريخ انتهاء المستند';END IF;
  IF rid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_hr_documents WHERE cafe_id=p_cafe_id AND id=rid AND revision=(p_data->>'revision')::integer AND employee_id=parent) THEN RAISE EXCEPTION 'تغير مستند الموظف' USING ERRCODE='40001';END IF;
  rid:=coalesce(rid,gen_random_uuid());INSERT INTO public.erp_hr_documents(id,cafe_id,employee_id,type_id,file_id,number,issued_on,expires_on,note) VALUES(rid,p_cafe_id,parent,doc.id,(p_data->>'fileId')::uuid,coalesce(p_data->>'number',''),(p_data->>'issuedOn')::date,(p_data->>'expiresOn')::date,coalesce(p_data->>'note','')) ON CONFLICT(id) DO UPDATE SET type_id=excluded.type_id,file_id=excluded.file_id,number=excluded.number,issued_on=excluded.issued_on,expires_on=excluded.expires_on,note=excluded.note,revision=erp_hr_documents.revision+1;
 ELSIF p_action='delete_document' THEN DELETE FROM public.erp_hr_documents WHERE cafe_id=p_cafe_id AND id=rid AND revision=(p_data->>'revision')::integer RETURNING employee_id INTO parent;IF NOT FOUND THEN RAISE EXCEPTION 'تغير مستند الموظف' USING ERRCODE='40001';END IF;
 ELSIF p_action='settings' THEN
  SELECT * INTO settings FROM public.erp_hr_settings WHERE cafe_id=p_cafe_id;IF coalesce(settings.revision,0) IS DISTINCT FROM (p_data->>'revision')::integer THEN RAISE EXCEPTION 'تغيرت الإعدادات' USING ERRCODE='40001';END IF;
  IF jsonb_typeof(p_data->'onboardingEnabled') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_data->'offboardingEnabled') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'إعدادات المسارات غير صالحة';END IF;
  IF ((p_data->>'onboardingEnabled')::boolean AND NOT EXISTS(SELECT 1 FROM public.erp_task_templates WHERE cafe_id=p_cafe_id AND id=(p_data->>'onboardingTemplateId')::uuid AND active)) OR ((p_data->>'offboardingEnabled')::boolean AND NOT EXISTS(SELECT 1 FROM public.erp_task_templates WHERE cafe_id=p_cafe_id AND id=(p_data->>'offboardingTemplateId')::uuid AND active)) THEN RAISE EXCEPTION 'اختر قالب مهام نشط لكل مسار مفعل';END IF;
  INSERT INTO public.erp_hr_settings(cafe_id,onboarding_enabled,offboarding_enabled,onboarding_template_id,offboarding_template_id) VALUES(p_cafe_id,(p_data->>'onboardingEnabled')::boolean,(p_data->>'offboardingEnabled')::boolean,(p_data->>'onboardingTemplateId')::uuid,(p_data->>'offboardingTemplateId')::uuid) ON CONFLICT(cafe_id) DO UPDATE SET onboarding_enabled=excluded.onboarding_enabled,offboarding_enabled=excluded.offboarding_enabled,onboarding_template_id=excluded.onboarding_template_id,offboarding_template_id=excluded.offboarding_template_id,revision=erp_hr_settings.revision+1;rid:=p_cafe_id;
 ELSIF p_action='start_flow' THEN
  SELECT * INTO old FROM public.erp_hr_employees WHERE cafe_id=p_cafe_id AND id=rid;IF NOT FOUND OR old.revision IS DISTINCT FROM (p_data->>'revision')::integer THEN RAISE EXCEPTION 'تغير ملف الموظف' USING ERRCODE='40001';END IF;
  SELECT * INTO settings FROM public.erp_hr_settings WHERE cafe_id=p_cafe_id;
  IF coalesce(p_data->>'kind','') NOT IN('onboarding','offboarding') OR NOT coalesce(CASE p_data->>'kind' WHEN 'onboarding' THEN settings.onboarding_enabled ELSE settings.offboarding_enabled END,false) THEN RAISE EXCEPTION 'مسار الموظف غير مفعل';END IF;
  IF EXISTS(SELECT 1 FROM public.erp_hr_employee_flows WHERE cafe_id=p_cafe_id AND employee_id=rid AND kind=p_data->>'kind') THEN RAISE EXCEPTION 'مسار الموظف موجود بالفعل';END IF;
  SELECT * INTO template FROM public.erp_task_templates WHERE cafe_id=p_cafe_id AND id=CASE p_data->>'kind' WHEN 'onboarding' THEN settings.onboarding_template_id ELSE settings.offboarding_template_id END AND active;IF NOT FOUND THEN RAISE EXCEPTION 'قالب المسار غير متاح';END IF;
  flow:=(public.erp_tasks_execute(p_cafe_id,'save_flow',jsonb_build_object('name',template.name||' - '||old.first_name||' '||old.last_name,'description',old.code,'templateId',template.id,'assigneeId',p_data->>'assigneeId','lines',template.lines),gen_random_uuid())->>'id')::uuid;
  INSERT INTO public.erp_hr_employee_flows(cafe_id,employee_id,kind,flow_id) VALUES(p_cafe_id,rid,p_data->>'kind',flow);
 ELSE RAISE EXCEPTION 'إجراء الموظفين غير معروف';END IF;
 INSERT INTO public.erp_hr_events(cafe_id,record_id,action,actor) VALUES(p_cafe_id,coalesce(parent,rid),p_action,auth.uid());
 result:=jsonb_build_object('id',rid,'flowId',flow);INSERT INTO erp_hr_private.requests VALUES(p_cafe_id,p_request_id,auth.uid(),p_action,p_data,result);RETURN result;
END $$;
CREATE FUNCTION public.erp_hr_import(p_cafe_id uuid,p_rows jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous erp_hr_private.requests;row jsonb;ids jsonb:='[]';result jsonb;BEGIN
 PERFORM erp_hr_private.authorize(p_cafe_id,true);PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,83421));PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,92500));
 IF p_request_id IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 100 OR octet_length(p_rows::text)>4000000 THEN RAISE EXCEPTION 'ملف الاستيراد يتجاوز الحد المسموح';END IF;
 SELECT * INTO previous FROM erp_hr_private.requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN IF previous.actor<>auth.uid() OR previous.action<>'import' OR previous.payload<>p_rows THEN RAISE EXCEPTION 'معرف الاستيراد مستخدم لمحتوى آخر';END IF;RETURN previous.result;END IF;
 FOR row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF row->>'id' IS NOT NULL OR row->>'userId' IS NOT NULL THEN RAISE EXCEPTION 'الاستيراد مخصص لموظفين جدد دون حساب دخول';END IF;
  result:=public.erp_hr_write(p_cafe_id,'save_employee',row,gen_random_uuid());ids:=ids||jsonb_build_array(result->>'id');
 END LOOP;
 result:=jsonb_build_object('ids',ids,'count',jsonb_array_length(ids));INSERT INTO erp_hr_private.requests VALUES(p_cafe_id,p_request_id,auth.uid(),'import',p_rows,result);RETURN result;
END $$;
CREATE FUNCTION erp_hr_private.organization_sync() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE e public.erp_hr_employees;manager_profile uuid;p jsonb;BEGIN
 IF current_setting('erp.hr.syncing',true)='true' THEN RETURN NEW;END IF;
 SELECT * INTO e FROM public.erp_hr_employees WHERE cafe_id=NEW.cafe_id AND user_id=NEW.user_id FOR UPDATE;IF NOT FOUND THEN RETURN NEW;END IF;
 SELECT id INTO manager_profile FROM public.erp_hr_employees WHERE cafe_id=NEW.cafe_id AND user_id=NEW.manager_id;
 p:=e.payload||jsonb_build_object('departmentId',NEW.department_id,'designationId',NEW.designation_id,'levelId',NEW.level_id,'typeId',NEW.type_id,'managerId',manager_profile);
 PERFORM erp_hr_private.validate(NEW.cafe_id,p,e.id);
 UPDATE public.erp_hr_employees SET department_id=NEW.department_id,designation_id=NEW.designation_id,level_id=NEW.level_id,type_id=NEW.type_id,manager_id=manager_profile,payload=p,revision=revision+1,updated_at=now() WHERE cafe_id=NEW.cafe_id AND id=e.id;
 RETURN NEW;
END $$;
CREATE TRIGGER erp_hr_org_sync AFTER INSERT OR UPDATE ON public.erp_org_assignments FOR EACH ROW EXECUTE FUNCTION erp_hr_private.organization_sync();
CREATE FUNCTION erp_hr_private.designation_parent_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NEW.kind='designation' AND NEW.parent_id IS DISTINCT FROM OLD.parent_id AND NEW.parent_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.erp_hr_employees WHERE cafe_id=NEW.cafe_id AND designation_id=NEW.id AND department_id IS DISTINCT FROM NEW.parent_id) THEN RAISE EXCEPTION 'المسمى مرتبط بموظفين في قسم آخر';END IF;RETURN NEW;END $$;
CREATE TRIGGER erp_hr_designation_parent BEFORE UPDATE ON public.erp_org_units FOR EACH ROW EXECUTE FUNCTION erp_hr_private.designation_parent_guard();
ALTER FUNCTION public.erp_organization_read(uuid) RENAME TO erp_organization_read_before_hr;
ALTER FUNCTION public.erp_organization_read_before_hr(uuid) SET SCHEMA erp_hr_private;
REVOKE ALL ON FUNCTION erp_hr_private.erp_organization_read_before_hr(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.erp_organization_read(p_cafe_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;BEGIN result:=erp_hr_private.erp_organization_read_before_hr(p_cafe_id);RETURN result||jsonb_build_object('hrStaff',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'userId',user_id,'name',first_name||' '||last_name,'departmentId',department_id,'designationId',designation_id,'levelId',level_id,'typeId',type_id,'managerId',manager_id,'active',active)) FROM public.erp_hr_employees WHERE cafe_id=p_cafe_id),'[]'));END $$;
REVOKE ALL ON FUNCTION public.erp_organization_read(uuid) FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION public.erp_organization_read(uuid) TO authenticated;
-- Preserve all previously installed entity adapters, including rental and custody.
ALTER FUNCTION erp_file_private.assert_record(uuid,text,uuid,boolean) RENAME TO assert_record_before_hr;
CREATE FUNCTION erp_file_private.assert_record(p_cafe uuid,p_type text,p_record uuid,p_write boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE present boolean;BEGIN
 IF p_type<>'hr_employee' THEN PERFORM erp_file_private.assert_record_before_hr(p_cafe,p_type,p_record,p_write);RETURN;END IF;
 PERFORM erp_hr_private.authorize(p_cafe,p_write);
 IF p_write THEN SELECT true INTO present FROM public.erp_hr_employees WHERE cafe_id=p_cafe AND id=p_record FOR KEY SHARE;ELSE SELECT EXISTS(SELECT 1 FROM public.erp_hr_employees WHERE cafe_id=p_cafe AND id=p_record) INTO present;END IF;
 IF NOT coalesce(present,false) THEN RAISE EXCEPTION 'ملف الموظف غير متاح' USING ERRCODE='42501';END IF;
END $$;
REVOKE ALL ON FUNCTION erp_file_private.assert_record(uuid,text,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER erp_file_orphan_guard BEFORE DELETE ON public.erp_hr_employees FOR EACH ROW EXECUTE FUNCTION erp_file_private.prevent_orphans('hr_employee');
DO $$ DECLARE source text;BEGIN
 source:=pg_get_functiondef('public.erp_file_delete_access(text)'::regprocedure);
 EXECUTE replace(source,'public.erp_file_delete_access(', 'erp_hr_private.file_delete_access_before_hr(');
END $$;
REVOKE ALL ON FUNCTION erp_hr_private.file_delete_access_before_hr(text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.erp_file_delete_access(p_path text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f public.erp_files;BEGIN
 IF NOT erp_hr_private.file_delete_access_before_hr(p_path) THEN RETURN false;END IF;
 SELECT * INTO f FROM public.erp_files WHERE path=p_path FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 PERFORM erp_file_private.assert_record(f.cafe_id,f.entity_type,f.record_id,true);
 IF f.entity_type='hr_employee' AND (EXISTS(SELECT 1 FROM public.erp_hr_documents WHERE cafe_id=f.cafe_id AND file_id=f.id) OR EXISTS(SELECT 1 FROM public.erp_hr_employees WHERE cafe_id=f.cafe_id AND photo_file_id=f.id)) THEN RETURN false;END IF;
 RETURN true;
EXCEPTION WHEN SQLSTATE '42501' OR SQLSTATE '22023' THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.erp_file_delete_access(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.erp_file_delete_access(text) TO authenticated;
DO $$ DECLARE n text;BEGIN FOREACH n IN ARRAY ARRAY['erp_hr_employees','erp_hr_document_types','erp_hr_documents','erp_hr_settings','erp_hr_employee_flows','erp_hr_events'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',n);END LOOP;END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_hr_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.erp_hr_read(uuid,jsonb),public.erp_hr_write(uuid,text,jsonb,uuid),public.erp_hr_import(uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_hr_read(uuid,jsonb),public.erp_hr_write(uuid,text,jsonb,uuid),public.erp_hr_import(uuid,jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
