-- Execute after both pending migrations in one outer transaction, then ROLLBACK
-- Every per-country block also rolls back its own fixtures even if the caller commits
-- No provider calls, messages, production test users or financial records survive
CREATE FUNCTION pg_temp.arab_fixture_phone(p_country text,p_example text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE r record; candidate text;
BEGIN
 SELECT * INTO STRICT r FROM brand_phone_private.country_rules() WHERE code=p_country;
 FOR i IN 1..100 LOOP
  candidate:=r.calling_code||left(p_example,length(p_example)-4)||lpad((floor(random()*10000))::text,4,'0');
  IF brand_phone_private.country_for_phone(candidate)=p_country
   AND NOT EXISTS(SELECT 1 FROM auth.users WHERE phone IN(candidate,'+'||candidate))
   AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE regexp_replace(coalesce(phone,''),'[^0-9]','','g')=candidate)
   AND NOT EXISTS(SELECT 1 FROM public.cafe_cashiers WHERE phone='+'||candidate)
   AND NOT EXISTS(SELECT 1 FROM owner_onboarding_private.challenges WHERE phone=candidate)
  THEN RETURN candidate; END IF;
 END LOOP;
 RAISE EXCEPTION 'Could not allocate isolated country fixture';
END $$;

DO $test$
DECLARE
 r record; foreign_rule record; challenge uuid; owner_id uuid; admin_owner_id uuid; inferred_owner_id uuid; cafe uuid; admin_cafe uuid; staff_id uuid;
 admin_actor uuid; v_phone text; inferred_phone text; local_phone text; foreign_phone text; v_draft jsonb; result jsonb; staged jsonb;
 before_cafes text; before_subscriptions text; after_cafes text; after_subscriptions text;
 self_signups integer:=0; admin_signups integer:=0; inferred_admin_signups integer:=0; staff_accounts integer:=0; loyalty_customers integer:=0;
 schema_acl_before text; invalid_blocked boolean;
