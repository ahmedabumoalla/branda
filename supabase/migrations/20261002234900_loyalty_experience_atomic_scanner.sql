-- Rast loyalty: private wallet state, immutable reward terms and atomic scans.
-- Populates the previously empty, untracked migration; no other brand data is rewritten.
BEGIN;

-- Close the legacy SQL-NULL credential bypass without changing successful logins.
CREATE OR REPLACE FUNCTION public.login_cafe_cashier(p_email text,p_password text)
RETURNS TABLE(token text,cafe_id uuid,cashier_id uuid,cashier_name text,cafe_name text,cafe_slug text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_cashier public.cafe_cashiers%ROWTYPE; v_cafe public.cafes%ROWTYPE; v_token text;
BEGIN
  IF p_email IS NULL OR btrim(p_email)='' OR char_length(p_email)>254
    OR p_password IS NULL OR p_password='' OR char_length(p_password)>200 THEN
    RAISE EXCEPTION 'Invalid cashier credentials';
  END IF;
  SELECT * INTO v_cashier FROM public.cafe_cashiers
    WHERE lower(email)=lower(btrim(p_email)) AND active=true LIMIT 1;
  IF v_cashier.id IS NULL OR v_cashier.password_hash IS DISTINCT FROM extensions.crypt(p_password,v_cashier.password_hash) THEN
    RAISE EXCEPTION 'Invalid cashier credentials';
  END IF;
  SELECT * INTO v_cafe FROM public.cafes WHERE id=v_cashier.cafe_id;
  IF v_cafe.id IS NULL OR v_cafe.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Brand not found'; END IF;
  INSERT INTO public.cafe_cashier_sessions(cashier_id,cafe_id) VALUES(v_cashier.id,v_cashier.cafe_id)
    RETURNING cafe_cashier_sessions.token INTO v_token;
  UPDATE public.cafe_cashiers SET last_login_at=now() WHERE id=v_cashier.id;
  INSERT INTO public.cafe_cashier_activity_logs(cafe_id,cashier_id,action_type,target_type,details)
    VALUES(v_cashier.cafe_id,v_cashier.id,'login','cashier_session',jsonb_build_object('email',v_cashier.email,'cashierName',v_cashier.full_name));
  RETURN QUERY SELECT v_token,v_cafe.id,v_cashier.id,v_cashier.full_name,v_cafe.name,v_cafe.slug::text;
END;
$$;
REVOKE ALL ON FUNCTION public.login_cafe_cashier(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_cafe_cashier(text,text) TO anon,authenticated;

-- The signed Auth hook can dispatch only a single, recently admitted server request.
ALTER TABLE public.customer_phone_otp_requests ADD COLUMN provider_dispatched_at timestamptz;
CREATE INDEX customer_phone_otp_dispatch_idx ON public.customer_phone_otp_requests(phone_normalized,provider_instance,created_at DESC)
  WHERE status='pending' AND provider_dispatched_at IS NULL;
CREATE FUNCTION public.claim_customer_phone_otp_dispatch(p_phone_normalized text,p_provider_instance text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_request_id uuid; v_slug text;
BEGIN
  IF p_phone_normalized IS NULL OR p_phone_normalized !~ '^9665[0-9]{8}$'
    OR p_provider_instance IS NULL OR char_length(p_provider_instance) NOT BETWEEN 1 AND 200 THEN RETURN NULL; END IF;
  SELECT r.id,c.slug::text INTO v_request_id,v_slug
    FROM public.customer_phone_otp_requests r JOIN public.cafes c ON c.id=r.cafe_id
    WHERE r.phone_normalized=p_phone_normalized AND r.provider_instance=p_provider_instance
      AND r.status='pending' AND r.provider_dispatched_at IS NULL AND r.created_at>now()-interval '2 minutes'
      AND c.deleted_at IS NULL AND c.status='active'
      AND (c.slug<>'rast' OR (c.is_public AND EXISTS(
        SELECT 1 FROM public.cafe_loyalty_programs p WHERE p.cafe_id=c.id AND p.enabled
      ))) ORDER BY r.created_at DESC,r.id DESC LIMIT 1 FOR UPDATE OF r SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.customer_phone_otp_requests SET provider_dispatched_at=now() WHERE id=v_request_id;
  RETURN v_slug;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_customer_phone_otp_dispatch(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_customer_phone_otp_dispatch(text,text) TO service_role;

CREATE TABLE public.cafe_loyalty_experience (
  cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id) ON DELETE CASCADE,
  reward_validity_days integer NOT NULL DEFAULT 30 CHECK (reward_validity_days BETWEEN 1 AND 365),
  reward_kind text NOT NULL DEFAULT 'custom' CHECK (reward_kind IN ('product','discount','custom')),
  reward_discount_percent integer CHECK (reward_discount_percent BETWEEN 1 AND 100),
  nearby_message text NOT NULL DEFAULT 'قريب منّا؟ خذ لك لحظة قهوة، يسعدنا نشوفك.' CHECK (char_length(nearby_message) BETWEEN 2 AND 240),
  branch_latitude double precision CHECK (branch_latitude BETWEEN -90 AND 90),
  branch_longitude double precision CHECK (branch_longitude BETWEEN -180 AND 180),
  offer_title text NOT NULL DEFAULT '' CHECK (char_length(offer_title) <= 80),
  offer_body text NOT NULL DEFAULT '' CHECK (char_length(offer_body) <= 240),
  announcement_id uuid,
  announcement_at timestamptz,
  offer_updated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((branch_latitude IS NULL) = (branch_longitude IS NULL)),
  CHECK ((reward_kind = 'discount') = (reward_discount_percent IS NOT NULL))
);
ALTER TABLE public.cafe_loyalty_experience ENABLE ROW LEVEL SECURITY;
CREATE POLICY loyalty_experience_owner ON public.cafe_loyalty_experience FOR ALL TO authenticated
  USING (public.has_cafe_permission(cafe_id, 'loyalty') OR public.is_platform_admin())
  WITH CHECK (
    (public.has_cafe_permission(cafe_id, 'loyalty') OR public.is_platform_admin())
    AND EXISTS (SELECT 1 FROM public.cafes c WHERE c.id = cafe_id AND c.slug = 'rast' AND c.deleted_at IS NULL)
  );
REVOKE ALL ON public.cafe_loyalty_experience FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cafe_loyalty_experience TO authenticated;
GRANT ALL ON public.cafe_loyalty_experience TO service_role;
CREATE TRIGGER loyalty_experience_updated_at BEFORE UPDATE ON public.cafe_loyalty_experience
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.wallet_apple_registrations (
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  device_library_id text NOT NULL CHECK (char_length(device_library_id) BETWEEN 1 AND 256),
  pass_type_id text NOT NULL CHECK (char_length(pass_type_id) BETWEEN 1 AND 256),
  card_id uuid NOT NULL REFERENCES public.loyalty_cards(id) ON DELETE CASCADE,
  push_token text NOT NULL CHECK (char_length(push_token) BETWEEN 1 AND 512),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_library_id, pass_type_id, card_id),
  FOREIGN KEY (card_id,cafe_id) REFERENCES public.loyalty_cards(id,cafe_id) ON DELETE CASCADE
);
CREATE INDEX wallet_apple_registrations_card_idx ON public.wallet_apple_registrations(card_id);
CREATE INDEX wallet_apple_registrations_cafe_idx ON public.wallet_apple_registrations(cafe_id);
ALTER TABLE public.wallet_apple_registrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wallet_apple_registrations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.wallet_apple_registrations TO service_role;

CREATE TABLE public.wallet_passes (
  card_id uuid NOT NULL,
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('apple','google')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(card_id,provider),
  FOREIGN KEY (card_id,cafe_id) REFERENCES public.loyalty_cards(id,cafe_id) ON DELETE CASCADE
);
CREATE INDEX wallet_passes_cafe_idx ON public.wallet_passes(cafe_id);
ALTER TABLE public.wallet_passes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wallet_passes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.wallet_passes TO service_role;

CREATE TABLE public.wallet_notification_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  card_id uuid,
  kind text NOT NULL CHECK (kind IN ('sync','message')),
  title text CHECK (char_length(title) <= 80),
  body text CHECK (char_length(body) <= 240),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  delivery_state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(delivery_state) = 'object'),
  claimed_at timestamptz,
  available_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(card_id,cafe_id) REFERENCES public.loyalty_cards(id,cafe_id) ON DELETE CASCADE,
  CHECK ((kind = 'sync' AND card_id IS NOT NULL) OR (kind = 'message' AND title IS NOT NULL AND body IS NOT NULL))
);
CREATE INDEX wallet_notification_jobs_queue_idx ON public.wallet_notification_jobs(status,created_at);
CREATE UNIQUE INDEX wallet_notification_one_pending_sync_idx ON public.wallet_notification_jobs(card_id)
  WHERE kind = 'sync' AND status = 'pending';
