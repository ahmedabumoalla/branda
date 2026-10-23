BEGIN;

-- Align finance RPC authorization with the platform administrator's existing
-- cross-brand support access. Dashboard maintenance still selects the brand.
-- Keep the real administrator as auth.uid() for document/request attribution;
-- never impersonate the owner, create staff membership, or bypass entitlement.
CREATE OR REPLACE FUNCTION brand_finance_private.role_for(p_cafe uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text;
BEGIN
 IF auth.uid() IS NULL
   OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active')
   OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND deleted_at IS NULL AND status IN('active','published'))
   OR NOT platform_access_private.service_enabled(p_cafe,'finance')
 THEN RAISE EXCEPTION 'Finance access denied' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND owner_user_id=auth.uid()) THEN RETURN 'owner'; END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='platform_admin' AND status='active') THEN RETURN 'manager'; END IF;
 SELECT role INTO r FROM public.bf_staff WHERE cafe_id=p_cafe AND user_id=auth.uid() AND active FOR SHARE;
 IF r IS NULL THEN RAISE EXCEPTION 'Finance staff access denied' USING ERRCODE='42501'; END IF;
 RETURN r;
END $$;

REVOKE ALL ON FUNCTION brand_finance_private.role_for(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Forward rollback: restore the preceding role_for body in a new migration.
-- No table, row, balance, plan, grant to public tables, or existing RPC signature changes.
COMMIT;
