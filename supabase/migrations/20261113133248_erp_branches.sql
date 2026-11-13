BEGIN;
CREATE SCHEMA erp_branch_private;
REVOKE ALL ON SCHEMA erp_branch_private FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.branches ADD COLUMN erp_revision integer NOT NULL DEFAULT 1 CHECK(erp_revision>0);
CREATE TABLE public.erp_branch_details(cafe_id uuid NOT NULL,id uuid PRIMARY KEY,code text NOT NULL DEFAULT '',email text NOT NULL DEFAULT '',tax_number text NOT NULL DEFAULT '',registration text NOT NULL DEFAULT '',note text NOT NULL DEFAULT '',FOREIGN KEY(id,cafe_id) REFERENCES public.branches(id,cafe_id));
CREATE UNIQUE INDEX erp_branch_code ON public.erp_branch_details(cafe_id,lower(code)) WHERE code<>'';
CREATE TABLE public.erp_branch_settings(cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),revision integer NOT NULL DEFAULT 1,payload jsonb NOT NULL DEFAULT '{"shareCustomers":true,"shareProducts":true,"shareSuppliers":true,"shareCostCenters":true,"shareUnitTemplates":true,"specifyAccounts":false}');
CREATE TABLE public.erp_branch_members(cafe_id uuid NOT NULL,branch_id uuid NOT NULL,employee_id uuid NOT NULL,PRIMARY KEY(cafe_id,branch_id,employee_id),FOREIGN KEY(branch_id,cafe_id) REFERENCES public.branches(id,cafe_id),FOREIGN KEY(cafe_id,employee_id) REFERENCES public.erp_hr_employees(cafe_id,id));
CREATE INDEX erp_branch_members_employee ON public.erp_branch_members(cafe_id,employee_id,branch_id);
CREATE TABLE public.erp_branch_scopes(cafe_id uuid NOT NULL,user_id uuid NOT NULL REFERENCES auth.users(id),branch_id uuid,revision integer NOT NULL DEFAULT 1,PRIMARY KEY(cafe_id,user_id),FOREIGN KEY(branch_id,cafe_id) REFERENCES public.branches(id,cafe_id));
CREATE TABLE public.erp_branch_resources(cafe_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('customer','supplier','item','cost_center','unit_template','account')),record_id uuid NOT NULL,branch_id uuid NOT NULL,PRIMARY KEY(cafe_id,kind,record_id,branch_id),FOREIGN KEY(branch_id,cafe_id) REFERENCES public.branches(id,cafe_id));
CREATE INDEX erp_branch_resources_record ON public.erp_branch_resources(cafe_id,record_id,kind);
CREATE INDEX erp_branch_resources_branch ON public.erp_branch_resources(cafe_id,branch_id,kind);
CREATE TABLE public.erp_branch_documents(cafe_id uuid NOT NULL,document_id uuid PRIMARY KEY,branch_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),FOREIGN KEY(branch_id,cafe_id) REFERENCES public.branches(id,cafe_id));
CREATE INDEX erp_branch_documents_branch ON public.erp_branch_documents(cafe_id,branch_id,created_at);
CREATE TABLE public.erp_branch_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),branch_id uuid,action text NOT NULL,payload jsonb NOT NULL,actor uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(branch_id,cafe_id) REFERENCES public.branches(id,cafe_id));
CREATE TABLE erp_branch_private.requests(cafe_id uuid NOT NULL,request_id uuid NOT NULL,actor uuid NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,PRIMARY KEY(cafe_id,request_id));
DO $$DECLARE t text;ds text[];BEGIN
 FOREACH t IN ARRAY ARRAY['erp_branch_details','erp_branch_settings','erp_branch_members','erp_branch_scopes','erp_branch_resources','erp_branch_documents','erp_branch_events'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;
 SELECT array_agg(d ORDER BY n) INTO ds FROM(SELECT d,min(n)n FROM unnest(erp_access_private.domains()||ARRAY['branches']) WITH ORDINALITY x(d,n) GROUP BY d)y;
 EXECUTE format('CREATE OR REPLACE FUNCTION erp_access_private.domains() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path='''' AS $f$SELECT %L::text[]$f$',ds);
 UPDATE public.erp_roles SET permissions=jsonb_build_object('branches','{"read":false,"create":false,"update":false,"delete":false,"approve":false,"settings":false,"files":false}'::jsonb)||permissions;
END $$;
CREATE FUNCTION erp_branch_private.authorize(c uuid,a text DEFAULT 'read') RETURNS text LANGUAGE plpgsql SET search_path='' AS $$DECLARE r text;BEGIN
 r:=brand_finance_private.role_for(c);IF r IS NULL OR (a<>'read' AND r NOT IN('owner','manager')) THEN RAISE EXCEPTION 'لا تملك صلاحية إدارة الفروع' USING ERRCODE='42501';END IF;
 PERFORM erp_access_private.assert_allowed(c,'branches',a);RETURN r;
END $$;
CREATE FUNCTION erp_branch_private.branch_allowed(c uuid,b uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.branches WHERE cafe_id=c AND id=b AND active AND deleted_at IS NULL) AND (brand_finance_private.role_for(c) IN('owner','manager') OR EXISTS(SELECT 1 FROM public.erp_hr_employees e WHERE e.cafe_id=c AND e.user_id=auth.uid() AND e.active AND (e.branch_id=b OR EXISTS(SELECT 1 FROM public.erp_branch_members m WHERE m.cafe_id=c AND m.branch_id=b AND m.employee_id=e.id))))
$$;
CREATE FUNCTION erp_branch_private.current_branch(c uuid) RETURNS uuid LANGUAGE plpgsql STABLE SET search_path='' AS $$DECLARE b uuid;BEGIN
 SELECT branch_id INTO b FROM public.erp_branch_scopes WHERE cafe_id=c AND user_id=auth.uid();
 IF b IS NOT NULL AND NOT erp_branch_private.branch_allowed(c,b) THEN RAISE EXCEPTION 'الفرع المختار غير متاح لك اختر فرعًا آخر' USING ERRCODE='42501';END IF;
 IF b IS NULL AND brand_finance_private.role_for(c) NOT IN('owner','manager') AND EXISTS(SELECT 1 FROM public.branches WHERE cafe_id=c AND active AND deleted_at IS NULL) THEN RAISE EXCEPTION 'اختر فرع العمل قبل متابعة العملية' USING ERRCODE='42501';END IF;RETURN b;
END $$;
CREATE FUNCTION erp_branch_private.enter(c uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$DECLARE b uuid;BEGIN
 b:=erp_branch_private.current_branch(c);PERFORM set_config('erp.branch_id',coalesce(b::text,''),true);PERFORM set_config('erp.branch_cafe',c::text,true);
END $$;
CREATE FUNCTION erp_branch_private.allowed_resource(c uuid,b uuid,k text,r uuid) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$DECLARE p jsonb;shared boolean;BEGIN
 IF b IS NULL THEN RETURN brand_finance_private.role_for(c) IN('owner','manager') OR NOT EXISTS(SELECT 1 FROM public.branches WHERE cafe_id=c AND active AND deleted_at IS NULL);END IF;
 IF NOT erp_branch_private.branch_allowed(c,b) THEN RETURN false;END IF;
 SELECT payload INTO p FROM public.erp_branch_settings WHERE cafe_id=c;
 shared:=CASE k WHEN 'customer' THEN coalesce((p->>'shareCustomers')::boolean,true) WHEN 'supplier' THEN coalesce((p->>'shareSuppliers')::boolean,true) WHEN 'item' THEN coalesce((p->>'shareProducts')::boolean,true) WHEN 'cost_center' THEN coalesce((p->>'shareCostCenters')::boolean,true) WHEN 'unit_template' THEN coalesce((p->>'shareUnitTemplates')::boolean,true) WHEN 'account' THEN NOT coalesce((p->>'specifyAccounts')::boolean,false) ELSE false END;
 RETURN shared OR NOT EXISTS(SELECT 1 FROM public.erp_branch_resources WHERE cafe_id=c AND kind=k AND record_id=r) OR EXISTS(SELECT 1 FROM public.erp_branch_resources WHERE cafe_id=c AND kind=k AND record_id=r AND branch_id=b);
END $$;
CREATE FUNCTION erp_branch_private.assert_resource(c uuid,b uuid,k text,r uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$BEGIN
 IF r IS NOT NULL AND NOT erp_branch_private.allowed_resource(c,b,k,r) THEN RAISE EXCEPTION 'السجل غير متاح في الفرع المختار' USING ERRCODE='42501';END IF;
END $$;
CREATE FUNCTION erp_branch_private.resource_exists(c uuid,k text,r uuid) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$BEGIN
 RETURN CASE k WHEN 'customer' THEN EXISTS(SELECT 1 FROM public.bf_parties WHERE cafe_id=c AND id=r AND kind='customer') WHEN 'supplier' THEN EXISTS(SELECT 1 FROM public.bf_parties WHERE cafe_id=c AND id=r AND kind='supplier') WHEN 'item' THEN EXISTS(SELECT 1 FROM public.bf_items WHERE cafe_id=c AND id=r) WHEN 'account' THEN EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=c AND id=r) WHEN 'cost_center' THEN EXISTS(SELECT 1 FROM public.erp_cost_centers WHERE cafe_id=c AND id=r) WHEN 'unit_template' THEN EXISTS(SELECT 1 FROM public.erp_inventory_catalogs WHERE cafe_id=c AND id=r AND kind='unit_template') ELSE false END;
END $$;
CREATE FUNCTION erp_branch_private.scope(c uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$SELECT jsonb_build_object('branchId',s.branch_id,'revision',coalesce(s.revision,0),'name',b.name) FROM (SELECT 1) x LEFT JOIN public.erp_branch_scopes s ON s.cafe_id=c AND s.user_id=auth.uid() LEFT JOIN public.branches b ON b.cafe_id=c AND b.id=s.branch_id$$;
CREATE FUNCTION erp_branch_private.in_use(b uuid) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$DECLARE r record;used boolean;BEGIN
 FOR r IN SELECT DISTINCT ns.nspname,cl.relname,a.attname FROM pg_constraint fk JOIN pg_class cl ON cl.oid=fk.conrelid JOIN pg_namespace ns ON ns.oid=cl.relnamespace CROSS JOIN LATERAL unnest(fk.conkey,fk.confkey) keys(local_num,target_num) JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=keys.local_num JOIN pg_attribute target ON target.attrelid=fk.confrelid AND target.attnum=keys.target_num WHERE fk.contype='f' AND fk.confrelid='public.branches'::regclass AND target.attname='id' AND ns.nspname='public' AND cl.relname NOT IN('erp_branch_details','erp_branch_events','erp_branch_scopes') LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE %I=$1)',r.nspname,r.relname,r.attname) INTO used USING b;IF used THEN RETURN true;END IF;
 END LOOP;RETURN false;
END $$;
CREATE FUNCTION erp_branch_private.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$BEGIN RAISE EXCEPTION 'Branch audit is immutable' USING ERRCODE='42501';END $$;
CREATE TRIGGER erp_branch_event_immutable BEFORE UPDATE OR DELETE ON public.erp_branch_events FOR EACH ROW EXECUTE FUNCTION erp_branch_private.immutable();
CREATE TRIGGER erp_branch_request_immutable BEFORE UPDATE OR DELETE ON erp_branch_private.requests FOR EACH ROW EXECUTE FUNCTION erp_branch_private.immutable();
CREATE FUNCTION public.erp_branches_write(p_cafe uuid,p_action text,p_input jsonb,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE c uuid:=p_cafe;p jsonb:=p_input;r public.branches%ROWTYPE;old erp_branch_private.requests%ROWTYPE;id uuid:=nullif(p->>'id','')::uuid;result jsonb;rev integer;v jsonb;k text;b uuid;e uuid;BEGIN
 IF p_action='select' THEN IF brand_finance_private.role_for(c) IS NULL THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501';END IF;ELSE PERFORM erp_branch_private.authorize(c,CASE p_action WHEN 'settings' THEN 'settings' WHEN 'resource' THEN 'settings' WHEN 'delete' THEN 'delete' WHEN 'save' THEN CASE WHEN coalesce((p->>'revision')::integer,0)=0 THEN 'create' ELSE 'update' END ELSE 'update' END);END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(c::text,60412));
 IF p_request IS NULL OR jsonb_typeof(p)<>'object' OR octet_length(p::text)>131072 THEN RAISE EXCEPTION 'بيانات الفرع غير صالحة';END IF;
 SELECT * INTO old FROM erp_branch_private.requests WHERE cafe_id=c AND request_id=p_request;IF FOUND THEN IF old.actor<>auth.uid() OR old.payload<>jsonb_build_object('action',p_action,'input',p) THEN RAISE EXCEPTION 'طلب مكرر ببيانات مختلفة';END IF;RETURN old.result;END IF;
 IF p_action='select' THEN
  IF id IS NULL THEN IF brand_finance_private.role_for(c) NOT IN('owner','manager') THEN RAISE EXCEPTION 'اختر أحد فروعك المصرح بها' USING ERRCODE='42501';END IF;ELSIF NOT erp_branch_private.branch_allowed(c,id) THEN RAISE EXCEPTION 'الفرع غير متاح' USING ERRCODE='42501';END IF;
  SELECT revision INTO rev FROM public.erp_branch_scopes WHERE cafe_id=c AND user_id=auth.uid() FOR UPDATE;IF coalesce(rev,0) IS DISTINCT FROM (p->>'revision')::integer THEN RAISE EXCEPTION 'تغير فرع العمل أعد تحميل الصفحة' USING ERRCODE='40001';END IF;
  INSERT INTO public.erp_branch_scopes(cafe_id,user_id,branch_id) VALUES(c,auth.uid(),id) ON CONFLICT(cafe_id,user_id) DO UPDATE SET branch_id=excluded.branch_id,revision=erp_branch_scopes.revision+1;result:=erp_branch_private.scope(c);
 ELSIF p_action='save' THEN
  SELECT * INTO r FROM public.branches WHERE cafe_id=c AND branches.id=id AND deleted_at IS NULL FOR UPDATE;
  IF (FOUND AND r.erp_revision IS DISTINCT FROM (p->>'revision')::integer) OR (NOT FOUND AND coalesce((p->>'revision')::integer,0)<>0) THEN RAISE EXCEPTION 'تغير الفرع أعد تحميله' USING ERRCODE='40001';END IF;
  IF coalesce(btrim(p->>'name'),'')='' OR length(p->>'name')>160 OR length(coalesce(p->>'address',''))>1000 OR length(coalesce(p->>'city',''))>100 OR length(coalesce(p->>'phone',''))>40 OR length(coalesce(p->>'email',''))>200 OR length(coalesce(p->>'code',''))>60 OR length(coalesce(p->>'note',''))>5000 OR length(coalesce(p->>'hours',''))>1000 OR length(coalesce(p->>'taxNumber',''))>40 OR length(coalesce(p->>'registration',''))>80 OR (coalesce(p->>'email','')<>'' AND p->>'email' !~ '^[^ @]+@[^ @]+[.][^ @]+$') OR jsonb_typeof(p->'active') IS DISTINCT FROM 'boolean' OR abs(coalesce((p->>'lat')::numeric,0))>90 OR abs(coalesce((p->>'lng')::numeric,0))>180 OR ((p->>'lat') IS NULL)<>((p->>'lng') IS NULL) THEN RAISE EXCEPTION 'راجع بيانات الفرع وموقعه';END IF;
  IF r.id IS NOT NULL AND r.is_primary AND NOT (p->>'active')::boolean THEN RAISE EXCEPTION 'اختر فرعًا رئيسيًا آخر قبل إيقاف هذا الفرع';END IF;
  id:=coalesce(id,gen_random_uuid());
  IF r.id IS NULL THEN INSERT INTO public.branches(id,cafe_id,name,address,city,phone,lat,lng,hours,active) VALUES(id,c,btrim(p->>'name'),p->>'address',p->>'city',p->>'phone',(p->>'lat')::numeric,(p->>'lng')::numeric,jsonb_build_object('summary',coalesce(p->>'hours','')),(p->>'active')::boolean);
  ELSE UPDATE public.branches SET name=btrim(p->>'name'),address=p->>'address',city=p->>'city',phone=p->>'phone',lat=(p->>'lat')::numeric,lng=(p->>'lng')::numeric,hours=coalesce(hours,'{}')||jsonb_build_object('summary',coalesce(p->>'hours','')),active=(p->>'active')::boolean WHERE cafe_id=c AND branches.id=id;END IF;
  INSERT INTO public.erp_branch_details(cafe_id,id,code,email,tax_number,registration,note) VALUES(c,id,coalesce(p->>'code',''),coalesce(p->>'email',''),coalesce(p->>'taxNumber',''),coalesce(p->>'registration',''),coalesce(p->>'note','')) ON CONFLICT ON CONSTRAINT erp_branch_details_pkey DO UPDATE SET code=excluded.code,email=excluded.email,tax_number=excluded.tax_number,registration=excluded.registration,note=excluded.note;
  result:=jsonb_build_object('id',id,'revision',(SELECT erp_revision FROM public.branches WHERE cafe_id=c AND branches.id=id));
 ELSIF p_action='settings' THEN
  SELECT revision INTO rev FROM public.erp_branch_settings WHERE cafe_id=c FOR UPDATE;IF coalesce(rev,0) IS DISTINCT FROM (p->>'revision')::integer THEN RAISE EXCEPTION 'تغيرت إعدادات الفروع' USING ERRCODE='40001';END IF;
  b:=nullif(p->>'mainBranchId','')::uuid;IF b IS NULL OR NOT EXISTS(SELECT 1 FROM public.branches WHERE cafe_id=c AND branches.id=b AND active AND deleted_at IS NULL) THEN RAISE EXCEPTION 'اختر فرعًا رئيسيًا نشطًا';END IF;
  FOREACH k IN ARRAY ARRAY['shareCustomers','shareProducts','shareSuppliers','shareCostCenters','shareUnitTemplates','specifyAccounts'] LOOP IF jsonb_typeof(p->k) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'إعدادات مشاركة الفروع غير صالحة';END IF;END LOOP;
  UPDATE public.branches SET is_primary=false WHERE cafe_id=c AND is_primary AND branches.id<>b AND deleted_at IS NULL;UPDATE public.branches SET is_primary=true WHERE cafe_id=c AND branches.id=b AND NOT is_primary;
  INSERT INTO public.erp_branch_settings(cafe_id,payload) VALUES(c,p-'revision'-'mainBranchId') ON CONFLICT(cafe_id) DO UPDATE SET payload=excluded.payload,revision=erp_branch_settings.revision+1;id:=b;result:=jsonb_build_object('saved',true);
 ELSIF p_action='members' THEN
  SELECT * INTO r FROM public.branches WHERE cafe_id=c AND branches.id=id FOR UPDATE;IF NOT FOUND OR r.erp_revision IS DISTINCT FROM (p->>'revision')::integer THEN RAISE EXCEPTION 'Branch membership changed' USING ERRCODE='40001';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.branches WHERE cafe_id=c AND branches.id=id AND deleted_at IS NULL) OR jsonb_typeof(p->'employeeIds') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'employeeIds')>1000 THEN RAISE EXCEPTION 'قائمة الموظفين غير صالحة';END IF;
  DELETE FROM public.erp_branch_members WHERE cafe_id=c AND branch_id=id;
  FOR v IN SELECT value FROM jsonb_array_elements(p->'employeeIds') LOOP e:=(v#>>'{}')::uuid;IF NOT EXISTS(SELECT 1 FROM public.erp_hr_employees WHERE cafe_id=c AND erp_hr_employees.id=e AND active) THEN RAISE EXCEPTION 'الموظف غير متاح';END IF;INSERT INTO public.erp_branch_members VALUES(c,id,e) ON CONFLICT DO NOTHING;END LOOP;UPDATE public.branches SET updated_at=now() WHERE cafe_id=c AND branches.id=id;result:=jsonb_build_object('id',id);
 ELSIF p_action='resource' THEN
  k:=p->>'kind';IF NOT erp_branch_private.resource_exists(c,k,id) OR jsonb_typeof(p->'branchIds') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'branchIds')>1000 THEN RAISE EXCEPTION 'السجل أو نطاق الفروع غير صالح';END IF;
  IF jsonb_typeof(p->'expectedBranchIds') IS DISTINCT FROM 'array' OR coalesce((SELECT jsonb_agg(branch_id ORDER BY branch_id) FROM public.erp_branch_resources WHERE cafe_id=c AND kind=k AND record_id=id),'[]'::jsonb) IS DISTINCT FROM coalesce((SELECT jsonb_agg((value#>>'{}')::uuid ORDER BY (value#>>'{}')::uuid) FROM jsonb_array_elements(p->'expectedBranchIds')),'[]'::jsonb) THEN RAISE EXCEPTION 'Branch resource scope changed' USING ERRCODE='40001';END IF;
  DELETE FROM public.erp_branch_resources WHERE cafe_id=c AND kind=k AND record_id=id;
  FOR v IN SELECT value FROM jsonb_array_elements(p->'branchIds') LOOP b:=(v#>>'{}')::uuid;IF NOT EXISTS(SELECT 1 FROM public.branches WHERE cafe_id=c AND branches.id=b AND deleted_at IS NULL AND active) THEN RAISE EXCEPTION 'الفرع غير متاح';END IF;INSERT INTO public.erp_branch_resources VALUES(c,k,id,b) ON CONFLICT DO NOTHING;END LOOP;result:=jsonb_build_object('id',id);
 ELSIF p_action='delete' THEN
  SELECT * INTO r FROM public.branches WHERE cafe_id=c AND branches.id=id AND deleted_at IS NULL FOR UPDATE;IF NOT FOUND OR r.erp_revision IS DISTINCT FROM (p->>'revision')::integer THEN RAISE EXCEPTION 'تغير الفرع أعد تحميله' USING ERRCODE='40001';END IF;
  IF r.is_primary OR erp_branch_private.in_use(id) OR EXISTS(SELECT 1 FROM public.erp_hr_employees WHERE cafe_id=c AND branch_id=id AND active) OR EXISTS(SELECT 1 FROM public.erp_branch_members WHERE cafe_id=c AND branch_id=id) OR EXISTS(SELECT 1 FROM public.erp_branch_resources WHERE cafe_id=c AND branch_id=id) OR EXISTS(SELECT 1 FROM public.erp_branch_documents WHERE cafe_id=c AND branch_id=id) OR EXISTS(SELECT 1 FROM public.erp_files WHERE cafe_id=c AND entity_type='branch' AND record_id=id) THEN RAISE EXCEPTION 'الفرع مرتبط بسجلات أو موظفين أوقفه بدل حذفه';END IF;
  UPDATE public.branches SET active=false,deleted_at=now() WHERE cafe_id=c AND branches.id=id;result:=jsonb_build_object('id',id,'deleted',true);
 ELSE RAISE EXCEPTION 'عملية الفرع غير صالحة';END IF;
 INSERT INTO public.erp_branch_events(cafe_id,branch_id,action,payload,actor) VALUES(c,CASE WHEN p_action IN('resource') THEN NULL ELSE id END,p_action,p,auth.uid());
 INSERT INTO erp_branch_private.requests VALUES(c,p_request,auth.uid(),jsonb_build_object('action',p_action,'input',p),result);RETURN result;
END $$;
CREATE FUNCTION erp_branch_private.branch_revision() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$BEGIN NEW.erp_revision:=OLD.erp_revision+1;RETURN NEW;END $$;
CREATE TRIGGER erp_branch_revision BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION erp_branch_private.branch_revision();
CREATE FUNCTION public.erp_branches_read(p_cafe uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE role text;manage boolean;result jsonb;BEGIN
 role:=erp_branch_private.authorize(p_cafe);manage:=role IN('owner','manager');
 result:=jsonb_build_object('branches',coalesce((SELECT jsonb_agg(to_jsonb(b)||jsonb_build_object('details',coalesce(to_jsonb(d)-'cafe_id'-'id','{}'))) FROM public.branches b LEFT JOIN public.erp_branch_details d ON d.id=b.id AND d.cafe_id=b.cafe_id WHERE b.cafe_id=p_cafe AND b.deleted_at IS NULL AND(manage OR erp_branch_private.branch_allowed(p_cafe,b.id))),'[]'),'settings',coalesce((SELECT payload||jsonb_build_object('revision',revision) FROM public.erp_branch_settings WHERE cafe_id=p_cafe),'{}'::jsonb),'scope',erp_branch_private.scope(p_cafe),'canAll',manage,
 'members',CASE WHEN manage THEN coalesce((SELECT jsonb_agg(to_jsonb(m)-'cafe_id') FROM public.erp_branch_members m WHERE cafe_id=p_cafe),'[]') ELSE '[]' END,'employees',CASE WHEN manage THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',first_name||' '||last_name,'branchId',branch_id,'active',active)) FROM public.erp_hr_employees WHERE cafe_id=p_cafe),'[]') ELSE '[]' END,
 'resources',CASE WHEN manage THEN coalesce((SELECT jsonb_agg(to_jsonb(r)-'cafe_id') FROM public.erp_branch_resources r WHERE cafe_id=p_cafe),'[]') ELSE '[]' END,'events',CASE WHEN manage THEN coalesce((SELECT jsonb_agg(to_jsonb(e)-'cafe_id'-'actor') FROM(SELECT * FROM public.erp_branch_events WHERE cafe_id=p_cafe ORDER BY created_at DESC LIMIT 200)e),'[]') ELSE '[]' END,
 'documents',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT d.id,d.number,d.kind,d.total,d.created_at,b.branch_id FROM public.erp_branch_documents b JOIN public.bf_documents d ON d.cafe_id=b.cafe_id AND d.id=b.document_id WHERE b.cafe_id=p_cafe AND(manage OR erp_branch_private.branch_allowed(p_cafe,b.branch_id)) ORDER BY d.created_at DESC LIMIT 500)x),'[]'),'canWrite',manage,'canCreate',manage,'canUpdate',manage,'canDelete',manage,'canSettings',manage,'canFiles',manage);
 IF manage THEN result:=result||jsonb_build_object('catalog',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
 SELECT kind,id,name FROM public.bf_parties WHERE cafe_id=p_cafe AND kind IN('customer','supplier') UNION ALL SELECT 'item',id,name FROM public.bf_items WHERE cafe_id=p_cafe UNION ALL SELECT 'account',id,name FROM public.bf_accounts WHERE cafe_id=p_cafe UNION ALL SELECT 'cost_center',id,name FROM public.erp_cost_centers WHERE cafe_id=p_cafe UNION ALL SELECT 'unit_template',id,name FROM public.erp_inventory_catalogs WHERE cafe_id=p_cafe AND kind='unit_template') x),'[]'));ELSE result:=result||'{"catalog":[]}'::jsonb;END IF;
 RETURN erp_access_private.mask_snapshot(p_cafe,'branches',result);
END $$;
CREATE FUNCTION public.erp_branch_context(p_cafe uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF brand_finance_private.role_for(p_cafe) IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('requiresSelection',brand_finance_private.role_for(p_cafe) NOT IN('owner','manager') AND EXISTS(SELECT 1 FROM public.branches WHERE cafe_id=p_cafe AND active AND deleted_at IS NULL),'scope',erp_branch_private.scope(p_cafe),'canAll',brand_finance_private.role_for(p_cafe) IN('owner','manager'),'branches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'active',active,'is_primary',is_primary) ORDER BY is_primary DESC,name) FROM public.branches WHERE cafe_id=p_cafe AND active AND deleted_at IS NULL AND erp_branch_private.branch_allowed(p_cafe,id)),'[]'));
END $$;
REVOKE ALL ON FUNCTION public.erp_branch_context(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_branch_context(uuid) TO authenticated;
-- Private files delegate the current complete dispatcher chain
ALTER FUNCTION erp_file_private.assert_record(uuid,text,uuid,boolean) RENAME TO assert_record_before_branches;
CREATE FUNCTION erp_file_private.assert_record(p_cafe uuid,p_type text,p_record uuid,p_write boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$BEGIN
 IF p_type<>'branch' THEN PERFORM erp_file_private.assert_record_before_branches(p_cafe,p_type,p_record,p_write);RETURN;END IF;
 PERFORM erp_branch_private.authorize(p_cafe,CASE WHEN p_write THEN 'files' ELSE 'read' END);
 PERFORM 1 FROM public.branches WHERE cafe_id=p_cafe AND id=p_record AND deleted_at IS NULL AND(brand_finance_private.role_for(p_cafe) IN('owner','manager') OR erp_branch_private.branch_allowed(p_cafe,p_record)) FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'الفرع غير متاح' USING ERRCODE='42501';END IF;
END $$;
ALTER FUNCTION erp_access_private.file_domain(text) RENAME TO file_domain_before_branches;
CREATE FUNCTION erp_access_private.file_domain(p_type text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$SELECT CASE WHEN p_type='branch' THEN 'branches' ELSE erp_access_private.file_domain_before_branches(p_type) END$$;
CREATE TRIGGER erp_branch_files_guard BEFORE DELETE ON public.branches FOR EACH ROW EXECUTE FUNCTION erp_file_private.prevent_orphans('branch');
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_branch_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.erp_branches_read(uuid),public.erp_branches_write(uuid,text,jsonb,uuid),erp_file_private.assert_record(uuid,text,uuid,boolean),erp_file_private.assert_record_before_branches(uuid,text,uuid,boolean),erp_access_private.file_domain(text),erp_access_private.file_domain_before_branches(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_branches_read(uuid),public.erp_branches_write(uuid,text,jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
