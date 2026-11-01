BEGIN;

-- Platform campaigns intentionally use a separate queue and audience from owner campaigns.
CREATE TABLE public.platform_marketing_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  storage_path text NOT NULL UNIQUE CHECK(storage_path LIKE created_by::text||'/%'),
  file_name text NOT NULL CHECK(length(file_name) BETWEEN 1 AND 150),
  mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp','video/mp4')),
  byte_size bigint NOT NULL CHECK(byte_size>0 AND byte_size<=CASE WHEN mime_type='video/mp4' THEN 52428800 ELSE 10485760 END),
  status text NOT NULL DEFAULT 'uploading' CHECK(status IN ('uploading','ready')),
  content_sha256 text CHECK(content_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '2 hours',
  ready_at timestamptz,
  UNIQUE(id,created_by),
  CHECK(status<>'ready' OR (content_sha256 IS NOT NULL AND ready_at IS NOT NULL AND storage_path LIKE created_by::text||'/ready/'||id::text||'.%'))
);
CREATE TABLE public.platform_marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  request_payload jsonb NOT NULL,
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 100),
  body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 3000),
  media_id uuid,
  audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','completed','cancelled')),
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(created_by,idempotency_key),
  FOREIGN KEY(media_id,created_by) REFERENCES public.platform_marketing_media(id,created_by) ON DELETE RESTRICT,
  CHECK(media_id IS NULL OR length(body)<=1024)
);
CREATE TABLE public.platform_marketing_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.platform_marketing_campaigns(id) ON DELETE CASCADE,
  phone text NOT NULL CHECK(phone ~ '^9665[0-9]{8}$'),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','accepted','failed','uncertain','cancelled','suppressed')),
  lease_token uuid,
  lease_until timestamptz,
  attempted_at timestamptz,
  provider_message_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id,phone)
);
CREATE TABLE public.platform_marketing_sender_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  recipient_id uuid REFERENCES public.platform_marketing_recipients(id) ON DELETE SET NULL,
  lease_until timestamptz,
  last_dispatch_at timestamptz
);
INSERT INTO public.platform_marketing_sender_state(singleton) VALUES(true);
CREATE INDEX platform_marketing_campaign_history ON public.platform_marketing_campaigns(created_at DESC,id DESC);
CREATE INDEX platform_marketing_campaign_due ON public.platform_marketing_campaigns(scheduled_at,id) WHERE status IN ('queued','sending');
CREATE INDEX platform_marketing_queue ON public.platform_marketing_recipients(created_at,id) WHERE status='queued';
CREATE INDEX platform_marketing_lease ON public.platform_marketing_recipients(lease_until) WHERE status='processing';
CREATE INDEX platform_marketing_campaign_recipients ON public.platform_marketing_recipients(campaign_id,status);
CREATE INDEX platform_marketing_media_creator ON public.platform_marketing_media(created_by,created_at DESC);
CREATE INDEX IF NOT EXISTS brand_marketing_suppressions_phone_idx ON public.brand_marketing_suppressions(phone);

