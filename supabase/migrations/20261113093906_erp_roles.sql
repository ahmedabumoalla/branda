BEGIN;
CREATE SCHEMA erp_access_private;
REVOKE ALL ON SCHEMA erp_access_private FROM PUBLIC,anon,authenticated;
CREATE TABLE public.erp_roles(cafe_id uuid NOT NULL REFERENCES public.cafes(id),id uuid NOT NULL,name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),description text NOT NULL DEFAULT '' CHECK(length(description)<=1000),kind text NOT NULL CHECK(kind IN('user','employee')),active boolean NOT NULL,permissions jsonb NOT NULL CHECK(jsonb_typeof(permissions)='object'),blocked jsonb NOT NULL CHECK(jsonb_typeof(blocked)='array'),revision integer NOT NULL DEFAULT 1 CHECK(revision>0),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(cafe_id,id),UNIQUE(cafe_id,name));
CREATE TABLE public.erp_role_assignments(cafe_id uuid NOT NULL REFERENCES public.cafes(id),id uuid NOT NULL,role_id uuid NOT NULL,user_id uuid REFERENCES auth.users(id),employee_id uuid,revision integer NOT NULL DEFAULT 1,PRIMARY KEY(cafe_id,id),UNIQUE(cafe_id,user_id),UNIQUE(cafe_id,employee_id),CHECK(num_nonnulls(user_id,employee_id)=1),FOREIGN KEY(cafe_id,role_id) REFERENCES public.erp_roles(cafe_id,id),FOREIGN KEY(cafe_id,employee_id) REFERENCES public.erp_hr_employees(cafe_id,id));
CREATE INDEX erp_roles_assignment_role ON public.erp_role_assignments(cafe_id,role_id);
CREATE TABLE public.erp_role_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id),record_id uuid NOT NULL,action text NOT NULL,actor uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX erp_role_event_tenant ON public.erp_role_events(cafe_id,created_at DESC);
CREATE TABLE erp_access_private.requests(cafe_id uuid NOT NULL,id uuid NOT NULL,actor uuid NOT NULL,command jsonb NOT NULL,result jsonb NOT NULL,PRIMARY KEY(cafe_id,id));
ALTER TABLE public.erp_roles ENABLE ROW LEVEL SECURITY;ALTER TABLE public.erp_role_assignments ENABLE ROW LEVEL SECURITY;ALTER TABLE public.erp_role_events ENABLE ROW LEVEL SECURITY;ALTER TABLE erp_access_private.requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_roles,public.erp_role_assignments,public.erp_role_events FROM PUBLIC,anon,authenticated;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.erp_role_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON erp_access_private.requests FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE FUNCTION erp_access_private.domains() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path='' AS $$SELECT ARRAY['store','manufacturing','tasks','bookings','contracting','installments','commissions','rentals','assets','custody','organization','hr','attendance','templates']::text[]$$;
CREATE FUNCTION erp_access_private.allowed(p_cafe uuid,p_domain text,p_action text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.erp_roles%ROWTYPE;a public.erp_role_assignments%ROWTYPE;counted integer;base_role text;employee_active boolean;
BEGIN
 IF auth.uid() IS NULL OR p_domain IS NULL OR p_action IS NULL OR NOT p_domain=ANY(erp_access_private.domains()) OR p_action NOT IN('read','create','update','delete','approve','settings','files') THEN RETURN false;END IF;
 base_role:=brand_finance_private.role_for(p_cafe);IF base_role='owner' THEN RETURN true;END IF;IF base_role IS NULL THEN RETURN false;END IF;
 SELECT count(*) INTO counted FROM public.erp_role_assignments x LEFT JOIN public.erp_hr_employees e ON e.cafe_id=x.cafe_id AND e.id=x.employee_id WHERE x.cafe_id=p_cafe AND coalesce(x.user_id,e.user_id)=auth.uid();
 IF counted=0 THEN RETURN true;ELSIF counted<>1 THEN RETURN false;END IF;
 SELECT x.* INTO a FROM public.erp_role_assignments x LEFT JOIN public.erp_hr_employees e ON e.cafe_id=x.cafe_id AND e.id=x.employee_id WHERE x.cafe_id=p_cafe AND coalesce(x.user_id,e.user_id)=auth.uid();
 SELECT coalesce((SELECT active FROM public.erp_hr_employees WHERE cafe_id=p_cafe AND id=a.employee_id),true) INTO employee_active; SELECT * INTO r FROM public.erp_roles WHERE cafe_id=p_cafe AND id=a.role_id;
 RETURN employee_active AND r.active AND NOT(r.blocked?p_domain) AND coalesce((r.permissions#>>ARRAY[p_domain,'read'])::boolean,false) AND coalesce((r.permissions#>>ARRAY[p_domain,p_action])::boolean,false);
END $$;
CREATE FUNCTION erp_access_private.assert_allowed(p_cafe uuid,p_domain text,p_action text) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$BEGIN IF NOT coalesce(erp_access_private.allowed(p_cafe,p_domain,p_action),false) THEN RAISE EXCEPTION 'الدور المخصص لا يسمح بهذا الإجراء في هذا القسم' USING ERRCODE='42501';END IF;END $$;
CREATE FUNCTION erp_access_private.action(p_action text,p_data jsonb DEFAULT '{}') RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF p_action IN('read','list','templates','submissions','quote','targets','customers','sales') THEN RETURN 'read';END IF;
 IF p_action~'(delete|remove)' THEN RETURN 'delete';END IF;
 IF p_action IN('settings','save_type','save_template','save_rule','rule','rule_delete','type','unit','season','location','service','package','availability','break','save_service','save_availability') THEN RETURN 'settings';END IF;
 IF p_action IN('note','link','assign','assign_sale','refresh','schedule','photo','cancel') THEN RETURN 'update';END IF;
 IF p_action IN('import','start_flow','submit') THEN RETURN 'create';END IF;
 IF p_action~'^(save|create)' OR p_action IN('reservation','contract','agreement','document','employee','activity') THEN RETURN CASE WHEN coalesce((p_data->>'revision')::integer,0)=0 THEN 'create' ELSE 'update' END;END IF;
 RETURN 'approve';
END $$;
CREATE FUNCTION erp_access_private.file_domain(p_type text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$SELECT CASE WHEN p_type LIKE 'manufacturing_%' THEN 'manufacturing' WHEN p_type IN('task','task_flow') THEN 'tasks' WHEN p_type='booking' THEN 'bookings' WHEN p_type='contracting_document' THEN 'contracting' WHEN p_type='asset' THEN 'assets' WHEN p_type='employee_asset' THEN 'custody' WHEN p_type='hr_employee' THEN 'hr' WHEN p_type LIKE 'rental_%' THEN 'rentals' WHEN p_type='document_template' THEN 'templates' END$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_access_private FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.erp_my_permissions(p_cafe_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.erp_roles%ROWTYPE;a public.erp_role_assignments%ROWTYPE;employee_active boolean;counted integer;base_role text;
BEGIN
 base_role:=brand_finance_private.role_for(p_cafe_id);IF auth.uid() IS NULL OR base_role IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 IF base_role='owner' THEN RETURN jsonb_build_object('custom',false,'active',true,'permissions','{}'::jsonb,'blocked','[]'::jsonb,'roleName',NULL);END IF;
 SELECT count(*) INTO counted FROM public.erp_role_assignments x LEFT JOIN public.erp_hr_employees e ON e.cafe_id=x.cafe_id AND e.id=x.employee_id WHERE x.cafe_id=p_cafe_id AND coalesce(x.user_id,e.user_id)=auth.uid();
 IF counted=0 THEN RETURN jsonb_build_object('custom',false,'active',true,'permissions','{}'::jsonb,'blocked','[]'::jsonb,'roleName',NULL);END IF;
 IF counted>1 THEN RETURN jsonb_build_object('custom',true,'active',false,'permissions','{}'::jsonb,'blocked',to_jsonb(erp_access_private.domains()),'roleName','تعارض تعيين الأدوار');END IF;
 SELECT x.* INTO a FROM public.erp_role_assignments x LEFT JOIN public.erp_hr_employees e ON e.cafe_id=x.cafe_id AND e.id=x.employee_id WHERE x.cafe_id=p_cafe_id AND coalesce(x.user_id,e.user_id)=auth.uid();SELECT coalesce((SELECT active FROM public.erp_hr_employees WHERE cafe_id=p_cafe_id AND id=a.employee_id),true) INTO employee_active;SELECT * INTO r FROM public.erp_roles WHERE cafe_id=p_cafe_id AND id=a.role_id;
 RETURN jsonb_build_object('custom',true,'active',r.active AND employee_active,'permissions',r.permissions,'blocked',r.blocked,'roleName',r.name);
END $$;
REVOKE ALL ON FUNCTION public.erp_my_permissions(uuid) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.erp_my_permissions(uuid) TO authenticated;

CREATE FUNCTION public.erp_roles(p_cafe_id uuid,p_action text DEFAULT 'read',p_input jsonb DEFAULT '{}',p_request uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.erp_roles%ROWTYPE;a public.erp_role_assignments%ROWTYPE;prior erp_access_private.requests%ROWTYPE;role_name text;cmd jsonb;answer jsonb;rid uuid;revision integer;domain text;key text;v jsonb;target uuid;employee public.erp_hr_employees%ROWTYPE;
BEGIN
 role_name:=brand_finance_private.role_for(p_cafe_id);IF auth.uid() IS NULL OR coalesce(role_name,'')<>'owner' THEN RAISE EXCEPTION 'إدارة الأدوار متاحة لمالك العلامة فقط' USING ERRCODE='42501';END IF;
 IF p_action='read' THEN RETURN jsonb_build_object('roles',coalesce((SELECT jsonb_agg(to_jsonb(x)-'cafe_id'||jsonb_build_object('assigned_count',(SELECT count(*) FROM public.erp_role_assignments WHERE cafe_id=p_cafe_id AND role_id=x.id)) ORDER BY x.created_at DESC) FROM public.erp_roles x WHERE cafe_id=p_cafe_id),'[]'::jsonb),'assignments',coalesce((SELECT jsonb_agg(to_jsonb(x)-'cafe_id'||jsonb_build_object('name',coalesce(s.name,concat_ws(' ',e.first_name,e.last_name)),'finance_role',s.role,'active',coalesce(s.active,e.active,false))) FROM public.erp_role_assignments x LEFT JOIN public.erp_hr_employees e ON e.cafe_id=x.cafe_id AND e.id=x.employee_id LEFT JOIN public.bf_staff s ON s.cafe_id=x.cafe_id AND s.user_id=coalesce(x.user_id,e.user_id) WHERE x.cafe_id=p_cafe_id),'[]'::jsonb),'users',coalesce((SELECT jsonb_agg(jsonb_build_object('id',user_id,'name',name,'role',role,'active',active)) FROM public.bf_staff WHERE cafe_id=p_cafe_id),'[]'::jsonb),'employees',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',concat_ws(' ',first_name,last_name),'user_id',user_id,'active',active)) FROM public.erp_hr_employees WHERE cafe_id=p_cafe_id),'[]'::jsonb),'events',coalesce((SELECT jsonb_agg(to_jsonb(x)-'cafe_id'-'actor' ORDER BY created_at DESC) FROM (SELECT * FROM public.erp_role_events WHERE cafe_id=p_cafe_id ORDER BY created_at DESC LIMIT 200) x),'[]'::jsonb),'canWrite',true,'ownerId',auth.uid());END IF;
 IF p_request IS NULL OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR octet_length(p_input::text)>25000 THEN RAISE EXCEPTION 'طلب غير صالح';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,67939));cmd:=jsonb_build_object('action',p_action,'input',p_input);SELECT * INTO prior FROM erp_access_private.requests WHERE cafe_id=p_cafe_id AND id=p_request;
 IF FOUND THEN IF prior.actor<>auth.uid() OR prior.command<>cmd THEN RAISE EXCEPTION 'تعارض معرف العملية' USING ERRCODE='40001';END IF;RETURN prior.result;END IF;
 rid:=(p_input->>'id')::uuid;
 IF p_action='save' THEN
  SELECT * INTO r FROM public.erp_roles WHERE cafe_id=p_cafe_id AND id=rid FOR UPDATE;IF coalesce(r.revision,0) IS DISTINCT FROM (p_input->>'revision')::integer THEN RAISE EXCEPTION 'تغير الدور أعد تحميله' USING ERRCODE='40001';END IF;
  IF p_input->>'kind' NOT IN('user','employee') OR jsonb_typeof(p_input->'active') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_input->'permissions') IS DISTINCT FROM 'object' OR jsonb_typeof(p_input->'blocked') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'راجع نوع الدور والصلاحيات';END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_input->'permissions'))<>cardinality(erp_access_private.domains()) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_input->'permissions') k WHERE NOT k=ANY(erp_access_private.domains())) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_input->'blocked') b WHERE NOT b=ANY(erp_access_private.domains())) THEN RAISE EXCEPTION 'مجموعة الصلاحيات غير صالحة';END IF;
  FOREACH domain IN ARRAY erp_access_private.domains() LOOP
   v:=p_input->'permissions'->domain;IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(v))<>7 THEN RAISE EXCEPTION 'راجع مجموعة الصلاحيات';END IF;
   FOREACH key IN ARRAY ARRAY['read','create','update','delete','approve','settings','files'] LOOP IF jsonb_typeof(v->key) IS DISTINCT FROM 'boolean' OR ((v->>key)::boolean AND NOT(v->>'read')::boolean) OR (p_input->>'kind'='employee' AND domain NOT IN('hr','organization','custody','attendance') AND (v->>key)::boolean) THEN RAISE EXCEPTION 'راجع صلاحيات العرض ونوع الموظف';END IF;END LOOP;
  END LOOP;
  INSERT INTO public.erp_roles(cafe_id,id,name,description,kind,active,permissions,blocked) VALUES(p_cafe_id,rid,p_input->>'name',p_input->>'description',p_input->>'kind',(p_input->>'active')::boolean,p_input->'permissions',p_input->'blocked') ON CONFLICT(cafe_id,id) DO UPDATE SET name=excluded.name,description=excluded.description,kind=excluded.kind,active=excluded.active,permissions=excluded.permissions,blocked=excluded.blocked,revision=erp_roles.revision+1,updated_at=now() RETURNING erp_roles.revision INTO revision;
 ELSIF p_action='delete_many' THEN
  IF jsonb_typeof(p_input->'entries') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'entries') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'اختر الأدوار المطلوب حذفها';END IF;
  FOR v IN SELECT value FROM jsonb_array_elements(p_input->'entries') LOOP
   DELETE FROM public.erp_roles WHERE cafe_id=p_cafe_id AND id=(v->>'id')::uuid AND erp_roles.revision=(v->>'revision')::integer RETURNING erp_roles.revision INTO revision;IF revision IS NULL THEN RAISE EXCEPTION 'تغير أحد الأدوار أعد تحميل القائمة' USING ERRCODE='40001';END IF;
   INSERT INTO public.erp_role_events(cafe_id,record_id,action,actor) VALUES(p_cafe_id,(v->>'id')::uuid,'delete',auth.uid());
  END LOOP;rid:=p_request;revision:=0;
 ELSIF p_action='delete' THEN
  DELETE FROM public.erp_roles WHERE cafe_id=p_cafe_id AND id=rid AND erp_roles.revision=(p_input->>'revision')::integer RETURNING erp_roles.revision INTO revision;IF revision IS NULL THEN RAISE EXCEPTION 'تغير الدور أعد تحميله' USING ERRCODE='40001';END IF;
 ELSIF p_action='assign' THEN
  SELECT * INTO a FROM public.erp_role_assignments WHERE cafe_id=p_cafe_id AND id=rid FOR UPDATE;IF coalesce(a.revision,0) IS DISTINCT FROM (p_input->>'revision')::integer THEN RAISE EXCEPTION 'تغير التعيين' USING ERRCODE='40001';END IF;
  SELECT * INTO r FROM public.erp_roles WHERE cafe_id=p_cafe_id AND id=(p_input->>'role_id')::uuid AND active;IF r.id IS NULL THEN RAISE EXCEPTION 'اختر دورًا نشطًا';END IF;
  IF num_nonnulls(nullif(p_input->>'user_id',''),nullif(p_input->>'employee_id',''))<>1 THEN RAISE EXCEPTION 'اختر حسابًا أو موظفًا';END IF;
  target:=nullif(p_input->>'user_id','')::uuid;
  IF target IS NULL THEN SELECT * INTO employee FROM public.erp_hr_employees WHERE cafe_id=p_cafe_id AND id=(p_input->>'employee_id')::uuid AND active;IF employee.id IS NULL THEN RAISE EXCEPTION 'الموظف غير متاح';END IF;target:=employee.user_id;
  ELSIF NOT EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=p_cafe_id AND user_id=target AND active) THEN RAISE EXCEPTION 'حساب المستخدم غير نشط';END IF;
  IF target=(SELECT owner_user_id FROM public.cafes WHERE id=p_cafe_id) THEN RAISE EXCEPTION 'لا يمكن تقييد المالك بدور مخصص';END IF;
  IF target IS NOT NULL AND EXISTS(SELECT 1 FROM public.erp_role_assignments x LEFT JOIN public.erp_hr_employees e ON e.cafe_id=x.cafe_id AND e.id=x.employee_id WHERE x.cafe_id=p_cafe_id AND x.id<>rid AND coalesce(x.user_id,e.user_id)=target) THEN RAISE EXCEPTION 'للحساب دور معيّن بالفعل';END IF;
  INSERT INTO public.erp_role_assignments(cafe_id,id,role_id,user_id,employee_id) VALUES(p_cafe_id,rid,r.id,nullif(p_input->>'user_id','')::uuid,nullif(p_input->>'employee_id','')::uuid) ON CONFLICT(cafe_id,id) DO UPDATE SET role_id=excluded.role_id,user_id=excluded.user_id,employee_id=excluded.employee_id,revision=erp_role_assignments.revision+1 RETURNING erp_role_assignments.revision INTO revision;
 ELSIF p_action='unassign' THEN
  DELETE FROM public.erp_role_assignments WHERE cafe_id=p_cafe_id AND id=rid AND erp_role_assignments.revision=(p_input->>'revision')::integer RETURNING erp_role_assignments.revision INTO revision;IF revision IS NULL THEN RAISE EXCEPTION 'تغير التعيين' USING ERRCODE='40001';END IF;
 ELSE RAISE EXCEPTION 'إجراء غير صالح';END IF;
 answer:=jsonb_build_object('id',rid,'revision',revision);INSERT INTO public.erp_role_events(cafe_id,record_id,action,actor) VALUES(p_cafe_id,rid,p_action,auth.uid());INSERT INTO erp_access_private.requests VALUES(p_cafe_id,p_request,auth.uid(),cmd,answer);RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.erp_roles(uuid,text,jsonb,uuid) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.erp_roles(uuid,text,jsonb,uuid) TO authenticated;

