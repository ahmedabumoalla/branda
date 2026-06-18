-- Barndaksa product media gallery/video storage access
-- Version 051

BEGIN;

UPDATE storage.buckets
SET
  file_size_limit = GREATEST(COALESCE(file_size_limit, 0), 41943040),
  allowed_mime_types = ARRAY[
    'image/webp',
    'image/jpeg',
    'image/png',
    'image/avif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
WHERE id = 'menu-products';

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
      RETURN v_seg2 IS NOT NULL AND (
        EXISTS (
          SELECT 1
          FROM public.cafe_settings cs
          WHERE cs.cafe_id = v_cafe_id
            AND cs.logo_storage_path = p_storage_path
        )
        OR EXISTS (
          SELECT 1
          FROM public.cafe_custom_identity ci
          WHERE ci.cafe_id = v_cafe_id
            AND ci.logo_storage_path = p_storage_path
        )
      );

    WHEN 'cafe-backgrounds' THEN
      RETURN v_seg2 IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.cafe_custom_identity ci
        WHERE ci.cafe_id = v_cafe_id
          AND ci.background_storage_path = p_storage_path
      );

    WHEN 'menu-products' THEN
      v_entity_id := public.storage_path_entity_id(p_storage_path);
      RETURN v_entity_id IS NOT NULL
        AND v_seg3 IS NOT NULL
        AND public.storage_menu_product_is_public(v_cafe_id, v_entity_id)
        AND EXISTS (
          SELECT 1
          FROM public.menu_products mp
          WHERE mp.id = v_entity_id
            AND mp.cafe_id = v_cafe_id
            AND (
              mp.image_storage_path = p_storage_path
              OR mp.video_storage_path = p_storage_path
              OR p_storage_path = ANY(COALESCE(mp.gallery_storage_paths, ARRAY[]::text[]))
              OR EXISTS (
                SELECT 1
                FROM jsonb_array_elements(COALESCE(mp.image_gallery, '[]'::jsonb)) AS image_item
                WHERE image_item->>'imageAssetId' = p_storage_path
                   OR image_item->>'assetId' = p_storage_path
              )
              OR EXISTS (
                SELECT 1
                FROM jsonb_array_elements(COALESCE(mp.media, '[]'::jsonb)) AS media_item
                WHERE media_item->>'assetId' = p_storage_path
                   OR media_item->>'imageAssetId' = p_storage_path
                   OR media_item->>'videoAssetId' = p_storage_path
              )
            )
        );

    WHEN 'menu-categories' THEN
      v_entity_id := public.storage_path_entity_id(p_storage_path);
      RETURN v_entity_id IS NOT NULL
        AND v_seg3 IS NOT NULL
        AND public.storage_menu_category_is_public(v_cafe_id, v_entity_id)
        AND EXISTS (
          SELECT 1
          FROM public.menu_categories mc
          WHERE mc.id = v_entity_id
            AND mc.cafe_id = v_cafe_id
            AND mc.image_storage_path = p_storage_path
        );

    WHEN 'offer-banners' THEN
      v_entity_id := public.storage_path_entity_id(p_storage_path);
      RETURN v_entity_id IS NOT NULL
        AND v_seg3 IS NOT NULL
        AND public.storage_offer_is_public(v_cafe_id, v_entity_id)
        AND EXISTS (
          SELECT 1
          FROM public.offers o
          WHERE o.id = v_entity_id
            AND o.cafe_id = v_cafe_id
            AND o.banner_storage_path = p_storage_path
        );

    WHEN 'marketing-assets' THEN
      v_entity_id := public.storage_path_entity_id(p_storage_path);
      RETURN v_entity_id IS NOT NULL
        AND v_seg3 IS NOT NULL
        AND (
          (
            public.storage_marketing_is_public(v_cafe_id, v_entity_id)
            AND EXISTS (
              SELECT 1
              FROM public.marketing_campaigns mc
              WHERE mc.id = v_entity_id
                AND mc.cafe_id = v_cafe_id
                AND mc.image_storage_path = p_storage_path
            )
          )
          OR EXISTS (
            SELECT 1
            FROM public.reservation_services rs
            WHERE rs.id = v_entity_id
              AND rs.cafe_id = v_cafe_id
              AND rs.active = true
              AND (
                rs.image_storage_path = p_storage_path
                OR rs.video_storage_path = p_storage_path
              )
          )
        );

    ELSE
      RETURN false;
  END CASE;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'barndaksa_product_media_gallery_video_ready' AS status;
