BEGIN;
CREATE TABLE public.representative_visits (
  id uuid PRIMARY KEY,
  brand_name text NOT NULL CHECK (length(btrim(brand_name)) BETWEEN 2 AND 150),
  representative_name text NOT NULL CHECK (length(btrim(representative_name)) BETWEEN 2 AND 120),
  manager_phone text NOT NULL DEFAULT '' CHECK (manager_phone = '' OR manager_phone ~ '^\+?[0-9]{8,15}$'),
  owner_phone text NOT NULL DEFAULT '' CHECK (owner_phone = '' OR owner_phone ~ '^\+?[0-9]{8,15}$'),
  interest text NOT NULL CHECK (interest IN ('interested','not_interested')),
  services text[] NOT NULL DEFAULT '{}' CHECK (services <@ ARRAY['menu','loyalty','accounting','other']::text[] AND cardinality(services)<=4),
  other_service text NOT NULL DEFAULT '' CHECK (length(other_service)<=500),
  latitude double precision,
  longitude double precision,
  maps_url text NOT NULL DEFAULT '' CHECK (length(maps_url)<=2048),
  photo_path text NOT NULL CHECK (photo_path LIKE id::text || '/%/brand.webp'),
  menu_photo_path text CHECK (menu_photo_path LIKE id::text || '/%/menu.webp'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 AND latitude IS NOT NULL AND longitude IS NOT NULL AND maps_url='')
    OR (latitude IS NULL AND longitude IS NULL AND maps_url LIKE 'https://%')),
  CHECK ((interest='not_interested' AND cardinality(services)=0 AND other_service='') OR (interest='interested' AND cardinality(services)>0)),
  CHECK (NOT ('other'=ANY(services)) OR length(btrim(other_service))>0)
);
CREATE INDEX representative_visits_created_idx ON public.representative_visits(created_at DESC,id);
ALTER TABLE public.representative_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.representative_visits FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.representative_visits TO authenticated;
GRANT ALL ON public.representative_visits TO service_role;
CREATE POLICY representative_visits_admin_read ON public.representative_visits FOR SELECT TO authenticated USING ((SELECT public.is_platform_admin()));

-- Backend-only intake leases and persistent rate windows; never store a raw IP address.
CREATE TABLE public.representative_visit_claims (
  id uuid PRIMARY KEY, fingerprint text NOT NULL, token uuid NOT NULL,
  lease_until timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.representative_visit_rate_windows (
  key text PRIMARY KEY, window_start timestamptz NOT NULL, attempts integer NOT NULL
);
ALTER TABLE public.representative_visit_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.representative_visit_rate_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.representative_visit_claims,public.representative_visit_rate_windows FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.representative_visit_claims,public.representative_visit_rate_windows TO service_role;

CREATE FUNCTION public.claim_representative_visit(p_id uuid,p_fingerprint text,p_ip_hash text,p_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.representative_visit_claims; saved timestamptz; k text; n integer;
BEGIN
  IF p_fingerprint !~ '^[a-f0-9]{64}$' OR p_ip_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid claim'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  SELECT * INTO c FROM public.representative_visit_claims WHERE id=p_id;
  IF FOUND THEN
    SELECT created_at INTO saved FROM public.representative_visits WHERE id=p_id;
    IF FOUND THEN
      IF c.fingerprint<>p_fingerprint THEN RETURN jsonb_build_object('status','conflict'); END IF;
      RETURN jsonb_build_object('status','saved','createdAt',saved);
    END IF;
    IF c.lease_until>now() THEN RETURN jsonb_build_object('status','busy'); END IF;
  END IF;
  -- Global and per-source ceilings also protect the unauthenticated media endpoint.
  FOREACH k IN ARRAY ARRAY['global',p_ip_hash] LOOP
    INSERT INTO public.representative_visit_rate_windows(key,window_start,attempts) VALUES(k,now(),1)
    ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN representative_visit_rate_windows.window_start<now()-interval '1 hour' THEN 1 ELSE representative_visit_rate_windows.attempts+1 END,
      window_start=CASE WHEN representative_visit_rate_windows.window_start<now()-interval '1 hour' THEN now() ELSE representative_visit_rate_windows.window_start END
    RETURNING attempts INTO n;
    IF n>(CASE WHEN k='global' THEN 600 ELSE 60 END) THEN RETURN jsonb_build_object('status','rate'); END IF;
  END LOOP;
  INSERT INTO public.representative_visit_claims(id,fingerprint,token,lease_until) VALUES(p_id,p_fingerprint,p_token,now()+interval '2 minutes')
  ON CONFLICT(id) DO UPDATE SET fingerprint=p_fingerprint,token=p_token,lease_until=now()+interval '2 minutes';
  RETURN jsonb_build_object('status','claimed');
END $$;

CREATE FUNCTION public.finish_representative_visit(p_id uuid,p_token uuid,p_data jsonb) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved timestamptz; c public.representative_visit_claims;
BEGIN
  SELECT * INTO c FROM public.representative_visit_claims WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR c.token<>p_token OR c.lease_until<now() THEN RAISE EXCEPTION 'Invalid lease'; END IF;
  INSERT INTO public.representative_visits(id,brand_name,representative_name,manager_phone,owner_phone,interest,services,other_service,latitude,longitude,maps_url,photo_path,menu_photo_path)
  VALUES(p_id,p_data->>'brandName',p_data->>'representativeName',p_data->>'managerPhone',p_data->>'ownerPhone',p_data->>'interest',
    ARRAY(SELECT jsonb_array_elements_text(p_data->'services')),p_data->>'otherService',(p_data->>'latitude')::double precision,(p_data->>'longitude')::double precision,p_data->>'mapsUrl',
    p_id::text||'/'||p_token::text||'/brand.webp',CASE WHEN (p_data->>'hasMenu')::boolean THEN p_id::text||'/'||p_token::text||'/menu.webp' END)
  ON CONFLICT(id) DO NOTHING;
  SELECT created_at INTO saved FROM public.representative_visits WHERE id=p_id;
  RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.claim_representative_visit(uuid,text,text,uuid),public.finish_representative_visit(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_representative_visit(uuid,text,text,uuid),public.finish_representative_visit(uuid,uuid,jsonb) TO service_role;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('representative-visits','representative-visits',false,2097152,ARRAY['image/webp']);
-- Restrictive policies neutralize any pre-existing broad Storage policies for this bucket.
CREATE POLICY visit_media_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated
USING(bucket_id<>'representative-visits' OR (SELECT public.is_platform_admin()));
CREATE POLICY visit_media_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(bucket_id<>'representative-visits');
CREATE POLICY visit_media_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING(bucket_id<>'representative-visits') WITH CHECK(bucket_id<>'representative-visits');
CREATE POLICY visit_media_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated USING(bucket_id<>'representative-visits');
NOTIFY pgrst,'reload schema';
COMMIT;
