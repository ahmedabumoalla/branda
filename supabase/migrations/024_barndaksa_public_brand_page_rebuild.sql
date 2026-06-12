-- Barndaksa public brand page rebuild
-- Version 024

BEGIN;

ALTER TABLE public.menu_products
  ADD COLUMN IF NOT EXISTS image_gallery jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.menu_products
SET image_gallery =
  CASE
    WHEN image_storage_path IS NOT NULL THEN
      jsonb_build_array(jsonb_build_object('imageAssetId', image_storage_path, 'imageDataUrl', image_url))
    WHEN image_url IS NOT NULL THEN
      jsonb_build_array(jsonb_build_object('imageDataUrl', image_url))
    ELSE '[]'::jsonb
  END
WHERE image_gallery = '[]'::jsonb
  AND (image_storage_path IS NOT NULL OR image_url IS NOT NULL);

COMMIT;

SELECT 'barndaksa_public_brand_page_rebuild_ready' AS status;
