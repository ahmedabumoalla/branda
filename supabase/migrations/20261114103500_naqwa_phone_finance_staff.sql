BEGIN;
-- Employer-managed phone identities are scoped to Naqwa. Existing customer and
-- legacy cashier identities retain their own credentials and authorization rules.
CREATE OR REPLACE FUNCTION brand_finance_private.role_for(p_cafe uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text;
BEGIN
 IF auth.uid() IS NULL
   OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active')
   OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND deleted_at IS NULL AND status IN('active','published'))
   OR NOT platform_access_private.service_enabled(p_cafe,'finance')
 THEN RAISE EXCEPTION 'Finance access denied' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM auth.users u WHERE u.id=auth.uid() AND u.raw_app_meta_data->'finance_phone_staff'='true'::jsonb)
   AND NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=auth.uid() AND s.id::text=auth.jwt()->>'session_id')
 THEN RAISE EXCEPTION 'Finance session revoked' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND owner_user_id=auth.uid()) THEN RETURN 'owner'; END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='platform_admin' AND status='active') THEN
  IF brand_finance_private.invoice_settings_maintenance(p_cafe) THEN RETURN 'owner'; END IF;
  RETURN 'manager';
 END IF;
 SELECT role INTO r FROM public.bf_staff WHERE cafe_id=p_cafe AND user_id=auth.uid() AND active FOR SHARE;
 IF r IS NULL THEN RAISE EXCEPTION 'Finance staff access denied' USING ERRCODE='42501'; END IF;
 RETURN r;
END $$;

