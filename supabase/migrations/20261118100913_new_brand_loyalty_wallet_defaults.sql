BEGIN;
-- Existing owners' opt-outs and subscription/service entitlements stay authoritative.
ALTER TABLE public.cafe_loyalty_programs
 ALTER COLUMN enabled SET DEFAULT true,
 ALTER COLUMN wallet_enabled SET DEFAULT true,
 ALTER COLUMN apple_wallet_enabled SET DEFAULT true,
 ALTER COLUMN google_wallet_enabled SET DEFAULT true;

CREATE SCHEMA IF NOT EXISTS loyalty_defaults_private;
REVOKE ALL ON SCHEMA loyalty_defaults_private FROM PUBLIC,anon,authenticated;
CREATE FUNCTION loyalty_defaults_private.initialize_brand() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 -- Onboarding inserts the subscription after the brand. Run at transaction end
 -- and retain the same plan authorization used by customer enrollment/wallets.
 IF NOT platform_access_private.service_enabled(NEW.id,'loyalty') THEN RETURN NEW; END IF;
 INSERT INTO public.cafe_loyalty_programs(cafe_id,enabled,wallet_enabled,apple_wallet_enabled,google_wallet_enabled)
 VALUES(NEW.id,true,true,true,true) ON CONFLICT(cafe_id) DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION loyalty_defaults_private.initialize_brand() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER initialize_brand_loyalty AFTER INSERT ON public.cafes
 DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION loyalty_defaults_private.initialize_brand();
NOTIFY pgrst,'reload schema';
COMMIT;
