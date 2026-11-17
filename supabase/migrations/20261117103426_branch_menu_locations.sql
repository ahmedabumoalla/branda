BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Existing catalogues stay independent, and their current default remains the main menu
ALTER TABLE public.branches ADD COLUMN uses_brand_menu boolean NOT NULL DEFAULT false;
ALTER TABLE public.branches ADD COLUMN is_brand_menu_root boolean NOT NULL DEFAULT false;
ALTER TABLE public.branches ADD COLUMN wallet_location_managed boolean NOT NULL DEFAULT false;
WITH roots AS (
 SELECT DISTINCT ON(cafe_id) id FROM public.branches
 WHERE active AND deleted_at IS NULL AND menu_slug IS NOT NULL
 ORDER BY cafe_id,is_primary DESC,sort_order,id
) UPDATE public.branches b SET is_brand_menu_root=true FROM roots r WHERE b.id=r.id;
ALTER TABLE public.branches ALTER COLUMN uses_brand_menu SET DEFAULT true;
CREATE UNIQUE INDEX branches_brand_menu_root ON public.branches(cafe_id) WHERE is_brand_menu_root;
ALTER TABLE public.branches ADD CONSTRAINT branches_menu_root_independent CHECK(NOT is_brand_menu_root OR NOT uses_brand_menu);
ALTER TABLE public.branches ADD CONSTRAINT branches_location_pair CHECK(
 (lat IS NULL AND lng IS NULL) OR (lat IS NOT NULL AND lng IS NOT NULL AND lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)
) NOT VALID;

ALTER POLICY menu_branch_read_access ON public.branches USING (
 public.is_platform_admin() OR (platform_access_private.service_enabled(cafe_id,'menu')
 AND (menu_slug IS NOT NULL OR public.is_cafe_owner(cafe_id) OR public.has_cafe_permission(cafe_id,'branches')))
);

-- Deliberately bypass the legacy storefront write restriction only through this guarded RPC
CREATE FUNCTION public.manage_menu_branch(p_cafe uuid,p_operation text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); b public.branches; branch_id uuid; expected timestamptz; branch_name text; branch_address text; branch_city text; welcome text; latitude numeric; longitude numeric; enabled boolean; shared boolean;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND status='active')
  OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND status IN('active','published') AND deleted_at IS NULL)
  OR NOT public.brand_account_not_cancelled(p_cafe)
  OR NOT platform_access_private.service_enabled(p_cafe,'menu')
  OR platform_access_private.service_enabled(p_cafe,'finance')
  OR NOT (public.is_platform_admin() OR public.is_cafe_owner(p_cafe) OR public.has_cafe_permission(p_cafe,'branches'))
 THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_operation IS NULL OR p_operation NOT IN('save','menu-source') OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid branch command' USING ERRCODE='22023';END IF;
 branch_id:=(p_input->>'id')::uuid;
 expected:=(p_input->>'expectedUpdatedAt')::timestamptz;
 IF branch_id IS NULL THEN RAISE EXCEPTION 'Missing branch ID' USING ERRCODE='22023';END IF;
 -- Serialize retries of the same new UUID and menu writes/source switches
 PERFORM pg_advisory_xact_lock(hashtextextended('menu-branch:'||branch_id::text,0));
 SELECT * INTO b FROM public.branches WHERE id=branch_id FOR UPDATE;
 IF b.id IS NOT NULL AND (b.cafe_id<>p_cafe OR b.deleted_at IS NOT NULL) THEN RAISE EXCEPTION 'Branch unavailable' USING ERRCODE='42501';END IF;
 IF p_operation='menu-source' THEN
  IF b.id IS NULL OR expected IS NULL OR jsonb_typeof(p_input->'usesBrandMenu') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid menu source' USING ERRCODE='22023';END IF;
  shared:=(p_input->>'usesBrandMenu')::boolean;
  IF b.is_brand_menu_root AND shared THEN RAISE EXCEPTION 'Main menu cannot inherit itself' USING ERRCODE='22023';END IF;
  IF b.uses_brand_menu=shared AND b.menu_slug IS NOT NULL THEN RETURN to_jsonb(b);END IF;
  IF b.updated_at IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Branch changed' USING ERRCODE='40001';END IF;
  UPDATE public.branches SET uses_brand_menu=shared,menu_slug=coalesce(menu_slug,'b-'||replace(branch_id::text,'-','')),updated_at=clock_timestamp()
   WHERE id=branch_id AND cafe_id=p_cafe RETURNING * INTO b;
  RETURN to_jsonb(b);
 END IF;
 branch_name:=btrim(p_input->>'name');branch_address:=btrim(coalesce(p_input->>'address',''));branch_city:=btrim(coalesce(p_input->>'city',''));welcome:=btrim(coalesce(p_input->>'welcomeMessage',''));
 IF branch_name IS NULL OR char_length(branch_name) NOT BETWEEN 1 AND 120 OR char_length(branch_address)>300 OR char_length(branch_city)>100 OR char_length(welcome)>300
  OR jsonb_typeof(p_input->'active') IS DISTINCT FROM 'boolean'
  OR NOT (p_input ? 'lat' AND p_input ? 'lng')
  OR jsonb_typeof(p_input->'lat') NOT IN('number','null') OR jsonb_typeof(p_input->'lng') NOT IN('number','null')
 THEN RAISE EXCEPTION 'Invalid branch fields' USING ERRCODE='22023';END IF;
 latitude:=(p_input->>'lat')::numeric;longitude:=(p_input->>'lng')::numeric;enabled:=(p_input->>'active')::boolean;
 IF (latitude IS NULL)<>(longitude IS NULL) OR latitude NOT BETWEEN -90 AND 90 OR longitude NOT BETWEEN -180 AND 180 OR (b.is_brand_menu_root AND NOT enabled) THEN RAISE EXCEPTION 'Invalid branch location or status' USING ERRCODE='22023';END IF;
 IF b.id IS NULL THEN
  IF expected IS NOT NULL THEN RAISE EXCEPTION 'Branch changed' USING ERRCODE='40001';END IF;
  INSERT INTO public.branches(id,cafe_id,name,address,city,lat,lng,welcome_message,active,menu_slug,uses_brand_menu,wallet_location_managed)
   VALUES(branch_id,p_cafe,branch_name,branch_address,branch_city,latitude,longitude,welcome,enabled,'b-'||replace(branch_id::text,'-',''),true,latitude IS NOT NULL) RETURNING * INTO b;
 ELSE
  -- An exact replay is safe even if the original response was lost
  IF (b.name,coalesce(b.address,''),coalesce(b.city,''),b.lat,b.lng,coalesce(b.welcome_message,''),b.active)
   IS NOT DISTINCT FROM (branch_name,branch_address,branch_city,latitude,longitude,welcome,enabled) AND b.menu_slug IS NOT NULL THEN RETURN to_jsonb(b);END IF;
  IF expected IS NULL OR b.updated_at IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Branch changed' USING ERRCODE='40001';END IF;
  UPDATE public.branches SET name=branch_name,address=branch_address,city=branch_city,lat=latitude,lng=longitude,welcome_message=welcome,active=enabled,
   menu_slug=coalesce(menu_slug,'b-'||replace(branch_id::text,'-','')),wallet_location_managed=b.wallet_location_managed OR b.lat IS NOT NULL OR latitude IS NOT NULL,updated_at=clock_timestamp()
   WHERE id=branch_id AND cafe_id=p_cafe RETURNING * INTO b;
 END IF;
 RETURN to_jsonb(b);
