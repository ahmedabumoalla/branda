-- Durable, encrypted transport only. Auth remains the sole OTP verifier.
-- New queue consumers must never retry a claimed job after ambiguous delivery.
BEGIN;
CREATE SCHEMA IF NOT EXISTS phone_otp_delivery_private;
REVOKE ALL ON SCHEMA phone_otp_delivery_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE phone_otp_delivery_private.deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 webhook_id text NOT NULL UNIQUE CHECK (length(webhook_id) BETWEEN 1 AND 200),
 phone_normalized text NOT NULL CHECK (phone_normalized ~ '^9665[0-9]{8}$'),
 provider_instance text NOT NULL CHECK (length(provider_instance) BETWEEN 1 AND 200),
 encrypted_payload text CHECK (octet_length(encrypted_payload) BETWEEN 1 AND 4096),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','unknown','failed','expired')),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '5 minutes'),
 claimed_at timestamptz,
 completed_at timestamptz,
 lease_token uuid,
 CHECK ((status IN ('pending','processing')) = (encrypted_payload IS NOT NULL)),
 CHECK (status <> 'processing' OR (claimed_at IS NOT NULL AND lease_token IS NOT NULL))
);
ALTER TABLE phone_otp_delivery_private.deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE phone_otp_delivery_private.deliveries FROM PUBLIC, anon, authenticated, service_role;
CREATE INDEX phone_otp_deliveries_pending ON phone_otp_delivery_private.deliveries(created_at,id) WHERE status='pending';
CREATE INDEX phone_otp_deliveries_expiry ON phone_otp_delivery_private.deliveries(expires_at) WHERE status IN ('pending','processing');
CREATE INDEX phone_otp_deliveries_processing ON phone_otp_delivery_private.deliveries(claimed_at) WHERE status='processing';

CREATE FUNCTION public.enqueue_customer_phone_otp_delivery(
 p_phone_normalized text,p_provider_instance text,p_webhook_id text,p_payload text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_existing phone_otp_delivery_private.deliveries%ROWTYPE;v_id uuid;v_slug text;
BEGIN
 IF p_phone_normalized IS NULL OR p_phone_normalized !~ '^9665[0-9]{8}$'
  OR p_provider_instance IS NULL OR length(p_provider_instance) NOT BETWEEN 1 AND 200
  OR p_webhook_id IS NULL OR length(p_webhook_id) NOT BETWEEN 1 AND 200
  OR p_payload IS NULL OR octet_length(p_payload) NOT BETWEEN 1 AND 4096
 THEN RAISE EXCEPTION 'Invalid OTP delivery request' USING ERRCODE='22023';END IF;
 -- Serialize identical webhook retries before consuming the single-use admission.
 PERFORM pg_advisory_xact_lock(hashtextextended('phone-otp-delivery:'||p_webhook_id,0));
 SELECT * INTO v_existing FROM phone_otp_delivery_private.deliveries WHERE webhook_id=p_webhook_id;
 IF FOUND THEN
  IF v_existing.phone_normalized<>p_phone_normalized OR v_existing.provider_instance<>p_provider_instance
   THEN RAISE EXCEPTION 'OTP delivery identity mismatch' USING ERRCODE='22023';END IF;
  RETURN v_existing.id;
 END IF;
 -- Preserve the current finance/customer predicates, rate admission and single-use behavior.
 v_slug:=public.claim_customer_phone_otp_dispatch(p_phone_normalized,p_provider_instance);
 IF v_slug IS NULL THEN RAISE EXCEPTION 'OTP delivery not admitted' USING ERRCODE='42501';END IF;
 INSERT INTO phone_otp_delivery_private.deliveries(webhook_id,phone_normalized,provider_instance,encrypted_payload)
 VALUES(p_webhook_id,p_phone_normalized,p_provider_instance,p_payload) RETURNING id INTO v_id;
 RETURN v_id;
END $$;

CREATE FUNCTION public.claim_customer_phone_otp_delivery(p_provider_instance text,p_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid,payload text,lease_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_provider_instance IS NULL OR length(p_provider_instance) NOT BETWEEN 1 AND 200
 THEN RAISE EXCEPTION 'Invalid OTP provider instance' USING ERRCODE='22023';END IF;
 -- Bounded non-blocking cleanup erases expired secrets even when there is no pending work.
 WITH obsolete AS (
  SELECT d.id FROM phone_otp_delivery_private.deliveries d
  WHERE d.status IN ('pending','processing') AND (d.expires_at<=now()
    OR (d.status='processing' AND d.claimed_at<=now()-interval '2 minutes'))
  ORDER BY d.expires_at,d.id LIMIT 200 FOR UPDATE SKIP LOCKED
 )
 UPDATE phone_otp_delivery_private.deliveries d
 SET status=CASE WHEN d.status='processing' THEN 'unknown' ELSE 'expired' END,
     encrypted_payload=NULL,completed_at=now(),lease_token=NULL
 FROM obsolete o WHERE d.id=o.id;
 RETURN QUERY
 WITH candidate AS (
  SELECT d.id FROM phone_otp_delivery_private.deliveries d
  WHERE d.status='pending' AND d.expires_at>now() AND d.provider_instance=p_provider_instance
    AND (p_id IS NULL OR d.id=p_id)
  ORDER BY d.created_at,d.id LIMIT 1 FOR UPDATE SKIP LOCKED
 )
 UPDATE phone_otp_delivery_private.deliveries d
 SET status='processing',claimed_at=now(),lease_token=gen_random_uuid()
 FROM candidate c WHERE d.id=c.id
 RETURNING d.id,d.encrypted_payload,d.lease_token;
END $$;

CREATE FUNCTION public.finish_customer_phone_otp_delivery(p_id uuid,p_lease_token uuid,p_status text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_count integer;
BEGIN
 IF p_status IS NULL OR p_status NOT IN ('sent','unknown','failed')
 THEN RAISE EXCEPTION 'Invalid OTP delivery outcome' USING ERRCODE='22023';END IF;
 UPDATE phone_otp_delivery_private.deliveries d
 SET status=p_status,encrypted_payload=NULL,completed_at=now(),lease_token=NULL
 WHERE d.id=p_id AND d.lease_token=p_lease_token AND d.status='processing';
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN v_count=1;
END $$;

REVOKE ALL ON FUNCTION public.enqueue_customer_phone_otp_delivery(text,text,text,text),
 public.claim_customer_phone_otp_delivery(text,uuid),public.finish_customer_phone_otp_delivery(uuid,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_customer_phone_otp_delivery(text,text,text,text),
 public.claim_customer_phone_otp_delivery(text,uuid),public.finish_customer_phone_otp_delivery(uuid,uuid,text)
 TO service_role;
-- Forward rollback: restore the preceding application revision before revoking
-- these RPCs in a new migration. Retain deduplication records and erase remaining payloads.
COMMIT;
