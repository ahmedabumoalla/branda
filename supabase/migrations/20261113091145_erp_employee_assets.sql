BEGIN;
CREATE SCHEMA erp_employee_asset_private;
REVOKE ALL ON SCHEMA erp_employee_asset_private FROM PUBLIC,anon,authenticated;
CREATE TABLE public.erp_employee_asset_types(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 150),description text NOT NULL DEFAULT '' CHECK(length(description)<=4000),active boolean NOT NULL DEFAULT true,revision integer NOT NULL DEFAULT 1,UNIQUE(cafe_id,id),UNIQUE(cafe_id,name));
CREATE TABLE public.erp_employee_assets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 150),code text NOT NULL CHECK(length(btrim(code)) BETWEEN 1 AND 60),financial_unit_id uuid,type_id uuid,location_id uuid NOT NULL,
 holder_kind text NOT NULL DEFAULT 'unassigned' CHECK(holder_kind IN('unassigned','employee','warehouse')),holder_user_id uuid REFERENCES auth.users(id),status text NOT NULL DEFAULT 'available' CHECK(status IN('available','assigned','maintenance','stopped','retired')),
 serial text NOT NULL DEFAULT '' CHECK(length(serial)<=100),barcode text NOT NULL DEFAULT '' CHECK(length(barcode)<=100),warranty_on date,description text NOT NULL DEFAULT '' CHECK(length(description)<=4000),specifications text NOT NULL DEFAULT '' CHECK(length(specifications)<=10000),photo_id uuid,assigned_at timestamptz,expected_return_on date,maintenance_previous jsonb,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(cafe_id,id),UNIQUE(cafe_id,code),UNIQUE(cafe_id,financial_unit_id),FOREIGN KEY(cafe_id,financial_unit_id) REFERENCES public.erp_asset_units(cafe_id,id),FOREIGN KEY(cafe_id,type_id) REFERENCES public.erp_employee_asset_types(cafe_id,id),FOREIGN KEY(cafe_id,location_id) REFERENCES public.erp_asset_locations(cafe_id,id),FOREIGN KEY(cafe_id,photo_id) REFERENCES public.erp_files(cafe_id,id),CHECK((holder_kind='employee')=(holder_user_id IS NOT NULL)));
CREATE INDEX erp_employee_assets_history ON public.erp_employee_assets(cafe_id,updated_at DESC,id);
CREATE INDEX erp_employee_assets_holder ON public.erp_employee_assets(cafe_id,holder_user_id);
CREATE INDEX erp_employee_assets_type ON public.erp_employee_assets(cafe_id,type_id);
CREATE INDEX erp_employee_assets_location ON public.erp_employee_assets(cafe_id,location_id);
CREATE UNIQUE INDEX erp_employee_assets_serial ON public.erp_employee_assets(cafe_id,serial) WHERE serial<>'';
CREATE TABLE public.erp_employee_asset_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),record_id uuid NOT NULL,action text NOT NULL,effective_at timestamptz NOT NULL,note text NOT NULL DEFAULT '' CHECK(length(note)<=20000),before_state jsonb NOT NULL DEFAULT '{}',after_state jsonb NOT NULL DEFAULT '{}',actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX erp_employee_asset_events_record ON public.erp_employee_asset_events(cafe_id,record_id,created_at);
CREATE TRIGGER erp_employee_asset_events_immutable BEFORE UPDATE OR DELETE ON public.erp_employee_asset_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TABLE erp_employee_asset_private.requests(cafe_id uuid NOT NULL REFERENCES public.cafes(id),request_id uuid NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),PRIMARY KEY(cafe_id,request_id));
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['erp_employee_assets','erp_employee_asset_types','erp_employee_asset_events'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;END $$;
ALTER TABLE erp_employee_asset_private.requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_employee_asset_private.requests FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_employee_asset_private.authorize(p_cafe uuid,p_write boolean DEFAULT false) RETURNS text LANGUAGE plpgsql SET search_path='' AS $$ DECLARE r text;BEGIN r:=brand_finance_private.role_for(p_cafe);IF NOT coalesce(r IN('owner','manager','accountant','auditor'),false) OR (p_write AND r NOT IN('owner','manager')) THEN RAISE EXCEPTION 'لا تملك صلاحية عهد الموظفين' USING ERRCODE='42501';END IF;RETURN r;END $$;
CREATE FUNCTION erp_employee_asset_private.staff(p_cafe uuid,p_user uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_user AND p.status='active') AND (EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND owner_user_id=p_user) OR EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=p_cafe AND user_id=p_user AND active)) $$;
CREATE FUNCTION erp_employee_asset_private.staff_options(p_cafe uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$ SELECT coalesce(jsonb_agg(x ORDER BY name),'[]') FROM(SELECT user_id id,name FROM public.bf_staff WHERE cafe_id=p_cafe AND active UNION ALL SELECT owner_user_id,'مالك العلامة' FROM public.cafes c WHERE id=p_cafe AND NOT EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=p_cafe AND user_id=c.owner_user_id AND active))x $$;
CREATE FUNCTION erp_employee_asset_private.validate_holder(p_cafe uuid,p_kind text,p_user uuid,p_location uuid,p_assigned timestamptz,p_return date) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF p_kind NOT IN('unassigned','employee','warehouse') OR NOT EXISTS(SELECT 1 FROM public.erp_asset_locations WHERE cafe_id=p_cafe AND id=p_location) THEN RAISE EXCEPTION 'اختر نوع الحفظ والموقع الفعلي';END IF;
 IF p_kind='employee' AND NOT erp_employee_asset_private.staff(p_cafe,p_user) THEN RAISE EXCEPTION 'الموظف غير متاح في هذه العلامة';END IF;
 IF p_assigned IS NOT NULL AND (NOT isfinite(p_assigned) OR p_assigned>now()+interval '5 minutes') THEN RAISE EXCEPTION 'تاريخ التعيين غير صالح';END IF;
 IF p_return IS NOT NULL AND (NOT isfinite(p_return) OR p_return<(coalesce(p_assigned,now()) AT TIME ZONE 'Asia/Riyadh')::date) THEN RAISE EXCEPTION 'تاريخ الإرجاع المتوقع يسبق التعيين';END IF;