-- RPC and Storage guards are installed below without changing existing role checks.
CREATE TABLE erp_access_private.guard_registry(function_id oid PRIMARY KEY,domain text NOT NULL,guard text NOT NULL,installed_definition_md5 text NOT NULL);
CREATE FUNCTION erp_access_private.install_guard(p_name text,p_domain text,p_guard text) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE item record;definition text;body text;patched text;
BEGIN
 IF NOT p_domain=ANY(erp_access_private.domains()) THEN RAISE EXCEPTION 'Invalid domain';END IF;
 FOR item IN SELECT p.oid,p.prosrc,l.lanname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname='public' AND p.proname=p_name LOOP
  IF item.lanname<>'plpgsql' OR item.prosrc !~* '\mBEGIN\M' THEN RAISE EXCEPTION 'Unsupported guard target %',p_name;END IF;
  IF item.prosrc LIKE '%erp_access_private.assert_allowed(%' THEN CONTINUE;END IF;
  body:=regexp_replace(item.prosrc,'\mBEGIN\M','BEGIN '||p_guard,'i');definition:=pg_get_functiondef(item.oid);patched:=replace(definition,item.prosrc,body);EXECUTE patched;
  INSERT INTO erp_access_private.guard_registry VALUES(item.oid,p_domain,p_guard,md5(pg_get_functiondef(item.oid))) ON CONFLICT(function_id) DO UPDATE SET domain=excluded.domain,guard=excluded.guard,installed_definition_md5=excluded.installed_definition_md5;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION erp_access_private.install_guard(text,text,text) FROM PUBLIC,anon,authenticated;
