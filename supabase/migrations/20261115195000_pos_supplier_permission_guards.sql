BEGIN;
-- Preserve job-specific authorization as well as the own-shift and per-user gates.
DO $$DECLARE source text;needle text;BEGIN
 SELECT pg_get_functiondef('erp_purchase_private.supplier_payout_by_id(uuid,text,jsonb,uuid)'::regprocedure) INTO source;
 needle:='PERFORM brand_finance_private.role_for(p_cafe_id);';
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Supplier payout authorization baseline mismatch'; END IF;
 EXECUTE replace(source,needle,needle||E'\n PERFORM brand_finance_private.assert_job_access(p_cafe_id,''brand_finance_execute'',''supplier_payout'');');
END $$;

-- Show effective inherited permissions for existing staff rather than unchecked defaults.
CREATE OR REPLACE FUNCTION public.brand_finance_snapshot(p_cafe_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;cfg jsonb;
BEGIN
 result:=erp_purchase_private.snapshot_before_staff_permissions(p_cafe_id);
 cfg:=erp_purchase_private.settings(p_cafe_id);
 RETURN result||jsonb_build_object('posPermissions',erp_purchase_private.pos_permissions(p_cafe_id),'staff',
 coalesce((SELECT jsonb_agg(s||jsonb_build_object('posPermissions',jsonb_build_object(
 'createItem',coalesce((b.pos_permissions->>'createItem')::boolean,b.role='manager' OR coalesce((cfg->>'cashierCreateItem')::boolean,false)),
 'createSupplier',coalesce((b.pos_permissions->>'createSupplier')::boolean,(cfg->>'cashierCreateSupplier')::boolean,true),
 'credit',coalesce((b.pos_permissions->>'credit')::boolean,(cfg->>'cashierCreditPurchase')::boolean,false),
 'supplierPayout',coalesce((b.pos_permissions->>'supplierPayout')::boolean,true))))
 FROM jsonb_array_elements(result->'staff')s LEFT JOIN public.bf_staff b ON b.cafe_id=p_cafe_id AND b.user_id=(s->>'user_id')::uuid),'[]'));
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