END $$;
CREATE FUNCTION public.erp_employee_asset_act(p_cafe uuid,p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.erp_employee_assets;before_row jsonb;req uuid:=(p_command->>'requestId')::uuid;prior erp_employee_asset_private.requests;rid uuid:=(p_command->>'id')::uuid;op text:=p_command->>'action';effective timestamptz:=(p_command->>'effectiveAt')::timestamptz;note text:=coalesce(p_command->>'note','');loc uuid;person uuid;kind text;expected date;assigned timestamptz;result jsonb;BEGIN
 PERFORM erp_employee_asset_private.authorize(p_cafe,true);PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,60412));
 IF req IS NULL OR effective IS NULL OR NOT isfinite(effective) OR effective>now()+interval '5 minutes' OR length(note)>20000 OR octet_length(p_command::text)>65536 THEN RAISE EXCEPTION 'بيانات الحركة أو تاريخها غير صالحة';END IF;
 SELECT * INTO prior FROM erp_employee_asset_private.requests WHERE cafe_id=p_cafe AND request_id=req;IF FOUND THEN IF prior.payload<>p_command OR prior.actor_id<>auth.uid() THEN RAISE EXCEPTION 'تعارض معرف الطلب';END IF;RETURN prior.result||'{"duplicate":true}';END IF;
 SELECT * INTO a FROM public.erp_employee_assets WHERE cafe_id=p_cafe AND id=rid FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'الأصل غير موجود' USING ERRCODE='42501';END IF;IF a.revision IS DISTINCT FROM (p_command->>'revision')::integer THEN RAISE EXCEPTION 'تغير الأصل أعد تحميل الصفحة' USING ERRCODE='40001';END IF;before_row:=to_jsonb(a)-'cafe_id'-'created_by';
 IF op<>'note' AND effective<(SELECT max(effective_at) FROM public.erp_employee_asset_events WHERE cafe_id=p_cafe AND record_id=rid AND action NOT IN('note','edit')) THEN RAISE EXCEPTION 'تاريخ الحركة يسبق آخر حركة عهدة';END IF;
 IF a.status='retired' AND op<>'note' THEN RAISE EXCEPTION 'الأصل مستبعد محاسبيًا';END IF;
 CASE op
 WHEN 'assign' THEN
  IF a.status NOT IN('available','assigned') THEN RAISE EXCEPTION 'الأصل غير متاح للتعيين';END IF;
  kind:=p_command->>'holderKind';person:=nullif(p_command->>'holderUserId','')::uuid;loc:=nullif(p_command->>'locationId','')::uuid;expected:=nullif(p_command->>'expectedReturnOn','')::date;
  IF kind NOT IN('employee','warehouse') THEN RAISE EXCEPTION 'اختر الموظف أو المخزن';END IF;PERFORM erp_employee_asset_private.validate_holder(p_cafe,kind,person,loc,effective,expected);
  UPDATE public.erp_employee_assets SET holder_kind=kind,holder_user_id=CASE WHEN kind='employee' THEN person END,location_id=loc,status='assigned',assigned_at=effective,expected_return_on=expected WHERE cafe_id=p_cafe AND id=rid;
 WHEN 'return' THEN
  IF a.status<>'assigned' THEN RAISE EXCEPTION 'لا توجد عهدة مخصصة للإرجاع';END IF;loc:=coalesce(nullif(p_command->>'locationId','')::uuid,a.location_id);PERFORM erp_employee_asset_private.validate_holder(p_cafe,'unassigned',null,loc,null,null);
  UPDATE public.erp_employee_assets SET holder_kind='unassigned',holder_user_id=null,location_id=loc,status='available',assigned_at=null,expected_return_on=null WHERE cafe_id=p_cafe AND id=rid;
 WHEN 'maintenance' THEN
  IF a.status NOT IN('available','assigned') THEN RAISE EXCEPTION 'الأصل غير متاح للصيانة';END IF;IF btrim(note)='' THEN RAISE EXCEPTION 'أدخل ملاحظة الصيانة';END IF;
  UPDATE public.erp_employee_assets SET maintenance_previous=before_row,holder_kind='unassigned',holder_user_id=null,status='maintenance',assigned_at=null,expected_return_on=null WHERE cafe_id=p_cafe AND id=rid;
 WHEN 'restore_maintenance' THEN
  IF a.status<>'maintenance' THEN RAISE EXCEPTION 'الأصل ليس في الصيانة';END IF;IF btrim(note)='' THEN RAISE EXCEPTION 'أدخل ملاحظة انتهاء الصيانة';END IF;
  IF coalesce((p_command->>'restorePrevious')::boolean,true) THEN kind:=coalesce(a.maintenance_previous->>'holder_kind','unassigned');person:=(a.maintenance_previous->>'holder_user_id')::uuid;loc:=coalesce((a.maintenance_previous->>'location_id')::uuid,a.location_id);assigned:=(a.maintenance_previous->>'assigned_at')::timestamptz;expected:=(a.maintenance_previous->>'expected_return_on')::date;
  ELSE kind:='unassigned';loc:=a.location_id;END IF;PERFORM erp_employee_asset_private.validate_holder(p_cafe,kind,person,loc,assigned,expected);
  UPDATE public.erp_employee_assets SET holder_kind=kind,holder_user_id=CASE WHEN kind='employee' THEN person END,location_id=loc,status=CASE WHEN kind='unassigned' THEN 'available' ELSE 'assigned' END,assigned_at=assigned,expected_return_on=expected,maintenance_previous=null WHERE cafe_id=p_cafe AND id=rid;
 WHEN 'stop' THEN IF a.status<>'available' THEN RAISE EXCEPTION 'أرجع العهدة قبل إيقاف الأصل';END IF;UPDATE public.erp_employee_assets SET status='stopped' WHERE cafe_id=p_cafe AND id=rid;
 WHEN 'resume' THEN IF a.status<>'stopped' THEN RAISE EXCEPTION 'الأصل ليس متوقفًا';END IF;UPDATE public.erp_employee_assets SET status='available' WHERE cafe_id=p_cafe AND id=rid;
 WHEN 'note' THEN IF btrim(note)='' THEN RAISE EXCEPTION 'أدخل الملاحظة';END IF;
 WHEN 'delete' THEN IF a.status<>'available' OR EXISTS(SELECT 1 FROM public.erp_employee_asset_events WHERE cafe_id=p_cafe AND record_id=rid AND action NOT IN('create','edit','note')) THEN RAISE EXCEPTION 'لا يمكن حذف أصل له حركات عهدة';END IF;DELETE FROM public.erp_employee_assets WHERE cafe_id=p_cafe AND id=rid;
 ELSE RAISE EXCEPTION 'حركة العهدة غير مدعومة';END CASE;
 IF op<>'delete' THEN UPDATE public.erp_employee_assets SET revision=revision+1,updated_at=now() WHERE cafe_id=p_cafe AND id=rid;END IF;
 INSERT INTO public.erp_employee_asset_events(cafe_id,record_id,action,effective_at,note,before_state,after_state,actor_id) VALUES(p_cafe,rid,op,effective,note,before_row,coalesce((SELECT to_jsonb(x)-'cafe_id'-'created_by' FROM public.erp_employee_assets x WHERE cafe_id=p_cafe AND id=rid),'{}'),auth.uid());
 result:=jsonb_build_object('id',rid,'revision',coalesce((SELECT revision FROM public.erp_employee_assets WHERE cafe_id=p_cafe AND id=rid),a.revision+1),'deleted',op='delete');INSERT INTO erp_employee_asset_private.requests VALUES(p_cafe,req,p_command,result,auth.uid());RETURN result;
