BEGIN;
-- Forward-only: retain the original scheduled time while a proposal awaits a reply.
ALTER TABLE public.salon_message_jobs DROP CONSTRAINT salon_message_jobs_kind_check;
ALTER TABLE public.salon_message_jobs ADD CONSTRAINT salon_message_jobs_kind_check CHECK(kind IN ('owner_new','owner_response','owner_declined','confirmed','proposed','rejected','call','completed','loyalty_welcome'));
CREATE OR REPLACE FUNCTION public.salon_owner_booking_command(p_cafe uuid,p_id uuid,p_actor uuid,p_actor_kind text,p_action text,p_version integer,p_start timestamptz DEFAULT NULL)
RETURNS public.salon_bookings LANGUAGE plpgsql SET search_path='' AS $$
DECLARE b public.salon_bookings; next_status text; message_kind text;
BEGIN
 PERFORM salon_private.require_actor(p_cafe,p_actor,p_actor_kind,p_action IN ('call','complete') OR (p_action='propose' AND p_actor_kind='staff'));
 SELECT * INTO b FROM public.salon_bookings WHERE id=p_id AND cafe_id=p_cafe FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SALON_BOOKING_MISSING'; END IF;
 IF (p_action='confirm' AND b.status='confirmed' AND b.scheduled_start=b.requested_start)
 OR (p_action='reject' AND b.status='rejected') OR (p_action='propose' AND b.status='proposed' AND b.proposed_start=p_start AND b.version=p_version+1)
 OR (p_action='call' AND b.called_at IS NOT NULL) OR (p_action='complete' AND b.status='completed') THEN RETURN b; END IF;
 IF p_version IS DISTINCT FROM b.version THEN RAISE EXCEPTION 'SALON_BOOKING_CHANGED'; END IF;
 IF p_action IN ('confirm','reject','propose') AND b.status='pending' AND p_actor_kind='owner' THEN
  IF p_action='confirm' THEN
   IF b.requested_start<clock_timestamp() THEN RAISE EXCEPTION 'SALON_INVALID_TIME'; END IF;
   b.scheduled_start:=b.requested_start;next_status:='confirmed';message_kind:='confirmed';
  ELSIF p_action='reject' THEN next_status:='rejected';message_kind:='rejected';
  ELSE
   IF p_start IS NULL OR p_start<=clock_timestamp() OR p_start>clock_timestamp()+interval '180 days' THEN RAISE EXCEPTION 'SALON_INVALID_TIME'; END IF;
   b.proposed_start:=p_start;next_status:='proposed';message_kind:='proposed';
  END IF;
 ELSIF p_action='propose' AND b.status='confirmed' AND b.called_at IS NULL THEN
  IF p_start IS NULL OR p_start<=clock_timestamp() OR p_start>clock_timestamp()+interval '180 days' OR p_start=b.scheduled_start THEN RAISE EXCEPTION 'SALON_INVALID_TIME'; END IF;
  b.proposed_start:=p_start;next_status:='proposed';message_kind:='proposed';
 ELSIF p_action='call' AND b.status='confirmed' AND b.called_at IS NULL THEN
  next_status:='in_service';b.called_at:=clock_timestamp();message_kind:='call';
 ELSIF p_action='complete' AND b.status='in_service' THEN
  next_status:='completed';b.completed_at:=clock_timestamp();message_kind:='completed';
 ELSE RAISE EXCEPTION 'SALON_INVALID_TRANSITION'; END IF;
 UPDATE public.salon_bookings SET status=next_status,scheduled_start=b.scheduled_start,proposed_start=b.proposed_start,called_at=b.called_at,completed_at=b.completed_at,version=version+1,updated_at=clock_timestamp()
 WHERE id=b.id RETURNING * INTO b;
 INSERT INTO public.salon_booking_events(booking_id,cafe_id,action,actor_kind,actor_id,details) VALUES(b.id,b.cafe_id,p_action,p_actor_kind,p_actor,jsonb_build_object('scheduledStart',b.scheduled_start,'proposedStart',b.proposed_start));
 PERFORM salon_private.queue_message(b,message_kind);RETURN b;
