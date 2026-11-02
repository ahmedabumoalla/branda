BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $photo$ BEGIN
IF NOT EXISTS(SELECT 1 FROM public.menu_products WHERE id='ec56d0ea-0527-43be-81ec-77a55b589be4' AND cafe_id='26d964ab-7435-45e3-b721-536746dfcf12' AND ((image_storage_path='26d964ab-7435-45e3-b721-536746dfcf12/ec56d0ea-0527-43be-81ec-77a55b589be4/hadiqa-20261102-f20c41d09c1313bf.webp' AND description IS NOT DISTINCT FROM '') OR (image_storage_path='26d964ab-7435-45e3-b721-536746dfcf12/ec56d0ea-0527-43be-81ec-77a55b589be4/hadiqa-refresh-bbd93c48394ee100.webp' AND description='صورة توضيحية'))) THEN RAISE EXCEPTION 'Product changed; preserve owner edits'; END IF;
UPDATE public.menu_products SET image_storage_path='26d964ab-7435-45e3-b721-536746dfcf12/ec56d0ea-0527-43be-81ec-77a55b589be4/hadiqa-refresh-bbd93c48394ee100.webp',description='صورة توضيحية' WHERE id='ec56d0ea-0527-43be-81ec-77a55b589be4' AND cafe_id='26d964ab-7435-45e3-b721-536746dfcf12' AND image_storage_path='26d964ab-7435-45e3-b721-536746dfcf12/ec56d0ea-0527-43be-81ec-77a55b589be4/hadiqa-20261102-f20c41d09c1313bf.webp';
END $photo$;
DO $photo$ BEGIN
IF NOT EXISTS(SELECT 1 FROM public.menu_products WHERE id='774e4365-190b-4a6b-8079-af3eaf1d651e' AND cafe_id='26d964ab-7435-45e3-b721-536746dfcf12' AND ((image_storage_path='26d964ab-7435-45e3-b721-536746dfcf12/774e4365-190b-4a6b-8079-af3eaf1d651e/hadiqa-20261102-631d801d0dc3257d.webp' AND description IS NOT DISTINCT FROM '') OR (image_storage_path='26d964ab-7435-45e3-b721-536746dfcf12/774e4365-190b-4a6b-8079-af3eaf1d651e/hadiqa-refresh-51287d91d0f33a0d.webp' AND description='صورة توضيحية'))) THEN RAISE EXCEPTION 'Product changed; preserve owner edits'; END IF;
UPDATE public.menu_products SET image_storage_path='26d964ab-7435-45e3-b721-536746dfcf12/774e4365-190b-4a6b-8079-af3eaf1d651e/hadiqa-refresh-51287d91d0f33a0d.webp',description='صورة توضيحية' WHERE id='774e4365-190b-4a6b-8079-af3eaf1d651e' AND cafe_id='26d964ab-7435-45e3-b721-536746dfcf12' AND image_storage_path='26d964ab-7435-45e3-b721-536746dfcf12/774e4365-190b-4a6b-8079-af3eaf1d651e/hadiqa-20261102-631d801d0dc3257d.webp';
END $photo$;
DO $photo$ BEGIN
IF NOT EXISTS(SELECT 1 FROM public.menu_products WHERE id='dc4f1343-b7f9-4d53-86e3-3e1ae12f0d20' AND cafe_id='26d964ab-7435-45e3-b721-536746dfcf12' AND ((image_storage_path='26d964ab-7435-45e3-b721-536746dfcf12/dc4f1343-b7f9-4d53-86e3-3e1ae12f0d20/hadiqa-20261102-894b88719469a2b6.webp' AND description IS NOT DISTINCT FROM '') OR (image_storage_path='26d964ab-7435-45e3-b721-536746dfcf12/dc4f1343-b7f9-4d53-86e3-3e1ae12f0d20/hadiqa-refresh-d8e6b233c3cc49e9.webp' AND description='صورة توضيحية'))) THEN RAISE EXCEPTION 'Product changed; preserve owner edits'; END IF;
UPDATE public.menu_products SET image_storage_path='26d964ab-7435-45e3-b721-536746dfcf12/dc4f1343-b7f9-4d53-86e3-3e1ae12f0d20/hadiqa-refresh-d8e6b233c3cc49e9.webp',description='صورة توضيحية' WHERE id='dc4f1343-b7f9-4d53-86e3-3e1ae12f0d20' AND cafe_id='26d964ab-7435-45e3-b721-536746dfcf12' AND image_storage_path='26d964ab-7435-45e3-b721-536746dfcf12/dc4f1343-b7f9-4d53-86e3-3e1ae12f0d20/hadiqa-20261102-894b88719469a2b6.webp';
END $photo$;
COMMIT;
