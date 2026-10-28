BEGIN;

ALTER TABLE public.menu_products ADD COLUMN catalog_kind text NOT NULL DEFAULT 'product'
 CHECK(catalog_kind IN ('product','service'));

CREATE SCHEMA salon_private;
REVOKE ALL ON SCHEMA salon_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA salon_private TO service_role;

CREATE TABLE public.salon_bookings (
 id uuid PRIMARY KEY, cafe_id uuid NOT NULL REFERENCES public.cafes(id),
 customer_name text NOT NULL CHECK(length(btrim(customer_name)) BETWEEN 2 AND 120),
 phone text NOT NULL CHECK(phone ~ '^9665[0-9]{8}$'),
 service_id uuid REFERENCES public.menu_products(id), service_snapshot jsonb NOT NULL,
 requested_start timestamptz NOT NULL, scheduled_start timestamptz, proposed_start timestamptz,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','proposed','confirmed','rejected','in_service','completed','cancelled')),
 version integer NOT NULL DEFAULT 0 CHECK(version>=0),
 portal_hash text NOT NULL UNIQUE CHECK(portal_hash ~ '^[0-9a-f]{64}$'),
 client_key text NOT NULL CHECK(client_key ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 called_at timestamptz, completed_at timestamptz,
 rating integer CHECK(rating BETWEEN 1 AND 5), review text NOT NULL DEFAULT '' CHECK(length(review)<=1000), rated_at timestamptz,
 UNIQUE(id,cafe_id), CHECK((rating IS NULL)=(rated_at IS NULL)),
 CHECK(status NOT IN ('confirmed','in_service','completed') OR scheduled_start IS NOT NULL),
 CHECK(status<>'proposed' OR proposed_start IS NOT NULL)
);
CREATE INDEX salon_booking_schedule ON public.salon_bookings(cafe_id,scheduled_start,id) WHERE status IN ('confirmed','in_service');
CREATE INDEX salon_booking_history ON public.salon_bookings(cafe_id,created_at DESC,id DESC);
CREATE INDEX salon_booking_phone_rate ON public.salon_bookings(phone,created_at DESC);
CREATE INDEX salon_booking_client_rate ON public.salon_bookings(client_key,created_at DESC);

CREATE TABLE public.salon_booking_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 booking_id uuid NOT NULL, cafe_id uuid NOT NULL, action text NOT NULL,
 actor_kind text NOT NULL CHECK(actor_kind IN ('customer','owner','staff')),
 actor_id uuid, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(booking_id,cafe_id) REFERENCES public.salon_bookings(id,cafe_id)
);
CREATE INDEX salon_events_booking ON public.salon_booking_events(cafe_id,booking_id,created_at,id);

CREATE TABLE public.salon_message_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL, cafe_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('owner_new','owner_response','confirmed','proposed','rejected','call','completed')),
 booking_version integer NOT NULL,
 phone text NOT NULL CHECK(phone ~ '^9665[0-9]{8}$'),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','dispatching','done','failed','uncertain','cancelled')),
 dispatch_authorized boolean NOT NULL DEFAULT false, lease_token uuid, claimed_at timestamptz,
 provider_id text, last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(booking_id,kind,booking_version), FOREIGN KEY(booking_id,cafe_id) REFERENCES public.salon_bookings(id,cafe_id)
);
CREATE UNIQUE INDEX salon_single_pager_message ON public.salon_message_jobs(booking_id,kind) WHERE kind IN ('call','completed');
CREATE INDEX salon_pending_messages ON public.salon_message_jobs(created_at,id) WHERE state='pending';
CREATE INDEX salon_message_history ON public.salon_message_jobs(cafe_id,booking_id,created_at);

CREATE TABLE public.salon_announcements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cafe_id uuid NOT NULL REFERENCES public.cafes(id),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 2 AND 120),
 description text NOT NULL DEFAULT '' CHECK(length(description)<=1200),
 service_id uuid REFERENCES public.menu_products(id), active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX salon_announcements_brand ON public.salon_announcements(cafe_id,active,created_at DESC);

