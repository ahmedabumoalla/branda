BEGIN;

ALTER TABLE public.salon_bookings
 ADD COLUMN loyalty_profile_id uuid REFERENCES public.customer_profiles(id),
 ADD COLUMN loyalty_token_hash text UNIQUE CHECK(loyalty_token_hash ~ '^[0-9a-f]{64}$'),
 ADD COLUMN loyalty_enrollment_attempted boolean NOT NULL DEFAULT false;
ALTER TABLE public.salon_message_jobs DROP CONSTRAINT salon_message_jobs_kind_check;
ALTER TABLE public.salon_message_jobs ADD CONSTRAINT salon_message_jobs_kind_check
 CHECK(kind IN ('owner_new','owner_response','confirmed','proposed','rejected','call','completed','loyalty_welcome'));
CREATE UNIQUE INDEX salon_single_loyalty_welcome ON public.salon_message_jobs(booking_id) WHERE kind='loyalty_welcome';

-- A previous deployment must never interpret a new welcome job as a rejection.
CREATE FUNCTION public.salon_claim_messages_v2(p_limit integer DEFAULT 10) RETURNS SETOF public.salon_message_jobs
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 UPDATE public.salon_message_jobs SET state='uncertain',last_error='dispatch_interrupted',updated_at=now() WHERE state='dispatching' AND claimed_at<now()-interval '2 minutes';
 RETURN QUERY WITH candidates AS (SELECT j.id FROM public.salon_message_jobs j WHERE j.state='pending' ORDER BY j.created_at,j.id FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(coalesce(p_limit,10),20)))
 UPDATE public.salon_message_jobs j SET state='dispatching',lease_token=gen_random_uuid(),claimed_at=clock_timestamp(),updated_at=clock_timestamp()
 FROM candidates c WHERE j.id=c.id RETURNING j.*;
