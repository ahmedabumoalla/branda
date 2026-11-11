-- Single-request public loyalty composition for the trusted application server.
-- No membership, contact, session, balance or subscription rows are returned.
CREATE FUNCTION public.get_loyalty_brand_read_snapshot(p_slug text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.cafes%ROWTYPE; result jsonb;
BEGIN
 IF p_slug IS NULL OR length(btrim(p_slug)) NOT BETWEEN 1 AND 80 THEN RETURN NULL; END IF;
 SELECT * INTO c FROM public.cafes WHERE slug=lower(btrim(p_slug)) AND deleted_at IS NULL LIMIT 1;
 IF NOT FOUND OR c.status::text NOT IN('active','published')
   OR NOT platform_access_private.service_enabled(c.id,'loyalty') THEN RETURN NULL; END IF;
 -- Existing RLS allows a signed-in owner/admin to inspect a private brand.
 -- Tell the server to use that session-bound path; expose no private payload here.
 IF (NOT coalesce(c.is_public,false) OR c.status::text<>'active') AND c.business_category IS DISTINCT FROM 'hair_salons' THEN
  RETURN jsonb_build_object('requiresSessionVisibility',true);
 END IF;
 SELECT jsonb_build_object(
  'cafe',jsonb_build_object('id',c.id,'slug',c.slug,'name',c.name,'name_en',c.name_en,'business_category',c.business_category),
  'settings',CASE WHEN c.is_public AND c.status::text='active' THEN jsonb_build_object('logo_url',s.logo_url,'logo_storage_path',s.logo_storage_path) ELSE NULL END,
  'appearance',jsonb_build_object('palette',(SELECT jsonb_object_agg(key,value) FROM jsonb_each(CASE WHEN jsonb_typeof(i.palette)='object' THEN i.palette ELSE '{}'::jsonb END) WHERE key IN('primary','secondary','text','accent')),'logo_storage_path',i.logo_storage_path,'logo_url',i.logo_url),
  'program',CASE WHEN p.cafe_id IS NULL THEN NULL ELSE jsonb_build_object(
   'enabled',p.enabled,'card_title',p.card_title,'card_subtitle',p.card_subtitle,'purchases_required',p.purchases_required,
   'reward_product_id',p.reward_product_id,'menu_products',CASE WHEN m.id IS NULL THEN NULL ELSE jsonb_build_object('name',m.name) END,
   'reward_name',p.reward_name,'stamp_label',p.stamp_label,'terms',p.terms,'card_design',p.card_design,
   'apple_wallet_enabled',p.apple_wallet_enabled,'google_wallet_enabled',p.google_wallet_enabled) END
 ) INTO result FROM (VALUES(1)) AS singleton(n)
 LEFT JOIN public.cafe_settings s ON s.cafe_id=c.id
 LEFT JOIN public.cafe_custom_identity i ON i.cafe_id=c.id
 LEFT JOIN public.cafe_loyalty_programs p ON p.cafe_id=c.id
 LEFT JOIN public.menu_products m ON m.id=p.reward_product_id AND m.cafe_id=c.id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_loyalty_brand_read_snapshot(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_loyalty_brand_read_snapshot(text) TO service_role;
