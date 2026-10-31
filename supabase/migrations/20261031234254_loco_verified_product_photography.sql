-- Original Kinder photography identified on the supplied named dessert board
-- Cornflakes image extracted faithfully from the supplied promotional document
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TEMP TABLE loco_photo_before AS SELECT md5(jsonb_agg(to_jsonb(p) ORDER BY id)::text) AS hash FROM public.menu_products p WHERE id NOT IN ('9dd3ed84-11fe-41e8-807e-0b70d4997c03','c381c5f7-b656-4c55-8671-0d589cce779b');
DO $photo$ DECLARE changed integer; BEGIN
UPDATE public.menu_products SET image_storage_path='321fd305-1883-48df-ab69-829cf7d1bc48/loco-20261101/photo-24-04e7cca9e33e.webp',updated_at=now() WHERE id='9dd3ed84-11fe-41e8-807e-0b70d4997c03' AND cafe_id='321fd305-1883-48df-ab69-829cf7d1bc48' AND name='دونات كندر' AND image_storage_path IS NOT DISTINCT FROM NULL;
GET DIAGNOSTICS changed=ROW_COUNT; IF changed<>1 THEN RAISE EXCEPTION 'LOCO source photo guard failed';END IF;
UPDATE public.menu_products SET image_storage_path='321fd305-1883-48df-ab69-829cf7d1bc48/loco-20261101/cornflakes-0f15ff9e9d99.webp',updated_at=now() WHERE id='c381c5f7-b656-4c55-8671-0d589cce779b' AND cafe_id='321fd305-1883-48df-ab69-829cf7d1bc48' AND name='دونات كورن فليكس بايتس' AND image_storage_path IS NOT DISTINCT FROM '321fd305-1883-48df-ab69-829cf7d1bc48/loco-20261101/drive-55-e17b36461d17.webp';
GET DIAGNOSTICS changed=ROW_COUNT; IF changed<>1 THEN RAISE EXCEPTION 'LOCO source photo guard failed';END IF;
END $photo$;
DO $verify$ DECLARE after_hash text;BEGIN SELECT md5(jsonb_agg(to_jsonb(p) ORDER BY id)::text) AS hash FROM public.menu_products p WHERE id NOT IN ('9dd3ed84-11fe-41e8-807e-0b70d4997c03','c381c5f7-b656-4c55-8671-0d589cce779b') INTO after_hash;IF after_hash IS DISTINCT FROM (SELECT hash FROM loco_photo_before) THEN RAISE EXCEPTION 'Unrelated product changed';END IF;END $verify$;
COMMIT;
