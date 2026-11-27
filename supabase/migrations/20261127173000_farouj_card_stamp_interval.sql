BEGIN;
SET LOCAL lock_timeout = '5s';

-- Callers lock the card before checking the ledger. Failed scans, voids and
-- redemptions never start a new interval. Historical credits count immediately.
CREATE FUNCTION loyalty_read_private.farouj_stamp_allowed(p_card uuid, p_at timestamptz)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
  SELECT NOT EXISTS (
    SELECT FROM public.loyalty_card_events
    WHERE cafe_id = 'ec9b4415-b68e-4554-acbd-c918bd5cc2f2' AND card_id = p_card
      AND stamps_added > 0 AND created_at > p_at - interval '30 minutes'
  )
$$;
REVOKE ALL ON FUNCTION loyalty_read_private.farouj_stamp_allowed(uuid,timestamptz) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION loyalty_read_private.enforce_farouj_stamp_interval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.loyalty_cards WHERE id = NEW.card_id AND cafe_id = NEW.cafe_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loyalty card not found'; END IF;
  NEW.created_at := clock_timestamp();
  IF NEW.stamps_added <> 1 OR NOT loyalty_read_private.farouj_stamp_allowed(NEW.card_id, NEW.created_at) THEN
    RAISE EXCEPTION 'يُسمح بختم واحد لكل بطاقة كل 30 دقيقة';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION loyalty_read_private.enforce_farouj_stamp_interval() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER enforce_farouj_stamp_interval BEFORE INSERT ON public.loyalty_card_events
  FOR EACH ROW WHEN (NEW.cafe_id = 'ec9b4415-b68e-4554-acbd-c918bd5cc2f2' AND NEW.stamps_added > 0)
  EXECUTE FUNCTION loyalty_read_private.enforce_farouj_stamp_interval();

-- Retain scan replay, permanent duplicate results, and the POS path that
-- completes the sale when the optional loyalty stamp is unavailable.
DO $patch$
DECLARE
  signature regprocedure;
  original text;
  replacement text;
  definition text;
BEGIN
  FOR signature, original, replacement IN SELECT * FROM (VALUES
    ('public.apply_rast_loyalty_stamp(uuid,text,uuid,uuid,uuid)'::regprocedure,
     $old$IF EXISTS (SELECT 1 FROM public.loyalty_card_events WHERE card_id = v_card.id
    AND event_type = 'stamp' AND created_at > now() - interval '30 seconds') THEN$old$,
     $new$IF (CASE WHEN p_cafe_id = 'ec9b4415-b68e-4554-acbd-c918bd5cc2f2'
      THEN NOT loyalty_read_private.farouj_stamp_allowed(v_card.id, clock_timestamp())
      ELSE EXISTS (SELECT 1 FROM public.loyalty_card_events WHERE card_id = v_card.id
        AND event_type = 'stamp' AND created_at > now() - interval '30 seconds') END) THEN$new$),
    ('brand_finance_private.stamp_sale_customer(uuid,uuid)'::regprocedure,
     $old$IF NOT loyalty_read_private.french_daily_stamp_allowed(s.cafe_id,c.id,1) THEN$old$,
     $new$IF (s.cafe_id = 'ec9b4415-b68e-4554-acbd-c918bd5cc2f2'
      AND NOT loyalty_read_private.farouj_stamp_allowed(c.id, clock_timestamp()))
      OR NOT loyalty_read_private.french_daily_stamp_allowed(s.cafe_id,c.id,1) THEN$new$)
  ) AS edits(target, old_text, new_text)
  LOOP
    definition := replace(pg_get_functiondef(signature), chr(13), '');
    IF array_length(string_to_array(definition, original), 1) IS DISTINCT FROM 2 THEN
      RAISE EXCEPTION 'Unexpected stamp function definition: %', signature;
    END IF;
    EXECUTE replace(definition, original, replacement);
  END LOOP;
END
$patch$;
COMMIT;
