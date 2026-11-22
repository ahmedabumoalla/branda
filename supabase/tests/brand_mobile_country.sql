-- Disposable integration fixture. Never commit this transaction or call an external provider.
BEGIN;
DO $test$
DECLARE
  owner_uid uuid:=gen_random_uuid(); challenge_id uuid:=gen_random_uuid();
  suffix text:=replace(owner_uid::text,'-','');
  ps uuid; sa uuid; profile_id uuid; cashier_id uuid; legacy_id uuid:=gen_random_uuid(); legacy_owner uuid:=gen_random_uuid(); legacy_phone text; sess text; key uuid:=gen_random_uuid(); response jsonb;
  local_phone text:='059'||lpad((floor(random()*10000000)::integer)::text,7,'0');
  ps_owner text:='97056'||lpad((floor(random()*10000000)::integer)::text,7,'0');
  ps_customer text; draft jsonb; otp record;
BEGIN
  ps_customer:='970'||substr(local_phone,2);
  draft:=jsonb_build_object('accountCountry','PS','slug','mobile-'||suffix,'email',suffix||'@example.invalid',
    'ownerName','Phone fixture','brandNameAr','Mobile fixture','brandNameEn','Mobile fixture','planChoice','loyalty');
  response:=public.begin_owner_onboarding(challenge_id,'966'||substr(local_phone,2),repeat('a',64),repeat('b',64),repeat('c',64),draft);
  IF response->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Signup allowed wrong country'; END IF;
  response:=public.begin_owner_onboarding(challenge_id,ps_owner,repeat('a',64),repeat('b',64),repeat('c',64),draft);
  IF response->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'PS challenge refused %',response; END IF;
  PERFORM public.mark_owner_onboarding_sent(challenge_id,repeat('b',64),true,'{"latitude":0,"longitude":0}');
  PERFORM public.verify_owner_onboarding(challenge_id,repeat('b',64),repeat('c',64));
  INSERT INTO auth.users(id,phone,raw_app_meta_data,raw_user_meta_data)
    VALUES(owner_uid,ps_owner,jsonb_build_object('owner_onboarding_id',challenge_id::text,'owner_onboarding_proof',repeat('b',64)),
      '{"account_type":"cafe_owner","accountCountry":"SA"}');
  SELECT id INTO STRICT ps FROM public.cafes WHERE owner_user_id=owner_uid AND phone_country='PS';
  INSERT INTO public.cafes(slug,name) VALUES ('sa-'||suffix,'SA mobile fixture') RETURNING id INTO sa;
  IF (SELECT phone_country FROM public.cafes WHERE id=sa) IS DISTINCT FROM 'SA'
    OR brand_phone_private.normalize(sa,local_phone) IS DISTINCT FROM '966'||substr(local_phone,2)
    OR brand_phone_private.normalize(ps,local_phone) IS DISTINCT FROM ps_customer
    OR brand_phone_private.normalize(ps,'٠٥٦ ١٢٣ ٤٥٦٧') IS DISTINCT FROM '970561234567'
    OR brand_phone_private.normalize(ps,'00970'||substr(local_phone,2)) IS DISTINCT FROM ps_customer
    OR brand_phone_private.normalize(sa,ps_customer) IS NOT NULL
    OR brand_phone_private.normalize(ps,'+966'||substr(local_phone,2)) IS NOT NULL
    OR brand_phone_private.normalize(ps,'0551234567') IS NOT NULL
    OR brand_phone_private.sale_phone(ps,'+'||ps_customer) IS DISTINCT FROM ps_customer
    OR brand_phone_private.sale_phone(sa,'') IS NOT NULL THEN RAISE EXCEPTION 'Country normalization mismatch'; END IF;
  BEGIN UPDATE public.cafes SET phone_country='SA' WHERE id=ps; RAISE EXCEPTION 'Mutable country';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  SET CONSTRAINTS initialize_brand_loyalty IMMEDIATE;
  response:=public.enroll_loyalty_customer_direct(ps,'Phone fixture',local_phone,repeat('f',64));
  IF response->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Loyalty enrollment refused %',response; END IF;
  profile_id:=(response->>'profile_id')::uuid;
  IF (SELECT phone_normalized FROM public.customer_profiles WHERE id=profile_id AND cafe_id=ps) IS DISTINCT FROM ps_customer THEN RAISE EXCEPTION 'Profile not saved with PS phone'; END IF;
  response:=public.enroll_loyalty_customer_direct(ps,'Phone fixture','+966'||substr(local_phone,2),repeat('f',64));
  IF response->>'reason' IS DISTINCT FROM 'invalid_input' THEN RAISE EXCEPTION 'Wrong country enrollment accepted'; END IF;
  SELECT * INTO otp FROM public.begin_customer_phone_otp_request(ps,ps_customer,'customer_login','fixture-'||suffix,60,3,5,90);
  IF otp.request_id IS NULL THEN RAISE EXCEPTION 'OTP admission not created'; END IF;
  BEGIN PERFORM public.begin_customer_phone_otp_request(sa,ps_customer,'customer_login','fixture-'||suffix,60,3,5,90);
    RAISE EXCEPTION 'Cross-country OTP admitted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub',owner_uid::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_uid,'role','authenticated')::text,true);
  cashier_id:=public.create_cafe_staff_whatsapp(ps,'Cashier fixture','+'||ps_customer,'TEST',true,false,NULL);
  IF NOT EXISTS(SELECT 1 FROM public.cafe_cashiers WHERE id=cashier_id AND cafe_id=ps AND phone='+'||ps_customer) THEN RAISE EXCEPTION 'PS staff phone did not persist'; END IF;
  INSERT INTO public.cafe_cashier_sessions(cashier_id,cafe_id) VALUES(cashier_id,ps) RETURNING token INTO sess;
  response:=public.enqueue_loyalty_read(sess,key,'phone',local_phone,ps,cashier_id);
  IF response->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Stamp enqueue refused %',response; END IF;
  PERFORM loyalty_read_private.process_one(ps,key);
  IF (SELECT status FROM loyalty_read_private.operations WHERE cafe_id=ps AND request_id=key) IS DISTINCT FROM 'succeeded' THEN RAISE EXCEPTION 'Stamp did not post'; END IF;
  response:=public.get_cashier_loyalty_summary(sess,ps,cashier_id,'phone',local_phone,false);
  IF response->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Local phone lookup refused %',response; END IF;
  response:=public.get_cashier_loyalty_summary(sess,sa,cashier_id,'phone',local_phone,false);
  IF response->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Out-of-scope lookup accepted'; END IF;
  UPDATE public.cafe_loyalty_programs SET points_mode='points',points_milestones='[{"points":200,"reward":"Coffee"}]',points_rate_sar=10,points_rate_quantity=1 WHERE cafe_id=ps;
  response:=public.scan_loyalty_invoice_points_by_phone(sess,local_phone,gen_random_uuid(),30,10,1);
  IF response->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Points invoice refused %',response; END IF;
  -- A previously issued challenge contains a verified phone but no selected country.
  legacy_phone:='97059'||lpad((floor(random()*10000000)::integer)::text,7,'0');
  draft:=(draft-'accountCountry')||jsonb_build_object('slug','legacy-'||suffix,'email','legacy-'||suffix||'@example.invalid');
  response:=public.begin_owner_onboarding(legacy_id,legacy_phone,repeat('d',64),repeat('e',64),repeat('f',64),draft);
  IF response->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Legacy signup challenge refused %',response; END IF;
  PERFORM public.mark_owner_onboarding_sent(legacy_id,repeat('e',64),true,'{"latitude":0,"longitude":0}');
  PERFORM public.verify_owner_onboarding(legacy_id,repeat('e',64),repeat('f',64));
  INSERT INTO auth.users(id,phone,raw_app_meta_data,raw_user_meta_data) VALUES(legacy_owner,legacy_phone,
    jsonb_build_object('owner_onboarding_id',legacy_id::text,'owner_onboarding_proof',repeat('e',64)),'{"account_type":"cafe_owner"}');
  IF (SELECT phone_country FROM public.cafes WHERE owner_user_id=legacy_owner) IS DISTINCT FROM 'PS' THEN RAISE EXCEPTION 'Legacy verified phone country lost'; END IF;
END $test$;
ROLLBACK;