ALTER TABLE public.salon_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_booking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_message_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_announcements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.salon_bookings,public.salon_booking_events,public.salon_message_jobs,public.salon_announcements FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.salon_bookings,public.salon_message_jobs,public.salon_announcements TO service_role;
GRANT SELECT,INSERT ON public.salon_booking_events TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.salon_booking_events_id_seq TO service_role;

CREATE FUNCTION salon_private.enabled(p_cafe uuid,p_feature text DEFAULT 'menu') RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND business_category='hair_salons' AND status='active' AND deleted_at IS NULL)
 AND platform_access_private.service_enabled(p_cafe,p_feature)
$$;

CREATE FUNCTION salon_private.require_actor(p_cafe uuid,p_actor uuid,p_kind text,p_pager boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT salon_private.enabled(p_cafe,CASE WHEN p_pager THEN 'pager' ELSE 'menu' END) THEN RAISE EXCEPTION 'SALON_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 IF p_kind='owner' THEN
  IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_actor AND p.status='active' AND
    (p.role='platform_admin' OR EXISTS(SELECT 1 FROM public.cafes c WHERE c.id=p_cafe AND c.owner_user_id=p_actor)
     OR EXISTS(SELECT 1 FROM public.cafe_members m WHERE m.cafe_id=p_cafe AND m.user_id=p_actor AND m.role IN ('owner','manager')))) THEN RAISE EXCEPTION 'SALON_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 ELSIF p_kind='staff' AND p_pager THEN
  IF NOT EXISTS(SELECT 1 FROM public.cafe_cashiers WHERE id=p_actor AND cafe_id=p_cafe AND active AND can_use_pager) THEN RAISE EXCEPTION 'SALON_STAFF_REQUIRED' USING ERRCODE='42501'; END IF;
 ELSE RAISE EXCEPTION 'SALON_ACTOR_INVALID' USING ERRCODE='42501'; END IF;
END $$;

CREATE FUNCTION salon_private.queue_message(p_booking public.salon_bookings,p_kind text) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE recipient text;
BEGIN
 IF p_kind IN ('owner_new','owner_response') THEN
  SELECT regexp_replace(coalesce(nullif(s.owner_phone,''),p.phone,''),'[^0-9]','','g') INTO recipient
  FROM public.cafes c LEFT JOIN public.cafe_settings s ON s.cafe_id=c.id LEFT JOIN public.profiles p ON p.id=c.owner_user_id WHERE c.id=p_booking.cafe_id;
  IF recipient ~ '^05[0-9]{8}$' THEN recipient:='966'||substr(recipient,2); END IF;
  INSERT INTO public.notifications(cafe_id,audience,title,body,type,meta) VALUES(p_booking.cafe_id,'cafe',
   CASE WHEN p_kind='owner_new' THEN 'عندك حجز جديد' ELSE 'رد العميل على الموعد المقترح' END,
   p_booking.customer_name,'salon_booking',jsonb_build_object('bookingId',p_booking.id,'href','/dashboard/bookings?booking='||p_booking.id::text));
 ELSE recipient:=p_booking.phone; END IF;
 IF recipient ~ '^9665[0-9]{8}$' THEN
  INSERT INTO public.salon_message_jobs(booking_id,cafe_id,kind,booking_version,phone)
  VALUES(p_booking.id,p_booking.cafe_id,p_kind,p_booking.version,recipient) ON CONFLICT DO NOTHING;
 END IF;
END $$;

