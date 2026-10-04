-- Read-only release verification: schema/permissions only, no employee records,
-- credentials, phone numbers, bearer tokens, sessions or customer writes.
BEGIN READ ONLY;
DO $$
DECLARE v_count integer; v_name text; v_role text; v_privilege text;
BEGIN
  SELECT count(*) INTO v_count FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cafe_cashiers'
      AND ((column_name='phone' AND data_type='text' AND is_nullable='YES')
        OR (column_name='owner_user_id' AND data_type='uuid' AND is_nullable='YES'));
  IF v_count<>2 THEN RAISE EXCEPTION 'Missing cashier contact/owner columns'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.cafe_cashiers'::regclass
      AND conname='cafe_cashiers_cafe_owner_unique' AND contype='u'
      AND pg_get_constraintdef(oid)='UNIQUE (cafe_id, owner_user_id)') THEN
    RAISE EXCEPTION 'Missing owner cashier uniqueness';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.cafe_cashiers'::regclass
      AND contype='f' AND confrelid='auth.users'::regclass
      AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (owner_user_id)%') THEN
    RAISE EXCEPTION 'Missing owner identity foreign key';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.cafe_cashiers'::regclass
      AND contype='c' AND pg_get_constraintdef(oid) LIKE '%phone%') THEN
    RAISE EXCEPTION 'Missing phone constraint';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_index WHERE indexrelid='public.cafe_cashiers_cafe_email_unique'::regclass
      AND indisunique AND indisvalid AND pg_get_expr(indpred,indrelid)='(owner_user_id IS NULL)') THEN
    RAISE EXCEPTION 'Missing employee email uniqueness';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_index WHERE indexrelid='public.cafe_cashiers_owner_user_idx'::regclass AND indisvalid) THEN
    RAISE EXCEPTION 'Missing owner revocation lookup index';
  END IF;
  IF (SELECT count(*) FROM pg_class WHERE oid IN ('public.cafe_cashiers'::regclass,'public.cafe_cashier_sessions'::regclass)
      AND relrowsecurity)<>2 THEN RAISE EXCEPTION 'Cashier/session RLS disabled'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cafe_cashiers'
      AND policyname='cafe_cashiers_owner' AND cmd='SELECT' AND qual LIKE '%active%') THEN
    RAISE EXCEPTION 'Missing active-profile cashier read policy';
  END IF;
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_table_privilege(v_role,'public.cafe_cashiers','INSERT,UPDATE,DELETE,TRUNCATE')
      OR has_table_privilege(v_role,'public.cafe_cashier_sessions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN
      RAISE EXCEPTION 'Unsafe direct cashier/session client privilege: %',v_role;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('authenticated','public.cafe_cashiers','SELECT')
      OR has_table_privilege('anon','public.cafe_cashiers','SELECT') THEN
    RAISE EXCEPTION 'Required cashier backend/read privilege missing';
  END IF;
  FOREACH v_privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
    IF NOT has_table_privilege('service_role','public.cafe_cashier_sessions',v_privilege) THEN
      RAISE EXCEPTION 'Required cashier session backend privilege missing: %',v_privilege;
    END IF;
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY[
    'public.create_cafe_cashier(uuid,text,text,text,text)',
    'public.create_cafe_cashier_with_contact(uuid,text,text,text,text,text)',
    'public.start_owner_cashier_session(uuid)',
    'public.set_cashier_status(uuid,boolean)'
  ] LOOP
    IF NOT has_function_privilege('authenticated',v_name,'EXECUTE')
      OR has_function_privilege('anon',v_name,'EXECUTE')
      OR has_function_privilege('service_role',v_name,'EXECUTE') THEN
      RAISE EXCEPTION 'Unsafe cashier management function privilege: %',v_name;
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=v_name::regprocedure AND prosecdef
        AND array_to_string(proconfig,',') LIKE '%search_path=""%') THEN
      RAISE EXCEPTION 'Missing fixed function search path: %',v_name;
    END IF;
  END LOOP;
  IF has_function_privilege('anon','public.revoke_owner_cashier_sessions()','EXECUTE')
      OR has_function_privilege('authenticated','public.revoke_owner_cashier_sessions()','EXECUTE')
      OR has_function_privilege('service_role','public.revoke_owner_cashier_sessions()','EXECUTE') THEN
    RAISE EXCEPTION 'Revocation trigger helper exposed';
  END IF;
  SELECT count(*) INTO v_count FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O'
    AND tgfoid='public.revoke_owner_cashier_sessions()'::regprocedure
    AND ((tgrelid='public.profiles'::regclass AND tgname IN ('revoke_owner_cashier_profile_update','revoke_owner_cashier_profile_delete'))
      OR (tgrelid='public.cafes'::regclass AND tgname='revoke_owner_cashier_cafe_update'));
  IF v_count<>3 THEN RAISE EXCEPTION 'Owner revocation triggers missing or disabled'; END IF;
  IF pg_get_functiondef('public.login_cafe_cashier(text,text)'::regprocedure) NOT LIKE '%owner_user_id IS NULL%' THEN
    RAISE EXCEPTION 'Owner identity exposed to password login';
  END IF;
END;
$$;
COMMIT;
