BEGIN;
-- These are existing routines with distinct authorization and idempotency contracts.
-- Keep their deployed definitions and privileges. Abort on intervening schema drift.
CREATE FUNCTION pg_temp.patch_mobile_path(fn regprocedure, baseline text, edits text[][]) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE src text; signature text; pair text[];
BEGIN
  SELECT replace(pg_get_functiondef(oid),chr(13),''), md5(replace(prosrc,chr(13),'')) INTO STRICT src,signature FROM pg_proc WHERE oid=fn;
  IF signature<>baseline THEN RAISE EXCEPTION 'Phone migration baseline changed for %',fn; END IF;
  FOREACH pair SLICE 1 IN ARRAY edits LOOP
    IF strpos(src,pair[1])=0 THEN RAISE EXCEPTION 'Phone migration anchor missing in %',fn; END IF;
    src:=replace(src,pair[1],pair[2]);
  END LOOP;
  EXECUTE src;
END $$;

SELECT pg_temp.patch_mobile_path('public.begin_owner_onboarding(uuid, text, text, text, text, jsonb)'::regprocedure,'4b63b789c6e0d5be0dce2acd6f6d7857',ARRAY[
  ARRAY[$old$IF p_phone IS NULL$old$,$new$IF p_draft ? 'accountCountry' AND (coalesce(p_draft->>'accountCountry','') NOT IN ('SA','PS') OR ((p_draft->>'accountCountry'='PS') IS DISTINCT FROM (left(p_phone,3)='970'))) THEN RETURN '{"ok":false}'::jsonb; END IF;
  IF p_phone IS NULL$new$]
]);

