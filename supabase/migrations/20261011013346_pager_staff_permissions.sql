BEGIN;
ALTER TABLE public.cafe_cashiers
 ADD COLUMN can_use_loyalty boolean NOT NULL DEFAULT true,
 ADD COLUMN can_use_pager boolean NOT NULL DEFAULT false,
 ADD COLUMN pager_station text NOT NULL DEFAULT '',
 ADD CONSTRAINT cafe_cashiers_permission_required CHECK (can_use_loyalty OR can_use_pager),
 ADD CONSTRAINT cafe_cashiers_station_length CHECK (char_length(pager_station)<=80 AND pager_station !~ '[[:cntrl:]]');

-- Shared staff management keeps tenant policies and direct-write restrictions.
DROP POLICY package_service_access ON public.cafe_cashiers;
CREATE POLICY package_service_access ON public.cafe_cashiers AS RESTRICTIVE FOR ALL TO anon,authenticated
 USING (public.is_platform_admin() OR platform_access_private.service_enabled(cafe_id,'loyalty') OR platform_access_private.service_enabled(cafe_id,'pager'))
 WITH CHECK (public.is_platform_admin() OR platform_access_private.service_enabled(cafe_id,'loyalty') OR platform_access_private.service_enabled(cafe_id,'pager'));
CREATE FUNCTION platform_access_private.guard_staff_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.is_platform_admin() AND NOT (platform_access_private.service_enabled(NEW.cafe_id,'loyalty') OR platform_access_private.service_enabled(NEW.cafe_id,'pager')) THEN
  RAISE EXCEPTION 'Staff service unavailable' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND NEW.cafe_id IS DISTINCT FROM OLD.cafe_id THEN RAISE EXCEPTION 'Staff tenant cannot change' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_access_private.guard_staff_write() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER package_service_write ON public.cafe_cashiers;
CREATE TRIGGER package_service_write BEFORE INSERT OR UPDATE ON public.cafe_cashiers FOR EACH ROW EXECUTE FUNCTION platform_access_private.guard_staff_write();