END $$;
REVOKE ALL ON FUNCTION public.salon_claim_messages_v2(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.salon_claim_messages_v2(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.salon_claim_messages(p_limit integer DEFAULT 10) RETURNS SETOF public.salon_message_jobs
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 UPDATE public.salon_message_jobs SET state='uncertain',last_error='dispatch_interrupted',updated_at=now() WHERE state='dispatching' AND claimed_at<now()-interval '2 minutes';
 RETURN QUERY WITH candidates AS (SELECT j.id FROM public.salon_message_jobs j WHERE j.state='pending' AND j.kind<>'loyalty_welcome' ORDER BY j.created_at,j.id FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(coalesce(p_limit,10),20)))
 UPDATE public.salon_message_jobs j SET state='dispatching',lease_token=gen_random_uuid(),claimed_at=clock_timestamp(),updated_at=clock_timestamp()
 FROM candidates c WHERE j.id=c.id RETURNING j.*;
END $$;

-- Keep the established booking, phone/name enrollment and card issuance rules.
-- No account authentication, welcome stamp or reward is invented by a booking.
CREATE FUNCTION public.salon_create_booking_with_loyalty(
 p_id uuid,p_cafe uuid,p_name text,p_phone text,p_service uuid,p_start timestamptz,
 p_portal_hash text,p_client_key text,p_loyalty_hash text
) RETURNS public.salon_bookings LANGUAGE plpgsql SET search_path='' AS $$
DECLARE b public.salon_bookings; enrollment jsonb;
BEGIN
 IF p_loyalty_hash IS NULL OR p_loyalty_hash !~ '^[0-9a-f]{64}$' OR p_loyalty_hash=p_portal_hash THEN
  RAISE EXCEPTION 'SALON_INVALID_LOYALTY_TOKEN';
 END IF;
 b:=public.salon_create_booking(p_id,p_cafe,p_name,p_phone,p_service,p_start,p_portal_hash,p_client_key);
 SELECT * INTO b FROM public.salon_bookings WHERE id=b.id FOR UPDATE;
 IF b.loyalty_enrollment_attempted THEN RETURN b; END IF;
 IF salon_private.enabled(b.cafe_id,'loyalty') AND EXISTS(
  SELECT 1 FROM public.cafe_loyalty_programs WHERE cafe_id=b.cafe_id AND enabled
 ) THEN
  enrollment:=public.enroll_loyalty_customer_direct(b.cafe_id,b.customer_name,b.phone,b.client_key);
  IF enrollment->>'ok'='true' AND enrollment->>'profile_id' IS NOT NULL THEN
   UPDATE public.salon_bookings SET loyalty_profile_id=(enrollment->>'profile_id')::uuid,
    loyalty_token_hash=p_loyalty_hash,loyalty_enrollment_attempted=true WHERE id=b.id RETURNING * INTO b;
   PERFORM salon_private.queue_message(b,'loyalty_welcome');
   RETURN b;
  END IF;
 END IF;
 -- An unavailable/blocked identity must not prevent the appointment or overwrite a customer.
 UPDATE public.salon_bookings SET loyalty_enrollment_attempted=true WHERE id=b.id RETURNING * INTO b;
 RETURN b;
END $$;
REVOKE ALL ON FUNCTION public.salon_create_booking_with_loyalty(uuid,uuid,text,text,uuid,timestamptz,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.salon_create_booking_with_loyalty(uuid,uuid,text,text,uuid,timestamptz,text,text,text) TO service_role;

-- The card link is a separate WhatsApp-only capability; the booking portal cannot mint a session.
CREATE FUNCTION public.salon_loyalty_link_context(p_hash text)
RETURNS TABLE(cafe_id uuid,profile_id uuid,slug text,phone text)
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT b.cafe_id,b.loyalty_profile_id,c.slug,b.phone
 FROM public.salon_bookings b
 JOIN public.cafes c ON c.id=b.cafe_id
 JOIN public.customer_profiles cp ON cp.id=b.loyalty_profile_id AND cp.cafe_id=b.cafe_id
 JOIN public.cafe_loyalty_programs p ON p.cafe_id=b.cafe_id AND p.enabled
 JOIN public.loyalty_cards lc ON lc.cafe_id=b.cafe_id AND lc.customer_profile_id=cp.id AND lc.status='active'
 WHERE p_hash ~ '^[0-9a-f]{64}$' AND b.loyalty_token_hash=p_hash
  AND b.created_at>now()-interval '30 days' AND salon_private.enabled(b.cafe_id,'loyalty')
  AND cp.status='active' AND cp.blocked_at IS NULL AND NOT cp.phone_auth_conflict
  AND cp.phone_normalized=b.phone
$$;
REVOKE ALL ON FUNCTION public.salon_loyalty_link_context(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.salon_loyalty_link_context(text) TO service_role;

CREATE OR REPLACE FUNCTION public.salon_authorize_dispatch(p_job uuid,p_lease uuid) RETURNS boolean
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE j public.salon_message_jobs; b public.salon_bookings; allowed boolean;
BEGIN
 SELECT * INTO j FROM public.salon_message_jobs WHERE id=p_job AND lease_token=p_lease AND state='dispatching' AND NOT dispatch_authorized FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO b FROM public.salon_bookings WHERE id=j.booking_id;
 allowed:=salon_private.enabled(j.cafe_id,CASE WHEN j.kind IN ('call','completed') THEN 'pager' WHEN j.kind='loyalty_welcome' THEN 'loyalty' ELSE 'menu' END)
 AND CASE j.kind WHEN 'owner_new' THEN b.status='pending' WHEN 'owner_response' THEN b.status IN ('confirmed','rejected')
 WHEN 'confirmed' THEN b.status='confirmed' WHEN 'proposed' THEN b.status='proposed' WHEN 'rejected' THEN b.status='rejected'
 WHEN 'call' THEN b.status='in_service' WHEN 'completed' THEN b.status='completed'
 WHEN 'loyalty_welcome' THEN j.phone=b.phone AND EXISTS(SELECT 1 FROM public.salon_loyalty_link_context(b.loyalty_token_hash))
 ELSE false END;
 UPDATE public.salon_message_jobs SET dispatch_authorized=coalesce(allowed,false),state=CASE WHEN allowed THEN 'dispatching' ELSE 'cancelled' END,updated_at=clock_timestamp() WHERE id=j.id;
 RETURN coalesce(allowed,false);
END $$;
COMMIT;