ALTER TABLE public.wallet_notification_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wallet_notification_jobs FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.wallet_notification_jobs TO service_role;

CREATE FUNCTION public.claim_wallet_notification_jobs(p_limit integer DEFAULT 20)
RETURNS SETOF public.wallet_notification_jobs LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid job limit'; END IF;
  RETURN QUERY WITH ready AS (
    SELECT id FROM public.wallet_notification_jobs
    WHERE (status = 'pending' AND available_at <= now()) OR (status = 'processing' AND claimed_at < now() - interval '5 minutes')
    ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT p_limit
  ) UPDATE public.wallet_notification_jobs j
    SET status = 'processing',claimed_at=now(),attempts=attempts+1,updated_at=now()
    FROM ready WHERE j.id=ready.id RETURNING j.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_wallet_notification_jobs(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_wallet_notification_jobs(integer) TO service_role;

CREATE FUNCTION public.enqueue_rast_wallet_announcement(p_cafe_id uuid,p_title text,p_body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_job public.wallet_notification_jobs%ROWTYPE; v_title text:=btrim(p_title); v_body text:=btrim(p_body);
BEGIN
  IF v_title IS NULL OR char_length(v_title) NOT BETWEEN 2 AND 80
    OR v_body IS NULL OR char_length(v_body) NOT BETWEEN 2 AND 240
    OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND slug='rast' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Invalid Rast announcement';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('rast-wallet-announcement:' || p_cafe_id::text,0));
  SELECT * INTO v_job FROM public.wallet_notification_jobs WHERE cafe_id=p_cafe_id AND kind='message'
    AND title=v_title AND body=v_body AND created_at>now()-interval '10 minutes' ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('id',v_job.id,'created',false,'delivery_state',v_job.delivery_state); END IF;
  IF (SELECT count(*) FROM public.wallet_notification_jobs WHERE cafe_id=p_cafe_id AND kind='message'
    AND created_at>now()-interval '24 hours') >= 3 THEN RAISE EXCEPTION 'Announcement daily limit reached'; END IF;
  INSERT INTO public.cafe_loyalty_experience(cafe_id,offer_title,offer_body)
    VALUES(p_cafe_id,v_title,v_body) ON CONFLICT(cafe_id) DO UPDATE SET offer_title=EXCLUDED.offer_title,offer_body=EXCLUDED.offer_body;
  INSERT INTO public.wallet_notification_jobs(cafe_id,kind,title,body,status,attempts,claimed_at)
    VALUES(p_cafe_id,'message',v_title,v_body,'processing',1,now()) RETURNING * INTO v_job;
  RETURN jsonb_build_object('id',v_job.id,'created',true,'delivery_state',v_job.delivery_state);
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_rast_wallet_announcement(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_rast_wallet_announcement(uuid,text,text) TO service_role;

CREATE FUNCTION public.set_loyalty_offer_timestamp() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.offer_updated_at := CASE WHEN NEW.offer_title <> '' OR NEW.offer_body <> '' THEN clock_timestamp() END;
  ELSIF OLD.offer_title IS DISTINCT FROM NEW.offer_title OR OLD.offer_body IS DISTINCT FROM NEW.offer_body THEN
    NEW.offer_updated_at := GREATEST(clock_timestamp(),OLD.offer_updated_at + interval '1 microsecond');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_loyalty_offer_timestamp() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER loyalty_offer_timestamp BEFORE INSERT OR UPDATE ON public.cafe_loyalty_experience
  FOR EACH ROW EXECUTE FUNCTION public.set_loyalty_offer_timestamp();

CREATE FUNCTION public.guard_rast_wallet_announcement_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF current_user IN ('postgres','supabase_admin','service_role') THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.offer_title<>'' OR NEW.offer_body<>'' OR NEW.offer_updated_at IS NOT NULL
      OR NEW.announcement_id IS NOT NULL OR NEW.announcement_at IS NOT NULL THEN
      RAISE EXCEPTION 'Use authorized wallet announcement operation' USING ERRCODE='42501';
    END IF;
  ELSIF ROW(NEW.offer_title,NEW.offer_body,NEW.offer_updated_at,NEW.announcement_id,NEW.announcement_at)
    IS DISTINCT FROM ROW(OLD.offer_title,OLD.offer_body,OLD.offer_updated_at,OLD.announcement_id,OLD.announcement_at) THEN
    RAISE EXCEPTION 'Use authorized wallet announcement operation' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_rast_wallet_announcement_fields() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_rast_wallet_announcement_fields BEFORE INSERT OR UPDATE ON public.cafe_loyalty_experience
  FOR EACH ROW EXECUTE FUNCTION public.guard_rast_wallet_announcement_fields();

CREATE FUNCTION public.queue_rast_wallet_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_cafe_id uuid := NEW.cafe_id;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cafes WHERE id = v_cafe_id AND slug = 'rast') THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'loyalty_cards' THEN
    UPDATE public.wallet_passes SET updated_at = GREATEST(clock_timestamp(),updated_at + interval '1 microsecond') WHERE card_id = NEW.id AND cafe_id = v_cafe_id;
    INSERT INTO public.wallet_notification_jobs(cafe_id,card_id,kind)
      SELECT v_cafe_id,NEW.id,'sync' WHERE EXISTS(SELECT 1 FROM public.wallet_passes WHERE card_id = NEW.id)
      ON CONFLICT DO NOTHING;
  ELSE
    UPDATE public.wallet_passes SET updated_at = GREATEST(clock_timestamp(),updated_at + interval '1 microsecond') WHERE cafe_id = v_cafe_id;
    INSERT INTO public.wallet_notification_jobs(cafe_id,card_id,kind)
      SELECT DISTINCT v_cafe_id,card_id,'sync' FROM public.wallet_passes WHERE cafe_id = v_cafe_id
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_rast_wallet_update() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER queue_rast_wallet_card_update AFTER UPDATE ON public.loyalty_cards
  FOR EACH ROW EXECUTE FUNCTION public.queue_rast_wallet_update();
CREATE TRIGGER queue_rast_wallet_program_update AFTER UPDATE ON public.cafe_loyalty_programs
  FOR EACH ROW EXECUTE FUNCTION public.queue_rast_wallet_update();
CREATE TRIGGER queue_rast_wallet_experience_update AFTER INSERT OR UPDATE ON public.cafe_loyalty_experience
  FOR EACH ROW EXECUTE FUNCTION public.queue_rast_wallet_update();

CREATE TABLE public.loyalty_scan_requests (
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('stamp', 'redeem')),
  target_code text NOT NULL,
  cashier_id uuid REFERENCES public.cafe_cashiers(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cafe_id, request_id)
);
ALTER TABLE public.loyalty_scan_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.loyalty_scan_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.loyalty_scan_requests TO service_role;
CREATE INDEX loyalty_events_recent_stamp_idx ON public.loyalty_card_events(card_id, created_at DESC)
  WHERE event_type = 'stamp';

CREATE FUNCTION public.snapshot_rast_loyalty_reward()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_days integer; v_program public.cafe_loyalty_programs%ROWTYPE; v_experience public.cafe_loyalty_experience%ROWTYPE; v_product_name text;
BEGIN
  IF NEW.source_type <> 'loyalty' OR NOT EXISTS (
    SELECT 1 FROM public.cafes WHERE id = NEW.cafe_id AND slug = 'rast'
  ) THEN RETURN NEW; END IF;
  SELECT * INTO v_program FROM public.cafe_loyalty_programs WHERE cafe_id = NEW.cafe_id;
  SELECT * INTO v_experience FROM public.cafe_loyalty_experience WHERE cafe_id = NEW.cafe_id;
  v_days := COALESCE(v_experience.reward_validity_days, 30);
  SELECT name INTO v_product_name FROM public.menu_products WHERE id=NEW.reward_definition_id AND cafe_id=NEW.cafe_id;
  NEW.expires_at := NEW.issued_at + make_interval(days => v_days);
  NEW.metadata := NEW.metadata || jsonb_build_object('termsSnapshot', jsonb_build_object(
    'rewardName', NEW.reward_title, 'rewardProductId', NEW.reward_definition_id,'rewardProductName',v_product_name,
    'purchasesRequired', v_program.purchases_required, 'validityDays', v_days, 'terms', v_program.terms,
    'rewardKind',COALESCE(v_experience.reward_kind,'custom'),'discountPercent',v_experience.reward_discount_percent
  ));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.snapshot_rast_loyalty_reward() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER snapshot_rast_loyalty_reward BEFORE INSERT ON public.customer_reward_instances
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_rast_loyalty_reward();

-- SECURITY INVOKER intentionally observes the effective calling role: direct Data
-- API writes remain authenticated/anon; the reviewed atomic functions execute as
-- their trusted owner. This does not change other brands' existing write paths.
CREATE FUNCTION public.guard_rast_loyalty_ledger() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_old_cafe uuid; v_new_cafe uuid; v_rast boolean;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_old_cafe := OLD.cafe_id; END IF;
  IF TG_OP <> 'DELETE' THEN v_new_cafe := NEW.cafe_id; END IF;
  SELECT EXISTS(SELECT 1 FROM public.cafes WHERE slug='rast' AND id IN (v_old_cafe,v_new_cafe)) INTO v_rast;
  IF v_rast AND current_user NOT IN ('postgres','supabase_admin','service_role') THEN
    RAISE EXCEPTION 'Use authorized Rast loyalty operations' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_rast_loyalty_ledger() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_rast_card_ledger BEFORE INSERT OR UPDATE OR DELETE ON public.loyalty_cards
  FOR EACH ROW EXECUTE FUNCTION public.guard_rast_loyalty_ledger();
CREATE TRIGGER guard_rast_reward_ledger BEFORE INSERT OR UPDATE OR DELETE ON public.customer_reward_instances
  FOR EACH ROW EXECUTE FUNCTION public.guard_rast_loyalty_ledger();
CREATE TRIGGER guard_rast_event_ledger BEFORE INSERT OR UPDATE OR DELETE ON public.loyalty_card_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_rast_loyalty_ledger();
CREATE TRIGGER guard_rast_redemption_ledger BEFORE INSERT OR UPDATE OR DELETE ON public.customer_reward_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.guard_rast_loyalty_ledger();

CREATE FUNCTION public.preserve_rast_reward_terms() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF OLD.source_type='loyalty' AND EXISTS(SELECT 1 FROM public.cafes WHERE id=OLD.cafe_id AND slug='rast')
    AND (ROW(NEW.cafe_id,NEW.source_type,NEW.source_id,NEW.reward_definition_id,
      NEW.reward_title,NEW.reward_description,NEW.reward_code,NEW.qr_payload,NEW.issued_at,NEW.expires_at)
      IS DISTINCT FROM ROW(OLD.cafe_id,OLD.source_type,OLD.source_id,OLD.reward_definition_id,
      OLD.reward_title,OLD.reward_description,OLD.reward_code,OLD.qr_payload,OLD.issued_at,OLD.expires_at)
      OR (NEW.customer_id IS NOT NULL AND NEW.customer_id IS DISTINCT FROM OLD.customer_id)
      OR (NEW.loyalty_card_id IS NOT NULL AND NEW.loyalty_card_id IS DISTINCT FROM OLD.loyalty_card_id)
      OR NEW.metadata->'termsSnapshot' IS DISTINCT FROM OLD.metadata->'termsSnapshot') THEN
    RAISE EXCEPTION 'Issued reward terms are immutable';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.preserve_rast_reward_terms() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER preserve_rast_reward_terms BEFORE UPDATE ON public.customer_reward_instances
  FOR EACH ROW EXECUTE FUNCTION public.preserve_rast_reward_terms();

-- Only the verified server enrollment path calls this function. The customer id is
-- derived from its authenticated profile, never accepted directly from the browser.
CREATE FUNCTION public.issue_rast_loyalty_card(p_customer_profile_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_profile public.customer_profiles%ROWTYPE; v_card public.loyalty_cards%ROWTYPE;
BEGIN
  SELECT cp.* INTO v_profile FROM public.customer_profiles cp
  JOIN public.cafes c ON c.id = cp.cafe_id AND c.slug = 'rast' AND c.deleted_at IS NULL
  JOIN public.cafe_loyalty_programs p ON p.cafe_id = c.id AND p.enabled
  JOIN auth.users u ON u.id = cp.user_id AND u.phone_confirmed_at IS NOT NULL
    AND regexp_replace(u.phone, '[^0-9]', '', 'g') = cp.phone_normalized
  WHERE cp.id = p_customer_profile_id AND NOT cp.phone_auth_conflict AND cp.status='active' AND cp.blocked_at IS NULL
  FOR SHARE OF cp,u,p;
  IF v_profile.id IS NULL THEN RAISE EXCEPTION 'Loyalty enrollment unavailable'; END IF;
  INSERT INTO public.loyalty_cards(cafe_id, customer_profile_id, customer_name, customer_phone, customer_email)
  VALUES (v_profile.cafe_id, v_profile.id, v_profile.full_name, v_profile.phone, v_profile.email)
  ON CONFLICT (cafe_id, customer_profile_id) DO NOTHING;
  SELECT * INTO v_card FROM public.loyalty_cards
    WHERE cafe_id = v_profile.cafe_id AND customer_profile_id = v_profile.id;
  IF v_card.status <> 'active' THEN RAISE EXCEPTION 'Loyalty card suspended'; END IF;
  RETURN v_card.card_code;
END;
$$;
REVOKE ALL ON FUNCTION public.issue_rast_loyalty_card(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_rast_loyalty_card(uuid) TO service_role;

ALTER FUNCTION public.issue_loyalty_card_for_customer(text) RENAME TO issue_loyalty_card_for_customer_legacy;
REVOKE ALL ON FUNCTION public.issue_loyalty_card_for_customer_legacy(text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.issue_loyalty_card_for_customer(p_cafe_slug text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF lower(btrim(p_cafe_slug)) = 'rast' THEN RAISE EXCEPTION 'Verified phone enrollment required'; END IF;
  RETURN public.issue_loyalty_card_for_customer_legacy(p_cafe_slug);
END;
$$;
REVOKE ALL ON FUNCTION public.issue_loyalty_card_for_customer(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.issue_loyalty_card_for_customer(text) TO authenticated;

CREATE FUNCTION public.apply_rast_loyalty_stamp(
  p_cafe_id uuid, p_card_code text, p_request_id uuid, p_cashier_id uuid, p_actor_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_card public.loyalty_cards%ROWTYPE; v_program public.cafe_loyalty_programs%ROWTYPE;
  v_request public.loyalty_scan_requests%ROWTYPE; v_result jsonb; v_reward boolean;
  v_rewards integer; v_stamps integer; v_event_id uuid; v_code text := upper(btrim(p_card_code));
  v_reward_code text; v_expires_at timestamptz;
BEGIN
  IF p_request_id IS NULL OR v_code IS NULL OR char_length(v_code) NOT BETWEEN 4 AND 100 THEN
    RAISE EXCEPTION 'Invalid scan request';
  END IF;
  -- Serializes a request even if an attacker reuses its id for a different card.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text || p_request_id::text, 0));
  SELECT * INTO v_request FROM public.loyalty_scan_requests WHERE cafe_id = p_cafe_id AND request_id = p_request_id;
  IF FOUND THEN
    IF v_request.operation <> 'stamp' OR v_request.target_code <> v_code
      OR v_request.cashier_id IS DISTINCT FROM p_cashier_id OR v_request.actor_id IS DISTINCT FROM p_actor_id THEN
      RAISE EXCEPTION 'Scan request conflict';
    END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;
  SELECT p.* INTO v_program FROM public.cafe_loyalty_programs p
    JOIN public.cafes c ON c.id = p.cafe_id AND c.slug = 'rast' AND c.deleted_at IS NULL
    WHERE p.cafe_id = p_cafe_id AND p.enabled FOR SHARE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loyalty program disabled'; END IF;
  SELECT lc.* INTO v_card FROM public.loyalty_cards lc JOIN public.customer_profiles cp
    ON cp.id=lc.customer_profile_id AND cp.cafe_id=lc.cafe_id AND cp.status='active' AND cp.blocked_at IS NULL
    WHERE lc.cafe_id = p_cafe_id AND upper(lc.card_code) = v_code AND lc.status = 'active'
    FOR UPDATE OF lc FOR SHARE OF cp;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loyalty card not found'; END IF;
  -- A camera may repeatedly decode the same static Wallet QR. Fresh request ids
  -- do not bypass this short guard; a cashier still authorizes each real purchase.
  IF EXISTS (SELECT 1 FROM public.loyalty_card_events WHERE card_id = v_card.id
    AND event_type = 'stamp' AND created_at > now() - interval '30 seconds') THEN
    v_result := jsonb_build_object('status', 'recent_scan', 'cardCode', v_card.card_code,
      'customerName', v_card.customer_name, 'stampsInCycle', v_card.stamps_in_cycle,
      'purchasesRequired', v_program.purchases_required, 'availableRewards', v_card.available_rewards,
      'rewardIssued', false, 'rewardName', v_program.reward_name);
    INSERT INTO public.loyalty_scan_requests(cafe_id,request_id,operation,target_code,cashier_id,actor_id,result)
      VALUES(p_cafe_id,p_request_id,'stamp',v_code,p_cashier_id,p_actor_id,v_result);
    RETURN v_result;
  END IF;
  SELECT count(*) INTO v_rewards FROM public.customer_reward_instances
    WHERE cafe_id = p_cafe_id AND loyalty_card_id = v_card.id AND status = 'available'
    AND (expires_at IS NULL OR expires_at > now());
  v_stamps := v_card.stamps_in_cycle + 1;
  v_reward := v_stamps >= v_program.purchases_required;
  IF v_reward THEN v_stamps := 0; v_rewards := v_rewards + 1; END IF;
  UPDATE public.loyalty_cards SET stamps_in_cycle = v_stamps, available_rewards = v_rewards,
    total_purchases = total_purchases + 1, completed_cycles = completed_cycles + CASE WHEN v_reward THEN 1 ELSE 0 END,
    last_used_at = now(), updated_at = now() WHERE id = v_card.id;
  INSERT INTO public.loyalty_card_events(cafe_id,card_id,cashier_id,performed_by,event_type,invoice_barcode,
    stamps_added,reward_delta,stamps_after,rewards_after)
  VALUES (p_cafe_id,v_card.id,p_cashier_id,p_actor_id,'stamp','SCAN-' || p_request_id::text,
    1,CASE WHEN v_reward THEN 1 ELSE 0 END,v_stamps,v_rewards) RETURNING id INTO v_event_id;
  IF v_reward THEN
    SELECT reward_code, expires_at INTO v_reward_code, v_expires_at FROM public.customer_reward_instances
      WHERE source_type = 'loyalty' AND source_id = v_event_id;
  END IF;
  v_result := jsonb_build_object('status',CASE WHEN v_reward THEN 'reward_issued' ELSE 'stamped' END,
    'cardCode',v_card.card_code,'customerName',v_card.customer_name,'stampsInCycle',v_stamps,
    'purchasesRequired',v_program.purchases_required,'availableRewards',v_rewards,
    'rewardIssued',v_reward,'rewardName',v_program.reward_name,'rewardCode',v_reward_code,'expiresAt',v_expires_at);
  INSERT INTO public.loyalty_scan_requests(cafe_id,request_id,operation,target_code,cashier_id,actor_id,result)
    VALUES(p_cafe_id,p_request_id,'stamp',v_code,p_cashier_id,p_actor_id,v_result);
  IF p_cashier_id IS NOT NULL THEN
    INSERT INTO public.cafe_cashier_activity_logs(cafe_id,cashier_id,action_type,target_type,target_id,details)
      VALUES(p_cafe_id,p_cashier_id,'loyalty_stamp','loyalty_card',v_card.id,v_result);
  END IF;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_rast_loyalty_stamp(uuid,text,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.scan_loyalty_stamp(p_session_token text,p_card_code text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_session public.cafe_cashier_sessions%ROWTYPE;
BEGIN
  SELECT s.* INTO v_session FROM public.cafe_cashier_sessions s
    JOIN public.cafe_cashiers c ON c.id = s.cashier_id AND c.cafe_id = s.cafe_id AND c.active
    JOIN public.cafes b ON b.id = s.cafe_id AND b.slug = 'rast' AND b.deleted_at IS NULL
    WHERE s.token = p_session_token AND s.expires_at > now() AND s.revoked_at IS NULL
    FOR SHARE OF s,c;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid cashier session'; END IF;
  RETURN public.apply_rast_loyalty_stamp(v_session.cafe_id,p_card_code,p_request_id,v_session.cashier_id,NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.scan_loyalty_stamp(text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scan_loyalty_stamp(text,text,uuid) TO service_role;

CREATE FUNCTION public.scan_owner_loyalty_stamp(p_cafe_id uuid,p_card_code text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_cafe_permission(p_cafe_id,'loyalty') OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN public.apply_rast_loyalty_stamp(p_cafe_id,p_card_code,p_request_id,NULL,auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.scan_owner_loyalty_stamp(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scan_owner_loyalty_stamp(uuid,text,uuid) TO authenticated;

CREATE FUNCTION public.redeem_loyalty_reward(p_session_token text,p_reward_code text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_session public.cafe_cashier_sessions%ROWTYPE; v_reward public.customer_reward_instances%ROWTYPE;
  v_card public.loyalty_cards%ROWTYPE; v_request public.loyalty_scan_requests%ROWTYPE;
  v_result jsonb; v_count integer; v_code text := upper(btrim(p_reward_code));
BEGIN
  IF p_request_id IS NULL OR v_code IS NULL OR char_length(v_code) NOT BETWEEN 4 AND 100 THEN
    RAISE EXCEPTION 'Invalid scan request';
  END IF;
  SELECT s.* INTO v_session FROM public.cafe_cashier_sessions s
    JOIN public.cafe_cashiers c ON c.id = s.cashier_id AND c.cafe_id = s.cafe_id AND c.active
    JOIN public.cafes b ON b.id = s.cafe_id AND b.slug = 'rast' AND b.deleted_at IS NULL
    WHERE s.token = p_session_token AND s.expires_at > now() AND s.revoked_at IS NULL FOR SHARE OF s,c;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid cashier session'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_session.cafe_id::text || p_request_id::text, 0));
  SELECT * INTO v_request FROM public.loyalty_scan_requests
    WHERE cafe_id = v_session.cafe_id AND request_id = p_request_id;
  IF FOUND THEN
    IF v_request.operation <> 'redeem' OR v_request.target_code <> v_code
      OR v_request.cashier_id IS DISTINCT FROM v_session.cashier_id THEN RAISE EXCEPTION 'Scan request conflict'; END IF;
    RETURN v_request.result || jsonb_build_object('replayed',true);
  END IF;
  PERFORM 1 FROM public.cafe_loyalty_programs WHERE cafe_id = v_session.cafe_id AND enabled FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loyalty program disabled'; END IF;
  SELECT * INTO v_reward FROM public.customer_reward_instances
    WHERE cafe_id = v_session.cafe_id AND upper(reward_code) = v_code AND source_type = 'loyalty';
  IF NOT FOUND THEN RAISE EXCEPTION 'Reward not found'; END IF;
  -- Every mutation locks card then reward in that order, including competing cashiers.
  SELECT lc.* INTO v_card FROM public.loyalty_cards lc JOIN public.customer_profiles cp
    ON cp.id=lc.customer_profile_id AND cp.cafe_id=lc.cafe_id AND cp.status='active' AND cp.blocked_at IS NULL
    WHERE lc.id = v_reward.loyalty_card_id AND lc.cafe_id = v_session.cafe_id AND lc.status = 'active'
    FOR UPDATE OF lc FOR SHARE OF cp;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loyalty card unavailable'; END IF;
  SELECT * INTO v_reward FROM public.customer_reward_instances WHERE id = v_reward.id FOR UPDATE;
  IF v_reward.status <> 'available' OR (v_reward.expires_at IS NOT NULL AND v_reward.expires_at <= now()) THEN
    RAISE EXCEPTION 'Reward unavailable or expired';
  END IF;
  UPDATE public.customer_reward_instances SET status = 'redeemed',redeemed_at = now(),updated_at = now(),
    metadata = metadata || jsonb_build_object('redeemedByCashierId',v_session.cashier_id) WHERE id = v_reward.id;
  INSERT INTO public.customer_reward_redemptions(cafe_id,reward_instance_id,customer_id,redeemed_by_cashier_id,scanned_code)
    VALUES(v_session.cafe_id,v_reward.id,v_reward.customer_id,v_session.cashier_id,v_code);
  SELECT count(*) INTO v_count FROM public.customer_reward_instances WHERE loyalty_card_id = v_card.id
    AND cafe_id = v_session.cafe_id AND status = 'available' AND (expires_at IS NULL OR expires_at > now());
  UPDATE public.loyalty_cards SET available_rewards = v_count,last_used_at = now(),updated_at = now() WHERE id = v_card.id;
  INSERT INTO public.loyalty_card_events(cafe_id,card_id,cashier_id,event_type,invoice_barcode,reward_delta,stamps_after,rewards_after)
    VALUES(v_session.cafe_id,v_card.id,v_session.cashier_id,'redeem',v_code,-1,v_card.stamps_in_cycle,v_count);
  v_result := jsonb_build_object('status','redeemed','cardCode',v_card.card_code,'customerName',v_card.customer_name,
    'rewardName',v_reward.reward_title,'rewardCode',v_reward.reward_code,'rewardInstanceId',v_reward.id,
    'expiresAt',v_reward.expires_at,'issuedAt',v_reward.issued_at,'availableRewards',v_count,'stampsInCycle',v_card.stamps_in_cycle);
  INSERT INTO public.cafe_cashier_activity_logs(cafe_id,cashier_id,action_type,target_type,target_id,details)
    VALUES(v_session.cafe_id,v_session.cashier_id,'loyalty_redeem','customer_reward_instance',v_reward.id,v_result);
  INSERT INTO public.loyalty_scan_requests(cafe_id,request_id,operation,target_code,cashier_id,result)
    VALUES(v_session.cafe_id,p_request_id,'redeem',v_code,v_session.cashier_id,v_result);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.redeem_loyalty_reward(text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_reward(text,text,uuid) TO service_role;

-- Prevent callers from bypassing Rast atomic operations through the legacy API.
ALTER FUNCTION public.record_loyalty_card_operation(uuid,text,text,numeric,text,text)
  RENAME TO record_loyalty_card_operation_legacy;
REVOKE ALL ON FUNCTION public.record_loyalty_card_operation_legacy(uuid,text,text,numeric,text,text)
  FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.record_loyalty_card_operation(
  p_cafe_id uuid,p_card_code text,p_invoice_barcode text,p_invoice_amount numeric,p_operation text,p_cashier_session_token text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.cafes WHERE id = p_cafe_id AND slug = 'rast') THEN
    RAISE EXCEPTION 'Use the Rast loyalty scanner';
  END IF;
  RETURN public.record_loyalty_card_operation_legacy(p_cafe_id,p_card_code,p_invoice_barcode,p_invoice_amount,p_operation,p_cashier_session_token);
END;
$$;
REVOKE ALL ON FUNCTION public.record_loyalty_card_operation(uuid,text,text,numeric,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_loyalty_card_operation(uuid,text,text,numeric,text,text) TO anon,authenticated;

CREATE FUNCTION public.set_rast_loyalty_settings(p_cafe_id uuid,p_program jsonb,p_experience jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_product_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_cafe_permission(p_cafe_id,'loyalty') OR public.is_platform_admin())
    OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id = p_cafe_id AND slug = 'rast' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF jsonb_typeof(p_program) <> 'object' OR jsonb_typeof(p_experience) <> 'object'
    OR p_program IS NULL OR p_experience IS NULL
    OR NOT (p_program ?& ARRAY['enabled','cardTitle','cardSubtitle','purchasesRequired','rewardName','stampLabel','terms','cardBackground','cardForeground','cardAccent'])
    OR NOT (p_experience ?& ARRAY['rewardValidityDays','nearbyMessage','latitude','longitude'])
    OR jsonb_typeof(p_program->'enabled') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_program->'purchasesRequired') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_experience->'rewardValidityDays') IS DISTINCT FROM 'number'
    OR char_length(p_program->>'cardTitle') NOT BETWEEN 2 AND 80
    OR char_length(p_program->>'cardSubtitle') NOT BETWEEN 2 AND 140
    OR char_length(p_program->>'rewardName') NOT BETWEEN 2 AND 80
    OR char_length(p_program->>'stampLabel') NOT BETWEEN 1 AND 40
    OR char_length(p_program->>'terms') > 1000
    OR (p_program->>'cardBackground') !~ '^#[0-9a-fA-F]{6}$'
    OR (p_program->>'cardForeground') !~ '^#[0-9a-fA-F]{6}$'
    OR (p_program->>'cardAccent') !~ '^#[0-9a-fA-F]{6}$' THEN
    RAISE EXCEPTION 'Invalid loyalty settings';
  END IF;
  v_product_id := NULLIF(p_program->>'rewardProductId','')::uuid;
  IF v_product_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.menu_products WHERE id = v_product_id AND cafe_id = p_cafe_id) THEN
    RAISE EXCEPTION 'Reward product does not belong to cafe';
  END IF;
  IF p_experience->>'rewardKind' = 'product' AND v_product_id IS NULL THEN RAISE EXCEPTION 'Reward product required'; END IF;
  INSERT INTO public.cafe_loyalty_programs(cafe_id,enabled,card_title,card_subtitle,purchases_required,reward_product_id,
    reward_name,stamp_label,terms,card_background,card_foreground,card_accent,card_design,apple_wallet_enabled,google_wallet_enabled,wallet_enabled)
  VALUES(p_cafe_id,(p_program->>'enabled')::boolean,p_program->>'cardTitle',p_program->>'cardSubtitle',
    (p_program->>'purchasesRequired')::integer,v_product_id,p_program->>'rewardName',p_program->>'stampLabel',
    p_program->>'terms',p_program->>'cardBackground',p_program->>'cardForeground',p_program->>'cardAccent',COALESCE(NULLIF(p_program->'cardDesign','null'::jsonb),'{}'::jsonb),
    COALESCE((p_program->>'appleWalletEnabled')::boolean,false),COALESCE((p_program->>'googleWalletEnabled')::boolean,false),
    COALESCE((p_program->>'appleWalletEnabled')::boolean,false) OR COALESCE((p_program->>'googleWalletEnabled')::boolean,false))
  ON CONFLICT(cafe_id) DO UPDATE SET enabled=EXCLUDED.enabled,card_title=EXCLUDED.card_title,card_subtitle=EXCLUDED.card_subtitle,
    purchases_required=EXCLUDED.purchases_required,reward_product_id=EXCLUDED.reward_product_id,reward_name=EXCLUDED.reward_name,
    stamp_label=EXCLUDED.stamp_label,terms=EXCLUDED.terms,card_background=EXCLUDED.card_background,
    card_foreground=EXCLUDED.card_foreground,card_accent=EXCLUDED.card_accent,
    card_design=CASE WHEN p_program ? 'cardDesign' THEN EXCLUDED.card_design ELSE public.cafe_loyalty_programs.card_design END,
    apple_wallet_enabled=EXCLUDED.apple_wallet_enabled,google_wallet_enabled=EXCLUDED.google_wallet_enabled,
    wallet_enabled=EXCLUDED.wallet_enabled,updated_at=now();
  INSERT INTO public.cafe_loyalty_experience(cafe_id,reward_validity_days,reward_kind,reward_discount_percent,nearby_message,branch_latitude,branch_longitude)
  VALUES(p_cafe_id,(p_experience->>'rewardValidityDays')::integer,COALESCE(p_experience->>'rewardKind','custom'),
    CASE WHEN p_experience->>'rewardKind' = 'discount' THEN (p_experience->>'rewardDiscountPercent')::integer END,p_experience->>'nearbyMessage',
    (p_experience->>'latitude')::double precision,(p_experience->>'longitude')::double precision)
  ON CONFLICT(cafe_id) DO UPDATE SET reward_validity_days=EXCLUDED.reward_validity_days,nearby_message=EXCLUDED.nearby_message,
    reward_kind=EXCLUDED.reward_kind,reward_discount_percent=EXCLUDED.reward_discount_percent,
    branch_latitude=EXCLUDED.branch_latitude,branch_longitude=EXCLUDED.branch_longitude,updated_at=now();
END;
$$;
REVOKE ALL ON FUNCTION public.set_rast_loyalty_settings(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_rast_loyalty_settings(uuid,jsonb,jsonb) TO authenticated;

-- No reward promise is invented: the merchant chooses and enables the terms.
INSERT INTO public.cafe_loyalty_programs(cafe_id,enabled,card_title,card_subtitle,purchases_required,reward_name,
  stamp_label,terms,card_background,card_foreground,card_accent)
SELECT id,false,'بطاقة راست','كل زيارة لها أثر',7,'مكافأة تحددها راست','ختم',
  'يحدد التاجر شروط المكافأة قبل تفعيل البرنامج.','#3b1420','#f8f2e8','#970e29'
FROM public.cafes WHERE slug='rast' AND deleted_at IS NULL
ON CONFLICT(cafe_id) DO NOTHING;

COMMIT;