END $$;
CREATE FUNCTION public.erp_employee_asset_type(p_cafe uuid,p_payload jsonb,p_id uuid DEFAULT null,p_revision integer DEFAULT 0,p_delete boolean DEFAULT false,p_request uuid DEFAULT gen_random_uuid()) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old public.erp_employee_asset_types;rid uuid:=coalesce(p_id,gen_random_uuid());req jsonb:=jsonb_build_object('type',p_payload,'id',p_id,'revision',p_revision,'delete',p_delete);prior erp_employee_asset_private.requests;result jsonb;BEGIN
 PERFORM erp_employee_asset_private.authorize(p_cafe,true);PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,60412));IF p_request IS NULL OR octet_length(p_payload::text)>10000 THEN RAISE EXCEPTION 'بيانات النوع غير صالحة';END IF;
 SELECT * INTO prior FROM erp_employee_asset_private.requests WHERE cafe_id=p_cafe AND request_id=p_request;IF FOUND THEN IF prior.payload<>req OR prior.actor_id<>auth.uid() THEN RAISE EXCEPTION 'تعارض معرف الطلب';END IF;RETURN prior.result||'{"duplicate":true}';END IF;
 IF p_id IS NOT NULL THEN SELECT * INTO old FROM public.erp_employee_asset_types WHERE cafe_id=p_cafe AND id=p_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'نوع الأصل غير موجود' USING ERRCODE='42501';END IF;IF old.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'تغير نوع الأصل أعد تحميل الصفحة' USING ERRCODE='40001';END IF;END IF;
 IF p_delete THEN IF p_id IS NULL THEN RAISE EXCEPTION 'اختر نوع الأصل';END IF;DELETE FROM public.erp_employee_asset_types WHERE cafe_id=p_cafe AND id=p_id;
 ELSIF p_id IS NULL THEN INSERT INTO public.erp_employee_asset_types(id,cafe_id,name,description,active) VALUES(rid,p_cafe,btrim(p_payload->>'name'),coalesce(p_payload->>'description',''),coalesce((p_payload->>'active')::boolean,true));
 ELSE UPDATE public.erp_employee_asset_types SET name=btrim(p_payload->>'name'),description=coalesce(p_payload->>'description',''),active=coalesce((p_payload->>'active')::boolean,true),revision=revision+1 WHERE cafe_id=p_cafe AND id=rid;END IF;
 result:=jsonb_build_object('id',rid,'deleted',p_delete);INSERT INTO erp_employee_asset_private.requests VALUES(p_cafe,p_request,req,result,auth.uid());RETURN result;
