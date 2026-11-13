BEGIN;
-- No idle/time expiry for active operator accounts. Explicit logout and account
-- suspension keep their existing revocation paths. Expired/revoked rows stay closed.
CREATE OR REPLACE FUNCTION platform_access_private.persistent_staff_session() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.revoked_at IS NULL AND EXISTS(
  SELECT 1 FROM public.cafe_cashiers c WHERE c.id=NEW.cashier_id AND c.cafe_id=NEW.cafe_id AND c.active
   AND (c.owner_user_id IS NULL OR EXISTS(SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id
     WHERE p.id=c.owner_user_id AND p.status='active' AND (u.banned_until IS NULL OR u.banned_until<=now()) AND u.deleted_at IS NULL))
 ) THEN NEW.expires_at:='9999-12-31 00:00:00+00'::timestamptz; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_access_private.persistent_staff_session() FROM PUBLIC,anon,authenticated,service_role;

UPDATE public.cafe_cashier_sessions s SET expires_at='9999-12-31 00:00:00+00'::timestamptz
FROM public.cafe_cashiers c
WHERE c.id=s.cashier_id AND c.cafe_id=s.cafe_id AND c.active AND s.revoked_at IS NULL AND s.expires_at>now()
 AND (c.owner_user_id IS NULL OR EXISTS(SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id
   WHERE p.id=c.owner_user_id AND p.status='active' AND (u.banned_until IS NULL OR u.banned_until<=now()) AND u.deleted_at IS NULL));

-- Boolean-only, identity derived from the verified JWT. No caller-supplied user id.
CREATE FUNCTION public.current_account_active() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id
  WHERE p.id=auth.uid() AND p.status='active' AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now()));
$$;
REVOKE ALL ON FUNCTION public.current_account_active() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.current_account_active() TO authenticated;

-- Existing role-based policies must also reject suspended/banned administrators.
CREATE OR REPLACE FUNCTION public.is_platform_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.current_account_active() AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='platform_admin');
$$;
COMMIT;
