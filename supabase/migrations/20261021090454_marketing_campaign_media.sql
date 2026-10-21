BEGIN;
CREATE TABLE public.brand_marketing_media (
 id uuid PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE RESTRICT,
 created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 file_name text NOT NULL CHECK(length(file_name) BETWEEN 1 AND 150),
 mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp','video/mp4')),
 byte_size bigint NOT NULL CHECK(byte_size>0 AND byte_size<=CASE WHEN mime_type='video/mp4' THEN 52428800 ELSE 10485760 END),
 storage_path text NOT NULL UNIQUE CHECK(storage_path LIKE cafe_id::text||'/%'),
 status text NOT NULL DEFAULT 'uploading' CHECK(status IN ('uploading','ready')),
 content_sha256 text CHECK(content_sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '2 hours',ready_at timestamptz,
 UNIQUE(id,cafe_id),CHECK(status<>'ready' OR (content_sha256 IS NOT NULL AND ready_at IS NOT NULL AND storage_path LIKE cafe_id::text||'/ready/%'))
);
CREATE INDEX marketing_media_brand_created ON public.brand_marketing_media(cafe_id,created_at DESC);
ALTER TABLE public.brand_marketing_media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brand_marketing_media FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.brand_marketing_media TO service_role;
ALTER TABLE public.brand_marketing_campaigns ADD COLUMN media_id uuid,
 ADD CONSTRAINT marketing_campaign_media_tenant FOREIGN KEY(media_id,cafe_id) REFERENCES public.brand_marketing_media(id,cafe_id) ON DELETE RESTRICT;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('marketing-media','marketing-media',false,52428800,ARRAY['image/jpeg','image/png','image/webp','video/mp4'])
 ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
-- Signed upload tokens allow one staging target; clients have no ordinary object access
CREATE POLICY marketing_media_server_only ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated
 USING(bucket_id<>'marketing-media') WITH CHECK(bucket_id<>'marketing-media');

CREATE FUNCTION public.marketing_prepare_media(p_cafe uuid,p_actor uuid,p_id uuid,p_name text,p_mime text,p_size bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result public.brand_marketing_media; extension text;
BEGIN
 IF NOT public.marketing_actor_allowed(p_cafe,p_actor) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.brand_marketing_connections WHERE cafe_id=p_cafe AND status='connected' AND verified_phone=requested_phone FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Connection required'; END IF;
 IF (SELECT count(*) FROM public.brand_marketing_media WHERE cafe_id=p_cafe AND created_at>now()-interval '1 day')>=50 THEN RAISE EXCEPTION 'Upload limit reached'; END IF;
 extension:=CASE p_mime WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' WHEN 'video/mp4' THEN 'mp4' END;
 IF extension IS NULL OR p_id IS NULL OR p_name IS NULL OR btrim(p_name)='' THEN RAISE EXCEPTION 'Invalid media'; END IF;
 INSERT INTO public.brand_marketing_media(id,cafe_id,created_by,file_name,mime_type,byte_size,storage_path)
 VALUES(p_id,p_cafe,p_actor,p_name,p_mime,p_size,p_cafe::text||'/uploads/'||p_id::text||'.'||extension) RETURNING * INTO result;
 RETURN to_jsonb(result);
END $$;
REVOKE ALL ON FUNCTION public.marketing_prepare_media(uuid,uuid,uuid,text,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_prepare_media(uuid,uuid,uuid,text,text,bigint) TO service_role;

DROP FUNCTION public.marketing_create_campaign(uuid,uuid,uuid,text,text,text,text[],timestamptz);
CREATE FUNCTION public.marketing_create_campaign(p_cafe uuid,p_actor uuid,p_key uuid,p_hash text,p_title text,p_body text,p_phones text[],p_scheduled timestamptz,p_media uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE existing public.brand_marketing_campaigns; result uuid;
BEGIN
 IF NOT public.marketing_actor_allowed(p_cafe,p_actor) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.brand_marketing_connections WHERE cafe_id=p_cafe AND status='connected' AND verified_phone=requested_phone FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Connection required' USING ERRCODE='55000'; END IF;
 SELECT * INTO existing FROM public.brand_marketing_campaigns WHERE cafe_id=p_cafe AND request_key=p_key;
 IF FOUND THEN IF existing.content_hash<>p_hash OR existing.media_id IS DISTINCT FROM p_media THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='22023'; END IF; RETURN existing.id; END IF;
 IF cardinality(p_phones) NOT BETWEEN 1 AND 1000 OR EXISTS(SELECT 1 FROM unnest(p_phones) x WHERE x IS NULL OR x!~'^9665[0-9]{8}$')
  OR p_scheduled IS NULL OR p_scheduled>now()+interval '90 days' THEN RAISE EXCEPTION 'Invalid campaign' USING ERRCODE='22023'; END IF;
 IF p_media IS NOT NULL AND (length(p_body)>992 OR NOT EXISTS(SELECT 1 FROM public.brand_marketing_media WHERE id=p_media AND cafe_id=p_cafe AND status='ready')) THEN RAISE EXCEPTION 'Media unavailable'; END IF;
 INSERT INTO public.brand_marketing_campaigns(cafe_id,created_by,request_key,content_hash,title,body,status,scheduled_at,consent_at,media_id)
 VALUES(p_cafe,p_actor,p_key,p_hash,p_title,p_body,CASE WHEN p_scheduled>now() THEN 'scheduled' ELSE 'queued' END,greatest(p_scheduled,now()),now(),p_media) RETURNING id INTO result;
 INSERT INTO public.brand_marketing_recipients(campaign_id,cafe_id,phone,status)
 SELECT result,p_cafe,x,CASE WHEN EXISTS(SELECT 1 FROM public.brand_marketing_suppressions s WHERE s.cafe_id=p_cafe AND s.phone=x) THEN 'suppressed' ELSE 'queued' END FROM (SELECT DISTINCT unnest(p_phones) x) phones;
 UPDATE public.brand_marketing_campaigns SET status='completed' WHERE id=result AND NOT EXISTS(SELECT 1 FROM public.brand_marketing_recipients WHERE campaign_id=result AND status='queued');
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.marketing_create_campaign(uuid,uuid,uuid,text,text,text,text[],timestamptz,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_create_campaign(uuid,uuid,uuid,text,text,text,text[],timestamptz,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.marketing_claim_jobs(p_limit integer DEFAULT 15) RETURNS SETOF jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.brand_marketing_connections; r public.brand_marketing_recipients; campaign public.brand_marketing_campaigns; token uuid;
BEGIN
 -- An interrupted POST is never automatically retried. Only definitely unattempted work can be reclaimed.
 FOR c IN SELECT conn.* FROM public.brand_marketing_connections conn WHERE EXISTS(
  SELECT 1 FROM public.brand_marketing_recipients stale WHERE stale.cafe_id=conn.cafe_id AND stale.status='processing' AND stale.claimed_at<now()-interval '3 minutes') FOR UPDATE SKIP LOCKED LOOP
  UPDATE public.brand_marketing_recipients SET status=CASE WHEN attempted_at IS NULL THEN 'queued' ELSE 'uncertain' END,lease_token=NULL,updated_at=now()
   WHERE cafe_id=c.cafe_id AND status='processing' AND claimed_at<now()-interval '3 minutes';
  UPDATE public.brand_marketing_connections SET dispatch_lock_until=NULL WHERE cafe_id=c.cafe_id;
  UPDATE public.brand_marketing_campaigns p SET status='completed',updated_at=now() WHERE p.cafe_id=c.cafe_id AND p.status IN ('queued','scheduled','sending')
   AND NOT EXISTS(SELECT 1 FROM public.brand_marketing_recipients remaining WHERE remaining.campaign_id=p.id AND remaining.status IN ('queued','processing'));
 END LOOP;
 DELETE FROM public.brand_marketing_delivery_receipts WHERE received_at<now()-interval '7 days';
 FOR c IN SELECT * FROM public.brand_marketing_connections WHERE status='connected' AND verified_phone=requested_phone
  AND (dispatch_lock_until IS NULL OR dispatch_lock_until<now()) AND (last_dispatch_at IS NULL OR last_dispatch_at<=now()-interval '1 minute')
  AND NOT coalesce(dispatch_day=(now() AT TIME ZONE 'Asia/Riyadh')::date AND (dispatch_count>=200 OR first_dispatch_at<=now()-interval '8 hours'),false)
  AND NOT coalesce(dispatch_day<(now() AT TIME ZONE 'Asia/Riyadh')::date AND consecutive_days>=3 AND (now() AT TIME ZONE 'Asia/Riyadh')::date<=dispatch_day+14,false)
  AND EXISTS(SELECT 1 FROM public.brand_marketing_recipients pending JOIN public.brand_marketing_campaigns p ON p.id=pending.campaign_id WHERE pending.cafe_id=brand_marketing_connections.cafe_id AND pending.status='queued' AND p.status IN ('queued','scheduled','sending') AND p.scheduled_at<=now() AND public.marketing_actor_allowed(pending.cafe_id,p.created_by) AND NOT EXISTS(SELECT 1 FROM public.brand_marketing_suppressions s WHERE s.cafe_id=pending.cafe_id AND s.phone=pending.phone))
  ORDER BY last_dispatch_at NULLS FIRST LIMIT least(greatest(p_limit,1),25) FOR UPDATE SKIP LOCKED LOOP
  SELECT x.* INTO r FROM public.brand_marketing_recipients x JOIN public.brand_marketing_campaigns p ON p.id=x.campaign_id
   WHERE x.cafe_id=c.cafe_id AND x.status='queued' AND p.status IN ('queued','scheduled','sending') AND p.scheduled_at<=now()
    AND public.marketing_actor_allowed(c.cafe_id,p.created_by)
    AND NOT EXISTS(SELECT 1 FROM public.brand_marketing_suppressions s WHERE s.cafe_id=x.cafe_id AND s.phone=x.phone)
   ORDER BY p.created_at,x.created_at,x.id LIMIT 1 FOR UPDATE OF x SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE; END IF;
  SELECT * INTO campaign FROM public.brand_marketing_campaigns WHERE id=r.campaign_id;
  token:=gen_random_uuid();
  UPDATE public.brand_marketing_connections SET dispatch_lock_until=now()+interval '3 minutes' WHERE cafe_id=c.cafe_id;
  UPDATE public.brand_marketing_recipients SET status='processing',lease_token=token,claimed_at=now(),updated_at=now() WHERE id=r.id;
  RETURN NEXT jsonb_build_object('id',r.id,'cafe_id',c.cafe_id,'phone',r.phone,'campaign_id',r.campaign_id,'created_by',campaign.created_by,
   'media_id',campaign.media_id,'body',campaign.body,'title',campaign.title,'lease_token',token,'instance_id',c.instance_id,'encrypted_credentials',c.encrypted_credentials,'requested_phone',c.requested_phone,'generation',c.generation);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.marketing_campaign_history(p_cafe uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(item ORDER BY created_at DESC),'[]'::jsonb) FROM (
  SELECT p.created_at,jsonb_build_object('id',p.id,'media',p.media,'title',p.title,'body',p.body,'status',p.status,'scheduledAt',p.scheduled_at,'createdAt',p.created_at,
   'total',count(r.id),'queued',count(r.id) FILTER(WHERE r.status IN ('queued','processing')),
   'accepted',count(r.id) FILTER(WHERE r.status='accepted'),'delivered',count(r.id) FILTER(WHERE r.status='delivered'),
   'read',count(r.id) FILTER(WHERE r.status='read'),'failed',count(r.id) FILTER(WHERE r.status='failed'),
   'uncertain',count(r.id) FILTER(WHERE r.status='uncertain'),'cancelled',count(r.id) FILTER(WHERE r.status='cancelled'),'suppressed',count(r.id) FILTER(WHERE r.status='suppressed')) item
  FROM (SELECT campaign.*,(SELECT jsonb_build_object('id',m.id,'kind',CASE WHEN m.mime_type='video/mp4' THEN 'video' ELSE 'image' END,
    'mimeType',m.mime_type,'fileName',m.file_name,'size',m.byte_size) FROM public.brand_marketing_media m WHERE m.id=campaign.media_id AND m.cafe_id=campaign.cafe_id AND m.status='ready') AS media
   FROM public.brand_marketing_campaigns campaign WHERE cafe_id=p_cafe ORDER BY created_at DESC LIMIT 50) p
  LEFT JOIN public.brand_marketing_recipients r ON r.campaign_id=p.id GROUP BY p.media,p.id,p.title,p.body,p.status,p.scheduled_at,p.created_at
 ) history;
$$;
REVOKE ALL ON FUNCTION public.marketing_campaign_history(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_campaign_history(uuid) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