CREATE FUNCTION public.update_cafe_staff_permissions(p_cafe_id uuid,p_cashier_id uuid,p_can_use_loyalty boolean,p_can_use_pager boolean,p_pager_station text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_staff public.cafe_cashiers%ROWTYPE;
BEGIN
 SELECT * INTO v_staff FROM public.cafe_cashiers WHERE id=p_cashier_id AND cafe_id=p_cafe_id FOR UPDATE;
 IF v_staff.id IS NULL OR v_staff.owner_user_id IS NOT NULL
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active')
  OR NOT COALESCE(public.has_cafe_permission(p_cafe_id,'cashier') OR public.has_cafe_permission(p_cafe_id,'loyalty') OR public.has_cafe_permission(p_cafe_id,'pager') OR public.is_platform_admin(),false) THEN
  RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
 END IF;
 IF p_can_use_loyalty IS NULL OR p_can_use_pager IS NULL OR NOT(p_can_use_loyalty OR p_can_use_pager) THEN RAISE EXCEPTION 'Select a staff permission'; END IF;
 IF NOT public.is_platform_admin() AND ((p_can_use_loyalty AND NOT platform_access_private.service_enabled(p_cafe_id,'loyalty')) OR (p_can_use_pager AND NOT platform_access_private.service_enabled(p_cafe_id,'pager'))) THEN
  RAISE EXCEPTION 'Staff service unavailable' USING ERRCODE='42501';
 END IF;
 UPDATE public.cafe_cashiers SET can_use_loyalty=p_can_use_loyalty,can_use_pager=p_can_use_pager,pager_station=btrim(coalesce(p_pager_station,'')),updated_at=now() WHERE id=p_cashier_id AND cafe_id=p_cafe_id;
 -- Permission changes take effect for every browser immediately.
 UPDATE public.cafe_cashier_sessions SET revoked_at=now() WHERE cashier_id=p_cashier_id AND cafe_id=p_cafe_id AND revoked_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.update_cafe_staff_permissions(uuid,uuid,boolean,boolean,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.update_cafe_staff_permissions(uuid,uuid,boolean,boolean,text) TO authenticated;

CREATE FUNCTION public.create_cafe_staff(p_cafe_id uuid,p_full_name text,p_email text,p_password text,p_phone text,p_employee_number text DEFAULT NULL,p_can_use_loyalty boolean DEFAULT true,p_can_use_pager boolean DEFAULT false,p_pager_station text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;
BEGIN
 v_id:=public.create_cafe_cashier_with_contact(p_cafe_id,p_full_name,p_email,p_password,p_phone,p_employee_number);
 PERFORM public.update_cafe_staff_permissions(p_cafe_id,v_id,p_can_use_loyalty,p_can_use_pager,p_pager_station);
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.create_cafe_staff(uuid,text,text,text,text,text,boolean,boolean,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.create_cafe_staff(uuid,text,text,text,text,text,boolean,boolean,text) TO authenticated;

CREATE FUNCTION platform_access_private.assert_cashier_loyalty(p_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM public.cafe_cashier_sessions s JOIN public.cafe_cashiers c ON c.id=s.cashier_id AND c.cafe_id=s.cafe_id
 JOIN public.cafes b ON b.id=s.cafe_id
 WHERE s.token=p_token AND s.revoked_at IS NULL AND s.expires_at>now() AND c.active AND c.can_use_loyalty
 AND b.deleted_at IS NULL AND b.status IN ('active','published') AND platform_access_private.service_enabled(s.cafe_id,'loyalty') FOR SHARE OF s,c,b;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Cashier loyalty permission denied' USING ERRCODE='42501';
 END IF;
END $$;
REVOKE ALL ON FUNCTION platform_access_private.assert_cashier_loyalty(text) FROM PUBLIC,anon,authenticated,service_role;

-- Preserve function bodies, entitlements, grants and legacy behavior while adding
-- an independent permission check to every existing token-based loyalty entry.
DO $$
DECLARE item record; v_definition text; v_token text;
BEGIN
 FOR item IN SELECT p.oid,p.proname,p.proargnames FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('record_loyalty_card_operation','record_loyalty_card_operation_legacy','scan_loyalty_stamp','redeem_loyalty_reward','preview_loyalty_card','preview_loyalty_reward','execute_loyalty_audited_operation','get_cashier_console','cashier_accept_order','cashier_accept_reservation') LOOP
  v_token:=CASE WHEN 'p_cashier_session_token'=ANY(item.proargnames) THEN 'p_cashier_session_token' WHEN 'p_session_token'=ANY(item.proargnames) THEN 'p_session_token' ELSE NULL END;
  IF v_token IS NULL THEN RAISE EXCEPTION 'Unexpected cashier RPC signature %',item.proname; END IF;
  v_definition:=pg_get_functiondef(item.oid);
  IF v_token='p_cashier_session_token' THEN
   v_definition:=regexp_replace(v_definition,'\mBEGIN\M',format('BEGIN IF %I IS NOT NULL THEN PERFORM platform_access_private.assert_cashier_loyalty(%I); END IF;',v_token,v_token),'i');
  ELSE
   v_definition:=regexp_replace(v_definition,'\mBEGIN\M',format('BEGIN PERFORM platform_access_private.assert_cashier_loyalty(%I);',v_token),'i');
  END IF;
  EXECUTE v_definition;
 END LOOP;
 -- The owner still authenticates through the original verified identity flow.
 v_definition:=pg_get_functiondef('public.start_owner_cashier_session(uuid)'::regprocedure);
 v_definition:=replace(v_definition,'NOT platform_access_private.service_enabled(p_cafe_id,''loyalty'')','NOT (platform_access_private.service_enabled(p_cafe_id,''loyalty'') OR platform_access_private.service_enabled(p_cafe_id,''pager''))');
 v_definition:=replace(v_definition,'owner_user_id,last_login_at)','owner_user_id,last_login_at,can_use_loyalty,can_use_pager)');
 v_definition:=replace(v_definition,'''!owner-session-only!'','''',v_user,v_user,now())','''!owner-session-only!'','''',v_user,v_user,now(),true,true)');
 v_definition:=replace(v_definition,'active=true,last_login_at=now()','active=true,can_use_loyalty=true,can_use_pager=true,last_login_at=now()');
 EXECUTE v_definition;
END $$;
COMMIT;