ALTER TABLE public.platform_marketing_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_marketing_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_marketing_sender_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_marketing_media,public.platform_marketing_campaigns,public.platform_marketing_recipients,public.platform_marketing_sender_state FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.platform_marketing_media,public.platform_marketing_campaigns,public.platform_marketing_recipients,public.platform_marketing_sender_state TO service_role;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('platform-marketing-media','platform-marketing-media',false,52428800,ARRAY['image/jpeg','image/png','image/webp','video/mp4'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
-- Signed upload URLs grant only one staging target; no browser role can list/read final files.
CREATE POLICY platform_marketing_media_server_only ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated
USING(bucket_id<>'platform-marketing-media') WITH CHECK(bucket_id<>'platform-marketing-media');

CREATE FUNCTION public.platform_marketing_actor_allowed(p_actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_actor AND p.role='platform_admin' AND p.status='active');
$$;

-- A phone represents one recipient even if it has profiles/cards in several brands.
-- Suppression and blocked/conflicted profiles apply across the platform sender's audience.
CREATE FUNCTION public.platform_marketing_contacts(p_cafe uuid DEFAULT NULL,p_search text DEFAULT '',p_phone text DEFAULT NULL)
RETURNS TABLE(phone text,name text,brands jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH customers AS (
    SELECT p.id,p.cafe_id,p.full_name,p.status,p.blocked_at,p.phone_auth_conflict,
      public.normalize_customer_phone(translate(p.phone,'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789')) AS number
    FROM public.customer_profiles p
  ), raw_contacts AS (
    SELECT p.number AS phone,p.full_name AS name,b.id AS cafe_id,b.name AS brand_name
    FROM customers p JOIN public.cafes b ON b.id=p.cafe_id
    WHERE p.status='active' AND p.blocked_at IS NULL AND NOT coalesce(p.phone_auth_conflict,false)
      AND b.deleted_at IS NULL AND b.status IN ('active','published')
    UNION ALL
    SELECT CASE WHEN p.id IS NOT NULL THEN p.number ELSE public.normalize_customer_phone(translate(l.customer_phone,'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789')) END,
      coalesce(nullif(p.full_name,''),l.customer_name),b.id,b.name
    FROM public.loyalty_cards l JOIN public.cafes b ON b.id=l.cafe_id
    LEFT JOIN customers p ON p.id=l.customer_profile_id AND p.cafe_id=l.cafe_id
    WHERE l.status='active' AND b.deleted_at IS NULL AND b.status IN ('active','published')
      AND (l.customer_profile_id IS NULL OR (p.id IS NOT NULL AND p.status='active' AND p.blocked_at IS NULL AND NOT coalesce(p.phone_auth_conflict,false)))
  ), valid AS (
    SELECT DISTINCT r.phone,coalesce(nullif(btrim(r.name),''),'عميل بدون اسم') AS name,r.cafe_id,r.brand_name
    FROM raw_contacts r
    WHERE r.phone ~ '^9665[0-9]{8}$' AND (p_phone IS NULL OR r.phone=p_phone)
      AND NOT EXISTS(SELECT 1 FROM customers blocked WHERE blocked.number=r.phone AND (blocked.status IS DISTINCT FROM 'active' OR blocked.blocked_at IS NOT NULL OR coalesce(blocked.phone_auth_conflict,false)))
      AND NOT EXISTS(SELECT 1 FROM public.brand_marketing_suppressions s WHERE s.phone=r.phone)
  ), grouped AS (
    SELECT v.phone,min(v.name) AS name,
      bool_or(p_cafe IS NULL OR v.cafe_id=p_cafe) AS matches_brand,
      bool_or(coalesce(btrim(p_search),'')='' OR position(lower(btrim(p_search)) in lower(v.name))>0 OR position(translate(btrim(p_search),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789') in v.phone)>0) AS matches_search
    FROM valid v GROUP BY v.phone
  )
  SELECT g.phone,g.name,(SELECT jsonb_agg(jsonb_build_object('id',b.cafe_id,'name',b.brand_name) ORDER BY b.brand_name,b.cafe_id)
    FROM (SELECT DISTINCT v.cafe_id,v.brand_name FROM valid v WHERE v.phone=g.phone) b)
  FROM grouped g WHERE g.matches_brand AND g.matches_search;
$$;

CREATE FUNCTION public.platform_marketing_audience(p_actor uuid,p_cafe uuid DEFAULT NULL,p_search text DEFAULT '',p_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.platform_marketing_actor_allowed(p_actor) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF p_page IS NULL OR p_page<1 OR p_page>100000 OR length(coalesce(p_search,''))>100 THEN RAISE EXCEPTION 'Invalid audience query' USING ERRCODE='22023'; END IF;
  WITH contacts AS MATERIALIZED (SELECT * FROM public.platform_marketing_contacts(p_cafe,coalesce(p_search,'')))
  SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.phone,'name',r.name,'phone',r.phone,'brands',r.brands) ORDER BY r.name,r.phone)
    FROM (SELECT * FROM contacts ORDER BY name,phone LIMIT 25 OFFSET (p_page-1)*25) r),'[]'::jsonb),
    'page',p_page,'pageSize',25,'total',(SELECT count(*) FROM contacts)) INTO result;
  RETURN result;
END $$;

CREATE FUNCTION public.platform_marketing_create_campaign(p_actor uuid,p_key uuid,p_title text,p_body text,p_media uuid DEFAULT NULL,p_cafe uuid DEFAULT NULL,p_search text DEFAULT '',p_phones text[] DEFAULT NULL,p_scheduled_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE existing public.platform_marketing_campaigns; result uuid; selected text[]; payload jsonb; recipient_count integer;
BEGIN
  IF NOT public.platform_marketing_actor_allowed(p_actor) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL OR length(btrim(coalesce(p_title,''))) NOT BETWEEN 1 AND 100 OR length(btrim(coalesce(p_body,''))) NOT BETWEEN 1 AND 3000
    OR length(coalesce(p_search,''))>100 OR (p_media IS NOT NULL AND length(btrim(p_body))>1024)
    OR (p_phones IS NOT NULL AND (cardinality(p_phones) NOT BETWEEN 1 AND 10000 OR EXISTS(SELECT 1 FROM unnest(p_phones) p WHERE p IS NULL OR p!~'^9665[0-9]{8}$')))
    THEN RAISE EXCEPTION 'Invalid campaign' USING ERRCODE='22023'; END IF;
  IF p_phones IS NOT NULL THEN SELECT array_agg(p ORDER BY p) INTO selected FROM (SELECT DISTINCT unnest(p_phones) AS p) d; END IF;
  payload:=jsonb_build_object('title',btrim(p_title),'body',btrim(p_body),'mediaId',p_media,'brandId',p_cafe,'search',btrim(coalesce(p_search,'')),'phones',selected,'scheduledAt',extract(epoch FROM p_scheduled_at));
  PERFORM pg_advisory_xact_lock(hashtextextended('platform-campaign:'||p_actor::text||':'||p_key::text,0));
  SELECT * INTO existing FROM public.platform_marketing_campaigns WHERE created_by=p_actor AND idempotency_key=p_key;
  IF FOUND THEN
    IF existing.request_payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('campaignId',existing.id,'total',(SELECT count(*) FROM public.platform_marketing_recipients WHERE campaign_id=existing.id));
  END IF;
  -- Reconcile an existing request before validating its now-past requested start time.
  -- Null means immediate but remains null in the fingerprint so retries remain identical.
  IF p_scheduled_at IS NOT NULL AND (NOT isfinite(p_scheduled_at) OR p_scheduled_at<=clock_timestamp() OR p_scheduled_at>clock_timestamp()+interval '365 days') THEN
    RAISE EXCEPTION 'Invalid scheduled time' USING ERRCODE='22023';
  END IF;
  IF p_media IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.platform_marketing_media m WHERE m.id=p_media AND m.created_by=p_actor AND m.status='ready' AND m.expires_at>now()) THEN
    RAISE EXCEPTION 'Media unavailable' USING ERRCODE='22023';
  END IF;
  IF p_cafe IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cafes c WHERE c.id=p_cafe AND c.deleted_at IS NULL AND c.status IN ('active','published')) THEN
    RAISE EXCEPTION 'Brand unavailable' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.platform_marketing_campaigns(created_by,idempotency_key,request_payload,title,body,media_id,audience_filter,scheduled_at)
  VALUES(p_actor,p_key,payload,btrim(p_title),btrim(p_body),p_media,jsonb_build_object('brandId',p_cafe,'search',btrim(coalesce(p_search,'')),'mode',CASE WHEN selected IS NULL THEN 'filtered' ELSE 'selected' END),coalesce(p_scheduled_at,clock_timestamp())) RETURNING id INTO result;
  INSERT INTO public.platform_marketing_recipients(campaign_id,phone,name)
  SELECT result,c.phone,c.name FROM public.platform_marketing_contacts(p_cafe,btrim(coalesce(p_search,''))) c WHERE selected IS NULL OR c.phone=ANY(selected);
  GET DIAGNOSTICS recipient_count=ROW_COUNT;
  IF recipient_count=0 OR (selected IS NOT NULL AND recipient_count<>cardinality(selected)) THEN RAISE EXCEPTION 'Audience changed or unavailable' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('campaignId',result,'total',recipient_count);
END $$;

CREATE FUNCTION public.platform_marketing_claim_job() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE state public.platform_marketing_sender_state; recipient public.platform_marketing_recipients; campaign public.platform_marketing_campaigns; token uuid; tries integer:=0;
BEGIN
  SELECT * INTO state FROM public.platform_marketing_sender_state WHERE singleton FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF state.lease_until>clock_timestamp() THEN RETURN NULL; END IF;
  UPDATE public.platform_marketing_recipients r SET status=CASE WHEN r.attempted_at IS NOT NULL THEN 'uncertain' WHEN c.status='cancelled' THEN 'cancelled' ELSE 'queued' END,
    lease_token=NULL,lease_until=NULL,error=CASE WHEN r.attempted_at IS NOT NULL THEN 'LEASE_EXPIRED_AFTER_ATTEMPT' ELSE NULL END,updated_at=clock_timestamp()
  FROM public.platform_marketing_campaigns c WHERE c.id=r.campaign_id AND r.status='processing' AND r.lease_until<=clock_timestamp();
  UPDATE public.platform_marketing_sender_state SET recipient_id=NULL,lease_until=NULL WHERE singleton;
  UPDATE public.platform_marketing_campaigns c SET status='completed',updated_at=clock_timestamp()
  WHERE c.status IN ('queued','sending') AND NOT EXISTS(SELECT 1 FROM public.platform_marketing_recipients r WHERE r.campaign_id=c.id AND r.status IN ('queued','processing'));
  IF state.last_dispatch_at>clock_timestamp()-interval '5 seconds' THEN RETURN NULL; END IF;
  LOOP
    tries:=tries+1;
    IF tries>25 THEN RETURN NULL; END IF;
    SELECT r.* INTO recipient FROM public.platform_marketing_recipients r JOIN public.platform_marketing_campaigns c ON c.id=r.campaign_id
    WHERE r.status='queued' AND c.status IN ('queued','sending') AND c.scheduled_at<=clock_timestamp() ORDER BY r.created_at,r.id LIMIT 1 FOR UPDATE OF r SKIP LOCKED;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT * INTO campaign FROM public.platform_marketing_campaigns WHERE id=recipient.campaign_id;
    IF NOT public.platform_marketing_actor_allowed(campaign.created_by) THEN
      UPDATE public.platform_marketing_recipients SET status='suppressed',error='CREATOR_UNAVAILABLE',updated_at=clock_timestamp() WHERE id=recipient.id;
      UPDATE public.platform_marketing_campaigns c SET status='completed',updated_at=clock_timestamp() WHERE c.id=campaign.id
        AND NOT EXISTS(SELECT 1 FROM public.platform_marketing_recipients r WHERE r.campaign_id=c.id AND r.status IN ('queued','processing'));
      CONTINUE;
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.platform_marketing_contacts((campaign.audience_filter->>'brandId')::uuid,'',recipient.phone)) THEN
      UPDATE public.platform_marketing_recipients SET status='suppressed',error='RECIPIENT_UNAVAILABLE',updated_at=clock_timestamp() WHERE id=recipient.id;
      UPDATE public.platform_marketing_campaigns c SET status='completed',updated_at=clock_timestamp() WHERE c.id=campaign.id
        AND NOT EXISTS(SELECT 1 FROM public.platform_marketing_recipients r WHERE r.campaign_id=c.id AND r.status IN ('queued','processing'));
      CONTINUE;
    END IF;
    token:=gen_random_uuid();
    UPDATE public.platform_marketing_recipients SET status='processing',lease_token=token,lease_until=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp() WHERE id=recipient.id;
    UPDATE public.platform_marketing_sender_state SET recipient_id=recipient.id,lease_until=clock_timestamp()+interval '2 minutes' WHERE singleton;
    RETURN jsonb_build_object('id',recipient.id,'campaign_id',campaign.id,'phone',recipient.phone,'body',campaign.body,'title',campaign.title,'media_id',campaign.media_id,'created_by',campaign.created_by,'lease_token',token);
  END LOOP;