END $$;
CREATE FUNCTION public.erp_employee_asset_read(p_cafe uuid,p_id uuid DEFAULT null,p_query text DEFAULT '',p_employee uuid DEFAULT null,p_page integer DEFAULT 1) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role text;BEGIN role:=erp_employee_asset_private.authorize(p_cafe);IF p_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_employee_assets WHERE cafe_id=p_cafe AND id=p_id) THEN RAISE EXCEPTION 'الأصل غير موجود' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('canWrite',role IN('owner','manager'),
 'records',coalesce((SELECT jsonb_agg(x ORDER BY updated_at DESC,id) FROM(SELECT * FROM public.erp_employee_assets WHERE cafe_id=p_cafe AND (p_id IS NULL OR id=p_id) AND (p_employee IS NULL OR holder_user_id=p_employee) AND (p_query='' OR name ILIKE '%'||left(p_query,150)||'%' OR code ILIKE '%'||left(p_query,150)||'%' OR serial ILIKE '%'||left(p_query,150)||'%') ORDER BY updated_at DESC,id LIMIT 50 OFFSET (least(greatest(coalesce(p_page,1),1),100000)-1)*50)x),'[]'),
 'total',(SELECT count(*) FROM public.erp_employee_assets WHERE cafe_id=p_cafe AND (p_id IS NULL OR id=p_id) AND (p_employee IS NULL OR holder_user_id=p_employee) AND (p_query='' OR name ILIKE '%'||left(p_query,150)||'%' OR code ILIKE '%'||left(p_query,150)||'%' OR serial ILIKE '%'||left(p_query,150)||'%')),
 'types',coalesce((SELECT jsonb_agg(x ORDER BY name) FROM(SELECT * FROM public.erp_employee_asset_types WHERE cafe_id=p_cafe)x),'[]'),
 'locations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name) FROM public.erp_asset_locations WHERE cafe_id=p_cafe),'[]'),
 'staff',erp_employee_asset_private.staff_options(p_cafe),
 'financialUnits',coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'asset_id',a.id,'name',a.name,'code',a.code,'serial',u.serial,'barcode',u.barcode,'employee_id',u.employee_id,'location_id',u.location_id,'description',u.description,'value',(a.gross_value-a.accumulated_depreciation)/greatest(a.remaining_quantity,1),'linked_id',e.id) ORDER BY a.name,u.unit_index) FROM public.erp_asset_units u JOIN public.erp_assets a ON a.cafe_id=u.cafe_id AND a.id=u.asset_id LEFT JOIN public.erp_employee_assets e ON e.cafe_id=u.cafe_id AND e.financial_unit_id=u.id WHERE u.cafe_id=p_cafe AND u.status='in_service'),'[]'),
 'events',CASE WHEN p_id IS NULL THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(to_jsonb(e)||jsonb_build_object('actor_name',coalesce(s.name,'مالك العلامة')) ORDER BY e.created_at DESC,e.id) FROM public.erp_employee_asset_events e LEFT JOIN public.bf_staff s ON s.cafe_id=e.cafe_id AND s.user_id=e.actor_id WHERE e.cafe_id=p_cafe AND e.record_id=p_id),'[]') END);
