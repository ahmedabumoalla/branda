BEGIN;
CREATE SCHEMA erp_customer_private;
REVOKE ALL ON SCHEMA erp_customer_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.erp_customer_settings(cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),revision integer NOT NULL DEFAULT 1,payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'));
CREATE TABLE public.erp_customer_catalogs(cafe_id uuid NOT NULL REFERENCES public.cafes(id),id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('category','status','action')),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 250),description text NOT NULL DEFAULT '',parent_id uuid,active boolean NOT NULL DEFAULT true,color text NOT NULL DEFAULT '#d9b25e',revision integer NOT NULL DEFAULT 1,PRIMARY KEY(cafe_id,id),UNIQUE(cafe_id,kind,name),FOREIGN KEY(cafe_id,parent_id) REFERENCES public.erp_customer_catalogs(cafe_id,id));
CREATE TABLE public.erp_customer_profiles(cafe_id uuid NOT NULL,id uuid NOT NULL,code text NOT NULL CHECK(length(code) BETWEEN 1 AND 60),payload jsonb NOT NULL DEFAULT '{}',revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(cafe_id,id),UNIQUE(cafe_id,code),FOREIGN KEY(cafe_id,id) REFERENCES public.bf_parties(cafe_id,id) ON DELETE CASCADE);
CREATE TABLE public.erp_customer_appointments(cafe_id uuid NOT NULL REFERENCES public.cafes(id),id uuid NOT NULL,customer_id uuid NOT NULL,series_id uuid NOT NULL,starts_at timestamptz NOT NULL,duration integer NOT NULL CHECK(duration BETWEEN 1 AND 1440),action text NOT NULL DEFAULT 'meeting',action_id uuid,notes text NOT NULL DEFAULT '',status text NOT NULL CHECK(status IN('scheduled','done','cancelled')),staff_ids uuid[] NOT NULL DEFAULT '{}',share_with_customer boolean NOT NULL DEFAULT false,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(cafe_id,id),FOREIGN KEY(cafe_id,customer_id) REFERENCES public.bf_parties(cafe_id,id) ON DELETE CASCADE,FOREIGN KEY(cafe_id,action_id) REFERENCES public.erp_customer_catalogs(cafe_id,id));
CREATE INDEX erp_customer_appointment_date ON public.erp_customer_appointments(cafe_id,starts_at);
CREATE INDEX erp_customer_appointment_customer ON public.erp_customer_appointments(cafe_id,customer_id,starts_at);
CREATE TABLE public.erp_customer_followups(cafe_id uuid NOT NULL REFERENCES public.cafes(id),id uuid NOT NULL,customer_id uuid NOT NULL,status text NOT NULL,status_id uuid,action text NOT NULL,action_id uuid,due_at timestamptz,body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 10000),actor uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(cafe_id,id),FOREIGN KEY(cafe_id,customer_id) REFERENCES public.bf_parties(cafe_id,id) ON DELETE CASCADE,FOREIGN KEY(cafe_id,status_id) REFERENCES public.erp_customer_catalogs(cafe_id,id),FOREIGN KEY(cafe_id,action_id) REFERENCES public.erp_customer_catalogs(cafe_id,id));
CREATE INDEX erp_customer_followup_customer ON public.erp_customer_followups(cafe_id,customer_id,created_at DESC);
CREATE TABLE public.erp_customer_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id),record_id uuid NOT NULL,action text NOT NULL,actor uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX erp_customer_events_tenant ON public.erp_customer_events(cafe_id,created_at DESC);
CREATE TABLE erp_customer_private.requests(cafe_id uuid NOT NULL,id uuid NOT NULL,command jsonb NOT NULL,actor uuid NOT NULL,result jsonb NOT NULL,PRIMARY KEY(cafe_id,id));
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.erp_customer_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON erp_customer_private.requests FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
-- Extend only this new ERP surface; sales/finance permissions remain unchanged.
DO $$DECLARE domains text[];BEGIN domains:=erp_access_private.domains()||'customers'::text;EXECUTE format('CREATE OR REPLACE FUNCTION erp_access_private.domains() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path='''' AS $f$SELECT %L::text[]$f$',domains);END $$;
UPDATE public.erp_roles SET permissions=permissions||jsonb_build_object('customers',jsonb_build_object('read',false,'create',false,'update',false,'delete',false,'approve',false,'settings',false,'files',false));
CREATE FUNCTION erp_customer_private.authorize(c uuid,a text DEFAULT 'read') RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE r text;BEGIN r:=brand_finance_private.role_for(c);IF coalesce(r,'') NOT IN('owner','manager','accountant','auditor') OR (a<>'read' AND r='auditor') OR (a='settings' AND r<>'owner') THEN RAISE EXCEPTION 'لا تملك صلاحية إدارة بيانات العملاء' USING ERRCODE='42501';END IF;PERFORM erp_access_private.assert_allowed(c,'customers',a);RETURN r;END $$;
CREATE FUNCTION erp_customer_private.defaults() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$SELECT '{"customerType":"both","nextNumber":1,"prefix":"","fields":[],"showPhoto":true,"showIdentity":true,"showBirthDate":false,"showGender":false,"showBarcode":false,"showWebsite":false,"showLocation":false,"multipleAddresses":true,"openingBalance":false,"creditLimit":false,"creditDays":false,"statementColumns":["date","number","kind","memo","debit","credit","balance"],"statementHeader":"كشف حساب العميل","statementFooter":""}'::jsonb$$;
CREATE FUNCTION erp_customer_private.fingerprint(p public.bf_parties) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$SELECT md5((to_jsonb(p)-'cafe_id')::text)$$;
CREATE FUNCTION erp_customer_private.profile(p public.bf_parties) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$SELECT jsonb_build_object('id',p.id,'revision',coalesce(c.revision,0),'fingerprint',erp_customer_private.fingerprint(p),'code',coalesce(c.code,''),'categories','[]'::jsonb,'status','followup','statusId',NULL,'assignedUserId',NULL,'birthDate','','gender','','barcode','','website','','location',NULL,'creditLimit',NULL,'creditDays',NULL,'customValues','{}'::jsonb,'photoId',NULL)||coalesce(c.payload,(SELECT jsonb_build_object('status',f.status,'statusId',f.status_id) FROM public.erp_customer_followups f WHERE f.cafe_id=p.cafe_id AND f.customer_id=p.id ORDER BY f.created_at DESC LIMIT 1),'{}') FROM (SELECT 1) q LEFT JOIN public.erp_customer_profiles c ON c.cafe_id=p.cafe_id AND c.id=p.id$$;
CREATE FUNCTION erp_customer_private.assert_catalog(c uuid,i uuid,k text) RETURNS void LANGUAGE plpgsql STABLE SET search_path='' AS $$BEGIN IF i IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_customer_catalogs WHERE cafe_id=c AND id=i AND kind=k AND active) THEN RAISE EXCEPTION 'التصنيف أو الحالة غير متاحة';END IF;END $$;
CREATE FUNCTION public.erp_customers_read(p_cafe_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE r text;result jsonb;BEGIN
 r:=erp_customer_private.authorize(p_cafe_id);SELECT jsonb_build_object(
 'customers',coalesce((SELECT jsonb_agg((to_jsonb(p)-'cafe_id')||jsonb_build_object('photoPath',(SELECT path FROM public.erp_files WHERE cafe_id=p.cafe_id AND record_id=p.id AND entity_type='customer_profile' AND id=nullif((SELECT payload->>'photoId' FROM public.erp_customer_profiles WHERE cafe_id=p.cafe_id AND id=p.id),'')::uuid AND uploaded),'profile',erp_customer_private.profile(p),'fingerprint',erp_customer_private.fingerprint(p),'balance',coalesce((SELECT sum(j.debit-j.credit) FROM public.bf_journal j JOIN public.bf_accounts a ON a.cafe_id=j.cafe_id AND a.id=j.account_id WHERE j.cafe_id=p_cafe_id AND j.party_id=p.id AND a.kind='receivable'),0)) ORDER BY p.name) FROM public.bf_parties p WHERE p.cafe_id=p_cafe_id AND p.kind='customer'),'[]'),
 'catalogs',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'revision',revision,'kind',kind,'name',name,'description',description,'parentId',parent_id,'active',active,'color',color) ORDER BY name) FROM public.erp_customer_catalogs WHERE cafe_id=p_cafe_id),'[]'),
 'appointments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'revision',a.revision,'customerId',a.customer_id,'customerName',p.name,'seriesId',a.series_id,'startsAt',a.starts_at,'duration',a.duration,'action',a.action,'actionId',a.action_id,'notes',a.notes,'status',a.status,'staffIds',a.staff_ids,'recurrence','none','until','','shareWithCustomer',a.share_with_customer,'createdAt',a.created_at) ORDER BY a.starts_at DESC) FROM public.erp_customer_appointments a JOIN public.bf_parties p ON p.cafe_id=a.cafe_id AND p.id=a.customer_id WHERE a.cafe_id=p_cafe_id),'[]'),
 'followups',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'customerId',f.customer_id,'status',f.status,'statusId',f.status_id,'action',f.action,'actionId',f.action_id,'dueAt',coalesce(f.due_at::text,''),'body',f.body,'createdAt',f.created_at,'actorName',coalesce(s.name,'المالك')) ORDER BY f.created_at DESC) FROM public.erp_customer_followups f LEFT JOIN public.bf_staff s ON s.cafe_id=f.cafe_id AND s.user_id=f.actor WHERE f.cafe_id=p_cafe_id),'[]'),
 'settings',erp_customer_private.defaults()||coalesce((SELECT payload||jsonb_build_object('revision',revision) FROM public.erp_customer_settings WHERE cafe_id=p_cafe_id),'{"revision":0}'),
 'users',coalesce((SELECT jsonb_agg(jsonb_build_object('id',user_id,'name',name)) FROM public.bf_staff WHERE cafe_id=p_cafe_id AND active),'[]'),
 'events',coalesce((SELECT jsonb_agg(to_jsonb(e)-'actor'-'cafe_id' ORDER BY e.created_at DESC) FROM (SELECT * FROM public.erp_customer_events WHERE cafe_id=p_cafe_id ORDER BY created_at DESC LIMIT 200) e),'[]'),'canWrite',r<>'auditor','canSettings',r='owner') INTO result;
 RETURN erp_access_private.mask_snapshot(p_cafe_id,'customers',result);
END $$;

CREATE FUNCTION erp_customer_private.normalize_values(fields jsonb,vals jsonb,depth integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE f jsonb;v jsonb;arr jsonb;normalized jsonb:='{}';BEGIN
 IF depth>2 OR coalesce(jsonb_typeof(vals),'')<>'object' THEN RAISE EXCEPTION 'قيم الحقول غير صالحة';END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(coalesce(fields,'[]')) LOOP
  IF f->>'type' IN('static','separator') THEN CONTINUE;END IF;
  v:=coalesce(vals->(f->>'id'),f->'defaultValue');
  IF f->>'type'='subform' THEN
   IF v IS NULL THEN SELECT coalesce(jsonb_agg('{}'::jsonb),'[]') INTO v FROM generate_series(1,coalesce((f->>'minimumRows')::integer,0));END IF;
   IF jsonb_typeof(v)='array' THEN SELECT coalesce(jsonb_agg(erp_customer_private.normalize_values(f->'fields',x,depth+1)),'[]') INTO arr FROM jsonb_array_elements(v) x;v:=arr;END IF;
  END IF;
  IF v IS NOT NULL THEN normalized:=jsonb_set(normalized,ARRAY[f->>'id'],v);END IF;
 END LOOP;RETURN normalized;
END $$;
CREATE FUNCTION erp_customer_private.validate_custom_values(fields jsonb,vals jsonb,p_cafe uuid DEFAULT NULL,p_record uuid DEFAULT NULL,p_kind text DEFAULT NULL,depth integer DEFAULT 0,p_draft boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE f jsonb;v jsonb;t text;x jsonb;txt text;tbl text;col text;valid boolean;metric numeric;BEGIN
 IF coalesce(jsonb_typeof(vals),'')<>'object' OR octet_length(vals::text)>262144 OR depth>2 THEN RAISE EXCEPTION 'بيانات الحقول الإضافية غير صالحة';END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(coalesce(fields,'[]')) LOOP
  t:=f->>'type';IF t IN('static','separator') THEN CONTINUE;END IF;
  v:=coalesce(vals->(f->>'id'),f->'defaultValue');
  IF coalesce((f->>'required')::boolean,false) AND NOT p_draft AND (v IS NULL OR v='null'::jsonb OR v='""'::jsonb OR v='[]'::jsonb OR (t='checkbox' AND v<>'true')) THEN RAISE EXCEPTION 'أكمل الحقل المطلوب: %',f->>'label';END IF;
  IF v IS NULL OR v='null'::jsonb OR v='""'::jsonb THEN CONTINUE;END IF;
  IF t='subform' THEN
   IF jsonb_typeof(v)<>'array' OR jsonb_array_length(v)>100 OR jsonb_array_length(v)<coalesce((f->>'minimumRows')::integer,0) THEN RAISE EXCEPTION 'عدد صفوف النموذج غير صالح';END IF;
   FOR x IN SELECT value FROM jsonb_array_elements(v) LOOP PERFORM erp_customer_private.validate_custom_values(f->'fields',x,p_cafe,p_record,p_kind,depth+1,p_draft);END LOOP;CONTINUE;
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
   EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.erp_files WHERE cafe_id=$1 AND record_id=$2 AND id=$3 AND entity_type=$4 AND uploaded AND ($5<>''image'' OR mime IN(''image/jpeg'',''image/png'')))' INTO valid USING p_cafe,p_record,txt::uuid,'customer_profile',t;
   IF NOT valid THEN RAISE EXCEPTION 'المرفق غير موجود في هذا السجل';END IF;
  END IF;
  IF coalesce((f->>'unique')::boolean,false) AND depth=0 THEN
   tbl:='erp_customer_profiles';
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE cafe_id=$1 AND id IS DISTINCT FROM $2 AND payload->''customValues''->$3=$4)',tbl) INTO valid USING p_cafe,p_record,f->>'id',v;
   IF valid THEN RAISE EXCEPTION 'قيمة الحقل مستخدمة مسبقًا: %',f->>'label';END IF;
  END IF;
 END LOOP;
END $$;
CREATE FUNCTION erp_customer_private.save(c uuid,input jsonb,request uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
#variable_conflict use_variable
DECLARE p public.bf_parties;old public.erp_customer_profiles;cfg jsonb;code text;n bigint;v jsonb;k text;fields jsonb;result jsonb;sid uuid;BEGIN
 SELECT * INTO p FROM public.bf_parties WHERE cafe_id=c AND id=(input->>'id')::uuid FOR UPDATE;
 IF p.id IS NOT NULL AND p.kind<>'customer' THEN RAISE EXCEPTION 'السجل ليس عميلًا';END IF;
 PERFORM erp_customer_private.authorize(c,CASE WHEN p.id IS NULL THEN 'create' ELSE 'update' END);
 SELECT * INTO old FROM public.erp_customer_profiles WHERE cafe_id=c AND id=(input->>'id')::uuid FOR UPDATE;
 IF coalesce(old.revision,0) IS DISTINCT FROM (input->>'revision')::integer OR (p.id IS NOT NULL AND erp_customer_private.fingerprint(p) IS DISTINCT FROM input->>'fingerprint') THEN RAISE EXCEPTION 'تغيرت بيانات العميل أعد تحميلها' USING ERRCODE='40001';END IF;
 IF length(btrim(input->>'name')) NOT BETWEEN 1 AND 150 OR length(coalesce(input->>'phone',''))>30 OR length(coalesce(input->>'email',''))>250 OR jsonb_typeof(input->'active') IS DISTINCT FROM 'boolean' OR jsonb_typeof(input->'categories') IS DISTINCT FROM 'array' OR jsonb_array_length(input->'categories')>50 OR jsonb_typeof(input->'customValues') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'راجع بيانات العميل';END IF;
 IF nullif(input->>'email','') IS NOT NULL AND input->>'email'!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'البريد الإلكتروني غير صالح';END IF;
 SELECT erp_customer_private.defaults()||coalesce((SELECT payload FROM public.erp_customer_settings WHERE cafe_id=c),'{}') INTO cfg;
 IF cfg->>'customerType'<>'both' AND cfg->>'customerType' IS DISTINCT FROM input#>>'{details,customerType}' THEN RAISE EXCEPTION 'نوع العميل يخالف إعدادات العلامة';END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(input->'categories') LOOP PERFORM erp_customer_private.assert_catalog(c,(v#>>'{}')::uuid,'category');END LOOP;
 PERFORM erp_customer_private.assert_catalog(c,nullif(input->>'statusId','')::uuid,'status');
 IF nullif(input->>'assignedUserId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=c AND user_id=(input->>'assignedUserId')::uuid AND active) THEN RAISE EXCEPTION 'الموظف غير نشط';END IF;
 IF nullif(input->>'birthDate','') IS NOT NULL THEN PERFORM (input->>'birthDate')::date;END IF;
 IF input->>'gender' NOT IN('','male','female') OR length(coalesce(input->>'barcode',''))>100 OR (nullif(input->>'website','') IS NOT NULL AND input->>'website'!~'^https?://[^[:space:]]+$') OR (input->'location'<>'null'::jsonb AND (jsonb_typeof(input->'location')<>'object' OR abs((input#>>'{location,latitude}')::numeric)>90 OR abs((input#>>'{location,longitude}')::numeric)>180)) OR (input->>'creditLimit')::numeric<0 OR (input->>'creditLimit')::numeric>1e12 OR (input->>'creditDays')::integer NOT BETWEEN 0 AND 3650 THEN RAISE EXCEPTION 'راجع بيانات الهوية والائتمان';END IF;
 IF nullif(input->>'barcode','') IS NOT NULL AND EXISTS(SELECT 1 FROM public.erp_customer_profiles WHERE cafe_id=c AND id<>(input->>'id')::uuid AND payload->>'barcode'=input->>'barcode') THEN RAISE EXCEPTION 'باركود العميل مستخدم بالفعل';END IF;
 IF nullif(input->>'photoId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_files WHERE cafe_id=c AND record_id=(input->>'id')::uuid AND entity_type='customer_profile' AND id=(input->>'photoId')::uuid AND uploaded AND mime IN('image/jpeg','image/png')) THEN RAISE EXCEPTION 'اختر صورة مرفوعة في ملف العميل';END IF;
 fields:=cfg->'fields';input:=jsonb_set(input,'{customValues}',erp_customer_private.normalize_values(fields,input->'customValues'));PERFORM erp_customer_private.validate_custom_values(fields,input->'customValues',c,(input->>'id')::uuid,'customers');
 code:=btrim(coalesce(input->>'code',''));IF code='' THEN
  IF old.id IS NOT NULL THEN code:=old.code;ELSE n:=(cfg->>'nextNumber')::bigint;LOOP IF n>999999999 THEN RAISE EXCEPTION 'نفد نطاق ترقيم العملاء';END IF;code:=(cfg->>'prefix')||lpad(n::text,greatest(6,length(n::text)),'0');EXIT WHEN NOT EXISTS(SELECT 1 FROM public.erp_customer_profiles WHERE cafe_id=c AND erp_customer_profiles.code=code);n:=n+1;END LOOP;
  INSERT INTO public.erp_customer_settings(cafe_id,payload) VALUES(c,cfg||jsonb_build_object('nextNumber',n+1)) ON CONFLICT(cafe_id) DO UPDATE SET payload=excluded.payload,revision=erp_customer_settings.revision+1;END IF;
 END IF;
 result:=public.brand_finance_save_customer(c,jsonb_build_object('id',input->'id','kind','customer','name',btrim(input->>'name'),'phone',coalesce(input->>'phone',''),'email',coalesce(input->>'email',''),'taxNumber',coalesce(input->>'taxNumber',''),'active',input->'active','details',input->'details'),request);
 INSERT INTO public.erp_customer_profiles(cafe_id,id,code,payload) VALUES(c,(input->>'id')::uuid,code,input-ARRAY['id','revision','fingerprint','code','name','phone','email','taxNumber','active','details']) ON CONFLICT(cafe_id,id) DO UPDATE SET code=excluded.code,payload=excluded.payload,revision=erp_customer_profiles.revision+1,updated_at=now() RETURNING * INTO old;
 RETURN jsonb_build_object('id',old.id,'revision',old.revision,'code',old.code);
END $$;
CREATE FUNCTION public.erp_customers_write(p_cafe_id uuid,p_action text,p_input jsonb,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text;rid uuid;old erp_customer_private.requests;cmd jsonb;result jsonb;entry jsonb;cfg public.erp_customer_settings;cat public.erp_customer_catalogs;parent public.erp_customer_catalogs;appointment public.erp_customer_appointments;profile public.erp_customer_profiles;pid uuid;starts timestamptz;series uuid;occ integer:=0;enddate date;step interval;ids jsonb:='[]';revision integer;key text;staff uuid;BEGIN
 r:=erp_customer_private.authorize(p_cafe_id,CASE WHEN p_action IN('settings','catalog','catalog_delete') THEN 'settings' WHEN p_action~'delete' THEN 'delete' WHEN p_action='followup' THEN 'update' WHEN p_action='save' THEN 'read' WHEN p_action='appointment' AND coalesce((p_input->>'revision')::integer,0)>0 THEN 'update' ELSE 'create' END);
 IF p_request IS NULL OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR octet_length(p_input::text)>524288 THEN RAISE EXCEPTION 'طلب غير صالح';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,67950));
 cmd:=jsonb_build_object('action',p_action,'input',p_input);SELECT * INTO old FROM erp_customer_private.requests WHERE cafe_id=p_cafe_id AND id=p_request;
 IF FOUND THEN IF old.actor<>auth.uid() OR old.command<>cmd THEN RAISE EXCEPTION 'تعارض معرف العملية' USING ERRCODE='40001';END IF;RETURN old.result;END IF;
 rid:=nullif(p_input->>'id','')::uuid;
 IF p_action='save' THEN result:=erp_customer_private.save(p_cafe_id,p_input,p_request);
 ELSIF p_action='delete' THEN
  SELECT * INTO profile FROM public.erp_customer_profiles WHERE cafe_id=p_cafe_id AND id=rid FOR UPDATE;IF coalesce(profile.revision,0) IS DISTINCT FROM (p_input->>'revision')::integer THEN RAISE EXCEPTION 'تغير العميل' USING ERRCODE='40001';END IF;
  IF EXISTS(SELECT 1 FROM public.bf_documents WHERE cafe_id=p_cafe_id AND party_id=rid) OR EXISTS(SELECT 1 FROM public.bf_journal WHERE cafe_id=p_cafe_id AND party_id=rid) THEN RAISE EXCEPTION 'العميل مرتبط بحركات مالية يمكنك إيقافه بدل الحذف';END IF;
  DELETE FROM public.bf_parties WHERE cafe_id=p_cafe_id AND id=rid AND kind='customer';IF NOT FOUND THEN RAISE EXCEPTION 'العميل غير موجود';END IF;result:=jsonb_build_object('id',rid);
 ELSIF p_action='settings' THEN
  SELECT * INTO cfg FROM public.erp_customer_settings WHERE cafe_id=p_cafe_id FOR UPDATE;IF coalesce(cfg.revision,0) IS DISTINCT FROM (p_input->>'revision')::integer THEN RAISE EXCEPTION 'تغيرت الإعدادات أعد تحميلها' USING ERRCODE='40001';END IF;
  IF jsonb_typeof(p_input->'customerType') IS DISTINCT FROM 'string' OR jsonb_typeof(p_input->'nextNumber') IS DISTINCT FROM 'number' OR jsonb_typeof(p_input->'prefix') IS DISTINCT FROM 'string' OR jsonb_typeof(p_input->'statementHeader') IS DISTINCT FROM 'string' OR jsonb_typeof(p_input->'statementFooter') IS DISTINCT FROM 'string' OR p_input->>'customerType' NOT IN('both','individual','business') OR (p_input->>'nextNumber')::bigint NOT BETWEEN 1 AND 999999999 OR length(p_input->>'prefix')>20 OR jsonb_typeof(p_input->'statementColumns') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'statementColumns')=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_input->'statementColumns') x WHERE x NOT IN('date','number','kind','memo','debit','credit','balance')) OR length(p_input->>'statementHeader')>4000 OR length(p_input->>'statementFooter')>4000 THEN RAISE EXCEPTION 'راجع إعدادات العملاء';END IF;
  FOREACH key IN ARRAY ARRAY['showPhoto','showIdentity','showBirthDate','showGender','showBarcode','showWebsite','showLocation','multipleAddresses','openingBalance','creditLimit','creditDays'] LOOP IF jsonb_typeof(p_input->key) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'خيار إعداد غير صالح';END IF;END LOOP;
  PERFORM erp_manufacturing_private.validate_custom_fields(p_input->'fields');INSERT INTO public.erp_customer_settings(cafe_id,payload) VALUES(p_cafe_id,p_input-'revision') ON CONFLICT(cafe_id) DO UPDATE SET payload=excluded.payload,revision=erp_customer_settings.revision+1 RETURNING erp_customer_settings.revision INTO revision;result:=jsonb_build_object('revision',revision);rid:=p_cafe_id;
 ELSIF p_action='catalog' THEN
  SELECT * INTO cat FROM public.erp_customer_catalogs WHERE cafe_id=p_cafe_id AND id=rid FOR UPDATE;IF coalesce(cat.revision,0) IS DISTINCT FROM (p_input->>'revision')::integer THEN RAISE EXCEPTION 'تغير التصنيف' USING ERRCODE='40001';END IF;
  IF p_input->>'kind' NOT IN('category','status','action') OR length(btrim(p_input->>'name')) NOT BETWEEN 1 AND 250 OR length(p_input->>'description')>2000 OR jsonb_typeof(p_input->'active') IS DISTINCT FROM 'boolean' OR p_input->>'color'!~'^#[0-9a-fA-F]{6}$' THEN RAISE EXCEPTION 'راجع بيانات التصنيف';END IF;
  pid:=nullif(p_input->>'parentId','')::uuid;IF pid IS NOT NULL THEN
   SELECT * INTO parent FROM public.erp_customer_catalogs WHERE cafe_id=p_cafe_id AND id=pid AND kind='category';IF parent.id IS NULL OR p_input->>'kind'<>'category' THEN RAISE EXCEPTION 'التصنيف الرئيسي غير صالح';END IF;
   IF pid=rid OR EXISTS(WITH RECURSIVE tree AS(SELECT id,parent_id FROM public.erp_customer_catalogs WHERE cafe_id=p_cafe_id AND id=pid UNION ALL SELECT p.id,p.parent_id FROM public.erp_customer_catalogs p JOIN tree t ON p.id=t.parent_id WHERE p.cafe_id=p_cafe_id) SELECT 1 FROM tree WHERE id=rid) THEN RAISE EXCEPTION 'لا يمكن إنشاء دورة في التصنيفات';END IF;
  END IF;
  IF cat.id IS NOT NULL AND cat.kind<>p_input->>'kind' THEN RAISE EXCEPTION 'لا يمكن تغيير نوع التصنيف';END IF;
  INSERT INTO public.erp_customer_catalogs(cafe_id,id,kind,name,description,parent_id,active,color) VALUES(p_cafe_id,rid,p_input->>'kind',btrim(p_input->>'name'),p_input->>'description',pid,(p_input->>'active')::boolean,p_input->>'color') ON CONFLICT(cafe_id,id) DO UPDATE SET name=excluded.name,description=excluded.description,parent_id=excluded.parent_id,active=excluded.active,color=excluded.color,revision=erp_customer_catalogs.revision+1 RETURNING erp_customer_catalogs.revision INTO revision;result:=jsonb_build_object('id',rid,'revision',revision);
 ELSIF p_action='catalog_delete' THEN
  IF EXISTS(SELECT 1 FROM public.erp_customer_profiles WHERE cafe_id=p_cafe_id AND (payload->'categories' @> jsonb_build_array(rid::text) OR payload->>'statusId'=rid::text)) THEN RAISE EXCEPTION 'التصنيف مستخدم في ملفات العملاء';END IF;
  DELETE FROM public.erp_customer_catalogs WHERE cafe_id=p_cafe_id AND id=rid AND erp_customer_catalogs.revision=(p_input->>'revision')::integer;IF NOT FOUND THEN RAISE EXCEPTION 'تغير التصنيف' USING ERRCODE='40001';END IF;result:=jsonb_build_object('id',rid);
 ELSIF p_action='appointment' THEN
  IF NOT EXISTS(SELECT 1 FROM public.bf_parties WHERE cafe_id=p_cafe_id AND id=(p_input->>'customerId')::uuid AND kind='customer' AND active) THEN RAISE EXCEPTION 'اختر عميلًا نشطًا';END IF;
  SELECT * INTO appointment FROM public.erp_customer_appointments WHERE cafe_id=p_cafe_id AND id=rid FOR UPDATE;IF coalesce(appointment.revision,0) IS DISTINCT FROM (p_input->>'revision')::integer THEN RAISE EXCEPTION 'تغير الموعد' USING ERRCODE='40001';END IF;
  PERFORM erp_customer_private.assert_catalog(p_cafe_id,nullif(p_input->>'actionId','')::uuid,'action');
  IF (p_input->>'duration')::integer NOT BETWEEN 1 AND 1440 OR p_input->>'status' NOT IN('scheduled','done','cancelled') OR length(p_input->>'notes')>10000 OR p_input->>'recurrence' NOT IN('none','daily','weekly','monthly') OR jsonb_typeof(p_input->'staffIds') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'staffIds')>30 OR jsonb_typeof(p_input->'shareWithCustomer') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'راجع بيانات الموعد';END IF;
  FOR staff IN SELECT value::uuid FROM jsonb_array_elements_text(p_input->'staffIds') LOOP IF NOT EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=p_cafe_id AND user_id=staff AND active) THEN RAISE EXCEPTION 'موظف الموعد غير متاح';END IF;END LOOP;
  starts:=(p_input->>'startsAt')::timestamptz;enddate:=CASE WHEN p_input->>'recurrence'='none' THEN (starts AT TIME ZONE 'Asia/Riyadh')::date ELSE (p_input->>'until')::date END;
  IF enddate<(starts AT TIME ZONE 'Asia/Riyadh')::date OR enddate>(starts AT TIME ZONE 'Asia/Riyadh')::date+366 OR (appointment.id IS NOT NULL AND p_input->>'recurrence'<>'none') THEN RAISE EXCEPTION 'تكرار الموعد غير صالح أو يتجاوز سنة';END IF;
  series:=coalesce(appointment.series_id,rid);step:=CASE p_input->>'recurrence' WHEN 'weekly' THEN interval '7 days' WHEN 'monthly' THEN interval '1 month' ELSE interval '1 day' END;
  LOOP
   INSERT INTO public.erp_customer_appointments(cafe_id,id,customer_id,series_id,starts_at,duration,action,action_id,notes,status,staff_ids,share_with_customer) VALUES(p_cafe_id,CASE WHEN occ=0 THEN rid ELSE gen_random_uuid() END,(p_input->>'customerId')::uuid,series,starts,(p_input->>'duration')::integer,p_input->>'action',nullif(p_input->>'actionId','')::uuid,p_input->>'notes',p_input->>'status',ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(p_input->'staffIds')),(p_input->>'shareWithCustomer')::boolean) ON CONFLICT(cafe_id,id) DO UPDATE SET starts_at=excluded.starts_at,duration=excluded.duration,action=excluded.action,action_id=excluded.action_id,notes=excluded.notes,status=excluded.status,staff_ids=excluded.staff_ids,share_with_customer=excluded.share_with_customer,revision=erp_customer_appointments.revision+1 RETURNING id INTO pid;
   ids:=ids||jsonb_build_array(pid);occ:=occ+1;EXIT WHEN p_input->>'recurrence'='none';starts:=starts+step;EXIT WHEN (starts AT TIME ZONE 'Asia/Riyadh')::date>enddate;IF occ>=367 THEN RAISE EXCEPTION 'عدد تكرارات الموعد يتجاوز الحد';END IF;
  END LOOP;result:=jsonb_build_object('id',rid,'ids',ids,'count',occ);
 ELSIF p_action='appointment_delete' THEN DELETE FROM public.erp_customer_appointments WHERE cafe_id=p_cafe_id AND id=rid AND erp_customer_appointments.revision=(p_input->>'revision')::integer;IF NOT FOUND THEN RAISE EXCEPTION 'تغير الموعد' USING ERRCODE='40001';END IF;result:=jsonb_build_object('id',rid);
 ELSIF p_action='followup' THEN
  IF NOT EXISTS(SELECT 1 FROM public.bf_parties WHERE cafe_id=p_cafe_id AND id=(p_input->>'customerId')::uuid AND kind='customer' AND active) THEN RAISE EXCEPTION 'اختر عميلًا نشطًا';END IF;
  PERFORM erp_customer_private.assert_catalog(p_cafe_id,nullif(p_input->>'statusId','')::uuid,'status');PERFORM erp_customer_private.assert_catalog(p_cafe_id,nullif(p_input->>'actionId','')::uuid,'action');
  IF length(btrim(regexp_replace(replace(p_input->>'body','&nbsp;',' '),'<[^>]*>','','g')))=0 OR length(p_input->>'status')>250 OR length(p_input->>'action')>250 THEN RAISE EXCEPTION 'راجع المتابعة';END IF;
  INSERT INTO public.erp_customer_followups VALUES(p_cafe_id,rid,(p_input->>'customerId')::uuid,p_input->>'status',nullif(p_input->>'statusId','')::uuid,p_input->>'action',nullif(p_input->>'actionId','')::uuid,nullif(p_input->>'dueAt','')::timestamptz,p_input->>'body',auth.uid(),now());
  UPDATE public.erp_customer_profiles SET payload=payload||jsonb_build_object('status',p_input->'status','statusId',p_input->'statusId'),revision=erp_customer_profiles.revision+1 WHERE cafe_id=p_cafe_id AND id=(p_input->>'customerId')::uuid;
  IF nullif(p_input->>'dueAt','') IS NOT NULL THEN INSERT INTO public.erp_customer_appointments(cafe_id,id,customer_id,series_id,starts_at,duration,action,action_id,notes,status) VALUES(p_cafe_id,gen_random_uuid(),(p_input->>'customerId')::uuid,rid,(p_input->>'dueAt')::timestamptz,30,p_input->>'action',nullif(p_input->>'actionId','')::uuid,p_input->>'body','scheduled');END IF;result:=jsonb_build_object('id',rid);
 ELSE RAISE EXCEPTION 'الإجراء غير صالح';END IF;
 INSERT INTO public.erp_customer_events(cafe_id,record_id,action,actor) VALUES(p_cafe_id,coalesce(rid,p_cafe_id),p_action,auth.uid());INSERT INTO erp_customer_private.requests VALUES(p_cafe_id,p_request,cmd,auth.uid(),result);RETURN result;
END $$;
CREATE FUNCTION public.erp_customers_import(p_cafe_id uuid,p_rows jsonb,p_match text,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old erp_customer_private.requests;cmd jsonb;row jsonb;input jsonb;party public.bf_parties;profile jsonb;detail jsonb;ids jsonb:='[]';result jsonb;k text;matches integer;index integer:=0;BEGIN
 PERFORM erp_customer_private.authorize(p_cafe_id,'create');IF p_request IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 100 OR octet_length(p_rows::text)>1048576 OR p_match NOT IN('none','code','email','phone') THEN RAISE EXCEPTION 'راجع ملف العملاء وخيار المطابقة';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,67950));cmd:=jsonb_build_object('action','import','rows',p_rows,'match',p_match);SELECT * INTO old FROM erp_customer_private.requests WHERE cafe_id=p_cafe_id AND id=p_request;
 IF FOUND THEN IF old.actor<>auth.uid() OR old.command<>cmd THEN RAISE EXCEPTION 'تعارض معرف الاستيراد' USING ERRCODE='40001';END IF;RETURN old.result;END IF;
 FOR row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  index:=index+1;party:=NULL;IF jsonb_typeof(row) IS DISTINCT FROM 'object' OR length(btrim(row->>'name')) NOT BETWEEN 1 AND 150 THEN RAISE EXCEPTION 'راجع اسم العميل في الصف %',index;END IF;
  IF p_match<>'none' AND nullif(btrim(row->>p_match),'') IS NOT NULL THEN
   SELECT count(*) INTO matches FROM public.bf_parties p LEFT JOIN public.erp_customer_profiles cp ON cp.cafe_id=p.cafe_id AND cp.id=p.id WHERE p.cafe_id=p_cafe_id AND p.kind='customer' AND CASE p_match WHEN 'code' THEN lower(cp.code)=lower(btrim(row->>'code')) WHEN 'email' THEN lower(p.email)=lower(btrim(row->>'email')) ELSE p.phone=btrim(row->>'phone') END;
   IF matches>1 THEN RAISE EXCEPTION 'المطابقة غير فريدة في الصف %',index;END IF;
   SELECT p.* INTO party FROM public.bf_parties p LEFT JOIN public.erp_customer_profiles cp ON cp.cafe_id=p.cafe_id AND cp.id=p.id WHERE p.cafe_id=p_cafe_id AND p.kind='customer' AND CASE p_match WHEN 'code' THEN lower(cp.code)=lower(btrim(row->>'code')) WHEN 'email' THEN lower(p.email)=lower(btrim(row->>'email')) ELSE p.phone=btrim(row->>'phone') END;
  END IF;
  profile:=CASE WHEN party.id IS NULL THEN jsonb_build_object('id',gen_random_uuid(),'revision',0,'fingerprint','','code','','categories','[]'::jsonb,'status','followup','statusId',NULL,'assignedUserId',NULL,'birthDate','','gender','','barcode','','website','','location',NULL,'creditLimit',NULL,'creditDays',NULL,'customValues','{}'::jsonb,'photoId',NULL) ELSE erp_customer_private.profile(party) END;
  detail:=coalesce(party.details- 'attachments','{"customerType":"individual","country":"SA","invoiceMethod":"print","currency":"SAR","language":"ar","contacts":"[]"}'::jsonb);
  FOR k IN SELECT jsonb_object_keys(row) LOOP IF k NOT IN('name','code','phone','email','taxNumber','firstName','lastName','telephone','city','district','street','buildingNumber','additionalNumber','postalCode','shortAddress','country','notes','commercialRegistration') THEN RAISE EXCEPTION 'عمود غير مدعوم';END IF;IF jsonb_typeof(row->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'قيمة الاستيراد غير نصية';END IF;IF k NOT IN('name','code','phone','email','taxNumber') THEN detail:=detail||jsonb_build_object(k,row->k);END IF;END LOOP;
  input:=profile||jsonb_build_object('name',row->'name','phone',coalesce(row->>'phone',party.phone,''),'email',coalesce(row->>'email',party.email,''),'taxNumber',coalesce(row->>'taxNumber',party.tax_number,''),'active',coalesce(party.active,true),'details',detail,'code',coalesce(row->>'code',profile->>'code',''));
  result:=erp_customer_private.save(p_cafe_id,input,gen_random_uuid());ids:=ids||jsonb_build_array(result->'id');
 END LOOP;
 result:=jsonb_build_object('ids',ids,'count',index);INSERT INTO erp_customer_private.requests VALUES(p_cafe_id,p_request,cmd,auth.uid(),result);INSERT INTO public.erp_customer_events(cafe_id,record_id,action,actor) VALUES(p_cafe_id,p_request,'import',auth.uid());RETURN result;
END $$;
-- Opt-in limits use the existing receivable ledger and source invoice outstanding state.
CREATE FUNCTION erp_customer_private.credit_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE cfg jsonb;p jsonb;balance numeric;BEGIN
 IF NEW.kind<>'sale' OR NEW.shift_id IS NOT NULL OR NEW.party_id IS NULL OR NEW.total<=NEW.paid THEN RETURN NEW;END IF;
 SELECT s.payload,c.payload INTO cfg,p FROM public.erp_customer_profiles c LEFT JOIN public.erp_customer_settings s ON s.cafe_id=c.cafe_id WHERE c.cafe_id=NEW.cafe_id AND c.id=NEW.party_id;IF p IS NULL THEN RETURN NEW;END IF;
 IF coalesce((cfg->>'creditLimit')::boolean,false) AND nullif(p->>'creditLimit','') IS NOT NULL THEN
  SELECT coalesce(sum(j.debit-j.credit),0) INTO balance FROM public.bf_journal j JOIN public.bf_accounts a ON a.cafe_id=j.cafe_id AND a.id=j.account_id WHERE j.cafe_id=NEW.cafe_id AND j.party_id=NEW.party_id AND a.kind='receivable';
  IF balance+NEW.total-NEW.paid>(p->>'creditLimit')::numeric THEN RAISE EXCEPTION 'الفاتورة تتجاوز الحد الائتماني للعميل';END IF;
 END IF;
 IF coalesce((cfg->>'creditDays')::boolean,false) AND nullif(p->>'creditDays','') IS NOT NULL AND EXISTS(SELECT 1 FROM public.bf_documents d WHERE d.cafe_id=NEW.cafe_id AND d.party_id=NEW.party_id AND d.kind='sale' AND (d.created_at AT TIME ZONE 'Asia/Riyadh')::date+(p->>'creditDays')::integer<(now() AT TIME ZONE 'Asia/Riyadh')::date AND (brand_finance_private.document_state(NEW.cafe_id,d.id)->>'outstanding')::numeric>0) THEN RAISE EXCEPTION 'للعميل فواتير تجاوزت المدة الائتمانية';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER erp_customer_credit_guard BEFORE INSERT ON public.bf_documents FOR EACH ROW EXECUTE FUNCTION erp_customer_private.credit_guard();
ALTER FUNCTION erp_file_private.assert_record(uuid,text,uuid,boolean) RENAME TO assert_record_before_customers;
CREATE FUNCTION erp_file_private.assert_record(p_cafe uuid,p_type text,p_record uuid,p_write boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE present boolean;BEGIN
 IF p_type<>'customer_profile' THEN PERFORM erp_file_private.assert_record_before_customers(p_cafe,p_type,p_record,p_write);RETURN;END IF;
 PERFORM erp_customer_private.authorize(p_cafe,CASE WHEN p_write THEN 'files' ELSE 'read' END);
 IF p_write THEN SELECT true INTO present FROM public.bf_parties WHERE cafe_id=p_cafe AND id=p_record AND kind='customer' FOR KEY SHARE;ELSE SELECT EXISTS(SELECT 1 FROM public.bf_parties WHERE cafe_id=p_cafe AND id=p_record AND kind='customer') INTO present;END IF;
 IF NOT coalesce(present,false) THEN RAISE EXCEPTION 'ملف العميل غير متاح' USING ERRCODE='42501';END IF;
END $$;
REVOKE ALL ON FUNCTION erp_file_private.assert_record(uuid,text,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER erp_customer_file_orphan_guard BEFORE DELETE ON public.bf_parties FOR EACH ROW WHEN(OLD.kind='customer') EXECUTE FUNCTION erp_file_private.prevent_orphans('customer_profile');
ALTER FUNCTION erp_access_private.file_domain(text) RENAME TO file_domain_before_customers;
CREATE FUNCTION erp_access_private.file_domain(p_type text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$SELECT CASE WHEN p_type='customer_profile' THEN 'customers' ELSE erp_access_private.file_domain_before_customers(p_type) END$$;
REVOKE ALL ON FUNCTION erp_access_private.file_domain(text),erp_access_private.file_domain_before_customers(text) FROM PUBLIC,anon,authenticated,service_role;
DO $$DECLARE definition text;BEGIN definition:=pg_get_functiondef('public.erp_file_delete_access(text)'::regprocedure);EXECUTE replace(definition,'public.erp_file_delete_access(','erp_customer_private.file_delete_access_before_customers(');END $$;
CREATE OR REPLACE FUNCTION public.erp_file_delete_access(p_path text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE f public.erp_files;BEGIN
 IF NOT erp_customer_private.file_delete_access_before_customers(p_path) THEN RETURN false;END IF;SELECT * INTO f FROM public.erp_files WHERE path=p_path FOR UPDATE;
 IF f.entity_type='customer_profile' AND EXISTS(SELECT 1 FROM public.erp_customer_profiles WHERE cafe_id=f.cafe_id AND id=f.record_id AND payload::text LIKE '%"'||f.id::text||'"%') THEN RETURN false;END IF;RETURN true;
EXCEPTION WHEN SQLSTATE '42501' OR SQLSTATE '22023' THEN RETURN false;END $$;
REVOKE ALL ON FUNCTION public.erp_file_delete_access(text) FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION public.erp_file_delete_access(text) TO authenticated;
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['erp_customer_settings','erp_customer_catalogs','erp_customer_profiles','erp_customer_appointments','erp_customer_followups','erp_customer_events'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;END $$;
ALTER TABLE erp_customer_private.requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_customer_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.erp_customers_read(uuid),public.erp_customers_write(uuid,text,jsonb,uuid),public.erp_customers_import(uuid,jsonb,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_customers_read(uuid),public.erp_customers_write(uuid,text,jsonb,uuid),public.erp_customers_import(uuid,jsonb,text,uuid) TO authenticated;
CREATE FUNCTION public.erp_customer_opening(p_cafe_id uuid,p_customer uuid,p_amount numeric,p_date date,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prior erp_customer_private.requests;cmd jsonb;doc uuid:=gen_random_uuid();balance_account uuid;equity uuid;result jsonb;BEGIN
 IF erp_customer_private.authorize(p_cafe_id,'approve')<>'owner' THEN RAISE EXCEPTION 'الرصيد الافتتاحي متاح للمالك فقط' USING ERRCODE='42501';END IF;IF p_request IS NULL OR p_amount IS NULL OR p_amount=0 OR abs(p_amount)>1e12 OR p_amount<>round(p_amount,2) OR p_date IS NULL THEN RAISE EXCEPTION 'راجع الرصيد الافتتاحي وتاريخه';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));cmd:=jsonb_build_object('action','opening','customer',p_customer,'amount',p_amount,'date',p_date);SELECT * INTO prior FROM erp_customer_private.requests WHERE cafe_id=p_cafe_id AND id=p_request;IF FOUND THEN IF prior.actor<>auth.uid() OR prior.command<>cmd THEN RAISE EXCEPTION 'تعارض معرف العملية';END IF;RETURN prior.result;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.erp_customer_settings WHERE cafe_id=p_cafe_id AND (payload->>'openingBalance')::boolean) THEN RAISE EXCEPTION 'فعّل الأرصدة الافتتاحية من إعدادات العملاء';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bf_parties WHERE cafe_id=p_cafe_id AND id=p_customer AND kind='customer' AND active) OR EXISTS(SELECT 1 FROM public.bf_journal WHERE cafe_id=p_cafe_id AND party_id=p_customer) THEN RAISE EXCEPTION 'الرصيد الافتتاحي متاح لعميل نشط دون حركات سابقة';END IF;
 IF EXISTS(SELECT 1 FROM public.bf_settings WHERE cafe_id=p_cafe_id AND closed_through IS NOT NULL AND p_date<=closed_through) THEN RAISE EXCEPTION 'الفترة المالية مغلقة';END IF;
 PERFORM brand_finance_private.seed(p_cafe_id);balance_account:=brand_finance_private.account(p_cafe_id,'1100');equity:=brand_finance_private.account(p_cafe_id,'3000');
 IF NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=balance_account AND kind='receivable' AND active) THEN SELECT id INTO balance_account FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND kind='receivable' AND active ORDER BY code LIMIT 1;END IF;
 IF balance_account IS NULL OR NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=equity AND kind='equity' AND active) THEN RAISE EXCEPTION 'حسابات الرصيد الافتتاحي غير متاحة';END IF;
 INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,total,note,created_at,created_by) VALUES(doc,p_cafe_id,'opening',p_customer,abs(p_amount),'رصيد افتتاحي للعميل',p_date::timestamptz,auth.uid());PERFORM brand_finance_private.line(p_cafe_id,doc,balance_account,greatest(p_amount,0),greatest(-p_amount,0),p_customer);PERFORM brand_finance_private.line(p_cafe_id,doc,equity,greatest(-p_amount,0),greatest(p_amount,0));
 result:=jsonb_build_object('id',doc);INSERT INTO erp_customer_private.requests VALUES(p_cafe_id,p_request,cmd,auth.uid(),result);INSERT INTO public.erp_customer_events(cafe_id,record_id,action,actor) VALUES(p_cafe_id,p_customer,'opening',auth.uid());RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.erp_customer_opening(uuid,uuid,numeric,date,uuid) FROM PUBLIC,anon,authenticated,service_role;GRANT EXECUTE ON FUNCTION public.erp_customer_opening(uuid,uuid,numeric,date,uuid) TO authenticated;

CREATE FUNCTION public.erp_customer_statement(p_cafe_id uuid,p_customer uuid,p_from date DEFAULT NULL,p_to date DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;BEGIN PERFORM erp_customer_private.authorize(p_cafe_id,'read');IF p_from>p_to OR NOT EXISTS(SELECT 1 FROM public.bf_parties WHERE cafe_id=p_cafe_id AND id=p_customer AND kind='customer') THEN RAISE EXCEPTION 'راجع العميل والفترة';END IF;
 WITH balances AS MATERIALIZED(SELECT j.id,d.created_at AS date,d.number,d.kind,j.memo,j.debit,j.credit,sum(j.debit-j.credit) OVER(ORDER BY d.created_at,j.created_at,j.id ROWS UNBOUNDED PRECEDING) AS balance FROM public.bf_journal j JOIN public.bf_accounts a ON a.cafe_id=j.cafe_id AND a.id=j.account_id AND a.kind='receivable' JOIN public.bf_documents d ON d.cafe_id=j.cafe_id AND d.id=j.document_id WHERE j.cafe_id=p_cafe_id AND j.party_id=p_customer) SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(x)-'id' ORDER BY x.date,x.id) FROM balances x WHERE (p_from IS NULL OR x.date::date>=p_from) AND (p_to IS NULL OR x.date::date<=p_to)),'[]'),'opening',coalesce((SELECT sum(debit-credit) FROM balances WHERE p_from IS NOT NULL AND date::date<p_from),0),'balance',coalesce((SELECT sum(debit-credit) FROM balances WHERE p_to IS NULL OR date::date<=p_to),0)) INTO result;RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.erp_customer_statement(uuid,uuid,date,date) FROM PUBLIC,anon,authenticated,service_role;GRANT EXECUTE ON FUNCTION public.erp_customer_statement(uuid,uuid,date,date) TO authenticated;

CREATE FUNCTION erp_customer_private.protect_file_reference() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$BEGIN IF OLD.entity_type='customer_profile' AND EXISTS(SELECT 1 FROM public.erp_customer_profiles WHERE cafe_id=OLD.cafe_id AND id=OLD.record_id AND payload::text LIKE '%"'||OLD.id::text||'"%') THEN RAISE EXCEPTION 'أزل ربط الصورة أو الحقل بالملف قبل حذفه';END IF;RETURN OLD;END $$;
CREATE TRIGGER erp_customer_file_reference BEFORE DELETE ON public.erp_files FOR EACH ROW EXECUTE FUNCTION erp_customer_private.protect_file_reference();
REVOKE ALL ON FUNCTION erp_customer_private.protect_file_reference() FROM PUBLIC,anon,authenticated,service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