CREATE FUNCTION public.brand_finance_add_phone_staff(p_cafe_id uuid,p_user_id uuid,p_name text,p_role text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u auth.users%ROWTYPE; v_name text:=btrim(p_name);
BEGIN
 IF p_cafe_id IS DISTINCT FROM '94b9326e-9fd1-4b15-aa70-008ac4387f4b'::uuid
   OR brand_finance_private.role_for(p_cafe_id)<>'owner'
   OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND owner_user_id=auth.uid())
 THEN RAISE EXCEPTION 'Finance owner access required' USING ERRCODE='42501'; END IF;
 IF v_name IS NULL OR length(v_name) NOT BETWEEN 2 AND 100 OR p_role IS NULL OR p_role NOT IN('manager','accountant','warehouse','auditor','cashier')
 THEN RAISE EXCEPTION 'Invalid phone staff'; END IF;
 SELECT * INTO u FROM auth.users WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND OR u.deleted_at IS NOT NULL OR (u.banned_until IS NOT NULL AND u.banned_until>now())
   OR u.phone_confirmed_at IS NULL OR regexp_replace(coalesce(u.phone,''),'^\+','') !~ '^9665[0-9]{8}$'
   OR u.raw_app_meta_data->'finance_staff_provisioned' IS DISTINCT FROM 'true'::jsonb
   OR u.raw_app_meta_data->'finance_phone_staff' IS DISTINCT FROM 'true'::jsonb
   OR u.raw_app_meta_data->>'finance_cafe_id' IS DISTINCT FROM p_cafe_id::text
   OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND status='active' AND role='customer')
 THEN RAISE EXCEPTION 'Trusted phone staff identity required' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.bf_staff WHERE user_id=p_user_id) THEN RAISE EXCEPTION 'Staff already assigned' USING ERRCODE='23505'; END IF;
 INSERT INTO public.bf_staff(cafe_id,user_id,name,role,active) VALUES(p_cafe_id,p_user_id,v_name,p_role,true);
 RETURN jsonb_build_object('id',p_user_id,'role',p_role);
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_add_phone_staff(uuid,uuid,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_add_phone_staff(uuid,uuid,text,text) TO authenticated;

CREATE FUNCTION public.brand_finance_phone_staff_password_target(p_cafe_id uuid,p_user_id uuid,p_revoke boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u auth.users%ROWTYPE;
BEGIN
 IF p_cafe_id IS DISTINCT FROM '94b9326e-9fd1-4b15-aa70-008ac4387f4b'::uuid
   OR brand_finance_private.role_for(p_cafe_id)<>'owner'
   OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND owner_user_id=auth.uid())
   OR p_user_id IS NOT DISTINCT FROM auth.uid()
 THEN RAISE EXCEPTION 'Finance owner access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO u FROM auth.users WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND OR u.deleted_at IS NOT NULL
   OR u.raw_app_meta_data->'finance_staff_provisioned' IS DISTINCT FROM 'true'::jsonb
   OR u.raw_app_meta_data->'finance_phone_staff' IS DISTINCT FROM 'true'::jsonb
   OR u.raw_app_meta_data->>'finance_cafe_id' IS DISTINCT FROM p_cafe_id::text
   OR u.phone_confirmed_at IS NULL
   OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND role='customer')
   OR NOT EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=p_cafe_id AND user_id=p_user_id)
   OR EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id<>p_cafe_id AND user_id=p_user_id)
   OR EXISTS(SELECT 1 FROM public.cafes WHERE owner_user_id=p_user_id)
 THEN RAISE EXCEPTION 'Employer managed identity required' USING ERRCODE='42501'; END IF;
 IF p_revoke THEN
   DELETE FROM auth.sessions WHERE user_id=p_user_id;
 END IF;
 RETURN jsonb_build_object('id',u.id);
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_phone_staff_password_target(uuid,uuid,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_phone_staff_password_target(uuid,uuid,boolean) TO authenticated;

CREATE FUNCTION public.brand_finance_phone_staff_destinations()
RETURNS TABLE(id uuid,slug text,name text,role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate record; live_role text;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=auth.uid() AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now()))
 THEN RAISE EXCEPTION 'Finance authentication required' USING ERRCODE='42501'; END IF;
 FOR candidate IN
   SELECT c.id,c.slug,c.name,s.role FROM public.bf_staff s JOIN public.cafes c ON c.id=s.cafe_id
   WHERE s.user_id=auth.uid() AND s.active AND c.deleted_at IS NULL
     AND (s.role='cashier' OR c.id='94b9326e-9fd1-4b15-aa70-008ac4387f4b'::uuid)
   ORDER BY c.slug,c.id
 LOOP
   BEGIN
     live_role:=brand_finance_private.role_for(candidate.id);
     IF live_role=candidate.role AND live_role IN('manager','accountant','warehouse','auditor','cashier') THEN
       id:=candidate.id;slug:=candidate.slug;name:=candidate.name;role:=live_role;RETURN NEXT;
     END IF;
   EXCEPTION WHEN insufficient_privilege THEN CONTINUE;
   END;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_phone_staff_destinations() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_phone_staff_destinations() TO authenticated;

CREATE FUNCTION public.brand_finance_phone_staff_list(p_cafe_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_cafe_id IS DISTINCT FROM '94b9326e-9fd1-4b15-aa70-008ac4387f4b'::uuid
   OR brand_finance_private.role_for(p_cafe_id)<>'owner'
   OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND owner_user_id=auth.uid())
 THEN RAISE EXCEPTION 'Finance owner access required' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('userId',s.user_id,'phone',coalesce(u.phone,''),'canResetPassword',
   coalesce(u.raw_app_meta_data->'finance_staff_provisioned'='true'::jsonb
    AND u.raw_app_meta_data->'finance_phone_staff'='true'::jsonb
    AND u.raw_app_meta_data->>'finance_cafe_id'=p_cafe_id::text
    AND u.deleted_at IS NULL AND u.phone_confirmed_at IS NOT NULL AND s.user_id<>auth.uid()
    AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=s.user_id AND p.role='customer')
    AND NOT EXISTS(SELECT 1 FROM public.bf_staff other WHERE other.user_id=s.user_id AND other.cafe_id<>p_cafe_id)
    AND NOT EXISTS(SELECT 1 FROM public.cafes owned WHERE owned.owner_user_id=s.user_id),false)) ORDER BY s.user_id),'[]'::jsonb)
   FROM public.bf_staff s JOIN auth.users u ON u.id=s.user_id WHERE s.cafe_id=p_cafe_id);
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_phone_staff_list(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_phone_staff_list(uuid) TO authenticated;
COMMIT;
