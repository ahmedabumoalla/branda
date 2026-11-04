BEGIN;

-- Refuse to overwrite a worker implementation changed since this patch was reviewed.
DO $guard$
BEGIN
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid='public.platform_marketing_claim_job()'::regprocedure)
      IS DISTINCT FROM 'dee2d334750d41fa6da75df14f291712'
 OR (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid='public.platform_marketing_begin_dispatch(uuid,uuid)'::regprocedure)
      IS DISTINCT FROM '5e164c59b6fe5c24eb623789ea345ee3'
 OR (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid='public.platform_marketing_finish_dispatch(uuid,uuid,text,text,text)'::regprocedure)
      IS DISTINCT FROM 'bef39501069d29845917a41abec79b55' THEN
   RAISE EXCEPTION 'Platform campaign worker changed since review'; END IF;
END $guard$;

-- Extend the existing backend-only campaign queue with server-selected loyalty segments.
-- No customer data, campaign recipients or provider messages are written by this migration.
CREATE FUNCTION brand_loyalty_analytics_private.campaign_segment_valid(p_segment text,p_days integer)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT p_segment IS NOT NULL AND p_segment IN('inactive','loyal','absent') AND p_days IS NOT NULL
   AND p_days BETWEEN 1 AND 365 AND (p_segment='absent' OR p_days=10)
$$;

CREATE FUNCTION brand_loyalty_analytics_private.campaign_audience(p_brand uuid,p_segment text,p_days integer,p_at timestamptz)
RETURNS TABLE(id uuid,name text,phone text,last_visit_at timestamptz,inactive_days integer,visit_days bigint,average_gap numeric,eligible boolean)
LANGUAGE sql STABLE SET search_path='' AS $$
 WITH customers AS MATERIALIZED(
   SELECT c.*,public.normalize_customer_phone(translate(c.row_data->>'phone','٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789')) AS phone
   FROM brand_loyalty_analytics_private.customers(p_brand,p_at) c
 ), selected AS MATERIALIZED(
   SELECT c.*,row_number() OVER(PARTITION BY c.phone ORDER BY c.joined_at,c.id) AS phone_rank
   FROM customers c
   WHERE (p_segment='loyal' AND c.is_loyal) OR (p_segment IN('inactive','absent')
     AND coalesce(c.last_visit_at,c.card_issued_at,c.joined_at)<p_at-make_interval(days=>p_days)
     AND coalesce(c.card_issued_at,c.joined_at)<p_at-make_interval(days=>p_days))
 ), contacts AS MATERIALIZED(SELECT phone FROM public.platform_marketing_contacts(p_brand,''))
 SELECT s.id,coalesce(s.row_data->>'name',''),coalesce(s.phone,''),s.last_visit_at,
   (s.row_data->>'inactiveDays')::integer,s.visit_days,s.average_gap,
   coalesce(s.phone_rank=1 AND s.phone ~ '^9665[0-9]{8}$' AND c.phone IS NOT NULL
     AND (p_segment='loyal' OR NOT EXISTS(SELECT 1 FROM customers other WHERE other.phone=s.phone
       AND coalesce(other.last_visit_at,other.card_issued_at,other.joined_at)>=p_at-make_interval(days=>p_days))),false) AS eligible
 FROM selected s LEFT JOIN contacts c ON c.phone=s.phone
$$;

CREATE FUNCTION public.platform_marketing_analytics_audience(p_actor uuid,p_cafe uuid,p_segment text,p_inactive_days integer DEFAULT 10,p_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; snapshot_at timestamptz:=now();
BEGIN
 IF NOT public.platform_marketing_actor_allowed(p_actor) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_cafe IS NULL OR NOT brand_loyalty_analytics_private.campaign_segment_valid(p_segment,p_inactive_days)
   OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'Invalid analytics audience' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND deleted_at IS NULL AND status IN('active','published')) THEN
   RAISE EXCEPTION 'Brand unavailable' USING ERRCODE='22023'; END IF;
 WITH audience AS MATERIALIZED(SELECT * FROM brand_loyalty_analytics_private.campaign_audience(p_cafe,p_segment,p_inactive_days,snapshot_at)),
 eligible AS MATERIALIZED(SELECT * FROM audience WHERE eligible),
 paged AS(SELECT * FROM eligible ORDER BY name,phone LIMIT 25 OFFSET(p_page-1)*25)
 SELECT jsonb_build_object('generatedAt',snapshot_at,'brandId',p_cafe,'segment',p_segment,'inactiveDays',p_inactive_days,
   'matched',(SELECT count(*) FROM audience),'total',(SELECT count(*) FROM eligible),
   'excluded',(SELECT count(*) FROM audience)-(SELECT count(*) FROM eligible),'page',p_page,'pageSize',25,
   'digest',encode(sha256(convert_to(jsonb_build_object('brandId',p_cafe,'segment',p_segment,'inactiveDays',p_inactive_days,
     'phones',coalesce((SELECT jsonb_agg(phone ORDER BY phone) FROM eligible),'[]'::jsonb))::text,'UTF8')),'hex'),
   'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'phone',phone,'lastVisitAt',last_visit_at,
     'inactiveDays',inactive_days,'visitDays',visit_days,'averageVisitGapDays',average_gap) ORDER BY name,phone) FROM paged),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;

