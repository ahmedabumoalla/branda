-- Negative calls stop before any refund request, document or ledger mutation.
DO $test$
DECLARE cafe uuid;owner_id uuid;actor uuid;ordinary uuid;source_id uuid;message text;state text;operation text;
BEGIN
 SELECT id,owner_user_id INTO STRICT cafe,owner_id FROM public.cafes WHERE slug='mind-hospital';
 SELECT a.actor_id INTO actor FROM public.audit_logs a JOIN public.profiles p ON p.id=a.actor_id AND p.role='platform_admin' AND p.status='active'
 WHERE a.cafe_id=cafe AND a.action='maintenance_mode_started'
 ORDER BY a.created_at DESC,a.id DESC LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'No existing maintenance actor to verify'; END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 IF NOT brand_finance_private.invoice_settings_maintenance(cafe) THEN RAISE EXCEPTION 'Existing maintenance session is not active'; END IF;
 IF brand_finance_private.invoice_settings_maintenance(gen_random_uuid()) THEN RAISE EXCEPTION 'Maintenance crosses tenant boundary'; END IF;
 FOREACH operation IN ARRAY ARRAY['refund_approve','refund_reject'] LOOP
  message:=NULL;state:=NULL;
  BEGIN
   PERFORM public.brand_finance_execute(cafe,operation,jsonb_build_object('requestId',gen_random_uuid(),'note','permission probe'),gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT,state=RETURNED_SQLSTATE;
  END;
  IF state='42501' OR message IS DISTINCT FROM 'طلب المرتجع غير متاح أو تمت مراجعته مسبقا' THEN RAISE EXCEPTION 'Maintenance % did not reach request validation: % %',operation,state,message; END IF;
 END LOOP;
 SELECT id INTO STRICT source_id FROM public.bf_documents WHERE cafe_id=cafe AND number=2131 AND kind='sale';
 BEGIN
  PERFORM brand_finance_private.post_refund(cafe,jsonb_build_object('documentId',source_id,'lines','[]'::jsonb),gen_random_uuid());
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT,state=RETURNED_SQLSTATE;
 END;
 IF state='42501' OR message IS NULL OR message NOT IN('حدد الأصناف والكميات المرتجعة','تم إرجاع جميع كميات الفاتورة') THEN RAISE EXCEPTION 'Maintenance posting did not reach quantity validation: % %',state,message; END IF;

 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 BEGIN
  PERFORM public.brand_finance_execute(cafe,'refund_approve',jsonb_build_object('requestId',gen_random_uuid()),gen_random_uuid());
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT,state=RETURNED_SQLSTATE;
 END;
 IF state='42501' OR message IS DISTINCT FROM 'طلب المرتجع غير متاح أو تمت مراجعته مسبقا' THEN RAISE EXCEPTION 'Owner access regressed: % %',state,message; END IF;

 SELECT user_id INTO ordinary FROM public.bf_staff WHERE cafe_id=cafe AND active AND role='cashier' AND user_id<>owner_id LIMIT 1;
 IF ordinary IS NULL THEN ordinary:=gen_random_uuid(); END IF;
 PERFORM set_config('request.jwt.claim.sub',ordinary::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ordinary,'role','authenticated')::text,true);
 BEGIN
  PERFORM public.brand_finance_execute(cafe,'refund_approve',jsonb_build_object('requestId',gen_random_uuid()),gen_random_uuid());
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE;
 END;
 IF state IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'Non-owner without maintenance may approve'; END IF;
 IF brand_finance_private.invoice_settings_maintenance(cafe) THEN RAISE EXCEPTION 'Non-maintenance actor received maintenance rights'; END IF;

 IF has_function_privilege('authenticated','brand_finance_private.post_refund_before_purchase_services(uuid,jsonb,uuid)','EXECUTE')
 OR has_function_privilege('anon','brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Private functions exposed'; END IF;
END $test$;
SELECT 'PASS active maintenance approval/rejection and posting validation; owner retained; other tenant and ordinary actor denied; private grants unchanged' AS permission_checks;
