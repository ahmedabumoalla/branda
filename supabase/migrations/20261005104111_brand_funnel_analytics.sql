-- Browser engagement is approximate; wallet issuance and confirmed operations
-- come exclusively from the existing server/database audit records.
BEGIN;

CREATE SCHEMA brand_analytics_private;
REVOKE ALL ON SCHEMA brand_analytics_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE brand_analytics_private.settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  recording_started_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO brand_analytics_private.settings DEFAULT VALUES;
CREATE TABLE brand_analytics_private.events (
  id uuid PRIMARY KEY,
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  visitor_key text NOT NULL CHECK (visitor_key ~ '^[a-f0-9]{64}$'),
  kind text NOT NULL CHECK (kind IN ('menu_view','menu_loyalty_click','loyalty_menu_visit','loyalty_qr_visit','loyalty_direct_visit')),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE brand_analytics_private.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_analytics_private.events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA brand_analytics_private FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX brand_analytics_cafe_time_idx ON brand_analytics_private.events(cafe_id,occurred_at DESC);
CREATE INDEX brand_analytics_visitor_time_idx ON brand_analytics_private.events(cafe_id,visitor_key,kind,occurred_at DESC);
CREATE INDEX wallet_customer_events_cafe_time_idx ON loyalty_audit_private.wallet_customer_events(cafe_id,occurred_at DESC);

CREATE FUNCTION public.record_brand_engagement(p_slug text,p_kind text,p_event_id uuid,p_visitor_key text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_cafe_id uuid;
BEGIN
  IF p_event_id IS NULL OR p_visitor_key IS NULL OR p_visitor_key !~ '^[a-f0-9]{64}$'
    OR p_slug IS NULL OR char_length(p_slug)>100 OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    OR p_kind IS NULL OR p_kind NOT IN ('menu_view','menu_loyalty_click','loyalty_menu_visit','loyalty_qr_visit','loyalty_direct_visit')
    THEN RAISE EXCEPTION 'Invalid engagement input' USING ERRCODE='22023'; END IF;
  SELECT c.id INTO v_cafe_id FROM public.cafes c WHERE c.slug=p_slug AND c.deleted_at IS NULL;
  IF v_cafe_id IS NULL THEN RETURN false; END IF;
  -- Match the independent publication gate of the standalone menu.
  IF p_kind IN ('menu_view','menu_loyalty_click') THEN
    IF NOT EXISTS(SELECT 1 FROM public.brand_feature_overrides WHERE cafe_id=v_cafe_id AND feature_id='standalone_menu' AND enabled)
      OR (p_kind='menu_loyalty_click' AND p_slug<>'rast') THEN RETURN false; END IF;
  ELSE
    IF p_slug<>'rast' OR NOT EXISTS(SELECT 1 FROM public.cafe_loyalty_programs p JOIN public.cafes c ON c.id=p.cafe_id
      WHERE p.cafe_id=v_cafe_id AND p.enabled AND c.status='active' AND c.is_public)
      THEN RETURN false; END IF;
  END IF;
  -- Serialize this browser/brand only: repeated effects/retries cannot amplify
  -- the count. Event IDs are additionally idempotent across all requests.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_cafe_id::text||p_visitor_key,0));
  IF EXISTS(SELECT 1 FROM brand_analytics_private.events WHERE cafe_id=v_cafe_id AND visitor_key=p_visitor_key
    AND kind=p_kind AND occurred_at>clock_timestamp()-interval '10 seconds') THEN RETURN false; END IF;
  INSERT INTO brand_analytics_private.events(id,cafe_id,visitor_key,kind)
    VALUES(p_event_id,v_cafe_id,p_visitor_key,p_kind) ON CONFLICT(id) DO NOTHING;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.record_brand_engagement(text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_brand_engagement(text,text,uuid,text) TO service_role;

CREATE FUNCTION public.get_admin_brand_analytics(p_cafe_id uuid,p_from date DEFAULT NULL,p_to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_from timestamptz; v_to timestamptz; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='platform_admin' AND status='active')
    THEN RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501'; END IF;
  IF p_cafe_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND deleted_at IS NULL)
    THEN RAISE EXCEPTION 'Brand unavailable' USING ERRCODE='22023'; END IF;
  IF p_from>p_to THEN RAISE EXCEPTION 'Invalid date range' USING ERRCODE='22023'; END IF;
  v_from:=p_from::timestamp AT TIME ZONE 'Asia/Riyadh';
  v_to:=(p_to+1)::timestamp AT TIME ZONE 'Asia/Riyadh';
  WITH engagement AS (
    SELECT kind,count(*) AS events,count(DISTINCT visitor_key) AS visitors
    FROM brand_analytics_private.events WHERE cafe_id=p_cafe_id
      AND (v_from IS NULL OR occurred_at>=v_from) AND (v_to IS NULL OR occurred_at<v_to) GROUP BY kind
  ), wallets AS (
    SELECT count(*) AS issuances,count(DISTINCT card_id) AS customers,
      count(*) FILTER(WHERE provider='apple') AS apple_downloads,
      count(DISTINCT card_id) FILTER(WHERE provider='apple') AS apple_customers,
      count(*) FILTER(WHERE provider='google') AS google_save_links,
      count(DISTINCT card_id) FILTER(WHERE provider='google') AS google_customers
    FROM loyalty_audit_private.wallet_customer_events WHERE cafe_id=p_cafe_id AND kind IN ('download','save_link')
      AND (v_from IS NULL OR occurred_at>=v_from) AND (v_to IS NULL OR occurred_at<v_to)
  ), confirmed AS (
    SELECT e.kind,count(*) AS operations,
      count(DISTINCT coalesce('profile:'||lc.customer_profile_id::text,'profile:'||r.customer_id::text,'card:'||e.card_id::text)) AS customers
    FROM public.loyalty_activity_events e
      LEFT JOIN public.loyalty_cards lc ON lc.id=e.card_id AND lc.cafe_id=e.cafe_id
      LEFT JOIN public.customer_reward_redemptions r ON r.id=e.source_redemption_id AND r.cafe_id=e.cafe_id
    WHERE e.cafe_id=p_cafe_id AND e.kind IN ('stamp','redeem') AND e.outcome='success'
      AND (v_from IS NULL OR e.occurred_at>=v_from) AND (v_to IS NULL OR e.occurred_at<v_to) GROUP BY e.kind
  )
  SELECT jsonb_build_object(
    'brandId',p_cafe_id,'from',p_from,'to',p_to,
    'engagementStartedAt',(SELECT recording_started_at FROM brand_analytics_private.settings),
    'walletStartedAt',(SELECT wallet_recording_started_at FROM loyalty_audit_private.settings),
    'operationsStartedAt',(SELECT recording_started_at FROM loyalty_audit_private.settings),
    'engagement',coalesce((SELECT jsonb_object_agg(kind,jsonb_build_object('events',events,'visitors',visitors)) FROM engagement),'{}'::jsonb),
    'wallet',jsonb_build_object('customers',w.customers,'issuances',w.issuances,'appleCustomers',w.apple_customers,
      'appleDownloads',w.apple_downloads,'googleCustomers',w.google_customers,'googleSaveLinks',w.google_save_links),
    'confirmed',coalesce((SELECT jsonb_object_agg(kind,jsonb_build_object('operations',operations,'customers',customers)) FROM confirmed),'{}'::jsonb)
  ) INTO v_result FROM wallets w;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_admin_brand_analytics(uuid,date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_brand_analytics(uuid,date,date) TO authenticated;
COMMIT;
