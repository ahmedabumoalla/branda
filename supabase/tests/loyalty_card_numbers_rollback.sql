-- Synthetic enrollment only; every profile/card/queue mutation is rolled back.
BEGIN;
DO $checks$
DECLARE a uuid;b uuid;phone_a text;phone_b text;r jsonb;pa uuid;pb uuid;pa2 uuid;pa3 uuid;
 card_a uuid;card_b uuid;code_a text;n integer;expected integer;before_cards jsonb;
 req uuid:=gen_random_uuid();ca uuid:=gen_random_uuid();token_a text:='number-fixture-'||gen_random_uuid()::text;
 attempts integer;before_counter integer;fixture_count integer;
BEGIN
 SELECT jsonb_object_agg(id,to_jsonb(c)) INTO before_cards FROM public.loyalty_cards c;
 SELECT c.id INTO a FROM public.cafes c JOIN public.cafe_loyalty_programs p ON p.cafe_id=c.id
 WHERE c.status IN('active','published') AND c.deleted_at IS NULL AND p.enabled AND c.owner_user_id IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.profiles o WHERE o.id=c.owner_user_id AND o.status='active')
 AND platform_access_private.service_enabled(c.id,'loyalty')
 AND NOT EXISTS(SELECT 1 FROM loyalty_enrollment_private.display_number_counters d WHERE d.cafe_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM public.loyalty_cards x WHERE x.cafe_id=c.id AND (x.display_number<10000 OR x.card_code ~ '^[1-9][0-9]{0,3}$')) LIMIT 1;
 SELECT c.id INTO b FROM public.cafes c JOIN public.cafe_loyalty_programs p ON p.cafe_id=c.id
 WHERE c.id<>a AND c.status IN('active','published') AND c.deleted_at IS NULL AND p.enabled
 AND platform_access_private.service_enabled(c.id,'loyalty')
 AND NOT EXISTS(SELECT 1 FROM loyalty_enrollment_private.display_number_counters d WHERE d.cafe_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM public.loyalty_cards x WHERE x.cafe_id=c.id AND (x.display_number<10000 OR x.card_code ~ '^[1-9][0-9]{0,3}$')) LIMIT 1;
 ASSERT a IS NOT NULL AND b IS NOT NULL,'Two enabled independent brands required';
 LOOP phone_a:='9665'||lpad(floor(random()*100000000)::bigint::text,8,'0');EXIT WHEN NOT EXISTS(SELECT 1 FROM public.customer_profiles WHERE phone_normalized=phone_a);END LOOP;
 LOOP phone_b:='9665'||lpad(floor(random()*100000000)::bigint::text,8,'0');EXIT WHEN phone_b<>phone_a AND NOT EXISTS(SELECT 1 FROM public.customer_profiles WHERE phone_normalized=phone_b);END LOOP;
 r:=public.enroll_loyalty_customer_direct(a,'Number Fixture A',phone_a,md5(phone_a)||md5(phone_a));ASSERT r->>'ok'='true';pa:=(r->>'profile_id')::uuid;
 SELECT id,card_code,display_number INTO card_a,code_a,n FROM public.loyalty_cards WHERE customer_profile_id=pa;
 ASSERT n=1,'First new brand A card must be one';
 r:=public.enroll_loyalty_customer_direct(b,'Number Fixture B',phone_b,md5(phone_b)||md5(phone_b));ASSERT r->>'ok'='true';pb:=(r->>'profile_id')::uuid;
 SELECT id,display_number INTO card_b,n FROM public.loyalty_cards WHERE customer_profile_id=pb;
 ASSERT n=1,'First new brand B card must independently be one';
 ASSERT card_a<>card_b,'Brands keep independent card IDs';
 ASSERT NOT has_table_privilege('anon','loyalty_enrollment_private.display_number_counters','SELECT');
 ASSERT NOT has_table_privilege('authenticated','loyalty_enrollment_private.display_number_counters','SELECT');
 ASSERT NOT has_table_privilege('service_role','loyalty_enrollment_private.display_number_counters','UPDATE');
 ASSERT NOT has_function_privilege('service_role','loyalty_enrollment_private.assign_display_number()','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','public.enqueue_loyalty_read(text,uuid,text,text,uuid,uuid,timestamptz)','EXECUTE');
 ASSERT has_function_privilege('service_role','public.enqueue_loyalty_read(text,uuid,text,text,uuid,uuid,timestamptz)','EXECUTE');
 ASSERT NOT has_function_privilege('service_role','loyalty_read_private.process_one(uuid,uuid)','EXECUTE');
 ASSERT(SELECT relrowsecurity FROM pg_class WHERE oid='loyalty_enrollment_private.display_number_counters'::regclass);
 ASSERT(SELECT next_number=2 FROM loyalty_enrollment_private.display_number_counters WHERE cafe_id=a);
 ASSERT public.issue_rast_loyalty_card(pa)=code_a,'Enrollment retry preserves secure code';
 ASSERT(SELECT display_number=1 FROM public.loyalty_cards WHERE id=card_a),'Retry preserves number';
 ASSERT(SELECT next_number=2 FROM loyalty_enrollment_private.display_number_counters WHERE cafe_id=a),'Retry consumes no number';
 BEGIN UPDATE public.loyalty_cards SET display_number=9 WHERE id=card_a;RAISE EXCEPTION 'Fixture failed to reject mutation';
 EXCEPTION WHEN OTHERS THEN ASSERT SQLERRM='Card display number is immutable';END;
 FOR attempts IN 1..2 LOOP
  LOOP phone_a:='9665'||lpad(floor(random()*100000000)::bigint::text,8,'0');EXIT WHEN NOT EXISTS(SELECT 1 FROM public.customer_profiles WHERE phone_normalized=phone_a);END LOOP;
  r:=public.enroll_loyalty_customer_direct(a,'Number Fixture Next',phone_a,md5(phone_a)||md5(phone_a));ASSERT r->>'ok'='true';
  IF attempts=1 THEN pa2:=(r->>'profile_id')::uuid;ELSE pa3:=(r->>'profile_id')::uuid;END IF;
  ASSERT(SELECT display_number=attempts+1 FROM public.loyalty_cards WHERE customer_profile_id=(r->>'profile_id')::uuid),'Next numbers are two and three';
 END LOOP;
 ASSERT(SELECT next_number=4 FROM loyalty_enrollment_private.display_number_counters WHERE cafe_id=a);
 -- Failed enrollment must roll the counter back with the card/profile transaction
 SELECT next_number INTO before_counter FROM loyalty_enrollment_private.display_number_counters WHERE cafe_id=a;
 SELECT count(*) INTO fixture_count FROM public.loyalty_cards WHERE cafe_id=a;
 BEGIN
  LOOP phone_a:='9665'||lpad(floor(random()*100000000)::bigint::text,8,'0');EXIT WHEN NOT EXISTS(SELECT 1 FROM public.customer_profiles WHERE phone_normalized=phone_a);END LOOP;
  r:=public.enroll_loyalty_customer_direct(a,'Rolled back fixture',phone_a,md5(phone_a)||md5(phone_a));ASSERT r->>'ok'='true';
  RAISE EXCEPTION 'Expected synthetic rollback';
 EXCEPTION WHEN OTHERS THEN ASSERT SQLERRM='Expected synthetic rollback';END;
 ASSERT(SELECT next_number=before_counter FROM loyalty_enrollment_private.display_number_counters WHERE cafe_id=a),'Counter rolls back';
 ASSERT(SELECT count(*)=fixture_count FROM public.loyalty_cards WHERE cafe_id=a),'Card rolls back';
 -- An occupied legacy secure numeric code is skipped even if the card is suspended
 UPDATE public.loyalty_cards SET card_code='4',status='suspended' WHERE customer_profile_id=pa2;
 LOOP phone_a:='9665'||lpad(floor(random()*100000000)::bigint::text,8,'0');EXIT WHEN NOT EXISTS(SELECT 1 FROM public.customer_profiles WHERE phone_normalized=phone_a);END LOOP;
 r:=public.enroll_loyalty_customer_direct(a,'Code collision fixture',phone_a,md5(phone_a)||md5(phone_a));ASSERT r->>'ok'='true';
 ASSERT(SELECT display_number=5 FROM public.loyalty_cards WHERE customer_profile_id=(r->>'profile_id')::uuid),'Skip occupied legacy secure code';
 ASSERT(SELECT next_number=6 FROM loyalty_enrollment_private.display_number_counters WHERE cafe_id=a);
 -- First available legacy number is selected without changing any prior card
 UPDATE loyalty_enrollment_private.display_number_counters SET next_number=10000 WHERE cafe_id=a;
 SELECT v INTO expected FROM generate_series(10000,99999) v WHERE NOT EXISTS(SELECT 1 FROM public.loyalty_cards c WHERE c.cafe_id=a AND(c.display_number=v OR c.card_code=v::text)) ORDER BY v LIMIT 1;
 LOOP phone_a:='9665'||lpad(floor(random()*100000000)::bigint::text,8,'0');EXIT WHEN NOT EXISTS(SELECT 1 FROM public.customer_profiles WHERE phone_normalized=phone_a);END LOOP;
 r:=public.enroll_loyalty_customer_direct(a,'Legacy range fixture',phone_a,md5(phone_a)||md5(phone_a));ASSERT r->>'ok'='true';
 ASSERT(SELECT display_number=expected FROM public.loyalty_cards WHERE customer_profile_id=(r->>'profile_id')::uuid),'Skip existing five-digit numbers';
 ASSERT(SELECT next_number=expected+1 FROM loyalty_enrollment_private.display_number_counters WHERE cafe_id=a);
 ASSERT(SELECT next_number=2 FROM loyalty_enrollment_private.display_number_counters WHERE cafe_id=b),'Other brand counter unchanged';
 -- The new short number passes the real authenticated queue and stamps only its fixture card
 INSERT INTO public.cafe_cashiers(id,cafe_id,full_name,email,password_hash,temporary_password,can_use_loyalty)
 VALUES(ca,a,'Number Employee',ca::text||'@fixture.invalid','fixture','',true);
 INSERT INTO public.cafe_cashier_sessions(cafe_id,cashier_id,token) VALUES(a,ca,token_a);
 r:=public.enqueue_loyalty_read(token_a,req,'code','1',a,ca);ASSERT r->>'ok'='true';
 ASSERT(SELECT total_purchases=0 FROM public.loyalty_cards WHERE id=card_a),'Admission never stamps';
 PERFORM loyalty_read_private.process_one(a,req);
 ASSERT(SELECT status='succeeded' FROM loyalty_read_private.operations WHERE cafe_id=a AND request_id=req),'Short code processes';
 ASSERT(SELECT total_purchases=1 FROM public.loyalty_cards WHERE id=card_a),'Short code finds own brand card';
 ASSERT(SELECT total_purchases=0 FROM public.loyalty_cards WHERE id=card_b),'Same number in other brand untouched';
 r:=public.enqueue_loyalty_read(token_a,req,'code','1',a,ca);ASSERT r->>'replayed'='true';
 PERFORM loyalty_read_private.process_one(a,req);
 ASSERT(SELECT total_purchases=1 FROM public.loyalty_cards WHERE id=card_a),'Replay cannot stamp twice';
 r:=public.enqueue_loyalty_read(token_a,gen_random_uuid(),'code','0',a,ca);ASSERT r->>'errorCode'='invalid_identifier';
 r:=public.enqueue_loyalty_read(token_a,gen_random_uuid(),'code','01',a,ca);ASSERT r->>'errorCode'='invalid_identifier';
 r:=public.enqueue_loyalty_read(token_a,gen_random_uuid(),'code','ABC',a,ca);ASSERT r->>'errorCode'='invalid_identifier';
 r:=public.enqueue_loyalty_read(token_a,gen_random_uuid(),'phone','1',a,ca);ASSERT r->>'errorCode'='invalid_identifier';
 -- Removing a newly issued fixture card cannot recycle its allocated number
 DELETE FROM public.loyalty_cards WHERE id=card_b;
 LOOP phone_b:='9665'||lpad(floor(random()*100000000)::bigint::text,8,'0');EXIT WHEN NOT EXISTS(SELECT 1 FROM public.customer_profiles WHERE phone_normalized=phone_b);END LOOP;
 r:=public.enroll_loyalty_customer_direct(b,'After removed fixture',phone_b,md5(phone_b)||md5(phone_b));ASSERT r->>'ok'='true';
 ASSERT(SELECT display_number=2 FROM public.loyalty_cards WHERE customer_profile_id=(r->>'profile_id')::uuid),'Deleted number is never recycled';
 UPDATE loyalty_enrollment_private.display_number_counters SET next_number=100000 WHERE cafe_id=b;
 BEGIN
  LOOP phone_b:='9665'||lpad(floor(random()*100000000)::bigint::text,8,'0');EXIT WHEN NOT EXISTS(SELECT 1 FROM public.customer_profiles WHERE phone_normalized=phone_b);END LOOP;
  r:=public.enroll_loyalty_customer_direct(b,'Exhaustion fixture',phone_b,md5(phone_b)||md5(phone_b));
  RAISE EXCEPTION 'Fixture failed to reject exhausted counter';
 EXCEPTION WHEN OTHERS THEN ASSERT SQLERRM='Card display numbers exhausted for this brand';END;
 ASSERT(SELECT next_number=100000 FROM loyalty_enrollment_private.display_number_counters WHERE cafe_id=b),'Exhaustion cannot rewind counter';
 ASSERT NOT EXISTS(SELECT 1 FROM jsonb_each(before_cards) e LEFT JOIN public.loyalty_cards c ON c.id=e.key::uuid WHERE c.id IS NULL OR to_jsonb(c) IS DISTINCT FROM e.value),'All prior cards and stamp values unchanged';
END $checks$;
ROLLBACK;
