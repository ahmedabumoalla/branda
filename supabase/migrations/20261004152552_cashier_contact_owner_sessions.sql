-- Employee credentials are hashed only; authenticated owners receive their own
-- cashier identity without sharing or replacing an employee's credentials.
BEGIN;

ALTER TABLE public.cafe_cashiers
  ADD COLUMN phone text CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$'),
  ADD COLUMN owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT cafe_cashiers_cafe_owner_unique UNIQUE (cafe_id, owner_user_id);
CREATE INDEX cafe_cashiers_owner_user_idx ON public.cafe_cashiers(owner_user_id)
  WHERE owner_user_id IS NOT NULL;
DROP INDEX public.cafe_cashiers_cafe_email_unique;
CREATE UNIQUE INDEX cafe_cashiers_cafe_email_unique
  ON public.cafe_cashiers(cafe_id, lower(email)) WHERE owner_user_id IS NULL;

-- New credentials below never persist plaintext. Historical rows stay unchanged.
ALTER TABLE public.cafe_cashiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cafe_cashier_sessions ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cafe_cashiers FROM anon, authenticated;
REVOKE ALL ON public.cafe_cashier_sessions FROM anon, authenticated;
DROP POLICY IF EXISTS cafe_cashiers_owner ON public.cafe_cashiers;
CREATE POLICY cafe_cashiers_owner ON public.cafe_cashiers FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.status='active')
  AND (public.has_cafe_permission(cafe_id,'cashier') OR public.has_cafe_permission(cafe_id,'loyalty') OR public.is_platform_admin())
);

