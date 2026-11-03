BEGIN;

-- Only future wallet requests enqueue welcomes; never backfill existing customers.
CREATE TABLE loyalty_audit_private.wallet_welcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  customer_profile_id uuid NOT NULL REFERENCES public.customer_profiles(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.loyalty_cards(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','dispatching','queued','rejected','unknown','expired')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempted_at timestamptz,
  finished_at timestamptz,
  claim_token uuid,
  provider_message_id text CHECK(length(provider_message_id)<=200),
  UNIQUE(cafe_id,customer_profile_id)
);
ALTER TABLE loyalty_audit_private.wallet_welcomes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON loyalty_audit_private.wallet_welcomes FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX wallet_welcomes_pending ON loyalty_audit_private.wallet_welcomes(created_at) WHERE status='pending';

CREATE FUNCTION loyalty_audit_private.enqueue_wallet_welcome()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.origin='live' AND NEW.kind IN ('download','save_link') THEN
    INSERT INTO loyalty_audit_private.wallet_welcomes(cafe_id,customer_profile_id,card_id)
    SELECT c.cafe_id,c.customer_profile_id,c.id FROM public.loyalty_cards c
    WHERE c.id=NEW.card_id AND c.cafe_id=NEW.cafe_id
    ON CONFLICT(cafe_id,customer_profile_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION loyalty_audit_private.enqueue_wallet_welcome() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER wallet_download_welcome AFTER INSERT ON loyalty_audit_private.wallet_customer_events
FOR EACH ROW EXECUTE FUNCTION loyalty_audit_private.enqueue_wallet_welcome();

CREATE FUNCTION public.claim_wallet_welcome(p_card_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_job loyalty_audit_private.wallet_welcomes; v_context jsonb;
BEGIN
  -- A crashed/ambiguous POST may have reached WhatsApp; never automatically resend it.
  UPDATE loyalty_audit_private.wallet_welcomes SET status='unknown',finished_at=clock_timestamp()
  WHERE status='dispatching' AND attempted_at<clock_timestamp()-interval '5 minutes';
  UPDATE loyalty_audit_private.wallet_welcomes SET status='expired',finished_at=clock_timestamp()
  WHERE status='pending' AND created_at<clock_timestamp()-interval '24 hours';
  SELECT w.* INTO v_job FROM loyalty_audit_private.wallet_welcomes w
  JOIN public.loyalty_cards lc ON lc.id=w.card_id AND lc.cafe_id=w.cafe_id AND lc.customer_profile_id=w.customer_profile_id
  JOIN public.customer_profiles cp ON cp.id=w.customer_profile_id AND cp.cafe_id=w.cafe_id
  JOIN public.cafes c ON c.id=w.cafe_id
  JOIN public.cafe_loyalty_programs lp ON lp.cafe_id=w.cafe_id
  WHERE w.status='pending' AND (p_card_id IS NULL OR w.card_id=p_card_id)
    AND lc.status='active' AND cp.status='active' AND cp.blocked_at IS NULL AND NOT cp.phone_auth_conflict
    AND cp.phone_normalized ~ '^9665[0-9]{8}$' AND c.status='active' AND c.deleted_at IS NULL
    AND lp.enabled AND platform_access_private.service_enabled(c.id,'loyalty')
  ORDER BY w.created_at,w.id FOR UPDATE OF w SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE loyalty_audit_private.wallet_welcomes SET status='dispatching',attempted_at=clock_timestamp(),claim_token=gen_random_uuid()
  WHERE id=v_job.id RETURNING * INTO v_job;
  SELECT jsonb_build_object('id',v_job.id,'claimToken',v_job.claim_token,'brandName',c.name,
    'phone',cp.phone_normalized,'stamps',lp.purchases_required,'reward',lp.reward_name)
  INTO v_context FROM public.cafes c
  JOIN public.customer_profiles cp ON cp.id=v_job.customer_profile_id
  JOIN public.cafe_loyalty_programs lp ON lp.cafe_id=c.id WHERE c.id=v_job.cafe_id;
  RETURN v_context;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_wallet_welcome(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_wallet_welcome(uuid) TO service_role;

CREATE FUNCTION public.finish_wallet_welcome(p_id uuid,p_token uuid,p_status text,p_provider_message_id text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('queued','rejected','unknown') OR length(p_provider_message_id)>200
    OR (p_status='queued' AND coalesce(length(p_provider_message_id),0)=0) THEN
    RAISE EXCEPTION 'invalid_welcome_result';
  END IF;
  UPDATE loyalty_audit_private.wallet_welcomes SET status=p_status,provider_message_id=p_provider_message_id,finished_at=clock_timestamp()
  WHERE id=p_id AND claim_token=p_token AND status='dispatching';
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_wallet_welcome(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_wallet_welcome(uuid,uuid,text,text) TO service_role;
COMMIT;
