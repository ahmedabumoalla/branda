BEGIN;
CREATE FUNCTION public.save_owner_cafe_settings_with_identity(p_cafe_id uuid,p_settings jsonb,p_palette jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; logo_path text:=p_settings->>'logo_storage_path';
BEGIN
 -- The original RPC remains the authority for owner/maintenance permissions.
 result:=public.save_owner_cafe_settings(p_cafe_id,p_settings);
 IF p_palette IS NOT NULL THEN
  IF jsonb_typeof(p_palette)<>'object' OR NOT(p_palette ?& ARRAY['primary','secondary','text'])
   OR EXISTS(SELECT 1 FROM jsonb_each_text(p_palette) e WHERE e.key<>ALL(ARRAY['primary','secondary','text']) OR e.value IS NULL OR e.value !~ '^#[a-fA-F0-9]{6}$')
   OR logo_path IS NULL OR split_part(logo_path,'/',1)<>p_cafe_id::text
   OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='cafe-logos' AND name=logo_path)
  THEN RAISE EXCEPTION 'Invalid logo identity' USING ERRCODE='22023';END IF;
  INSERT INTO public.cafe_custom_identity(cafe_id,logo_storage_path,logo_url,palette)
   VALUES(p_cafe_id,logo_path,NULL,p_palette||jsonb_build_object('autoLogo',true))
  ON CONFLICT(cafe_id) DO UPDATE SET logo_storage_path=excluded.logo_storage_path,logo_url=NULL,
   palette=public.cafe_custom_identity.palette||excluded.palette;
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.save_owner_cafe_settings_with_identity(uuid,jsonb,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.save_owner_cafe_settings_with_identity(uuid,jsonb,jsonb) TO authenticated;

CREATE FUNCTION loyalty_branch_private.queue_identity_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.logo_storage_path IS NOT DISTINCT FROM OLD.logo_storage_path
  AND NEW.logo_url IS NOT DISTINCT FROM OLD.logo_url AND NEW.palette IS NOT DISTINCT FROM OLD.palette THEN RETURN NEW;END IF;
 IF public.brand_account_not_cancelled(NEW.cafe_id) AND platform_access_private.service_enabled(NEW.cafe_id,'loyalty') THEN
  UPDATE public.wallet_passes SET updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') WHERE cafe_id=NEW.cafe_id;
  INSERT INTO public.wallet_notification_jobs(cafe_id,card_id,kind)
   SELECT DISTINCT NEW.cafe_id,card_id,'sync' FROM public.wallet_passes WHERE cafe_id=NEW.cafe_id ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION loyalty_branch_private.queue_identity_update() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER loyalty_identity_wallet_update AFTER INSERT OR UPDATE ON public.cafe_custom_identity
 FOR EACH ROW EXECUTE FUNCTION loyalty_branch_private.queue_identity_update();

DO $patch$
DECLARE def text:=pg_get_functiondef('public.queue_branch_wallet_locations()'::regprocedure);
BEGIN
 IF position('NEW.wallet_location_managed)' IN def)=0 OR position('OLD.wallet_location_managed)' IN def)=0 THEN RAISE EXCEPTION 'Branch location trigger changed';END IF;
 def:=replace(replace(def,'NEW.wallet_location_managed)','NEW.wallet_location_managed,NEW.loyalty_logo,NEW.loyalty_banner,NEW.loyalty_background,NEW.loyalty_foreground,NEW.loyalty_accent,NEW.loyalty_enabled)'),
  'OLD.wallet_location_managed)','OLD.wallet_location_managed,OLD.loyalty_logo,OLD.loyalty_banner,OLD.loyalty_background,OLD.loyalty_foreground,OLD.loyalty_accent,OLD.loyalty_enabled)');
 EXECUTE def;
END $patch$;
DO $snapshot$
DECLARE def text:=pg_get_functiondef('public.get_loyalty_brand_read_snapshot(text)'::regprocedure);
BEGIN
 def:=replace(def,'''primary'', ''secondary'', ''text'', ''accent''','''primary'', ''secondary'', ''text'', ''accent'', ''autoLogo''');
 def:=replace(def,'''primary'',''secondary'',''text'',''accent''','''primary'',''secondary'',''text'',''accent'',''autoLogo''');
 IF position('autoLogo' IN def)=0 THEN RAISE EXCEPTION 'Snapshot palette filter changed';END IF;
 EXECUTE def;
END $snapshot$;
NOTIFY pgrst,'reload schema';
COMMIT;
