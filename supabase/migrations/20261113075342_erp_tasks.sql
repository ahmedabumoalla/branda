BEGIN;
CREATE SCHEMA IF NOT EXISTS erp_task_private;
REVOKE ALL ON SCHEMA erp_task_private FROM PUBLIC,anon,authenticated;

CREATE TABLE public.erp_task_types (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cafe_id uuid NOT NULL REFERENCES public.cafes(id),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200), description text NOT NULL DEFAULT '' CHECK(length(description)<=20000),
 active boolean NOT NULL DEFAULT true, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(cafe_id,id), UNIQUE(cafe_id,name)
);
CREATE TABLE public.erp_task_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cafe_id uuid NOT NULL REFERENCES public.cafes(id),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200), description text NOT NULL DEFAULT '' CHECK(length(description)<=20000),
 active boolean NOT NULL DEFAULT true, lines jsonb NOT NULL CHECK(jsonb_typeof(lines)='array' AND jsonb_array_length(lines) BETWEEN 1 AND 100),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(cafe_id,id)
);
CREATE TABLE public.erp_task_flows (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cafe_id uuid NOT NULL REFERENCES public.cafes(id),
 number bigint GENERATED ALWAYS AS IDENTITY, code text NOT NULL CHECK(length(code) BETWEEN 1 AND 50), name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 assignee_id uuid NOT NULL REFERENCES auth.users(id), template_id uuid, description text NOT NULL DEFAULT '' CHECK(length(description)<=20000),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL REFERENCES auth.users(id),
 UNIQUE(cafe_id,id), UNIQUE(cafe_id,code), FOREIGN KEY(cafe_id,template_id) REFERENCES public.erp_task_templates(cafe_id,id)
);
CREATE INDEX erp_task_flows_assignee ON public.erp_task_flows(cafe_id,assignee_id);
CREATE INDEX erp_task_flows_template ON public.erp_task_flows(cafe_id,template_id);
CREATE TABLE public.erp_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cafe_id uuid NOT NULL REFERENCES public.cafes(id),
 number bigint GENERATED ALWAYS AS IDENTITY, code text NOT NULL CHECK(length(code) BETWEEN 1 AND 50),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 200), description text NOT NULL DEFAULT '' CHECK(length(description)<=20000),
 type_id uuid NOT NULL, assignee_id uuid NOT NULL REFERENCES auth.users(id),
 priority text NOT NULL DEFAULT 'medium' CHECK(priority IN('low','medium','high','urgent')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','in_progress','completed','cancelled')),
 due_date date, target_kind text, target_id uuid, flow_id uuid,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz, completed_at timestamptz, created_by uuid NOT NULL REFERENCES auth.users(id),
 CHECK((target_kind IS NULL)=(target_id IS NULL)),
 CHECK(target_kind IS NULL OR target_kind IN('customer','supplier','invoice','expense','purchase','item','warehouse','employee')),
 UNIQUE(cafe_id,id), UNIQUE(cafe_id,code), FOREIGN KEY(cafe_id,type_id) REFERENCES public.erp_task_types(cafe_id,id),
 FOREIGN KEY(cafe_id,flow_id) REFERENCES public.erp_task_flows(cafe_id,id)
);
CREATE INDEX erp_tasks_list ON public.erp_tasks(cafe_id,created_at DESC,id);
CREATE INDEX erp_tasks_assignee ON public.erp_tasks(cafe_id,assignee_id,status,due_date);
CREATE INDEX erp_tasks_type ON public.erp_tasks(cafe_id,type_id);
CREATE INDEX erp_tasks_flow ON public.erp_tasks(cafe_id,flow_id);
CREATE INDEX erp_tasks_target ON public.erp_tasks(cafe_id,target_kind,target_id);
CREATE TABLE public.erp_task_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cafe_id uuid NOT NULL REFERENCES public.cafes(id), task_id uuid NOT NULL,
 note text NOT NULL CHECK(length(btrim(note)) BETWEEN 1 AND 20000), occurred_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL REFERENCES auth.users(id),
 FOREIGN KEY(cafe_id,task_id) REFERENCES public.erp_tasks(cafe_id,id) ON DELETE CASCADE
);
CREATE INDEX erp_task_notes_task ON public.erp_task_notes(cafe_id,task_id,occurred_at);
CREATE TABLE public.erp_task_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cafe_id uuid NOT NULL REFERENCES public.cafes(id), task_id uuid, flow_id uuid,
 action text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', actor uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX erp_task_events_task ON public.erp_task_events(cafe_id,task_id,created_at);
