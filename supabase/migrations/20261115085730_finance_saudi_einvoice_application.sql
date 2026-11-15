-- Independent invoice application policy; no issued invoice or ledger is changed.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';

CREATE FUNCTION brand_finance_private.saudi_einvoice_policy(p_cafe uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE apps jsonb; revision integer; seller jsonb; enabled boolean; source text;
BEGIN
 SELECT payload,s.revision INTO apps,revision FROM public.erp_system_settings s WHERE cafe_id=p_cafe AND kind='apps';
 IF coalesce(apps,'{}') ? 'saudi_einvoice' THEN
  IF jsonb_typeof(apps->'saudi_einvoice') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'إعداد الفوترة الإلكترونية غير صالح' USING ERRCODE='22023';END IF;
  enabled:=(apps->>'saudi_einvoice')::boolean;source:='explicit';
 ELSE
  seller:=brand_finance_private.receipt_seller(p_cafe);
  enabled:=coalesce(btrim(seller->>'name')<>'',false) AND coalesce(btrim(seller->>'vatNumber')~'^3[0-9]{13}3$',false);
  source:='tax_profile';
 END IF;
 RETURN jsonb_build_object('available',true,'enabled',enabled,'source',source,'appsRevision',coalesce(revision,0));
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.saudi_einvoice_policy(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.brand_finance_saudi_einvoice_context(p_cafe_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN('owner','manager','accountant','auditor') THEN
  RAISE EXCEPTION 'لا تملك صلاحية عرض إعداد الفوترة الإلكترونية' USING ERRCODE='42501';
 END IF;
 RETURN brand_finance_private.saudi_einvoice_policy(p_cafe_id);
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_saudi_einvoice_context(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_saudi_einvoice_context(uuid) TO authenticated;

DO $migration$
DECLARE source text; needle text; replacement text;
BEGIN
 SELECT pg_get_functiondef('public.erp_system_settings_write(uuid,text,jsonb,uuid)'::regprocedure) INTO source;
 needle:=$old$   IF EXISTS(SELECT 1 FROM jsonb_each(cfg) e WHERE NOT e.key=ANY(erp_access_private.domains()) OR e.key IN('store','templates') OR jsonb_typeof(e.value)<>'boolean') THEN RAISE EXCEPTION 'اختر تطبيقًا متاحًا في النظام';END IF;$old$;
 replacement:=$new$   IF NOT (cfg ? 'saudi_einvoice') THEN
    SELECT payload->'saudi_einvoice' INTO v FROM public.erp_system_settings WHERE cafe_id=p_cafe AND kind='apps';
    IF v IS NOT NULL THEN cfg:=cfg||jsonb_build_object('saudi_einvoice',v);END IF;
   END IF;
   IF EXISTS(SELECT 1 FROM jsonb_each(cfg) e WHERE (NOT e.key=ANY(erp_access_private.domains()) AND e.key<>'saudi_einvoice') OR e.key IN('store','templates') OR jsonb_typeof(e.value)<>'boolean') THEN RAISE EXCEPTION 'اختر تطبيقًا متاحًا في النظام';END IF;$new$;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Saudi invoice application validation anchor drift';END IF;
 EXECUTE replace(source,needle,replacement);
END $migration$;

NOTIFY pgrst,'reload schema';
COMMIT;
