-- Transactional regression: creates no lasting identities or memberships and sends no messages
BEGIN;
SET LOCAL statement_timeout='30s';
CREATE TEMP TABLE maintenance_test_result(checks integer) ON COMMIT DROP;
DO $test$
DECLARE cafe uuid; actor uuid; owner_id uuid; uid uuid:=gen_random_uuid(); expiry timestamptz:=date_trunc('milliseconds',clock_timestamp()+interval '5 minutes');
 result jsonb; hits integer:=0; identity_before text; identity_after text; fixture_phone text;
BEGIN
 SELECT c.id,c.owner_user_id INTO STRICT cafe,owner_id FROM public.cafes c
 WHERE c.deleted_at IS NULL AND c.status IN('active','published') AND platform_access_private.service_enabled(c.id,'finance')
 ORDER BY (c.business_category='butcher_shops') DESC,c.created_at DESC LIMIT 1;
 SELECT id INTO STRICT actor FROM public.profiles WHERE role='platform_admin' AND status='active' ORDER BY id LIMIT 1;
 IF has_function_privilege('anon','public.brand_finance_maintenance_cashier(uuid,uuid,timestamptz,text,jsonb)','EXECUTE')
  OR has_function_privilege('authenticated','public.brand_finance_maintenance_cashier(uuid,uuid,timestamptz,text,jsonb)','EXECUTE')
  OR NOT has_function_privilege('service_role','public.brand_finance_maintenance_cashier(uuid,uuid,timestamptz,text,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'Invalid RPC grants'; END IF; hits:=hits+1;
 INSERT INTO public.audit_logs(actor_id,cafe_id,action,new_data,created_at)
 VALUES(actor,cafe,'maintenance_mode_started',jsonb_build_object('expires_at',expiry),clock_timestamp());
 result:=public.brand_finance_maintenance_cashier(cafe,actor,expiry,'authorize','{}');
 IF result->>'authorized'<>'true' THEN RAISE EXCEPTION 'Authorization failed'; END IF; hits:=hits+1;
 BEGIN PERFORM public.brand_finance_maintenance_cashier(cafe,owner_id,expiry,'authorize','{}'); RAISE EXCEPTION 'Owner treated as maintenance'; EXCEPTION WHEN insufficient_privilege THEN hits:=hits+1; END;
 BEGIN PERFORM public.brand_finance_maintenance_cashier(cafe,actor,expiry+interval '1 second','authorize','{}'); RAISE EXCEPTION 'Wrong session accepted'; EXCEPTION WHEN insufficient_privilege THEN hits:=hits+1; END;
 BEGIN PERFORM public.brand_finance_maintenance_cashier(cafe,actor,clock_timestamp()-interval '1 second','authorize','{}'); RAISE EXCEPTION 'Expired accepted'; EXCEPTION WHEN insufficient_privilege THEN hits:=hits+1; END;
 BEGIN PERFORM public.brand_finance_maintenance_cashier(gen_random_uuid(),actor,expiry,'authorize','{}'); RAISE EXCEPTION 'Other tenant accepted'; EXCEPTION WHEN insufficient_privilege THEN hits:=hits+1; END;
 fixture_phone:='96659'||lpad(floor(random()*10000000)::text,7,'0');
 IF EXISTS(SELECT 1 FROM auth.users u WHERE u.phone IN(fixture_phone,'+'||fixture_phone)) THEN RAISE EXCEPTION 'Fixture fixture_phone collision'; END IF;
 INSERT INTO auth.users(id,instance_id,aud,role,email,phone,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 VALUES(uid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',uid::text||'@maintenance.invalid',fixture_phone,now(),'{}',jsonb_build_object('full_name','Isolated cashier'),now(),now());
 UPDATE public.profiles SET role='customer',status='active' WHERE id=uid;
 BEGIN PERFORM public.brand_finance_maintenance_cashier(cafe,actor,expiry,'add',jsonb_build_object('userId',uid,'name','Cashier')); RAISE EXCEPTION 'Untrusted identity accepted'; EXCEPTION WHEN insufficient_privilege THEN hits:=hits+1; END;
 UPDATE auth.users SET raw_app_meta_data=jsonb_build_object('finance_staff_provisioned',true,'finance_cafe_id',cafe) WHERE id=uid;
 SELECT md5(to_jsonb(u)::text) INTO identity_before FROM auth.users u WHERE id=uid;
 result:=public.brand_finance_maintenance_cashier(cafe,actor,expiry,'add',jsonb_build_object('userId',uid,'name','Cashier'));
 IF result->>'id'<>uid::text OR NOT EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=cafe AND user_id=uid AND role='cashier' AND active) THEN RAISE EXCEPTION 'Add failed'; END IF; hits:=hits+1;
 result:=public.brand_finance_maintenance_cashier(cafe,actor,expiry,'link',jsonb_build_object('phone',fixture_phone,'name','Cashier'));
 IF result->>'changed'<>'false' THEN RAISE EXCEPTION 'Repeated link changed membership'; END IF; hits:=hits+1;
 result:=public.brand_finance_maintenance_cashier(cafe,actor,expiry,'update',jsonb_build_object('userId',uid,'name','Renamed cashier','role','cashier','active',false));
 IF EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=cafe AND user_id=uid AND active) THEN RAISE EXCEPTION 'Disable failed'; END IF; hits:=hits+1;
 result:=public.brand_finance_maintenance_cashier(cafe,actor,expiry,'link',jsonb_build_object('phone',fixture_phone,'name','Cashier'));
 IF result->>'changed'<>'true' THEN RAISE EXCEPTION 'Reactivation failed'; END IF; hits:=hits+1;
 BEGIN PERFORM public.brand_finance_maintenance_cashier(cafe,actor,expiry,'update',jsonb_build_object('userId',uid,'name','Escalation','role','manager','active',true)); RAISE EXCEPTION 'Role escalation accepted'; EXCEPTION WHEN insufficient_privilege THEN hits:=hits+1; END;
 UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=uid;
 BEGIN PERFORM public.brand_finance_maintenance_cashier(cafe,actor,expiry,'link',jsonb_build_object('phone',fixture_phone,'name','Cashier')); RAISE EXCEPTION 'Banned user linked'; EXCEPTION WHEN insufficient_privilege THEN hits:=hits+1; END;
 UPDATE auth.users SET banned_until=NULL WHERE id=uid;
 SELECT md5(to_jsonb(u)::text) INTO identity_after FROM auth.users u WHERE id=uid;
 IF identity_after<>identity_before THEN RAISE EXCEPTION 'Customer identity changed'; END IF; hits:=hits+1;
 IF (SELECT count(*) FROM public.audit_logs WHERE actor_id=actor AND cafe_id=cafe AND entity_id=uid AND action LIKE 'maintenance_cashier_%')<>3 THEN RAISE EXCEPTION 'Audit incomplete'; END IF; hits:=hits+1;
 INSERT INTO public.audit_logs(actor_id,cafe_id,action,created_at) VALUES(actor,cafe,'maintenance_mode_ended',clock_timestamp());
 BEGIN PERFORM public.brand_finance_maintenance_cashier(cafe,actor,expiry,'update',jsonb_build_object('userId',uid,'name','Cashier','role','cashier','active',false)); RAISE EXCEPTION 'Ended session accepted'; EXCEPTION WHEN insufficient_privilege THEN hits:=hits+1; END;
 INSERT INTO maintenance_test_result VALUES(hits);
END $test$;
SELECT checks,'PASS isolated rollback; no accounts or memberships retained' AS result FROM maintenance_test_result;

ROLLBACK;