CREATE FUNCTION public.salon_create_booking(p_id uuid,p_cafe uuid,p_name text,p_phone text,p_service uuid,p_start timestamptz,p_portal_hash text,p_client_key text)
RETURNS public.salon_bookings LANGUAGE plpgsql SET search_path='' AS $$
DECLARE b public.salon_bookings; item record; snapshot jsonb;
BEGIN
 IF NOT salon_private.enabled(p_cafe) THEN RAISE EXCEPTION 'SALON_UNAVAILABLE'; END IF;
 IF p_id IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 120 OR p_name IS NULL OR p_phone IS NULL OR p_phone !~ '^9665[0-9]{8}$'
 OR p_portal_hash IS NULL OR p_portal_hash !~ '^[0-9a-f]{64}$' OR p_client_key IS NULL OR p_client_key !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'SALON_INVALID_BOOKING'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('salon-request:'||p_id::text,0));
 SELECT * INTO b FROM public.salon_bookings WHERE id=p_id;
 IF FOUND THEN
  IF b.cafe_id<>p_cafe OR b.phone<>p_phone OR b.customer_name<>btrim(p_name) OR b.service_id IS DISTINCT FROM p_service OR b.requested_start IS DISTINCT FROM p_start OR b.portal_hash<>p_portal_hash THEN RAISE EXCEPTION 'SALON_REQUEST_CHANGED'; END IF;
  RETURN b;
 END IF;
 IF p_start IS NULL OR p_start<=clock_timestamp() OR p_start>clock_timestamp()+interval '180 days' THEN RAISE EXCEPTION 'SALON_INVALID_TIME'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('salon-client:'||p_client_key,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('salon-phone:'||p_phone,0));
 IF (SELECT count(*) FROM public.salon_bookings WHERE phone=p_phone AND created_at>now()-interval '1 hour')>=3
 OR (SELECT count(*) FROM public.salon_bookings WHERE client_key=p_client_key AND created_at>now()-interval '1 day')>=10
 OR (SELECT count(*) FROM public.salon_bookings WHERE cafe_id=p_cafe AND phone=p_phone AND status IN ('pending','proposed','confirmed','in_service'))>=3 THEN RAISE EXCEPTION 'SALON_RATE_LIMIT'; END IF;
 IF p_service IS NOT NULL THEN
  SELECT name,price,preparation_time_minutes INTO item FROM public.menu_products m WHERE m.id=p_service AND m.cafe_id=p_cafe AND m.catalog_kind='service' AND m.available AND m.deleted_at IS NULL
   AND (m.category_id IS NULL OR EXISTS(SELECT 1 FROM public.menu_categories c WHERE c.id=m.category_id AND c.cafe_id=p_cafe AND c.visible AND c.deleted_at IS NULL)) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SALON_SERVICE_UNAVAILABLE'; END IF;
  snapshot:=jsonb_build_object('name',item.name,'price',item.price,'durationMinutes',item.preparation_time_minutes);
 ELSE snapshot:=jsonb_build_object('name','موعد في الصالون','price',null,'durationMinutes',null); END IF;
 INSERT INTO public.salon_bookings(id,cafe_id,customer_name,phone,service_id,service_snapshot,requested_start,portal_hash,client_key)
 VALUES(p_id,p_cafe,btrim(p_name),p_phone,p_service,snapshot,p_start,p_portal_hash,p_client_key) RETURNING * INTO b;
 INSERT INTO public.salon_booking_events(booking_id,cafe_id,action,actor_kind,details) VALUES(b.id,b.cafe_id,'requested','customer',jsonb_build_object('requestedStart',p_start));
 PERFORM salon_private.queue_message(b,'owner_new');RETURN b;
END $$;

CREATE FUNCTION public.salon_owner_booking_command(p_cafe uuid,p_id uuid,p_actor uuid,p_actor_kind text,p_action text,p_version integer,p_start timestamptz DEFAULT NULL)
RETURNS public.salon_bookings LANGUAGE plpgsql SET search_path='' AS $$
DECLARE b public.salon_bookings; next_status text; message_kind text;
BEGIN
 PERFORM salon_private.require_actor(p_cafe,p_actor,p_actor_kind,p_action IN ('call','complete'));
 SELECT * INTO b FROM public.salon_bookings WHERE id=p_id AND cafe_id=p_cafe FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SALON_BOOKING_MISSING'; END IF;
 IF (p_action='confirm' AND b.status='confirmed' AND b.scheduled_start=b.requested_start)
 OR (p_action='reject' AND b.status='rejected') OR (p_action='propose' AND b.status='proposed' AND b.proposed_start=p_start)
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

