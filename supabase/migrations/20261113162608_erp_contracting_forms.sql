BEGIN;
CREATE SCHEMA erp_contract_form_private;
REVOKE ALL ON SCHEMA erp_contract_form_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.erp_contracting_forms(
 id uuid PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id),kind text NOT NULL CHECK(kind IN('primary','related')),
 key text NOT NULL CHECK(key~'^[a-z][a-z0-9_]{0,59}$'),revision integer NOT NULL DEFAULT 1,
 config jsonb NOT NULL CHECK(jsonb_typeof(config)='object' AND octet_length(config::text)<=300000),
 UNIQUE(cafe_id,id),UNIQUE(cafe_id,id,kind),UNIQUE(cafe_id,key));
CREATE UNIQUE INDEX contracting_primary_form ON public.erp_contracting_forms(cafe_id) WHERE kind='primary';
CREATE TABLE public.erp_contracting_form_entries(
 id uuid PRIMARY KEY,cafe_id uuid NOT NULL,model_id uuid NOT NULL,model_kind text NOT NULL,project_id uuid NOT NULL,
 revision integer NOT NULL DEFAULT 1,draft boolean NOT NULL DEFAULT false,field_values jsonb NOT NULL CHECK(jsonb_typeof(field_values)='object' AND octet_length(field_values::text)<=262144),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL REFERENCES auth.users(id),
 UNIQUE(cafe_id,id),FOREIGN KEY(cafe_id,model_id,model_kind) REFERENCES public.erp_contracting_forms(cafe_id,id,kind),
 FOREIGN KEY(cafe_id,project_id) REFERENCES public.erp_contracting_documents(cafe_id,id));