END $$;
REVOKE ALL ON FUNCTION public.manage_menu_branch(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manage_menu_branch(uuid,text,jsonb) TO authenticated;

-- Lock the branch until product/category writes finish so adoption cannot race a save
CREATE FUNCTION public.guard_shared_branch_catalog() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_branch uuid;new_branch uuid; b public.branches;
BEGIN
 IF TG_OP='DELETE' AND public.is_platform_admin()
  AND current_setting('branda.deleting_cafe',true)=OLD.cafe_id::text
  AND EXISTS(SELECT 1 FROM public.brand_deletion_jobs WHERE cafe_id=OLD.cafe_id) THEN RETURN OLD;END IF;
 IF TG_OP<>'INSERT' THEN old_branch:=OLD.branch_id;END IF;
 IF TG_OP<>'DELETE' THEN new_branch:=NEW.branch_id;END IF;
 FOR b IN SELECT * FROM public.branches WHERE id IN(old_branch,new_branch) ORDER BY id FOR SHARE LOOP
  IF b.uses_brand_menu THEN RAISE EXCEPTION 'Switch to the independent branch menu before editing its catalogue' USING ERRCODE='42501';END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_shared_branch_catalog() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_shared_branch_catalog BEFORE INSERT OR UPDATE OR DELETE ON public.menu_products FOR EACH ROW EXECUTE FUNCTION public.guard_shared_branch_catalog();
CREATE TRIGGER guard_shared_branch_catalog BEFORE INSERT OR UPDATE OR DELETE ON public.menu_categories FOR EACH ROW EXECUTE FUNCTION public.guard_shared_branch_catalog();

CREATE FUNCTION public.queue_branch_wallet_locations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid; old_cafe uuid; new_cafe uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN old_cafe:=OLD.cafe_id;END IF;
 IF TG_OP<>'DELETE' THEN new_cafe:=NEW.cafe_id;END IF;
 IF TG_OP='UPDATE' AND (NEW.cafe_id,NEW.lat,NEW.lng,NEW.name,NEW.welcome_message,NEW.active,NEW.deleted_at,NEW.sort_order,NEW.is_primary,NEW.wallet_location_managed)
  IS NOT DISTINCT FROM (OLD.cafe_id,OLD.lat,OLD.lng,OLD.name,OLD.welcome_message,OLD.active,OLD.deleted_at,OLD.sort_order,OLD.is_primary,OLD.wallet_location_managed) THEN RETURN NEW;END IF;
 FOR c IN SELECT DISTINCT v FROM unnest(ARRAY[old_cafe,new_cafe]) AS ids(v) WHERE v IS NOT NULL ORDER BY v LOOP
 IF public.brand_account_not_cancelled(c) AND platform_access_private.service_enabled(c,'loyalty') THEN
  UPDATE public.wallet_passes SET updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') WHERE cafe_id=c;
  INSERT INTO public.wallet_notification_jobs(cafe_id,card_id,kind) SELECT DISTINCT c,card_id,'sync' FROM public.wallet_passes WHERE cafe_id=c ON CONFLICT DO NOTHING;
 END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.queue_branch_wallet_locations() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER branch_wallet_locations AFTER INSERT OR UPDATE OR DELETE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.queue_branch_wallet_locations();
NOTIFY pgrst,'reload schema';
COMMIT;
