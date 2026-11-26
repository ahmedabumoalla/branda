BEGIN;

ALTER TABLE owner_guide_private.jobs
  ADD COLUMN signup_challenge_id uuid,
  DROP CONSTRAINT jobs_guide_check,
  ADD CONSTRAINT jobs_guide_check CHECK (guide IN ('setup','cashier','customer'));

-- Old workers must never claim a new signup clip using their standby-capable sender.
CREATE OR REPLACE FUNCTION public.claim_owner_companion_guide() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT NULL::jsonb $$;
CREATE OR REPLACE FUNCTION public.enqueue_owner_companion_guides(p_phone text,p_receipt text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN RETURN; END $$;

UPDATE owner_guide_private.jobs SET status='failed',updated_at=clock_timestamp()
WHERE signup_challenge_id IS NULL AND status='pending';

-- Only the verified self-signup Auth transaction consumes a challenge. If provisioning
-- rolls back, its three queue rows roll back with it. No account history is replayed.
CREATE FUNCTION owner_guide_private.enqueue_verified_signup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO owner_guide_private.jobs(signup_challenge_id,welcome_receipt,phone,guide)
  SELECT NEW.id,'signup:' || NEW.id::text,NEW.phone,guide
  FROM unnest(ARRAY['setup','cashier','customer']) guide
  ON CONFLICT (welcome_receipt,guide) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION owner_guide_private.enqueue_verified_signup() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER enqueue_verified_signup_guides AFTER UPDATE OF consumed_by ON owner_onboarding_private.challenges
FOR EACH ROW WHEN (OLD.consumed_by IS NULL AND NEW.consumed_by IS NOT NULL AND NEW.sent AND NEW.verified_at IS NOT NULL)
EXECUTE FUNCTION owner_guide_private.enqueue_verified_signup();

CREATE FUNCTION public.claim_owner_signup_guide() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job owner_guide_private.jobs; token uuid:=gen_random_uuid();
BEGIN
  UPDATE owner_guide_private.jobs SET status='uncertain',updated_at=clock_timestamp()
  WHERE status='sending' AND leased_until<clock_timestamp();
  SELECT j.* INTO job FROM owner_guide_private.jobs j
  WHERE j.signup_challenge_id IS NOT NULL AND j.status='pending' AND j.available_at<=clock_timestamp()
    AND NOT EXISTS (
      SELECT 1 FROM owner_guide_private.jobs earlier
      WHERE earlier.welcome_receipt=j.welcome_receipt AND earlier.status IN ('pending','sending')
        AND (earlier.guide='setup' AND j.guide<>'setup' OR earlier.guide='cashier' AND j.guide='customer')
    )
  ORDER BY j.available_at,j.created_at,j.id LIMIT 1 FOR UPDATE OF j SKIP LOCKED;
  IF job.id IS NULL THEN RETURN NULL; END IF;
  UPDATE owner_guide_private.jobs SET status='sending',attempts=attempts+1,attempt=token,
    leased_until=clock_timestamp()+interval '4 minutes',updated_at=clock_timestamp() WHERE id=job.id;
  RETURN jsonb_build_object('id',job.id,'phone',job.phone,'guide',job.guide,'attempt',token);
END $$;

-- A primary that is offline or explicitly rate-limited has not accepted the clip.
-- Keep its place in the sequence without exhausting the rejected-recipient retry budget.
CREATE FUNCTION public.defer_owner_signup_guide(p_id uuid,p_attempt uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  UPDATE owner_guide_private.jobs SET status='pending',attempts=greatest(0,attempts-1),leased_until=NULL,
    available_at=clock_timestamp()+interval '5 minutes',updated_at=clock_timestamp()
  WHERE id=p_id AND attempt=p_attempt AND status='sending' AND signup_challenge_id IS NOT NULL;
  RETURN FOUND OR EXISTS (SELECT 1 FROM owner_guide_private.jobs WHERE id=p_id AND attempt=p_attempt
    AND status='pending' AND signup_challenge_id IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION public.claim_owner_signup_guide(),public.defer_owner_signup_guide(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_owner_signup_guide(),public.defer_owner_signup_guide(uuid,uuid) TO service_role;
COMMIT;