END $$;

CREATE FUNCTION public.platform_marketing_begin_dispatch(p_id uuid,p_lease uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE state public.platform_marketing_sender_state; recipient public.platform_marketing_recipients; campaign public.platform_marketing_campaigns;
BEGIN
  SELECT * INTO state FROM public.platform_marketing_sender_state WHERE singleton FOR UPDATE;
  SELECT * INTO recipient FROM public.platform_marketing_recipients WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR recipient.status<>'processing' OR recipient.lease_token IS DISTINCT FROM p_lease OR recipient.attempted_at IS NOT NULL
    OR recipient.lease_until IS NULL OR recipient.lease_until<=clock_timestamp() OR state.recipient_id IS DISTINCT FROM p_id OR state.lease_until<=clock_timestamp()
    OR state.last_dispatch_at>clock_timestamp()-interval '5 seconds' THEN RETURN false; END IF;
  SELECT * INTO campaign FROM public.platform_marketing_campaigns WHERE id=recipient.campaign_id;
  IF campaign.status NOT IN ('queued','sending') OR campaign.scheduled_at>clock_timestamp() OR NOT public.platform_marketing_actor_allowed(campaign.created_by)
    OR NOT EXISTS(SELECT 1 FROM public.platform_marketing_contacts((campaign.audience_filter->>'brandId')::uuid,'',recipient.phone)) THEN RETURN false; END IF;
  UPDATE public.platform_marketing_recipients SET attempted_at=clock_timestamp(),lease_until=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp() WHERE id=p_id;
  UPDATE public.platform_marketing_sender_state SET last_dispatch_at=clock_timestamp(),lease_until=clock_timestamp()+interval '2 minutes' WHERE singleton;
  UPDATE public.platform_marketing_campaigns SET status='sending',updated_at=clock_timestamp() WHERE id=campaign.id;
  RETURN true;
END $$;

CREATE FUNCTION public.platform_marketing_finish_dispatch(p_id uuid,p_lease uuid,p_status text,p_message text DEFAULT NULL,p_error text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE recipient public.platform_marketing_recipients; campaign public.platform_marketing_campaigns; final_status text:=p_status;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('queued','accepted','failed','uncertain') OR length(coalesce(p_message,''))>256 OR length(coalesce(p_error,''))>160 THEN RAISE EXCEPTION 'Invalid dispatch result' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.platform_marketing_sender_state WHERE singleton FOR UPDATE;
  SELECT * INTO recipient FROM public.platform_marketing_recipients WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR recipient.status<>'processing' OR recipient.lease_token IS DISTINCT FROM p_lease THEN RETURN; END IF;
  SELECT * INTO campaign FROM public.platform_marketing_campaigns WHERE id=recipient.campaign_id;
  IF p_status='queued' AND recipient.attempted_at IS NOT NULL THEN final_status:='uncertain'; END IF;
  IF p_status IN ('accepted','failed','uncertain') AND recipient.attempted_at IS NULL THEN RAISE EXCEPTION 'Dispatch not attempted' USING ERRCODE='22023'; END IF;
  IF final_status='accepted' AND nullif(p_message,'') IS NULL THEN RAISE EXCEPTION 'Provider acknowledgement required' USING ERRCODE='22023'; END IF;
  IF final_status='queued' THEN
    IF campaign.status='cancelled' THEN final_status:='cancelled';
    ELSIF NOT public.platform_marketing_actor_allowed(campaign.created_by) OR NOT EXISTS(SELECT 1 FROM public.platform_marketing_contacts((campaign.audience_filter->>'brandId')::uuid,'',recipient.phone)) THEN final_status:='suppressed'; END IF;
  END IF;
  UPDATE public.platform_marketing_recipients SET status=final_status,provider_message_id=CASE WHEN final_status='accepted' THEN p_message ELSE NULL END,error=p_error,
    lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=p_id;
  UPDATE public.platform_marketing_sender_state SET recipient_id=NULL,lease_until=NULL WHERE singleton AND recipient_id=p_id;
  UPDATE public.platform_marketing_campaigns c SET status='completed',updated_at=clock_timestamp()
  WHERE c.id=campaign.id AND c.status IN ('queued','sending') AND NOT EXISTS(SELECT 1 FROM public.platform_marketing_recipients r WHERE r.campaign_id=c.id AND r.status IN ('queued','processing'));
END $$;

CREATE FUNCTION public.platform_marketing_cancel(p_actor uuid,p_campaign uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.platform_marketing_actor_allowed(p_actor) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.platform_marketing_sender_state WHERE singleton FOR UPDATE;
  PERFORM 1 FROM public.platform_marketing_campaigns WHERE id=p_campaign FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign missing' USING ERRCODE='22023'; END IF;
  UPDATE public.platform_marketing_campaigns SET status='cancelled',updated_at=clock_timestamp() WHERE id=p_campaign AND status IN ('queued','sending');
  UPDATE public.platform_marketing_recipients SET status='cancelled',lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp()
  WHERE campaign_id=p_campaign AND (status='queued' OR (status='processing' AND attempted_at IS NULL));
  UPDATE public.platform_marketing_sender_state s SET recipient_id=NULL,lease_until=NULL
  WHERE s.singleton AND EXISTS(SELECT 1 FROM public.platform_marketing_recipients r WHERE r.id=s.recipient_id AND r.campaign_id=p_campaign AND r.status='cancelled');
END $$;

CREATE FUNCTION public.platform_marketing_history(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.platform_marketing_actor_allowed(p_actor) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(item ORDER BY created_at DESC,id DESC),'[]'::jsonb) INTO result FROM (
    SELECT c.id,c.created_at,jsonb_build_object('id',c.id,'title',c.title,'body',c.body,'status',c.status,'createdAt',c.created_at,'scheduledAt',c.scheduled_at,
      'mediaKind',CASE WHEN m.mime_type='video/mp4' THEN 'video' WHEN m.mime_type LIKE 'image/%' THEN 'image' ELSE NULL END,
      'total',count(r.id),'accepted',count(r.id) FILTER(WHERE r.status='accepted'),'pending',count(r.id) FILTER(WHERE r.status IN ('queued','processing')),
      'failed',count(r.id) FILTER(WHERE r.status='failed'),'uncertain',count(r.id) FILTER(WHERE r.status='uncertain'),
      'cancelled',count(r.id) FILTER(WHERE r.status='cancelled'),'suppressed',count(r.id) FILTER(WHERE r.status='suppressed')) AS item
    FROM (SELECT * FROM public.platform_marketing_campaigns ORDER BY created_at DESC,id DESC LIMIT 30) c
    LEFT JOIN public.platform_marketing_media m ON m.id=c.media_id AND m.created_by=c.created_by
    LEFT JOIN public.platform_marketing_recipients r ON r.campaign_id=c.id
    GROUP BY c.id,c.created_at,c.title,c.body,c.status,c.scheduled_at,m.mime_type
  ) history;
  RETURN result;
END $$;

-- Every helper/RPC is backend-only; actor UUIDs never authorize browser RPC execution.
REVOKE ALL ON FUNCTION public.platform_marketing_actor_allowed(uuid),public.platform_marketing_contacts(uuid,text,text),public.platform_marketing_audience(uuid,uuid,text,integer),
  public.platform_marketing_create_campaign(uuid,uuid,text,text,uuid,uuid,text,text[],timestamptz),public.platform_marketing_claim_job(),public.platform_marketing_begin_dispatch(uuid,uuid),
  public.platform_marketing_finish_dispatch(uuid,uuid,text,text,text),public.platform_marketing_cancel(uuid,uuid),public.platform_marketing_history(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_marketing_actor_allowed(uuid),public.platform_marketing_contacts(uuid,text,text),public.platform_marketing_audience(uuid,uuid,text,integer),
  public.platform_marketing_create_campaign(uuid,uuid,text,text,uuid,uuid,text,text[],timestamptz),public.platform_marketing_claim_job(),public.platform_marketing_begin_dispatch(uuid,uuid),
  public.platform_marketing_finish_dispatch(uuid,uuid,text,text,text),public.platform_marketing_cancel(uuid,uuid),public.platform_marketing_history(uuid) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
