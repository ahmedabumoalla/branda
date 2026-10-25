-- New phone-authenticated sales cashiers remain isolated from loyalty and dashboard membership.
BEGIN;
CREATE FUNCTION public.brand_finance_add_sales_cashier(p_cafe_id uuid,p_user_id uuid,p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_name text:=btrim(p_name); v_user auth.users%ROWTYPE;
BEGIN
 IF brand_finance_private.role_for(p_cafe_id)<>'owner'
   OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND owner_user_id=auth.uid())
   THEN RAISE EXCEPTION 'Finance owner access required' USING ERRCODE='42501'; END IF;
 IF v_name IS NULL OR length(v_name) NOT BETWEEN 2 AND 100 OR p_user_id IS NULL
   THEN RAISE EXCEPTION 'Invalid sales cashier'; END IF;
 SELECT * INTO v_user FROM auth.users WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND OR v_user.phone_confirmed_at IS NULL
   OR regexp_replace(coalesce(v_user.phone,''),'^\+','') !~ '^9665[0-9]{8}$'
   OR v_user.raw_app_meta_data->'finance_staff_provisioned' IS DISTINCT FROM 'true'::jsonb
   OR v_user.raw_app_meta_data->>'finance_cafe_id' IS DISTINCT FROM p_cafe_id::text
   OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND status='active' AND role='customer')
   THEN RAISE EXCEPTION 'Trusted sales cashier identity required' USING ERRCODE='42501'; END IF;
 -- No upsert: existing accounts and existing memberships are never repurposed.
 IF EXISTS(SELECT 1 FROM public.bf_staff WHERE user_id=p_user_id)
   THEN RAISE EXCEPTION 'Sales cashier already assigned' USING ERRCODE='23505'; END IF;
 INSERT INTO public.bf_staff(cafe_id,user_id,name,role,active) VALUES(p_cafe_id,p_user_id,v_name,'cashier',true);
 RETURN jsonb_build_object('id',p_user_id,'role','cashier');
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_add_sales_cashier(uuid,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_add_sales_cashier(uuid,uuid,text) TO authenticated;
COMMIT;
