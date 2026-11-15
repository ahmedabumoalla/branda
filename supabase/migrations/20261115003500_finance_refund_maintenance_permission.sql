BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- An active, audited administrator session for this cafe may review refunds.
-- Keep the original role checks, posting/idempotency rules and real auth.uid().
-- No owner impersonation, credential changes, new grants or ledger rewrites.
DO $migration$
DECLARE source text; before_guard text; after_guard text;
BEGIN
 source:=pg_get_functiondef('brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid)'::regprocedure);
 IF md5(source)<>'ad39cba711b0056cad1645fecd9cf3e8' THEN RAISE EXCEPTION 'Unexpected refund execution baseline'; END IF;
 before_guard:=$before$IF p_operation IN('refund_approve','refund_reject') AND (r<>'owner' OR NOT EXISTS(SELECT 1 FROM public.cafes c WHERE c.id=p_cafe_id AND c.owner_user_id=auth.uid())) THEN$before$;
 after_guard:=$after$IF p_operation IN('refund_approve','refund_reject') AND (r<>'owner' OR NOT (EXISTS(SELECT 1 FROM public.cafes c WHERE c.id=p_cafe_id AND c.owner_user_id=auth.uid()) OR brand_finance_private.invoice_settings_maintenance(p_cafe_id))) THEN$after$;
 IF position(before_guard in source)=0 THEN RAISE EXCEPTION 'Refund review guard missing'; END IF;
 EXECUTE replace(source,before_guard,after_guard);

 source:=pg_get_functiondef('brand_finance_private.post_refund_before_purchase_services(uuid,jsonb,uuid)'::regprocedure);
 IF md5(source)<>'95a8e2d4d7f24a12b954451b457162f1' THEN RAISE EXCEPTION 'Unexpected refund posting baseline'; END IF;
 before_guard:=$before$IF original.kind='sale' AND NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND owner_user_id=auth.uid()) THEN$before$;
 after_guard:=$after$IF original.kind='sale' AND NOT (EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND owner_user_id=auth.uid()) OR brand_finance_private.invoice_settings_maintenance(p_cafe)) THEN$after$;
 IF position(before_guard in source)=0 THEN RAISE EXCEPTION 'Refund posting guard missing'; END IF;
 EXECUTE replace(source,before_guard,after_guard);
END $migration$;
COMMIT;