END $$;
CREATE OR REPLACE FUNCTION salon_private.queue_message(p_booking public.salon_bookings,p_kind text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE recipient text; persisted public.salon_bookings;
BEGIN
 SELECT * INTO persisted FROM public.salon_bookings WHERE id=p_booking.id AND cafe_id=p_booking.cafe_id AND version=p_booking.version;
 IF NOT FOUND THEN RAISE EXCEPTION 'SALON_BOOKING_CHANGED'; END IF;
 p_booking:=persisted;
 IF p_kind IN ('owner_new','owner_response','owner_declined') THEN
  SELECT regexp_replace(coalesce(nullif(s.owner_phone,''),p.phone,''),'[^0-9]','','g') INTO recipient
  FROM public.cafes c LEFT JOIN public.cafe_settings s ON s.cafe_id=c.id LEFT JOIN public.profiles p ON p.id=c.owner_user_id WHERE c.id=p_booking.cafe_id;
  IF recipient ~ '^05[0-9]{8}$' THEN recipient:='966'||substr(recipient,2); END IF;
  INSERT INTO public.notifications(cafe_id,audience,title,body,type,meta) VALUES(p_booking.cafe_id,'cafe',
   CASE WHEN p_kind='owner_new' THEN 'عندك حجز جديد' WHEN p_kind='owner_declined' THEN 'رفض العميل تغيير الموعد' ELSE 'رد العميل على الموعد المقترح' END,
   CASE WHEN p_kind='owner_declined' THEN p_booking.customer_name||' رفض الموعد المقترح — رقم العميل '||p_booking.phone ELSE p_booking.customer_name END,
   'salon_booking',jsonb_build_object('bookingId',p_booking.id,'href','/dashboard/bookings?booking='||p_booking.id::text));
 ELSE recipient:=p_booking.phone; END IF;
 IF recipient ~ '^9665[0-9]{8}$' THEN
  INSERT INTO public.salon_message_jobs(booking_id,cafe_id,kind,booking_version,phone)
  VALUES(p_booking.id,p_booking.cafe_id,p_kind,p_booking.version,recipient) ON CONFLICT DO NOTHING;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.salon_authorize_dispatch(p_job uuid,p_lease uuid) RETURNS boolean
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE j public.salon_message_jobs; b public.salon_bookings; allowed boolean;
BEGIN
 SELECT * INTO j FROM public.salon_message_jobs WHERE id=p_job AND lease_token=p_lease AND state='dispatching' AND NOT dispatch_authorized FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO b FROM public.salon_bookings WHERE id=j.booking_id;
 allowed:=salon_private.enabled(j.cafe_id,CASE WHEN j.kind IN ('call','completed') THEN 'pager' WHEN j.kind='loyalty_welcome' THEN 'loyalty' ELSE 'menu' END)
 AND (j.kind IN ('loyalty_welcome','owner_declined') OR b.version=j.booking_version)
 AND CASE j.kind WHEN 'owner_new' THEN b.status='pending' WHEN 'owner_response' THEN b.status IN ('confirmed','rejected')
 WHEN 'owner_declined' THEN EXISTS(SELECT 1 FROM public.salon_booking_events e WHERE e.booking_id=b.id AND e.action='declined_proposal' AND (e.details->>'responseVersion')::integer=j.booking_version-1)
 WHEN 'confirmed' THEN b.status='confirmed' WHEN 'proposed' THEN b.status='proposed' WHEN 'rejected' THEN b.status='rejected'
 WHEN 'call' THEN b.status='in_service' WHEN 'completed' THEN b.status='completed'
 WHEN 'loyalty_welcome' THEN j.phone=b.phone AND EXISTS(SELECT 1 FROM public.salon_loyalty_link_context(b.loyalty_token_hash))
 ELSE false END;
 UPDATE public.salon_message_jobs SET dispatch_authorized=coalesce(allowed,false),state=CASE WHEN allowed THEN 'dispatching' ELSE 'cancelled' END,updated_at=clock_timestamp() WHERE id=j.id;
 RETURN coalesce(allowed,false);
END $$;
CREATE OR REPLACE FUNCTION public.salon_claim_messages_v3(p_limit integer DEFAULT 10) RETURNS SETOF public.salon_message_jobs
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 UPDATE public.salon_message_jobs SET state='uncertain',last_error='dispatch_interrupted',updated_at=now() WHERE state='dispatching' AND claimed_at<now()-interval '2 minutes';
 RETURN QUERY WITH candidates AS (SELECT j.id FROM public.salon_message_jobs j WHERE j.state='pending' ORDER BY j.created_at,j.id FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(coalesce(p_limit,10),20)))
 UPDATE public.salon_message_jobs j SET state='dispatching',lease_token=gen_random_uuid(),claimed_at=clock_timestamp(),updated_at=clock_timestamp()
 FROM candidates c WHERE j.id=c.id RETURNING j.*;
