-- No historical audience is inferred from current wallet registrations.
BEGIN;
ALTER TABLE operations_report_private.settings ADD COLUMN promotion_recording_started_at timestamptz NOT NULL DEFAULT clock_timestamp();
CREATE TABLE operations_report_private.promotion_recipients (
  job_id uuid NOT NULL REFERENCES public.wallet_notification_jobs(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.loyalty_cards(id) ON DELETE CASCADE,
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK(provider IN ('apple','google')),
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(job_id,card_id,provider)
);
CREATE INDEX promotion_recipients_cafe_time ON operations_report_private.promotion_recipients(cafe_id,accepted_at);
ALTER TABLE operations_report_private.promotion_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON operations_report_private.promotion_recipients FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.record_wallet_promotion_recipients(p_job uuid,p_cafe uuid,p_provider text,p_cards uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_provider IS NULL OR p_provider NOT IN ('apple','google') OR cardinality(p_cards)>500
    OR NOT EXISTS(SELECT 1 FROM public.wallet_notification_jobs WHERE id=p_job AND cafe_id=p_cafe AND kind='message')
    THEN RAISE EXCEPTION 'Invalid promotion receipt' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(p_cards) x(id) WHERE NOT EXISTS(
    SELECT 1 FROM public.loyalty_cards c WHERE c.id=x.id AND c.cafe_id=p_cafe))
    THEN RAISE EXCEPTION 'Invalid promotion audience' USING ERRCODE='22023'; END IF;
  INSERT INTO operations_report_private.promotion_recipients(job_id,card_id,cafe_id,provider)
    SELECT DISTINCT p_job,c.id,p_cafe,p_provider FROM public.loyalty_cards c
    WHERE c.id=ANY(p_cards) AND c.cafe_id=p_cafe
    ON CONFLICT(job_id,card_id,provider) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.record_wallet_promotion_recipients(uuid,uuid,text,uuid[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_wallet_promotion_recipients(uuid,uuid,text,uuid[]) TO service_role;
CREATE FUNCTION public.get_admin_operations_report_v2(p_from date DEFAULT NULL,p_to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_from timestamptz; v_to timestamptz; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles
    WHERE id=auth.uid() AND role='platform_admin' AND status='active')
    THEN RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501'; END IF;
  IF p_from>p_to THEN RAISE EXCEPTION 'Invalid date range' USING ERRCODE='22023'; END IF;
  v_from:=p_from::timestamp AT TIME ZONE 'Asia/Riyadh';
  v_to:=(p_to+1)::timestamp AT TIME ZONE 'Asia/Riyadh';
  WITH brands AS (
    SELECT id,name,slug,status FROM public.cafes WHERE deleted_at IS NULL
  ), menu AS (
    SELECT e.cafe_id,max(e.occurred_at) AS last_visit,
      max(e.occurred_at) FILTER(WHERE (v_from IS NULL OR e.occurred_at>=v_from) AND (v_to IS NULL OR e.occurred_at<v_to)) AS period_last,
      count(*) FILTER(WHERE (v_from IS NULL OR e.occurred_at>=v_from) AND (v_to IS NULL OR e.occurred_at<v_to)) AS visits,
      count(DISTINCT e.visitor_key) FILTER(WHERE (v_from IS NULL OR e.occurred_at>=v_from) AND (v_to IS NULL OR e.occurred_at<v_to)) AS visitors
    FROM brand_analytics_private.events e JOIN brands b ON b.id=e.cafe_id WHERE e.kind='menu_view' GROUP BY e.cafe_id
  ), cards AS (
    SELECT c.cafe_id,count(*) AS cards,count(DISTINCT c.customer_profile_id) AS customers
    FROM public.loyalty_cards c JOIN brands b ON b.id=c.cafe_id
    WHERE (v_from IS NULL OR c.issued_at>=v_from) AND (v_to IS NULL OR c.issued_at<v_to) GROUP BY c.cafe_id
  ), wallets AS (
    SELECT e.cafe_id,count(DISTINCT e.card_id) FILTER(WHERE e.provider='apple') AS apple,
      count(DISTINCT e.card_id) FILTER(WHERE e.provider='google') AS google
    FROM loyalty_audit_private.wallet_customer_events e JOIN brands b ON b.id=e.cafe_id
    WHERE e.kind IN ('download','save_link') AND (v_from IS NULL OR e.occurred_at>=v_from)
      AND (v_to IS NULL OR e.occurred_at<v_to) GROUP BY e.cafe_id
  ), operations AS (
    SELECT e.cafe_id,count(*) FILTER(WHERE e.kind='stamp') AS stamps,count(*) FILTER(WHERE e.kind='redeem') AS rewards
    FROM public.loyalty_activity_events e JOIN brands b ON b.id=e.cafe_id
    WHERE e.kind IN ('stamp','redeem') AND e.outcome='success'
      AND (v_from IS NULL OR e.occurred_at>=v_from) AND (v_to IS NULL OR e.occurred_at<v_to) GROUP BY e.cafe_id
  ), pager AS (
    SELECT e.cafe_id,count(*) AS uses FROM public.pager_orders e JOIN brands b ON b.id=e.cafe_id
    WHERE (v_from IS NULL OR e.created_at>=v_from) AND (v_to IS NULL OR e.created_at<v_to) GROUP BY e.cafe_id
  ), promotions AS (
    SELECT e.cafe_id,count(DISTINCT c.customer_profile_id) AS customers,
      count(DISTINCT (e.job_id,c.customer_profile_id)) AS sends
    FROM operations_report_private.promotion_recipients e JOIN brands b ON b.id=e.cafe_id
      JOIN public.loyalty_cards c ON c.id=e.card_id AND c.cafe_id=e.cafe_id
    WHERE (v_from IS NULL OR e.accepted_at>=v_from) AND (v_to IS NULL OR e.accepted_at<v_to) GROUP BY e.cafe_id
  ), subscriptions AS (
    SELECT DISTINCT ON(s.cafe_id) s.*,p.name AS plan_name,p.features AS plan_features
    FROM public.subscriptions s JOIN brands b ON b.id=s.cafe_id LEFT JOIN public.platform_plans p ON p.id=s.plan_id
    ORDER BY s.cafe_id,(s.status::text IN ('active','trialing') AND s.started_at<=now() AND (s.expires_at IS NULL OR s.expires_at>now())) DESC,
      s.created_at DESC,s.id DESC
  ), overrides AS (
    SELECT o.cafe_id,jsonb_agg(jsonb_build_object('featureId',o.feature_id,'enabled',o.enabled)) AS items
    FROM public.brand_feature_overrides o JOIN brands b ON b.id=o.cafe_id GROUP BY o.cafe_id
  )
  SELECT jsonb_build_object('generatedAt',now(),'from',p_from,'to',p_to,
    'menuTrackingSince',(SELECT recording_started_at FROM brand_analytics_private.settings),
    'walletTrackingSince',(SELECT wallet_recording_started_at FROM loyalty_audit_private.settings),
    'promotionTrackingSince',(SELECT promotion_recording_started_at FROM operations_report_private.settings),
    'brands',coalesce(jsonb_agg(jsonb_build_object(
      'id',b.id,'name',b.name,'slug',b.slug,'status',b.status,
      'subscriptionStatus',coalesce(s.status::text,'none'),'planName',coalesce(s.plan_name,''),'expiresAt',s.expires_at,
      'subscribed',coalesce(s.status::text IN ('active','trialing') AND s.started_at<=now() AND (s.expires_at IS NULL OR s.expires_at>now()),false),
      'planFeatures',coalesce(to_jsonb(s.plan_features),'[]'::jsonb),'featureOverrides',coalesce(f.items,'[]'::jsonb),
      'lastMenuVisit',m.last_visit,'periodLastMenuVisit',m.period_last,
      'metrics',jsonb_build_object('pagerUses',coalesce(pg.uses,0),'promotionCustomers',coalesce(pr.customers,0),'promotionSends',coalesce(pr.sends,0),
        'menuVisitors',coalesce(m.visitors,0),'menuVisits',coalesce(m.visits,0),'loyaltyCards',coalesce(c.cards,0),
        'loyaltyCustomers',coalesce(c.customers,0),'appleCards',coalesce(w.apple,0),'googleCards',coalesce(w.google,0),
        'stampOperations',coalesce(o.stamps,0),'rewardOperations',coalesce(o.rewards,0))
    ) ORDER BY b.name,b.id),'[]'::jsonb)) INTO v_result
    FROM brands b LEFT JOIN menu m ON m.cafe_id=b.id
      LEFT JOIN cards c ON c.cafe_id=b.id LEFT JOIN wallets w ON w.cafe_id=b.id
      LEFT JOIN pager pg ON pg.cafe_id=b.id LEFT JOIN promotions pr ON pr.cafe_id=b.id
      LEFT JOIN operations o ON o.cafe_id=b.id LEFT JOIN subscriptions s ON s.cafe_id=b.id LEFT JOIN overrides f ON f.cafe_id=b.id;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_admin_operations_report_v2(date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_operations_report_v2(date,date) TO authenticated;
COMMIT;
