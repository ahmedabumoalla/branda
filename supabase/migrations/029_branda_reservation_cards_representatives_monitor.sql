-- Branda reservation cards + representative admin controls
-- Version: 029
-- Run after 028
BEGIN;

ALTER TABLE public.reservation_services
  ADD COLUMN IF NOT EXISTS amenities text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS included_products text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS duration_value numeric(8,2),
  ADD COLUMN IF NOT EXISTS duration_unit text CHECK (duration_unit IN ('minute','hour','day'));

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS reservation_service_name text;

ALTER TABLE public.platform_representatives
  ADD COLUMN IF NOT EXISTS portal_password_hint text;

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/webp','image/jpeg','image/png','image/avif','video/mp4','video/webm','video/quicktime']
WHERE id = 'marketing-assets';

CREATE OR REPLACE FUNCTION public.upsert_reservation_service_v2(
  p_service_id uuid,
  p_name text,
  p_description text,
  p_price numeric,
  p_is_free boolean,
  p_max_guests integer,
  p_available_slots text[],
  p_amenities text[],
  p_included_products text[],
  p_duration_value numeric,
  p_duration_unit text,
  p_image_storage_path text,
  p_video_storage_path text,
  p_active boolean,
  p_sort_order integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cafe_id uuid;
  v_id uuid;
BEGIN
  SELECT c.id INTO v_cafe_id
  FROM public.cafes c
  WHERE c.owner_user_id = auth.uid()
    AND c.deleted_at IS NULL
  LIMIT 1;

  IF v_cafe_id IS NULL THEN
    SELECT cm.cafe_id INTO v_cafe_id
    FROM public.cafe_members cm
    WHERE cm.user_id = auth.uid()
    LIMIT 1;
  END IF;

  IF v_cafe_id IS NULL OR NOT (public.has_cafe_permission(v_cafe_id, 'reservations') OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_duration_unit IS NOT NULL AND p_duration_unit NOT IN ('minute','hour','day') THEN
    RAISE EXCEPTION 'Invalid duration unit';
  END IF;

  IF p_service_id IS NOT NULL THEN
    UPDATE public.reservation_services
    SET name = btrim(p_name),
        description = NULLIF(btrim(COALESCE(p_description, '')), ''),
        price = p_price,
        is_free = COALESCE(p_is_free, false),
        max_guests = p_max_guests,
        available_slots = COALESCE(p_available_slots, '{}'),
        amenities = COALESCE(p_amenities, '{}'),
        included_products = COALESCE(p_included_products, '{}'),
        duration_value = p_duration_value,
        duration_unit = p_duration_unit,
        image_storage_path = COALESCE(NULLIF(btrim(COALESCE(p_image_storage_path, '')), ''), image_storage_path),
        video_storage_path = COALESCE(NULLIF(btrim(COALESCE(p_video_storage_path, '')), ''), video_storage_path),
        active = COALESCE(p_active, true),
        sort_order = COALESCE(p_sort_order, 0),
        updated_at = now()
    WHERE id = p_service_id AND cafe_id = v_cafe_id
    RETURNING id INTO v_id;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.reservation_services (
      id, cafe_id, name, description, price, is_free, max_guests, available_slots,
      amenities, included_products, duration_value, duration_unit,
      image_storage_path, video_storage_path, active, sort_order
    ) VALUES (
      COALESCE(p_service_id, gen_random_uuid()), v_cafe_id, btrim(p_name), NULLIF(btrim(COALESCE(p_description, '')), ''), p_price,
      COALESCE(p_is_free, false), p_max_guests, COALESCE(p_available_slots, '{}'),
      COALESCE(p_amenities, '{}'), COALESCE(p_included_products, '{}'), p_duration_value, p_duration_unit,
      NULLIF(btrim(COALESCE(p_image_storage_path, '')), ''),
      NULLIF(btrim(COALESCE(p_video_storage_path, '')), ''),
      COALESCE(p_active, true), COALESCE(p_sort_order, 0)
    ) RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_reservation_service_v2(uuid, text, text, numeric, boolean, integer, text[], text[], text[], numeric, text, text, text, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_reservation_service_v2(uuid, text, text, numeric, boolean, integer, text[], text[], text[], numeric, text, text, text, boolean, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_customer_reservation_v2(
  p_cafe_id uuid,
  p_reservation_service_id uuid,
  p_event_type text,
  p_guests int,
  p_reservation_date date,
  p_reservation_time time,
  p_duration_minutes int DEFAULT NULL,
  p_branch_name text DEFAULT NULL,
  p_space_type text DEFAULT NULL,
  p_event_title text DEFAULT NULL,
  p_needs_decoration boolean DEFAULT false,
  p_needs_catering boolean DEFAULT false,
  p_budget_estimate numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_id uuid;
  v_profile public.customer_profiles%ROWTYPE;
  v_service public.reservation_services%ROWTYPE;
  v_id uuid;
  c_max_text constant int := 200;
  c_max_notes constant int := 500;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  PERFORM public.assert_cafe_open_to_customers(p_cafe_id);
  v_customer_id := public.get_customer_profile_id(p_cafe_id);
  IF v_customer_id IS NULL THEN RAISE EXCEPTION 'Customer profile not found'; END IF;
  SELECT * INTO v_profile FROM public.customer_profiles WHERE id = v_customer_id;

  IF p_reservation_service_id IS NOT NULL THEN
    SELECT * INTO v_service
    FROM public.reservation_services
    WHERE id = p_reservation_service_id AND cafe_id = p_cafe_id AND active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Reservation service not found'; END IF;
    IF v_service.max_guests IS NOT NULL AND p_guests > v_service.max_guests THEN RAISE EXCEPTION 'Guests exceed capacity'; END IF;
  END IF;

  IF p_guests IS NULL OR p_guests <= 0 OR p_guests > 500 THEN RAISE EXCEPTION 'Invalid guests count'; END IF;
  IF p_reservation_date < current_date THEN RAISE EXCEPTION 'Reservation date cannot be in the past'; END IF;
  IF p_duration_minutes IS NOT NULL AND (p_duration_minutes < 15 OR p_duration_minutes > 1440 * 14) THEN RAISE EXCEPTION 'Invalid duration'; END IF;
  IF char_length(COALESCE(p_event_type, '')) > c_max_text THEN RAISE EXCEPTION 'Event type too long'; END IF;
  IF p_notes IS NOT NULL AND char_length(p_notes) > c_max_notes THEN RAISE EXCEPTION 'Notes too long'; END IF;

  INSERT INTO public.reservations (
    cafe_id, customer_id, customer_name, phone, event_type, guests,
    reservation_date, reservation_time, duration_minutes, branch_name,
    space_type, event_title, needs_decoration, needs_catering,
    budget_estimate, notes, status, reservation_service_id, reservation_service_name, reservation_price
  ) VALUES (
    p_cafe_id, v_customer_id, v_profile.full_name, v_profile.phone,
    COALESCE(NULLIF(btrim(p_event_type), ''), v_service.name), p_guests,
    p_reservation_date, p_reservation_time, p_duration_minutes, NULLIF(btrim(p_branch_name), ''),
    NULLIF(btrim(p_space_type), ''), NULLIF(btrim(p_event_title), ''), p_needs_decoration, p_needs_catering,
    p_budget_estimate, NULLIF(btrim(p_notes), ''), 'pending', p_reservation_service_id,
    CASE WHEN p_reservation_service_id IS NULL THEN NULL ELSE v_service.name END,
    CASE WHEN p_reservation_service_id IS NULL THEN NULL ELSE v_service.price END
  ) RETURNING id INTO v_id;

  PERFORM public.internal_notify_cafe(
    p_cafe_id,
    'حجز جديد',
    'حجز من ' || v_profile.full_name,
    'new_reservation',
    jsonb_build_object('reservation_id', v_id)
  );
  PERFORM public.internal_notify_customer(
    p_cafe_id,
    v_customer_id,
    'تم إرسال طلب الحجز',
    'طلبك بانتظار رد العلامة التجارية.',
    'new_reservation',
    jsonb_build_object('reservation_id', v_id)
  );
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_customer_reservation_v2(uuid, uuid, text, int, date, time, int, text, text, text, boolean, boolean, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_customer_reservation_v2(uuid, uuid, text, int, date, time, int, text, text, text, boolean, boolean, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_access_public_storage_object(
  p_bucket text,
  p_storage_path text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cafe_id uuid;
  v_entity_id uuid;
  v_seg2 text;
  v_seg3 text;
BEGIN
  IF p_bucket IN ('customer-avatars', 'experience-submissions') THEN RETURN false; END IF;
  IF p_storage_path IS NULL OR NOT public.storage_object_path_is_safe(p_storage_path) THEN RETURN false; END IF;
  v_cafe_id := public.storage_path_cafe_id(p_storage_path);
  IF v_cafe_id IS NULL OR NOT public.storage_cafe_is_public(v_cafe_id) THEN RETURN false; END IF;
  v_seg2 := public.storage_path_segment(p_storage_path, 2);
  v_seg3 := public.storage_path_segment(p_storage_path, 3);

  CASE p_bucket
    WHEN 'cafe-logos' THEN
      RETURN v_seg2 IS NOT NULL AND EXISTS (SELECT 1 FROM public.cafe_settings cs WHERE cs.cafe_id = v_cafe_id AND cs.logo_storage_path = p_storage_path) OR EXISTS (SELECT 1 FROM public.cafe_custom_identity ci WHERE ci.cafe_id = v_cafe_id AND ci.logo_storage_path = p_storage_path);
    WHEN 'cafe-backgrounds' THEN
      RETURN v_seg2 IS NOT NULL AND EXISTS (SELECT 1 FROM public.cafe_custom_identity ci WHERE ci.cafe_id = v_cafe_id AND ci.background_storage_path = p_storage_path);
    WHEN 'menu-products' THEN
      v_entity_id := public.storage_path_entity_id(p_storage_path);
      RETURN v_entity_id IS NOT NULL AND v_seg3 IS NOT NULL AND public.storage_menu_product_is_public(v_cafe_id, v_entity_id) AND EXISTS (SELECT 1 FROM public.menu_products mp WHERE mp.id = v_entity_id AND mp.cafe_id = v_cafe_id AND mp.image_storage_path = p_storage_path);
    WHEN 'menu-categories' THEN
      v_entity_id := public.storage_path_entity_id(p_storage_path);
      RETURN v_entity_id IS NOT NULL AND v_seg3 IS NOT NULL AND public.storage_menu_category_is_public(v_cafe_id, v_entity_id) AND EXISTS (SELECT 1 FROM public.menu_categories mc WHERE mc.id = v_entity_id AND mc.cafe_id = v_cafe_id AND mc.image_storage_path = p_storage_path);
    WHEN 'offer-banners' THEN
      v_entity_id := public.storage_path_entity_id(p_storage_path);
      RETURN v_entity_id IS NOT NULL AND v_seg3 IS NOT NULL AND public.storage_offer_is_public(v_cafe_id, v_entity_id) AND EXISTS (SELECT 1 FROM public.offers o WHERE o.id = v_entity_id AND o.cafe_id = v_cafe_id AND o.banner_storage_path = p_storage_path);
    WHEN 'marketing-assets' THEN
      v_entity_id := public.storage_path_entity_id(p_storage_path);
      RETURN v_entity_id IS NOT NULL AND v_seg3 IS NOT NULL AND (
        (public.storage_marketing_is_public(v_cafe_id, v_entity_id) AND EXISTS (SELECT 1 FROM public.marketing_campaigns mc WHERE mc.id = v_entity_id AND mc.cafe_id = v_cafe_id AND mc.image_storage_path = p_storage_path))
        OR EXISTS (SELECT 1 FROM public.reservation_services rs WHERE rs.id = v_entity_id AND rs.cafe_id = v_cafe_id AND rs.active = true AND (rs.image_storage_path = p_storage_path OR rs.video_storage_path = p_storage_path))
      );
    ELSE
      RETURN false;
  END CASE;
END;
$$;

COMMIT;