CREATE FUNCTION public.salon_customer_booking_response(p_id uuid,p_hash text,p_version integer,p_accept boolean)
RETURNS public.salon_bookings LANGUAGE plpgsql SET search_path='' AS $$
DECLARE b public.salon_bookings; target text;
BEGIN
 SELECT * INTO b FROM public.salon_bookings WHERE id=p_id AND portal_hash=p_hash FOR UPDATE;
 IF NOT FOUND OR NOT salon_private.enabled(b.cafe_id) OR b.created_at<now()-interval '270 days' THEN RAISE EXCEPTION 'SALON_LINK_UNAVAILABLE'; END IF;
 IF p_accept IS NULL THEN RAISE EXCEPTION 'SALON_INVALID_RESPONSE'; END IF;
 target:=CASE WHEN p_accept THEN 'confirmed' ELSE 'rejected' END;
 IF b.status=target AND b.proposed_start IS NOT NULL AND b.version=p_version+1 THEN RETURN b; END IF;
 IF b.status<>'proposed' OR p_version IS DISTINCT FROM b.version THEN RAISE EXCEPTION 'SALON_BOOKING_CHANGED'; END IF;
 IF p_accept AND b.proposed_start<clock_timestamp() THEN RAISE EXCEPTION 'SALON_INVALID_TIME'; END IF;
 UPDATE public.salon_bookings SET status=target,scheduled_start=CASE WHEN p_accept THEN proposed_start ELSE NULL END,version=version+1,updated_at=clock_timestamp()
 WHERE id=b.id RETURNING * INTO b;
 INSERT INTO public.salon_booking_events(booking_id,cafe_id,action,actor_kind) VALUES(b.id,b.cafe_id,CASE WHEN p_accept THEN 'accepted_proposal' ELSE 'declined_proposal' END,'customer');
 PERFORM salon_private.queue_message(b,'owner_response');RETURN b;
END $$;

CREATE FUNCTION public.salon_submit_review(p_id uuid,p_hash text,p_rating integer,p_review text) RETURNS boolean
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE b public.salon_bookings;
BEGIN
 SELECT * INTO b FROM public.salon_bookings WHERE id=p_id AND portal_hash=p_hash AND status='completed' FOR UPDATE;
 IF NOT FOUND OR b.created_at<now()-interval '270 days' THEN RAISE EXCEPTION 'SALON_LINK_UNAVAILABLE'; END IF;
 IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 OR p_review IS NULL OR length(p_review)>1000 THEN RAISE EXCEPTION 'SALON_INVALID_REVIEW'; END IF;
 IF b.rating IS NOT NULL THEN RETURN b.rating=p_rating AND b.review=btrim(p_review); END IF;
 UPDATE public.salon_bookings SET rating=p_rating,review=btrim(p_review),rated_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=b.id;
 RETURN true;
END $$;

CREATE FUNCTION public.salon_claim_messages(p_limit integer DEFAULT 10) RETURNS SETOF public.salon_message_jobs
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 -- An expired dispatch might already have reached WhatsApp. Never automatically replay it.
 UPDATE public.salon_message_jobs SET state='uncertain',last_error='dispatch_interrupted',updated_at=now() WHERE state='dispatching' AND claimed_at<now()-interval '2 minutes';
 RETURN QUERY WITH candidates AS (SELECT j.id FROM public.salon_message_jobs j WHERE j.state='pending' ORDER BY j.created_at,j.id FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(coalesce(p_limit,10),20)))
 UPDATE public.salon_message_jobs j SET state='dispatching',lease_token=gen_random_uuid(),claimed_at=clock_timestamp(),updated_at=clock_timestamp()
 FROM candidates c WHERE j.id=c.id RETURNING j.*;
