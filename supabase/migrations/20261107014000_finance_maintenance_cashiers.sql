BEGIN;

-- A narrow service-only path for a signed, audited maintenance session.
-- Owner RPCs and the general finance permission matrix remain unchanged.
CREATE FUNCTION public.brand_finance_maintenance_cashier(
 p_cafe_id uuid,p_actor_id uuid,p_maintenance_expires_at timestamptz,p_operation text,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE session_record record; target auth.users%ROWTYPE; member public.bf_staff%ROWTYPE;
 cashier_name text:=btrim(p_payload->>'name'); cashier_phone text:=p_payload->>'phone'; changed boolean:=true;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor_id AND role='platform_admin' AND status='active')
  OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND deleted_at IS NULL AND status IN('active','published'))
  OR NOT platform_access_private.service_enabled(p_cafe_id,'finance')
 THEN RAISE EXCEPTION 'Maintenance administrator required' USING ERRCODE='42501'; END IF;
 SELECT action,new_data INTO session_record FROM public.audit_logs
 WHERE actor_id=p_actor_id AND cafe_id=p_cafe_id AND action IN('maintenance_mode_started','maintenance_mode_ended')
 ORDER BY created_at DESC,id DESC LIMIT 1;
 IF NOT FOUND OR session_record.action<>'maintenance_mode_started'
  OR p_maintenance_expires_at IS NULL OR p_maintenance_expires_at<=clock_timestamp()
  OR (session_record.new_data->>'expires_at')::timestamptz IS DISTINCT FROM p_maintenance_expires_at
 THEN RAISE EXCEPTION 'Active matching maintenance session required' USING ERRCODE='42501'; END IF;
 IF p_operation='authorize' THEN RETURN jsonb_build_object('authorized',true); END IF;
 IF p_operation IS NULL OR p_operation NOT IN('add','link','update')
  OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>2000
  OR cashier_name IS NULL OR length(cashier_name) NOT BETWEEN 2 AND 100
 THEN RAISE EXCEPTION 'Invalid cashier command' USING ERRCODE='22023'; END IF;
 IF p_operation='link' THEN
  IF cashier_phone IS NULL OR cashier_phone !~ '^9665[0-9]{8}$' THEN RAISE EXCEPTION 'Invalid cashier phone' USING ERRCODE='22023'; END IF;
  BEGIN
   SELECT * INTO STRICT target FROM auth.users WHERE phone IN(cashier_phone,'+'||cashier_phone) FOR UPDATE;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
   RAISE EXCEPTION 'Eligible cashier identity required' USING ERRCODE='42501';
  END;
 ELSE
  SELECT * INTO target FROM auth.users WHERE id=(p_payload->>'userId')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Eligible cashier identity required' USING ERRCODE='42501'; END IF;
 END IF;
 IF p_operation IN('add','link') THEN
  IF target.phone_confirmed_at IS NULL OR target.deleted_at IS NOT NULL OR target.banned_until>clock_timestamp()
   OR regexp_replace(coalesce(target.phone,''),'^\+','') !~ '^9665[0-9]{8}$'
  THEN RAISE EXCEPTION 'Eligible cashier identity required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.profiles WHERE id=target.id AND status='active' AND role='customer' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Eligible customer identity required' USING ERRCODE='42501'; END IF;
 END IF;
 IF p_operation='add' THEN
  IF target.raw_app_meta_data->'finance_staff_provisioned' IS DISTINCT FROM 'true'::jsonb
   OR target.raw_app_meta_data->>'finance_cafe_id' IS DISTINCT FROM p_cafe_id::text
   OR EXISTS(SELECT 1 FROM public.bf_staff WHERE user_id=target.id)
  THEN RAISE EXCEPTION 'Trusted unassigned cashier required' USING ERRCODE='42501'; END IF;
  INSERT INTO public.bf_staff(cafe_id,user_id,name,role,active) VALUES(p_cafe_id,target.id,cashier_name,'cashier',true);
 ELSE
  SELECT * INTO member FROM public.bf_staff WHERE cafe_id=p_cafe_id AND user_id=target.id FOR UPDATE;
  IF FOUND AND member.role<>'cashier' THEN RAISE EXCEPTION 'Existing finance role cannot be replaced' USING ERRCODE='42501'; END IF;
  IF p_operation='update' THEN
   IF member.user_id IS NULL OR p_payload->>'role' IS DISTINCT FROM 'cashier' OR jsonb_typeof(p_payload->'active') IS DISTINCT FROM 'boolean'
   THEN RAISE EXCEPTION 'Existing cashier required' USING ERRCODE='42501'; END IF;
   changed:=member.name IS DISTINCT FROM cashier_name OR member.active IS DISTINCT FROM (p_payload->>'active')::boolean;
   UPDATE public.bf_staff SET name=cashier_name,active=(p_payload->>'active')::boolean WHERE cafe_id=p_cafe_id AND user_id=target.id AND role='cashier';
  ELSIF member.user_id IS NOT NULL THEN
   changed:=NOT member.active;
   IF changed THEN UPDATE public.bf_staff SET active=true,name=cashier_name WHERE cafe_id=p_cafe_id AND user_id=target.id AND role='cashier'; END IF;
  ELSE
   INSERT INTO public.bf_staff(cafe_id,user_id,name,role,active) VALUES(p_cafe_id,target.id,cashier_name,'cashier',true);
  END IF;
 END IF;
 IF changed THEN
  INSERT INTO public.audit_logs(actor_id,cafe_id,action,entity_table,entity_id,new_data)
  VALUES(p_actor_id,p_cafe_id,'maintenance_cashier_'||p_operation,'bf_staff',target.id,
   jsonb_build_object('role','cashier','active',CASE WHEN p_operation='update' THEN (p_payload->>'active')::boolean ELSE true END));
 END IF;
 RETURN jsonb_build_object('id',target.id,'role','cashier','changed',changed);
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_maintenance_cashier(uuid,uuid,timestamptz,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.brand_finance_maintenance_cashier(uuid,uuid,timestamptz,text,jsonb) TO service_role;
COMMIT;
