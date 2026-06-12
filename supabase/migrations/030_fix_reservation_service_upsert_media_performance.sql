-- Branda reservation service save fix + media access/performance hardening
-- Version: 030
-- Run after 029
BEGIN;

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/webp','image/jpeg','image/png','image/avif',
  'video/mp4','video/webm','video/quicktime'
]
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
  v_existing_cafe_id uuid;
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
    SELECT rs.cafe_id INTO v_existing_cafe_id
    FROM public.reservation_services rs
    WHERE rs.id = p_service_id;

    IF v_existing_cafe_id IS NOT NULL AND v_existing_cafe_id <> v_cafe_id THEN
      RAISE EXCEPTION 'Forbidden reservation service';
    END IF;
  END IF;

  IF p_service_id IS NOT NULL AND v_existing_cafe_id = v_cafe_id THEN
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
    WHERE id = p_service_id
      AND cafe_id = v_cafe_id
    RETURNING id INTO v_id;
  ELSE
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
    )
    ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        price = EXCLUDED.price,
        is_free = EXCLUDED.is_free,
        max_guests = EXCLUDED.max_guests,
        available_slots = EXCLUDED.available_slots,
        amenities = EXCLUDED.amenities,
        included_products = EXCLUDED.included_products,
        duration_value = EXCLUDED.duration_value,
        duration_unit = EXCLUDED.duration_unit,
        image_storage_path = COALESCE(EXCLUDED.image_storage_path, public.reservation_services.image_storage_path),
        video_storage_path = COALESCE(EXCLUDED.video_storage_path, public.reservation_services.video_storage_path),
        active = EXCLUDED.active,
        sort_order = EXCLUDED.sort_order,
        updated_at = now()
    WHERE public.reservation_services.cafe_id = v_cafe_id
    RETURNING id INTO v_id;
  END IF;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Reservation service save failed';
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_reservation_service_v2(uuid, text, text, numeric, boolean, integer, text[], text[], text[], numeric, text, text, text, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_reservation_service_v2(uuid, text, text, numeric, boolean, integer, text[], text[], text[], numeric, text, text, text, boolean, integer) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_reservation_services_cafe_active_sort
  ON public.reservation_services (cafe_id, active, sort_order);

CREATE INDEX IF NOT EXISTS idx_reservations_cafe_status_created
  ON public.reservations (cafe_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_cafe_seen_created
  ON public.notifications (cafe_id, read, created_at DESC);

COMMIT;
