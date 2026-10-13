-- Execute inside BEGIN/ROLLBACK only. No real account or message is created.
DO $test$
DECLARE
  actor uuid; owner_id uuid := 'f0000000-0000-4000-8000-000000000201';
  request_id uuid := 'f0000000-0000-4000-8000-000000000202';
  attempt uuid := 'f0000000-0000-4000-8000-000000000203';
  next_attempt uuid := 'f0000000-0000-4000-8000-000000000204';
  draft jsonb := '{"brandName":"Preparation fixture","brandNameEn":"Fixture","slug":"admin-preparation-fixture","ownerName":"Fixture owner","phone":"966500000099","email":"","category":"cafes_coffee"}';
  prepared jsonb; claimed jsonb; cid uuid; sub public.subscriptions%ROWTYPE; sent_time timestamptz := now();
BEGIN
  SELECT id INTO STRICT actor FROM public.profiles WHERE role='platform_admin' AND status='active' ORDER BY id LIMIT 1;
  IF has_function_privilege('authenticated','public.admin_prepare_brand_account(uuid,uuid,jsonb,text,text)','EXECUTE')
    OR has_function_privilege('anon','public.admin_brand_onboarding_status()','EXECUTE')
    OR has_schema_privilege('authenticated','brand_onboarding_private','USAGE') THEN RAISE EXCEPTION 'privileged surface exposed'; END IF;
  BEGIN
    PERFORM public.admin_prepare_brand_account(request_id,NULL,draft,repeat('a',64),repeat('x',60));
    RAISE EXCEPTION 'non-admin allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  prepared:=public.admin_prepare_brand_account(request_id,actor,draft,repeat('a',64),repeat('x',60));
  IF prepared->>'cafeId' IS NOT NULL THEN RAISE EXCEPTION 'brand created before Auth'; END IF;
  -- The real Auth trigger, including its unforgeable app_metadata proof, is exercised.
  BEGIN
    INSERT INTO auth.users(id,phone,encrypted_password,raw_app_meta_data,raw_user_meta_data,aud,role)
      VALUES(owner_id,'966500000099','fixture-hash',jsonb_build_object('admin_brand_onboarding_id',request_id,'admin_brand_onboarding_proof','wrong'),
        '{"account_type":"cafe_owner"}','authenticated','authenticated');
    RAISE EXCEPTION 'forged proof accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  INSERT INTO auth.users(id,phone,encrypted_password,raw_app_meta_data,raw_user_meta_data,phone_confirmed_at,aud,role)
    VALUES(owner_id,'966500000099','fixture-hash',jsonb_build_object('admin_brand_onboarding_id',request_id,'admin_brand_onboarding_proof',prepared->>'proof'),
      '{"account_type":"cafe_owner"}',now(),'authenticated','authenticated');
  prepared:=public.admin_prepare_brand_account(request_id,actor,draft,repeat('a',64),repeat('x',60));
  cid:=(prepared->>'cafeId')::uuid;
  IF cid IS NULL OR NOT EXISTS(SELECT 1 FROM public.cafe_members WHERE cafe_id=cid AND user_id=owner_id AND role='owner') THEN RAISE EXCEPTION 'missing prepared brand'; END IF;
  SELECT * INTO STRICT sub FROM public.subscriptions WHERE cafe_id=cid;
  IF sub.status<>'trialing' OR sub.expires_at IS NOT NULL OR sub.duration_count<>7 OR sub.activation_source<>'admin_prepared_trial' THEN RAISE EXCEPTION 'trial timer started before send'; END IF;
  UPDATE auth.users SET encrypted_password='changed-hash' WHERE id=owner_id;
  BEGIN
    PERFORM public.admin_claim_brand_welcome(actor,cid,attempt,false);
    RAISE EXCEPTION 'stale password allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'OWNER_PASSWORD_CHANGED' THEN RAISE; END IF; END;
  UPDATE auth.users SET encrypted_password='fixture-hash' WHERE id=owner_id;
  claimed:=public.admin_claim_brand_welcome(actor,cid,attempt,false);
  IF claimed->>'phone'<>'966500000099' OR claimed->>'ciphertext'<>repeat('x',60) THEN RAISE EXCEPTION 'wrong private manifest'; END IF;
  BEGIN
    PERFORM public.admin_claim_brand_welcome(actor,cid,next_attempt,false);
    RAISE EXCEPTION 'duplicate send allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'SEND_IN_PROGRESS' THEN RAISE; END IF; END;
  PERFORM public.admin_fail_brand_welcome(actor,cid,attempt,false);
  IF EXISTS(SELECT 1 FROM public.subscriptions WHERE cafe_id=cid AND expires_at IS NOT NULL) THEN RAISE EXCEPTION 'failure started timer'; END IF;
  PERFORM public.admin_claim_brand_welcome(actor,cid,next_attempt,false);
  PERFORM public.admin_fail_brand_welcome(actor,cid,next_attempt,true);
  BEGIN
    PERFORM public.admin_claim_brand_welcome(actor,cid,attempt,false);
    RAISE EXCEPTION 'uncertain result silently resent';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'SEND_UNCERTAIN' THEN RAISE; END IF; END;
  PERFORM public.admin_claim_brand_welcome(actor,cid,attempt,true);
  PERFORM public.admin_finish_brand_welcome(actor,cid,attempt,'fixture-provider-id',sent_time);
  SELECT * INTO STRICT sub FROM public.subscriptions WHERE cafe_id=cid;
  IF sub.started_at<>sent_time OR sub.expires_at<>sent_time+interval '7 days' OR sub.activation_source<>'admin_whatsapp_trial' THEN RAISE EXCEPTION 'incorrect trial window'; END IF;
  IF EXISTS(SELECT 1 FROM brand_onboarding_private.accounts WHERE cafe_id=cid AND (password_ciphertext IS NOT NULL OR owner_password_hash IS NOT NULL)) THEN RAISE EXCEPTION 'credential copy retained'; END IF;
  PERFORM public.admin_finish_brand_welcome(actor,cid,next_attempt,'another-id',sent_time+interval '1 day');
  IF (SELECT expires_at FROM public.subscriptions WHERE cafe_id=cid)<>sent_time+interval '7 days' THEN RAISE EXCEPTION 'retry extended trial'; END IF;
  IF NOT (public.admin_claim_brand_welcome(actor,cid,next_attempt,false)->>'sent')::boolean THEN RAISE EXCEPTION 'sent account could resend'; END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  IF public.admin_brand_onboarding_status()::text LIKE '%ciphertext%' OR public.admin_brand_onboarding_status()::text LIKE '%fixture-hash%' THEN RAISE EXCEPTION 'safe summary leaks secrets'; END IF;
  PERFORM public.admin_delete_brand(cid,'admin-preparation-fixture');
  IF EXISTS(SELECT 1 FROM brand_onboarding_private.accounts WHERE id=request_id) THEN RAISE EXCEPTION 'brand deletion retained onboarding details'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=owner_id) THEN RAISE EXCEPTION 'shared identity unexpectedly deleted'; END IF;
END $test$;
