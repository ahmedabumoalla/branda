BEGIN;

-- Future deliveries retain the exact admission's tenant/purpose. No historical
-- phone-based backfill: old jobs continue using the existing platform transport.
ALTER TABLE phone_otp_delivery_private.deliveries
 ADD COLUMN cafe_id uuid REFERENCES public.cafes(id) ON DELETE SET NULL,
 ADD COLUMN purpose text CHECK(purpose IN ('customer_signup','customer_login','finance_cashier_login'));
CREATE INDEX phone_otp_deliveries_cafe ON phone_otp_delivery_private.deliveries(cafe_id) WHERE cafe_id IS NOT NULL;
ALTER TABLE public.customer_phone_otp_requests ADD COLUMN delivery_context_ambiguous boolean NOT NULL DEFAULT false;

CREATE FUNCTION phone_otp_delivery_private.claim_admission(p_phone_normalized text,p_provider_instance text)
RETURNS TABLE(cafe_id uuid,purpose text,slug text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_request_id uuid;v_cafe_id uuid;v_purpose text;v_slug text;v_ambiguous boolean;
BEGIN
 IF p_phone_normalized IS NULL OR p_phone_normalized !~ '^9665[0-9]{8}$'
  OR p_provider_instance IS NULL OR char_length(p_provider_instance) NOT BETWEEN 1 AND 200 THEN RETURN;END IF;
 -- The global lock is shared with both existing begin functions, so admission
 -- creation cannot race this context decision. The phone lock serializes hooks.
 PERFORM pg_advisory_xact_lock(hashtextextended('customer-phone-otp-global:'||p_provider_instance,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('customer-phone-otp-context:'||p_provider_instance||':'||p_phone_normalized,0));
 IF (SELECT count(*) FROM public.customer_phone_otp_requests r
     WHERE r.phone_normalized=p_phone_normalized AND r.provider_instance=p_provider_instance
      AND r.status='pending' AND r.provider_dispatched_at IS NULL AND r.created_at>now()-interval '2 minutes')>1 THEN
  -- All competing admissions remain ambiguous, including the last one consumed.
  -- A signed Auth hook has no request/tenant identifier; never guess its sender.
  UPDATE public.customer_phone_otp_requests r SET delivery_context_ambiguous=true
  WHERE r.phone_normalized=p_phone_normalized AND r.provider_instance=p_provider_instance
   AND r.status='pending' AND r.provider_dispatched_at IS NULL AND r.created_at>now()-interval '2 minutes';
 END IF;
 SELECT r.id,r.cafe_id,r.purpose,c.slug::text,r.delivery_context_ambiguous INTO v_request_id,v_cafe_id,v_purpose,v_slug,v_ambiguous
 FROM public.customer_phone_otp_requests r JOIN public.cafes c ON c.id=r.cafe_id
 WHERE r.phone_normalized=p_phone_normalized AND r.provider_instance=p_provider_instance
  AND r.status='pending' AND r.provider_dispatched_at IS NULL AND r.created_at>now()-interval '2 minutes'
  AND c.deleted_at IS NULL
  AND (
   (r.purpose IN('customer_signup','customer_login') AND c.status='active' AND c.is_public
    AND platform_access_private.service_enabled(c.id,'loyalty')
    AND EXISTS(SELECT 1 FROM public.cafe_loyalty_programs p WHERE p.cafe_id=c.id AND p.enabled))
   OR
   (r.purpose='finance_cashier_login' AND r.finance_ip_hash IS NOT NULL AND c.status IN('active','published')
    AND platform_access_private.service_enabled(c.id,'finance')
    AND public.brand_finance_sales_cashier_phone_enabled(p_phone_normalized)
    AND EXISTS(SELECT 1 FROM public.bf_staff s JOIN auth.users u ON u.id=s.user_id
     WHERE s.cafe_id=c.id AND s.role='cashier' AND s.active AND u.phone IN(p_phone_normalized,'+'||p_phone_normalized)))
  )
 ORDER BY r.created_at DESC,r.id DESC LIMIT 1 FOR UPDATE OF r SKIP LOCKED;
 IF NOT FOUND THEN RETURN;END IF;
 UPDATE public.customer_phone_otp_requests SET provider_dispatched_at=now() WHERE id=v_request_id;
 RETURN QUERY SELECT CASE WHEN v_ambiguous THEN NULL::uuid ELSE v_cafe_id END,
  CASE WHEN v_ambiguous THEN NULL::text ELSE v_purpose END,v_slug;
END $$;
REVOKE ALL ON FUNCTION phone_otp_delivery_private.claim_admission(text,text) FROM PUBLIC,anon,authenticated,service_role;

-- Keep the original public signature for old application revisions.
CREATE OR REPLACE FUNCTION public.claim_customer_phone_otp_dispatch(p_phone_normalized text,p_provider_instance text)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT a.slug FROM phone_otp_delivery_private.claim_admission(p_phone_normalized,p_provider_instance) a
$$;
REVOKE ALL ON FUNCTION public.claim_customer_phone_otp_dispatch(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_customer_phone_otp_dispatch(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_customer_phone_otp_delivery(
 p_phone_normalized text,p_provider_instance text,p_webhook_id text,p_payload text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_existing phone_otp_delivery_private.deliveries%ROWTYPE;v_id uuid;v_context record;
BEGIN
 IF p_phone_normalized IS NULL OR p_phone_normalized !~ '^9665[0-9]{8}$'
  OR p_provider_instance IS NULL OR length(p_provider_instance) NOT BETWEEN 1 AND 200
  OR p_webhook_id IS NULL OR length(p_webhook_id) NOT BETWEEN 1 AND 200
  OR p_payload IS NULL OR octet_length(p_payload) NOT BETWEEN 1 AND 4096
 THEN RAISE EXCEPTION 'Invalid OTP delivery request' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('phone-otp-delivery:'||p_webhook_id,0));
 SELECT * INTO v_existing FROM phone_otp_delivery_private.deliveries WHERE webhook_id=p_webhook_id;
 IF FOUND THEN
  IF v_existing.phone_normalized<>p_phone_normalized OR v_existing.provider_instance<>p_provider_instance
   THEN RAISE EXCEPTION 'OTP delivery identity mismatch' USING ERRCODE='22023';END IF;
  RETURN v_existing.id;
 END IF;
 SELECT * INTO v_context FROM phone_otp_delivery_private.claim_admission(p_phone_normalized,p_provider_instance);
 IF NOT FOUND THEN RAISE EXCEPTION 'OTP delivery not admitted' USING ERRCODE='42501';END IF;
 INSERT INTO phone_otp_delivery_private.deliveries(webhook_id,phone_normalized,provider_instance,encrypted_payload,cafe_id,purpose)
 VALUES(p_webhook_id,p_phone_normalized,p_provider_instance,p_payload,v_context.cafe_id,v_context.purpose) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_customer_phone_otp_delivery(text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_customer_phone_otp_delivery(text,text,text,text) TO service_role;

CREATE FUNCTION public.claim_customer_phone_otp_delivery_context(p_provider_instance text,p_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid,payload text,lease_token uuid,cafe_id uuid,purpose text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_claim record;
BEGIN
 FOR v_claim IN SELECT * FROM public.claim_customer_phone_otp_delivery(p_provider_instance,p_id) LOOP
  RETURN QUERY SELECT v_claim.id,v_claim.payload,v_claim.lease_token,d.cafe_id,d.purpose
  FROM phone_otp_delivery_private.deliveries d WHERE d.id=v_claim.id;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.claim_customer_phone_otp_delivery_context(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_customer_phone_otp_delivery_context(text,uuid) TO service_role;

-- Health flags are accepted only from the trusted server, never public clients.
-- Filter before claiming: an offline primary must leave non-LOCO pending jobs alone.
CREATE FUNCTION public.claim_routed_wallet_welcome(p_card_id uuid,p_primary_ready boolean,p_loco_ready boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_job loyalty_audit_private.wallet_welcomes;v_context jsonb;
BEGIN
 IF NOT coalesce(p_primary_ready,false) AND NOT coalesce(p_loco_ready,false) THEN RETURN NULL;END IF;
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
  AND ((w.cafe_id='321fd305-1883-48df-ab69-829cf7d1bc48'::uuid AND coalesce(p_loco_ready,false))
    OR (w.cafe_id<>'321fd305-1883-48df-ab69-829cf7d1bc48'::uuid AND coalesce(p_primary_ready,false)))
  AND lc.status='active' AND cp.status='active' AND cp.blocked_at IS NULL AND NOT cp.phone_auth_conflict
  AND cp.phone_normalized ~ '^9665[0-9]{8}$' AND c.status='active' AND c.deleted_at IS NULL
  AND lp.enabled AND platform_access_private.service_enabled(c.id,'loyalty')
 ORDER BY w.created_at,w.id FOR UPDATE OF w SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE loyalty_audit_private.wallet_welcomes SET status='dispatching',attempted_at=clock_timestamp(),claim_token=gen_random_uuid()
 WHERE id=v_job.id RETURNING * INTO v_job;
 SELECT jsonb_build_object('id',v_job.id,'claimToken',v_job.claim_token,'cafeId',v_job.cafe_id,'brandName',c.name,
  'phone',cp.phone_normalized,'stamps',lp.purchases_required,'reward',lp.reward_name)
 INTO v_context FROM public.cafes c
 JOIN public.customer_profiles cp ON cp.id=v_job.customer_profile_id
 JOIN public.cafe_loyalty_programs lp ON lp.cafe_id=c.id WHERE c.id=v_job.cafe_id;
 RETURN v_context;
END $$;
REVOKE ALL ON FUNCTION public.claim_routed_wallet_welcome(uuid,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_routed_wallet_welcome(uuid,boolean,boolean) TO service_role;

-- Forward rollback: restore the application revision; old claim signatures remain
-- intact and encrypted delivery deduplication/outcomes must never be reset.
COMMIT;