END $$;

CREATE FUNCTION public.salon_authorize_dispatch(p_job uuid,p_lease uuid) RETURNS boolean
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE j public.salon_message_jobs; b public.salon_bookings; allowed boolean;
BEGIN
 SELECT * INTO j FROM public.salon_message_jobs WHERE id=p_job AND lease_token=p_lease AND state='dispatching' AND NOT dispatch_authorized FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO b FROM public.salon_bookings WHERE id=j.booking_id;
 allowed:=salon_private.enabled(j.cafe_id,CASE WHEN j.kind IN ('call','completed') THEN 'pager' ELSE 'menu' END)
 AND CASE j.kind WHEN 'owner_new' THEN b.status='pending' WHEN 'owner_response' THEN b.status IN ('confirmed','rejected')
 WHEN 'confirmed' THEN b.status='confirmed' WHEN 'proposed' THEN b.status='proposed' WHEN 'rejected' THEN b.status='rejected'
 WHEN 'call' THEN b.status='in_service' WHEN 'completed' THEN b.status='completed' ELSE false END;
 UPDATE public.salon_message_jobs SET dispatch_authorized=coalesce(allowed,false),state=CASE WHEN allowed THEN 'dispatching' ELSE 'cancelled' END,updated_at=clock_timestamp() WHERE id=j.id;
 RETURN coalesce(allowed,false);
END $$;

CREATE FUNCTION public.salon_finish_message(p_job uuid,p_lease uuid,p_provider_id text DEFAULT NULL,p_error text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 UPDATE public.salon_message_jobs SET state=CASE WHEN p_provider_id IS NOT NULL THEN 'done' ELSE 'uncertain' END,
 provider_id=left(p_provider_id,300),last_error=left(p_error,100),updated_at=clock_timestamp()
 WHERE id=p_job AND lease_token=p_lease AND state='dispatching' AND dispatch_authorized;
 RETURN FOUND;
END $$;

CREATE FUNCTION public.salon_save_announcement(p_cafe uuid,p_actor uuid,p_id uuid,p_title text,p_description text,p_service uuid,p_active boolean)
RETURNS public.salon_announcements LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.salon_announcements;
BEGIN
 PERFORM salon_private.require_actor(p_cafe,p_actor,'owner');
 IF NOT salon_private.enabled(p_cafe,'offers') THEN RAISE EXCEPTION 'SALON_OFFERS_UNAVAILABLE'; END IF;
 IF p_id IS NULL OR p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 2 AND 120 OR p_description IS NULL OR length(p_description)>1200 OR p_active IS NULL THEN RAISE EXCEPTION 'SALON_INVALID_ANNOUNCEMENT'; END IF;
 IF p_service IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.menu_products WHERE id=p_service AND cafe_id=p_cafe AND deleted_at IS NULL) THEN RAISE EXCEPTION 'SALON_SERVICE_UNAVAILABLE'; END IF;
 INSERT INTO public.salon_announcements(id,cafe_id,title,description,service_id,active) VALUES(p_id,p_cafe,btrim(p_title),btrim(p_description),p_service,p_active)
 ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,service_id=excluded.service_id,active=excluded.active,updated_at=clock_timestamp() WHERE salon_announcements.cafe_id=p_cafe RETURNING * INTO a;
 IF NOT FOUND THEN RAISE EXCEPTION 'SALON_ANNOUNCEMENT_MISSING'; END IF;RETURN a;
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA salon_private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA salon_private TO service_role;
DO $$ DECLARE proc regprocedure; BEGIN
 FOR proc IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN
 ('salon_create_booking','salon_owner_booking_command','salon_customer_booking_response','salon_submit_review','salon_claim_messages','salon_authorize_dispatch','salon_finish_message','salon_save_announcement') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',proc);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',proc);
 END LOOP;
END $$;
COMMIT;
