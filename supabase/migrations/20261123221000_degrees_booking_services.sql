BEGIN;

-- Salon appointments at 100 Degrees are part of the salon menu. The general pager
-- and finance product still use their own package and permission gates.
CREATE OR REPLACE FUNCTION salon_private.enabled(p_cafe uuid,p_feature text DEFAULT 'menu')
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.cafes WHERE id=p_cafe AND business_category='hair_salons' AND status='active' AND deleted_at IS NULL)
 AND platform_access_private.service_enabled(p_cafe,CASE WHEN p_cafe='59606e0a-ac48-4d3a-b92d-4e53246468be' AND p_feature='pager' THEN 'menu' ELSE p_feature END)
$$;

UPDATE public.cafe_cashiers SET can_use_pager=true,pager_station=coalesce(nullif(btrim(pager_station),''),'الحجوزات')
WHERE id='9d827704-d6cf-4d54-b2b6-2bdbfe65b989' AND cafe_id='59606e0a-ac48-4d3a-b92d-4e53246468be'
 AND active AND owner_user_id IS NULL AND NOT can_use_pager;

CREATE FUNCTION public.degrees_create_booking(p_id uuid,p_cafe uuid,p_name text,p_phone text,p_services uuid[],p_start timestamptz,
 p_portal_hash text,p_client_key text,p_loyalty_hash text)
RETURNS public.salon_bookings LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
 b public.salon_bookings;
 items jsonb;
 snapshot jsonb;
 prior boolean;
BEGIN
 IF p_cafe IS DISTINCT FROM '59606e0a-ac48-4d3a-b92d-4e53246468be'::uuid OR p_services IS NULL
 OR cardinality(p_services)>32 OR cardinality(p_services)<>(SELECT count(DISTINCT id) FROM unnest(p_services) id)
 THEN RAISE EXCEPTION 'SALON_SERVICE_UNAVAILABLE'; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended('salon-request:'||p_id::text,0));
 SELECT EXISTS(SELECT FROM public.salon_bookings WHERE id=p_id) INTO prior;
 -- Retain the existing identity, rate limits, owner notification and loyalty enrollment in the same transaction.
 b:=public.salon_create_booking_with_loyalty(p_id,p_cafe,p_name,p_phone,p_services[1],p_start,p_portal_hash,p_client_key,p_loyalty_hash);
 IF prior THEN
   IF coalesce(b.service_snapshot->'serviceIds',CASE WHEN b.service_id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(b.service_id) END)
      IS DISTINCT FROM to_jsonb(p_services) THEN RAISE EXCEPTION 'SALON_REQUEST_CHANGED'; END IF;
   RETURN b;
 END IF;
 IF cardinality(p_services)=0 THEN RETURN b; END IF;

 SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'price',price,'durationMinutes',minutes) ORDER BY ord),
        jsonb_build_object('name',string_agg(name,' + ' ORDER BY ord),
          'price',CASE WHEN count(price)=count(*) THEN sum(price) END,
          'durationMinutes',CASE WHEN count(minutes)=count(*) THEN sum(minutes) END)
 INTO items,snapshot
 FROM (
   SELECT m.id,m.name,CASE WHEN m.price=0 AND m.commerce_details @> '{"quoteOnly":true}' THEN NULL ELSE m.price END AS price,
          m.preparation_time_minutes AS minutes,s.ord
   FROM unnest(p_services) WITH ORDINALITY s(id,ord)
   JOIN public.menu_products m ON m.id=s.id AND m.cafe_id=p_cafe AND m.catalog_kind='service' AND m.available AND m.deleted_at IS NULL
   WHERE m.category_id IS NULL OR EXISTS(SELECT FROM public.menu_categories c WHERE c.id=m.category_id AND c.cafe_id=p_cafe AND c.visible AND c.deleted_at IS NULL)
 ) available;
 IF jsonb_array_length(items) IS DISTINCT FROM cardinality(p_services) THEN RAISE EXCEPTION 'SALON_SERVICE_UNAVAILABLE'; END IF;
 UPDATE public.salon_bookings SET service_snapshot=snapshot||jsonb_build_object('items',items,'serviceIds',p_services)
 WHERE id=b.id RETURNING * INTO b;
 RETURN b;
