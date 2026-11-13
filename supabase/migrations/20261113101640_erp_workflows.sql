BEGIN;
-- Dynamic workflow definitions, field/state/child permissions and actual financial source links
CREATE SCHEMA erp_workflow_private;
REVOKE ALL ON SCHEMA erp_workflow_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.erp_workflow_types(id uuid PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id),revision integer NOT NULL DEFAULT 1,config jsonb NOT NULL CHECK(jsonb_typeof(config)='object' AND octet_length(config::text)<=300000),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(cafe_id,id));
CREATE TABLE public.erp_workflow_records(id uuid PRIMARY KEY,cafe_id uuid NOT NULL,type_id uuid NOT NULL,code text NOT NULL CHECK(length(btrim(code)) BETWEEN 1 AND 80),status text NOT NULL,draft boolean NOT NULL DEFAULT false,payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=400000),revision integer NOT NULL DEFAULT 1,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(cafe_id,id),UNIQUE(cafe_id,type_id,code),FOREIGN KEY(cafe_id,type_id) REFERENCES public.erp_workflow_types(cafe_id,id));
CREATE INDEX erp_workflow_records_type ON public.erp_workflow_records(cafe_id,type_id,updated_at DESC);
CREATE TABLE public.erp_workflow_models(id uuid PRIMARY KEY,cafe_id uuid NOT NULL,type_id uuid NOT NULL,revision integer NOT NULL DEFAULT 1,config jsonb NOT NULL CHECK(jsonb_typeof(config)='object' AND octet_length(config::text)<=200000),UNIQUE(cafe_id,id),FOREIGN KEY(cafe_id,type_id) REFERENCES public.erp_workflow_types(cafe_id,id));
CREATE INDEX erp_workflow_models_type ON public.erp_workflow_models(cafe_id,type_id);
CREATE TABLE public.erp_workflow_children(id uuid PRIMARY KEY,cafe_id uuid NOT NULL,record_id uuid NOT NULL,model_id uuid NOT NULL,draft boolean NOT NULL DEFAULT false,field_values jsonb NOT NULL CHECK(jsonb_typeof(field_values)='object' AND octet_length(field_values::text)<=300000),revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(cafe_id,id),FOREIGN KEY(cafe_id,record_id) REFERENCES public.erp_workflow_records(cafe_id,id),FOREIGN KEY(cafe_id,model_id) REFERENCES public.erp_workflow_models(cafe_id,id));
CREATE INDEX erp_workflow_children_record ON public.erp_workflow_children(cafe_id,record_id,model_id);
CREATE INDEX erp_workflow_children_model ON public.erp_workflow_children(cafe_id,model_id);
CREATE TABLE public.erp_workflow_links(cafe_id uuid NOT NULL,record_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('document','quotation','credit_note','task')),target_id uuid NOT NULL,at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(cafe_id,kind,target_id),FOREIGN KEY(cafe_id,record_id) REFERENCES public.erp_workflow_records(cafe_id,id));
CREATE INDEX erp_workflow_links_record ON public.erp_workflow_links(cafe_id,record_id);
CREATE TABLE public.erp_workflow_drafts(cafe_id uuid NOT NULL,record_id uuid NOT NULL,draft_id uuid NOT NULL REFERENCES public.bf_invoice_drafts(id),PRIMARY KEY(cafe_id,draft_id),FOREIGN KEY(cafe_id,record_id) REFERENCES public.erp_workflow_records(cafe_id,id));
CREATE INDEX erp_workflow_drafts_record ON public.erp_workflow_drafts(cafe_id,record_id);
CREATE TABLE public.erp_workflow_activities(id uuid PRIMARY KEY,cafe_id uuid NOT NULL,record_id uuid NOT NULL,revision integer NOT NULL DEFAULT 1,payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),FOREIGN KEY(cafe_id,record_id) REFERENCES public.erp_workflow_records(cafe_id,id));
CREATE INDEX erp_workflow_activities_record ON public.erp_workflow_activities(cafe_id,record_id);
CREATE TABLE public.erp_workflow_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),type_id uuid,record_id uuid,action text NOT NULL,note text NOT NULL DEFAULT '',detail jsonb NOT NULL DEFAULT '{}',actor uuid NOT NULL REFERENCES auth.users(id),at timestamptz NOT NULL DEFAULT now());
CREATE INDEX erp_workflow_events_record ON public.erp_workflow_events(cafe_id,record_id,at DESC);
CREATE TRIGGER erp_workflow_event_immutable BEFORE UPDATE OR DELETE ON public.erp_workflow_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TABLE public.erp_workflow_settings(cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),revision integer NOT NULL DEFAULT 1,share_enabled boolean NOT NULL DEFAULT false,share_message text NOT NULL DEFAULT '{{العنوان}} — {{رقم_المستند}}' CHECK(length(share_message)<=2000));
CREATE TABLE erp_workflow_private.requests(cafe_id uuid NOT NULL REFERENCES public.cafes(id),request_id uuid NOT NULL,actor uuid NOT NULL,action text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,PRIMARY KEY(cafe_id,request_id));
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['erp_workflow_types','erp_workflow_records','erp_workflow_models','erp_workflow_children','erp_workflow_links','erp_workflow_drafts','erp_workflow_activities','erp_workflow_events','erp_workflow_settings'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;END$$;
ALTER TABLE erp_workflow_private.requests ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION erp_workflow_private.base_access(c uuid,a text) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$DECLARE r text:=brand_finance_private.role_for(c);domains text[];answer boolean;BEGIN
 IF auth.uid() IS NULL OR coalesce(r,'') NOT IN('owner','manager','accountant','auditor') OR(a<>'read' AND r='auditor') OR(a='settings' AND r NOT IN('owner','manager')) THEN RETURN false;END IF;
 IF to_regprocedure('erp_access_private.domains()') IS NOT NULL THEN EXECUTE 'SELECT erp_access_private.domains()' INTO domains;IF 'workflows'=ANY(domains) THEN EXECUTE 'SELECT erp_access_private.allowed($1,''workflows'',$2)' INTO answer USING c,a;RETURN coalesce(answer,false);END IF;END IF;RETURN true;
END$$;
CREATE FUNCTION erp_workflow_private.selector(c uuid,s jsonb) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$DECLARE mode text:=s->>'mode';BEGIN
 IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR jsonb_typeof(s->'ids') IS DISTINCT FROM 'array' THEN RETURN false;END IF;
 IF mode='everyone' THEN RETURN true;ELSIF mode='none' THEN RETURN false;ELSIF mode='users' THEN RETURN (s->'ids')?auth.uid()::text;
 ELSIF mode='employees' THEN RETURN EXISTS(SELECT 1 FROM public.erp_hr_employees WHERE cafe_id=c AND user_id=auth.uid() AND active AND(s->'ids')?id::text);
 ELSIF mode='branches' THEN RETURN EXISTS(SELECT 1 FROM public.erp_hr_employees WHERE cafe_id=c AND user_id=auth.uid() AND active AND(s->'ids')?branch_id::text);
 ELSIF mode='departments' THEN RETURN EXISTS(SELECT 1 FROM public.erp_org_assignments WHERE cafe_id=c AND user_id=auth.uid() AND(s->'ids')?department_id::text) OR EXISTS(SELECT 1 FROM public.erp_hr_employees WHERE cafe_id=c AND user_id=auth.uid() AND active AND(s->'ids')?department_id::text);
 ELSIF mode='designations' THEN RETURN EXISTS(SELECT 1 FROM public.erp_org_assignments WHERE cafe_id=c AND user_id=auth.uid() AND(s->'ids')?designation_id::text) OR EXISTS(SELECT 1 FROM public.erp_hr_employees WHERE cafe_id=c AND user_id=auth.uid() AND active AND(s->'ids')?designation_id::text);
 ELSIF mode='roles' THEN
  IF to_regclass('public.erp_role_assignments') IS NULL THEN RETURN false;END IF;
  RETURN EXISTS(SELECT 1 FROM public.erp_role_assignments a JOIN public.erp_roles r ON r.cafe_id=a.cafe_id AND r.id=a.role_id LEFT JOIN public.erp_hr_employees e ON e.cafe_id=a.cafe_id AND e.id=a.employee_id WHERE a.cafe_id=c AND coalesce(a.user_id,e.user_id)=auth.uid() AND r.active AND coalesce(e.active,true) AND(s->'ids')?r.id::text);
 END IF;RETURN false;
END$$;
CREATE FUNCTION erp_workflow_private.validate_selector(c uuid,s jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$DECLARE mode text:=s->>'mode';x text;valid boolean;BEGIN
 IF coalesce(jsonb_typeof(s),'')<>'object' OR coalesce(mode,'') NOT IN('everyone','none','users','employees','branches','departments','designations','roles') OR coalesce(jsonb_typeof(s->'ids'),'')<>'array' OR jsonb_array_length(s->'ids')>1000 OR(mode NOT IN('everyone','none') AND jsonb_array_length(s->'ids')=0) THEN RAISE EXCEPTION 'حدد نطاق صلاحيات صالح' USING ERRCODE='22023';END IF;
 FOR x IN SELECT jsonb_array_elements_text(s->'ids') LOOP
  IF mode='users' THEN valid:=EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=c AND user_id=x::uuid AND active) OR EXISTS(SELECT 1 FROM public.cafes WHERE id=c AND owner_user_id=x::uuid);
  ELSIF mode='employees' THEN valid:=EXISTS(SELECT 1 FROM public.erp_hr_employees WHERE cafe_id=c AND id=x::uuid AND active);
  ELSIF mode='branches' THEN valid:=EXISTS(SELECT 1 FROM public.branches WHERE cafe_id=c AND id=x::uuid);
  ELSIF mode IN('departments','designations') THEN valid:=EXISTS(SELECT 1 FROM public.erp_org_units WHERE cafe_id=c AND id=x::uuid AND active AND kind=CASE mode WHEN 'departments' THEN 'department' ELSE 'designation' END);
  ELSIF mode='roles' THEN IF to_regclass('public.erp_roles') IS NULL THEN valid:=false;ELSE SELECT EXISTS(SELECT 1 FROM public.erp_roles WHERE cafe_id=c AND id=x::uuid AND active) INTO valid;END IF;
  ELSE valid:=false;END IF;
  IF NOT valid THEN RAISE EXCEPTION 'الاختيار في الصلاحيات غير متاح لهذه العلامة' USING ERRCODE='22023';END IF;
 END LOOP;
END$$;
CREATE FUNCTION erp_workflow_private.keys(config jsonb) RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path='' AS $$SELECT ARRAY['title','code','start','end','customerId','budget','currency','staffIds','tags','description','files']::text[]||ARRAY(SELECT 'custom:'||(f->>'id') FROM jsonb_array_elements(config->'fields') f)$$;
CREATE FUNCTION erp_workflow_private.fields(c uuid,config jsonb,a text) RETURNS text[] LANGUAGE plpgsql STABLE SET search_path='' AS $$DECLARE result text[]:=erp_workflow_private.keys(config);rule jsonb;BEGIN
 IF brand_finance_private.role_for(c)='owner' THEN RETURN result;END IF;
 FOR rule IN SELECT value FROM jsonb_array_elements(config#>'{permissions,fieldRules}') LOOP IF erp_workflow_private.selector(c,rule->'selector') THEN SELECT ARRAY(SELECT unnest(result) INTERSECT SELECT jsonb_array_elements_text(rule->a)) INTO result;END IF;END LOOP;RETURN result;
END$$;
CREATE FUNCTION erp_workflow_private.allowed(c uuid,config jsonb,a text,st text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$DECLARE rule jsonb;BEGIN
 IF NOT erp_workflow_private.base_access(c,CASE a WHEN 'transition' THEN 'approve' ELSE a END) THEN RETURN false;END IF;
 IF brand_finance_private.role_for(c)='owner' THEN RETURN true;END IF;
 IF NOT erp_workflow_private.selector(c,config#>ARRAY['permissions',CASE a WHEN 'transition' THEN 'update' ELSE a END]) THEN RETURN false;END IF;
 IF st IS NOT NULL AND a IN('read','transition') THEN FOR rule IN SELECT value FROM jsonb_array_elements(config#>ARRAY['permissions',CASE a WHEN 'read' THEN 'stateRules' ELSE 'transitionRules' END]) LOOP IF erp_workflow_private.selector(c,rule->'selector') AND NOT(rule->'states')?st THEN RETURN false;END IF;END LOOP;END IF;RETURN true;
END$$;
CREATE FUNCTION erp_workflow_private.assert_record(c uuid,i uuid,a text DEFAULT 'read') RETURNS public.erp_workflow_records LANGUAGE plpgsql SET search_path='' AS $$DECLARE r public.erp_workflow_records%ROWTYPE;config jsonb;BEGIN
 SELECT * INTO r FROM public.erp_workflow_records WHERE cafe_id=c AND id=i;IF NOT FOUND THEN RAISE EXCEPTION 'سجل دورة العمل غير متاح' USING ERRCODE='42501';END IF;
 SELECT t.config INTO config FROM public.erp_workflow_types t WHERE cafe_id=c AND id=r.type_id;
 IF NOT erp_workflow_private.allowed(c,config,'read',r.status) OR(a<>'read' AND NOT erp_workflow_private.allowed(c,config,a)) THEN RAISE EXCEPTION 'لا تملك صلاحية هذا السجل في دورة العمل' USING ERRCODE='42501';END IF;RETURN r;
END$$;
CREATE FUNCTION erp_workflow_private.mask(c uuid,r public.erp_workflow_records,config jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$DECLARE fields text[]:=erp_workflow_private.fields(c,config,'read');result jsonb;v jsonb;f text;states jsonb;BEGIN
 SELECT coalesce(jsonb_object_agg(k,val),'{}') INTO result FROM jsonb_each(r.payload) p(k,val) WHERE k=ANY(fields);
 v:='{}';FOREACH f IN ARRAY fields LOOP IF left(f,7)='custom:' AND r.payload->'customValues'?substring(f FROM 8) THEN v:=v||jsonb_build_object(substring(f FROM 8),r.payload->'customValues'->substring(f FROM 8));END IF;END LOOP;
 SELECT coalesce(jsonb_agg(s->>'id'),'[]') INTO states FROM jsonb_array_elements(config->'statuses') s WHERE erp_workflow_private.allowed(c,config,'transition',s->>'id');
 RETURN result||jsonb_build_object('id',r.id,'typeId',r.type_id,'revision',r.revision,'status',r.status,'draft',r.draft,'customValues',v,'createdAt',r.created_at,'updatedAt',r.updated_at,'canApprove',erp_workflow_private.allowed(c,config,'update') AND erp_workflow_private.base_access(c,'approve'),'canUpdate',erp_workflow_private.allowed(c,config,'update'),'canDelete',erp_workflow_private.allowed(c,config,'delete'),'canFiles',erp_workflow_private.allowed(c,config,'update') AND 'files'=ANY(erp_workflow_private.fields(c,config,'update')) AND erp_workflow_private.base_access(c,'files'),'allowedFields',jsonb_build_object('create',erp_workflow_private.fields(c,config,'create'),'read',fields,'update',erp_workflow_private.fields(c,config,'update')),'allowedStates',states)||CASE WHEN 'customerId'=ANY(fields) THEN jsonb_build_object('customerName',(SELECT name FROM public.bf_parties WHERE cafe_id=c AND id=nullif(r.payload->>'customerId','')::uuid)) ELSE '{}' END;
END$$;
-- The implementation continues with validated writers, read models and scoped file adapters.
CREATE FUNCTION erp_workflow_private.validate_permissions(c uuid,p jsonb,fields jsonb,states jsonb,advanced boolean DEFAULT true) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$DECLARE a text;rule jsonb;key text;keys text[]:=erp_workflow_private.keys(jsonb_build_object('fields',fields));BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'صلاحيات الدورة غير صالحة';END IF;
 FOREACH a IN ARRAY ARRAY['create','read','update','delete'] LOOP PERFORM erp_workflow_private.validate_selector(c,p->a);END LOOP;
 IF NOT advanced THEN RETURN;END IF;
 FOREACH a IN ARRAY ARRAY['fieldRules','stateRules','transitionRules'] LOOP
  IF jsonb_typeof(p->a) IS DISTINCT FROM 'array' OR jsonb_array_length(p->a)>50 THEN RAISE EXCEPTION 'قواعد الصلاحيات غير صالحة';END IF;
  FOR rule IN SELECT value FROM jsonb_array_elements(p->a) LOOP
   PERFORM (rule->>'id')::uuid;PERFORM erp_workflow_private.validate_selector(c,rule->'selector');
   IF a='fieldRules' THEN
    FOREACH key IN ARRAY ARRAY['create','read','update'] LOOP
     IF jsonb_typeof(rule->key) IS DISTINCT FROM 'array' OR jsonb_array_length(rule->key)>100 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(rule->key) f WHERE NOT(f=ANY(keys))) THEN RAISE EXCEPTION 'حقول قاعدة الصلاحيات غير صالحة';END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(fields) f WHERE coalesce((f->>'required')::boolean,false) AND NOT coalesce(rule->'create' ? ('custom:'||(f->>'id')),false)) THEN RAISE EXCEPTION 'الحقول الإلزامية يجب أن تتاح عند الإضافة';END IF;
    IF NOT(rule->'create' @> '["title","code","start"]'::jsonb) THEN RAISE EXCEPTION 'العنوان والرقم وتاريخ البدء إلزامية عند الإضافة';END IF;
   ELSE
    IF jsonb_typeof(rule->'states') IS DISTINCT FROM 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(rule->'states') selected WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(states) s WHERE s->>'id'=selected)) THEN RAISE EXCEPTION 'حالات قاعدة الصلاحيات غير صالحة';END IF;
   END IF;
  END LOOP;
 END LOOP;
END$$;
CREATE FUNCTION erp_workflow_private.link(c uuid,i uuid,k text,target uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$DECLARE r public.erp_workflow_records%ROWTYPE;entry jsonb;config jsonb;BEGIN
 r:=erp_workflow_private.assert_record(c,i,'update');SELECT t.config INTO config FROM public.erp_workflow_types t WHERE cafe_id=c AND id=r.type_id;
 IF NOT ARRAY['budget','customerId']::text[]<@erp_workflow_private.fields(c,config,'read') OR NOT ARRAY['budget','customerId']::text[]<@erp_workflow_private.fields(c,config,'update') THEN RAISE EXCEPTION 'صلاحيات الحقول لا تسمح بربط معاملات مالية' USING ERRCODE='42501';END IF;
 entry:=erp_work_private.target(c,k,target);IF entry IS NULL THEN RAISE EXCEPTION 'المعاملة غير متاحة' USING ERRCODE='42501';END IF;
 IF entry->>'kind' IN('sale','quotation','credit_note') AND nullif(entry->>'partyId','')::uuid IS DISTINCT FROM nullif(r.payload->>'customerId','')::uuid THEN RAISE EXCEPTION 'عميل المعاملة لا يطابق سجل الدورة' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM public.erp_workflow_links WHERE cafe_id=c AND kind=k AND target_id=target AND record_id<>i) THEN RAISE EXCEPTION 'المعاملة مرتبطة بسجل دورة آخر' USING ERRCODE='23505';END IF;
 INSERT INTO public.erp_workflow_links(cafe_id,record_id,kind,target_id) VALUES(c,i,k,target) ON CONFLICT DO NOTHING;
END$$;
CREATE FUNCTION erp_workflow_private.child_allowed(c uuid,m jsonb,a text) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$SELECT erp_workflow_private.base_access(c,a) AND (brand_finance_private.role_for(c)='owner' OR erp_workflow_private.selector(c,m#>ARRAY['permissions',a]))$$;
CREATE FUNCTION public.erp_workflows_read(p_cafe_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE types jsonb:='[]';records jsonb:='[]';models jsonb:='[]';children jsonb:='[]';links jsonb:='[]';events jsonb:='[]';activities jsonb:='[]';t public.erp_workflow_types%ROWTYPE;r public.erp_workflow_records%ROWTYPE;m public.erp_workflow_models%ROWTYPE;k public.erp_workflow_children%ROWTYPE;can_config boolean;visible uuid[]:='{}';financial uuid[]:='{}';
BEGIN
 IF NOT erp_workflow_private.base_access(p_cafe_id,'read') THEN RAISE EXCEPTION 'لا تملك صلاحية دورات العمل' USING ERRCODE='42501';END IF;can_config:=erp_workflow_private.base_access(p_cafe_id,'settings');
 FOR t IN SELECT * FROM public.erp_workflow_types WHERE cafe_id=p_cafe_id ORDER BY config->>'plural' LOOP
  IF can_config OR erp_workflow_private.allowed(p_cafe_id,t.config,'read') OR erp_workflow_private.allowed(p_cafe_id,t.config,'create') THEN
   types:=types||jsonb_build_array(t.config||jsonb_build_object('id',t.id,'revision',t.revision,'canCreate',erp_workflow_private.allowed(p_cafe_id,t.config,'create') AND (t.config->>'active')::boolean,'canConfigure',can_config,'createFields',erp_workflow_private.fields(p_cafe_id,t.config,'create')));
  END IF;
  FOR r IN SELECT * FROM public.erp_workflow_records WHERE cafe_id=p_cafe_id AND type_id=t.id ORDER BY updated_at DESC LOOP
   IF erp_workflow_private.allowed(p_cafe_id,t.config,'read',r.status) THEN
    records:=records||jsonb_build_array(erp_workflow_private.mask(p_cafe_id,r,t.config));visible:=array_append(visible,r.id);
    IF ARRAY['budget','customerId']::text[]<@erp_workflow_private.fields(p_cafe_id,t.config,'read') THEN financial:=array_append(financial,r.id);END IF;
   END IF;
  END LOOP;
  FOR m IN SELECT * FROM public.erp_workflow_models WHERE cafe_id=p_cafe_id AND type_id=t.id LOOP
   IF can_config OR erp_workflow_private.allowed(p_cafe_id,t.config,'read') AND (erp_workflow_private.child_allowed(p_cafe_id,m.config,'read') OR erp_workflow_private.child_allowed(p_cafe_id,m.config,'create')) THEN
    models:=models||jsonb_build_array(m.config||jsonb_build_object('id',m.id,'revision',m.revision,'typeId',m.type_id,'canRead',erp_workflow_private.child_allowed(p_cafe_id,m.config,'read'),'canCreate',erp_workflow_private.child_allowed(p_cafe_id,m.config,'create') AND (m.config->>'active')::boolean,'canUpdate',erp_workflow_private.child_allowed(p_cafe_id,m.config,'update'),'canDelete',erp_workflow_private.child_allowed(p_cafe_id,m.config,'delete')));
    IF erp_workflow_private.child_allowed(p_cafe_id,m.config,'read') THEN
     FOR k IN SELECT * FROM public.erp_workflow_children WHERE cafe_id=p_cafe_id AND model_id=m.id AND record_id=ANY(visible) LOOP
      children:=children||jsonb_build_array(jsonb_build_object('id',k.id,'revision',k.revision,'recordId',k.record_id,'modelId',k.model_id,'values',k.field_values,'draft',k.draft,'createdAt',k.created_at,'canUpdate',erp_workflow_private.child_allowed(p_cafe_id,m.config,'update'),'canDelete',erp_workflow_private.child_allowed(p_cafe_id,m.config,'delete'),'canFiles',erp_workflow_private.child_allowed(p_cafe_id,m.config,'update') AND erp_workflow_private.base_access(p_cafe_id,'files')));
     END LOOP;
    END IF;
   END IF;
  END LOOP;
 END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object('recordId',l.record_id,'kind',l.kind,'targetId',l.target_id,'at',l.at,'title',entry->>'label','documentKind',entry->>'kind','amount',coalesce(entry->'amount','0'),'outstanding',coalesce(entry->'outstanding','0'))),'[]') INTO links FROM public.erp_workflow_links l CROSS JOIN LATERAL erp_work_private.target(l.cafe_id,l.kind,l.target_id)entry WHERE l.cafe_id=p_cafe_id AND l.record_id=ANY(financial);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'recordId',e.record_id,'action',e.action,'note',e.note,'shared',coalesce((e.detail->>'shared')::boolean,false),'occurredAt',e.detail->>'occurredAt','actionId',e.detail->>'actionId','status',e.detail->>'status','at',e.at,'actorName',coalesce(s.name,'المالك')) ORDER BY e.at DESC),'[]') INTO events FROM public.erp_workflow_events e LEFT JOIN public.bf_staff s ON s.cafe_id=e.cafe_id AND s.user_id=e.actor WHERE e.cafe_id=p_cafe_id AND(e.record_id=ANY(visible) OR can_config AND e.record_id IS NULL);
 SELECT coalesce(jsonb_agg(a.payload||jsonb_build_object('id',a.id,'revision',a.revision,'recordId',a.record_id)),'[]') INTO activities FROM public.erp_workflow_activities a WHERE a.cafe_id=p_cafe_id AND a.record_id=ANY(visible);
 RETURN jsonb_build_object('types',types,'records',records,'models',models,'children',children,'links',links,'events',events,'activities',activities,'drafts',coalesce((SELECT jsonb_agg(jsonb_build_object('recordId',record_id,'draftId',draft_id)) FROM public.erp_workflow_drafts d WHERE cafe_id=p_cafe_id AND record_id=ANY(financial) AND NOT EXISTS(SELECT 1 FROM public.bf_company_invoices WHERE cafe_id=p_cafe_id AND draft_id=d.draft_id)),'[]'),'settings',coalesce((SELECT jsonb_build_object('revision',revision,'shareEnabled',share_enabled,'shareMessage',share_message) FROM public.erp_workflow_settings WHERE cafe_id=p_cafe_id),'{"revision":0,"shareEnabled":false,"shareMessage":"{{العنوان}} — {{رقم_المستند}}"}'::jsonb),'canConfigure',can_config,'taskTypes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.erp_task_types WHERE cafe_id=p_cafe_id AND active),'[]'),
 'lookups',jsonb_build_object('branches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.branches WHERE cafe_id=p_cafe_id),'[]'),'departments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.erp_org_units WHERE cafe_id=p_cafe_id AND kind='department' AND active),'[]'),'designations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.erp_org_units WHERE cafe_id=p_cafe_id AND kind='designation' AND active),'[]'),'employees',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',first_name||' '||last_name)) FROM public.erp_hr_employees WHERE cafe_id=p_cafe_id AND active),'[]'),'users',coalesce((SELECT jsonb_agg(jsonb_build_object('id',user_id,'name',name)) FROM public.bf_staff WHERE cafe_id=p_cafe_id AND active),'[]'),'roles',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.erp_roles WHERE cafe_id=p_cafe_id AND active),'[]')));
