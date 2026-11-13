BEGIN;
-- Preserve the installed dispatcher, including employee assets and all prior domains.
ALTER FUNCTION erp_file_private.assert_record(uuid,text,uuid,boolean) RENAME TO assert_record_before_rentals;
CREATE FUNCTION erp_file_private.assert_record(p_cafe uuid,p_type text,p_record uuid,p_write boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tbl text;found_record boolean;role_name text;
BEGIN
 IF p_type NOT IN('rental_reservation','rental_contract') OR p_type IS NULL THEN PERFORM erp_file_private.assert_record_before_rentals(p_cafe,p_type,p_record,p_write);RETURN;END IF;
 role_name:=brand_finance_private.role_for(p_cafe);
 IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant','auditor') OR(p_write AND role_name='auditor') THEN RAISE EXCEPTION 'لا تملك صلاحية مرفقات الإيجارات' USING ERRCODE='42501';END IF;
 tbl:=CASE p_type WHEN 'rental_reservation' THEN 'erp_rental_reservations' ELSE 'erp_rental_contracts' END;
 IF p_record IS NULL THEN RAISE EXCEPTION 'اختر السجل أولًا' USING ERRCODE='22023';END IF;
 IF p_write THEN EXECUTE format('SELECT true FROM public.%I WHERE cafe_id=$1 AND id=$2 FOR KEY SHARE',tbl) INTO found_record USING p_cafe,p_record;
 ELSE EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE cafe_id=$1 AND id=$2)',tbl) INTO found_record USING p_cafe,p_record;END IF;
 IF NOT coalesce(found_record,false) THEN RAISE EXCEPTION 'السجل غير متاح في هذه العلامة' USING ERRCODE='42501';END IF;
END $$;
REVOKE ALL ON FUNCTION erp_file_private.assert_record(uuid,text,uuid,boolean),erp_file_private.assert_record_before_rentals(uuid,text,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER erp_file_orphan_guard BEFORE DELETE ON public.erp_rental_reservations FOR EACH ROW EXECUTE FUNCTION erp_file_private.prevent_orphans('rental_reservation');
CREATE TRIGGER erp_file_orphan_guard BEFORE DELETE ON public.erp_rental_contracts FOR EACH ROW EXECUTE FUNCTION erp_file_private.prevent_orphans('rental_contract');
NOTIFY pgrst,'reload schema';
COMMIT;
