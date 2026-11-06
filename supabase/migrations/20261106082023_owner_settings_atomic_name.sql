BEGIN;

-- A narrow authenticated RPC changes only the display name and the existing
-- editable settings together. Cafe identity, ownership and slug stay immutable.
CREATE FUNCTION public.save_owner_cafe_settings(p_cafe_id uuid,p_settings jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid(); v_name text; v_cafe public.cafes; v_settings public.cafe_settings;
BEGIN
 IF v_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_actor AND status='active')
  OR NOT coalesce(public.has_cafe_permission(p_cafe_id,'settings'),false) THEN
  RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
 END IF;
 IF p_settings IS NULL OR jsonb_typeof(p_settings)<>'object' OR jsonb_typeof(p_settings->'cafe_name') IS DISTINCT FROM 'string'
  OR EXISTS(SELECT 1 FROM jsonb_each(p_settings) e WHERE e.key<>ALL(ARRAY[
   'cafe_name','owner_name','owner_email','owner_phone','tax_number','commercial_register','maroof_certificate',
   'instagram','whatsapp','description','custom_domain','domain_status','purchased_domain','purchased_domain_status',
   'logo_url','logo_storage_path','theme_id']) OR jsonb_typeof(e.value) NOT IN ('string','null')) THEN
  RAISE EXCEPTION 'Invalid settings' USING ERRCODE='22023';
 END IF;
 v_name:=btrim(p_settings->>'cafe_name');
 IF v_name='' OR char_length(v_name)>160 OR v_name~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Invalid brand name' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_cafe FROM public.cafes WHERE id=p_cafe_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Brand unavailable' USING ERRCODE='P0002'; END IF;
 UPDATE public.cafes SET name=v_name WHERE id=p_cafe_id AND deleted_at IS NULL RETURNING * INTO v_cafe;
 IF NOT FOUND THEN RAISE EXCEPTION 'Brand update not confirmed' USING ERRCODE='P0002'; END IF;
 INSERT INTO public.cafe_settings(cafe_id) VALUES(p_cafe_id) ON CONFLICT(cafe_id) DO NOTHING;
 UPDATE public.cafe_settings s SET
  owner_name=CASE WHEN p_settings?'owner_name' THEN p_settings->>'owner_name' ELSE s.owner_name END,
  owner_email=CASE WHEN p_settings?'owner_email' THEN p_settings->>'owner_email' ELSE s.owner_email END,
  owner_phone=CASE WHEN p_settings?'owner_phone' THEN p_settings->>'owner_phone' ELSE s.owner_phone END,
  tax_number=CASE WHEN p_settings?'tax_number' THEN p_settings->>'tax_number' ELSE s.tax_number END,
  commercial_register=CASE WHEN p_settings?'commercial_register' THEN p_settings->>'commercial_register' ELSE s.commercial_register END,
  maroof_certificate=CASE WHEN p_settings?'maroof_certificate' THEN p_settings->>'maroof_certificate' ELSE s.maroof_certificate END,
  instagram=CASE WHEN p_settings?'instagram' THEN p_settings->>'instagram' ELSE s.instagram END,
  whatsapp=CASE WHEN p_settings?'whatsapp' THEN p_settings->>'whatsapp' ELSE s.whatsapp END,
  description=CASE WHEN p_settings?'description' THEN p_settings->>'description' ELSE s.description END,
  custom_domain=CASE WHEN p_settings?'custom_domain' THEN p_settings->>'custom_domain' ELSE s.custom_domain END,
  domain_status=CASE WHEN p_settings?'domain_status' THEN p_settings->>'domain_status' ELSE s.domain_status END,
  purchased_domain=CASE WHEN p_settings?'purchased_domain' THEN p_settings->>'purchased_domain' ELSE s.purchased_domain END,
  purchased_domain_status=CASE WHEN p_settings?'purchased_domain_status' THEN p_settings->>'purchased_domain_status' ELSE s.purchased_domain_status END,
  logo_url=CASE WHEN p_settings?'logo_url' THEN p_settings->>'logo_url' ELSE s.logo_url END,
  logo_storage_path=CASE WHEN p_settings?'logo_storage_path' THEN p_settings->>'logo_storage_path' ELSE s.logo_storage_path END,
  theme_id=CASE WHEN p_settings?'theme_id' THEN p_settings->>'theme_id' ELSE s.theme_id END
 WHERE s.cafe_id=p_cafe_id RETURNING * INTO v_settings;
 IF NOT FOUND THEN RAISE EXCEPTION 'Settings update not confirmed' USING ERRCODE='P0002'; END IF;
 RETURN jsonb_build_object('cafe',jsonb_build_object('id',v_cafe.id,'slug',v_cafe.slug,'name',v_cafe.name,'business_category',v_cafe.business_category),'settings',to_jsonb(v_settings));
END $$;
REVOKE ALL ON FUNCTION public.save_owner_cafe_settings(uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.save_owner_cafe_settings(uuid,jsonb) TO authenticated;
COMMENT ON FUNCTION public.save_owner_cafe_settings(uuid,jsonb) IS 'Atomically saves the authorized brand display name and allowlisted owner settings; no ownership, slug, category or program changes';
NOTIFY pgrst,'reload schema';
COMMIT;