END$$;

CREATE FUNCTION erp_workflow_private.validate_values(fields jsonb,vals jsonb,p_cafe uuid DEFAULT NULL,p_record uuid DEFAULT NULL,p_scope uuid DEFAULT NULL,depth integer DEFAULT 0,p_draft boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE f jsonb;v jsonb;t text;x jsonb;txt text;tbl text;col text;valid boolean;metric numeric;BEGIN
 IF coalesce(jsonb_typeof(vals),'')<>'object' OR octet_length(vals::text)>262144 OR depth>2 THEN RAISE EXCEPTION 'بيانات الحقول الإضافية غير صالحة';END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(coalesce(fields,'[]')) LOOP
  t:=f->>'type';IF t IN('static','separator') THEN CONTINUE;END IF;
  v:=coalesce(vals->(f->>'id'),f->'defaultValue');
  IF coalesce((f->>'required')::boolean,false) AND NOT p_draft AND (v IS NULL OR v='null'::jsonb OR v='""'::jsonb OR v='[]'::jsonb OR (t='checkbox' AND v<>'true')) THEN RAISE EXCEPTION 'أكمل الحقل المطلوب: %',f->>'label';END IF;
  IF v IS NULL OR v='null'::jsonb OR v='""'::jsonb THEN CONTINUE;END IF;
  IF t='subform' THEN
   IF jsonb_typeof(v)<>'array' OR jsonb_array_length(v)>100 OR jsonb_array_length(v)<coalesce((f->>'minimumRows')::integer,0) THEN RAISE EXCEPTION 'عدد صفوف النموذج غير صالح';END IF;
   FOR x IN SELECT value FROM jsonb_array_elements(v) LOOP PERFORM erp_workflow_private.validate_values(f->'fields',x,p_cafe,p_record,p_scope,depth+1,p_draft);END LOOP;CONTINUE;
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
   tbl:=CASE f->>'entity' WHEN 'items' THEN 'bf_items' WHEN 'customers' THEN 'bf_parties' WHEN 'employees' THEN 'bf_staff' WHEN 'warehouses' THEN 'bf_warehouses' WHEN 'accounts' THEN 'bf_accounts' WHEN 'bom' THEN 'erp_mfg_boms' WHEN 'routings' THEN 'erp_mfg_routings' WHEN 'workstations' THEN 'erp_mfg_workstations' WHEN 'orders' THEN 'erp_mfg_orders' WHEN 'sources' THEN 'bf_documents' END;
   IF tbl IS NULL OR p_cafe IS NULL THEN RAISE EXCEPTION 'الكيان المرتبط غير صالح';END IF;col:=CASE WHEN tbl='bf_staff' THEN 'user_id' ELSE 'id' END;
   FOR x IN SELECT value FROM jsonb_array_elements(CASE WHEN t='dynamic' THEN jsonb_build_array(v) ELSE v END) LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE cafe_id=$1 AND %I=$2)',tbl,col) INTO valid USING p_cafe,(x#>>'{}')::uuid;
    IF NOT valid THEN RAISE EXCEPTION 'القيمة المرتبطة غير موجودة في العلامة';END IF;
   END LOOP;
  END IF;
  IF t IN('file','image') THEN
   IF p_record IS NULL OR to_regclass('public.erp_files') IS NULL THEN RAISE EXCEPTION 'احفظ السجل وأضف المرفق أولًا';END IF;
   EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.erp_files WHERE cafe_id=$1 AND record_id=$2 AND id=$3 AND entity_type=$4 AND uploaded AND ($5<>''image'' OR mime IN(''image/jpeg'',''image/png'')))' INTO valid USING p_cafe,p_record,txt::uuid,'workflow_record',t;
   IF NOT valid THEN RAISE EXCEPTION 'المرفق غير موجود في هذا السجل';END IF;
  END IF;
  IF coalesce((f->>'unique')::boolean,false) AND depth=0 THEN
   tbl:='erp_workflow_records';
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE cafe_id=$1 AND id IS DISTINCT FROM $2 AND payload->''customValues''->$3=$4 AND type_id=$5)',tbl) INTO valid USING p_cafe,p_record,f->>'id',v,p_scope;
   IF valid THEN RAISE EXCEPTION 'قيمة الحقل مستخدمة مسبقًا: %',f->>'label';END IF;
  END IF;
 END LOOP;
