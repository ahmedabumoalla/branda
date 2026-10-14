-- Synthetic staff only, inside a transaction that the runner always rolls back.
DO $$
DECLARE brand uuid; owner_id uuid; staff uuid; legacy uuid; challenge uuid; phone text; r jsonb; n int; legacy_email text; login_token text;
 sh text:=repeat('a',64); ch text:=repeat('b',64); iph text:=repeat('c',64); ph text:=repeat('d',64);
BEGIN
 SELECT c.id,c.owner_user_id INTO brand,owner_id FROM public.cafes c JOIN public.profiles p ON p.id=c.owner_user_id AND p.status='active'
 WHERE c.deleted_at IS NULL AND c.status IN ('active','published') AND platform_access_private.service_enabled(c.id,'loyalty') LIMIT 1;
 ASSERT brand IS NOT NULL;
 phone:='+9665'||lpad((floor(random()*100000000)::bigint)::text,8,'0');
 ph:=md5(phone)||md5(phone); iph:=md5(phone||'ip')||md5(phone||'ip');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 staff:=public.create_cafe_staff_whatsapp(brand,'OTP Test Staff',phone,NULL,true,false,'Test station');
 ASSERT EXISTS(SELECT 1 FROM public.cafe_cashiers WHERE id=staff AND email IS NULL AND password_hash IS NULL AND temporary_password='' AND auth_method='whatsapp_otp' AND pager_station='Test station');
 BEGIN
  PERFORM public.create_cafe_staff_whatsapp(brand,'Duplicate Staff',phone);
  RAISE EXCEPTION 'Duplicate phone allowed';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 PERFORM set_config('request.jwt.claims','{}',true);
 BEGIN
  PERFORM public.create_cafe_staff_whatsapp(brand,'Forbidden Staff','+966500000000');
  RAISE EXCEPTION 'Unauthorized create allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 legacy_email:='otp-regression-'||gen_random_uuid()||'@example.test';
 legacy:=public.create_cafe_cashier_with_contact(brand,'Legacy Test Staff',legacy_email,'Regression9!',phone,NULL);
 SELECT token INTO login_token FROM public.login_cafe_cashier(legacy_email,'Regression9!');
 ASSERT login_token IS NOT NULL,'Legacy password login preserved';
 ASSERT EXISTS(SELECT 1 FROM public.cafe_cashiers WHERE id=legacy AND auth_method='password');
 challenge:=gen_random_uuid();
 r:=public.begin_staff_otp(challenge,phone,ph,iph,sh,ch);
 ASSERT (r->>'ok')::boolean AND r->>'brandName' IS NOT NULL;
 ASSERT (SELECT cashier_id=staff FROM platform_access_private.staff_otp_challenges WHERE id=challenge),'OTP selects new account only, even if legacy phone matches';
 ASSERT NOT (public.verify_staff_otp(challenge,sh,ch)->>'ok')::boolean,'Unsent code rejected';
 ASSERT public.mark_staff_otp_sent(challenge,sh);
 ASSERT NOT (public.verify_staff_otp(challenge,repeat('e',64),ch)->>'ok')::boolean,'Browser proof required';
 ASSERT NOT (public.verify_staff_otp(challenge,sh,repeat('e',64))->>'ok')::boolean,'Wrong code rejected';
 r:=public.verify_staff_otp(challenge,sh,ch);
 ASSERT (r->>'ok')::boolean AND length(r->>'token')=48;
 ASSERT EXISTS(SELECT 1 FROM public.cafe_cashier_sessions WHERE token=r->>'token' AND cashier_id=staff AND cafe_id=brand AND expires_at>now());
 ASSERT NOT (public.verify_staff_otp(challenge,sh,ch)->>'ok')::boolean,'Replay rejected';
 ASSERT EXISTS(SELECT 1 FROM public.cafe_cashier_sessions WHERE token=login_token AND revoked_at IS NULL),'Legacy session unchanged';
 ASSERT NOT (public.begin_staff_otp(gen_random_uuid(),phone,ph,iph,sh,ch)->>'ok')::boolean,'Cooldown enforced';
 UPDATE platform_access_private.staff_otp_challenges SET created_at=now()-interval '2 minutes' WHERE id=challenge;
 challenge:=gen_random_uuid(); r:=public.begin_staff_otp(challenge,phone,ph,iph,sh,ch);
 ASSERT public.mark_staff_otp_sent(challenge,sh);
 FOR n IN 1..5 LOOP PERFORM public.verify_staff_otp(challenge,sh,repeat('f',64)); END LOOP;
 ASSERT NOT (public.verify_staff_otp(challenge,sh,ch)->>'ok')::boolean,'Attempt limit enforced';
 UPDATE platform_access_private.staff_otp_challenges SET created_at=now()-interval '2 minutes' WHERE id=challenge;
 challenge:=gen_random_uuid(); r:=public.begin_staff_otp(challenge,phone,ph,iph,sh,ch);
 ASSERT public.mark_staff_otp_sent(challenge,sh);
 UPDATE public.cafe_cashiers SET active=false WHERE id=staff;
 ASSERT NOT (public.verify_staff_otp(challenge,sh,ch)->>'ok')::boolean,'Disabled staff rejected';
 UPDATE public.cafe_cashiers SET active=true WHERE id=staff;
 UPDATE platform_access_private.staff_otp_challenges SET expires_at=now()-interval '1 second' WHERE id=challenge;
 ASSERT NOT (public.verify_staff_otp(challenge,sh,ch)->>'ok')::boolean,'Expiry enforced';
 UPDATE platform_access_private.staff_otp_challenges SET created_at=now()-interval '2 minutes' WHERE id=challenge;
 FOR n IN 1..2 LOOP
  challenge:=gen_random_uuid(); r:=public.begin_staff_otp(challenge,phone,ph,iph,sh,ch);
  ASSERT (r->>'ok')::boolean;
  UPDATE platform_access_private.staff_otp_challenges SET created_at=now()-interval '2 minutes' WHERE id=challenge;
 END LOOP;
 ASSERT NOT (public.begin_staff_otp(gen_random_uuid(),phone,ph,iph,sh,ch)->>'ok')::boolean,'Hourly phone limit enforced';
 ASSERT NOT has_function_privilege('anon','public.create_cafe_staff_whatsapp(uuid,text,text,text,boolean,boolean,text)','EXECUTE');
 ASSERT has_function_privilege('authenticated','public.create_cafe_staff_whatsapp(uuid,text,text,text,boolean,boolean,text)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','public.verify_staff_otp(uuid,text,text)','EXECUTE');
 ASSERT NOT has_function_privilege('anon','public.begin_staff_otp(uuid,text,text,text,text,text)','EXECUTE');
 ASSERT NOT has_table_privilege('authenticated','platform_access_private.staff_otp_challenges','SELECT,INSERT,UPDATE,DELETE');
END $$;
