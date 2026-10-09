BEGIN;
CREATE OR REPLACE FUNCTION public.start_owner_cashier_session(p_cafe_id uuid)
RETURNS TABLE(token text,cashier_id uuid,cafe_id uuid,expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid:=auth.uid(); v_name text; v_email text; v_cashier uuid; v_token text; v_expires timestamptz; v_admin boolean;
BEGIN
  SELECT p.full_name,p.role='platform_admin',p.email INTO v_name,v_admin,v_email
    FROM public.profiles p WHERE p.id=v_user AND p.status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.cafes c WHERE c.id=p_cafe_id AND (c.owner_user_id=v_user OR v_admin)
    AND c.status IN ('active','published') AND c.deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF NOT v_admin AND NOT platform_access_private.service_enabled(p_cafe_id,'loyalty') THEN
    RAISE EXCEPTION 'Loyalty service unavailable' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(nullif(lower(btrim(u.email)),''),nullif(lower(btrim(v_email)),''),v_user::text||'@owner.invalid')
    INTO v_email FROM auth.users u WHERE u.id=v_user;
  IF NULLIF(btrim(v_name),'') IS NULL OR v_email IS NULL THEN RAISE EXCEPTION 'Owner identity incomplete'; END IF;
  IF v_admin THEN v_name := 'صيانة — '||btrim(v_name); END IF;
  INSERT INTO public.cafe_cashiers(cafe_id,full_name,email,password_hash,temporary_password,created_by,owner_user_id,last_login_at)
  VALUES(p_cafe_id,btrim(v_name),v_email,'!owner-session-only!','',v_user,v_user,now())
  ON CONFLICT ON CONSTRAINT cafe_cashiers_cafe_owner_unique DO UPDATE
    SET full_name=EXCLUDED.full_name,email=EXCLUDED.email,active=true,last_login_at=now(),updated_at=now()
  RETURNING id INTO v_cashier;
  INSERT INTO public.cafe_cashier_sessions(cashier_id,cafe_id,expires_at)
    VALUES(v_cashier,p_cafe_id,now()+CASE WHEN v_admin THEN interval '30 minutes' ELSE interval '8 hours' END)
    RETURNING cafe_cashier_sessions.token,cafe_cashier_sessions.expires_at INTO v_token,v_expires;
  INSERT INTO public.cafe_cashier_activity_logs(cafe_id,cashier_id,action_type,target_type,details)
    VALUES(p_cafe_id,v_cashier,'login','cashier_session',jsonb_build_object('cashierName',btrim(v_name),'actorType',CASE WHEN v_admin THEN 'platform_admin' ELSE 'owner' END));
  RETURN QUERY SELECT v_token,v_cashier,p_cafe_id,v_expires;
END;
$$;
REVOKE ALL ON FUNCTION public.start_owner_cashier_session(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.start_owner_cashier_session(uuid) TO authenticated;
COMMIT;
