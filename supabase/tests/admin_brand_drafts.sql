-- Real schema / Auth triggers, synthetic rows, caller must BEGIN and ROLLBACK
DO $test$
DECLARE actor uuid; owner_id uuid:='f0000000-0000-4000-8000-000000000211'; req uuid:='f0000000-0000-4000-8000-000000000212';
  edit uuid:='f0000000-0000-4000-8000-000000000213'; attempt uuid:='f0000000-0000-4000-8000-000000000214';
  draft jsonb:='{"brandName":"Draft fixture","brandNameEn":"","slug":"admin-draft-fixture","ownerName":"","phone":"","email":"","passwordReady":false,"category":"cafes_coffee"}';
  details jsonb:='{"ownerName":"Fixture owner","phone":"966500000098","email":""}'; p jsonb; e jsonb; cid uuid; snapshot jsonb;
BEGIN
  SELECT id INTO STRICT actor FROM public.profiles WHERE role='platform_admin' AND status='active' ORDER BY id LIMIT 1;
  IF has_function_privilege('authenticated','public.admin_prepare_brand_owner_edit(uuid,uuid,uuid,jsonb,text,text)','EXECUTE') OR has_function_privilege('anon','public.admin_cancel_brand_owner_edit(uuid,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'edit surface exposed'; END IF;
  p:=public.admin_prepare_brand_account(req,actor,draft,repeat('b',64),repeat('x',60));
  INSERT INTO auth.users(id,email,phone,encrypted_password,raw_app_meta_data,raw_user_meta_data,aud,role)
    VALUES(owner_id,'prepared-'||req::text||'@accounts.barndaksa.invalid',NULL,'initial-hash',jsonb_build_object('admin_brand_onboarding_id',req,'admin_brand_onboarding_proof',p->>'proof'),'{"account_type":"cafe_owner"}','authenticated','authenticated');
  cid:=(public.admin_prepare_brand_account(req,actor,draft,repeat('b',64),repeat('x',60))->>'cafeId')::uuid;
  IF cid IS NULL OR NOT EXISTS(SELECT 1 FROM public.cafe_members WHERE cafe_id=cid AND user_id=owner_id AND role='owner') THEN RAISE EXCEPTION 'draft unavailable for maintenance'; END IF;
  IF EXISTS(SELECT 1 FROM public.profiles WHERE id=owner_id AND (coalesce(phone,'')<>'' OR coalesce(email::text,'')<>'')) THEN RAISE EXCEPTION 'fake contact data leaked'; END IF;
  BEGIN PERFORM public.admin_claim_brand_welcome(actor,cid,attempt,false); RAISE EXCEPTION 'incomplete send allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'OWNER_DETAILS_REQUIRED' THEN RAISE; END IF; END;
  BEGIN PERFORM public.admin_prepare_brand_owner_edit(owner_id,cid,edit,details,repeat('c',64),repeat('y',60)); RAISE EXCEPTION 'non-admin edit allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  e:=public.admin_prepare_brand_owner_edit(actor,cid,edit,details,repeat('c',64),repeat('y',60));
  BEGIN PERFORM public.admin_claim_brand_welcome(actor,cid,attempt,false); RAISE EXCEPTION 'send during edit allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'OWNER_EDIT_PENDING' THEN RAISE; END IF; END;
  BEGIN
    UPDATE auth.users SET phone='966500000098',encrypted_password='new-hash',raw_app_meta_data=raw_app_meta_data||jsonb_build_object('admin_brand_edit_id',edit,'admin_brand_edit_proof','forged','admin_brand_edit_attempt',gen_random_uuid()) WHERE id=owner_id;
    RAISE EXCEPTION 'forged update allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF EXISTS(SELECT 1 FROM auth.users WHERE id=owner_id AND phone IS NOT NULL) THEN RAISE EXCEPTION 'failed update changed Auth'; END IF;
  UPDATE auth.users SET phone='966500000098',phone_confirmed_at=now(),encrypted_password='new-hash',raw_app_meta_data=raw_app_meta_data||jsonb_build_object('admin_brand_edit_id',edit,'admin_brand_edit_proof',e->>'proof','admin_brand_edit_attempt',gen_random_uuid()) WHERE id=owner_id;
  IF NOT (public.admin_prepare_brand_owner_edit(actor,cid,edit,details,repeat('c',64),repeat('y',60))->>'done')::boolean THEN RAISE EXCEPTION 'ambiguous Auth result not recoverable'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.cafe_settings WHERE cafe_id=cid AND owner_phone='966500000098' AND owner_name='Fixture owner') THEN RAISE EXCEPTION 'contacts not atomic'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=owner_id AND phone='966500000098') THEN RAISE EXCEPTION 'login profile phone not updated'; END IF;
  IF EXISTS(SELECT 1 FROM public.subscriptions WHERE cafe_id=cid AND expires_at IS NOT NULL) THEN RAISE EXCEPTION 'editing started trial'; END IF;
  -- A late duplicate Auth update cannot overwrite finalized credentials
  BEGIN
    UPDATE auth.users SET encrypted_password='late-hash',raw_app_meta_data=raw_app_meta_data||jsonb_build_object('admin_brand_edit_attempt',gen_random_uuid()) WHERE id=owner_id;
    RAISE EXCEPTION 'late Auth update allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  SELECT item INTO snapshot FROM jsonb_array_elements(public.admin_brand_onboarding_status()) item WHERE item->>'cafeId'=cid::text;
  IF NOT (snapshot->>'detailsReady')::boolean OR NOT (snapshot->>'passwordReady')::boolean OR snapshot::text LIKE '%ciphertext%' THEN RAISE EXCEPTION 'readiness projection incorrect'; END IF;
  p:=public.admin_claim_brand_welcome(actor,cid,attempt,false);
  IF p->>'requestId'<>edit::text OR p->>'ciphertext'<>repeat('y',60) THEN RAISE EXCEPTION 'wrong password envelope'; END IF;
  PERFORM public.admin_finish_brand_welcome(actor,cid,attempt,'fixture-ack',now());
  BEGIN PERFORM public.admin_prepare_brand_owner_edit(actor,cid,gen_random_uuid(),details,repeat('d',64),NULL); RAISE EXCEPTION 'sent credentials editable';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'OWNER_EDIT_NOT_ALLOWED' THEN RAISE; END IF; END;
END $test$;
