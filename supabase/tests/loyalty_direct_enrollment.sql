-- Run inside BEGIN/ROLLBACK against the real schema, using synthetic profiles only.
DO $$
DECLARE a uuid; b uuid; r jsonb; again jsonb; pid uuid; card text; v_phone text; original_name text; n integer;
BEGIN
  SELECT c.id INTO a FROM public.cafes c JOIN public.cafe_loyalty_programs p ON p.cafe_id=c.id AND p.enabled
    WHERE c.deleted_at IS NULL AND platform_access_private.service_enabled(c.id,'loyalty') ORDER BY c.id LIMIT 1;
  SELECT c.id INTO b FROM public.cafes c JOIN public.cafe_loyalty_programs p ON p.cafe_id=c.id AND p.enabled
    WHERE c.deleted_at IS NULL AND c.id<>a AND platform_access_private.service_enabled(c.id,'loyalty') ORDER BY c.id LIMIT 1;
  ASSERT a IS NOT NULL AND b IS NOT NULL,'Need two eligible brands for isolation checks';
  LOOP
    v_phone:='9665'||lpad((floor(random()*100000000)::bigint)::text,8,'0');
    EXIT WHEN NOT EXISTS(SELECT 1 FROM public.customer_profiles WHERE phone_normalized=v_phone);
  END LOOP;
  r:=public.enroll_loyalty_customer_direct(a,'Direct Test Member',v_phone,md5(v_phone)||md5(v_phone));
  ASSERT (r->>'ok')::boolean,'New enrollment'; pid:=(r->>'profile_id')::uuid;
  ASSERT NOT (r->>'returning_customer')::boolean;
  ASSERT EXISTS(SELECT 1 FROM public.customer_profiles WHERE id=pid AND user_id IS NULL AND phone_verified_at IS NULL
    AND password_hash IS NULL AND session_token_hash IS NULL AND NOT phone_verification_required),'No fabricated verification or account session';
  ASSERT EXISTS(SELECT 1 FROM operations_report_private.registration_sources WHERE customer_id=pid AND source='loyalty');
  SELECT card_code INTO card FROM public.loyalty_cards WHERE customer_profile_id=pid AND cafe_id=a;
  ASSERT card IS NOT NULL,'Card issued atomically';
  again:=public.enroll_loyalty_customer_direct(a,' direct  test member ', '0'||substring(v_phone from 4),md5(v_phone)||md5(v_phone));
  ASSERT (again->>'ok')::boolean AND (again->>'returning_customer')::boolean AND (again->>'profile_id')::uuid=pid;
  ASSERT (SELECT count(*)=1 FROM public.loyalty_cards WHERE customer_profile_id=pid AND cafe_id=a),'No duplicate card';
  ASSERT public.issue_rast_loyalty_card(pid)=card;
  r:=public.enroll_loyalty_customer_direct(a,'Wrong Name',v_phone,md5(v_phone)||md5(v_phone));
  ASSERT NOT (r->>'ok')::boolean,'Name mismatch rejected';
  ASSERT (SELECT full_name='Direct Test Member' FROM public.customer_profiles WHERE id=pid),'Existing name never overwritten';
  r:=public.enroll_loyalty_customer_direct(b,'Direct Test Member',v_phone,md5(v_phone)||md5(v_phone));
  ASSERT (r->>'ok')::boolean AND (r->>'profile_id')::uuid<>pid,'Brand isolation';
  UPDATE public.customer_profiles SET blocked_at=now() WHERE id=pid;
  r:=public.enroll_loyalty_customer_direct(a,'Direct Test Member',v_phone,md5(v_phone)||md5(v_phone));
  ASSERT NOT (r->>'ok')::boolean,'Blocked profile rejected';
  UPDATE public.customer_profiles SET blocked_at=NULL,phone_auth_conflict=true WHERE id=pid;
  r:=public.enroll_loyalty_customer_direct(a,'Direct Test Member',v_phone,md5(v_phone)||md5(v_phone));
  ASSERT NOT (r->>'ok')::boolean,'Conflicting identity rejected';
  UPDATE public.customer_profiles SET phone_auth_conflict=false WHERE id=pid;
  UPDATE public.loyalty_cards SET status='suspended' WHERE customer_profile_id=pid;
  r:=public.enroll_loyalty_customer_direct(a,'Direct Test Member',v_phone,md5(v_phone)||md5(v_phone));
  ASSERT NOT (r->>'ok')::boolean,'Suspended card rejected';
  UPDATE public.loyalty_cards SET status='active' WHERE customer_profile_id=pid;
  FOR n IN 1..11 LOOP r:=public.enroll_loyalty_customer_direct(a,'Wrong Name',v_phone,md5(v_phone)||md5(v_phone)); END LOOP;
  ASSERT r->>'reason'='rate_limited','Rejected attempts are counted';
  r:=public.enroll_loyalty_customer_direct(a,'Direct Test Member','123',md5(v_phone)||md5(v_phone));
  ASSERT r->>'reason'='invalid_input';
  UPDATE public.cafe_loyalty_programs SET enabled=false WHERE cafe_id=b;
  r:=public.enroll_loyalty_customer_direct(b,'Direct Test Member',v_phone,md5(v_phone)||md5(v_phone));
  ASSERT r->>'reason'='unavailable','Disabled programs reject enrollment';
  r:=public.enroll_loyalty_customer_direct(gen_random_uuid(),'Direct Test Member',v_phone,md5(v_phone)||md5(v_phone));
  ASSERT r->>'reason'='unavailable','Missing brand rejected';
  ASSERT NOT has_function_privilege('anon','public.enroll_loyalty_customer_direct(uuid,text,text,text)','EXECUTE');
  ASSERT NOT has_function_privilege('authenticated','public.enroll_loyalty_customer_direct(uuid,text,text,text)','EXECUTE');
  ASSERT NOT has_function_privilege('authenticated','public.issue_rast_loyalty_card(uuid)','EXECUTE');
  ASSERT has_function_privilege('service_role','public.enroll_loyalty_customer_direct(uuid,text,text,text)','EXECUTE');
  ASSERT NOT has_schema_privilege('anon','loyalty_enrollment_private','USAGE');
  ASSERT NOT has_schema_privilege('authenticated','loyalty_enrollment_private','USAGE');
END;
$$;