END $$;
CREATE FUNCTION public.erp_employee_asset_save(p_cafe uuid,p_payload jsonb,p_id uuid DEFAULT NULL,p_revision integer DEFAULT 0,p_request uuid DEFAULT gen_random_uuid()) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old public.erp_employee_assets;unit public.erp_asset_units;rid uuid:=coalesce(p_id,gen_random_uuid());prior erp_employee_asset_private.requests;req jsonb;result jsonb;photo uuid:=nullif(p_payload->>'photoId','')::uuid;holder text:=p_payload->>'holderKind';person uuid:=nullif(p_payload->>'holderUserId','')::uuid;location uuid:=(p_payload->>'locationId')::uuid;assigned timestamptz:=nullif(p_payload->>'assignedAt','')::timestamptz;expected date:=nullif(p_payload->>'expectedReturnOn','')::date;linked uuid:=nullif(p_payload->>'financialUnitId','')::uuid;typeid uuid:=nullif(p_payload->>'typeId','')::uuid;BEGIN
 PERFORM erp_employee_asset_private.authorize(p_cafe,true);PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,60412));
 IF p_request IS NULL OR coalesce(jsonb_typeof(p_payload),'')<>'object' OR octet_length(p_payload::text)>65536 THEN RAISE EXCEPTION 'بيانات الأصل غير صالحة';END IF;
 req:=jsonb_build_object('save',p_payload,'id',p_id,'revision',p_revision);SELECT * INTO prior FROM erp_employee_asset_private.requests WHERE cafe_id=p_cafe AND request_id=p_request;
 IF FOUND THEN IF prior.payload<>req OR prior.actor_id<>auth.uid() THEN RAISE EXCEPTION 'تعارض معرف الطلب';END IF;RETURN prior.result||'{"duplicate":true}';END IF;
 IF p_id IS NOT NULL THEN SELECT * INTO old FROM public.erp_employee_assets WHERE cafe_id=p_cafe AND id=p_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'الأصل غير موجود' USING ERRCODE='42501';END IF;IF old.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'تغير الأصل أعد تحميل الصفحة' USING ERRCODE='40001';END IF;
  IF old.status='retired' OR old.financial_unit_id IS DISTINCT FROM linked THEN RAISE EXCEPTION 'لا تعدل ارتباط الأصل المحاسبي بعد إنشاء العهدة';END IF;
  IF old.holder_kind IS DISTINCT FROM holder OR old.holder_user_id IS DISTINCT FROM (CASE WHEN holder='employee' THEN person END) OR old.location_id IS DISTINCT FROM location OR old.assigned_at IS DISTINCT FROM assigned OR old.expected_return_on IS DISTINCT FROM expected THEN RAISE EXCEPTION 'استخدم تعيين الأصل أو إرجاع العهدة لتغيير معلومات الحفظ';END IF;
 END IF;
 PERFORM erp_employee_asset_private.validate_holder(p_cafe,holder,person,location,assigned,expected);
 IF typeid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_employee_asset_types WHERE cafe_id=p_cafe AND id=typeid AND (active OR old.type_id=typeid)) THEN RAISE EXCEPTION 'نوع الأصل غير موجود أو غير نشط';END IF;
 IF linked IS NOT NULL THEN SELECT * INTO unit FROM public.erp_asset_units WHERE cafe_id=p_cafe AND id=linked FOR UPDATE;IF NOT FOUND OR unit.status<>'in_service' THEN RAISE EXCEPTION 'الوحدة المحاسبية غير متاحة';END IF;END IF;
 IF photo IS NOT NULL THEN
  PERFORM 1 FROM public.erp_files f WHERE f.cafe_id=p_cafe AND f.entity_type='employee_asset' AND f.record_id=p_id AND f.id=photo AND f.uploaded AND f.mime IN('image/jpeg','image/png') AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='erp-record-files' AND o.name=f.path) FOR KEY SHARE OF f;
  IF NOT FOUND THEN RAISE EXCEPTION 'اختر صورة محفوظة ومتاحة لهذا الأصل';END IF;
 END IF;
 IF p_id IS NULL THEN INSERT INTO public.erp_employee_assets(id,cafe_id,name,code,financial_unit_id,type_id,location_id,holder_kind,holder_user_id,status,serial,barcode,warranty_on,description,specifications,photo_id,assigned_at,expected_return_on,created_by) VALUES(rid,p_cafe,btrim(p_payload->>'name'),btrim(p_payload->>'code'),linked,typeid,location,holder,CASE WHEN holder='employee' THEN person END,CASE WHEN holder='unassigned' THEN 'available' ELSE 'assigned' END,coalesce(p_payload->>'serial',''),coalesce(p_payload->>'barcode',''),nullif(p_payload->>'warrantyOn','')::date,coalesce(p_payload->>'description',''),coalesce(p_payload->>'specifications',''),photo,CASE WHEN holder<>'unassigned' THEN coalesce(assigned,now()) END,expected,auth.uid());
 ELSE UPDATE public.erp_employee_assets SET name=btrim(p_payload->>'name'),code=btrim(p_payload->>'code'),type_id=typeid,serial=coalesce(p_payload->>'serial',''),barcode=coalesce(p_payload->>'barcode',''),warranty_on=nullif(p_payload->>'warrantyOn','')::date,description=coalesce(p_payload->>'description',''),specifications=coalesce(p_payload->>'specifications',''),photo_id=photo,revision=revision+1,updated_at=now() WHERE cafe_id=p_cafe AND id=rid;END IF;
 INSERT INTO public.erp_employee_asset_events(cafe_id,record_id,action,effective_at,before_state,after_state,actor_id) SELECT p_cafe,rid,CASE WHEN p_id IS NULL THEN 'create' ELSE 'edit' END,now(),coalesce(to_jsonb(old)-'cafe_id'-'created_by','{}'),to_jsonb(a)-'cafe_id'-'created_by',auth.uid() FROM public.erp_employee_assets a WHERE cafe_id=p_cafe AND id=rid;
 SELECT jsonb_build_object('id',rid,'revision',revision) INTO result FROM public.erp_employee_assets WHERE cafe_id=p_cafe AND id=rid;INSERT INTO erp_employee_asset_private.requests VALUES(p_cafe,p_request,req,result,auth.uid());RETURN result;