END $$;

CREATE FUNCTION public.degrees_set_booking_price(p_cafe uuid,p_id uuid,p_actor uuid,p_actor_kind text,p_version integer,p_price_revision integer,p_price numeric)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE b public.salon_bookings;
BEGIN
 IF p_cafe IS DISTINCT FROM '59606e0a-ac48-4d3a-b92d-4e53246468be'::uuid THEN RAISE EXCEPTION 'SALON_UNAVAILABLE'; END IF;
 PERFORM salon_private.require_actor(p_cafe,p_actor,p_actor_kind,p_actor_kind='staff');
 IF p_price IS NULL OR NOT(p_price BETWEEN 0 AND 9999999.99) OR round(p_price,2)<>p_price THEN RAISE EXCEPTION 'SALON_INVALID_PRICE'; END IF;
 SELECT * INTO b FROM public.salon_bookings WHERE id=p_id AND cafe_id=p_cafe FOR UPDATE;
 IF NOT FOUND OR b.status NOT IN ('pending','confirmed','proposed','in_service') OR b.version IS DISTINCT FROM p_version
   OR coalesce((b.service_snapshot->>'priceRevision')::int,0) IS DISTINCT FROM p_price_revision THEN RAISE EXCEPTION 'SALON_BOOKING_CHANGED'; END IF;
 -- Editing a price must not invalidate an in-flight booking notification or the customer's proposed appointment.
 UPDATE public.salon_bookings SET service_snapshot=service_snapshot||jsonb_build_object('agreedPrice',p_price,'priceRevision',p_price_revision+1),
 updated_at=clock_timestamp() WHERE id=b.id;
 INSERT INTO public.salon_booking_events(booking_id,cafe_id,action,actor_kind,actor_id,details)
 VALUES(b.id,p_cafe,'price_changed',p_actor_kind,p_actor,jsonb_build_object('previousPrice',coalesce(b.service_snapshot->>'agreedPrice',b.service_snapshot->>'price')::numeric,'price',p_price));
END $$;

REVOKE ALL ON FUNCTION public.degrees_create_booking(uuid,uuid,text,text,uuid[],timestamptz,text,text,text),
 public.degrees_set_booking_price(uuid,uuid,uuid,text,integer,integer,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.degrees_create_booking(uuid,uuid,text,text,uuid[],timestamptz,text,text,text),
 public.degrees_set_booking_price(uuid,uuid,uuid,text,integer,integer,numeric) TO service_role;

-- Extend the existing transition only for the active pager cashier of 100 Degrees.
DO $migration$
DECLARE original text:=pg_get_functiondef('public.salon_owner_booking_command(uuid,uuid,uuid,text,text,integer,timestamptz)'::regprocedure);
 staff_check text:='(p_action=''propose'' AND p_actor_kind=''staff'')';
 owner_check text:='b.status=''pending'' AND p_actor_kind=''owner''';
BEGIN
 IF strpos(original,staff_check)=0 OR strpos(original,owner_check)=0 THEN RAISE EXCEPTION 'Review salon command changes'; END IF;
 EXECUTE replace(replace(original,staff_check,
  '('||staff_check||' OR (p_cafe=''59606e0a-ac48-4d3a-b92d-4e53246468be'' AND p_actor_kind=''staff'' AND p_action IN (''confirm'',''reject'')))'),
  owner_check,'b.status=''pending'' AND (p_actor_kind=''owner'' OR (p_actor_kind=''staff'' AND p_cafe=''59606e0a-ac48-4d3a-b92d-4e53246468be''))');
END $migration$;
COMMIT;
