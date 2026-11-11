-- Synthetic fixtures only; every row and rate-limit change is rolled back
BEGIN;
DO $test$
DECLARE a uuid; b uuid; p uuid; c uuid; n text; name_input text; mode text;
  result jsonb; before_profile jsonb; before_card jsonb; expected boolean;
BEGIN
 SELECT id INTO a FROM public.cafes WHERE slug='rast';
 SELECT id INTO b FROM public.cafes WHERE id<>a LIMIT 1;
 ASSERT a IS NOT NULL AND b IS NOT NULL;
 ASSERT NOT has_function_privilege('anon','public.enroll_loyalty_customer_direct(uuid,text,text,text)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','public.enroll_loyalty_customer_direct(uuid,text,text,text)','EXECUTE');
 ASSERT has_function_privilege('service_role','public.enroll_loyalty_customer_direct(uuid,text,text,text)','EXECUTE');
 FOREACH mode IN ARRAY ARRAY['complete','no_proof','old_card','real_name','blocked','conflict','suspended','auth_user','verified','password','session','reset','email','foreign_proof','existing_match','rate_limit','unavailable'] LOOP
  n:='9665'||lpad(floor(random()*100000000)::bigint::text,8,'0');
  ASSERT NOT EXISTS(SELECT 1 FROM customer_profiles WHERE phone_normalized=n);
  name_input:=CASE WHEN mode IN('real_name','existing_match') THEN 'Existing Member' ELSE 'عميل الولاء' END;
  result:=public.enroll_loyalty_customer_direct(a,name_input,n,md5(n)||md5(n));
  ASSERT result->>'ok'='true', 'Fixture enrollment must succeed';
  p:=(result->>'profile_id')::uuid;
  SELECT id INTO c FROM public.loyalty_cards WHERE customer_profile_id=p AND cafe_id=a;
  IF mode<>'no_proof' THEN
   INSERT INTO loyalty_read_private.card_link_jobs(cafe_id,profile_id,card_id,card_created)
   VALUES(CASE WHEN mode='foreign_proof' THEN b ELSE a END,p,c,mode<>'old_card');
  END IF;
  IF mode='blocked' THEN UPDATE customer_profiles SET blocked_at=now() WHERE id=p; END IF;
  IF mode='conflict' THEN UPDATE customer_profiles SET phone_auth_conflict=true WHERE id=p; END IF;
  IF mode='suspended' THEN UPDATE loyalty_cards SET status='suspended' WHERE id=c; END IF;
  IF mode='auth_user' THEN UPDATE customer_profiles SET user_id=(SELECT id FROM auth.users LIMIT 1) WHERE id=p; END IF;
  IF mode='verified' THEN UPDATE customer_profiles SET phone_verified_at=now() WHERE id=p; END IF;
  IF mode='password' THEN UPDATE customer_profiles SET password_hash='fixture' WHERE id=p; END IF;
  IF mode='session' THEN UPDATE customer_profiles SET session_token_hash='fixture' WHERE id=p; END IF;
  IF mode='reset' THEN UPDATE customer_profiles SET password_reset_token_hash='fixture' WHERE id=p; END IF;
  IF mode='email' THEN UPDATE customer_profiles SET email='fixture@example.invalid' WHERE id=p; END IF;
  IF mode='rate_limit' THEN UPDATE loyalty_enrollment_private.attempt_buckets SET attempts=10 WHERE bucket_key='phone:'||a||':'||md5(n); END IF;
  IF mode='unavailable' THEN UPDATE cafe_loyalty_programs SET enabled=false WHERE cafe_id=a; END IF;
  SELECT to_jsonb(x) INTO before_profile FROM public.customer_profiles x WHERE id=p;
  SELECT to_jsonb(x) INTO before_card FROM public.loyalty_cards x WHERE id=c;
  name_input:=CASE WHEN mode='existing_match' THEN '  Existing   Member  ' ELSE 'اسم العميل الحقيقي' END;
  result:=public.enroll_loyalty_customer_direct(a,name_input,n,md5(n)||md5(n));
  expected:=mode IN('complete','existing_match');
  ASSERT (result->>'ok')::boolean=expected,mode;
  IF expected THEN
   ASSERT result->>'profile_id'=p::text AND result->>'returning_customer'='true','Keep original profile';
   ASSERT (SELECT count(*)=1 FROM loyalty_cards WHERE customer_profile_id=p AND cafe_id=a),'No duplicate card';
   ASSERT (SELECT to_jsonb(x)-'customer_name'-'updated_at'=before_card-'customer_name'-'updated_at' FROM loyalty_cards x WHERE id=c),'Preserve card identifier and balances';
   IF mode='complete' THEN
    ASSERT (SELECT full_name=name_input FROM customer_profiles WHERE id=p),'Save submitted name';
    ASSERT (SELECT customer_name=name_input FROM loyalty_cards WHERE id=c),'Card shows completed name';
    ASSERT (SELECT to_jsonb(x)-'full_name'-'updated_at'=before_profile-'full_name'-'updated_at' FROM customer_profiles x WHERE id=p),'Never create credentials or verify phone';
    result:=public.enroll_loyalty_customer_direct(a,name_input,n,md5(n)||md5(n));
    ASSERT result->>'ok'='true','Retry same name is idempotent';
    result:=public.enroll_loyalty_customer_direct(a,'اسم مختلف',n,md5(n)||md5(n));
    ASSERT result->>'ok'='false','A completed name cannot be overwritten';
   END IF;
  ELSE
   ASSERT (SELECT to_jsonb(x)=before_profile FROM customer_profiles x WHERE id=p),'Rejected identity is unchanged';
   ASSERT (SELECT to_jsonb(x)=before_card FROM loyalty_cards x WHERE id=c),'Rejected card is unchanged';
  END IF;
  IF mode='unavailable' THEN UPDATE cafe_loyalty_programs SET enabled=true WHERE cafe_id=a; END IF;
 END LOOP;
END $test$;
ROLLBACK;
