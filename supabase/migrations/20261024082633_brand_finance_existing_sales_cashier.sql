-- Link a customer's existing identity without replacing credentials or customer data.
BEGIN;
CREATE FUNCTION public.brand_finance_link_sales_cashier(p_cafe_id uuid,p_phone text,p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_name text:=btrim(p_name);v_user auth.users%ROWTYPE;v_staff public.bf_staff%ROWTYPE;
BEGIN
 IF brand_finance_private.role_for(p_cafe_id)<>'owner'
   OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND owner_user_id=auth.uid())
   THEN RAISE EXCEPTION 'Finance owner access required' USING ERRCODE='42501'; END IF;
 IF p_phone IS NULL OR p_phone !~ '^9665[0-9]{8}$' OR v_name IS NULL OR length(v_name) NOT BETWEEN 2 AND 100
   THEN RAISE EXCEPTION 'Invalid sales cashier' USING ERRCODE='22023'; END IF;
 BEGIN
  SELECT * INTO STRICT v_user FROM auth.users WHERE phone IN(p_phone,'+'||p_phone) FOR UPDATE;
 EXCEPTION WHEN no_data_found OR too_many_rows THEN
  RAISE EXCEPTION 'Eligible customer identity required' USING ERRCODE='42501';
 END;
 IF v_user.phone_confirmed_at IS NULL OR v_user.deleted_at IS NOT NULL OR v_user.banned_until>now()
   THEN RAISE EXCEPTION 'Eligible customer identity required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.profiles WHERE id=v_user.id AND status='active' AND role='customer' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Eligible customer identity required' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_staff FROM public.bf_staff WHERE cafe_id=p_cafe_id AND user_id=v_user.id FOR UPDATE;
 IF FOUND THEN
  IF v_staff.role<>'cashier' THEN RAISE EXCEPTION 'Existing finance role cannot be replaced' USING ERRCODE='42501'; END IF;
  IF v_staff.active THEN RETURN jsonb_build_object('id',v_user.id,'changed',false); END IF;
  UPDATE public.bf_staff SET active=true,name=v_name WHERE cafe_id=p_cafe_id AND user_id=v_user.id;
 ELSE
  INSERT INTO public.bf_staff(cafe_id,user_id,name,role,active) VALUES(p_cafe_id,v_user.id,v_name,'cashier',true);
 END IF;
 RETURN jsonb_build_object('id',v_user.id,'changed',true);
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_link_sales_cashier(uuid,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_link_sales_cashier(uuid,text,text) TO authenticated;

-- The trusted OTP service receives eligibility only, never customer identifiers or credentials.
CREATE FUNCTION public.brand_finance_sales_cashier_phone_enabled(p_phone text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(p_phone ~ '^9665[0-9]{8}$',false)
 AND (SELECT count(*)=1 FROM auth.users WHERE phone IN(p_phone,'+'||p_phone))
 AND EXISTS(
  SELECT 1 FROM auth.users u
  JOIN public.profiles p ON p.id=u.id AND p.role='customer' AND p.status='active'
  JOIN public.bf_staff s ON s.user_id=u.id AND s.role='cashier' AND s.active
  JOIN public.cafes c ON c.id=s.cafe_id AND c.deleted_at IS NULL AND c.status IN('active','published')
  WHERE u.phone IN(p_phone,'+'||p_phone) AND u.phone_confirmed_at IS NOT NULL
   AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())
   AND platform_access_private.service_enabled(c.id,'finance')
 );
$$;
REVOKE ALL ON FUNCTION public.brand_finance_sales_cashier_phone_enabled(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.brand_finance_sales_cashier_phone_enabled(text) TO service_role;
COMMIT;
