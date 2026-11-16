BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- Explicit MIND POS policy; public execution retains employee permission,
-- optional approval policy, tenant access, quote validation and idempotency.
CREATE FUNCTION brand_finance_private.mind_pos_direct_refund(c uuid,p jsonb) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $function$
 SELECT CASE WHEN auth.uid() IS NOT NULL AND p->>'directPosRefund'='true'
 AND EXISTS(SELECT 1 FROM public.cafes WHERE id=c AND slug='mind-hospital') THEN
 coalesce(brand_finance_private.role_for(c),'') IN('owner','manager','accountant','cashier')
 AND EXISTS(SELECT 1 FROM public.bf_documents d WHERE d.cafe_id=c
  AND d.id=nullif(p->>'documentId','')::uuid AND d.kind='sale'
  AND (brand_finance_private.role_for(c)<>'cashier' OR d.created_by=auth.uid())) ELSE false END
$function$;
REVOKE ALL ON FUNCTION brand_finance_private.mind_pos_direct_refund(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

DO $migration$
DECLARE source text; before_block text; after_block text;
BEGIN
 source:=pg_get_functiondef('brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid)'::regprocedure);
 before_block:=$before$  IF original.kind='sale' THEN
   canonical:=brand_finance_private.refund_quote(p_cafe_id,p_payload);
   INSERT INTO public.bf_refund_requests$before$;
 after_block:=$after$  IF original.kind='sale' AND brand_finance_private.mind_pos_direct_refund(p_cafe_id,p_payload) THEN
   canonical:=brand_finance_private.refund_quote(p_cafe_id,p_payload)||jsonb_build_object('directPosRefund',true);
   IF (canonical->>'expectedPaid')::numeric>coalesce((SELECT sum(debit-credit) FROM public.bf_journal WHERE cafe_id=p_cafe_id AND account_id=(canonical->>'accountId')::uuid),0) THEN RAISE EXCEPTION 'رصيد حساب الدفع غير كاف لصرف المرتجع'; END IF;
   n:=brand_finance_private.post_refund(p_cafe_id,canonical,id);
   -- Completed audit link also retains the cashier's existing receipt access
   -- There is no pending request or second approval action
   INSERT INTO public.bf_refund_requests(id,cafe_id,document_id,document_number,status,payload,total,paid,created_by,reviewed_by,reviewed_at,refund_document_id)
   VALUES(gen_random_uuid(),p_cafe_id,original.id,original.number,'approved',canonical||jsonb_build_object('policy','mind_pos_direct'),(canonical->>'expectedTotal')::numeric,(canonical->>'expectedPaid')::numeric,auth.uid(),auth.uid(),now(),id);
   result_status:='approved';
  ELSIF original.kind='sale' THEN
   canonical:=brand_finance_private.refund_quote(p_cafe_id,p_payload);
   INSERT INTO public.bf_refund_requests$after$;
 source:=replace(source,E'\r\n',E'\n');
 IF position(before_block in source)=0 THEN RAISE EXCEPTION 'Refund request execution baseline changed';END IF;
 EXECUTE replace(source,before_block,after_block);

 source:=pg_get_functiondef('brand_finance_private.post_refund_before_purchase_services(uuid,jsonb,uuid)'::regprocedure);
 before_block:=$before$IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe),'') NOT IN('owner','manager','accountant') THEN$before$;
 after_block:=$after$IF auth.uid() IS NULL OR (coalesce(brand_finance_private.role_for(p_cafe),'') NOT IN('owner','manager','accountant') AND NOT coalesce(brand_finance_private.mind_pos_direct_refund(p_cafe,p_payload),false)) THEN$after$;
 IF position(before_block in source)=0 THEN RAISE EXCEPTION 'Refund posting role baseline changed';END IF;
 source:=replace(source,before_block,after_block);
 before_block:=$before$IF original.kind='sale' AND NOT (EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND owner_user_id=auth.uid()) OR brand_finance_private.invoice_settings_maintenance(p_cafe)) THEN$before$;
 after_block:=$after$IF original.kind='sale' AND NOT (EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND owner_user_id=auth.uid()) OR brand_finance_private.invoice_settings_maintenance(p_cafe) OR coalesce(brand_finance_private.mind_pos_direct_refund(p_cafe,p_payload),false)) THEN$after$;
 IF position(before_block in source)=0 THEN RAISE EXCEPTION 'Refund posting owner baseline changed';END IF;
 EXECUTE replace(source,before_block,after_block);
END $migration$;
COMMIT;