CREATE UNIQUE INDEX contracting_primary_entry ON public.erp_contracting_form_entries(cafe_id,project_id) WHERE model_kind='primary';
CREATE INDEX contracting_form_project ON public.erp_contracting_form_entries(cafe_id,project_id,model_id);
CREATE TABLE public.erp_contracting_form_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),project_id uuid,model_id uuid NOT NULL,entry_id uuid,action text NOT NULL,actor uuid NOT NULL REFERENCES auth.users(id),at timestamptz NOT NULL DEFAULT now());
CREATE INDEX contracting_form_event_project ON public.erp_contracting_form_events(cafe_id,project_id,at);
CREATE TRIGGER contracting_form_audit BEFORE UPDATE OR DELETE ON public.erp_contracting_form_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TABLE erp_contract_form_private.requests(cafe_id uuid NOT NULL,request_id uuid NOT NULL,actor uuid NOT NULL,action text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,PRIMARY KEY(cafe_id,request_id));
DO $$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['erp_contracting_forms','erp_contracting_form_entries','erp_contracting_form_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('CREATE TRIGGER cancellation_archive_guard BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION brand_cancellation_private.guard_archive()',t);
  EXECUTE format('CREATE POLICY cancellation_archive_scope ON public.%I AS RESTRICTIVE FOR ALL TO anon,authenticated USING(public.brand_account_not_cancelled(cafe_id) OR public.is_platform_admin()) WITH CHECK(public.brand_account_not_cancelled(cafe_id))',t);
 END LOOP;
END $$;
CREATE FUNCTION erp_contract_form_private.authorize(c uuid,a text) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$DECLARE r text;BEGIN
 r:=brand_finance_private.role_for(c);
 IF auth.uid() IS NULL OR NOT public.brand_account_not_cancelled(c) OR r IS NULL OR r NOT IN('owner','manager','accountant','auditor') OR(a<>'read' AND r='auditor') OR(a='settings' AND r<>'owner') THEN RAISE EXCEPTION 'لا تملك صلاحية نماذج المقاولات' USING ERRCODE='42501';END IF;
 PERFORM erp_access_private.assert_allowed(c,'contracting',a);
END $$;
CREATE FUNCTION erp_contract_form_private.project_visible(c uuid,p uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.erp_contracting_documents d WHERE d.cafe_id=c AND d.id=p AND d.kind='project' AND erp_branch_private.row_allowed(c,erp_branch_private.current_branch(c),to_jsonb(d),''))
$$;
CREATE FUNCTION erp_contract_form_private.allowed(c uuid,j jsonb,a text) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT erp_access_private.allowed(c,'contracting',a) AND (a='read' OR brand_finance_private.role_for(c) IN('owner','manager','accountant')) AND (brand_finance_private.role_for(c)='owner' OR erp_workflow_private.selector(c,j#>ARRAY['permissions',a]))
$$;
CREATE FUNCTION erp_contract_form_private.fields(c uuid,j jsonb,a text) RETURNS text[] LANGUAGE plpgsql STABLE SET search_path='' AS $$DECLARE result text[];r jsonb;BEGIN
 SELECT coalesce(array_agg(f->>'id'),'{}') INTO result FROM jsonb_array_elements(j->'fields') f;
 IF brand_finance_private.role_for(c)='owner' THEN RETURN result;END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(j#>'{permissions,fieldRules}') LOOP
  IF erp_workflow_private.selector(c,r->'selector') THEN SELECT ARRAY(SELECT unnest(result) INTERSECT SELECT jsonb_array_elements_text(r->a)) INTO result;END IF;
 END LOOP;RETURN result;
END $$;
-- Reuse the proven 21-type recursive validator, with strictly owned entry/file/unique scopes.
DO $$DECLARE src text;BEGIN
 SELECT pg_get_functiondef('erp_workflow_private.validate_child_values(jsonb,jsonb,uuid,uuid,uuid,integer,boolean)'::regprocedure) INTO src;
 IF position('erp_workflow_children' IN src)=0 OR position('workflow_child' IN src)=0 THEN RAISE EXCEPTION 'Unexpected shared field validator';END IF;
 src:=replace(src,'erp_workflow_private.validate_child_values','erp_contract_form_private.validate_values');
 src:=replace(src,'erp_workflow_children','erp_contracting_form_entries');src:=replace(src,'''workflow_child''','''contracting_form_entry''');EXECUTE src;
END $$;
CREATE FUNCTION erp_contract_form_private.value_scope(c uuid,fields jsonb,vals jsonb,depth integer DEFAULT 0) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$DECLARE f jsonb;v jsonb;x jsonb;k text;b uuid:=erp_branch_private.current_branch(c);BEGIN
 IF depth>2 OR jsonb_typeof(vals) IS DISTINCT FROM 'object' THEN RETURN false;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(vals) q(value) WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(fields) ff(value) WHERE ff.value->>'id'=q.value)) THEN RETURN false;END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(fields) LOOP
  v:=vals->(f->>'id');IF v IS NULL OR v='null' OR v='""' THEN CONTINUE;END IF;
  IF f->>'type'='subform' THEN
   IF jsonb_typeof(v)<>'array' THEN RETURN false;END IF;
   FOR x IN SELECT value FROM jsonb_array_elements(v) LOOP IF NOT erp_contract_form_private.value_scope(c,f->'fields',x,depth+1) THEN RETURN false;END IF;END LOOP;
  ELSIF f->>'type' IN('dynamic','multidynamic') THEN
   k:=CASE f->>'entity' WHEN 'customers' THEN 'customer' WHEN 'items' THEN 'item' WHEN 'accounts' THEN 'account' ELSE '' END;
   FOR x IN SELECT value FROM jsonb_array_elements(CASE WHEN f->>'type'='dynamic' THEN jsonb_build_array(v) ELSE v END) LOOP
    IF k<>'' AND NOT erp_branch_private.allowed_resource(c,b,k,(x#>>'{}')::uuid) THEN RETURN false;END IF;
    IF NOT erp_branch_private.row_allowed(c,b,jsonb_build_object('id',x),'') THEN RETURN false;END IF;
    IF f->>'entity'='employees' AND b IS NOT NULL AND EXISTS(SELECT 1 FROM public.erp_hr_employees h WHERE h.cafe_id=c AND h.user_id=(x#>>'{}')::uuid AND h.active AND h.branch_id IS NOT NULL AND h.branch_id<>b AND NOT EXISTS(SELECT 1 FROM public.erp_branch_members bm WHERE bm.cafe_id=c AND bm.employee_id=h.id AND bm.branch_id=b)) THEN RETURN false;END IF;
    IF f->>'entity'='warehouses' AND NOT EXISTS(SELECT 1 FROM public.bf_warehouses w WHERE w.cafe_id=c AND w.id=(x#>>'{}')::uuid AND erp_branch_private.row_allowed(c,b,to_jsonb(w),'warehouse')) THEN RETURN false;END IF;
   END LOOP;
  END IF;
 END LOOP;RETURN true;
END $$;
CREATE FUNCTION erp_contract_form_private.mask(c uuid,j jsonb,v jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$DECLARE result jsonb:='{}';f jsonb;keys text[]:=erp_contract_form_private.fields(c,j,'read');BEGIN
 FOR f IN SELECT value FROM jsonb_array_elements(j->'fields') LOOP IF f->>'id'=ANY(keys) AND v?(f->>'id') AND erp_contract_form_private.value_scope(c,jsonb_build_array(f),jsonb_build_object(f->>'id',v->(f->>'id'))) THEN result:=result||jsonb_build_object(f->>'id',v->(f->>'id'));END IF;END LOOP;RETURN result;
END $$;
CREATE FUNCTION erp_contract_form_private.assert_entry(c uuid,i uuid,a text) RETURNS public.erp_contracting_form_entries LANGUAGE plpgsql SET search_path='' AS $$DECLARE e public.erp_contracting_form_entries;cfg jsonb;BEGIN
 PERFORM erp_contract_form_private.authorize(c,a);
 SELECT * INTO e FROM public.erp_contracting_form_entries WHERE cafe_id=c AND id=i FOR KEY SHARE;
 SELECT config INTO cfg FROM public.erp_contracting_forms WHERE cafe_id=c AND id=e.model_id;
 IF e.id IS NULL OR NOT erp_contract_form_private.project_visible(c,e.project_id) OR NOT erp_contract_form_private.allowed(c,cfg,'read') OR NOT erp_contract_form_private.allowed(c,cfg,a) THEN RAISE EXCEPTION 'السجل غير متاح' USING ERRCODE='42501';END IF;RETURN e;
END $$;
CREATE FUNCTION public.erp_contracting_forms_read(p_cafe uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE m record;e record;models jsonb:='[]';entries jsonb:='[]';cfg jsonb;visible jsonb;settings boolean;lookups jsonb:='{}';BEGIN
 PERFORM erp_contract_form_private.authorize(p_cafe,'read');PERFORM erp_branch_private.enter(p_cafe);
 settings:=brand_finance_private.role_for(p_cafe)='owner' AND erp_access_private.allowed(p_cafe,'contracting','settings');
 FOR m IN SELECT * FROM public.erp_contracting_forms WHERE cafe_id=p_cafe ORDER BY kind,key LOOP
  cfg:=m.config;
  IF NOT settings AND NOT erp_contract_form_private.allowed(p_cafe,cfg,'read') THEN CONTINUE;END IF;
  visible:=CASE WHEN settings THEN cfg ELSE cfg-'permissions' END;
  IF NOT settings THEN visible:=jsonb_set(visible,'{fields}',coalesce((SELECT jsonb_agg(CASE WHEN f?'defaultValue' AND NOT erp_contract_form_private.value_scope(p_cafe,jsonb_build_array(f),jsonb_build_object(f->>'id',f->'defaultValue')) THEN f-'defaultValue' ELSE f END) FROM jsonb_array_elements(cfg->'fields') f WHERE f->>'id'=ANY(erp_contract_form_private.fields(p_cafe,cfg,'read'))),'[]'));END IF;
  models:=models||jsonb_build_array(visible||jsonb_build_object('id',m.id,'revision',m.revision,'kind',m.kind,'key',m.key,'canCreate',coalesce((cfg->>'active')::boolean,false) AND erp_contract_form_private.allowed(p_cafe,cfg,'create'),'canRead',erp_contract_form_private.allowed(p_cafe,cfg,'read'),'canUpdate',coalesce((cfg->>'active')::boolean,false) AND erp_contract_form_private.allowed(p_cafe,cfg,'update'),'canDelete',erp_contract_form_private.allowed(p_cafe,cfg,'delete'),'allowedFields',jsonb_build_object('create',erp_contract_form_private.fields(p_cafe,cfg,'create'),'read',erp_contract_form_private.fields(p_cafe,cfg,'read'),'update',erp_contract_form_private.fields(p_cafe,cfg,'update'))));
  IF NOT erp_contract_form_private.allowed(p_cafe,cfg,'read') THEN CONTINUE;END IF;
  FOR e IN SELECT * FROM public.erp_contracting_form_entries WHERE cafe_id=p_cafe AND model_id=m.id LOOP
   IF NOT erp_contract_form_private.project_visible(p_cafe,e.project_id) THEN CONTINUE;END IF;
   entries:=entries||jsonb_build_array(jsonb_build_object('id',e.id,'modelId',e.model_id,'projectId',e.project_id,'revision',e.revision,'draft',e.draft,'values',erp_contract_form_private.mask(p_cafe,cfg,e.field_values),'createdAt',e.created_at,'canUpdate',coalesce((cfg->>'active')::boolean,false) AND erp_contract_form_private.allowed(p_cafe,cfg,'update'),'canDelete',erp_contract_form_private.allowed(p_cafe,cfg,'delete'),'canFiles',erp_contract_form_private.allowed(p_cafe,cfg,'update') AND erp_access_private.allowed(p_cafe,'contracting','files') AND cardinality(erp_contract_form_private.fields(p_cafe,cfg,'read'))=jsonb_array_length(cfg->'fields')));
  END LOOP;
 END LOOP;
 IF settings THEN
  lookups:=jsonb_build_object('branches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.branches WHERE cafe_id=p_cafe),'[]'),'departments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.erp_org_units WHERE cafe_id=p_cafe AND kind='department' AND active),'[]'),'designations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.erp_org_units WHERE cafe_id=p_cafe AND kind='designation' AND active),'[]'),'employees',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',first_name||' '||last_name)) FROM public.erp_hr_employees WHERE cafe_id=p_cafe AND active),'[]'),'users',coalesce((SELECT jsonb_agg(jsonb_build_object('id',user_id,'name',name)) FROM public.bf_staff WHERE cafe_id=p_cafe AND active),'[]'),'roles',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.erp_roles WHERE cafe_id=p_cafe AND active),'[]'));
 END IF;
 RETURN jsonb_build_object('models',models,'entries',entries,'canConfigure',settings,'lookups',lookups,'branchScope',public.erp_branch_context(p_cafe)->'scope','events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',ev.id,'projectId',ev.project_id,'action',ev.action,'at',ev.at)) FROM public.erp_contracting_form_events ev WHERE ev.cafe_id=p_cafe AND (ev.project_id IS NULL AND settings OR erp_contract_form_private.project_visible(p_cafe,ev.project_id)) AND EXISTS(SELECT 1 FROM public.erp_contracting_forms fm WHERE fm.cafe_id=p_cafe AND fm.id=ev.model_id AND erp_contract_form_private.allowed(p_cafe,fm.config,'read'))),'[]'));