DO $$DECLARE spec record;BEGIN
 FOR spec IN SELECT * FROM (VALUES
 ('erp_store','store','p_cafe_id','erp_access_private.action(p_action,coalesce(p_record,''{}'')||jsonb_build_object(''revision'',coalesce(p_revision,0)))'),
 ('erp_manufacturing_read','manufacturing','p_cafe_id','''read'''),('erp_manufacturing_save','manufacturing','p_cafe_id','CASE WHEN p_kind=''settings'' THEN ''settings'' WHEN p_revision=0 THEN ''create'' ELSE ''update'' END'),('erp_manufacturing_act','manufacturing','p_cafe_id','erp_access_private.action(p_command->>''action'',p_command)'),
 ('erp_tasks_read','tasks','p_cafe_id','''read'''),('erp_tasks_targets','tasks','p_cafe_id','''read'''),('erp_tasks_execute','tasks','p_cafe_id','erp_access_private.action(p_action,p_data)'),
 ('erp_bookings_read','bookings','p_cafe_id','''read'''),('erp_booking_customers','bookings','p_cafe_id','''read'''),('erp_bookings_write','bookings','p_cafe_id','erp_access_private.action(p_action,p_payload)'),
 ('erp_contracting','contracting','p_cafe_id','erp_access_private.action(p_action,p_input)'),
 ('erp_installments_read','installments','p_cafe_id','''read'''),('erp_installments_write','installments','p_cafe_id','erp_access_private.action(p_action,p_payload)'),
 ('erp_commissions_read','commissions','p_cafe_id','''read'''),('erp_commissions_sales','commissions','p_cafe_id','''read'''),('erp_commissions_write','commissions','p_cafe_id','erp_access_private.action(p_action,p_data)'),
 ('erp_rentals_read','rentals','p_cafe_id','''read'''),('erp_rentals_quote','rentals','p_cafe_id','''read'''),('erp_rentals_write','rentals','p_cafe_id','erp_access_private.action(p_action,p_payload)'),
 ('erp_asset_read','assets','p_cafe','''read'''),('erp_asset_save','assets','p_cafe','CASE WHEN p_revision=0 THEN ''create'' ELSE ''update'' END'),('erp_asset_act','assets','p_cafe','erp_access_private.action(p_command->>''action'',p_command)'),('erp_asset_location','assets','p_cafe','CASE WHEN p_delete THEN ''delete'' ELSE ''settings'' END'),('erp_asset_import','assets','p_cafe','''create'''),
 ('erp_employee_asset_read','custody','p_cafe','''read'''),('erp_employee_asset_save','custody','p_cafe','CASE WHEN p_revision=0 THEN ''create'' ELSE ''update'' END'),('erp_employee_asset_act','custody','p_cafe','erp_access_private.action(p_command->>''action'',p_command)'),('erp_employee_asset_type','custody','p_cafe','CASE WHEN p_delete THEN ''delete'' ELSE ''settings'' END'),
 ('erp_organization_read','organization','p_cafe_id','''read'''),('erp_organization_write','organization','p_cafe_id','erp_access_private.action(p_action,p_data)'),
 ('erp_hr_read','hr','p_cafe_id','''read'''),('erp_hr_write','hr','p_cafe_id','erp_access_private.action(p_action,p_data)'),('erp_hr_import','hr','p_cafe_id','''create'''),
 ('erp_templates','templates','p_cafe_id','erp_access_private.action(p_action,p_input)'),('erp_template_claim','templates','p_cafe_id','''approve''')
 ) AS t(name,domain,cafe,action) LOOP
  PERFORM erp_access_private.install_guard(spec.name,spec.domain,format('PERFORM erp_access_private.assert_allowed(%s,%L,%s);',spec.cafe,spec.domain,spec.action)||CASE WHEN spec.name IN('erp_asset_save','erp_asset_import') THEN ' IF p_post THEN PERFORM erp_access_private.assert_allowed(p_cafe,''assets'',''approve'');END IF;' WHEN spec.name='erp_rentals_write' THEN ' IF coalesce((p_payload->>''autoInvoice'')::boolean,false) THEN PERFORM erp_access_private.assert_allowed(p_cafe_id,''rentals'',''approve'');END IF;' WHEN spec.name='erp_manufacturing_save' THEN ' IF p_kind IN(''orders'',''plans'') AND NOT p_draft THEN PERFORM erp_access_private.assert_allowed(p_cafe_id,''manufacturing'',''approve'');END IF;' ELSE '' END);
 END LOOP;