SELECT pg_temp.patch_mobile_path('public.handle_new_user()'::regprocedure,'c2e518695c4891424445992f69224694',ARRAY[
  ARRAY[$old$INSERT INTO public.cafes(slug,name,name_en$old$,$new$INSERT INTO public.cafes(phone_country,slug,name,name_en$new$],
  ARRAY[$old$VALUES(v_slug,challenge.draft->>'brandNameAr'$old$,$new$VALUES(coalesce(challenge.draft->>'accountCountry',CASE WHEN left(challenge.phone,3)='970' THEN 'PS' ELSE 'SA' END),v_slug,challenge.draft->>'brandNameAr'$new$]
]);

SELECT pg_temp.patch_mobile_path('public.enroll_loyalty_customer_direct(uuid, text, text, text)'::regprocedure,'634162da0127aa231fc31f121f222439',ARRAY[
  ARRAY[$old$public.normalize_customer_phone($old$,$new$brand_phone_private.normalize(p_cafe_id,$new$]
]);

SELECT pg_temp.patch_mobile_path('public.enroll_branch_loyalty_customer(uuid, text, text, text, uuid)'::regprocedure,'962bf574422c587bcd902699ca55b2f8',ARRAY[
  ARRAY[$old$public.normalize_customer_phone($old$,$new$brand_phone_private.normalize(p_cafe_id,$new$]
]);

SELECT pg_temp.patch_mobile_path('public.sync_customer_phone_normalized()'::regprocedure,'e3c98d3641a734bef431d6996d061879',ARRAY[
  ARRAY[$old$public.normalize_customer_phone($old$,$new$brand_phone_private.normalize(NEW.cafe_id,$new$]
]);

SELECT pg_temp.patch_mobile_path('erp_points_private.earn()'::regprocedure,'7015fc1ec40a1c81042cae907641b6aa',ARRAY[
  ARRAY[$old$public.normalize_customer_phone($old$,$new$brand_phone_private.normalize(NEW.cafe_id,$new$]
]);

SELECT pg_temp.patch_mobile_path('public.brand_finance_bind_loyalty_session(text)'::regprocedure,'963ee6a6e9ea724a22f8d08fe2155b53',ARRAY[
  ARRAY[$old$public.normalize_customer_phone($old$,$new$brand_phone_private.normalize(s.cafe_id,$new$]
]);

SELECT pg_temp.patch_mobile_path('public.brand_finance_loyalty_session_guard(text)'::regprocedure,'a178368ff7343b7f9e1ac100e7faec58',ARRAY[
  ARRAY[$old$public.normalize_customer_phone($old$,$new$brand_phone_private.normalize(s.cafe_id,$new$]
]);

SELECT pg_temp.patch_mobile_path('public.erp_points_sale(uuid, jsonb, uuid, integer)'::regprocedure,'2e39401352105737bb24e900554143aa',ARRAY[
  ARRAY[$old$public.normalize_customer_phone($old$,$new$brand_phone_private.normalize(c,$new$]
]);

SELECT pg_temp.patch_mobile_path('public.erp_points_execute(uuid, text, jsonb)'::regprocedure,'8c4344aaa43bff1668662c97f79e4911',ARRAY[
  ARRAY[$old$public.normalize_customer_phone($old$,$new$brand_phone_private.normalize(c,$new$]
]);

SELECT pg_temp.patch_mobile_path('public.erp_points_read(uuid, text, text)'::regprocedure,'dd1d286519e18273616eda3a8c5ca4d4',ARRAY[
  ARRAY[$old$public.normalize_customer_phone($old$,$new$brand_phone_private.normalize(p_cafe,$new$]
]);

SELECT pg_temp.patch_mobile_path('public.erp_points_balance(uuid, text)'::regprocedure,'e6f2d5c726b04de1168a3323884e36a5',ARRAY[
  ARRAY[$old$public.normalize_customer_phone($old$,$new$brand_phone_private.normalize(p_cafe,$new$]
]);

SELECT pg_temp.patch_mobile_path('brand_loyalty_analytics_private.campaign_audience(uuid, text, integer, timestamp with time zone)'::regprocedure,'127747817cebd7ed5a112143d0b981fb',ARRAY[
  ARRAY[$old$public.normalize_customer_phone($old$,$new$brand_phone_private.normalize(p_brand,$new$],
  ARRAY[$old$s.phone ~ '^9665[0-9]{8}$'$old$,$new$brand_phone_private.canonical(p_brand,s.phone)$new$]
]);

SELECT pg_temp.patch_mobile_path('brand_loyalty_analytics_private.coupon_operation(text, text, text, numeric, uuid, boolean)'::regprocedure,'77b07cb583da49264edddb1c3f95db6c',ARRAY[
  ARRAY[$old$public.normalize_customer_phone($old$,$new$brand_phone_private.normalize(v_session.cafe_id,$new$],
  ARRAY[$old$v_phone !~ '^9665[0-9]{8}$'$old$,$new$NOT brand_phone_private.canonical(v_session.cafe_id,v_phone)$new$]
]);

SELECT pg_temp.patch_mobile_path('public.claim_stamp_card_link(boolean, boolean)'::regprocedure,'0201a7bae73a90099d3a1a3fc9cc5f98',ARRAY[
  ARRAY[$old$cp.phone_normalized ~ '^9665[0-9]{8}$'$old$,$new$brand_phone_private.canonical(cp.cafe_id,cp.phone_normalized)$new$]
]);

SELECT pg_temp.patch_mobile_path('public.claim_stamp_card_link_v2(boolean, boolean)'::regprocedure,'c1e6b3089595e691e20969def3a61d8c',ARRAY[
  ARRAY[$old$cp.phone_normalized ~ '^9665[0-9]{8}$'$old$,$new$brand_phone_private.canonical(cp.cafe_id,cp.phone_normalized)$new$]
]);

SELECT pg_temp.patch_mobile_path('public.claim_stamp_card_link_v2(boolean, boolean, boolean)'::regprocedure,'6e61f5178ffd9c3801d5662ac7e293c2',ARRAY[
  ARRAY[$old$cp.phone_normalized ~ '^9665[0-9]{8}$'$old$,$new$brand_phone_private.canonical(cp.cafe_id,cp.phone_normalized)$new$]
]);

SELECT pg_temp.patch_mobile_path('public.claim_loyalty_birthday_greeting(boolean)'::regprocedure,'1d107ecd80ac90680da06a30ba40b7f5',ARRAY[
  ARRAY[$old$cp.phone_normalized ~ '^9665[0-9]{8}$'$old$,$new$brand_phone_private.canonical(cp.cafe_id,cp.phone_normalized)$new$]
]);

SELECT pg_temp.patch_mobile_path('public.issue_rast_loyalty_card(uuid)'::regprocedure,'c963422d21a9daa67412c289a5f22f16',ARRAY[
  ARRAY[$old$cp.phone_normalized ~ '^9665[0-9]{8}$'$old$,$new$brand_phone_private.canonical(cp.cafe_id,cp.phone_normalized)$new$]
]);

SELECT pg_temp.patch_mobile_path('public.issue_branch_loyalty_card(uuid, uuid)'::regprocedure,'1b5d3b11fa8826d552fd294ab321e8c2',ARRAY[
  ARRAY[$old$cp.phone_normalized ~ '^9665[0-9]{8}$'$old$,$new$brand_phone_private.canonical(cp.cafe_id,cp.phone_normalized)$new$]
]);

SELECT pg_temp.patch_mobile_path('public.get_cashier_loyalty_summary(text, uuid, uuid, text, text, boolean)'::regprocedure,'d99bef6dad9e3fe8d145afa71fc80ad1',ARRAY[
  ARRAY[$old$p_value !~ '^9665[0-9]{8}$'$old$,$new$NOT brand_phone_private.canonical(s.cafe_id,p_value)$new$],
  ARRAY[$old$IF p_method IS NULL OR p_method NOT IN ('phone', 'code')$old$,$new$IF p_method='phone' AND length(p_value)<=100 THEN p_value:=brand_phone_private.normalize(s.cafe_id,p_value); END IF;
  IF p_method IS NULL OR p_method NOT IN ('phone', 'code')$new$]
]);

SELECT pg_temp.patch_mobile_path('employee_access_private.enqueue_loyalty_before_policy(text, uuid, text, text, uuid, uuid, timestamp with time zone)'::regprocedure,'284a5d642a49c5fd7b483927184a85ea',ARRAY[
  ARRAY[$old$v !~ '^9665[0-9]{8}$'$old$,$new$NOT brand_phone_private.canonical(s.cafe_id,v)$new$],
  ARRAY[$old$v:=upper(btrim(p_value));$old$,$new$v:=CASE WHEN p_method='phone' THEN brand_phone_private.normalize(s.cafe_id,p_value) ELSE upper(btrim(p_value)) END;$new$]
]);

SELECT pg_temp.patch_mobile_path('loyalty_read_private.ensure_cashier_phone_card(text, text, uuid, text, numeric, numeric, integer)'::regprocedure,'40ba56117d4a3cb22d58038400adbc5d',ARRAY[
  ARRAY[$old$v_normalized_phone text:=public.normalize_customer_phone(p_phone);$old$,$new$v_normalized_phone text;$new$],
  ARRAY[$old$v_normalized_phone IS NULL OR v_normalized_phone !~ '^9665[0-9]{8}$' OR $old$,$new$$new$],
  ARRAY[$old$SELECT loyalty_branch_id INTO cashier_branch$old$,$new$v_normalized_phone:=brand_phone_private.normalize(cashier_session.cafe_id,p_phone);
  IF v_normalized_phone IS NULL THEN RAISE EXCEPTION 'Invalid phone scan' USING ERRCODE='22023'; END IF;
  SELECT loyalty_branch_id INTO cashier_branch$new$]
]);

SELECT pg_temp.patch_mobile_path('public.brand_finance_loyalty_issue(text, uuid, text, text)'::regprocedure,'ed5602b5ac8491e7fc49070ee52cc001',ARRAY[
  ARRAY[$old$phone text:=public.normalize_customer_phone(p_phone)$old$,$new$phone text$new$],
  ARRAY[$old$ OR phone IS NULL OR name IS NULL$old$,$new$ OR name IS NULL$new$],
  ARRAY[$old$p:=jsonb_build_object('cashierId',s.cashier_id$old$,$new$phone:=brand_phone_private.normalize(s.cafe_id,p_phone);
 IF phone IS NULL THEN RAISE EXCEPTION 'Invalid loyalty issue'; END IF;
 p:=jsonb_build_object('cashierId',s.cashier_id$new$]
]);

SELECT pg_temp.patch_mobile_path('public.brand_finance_pos_customer(uuid, text)'::regprocedure,'36f8330dcf6dcac9d2dce1fb8489cd4b',ARRAY[
  ARRAY[$old$brand_finance_private.customer_phone($old$,$new$brand_phone_private.sale_phone(p_cafe_id,$new$]
]);

SELECT pg_temp.patch_mobile_path('brand_finance_private.execute_before_treasury(uuid, text, jsonb, uuid)'::regprocedure,'cfbdbbf937ecd0c1a7f9aad4982eb33b',ARRAY[
  ARRAY[$old$brand_finance_private.customer_phone($old$,$new$brand_phone_private.sale_phone(p_cafe_id,$new$]
]);

SELECT pg_temp.patch_mobile_path('public.brand_finance_claim_cash_alerts(uuid, uuid, integer)'::regprocedure,'8035b103b8b7aae0900ade1fd70786d7',ARRAY[
  ARRAY[$old$'ownerPhone',phone$old$,$new$'cafeId',a.cafe_id,'ownerPhone',phone$new$]
]);

SELECT pg_temp.patch_mobile_path('brand_finance_private.issue_company_invoice_actor(uuid, boolean, uuid, uuid, integer, numeric, uuid, text)'::regprocedure,'6cbe7b59348750e0c55390fa15762a0c',ARRAY[
  ARRAY[$old$  phone:=regexp_replace(translate(coalesce(customer.phone,''),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[^0-9]','','g');IF phone LIKE '00%' THEN phone:=substr(phone,3);END IF;IF phone~'^05[0-9]{8}$' THEN phone:='966'||substr(phone,2);ELSIF phone~'^5[0-9]{8}$' THEN phone:='966'||phone;END IF;$old$,$new$  phone:=coalesce(brand_phone_private.normalize(p_cafe_id,customer.phone),regexp_replace(translate(coalesce(customer.phone,''),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[^0-9]','','g'));$new$],
  ARRAY[$old$phone!~'^9665[0-9]{8}$'$old$,$new$NOT brand_phone_private.canonical(p_cafe_id,phone)$new$],
  ARRAY[$old$رقم جوال سعودي صحيح$old$,$new$رقم جوال صحيح$new$]
]);

SELECT pg_temp.patch_mobile_path('brand_finance_private.issue_manual_invoice_shipping_actor(uuid, boolean, uuid, uuid, integer, numeric, uuid, text)'::regprocedure,'85031cf6a1df277acbb4a1bf93130d7a',ARRAY[
  ARRAY[$old$  phone:=regexp_replace(translate(coalesce(customer.phone,''),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[^0-9]','','g');IF phone LIKE '00%' THEN phone:=substr(phone,3);END IF;IF phone~'^05[0-9]{8}$' THEN phone:='966'||substr(phone,2);ELSIF phone~'^5[0-9]{8}$' THEN phone:='966'||phone;END IF;$old$,$new$  phone:=coalesce(brand_phone_private.normalize(p_cafe_id,customer.phone),regexp_replace(translate(coalesce(customer.phone,''),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[^0-9]','','g'));$new$],
  ARRAY[$old$phone!~'^9665[0-9]{8}$'$old$,$new$NOT brand_phone_private.canonical(p_cafe_id,phone)$new$],
  ARRAY[$old$رقم جوال سعودي صحيح$old$,$new$رقم جوال صحيح$new$]
]);

SELECT pg_temp.patch_mobile_path('public.brand_finance_claim_company_delivery(uuid, uuid)'::regprocedure,'ec41240c23970246855435d20b3cf08a',ARRAY[
  ARRAY[$old$coalesce(invoice#>>'{customer,phone}','') !~ '^9665[0-9]{8}$'$old$,$new$NOT brand_phone_private.canonical(p_cafe_id,coalesce(invoice#>>'{customer,phone}',''))$new$]
]);

SELECT pg_temp.patch_mobile_path('public.brand_finance_add_phone_staff(uuid, uuid, text, text)'::regprocedure,'4598d73103e21986899433837c95aae2',ARRAY[
  ARRAY[$old$regexp_replace(coalesce(u.phone,''),'^\+','') !~ '^9665[0-9]{8}$'$old$,$new$NOT brand_phone_private.canonical(p_cafe_id,regexp_replace(coalesce(u.phone,''),'^\+',''))$new$]
]);

SELECT pg_temp.patch_mobile_path('public.brand_finance_add_sales_cashier(uuid, uuid, text)'::regprocedure,'e1dd690a5dc9a2e57aaf444e4ac1d741',ARRAY[
  ARRAY[$old$regexp_replace(coalesce(v_user.phone,''),'^\+','') !~ '^9665[0-9]{8}$'$old$,$new$NOT brand_phone_private.canonical(p_cafe_id,regexp_replace(coalesce(v_user.phone,''),'^\+',''))$new$]
]);

SELECT pg_temp.patch_mobile_path('erp_purchase_private.maintenance_before_staff_permissions(uuid, uuid, timestamp with time zone, text, jsonb)'::regprocedure,'32b995eb6977f8a1fa832427291e0ed1',ARRAY[
  ARRAY[$old$regexp_replace(coalesce(target.phone,''),'^\+','') !~ '^9665[0-9]{8}$'$old$,$new$NOT brand_phone_private.canonical(p_cafe_id,regexp_replace(coalesce(target.phone,''),'^\+',''))$new$],
  ARRAY[$old$cashier_phone !~ '^9665[0-9]{8}$'$old$,$new$NOT brand_phone_private.canonical(p_cafe_id,cashier_phone)$new$]
]);

SELECT pg_temp.patch_mobile_path('public.brand_finance_link_sales_cashier(uuid, text, text)'::regprocedure,'f9641a77bf0388620d96c63da09a84b4',ARRAY[
  ARRAY[$old$p_phone !~ '^9665[0-9]{8}$'$old$,$new$NOT brand_phone_private.canonical(p_cafe_id,p_phone)$new$]
]);

SELECT pg_temp.patch_mobile_path('public.create_cafe_staff_whatsapp(uuid, text, text, text, boolean, boolean, text)'::regprocedure,'0d0d29a300ce955831f50e6a77ccc1d3',ARRAY[
  ARRAY[$old$p_phone !~ '^\+9665[0-9]{8}$'$old$,$new$p_phone IS DISTINCT FROM '+'||brand_phone_private.normalize(p_cafe_id,p_phone)$new$]
]);

SELECT pg_temp.patch_mobile_path('public.create_cafe_cashier_with_contact(uuid, text, text, text, text, text)'::regprocedure,'0915d35a8e81b14022fa885d316a7135',ARRAY[
  ARRAY[$old$IF v_phone ~ '^05[0-9]{8}$' THEN v_phone:='+966'||substr(v_phone,2);$old$,$new$IF brand_phone_private.normalize(p_cafe_id,v_phone) IS NOT NULL THEN v_phone:='+'||brand_phone_private.normalize(p_cafe_id,v_phone);
  ELSIF (SELECT phone_country FROM public.cafes WHERE id=p_cafe_id)='PS' THEN RAISE EXCEPTION 'Invalid phone';$new$]
]);

SELECT pg_temp.patch_mobile_path('public.begin_staff_otp(uuid, text, text, text, text, text)'::regprocedure,'14284762afa7b0f337a56becc61ec7ce',ARRAY[
  ARRAY[$old$9665[0-9]{8}$old$,$new$(9665[0-9]{8}|9705[69][0-9]{7})$new$],
  ARRAY[$old$WHERE c.auth_method='whatsapp_otp' AND c.phone=p_phone$old$,$new$WHERE brand_phone_private.canonical(b.id,substr(p_phone,2)) AND c.auth_method='whatsapp_otp' AND c.phone=p_phone$new$]
]);

SELECT pg_temp.patch_mobile_path('public.begin_finance_sales_cashier_otp_request(text, text, text, integer)'::regprocedure,'cba55234ec2d478504c166101d779e99',ARRAY[
  ARRAY[$old$9665[0-9]{8}$old$,$new$(9665[0-9]{8}|9705[69][0-9]{7})$new$],
  ARRAY[$old$WHERE u.phone IN($old$,$new$WHERE brand_phone_private.canonical(c.id,p_phone_normalized) AND u.phone IN($new$]
]);

SELECT pg_temp.patch_mobile_path('public.brand_finance_sales_cashier_phone_enabled(text)'::regprocedure,'3d2d10d473ca6644810d60cf5b95c13d',ARRAY[
  ARRAY[$old$9665[0-9]{8}$old$,$new$(9665[0-9]{8}|9705[69][0-9]{7})$new$],
  ARRAY[$old$WHERE u.phone IN($old$,$new$WHERE brand_phone_private.canonical(c.id,p_phone) AND u.phone IN($new$]
]);

SELECT pg_temp.patch_mobile_path('phone_otp_delivery_private.claim_admission(text, text)'::regprocedure,'0ae72c435c8805a8f1045b9355a65ec4',ARRAY[
  ARRAY[$old$9665[0-9]{8}$old$,$new$(9665[0-9]{8}|9705[69][0-9]{7})$new$],
  ARRAY[$old$AND c.deleted_at IS NULL$old$,$new$AND c.deleted_at IS NULL AND brand_phone_private.canonical(c.id,p_phone_normalized)$new$]
]);

SELECT pg_temp.patch_mobile_path('public.enqueue_customer_phone_otp_delivery(text, text, text, text)'::regprocedure,'2906e659c3052f13b857c7bd21e80a5b',ARRAY[
  ARRAY[$old$9665[0-9]{8}$old$,$new$(9665[0-9]{8}|9705[69][0-9]{7})$new$]
]);

SELECT pg_temp.patch_mobile_path('public.begin_phone_verification_challenge(uuid, text, text, text, text, integer, integer, integer, integer, integer)'::regprocedure,'8c06668cf76b24b43b22d794f4a13cf4',ARRAY[
  ARRAY[$old$
BEGIN
  PERFORM pg_advisory_xact_lock($old$,$new$
BEGIN
  IF NOT brand_phone_private.canonical(p_cafe_id,p_phone_normalized) THEN RAISE EXCEPTION 'Invalid customer phone' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock($new$]
]);

SELECT pg_temp.patch_mobile_path('public.verify_phone_verification_challenge(uuid, text, text, text, text, integer, integer)'::regprocedure,'18434ad7f6f1fbbb41392e3774dfa0ef',ARRAY[
  ARRAY[$old$
BEGIN
  PERFORM pg_advisory_xact_lock($old$,$new$
BEGIN
  IF NOT brand_phone_private.canonical(p_cafe_id,p_phone_normalized) THEN RAISE EXCEPTION 'Invalid customer phone' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock($new$]
]);

SELECT pg_temp.patch_mobile_path('public.register_verified_customer(uuid, text, uuid, text, text, text, text)'::regprocedure,'53556979d92cb70720be0bc91462cfd4',ARRAY[
  ARRAY[$old$
BEGIN
  SELECT c.*$old$,$new$
BEGIN
  IF NOT brand_phone_private.canonical(p_cafe_id,p_phone_normalized) THEN RAISE EXCEPTION 'Invalid customer phone' USING ERRCODE='22023'; END IF;
  SELECT c.*$new$]
]);

SELECT pg_temp.patch_mobile_path('public.finalize_customer_phone_auth(uuid, text, uuid, text, text, uuid)'::regprocedure,'5a04397891bc32384444e9831d057ba6',ARRAY[
  ARRAY[$old$
BEGIN
  PERFORM pg_advisory_xact_lock($old$,$new$
BEGIN
  IF NOT brand_phone_private.canonical(p_cafe_id,p_phone_normalized) THEN RAISE EXCEPTION 'Invalid customer phone' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock($new$]
]);

SELECT pg_temp.patch_mobile_path('public.begin_customer_phone_otp_request(uuid, text, text, text, integer, integer, integer, integer)'::regprocedure,'9cfe609ff2958f722c8b13b434d7a1da',ARRAY[
  ARRAY[$old$
BEGIN
  PERFORM pg_advisory_xact_lock($old$,$new$
BEGIN
  IF NOT brand_phone_private.canonical(p_cafe_id,p_phone_normalized) THEN RAISE EXCEPTION 'Invalid customer phone' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock($new$]
]);

SELECT pg_temp.patch_mobile_path('public.link_customer_after_supabase_phone_otp(uuid, text, text, uuid, text)'::regprocedure,'5ecfc6f28c9e7215ebf88acdbcce8b82',ARRAY[
  ARRAY[$old$
BEGIN
  IF p_purpose NOT IN ('customer_signup', 'customer_login') THEN$old$,$new$
BEGIN
  IF NOT brand_phone_private.canonical(p_cafe_id,p_phone_normalized) THEN RAISE EXCEPTION 'Invalid customer phone' USING ERRCODE='22023'; END IF;
  IF p_purpose NOT IN ('customer_signup', 'customer_login') THEN$new$]
]);

SELECT pg_temp.patch_mobile_path('public.pager_create_order(uuid, uuid, text, text, text, text, uuid, text)'::regprocedure,'ea492fcfa4a0ae4783a406560d8be05b',ARRAY[
  ARRAY[$old$p_phone !~ '^9665[0-9]{8}$'$old$,$new$NOT brand_phone_private.canonical(p_cafe,p_phone)$new$]
]);

SELECT pg_temp.patch_mobile_path('public.pager_customer_directory(uuid, text, text, integer)'::regprocedure,'ef5cbe38c141abda8f2355d272eb929b',ARRAY[
  ARRAY[$old$p_phone !~ '^9665[0-9]{8}$'$old$,$new$NOT brand_phone_private.canonical(p_cafe,p_phone)$new$]
]);

SELECT pg_temp.patch_mobile_path('public.pager_customer_directory_range(uuid, text, text, integer, timestamp with time zone, timestamp with time zone)'::regprocedure,'9319fac74e4fd9af75b1e976dc84f874',ARRAY[
  ARRAY[$old$p_phone !~ '^9665[0-9]{8}$'$old$,$new$NOT brand_phone_private.canonical(p_cafe,p_phone)$new$]
]);

SELECT pg_temp.patch_mobile_path('public.salon_create_booking(uuid, uuid, text, text, uuid, timestamp with time zone, text, text)'::regprocedure,'e8c59e539175e87387194e6bbc410321',ARRAY[
  ARRAY[$old$p_phone !~ '^9665[0-9]{8}$'$old$,$new$NOT brand_phone_private.canonical(p_cafe,p_phone)$new$]
]);

SELECT pg_temp.patch_mobile_path('public.loco_claim_whatsapp_connection(uuid, uuid, text)'::regprocedure,'c6dd44fd9f2312f2cebf37cd8b5d57dd',ARRAY[
  ARRAY[$old$p_phone!~'^9665[0-9]{8}$'$old$,$new$NOT brand_phone_private.canonical(p_cafe,p_phone)$new$]
]);

SELECT pg_temp.patch_mobile_path('public.marketing_create_campaign(uuid, uuid, uuid, text, text, text, text[], timestamp with time zone, uuid)'::regprocedure,'c8366b8058096b9060c7854f0b3133bb',ARRAY[
  ARRAY[$old$x!~'^9665[0-9]{8}$'$old$,$new$NOT brand_phone_private.canonical(p_cafe,x)$new$]
]);

SELECT pg_temp.patch_mobile_path('public.gift_order_submit(text, uuid, jsonb, text)'::regprocedure,'c648fbbc95884eee1981740cde4d6307',ARRAY[
  ARRAY[$old$v_phone:=p_payload->>'phone'$old$,$new$v_phone:=brand_phone_private.normalize(c,p_payload->>'phone')$new$],
  ARRAY[$old$coalesce(v_phone,'')!~'^9665[0-9]{8}$'$old$,$new$NOT brand_phone_private.canonical(c,coalesce(v_phone,''))$new$]
]);

SELECT pg_temp.patch_mobile_path('salon_private.queue_message(salon_bookings, text)'::regprocedure,'1781a3362a017b51e987b9fc4c68465f',ARRAY[
  ARRAY[$old$IF recipient ~ '^05[0-9]{8}$' THEN recipient:='966'||substr(recipient,2); END IF;$old$,$new$recipient:=brand_phone_private.normalize(p_booking.cafe_id,recipient);$new$],
  ARRAY[$old$recipient ~ '^9665[0-9]{8}$'$old$,$new$brand_phone_private.canonical(p_booking.cafe_id,recipient)$new$]
]);

SELECT pg_temp.patch_mobile_path('public.platform_marketing_contacts(uuid, text, text)'::regprocedure,'09b36ecada8dce7a2b96980d4dc2c452',ARRAY[
  ARRAY[$old$public.normalize_customer_phone(translate(p.phone$old$,$new$brand_phone_private.normalize(p.cafe_id,translate(p.phone$new$],
  ARRAY[$old$public.normalize_customer_phone(translate(l.customer_phone$old$,$new$brand_phone_private.normalize(l.cafe_id,translate(l.customer_phone$new$],
  ARRAY[$old$r.phone ~ '^9665[0-9]{8}$'$old$,$new$brand_phone_private.canonical(r.cafe_id,r.phone)$new$]
]);

SELECT pg_temp.patch_mobile_path('public.platform_marketing_create_campaign(uuid, uuid, text, text, uuid, uuid, text, text[], timestamp with time zone)'::regprocedure,'b8c4f7bfa284f698040b9f8c4af88302',ARRAY[
  ARRAY[$old$p!~'^9665[0-9]{8}$'$old$,$new$p!~'^(9665[0-9]{8}|9705[69][0-9]{7})$' OR (p_cafe IS NOT NULL AND NOT brand_phone_private.canonical(p_cafe,p))$new$]
]);

SELECT pg_temp.patch_mobile_path('public.erp_family_execute(uuid, text, jsonb)'::regprocedure,'fd9bcd94731cd77d52650ca56a346838',ARRAY[
  ARRAY[$old$erp_family_private.phone(profile$old$,$new$brand_phone_private.normalize(c,profile$new$]
]);

SELECT pg_temp.patch_mobile_path('public.erp_family_portal_phone(text, text)'::regprocedure,'54270c5433a13b849ca35b1bde1c624b',ARRAY[
  ARRAY[$old$erp_family_private.phone(p_phone)$old$,$new$brand_phone_private.normalize(b.id,p_phone)$new$]
]);

SELECT pg_temp.patch_mobile_path('public.erp_family_portal(text, uuid)'::regprocedure,'fee26f5af2f2fe02f78fa3b5d5bcba8e',ARRAY[
  ARRAY[$old$erp_family_private.phone(phone)$old$,$new$ltrim(phone,'+')$new$],
  ARRAY[$old$WHERE cafe_id=c.id AND phone_key=contact$old$,$new$WHERE cafe_id=c.id AND brand_phone_private.canonical(c.id,contact) AND phone_key=contact$new$]
]);

SELECT pg_temp.patch_mobile_path('erp_lab_private.execute(uuid, text, jsonb)'::regprocedure,'b3d94b2380cfbb49e00c45052487af84',ARRAY[
  ARRAY[$old$erp_lab_private.normalize_phone(p->>'phone')$old$,$new$coalesce(brand_phone_private.normalize(c,p->>'phone'),CASE WHEN (SELECT phone_country FROM public.cafes WHERE id=c)='SA' THEN erp_lab_private.normalize_phone(p->>'phone') END)$new$],
  ARRAY[$old$erp_lab_private.normalize_phone(p.phone)$old$,$new$coalesce(brand_phone_private.normalize(c,p.phone),CASE WHEN (SELECT phone_country FROM public.cafes WHERE id=c)='SA' THEN erp_lab_private.normalize_phone(p.phone) END)$new$],
  ARRAY[$old$erp_lab_private.normalize_phone(party_match.phone)$old$,$new$coalesce(brand_phone_private.normalize(c,party_match.phone),CASE WHEN (SELECT phone_country FROM public.cafes WHERE id=c)='SA' THEN erp_lab_private.normalize_phone(party_match.phone) END)$new$],
  ARRAY[$old$أدخل رقم جوال سعودي أو رقمًا دوليًا مع مفتاح الدولة$old$,$new$أدخل رقم جوال صحيحًا للعميل$new$]
]);

SELECT pg_temp.patch_mobile_path('public.admin_prepare_brand_owner_edit(uuid, uuid, uuid, jsonb, text, text)'::regprocedure,'84223d491a8f2dd613c74893c745e11c',ARRAY[
  ARRAY[$old$p_details->>'phone' !~ '^9665[0-9]{8}$'$old$,$new$NOT brand_phone_private.canonical(p_cafe,p_details->>'phone')$new$]
]);

SELECT pg_temp.patch_mobile_path('public.admin_brand_onboarding_status()'::regprocedure,'4a789ef5047247d51e747163dfa7e52f',ARRAY[
  ARRAY[$old$coalesce(draft->>'phone','') ~ '^9665[0-9]{8}$'$old$,$new$brand_phone_private.canonical(cafe_id,coalesce(draft->>'phone',''))$new$]
]);

SELECT pg_temp.patch_mobile_path('public.admin_claim_brand_welcome(uuid, uuid, uuid, boolean)'::regprocedure,'ba9874e87053d80bf0bbc35eac6a04ce',ARRAY[
  ARRAY[$old$coalesce(v.draft->>'phone','') !~ '^9665[0-9]{8}$'$old$,$new$NOT brand_phone_private.canonical(p_cafe,coalesce(v.draft->>'phone',''))$new$]
]);

SELECT pg_temp.patch_mobile_path('public.enqueue_owner_companion_guides(text, text)'::regprocedure,'0ee996f025f0af585db2e5f83a7787ed',ARRAY[
  ARRAY[$old$9665[0-9]{8}$old$,$new$(9665[0-9]{8}|9705[69][0-9]{7})$new$]
]);

SELECT pg_temp.patch_mobile_path('subscription_reminders_private.phone(text)'::regprocedure,'33d90679f876853899b240f1c63bb8e4',ARRAY[
  ARRAY[$old$digits ~ '^9665[0-9]{8}$'$old$,$new$digits ~ '^(9665[0-9]{8}|9705[69][0-9]{7})$'$new$],
  ARRAY[$old$digits ~ '^009665[0-9]{8}$'$old$,$new$digits ~ '^00(9665[0-9]{8}|9705[69][0-9]{7})$'$new$]
]);

SELECT pg_temp.patch_mobile_path('brand_finance_private.close_cash_handover(uuid, uuid, jsonb)'::regprocedure,'37686851de1590d5dab5234060633fef',ARRAY[
  ARRAY[$old$IF v_phone ~ '^05[0-9]{8}$' THEN v_phone:='966'||substr(v_phone,2);$old$,$new$IF brand_phone_private.normalize(p_cafe,v_phone) IS NOT NULL THEN v_phone:=brand_phone_private.normalize(p_cafe,v_phone); ELSIF (SELECT phone_country FROM public.cafes WHERE id=p_cafe)='PS' THEN RAISE EXCEPTION 'Invalid recipient phone';$new$]
]);

ALTER TABLE public.pager_orders
  DROP CONSTRAINT pager_orders_phone_check,
  ADD CONSTRAINT pager_orders_phone_check CHECK ((phone ~ '^(9665[0-9]{8}|9705[69][0-9]{7})$'::text)) NOT VALID;
ALTER TABLE public.pager_orders VALIDATE CONSTRAINT pager_orders_phone_check;

ALTER TABLE public.phone_verification_challenges
  DROP CONSTRAINT phone_verification_challenges_phone_check,
  ADD CONSTRAINT phone_verification_challenges_phone_check CHECK ((phone_normalized ~ '^(9665[0-9]{8}|9705[69][0-9]{7})$'::text)) NOT VALID;
ALTER TABLE public.phone_verification_challenges VALIDATE CONSTRAINT phone_verification_challenges_phone_check;

ALTER TABLE public.customer_phone_auth_identities
  DROP CONSTRAINT customer_phone_auth_identity_phone_check,
  ADD CONSTRAINT customer_phone_auth_identity_phone_check CHECK ((phone_normalized ~ '^(9665[0-9]{8}|9705[69][0-9]{7})$'::text)) NOT VALID;
ALTER TABLE public.customer_phone_auth_identities VALIDATE CONSTRAINT customer_phone_auth_identity_phone_check;

ALTER TABLE public.customer_phone_otp_requests
  DROP CONSTRAINT customer_phone_otp_requests_phone_check,
  ADD CONSTRAINT customer_phone_otp_requests_phone_check CHECK ((phone_normalized ~ '^(9665[0-9]{8}|9705[69][0-9]{7})$'::text)) NOT VALID;
ALTER TABLE public.customer_phone_otp_requests VALIDATE CONSTRAINT customer_phone_otp_requests_phone_check;

ALTER TABLE public.salon_bookings
  DROP CONSTRAINT salon_bookings_phone_check,
  ADD CONSTRAINT salon_bookings_phone_check CHECK ((phone ~ '^(9665[0-9]{8}|9705[69][0-9]{7})$'::text)) NOT VALID;
ALTER TABLE public.salon_bookings VALIDATE CONSTRAINT salon_bookings_phone_check;

ALTER TABLE public.bf_documents
  DROP CONSTRAINT bf_documents_customer_phone_check,
  ADD CONSTRAINT bf_documents_customer_phone_check CHECK (((customer_phone IS NULL) OR (customer_phone ~ '^(9665[0-9]{8}|9705[69][0-9]{7})$'::text))) NOT VALID;
ALTER TABLE public.bf_documents VALIDATE CONSTRAINT bf_documents_customer_phone_check;

ALTER TABLE public.bf_sale_customers
  DROP CONSTRAINT bf_sale_customers_phone_check,
  ADD CONSTRAINT bf_sale_customers_phone_check CHECK ((phone ~ '^(9665[0-9]{8}|9705[69][0-9]{7})$'::text)) NOT VALID;
ALTER TABLE public.bf_sale_customers VALIDATE CONSTRAINT bf_sale_customers_phone_check;

ALTER TABLE platform_access_private.staff_otp_challenges
  DROP CONSTRAINT staff_otp_challenges_phone_check,
  ADD CONSTRAINT staff_otp_challenges_phone_check CHECK ((phone ~ '^\+(9665[0-9]{8}|9705[69][0-9]{7})$'::text)) NOT VALID;
ALTER TABLE platform_access_private.staff_otp_challenges VALIDATE CONSTRAINT staff_otp_challenges_phone_check;

ALTER TABLE public.brand_marketing_connections
  DROP CONSTRAINT brand_marketing_connections_requested_phone_check,
  ADD CONSTRAINT brand_marketing_connections_requested_phone_check CHECK ((requested_phone ~ '^(9665[0-9]{8}|9705[69][0-9]{7})$'::text)) NOT VALID;
ALTER TABLE public.brand_marketing_connections VALIDATE CONSTRAINT brand_marketing_connections_requested_phone_check;

ALTER TABLE public.brand_marketing_recipients
  DROP CONSTRAINT brand_marketing_recipients_phone_check,
  ADD CONSTRAINT brand_marketing_recipients_phone_check CHECK ((phone ~ '^(9665[0-9]{8}|9705[69][0-9]{7})$'::text)) NOT VALID;
ALTER TABLE public.brand_marketing_recipients VALIDATE CONSTRAINT brand_marketing_recipients_phone_check;

ALTER TABLE public.brand_marketing_suppressions
  DROP CONSTRAINT brand_marketing_suppressions_phone_check,
  ADD CONSTRAINT brand_marketing_suppressions_phone_check CHECK ((phone ~ '^(9665[0-9]{8}|9705[69][0-9]{7})$'::text)) NOT VALID;
ALTER TABLE public.brand_marketing_suppressions VALIDATE CONSTRAINT brand_marketing_suppressions_phone_check;

ALTER TABLE phone_otp_delivery_private.deliveries
  DROP CONSTRAINT deliveries_phone_normalized_check,
  ADD CONSTRAINT deliveries_phone_normalized_check CHECK ((phone_normalized ~ '^(9665[0-9]{8}|9705[69][0-9]{7})$'::text)) NOT VALID;
ALTER TABLE phone_otp_delivery_private.deliveries VALIDATE CONSTRAINT deliveries_phone_normalized_check;

ALTER TABLE public.salon_message_jobs
  DROP CONSTRAINT salon_message_jobs_phone_check,
  ADD CONSTRAINT salon_message_jobs_phone_check CHECK ((phone ~ '^(9665[0-9]{8}|9705[69][0-9]{7})$'::text)) NOT VALID;
ALTER TABLE public.salon_message_jobs VALIDATE CONSTRAINT salon_message_jobs_phone_check;

ALTER TABLE public.gift_orders
  DROP CONSTRAINT gift_orders_phone_check,
  ADD CONSTRAINT gift_orders_phone_check CHECK ((phone ~ '^(9665[0-9]{8}|9705[69][0-9]{7})$'::text)) NOT VALID;
ALTER TABLE public.gift_orders VALIDATE CONSTRAINT gift_orders_phone_check;

ALTER TABLE public.platform_marketing_recipients
  DROP CONSTRAINT platform_marketing_recipients_phone_check,
  ADD CONSTRAINT platform_marketing_recipients_phone_check CHECK ((phone ~ '^(9665[0-9]{8}|9705[69][0-9]{7})$'::text)) NOT VALID;
ALTER TABLE public.platform_marketing_recipients VALIDATE CONSTRAINT platform_marketing_recipients_phone_check;

ALTER TABLE brand_loyalty_analytics_private.coupons
  DROP CONSTRAINT coupons_phone_check,
  ADD CONSTRAINT coupons_phone_check CHECK ((phone ~ '^(9665[0-9]{8}|9705[69][0-9]{7})$'::text)) NOT VALID;
ALTER TABLE brand_loyalty_analytics_private.coupons VALIDATE CONSTRAINT coupons_phone_check;

ALTER TABLE public.pager_customers
  DROP CONSTRAINT pager_customers_phone_check,
  ADD CONSTRAINT pager_customers_phone_check CHECK ((phone ~ '^(9665[0-9]{8}|9705[69][0-9]{7})$'::text)) NOT VALID;
ALTER TABLE public.pager_customers VALIDATE CONSTRAINT pager_customers_phone_check;

ALTER TABLE public.erp_points_ledger
  DROP CONSTRAINT erp_points_ledger_phone_check,
  ADD CONSTRAINT erp_points_ledger_phone_check CHECK ((phone ~ '^(9665[0-9]{8}|9705[69][0-9]{7})$'::text)) NOT VALID;
ALTER TABLE public.erp_points_ledger VALIDATE CONSTRAINT erp_points_ledger_phone_check;

ALTER TABLE public.subscription_renewal_reminders
  DROP CONSTRAINT subscription_renewal_reminders_phone_check,
  ADD CONSTRAINT subscription_renewal_reminders_phone_check CHECK ((phone ~ '^(9665[0-9]{8}|9705[69][0-9]{7})$'::text)) NOT VALID;
ALTER TABLE public.subscription_renewal_reminders VALIDATE CONSTRAINT subscription_renewal_reminders_phone_check;

ALTER TABLE public.brand_staff_accounts
  DROP CONSTRAINT brand_staff_accounts_phone_check,
  ADD CONSTRAINT brand_staff_accounts_phone_check CHECK ((phone ~ '^\+(9665[0-9]{8}|9705[69][0-9]{7})$'::text)) NOT VALID;
ALTER TABLE public.brand_staff_accounts VALIDATE CONSTRAINT brand_staff_accounts_phone_check;

ALTER TABLE owner_guide_private.jobs
  DROP CONSTRAINT jobs_phone_check,
  ADD CONSTRAINT jobs_phone_check CHECK ((phone ~ '^(9665[0-9]{8}|9705[69][0-9]{7})$'::text)) NOT VALID;
ALTER TABLE owner_guide_private.jobs VALIDATE CONSTRAINT jobs_phone_check;

DROP FUNCTION pg_temp.patch_mobile_path(regprocedure,text,text[]);
COMMIT;
