BEGIN;
ALTER FUNCTION erp_branch_private.current_branch(uuid) RENAME TO current_branch_before_provider_payment;
CREATE FUNCTION erp_branch_private.current_branch(c uuid) RETURNS uuid LANGUAGE plpgsql STABLE SET search_path='' AS $$DECLARE proof_id uuid:=nullif(current_setting('erp.payment_proof',true),'')::uuid;invoice_id uuid;b uuid;BEGIN
 IF proof_id IS NOT NULL THEN
  SELECT p.invoice_id INTO invoice_id FROM erp_settings_private.payment_proofs p WHERE p.id=proof_id AND p.cafe_id=c AND p.actor=auth.uid() AND brand_finance_private.role_for(c)='owner';
  IF invoice_id IS NULL THEN RAISE EXCEPTION 'سياق تحصيل غير مصرح' USING ERRCODE='42501';END IF;
  SELECT branch_id INTO b FROM public.erp_branch_documents WHERE cafe_id=c AND document_id=invoice_id;
  IF b IS NOT NULL AND NOT erp_branch_private.branch_allowed(c,b) THEN RAISE EXCEPTION 'فرع تحصيل غير متاح' USING ERRCODE='42501';END IF;RETURN b;
 END IF;RETURN erp_branch_private.current_branch_before_provider_payment(c);
END $$;
REVOKE ALL ON FUNCTION erp_branch_private.current_branch(uuid),erp_branch_private.current_branch_before_provider_payment(uuid) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.erp_system_payment_collect(uuid,uuid,uuid) RENAME TO erp_system_payment_collect_before_source_branch;
ALTER FUNCTION public.erp_system_payment_collect_before_source_branch(uuid,uuid,uuid) SET SCHEMA erp_settings_private;
REVOKE ALL ON FUNCTION erp_settings_private.erp_system_payment_collect_before_source_branch(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.erp_system_payment_collect(p_cafe uuid,p_proof uuid,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE proof erp_settings_private.payment_proofs;b uuid;account_id uuid;prior_proof text:=current_setting('erp.payment_proof',true);prior_cafe text:=current_setting('erp.branch_cafe',true);prior_branch text:=current_setting('erp.branch_id',true);result jsonb;BEGIN
 PERFORM erp_settings_private.authorize(p_cafe);
 SELECT * INTO proof FROM erp_settings_private.payment_proofs WHERE cafe_id=p_cafe AND id=p_proof FOR UPDATE;
 IF proof.id IS NULL OR proof.actor IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'تأكيد الدفع غير متاح' USING ERRCODE='42501';END IF;
 SELECT branch_id INTO b FROM public.erp_branch_documents WHERE cafe_id=p_cafe AND document_id=proof.invoice_id;
 IF b IS NOT NULL AND NOT erp_branch_private.branch_allowed(p_cafe,b) THEN RAISE EXCEPTION 'فرع الفاتورة غير متاح للتحصيل' USING ERRCODE='42501';END IF;
 SELECT nullif(config->>'accountId','')::uuid INTO account_id FROM public.erp_system_integrations WHERE cafe_id=p_cafe AND id=proof.integration_id;
 IF proof.used_at IS NULL AND NOT erp_branch_private.allowed_resource(p_cafe,b,'account',account_id) THEN RAISE EXCEPTION 'حساب التحصيل غير متاح لفرع الفاتورة' USING ERRCODE='42501';END IF;
 PERFORM set_config('erp.payment_proof',p_proof::text,true);PERFORM set_config('erp.branch_cafe',p_cafe::text,true);PERFORM set_config('erp.branch_id',coalesce(b::text,''),true);
 result:=erp_settings_private.erp_system_payment_collect_before_source_branch(p_cafe,p_proof,p_request);
 PERFORM set_config('erp.payment_proof',coalesce(prior_proof,''),true);PERFORM set_config('erp.branch_cafe',coalesce(prior_cafe,''),true);PERFORM set_config('erp.branch_id',coalesce(prior_branch,''),true);
 RETURN result;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('erp.payment_proof',coalesce(prior_proof,''),true);PERFORM set_config('erp.branch_cafe',coalesce(prior_cafe,''),true);PERFORM set_config('erp.branch_id',coalesce(prior_branch,''),true);RAISE;
END $$;
REVOKE ALL ON FUNCTION public.erp_system_payment_collect(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_system_payment_collect(uuid,uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