END $$;
CREATE FUNCTION public.erp_contracting_forms_write(p_cafe uuid,p_action text,p_input jsonb,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i uuid:=(p_input->>'id')::uuid;rev integer:=(p_input->>'revision')::integer;m public.erp_contracting_forms;e public.erp_contracting_form_entries;prior erp_contract_form_private.requests;cfg jsonb;v jsonb;r jsonb;a text;k text;pid uuid;mid uuid;keys text[];result jsonb;rowdata record;BEGIN
 a:=CASE WHEN p_action='model' OR p_action='delete' AND p_input->>'entity'='model' THEN 'settings' WHEN p_action='delete' THEN 'delete' WHEN rev=0 THEN 'create' ELSE 'update' END;
 PERFORM erp_contract_form_private.authorize(p_cafe,a);PERFORM erp_branch_private.assert_context(p_cafe);PERFORM erp_branch_private.enter(p_cafe);
 IF p_action NOT IN('model','entry','delete') OR p_request IS NULL OR i IS NULL OR rev IS NULL OR rev<0 OR jsonb_typeof(p_input)<>'object' OR octet_length(p_input::text)>400000 THEN RAISE EXCEPTION 'بيانات النموذج غير صالحة' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,60412));
 SELECT * INTO prior FROM erp_contract_form_private.requests WHERE cafe_id=p_cafe AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor IS DISTINCT FROM auth.uid() OR prior.action<>p_action OR prior.payload<>p_input THEN RAISE EXCEPTION 'معرف عملية مكرر ببيانات مختلفة' USING ERRCODE='40001';END IF;
  IF prior.result->>'projectId' IS NOT NULL AND NOT erp_contract_form_private.project_visible(p_cafe,(prior.result->>'projectId')::uuid) THEN RAISE EXCEPTION 'المشروع غير متاح' USING ERRCODE='42501';END IF;
  SELECT * INTO m FROM public.erp_contracting_forms WHERE cafe_id=p_cafe AND id=(prior.result->>'modelId')::uuid;
  IF a<>'settings' AND (m.id IS NULL OR NOT erp_contract_form_private.allowed(p_cafe,m.config,'read') OR NOT erp_contract_form_private.allowed(p_cafe,m.config,a)) THEN RAISE EXCEPTION 'النموذج غير متاح' USING ERRCODE='42501';END IF;RETURN prior.result;
 END IF;
 IF p_action='model' THEN
  SELECT * INTO m FROM public.erp_contracting_forms WHERE cafe_id=p_cafe AND id=i FOR UPDATE;
  IF coalesce(m.revision,0) IS DISTINCT FROM rev THEN RAISE EXCEPTION 'Conflict' USING ERRCODE='40001';END IF;
  cfg:=p_input-'id'-'revision';
  IF coalesce(cfg->>'kind','') NOT IN('primary','related') OR coalesce(cfg->>'key','')!~'^[a-z][a-z0-9_]{0,59}$' OR length(btrim(coalesce(cfg->>'name',''))) NOT BETWEEN 1 AND 160 OR jsonb_typeof(cfg->'active') IS DISTINCT FROM 'boolean' OR length(coalesce(cfg->>'description',''))>5000 OR jsonb_typeof(cfg->'permissions') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'تعريف النموذج غير صالح' USING ERRCODE='22023';END IF;
  IF m.id IS NOT NULL AND m.kind<>cfg->>'kind' THEN RAISE EXCEPTION 'لا يمكن تغيير نوع النموذج';END IF;
  PERFORM erp_manufacturing_private.validate_custom_fields(cfg->'fields');
  IF coalesce(cfg->>'nameField','')<>'' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(cfg->'fields') f WHERE f->>'id'=cfg->>'nameField' AND f->>'type' IN('text','number','date','email','phone')) THEN RAISE EXCEPTION 'اختر حقل اسم صالح';END IF;
  FOREACH k IN ARRAY ARRAY['create','read','update','delete'] LOOP PERFORM erp_workflow_private.validate_selector(p_cafe,cfg#>ARRAY['permissions',k]);END LOOP;
  IF jsonb_typeof(cfg#>'{permissions,fieldRules}') IS DISTINCT FROM 'array' OR jsonb_array_length(cfg#>'{permissions,fieldRules}')>50 THEN RAISE EXCEPTION 'قواعد الحقول غير صالحة';END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(cfg#>'{permissions,fieldRules}') LOOP
   PERFORM (r->>'id')::uuid;PERFORM erp_workflow_private.validate_selector(p_cafe,r->'selector');
   FOREACH k IN ARRAY ARRAY['create','read','update'] LOOP
    IF jsonb_typeof(r->k) IS DISTINCT FROM 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(r->k) x WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(cfg->'fields') f WHERE f->>'id'=x)) THEN RAISE EXCEPTION 'صلاحيات الحقول غير صالحة';END IF;
   END LOOP;
  END LOOP;
  FOR r IN SELECT value FROM jsonb_array_elements(cfg#>'{permissions,fieldRules}') LOOP
   IF NOT ((r->'read') @> (r->'create')) OR NOT ((r->'read') @> (r->'update')) OR EXISTS(SELECT 1 FROM jsonb_array_elements(cfg->'fields') f WHERE coalesce((f->>'required')::boolean,false) AND NOT (r->'create')?(f->>'id')) THEN RAISE EXCEPTION 'الحقول المطلوبة والقابلة للتعديل يجب أن تكون متاحة للعرض والإضافة';END IF;
  END LOOP;
  FOR rowdata IN SELECT * FROM public.erp_contracting_form_entries WHERE cafe_id=p_cafe AND model_id=i LOOP
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(rowdata.field_values) x WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(cfg->'fields') f WHERE f->>'id'=x)) THEN RAISE EXCEPTION 'الحقل يحتوي بيانات محفوظة ولا يمكن حذفه';END IF;
   PERFORM erp_contract_form_private.validate_values(cfg->'fields',rowdata.field_values,p_cafe,rowdata.id,i,0,rowdata.draft);
  END LOOP;
  INSERT INTO public.erp_contracting_forms(id,cafe_id,kind,key,config) VALUES(i,p_cafe,cfg->>'kind',cfg->>'key',cfg) ON CONFLICT(id) DO UPDATE SET config=excluded.config,key=excluded.key,revision=public.erp_contracting_forms.revision+1 WHERE public.erp_contracting_forms.cafe_id=p_cafe;
  IF NOT FOUND THEN RAISE EXCEPTION 'النموذج غير متاح' USING ERRCODE='42501';END IF;mid:=i;
 ELSIF p_action='entry' THEN
  pid:=(p_input->>'projectId')::uuid;mid:=(p_input->>'modelId')::uuid;
  IF NOT erp_contract_form_private.project_visible(p_cafe,pid) THEN RAISE EXCEPTION 'المشروع غير متاح' USING ERRCODE='42501';END IF;
  SELECT * INTO m FROM public.erp_contracting_forms WHERE cafe_id=p_cafe AND id=mid FOR KEY SHARE;
  SELECT * INTO e FROM public.erp_contracting_form_entries WHERE cafe_id=p_cafe AND id=i FOR UPDATE;
  IF m.id IS NULL OR NOT coalesce((m.config->>'active')::boolean,false) OR NOT erp_contract_form_private.allowed(p_cafe,m.config,'read') OR NOT erp_contract_form_private.allowed(p_cafe,m.config,a) THEN RAISE EXCEPTION 'النموذج غير متاح' USING ERRCODE='42501';END IF;
  IF e.id IS NOT NULL AND (e.project_id<>pid OR e.model_id<>mid) THEN RAISE EXCEPTION 'لا يمكن نقل سجل النموذج';END IF;
  IF coalesce(e.revision,0) IS DISTINCT FROM rev THEN RAISE EXCEPTION 'Conflict' USING ERRCODE='40001';END IF;
  IF jsonb_typeof(p_input->'draft') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_input->'values') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'قيم النموذج غير صالحة';END IF;
  keys:=erp_contract_form_private.fields(p_cafe,m.config,a);
  FOR k,v IN SELECT * FROM jsonb_each(p_input->'values') LOOP IF NOT k=ANY(keys) THEN RAISE EXCEPTION 'لا تملك صلاحية تعديل الحقل' USING ERRCODE='42501';END IF;END LOOP;
  v:=coalesce(e.field_values,'{}')||(p_input->'values');v:=erp_manufacturing_private.custom_defaults(m.config->'fields',v);
  IF NOT erp_contract_form_private.value_scope(p_cafe,m.config->'fields',v) THEN RAISE EXCEPTION 'مرجع الحقل غير متاح في الفرع' USING ERRCODE='42501';END IF;
  PERFORM erp_contract_form_private.validate_values(m.config->'fields',v,p_cafe,i,mid,0,(p_input->>'draft')::boolean);
  INSERT INTO public.erp_contracting_form_entries(id,cafe_id,model_id,model_kind,project_id,draft,field_values,created_by) VALUES(i,p_cafe,mid,m.kind,pid,(p_input->>'draft')::boolean,v,auth.uid()) ON CONFLICT(id) DO UPDATE SET field_values=excluded.field_values,draft=excluded.draft,revision=public.erp_contracting_form_entries.revision+1,updated_at=now() WHERE public.erp_contracting_form_entries.cafe_id=p_cafe;
  IF NOT FOUND THEN RAISE EXCEPTION 'السجل غير متاح' USING ERRCODE='42501';END IF;
 ELSIF p_input->>'entity'='model' THEN
  SELECT * INTO m FROM public.erp_contracting_forms WHERE cafe_id=p_cafe AND id=i FOR UPDATE;
  IF m.id IS NULL OR m.revision IS DISTINCT FROM rev THEN RAISE EXCEPTION 'Conflict' USING ERRCODE='40001';END IF;
  DELETE FROM public.erp_contracting_forms WHERE cafe_id=p_cafe AND id=i;mid:=i;
 ELSIF p_input->>'entity'='entry' THEN
  e:=erp_contract_form_private.assert_entry(p_cafe,i,'delete');pid:=e.project_id;mid:=e.model_id;
  IF e.revision IS DISTINCT FROM rev THEN RAISE EXCEPTION 'Conflict' USING ERRCODE='40001';END IF;
  DELETE FROM public.erp_contracting_form_entries WHERE cafe_id=p_cafe AND id=i;
 ELSE RAISE EXCEPTION 'نوع السجل غير صالح';END IF;
 result:=jsonb_build_object('id',i,'modelId',mid,'projectId',pid,'revision',rev+1);
 INSERT INTO public.erp_contracting_form_events(cafe_id,project_id,model_id,entry_id,action,actor) VALUES(p_cafe,pid,mid,CASE WHEN pid IS NOT NULL THEN i END,p_action,auth.uid());
 INSERT INTO erp_contract_form_private.requests VALUES(p_cafe,p_request,auth.uid(),p_action,p_input,result);RETURN result;
