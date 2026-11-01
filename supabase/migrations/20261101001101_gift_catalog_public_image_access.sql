-- Gift catalog photos stay visible when sold out. Preserve every existing cafe rule.
-- The unchanged outer object check still requires the exact tenant/product path
-- to be referenced by that product; buckets remain private.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $guard$ BEGIN
 IF md5(replace(pg_get_functiondef('public.storage_menu_product_is_public(uuid,uuid)'::regprocedure),chr(13),''))<>'1f378e7af3f9c82be266437c33811ef9' OR md5(replace(pg_get_functiondef('public.can_access_public_storage_object(text,text)'::regprocedure),chr(13),''))<>'2ec7f4ceb9f15322d6b751d59e50b099' THEN RAISE EXCEPTION 'Public storage authorization changed; inspect before migration';END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.storage_menu_product_is_public(p_cafe_id uuid,p_product_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
 SELECT public.storage_cafe_is_public(p_cafe_id) AND EXISTS(
  SELECT 1 FROM public.menu_products mp
  WHERE mp.id=p_product_id AND mp.cafe_id=p_cafe_id AND mp.deleted_at IS NULL
   AND CASE WHEN EXISTS(SELECT 1 FROM public.cafes c WHERE c.id=p_cafe_id AND c.business_category='gifts_flowers') THEN
    platform_access_private.service_enabled(p_cafe_id,'menu')
    AND (mp.category_id IS NULL OR EXISTS(SELECT 1 FROM public.menu_categories mc WHERE mc.id=mp.category_id AND mc.cafe_id=p_cafe_id AND mc.visible AND mc.deleted_at IS NULL))
   ELSE mp.available=true AND mp.available_for_pickup=true END
 );
$function$;
COMMIT;
