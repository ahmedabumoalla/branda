-- Caller must BEGIN and ROLLBACK. Reproduce Auth API INSERT -> app_metadata UPDATE
DO $test$
DECLARE actor uuid; req uuid:='f0000000-0000-4000-8000-000000000411';
  draft jsonb:='{"brandName":"Auth order fixture","brandNameEn":"","slug":"admin-auth-order-fixture","ownerName":"","phone":"","email":"","passwordReady":false,"category":"cafes_coffee"}'; p jsonb; cid uuid;
BEGIN
  SELECT id INTO STRICT actor FROM public.profiles WHERE role='platform_admin' AND status='active' ORDER BY id LIMIT 1;
  p:=public.admin_prepare_brand_account(req,actor,draft,repeat('f',64),repeat('x',60));
  -- Auth inserts only provider metadata first, even when createUser receives app_metadata
  INSERT INTO auth.users(id,email,phone,encrypted_password,raw_app_meta_data,raw_user_meta_data,aud,role)
    VALUES(req,'prepared-'||req::text||'@accounts.barndaksa.invalid',NULL,'fixture-hash','{"provider":"email","providers":["email"]}','{"account_type":"cafe_owner"}','authenticated','authenticated');
  UPDATE auth.users SET raw_app_meta_data=raw_app_meta_data||jsonb_build_object('admin_brand_onboarding_id',req,'admin_brand_onboarding_proof',p->>'proof') WHERE id=req;
  cid:=(public.admin_prepare_brand_account(req,actor,draft,repeat('f',64),repeat('x',60))->>'cafeId')::uuid;
  IF cid IS NULL OR NOT EXISTS(SELECT 1 FROM public.cafe_members WHERE cafe_id=cid AND user_id=req AND role='owner') THEN RAISE EXCEPTION 'Auth order did not create maintenance account'; END IF;
  IF EXISTS(SELECT 1 FROM public.subscriptions WHERE cafe_id=cid AND expires_at IS NOT NULL) THEN RAISE EXCEPTION 'Auth creation started trial clock'; END IF;
  IF EXISTS(SELECT 1 FROM public.profiles WHERE id=req AND (coalesce(phone,'')<>'' OR coalesce(email::text,'')<>'')) THEN RAISE EXCEPTION 'Synthetic identity exposed as contact'; END IF;
  BEGIN
    INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES(gen_random_uuid(),'forged-auth-order@example.invalid',jsonb_build_object('account_type','cafe_owner','admin_brand_onboarding_id',req,'admin_brand_onboarding_proof',p->>'proof'),'{}');
    RAISE EXCEPTION 'User metadata bypassed staged identity';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.admin_claim_brand_welcome(actor,cid,gen_random_uuid(),false); RAISE EXCEPTION 'Incomplete owner can receive message';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'OWNER_DETAILS_REQUIRED' THEN RAISE; END IF; END;
  req:='f0000000-0000-4000-8000-000000000412';
  draft:=draft||'{"slug":"admin-auth-phone-order-fixture","ownerName":"Fixture owner","phone":"966500000097","passwordReady":true}'::jsonb;
  p:=public.admin_prepare_brand_account(req,actor,draft,repeat('e',64),repeat('x',60));
  BEGIN
    INSERT INTO auth.users(id,phone,encrypted_password,raw_app_meta_data,raw_user_meta_data,aud,role)
      VALUES(req,'966500000096','fixture-hash','{"provider":"phone"}','{"account_type":"cafe_owner"}','authenticated','authenticated');
    RAISE EXCEPTION 'Staged identity accepted different phone';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  INSERT INTO auth.users(id,phone,encrypted_password,raw_app_meta_data,raw_user_meta_data,aud,role)
    VALUES(req,'966500000097','fixture-hash','{"provider":"phone"}','{"account_type":"cafe_owner"}','authenticated','authenticated');
  UPDATE auth.users SET raw_app_meta_data=raw_app_meta_data||jsonb_build_object('admin_brand_onboarding_id',req,'admin_brand_onboarding_proof',p->>'proof'),phone_confirmed_at=now() WHERE id=req;
  cid:=(public.admin_prepare_brand_account(req,actor,draft,repeat('e',64),repeat('x',60))->>'cafeId')::uuid;
  IF cid IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=req AND phone='966500000097') THEN RAISE EXCEPTION 'Phone Auth order failed'; END IF;
  IF EXISTS(SELECT 1 FROM public.subscriptions WHERE cafe_id=cid AND expires_at IS NOT NULL) THEN RAISE EXCEPTION 'Phone account started clock'; END IF;
END $test$;