BEGIN
 SELECT id INTO STRICT admin_actor FROM public.profiles WHERE role='platform_admin' AND status='active' ORDER BY id LIMIT 1;
 SELECT md5(coalesce(string_agg(id::text||':'||phone_country,',' ORDER BY id),'')) INTO before_cafes FROM public.cafes;
 SELECT md5(coalesce(string_agg(id::text||':'||md5(to_jsonb(s)::text),',' ORDER BY id),'')) INTO before_subscriptions FROM public.subscriptions s;
 IF EXISTS(SELECT 1 FROM public.cafes WHERE phone_country<>'SA') THEN RAISE EXCEPTION 'Existing brand country baseline changed'; END IF;
 IF has_function_privilege('anon','public.begin_owner_onboarding(uuid,text,text,text,text,jsonb)','EXECUTE')
  OR has_function_privilege('authenticated','public.begin_owner_onboarding(uuid,text,text,text,text,jsonb)','EXECUTE')
  OR has_function_privilege('anon','public.admin_prepare_brand_account(uuid,uuid,jsonb,text,text)','EXECUTE')
  OR has_function_privilege('authenticated','public.admin_prepare_brand_account(uuid,uuid,jsonb,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'Onboarding privilege widened'; END IF;

 FOR r IN SELECT rules.*,examples.example FROM brand_phone_private.country_rules() rules JOIN (VALUES
   ('SA','512345678'),('AE','501234567'),('BH','36001234'),('KW','50012345'),('OM','92123456'),('QA','33123456'),
   ('YE','712345678'),('JO','790123456'),('PS','599123456'),('LB','71123456'),('SY','944567890'),('IQ','7912345678'),
   ('EG','1001234567'),('SD','911231234'),('LY','912345678'),('TN','20123456'),('DZ','551234567'),('MA','650123456'),
   ('MR','22123456'),('SO','71123456'),('DJ','77831001'),('KM','3212345')
 ) examples(code,example) USING(code) ORDER BY code LOOP
  BEGIN
   PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
   PERFORM set_config('request.jwt.claim.sub','',true);
   v_phone:=pg_temp.arab_fixture_phone(r.code,r.example);
   challenge:=gen_random_uuid();owner_id:=gen_random_uuid();admin_owner_id:=gen_random_uuid();
   v_draft:=jsonb_build_object('accountCountry',r.code,'planChoice','loyalty','brandNameAr','علامة تحقق مؤقتة','brandNameEn','Country Fixture','ownerName','Country Fixture',
     'email',NULL,'mapsUrl',NULL,'couponCode','','slug','country-fixture-'||replace(owner_id::text,'-',''));
   result:=public.begin_owner_onboarding(challenge,v_phone,md5(challenge::text)||md5(owner_id::text),repeat('a',64),repeat('b',64),v_draft);
   IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Signup admission failed %: %',r.code,result; END IF;
   IF (public.verify_owner_onboarding(challenge,repeat('a',64),repeat('b',64))->>'ok') IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Unsent proof accepted'; END IF;
   PERFORM public.mark_owner_onboarding_sent(challenge,repeat('a',64),true);
   IF (public.verify_owner_onboarding(challenge,repeat('a',64),repeat('c',64))->>'ok') IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Wrong proof accepted'; END IF;
   IF (public.verify_owner_onboarding(challenge,repeat('a',64),repeat('b',64))->>'ok') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Valid proof rejected'; END IF;
   invalid_blocked:=false;
   BEGIN
    UPDATE owner_onboarding_private.challenges SET draft=jsonb_set(draft,'{accountCountry}',to_jsonb(CASE WHEN r.code='SA' THEN 'EG'::text ELSE 'SA'::text END)) WHERE id=challenge;
    INSERT INTO auth.users(id,phone,phone_confirmed_at,raw_user_meta_data,raw_app_meta_data)
    VALUES(owner_id,v_phone,now(),'{"account_type":"cafe_owner"}',jsonb_build_object('owner_onboarding_id',challenge,'owner_onboarding_proof',repeat('a',64)));
   EXCEPTION WHEN SQLSTATE '22023' THEN invalid_blocked:=true;
   END;
   IF NOT invalid_blocked THEN RAISE EXCEPTION 'Mismatched verified country accepted %',r.code; END IF;
   INSERT INTO auth.users(id,phone,phone_confirmed_at,raw_user_meta_data,raw_app_meta_data)
   VALUES(owner_id,v_phone,now(),'{"account_type":"cafe_owner"}',jsonb_build_object('owner_onboarding_id',challenge,'owner_onboarding_proof',repeat('a',64)));
   SET CONSTRAINTS ALL IMMEDIATE;
   SELECT id INTO STRICT cafe FROM public.cafes WHERE owner_user_id=owner_id;
   IF (SELECT phone_country FROM public.cafes WHERE id=cafe) IS DISTINCT FROM r.code
    OR NOT EXISTS(SELECT 1 FROM public.subscriptions WHERE cafe_id=cafe AND plan_id='pro' AND status='trialing' AND amount_sar=0 AND expires_at-started_at=interval '30 days')
    OR NOT EXISTS(SELECT 1 FROM public.cafe_loyalty_programs WHERE cafe_id=cafe AND enabled)
   THEN RAISE EXCEPTION 'Signup country/loyalty activation failed %',r.code; END IF;
   self_signups:=self_signups+1;
   local_phone:=coalesce(r.national_prefix,'')||substr(v_phone,length(r.calling_code)+1);
   result:=public.enroll_loyalty_customer_direct(cafe,'عميل تحقق مؤقت',local_phone,md5(cafe::text)||md5(owner_id::text));
   IF result->>'ok' IS DISTINCT FROM 'true' OR NOT EXISTS(SELECT 1 FROM public.customer_profiles WHERE cafe_id=cafe AND phone_normalized=v_phone)
    OR NOT EXISTS(SELECT 1 FROM public.loyalty_cards WHERE cafe_id=cafe AND customer_profile_id=(result->>'profile_id')::uuid)
   THEN RAISE EXCEPTION 'Local customer enrollment failed %: %',r.code,result; END IF;
   loyalty_customers:=loyalty_customers+1;

   SELECT * INTO foreign_rule FROM (VALUES('SA','512345678'),('EG','1001234567')) f(code,example) WHERE code<>r.code LIMIT 1;
   foreign_phone:=pg_temp.arab_fixture_phone(foreign_rule.code,foreign_rule.example);
   result:=public.enroll_loyalty_customer_direct(cafe,'عميل تحقق آخر','+'||foreign_phone,md5(owner_id::text)||md5(cafe::text));
   IF result->>'ok' IS DISTINCT FROM 'false' OR result->>'reason'<>'invalid_input' THEN RAISE EXCEPTION 'Foreign customer country accepted %',r.code; END IF;
   PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
   PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
   staff_id:=public.create_cafe_staff_whatsapp(cafe,'موظف تحقق مؤقت','+'||foreign_phone,NULL,true,false,'');
   IF NOT EXISTS(SELECT 1 FROM public.cafe_cashiers WHERE id=staff_id AND cafe_id=cafe AND phone='+'||foreign_phone) THEN RAISE EXCEPTION 'Foreign staff phone changed %',r.code; END IF;
   staff_accounts:=staff_accounts+1;

   PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
   PERFORM set_config('request.jwt.claim.sub','',true);
   -- No owner phone supplied yet: the explicit brand country still persists
   staged:=public.admin_prepare_brand_account(admin_owner_id,admin_actor,jsonb_build_object('slug','admin-country-'||replace(admin_owner_id::text,'-',''),
     'brandName','علامة أدمن مؤقتة','brandNameEn','Admin Fixture','category','cafes_coffee','ownerName','','phone','','email','','phoneCountry',r.code),repeat('d',64),repeat('x',60));
   INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data)
   VALUES(admin_owner_id,'prepared-'||admin_owner_id::text||'@accounts.barndaksa.invalid','{"account_type":"cafe_owner"}','{}');
   SET CONSTRAINTS ALL IMMEDIATE;
   SELECT id INTO STRICT admin_cafe FROM public.cafes WHERE owner_user_id=admin_owner_id;
   IF (SELECT phone_country FROM public.cafes WHERE id=admin_cafe) IS DISTINCT FROM r.code THEN RAISE EXCEPTION 'Admin country failed %',r.code; END IF;
   admin_signups:=admin_signups+1;

   -- Omitting the selector still derives a valid explicit international country
   inferred_owner_id:=gen_random_uuid();
   inferred_phone:=pg_temp.arab_fixture_phone(r.code,r.example);
   staged:=public.admin_prepare_brand_account(inferred_owner_id,admin_actor,jsonb_build_object('slug','admin-inferred-'||replace(inferred_owner_id::text,'-',''),
     'brandName','علامة دولة تلقائية','brandNameEn','Inferred Fixture','category','cafes_coffee','ownerName','Fixture','phone',inferred_phone,'email',''),repeat('e',64),repeat('x',60));
   INSERT INTO auth.users(id,phone,phone_confirmed_at,raw_user_meta_data,raw_app_meta_data)
   VALUES(inferred_owner_id,inferred_phone,now(),'{"account_type":"cafe_owner"}','{}');
   SET CONSTRAINTS ALL IMMEDIATE;
   IF NOT EXISTS(SELECT 1 FROM public.cafes WHERE owner_user_id=inferred_owner_id AND phone_country=r.code) THEN RAISE EXCEPTION 'Inferred admin country failed %',r.code; END IF;
   inferred_admin_signups:=inferred_admin_signups+1;

   -- Force rollback of every fixture in this block while keeping test counters
   RAISE SQLSTATE 'Z0001' USING MESSAGE='country fixture verified';
  EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
  END;
 END LOOP;
 SELECT md5(coalesce(string_agg(id::text||':'||phone_country,',' ORDER BY id),'')) INTO after_cafes FROM public.cafes;
 SELECT md5(coalesce(string_agg(id::text||':'||md5(to_jsonb(s)::text),',' ORDER BY id),'')) INTO after_subscriptions FROM public.subscriptions s;
 IF before_cafes IS DISTINCT FROM after_cafes OR before_subscriptions IS DISTINCT FROM after_subscriptions THEN RAISE EXCEPTION 'Existing brands/subscriptions changed'; END IF;
 IF self_signups<>22 OR admin_signups<>22 OR inferred_admin_signups<>22 OR staff_accounts<>22 OR loyalty_customers<>22 THEN RAISE EXCEPTION 'Country coverage incomplete'; END IF;
 RAISE NOTICE 'PASS 22 self-signups, 22 explicit and 22 inferred admin signups, 22 explicit foreign staff, 22 local loyalty enrollments; all fixture subtransactions rolled back, existing brands/subscriptions unchanged';
END $test$;

SELECT jsonb_build_object('ok',true,'self_signup_countries',22,'admin_signup_countries',22,'inferred_admin_signup_countries',22,'tampered_signup_country_rejected',true,'staff_countries',22,'loyalty_customer_countries',22,'fixtures_rolled_back',true,'existing_brands_and_subscriptions_unchanged',true) AS arab_country_verification;