END $$;
-- A physical accounting unit may have one custody record; accounting stays the source of value
ALTER TABLE public.erp_asset_units DROP CONSTRAINT erp_asset_units_cafe_id_employee_id_fkey;
ALTER TABLE public.erp_asset_units ADD CONSTRAINT erp_asset_units_employee_user FOREIGN KEY(employee_id) REFERENCES auth.users(id);
CREATE FUNCTION erp_employee_asset_private.unit_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE linked public.erp_employee_assets;BEGIN
 IF NEW.employee_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.employee_id IS DISTINCT FROM OLD.employee_id) AND NOT erp_employee_asset_private.staff(NEW.cafe_id,NEW.employee_id) THEN RAISE EXCEPTION 'الموظف غير متاح في هذه العلامة';END IF;
 IF TG_OP='UPDATE' THEN SELECT * INTO linked FROM public.erp_employee_assets WHERE cafe_id=NEW.cafe_id AND financial_unit_id=NEW.id;
  IF FOUND AND NEW.status='disposed' AND OLD.status<>'disposed' AND linked.status IN('assigned','maintenance') THEN RAISE EXCEPTION 'أرجع العهدة وأنهِ الصيانة قبل الاستبعاد المحاسبي';END IF;
  IF FOUND AND pg_trigger_depth()=1 AND ROW(NEW.serial,NEW.barcode,NEW.employee_id,NEW.location_id,NEW.description) IS DISTINCT FROM ROW(OLD.serial,OLD.barcode,OLD.employee_id,OLD.location_id,OLD.description) THEN RAISE EXCEPTION 'عدل بيانات الوحدة المرتبطة من عهد الموظفين';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER erp_employee_asset_unit_guard BEFORE INSERT OR UPDATE ON public.erp_asset_units FOR EACH ROW EXECUTE FUNCTION erp_employee_asset_private.unit_guard();
