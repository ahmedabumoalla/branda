-- Bound authorized Apple Wallet registrations without affecting existing passes.
BEGIN;

CREATE FUNCTION public.limit_rast_apple_wallet_devices() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  -- Serializes registrations for the same card before checking capacity.
  PERFORM 1 FROM public.loyalty_cards WHERE id=NEW.card_id AND cafe_id=NEW.cafe_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loyalty card not found'; END IF;
  IF EXISTS(SELECT 1 FROM public.wallet_apple_registrations
    WHERE card_id=NEW.card_id AND device_library_id=NEW.device_library_id AND pass_type_id=NEW.pass_type_id) THEN
    RETURN NEW;
  END IF;
  IF (SELECT count(*) FROM public.wallet_apple_registrations WHERE card_id=NEW.card_id)>=20 THEN
    RAISE EXCEPTION 'Wallet registration limit reached' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.limit_rast_apple_wallet_devices() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER wallet_apple_device_limit BEFORE INSERT ON public.wallet_apple_registrations
  FOR EACH ROW EXECUTE FUNCTION public.limit_rast_apple_wallet_devices();

COMMIT;
