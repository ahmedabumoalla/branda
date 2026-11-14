BEGIN;
-- Only the active, audited maintenance administrator may edit in addition to the owner.
CREATE OR REPLACE FUNCTION brand_finance_private.invoice_settings_maintenance(p_cafe_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE expires_at timestamptz; authorized jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RETURN false; END IF;
 SELECT CASE WHEN action='maintenance_mode_started' THEN (new_data->>'expires_at')::timestamptz END
 INTO expires_at FROM public.audit_logs
 WHERE actor_id=auth.uid() AND cafe_id=p_cafe_id AND action IN('maintenance_mode_started','maintenance_mode_ended')
 ORDER BY created_at DESC,id DESC LIMIT 1;
 IF expires_at IS NULL OR expires_at<=clock_timestamp() THEN RETURN false; END IF;
 authorized:=public.brand_finance_maintenance_cashier(p_cafe_id,auth.uid(),expires_at,'authorize','{}'::jsonb);
 RETURN authorized->>'authorized'='true';
EXCEPTION WHEN SQLSTATE '42501' OR invalid_datetime_format OR datetime_field_overflow THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.invoice_settings_maintenance(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.brand_finance_invoice_settings(p_cafe_id uuid, p_action text DEFAULT 'get'::text, p_settings jsonb DEFAULT NULL::jsonb, p_revision integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE role_name text;stored public.bf_invoice_settings%ROWTYPE;current_settings jsonb;current_revision integer;key text;advanced jsonb;next_number bigint;debit_next bigint;
BEGIN
 role_name:=brand_finance_private.role_for(p_cafe_id);
 IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('get','save') THEN RAISE EXCEPTION 'Invalid settings action' USING ERRCODE='22023';END IF;
 IF p_action='save' THEN
  IF role_name<>'owner' AND NOT brand_finance_private.invoice_settings_maintenance(p_cafe_id) THEN RAISE EXCEPTION 'Only the owner can change invoice settings' USING ERRCODE='42501';END IF;
  IF p_revision IS NULL OR p_revision<0 OR jsonb_typeof(p_settings) IS DISTINCT FROM 'object' OR octet_length(p_settings::text)>2000000 THEN RAISE EXCEPTION 'Invalid invoice settings' USING ERRCODE='22023';END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_settings)) NOT IN(9,10) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_settings) k WHERE k NOT IN('allowLineEditing','previewBeforeSave','priceHints','copyNotesOnConversion','decimalDisplay','allowDeposits','discountMode','allowBelowCost','defaultPaid','advanced')) THEN RAISE EXCEPTION 'Invalid invoice settings keys' USING ERRCODE='22023';END IF;
  FOREACH key IN ARRAY ARRAY['allowLineEditing','previewBeforeSave','copyNotesOnConversion','allowDeposits','allowBelowCost','defaultPaid'] LOOP
   IF jsonb_typeof(p_settings->key) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid invoice setting boolean' USING ERRCODE='22023';END IF;
  END LOOP;
  IF coalesce(p_settings->>'priceHints','') NOT IN('hidden','last') OR coalesce(p_settings->>'decimalDisplay','') NOT IN('always','never','auto') OR coalesce(p_settings->>'discountMode','') NOT IN('both','invoice','line') THEN RAISE EXCEPTION 'Invalid invoice setting option' USING ERRCODE='22023';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 END IF;
 SELECT * INTO stored FROM public.bf_invoice_settings WHERE cafe_id=p_cafe_id;
 current_settings:=coalesce(stored.settings,brand_finance_private.invoice_settings(NULL));
 advanced:=coalesce(current_settings->'advanced',brand_finance_private.invoice_advanced_defaults());
 next_number:=brand_finance_private.invoice_number_next(p_cafe_id,'invoice',advanced->'numbering');debit_next:=brand_finance_private.invoice_number_next(p_cafe_id,'debit',advanced->'debitNumbering');
 advanced:=jsonb_set(jsonb_set(advanced,'{numbering,next}',to_jsonb(next_number)),'{debitNumbering,next}',to_jsonb(debit_next));current_settings:=current_settings||jsonb_build_object('advanced',advanced);current_revision:=coalesce(stored.revision,0);
 IF p_action='save' THEN
  p_settings:=p_settings||jsonb_build_object('advanced',coalesce(p_settings->'advanced',advanced));
  PERFORM brand_finance_private.invoice_advanced_validate(p_cafe_id,p_settings->'advanced');
  IF p_settings IS DISTINCT FROM current_settings THEN
   IF p_revision<>current_revision THEN RAISE EXCEPTION 'Invoice settings conflict' USING ERRCODE='40001';END IF;
   INSERT INTO public.bf_invoice_settings(cafe_id,settings,revision,updated_by) VALUES(p_cafe_id,p_settings,current_revision+1,auth.uid()) ON CONFLICT(cafe_id) DO UPDATE SET settings=excluded.settings,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=clock_timestamp();
   INSERT INTO public.bf_invoice_settings_events(cafe_id,revision,before_settings,after_settings,created_by) VALUES(p_cafe_id,current_revision+1,current_settings,p_settings,auth.uid());current_settings:=p_settings;current_revision:=current_revision+1;
  END IF;
 END IF;
 next_number:=brand_finance_private.invoice_number_next(p_cafe_id,'invoice',current_settings#>'{advanced,numbering}');debit_next:=brand_finance_private.invoice_number_next(p_cafe_id,'debit',current_settings#>'{advanced,debitNumbering}');
 current_settings:=jsonb_set(jsonb_set(current_settings,'{advanced,numbering,next}',to_jsonb(next_number)),'{advanced,debitNumbering,next}',to_jsonb(debit_next));
 RETURN jsonb_build_object('settings',current_settings,'revision',current_revision,'nextNumber',next_number);
END $function$;
COMMIT;