END $$;
CREATE OR REPLACE FUNCTION public.salon_claim_messages_v2(p_limit integer DEFAULT 10) RETURNS SETOF public.salon_message_jobs
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 UPDATE public.salon_message_jobs SET state='uncertain',last_error='dispatch_interrupted',updated_at=now() WHERE state='dispatching' AND claimed_at<now()-interval '2 minutes';
 RETURN QUERY WITH candidates AS (SELECT j.id FROM public.salon_message_jobs j WHERE j.state='pending' AND j.kind<>'owner_declined' ORDER BY j.created_at,j.id FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(coalesce(p_limit,10),20)))
 UPDATE public.salon_message_jobs j SET state='dispatching',lease_token=gen_random_uuid(),claimed_at=clock_timestamp(),updated_at=clock_timestamp()
 FROM candidates c WHERE j.id=c.id RETURNING j.*;
END $$;
CREATE OR REPLACE FUNCTION public.salon_claim_messages(p_limit integer DEFAULT 10) RETURNS SETOF public.salon_message_jobs
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 UPDATE public.salon_message_jobs SET state='uncertain',last_error='dispatch_interrupted',updated_at=now() WHERE state='dispatching' AND claimed_at<now()-interval '2 minutes';
 RETURN QUERY WITH candidates AS (SELECT j.id FROM public.salon_message_jobs j WHERE j.state='pending' AND j.kind NOT IN ('loyalty_welcome','owner_declined') ORDER BY j.created_at,j.id FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(coalesce(p_limit,10),20)))
 UPDATE public.salon_message_jobs j SET state='dispatching',lease_token=gen_random_uuid(),claimed_at=clock_timestamp(),updated_at=clock_timestamp()
 FROM candidates c WHERE j.id=c.id RETURNING j.*;
END $$;
CREATE OR REPLACE FUNCTION public.salon_customer_booking_response(p_id uuid,p_hash text,p_version integer,p_accept boolean)
RETURNS public.salon_bookings LANGUAGE plpgsql SET search_path='' AS $$
DECLARE b public.salon_bookings; target text; response_action text;
BEGIN
 SELECT * INTO b FROM public.salon_bookings WHERE id=p_id AND portal_hash=p_hash FOR UPDATE;
 IF NOT FOUND OR NOT salon_private.enabled(b.cafe_id) OR b.created_at<now()-interval '270 days' THEN RAISE EXCEPTION 'SALON_LINK_UNAVAILABLE'; END IF;
 IF p_accept IS NULL THEN RAISE EXCEPTION 'SALON_INVALID_RESPONSE'; END IF;
 response_action:=CASE WHEN p_accept THEN 'accepted_proposal' ELSE 'declined_proposal' END;
 IF b.version=p_version+1 AND EXISTS(SELECT 1 FROM public.salon_booking_events WHERE booking_id=b.id AND action=response_action AND (details->>'responseVersion')::integer=p_version) THEN RETURN b; END IF;
 IF b.status<>'proposed' OR p_version IS DISTINCT FROM b.version THEN RAISE EXCEPTION 'SALON_BOOKING_CHANGED'; END IF;
 IF p_accept AND b.proposed_start<=clock_timestamp() THEN RAISE EXCEPTION 'SALON_INVALID_TIME'; END IF;
 target:=CASE WHEN p_accept OR b.scheduled_start IS NOT NULL THEN 'confirmed' ELSE 'rejected' END;
 INSERT INTO public.salon_booking_events(booking_id,cafe_id,action,actor_kind,details)
 VALUES(b.id,b.cafe_id,response_action,'customer',jsonb_build_object('responseVersion',p_version,'previousStart',b.scheduled_start,'proposedStart',b.proposed_start));
 UPDATE public.salon_bookings SET status=target,scheduled_start=CASE WHEN p_accept THEN proposed_start ELSE scheduled_start END,
 proposed_start=NULL,version=version+1,updated_at=clock_timestamp() WHERE id=b.id RETURNING * INTO b;
 PERFORM salon_private.queue_message(b,CASE WHEN p_accept THEN 'owner_response' ELSE 'owner_declined' END);
 RETURN b;
END $$;

REVOKE ALL ON FUNCTION public.salon_claim_messages_v3(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.salon_claim_messages_v3(integer) TO service_role;
COMMIT;
