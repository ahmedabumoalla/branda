BEGIN;
-- Catalog reads do not require write privileges. The private notifier can only
-- project an existing booking and is callable solely by the trusted server role.
CREATE OR REPLACE FUNCTION salon_private.queue_message(p_booking public.salon_bookings,p_kind text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE recipient text; persisted public.salon_bookings;
BEGIN
 SELECT * INTO persisted FROM public.salon_bookings WHERE id=p_booking.id AND cafe_id=p_booking.cafe_id AND version=p_booking.version;
 IF NOT FOUND THEN RAISE EXCEPTION 'SALON_BOOKING_CHANGED'; END IF;
 p_booking:=persisted;
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

CREATE OR REPLACE FUNCTION public.salon_create_booking(p_id uuid,p_cafe uuid,p_name text,p_phone text,p_service uuid,p_start timestamptz,p_portal_hash text,p_client_key text)
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
   AND (m.category_id IS NULL OR EXISTS(SELECT 1 FROM public.menu_categories c WHERE c.id=m.category_id AND c.cafe_id=p_cafe AND c.visible AND c.deleted_at IS NULL));
  IF NOT FOUND THEN RAISE EXCEPTION 'SALON_SERVICE_UNAVAILABLE'; END IF;
  snapshot:=jsonb_build_object('name',item.name,'price',item.price,'durationMinutes',item.preparation_time_minutes);
 ELSE snapshot:=jsonb_build_object('name','موعد في الصالون','price',null,'durationMinutes',null); END IF;
 INSERT INTO public.salon_bookings(id,cafe_id,customer_name,phone,service_id,service_snapshot,requested_start,portal_hash,client_key)
 VALUES(p_id,p_cafe,btrim(p_name),p_phone,p_service,snapshot,p_start,p_portal_hash,p_client_key) RETURNING * INTO b;
 INSERT INTO public.salon_booking_events(booking_id,cafe_id,action,actor_kind,details) VALUES(b.id,b.cafe_id,'requested','customer',jsonb_build_object('requestedStart',p_start));
 PERFORM salon_private.queue_message(b,'owner_new');RETURN b;
END $$;

REVOKE ALL ON FUNCTION salon_private.queue_message(public.salon_bookings,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION salon_private.queue_message(public.salon_bookings,text) TO service_role;
COMMIT;
