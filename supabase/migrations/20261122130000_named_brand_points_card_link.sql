-- Card link job after an invoice-points earn, only for the brand the user named on 2026-11-22 (Bolingo)
-- The points path creates no WhatsApp job, so the exception in lib/loyalty/read-card-links.ts
-- (PLATFORM_CARD_LINK_CAFE_IDS) had nothing to send. This adds the job under the stamp path's own conditions
-- from loyalty_read_private.process_one_before_employee_policy. Sending, text, wallet check and send budget
-- stay in the application. No other brand gets a job from the points path
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE FUNCTION loyalty_read_private.named_brand_points_card_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE card public.loyalty_cards; first_earn boolean;
BEGIN
  -- A message job must never fail or undo the invoice it follows
  BEGIN
    SELECT lc.* INTO card FROM public.loyalty_cards lc
      JOIN public.customer_profiles cp ON cp.id=lc.customer_profile_id AND cp.cafe_id=lc.cafe_id
      WHERE lc.cafe_id=NEW.cafe_id AND lc.card_code=NEW.target_code AND lc.status='active'
        AND cp.status='active' AND cp.blocked_at IS NULL AND NOT cp.phone_auth_conflict
        AND cp.phone_normalized ~ '^9665[0-9]{8}$';
    IF NOT FOUND THEN RETURN NULL; END IF;
    -- The customer already keeps the card in Apple Wallet
    IF EXISTS(SELECT 1 FROM public.wallet_apple_registrations ar WHERE ar.cafe_id=card.cafe_id AND ar.card_id=card.id) THEN RETURN NULL; END IF;
    -- One job a day for a card, and never a second one while a job is open
    IF EXISTS(SELECT 1 FROM loyalty_read_private.card_link_jobs j WHERE j.card_id=card.id
      AND (j.created_at>clock_timestamp()-interval '24 hours' OR j.status IN('pending','dispatching','unknown'))) THEN RETURN NULL; END IF;
    first_earn:=NOT EXISTS(SELECT 1 FROM loyalty_read_private.card_link_jobs j WHERE j.card_id=card.id)
      AND NOT EXISTS(SELECT 1 FROM public.loyalty_scan_requests r WHERE r.cafe_id=NEW.cafe_id AND r.target_code=NEW.target_code AND r.request_id<>NEW.request_id);
    INSERT INTO loyalty_read_private.card_link_jobs(cafe_id,profile_id,card_id,card_created)
      VALUES(card.cafe_id,card.customer_profile_id,card.id,first_earn) ON CONFLICT(card_id,delivery_day) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION loyalty_read_private.named_brand_points_card_link() FROM PUBLIC,anon,authenticated,service_role;

CREATE TRIGGER named_brand_points_card_link AFTER INSERT ON public.loyalty_scan_requests
  FOR EACH ROW WHEN (NEW.operation='points' AND NEW.cafe_id='dbe942ba-dfa4-422b-a9f6-9527c3b27cc9'::uuid)
  EXECUTE FUNCTION loyalty_read_private.named_brand_points_card_link();

-- The user asked that Bolingo customers who were never sent their card receive it. One job for each active card
-- of the named brand that is not in Apple Wallet, was never sent a link and has no job open
INSERT INTO loyalty_read_private.card_link_jobs(cafe_id,profile_id,card_id,card_created)
SELECT lc.cafe_id,lc.customer_profile_id,lc.id,true
FROM public.loyalty_cards lc
JOIN public.customer_profiles cp ON cp.id=lc.customer_profile_id AND cp.cafe_id=lc.cafe_id
WHERE lc.cafe_id='dbe942ba-dfa4-422b-a9f6-9527c3b27cc9'::uuid AND lc.status='active'
  AND cp.status='active' AND cp.blocked_at IS NULL AND NOT cp.phone_auth_conflict AND cp.phone_normalized ~ '^9665[0-9]{8}$'
  AND NOT EXISTS(SELECT 1 FROM public.wallet_apple_registrations ar WHERE ar.cafe_id=lc.cafe_id AND ar.card_id=lc.id)
  AND NOT EXISTS(SELECT 1 FROM loyalty_read_private.card_link_jobs j WHERE j.card_id=lc.id
    AND (j.status IN('queued','pending','dispatching','unknown') OR j.created_at>clock_timestamp()-interval '24 hours'))
ON CONFLICT(card_id,delivery_day) DO NOTHING;

COMMIT;
