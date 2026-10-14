-- Synthetic enrollments and trigger changes are always enclosed in ROLLBACK.
DO $$
DECLARE a uuid; b uuid; r jsonb; pid uuid; old_pid uuid; old_code text; v_phone text; v_second text;
  first_number integer; original_cards jsonb; after_cards jsonb;
BEGIN
  SELECT jsonb_object_agg(id,to_jsonb(c)) INTO original_cards FROM public.loyalty_cards c;
  SELECT c.id INTO a FROM public.cafes c JOIN public.cafe_loyalty_programs p ON p.cafe_id=c.id AND p.enabled
    WHERE c.deleted_at IS NULL AND platform_access_private.service_enabled(c.id,'loyalty')
      AND NOT EXISTS(SELECT 1 FROM public.loyalty_cards x WHERE x.cafe_id=c.id AND (x.card_code='10000' OR x.display_number IS NOT NULL)) LIMIT 1;
  SELECT c.id INTO b FROM public.cafes c JOIN public.cafe_loyalty_programs p ON p.cafe_id=c.id AND p.enabled
    WHERE c.deleted_at IS NULL AND c.id<>a AND platform_access_private.service_enabled(c.id,'loyalty') LIMIT 1;
  ASSERT a IS NOT NULL AND b IS NOT NULL;
  LOOP
    v_phone:='9665'||lpad(floor(random()*100000000)::bigint::text,8,'0');
    EXIT WHEN NOT EXISTS(SELECT 1 FROM public.customer_profiles WHERE phone_normalized=v_phone);
  END LOOP;
  -- Emulate a pre-migration card, including a legacy numeric code collision.
  ALTER TABLE public.loyalty_cards DISABLE TRIGGER loyalty_card_display_number;
  r:=public.enroll_loyalty_customer_direct(a,'Legacy Display Fixture',v_phone,md5(v_phone)||md5(v_phone));
  ASSERT (r->>'ok')::boolean;
  old_pid:=(r->>'profile_id')::uuid;
  UPDATE public.loyalty_cards SET card_code='10000' WHERE customer_profile_id=old_pid;
  ALTER TABLE public.loyalty_cards ENABLE TRIGGER loyalty_card_display_number;
  old_code:=public.issue_rast_loyalty_card(old_pid);
  ASSERT old_code='10000';
  ASSERT (SELECT display_number IS NULL FROM public.loyalty_cards WHERE customer_profile_id=old_pid),'Existing cards never get renumbered';
  LOOP
    v_second:='9665'||lpad(floor(random()*100000000)::bigint::text,8,'0');
    EXIT WHEN NOT EXISTS(SELECT 1 FROM public.customer_profiles WHERE phone_normalized=v_second);
  END LOOP;
  r:=public.enroll_loyalty_customer_direct(a,'New Display Fixture',v_second,md5(v_second)||md5(v_second));
  ASSERT (r->>'ok')::boolean;
  pid:=(r->>'profile_id')::uuid;
  SELECT display_number INTO first_number FROM public.loyalty_cards WHERE customer_profile_id=pid;
  ASSERT first_number=10001,'Skip legacy five-digit code';
  ASSERT (SELECT length(card_code)>5 AND card_code<>display_number::text FROM public.loyalty_cards WHERE customer_profile_id=pid),'Public QR code is not shortened';
  PERFORM public.issue_rast_loyalty_card(pid);
  ASSERT (SELECT display_number=first_number FROM public.loyalty_cards WHERE customer_profile_id=pid),'Retry keeps number';
  BEGIN
    UPDATE public.loyalty_cards SET display_number=12345 WHERE customer_profile_id=pid;
    RAISE EXCEPTION 'Expected immutable number rejection';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM='Card display number is immutable';
  END;
  r:=public.enroll_loyalty_customer_direct(b,'New Display Fixture',v_second,md5(v_second)||md5(v_second));
  ASSERT (r->>'ok')::boolean;
  ASSERT (SELECT display_number BETWEEN 10000 AND 99999 FROM public.loyalty_cards WHERE customer_profile_id=(r->>'profile_id')::uuid);
  SELECT jsonb_object_agg(id,to_jsonb(c)) INTO after_cards FROM public.loyalty_cards c WHERE original_cards ? id::text;
  ASSERT after_cards IS NOT DISTINCT FROM original_cards,'Every real preexisting card remains byte-for-byte unchanged';
  ASSERT NOT has_function_privilege('anon','loyalty_enrollment_private.assign_display_number()','EXECUTE');
  ASSERT NOT has_function_privilege('authenticated','loyalty_enrollment_private.assign_display_number()','EXECUTE');
END;
$$;