CREATE INDEX erp_task_events_flow ON public.erp_task_events(cafe_id,flow_id,created_at);
CREATE TABLE public.erp_task_settings(cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id), enabled_targets text[] NOT NULL DEFAULT ARRAY['customer','supplier','invoice','expense','purchase','item','warehouse','employee']::text[],revision integer NOT NULL DEFAULT 1 CHECK(revision>0));
CREATE TABLE erp_task_private.requests(cafe_id uuid NOT NULL REFERENCES public.cafes(id),request_id uuid NOT NULL,actor uuid NOT NULL,action text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(cafe_id,request_id));

CREATE FUNCTION erp_task_private.access(p_cafe uuid,p_write boolean DEFAULT false,p_config boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'سجل الدخول للمتابعة' USING ERRCODE='42501'; END IF;
 r:=brand_finance_private.role_for(p_cafe);
 IF NOT coalesce(r IN('owner','manager','accountant','auditor'),false) OR (p_write AND r NOT IN('owner','manager')) OR (p_config AND r<>'owner') THEN
 RAISE EXCEPTION 'لا تملك صلاحية إدارة المهام لهذه العلامة' USING ERRCODE='42501'; END IF;
 RETURN r;
END $$;
CREATE FUNCTION erp_task_private.staff_name(p_cafe uuid,p_user uuid) RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce((SELECT name FROM public.bf_staff WHERE cafe_id=p_cafe AND user_id=p_user AND active),(SELECT name FROM public.cafes WHERE id=p_cafe AND owner_user_id=p_user))
$$;
CREATE FUNCTION erp_task_private.assert_assignee(p_cafe uuid,p_user uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF p_user IS NULL OR erp_task_private.staff_name(p_cafe,p_user) IS NULL THEN RAISE EXCEPTION 'اختر مسؤولًا نشطًا من هذه العلامة' USING ERRCODE='22023'; END IF;
END $$;
CREATE FUNCTION erp_task_private.target_name(p_cafe uuid,p_kind text,p_id uuid) RETURNS text LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE label text;
BEGIN
 IF p_kind IS NULL AND p_id IS NULL THEN RETURN NULL; END IF;
 IF p_kind IN('customer','supplier') THEN SELECT name INTO label FROM public.bf_parties WHERE cafe_id=p_cafe AND id=p_id AND kind=p_kind AND active;
 ELSIF p_kind IN('invoice','expense','purchase') THEN SELECT '#'||number::text INTO label FROM public.bf_documents WHERE cafe_id=p_cafe AND id=p_id AND kind=CASE p_kind WHEN 'invoice' THEN 'sale' WHEN 'expense' THEN 'expense' ELSE 'purchase' END;
 ELSIF p_kind='item' THEN SELECT name INTO label FROM public.bf_items WHERE cafe_id=p_cafe AND id=p_id AND active;
 ELSIF p_kind='warehouse' THEN SELECT name INTO label FROM public.bf_warehouses WHERE cafe_id=p_cafe AND id=p_id AND active;
 ELSIF p_kind='employee' THEN label:=erp_task_private.staff_name(p_cafe,p_id);
 END IF;
 RETURN label;
END $$;
CREATE FUNCTION erp_task_private.validate_target(p_cafe uuid,p_kind text,p_id uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE enabled text[];
BEGIN
 IF p_kind IS NULL AND p_id IS NULL THEN RETURN; END IF;
 SELECT enabled_targets INTO enabled FROM public.erp_task_settings WHERE cafe_id=p_cafe;
 enabled:=coalesce(enabled,ARRAY['customer','supplier','invoice','expense','purchase','item','warehouse','employee']::text[]);
 IF p_kind IS NULL OR p_id IS NULL OR NOT(p_kind=ANY(enabled)) OR erp_task_private.target_name(p_cafe,p_kind,p_id) IS NULL THEN RAISE EXCEPTION 'السجل المرتبط غير موجود أو غير متاح لهذا القسم' USING ERRCODE='22023'; END IF;
END $$;
CREATE FUNCTION erp_task_private.save_task(p_cafe uuid,p_data jsonb,p_flow uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
<<task_values>>
DECLARE task_id uuid:=nullif(p_data->>'id','')::uuid; old public.erp_tasks; task_type uuid:=(p_data->>'typeId')::uuid; assignee uuid:=(p_data->>'assigneeId')::uuid; target_id uuid:=nullif(p_data->>'targetId','')::uuid; target_kind text:=nullif(p_data->>'targetKind',''); title text:=btrim(p_data->>'title'); code text:=btrim(coalesce(p_data->>'code','')); due date:=nullif(p_data->>'dueDate','')::date;
BEGIN
 IF title IS NULL OR length(title) NOT BETWEEN 1 AND 200 OR coalesce(p_data->>'priority','medium') NOT IN('low','medium','high','urgent') THEN RAISE EXCEPTION 'راجع عنوان المهمة ودرجة الأولوية' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.erp_task_types WHERE cafe_id=p_cafe AND id=task_type AND active) THEN RAISE EXCEPTION 'اختر نوع مهمة نشطًا' USING ERRCODE='22023'; END IF;
 PERFORM erp_task_private.assert_assignee(p_cafe,assignee);
 PERFORM erp_task_private.validate_target(p_cafe,target_kind,target_id);
 IF task_id IS NULL THEN
  task_id:=gen_random_uuid();
  IF code='' THEN
   SELECT lpad((coalesce(max(t.number),0)+1)::text,6,'0') INTO code FROM public.erp_tasks t WHERE cafe_id=p_cafe;
   WHILE EXISTS(SELECT 1 FROM public.erp_tasks t WHERE t.cafe_id=p_cafe AND t.code=task_values.code) LOOP code:=lpad((code::bigint+1)::text,greatest(6,length(code)), '0'); END LOOP;
  END IF;
  INSERT INTO public.erp_tasks(id,cafe_id,code,title,description,type_id,assignee_id,priority,due_date,target_kind,target_id,flow_id,created_by)
  VALUES(task_id,p_cafe,code,title,coalesce(p_data->>'description',''),task_type,assignee,coalesce(p_data->>'priority','medium'),due,target_kind,target_id,p_flow,auth.uid());
 ELSE
  SELECT * INTO old FROM public.erp_tasks WHERE cafe_id=p_cafe AND id=task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'المهمة غير موجودة' USING ERRCODE='22023'; END IF;
  IF old.revision IS DISTINCT FROM (p_data->>'revision')::integer THEN RAISE EXCEPTION 'تغيرت المهمة أعد تحميلها قبل الحفظ' USING ERRCODE='40001'; END IF;
  UPDATE public.erp_tasks SET code=coalesce(nullif(task_values.code,''),old.code),title=task_values.title,description=coalesce(p_data->>'description',''),type_id=task_type,assignee_id=assignee,priority=coalesce(p_data->>'priority','medium'),due_date=due,target_kind=task_values.target_kind,target_id=task_values.target_id,revision=revision+1,updated_at=now() WHERE id=task_id AND cafe_id=p_cafe;
 END IF;
 INSERT INTO public.erp_task_events(cafe_id,task_id,flow_id,action,detail,actor) VALUES(p_cafe,task_id,coalesce(p_flow,old.flow_id),CASE WHEN old.id IS NULL THEN 'created' ELSE 'edited' END,jsonb_build_object('title',title,'assigneeId',assignee),auth.uid());
 RETURN task_id;
END $$;

CREATE FUNCTION public.erp_tasks_execute(p_cafe_id uuid,p_action text,p_data jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; previous erp_task_private.requests; result jsonb; v_id uuid:=nullif(p_data->>'id','')::uuid; item jsonb; old public.erp_tasks; v_rev integer; v_flow public.erp_task_flows; v_code text; v_line_id uuid; v_enabled text[];
BEGIN
 r:=erp_task_private.access(p_cafe_id,true,p_action IN('save_type','save_template','settings'));
 IF p_request_id IS NULL OR jsonb_typeof(p_data)<>'object' OR octet_length(p_data::text)>2000000 THEN RAISE EXCEPTION 'بيانات العملية غير صالحة' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text||':erp-tasks',0));
 SELECT * INTO previous FROM erp_task_private.requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN
  IF previous.actor<>auth.uid() OR previous.action<>p_action OR previous.payload<>p_data THEN RAISE EXCEPTION 'معرف الطلب مستخدم لعملية أخرى' USING ERRCODE='22023'; END IF;
  RETURN previous.result||'{"duplicate":true}'::jsonb;
 END IF;
 IF p_action='save' THEN v_id:=erp_task_private.save_task(p_cafe_id,p_data);
 ELSIF p_action='save_type' THEN
  IF v_id IS NULL THEN INSERT INTO public.erp_task_types(cafe_id,name,description,active) VALUES(p_cafe_id,btrim(p_data->>'name'),coalesce(p_data->>'description',''),coalesce((p_data->>'active')::boolean,true)) RETURNING id INTO v_id;
  ELSE UPDATE public.erp_task_types SET name=btrim(p_data->>'name'),description=coalesce(p_data->>'description',''),active=coalesce((p_data->>'active')::boolean,true),revision=revision+1 WHERE cafe_id=p_cafe_id AND id=v_id AND revision=(p_data->>'revision')::integer;
   IF NOT FOUND THEN RAISE EXCEPTION 'تغير نوع المهمة أو لم يعد موجودًا' USING ERRCODE='40001'; END IF;
  END IF;
 ELSIF p_action IN('save_template','save_flow') THEN
  IF jsonb_typeof(p_data->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'lines') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'أضف مهمة واحدة على الأقل' USING ERRCODE='22023'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_data->'lines') LOOP
   IF length(btrim(coalesce(item->>'title',''))) NOT BETWEEN 1 AND 200 OR length(coalesce(item->>'description',''))>20000 OR coalesce(item->>'priority','medium') NOT IN('low','medium','high','urgent') OR coalesce((item->>'dueDays')::integer,0) NOT BETWEEN 0 AND 3650 THEN RAISE EXCEPTION 'راجع بيانات مهام المسار' USING ERRCODE='22023'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.erp_task_types WHERE cafe_id=p_cafe_id AND id=(item->>'typeId')::uuid AND active) THEN RAISE EXCEPTION 'نوع المهمة غير متاح' USING ERRCODE='22023'; END IF;
   IF nullif(item->>'assigneeId','') IS NOT NULL THEN PERFORM erp_task_private.assert_assignee(p_cafe_id,(item->>'assigneeId')::uuid); END IF;
   PERFORM erp_task_private.validate_target(p_cafe_id,nullif(item->>'targetKind',''),nullif(item->>'targetId','')::uuid);
  END LOOP;
  IF p_action='save_template' THEN
   IF v_id IS NULL THEN INSERT INTO public.erp_task_templates(cafe_id,name,description,active,lines) VALUES(p_cafe_id,btrim(p_data->>'name'),coalesce(p_data->>'description',''),coalesce((p_data->>'active')::boolean,true),p_data->'lines') RETURNING id INTO v_id;
   ELSE UPDATE public.erp_task_templates SET name=btrim(p_data->>'name'),description=coalesce(p_data->>'description',''),active=coalesce((p_data->>'active')::boolean,true),lines=p_data->'lines',revision=revision+1 WHERE cafe_id=p_cafe_id AND id=v_id AND revision=(p_data->>'revision')::integer;
    IF NOT FOUND THEN RAISE EXCEPTION 'تغير قالب المهام أعد تحميله' USING ERRCODE='40001'; END IF;
   END IF;
  ELSE
   PERFORM erp_task_private.assert_assignee(p_cafe_id,(p_data->>'assigneeId')::uuid);
   IF nullif(p_data->>'templateId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_task_templates WHERE cafe_id=p_cafe_id AND id=(p_data->>'templateId')::uuid AND active) THEN RAISE EXCEPTION 'القالب غير متاح' USING ERRCODE='22023'; END IF;
   IF v_id IS NOT NULL THEN
    SELECT * INTO v_flow FROM public.erp_task_flows WHERE cafe_id=p_cafe_id AND id=v_id FOR UPDATE;
    IF NOT FOUND OR v_flow.revision IS DISTINCT FROM (p_data->>'revision')::integer THEN RAISE EXCEPTION 'تغير مسار المهام أعد تحميله' USING ERRCODE='40001'; END IF;
    IF EXISTS(SELECT 1 FROM public.erp_tasks WHERE cafe_id=p_cafe_id AND flow_id=v_id AND status<>'pending') THEN RAISE EXCEPTION 'لا يمكن استبدال مهام مسار بدأ تنفيذه' USING ERRCODE='22023'; END IF;
    DELETE FROM public.erp_tasks WHERE cafe_id=p_cafe_id AND flow_id=v_id;
    UPDATE public.erp_task_flows SET name=btrim(p_data->>'name'),description=coalesce(p_data->>'description',''),assignee_id=(p_data->>'assigneeId')::uuid,revision=revision+1 WHERE cafe_id=p_cafe_id AND id=v_id;
   ELSE
    v_code:=btrim(coalesce(p_data->>'code',''));
    IF v_code='' THEN SELECT lpad((coalesce(max(number),0)+1)::text,5,'0') INTO v_code FROM public.erp_task_flows WHERE cafe_id=p_cafe_id; END IF;
    INSERT INTO public.erp_task_flows(cafe_id,code,name,assignee_id,template_id,description,created_by) VALUES(p_cafe_id,v_code,btrim(p_data->>'name'),(p_data->>'assigneeId')::uuid,nullif(p_data->>'templateId','')::uuid,coalesce(p_data->>'description',''),auth.uid()) RETURNING id INTO v_id;
   END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(p_data->'lines') LOOP
    v_line_id:=erp_task_private.save_task(p_cafe_id,item||jsonb_build_object('assigneeId',coalesce(nullif(item->>'assigneeId',''),p_data->>'assigneeId'),'dueDate',((now() AT TIME ZONE 'Asia/Riyadh')::date+coalesce((item->>'dueDays')::integer,0))::text),v_id);
   END LOOP;
   INSERT INTO public.erp_task_events(cafe_id,flow_id,action,detail,actor) VALUES(p_cafe_id,v_id,'flow_saved',jsonb_build_object('count',jsonb_array_length(p_data->'lines')),auth.uid());
  END IF;
 ELSIF p_action IN('status','assign','link','note') THEN
  SELECT * INTO old FROM public.erp_tasks WHERE cafe_id=p_cafe_id AND id=v_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'المهمة غير موجودة' USING ERRCODE='22023'; END IF;
  IF p_action<>'note' AND old.revision IS DISTINCT FROM (p_data->>'revision')::integer THEN RAISE EXCEPTION 'تغيرت المهمة أعد تحميلها' USING ERRCODE='40001'; END IF;
  IF p_action='status' THEN
   IF NOT coalesce(CASE old.status WHEN 'pending' THEN p_data->>'status' IN('in_progress','cancelled') WHEN 'in_progress' THEN p_data->>'status' IN('completed','pending','cancelled') WHEN 'completed' THEN p_data->>'status'='in_progress' WHEN 'cancelled' THEN p_data->>'status'='pending' END,false) THEN RAISE EXCEPTION 'الانتقال إلى هذه الحالة غير مسموح' USING ERRCODE='22023'; END IF;
   UPDATE public.erp_tasks SET status=p_data->>'status',revision=revision+1,updated_at=now(),started_at=CASE WHEN p_data->>'status'='in_progress' THEN coalesce(started_at,now()) ELSE started_at END,completed_at=CASE WHEN p_data->>'status'='completed' THEN now() ELSE NULL END WHERE cafe_id=p_cafe_id AND id=v_id;
  ELSIF p_action='assign' THEN
   PERFORM erp_task_private.assert_assignee(p_cafe_id,(p_data->>'assigneeId')::uuid);
   UPDATE public.erp_tasks SET assignee_id=(p_data->>'assigneeId')::uuid,revision=revision+1,updated_at=now() WHERE cafe_id=p_cafe_id AND id=v_id;
  ELSIF p_action='link' THEN
   PERFORM erp_task_private.validate_target(p_cafe_id,nullif(p_data->>'targetKind',''),nullif(p_data->>'targetId','')::uuid);
   UPDATE public.erp_tasks SET target_kind=nullif(p_data->>'targetKind',''),target_id=nullif(p_data->>'targetId','')::uuid,revision=revision+1,updated_at=now() WHERE cafe_id=p_cafe_id AND id=v_id;
  ELSE
   INSERT INTO public.erp_task_notes(cafe_id,task_id,note,occurred_at,created_by) VALUES(p_cafe_id,v_id,btrim(p_data->>'note'),coalesce((p_data->>'occurredAt')::timestamptz,now()),auth.uid());
  END IF;
  INSERT INTO public.erp_task_events(cafe_id,task_id,flow_id,action,detail,actor) VALUES(p_cafe_id,v_id,old.flow_id,p_action,(p_data-'note')||jsonb_build_object('previousStatus',old.status),auth.uid());
 ELSIF p_action='delete' THEN
  IF p_data->>'kind'='task' THEN DELETE FROM public.erp_tasks WHERE cafe_id=p_cafe_id AND id=v_id AND revision=(p_data->>'revision')::integer;
  ELSIF p_data->>'kind'='type' AND r='owner' THEN DELETE FROM public.erp_task_types WHERE cafe_id=p_cafe_id AND id=v_id AND revision=(p_data->>'revision')::integer;
  ELSIF p_data->>'kind'='template' AND r='owner' THEN DELETE FROM public.erp_task_templates WHERE cafe_id=p_cafe_id AND id=v_id AND revision=(p_data->>'revision')::integer;
  ELSIF p_data->>'kind'='flow' THEN
   SELECT revision INTO v_rev FROM public.erp_task_flows WHERE cafe_id=p_cafe_id AND id=v_id FOR UPDATE;
   IF v_rev IS DISTINCT FROM (p_data->>'revision')::integer OR v_rev IS NULL THEN RAISE EXCEPTION 'تغير المسار أعد تحميله' USING ERRCODE='40001'; END IF;
   IF EXISTS(SELECT 1 FROM public.erp_tasks WHERE cafe_id=p_cafe_id AND flow_id=v_id AND status<>'pending') THEN RAISE EXCEPTION 'لا يمكن حذف مسار بدأ تنفيذه' USING ERRCODE='22023'; END IF;
   DELETE FROM public.erp_tasks WHERE cafe_id=p_cafe_id AND flow_id=v_id;
   DELETE FROM public.erp_task_flows WHERE cafe_id=p_cafe_id AND id=v_id;
  ELSE RAISE EXCEPTION 'لا تملك صلاحية حذف هذا السجل' USING ERRCODE='42501'; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'تغير السجل أو لم يعد موجودًا' USING ERRCODE='40001'; END IF;
  INSERT INTO public.erp_task_events(cafe_id,task_id,action,detail,actor) VALUES(p_cafe_id,v_id,'deleted',jsonb_build_object('kind',p_data->>'kind'),auth.uid());
 ELSIF p_action='settings' THEN
  IF jsonb_typeof(p_data->'enabledTargets') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'راجع الأقسام المختارة' USING ERRCODE='22023'; END IF;
  SELECT array_agg(DISTINCT value) INTO v_enabled FROM jsonb_array_elements_text(p_data->'enabledTargets');
  v_enabled:=coalesce(v_enabled,ARRAY[]::text[]);
  IF NOT v_enabled <@ ARRAY['customer','supplier','invoice','expense','purchase','item','warehouse','employee']::text[] THEN RAISE EXCEPTION 'قسم غير صالح للربط' USING ERRCODE='22023'; END IF;
  SELECT revision INTO v_rev FROM public.erp_task_settings WHERE cafe_id=p_cafe_id FOR UPDATE;
  IF coalesce(v_rev,0) IS DISTINCT FROM (p_data->>'revision')::integer THEN RAISE EXCEPTION 'تغيرت الإعدادات أعد تحميلها' USING ERRCODE='40001'; END IF;
  INSERT INTO public.erp_task_settings(cafe_id,enabled_targets) VALUES(p_cafe_id,v_enabled) ON CONFLICT(cafe_id) DO UPDATE SET enabled_targets=excluded.enabled_targets,revision=erp_task_settings.revision+1;
 ELSE RAISE EXCEPTION 'إجراء غير معروف' USING ERRCODE='22023'; END IF;
 result:=jsonb_build_object('id',v_id,'saved',true);
 INSERT INTO erp_task_private.requests(cafe_id,request_id,actor,action,payload,result) VALUES(p_cafe_id,p_request_id,auth.uid(),p_action,p_data,result);
 RETURN result;
END $$;

CREATE FUNCTION public.erp_tasks_read(p_cafe_id uuid,p_query jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; v_page integer:=coalesce((p_query->>'page')::integer,1); v_query text:=coalesce(p_query->>'query',''); v_id uuid:=nullif(p_query->>'id','')::uuid; v_flow uuid:=nullif(p_query->>'flowId','')::uuid; result jsonb;
BEGIN
 r:=erp_task_private.access(p_cafe_id);
 IF v_page NOT BETWEEN 1 AND 100000 OR length(v_query)>120 THEN RAISE EXCEPTION 'معايير البحث غير صالحة' USING ERRCODE='22023'; END IF;
 WITH filtered AS (
  SELECT t.*,ty.name type_name,erp_task_private.staff_name(p_cafe_id,t.assignee_id) assignee_name,erp_task_private.target_name(p_cafe_id,t.target_kind,t.target_id) target_name
  FROM public.erp_tasks t JOIN public.erp_task_types ty ON ty.cafe_id=t.cafe_id AND ty.id=t.type_id
  WHERE t.cafe_id=p_cafe_id AND (v_query='' OR t.title ILIKE '%'||v_query||'%' OR t.code ILIKE '%'||v_query||'%')
   AND (coalesce(p_query->>'status','')='' OR t.status=p_query->>'status') AND (coalesce(p_query->>'priority','')='' OR t.priority=p_query->>'priority')
   AND (nullif(p_query->>'typeId','') IS NULL OR t.type_id=(p_query->>'typeId')::uuid) AND (nullif(p_query->>'assigneeId','') IS NULL OR t.assignee_id=(p_query->>'assigneeId')::uuid)
   AND (v_id IS NULL OR t.id=v_id) AND (v_flow IS NULL OR t.flow_id=v_flow)
 ), paged AS (SELECT * FROM filtered ORDER BY CASE WHEN p_query->>'sort'='title' THEN title END ASC, CASE WHEN p_query->>'sort'='due' THEN due_date END ASC NULLS LAST, CASE WHEN p_query->>'sort'='oldest' THEN created_at END ASC,created_at DESC,id LIMIT CASE WHEN v_flow IS NULL THEN 50 ELSE 100 END OFFSET (v_page-1)*50)
 SELECT jsonb_build_object('tasks',coalesce((SELECT jsonb_agg(to_jsonb(p)-'cafe_id'-'created_by') FROM paged p),'[]'::jsonb),'total',(SELECT count(*) FROM filtered),'page',v_page) INTO result;
 RETURN result||jsonb_build_object(
  'types',coalesce((SELECT jsonb_agg(to_jsonb(t)-'cafe_id' ORDER BY name) FROM public.erp_task_types t WHERE cafe_id=p_cafe_id),'[]'::jsonb),
  'templates',coalesce((SELECT jsonb_agg(to_jsonb(t)-'cafe_id' ORDER BY created_at DESC) FROM public.erp_task_templates t WHERE cafe_id=p_cafe_id),'[]'::jsonb),
  'flows',coalesce((SELECT jsonb_agg(to_jsonb(f)-'cafe_id'-'created_by'||jsonb_build_object('assignee_name',erp_task_private.staff_name(p_cafe_id,f.assignee_id),'total',(SELECT count(*) FROM public.erp_tasks WHERE cafe_id=p_cafe_id AND flow_id=f.id),'completed',(SELECT count(*) FROM public.erp_tasks WHERE cafe_id=p_cafe_id AND flow_id=f.id AND status='completed'),'due_date',(SELECT max(due_date) FROM public.erp_tasks WHERE cafe_id=p_cafe_id AND flow_id=f.id),'started_at',(SELECT min(started_at) FROM public.erp_tasks WHERE cafe_id=p_cafe_id AND flow_id=f.id),'status',CASE WHEN NOT EXISTS(SELECT 1 FROM public.erp_tasks WHERE cafe_id=p_cafe_id AND flow_id=f.id AND status<>'completed') THEN 'completed' WHEN EXISTS(SELECT 1 FROM public.erp_tasks WHERE cafe_id=p_cafe_id AND flow_id=f.id AND status='in_progress') THEN 'in_progress' ELSE 'pending' END) ORDER BY f.created_at DESC) FROM public.erp_task_flows f WHERE cafe_id=p_cafe_id),'[]'::jsonb),
  'events',coalesce((SELECT jsonb_agg(to_jsonb(e)-'cafe_id'-'actor'||jsonb_build_object('actor_name',coalesce(erp_task_private.staff_name(p_cafe_id,e.actor),'عضو الفريق')) ORDER BY created_at DESC) FROM (SELECT * FROM public.erp_task_events WHERE cafe_id=p_cafe_id AND ((v_id IS NOT NULL AND task_id=v_id) OR (v_flow IS NOT NULL AND flow_id=v_flow)) ORDER BY created_at DESC LIMIT 300) e),'[]'::jsonb),
  'notes',coalesce((SELECT jsonb_agg(to_jsonb(n)-'cafe_id'-'created_by'||jsonb_build_object('actor_name',coalesce(erp_task_private.staff_name(p_cafe_id,n.created_by),'عضو الفريق')) ORDER BY occurred_at DESC) FROM public.erp_task_notes n WHERE cafe_id=p_cafe_id AND task_id=v_id),'[]'::jsonb),
  'staff',coalesce((SELECT jsonb_agg(s ORDER BY name) FROM (SELECT owner_user_id id,name FROM public.cafes WHERE id=p_cafe_id UNION SELECT user_id id,name FROM public.bf_staff WHERE cafe_id=p_cafe_id AND active) s),'[]'::jsonb),
  'settings',coalesce((SELECT jsonb_build_object('revision',revision,'enabledTargets',enabled_targets) FROM public.erp_task_settings WHERE cafe_id=p_cafe_id),'{"revision":0,"enabledTargets":["customer","supplier","invoice","expense","purchase","item","warehouse","employee"]}'::jsonb),
  'canWrite',r IN('owner','manager'),'canConfigure',r='owner');
END $$;
CREATE FUNCTION public.erp_tasks_targets(p_cafe_id uuid,p_kind text,p_query text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM erp_task_private.access(p_cafe_id);
 IF length(p_query)>120 OR p_kind NOT IN('customer','supplier','invoice','expense','purchase','item','warehouse','employee') THEN RAISE EXCEPTION 'معيار البحث غير صالح' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') INTO result FROM (
 SELECT * FROM (
 SELECT id,name label FROM public.bf_parties WHERE cafe_id=p_cafe_id AND active AND kind=p_kind AND p_kind IN('customer','supplier')
 UNION ALL SELECT id,'#'||number::text label FROM public.bf_documents WHERE cafe_id=p_cafe_id AND p_kind IN('invoice','expense','purchase') AND kind=CASE p_kind WHEN 'invoice' THEN 'sale' ELSE p_kind END
 UNION ALL SELECT id,name FROM public.bf_items WHERE cafe_id=p_cafe_id AND active AND p_kind='item'
 UNION ALL SELECT id,name FROM public.bf_warehouses WHERE cafe_id=p_cafe_id AND active AND p_kind='warehouse'
 UNION ALL SELECT owner_user_id,name FROM public.cafes WHERE id=p_cafe_id AND p_kind='employee'
 UNION ALL SELECT user_id,name FROM public.bf_staff WHERE cafe_id=p_cafe_id AND active AND p_kind='employee'
 ) all_targets WHERE label ILIKE '%'||p_query||'%' ORDER BY label LIMIT 100) r;
 RETURN result;
END $$;

-- RPC-only writes prevent clients from bypassing the task state machine, audit and tenant checks.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['erp_task_types','erp_task_templates','erp_task_flows','erp_tasks','erp_task_notes','erp_task_events','erp_task_settings'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
 END LOOP;
END $$;
ALTER TABLE erp_task_private.requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA erp_task_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_task_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_tasks_execute(uuid,text,jsonb,uuid),public.erp_tasks_read(uuid,jsonb),public.erp_tasks_targets(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_tasks_execute(uuid,text,jsonb,uuid),public.erp_tasks_read(uuid,jsonb),public.erp_tasks_targets(uuid,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