CREATE FUNCTION public.platform_marketing_create_analytics_campaign(p_actor uuid,p_key uuid,p_title text,p_body text,p_cafe uuid,
 p_segment text,p_inactive_days integer,p_audience_digest text,p_scheduled_at timestamptz DEFAULT NULL,p_content_kind text DEFAULT 'message')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE existing public.platform_marketing_campaigns; payload jsonb; audience jsonb; selected text[]; result jsonb; v_campaign_id uuid; selected_digest text;
BEGIN
 IF NOT public.platform_marketing_actor_allowed(p_actor) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR p_cafe IS NULL OR NOT brand_loyalty_analytics_private.campaign_segment_valid(p_segment,p_inactive_days)
   OR p_audience_digest IS NULL OR p_audience_digest !~ '^[0-9a-f]{64}$' OR p_content_kind IS NULL OR p_content_kind NOT IN('message','offer')
   OR length(btrim(coalesce(p_title,''))) NOT BETWEEN 1 AND 100 OR length(btrim(coalesce(p_body,''))) NOT BETWEEN 1 AND 3000
   THEN RAISE EXCEPTION 'Invalid analytics campaign' USING ERRCODE='22023'; END IF;
 payload:=jsonb_build_object('version',1,'brandId',p_cafe,'segment',p_segment,'inactiveDays',p_inactive_days,'digest',p_audience_digest,
   'title',btrim(p_title),'body',btrim(p_body),'scheduledAt',extract(epoch FROM p_scheduled_at),'contentKind',p_content_kind);
 -- The shared key lock also prevents collision with the original general campaign endpoint.
 PERFORM pg_advisory_xact_lock(hashtextextended('platform-campaign:'||p_actor::text||':'||p_key::text,0));
 SELECT * INTO existing FROM public.platform_marketing_campaigns WHERE created_by=p_actor AND idempotency_key=p_key;
 IF FOUND THEN
   IF existing.request_payload->'analyticsRequest' IS DISTINCT FROM payload THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='22023'; END IF;
   RETURN jsonb_build_object('campaignId',existing.id,'total',(SELECT count(*) FROM public.platform_marketing_recipients WHERE campaign_id=existing.id));
 END IF;
 audience:=public.platform_marketing_analytics_audience(p_actor,p_cafe,p_segment,p_inactive_days,1);
 IF audience->>'digest' IS DISTINCT FROM p_audience_digest THEN RAISE EXCEPTION 'Audience changed' USING ERRCODE='22023'; END IF;
 IF (audience->>'total')::integer NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Empty or oversized audience' USING ERRCODE='22023'; END IF;
 SELECT array_agg(phone ORDER BY phone) INTO selected
 FROM brand_loyalty_analytics_private.campaign_audience(p_cafe,p_segment,p_inactive_days,now()) WHERE eligible;
 selected_digest:=encode(sha256(convert_to(jsonb_build_object('brandId',p_cafe,'segment',p_segment,'inactiveDays',p_inactive_days,
   'phones',coalesce(to_jsonb(selected),'[]'::jsonb))::text,'UTF8')),'hex');
 IF selected IS NULL OR cardinality(selected)<>(audience->>'total')::integer OR selected_digest IS DISTINCT FROM p_audience_digest THEN
   RAISE EXCEPTION 'Audience changed' USING ERRCODE='22023'; END IF;
 result:=public.platform_marketing_create_campaign(p_actor,p_key,p_title,p_body,NULL,p_cafe,'',selected,p_scheduled_at);
 v_campaign_id:=(result->>'campaignId')::uuid;
 UPDATE public.platform_marketing_campaigns SET request_payload=request_payload||jsonb_build_object('analyticsRequest',payload),
   audience_filter=audience_filter||jsonb_build_object('analytics',jsonb_build_object('version',1,'segment',p_segment,
     'inactiveDays',p_inactive_days,'contentKind',p_content_kind)) WHERE id=v_campaign_id AND created_by=p_actor;
 -- Keep brand-specific customer names instead of another brand's name for the same phone.
 UPDATE public.platform_marketing_recipients r SET name=a.name
 FROM brand_loyalty_analytics_private.campaign_audience(p_cafe,p_segment,p_inactive_days,now()) a
 WHERE r.campaign_id=v_campaign_id AND a.eligible AND r.phone=a.phone;
 RETURN result;