CREATE FUNCTION erp_employee_asset_private.sync_unit() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE aid uuid;BEGIN
 IF NEW.financial_unit_id IS NULL OR NEW.status='retired' THEN RETURN NEW;END IF;
 UPDATE public.erp_asset_units SET serial=NEW.serial,barcode=NEW.barcode,employee_id=NEW.holder_user_id,location_id=NEW.location_id,description=NEW.description WHERE cafe_id=NEW.cafe_id AND id=NEW.financial_unit_id AND ROW(serial,barcode,employee_id,location_id,description) IS DISTINCT FROM ROW(NEW.serial,NEW.barcode,NEW.holder_user_id,NEW.location_id,NEW.description) RETURNING asset_id INTO aid;
 IF aid IS NOT NULL THEN UPDATE public.erp_assets a SET payload=jsonb_set(jsonb_set(a.payload,'{individualUnits}','true'),'{units}',(SELECT jsonb_agg(jsonb_build_object('serial',u.serial,'barcode',u.barcode,'employeeId',coalesce(u.employee_id::text,''),'locationId',coalesce(u.location_id::text,''),'description',u.description) ORDER BY u.unit_index) FROM public.erp_asset_units u WHERE u.cafe_id=a.cafe_id AND u.asset_id=a.id)),revision=revision+1,updated_at=now() WHERE cafe_id=NEW.cafe_id AND id=aid;END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER erp_employee_asset_sync AFTER INSERT OR UPDATE ON public.erp_employee_assets FOR EACH ROW EXECUTE FUNCTION erp_employee_asset_private.sync_unit();
CREATE FUNCTION erp_employee_asset_private.disposed_unit() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.erp_employee_assets;BEGIN
 IF NEW.status='disposed' AND OLD.status<>'disposed' THEN SELECT * INTO a FROM public.erp_employee_assets WHERE cafe_id=NEW.cafe_id AND financial_unit_id=NEW.id FOR UPDATE;
 IF FOUND THEN UPDATE public.erp_employee_assets SET status='retired',revision=revision+1,updated_at=now() WHERE cafe_id=a.cafe_id AND id=a.id;
 INSERT INTO public.erp_employee_asset_events(cafe_id,record_id,action,effective_at,note,before_state,after_state,actor_id) SELECT a.cafe_id,a.id,'financial_disposal',now(),'استبعاد الوحدة المرتبطة من الحسابات العامة',to_jsonb(a),to_jsonb(x),auth.uid() FROM public.erp_employee_assets x WHERE cafe_id=a.cafe_id AND id=a.id;END IF;END IF;RETURN NEW;
