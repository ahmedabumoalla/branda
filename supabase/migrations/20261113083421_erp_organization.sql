BEGIN;
CREATE SCHEMA erp_org_private;
REVOKE ALL ON SCHEMA erp_org_private FROM PUBLIC,anon,authenticated;
CREATE TABLE public.erp_org_units(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),
 kind text NOT NULL CHECK(kind IN('department','designation','level','type')),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 150),
 abbreviation text NOT NULL DEFAULT '' CHECK(length(abbreviation)<=30),description text NOT NULL DEFAULT '' CHECK(length(description)<=10000),active boolean NOT NULL DEFAULT true,
 parent_id uuid,manager_ids uuid[] NOT NULL DEFAULT '{}',revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(cafe_id,id),UNIQUE(cafe_id,kind,name),FOREIGN KEY(cafe_id,parent_id) REFERENCES public.erp_org_units(cafe_id,id),CHECK(parent_id IS DISTINCT FROM id)
);
CREATE INDEX erp_org_units_parent ON public.erp_org_units(cafe_id,parent_id);
CREATE TABLE public.erp_org_assignments(
 cafe_id uuid NOT NULL REFERENCES public.cafes(id),user_id uuid NOT NULL REFERENCES auth.users(id),department_id uuid,designation_id uuid,level_id uuid,type_id uuid,manager_id uuid REFERENCES auth.users(id),revision integer NOT NULL DEFAULT 1,
 PRIMARY KEY(cafe_id,user_id),FOREIGN KEY(cafe_id,department_id) REFERENCES public.erp_org_units(cafe_id,id),FOREIGN KEY(cafe_id,designation_id) REFERENCES public.erp_org_units(cafe_id,id),FOREIGN KEY(cafe_id,level_id) REFERENCES public.erp_org_units(cafe_id,id),FOREIGN KEY(cafe_id,type_id) REFERENCES public.erp_org_units(cafe_id,id),CHECK(manager_id IS DISTINCT FROM user_id)
);
CREATE INDEX erp_org_assignments_department ON public.erp_org_assignments(cafe_id,department_id);
CREATE INDEX erp_org_assignments_designation ON public.erp_org_assignments(cafe_id,designation_id);
CREATE INDEX erp_org_assignments_level ON public.erp_org_assignments(cafe_id,level_id);
CREATE INDEX erp_org_assignments_type ON public.erp_org_assignments(cafe_id,type_id);
CREATE INDEX erp_org_assignments_manager ON public.erp_org_assignments(cafe_id,manager_id);
CREATE TABLE public.erp_org_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id),record_id uuid NOT NULL,action text NOT NULL,detail jsonb NOT NULL DEFAULT '{}',actor uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX erp_org_events_record ON public.erp_org_events(cafe_id,record_id,created_at);
CREATE TRIGGER erp_org_events_immutable BEFORE UPDATE OR DELETE ON public.erp_org_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TABLE erp_org_private.requests(cafe_id uuid NOT NULL,request_id uuid NOT NULL,actor uuid NOT NULL,action text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,PRIMARY KEY(cafe_id,request_id));
CREATE FUNCTION erp_org_private.staff(p_cafe uuid,p_user uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND owner_user_id=p_user) OR EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=p_cafe AND user_id=p_user AND active) $$;
CREATE FUNCTION public.erp_organization_read(p_cafe_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text;
BEGIN
 r:=brand_finance_private.role_for(p_cafe_id);
 IF auth.uid() IS NULL OR coalesce(r,'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'لا تملك صلاحية الهيكل التنظيمي' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('units',coalesce((SELECT jsonb_agg(to_jsonb(u)-'cafe_id' ORDER BY name,id) FROM public.erp_org_units u WHERE cafe_id=p_cafe_id),'[]'),
 'assignments',coalesce((SELECT jsonb_agg(to_jsonb(a)-'cafe_id') FROM public.erp_org_assignments a WHERE cafe_id=p_cafe_id),'[]'),
 'staff',coalesce((SELECT jsonb_agg(x ORDER BY name) FROM (SELECT user_id id,name FROM public.bf_staff WHERE cafe_id=p_cafe_id AND active UNION SELECT owner_user_id,name FROM public.cafes WHERE id=p_cafe_id) x),'[]'),
 'events',coalesce((SELECT jsonb_agg(to_jsonb(e)-'cafe_id'-'actor' ORDER BY created_at DESC) FROM (SELECT * FROM public.erp_org_events WHERE cafe_id=p_cafe_id ORDER BY created_at DESC LIMIT 500) e),'[]'),'canWrite',r='owner');
END $$;
CREATE FUNCTION public.erp_organization_write(p_cafe_id uuid,p_action text,p_data jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old public.erp_org_units;a public.erp_org_assignments;prev erp_org_private.requests;v_id uuid:=nullif(p_data->>'id','')::uuid;v_parent uuid:=nullif(p_data->>'parentId','')::uuid;v_kind text:=p_data->>'kind';v_managers uuid[];v_manager uuid;v_cursor uuid;v_seen uuid[];v_field text;v_target uuid;v_result jsonb;v_user uuid;v_department uuid;v_designation uuid;
BEGIN
 IF auth.uid() IS NULL OR brand_finance_private.role_for(p_cafe_id) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'إدارة الهيكل التنظيمي متاحة للمالك' USING ERRCODE='42501';END IF;
 IF p_request_id IS NULL OR p_action IS NULL OR p_action NOT IN('save','delete','status','assign') OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>20000 THEN RAISE EXCEPTION 'بيانات العملية غير صالحة' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,83421));
 SELECT * INTO prev FROM erp_org_private.requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN IF prev.actor<>auth.uid() OR prev.action<>p_action OR prev.payload<>p_data THEN RAISE EXCEPTION 'معرف العملية مستخدم لبيانات مختلفة' USING ERRCODE='22023';END IF;RETURN prev.result;END IF;
 IF p_action='assign' THEN
  v_user:=(p_data->>'userId')::uuid;v_manager:=nullif(p_data->>'managerId','')::uuid;
  IF NOT erp_org_private.staff(p_cafe_id,v_user) OR (v_manager IS NOT NULL AND NOT erp_org_private.staff(p_cafe_id,v_manager)) THEN RAISE EXCEPTION 'اختر موظفًا ومديرًا من العلامة نفسها' USING ERRCODE='22023';END IF;
  SELECT * INTO a FROM public.erp_org_assignments WHERE cafe_id=p_cafe_id AND user_id=v_user;
  IF coalesce(a.revision,0) IS DISTINCT FROM (p_data->>'revision')::integer THEN RAISE EXCEPTION 'تغير تعيين الموظف أعد التحميل' USING ERRCODE='40001';END IF;
  FOREACH v_field IN ARRAY ARRAY['department','designation','level','type'] LOOP
   v_target:=nullif(p_data->>(v_field||'Id'),'')::uuid;
   IF v_target IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_org_units WHERE cafe_id=p_cafe_id AND id=v_target AND kind=v_field AND active) THEN RAISE EXCEPTION 'اختر سجلًا تنظيميًا نشطًا من العلامة نفسها' USING ERRCODE='22023';END IF;
  END LOOP;
  v_department:=nullif(p_data->>'departmentId','')::uuid;v_designation:=nullif(p_data->>'designationId','')::uuid;
  IF v_designation IS NOT NULL AND EXISTS(SELECT 1 FROM public.erp_org_units WHERE id=v_designation AND parent_id IS NOT NULL AND parent_id IS DISTINCT FROM v_department) THEN RAISE EXCEPTION 'المسمى الوظيفي مرتبط بقسم مختلف' USING ERRCODE='22023';END IF;
  v_seen:=ARRAY[v_user];v_cursor:=v_manager;
  WHILE v_cursor IS NOT NULL LOOP
   IF v_cursor=ANY(v_seen) THEN RAISE EXCEPTION 'لا يمكن إنشاء حلقة في تسلسل المديرين' USING ERRCODE='22023';END IF;
   v_seen:=array_append(v_seen,v_cursor);SELECT manager_id INTO v_cursor FROM public.erp_org_assignments WHERE cafe_id=p_cafe_id AND user_id=v_cursor;
  END LOOP;
  INSERT INTO public.erp_org_assignments(cafe_id,user_id,department_id,designation_id,level_id,type_id,manager_id) VALUES(p_cafe_id,v_user,v_department,v_designation,nullif(p_data->>'levelId','')::uuid,nullif(p_data->>'typeId','')::uuid,v_manager)
  ON CONFLICT(cafe_id,user_id) DO UPDATE SET department_id=excluded.department_id,designation_id=excluded.designation_id,level_id=excluded.level_id,type_id=excluded.type_id,manager_id=excluded.manager_id,revision=erp_org_assignments.revision+1;
  v_id:=v_user;
 ELSE
  IF v_id IS NOT NULL THEN SELECT * INTO old FROM public.erp_org_units WHERE cafe_id=p_cafe_id AND id=v_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'السجل غير موجود' USING ERRCODE='42501';END IF;END IF;
  IF coalesce(old.revision,0) IS DISTINCT FROM (p_data->>'revision')::integer THEN RAISE EXCEPTION 'تغير السجل أعد التحميل' USING ERRCODE='40001';END IF;
  IF p_action='save' THEN
   IF v_kind IS NULL OR v_kind NOT IN('department','designation','level','type') OR (old.id IS NOT NULL AND old.kind<>v_kind) THEN RAISE EXCEPTION 'نوع السجل غير صالح' USING ERRCODE='22023';END IF;
   IF v_parent IS NOT NULL AND (v_kind NOT IN('department','designation') OR NOT EXISTS(SELECT 1 FROM public.erp_org_units WHERE cafe_id=p_cafe_id AND id=v_parent AND kind='department' AND active)) THEN RAISE EXCEPTION 'القسم المرتبط غير متاح' USING ERRCODE='22023';END IF;
   v_seen:=ARRAY[coalesce(v_id,gen_random_uuid())];v_cursor:=v_parent;
   WHILE v_cursor IS NOT NULL LOOP
    IF v_cursor=ANY(v_seen) THEN RAISE EXCEPTION 'لا يمكن إنشاء حلقة بين الأقسام' USING ERRCODE='22023';END IF;
    v_seen:=array_append(v_seen,v_cursor);SELECT parent_id INTO v_cursor FROM public.erp_org_units WHERE cafe_id=p_cafe_id AND id=v_cursor;
   END LOOP;
   SELECT coalesce(array_agg(value::uuid),'{}') INTO v_managers FROM jsonb_array_elements_text(coalesce(p_data->'managerIds','[]'));
   IF cardinality(v_managers)>100 OR (v_kind<>'department' AND cardinality(v_managers)>0) OR EXISTS(SELECT 1 FROM unnest(v_managers) m WHERE NOT erp_org_private.staff(p_cafe_id,m)) THEN RAISE EXCEPTION 'راجع المديرين المعينين للقسم' USING ERRCODE='22023';END IF;
   IF old.kind='designation' AND old.parent_id IS DISTINCT FROM v_parent AND EXISTS(SELECT 1 FROM public.erp_org_assignments WHERE cafe_id=p_cafe_id AND designation_id=v_id AND v_parent IS NOT NULL AND department_id IS DISTINCT FROM v_parent) THEN RAISE EXCEPTION 'حدّث تعيينات الموظفين قبل تغيير قسم المسمى الوظيفي' USING ERRCODE='22023';END IF;
   v_id:=coalesce(v_id,gen_random_uuid());
   INSERT INTO public.erp_org_units(id,cafe_id,kind,name,abbreviation,description,active,parent_id,manager_ids) VALUES(v_id,p_cafe_id,v_kind,btrim(p_data->>'name'),coalesce(p_data->>'abbreviation',''),coalesce(p_data->>'description',''),coalesce((p_data->>'active')::boolean,true),v_parent,v_managers)
   ON CONFLICT(id) DO UPDATE SET name=excluded.name,abbreviation=excluded.abbreviation,description=excluded.description,active=excluded.active,parent_id=excluded.parent_id,manager_ids=excluded.manager_ids,revision=erp_org_units.revision+1,updated_at=now();
  ELSIF p_action='status' THEN
   IF v_id IS NULL OR jsonb_typeof(p_data->'active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'الحالة غير صالحة' USING ERRCODE='22023';END IF;
   UPDATE public.erp_org_units SET active=(p_data->>'active')::boolean,revision=revision+1,updated_at=now() WHERE cafe_id=p_cafe_id AND id=v_id;
  ELSE
   IF v_id IS NULL THEN RAISE EXCEPTION 'حدد السجل المطلوب' USING ERRCODE='22023';END IF;
   DELETE FROM public.erp_org_units WHERE cafe_id=p_cafe_id AND id=v_id;
  END IF;
 END IF;
 INSERT INTO public.erp_org_events(cafe_id,record_id,action,detail,actor) VALUES(p_cafe_id,v_id,p_action,p_data,auth.uid());
 v_result:=jsonb_build_object('id',v_id);
 INSERT INTO erp_org_private.requests VALUES(p_cafe_id,p_request_id,auth.uid(),p_action,p_data,v_result);
 RETURN v_result;
END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['erp_org_units','erp_org_assignments','erp_org_events'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);END LOOP;END $$;
ALTER TABLE erp_org_private.requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA erp_org_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_org_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_organization_read(uuid),public.erp_organization_write(uuid,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_organization_read(uuid),public.erp_organization_write(uuid,text,jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