END $$;

CREATE FUNCTION brand_loyalty_analytics_private.campaign_recipient_allowed(p_filter jsonb,p_phone text)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE brand_id uuid; segment text; days integer;
BEGIN
 brand_id:=(p_filter->>'brandId')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.platform_marketing_contacts(brand_id,'',p_phone)) THEN RETURN false; END IF;
 IF NOT(p_filter ? 'analytics') THEN RETURN true; END IF;
 IF brand_id IS NULL OR jsonb_typeof(p_filter->'analytics')<>'object'
   OR p_filter->'analytics'->>'version' IS DISTINCT FROM '1'
   OR coalesce(p_filter->'analytics'->>'inactiveDays','') !~ '^[0-9]{1,3}$' THEN RETURN false; END IF;
 segment:=p_filter->'analytics'->>'segment'; days:=(p_filter->'analytics'->>'inactiveDays')::integer;
 IF NOT brand_loyalty_analytics_private.campaign_segment_valid(segment,days) THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM brand_loyalty_analytics_private.campaign_audience(brand_id,segment,days,now()) WHERE eligible AND phone=p_phone);
END $$;

-- Existing queue functions follow below, with only their contact-eligibility
-- predicates widened to the private segment-aware helper. Pacing, leases,
-- cancellation, outcome handling and ambiguous-attempt safeguards are preserved.

CREATE OR REPLACE FUNCTION public.platform_marketing_claim_job() RETURNS jsonb
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
    IF NOT brand_loyalty_analytics_private.campaign_recipient_allowed(campaign.audience_filter,recipient.phone) THEN
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

CREATE OR REPLACE FUNCTION public.platform_marketing_begin_dispatch(p_id uuid,p_lease uuid) RETURNS boolean
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
    OR NOT brand_loyalty_analytics_private.campaign_recipient_allowed(campaign.audience_filter,recipient.phone) THEN RETURN false; END IF;
  UPDATE public.platform_marketing_recipients SET attempted_at=clock_timestamp(),lease_until=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp() WHERE id=p_id;
  UPDATE public.platform_marketing_sender_state SET last_dispatch_at=clock_timestamp(),lease_until=clock_timestamp()+interval '2 minutes' WHERE singleton;
  UPDATE public.platform_marketing_campaigns SET status='sending',updated_at=clock_timestamp() WHERE id=campaign.id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.platform_marketing_finish_dispatch(p_id uuid,p_lease uuid,p_status text,p_message text DEFAULT NULL,p_error text DEFAULT NULL) RETURNS void
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
    ELSIF NOT public.platform_marketing_actor_allowed(campaign.created_by) OR NOT brand_loyalty_analytics_private.campaign_recipient_allowed(campaign.audience_filter,recipient.phone) THEN final_status:='suppressed'; END IF;
  END IF;
  UPDATE public.platform_marketing_recipients SET status=final_status,provider_message_id=CASE WHEN final_status='accepted' THEN p_message ELSE NULL END,error=p_error,
    lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=p_id;
  UPDATE public.platform_marketing_sender_state SET recipient_id=NULL,lease_until=NULL WHERE singleton AND recipient_id=p_id;
  UPDATE public.platform_marketing_campaigns c SET status='completed',updated_at=clock_timestamp()
  WHERE c.id=campaign.id AND c.status IN ('queued','sending') AND NOT EXISTS(SELECT 1 FROM public.platform_marketing_recipients r WHERE r.campaign_id=c.id AND r.status IN ('queued','processing'));
END $$;


REVOKE ALL ON FUNCTION brand_loyalty_analytics_private.campaign_segment_valid(text,integer),brand_loyalty_analytics_private.campaign_audience(uuid,text,integer,timestamptz),brand_loyalty_analytics_private.campaign_recipient_allowed(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.platform_marketing_analytics_audience(uuid,uuid,text,integer,integer),public.platform_marketing_create_analytics_campaign(uuid,uuid,text,text,uuid,text,integer,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_marketing_analytics_audience(uuid,uuid,text,integer,integer),public.platform_marketing_create_analytics_campaign(uuid,uuid,text,text,uuid,text,integer,text,timestamptz,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
