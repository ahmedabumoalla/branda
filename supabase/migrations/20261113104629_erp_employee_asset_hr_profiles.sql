BEGIN;
ALTER TABLE public.erp_employee_assets ADD COLUMN holder_employee_id uuid;
ALTER TABLE public.erp_employee_assets ADD CONSTRAINT erp_employee_assets_hr_holder FOREIGN KEY(cafe_id,holder_employee_id) REFERENCES public.erp_hr_employees(cafe_id,id);
ALTER TABLE public.erp_asset_units ADD COLUMN employee_profile_id uuid;
ALTER TABLE public.erp_asset_units ADD CONSTRAINT erp_asset_units_hr_holder FOREIGN KEY(cafe_id,employee_profile_id) REFERENCES public.erp_hr_employees(cafe_id,id);
ALTER TABLE public.erp_asset_units ADD CONSTRAINT erp_asset_units_single_holder CHECK(num_nonnulls(employee_id,employee_profile_id)<=1);
CREATE INDEX erp_employee_assets_hr_holder ON public.erp_employee_assets(cafe_id,holder_employee_id);
CREATE INDEX erp_asset_units_hr_holder ON public.erp_asset_units(cafe_id,employee_profile_id);
DO $$ DECLARE item record;found_count integer:=0;BEGIN
 FOR item IN SELECT conname FROM pg_constraint WHERE conrelid='public.erp_employee_assets'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%holder_kind%' AND pg_get_constraintdef(oid) LIKE '%holder_user_id%' LOOP
  EXECUTE format('ALTER TABLE public.erp_employee_assets DROP CONSTRAINT %I',item.conname);found_count:=found_count+1;
 END LOOP;IF found_count<>1 THEN RAISE EXCEPTION 'Custody holder constraint anchor changed';END IF;
END $$;
ALTER TABLE public.erp_employee_assets ADD CONSTRAINT erp_employee_assets_single_holder CHECK((holder_kind='employee' AND num_nonnulls(holder_user_id,holder_employee_id)=1) OR (holder_kind<>'employee' AND num_nonnulls(holder_user_id,holder_employee_id)=0));
CREATE FUNCTION erp_employee_asset_private.validate_holder_profile(p_cafe uuid,p_kind text,p_user uuid,p_location uuid,p_assigned timestamptz,p_return date,p_employee uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF p_kind='employee' AND p_employee IS NOT NULL THEN
  IF p_user IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.erp_hr_employees WHERE cafe_id=p_cafe AND id=p_employee AND active) THEN RAISE EXCEPTION 'اختر ملف موظف نشطًا من العلامة دون دمجه مع حساب آخر';END IF;
  PERFORM erp_employee_asset_private.validate_holder(p_cafe,'warehouse',null,p_location,p_assigned,p_return);
 ELSE
  IF p_employee IS NOT NULL OR p_kind<>'employee' AND p_user IS NOT NULL THEN RAISE EXCEPTION 'حدد موظفًا فقط للعهدة المخصصة إلى موظف';END IF;
  PERFORM erp_employee_asset_private.validate_holder(p_cafe,p_kind,p_user,p_location,p_assigned,p_return);
 END IF;