END $$;
-- The existing guard chain remains intact, including rental/custody/HR file rules.
CREATE FUNCTION erp_access_private.mask_snapshot(p_cafe uuid,p_domain text,p_result jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE writable boolean;BEGIN
 IF jsonb_typeof(p_result)<>'object' THEN RETURN p_result;END IF;
 writable:=coalesce((p_result->>'canWrite')::boolean,true);
 RETURN p_result||jsonb_build_object('canWrite',writable AND (erp_access_private.allowed(p_cafe,p_domain,'create') OR erp_access_private.allowed(p_cafe,p_domain,'update') OR erp_access_private.allowed(p_cafe,p_domain,'delete') OR erp_access_private.allowed(p_cafe,p_domain,'approve') OR erp_access_private.allowed(p_cafe,p_domain,'files') OR erp_access_private.allowed(p_cafe,p_domain,'settings')),'canCreate',writable AND erp_access_private.allowed(p_cafe,p_domain,'create'),'canUpdate',writable AND erp_access_private.allowed(p_cafe,p_domain,'update'),'canDelete',writable AND erp_access_private.allowed(p_cafe,p_domain,'delete'),'canApprove',coalesce((p_result->>'canApprove')::boolean,writable) AND erp_access_private.allowed(p_cafe,p_domain,'approve'),'canConfigure',coalesce((p_result->>'canConfigure')::boolean,writable) AND erp_access_private.allowed(p_cafe,p_domain,'settings'),'canSettings',coalesce((p_result->>'canSettings')::boolean,writable) AND erp_access_private.allowed(p_cafe,p_domain,'settings'),'canFiles',writable AND erp_access_private.allowed(p_cafe,p_domain,'files'));
END $$;
REVOKE ALL ON FUNCTION erp_access_private.mask_snapshot(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
DO $$DECLARE item record;definition text;helper text;arguments text;body text;condition text;BEGIN
 FOR item IN SELECT p.oid,p.proname,p.prosrc,p.proargnames,p.proargtypes,g.domain FROM pg_proc p JOIN erp_access_private.guard_registry g ON g.function_id=p.oid WHERE p.proname LIKE '%_read' OR p.proname IN('erp_contracting','erp_templates') LOOP
  definition:=pg_get_functiondef(item.oid);helper:='snapshot_'||item.proname;
  EXECUTE replace(definition,'CREATE OR REPLACE FUNCTION public.'||item.proname||'(','CREATE OR REPLACE FUNCTION erp_access_private.'||helper||'(');
  EXECUTE format('REVOKE ALL ON FUNCTION erp_access_private.%I(%s) FROM PUBLIC,anon,authenticated,service_role',helper,oidvectortypes(item.proargtypes));
  SELECT string_agg(quote_ident(name),',' ORDER BY n) INTO arguments FROM unnest(item.proargnames) WITH ORDINALITY x(name,n);
  condition:=CASE WHEN item.proname IN('erp_contracting','erp_templates') THEN 'IF p_action<>''read'' THEN RETURN result;END IF;' ELSE '' END;
  body:=format('DECLARE result jsonb;BEGIN result:=erp_access_private.%I(%s);%s RETURN erp_access_private.mask_snapshot(%I,%L,result);END',helper,arguments,condition,item.proargnames[1],item.domain);
  EXECUTE replace(definition,item.prosrc,body);UPDATE erp_access_private.guard_registry SET installed_definition_md5=md5(pg_get_functiondef(item.oid)) WHERE function_id=item.oid;
 END LOOP;
END $$;
DO $$DECLARE function_oid oid;definition text;body text;BEGIN
 function_oid:=to_regprocedure('erp_file_private.assert_record(uuid,text,uuid,boolean)');IF function_oid IS NULL THEN RAISE EXCEPTION 'ERP files must precede custom roles';END IF;
 SELECT prosrc INTO body FROM pg_proc WHERE pg_proc.oid=function_oid;definition:=pg_get_functiondef(function_oid);
 EXECUTE replace(definition,body,regexp_replace(body,'\mBEGIN\M','BEGIN PERFORM erp_access_private.assert_allowed(p_cafe,erp_access_private.file_domain(p_type),CASE WHEN p_write THEN ''files'' ELSE ''read'' END);','i'));
 -- Store uses its own private media bucket and policies.
 function_oid:=to_regprocedure('public.erp_store_media_access(text,boolean)');IF function_oid IS NOT NULL THEN
  SELECT prosrc INTO body FROM pg_proc WHERE pg_proc.oid=function_oid;definition:=pg_get_functiondef(function_oid);
  EXECUTE replace(definition,body,regexp_replace(body,'\mBEGIN\M','BEGIN IF NOT erp_access_private.allowed(nullif(split_part(p_name,''/'',1),'''')::uuid,''store'',CASE WHEN p_write THEN ''files'' ELSE ''read'' END) THEN RETURN false;END IF;','i'));
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