END $$;
CREATE FUNCTION erp_workflow_private.validate_child_values(fields jsonb,vals jsonb,p_cafe uuid DEFAULT NULL,p_record uuid DEFAULT NULL,p_scope uuid DEFAULT NULL,depth integer DEFAULT 0,p_draft boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE f jsonb;v jsonb;t text;x jsonb;txt text;tbl text;col text;valid boolean;metric numeric;BEGIN
 IF coalesce(jsonb_typeof(vals),'')<>'object' OR octet_length(vals::text)>262144 OR depth>2 THEN RAISE EXCEPTION 'بيانات الحقول الإضافية غير صالحة';END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(coalesce(fields,'[]')) LOOP
  t:=f->>'type';IF t IN('static','separator') THEN CONTINUE;END IF;
  v:=coalesce(vals->(f->>'id'),f->'defaultValue');
  IF coalesce((f->>'required')::boolean,false) AND NOT p_draft AND (v IS NULL OR v='null'::jsonb OR v='""'::jsonb OR v='[]'::jsonb OR (t='checkbox' AND v<>'true')) THEN RAISE EXCEPTION 'أكمل الحقل المطلوب: %',f->>'label';END IF;
  IF v IS NULL OR v='null'::jsonb OR v='""'::jsonb THEN CONTINUE;END IF;
  IF t='subform' THEN
   IF jsonb_typeof(v)<>'array' OR jsonb_array_length(v)>100 OR jsonb_array_length(v)<coalesce((f->>'minimumRows')::integer,0) THEN RAISE EXCEPTION 'عدد صفوف النموذج غير صالح';END IF;
   FOR x IN SELECT value FROM jsonb_array_elements(v) LOOP PERFORM erp_workflow_private.validate_child_values(f->'fields',x,p_cafe,p_record,p_scope,depth+1,p_draft);END LOOP;CONTINUE;
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
   tbl:=CASE f->>'entity' WHEN 'items' THEN 'bf_items' WHEN 'customers' THEN 'bf_parties' WHEN 'employees' THEN 'bf_staff' WHEN 'warehouses' THEN 'bf_warehouses' WHEN 'accounts' THEN 'bf_accounts' WHEN 'bom' THEN 'erp_mfg_boms' WHEN 'routings' THEN 'erp_mfg_routings' WHEN 'workstations' THEN 'erp_mfg_workstations' WHEN 'orders' THEN 'erp_mfg_orders' WHEN 'sources' THEN 'bf_documents' END;
   IF tbl IS NULL OR p_cafe IS NULL THEN RAISE EXCEPTION 'الكيان المرتبط غير صالح';END IF;col:=CASE WHEN tbl='bf_staff' THEN 'user_id' ELSE 'id' END;
   FOR x IN SELECT value FROM jsonb_array_elements(CASE WHEN t='dynamic' THEN jsonb_build_array(v) ELSE v END) LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE cafe_id=$1 AND %I=$2)',tbl,col) INTO valid USING p_cafe,(x#>>'{}')::uuid;
    IF NOT valid THEN RAISE EXCEPTION 'القيمة المرتبطة غير موجودة في العلامة';END IF;
   END LOOP;
  END IF;
  IF t IN('file','image') THEN
   IF p_record IS NULL OR to_regclass('public.erp_files') IS NULL THEN RAISE EXCEPTION 'احفظ السجل وأضف المرفق أولًا';END IF;
   EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.erp_files WHERE cafe_id=$1 AND record_id=$2 AND id=$3 AND entity_type=$4 AND uploaded AND ($5<>''image'' OR mime IN(''image/jpeg'',''image/png'')))' INTO valid USING p_cafe,p_record,txt::uuid,'workflow_child',t;
   IF NOT valid THEN RAISE EXCEPTION 'المرفق غير موجود في هذا السجل';END IF;
  END IF;
  IF coalesce((f->>'unique')::boolean,false) AND depth=0 THEN
   tbl:='erp_workflow_children';
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE cafe_id=$1 AND id IS DISTINCT FROM $2 AND field_values->$3=$4 AND model_id=$5)',tbl) INTO valid USING p_cafe,p_record,f->>'id',v,p_scope;
   IF valid THEN RAISE EXCEPTION 'قيمة الحقل مستخدمة مسبقًا: %',f->>'label';END IF;
  END IF;
 END LOOP;
