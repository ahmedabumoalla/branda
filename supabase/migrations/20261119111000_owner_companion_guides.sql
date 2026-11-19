BEGIN;
CREATE SCHEMA IF NOT EXISTS owner_guide_private;
REVOKE ALL ON SCHEMA owner_guide_private FROM PUBLIC,anon,authenticated;
CREATE TABLE owner_guide_private.jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 welcome_receipt text NOT NULL CHECK(length(welcome_receipt) BETWEEN 1 AND 200),
 phone text NOT NULL CHECK(phone ~ '^9665[0-9]{8}$'),
 guide text NOT NULL CHECK(guide IN('cashier','customer')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','sending','sent','failed','uncertain')),
 attempts integer NOT NULL DEFAULT 0,
 attempt uuid,
 available_at timestamptz NOT NULL DEFAULT now(),
 leased_until timestamptz,
 provider_receipt text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(welcome_receipt,guide)
);
ALTER TABLE owner_guide_private.jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON owner_guide_private.jobs FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX owner_guide_due ON owner_guide_private.jobs(available_at,created_at) WHERE status='pending';
CREATE INDEX owner_guide_leases ON owner_guide_private.jobs(leased_until) WHERE status='sending';

CREATE FUNCTION public.enqueue_owner_companion_guides(p_phone text,p_receipt text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_phone IS NULL OR p_phone !~ '^9665[0-9]{8}$' OR p_receipt IS NULL OR length(p_receipt) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'invalid_owner_guide'; END IF;
 IF EXISTS(SELECT 1 FROM owner_guide_private.jobs WHERE welcome_receipt=p_receipt AND phone<>p_phone) THEN RAISE EXCEPTION 'owner_guide_recipient_changed'; END IF;
 INSERT INTO owner_guide_private.jobs(welcome_receipt,phone,guide) VALUES(p_receipt,p_phone,'cashier'),(p_receipt,p_phone,'customer') ON CONFLICT(welcome_receipt,guide) DO NOTHING;
END $$;

CREATE FUNCTION public.claim_owner_companion_guide() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job owner_guide_private.jobs; token uuid:=gen_random_uuid();
BEGIN
 -- A worker may have submitted before its lease expired. Never blindly replay it.
 UPDATE owner_guide_private.jobs SET status='uncertain',updated_at=clock_timestamp() WHERE status='sending' AND leased_until<clock_timestamp();
 SELECT j.* INTO job FROM owner_guide_private.jobs j
 WHERE j.status='pending' AND j.available_at<=clock_timestamp()
 AND (j.guide='cashier' OR NOT EXISTS(SELECT 1 FROM owner_guide_private.jobs first_clip WHERE first_clip.welcome_receipt=j.welcome_receipt AND first_clip.guide='cashier' AND first_clip.status IN('pending','sending')))
 ORDER BY j.created_at,CASE j.guide WHEN 'cashier' THEN 0 ELSE 1 END,j.id
 LIMIT 1 FOR UPDATE OF j SKIP LOCKED;
 IF job.id IS NULL THEN RETURN NULL; END IF;
 UPDATE owner_guide_private.jobs SET status='sending',attempts=attempts+1,attempt=token,leased_until=clock_timestamp()+interval '4 minutes',updated_at=clock_timestamp() WHERE id=job.id;
 RETURN jsonb_build_object('id',job.id,'phone',job.phone,'guide',job.guide,'attempt',token);
END $$;

CREATE FUNCTION public.finish_owner_companion_guide(p_id uuid,p_attempt uuid,p_status text,p_receipt text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed integer;
BEGIN
 IF p_status IS NULL OR p_status NOT IN('sent','rejected','uncertain') OR (p_status='sent' AND (p_receipt IS NULL OR length(p_receipt) NOT BETWEEN 1 AND 200)) THEN RAISE EXCEPTION 'invalid_owner_guide_result'; END IF;
 UPDATE owner_guide_private.jobs SET
  status=CASE WHEN p_status='rejected' THEN CASE WHEN attempts<3 THEN 'pending' ELSE 'failed' END ELSE p_status END,
  provider_receipt=CASE WHEN p_status='sent' THEN p_receipt ELSE NULL END,
  available_at=CASE WHEN p_status='rejected' THEN clock_timestamp()+interval '5 minutes' ELSE available_at END,
  leased_until=NULL,updated_at=clock_timestamp()
 WHERE id=p_id AND attempt=p_attempt AND status='sending';
 GET DIAGNOSTICS changed=ROW_COUNT;
 -- An acknowledgement retry may follow a successful transaction whose response was lost.
 RETURN changed=1 OR EXISTS(SELECT 1 FROM owner_guide_private.jobs WHERE id=p_id AND attempt=p_attempt AND status<>'sending' AND ((p_status='sent' AND status='sent' AND provider_receipt=p_receipt) OR (p_status='uncertain' AND status='uncertain') OR (p_status='rejected' AND status IN('pending','failed'))));
END $$;
REVOKE ALL ON FUNCTION public.enqueue_owner_companion_guides(text,text),public.claim_owner_companion_guide(),public.finish_owner_companion_guide(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_owner_companion_guides(text,text),public.claim_owner_companion_guide(),public.finish_owner_companion_guide(uuid,uuid,text,text) TO service_role;
COMMIT;
