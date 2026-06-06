-- Branda Platform — Storage buckets & RLS policies
-- Version: 002
-- Run after 001_branda_production_schema.sql

-- ─── Path helpers (SECURITY INVOKER — pure parsing, no RLS bypass) ─────────────
CREATE OR REPLACE FUNCTION public.storage_path_segment(object_name text, segment int)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT split_part(object_name, '/', segment);
$$;

CREATE OR REPLACE FUNCTION public.storage_path_cafe_id(object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(public.storage_path_segment(object_name, 1), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.storage_path_user_id(object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(public.storage_path_segment(object_name, 1), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.storage_path_entity_id(object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(public.storage_path_segment(object_name, 2), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.storage_cafe_is_public(p_cafe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cafes c
    WHERE c.id = p_cafe_id
      AND c.is_public = true
      AND c.status = 'active'
      AND c.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.storage_menu_product_is_public(p_cafe_id uuid, p_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.storage_cafe_is_public(p_cafe_id)
    AND EXISTS (
      SELECT 1 FROM public.menu_products mp
      WHERE mp.id = p_product_id
        AND mp.cafe_id = p_cafe_id
        AND mp.available = true
        AND mp.available_for_pickup = true
        AND mp.deleted_at IS NULL
    );
$$;

CREATE OR REPLACE FUNCTION public.storage_menu_category_is_public(p_cafe_id uuid, p_category_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.storage_cafe_is_public(p_cafe_id)
    AND EXISTS (
      SELECT 1 FROM public.menu_categories mc
      WHERE mc.id = p_category_id
        AND mc.cafe_id = p_cafe_id
        AND mc.visible = true
        AND mc.deleted_at IS NULL
    );
$$;

CREATE OR REPLACE FUNCTION public.storage_offer_is_public(p_cafe_id uuid, p_offer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.storage_cafe_is_public(p_cafe_id)
    AND EXISTS (
      SELECT 1 FROM public.offers o
      WHERE o.id = p_offer_id
        AND o.cafe_id = p_cafe_id
        AND o.visible_in_cafe = true
        AND o.deleted_at IS NULL
        AND NOT o.is_archived
        AND (o.start_date IS NULL OR o.start_date <= CURRENT_DATE)
        AND (o.end_date IS NULL OR o.end_date >= CURRENT_DATE)
    );
$$;

CREATE OR REPLACE FUNCTION public.storage_marketing_is_public(p_cafe_id uuid, p_campaign_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.storage_cafe_is_public(p_cafe_id)
    AND EXISTS (
      SELECT 1 FROM public.marketing_campaigns mc
      WHERE mc.id = p_campaign_id
        AND mc.cafe_id = p_cafe_id
        AND mc.status = 'active'
        AND mc.deleted_at IS NULL
    );
$$;

CREATE OR REPLACE FUNCTION public.storage_submission_cafe_id(object_name text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT es.cafe_id
  FROM public.experience_submissions es
  WHERE es.id = public.storage_path_entity_id(object_name)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.storage_can_write_cafe_asset(p_cafe_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_platform_admin()
    OR public.is_cafe_owner(p_cafe_id)
    OR public.has_cafe_permission(p_cafe_id, p_permission);
$$;

REVOKE ALL ON FUNCTION public.storage_cafe_is_public(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_menu_product_is_public(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_menu_category_is_public(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_offer_is_public(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_marketing_is_public(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_submission_cafe_id(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_can_write_cafe_asset(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.storage_cafe_is_public(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_menu_product_is_public(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_menu_category_is_public(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_offer_is_public(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_marketing_is_public(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_submission_cafe_id(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_can_write_cafe_asset(uuid, text) TO authenticated, service_role;

-- ─── Safe storage object path (allows file extensions; blocks traversal) ───────
CREATE OR REPLACE FUNCTION public.storage_object_path_is_safe(p_path text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_path IS NOT NULL
    AND btrim(p_path) <> ''
    AND p_path NOT LIKE '/%'
    AND strpos(p_path, chr(92)) = 0
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(string_to_array(p_path, '/')) AS seg
      WHERE seg IS NULL OR seg = '' OR seg = '..' OR seg = '.'
    );
$$;

CREATE OR REPLACE FUNCTION public.storage_path_has_allowed_image_ext(p_path text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(p_path, '^.*\.([^.]+)$', '\1')) IN ('webp', 'jpg', 'jpeg', 'png');
$$;

CREATE OR REPLACE FUNCTION public.storage_staff_can_read_cafe_asset(p_cafe_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_platform_admin()
    OR public.is_cafe_owner(p_cafe_id)
    OR public.has_cafe_permission(p_cafe_id, p_permission);
$$;

REVOKE ALL ON FUNCTION public.storage_staff_can_read_cafe_asset(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storage_staff_can_read_cafe_asset(uuid, text) TO authenticated, service_role;

-- ─── Public object access (DB path binding — used by storage.objects SELECT) ─
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
  IF p_bucket IN ('customer-avatars', 'experience-submissions') THEN
    RETURN false;
  END IF;

  IF p_storage_path IS NULL OR NOT public.storage_object_path_is_safe(p_storage_path) THEN
    RETURN false;
  END IF;

  v_cafe_id := public.storage_path_cafe_id(p_storage_path);
  IF v_cafe_id IS NULL OR NOT public.storage_cafe_is_public(v_cafe_id) THEN
    RETURN false;
  END IF;

  v_seg2 := public.storage_path_segment(p_storage_path, 2);
  v_seg3 := public.storage_path_segment(p_storage_path, 3);

  CASE p_bucket
    WHEN 'cafe-logos' THEN
      IF v_seg2 IS NULL OR v_seg2 = '' THEN
        RETURN false;
      END IF;
      RETURN EXISTS (
        SELECT 1 FROM public.cafe_settings cs
        WHERE cs.cafe_id = v_cafe_id
          AND cs.logo_storage_path = p_storage_path
      ) OR EXISTS (
        SELECT 1 FROM public.cafe_custom_identity ci
        WHERE ci.cafe_id = v_cafe_id
          AND ci.logo_storage_path = p_storage_path
      );

    WHEN 'cafe-backgrounds' THEN
      IF v_seg2 IS NULL OR v_seg2 = '' THEN
        RETURN false;
      END IF;
      RETURN EXISTS (
        SELECT 1 FROM public.cafe_custom_identity ci
        WHERE ci.cafe_id = v_cafe_id
          AND ci.background_storage_path = p_storage_path
      );

    WHEN 'menu-products' THEN
      v_entity_id := public.storage_path_entity_id(p_storage_path);
      IF v_entity_id IS NULL OR v_seg3 IS NULL OR v_seg3 = '' THEN
        RETURN false;
      END IF;
      IF NOT public.storage_menu_product_is_public(v_cafe_id, v_entity_id) THEN
        RETURN false;
      END IF;
      RETURN EXISTS (
        SELECT 1 FROM public.menu_products mp
        WHERE mp.id = v_entity_id
          AND mp.cafe_id = v_cafe_id
          AND mp.image_storage_path = p_storage_path
      );

    WHEN 'menu-categories' THEN
      v_entity_id := public.storage_path_entity_id(p_storage_path);
      IF v_entity_id IS NULL OR v_seg3 IS NULL OR v_seg3 = '' THEN
        RETURN false;
      END IF;
      IF NOT public.storage_menu_category_is_public(v_cafe_id, v_entity_id) THEN
        RETURN false;
      END IF;
      RETURN EXISTS (
        SELECT 1 FROM public.menu_categories mc
        WHERE mc.id = v_entity_id
          AND mc.cafe_id = v_cafe_id
          AND mc.image_storage_path = p_storage_path
      );

    WHEN 'offer-banners' THEN
      v_entity_id := public.storage_path_entity_id(p_storage_path);
      IF v_entity_id IS NULL OR v_seg3 IS NULL OR v_seg3 = '' THEN
        RETURN false;
      END IF;
      IF NOT public.storage_offer_is_public(v_cafe_id, v_entity_id) THEN
        RETURN false;
      END IF;
      RETURN EXISTS (
        SELECT 1 FROM public.offers o
        WHERE o.id = v_entity_id
          AND o.cafe_id = v_cafe_id
          AND o.banner_storage_path = p_storage_path
      );

    WHEN 'marketing-assets' THEN
      v_entity_id := public.storage_path_entity_id(p_storage_path);
      IF v_entity_id IS NULL OR v_seg3 IS NULL OR v_seg3 = '' THEN
        RETURN false;
      END IF;
      IF NOT public.storage_marketing_is_public(v_cafe_id, v_entity_id) THEN
        RETURN false;
      END IF;
      RETURN EXISTS (
        SELECT 1 FROM public.marketing_campaigns mc
        WHERE mc.id = v_entity_id
          AND mc.cafe_id = v_cafe_id
          AND mc.image_storage_path = p_storage_path
      );

    ELSE
      RETURN false;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.storage_can_access_experience_object(p_object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_submission_id uuid;
  v_cafe_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  v_submission_id := public.storage_path_entity_id(p_object_name);
  IF v_submission_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.storage_path_user_id(p_object_name) = auth.uid() THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.experience_submissions es
      JOIN public.customer_profiles cp ON cp.id = es.customer_id
      WHERE es.id = v_submission_id
        AND cp.user_id = auth.uid()
        AND es.media_storage_path = p_object_name
    );
  END IF;

  IF public.is_platform_admin() THEN
    RETURN EXISTS (
      SELECT 1 FROM public.experience_submissions es
      WHERE es.id = v_submission_id
        AND es.media_storage_path = p_object_name
    );
  END IF;

  SELECT es.cafe_id INTO v_cafe_id
  FROM public.experience_submissions es
  WHERE es.id = v_submission_id
    AND es.media_storage_path = p_object_name;

  IF v_cafe_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.is_cafe_owner(v_cafe_id)
    OR public.has_cafe_permission(v_cafe_id, 'marketing');
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_public_storage_object(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_can_access_experience_object(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_public_storage_object(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_can_access_experience_object(text) TO authenticated, service_role;

-- ─── Buckets (private — no public write) ─────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('cafe-logos', 'cafe-logos', false, 5242880, ARRAY['image/webp', 'image/jpeg', 'image/png']),
  ('cafe-backgrounds', 'cafe-backgrounds', false, 8388608, ARRAY['image/webp', 'image/jpeg', 'image/png']),
  ('menu-products', 'menu-products', false, 5242880, ARRAY['image/webp', 'image/jpeg', 'image/png']),
  ('menu-categories', 'menu-categories', false, 5242880, ARRAY['image/webp', 'image/jpeg', 'image/png']),
  ('offer-banners', 'offer-banners', false, 8388608, ARRAY['image/webp', 'image/jpeg', 'image/png']),
  ('customer-avatars', 'customer-avatars', false, 2097152, ARRAY['image/webp', 'image/jpeg', 'image/png']),
  ('marketing-assets', 'marketing-assets', false, 8388608, ARRAY['image/webp', 'image/jpeg', 'image/png']),
  ('experience-submissions', 'experience-submissions', false, 52428800, ARRAY['image/webp', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── cafe-logos: {cafe_id}/{file_name} ───────────────────────────────────────
CREATE POLICY storage_cafe_logos_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'cafe-logos'
    AND public.can_access_public_storage_object(bucket_id, name)
  );
CREATE POLICY storage_cafe_logos_select_staff ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'cafe-logos'
    AND public.storage_staff_can_read_cafe_asset(public.storage_path_cafe_id(name), 'settings')
  );
CREATE POLICY storage_cafe_logos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cafe-logos'
    AND public.storage_object_path_is_safe(name)
    AND array_length(string_to_array(name, '/'), 1) = 2
    AND storage_path_segment(name, 2) <> ''
    AND EXISTS (
      SELECT 1 FROM public.cafes c
      WHERE c.id = public.storage_path_cafe_id(name)
        AND c.deleted_at IS NULL
    )
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'settings')
  );
CREATE POLICY storage_cafe_logos_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'cafe-logos'
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'settings')
  );
CREATE POLICY storage_cafe_logos_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'cafe-logos'
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'settings')
  );

-- ─── cafe-backgrounds: {cafe_id}/{file_name} ─────────────────────────────────
CREATE POLICY storage_cafe_backgrounds_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'cafe-backgrounds'
    AND public.can_access_public_storage_object(bucket_id, name)
  );
CREATE POLICY storage_cafe_backgrounds_select_staff ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'cafe-backgrounds'
    AND public.storage_staff_can_read_cafe_asset(public.storage_path_cafe_id(name), 'settings')
  );
CREATE POLICY storage_cafe_backgrounds_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cafe-backgrounds'
    AND public.storage_object_path_is_safe(name)
    AND array_length(string_to_array(name, '/'), 1) = 2
    AND storage_path_segment(name, 2) <> ''
    AND EXISTS (
      SELECT 1 FROM public.cafes c
      WHERE c.id = public.storage_path_cafe_id(name)
        AND c.deleted_at IS NULL
    )
    AND (is_cafe_owner(storage_path_cafe_id(name)) OR is_platform_admin())
  );
CREATE POLICY storage_cafe_backgrounds_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'cafe-backgrounds'
    AND (is_cafe_owner(storage_path_cafe_id(name)) OR is_platform_admin())
  );
CREATE POLICY storage_cafe_backgrounds_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'cafe-backgrounds'
    AND (is_cafe_owner(storage_path_cafe_id(name)) OR is_platform_admin())
  );

-- ─── menu-products: {cafe_id}/{product_id}/{file_name} ───────────────────────
CREATE POLICY storage_menu_products_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'menu-products'
    AND public.can_access_public_storage_object(bucket_id, name)
  );
CREATE POLICY storage_menu_products_select_staff ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'menu-products'
    AND public.storage_staff_can_read_cafe_asset(public.storage_path_cafe_id(name), 'menu')
  );
CREATE POLICY storage_menu_products_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'menu-products'
    AND public.storage_object_path_is_safe(name)
    AND array_length(string_to_array(name, '/'), 1) = 3
    AND storage_path_segment(name, 3) <> ''
    AND EXISTS (
      SELECT 1 FROM public.menu_products mp
      WHERE mp.id = public.storage_path_entity_id(name)
        AND mp.cafe_id = public.storage_path_cafe_id(name)
        AND mp.deleted_at IS NULL
    )
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'menu')
  );
CREATE POLICY storage_menu_products_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'menu-products'
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'menu')
  );
CREATE POLICY storage_menu_products_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'menu-products'
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'menu')
  );

-- ─── menu-categories: {cafe_id}/{category_id}/{file_name} ────────────────────
CREATE POLICY storage_menu_categories_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'menu-categories'
    AND public.can_access_public_storage_object(bucket_id, name)
  );
CREATE POLICY storage_menu_categories_select_staff ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'menu-categories'
    AND public.storage_staff_can_read_cafe_asset(public.storage_path_cafe_id(name), 'menu')
  );
CREATE POLICY storage_menu_categories_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'menu-categories'
    AND public.storage_object_path_is_safe(name)
    AND array_length(string_to_array(name, '/'), 1) = 3
    AND storage_path_segment(name, 3) <> ''
    AND EXISTS (
      SELECT 1 FROM public.menu_categories mc
      WHERE mc.id = public.storage_path_entity_id(name)
        AND mc.cafe_id = public.storage_path_cafe_id(name)
        AND mc.deleted_at IS NULL
    )
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'menu')
  );
CREATE POLICY storage_menu_categories_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'menu-categories'
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'menu')
  );
CREATE POLICY storage_menu_categories_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'menu-categories'
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'menu')
  );

-- ─── offer-banners: {cafe_id}/{offer_id}/{file_name} ─────────────────────────
CREATE POLICY storage_offer_banners_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'offer-banners'
    AND public.can_access_public_storage_object(bucket_id, name)
  );
CREATE POLICY storage_offer_banners_select_staff ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'offer-banners'
    AND public.storage_staff_can_read_cafe_asset(public.storage_path_cafe_id(name), 'offers')
  );
CREATE POLICY storage_offer_banners_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'offer-banners'
    AND public.storage_object_path_is_safe(name)
    AND array_length(string_to_array(name, '/'), 1) = 3
    AND storage_path_segment(name, 3) <> ''
    AND EXISTS (
      SELECT 1 FROM public.offers o
      WHERE o.id = public.storage_path_entity_id(name)
        AND o.cafe_id = public.storage_path_cafe_id(name)
        AND o.deleted_at IS NULL
    )
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'offers')
  );