END $$;
INSERT INTO erp_branch_private.procedures(name,oid,domain,mutates) VALUES('erp_contracting_forms_write','public.erp_contracting_forms_write(uuid,text,jsonb,uuid)'::regprocedure,'contracting',true);
ALTER FUNCTION erp_file_private.assert_record(uuid,text,uuid,boolean) RENAME TO assert_record_before_contract_forms;
CREATE FUNCTION erp_file_private.assert_record(p_cafe uuid,p_type text,p_record uuid,p_write boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$DECLARE e public.erp_contracting_form_entries;cfg jsonb;BEGIN
 IF p_type<>'contracting_form_entry' THEN PERFORM erp_file_private.assert_record_before_contract_forms(p_cafe,p_type,p_record,p_write);RETURN;END IF;
 PERFORM erp_branch_private.enter(p_cafe);e:=erp_contract_form_private.assert_entry(p_cafe,p_record,CASE WHEN p_write THEN 'update' ELSE 'read' END);
 SELECT config INTO cfg FROM public.erp_contracting_forms WHERE cafe_id=p_cafe AND id=e.model_id;
 IF cardinality(erp_contract_form_private.fields(p_cafe,cfg,'read'))<>jsonb_array_length(cfg->'fields') OR (p_write AND NOT coalesce((cfg->>'active')::boolean,false)) THEN RAISE EXCEPTION 'المرفقات غير متاحة لهذا النطاق' USING ERRCODE='42501';END IF;
 PERFORM erp_access_private.assert_allowed(p_cafe,'contracting',CASE WHEN p_write THEN 'files' ELSE 'read' END);
END $$;
ALTER FUNCTION erp_access_private.file_domain(text) RENAME TO file_domain_before_contract_forms;
CREATE FUNCTION erp_access_private.file_domain(p_type text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$SELECT CASE WHEN p_type='contracting_form_entry' THEN 'contracting' ELSE erp_access_private.file_domain_before_contract_forms(p_type) END $$;
CREATE TRIGGER contracting_form_files BEFORE DELETE ON public.erp_contracting_form_entries FOR EACH ROW EXECUTE FUNCTION erp_file_private.prevent_orphans('contracting_form_entry');
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_contract_form_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA erp_contract_form_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_file_private.assert_record(uuid,text,uuid,boolean),erp_file_private.assert_record_before_contract_forms(uuid,text,uuid,boolean),erp_access_private.file_domain(text),erp_access_private.file_domain_before_contract_forms(text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.erp_contracting_forms_read(uuid),public.erp_contracting_forms_write(uuid,text,jsonb,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.erp_contracting_forms_read(uuid),public.erp_contracting_forms_write(uuid,text,jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
