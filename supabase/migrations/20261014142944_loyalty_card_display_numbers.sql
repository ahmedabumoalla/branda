-- Only future cards receive a short display number. Secure QR/card codes and all
-- existing card rows, balances, timestamps and wallet serials stay unchanged.
ALTER TABLE public.loyalty_cards ADD COLUMN display_number integer
  CHECK (display_number BETWEEN 10000 AND 99999);
CREATE UNIQUE INDEX loyalty_cards_cafe_display_number_key
  ON public.loyalty_cards(cafe_id, display_number) WHERE display_number IS NOT NULL;

CREATE FUNCTION loyalty_enrollment_private.assign_display_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_number integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.display_number IS DISTINCT FROM OLD.display_number THEN
      RAISE EXCEPTION 'Card display number is immutable';
    END IF;
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('loyalty-display:' || NEW.cafe_id::text, 0));
  -- Enrollment retries use INSERT ON CONFLICT; do not allocate or renumber them.
  IF EXISTS (SELECT 1 FROM public.loyalty_cards WHERE cafe_id=NEW.cafe_id AND customer_profile_id=NEW.customer_profile_id) THEN
    NEW.display_number := NULL;
    RETURN NEW;
  END IF;
  SELECT n INTO v_number FROM generate_series(10000,99999) n
    WHERE NOT EXISTS (SELECT 1 FROM public.loyalty_cards c WHERE c.cafe_id=NEW.cafe_id AND c.display_number=n)
      AND NOT EXISTS (SELECT 1 FROM public.loyalty_cards c WHERE c.cafe_id=NEW.cafe_id AND c.card_code=n::text)
    ORDER BY n LIMIT 1;
  IF v_number IS NULL THEN RAISE EXCEPTION 'Five-digit card numbers exhausted for this brand'; END IF;
  NEW.display_number := v_number;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION loyalty_enrollment_private.assign_display_number() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER loyalty_card_display_number BEFORE INSERT OR UPDATE OF display_number
  ON public.loyalty_cards FOR EACH ROW EXECUTE FUNCTION loyalty_enrollment_private.assign_display_number();
