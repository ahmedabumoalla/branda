BEGIN;
CREATE SCHEMA erp_requests_private;
REVOKE ALL ON SCHEMA erp_requests_private FROM PUBLIC,anon,authenticated,service_role;
DO $$DECLARE domains text[];BEGIN
 SELECT array_agg(d ORDER BY n) INTO domains FROM(SELECT d,min(n)n FROM unnest(erp_access_private.domains()||ARRAY['requests']) WITH ORDINALITY t(d,n) GROUP BY d)x;
 EXECUTE format('CREATE OR REPLACE FUNCTION erp_access_private.domains() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path='''' AS $f$SELECT %L::text[]$f$',domains);
 UPDATE public.erp_roles SET permissions=jsonb_build_object('requests',jsonb_build_object('read',false,'create',false,'update',false,'delete',false,'approve',false,'settings',false,'files',false))||permissions;
END $$;
CREATE TABLE public.erp_request_types(id uuid PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id),config jsonb NOT NULL,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(cafe_id,id),CHECK(jsonb_typeof(config)='object' AND octet_length(config::text)<524288));
CREATE UNIQUE INDEX erp_request_type_name ON public.erp_request_types(cafe_id,lower(config->>'name'));
CREATE TABLE public.erp_staff_requests(id uuid PRIMARY KEY,cafe_id uuid NOT NULL,type_id uuid NOT NULL,number bigint GENERATED ALWAYS AS IDENTITY,employee_id uuid,user_id uuid REFERENCES auth.users(id),payload jsonb NOT NULL,config jsonb NOT NULL,status text NOT NULL CHECK(status IN('draft','pending','approved','rejected')),closed boolean NOT NULL DEFAULT false,deleted boolean NOT NULL DEFAULT false,step integer NOT NULL DEFAULT 0,approvals jsonb NOT NULL DEFAULT '[]',email_draft jsonb,revision integer NOT NULL DEFAULT 1,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(cafe_id,id),FOREIGN KEY(cafe_id,type_id) REFERENCES public.erp_request_types(cafe_id,id),FOREIGN KEY(cafe_id,employee_id) REFERENCES public.erp_hr_employees(cafe_id,id),CHECK(num_nonnulls(employee_id,user_id)=1),CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<524288));
CREATE INDEX erp_staff_request_type ON public.erp_staff_requests(cafe_id,type_id,created_at DESC);
CREATE INDEX erp_staff_request_employee ON public.erp_staff_requests(cafe_id,employee_id);
CREATE INDEX erp_staff_request_user ON public.erp_staff_requests(user_id,cafe_id);
CREATE TABLE public.erp_request_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id),record_id uuid NOT NULL,action text NOT NULL,actor uuid NOT NULL REFERENCES auth.users(id),note text NOT NULL DEFAULT '',detail jsonb NOT NULL DEFAULT '{}',at timestamptz NOT NULL DEFAULT now());
CREATE INDEX erp_request_event_parent ON public.erp_request_events(cafe_id,record_id,at DESC);
CREATE TABLE erp_requests_private.requests(cafe_id uuid NOT NULL,request_id uuid NOT NULL,actor uuid NOT NULL,action text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,PRIMARY KEY(cafe_id,request_id));
CREATE TRIGGER erp_request_events_immutable BEFORE UPDATE OR DELETE ON public.erp_request_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TRIGGER erp_request_commands_immutable BEFORE UPDATE OR DELETE ON erp_requests_private.requests FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE FUNCTION erp_requests_private.base(c uuid,a text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$DECLARE r text:=brand_finance_private.role_for(c);BEGIN
 IF auth.uid() IS NULL OR coalesce(r,'') NOT IN('owner','manager','accountant','auditor','cashier','warehouse') THEN RETURN false;END IF;
 IF a='settings' AND r<>'owner' THEN RETURN false;END IF;
 IF r='auditor' AND a<>'read' THEN RETURN false;END IF;
 RETURN erp_access_private.allowed(c,'requests',a);
END $$;
CREATE FUNCTION erp_requests_private.self(c uuid,e uuid,u uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$SELECT u=auth.uid() OR EXISTS(SELECT 1 FROM public.erp_hr_employees WHERE cafe_id=c AND id=e AND user_id=auth.uid() AND active)$$;
CREATE FUNCTION erp_requests_private.type_allowed(c uuid,cfg jsonb,a text) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$SELECT erp_requests_private.base(c,CASE a WHEN 'view' THEN 'read' WHEN 'others' THEN 'update' ELSE a END) AND (brand_finance_private.role_for(c)='owner' OR erp_workflow_private.selector(c,cfg->'permissions'->a))$$;
CREATE FUNCTION erp_requests_private.can(c uuid,r public.erp_staff_requests,t jsonb,a text) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$DECLARE own boolean:=coalesce(erp_requests_private.self(c,r.employee_id,r.user_id),false);owner boolean:=brand_finance_private.role_for(c)='owner';BEGIN
 IF r.deleted OR NOT erp_requests_private.base(c,CASE a WHEN 'view' THEN 'read' WHEN 'edit' THEN 'update' WHEN 'revoke' THEN 'approve' WHEN 'close' THEN 'approve' ELSE a END) THEN RETURN false;END IF;
 IF a='view' THEN RETURN own OR owner OR erp_requests_private.type_allowed(c,t,'view');END IF;
 IF NOT erp_requests_private.can(c,r,t,'view') THEN RETURN false;END IF;
 IF a IN('edit','files','delete') THEN RETURN NOT r.closed AND r.status IN('draft','pending') AND (owner OR own AND erp_requests_private.type_allowed(c,t,'create') OR erp_requests_private.type_allowed(c,t,'others'));END IF;
 IF a IN('approve','revoke','close') THEN
  IF NOT erp_requests_private.type_allowed(c,t,'approve') OR (own AND NOT coalesce((r.config->>'allowSelfApproval')::boolean,false)) THEN RETURN false;END IF;
  IF a='close' THEN RETURN r.status IN('approved','rejected');END IF;
  IF r.closed THEN RETURN false;END IF;
  IF a='revoke' THEN RETURN r.status IN('approved','rejected') OR r.status='pending' AND r.step>0;END IF;
  RETURN r.status='pending' AND (owner OR erp_workflow_private.selector(c,r.config->'steps'->r.step->'selector'));
 END IF;RETURN false;
END $$;
CREATE FUNCTION erp_requests_private.field_scope(fields jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$DECLARE f jsonb;BEGIN
 FOR f IN SELECT value FROM jsonb_array_elements(fields) LOOP
 IF f->>'type' IN('dynamic','multidynamic') AND f->>'entity'<>'employees' THEN RAISE EXCEPTION 'اختر حساب موظف من مصادر الطلبات المتاحة';END IF;
 IF f->>'type'='subform' THEN PERFORM erp_requests_private.field_scope(f->'fields');END IF;
 END LOOP;
END $$;
CREATE FUNCTION erp_requests_private.validate_values(fields jsonb,vals jsonb,p_cafe uuid DEFAULT NULL,p_record uuid DEFAULT NULL,p_scope uuid DEFAULT NULL,depth integer DEFAULT 0,p_draft boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE f jsonb;v jsonb;t text;x jsonb;txt text;tbl text;col text;valid boolean;metric numeric;BEGIN
 IF coalesce(jsonb_typeof(vals),'')<>'object' OR octet_length(vals::text)>262144 OR depth>2 THEN RAISE EXCEPTION 'بيانات الحقول الإضافية غير صالحة';END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(coalesce(fields,'[]')) LOOP
  t:=f->>'type';IF t IN('static','separator') THEN CONTINUE;END IF;
  v:=coalesce(vals->(f->>'id'),f->'defaultValue');
  IF coalesce((f->>'required')::boolean,false) AND NOT p_draft AND (v IS NULL OR v='null'::jsonb OR v='""'::jsonb OR v='[]'::jsonb OR (t='checkbox' AND v<>'true')) THEN RAISE EXCEPTION 'أكمل الحقل المطلوب: %',f->>'label';END IF;
  IF v IS NULL OR v='null'::jsonb OR v='""'::jsonb THEN CONTINUE;END IF;
  IF t='subform' THEN
   IF jsonb_typeof(v)<>'array' OR jsonb_array_length(v)>100 OR jsonb_array_length(v)<coalesce((f->>'minimumRows')::integer,0) THEN RAISE EXCEPTION 'عدد صفوف النموذج غير صالح';END IF;
   FOR x IN SELECT value FROM jsonb_array_elements(v) LOOP PERFORM erp_requests_private.validate_values(f->'fields',x,p_cafe,p_record,p_scope,depth+1,p_draft);END LOOP;CONTINUE;
  END IF;
  IF t='location' THEN
   IF jsonb_typeof(v)<>'object' OR jsonb_typeof(v->'latitude') IS DISTINCT FROM 'number' OR jsonb_typeof(v->'longitude') IS DISTINCT FROM 'number' OR abs((v->>'latitude')::numeric)>90 OR abs((v->>'longitude')::numeric)>180 THEN RAISE EXCEPTION 'إحداثيات الموقع غير صالحة';END IF;CONTINUE;
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
   tbl:=CASE f->>'entity' WHEN 'items' THEN 'bf_items' WHEN 'customers' THEN 'bf_parties' WHEN 'employees' THEN 'bf_staff' WHEN 'warehouses' THEN 'bf_warehouses' WHEN 'accounts' THEN 'bf_accounts' WHEN 'bom' THEN 'erp_mfg_boms' WHEN 'routings' THEN 'erp_mfg_routings' WHEN 'workstations' THEN 'erp_mfg_workstations' WHEN 'orders' THEN 'erp_mfg_orders' WHEN 'sources' THEN 'bf_documents' END;
   IF tbl IS NULL OR p_cafe IS NULL THEN RAISE EXCEPTION 'الكيان المرتبط غير صالح';END IF;col:=CASE WHEN tbl='bf_staff' THEN 'user_id' ELSE 'id' END;
   FOR x IN SELECT value FROM jsonb_array_elements(CASE WHEN t='dynamic' THEN jsonb_build_array(v) ELSE v END) LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE cafe_id=$1 AND %I=$2)',tbl,col) INTO valid USING p_cafe,(x#>>'{}')::uuid;
    IF NOT valid THEN RAISE EXCEPTION 'القيمة المرتبطة غير موجودة في العلامة';END IF;
   END LOOP;
  END IF;
  IF t IN('file','image') THEN
   IF p_record IS NULL OR to_regclass('public.erp_files') IS NULL THEN RAISE EXCEPTION 'احفظ السجل وأضف المرفق أولًا';END IF;
   EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.erp_files WHERE cafe_id=$1 AND record_id=$2 AND id=$3 AND entity_type=$4 AND uploaded AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=''erp-record-files'' AND o.name=path) AND ($5<>''image'' OR mime IN(''image/jpeg'',''image/png'')))' INTO valid USING p_cafe,p_record,txt::uuid,'request_record',t;
   IF NOT valid THEN RAISE EXCEPTION 'المرفق غير موجود في هذا السجل';END IF;
  END IF;
  IF coalesce((f->>'unique')::boolean,false) AND depth=0 THEN
   tbl:='erp_staff_requests';
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE cafe_id=$1 AND id IS DISTINCT FROM $2 AND payload->''customValues''->$3=$4 AND type_id=$5)',tbl) INTO valid USING p_cafe,p_record,f->>'id',v,p_scope;
   IF valid THEN RAISE EXCEPTION 'قيمة الحقل مستخدمة مسبقًا: %',f->>'label';END IF;
  END IF;
 END LOOP;
END $$;
CREATE FUNCTION erp_requests_private.validate_more(fields jsonb,vals jsonb,p_cafe uuid DEFAULT NULL,p_record uuid DEFAULT NULL,p_scope uuid DEFAULT NULL,depth integer DEFAULT 0,p_draft boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE f jsonb;v jsonb;t text;x jsonb;txt text;tbl text;col text;valid boolean;metric numeric;BEGIN
 IF coalesce(jsonb_typeof(vals),'')<>'object' OR octet_length(vals::text)>262144 OR depth>2 THEN RAISE EXCEPTION 'بيانات الحقول الإضافية غير صالحة';END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(coalesce(fields,'[]')) LOOP
  t:=f->>'type';IF t IN('static','separator') THEN CONTINUE;END IF;
  v:=coalesce(vals->(f->>'id'),f->'defaultValue');
  IF coalesce((f->>'required')::boolean,false) AND NOT p_draft AND (v IS NULL OR v='null'::jsonb OR v='""'::jsonb OR v='[]'::jsonb OR (t='checkbox' AND v<>'true')) THEN RAISE EXCEPTION 'أكمل الحقل المطلوب: %',f->>'label';END IF;
  IF v IS NULL OR v='null'::jsonb OR v='""'::jsonb THEN CONTINUE;END IF;
  IF t='subform' THEN
   IF jsonb_typeof(v)<>'array' OR jsonb_array_length(v)>100 OR jsonb_array_length(v)<coalesce((f->>'minimumRows')::integer,0) THEN RAISE EXCEPTION 'عدد صفوف النموذج غير صالح';END IF;
   FOR x IN SELECT value FROM jsonb_array_elements(v) LOOP PERFORM erp_requests_private.validate_more(f->'fields',x,p_cafe,p_record,p_scope,depth+1,p_draft);END LOOP;CONTINUE;
  END IF;
  IF t='location' THEN
   IF jsonb_typeof(v)<>'object' OR jsonb_typeof(v->'latitude') IS DISTINCT FROM 'number' OR jsonb_typeof(v->'longitude') IS DISTINCT FROM 'number' OR abs((v->>'latitude')::numeric)>90 OR abs((v->>'longitude')::numeric)>180 THEN RAISE EXCEPTION 'إحداثيات الموقع غير صالحة';END IF;CONTINUE;
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
   tbl:=CASE f->>'entity' WHEN 'items' THEN 'bf_items' WHEN 'customers' THEN 'bf_parties' WHEN 'employees' THEN 'bf_staff' WHEN 'warehouses' THEN 'bf_warehouses' WHEN 'accounts' THEN 'bf_accounts' WHEN 'bom' THEN 'erp_mfg_boms' WHEN 'routings' THEN 'erp_mfg_routings' WHEN 'workstations' THEN 'erp_mfg_workstations' WHEN 'orders' THEN 'erp_mfg_orders' WHEN 'sources' THEN 'bf_documents' END;
   IF tbl IS NULL OR p_cafe IS NULL THEN RAISE EXCEPTION 'الكيان المرتبط غير صالح';END IF;col:=CASE WHEN tbl='bf_staff' THEN 'user_id' ELSE 'id' END;
   FOR x IN SELECT value FROM jsonb_array_elements(CASE WHEN t='dynamic' THEN jsonb_build_array(v) ELSE v END) LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE cafe_id=$1 AND %I=$2)',tbl,col) INTO valid USING p_cafe,(x#>>'{}')::uuid;
    IF NOT valid THEN RAISE EXCEPTION 'القيمة المرتبطة غير موجودة في العلامة';END IF;
   END LOOP;
  END IF;
  IF t IN('file','image') THEN
   IF p_record IS NULL OR to_regclass('public.erp_files') IS NULL THEN RAISE EXCEPTION 'احفظ السجل وأضف المرفق أولًا';END IF;
   EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.erp_files WHERE cafe_id=$1 AND record_id=$2 AND id=$3 AND entity_type=$4 AND uploaded AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=''erp-record-files'' AND o.name=path) AND ($5<>''image'' OR mime IN(''image/jpeg'',''image/png'')))' INTO valid USING p_cafe,p_record,txt::uuid,'request_type',t;
   IF NOT valid THEN RAISE EXCEPTION 'المرفق غير موجود في هذا السجل';END IF;
  END IF;
  IF coalesce((f->>'unique')::boolean,false) AND depth=0 THEN
   tbl:='erp_request_types';
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE cafe_id=$1 AND id IS DISTINCT FROM $2 AND config->''moreValues''->$3=$4 AND $5 IS NULL)',tbl) INTO valid USING p_cafe,p_record,f->>'id',v,p_scope;
   IF valid THEN RAISE EXCEPTION 'قيمة الحقل مستخدمة مسبقًا: %',f->>'label';END IF;
  END IF;
 END LOOP;
END $$;

CREATE FUNCTION public.erp_requests_read(p_cafe uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.erp_request_types;r public.erp_staff_requests;types jsonb:='[]';records jsonb:='[]';visible uuid[]:='{}';configure boolean:=erp_requests_private.base(p_cafe,'settings');cfg jsonb;more_read boolean;more_edit boolean;more_delete boolean;lookups jsonb;subjects jsonb;
BEGIN
 IF NOT erp_requests_private.base(p_cafe,'read') THEN RAISE EXCEPTION 'لا تملك صلاحية الطلبات' USING ERRCODE='42501';END IF;
 FOR t IN SELECT * FROM public.erp_request_types WHERE cafe_id=p_cafe ORDER BY config->>'name' LOOP
  IF configure OR erp_requests_private.type_allowed(p_cafe,t.config,'view') OR erp_requests_private.type_allowed(p_cafe,t.config,'create') OR EXISTS(SELECT 1 FROM public.erp_staff_requests q WHERE q.cafe_id=p_cafe AND q.type_id=t.id AND NOT deleted AND erp_requests_private.self(p_cafe,q.employee_id,q.user_id)) THEN
   more_read:=configure OR coalesce((t.config->>'moreActive')::boolean,false) AND erp_workflow_private.selector(p_cafe,t.config->'morePermissions'->'read');
   more_edit:=configure OR more_read AND erp_requests_private.base(p_cafe,'update') AND erp_workflow_private.selector(p_cafe,t.config->'morePermissions'->CASE WHEN t.config->'moreValues'='{}'::jsonb THEN 'create' ELSE 'update' END);
   more_delete:=configure OR more_read AND erp_requests_private.base(p_cafe,'delete') AND erp_workflow_private.selector(p_cafe,t.config->'morePermissions'->'delete');
   cfg:=t.config-CASE WHEN more_read THEN '__none' ELSE 'moreValues' END;
   types:=types||jsonb_build_array(cfg||jsonb_build_object('id',t.id,'revision',t.revision,'canCreate',(t.config->>'active')::boolean AND erp_requests_private.type_allowed(p_cafe,t.config,'create'),'canOthers',erp_requests_private.type_allowed(p_cafe,t.config,'others'),'canConfigure',configure,'canReadMore',more_read,'canEditMore',more_edit,'canDeleteMore',more_delete,'count',(SELECT count(*) FROM public.erp_staff_requests q WHERE q.cafe_id=p_cafe AND q.type_id=t.id AND erp_requests_private.can(p_cafe,q,t.config,'view'))));
  END IF;
  FOR r IN SELECT * FROM public.erp_staff_requests WHERE cafe_id=p_cafe AND type_id=t.id ORDER BY created_at DESC LOOP
   IF erp_requests_private.can(p_cafe,r,t.config,'view') THEN
    visible:=array_append(visible,r.id);
    records:=records||jsonb_build_array(r.payload||jsonb_build_object('id',r.id,'revision',r.revision,'number',r.number,'typeId',r.type_id,'employeeId',r.employee_id,'userId',r.user_id,'employeeName',coalesce((SELECT first_name||' '||last_name FROM public.erp_hr_employees WHERE cafe_id=p_cafe AND id=r.employee_id),(SELECT name FROM public.bf_staff WHERE cafe_id=p_cafe AND user_id=r.user_id),(SELECT name FROM public.cafes WHERE id=p_cafe AND owner_user_id=r.user_id),'موظف'),'typeName',t.config->>'name','status',r.status,'closed',r.closed,'createdAt',r.created_at,'updatedAt',r.updated_at,'fields',r.config->'fields','steps',r.config->'steps','step',r.step,'approvals',r.approvals,'emailDraft',CASE WHEN erp_requests_private.can(p_cafe,r,t.config,'edit') THEN r.email_draft ELSE NULL END,'canEdit',erp_requests_private.can(p_cafe,r,t.config,'edit'),'canDelete',erp_requests_private.can(p_cafe,r,t.config,'delete'),'canFiles',erp_requests_private.can(p_cafe,r,t.config,'files'),'notifyApprovers',coalesce((r.config->>'notifyApprovers')::boolean,false),'canApprove',erp_requests_private.can(p_cafe,r,t.config,'approve'),'canRevoke',erp_requests_private.can(p_cafe,r,t.config,'revoke'),'canClose',erp_requests_private.can(p_cafe,r,t.config,'close')));
   END IF;
  END LOOP;
 END LOOP;
 SELECT jsonb_build_object('branches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.branches WHERE cafe_id=p_cafe AND active AND deleted_at IS NULL),'[]'),'departments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.erp_org_units WHERE cafe_id=p_cafe AND kind='department' AND active),'[]'),'designations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.erp_org_units WHERE cafe_id=p_cafe AND kind='designation' AND active),'[]'),'employees',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',first_name||' '||last_name)) FROM public.erp_hr_employees WHERE cafe_id=p_cafe AND active),'[]'),'users',coalesce((SELECT jsonb_agg(x) FROM(SELECT user_id id,name FROM public.bf_staff WHERE cafe_id=p_cafe AND active UNION SELECT owner_user_id,name FROM public.cafes WHERE id=p_cafe)x),'[]'),'roles',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.erp_roles WHERE cafe_id=p_cafe AND active),'[]')) INTO lookups;
 SELECT coalesce(jsonb_agg(x ORDER BY name),'[]') INTO subjects FROM(
 SELECT e.id,e.first_name||' '||e.last_name name,'employee' kind,e.user_id=auth.uid() self,concat_ws(' ',e.code,e.payload->>'email',o.name,b.name) search FROM public.erp_hr_employees e LEFT JOIN public.erp_org_units o ON o.cafe_id=e.cafe_id AND o.id=e.department_id LEFT JOIN public.branches b ON b.cafe_id=e.cafe_id AND b.id=e.branch_id WHERE e.cafe_id=p_cafe AND e.active
 UNION ALL SELECT s.user_id,s.name,'user',s.user_id=auth.uid(),s.name FROM public.bf_staff s WHERE s.cafe_id=p_cafe AND s.active AND NOT EXISTS(SELECT 1 FROM public.erp_hr_employees e WHERE e.cafe_id=p_cafe AND e.user_id=s.user_id AND active)
 UNION ALL SELECT owner_user_id,name,'user',owner_user_id=auth.uid(),name FROM public.cafes WHERE id=p_cafe AND NOT EXISTS(SELECT 1 FROM public.erp_hr_employees e WHERE e.cafe_id=p_cafe AND e.user_id=cafes.owner_user_id AND active))x;
 RETURN jsonb_build_object('types',types,'records',records,'canConfigure',configure,'lookups',lookups,'subjects',subjects,'sources',jsonb_build_object('employees',jsonb_build_object('label','حسابات الموظفين','options',lookups->'users')),'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'recordId',e.record_id,'action',e.action,'note',e.note,'detail',e.detail,'at',e.at,'actorName',coalesce(s.name,'المالك')) ORDER BY e.at DESC) FROM public.erp_request_events e LEFT JOIN public.bf_staff s ON s.cafe_id=e.cafe_id AND s.user_id=e.actor WHERE e.cafe_id=p_cafe AND (e.record_id=ANY(visible) OR configure AND EXISTS(SELECT 1 FROM public.erp_request_types WHERE cafe_id=p_cafe AND id=e.record_id))),'[]'));
END $$;

CREATE FUNCTION public.erp_requests_write(p_cafe uuid,p_action text,p_input jsonb,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE id uuid:=(p_input->>'id')::uuid;rev integer:=(p_input->>'revision')::integer;t public.erp_request_types;r public.erp_staff_requests;prior erp_requests_private.requests;result jsonb;cfg jsonb;v jsonb;k text;a text;own boolean;note text:=coalesce(p_input->>'note','');target_status text;draft boolean;detail jsonb:='{}';
BEGIN
 IF NOT erp_requests_private.base(p_cafe,'read') THEN RAISE EXCEPTION 'لا تملك صلاحية الطلبات' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR id IS NULL OR rev IS NULL OR rev<0 OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR octet_length(p_input::text)>524288 OR length(note)>3000 OR coalesce(p_action,'') NOT IN('type','type_delete','type_active','more','more_delete','record','submit','delete','approve','reject','revoke','close','reopen','email_draft') THEN RAISE EXCEPTION 'بيانات العملية غير صالحة';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text||':requests',0));
 SELECT * INTO prior FROM erp_requests_private.requests WHERE cafe_id=p_cafe AND request_id=p_request;
 IF FOUND THEN IF prior.actor<>auth.uid() OR prior.action<>p_action OR prior.payload<>p_input THEN RAISE EXCEPTION 'رمز العملية مستخدم ببيانات مختلفة';END IF;RETURN prior.result;END IF;
 IF p_action IN('type','type_delete','type_active','more','more_delete') THEN
  SELECT * INTO t FROM public.erp_request_types WHERE cafe_id=p_cafe AND erp_request_types.id=id FOR UPDATE;
  IF coalesce(t.revision,0) IS DISTINCT FROM rev THEN RAISE EXCEPTION 'تغير نوع الطلب أعد تحميله' USING ERRCODE='40001';END IF;
  IF p_action NOT IN('more','more_delete') AND NOT erp_requests_private.base(p_cafe,'settings') THEN RAISE EXCEPTION 'إعداد أنواع الطلبات متاح للمالك فقط' USING ERRCODE='42501';END IF;
  IF p_action='type' THEN
   cfg:=p_input-'id'-'revision';
   IF length(btrim(coalesce(cfg->>'name',''))) NOT BETWEEN 1 AND 200 OR coalesce(cfg->>'icon','') NOT IN('document','person','calendar','cash','building','box','tools','heart') OR jsonb_typeof(cfg->'active') IS DISTINCT FROM 'boolean' OR jsonb_typeof(cfg->'allowSelfApproval') IS DISTINCT FROM 'boolean' OR jsonb_typeof(cfg->'notifyApprovers') IS DISTINCT FROM 'boolean' OR jsonb_typeof(cfg->'steps') IS DISTINCT FROM 'array' OR jsonb_array_length(cfg->'steps') NOT BETWEEN 1 AND 20 OR length(btrim(coalesce(cfg->>'moreName',''))) NOT BETWEEN 1 AND 150 OR jsonb_typeof(cfg->'moreActive') IS DISTINCT FROM 'boolean' OR length(coalesce(cfg->>'moreDescription',''))>3000 THEN RAISE EXCEPTION 'راجع بيانات النوع وخطوات الموافقة';END IF;
   FOREACH k IN ARRAY ARRAY['create','others','view','approve'] LOOP PERFORM erp_workflow_private.validate_selector(p_cafe,cfg->'permissions'->k);END LOOP;
   FOREACH k IN ARRAY ARRAY['create','update','read','delete'] LOOP PERFORM erp_workflow_private.validate_selector(p_cafe,cfg->'morePermissions'->k);END LOOP;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(cfg->'steps') x GROUP BY x->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'خطوات الموافقة مكررة';END IF;
   FOR v IN SELECT value FROM jsonb_array_elements(cfg->'steps') LOOP PERFORM (v->>'id')::uuid;IF v->>'id' IS NULL OR length(btrim(coalesce(v->>'name',''))) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'اسم خطوة الموافقة مطلوب';END IF;PERFORM erp_workflow_private.validate_selector(p_cafe,v->'selector');END LOOP;
   PERFORM erp_manufacturing_private.validate_custom_fields(cfg->'fields');PERFORM erp_requests_private.field_scope(cfg->'fields');PERFORM erp_manufacturing_private.validate_custom_fields(cfg->'moreFields');PERFORM erp_requests_private.field_scope(cfg->'moreFields');
   -- Saving a schema may precede entering required values or uploading its attachments.
   v:=erp_manufacturing_private.custom_defaults(cfg->'moreFields',coalesce(cfg->'moreValues','{}'));PERFORM erp_requests_private.validate_more(cfg->'moreFields',v,p_cafe,id,NULL,0,true);cfg:=jsonb_set(cfg,'{moreValues}',v);
   INSERT INTO public.erp_request_types(id,cafe_id,config) VALUES(id,p_cafe,cfg) ON CONFLICT ON CONSTRAINT erp_request_types_cafe_id_id_key DO UPDATE SET config=excluded.config,revision=erp_request_types.revision+1,updated_at=now();
  ELSIF p_action='type_delete' THEN IF t.id IS NULL THEN RAISE EXCEPTION 'النوع غير موجود';END IF;DELETE FROM public.erp_request_types WHERE cafe_id=p_cafe AND erp_request_types.id=id;
  ELSIF p_action='type_active' THEN IF t.id IS NULL THEN RAISE EXCEPTION 'النوع غير موجود';END IF;UPDATE public.erp_request_types SET config=jsonb_set(config,'{active}',to_jsonb(NOT(config->>'active')::boolean)),revision=revision+1,updated_at=now() WHERE cafe_id=p_cafe AND erp_request_types.id=id;
  ELSE
   a:=CASE WHEN p_action='more_delete' THEN 'delete' WHEN t.config->'moreValues'='{}'::jsonb THEN 'create' ELSE 'update' END;
   IF t.id IS NULL OR NOT erp_requests_private.base(p_cafe,CASE WHEN a='create' THEN 'update' ELSE a END) OR NOT(erp_requests_private.base(p_cafe,'settings') OR (t.config->>'moreActive')::boolean AND erp_requests_private.type_allowed(p_cafe,t.config,'view') AND erp_workflow_private.selector(p_cafe,t.config->'morePermissions'->'read') AND erp_workflow_private.selector(p_cafe,t.config->'morePermissions'->a)) THEN RAISE EXCEPTION 'لا تملك صلاحية المعلومات الإضافية' USING ERRCODE='42501';END IF;
   v:=CASE WHEN p_action='more_delete' THEN '{}'::jsonb ELSE erp_manufacturing_private.custom_defaults(t.config->'moreFields',p_input->'values') END;
   IF p_action='more' THEN PERFORM erp_requests_private.validate_more(t.config->'moreFields',v,p_cafe,id);END IF;
   UPDATE public.erp_request_types SET config=jsonb_set(config,'{moreValues}',v),revision=revision+1,updated_at=now() WHERE cafe_id=p_cafe AND erp_request_types.id=id;
  END IF;
 ELSE
  SELECT * INTO r FROM public.erp_staff_requests WHERE cafe_id=p_cafe AND erp_staff_requests.id=id FOR UPDATE;
  IF r.deleted OR coalesce(r.revision,0) IS DISTINCT FROM rev THEN RAISE EXCEPTION 'تغير الطلب أعد تحميله' USING ERRCODE='40001';END IF;
  SELECT * INTO t FROM public.erp_request_types WHERE cafe_id=p_cafe AND erp_request_types.id=coalesce(r.type_id,(p_input->>'typeId')::uuid) FOR SHARE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'نوع الطلب غير متاح';END IF;
  IF p_action='record' THEN
   draft:=(p_input->>'draft')::boolean;
   IF draft IS NULL OR NOT(t.config->>'active')::boolean OR NOT erp_requests_private.base(p_cafe,CASE WHEN rev=0 THEN 'create' ELSE 'update' END) OR (rev=0 AND NOT erp_requests_private.type_allowed(p_cafe,t.config,'create')) OR (rev>0 AND NOT erp_requests_private.can(p_cafe,r,t.config,'edit')) THEN RAISE EXCEPTION 'لا تملك صلاحية إضافة أو تعديل هذا الطلب' USING ERRCODE='42501';END IF;
   IF num_nonnulls(p_input->>'employeeId',p_input->>'userId')<>1 OR (p_input->>'typeId')::uuid IS DISTINCT FROM t.id THEN RAISE EXCEPTION 'اختر موظفًا واحدًا من النوع المحدد';END IF;
   IF p_input->>'employeeId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_hr_employees WHERE cafe_id=p_cafe AND erp_hr_employees.id=(p_input->>'employeeId')::uuid AND active) OR p_input->>'userId' IS NOT NULL AND NOT(EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=p_cafe AND user_id=(p_input->>'userId')::uuid AND active) OR EXISTS(SELECT 1 FROM public.cafes WHERE cafes.id=p_cafe AND owner_user_id=(p_input->>'userId')::uuid)) THEN RAISE EXCEPTION 'الموظف غير متاح في العلامة';END IF;
   own:=coalesce(erp_requests_private.self(p_cafe,(p_input->>'employeeId')::uuid,(p_input->>'userId')::uuid),false);
   IF NOT own AND NOT erp_requests_private.type_allowed(p_cafe,t.config,'others') THEN RAISE EXCEPTION 'لا يمكنك إضافة طلب بالنيابة عن الآخرين' USING ERRCODE='42501';END IF;
   IF length(btrim(coalesce(p_input->>'description',''))) NOT BETWEEN 1 AND 10000 OR p_input->>'applicationDate' IS NULL OR p_input->>'executionDate' IS NULL OR NOT isfinite((p_input->>'applicationDate')::date) OR NOT isfinite((p_input->>'executionDate')::date) THEN RAISE EXCEPTION 'راجع وصف وتواريخ الطلب';END IF;
   cfg:=t.config;v:=erp_manufacturing_private.custom_defaults(cfg->'fields',p_input->'customValues');PERFORM erp_requests_private.validate_values(cfg->'fields',v,p_cafe,id,t.id,0,draft);
   INSERT INTO public.erp_staff_requests(id,cafe_id,type_id,employee_id,user_id,payload,config,status,created_by) VALUES(id,p_cafe,t.id,(p_input->>'employeeId')::uuid,(p_input->>'userId')::uuid,jsonb_build_object('applicationDate',p_input->>'applicationDate','executionDate',p_input->>'executionDate','description',p_input->>'description','customValues',v),cfg,CASE WHEN draft THEN 'draft' ELSE 'pending' END,auth.uid()) ON CONFLICT ON CONSTRAINT erp_staff_requests_cafe_id_id_key DO UPDATE SET employee_id=excluded.employee_id,user_id=excluded.user_id,payload=excluded.payload,config=excluded.config,status=excluded.status,step=0,approvals='[]',email_draft=NULL,revision=erp_staff_requests.revision+1,updated_at=now();
   detail:=jsonb_build_object('approvalReset',rev>0,'draft',draft);
  ELSIF p_action='submit' THEN
   IF r.status<>'draft' OR NOT erp_requests_private.can(p_cafe,r,t.config,'edit') OR NOT(t.config->>'active')::boolean THEN RAISE EXCEPTION 'المسودة غير متاحة للتقديم' USING ERRCODE='42501';END IF;
   v:=erp_manufacturing_private.custom_defaults(t.config->'fields',r.payload->'customValues');PERFORM erp_requests_private.validate_values(t.config->'fields',v,p_cafe,id,t.id);
   UPDATE public.erp_staff_requests SET payload=jsonb_set(payload,'{customValues}',v),config=t.config,status='pending',revision=revision+1,updated_at=now() WHERE cafe_id=p_cafe AND erp_staff_requests.id=id;
  ELSE
   a:=CASE WHEN p_action IN('approve','reject') THEN 'approve' WHEN p_action IN('close','reopen') THEN 'close' WHEN p_action='email_draft' THEN 'edit' ELSE p_action END;
   IF NOT erp_requests_private.can(p_cafe,r,t.config,a) THEN RAISE EXCEPTION 'الطلب أو خطوة الموافقة غير متاح لهذه العملية' USING ERRCODE='42501';END IF;
   IF p_action='approve' THEN
    target_status:=CASE WHEN r.step+1=jsonb_array_length(r.config->'steps') THEN 'approved' ELSE 'pending' END;
    UPDATE public.erp_staff_requests SET approvals=approvals||jsonb_build_array(jsonb_build_object('actor',auth.uid(),'name',coalesce((SELECT name FROM public.bf_staff WHERE cafe_id=p_cafe AND user_id=auth.uid()),'المالك'),'step',step,'at',now(),'note',note)),step=step+1,status=target_status WHERE cafe_id=p_cafe AND erp_staff_requests.id=id;detail:=jsonb_build_object('step',r.step,'status',target_status);
   ELSIF p_action='reject' THEN IF length(btrim(note))=0 THEN RAISE EXCEPTION 'أدخل سبب رفض الطلب';END IF;UPDATE public.erp_staff_requests SET status='rejected' WHERE cafe_id=p_cafe AND erp_staff_requests.id=id;
   ELSIF p_action='revoke' THEN IF length(btrim(note))=0 THEN RAISE EXCEPTION 'أدخل سبب إلغاء الموافقة أو إعادة المراجعة';END IF;UPDATE public.erp_staff_requests SET status='pending',step=0,approvals='[]' WHERE cafe_id=p_cafe AND erp_staff_requests.id=id;detail:=jsonb_build_object('previousApprovals',r.approvals,'previousStatus',r.status);
   ELSIF p_action IN('close','reopen') THEN IF r.closed=(p_action='close') THEN RAISE EXCEPTION 'حالة الطلب تغيرت بالفعل';END IF;UPDATE public.erp_staff_requests SET closed=p_action='close' WHERE cafe_id=p_cafe AND erp_staff_requests.id=id;
   ELSIF p_action='delete' THEN UPDATE public.erp_staff_requests SET deleted=true WHERE cafe_id=p_cafe AND erp_staff_requests.id=id;
   ELSIF p_action='email_draft' THEN IF length(btrim(coalesce(p_input->>'subject',''))) NOT BETWEEN 1 AND 200 OR length(btrim(coalesce(p_input->>'body',''))) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'أدخل عنوان ونص البريد الإلكتروني';END IF;UPDATE public.erp_staff_requests SET email_draft=jsonb_build_object('subject',p_input->>'subject','body',p_input->>'body') WHERE cafe_id=p_cafe AND erp_staff_requests.id=id;
   END IF;
   UPDATE public.erp_staff_requests SET revision=revision+1,updated_at=now() WHERE cafe_id=p_cafe AND erp_staff_requests.id=id;
  END IF;
 END IF;
 result:=jsonb_build_object('id',id,'revision',rev+1,'deleted',p_action IN('delete','type_delete'));
 INSERT INTO public.erp_request_events(cafe_id,record_id,action,actor,note,detail) VALUES(p_cafe,id,p_action,auth.uid(),note,detail);
 INSERT INTO erp_requests_private.requests VALUES(p_cafe,p_request,auth.uid(),p_action,p_input,result);RETURN result;
END $$;

-- Keep request data behind tenant-aware RPCs and the shared private file policy
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['erp_request_types','erp_staff_requests','erp_request_events'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;END $$;
ALTER TABLE erp_requests_private.requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_requests_private.requests FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION erp_file_private.assert_record(uuid,text,uuid,boolean) RENAME TO assert_record_before_requests;
CREATE FUNCTION erp_file_private.assert_record(c uuid,t text,i uuid,w boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE r public.erp_staff_requests;cfg jsonb;BEGIN
 IF t='request_record' THEN
  SELECT * INTO r FROM public.erp_staff_requests WHERE cafe_id=c AND id=i FOR KEY SHARE;
  SELECT config INTO cfg FROM public.erp_request_types WHERE cafe_id=c AND id=r.type_id;
  IF r.id IS NULL OR NOT erp_requests_private.can(c,r,cfg,CASE WHEN w THEN 'files' ELSE 'view' END) THEN RAISE EXCEPTION 'لا تملك صلاحية مرفقات الطلب' USING ERRCODE='42501';END IF;
 ELSIF t='request_type' THEN
  SELECT config INTO cfg FROM public.erp_request_types WHERE cafe_id=c AND id=i FOR KEY SHARE;
  IF cfg IS NULL OR NOT erp_requests_private.base(c,CASE WHEN w THEN 'files' ELSE 'read' END) OR NOT(erp_requests_private.base(c,'settings') OR coalesce((cfg->>'moreActive')::boolean,false) AND erp_requests_private.type_allowed(c,cfg,'view') AND erp_workflow_private.selector(c,cfg->'morePermissions'->'read') AND(NOT w OR erp_workflow_private.selector(c,cfg->'morePermissions'->'update'))) THEN RAISE EXCEPTION 'لا تملك صلاحية مرفقات نوع الطلب' USING ERRCODE='42501';END IF;
 ELSE PERFORM erp_file_private.assert_record_before_requests(c,t,i,w);END IF;
END $$;
ALTER FUNCTION erp_access_private.file_domain(text) RENAME TO file_domain_before_requests;
CREATE FUNCTION erp_access_private.file_domain(t text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$SELECT CASE WHEN t IN('request_record','request_type') THEN 'requests' ELSE erp_access_private.file_domain_before_requests(t) END$$;
CREATE TRIGGER erp_file_orphan_guard BEFORE DELETE ON public.erp_request_types FOR EACH ROW EXECUTE FUNCTION erp_file_private.prevent_orphans('request_type');
CREATE FUNCTION erp_requests_private.file_delete_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$BEGIN IF NEW.deleted AND NOT OLD.deleted AND EXISTS(SELECT 1 FROM public.erp_files WHERE cafe_id=OLD.cafe_id AND record_id=OLD.id AND entity_type='request_record') THEN RAISE EXCEPTION 'احذف مرفقات الطلب قبل حذف الطلب';END IF;RETURN NEW;END $$;
CREATE TRIGGER erp_request_file_guard BEFORE UPDATE OF deleted ON public.erp_staff_requests FOR EACH ROW EXECUTE FUNCTION erp_requests_private.file_delete_guard();

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_requests_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_file_private.assert_record(uuid,text,uuid,boolean),erp_file_private.assert_record_before_requests(uuid,text,uuid,boolean),erp_access_private.file_domain(text),erp_access_private.file_domain_before_requests(text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.erp_requests_read(uuid),public.erp_requests_write(uuid,text,jsonb,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.erp_requests_read(uuid),public.erp_requests_write(uuid,text,jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