END $$;
CREATE FUNCTION erp_employee_asset_private.profile_options(p_cafe uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$ SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',concat_ws(' ',first_name,last_name),'code',code,'userId',user_id,'active',active) ORDER BY code),'[]') FROM public.erp_hr_employees WHERE cafe_id=p_cafe $$;
-- Patch the current bodies, including existing role guards and read wrappers
CREATE FUNCTION erp_employee_asset_private.patch_definition(p_function regprocedure,p_anchor text,p_replacement text) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$ DECLARE src text;BEGIN
 SELECT pg_get_functiondef(p_function) INTO src;IF src IS NULL OR position(p_anchor IN src)=0 THEN RAISE EXCEPTION 'Custody profile migration anchor missing in %',p_function;END IF;EXECUTE replace(src,p_anchor,p_replacement);
END $$;
DO $$ DECLARE save_fn regprocedure:='public.erp_employee_asset_save(uuid,jsonb,uuid,integer,uuid)';act_fn regprocedure:='public.erp_employee_asset_act(uuid,jsonb)';read_fn regprocedure;unit_fn regprocedure:='erp_employee_asset_private.sync_unit()';guard_fn regprocedure:='erp_employee_asset_private.unit_guard()';asset_read regprocedure;BEGIN
 read_fn:=coalesce(to_regprocedure('erp_access_private.snapshot_erp_employee_asset_read(uuid,uuid,text,uuid,integer)'),to_regprocedure('public.erp_employee_asset_read(uuid,uuid,text,uuid,integer)'));
 asset_read:=coalesce(to_regprocedure('erp_access_private.snapshot_erp_asset_read(uuid,uuid,text,text,integer)'),to_regprocedure('public.erp_asset_read(uuid,uuid,text,text,integer)'));
 PERFORM erp_employee_asset_private.patch_definition(save_fn,'person uuid:=nullif(p_payload->>''holderUserId'','''')::uuid;','person uuid:=nullif(p_payload->>''holderUserId'','''')::uuid;profile_id uuid:=nullif(p_payload->>''holderEmployeeId'','''')::uuid;');
 PERFORM erp_employee_asset_private.patch_definition(save_fn,'OR old.location_id IS DISTINCT FROM location','OR old.holder_employee_id IS DISTINCT FROM (CASE WHEN holder=''employee'' THEN profile_id END) OR old.location_id IS DISTINCT FROM location');
 PERFORM erp_employee_asset_private.patch_definition(save_fn,'erp_employee_asset_private.validate_holder(p_cafe,holder,person,location,assigned,expected)','erp_employee_asset_private.validate_holder_profile(p_cafe,holder,person,location,assigned,expected,profile_id)');
 PERFORM erp_employee_asset_private.patch_definition(save_fn,'location_id,holder_kind,holder_user_id,status,','location_id,holder_kind,holder_user_id,holder_employee_id,status,');
 PERFORM erp_employee_asset_private.patch_definition(save_fn,'holder,CASE WHEN holder=''employee'' THEN person END,CASE','holder,CASE WHEN holder=''employee'' THEN person END,CASE WHEN holder=''employee'' THEN profile_id END,CASE');
 PERFORM erp_employee_asset_private.patch_definition(act_fn,'loc uuid;person uuid;kind text;','loc uuid;person uuid;profile_id uuid;kind text;');
 PERFORM erp_employee_asset_private.patch_definition(act_fn,'person:=nullif(p_command->>''holderUserId'','''')::uuid;','person:=nullif(p_command->>''holderUserId'','''')::uuid;profile_id:=nullif(p_command->>''holderEmployeeId'','''')::uuid;');
 PERFORM erp_employee_asset_private.patch_definition(act_fn,'person:=(a.maintenance_previous->>''holder_user_id'')::uuid;','person:=(a.maintenance_previous->>''holder_user_id'')::uuid;profile_id:=(a.maintenance_previous->>''holder_employee_id'')::uuid;');
 PERFORM erp_employee_asset_private.patch_definition(act_fn,'erp_employee_asset_private.validate_holder(p_cafe,kind,person,loc,effective,expected)','erp_employee_asset_private.validate_holder_profile(p_cafe,kind,person,loc,effective,expected,profile_id)');
 PERFORM erp_employee_asset_private.patch_definition(act_fn,'erp_employee_asset_private.validate_holder(p_cafe,kind,person,loc,assigned,expected)','erp_employee_asset_private.validate_holder_profile(p_cafe,kind,person,loc,assigned,expected,profile_id)');
 PERFORM erp_employee_asset_private.patch_definition(act_fn,'holder_user_id=CASE WHEN kind=''employee'' THEN person END,','holder_user_id=CASE WHEN kind=''employee'' THEN person END,holder_employee_id=CASE WHEN kind=''employee'' THEN profile_id END,');
 PERFORM erp_employee_asset_private.patch_definition(act_fn,'holder_user_id=null,','holder_user_id=null,holder_employee_id=null,');
 PERFORM erp_employee_asset_private.patch_definition(read_fn,'p_employee IS NULL OR holder_user_id=p_employee','p_employee IS NULL OR holder_user_id=p_employee OR holder_employee_id=p_employee');
 PERFORM erp_employee_asset_private.patch_definition(read_fn,'''staff'',erp_employee_asset_private.staff_options(p_cafe),','''staff'',erp_employee_asset_private.staff_options(p_cafe),''employees'',erp_employee_asset_private.profile_options(p_cafe),');
 PERFORM erp_employee_asset_private.patch_definition(read_fn,'''employee_id'',u.employee_id,','''employee_id'',u.employee_id,''employee_profile_id'',u.employee_profile_id,');
 PERFORM erp_employee_asset_private.patch_definition(unit_fn,'employee_id=NEW.holder_user_id,','employee_id=NEW.holder_user_id,employee_profile_id=NEW.holder_employee_id,');
 PERFORM erp_employee_asset_private.patch_definition(unit_fn,'ROW(serial,barcode,employee_id,location_id,description)','ROW(serial,barcode,employee_id,employee_profile_id,location_id,description)');
 PERFORM erp_employee_asset_private.patch_definition(unit_fn,'ROW(NEW.serial,NEW.barcode,NEW.holder_user_id,NEW.location_id,NEW.description)','ROW(NEW.serial,NEW.barcode,NEW.holder_user_id,NEW.holder_employee_id,NEW.location_id,NEW.description)');
 PERFORM erp_employee_asset_private.patch_definition(unit_fn,'''employeeId'',coalesce(u.employee_id::text,''''),','''employeeId'',coalesce(u.employee_id::text,''''),''employeeProfileId'',coalesce(u.employee_profile_id::text,''''),');
 PERFORM erp_employee_asset_private.patch_definition(guard_fn,'IF TG_OP=''UPDATE'' THEN SELECT','IF NEW.employee_profile_id IS NOT NULL AND (TG_OP=''INSERT'' OR NEW.employee_profile_id IS DISTINCT FROM OLD.employee_profile_id) AND NOT EXISTS(SELECT 1 FROM public.erp_hr_employees WHERE cafe_id=NEW.cafe_id AND id=NEW.employee_profile_id AND active) THEN RAISE EXCEPTION ''ملف الموظف غير متاح لهذه العلامة'';END IF;IF TG_OP=''UPDATE'' THEN SELECT');
 PERFORM erp_employee_asset_private.patch_definition(guard_fn,'ROW(NEW.serial,NEW.barcode,NEW.employee_id,NEW.location_id,NEW.description)','ROW(NEW.serial,NEW.barcode,NEW.employee_id,NEW.employee_profile_id,NEW.location_id,NEW.description)');
 PERFORM erp_employee_asset_private.patch_definition(guard_fn,'ROW(OLD.serial,OLD.barcode,OLD.employee_id,OLD.location_id,OLD.description)','ROW(OLD.serial,OLD.barcode,OLD.employee_id,OLD.employee_profile_id,OLD.location_id,OLD.description)');
 PERFORM erp_employee_asset_private.patch_definition(asset_read,'to_jsonb(u)-''cafe_id'' ORDER BY unit_index','(to_jsonb(u)-''cafe_id'')||jsonb_build_object(''employee_profile_name'',(SELECT concat_ws('' '',first_name,last_name) FROM public.erp_hr_employees WHERE cafe_id=u.cafe_id AND id=u.employee_profile_id)) ORDER BY unit_index');
 IF to_regclass('erp_access_private.guard_registry') IS NOT NULL THEN EXECUTE 'UPDATE erp_access_private.guard_registry SET installed_definition_md5=md5(pg_get_functiondef(function_id)) WHERE function_id IN($1,$2)' USING save_fn::oid,act_fn::oid;END IF;
END $$;
DROP FUNCTION erp_employee_asset_private.patch_definition(regprocedure,text,text);
REVOKE ALL ON FUNCTION erp_employee_asset_private.validate_holder_profile(uuid,text,uuid,uuid,timestamptz,date,uuid),erp_employee_asset_private.profile_options(uuid) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
