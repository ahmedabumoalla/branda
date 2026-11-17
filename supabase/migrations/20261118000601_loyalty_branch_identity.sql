BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

ALTER TABLE public.branches
 ADD COLUMN loyalty_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN loyalty_logo text,
 ADD COLUMN loyalty_banner text,
 ADD COLUMN loyalty_background text NOT NULL DEFAULT '#171717',
 ADD COLUMN loyalty_foreground text NOT NULL DEFAULT '#ffffff',
 ADD COLUMN loyalty_accent text NOT NULL DEFAULT '#ff7900',
 ADD CONSTRAINT branch_loyalty_colors CHECK (loyalty_background ~ '^#[0-9a-fA-F]{6}$' AND loyalty_foreground ~ '^#[0-9a-fA-F]{6}$' AND loyalty_accent ~ '^#[0-9a-fA-F]{6}$'),
 ADD CONSTRAINT branch_loyalty_logo CHECK (loyalty_logo IS NULL OR (length(loyalty_logo)<=500000 AND loyalty_logo ~ '^data:image/webp;base64,[A-Za-z0-9+/=]+$')),
 ADD CONSTRAINT branch_loyalty_banner CHECK (loyalty_banner IS NULL OR (length(loyalty_banner)<=500000 AND loyalty_banner ~ '^data:image/webp;base64,[A-Za-z0-9+/=]+$')),
 ADD CONSTRAINT branch_loyalty_requires_logo CHECK (NOT loyalty_enabled OR loyalty_logo IS NOT NULL);
ALTER TABLE public.cafe_cashiers ADD COLUMN loyalty_branch_id uuid,
 ADD CONSTRAINT cashier_loyalty_branch_same_cafe FOREIGN KEY(loyalty_branch_id,cafe_id) REFERENCES public.branches(id,cafe_id);
CREATE INDEX cashier_loyalty_branch ON public.cafe_cashiers(loyalty_branch_id,cafe_id) WHERE loyalty_branch_id IS NOT NULL;

CREATE SCHEMA IF NOT EXISTS loyalty_branch_private;
REVOKE ALL ON SCHEMA loyalty_branch_private FROM PUBLIC,anon,authenticated;

CREATE FUNCTION loyalty_branch_private.touch_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.loyalty_logo IS NOT NULL OR OLD.loyalty_logo IS NOT NULL OR NEW.loyalty_enabled OR OLD.loyalty_enabled THEN
  NEW.updated_at:=greatest(clock_timestamp(),OLD.updated_at+interval '1 microsecond');
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION loyalty_branch_private.touch_revision() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zz_loyalty_branch_revision BEFORE UPDATE ON public.branches
 FOR EACH ROW EXECUTE FUNCTION loyalty_branch_private.touch_revision();

CREATE FUNCTION loyalty_branch_private.assert_owner(p_cafe uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active')
  OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND (slug='brand-1c2b6f7e028f' OR platform_access_private.service_enabled(id,'branches')) AND deleted_at IS NULL AND status IN('active','published'))
  OR NOT public.brand_account_not_cancelled(p_cafe) OR NOT platform_access_private.service_enabled(p_cafe,'loyalty')
  OR NOT (public.is_cafe_owner(p_cafe) OR public.is_platform_admin())
 THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
END $$;
REVOKE ALL ON FUNCTION loyalty_branch_private.assert_owner(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.save_loyalty_branch(p_cafe uuid,p_input jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.branches; branch_id uuid:=(p_input->>'id')::uuid; expected timestamptz:=(p_input->>'expectedUpdatedAt')::timestamptz;
 n text:=btrim(p_input->>'name'); latitude numeric:=(p_input->>'latitude')::numeric; longitude numeric:=(p_input->>'longitude')::numeric;
BEGIN
 PERFORM loyalty_branch_private.assert_owner(p_cafe);
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR branch_id IS NULL OR n IS NULL OR length(n) NOT BETWEEN 1 AND 120
  OR length(coalesce(p_input->>'address',''))>300 OR length(coalesce(p_input->>'nearbyMessage',''))>240
  OR jsonb_typeof(p_input->'active') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_input->'enabled') IS DISTINCT FROM 'boolean'
  OR NOT(p_input ? 'latitude' AND p_input ? 'longitude') OR (latitude IS NULL)<>(longitude IS NULL)
  OR latitude NOT BETWEEN -90 AND 90 OR longitude NOT BETWEEN -180 AND 180
 THEN RAISE EXCEPTION 'Invalid branch fields' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('loyalty-branch:'||branch_id::text,0));
 SELECT * INTO b FROM public.branches WHERE id=branch_id FOR UPDATE;
 IF FOUND THEN
  IF b.cafe_id<>p_cafe OR b.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
  IF expected IS NULL OR b.updated_at IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Branch changed' USING ERRCODE='40001';END IF;
 ELSE
  IF expected IS NOT NULL THEN RAISE EXCEPTION 'Branch changed' USING ERRCODE='40001';END IF;
  INSERT INTO public.branches(id,cafe_id,name,active) VALUES(branch_id,p_cafe,n,false);
 END IF;
 UPDATE public.branches SET name=n,address=p_input->>'address',lat=latitude,lng=longitude,
  welcome_message=p_input->>'nearbyMessage',active=(p_input->>'active')::boolean,loyalty_enabled=(p_input->>'enabled')::boolean,
  loyalty_logo=p_input->>'logo',loyalty_banner=p_input->>'banner',loyalty_background=p_input->>'background',
  loyalty_foreground=p_input->>'foreground',loyalty_accent=p_input->>'accent',wallet_location_managed=latitude IS NOT NULL,updated_at=clock_timestamp()
 WHERE id=branch_id AND cafe_id=p_cafe;
 RETURN branch_id;
END $$;
REVOKE ALL ON FUNCTION public.save_loyalty_branch(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_loyalty_branch(uuid,jsonb) TO authenticated;

CREATE FUNCTION public.assign_loyalty_cashier_branch(p_cafe uuid,p_cashier uuid,p_branch uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM loyalty_branch_private.assert_owner(p_cafe);
 IF p_branch IS NOT NULL THEN
  PERFORM 1 FROM public.branches WHERE id=p_branch AND cafe_id=p_cafe AND active AND loyalty_enabled AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Branch unavailable';END IF;
 END IF;
 UPDATE public.cafe_cashiers SET loyalty_branch_id=p_branch WHERE id=p_cashier AND cafe_id=p_cafe;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cashier unavailable';END IF;
END $$;
REVOKE ALL ON FUNCTION public.assign_loyalty_cashier_branch(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assign_loyalty_cashier_branch(uuid,uuid,uuid) TO authenticated;
COMMIT;
