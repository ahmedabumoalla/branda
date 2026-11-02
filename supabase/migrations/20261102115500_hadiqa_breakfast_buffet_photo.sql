BEGIN;
SET LOCAL lock_timeout='5s';
DO $buffet$ BEGIN
IF NOT EXISTS(SELECT 1 FROM public.menu_products WHERE id='ec56d0ea-0527-43be-81ec-77a55b589be4' AND cafe_id='26d964ab-7435-45e3-b721-536746dfcf12' AND price=38 AND ((image_storage_path='26d964ab-7435-45e3-b721-536746dfcf12/ec56d0ea-0527-43be-81ec-77a55b589be4/hadiqa-refresh-bbd93c48394ee100.webp' AND description IS NOT DISTINCT FROM 'صورة توضيحية') OR (image_storage_path='26d964ab-7435-45e3-b721-536746dfcf12/ec56d0ea-0527-43be-81ec-77a55b589be4/hadiqa-buffet-0e82a15c181d005a.webp' AND description='بوفيه الفطور المفتوح في أجواء مطعم الحديقة'))) THEN RAISE EXCEPTION 'Preserve owner changes'; END IF;
UPDATE public.menu_products SET image_storage_path='26d964ab-7435-45e3-b721-536746dfcf12/ec56d0ea-0527-43be-81ec-77a55b589be4/hadiqa-buffet-0e82a15c181d005a.webp',description='بوفيه الفطور المفتوح في أجواء مطعم الحديقة' WHERE id='ec56d0ea-0527-43be-81ec-77a55b589be4' AND cafe_id='26d964ab-7435-45e3-b721-536746dfcf12' AND image_storage_path='26d964ab-7435-45e3-b721-536746dfcf12/ec56d0ea-0527-43be-81ec-77a55b589be4/hadiqa-refresh-bbd93c48394ee100.webp';
END $buffet$;
COMMIT;
