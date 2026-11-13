BEGIN;
-- Ordinary cashier tokens remain revocable, with no time/idle expiry.
-- Owner impersonation and maintenance sessions retain their short lifetimes.
CREATE FUNCTION platform_access_private.persistent_staff_session() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.revoked_at IS NULL AND EXISTS(
  SELECT 1 FROM public.cafe_cashiers c WHERE c.id=NEW.cashier_id AND c.cafe_id=NEW.cafe_id
   AND c.owner_user_id IS NULL AND c.active
 ) THEN NEW.expires_at:='9999-12-31 00:00:00+00'::timestamptz; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_access_private.persistent_staff_session() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER persistent_staff_session BEFORE INSERT ON public.cafe_cashier_sessions
FOR EACH ROW EXECUTE FUNCTION platform_access_private.persistent_staff_session();
-- Preserve currently valid sessions; never revive expired or revoked sessions.
UPDATE public.cafe_cashier_sessions s SET expires_at='9999-12-31 00:00:00+00'::timestamptz
FROM public.cafe_cashiers c
WHERE c.id=s.cashier_id AND c.cafe_id=s.cafe_id AND c.owner_user_id IS NULL AND c.active
 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp();
COMMIT;