CREATE OR REPLACE FUNCTION public.create_cafe_cashier(
  p_cafe_id uuid,p_full_name text,p_email text,p_temp_password text,p_employee_number text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active')
    OR NOT COALESCE(public.has_cafe_permission(p_cafe_id,'cashier') OR public.has_cafe_permission(p_cafe_id,'loyalty') OR public.is_platform_admin(),false)
    OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND status IN ('active','published') AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;
  IF p_full_name IS NULL OR char_length(btrim(p_full_name)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Invalid cashier name';
  END IF;
  IF p_email IS NULL OR char_length(btrim(p_email))>254 OR btrim(p_email) !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email';
  END IF;
  IF p_temp_password IS NULL OR char_length(p_temp_password) NOT BETWEEN 6 AND 40 OR octet_length(p_temp_password)>72 THEN
    RAISE EXCEPTION 'Invalid password';
  END IF;
  IF char_length(btrim(COALESCE(p_employee_number,'')))>40 THEN RAISE EXCEPTION 'Invalid employee number'; END IF;
  -- Password login has no brand parameter: new employee addresses must therefore
  -- be globally unambiguous. Serialize equal addresses without rewriting old rows.
  PERFORM pg_advisory_xact_lock(hashtextextended(lower(btrim(p_email)),0));
  IF EXISTS(SELECT 1 FROM public.cafe_cashiers WHERE lower(email)=lower(btrim(p_email)) AND owner_user_id IS NULL) THEN
    RAISE EXCEPTION 'Cashier email already exists' USING ERRCODE='23505';
  END IF;
  INSERT INTO public.cafe_cashiers(cafe_id,full_name,email,employee_number,password_hash,temporary_password,created_by)
  VALUES(p_cafe_id,btrim(p_full_name),lower(btrim(p_email)),NULLIF(btrim(COALESCE(p_employee_number,'')),''),
    extensions.crypt(p_temp_password,extensions.gen_salt('bf')),'',auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.create_cafe_cashier_with_contact(
  p_cafe_id uuid,p_full_name text,p_email text,p_password text,p_phone text,p_employee_number text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid; v_phone text;
BEGIN
  IF p_full_name IS NULL OR char_length(btrim(p_full_name)) NOT BETWEEN 2 AND 80 OR p_full_name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Invalid cashier name';
  END IF;
  IF p_password IS NULL OR char_length(p_password) NOT BETWEEN 8 AND 40 OR char_length(btrim(p_password))<8
    OR octet_length(p_password)>72 OR p_password ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Invalid password';
  END IF;
  IF p_phone IS NULL OR char_length(p_phone)>40 OR p_phone !~ '^[+0-9 ()-]+$' THEN RAISE EXCEPTION 'Invalid phone'; END IF;
  v_phone:=regexp_replace(p_phone,'[ ()-]','','g');
  IF v_phone ~ '^05[0-9]{8}$' THEN v_phone:='+966'||substr(v_phone,2);
  ELSIF v_phone LIKE '00%' THEN v_phone:='+'||substr(v_phone,3);
  ELSIF v_phone ~ '^9665[0-9]{8}$' THEN v_phone:='+'||v_phone; END IF;
  IF v_phone !~ '^\+[1-9][0-9]{7,14}$' THEN RAISE EXCEPTION 'Invalid phone'; END IF;
  v_id:=public.create_cafe_cashier(p_cafe_id,p_full_name,p_email,p_password,p_employee_number);
  UPDATE public.cafe_cashiers SET phone=v_phone WHERE id=v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_cashier_status(p_cashier_id uuid,p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_cashier public.cafe_cashiers%ROWTYPE;
BEGIN
  SELECT * INTO v_cashier FROM public.cafe_cashiers WHERE id=p_cashier_id FOR UPDATE;
  IF v_cashier.id IS NULL OR v_cashier.owner_user_id IS NOT NULL OR p_active IS NULL
    OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active')
    OR NOT COALESCE(public.has_cafe_permission(v_cashier.cafe_id,'cashier') OR public.has_cafe_permission(v_cashier.cafe_id,'loyalty') OR public.is_platform_admin(),false) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;
  UPDATE public.cafe_cashiers SET active=p_active,updated_at=now() WHERE id=p_cashier_id;
  IF NOT p_active THEN
    UPDATE public.cafe_cashier_sessions SET revoked_at=now() WHERE cashier_id=p_cashier_id AND revoked_at IS NULL;
  END IF;
END;
$$;

CREATE FUNCTION public.start_owner_cashier_session(p_cafe_id uuid)
RETURNS TABLE(token text,cashier_id uuid,cafe_id uuid,expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid:=auth.uid(); v_name text; v_email text; v_cashier uuid; v_token text; v_expires timestamptz;
BEGIN
  -- Lock both sources of authorization until commit so concurrent suspension or
  -- ownership transfer cannot leave a newly issued session outside revocation.
  SELECT p.full_name INTO v_name FROM public.profiles p WHERE p.id=v_user AND p.status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.cafes c WHERE c.id=p_cafe_id AND c.owner_user_id=v_user
    AND c.status IN ('active','published') AND c.deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  SELECT lower(btrim(u.email)) INTO v_email FROM auth.users u WHERE u.id=v_user;
  IF NULLIF(btrim(v_name),'') IS NULL OR NULLIF(v_email,'') IS NULL THEN RAISE EXCEPTION 'Owner identity incomplete'; END IF;
  INSERT INTO public.cafe_cashiers(cafe_id,full_name,email,password_hash,temporary_password,created_by,owner_user_id,last_login_at)
  VALUES(p_cafe_id,btrim(v_name),v_email,'!owner-session-only!','',v_user,v_user,now())
  ON CONFLICT ON CONSTRAINT cafe_cashiers_cafe_owner_unique DO UPDATE
    SET full_name=EXCLUDED.full_name,email=EXCLUDED.email,active=true,last_login_at=now(),updated_at=now()
  RETURNING id INTO v_cashier;
  INSERT INTO public.cafe_cashier_sessions(cashier_id,cafe_id,expires_at)
    VALUES(v_cashier,p_cafe_id,now()+interval '8 hours')
    RETURNING cafe_cashier_sessions.token,cafe_cashier_sessions.expires_at INTO v_token,v_expires;
  INSERT INTO public.cafe_cashier_activity_logs(cafe_id,cashier_id,action_type,target_type,details)
    VALUES(p_cafe_id,v_cashier,'login','cashier_session',jsonb_build_object('cashierName',btrim(v_name),'actorType','owner'));
  RETURN QUERY SELECT v_token,v_cashier,p_cafe_id,v_expires;
END;
$$;

-- Existing token RPCs already reject revoked sessions. Revoke in the same
-- transaction as loss of ownership/profile access, including direct admin writes.
CREATE FUNCTION public.revoke_owner_cashier_sessions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_TABLE_NAME='profiles' THEN
    IF TG_OP='DELETE' OR NEW.status IS DISTINCT FROM 'active' THEN
      UPDATE public.cafe_cashier_sessions s SET revoked_at=now()
        FROM public.cafe_cashiers c WHERE s.cashier_id=c.id AND c.owner_user_id=OLD.id AND s.revoked_at IS NULL;
      UPDATE public.cafe_cashiers SET active=false WHERE owner_user_id=OLD.id;
    END IF;
  ELSE
    IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id OR NEW.status NOT IN ('active','published') OR NEW.deleted_at IS NOT NULL THEN
      UPDATE public.cafe_cashier_sessions s SET revoked_at=now()
        FROM public.cafe_cashiers c WHERE s.cashier_id=c.id AND c.cafe_id=OLD.id AND c.owner_user_id IS NOT NULL AND s.revoked_at IS NULL;
      UPDATE public.cafe_cashiers SET active=false WHERE cafe_id=OLD.id AND owner_user_id IS NOT NULL;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER revoke_owner_cashier_profile_update AFTER UPDATE OF status ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.revoke_owner_cashier_sessions();
CREATE TRIGGER revoke_owner_cashier_profile_delete AFTER DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.revoke_owner_cashier_sessions();
CREATE TRIGGER revoke_owner_cashier_cafe_update AFTER UPDATE OF owner_user_id,status,deleted_at ON public.cafes
FOR EACH ROW EXECUTE FUNCTION public.revoke_owner_cashier_sessions();

CREATE OR REPLACE FUNCTION public.login_cafe_cashier(p_email text,p_password text)
RETURNS TABLE(token text,cafe_id uuid,cashier_id uuid,cashier_name text,cafe_name text,cafe_slug text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_cashier public.cafe_cashiers%ROWTYPE; v_cafe public.cafes%ROWTYPE; v_token text;
BEGIN
  IF p_email IS NULL OR btrim(p_email)='' OR char_length(p_email)>254
    OR p_password IS NULL OR p_password='' OR char_length(p_password)>200 THEN RAISE EXCEPTION 'Invalid cashier credentials'; END IF;
  SELECT * INTO v_cashier FROM public.cafe_cashiers
    WHERE lower(email)=lower(btrim(p_email)) AND active=true AND owner_user_id IS NULL LIMIT 1;
  IF v_cashier.id IS NULL OR v_cashier.password_hash IS DISTINCT FROM extensions.crypt(p_password,v_cashier.password_hash) THEN
    RAISE EXCEPTION 'Invalid cashier credentials';
  END IF;
  SELECT * INTO v_cafe FROM public.cafes WHERE id=v_cashier.cafe_id;
  IF v_cafe.id IS NULL OR v_cafe.deleted_at IS NOT NULL OR v_cafe.status NOT IN ('active','published') THEN RAISE EXCEPTION 'Brand not found'; END IF;
  INSERT INTO public.cafe_cashier_sessions(cashier_id,cafe_id) VALUES(v_cashier.id,v_cashier.cafe_id)
    RETURNING cafe_cashier_sessions.token INTO v_token;
  UPDATE public.cafe_cashiers SET last_login_at=now() WHERE id=v_cashier.id;
  INSERT INTO public.cafe_cashier_activity_logs(cafe_id,cashier_id,action_type,target_type,details)
    VALUES(v_cashier.cafe_id,v_cashier.id,'login','cashier_session',jsonb_build_object('email',v_cashier.email,'cashierName',v_cashier.full_name));
  RETURN QUERY SELECT v_token,v_cafe.id,v_cashier.id,v_cashier.full_name,v_cafe.name,v_cafe.slug::text;
END;
$$;

REVOKE ALL ON FUNCTION public.create_cafe_cashier(uuid,text,text,text,text),
  public.create_cafe_cashier_with_contact(uuid,text,text,text,text,text),public.start_owner_cashier_session(uuid),
  public.set_cashier_status(uuid,boolean),public.revoke_owner_cashier_sessions() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_cafe_cashier(uuid,text,text,text,text),
  public.create_cafe_cashier_with_contact(uuid,text,text,text,text,text),public.start_owner_cashier_session(uuid),
  public.set_cashier_status(uuid,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.login_cafe_cashier(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_cafe_cashier(text,text) TO anon,authenticated;
COMMIT;