END $$;

CREATE FUNCTION public.erp_workflows_write(p_cafe_id uuid,p_action text,p_payload jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<workflow_write>>
DECLARE req erp_workflow_private.requests%ROWTYPE;t public.erp_workflow_types%ROWTYPE;r public.erp_workflow_records%ROWTYPE;m public.erp_workflow_models%ROWTYPE;child public.erp_workflow_children%ROWTYPE;rid uuid;rev integer;typ uuid;scope uuid;data jsonb;changes jsonb;vals jsonb;result jsonb;field text;val jsonb;allowed text[];ids uuid[];code text;num bigint;st text;action_name text;old_revision integer;target uuid;begin_at timestamptz;end_at timestamptz;idx integer;counted integer;ev_record uuid;ev_type uuid;
BEGIN
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>600000 OR p_request_id IS NULL OR NOT erp_workflow_private.base_access(p_cafe_id,'read') THEN RAISE EXCEPTION 'طلب دورة العمل غير صالح أو غير مصرح' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 SELECT * INTO req FROM erp_workflow_private.requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN IF req.actor<>auth.uid() OR req.action<>p_action OR req.payload<>p_payload THEN RAISE EXCEPTION 'معرف العملية مستخدم لطلب آخر' USING ERRCODE='22023';END IF;RETURN req.result;END IF;
 rid:=nullif(p_payload->>'id','')::uuid;rev:=(p_payload->>'revision')::integer;result:=jsonb_build_object('id',rid);
 IF p_action IN('type','model','settings') THEN
  IF NOT erp_workflow_private.base_access(p_cafe_id,'settings') THEN RAISE EXCEPTION 'لا تملك صلاحية إعدادات الدورات' USING ERRCODE='42501';END IF;
  IF p_action='settings' THEN
   SELECT revision INTO old_revision FROM public.erp_workflow_settings WHERE cafe_id=p_cafe_id;
   IF coalesce(old_revision,0) IS DISTINCT FROM rev THEN RAISE EXCEPTION 'الإعدادات تغيرت' USING ERRCODE='40001';END IF;
   IF jsonb_typeof(p_payload->'shareEnabled') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'إعداد المشاركة غير صالح';END IF;
   INSERT INTO public.erp_workflow_settings(cafe_id,revision,share_enabled,share_message) VALUES(p_cafe_id,rev+1,(p_payload->>'shareEnabled')::boolean,p_payload->>'shareMessage') ON CONFLICT(cafe_id) DO UPDATE SET revision=excluded.revision,share_enabled=excluded.share_enabled,share_message=excluded.share_message;result:=jsonb_build_object('id',p_cafe_id);
  ELSIF p_action='type' THEN
   SELECT * INTO t FROM public.erp_workflow_types WHERE cafe_id=p_cafe_id AND id=rid FOR UPDATE;
   IF coalesce(t.revision,0) IS DISTINCT FROM rev THEN RAISE EXCEPTION 'نوع الدورة تغير' USING ERRCODE='40001';END IF;
   IF rid IS NULL OR length(btrim(coalesce(p_payload->>'plural',''))) NOT BETWEEN 1 AND 160 OR length(btrim(coalesce(p_payload->>'singular',''))) NOT BETWEEN 1 AND 160 OR jsonb_typeof(p_payload->'active') IS DISTINCT FROM 'boolean' OR coalesce((p_payload->>'nextNumber')::integer,0) NOT BETWEEN 1 AND 999999999 OR length(coalesce(p_payload->>'description',''))>20000 OR coalesce(p_payload->>'icon','') NOT IN('clipboard','briefcase','users','calendar','folder','package','wrench','home','truck','receipt','star','heart') THEN RAISE EXCEPTION 'راجع معلومات نوع الدورة';END IF;
   PERFORM erp_manufacturing_private.validate_custom_fields(p_payload->'fields');
   IF jsonb_typeof(p_payload->'statuses') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'statuses') NOT BETWEEN 1 AND 50 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'statuses') state_row WHERE coalesce(state_row->>'id','')!~'^[a-z][a-z0-9_-]{0,59}$' OR length(btrim(coalesce(state_row->>'name',''))) NOT BETWEEN 1 AND 100 OR jsonb_typeof(state_row->'closed') IS DISTINCT FROM 'boolean' OR coalesce(state_row->>'color','')!~'^#[a-fA-F0-9]{6}$') OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'statuses') state_row GROUP BY state_row->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'حالات الدورة غير صالحة';END IF;
   IF EXISTS(SELECT 1 FROM public.erp_workflow_records saved WHERE cafe_id=p_cafe_id AND type_id=rid AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'statuses') state_row WHERE state_row->>'id'=saved.status)) THEN RAISE EXCEPTION 'لا تحذف حالة مستخدمة';END IF;
   IF jsonb_typeof(p_payload->'actions') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'actions')>100 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'actions') action_row WHERE length(btrim(coalesce(action_row->>'name',''))) NOT BETWEEN 1 AND 160 OR coalesce(action_row->>'id','')!~'^[a-f0-9-]{36}$') THEN RAISE EXCEPTION 'إجراءات الدورة غير صالحة';END IF;
   PERFORM erp_workflow_private.validate_permissions(p_cafe_id,p_payload->'permissions',p_payload->'fields',p_payload->'statuses');
   INSERT INTO public.erp_workflow_types(id,cafe_id,revision,config) VALUES(rid,p_cafe_id,rev+1,p_payload-'id'-'revision') ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,config=excluded.config WHERE erp_workflow_types.cafe_id=p_cafe_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'نوع الدورة غير متاح' USING ERRCODE='42501';END IF;ev_type:=rid;
  ELSE
   typ:=(p_payload->>'typeId')::uuid;SELECT * INTO t FROM public.erp_workflow_types WHERE cafe_id=p_cafe_id AND id=typ;
   SELECT * INTO m FROM public.erp_workflow_models WHERE cafe_id=p_cafe_id AND id=rid FOR UPDATE;
   IF t.id IS NULL OR rid IS NULL OR m.type_id IS NOT NULL AND m.type_id<>typ THEN RAISE EXCEPTION 'نوع الدورة غير متاح' USING ERRCODE='42501';END IF;
   IF coalesce(m.revision,0) IS DISTINCT FROM rev THEN RAISE EXCEPTION 'النموذج تغير' USING ERRCODE='40001';END IF;
   IF length(btrim(coalesce(p_payload->>'name',''))) NOT BETWEEN 1 AND 160 OR coalesce(p_payload->>'key','')!~'^[a-z][a-z0-9_]{0,59}$' OR jsonb_typeof(p_payload->'active') IS DISTINCT FROM 'boolean' OR length(coalesce(p_payload->>'description',''))>20000 THEN RAISE EXCEPTION 'معلومات النموذج غير صالحة';END IF;
   IF EXISTS(SELECT 1 FROM public.erp_workflow_models WHERE cafe_id=p_cafe_id AND type_id=typ AND id<>rid AND config->>'key'=p_payload->>'key') THEN RAISE EXCEPTION 'معرف النموذج مستخدم' USING ERRCODE='23505';END IF;
   PERFORM erp_manufacturing_private.validate_custom_fields(p_payload->'fields');PERFORM erp_workflow_private.validate_permissions(p_cafe_id,p_payload->'permissions',p_payload->'fields','[]',false);
   IF coalesce(p_payload->>'nameField','')<>'' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'fields') f WHERE f->>'id'=p_payload->>'nameField') THEN RAISE EXCEPTION 'حقل اسم النموذج غير متاح';END IF;
   INSERT INTO public.erp_workflow_models(id,cafe_id,type_id,revision,config) VALUES(rid,p_cafe_id,typ,rev+1,p_payload-'id'-'typeId'-'revision') ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,config=excluded.config WHERE erp_workflow_models.cafe_id=p_cafe_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'النموذج غير متاح' USING ERRCODE='42501';END IF;ev_type:=typ;
  END IF;
 ELSIF p_action='record' THEN
  typ:=(p_payload->>'typeId')::uuid;SELECT * INTO t FROM public.erp_workflow_types WHERE cafe_id=p_cafe_id AND id=typ;
  SELECT * INTO r FROM public.erp_workflow_records WHERE cafe_id=p_cafe_id AND id=rid FOR UPDATE;
  IF t.id IS NULL OR rid IS NULL OR r.type_id IS NOT NULL AND r.type_id<>typ THEN RAISE EXCEPTION 'الدورة غير متاحة' USING ERRCODE='42501';END IF;
  IF coalesce(r.revision,0) IS DISTINCT FROM rev THEN RAISE EXCEPTION 'السجل تغير' USING ERRCODE='40001';END IF;
  action_name:=CASE WHEN r.id IS NULL THEN 'create' ELSE 'update' END;
  IF NOT erp_workflow_private.allowed(p_cafe_id,t.config,action_name) OR(r.id IS NULL AND NOT(t.config->>'active')::boolean) OR(r.id IS NOT NULL AND NOT erp_workflow_private.allowed(p_cafe_id,t.config,'read',r.status)) THEN RAISE EXCEPTION 'لا تملك صلاحية حفظ السجل' USING ERRCODE='42501';END IF;
  allowed:=erp_workflow_private.fields(p_cafe_id,t.config,action_name);changes:=p_payload->'changes';
  IF jsonb_typeof(changes) IS DISTINCT FROM 'object' OR jsonb_typeof(p_payload->'draft') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'التغييرات غير صالحة';END IF;
  data:=coalesce(r.payload,'{"title":"","code":"","start":null,"end":null,"customerId":null,"budget":0,"currency":"SAR","staffIds":[],"tags":[],"description":"","customValues":{}}'::jsonb);
  FOR field,val IN SELECT * FROM jsonb_each(changes) LOOP
   IF field='customValues' THEN
    IF jsonb_typeof(val) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'قيم الحقول غير صالحة';END IF;
    FOR code,vals IN SELECT * FROM jsonb_each(val) LOOP
     IF NOT('custom:'||code)=ANY(allowed) THEN RAISE EXCEPTION 'لا تملك صلاحية تعديل الحقل المحدد' USING ERRCODE='42501';END IF;
     data:=jsonb_set(data,ARRAY['customValues',code],vals,true);
    END LOOP;
   ELSE
    IF NOT field=ANY(allowed) OR field='files' THEN RAISE EXCEPTION 'لا تملك صلاحية تعديل الحقل المحدد' USING ERRCODE='42501';END IF;data:=jsonb_set(data,ARRAY[field],val,true);
   END IF;
  END LOOP;
  IF length(btrim(coalesce(data->>'title',''))) NOT BETWEEN 1 AND 160 OR nullif(data->>'start','')::date IS NULL OR nullif(data->>'end','')::date<(data->>'start')::date OR length(coalesce(data->>'description',''))>20000 OR coalesce((data->>'budget')::numeric,-1) NOT BETWEEN 0 AND 1000000000 OR (data->>'budget')::numeric<>round((data->>'budget')::numeric,2) OR coalesce(data->>'currency','') NOT IN('SAR','USD','EUR','GBP','AED') OR jsonb_typeof(data->'staffIds') IS DISTINCT FROM 'array' OR jsonb_typeof(data->'tags') IS DISTINCT FROM 'array' OR jsonb_array_length(data->'tags')>20 THEN RAISE EXCEPTION 'راجع العنوان والتواريخ والميزانية والعملة';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(data->'tags') tag WHERE length(btrim(tag)) NOT BETWEEN 1 AND 60) THEN RAISE EXCEPTION 'الوسوم غير صالحة';END IF;
  IF nullif(data->>'customerId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bf_parties WHERE cafe_id=p_cafe_id AND id=(data->>'customerId')::uuid AND kind='customer' AND active) THEN RAISE EXCEPTION 'العميل غير متاح';END IF;
  IF r.id IS NOT NULL AND data->'customerId' IS DISTINCT FROM r.payload->'customerId' AND(EXISTS(SELECT 1 FROM public.erp_workflow_links WHERE cafe_id=p_cafe_id AND record_id=rid AND kind<>'task') OR EXISTS(SELECT 1 FROM public.erp_workflow_drafts WHERE cafe_id=p_cafe_id AND record_id=rid)) THEN RAISE EXCEPTION 'لا تغير عميل سجل مرتبط بمعاملات';END IF;
  SELECT coalesce(array_agg(value::uuid),'{}') INTO ids FROM jsonb_array_elements_text(data->'staffIds');PERFORM erp_work_private.staff(p_cafe_id,ids);
  vals:=erp_manufacturing_private.custom_defaults(t.config->'fields',data->'customValues');PERFORM erp_workflow_private.validate_values(t.config->'fields',vals,p_cafe_id,rid,typ,0,(p_payload->>'draft')::boolean);data:=jsonb_set(data,'{customValues}',vals);
  code:=btrim(coalesce(data->>'code',''));IF code='' THEN num:=(t.config->>'nextNumber')::bigint;LOOP code:=lpad(num::text,6,'0');EXIT WHEN NOT EXISTS(SELECT 1 FROM public.erp_workflow_records existing WHERE cafe_id=p_cafe_id AND type_id=typ AND existing.code=workflow_write.code);num:=num+1;END LOOP;UPDATE public.erp_workflow_types SET config=jsonb_set(erp_workflow_types.config,'{nextNumber}',to_jsonb(num+1)),revision=revision+1 WHERE cafe_id=p_cafe_id AND id=typ;END IF;
  data:=jsonb_set(data,'{code}',to_jsonb(code));
  INSERT INTO public.erp_workflow_records(id,cafe_id,type_id,code,status,draft,payload,created_by) VALUES(rid,p_cafe_id,typ,code,coalesce(r.status,t.config#>>'{statuses,0,id}'),(p_payload->>'draft')::boolean,data,auth.uid()) ON CONFLICT(id) DO UPDATE SET code=excluded.code,draft=excluded.draft,payload=excluded.payload,revision=erp_workflow_records.revision+1,updated_at=clock_timestamp() WHERE erp_workflow_records.cafe_id=p_cafe_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'السجل غير متاح' USING ERRCODE='42501';END IF;ev_record:=rid;ev_type:=typ;
 ELSIF p_action='child' THEN
  r:=erp_workflow_private.assert_record(p_cafe_id,(p_payload->>'recordId')::uuid);SELECT * INTO m FROM public.erp_workflow_models WHERE cafe_id=p_cafe_id AND id=(p_payload->>'modelId')::uuid AND type_id=r.type_id;
  SELECT * INTO child FROM public.erp_workflow_children WHERE cafe_id=p_cafe_id AND id=rid FOR UPDATE;
  IF m.id IS NULL OR rid IS NULL OR(child.id IS NOT NULL AND(child.model_id<>m.id OR child.record_id<>r.id)) THEN RAISE EXCEPTION 'النموذج أو السجل غير متاح' USING ERRCODE='42501';END IF;
  IF coalesce(child.revision,0) IS DISTINCT FROM rev THEN RAISE EXCEPTION 'سجل النموذج تغير' USING ERRCODE='40001';END IF;
  IF NOT erp_workflow_private.child_allowed(p_cafe_id,m.config,CASE WHEN child.id IS NULL THEN 'create' ELSE 'update' END) OR NOT(m.config->>'active')::boolean THEN RAISE EXCEPTION 'صلاحيات النموذج لا تسمح بالحفظ' USING ERRCODE='42501';END IF;
  vals:=erp_manufacturing_private.custom_defaults(m.config->'fields',p_payload->'values');PERFORM erp_workflow_private.validate_child_values(m.config->'fields',vals,p_cafe_id,rid,m.id,0,coalesce((p_payload->>'draft')::boolean,false));
  INSERT INTO public.erp_workflow_children(id,cafe_id,record_id,model_id,field_values,draft) VALUES(rid,p_cafe_id,r.id,m.id,vals,coalesce((p_payload->>'draft')::boolean,false)) ON CONFLICT(id) DO UPDATE SET field_values=excluded.field_values,draft=excluded.draft,revision=erp_workflow_children.revision+1 WHERE erp_workflow_children.cafe_id=p_cafe_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'سجل النموذج غير متاح' USING ERRCODE='42501';END IF;ev_record:=r.id;ev_type:=r.type_id;
 ELSE
  IF p_action='delete' AND p_payload->>'entity' IN('type','model') THEN
   IF NOT erp_workflow_private.base_access(p_cafe_id,'settings') THEN RAISE EXCEPTION 'لا تملك صلاحية حذف التعريف' USING ERRCODE='42501';END IF;
   IF p_payload->>'entity'='type' THEN DELETE FROM public.erp_workflow_types WHERE cafe_id=p_cafe_id AND id=rid AND revision=rev;ev_type:=rid;ELSE DELETE FROM public.erp_workflow_models WHERE cafe_id=p_cafe_id AND id=rid AND revision=rev;END IF;
   IF NOT FOUND THEN RAISE EXCEPTION 'التعريف تغير أو غير متاح' USING ERRCODE='40001';END IF;
  ELSIF p_action='delete' AND p_payload->>'entity'='child' THEN
   SELECT * INTO child FROM public.erp_workflow_children WHERE cafe_id=p_cafe_id AND id=rid FOR UPDATE;
   IF child.revision IS DISTINCT FROM rev THEN RAISE EXCEPTION 'سجل النموذج تغير أو غير متاح' USING ERRCODE='40001';END IF;
   r:=erp_workflow_private.assert_record(p_cafe_id,child.record_id);SELECT * INTO m FROM public.erp_workflow_models WHERE cafe_id=p_cafe_id AND id=child.model_id;
   IF NOT erp_workflow_private.child_allowed(p_cafe_id,m.config,'read') OR NOT erp_workflow_private.child_allowed(p_cafe_id,m.config,'delete') THEN RAISE EXCEPTION 'صلاحيات النموذج لا تسمح بالحذف' USING ERRCODE='42501';END IF;
   DELETE FROM public.erp_workflow_children WHERE cafe_id=p_cafe_id AND id=rid;ev_record:=r.id;ev_type:=r.type_id;
  ELSE
   IF p_action='activity' THEN rid:=(p_payload->>'recordId')::uuid;END IF;
   r:=erp_workflow_private.assert_record(p_cafe_id,rid,CASE WHEN p_action='delete' THEN 'delete' WHEN p_action='copy' THEN 'read' ELSE 'update' END);SELECT * INTO t FROM public.erp_workflow_types WHERE cafe_id=p_cafe_id AND id=r.type_id;
   IF p_action<>'activity' AND r.revision IS DISTINCT FROM rev THEN RAISE EXCEPTION 'سجل الدورة تغير' USING ERRCODE='40001';END IF;ev_record:=rid;ev_type:=r.type_id;result:=jsonb_build_object('id',rid);
   IF p_action IN('financial','invoice','advance','debit') AND (NOT erp_workflow_private.base_access(p_cafe_id,'approve') OR NOT ARRAY['budget','customerId']::text[]<@erp_workflow_private.fields(p_cafe_id,t.config,'read') OR NOT ARRAY['budget','customerId']::text[]<@erp_workflow_private.fields(p_cafe_id,t.config,'update')) THEN RAISE EXCEPTION 'صلاحيات الدورة والحقول لا تسمح بالمعاملة المالية' USING ERRCODE='42501';END IF;
   IF p_action='delete' AND p_payload->>'entity'='record' THEN DELETE FROM public.erp_workflow_records WHERE cafe_id=p_cafe_id AND id=rid;
   ELSIF p_action='copy' AND p_payload->>'entity'='record' THEN
    IF NOT erp_workflow_private.allowed(p_cafe_id,t.config,'create') OR NOT(t.config->>'active')::boolean THEN RAISE EXCEPTION 'لا تملك صلاحية نسخ السجل' USING ERRCODE='42501';END IF;
    target:=gen_random_uuid();num:=(t.config->>'nextNumber')::bigint;LOOP code:=lpad(num::text,6,'0');EXIT WHEN NOT EXISTS(SELECT 1 FROM public.erp_workflow_records existing WHERE cafe_id=p_cafe_id AND type_id=r.type_id AND existing.code=workflow_write.code);num:=num+1;END LOOP;
    data:=erp_workflow_private.mask(p_cafe_id,r,t.config);SELECT coalesce(jsonb_object_agg(k,v),'{}') INTO data FROM jsonb_each(data) e(k,v) WHERE k=ANY(erp_workflow_private.fields(p_cafe_id,t.config,'create')) AND k<>'files';data:='{"title":"","customerId":null,"budget":0,"currency":"SAR","staffIds":[],"tags":[],"description":""}'::jsonb||data||jsonb_build_object('code',code,'start',current_date,'end',NULL,'customValues','{}'::jsonb);
    INSERT INTO public.erp_workflow_records(id,cafe_id,type_id,code,status,draft,payload,created_by) VALUES(target,p_cafe_id,r.type_id,code,t.config#>>'{statuses,0,id}',true,data,auth.uid());UPDATE public.erp_workflow_types SET config=jsonb_set(erp_workflow_types.config,'{nextNumber}',to_jsonb(num+1)),revision=revision+1 WHERE cafe_id=p_cafe_id AND id=r.type_id;result:=jsonb_build_object('id',target);ev_record:=target;
   ELSIF p_action IN('status','note') THEN
    st:=nullif(p_payload->>'status','');IF st IS NOT NULL THEN
     IF r.draft OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(t.config->'statuses') state_row WHERE state_row->>'id'=st) OR NOT erp_workflow_private.allowed(p_cafe_id,t.config,'transition',st) THEN RAISE EXCEPTION 'الانتقال إلى الحالة غير مسموح' USING ERRCODE='42501';END IF;
     UPDATE public.erp_workflow_records SET status=st WHERE cafe_id=p_cafe_id AND id=rid;
    END IF;
    IF p_action='note' THEN IF length(btrim(coalesce(p_payload->>'note',''))) NOT BETWEEN 1 AND 20000 OR nullif(p_payload->>'occurredAt','')::timestamptz IS NULL OR jsonb_typeof(p_payload->'shared') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'راجع الملاحظة وتاريخها';END IF;IF nullif(p_payload->>'actionId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(t.config->'actions') action_row WHERE action_row->>'id'=p_payload->>'actionId') THEN RAISE EXCEPTION 'الإجراء غير متاح';END IF;END IF;
   ELSIF p_action IN('link','unlink') THEN
    IF p_action='link' THEN PERFORM erp_workflow_private.link(p_cafe_id,rid,p_payload->>'kind',(p_payload->>'targetId')::uuid);ELSE
     IF NOT ARRAY['budget','customerId']::text[]<@erp_workflow_private.fields(p_cafe_id,t.config,'update') THEN RAISE EXCEPTION 'صلاحيات الحقول لا تسمح بإلغاء الارتباط' USING ERRCODE='42501';END IF;
     DELETE FROM public.erp_workflow_links WHERE cafe_id=p_cafe_id AND record_id=rid AND kind=p_payload->>'kind' AND target_id=(p_payload->>'targetId')::uuid;IF NOT FOUND THEN RAISE EXCEPTION 'الارتباط غير متاح';END IF;
    END IF;
   ELSIF p_action='activity' THEN
    target:=(p_payload->>'id')::uuid;SELECT revision INTO old_revision FROM public.erp_workflow_activities WHERE cafe_id=p_cafe_id AND id=target AND record_id=rid;
    IF coalesce(old_revision,0) IS DISTINCT FROM rev THEN RAISE EXCEPTION 'الموعد تغير' USING ERRCODE='40001';END IF;
    begin_at:=(p_payload->>'start')::timestamptz;end_at:=(p_payload->>'end')::timestamptz;counted:=(p_payload->>'repeatCount')::integer;
    IF target IS NULL OR begin_at IS NULL OR end_at<=begin_at OR counted IS NULL OR counted NOT BETWEEN 1 AND 52 OR(old_revision IS NOT NULL AND counted<>1) OR coalesce((p_payload->>'repeatDays')::integer,0) NOT BETWEEN 1 AND 365 OR length(btrim(coalesce(p_payload->>'title',''))) NOT BETWEEN 1 AND 160 OR coalesce(p_payload->>'status','') NOT IN('planned','done','cancelled') OR length(coalesce(p_payload->>'note',''))>20000 THEN RAISE EXCEPTION 'راجع الموعد والتكرار';END IF;
    SELECT coalesce(array_agg(value::uuid),'{}') INTO ids FROM jsonb_array_elements_text(p_payload->'staffIds');PERFORM erp_work_private.staff(p_cafe_id,ids);
    FOR idx IN 0..counted-1 LOOP data:=p_payload-'id'-'revision'-'recordId'||jsonb_build_object('start',begin_at+make_interval(days=>idx*(p_payload->>'repeatDays')::integer),'end',end_at+make_interval(days=>idx*(p_payload->>'repeatDays')::integer),'repeatCount',1);INSERT INTO public.erp_workflow_activities(id,cafe_id,record_id,payload) VALUES(CASE WHEN idx=0 THEN target ELSE gen_random_uuid() END,p_cafe_id,rid,data) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,revision=erp_workflow_activities.revision+1 WHERE erp_workflow_activities.cafe_id=p_cafe_id AND erp_workflow_activities.record_id=rid;IF NOT FOUND THEN RAISE EXCEPTION 'الموعد غير متاح' USING ERRCODE='42501';END IF;END LOOP;
  ELSIF p_action='financial' THEN
   IF r.draft OR coalesce(p_payload->>'operation','') NOT IN('purchase','treasury','stock_adjust','stock_transfer','journal','refund','settlement') OR jsonb_typeof(p_payload->'values') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'راجع نوع المعاملة واحفظ الأمر أولًا';END IF;
   data:=p_payload->'values';IF p_payload->>'operation' IN('refund','settlement') AND NOT EXISTS(SELECT 1 FROM public.erp_workflow_links WHERE cafe_id=p_cafe_id AND record_id=rid AND kind='document' AND target_id=(data->>'documentId')::uuid) THEN RAISE EXCEPTION 'اربط الفاتورة أولًا';END IF;
   val:=public.brand_finance_execute(p_cafe_id,p_payload->>'operation',data,p_request_id);target:=nullif(val->>'id','')::uuid;
   IF target IS NULL OR val->>'status'='pending' THEN RAISE EXCEPTION 'المعاملة لم تعتمد ماليًا بعد';END IF;PERFORM erp_workflow_private.link(p_cafe_id,rid,'document',target);
  ELSIF p_action='debit' THEN
   IF r.draft OR NOT EXISTS(SELECT 1 FROM public.erp_workflow_links WHERE cafe_id=p_cafe_id AND record_id=rid AND kind='document' AND target_id=(p_payload->>'sourceId')::uuid) THEN RAISE EXCEPTION 'اختر فاتورة مرتبطة بأمر محفوظ';END IF;
   val:=public.brand_finance_invoice_extensions(p_cafe_id,(p_payload->>'sourceId')::uuid,'debit',jsonb_build_object('requestId',p_request_id,'amount',p_payload->'amount','vatRate',p_payload->'taxRate','description',p_payload->>'description','reason',p_payload->>'reason'));
   PERFORM erp_workflow_private.link(p_cafe_id,rid,'document',(val->>'id')::uuid);
  ELSIF p_action='advance' THEN
   IF r.draft OR nullif(r.payload->>'customerId','')::uuid IS NULL THEN RAISE EXCEPTION 'احفظ الأمر واختر العميل أولًا';END IF;
   val:=public.brand_finance_customer_credit(p_cafe_id,'receive',jsonb_build_object('partyId',nullif(r.payload->>'customerId','')::uuid,'requestId',p_request_id,'accountId',p_payload->>'accountId','amount',p_payload->'amount','note',left('دفعة دورة عمل '||r.code||' '||coalesce(p_payload->>'note',''),1000)));PERFORM erp_workflow_private.link(p_cafe_id,rid,'document',(val->>'id')::uuid);
  ELSIF p_action='invoice' THEN
   IF r.draft OR nullif(r.payload->>'customerId','')::uuid IS NULL OR coalesce((p_payload->>'amount')::numeric,0)<=0 OR coalesce((p_payload->>'taxRate')::numeric,-1) NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'اختر العميل وأدخل قيمة الفاتورة والضريبة';END IF;
   target:=gen_random_uuid();data:=jsonb_build_object('invoice',jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('key',1,'productId','','quantity',1,'price',p_payload->'amount','name',left((r.payload->>'title'),160),'kind','service','vatRate',p_payload->'taxRate','taxCategory',CASE WHEN(p_payload->>'taxRate')::numeric=0 THEN 'O' ELSE 'S' END,'exemptionReason',coalesce(p_payload->>'taxReason',''))),'warehouseId','','partyId',nullif(r.payload->>'customerId','')::uuid,'accountId','','paymentKind','credit','discountValue',0,'discountKind','amount','taxInclusive',false,'note','دورة عمل '||r.code,'currency','SAR','exchangeRate',1),'issuer',jsonb_build_object('name','','address','','vatNumber',''),'supplyDate',current_date,'template','standard','deliveryMethod','print','deposit',jsonb_build_object('kind','amount','value',0,'paid',false),'shipping','none','delivery',jsonb_build_object('confirmed',false,'date',''),'attachments','[]'::jsonb,'extraFields','[]'::jsonb);
   PERFORM public.brand_finance_save_invoice_draft(p_cafe_id,target,0,data);INSERT INTO public.erp_workflow_drafts VALUES(p_cafe_id,rid,target);result:=result||jsonb_build_object('draftId',target);
  ELSIF p_action='task' THEN
   val:=public.erp_tasks_execute(p_cafe_id,'save',jsonb_build_object('id',NULL,'revision',0,'title',p_payload->>'title','code','','priority','medium','typeId',p_payload->>'typeId','assigneeId',p_payload->>'assigneeId','dueDate',p_payload->'dueDate','description',p_payload->>'note','targetKind',CASE WHEN nullif(r.payload->>'customerId','')::uuid IS NOT NULL THEN 'customer' END,'targetId',nullif(r.payload->>'customerId','')::uuid),p_request_id);
   PERFORM erp_workflow_private.link(p_cafe_id,rid,'task',(val->>'id')::uuid);

   ELSE RAISE EXCEPTION 'إجراء الدورة غير متاح' USING ERRCODE='22023';END IF;
   IF p_action NOT IN('delete','copy') THEN UPDATE public.erp_workflow_records SET revision=revision+1,updated_at=clock_timestamp() WHERE cafe_id=p_cafe_id AND id=rid;END IF;
  END IF;
 END IF;
 INSERT INTO public.erp_workflow_events(cafe_id,type_id,record_id,action,note,detail,actor) VALUES(p_cafe_id,ev_type,ev_record,p_action,CASE WHEN p_action='note' THEN p_payload->>'note' ELSE '' END,p_payload,auth.uid());INSERT INTO erp_workflow_private.requests VALUES(p_cafe_id,p_request_id,auth.uid(),p_action,p_payload,result);RETURN result;
END$$;

CREATE FUNCTION erp_workflow_private.invoice_link() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE rid uuid;BEGIN
 SELECT record_id INTO rid FROM public.erp_workflow_drafts WHERE cafe_id=NEW.cafe_id AND draft_id=NEW.draft_id;
 IF rid IS NOT NULL THEN PERFORM erp_workflow_private.link(NEW.cafe_id,rid,'document',NEW.document_id);UPDATE public.erp_workflow_records SET revision=revision+1,updated_at=clock_timestamp() WHERE cafe_id=NEW.cafe_id AND id=rid;INSERT INTO public.erp_workflow_events(cafe_id,record_id,action,detail,actor) VALUES(NEW.cafe_id,rid,'invoice_issued',jsonb_build_object('invoiceId',NEW.document_id),auth.uid());END IF;RETURN NEW;
END$$;
CREATE TRIGGER erp_workflow_invoice AFTER INSERT ON public.bf_company_invoices FOR EACH ROW EXECUTE FUNCTION erp_workflow_private.invoice_link();
CREATE FUNCTION erp_workflow_private.source_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE k text:=CASE TG_TABLE_NAME WHEN 'bf_documents' THEN 'document' WHEN 'bf_quotes' THEN 'quotation' WHEN 'bf_credit_notes' THEN 'credit_note' ELSE 'task' END;link public.erp_workflow_links%ROWTYPE;data jsonb;customer uuid;BEGIN
 SELECT * INTO link FROM public.erp_workflow_links WHERE cafe_id=OLD.cafe_id AND kind=k AND target_id=OLD.id;
 IF NOT FOUND THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'ألغ ارتباط المعاملة بدورة العمل قبل حذفها' USING ERRCODE='23503';END IF;
 IF NEW.cafe_id IS DISTINCT FROM OLD.cafe_id OR NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'لا تغير ملكية معاملة مرتبطة' USING ERRCODE='23503';END IF;
 data:=to_jsonb(NEW);IF k IN('quotation','credit_note') OR(k='document' AND data->>'kind'='sale') THEN customer:=nullif(CASE k WHEN 'quotation' THEN data#>>'{payload,invoice,partyId}' ELSE data->>'party_id' END,'')::uuid;
  IF EXISTS(SELECT 1 FROM public.erp_workflow_records WHERE cafe_id=link.cafe_id AND id=link.record_id AND nullif(payload->>'customerId','')::uuid IS DISTINCT FROM customer) THEN RAISE EXCEPTION 'عميل المعاملة لا يطابق سجل الدورة' USING ERRCODE='22023';END IF;
 END IF;RETURN NEW;
END$$;
CREATE TRIGGER erp_workflow_source_guard BEFORE DELETE OR UPDATE ON public.bf_documents FOR EACH ROW EXECUTE FUNCTION erp_workflow_private.source_guard();
CREATE TRIGGER erp_workflow_source_guard BEFORE DELETE OR UPDATE ON public.bf_quotes FOR EACH ROW EXECUTE FUNCTION erp_workflow_private.source_guard();
CREATE TRIGGER erp_workflow_source_guard BEFORE DELETE OR UPDATE ON public.bf_credit_notes FOR EACH ROW EXECUTE FUNCTION erp_workflow_private.source_guard();
CREATE TRIGGER erp_workflow_source_guard BEFORE DELETE OR UPDATE ON public.erp_tasks FOR EACH ROW EXECUTE FUNCTION erp_workflow_private.source_guard();
CREATE FUNCTION public.erp_workflow_targets(p_cafe_id uuid,p_record_id uuid,p_kind text,p_query text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE r public.erp_workflow_records%ROWTYPE;config jsonb;result jsonb;BEGIN
 r:=erp_workflow_private.assert_record(p_cafe_id,p_record_id);SELECT t.config INTO config FROM public.erp_workflow_types t WHERE cafe_id=p_cafe_id AND id=r.type_id;
 IF NOT ARRAY['budget','customerId']::text[]<@erp_workflow_private.fields(p_cafe_id,config,'read') OR length(p_query)>120 THEN RAISE EXCEPTION 'البحث في المعاملات غير مسموح' USING ERRCODE='42501';END IF;
 IF p_kind='document' THEN SELECT coalesce(jsonb_agg(erp_work_private.target(p_cafe_id,p_kind,id)),'[]') INTO result FROM(SELECT id FROM public.bf_documents WHERE cafe_id=p_cafe_id AND(number::text ILIKE '%'||p_query||'%' OR note ILIKE '%'||p_query||'%') ORDER BY created_at DESC LIMIT 100)d;
 ELSIF p_kind='quotation' THEN SELECT coalesce(jsonb_agg(erp_work_private.target(p_cafe_id,p_kind,id)),'[]') INTO result FROM(SELECT id FROM public.bf_quotes WHERE cafe_id=p_cafe_id AND(number::text ILIKE '%'||p_query||'%' OR customer_name ILIKE '%'||p_query||'%') ORDER BY created_at DESC LIMIT 100)d;
 ELSIF p_kind='credit_note' THEN SELECT coalesce(jsonb_agg(erp_work_private.target(p_cafe_id,p_kind,id)),'[]') INTO result FROM(SELECT id FROM public.bf_credit_notes WHERE cafe_id=p_cafe_id AND status<>'deleted' AND(number::text ILIKE '%'||p_query||'%' OR customer_name ILIKE '%'||p_query||'%') ORDER BY created_at DESC LIMIT 100)d;
 ELSIF p_kind='task' THEN SELECT coalesce(jsonb_agg(erp_work_private.target(p_cafe_id,p_kind,id)),'[]') INTO result FROM(SELECT id FROM public.erp_tasks WHERE cafe_id=p_cafe_id AND(title ILIKE '%'||p_query||'%' OR code ILIKE '%'||p_query||'%') ORDER BY created_at DESC LIMIT 100)d;
 ELSE RAISE EXCEPTION 'نوع المعاملة غير صالح';END IF;RETURN result;
END$$;
REVOKE ALL ON FUNCTION public.erp_workflow_targets(uuid,uuid,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.erp_workflow_targets(uuid,uuid,text,text) TO authenticated;

ALTER FUNCTION erp_file_private.assert_record(uuid,text,uuid,boolean) RENAME TO assert_record_before_workflows;
CREATE FUNCTION erp_file_private.assert_record(p_cafe uuid,p_type text,p_record uuid,p_write boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE r public.erp_workflow_records%ROWTYPE;k public.erp_workflow_children%ROWTYPE;m public.erp_workflow_models%ROWTYPE;t public.erp_workflow_types%ROWTYPE;BEGIN
 IF p_type NOT IN('workflow_record','workflow_child') OR p_type IS NULL THEN PERFORM erp_file_private.assert_record_before_workflows(p_cafe,p_type,p_record,p_write);RETURN;END IF;
 IF p_type='workflow_record' THEN
  r:=erp_workflow_private.assert_record(p_cafe,p_record,CASE WHEN p_write THEN 'update' ELSE 'read' END);SELECT * INTO t FROM public.erp_workflow_types WHERE cafe_id=p_cafe AND id=r.type_id;
  IF NOT 'files'=ANY(erp_workflow_private.fields(p_cafe,t.config,CASE WHEN p_write THEN 'update' ELSE 'read' END)) OR(p_write AND NOT erp_workflow_private.base_access(p_cafe,'files')) THEN RAISE EXCEPTION 'صلاحيات المرفقات لا تسمح بهذه العملية' USING ERRCODE='42501';END IF;
  IF p_write THEN PERFORM 1 FROM public.erp_workflow_records WHERE cafe_id=p_cafe AND id=p_record FOR KEY SHARE;IF NOT FOUND THEN RAISE EXCEPTION 'السجل غير متاح' USING ERRCODE='42501';END IF;END IF;
 ELSE
  SELECT * INTO k FROM public.erp_workflow_children WHERE cafe_id=p_cafe AND id=p_record;IF NOT FOUND THEN RAISE EXCEPTION 'سجل النموذج غير متاح' USING ERRCODE='42501';END IF;
  r:=erp_workflow_private.assert_record(p_cafe,k.record_id);SELECT * INTO m FROM public.erp_workflow_models WHERE cafe_id=p_cafe AND id=k.model_id;
  IF NOT erp_workflow_private.child_allowed(p_cafe,m.config,'read') OR(p_write AND(NOT erp_workflow_private.child_allowed(p_cafe,m.config,'update') OR NOT erp_workflow_private.base_access(p_cafe,'files'))) THEN RAISE EXCEPTION 'صلاحيات النموذج لا تسمح بالمرفقات' USING ERRCODE='42501';END IF;
  IF p_write THEN PERFORM 1 FROM public.erp_workflow_children WHERE cafe_id=p_cafe AND id=p_record FOR KEY SHARE;IF NOT FOUND THEN RAISE EXCEPTION 'سجل النموذج غير متاح' USING ERRCODE='42501';END IF;END IF;
 END IF;
END$$;
CREATE TRIGGER erp_file_orphan_guard BEFORE DELETE ON public.erp_workflow_records FOR EACH ROW EXECUTE FUNCTION erp_file_private.prevent_orphans('workflow_record');
CREATE TRIGGER erp_file_orphan_guard BEFORE DELETE ON public.erp_workflow_children FOR EACH ROW EXECUTE FUNCTION erp_file_private.prevent_orphans('workflow_child');
REVOKE ALL ON FUNCTION erp_file_private.assert_record(uuid,text,uuid,boolean),erp_file_private.assert_record_before_workflows(uuid,text,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_workflow_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.erp_workflows_read(uuid),public.erp_workflows_write(uuid,text,jsonb,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.erp_workflows_read(uuid),public.erp_workflows_write(uuid,text,jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
