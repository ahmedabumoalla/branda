-- Read-only v2 preserves the existing report during application deployment
BEGIN;
CREATE FUNCTION public.admin_brand_contact_report_v2()
RETURNS TABLE (brand_id uuid, brand_name text, owner_phone text, joined_at timestamptz, account_status text,
 handoff_status text, trial_state text, trial_started_at timestamptz, trial_days integer, last_activity text, last_activity_at timestamptz,
 active_plan_names text, subscription_expires_at timestamptz, issued_card_count bigint, stamp_operation_count bigint,
 menu_visitor_count bigint, dashboard_login_count bigint, menu_tracking_since timestamptz, stamp_tracking_since timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $report$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='platform_admin' AND p.status='active') THEN
  RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501';
 END IF;
 RETURN QUERY
 WITH baseline AS MATERIALIZED (SELECT * FROM public.admin_brand_contact_report()),
 eligible AS (
  SELECT b.*,c.owner_user_id,c.slug,
   (h.state='sent' OR (h.sent_at IS NOT NULL AND nullif(h.provider_message_id,'') IS NOT NULL)) IS TRUE AS sent_proven
  FROM baseline b JOIN public.cafes c ON c.id=b.brand_id
  LEFT JOIN brand_onboarding_private.accounts h ON h.cafe_id=c.id
  WHERE nullif(regexp_replace(coalesce(b.owner_phone,''),'[^0-9]','','g'),'') IS NOT NULL
   AND c.slug::text NOT IN ('test-cafe','mens-barbershop-dev','khayal-aldeem')
   AND c.name !~* '(تجرب|(^|[[:space:]_-])(test|demo)([[:space:]_-]|$))'
   AND c.slug::text !~* '(^|[-_])(test|demo|dev)([-_]|$)'
   AND (h.state='sent' OR (h.sent_at IS NOT NULL AND nullif(h.provider_message_id,'') IS NOT NULL)
    OR (h.cafe_id IS NULL AND EXISTS(SELECT 1 FROM public.subscriptions s WHERE s.cafe_id=c.id AND s.activation_source='verified_owner_signup')
     AND EXISTS(SELECT 1 FROM public.cafe_operation_events e JOIN public.profiles p ON p.id=e.actor_id AND p.role<>'platform_admin'
      WHERE e.cafe_id=c.id AND e.actor_id=c.owner_user_id AND e.actor_type='brand_user' AND e.event_type='brand_login')))
 ), members AS (
  SELECT b.brand_id AS cafe_id,b.owner_user_id AS user_id FROM eligible b
  UNION SELECT m.cafe_id,m.user_id FROM public.cafe_members m JOIN eligible b ON b.brand_id=m.cafe_id
 ), logins AS (
  SELECT e.cafe_id,count(*) AS total FROM public.cafe_operation_events e
  JOIN members m ON m.cafe_id=e.cafe_id AND m.user_id=e.actor_id
  JOIN public.profiles p ON p.id=e.actor_id AND p.role<>'platform_admin'
  WHERE e.event_type='brand_login' AND e.actor_type='brand_user' GROUP BY e.cafe_id
 ), cards AS (
  SELECT c.cafe_id,count(*) AS total,max(c.issued_at) AS latest FROM public.loyalty_cards c JOIN eligible b ON b.brand_id=c.cafe_id GROUP BY c.cafe_id
 ), stamps AS (
  -- The append-only audit counts one successful operation, not the number of stamps granted
  SELECT e.cafe_id,count(*) AS total FROM public.loyalty_activity_events e JOIN eligible b ON b.brand_id=e.cafe_id
  WHERE e.kind='stamp' AND e.outcome='success' GROUP BY e.cafe_id
 ), visitors AS (
  SELECT e.cafe_id,count(DISTINCT e.visitor_key) AS total FROM brand_analytics_private.events e JOIN eligible b ON b.brand_id=e.cafe_id
  WHERE e.kind='menu_view' GROUP BY e.cafe_id
 ), current_plans AS (
  SELECT s.cafe_id,string_agg(DISTINCT p.name||CASE WHEN s.status='trialing' AND p.name NOT LIKE '%تجريب%' THEN ' (تجريبية)' ELSE '' END,'، ') AS names,
   min(s.expires_at) AS expires_at
  FROM public.subscriptions s JOIN public.platform_plans p ON p.id=s.plan_id AND p.active JOIN eligible b ON b.brand_id=s.cafe_id
  WHERE s.status IN ('active','trialing') AND s.activation_source IS DISTINCT FROM 'admin_prepared_trial'
   AND (s.started_at IS NULL OR s.started_at<=now()) AND (s.expires_at IS NULL OR s.expires_at>now()) GROUP BY s.cafe_id
 ), previous_plans AS (
  SELECT s.cafe_id,max(s.expires_at) AS expires_at FROM public.subscriptions s JOIN eligible b ON b.brand_id=s.cafe_id
  WHERE s.status IN ('active','trialing','expired') AND s.activation_source IS DISTINCT FROM 'admin_prepared_trial' AND s.expires_at<=now() GROUP BY s.cafe_id
 ), activity(cafe_id,at,label) AS (
  SELECT b.brand_id,b.last_activity_at,b.last_activity FROM eligible b
  UNION ALL SELECT c.cafe_id,c.latest,'إصدار بطاقة ولاء' FROM cards c
  UNION ALL SELECT e.cafe_id,e.occurred_at,CASE WHEN e.kind='stamp' THEN 'تسجيل ختم ولاء' ELSE 'صرف مكافأة ولاء' END
  FROM public.loyalty_activity_events e JOIN eligible b ON b.brand_id=e.cafe_id
  WHERE e.outcome='success' AND e.kind IN ('stamp','redeem') AND e.actor_type IN ('owner','cashier')
   AND (e.cashier_id IS NULL AND e.actor_type='owner' OR EXISTS(SELECT 1 FROM public.cafe_cashiers k
    LEFT JOIN public.profiles p ON p.id=k.owner_user_id LEFT JOIN public.profiles f ON f.id=k.finance_user_id
    WHERE k.id=e.cashier_id AND k.cafe_id=e.cafe_id AND p.role IS DISTINCT FROM 'platform_admin' AND f.role IS DISTINCT FROM 'platform_admin'))
 ), latest AS (SELECT DISTINCT ON(a.cafe_id) a.cafe_id,a.at,a.label FROM activity a WHERE a.at IS NOT NULL ORDER BY a.cafe_id,a.at DESC,a.label)
 SELECT b.brand_id,b.brand_name,b.owner_phone,b.joined_at,b.account_status,
  CASE WHEN b.sent_proven THEN 'أرسلت بيانات الدخول' ELSE 'تسجيل ذاتي ودخول موثّق' END,
  b.trial_state,b.trial_started_at,b.trial_days,l.label,l.at,
  coalesce(cp.names,'لا توجد باقة مفعلة'),CASE WHEN cp.cafe_id IS NOT NULL THEN cp.expires_at ELSE pp.expires_at END,
  coalesce(c.total,0),coalesce(s.total,0),
  CASE WHEN v.cafe_id IS NOT NULL OR platform_access_private.service_enabled(b.brand_id,'menu') THEN coalesce(v.total,0) ELSE NULL END,
  coalesce(g.total,0),(SELECT recording_started_at FROM brand_analytics_private.settings LIMIT 1),
  (SELECT recording_started_at FROM loyalty_audit_private.settings LIMIT 1)
 FROM eligible b LEFT JOIN current_plans cp ON cp.cafe_id=b.brand_id LEFT JOIN previous_plans pp ON pp.cafe_id=b.brand_id
 LEFT JOIN cards c ON c.cafe_id=b.brand_id LEFT JOIN stamps s ON s.cafe_id=b.brand_id LEFT JOIN visitors v ON v.cafe_id=b.brand_id
 LEFT JOIN logins g ON g.cafe_id=b.brand_id LEFT JOIN latest l ON l.cafe_id=b.brand_id;
END $report$;
REVOKE ALL ON FUNCTION public.admin_brand_contact_report_v2() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_brand_contact_report_v2() TO authenticated;
COMMENT ON FUNCTION public.admin_brand_contact_report_v2() IS 'Admin-only outreach: delivered access or verified self-registration with owner login, contact phone, no test tenants; recorded lifetime counts with tracking coverage';
NOTIFY pgrst,'reload schema';
COMMIT;
