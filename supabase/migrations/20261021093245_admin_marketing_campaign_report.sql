BEGIN;

-- Stable ordering also supports brand/date history pages without sorting equal timestamps
CREATE INDEX IF NOT EXISTS brand_marketing_campaign_report_history
 ON public.brand_marketing_campaigns(cafe_id,created_at DESC,id DESC);
-- Its leading columns preserve the previous history lookup; avoid duplicate indexes
DROP INDEX IF EXISTS public.brand_marketing_campaign_history;

CREATE FUNCTION public.get_admin_marketing_campaign_report(
 p_from date DEFAULT NULL,p_to date DEFAULT NULL,p_cafe uuid DEFAULT NULL,p_page integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_from timestamptz; v_to timestamptz; v_metrics jsonb; v_history jsonb:=NULL;
 v_campaigns jsonb; v_total bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles
   WHERE id=auth.uid() AND role='platform_admin' AND status='active')
   THEN RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501'; END IF;
 IF p_from>p_to THEN RAISE EXCEPTION 'Invalid date range' USING ERRCODE='22023'; END IF;
 IF p_page IS NULL OR p_page<0 OR p_page>100000 THEN RAISE EXCEPTION 'Invalid page' USING ERRCODE='22023'; END IF;
 IF p_cafe IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND deleted_at IS NULL)
   THEN RAISE EXCEPTION 'Brand unavailable' USING ERRCODE='22023'; END IF;
 v_from:=p_from::timestamp AT TIME ZONE 'Asia/Riyadh';
 v_to:=(p_to+1)::timestamp AT TIME ZONE 'Asia/Riyadh';

 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'cafeId',m.cafe_id,'campaignLaunched',m.launched,'campaignTargets',m.targets,
   'campaignSent',m.sent,'campaignPending',m.pending,'campaignFailed',m.failed,
   'campaignUncertain',m.uncertain,'campaignCancelled',m.cancelled,'campaignSuppressed',m.suppressed
 ) ORDER BY m.cafe_id),'[]'::jsonb) INTO v_metrics
 FROM (
   SELECT c.cafe_id,
     count(DISTINCT c.id) FILTER(WHERE c.scheduled_at<=now() AND (c.status<>'cancelled' OR r.attempted_at IS NOT NULL)) AS launched,
     count(DISTINCT r.phone) AS targets,
     count(r.id) FILTER(WHERE r.status IN ('accepted','delivered','read')) AS sent,
     count(r.id) FILTER(WHERE r.status IN ('queued','processing')) AS pending,
     count(r.id) FILTER(WHERE r.status='failed') AS failed,
     count(r.id) FILTER(WHERE r.status='uncertain') AS uncertain,
     count(r.id) FILTER(WHERE r.status='cancelled') AS cancelled,
     count(r.id) FILTER(WHERE r.status='suppressed') AS suppressed
   FROM public.brand_marketing_campaigns c
   JOIN public.cafes b ON b.id=c.cafe_id AND b.deleted_at IS NULL
   LEFT JOIN public.brand_marketing_recipients r ON r.campaign_id=c.id AND r.cafe_id=c.cafe_id
   WHERE (p_cafe IS NULL OR c.cafe_id=p_cafe)
     AND (v_from IS NULL OR c.created_at>=v_from) AND (v_to IS NULL OR c.created_at<v_to)
   GROUP BY c.cafe_id
 ) m;

 IF p_cafe IS NOT NULL THEN
   SELECT count(*) INTO v_total FROM public.brand_marketing_campaigns c
   WHERE c.cafe_id=p_cafe AND (v_from IS NULL OR c.created_at>=v_from) AND (v_to IS NULL OR c.created_at<v_to);
   SELECT coalesce(jsonb_agg(jsonb_build_object(
     'id',h.id,'title',h.title,'body',h.body,'status',h.status,'createdAt',h.created_at,'scheduledAt',h.scheduled_at,
     'mediaKind',h.media_kind,'total',h.total,'sent',h.sent,'pending',h.pending,'failed',h.failed,
     'uncertain',h.uncertain,'cancelled',h.cancelled,'suppressed',h.suppressed
   ) ORDER BY h.created_at DESC,h.id DESC),'[]'::jsonb) INTO v_campaigns
   FROM (
     SELECT c.id,c.title,c.body,c.status,c.created_at,c.scheduled_at,
       CASE WHEN media.mime_type='video/mp4' THEN 'video' WHEN media.mime_type LIKE 'image/%' THEN 'image' ELSE NULL END AS media_kind,
       count(r.id) AS total,
       count(r.id) FILTER(WHERE r.status IN ('accepted','delivered','read')) AS sent,
       count(r.id) FILTER(WHERE r.status IN ('queued','processing')) AS pending,
       count(r.id) FILTER(WHERE r.status='failed') AS failed,
       count(r.id) FILTER(WHERE r.status='uncertain') AS uncertain,
       count(r.id) FILTER(WHERE r.status='cancelled') AS cancelled,
       count(r.id) FILTER(WHERE r.status='suppressed') AS suppressed
     FROM (
       SELECT p.id,p.cafe_id,p.title,p.body,p.status,p.created_at,p.scheduled_at,p.media_id
       FROM public.brand_marketing_campaigns p WHERE p.cafe_id=p_cafe
         AND (v_from IS NULL OR p.created_at>=v_from) AND (v_to IS NULL OR p.created_at<v_to)
       ORDER BY p.created_at DESC,p.id DESC LIMIT 20 OFFSET p_page*20
     ) c
     LEFT JOIN public.brand_marketing_media media ON media.id=c.media_id AND media.cafe_id=c.cafe_id
     LEFT JOIN public.brand_marketing_recipients r ON r.campaign_id=c.id AND r.cafe_id=c.cafe_id
     GROUP BY c.id,c.title,c.body,c.status,c.created_at,c.scheduled_at,media.mime_type
   ) h;
   v_history:=jsonb_build_object('page',p_page,'total',v_total,'campaigns',v_campaigns);
 END IF;
 RETURN jsonb_build_object('from',p_from,'to',p_to,'metrics',v_metrics,'history',v_history);
END $$;

REVOKE ALL ON FUNCTION public.get_admin_marketing_campaign_report(date,date,uuid,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_marketing_campaign_report(date,date,uuid,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