CREATE POLICY storage_offer_banners_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'offer-banners'
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'offers')
  );
CREATE POLICY storage_offer_banners_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'offer-banners'
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'offers')
  );

-- ─── marketing-assets: {cafe_id}/{campaign_id}/{file_name} ───────────────────
CREATE POLICY storage_marketing_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'marketing-assets'
    AND public.can_access_public_storage_object(bucket_id, name)
  );
CREATE POLICY storage_marketing_select_staff ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'marketing-assets'
    AND public.storage_staff_can_read_cafe_asset(public.storage_path_cafe_id(name), 'marketing')
  );
CREATE POLICY storage_marketing_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'marketing-assets'
    AND public.storage_object_path_is_safe(name)
    AND array_length(string_to_array(name, '/'), 1) = 3
    AND storage_path_segment(name, 3) <> ''
    AND EXISTS (
      SELECT 1 FROM public.marketing_campaigns mc
      WHERE mc.id = public.storage_path_entity_id(name)
        AND mc.cafe_id = public.storage_path_cafe_id(name)
        AND mc.deleted_at IS NULL
    )
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'marketing')
  );
CREATE POLICY storage_marketing_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'marketing-assets'
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'marketing')
  );
CREATE POLICY storage_marketing_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'marketing-assets'
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'marketing')
  );

