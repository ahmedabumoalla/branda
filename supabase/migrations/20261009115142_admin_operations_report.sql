-- Aggregates only. Historical registration sources are deliberately unknown.
BEGIN;
CREATE SCHEMA operations_report_private;
REVOKE ALL ON SCHEMA operations_report_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE operations_report_private.settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  recording_started_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO operations_report_private.settings DEFAULT VALUES;
CREATE TABLE operations_report_private.registration_sources (
  customer_id uuid PRIMARY KEY REFERENCES public.customer_profiles(id) ON DELETE CASCADE,
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  source text NOT NULL CHECK(source IN ('storefront','loyalty')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX operations_registration_cafe_idx ON operations_report_private.registration_sources(cafe_id);
ALTER TABLE operations_report_private.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations_report_private.registration_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA operations_report_private FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.record_customer_registration_source(p_customer_id uuid,p_source text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_source IS NULL OR p_source NOT IN ('storefront','loyalty') OR p_customer_id IS NULL
    THEN RAISE EXCEPTION 'Invalid registration source' USING ERRCODE='22023'; END IF;
  -- Only a just-created account may be attributed by the trusted server.
  INSERT INTO operations_report_private.registration_sources(customer_id,cafe_id,source)
    SELECT cp.id,cp.cafe_id,p_source FROM public.customer_profiles cp
    WHERE cp.id=p_customer_id AND cp.created_at >= clock_timestamp()-interval '5 minutes'
      AND cp.created_at >= (SELECT recording_started_at FROM operations_report_private.settings)
    ON CONFLICT(customer_id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.record_customer_registration_source(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_customer_registration_source(uuid,text) TO service_role;

-- Keep the existing authentication implementation intact. Taking its same lock
-- makes the new/existing decision atomic even when legacy callers run concurrently.
CREATE FUNCTION public.link_customer_phone_otp_attributed(
  p_cafe_id uuid,p_phone_normalized text,p_purpose text,p_auth_user_id uuid,
  p_full_name text DEFAULT NULL,p_registration_source text DEFAULT 'storefront'
) RETURNS TABLE(profile_id uuid,result text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_existing boolean; v_row record;
BEGIN
  IF p_registration_source IS NULL OR p_registration_source NOT IN ('storefront','loyalty')
    THEN RAISE EXCEPTION 'Invalid registration source' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text||':'||p_phone_normalized,0));
  SELECT EXISTS(SELECT 1 FROM public.customer_profiles cp WHERE cp.cafe_id=p_cafe_id
    AND cp.phone_normalized=p_phone_normalized) INTO v_existing;
  FOR v_row IN SELECT * FROM public.link_customer_after_supabase_phone_otp(
    p_cafe_id,p_phone_normalized,p_purpose,p_auth_user_id,p_full_name)
  LOOP
    IF NOT v_existing AND p_purpose='customer_signup' AND v_row.result='authenticated' AND v_row.profile_id IS NOT NULL THEN
      BEGIN
        PERFORM public.record_customer_registration_source(v_row.profile_id,p_registration_source);
      EXCEPTION WHEN OTHERS THEN
        -- Preserve successful authentication if analytics storage is unavailable.
        NULL;
      END;
    END IF;
    profile_id:=v_row.profile_id; result:=v_row.result; RETURN NEXT;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.link_customer_phone_otp_attributed(uuid,text,text,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.link_customer_phone_otp_attributed(uuid,text,text,uuid,text,text) TO service_role;

CREATE FUNCTION public.get_admin_operations_report(p_from date DEFAULT NULL,p_to date DEFAULT NULL)
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
  ), visits AS (
    SELECT e.cafe_id,max(e.created_at) AS last_visit,
      max(e.created_at) FILTER(WHERE (v_from IS NULL OR e.created_at>=v_from) AND (v_to IS NULL OR e.created_at<v_to)) AS period_last,
      count(*) FILTER(WHERE (v_from IS NULL OR e.created_at>=v_from) AND (v_to IS NULL OR e.created_at<v_to)) AS visits,
      count(DISTINCT nullif(e.session_id,'')) FILTER(WHERE (v_from IS NULL OR e.created_at>=v_from) AND (v_to IS NULL OR e.created_at<v_to)) AS visitors
    FROM public.cafe_visit_events e JOIN brands b ON b.id=e.cafe_id GROUP BY e.cafe_id
  ), menu AS (
    SELECT e.cafe_id,max(e.occurred_at) AS last_visit,
      max(e.occurred_at) FILTER(WHERE (v_from IS NULL OR e.occurred_at>=v_from) AND (v_to IS NULL OR e.occurred_at<v_to)) AS period_last,
      count(*) FILTER(WHERE (v_from IS NULL OR e.occurred_at>=v_from) AND (v_to IS NULL OR e.occurred_at<v_to)) AS visits,
      count(DISTINCT e.visitor_key) FILTER(WHERE (v_from IS NULL OR e.occurred_at>=v_from) AND (v_to IS NULL OR e.occurred_at<v_to)) AS visitors
    FROM brand_analytics_private.events e JOIN brands b ON b.id=e.cafe_id WHERE e.kind='menu_view' GROUP BY e.cafe_id
  ), accounts AS (
    SELECT cp.cafe_id,count(*) AS accounts,count(*) FILTER(WHERE s.source='storefront') AS storefront,
      count(*) FILTER(WHERE s.customer_id IS NULL) AS unknown
    FROM public.customer_profiles cp JOIN brands b ON b.id=cp.cafe_id
      LEFT JOIN operations_report_private.registration_sources s ON s.customer_id=cp.id AND s.cafe_id=cp.cafe_id
    WHERE (v_from IS NULL OR cp.created_at>=v_from) AND (v_to IS NULL OR cp.created_at<v_to) GROUP BY cp.cafe_id
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
    'registrationTrackingSince',(SELECT recording_started_at FROM operations_report_private.settings),
    'brands',coalesce(jsonb_agg(jsonb_build_object(
      'id',b.id,'name',b.name,'slug',b.slug,'status',b.status,
      'subscriptionStatus',coalesce(s.status::text,'none'),'planName',coalesce(s.plan_name,''),'expiresAt',s.expires_at,
      'subscribed',coalesce(s.status::text IN ('active','trialing') AND s.started_at<=now() AND (s.expires_at IS NULL OR s.expires_at>now()),false),
      'planFeatures',coalesce(to_jsonb(s.plan_features),'[]'::jsonb),'featureOverrides',coalesce(f.items,'[]'::jsonb),
      'lastStorefrontVisit',v.last_visit,'lastMenuVisit',m.last_visit,'periodLastStorefrontVisit',v.period_last,'periodLastMenuVisit',m.period_last,
      'metrics',jsonb_build_object('storefrontVisitors',coalesce(v.visitors,0),'storefrontVisits',coalesce(v.visits,0),
        'storefrontAccounts',coalesce(a.storefront,0),'accounts',coalesce(a.accounts,0),'unattributedAccounts',coalesce(a.unknown,0),
        'menuVisitors',coalesce(m.visitors,0),'menuVisits',coalesce(m.visits,0),'loyaltyCards',coalesce(c.cards,0),
        'loyaltyCustomers',coalesce(c.customers,0),'appleCards',coalesce(w.apple,0),'googleCards',coalesce(w.google,0),
        'stampOperations',coalesce(o.stamps,0),'rewardOperations',coalesce(o.rewards,0))
    ) ORDER BY b.name,b.id),'[]'::jsonb)) INTO v_result
    FROM brands b LEFT JOIN visits v ON v.cafe_id=b.id LEFT JOIN menu m ON m.cafe_id=b.id
      LEFT JOIN accounts a ON a.cafe_id=b.id LEFT JOIN cards c ON c.cafe_id=b.id LEFT JOIN wallets w ON w.cafe_id=b.id
      LEFT JOIN operations o ON o.cafe_id=b.id LEFT JOIN subscriptions s ON s.cafe_id=b.id LEFT JOIN overrides f ON f.cafe_id=b.id;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_admin_operations_report(date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_operations_report(date,date) TO authenticated;
COMMIT;