END $$;
CREATE TRIGGER erp_employee_asset_disposal AFTER UPDATE OF status ON public.erp_asset_units FOR EACH ROW EXECUTE FUNCTION erp_employee_asset_private.disposed_unit();
CREATE FUNCTION erp_employee_asset_private.production_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NEW.action='manufacturing_depreciation' AND EXISTS(SELECT 1 FROM public.erp_employee_assets c JOIN public.erp_asset_units u ON u.cafe_id=c.cafe_id AND u.id=c.financial_unit_id WHERE u.cafe_id=NEW.cafe_id AND u.asset_id=NEW.asset_id AND c.status IN('maintenance','stopped')) THEN RAISE EXCEPTION 'الأصل المرتبط بالإنتاج متوقف أو قيد الصيانة';END IF;RETURN NEW;
END $$;
CREATE TRIGGER erp_employee_asset_production BEFORE INSERT ON public.erp_asset_events FOR EACH ROW EXECUTE FUNCTION erp_employee_asset_private.production_guard();
-- Preserve newer attachment types and accounting logic when extending their lookups
DO $$ DECLARE src text;updated text;BEGIN
 SELECT pg_get_functiondef('erp_file_private.assert_record(uuid,text,uuid,boolean)'::regprocedure) INTO src;
 updated:=replace(src,'WHEN ''asset'' THEN ''erp_assets''','WHEN ''asset'' THEN ''erp_assets'' WHEN ''employee_asset'' THEN ''erp_employee_assets''');IF updated=src THEN RAISE EXCEPTION 'Attachment asset anchor missing';END IF;EXECUTE updated;
 SELECT pg_get_functiondef('erp_asset_private.validate(uuid,jsonb)'::regprocedure) INTO src;
 updated:=replace(src,'NOT EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=p_cafe AND user_id=(x->>''employeeId'')::uuid AND active)','NOT erp_employee_asset_private.staff(p_cafe,(x->>''employeeId'')::uuid)');IF updated=src THEN RAISE EXCEPTION 'Accounting employee validation anchor missing';END IF;EXECUTE updated;
 SELECT pg_get_functiondef('public.erp_asset_read(uuid,uuid,text,text,integer)'::regprocedure) INTO src;
 updated:=replace(src,'coalesce((SELECT jsonb_agg(jsonb_build_object(''id'',user_id,''name'',name)) FROM public.bf_staff WHERE cafe_id=p_cafe AND active),''[]'')','erp_employee_asset_private.staff_options(p_cafe)');IF updated=src THEN RAISE EXCEPTION 'Accounting employee lookup anchor missing';END IF;EXECUTE updated;
END $$;
CREATE TRIGGER erp_file_orphan_guard BEFORE DELETE ON public.erp_employee_assets FOR EACH ROW EXECUTE FUNCTION erp_file_private.prevent_orphans('employee_asset');
DO $$ DECLARE src text;updated text;BEGIN
 SELECT pg_get_functiondef('public.erp_file_delete_access(text)'::regprocedure) INTO src;
 updated:=replace(src,'WHERE path=p_path;','WHERE path=p_path FOR UPDATE;');
 updated:=replace(updated,'RETURN true;','IF f.entity_type=''employee_asset'' AND EXISTS(SELECT 1 FROM public.erp_employee_assets WHERE cafe_id=f.cafe_id AND photo_id=f.id) THEN RETURN false;END IF; RETURN true;');
 IF updated=src THEN RAISE EXCEPTION 'Attachment delete guard anchor missing';END IF;EXECUTE updated;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_employee_asset_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.erp_employee_asset_read(uuid,uuid,text,uuid,integer),public.erp_employee_asset_save(uuid,jsonb,uuid,integer,uuid),public.erp_employee_asset_act(uuid,jsonb),public.erp_employee_asset_type(uuid,jsonb,uuid,integer,boolean,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.erp_employee_asset_read(uuid,uuid,text,uuid,integer),public.erp_employee_asset_save(uuid,jsonb,uuid,integer,uuid),public.erp_employee_asset_act(uuid,jsonb),public.erp_employee_asset_type(uuid,jsonb,uuid,integer,boolean,uuid) TO authenticated;
COMMIT;