-- ─── customer-avatars: {user_id}/{file_name} — owner + platform_admin only ───
CREATE POLICY storage_customer_avatars_select_own ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'customer-avatars'
    AND public.storage_path_user_id(name) = auth.uid()
  );
CREATE POLICY storage_customer_avatars_select_admin ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'customer-avatars'
    AND public.is_platform_admin()
  );
CREATE POLICY storage_customer_avatars_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'customer-avatars'
    AND public.storage_object_path_is_safe(name)
    AND public.storage_path_has_allowed_image_ext(name)
    AND array_length(string_to_array(name, '/'), 1) = 2
    AND public.storage_path_user_id(name) = auth.uid()
    AND public.storage_path_segment(name, 2) <> ''
  );
CREATE POLICY storage_customer_avatars_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'customer-avatars'
    AND (
      public.storage_path_user_id(name) = auth.uid()
      OR public.is_platform_admin()
    )
  );

-- ─── experience-submissions: {user_id}/{submission_id}/{file_name} — private ─
CREATE POLICY storage_experience_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'experience-submissions'
    AND public.storage_can_access_experience_object(name)
  );
CREATE POLICY storage_experience_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'experience-submissions'
    AND public.storage_object_path_is_safe(name)
    AND public.storage_path_has_allowed_image_ext(name)
    AND array_length(string_to_array(name, '/'), 1) = 3
    AND public.storage_path_user_id(name) = auth.uid()
    AND public.storage_path_segment(name, 3) <> ''
    AND EXISTS (
      SELECT 1 FROM public.experience_submissions es
      WHERE es.id = public.storage_path_entity_id(name)
        AND es.customer_id = public.get_customer_profile_id(es.cafe_id)
        AND es.status = 'pending'
    )
  );
CREATE POLICY storage_experience_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'experience-submissions'
    AND (
      (
        public.storage_path_user_id(name) = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.experience_submissions es
          JOIN public.customer_profiles cp ON cp.id = es.customer_id
          WHERE es.id = public.storage_path_entity_id(name)
            AND cp.user_id = auth.uid()
            AND es.status = 'pending'
        )
      )
      OR public.is_platform_admin()
      OR (
        public.storage_can_access_experience_object(name)
        AND (
          public.is_cafe_owner(public.storage_submission_cafe_id(name))
          OR public.has_cafe_permission(public.storage_submission_cafe_id(name), 'marketing')
        )
      )
    )
  );
