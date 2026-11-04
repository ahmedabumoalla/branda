-- Read-only, admin-only brand loyalty analytics. No customer or reward writes.
BEGIN;
CREATE SCHEMA brand_loyalty_analytics_private;
REVOKE ALL ON SCHEMA brand_loyalty_analytics_private FROM PUBLIC,anon,authenticated,service_role;

CREATE VIEW brand_loyalty_analytics_private.identities WITH (security_invoker=true) AS
SELECT p.id,p.cafe_id,p.full_name,p.phone,p.email::text,p.status,p.blocked_at,p.created_at,
  CASE WHEN NOT p.phone_auth_conflict AND p.phone_normalized ~ '^9665[0-9]{8}$' THEN 'phone:'||p.phone_normalized
    WHEN p.user_id IS NOT NULL THEN 'account:'||p.user_id::text ELSE 'profile:'||p.id::text END AS identity_key,
  CASE WHEN NOT p.phone_auth_conflict AND p.phone_normalized ~ '^9665[0-9]{8}$' THEN 'phone'
    WHEN p.user_id IS NOT NULL THEN 'account' ELSE 'profile' END AS identity_match
FROM public.customer_profiles p JOIN public.cafes c ON c.id=p.cafe_id AND c.deleted_at IS NULL;

-- Successful operational events, with old ledger and reward records only when
-- their source was not captured in the immutable audit. Never count a scan.
CREATE VIEW brand_loyalty_analytics_private.activity WITH (security_invoker=true) AS
WITH audit AS (
 SELECT a.id,a.cafe_id,coalesce(l.customer_profile_id,d.customer_id,r.customer_id) AS profile_id,
   a.occurred_at AS at,a.kind,a.origin,a.stamps_delta,a.reward_name,a.source_event_id,
   a.source_redemption_id,a.card_id,e.invoice_barcode
 FROM public.loyalty_activity_events a
 LEFT JOIN public.loyalty_cards l ON l.id=a.card_id AND l.cafe_id=a.cafe_id
 LEFT JOIN public.customer_reward_redemptions d ON d.id=a.source_redemption_id AND d.cafe_id=a.cafe_id
 LEFT JOIN public.customer_reward_instances r ON r.id=d.reward_instance_id AND r.cafe_id=a.cafe_id
 LEFT JOIN public.loyalty_card_events e ON e.id=a.source_event_id AND e.cafe_id=a.cafe_id
 WHERE a.outcome='success' AND a.kind IN ('stamp','redeem')
   AND (a.kind<>'stamp' OR a.stamps_delta>0)
), all_events AS (
 SELECT 'audit:'||a.id::text AS id,a.cafe_id,a.profile_id,a.at,a.kind,a.origin,a.stamps_delta,a.reward_name,a.card_id,a.invoice_barcode FROM audit a
 UNION ALL
 SELECT 'ledger:'||e.id,e.cafe_id,l.customer_profile_id,e.created_at,e.event_type,'historical',e.stamps_added,NULL::text,e.card_id,e.invoice_barcode
 FROM public.loyalty_card_events e JOIN public.loyalty_cards l ON l.id=e.card_id AND l.cafe_id=e.cafe_id
 WHERE e.event_type IN ('stamp','redeem') AND (e.event_type<>'stamp' OR e.stamps_added>0)
 AND NOT EXISTS(SELECT 1 FROM public.loyalty_activity_events a WHERE a.source_event_id=e.id AND a.cafe_id=e.cafe_id)
 UNION ALL
 SELECT 'reward:'||r.id,r.cafe_id,coalesce(r.customer_id,l.customer_profile_id),r.redeemed_at,'redeem','historical',0,r.reward_title,r.loyalty_card_id,r.reward_code
 FROM public.customer_reward_instances r LEFT JOIN public.loyalty_cards l ON l.id=r.loyalty_card_id AND l.cafe_id=r.cafe_id
 WHERE r.status='redeemed' AND r.redeemed_at IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM public.loyalty_activity_events a
   LEFT JOIN public.customer_reward_redemptions d ON d.id=a.source_redemption_id AND d.cafe_id=a.cafe_id
   LEFT JOIN public.loyalty_card_events e ON e.id=a.source_event_id AND e.cafe_id=a.cafe_id
   WHERE a.cafe_id=r.cafe_id AND a.kind='redeem' AND a.outcome='success'
   AND (d.reward_instance_id=r.id OR (e.card_id=r.loyalty_card_id AND e.invoice_barcode=r.reward_code)))
 AND NOT EXISTS(SELECT 1 FROM public.loyalty_card_events e WHERE e.cafe_id=r.cafe_id AND e.card_id=r.loyalty_card_id
   AND e.event_type='redeem' AND e.invoice_barcode=r.reward_code)
)
SELECT e.id,e.cafe_id,i.identity_key,e.at,e.kind,e.origin,e.stamps_delta,e.reward_name,e.card_id,e.invoice_barcode
FROM all_events e JOIN brand_loyalty_analytics_private.identities i ON i.id=e.profile_id AND i.cafe_id=e.cafe_id;

CREATE FUNCTION brand_loyalty_analytics_private.events(p_brand uuid,p_as_of timestamptz)
RETURNS TABLE(id text,cafe_id uuid,identity_key text,at timestamptz,kind text,origin text,stamps_delta integer,reward_name text)
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT a.id,a.cafe_id,a.identity_key,a.at,a.kind,a.origin,a.stamps_delta,a.reward_name
 FROM brand_loyalty_analytics_private.activity a
 WHERE (p_brand IS NULL OR a.cafe_id=p_brand) AND a.at<=p_as_of
 AND (a.kind<>'stamp' OR NOT EXISTS(
   SELECT 1 FROM public.loyalty_card_events v WHERE v.cafe_id=a.cafe_id AND v.card_id=a.card_id
   AND v.event_type='void' AND v.invoice_barcode IS NOT NULL AND v.invoice_barcode=a.invoice_barcode
   AND v.created_at>=a.at AND v.created_at<=p_as_of))
$$;

CREATE FUNCTION brand_loyalty_analytics_private.customers(p_brand uuid,p_as_of timestamptz)
RETURNS TABLE(id uuid,brand_id uuid,identity_key text,joined_at timestamptz,card_issued_at timestamptz,
 last_visit_at timestamptz,visit_days bigint,average_gap numeric,first_return_at timestamptz,
 is_inactive boolean,is_loyal boolean,has_wallet boolean,row_data jsonb)
LANGUAGE sql STABLE SET search_path='' AS $$
WITH identities AS MATERIALIZED (
 SELECT * FROM brand_loyalty_analytics_private.identities WHERE (p_brand IS NULL OR cafe_id=p_brand) AND created_at<=p_as_of
), members AS (
 SELECT cafe_id,identity_key,(array_agg(id ORDER BY created_at,id))[1] AS id,
   (array_agg(full_name ORDER BY created_at DESC,id))[1] AS name,
   (array_agg(phone ORDER BY created_at DESC,id))[1] AS phone,
   (array_agg(email ORDER BY created_at DESC,id))[1] AS email,min(identity_match) AS identity_match,
   CASE WHEN bool_or(status='blocked' OR blocked_at IS NOT NULL) THEN 'blocked'
     WHEN bool_or(status='suspended') THEN 'suspended' ELSE 'active' END AS status,min(created_at) AS joined_at
 FROM identities GROUP BY cafe_id,identity_key
), cards AS MATERIALIZED (
 SELECT c.*,i.identity_key FROM public.loyalty_cards c JOIN identities i ON i.id=c.customer_profile_id AND i.cafe_id=c.cafe_id WHERE c.issued_at<=p_as_of
), card_totals AS (
 SELECT cafe_id,identity_key,min(issued_at) AS issued_at,count(*) AS cards,sum(stamps_in_cycle) AS current_stamps,
 sum(total_purchases) AS total_stamps FROM cards GROUP BY cafe_id,identity_key
), events AS MATERIALIZED (
 SELECT * FROM brand_loyalty_analytics_private.events(p_brand,p_as_of)
), visits AS MATERIALIZED (
 SELECT cafe_id,identity_key,(at AT TIME ZONE 'Asia/Riyadh')::date AS day,min(at) AS at
 FROM events GROUP BY cafe_id,identity_key,(at AT TIME ZONE 'Asia/Riyadh')::date
), visit_totals AS (
 SELECT v.cafe_id,v.identity_key,count(*) AS days,
 CASE WHEN count(*)>1 THEN round((max(day)-min(day))::numeric/(count(*)-1),2) END AS average_gap,
 min(v.at) FILTER(WHERE v.day>(c.issued_at AT TIME ZONE 'Asia/Riyadh')::date) AS first_return_at
 FROM visits v LEFT JOIN card_totals c USING(cafe_id,identity_key) GROUP BY v.cafe_id,v.identity_key
), event_totals AS (
 SELECT cafe_id,identity_key,max(at) AS last_visit_at,max(at) FILTER(WHERE kind='stamp') AS last_stamp_at,
 max(at) FILTER(WHERE kind='redeem') AS last_redemption_at,count(*) FILTER(WHERE kind='redeem') AS redeemed
 FROM events GROUP BY cafe_id,identity_key
), wallets AS (
 SELECT c.cafe_id,c.identity_key,
 min(w.occurred_at) FILTER(WHERE w.provider='apple' AND w.kind='download') AS first_download,
 max(w.occurred_at) FILTER(WHERE w.provider='apple' AND w.kind='download') AS last_download,
 count(*) FILTER(WHERE w.provider='apple' AND w.kind='download') AS downloads,
 min(w.occurred_at) FILTER(WHERE w.provider='google' AND w.kind='save_link') AS first_google_save,
 max(w.occurred_at) FILTER(WHERE w.provider='google' AND w.kind='save_link') AS last_google_save,
 count(*) FILTER(WHERE w.provider='google' AND w.kind='save_link') AS google_saves,
 min(w.occurred_at) FILTER(WHERE w.provider='apple' AND w.kind='installed') AS first_installed,
 max(w.occurred_at) FILTER(WHERE w.provider='apple' AND w.kind='installed') AS last_installed,
 bool_or(w.kind IN ('download','save_link','installed')) AS has_wallet
 FROM cards c JOIN loyalty_audit_private.wallet_customer_events w ON w.card_id=c.id AND w.cafe_id=c.cafe_id
 WHERE w.occurred_at<=p_as_of GROUP BY c.cafe_id,c.identity_key
), devices AS (
 SELECT c.cafe_id,c.identity_key,count(*) AS total FROM cards c JOIN public.wallet_apple_registrations r ON r.card_id=c.id AND r.cafe_id=c.cafe_id
 GROUP BY c.cafe_id,c.identity_key
), metrics AS (
 SELECT m.*,c.issued_at,coalesce(c.cards,0) AS cards,coalesce(c.current_stamps,0) AS current_stamps,coalesce(c.total_stamps,0) AS total_stamps,
 e.last_visit_at,e.last_stamp_at,e.last_redemption_at,coalesce(e.redeemed,0) AS redeemed,
 coalesce(v.days,0) AS visit_days,v.average_gap,v.first_return_at,
 greatest(0,floor(extract(epoch FROM p_as_of-coalesce(e.last_visit_at,c.issued_at,m.joined_at))/86400))::integer AS inactive_days,
 coalesce(c.issued_at,m.joined_at)<p_as_of-interval '10 days' AND coalesce(e.last_visit_at,c.issued_at,m.joined_at)<p_as_of-interval '10 days' AS is_inactive,
 coalesce(v.days>=3 AND v.average_gap<=4 AND e.last_visit_at>=p_as_of-interval '10 days',false) AS is_loyal,
 coalesce(w.has_wallet,false) AS has_wallet,
 jsonb_build_object('firstDownloadAt',w.first_download,'lastDownloadAt',w.last_download,'downloads',coalesce(w.downloads,0),
   'firstGoogleSaveAt',w.first_google_save,'lastGoogleSaveAt',w.last_google_save,'googleSaveLinks',coalesce(w.google_saves,0),
   'firstInstalledAt',w.first_installed,'lastInstalledAt',w.last_installed,'installedDevices',coalesce(d.total,0)) AS wallet
 FROM members m LEFT JOIN card_totals c USING(cafe_id,identity_key) LEFT JOIN event_totals e USING(cafe_id,identity_key)
 LEFT JOIN visit_totals v USING(cafe_id,identity_key) LEFT JOIN wallets w USING(cafe_id,identity_key) LEFT JOIN devices d USING(cafe_id,identity_key)
)
SELECT m.id,m.cafe_id,m.identity_key,m.joined_at,m.issued_at,m.last_visit_at,m.visit_days,m.average_gap,m.first_return_at,m.is_inactive,m.is_loyal,m.has_wallet,
 jsonb_build_object('id',m.id,'name',m.name,'phone',m.phone,'email',coalesce(m.email,''),'status',m.status,'identityMatch',m.identity_match,
 'joinedAt',m.joined_at,'cardIssuedAt',m.issued_at,'cardCount',m.cards,'currentStamps',m.current_stamps,'totalStamps',m.total_stamps,
 'rewardsRedeemed',m.redeemed,'lastStampAt',m.last_stamp_at,'lastRedemptionAt',m.last_redemption_at,'lastVisitAt',m.last_visit_at,
 'inactiveDays',m.inactive_days,'isInactive',m.is_inactive,'visitDays',m.visit_days,'averageVisitGapDays',m.average_gap,'isLoyal',m.is_loyal,
 'firstReturnAt',m.first_return_at,'wallet',m.wallet)
FROM metrics m
$$;

CREATE FUNCTION brand_loyalty_analytics_private.brand(p_brand uuid,p_days integer,p_as_of timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
WITH customers AS MATERIALIZED(SELECT * FROM brand_loyalty_analytics_private.customers(p_brand,p_as_of)),
retention AS (
 SELECT d.days,count(c.id) FILTER(WHERE c.card_issued_at<=p_as_of-make_interval(days=>d.days)) AS eligible,
 count(c.id) FILTER(WHERE c.card_issued_at<=p_as_of-make_interval(days=>d.days) AND c.first_return_at<=c.card_issued_at+make_interval(days=>d.days)) AS retained
 FROM (VALUES(7),(14),(30))d(days) LEFT JOIN customers c ON c.card_issued_at IS NOT NULL GROUP BY d.days
), period_visits AS (
 SELECT DISTINCT e.identity_key,(e.at AT TIME ZONE 'Asia/Riyadh')::date AS day FROM brand_loyalty_analytics_private.events(p_brand,p_as_of) e
 WHERE e.at>=((p_as_of AT TIME ZONE 'Asia/Riyadh')::date-(p_days-1))::timestamp AT TIME ZONE 'Asia/Riyadh'
)
SELECT jsonb_build_object('id',b.id,'name',b.name,'slug',b.slug,'category',coalesce(b.business_category,'cafes_coffee'),
 'registeredCustomers',count(c.id),'cardholders',count(c.id) FILTER(WHERE c.card_issued_at IS NOT NULL),
 'activeCustomers',count(c.id) FILTER(WHERE c.last_visit_at>=p_as_of-interval '10 days'),
 'inactiveCustomers',count(c.id) FILTER(WHERE c.is_inactive),'returningCustomers',count(c.id) FILTER(WHERE c.visit_days>=2),
 'loyalCustomers',count(c.id) FILTER(WHERE c.is_loyal),'walletCustomers',count(c.id) FILTER(WHERE c.has_wallet),
 'visitsInPeriod',(SELECT count(*) FROM period_visits),'averageVisitGapDays',round(avg(c.average_gap),2),'lastVisitAt',max(c.last_visit_at),
 'retention',(SELECT jsonb_agg(jsonb_build_object('days',days,'eligible',eligible,'retained',retained,'rate',CASE WHEN eligible>0 THEN round(100.0*retained/eligible,1) END) ORDER BY days) FROM retention))
FROM public.cafes b LEFT JOIN customers c ON true WHERE b.id=p_brand AND b.deleted_at IS NULL GROUP BY b.id
$$;

CREATE FUNCTION brand_loyalty_analytics_private.assert_admin(p_days integer,p_as_of timestamptz)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='platform_admin' AND status='active') THEN
   RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501'; END IF;
 IF p_days IS NULL OR p_days NOT IN(7,30,90,365) OR (p_as_of IS NOT NULL AND (p_as_of>now() OR p_as_of<now()-interval '24 hours')) THEN
   RAISE EXCEPTION 'Invalid analytics snapshot' USING ERRCODE='22023'; END IF;
 RETURN coalesce(p_as_of,now());
END $$;

CREATE FUNCTION public.get_admin_brand_customer_analytics(p_days integer DEFAULT 30,p_as_of timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_as_of timestamptz; v_result jsonb;
BEGIN
 v_as_of:=brand_loyalty_analytics_private.assert_admin(p_days,p_as_of);
 WITH brands AS MATERIALIZED(SELECT brand_loyalty_analytics_private.brand(id,p_days,v_as_of) AS row_data FROM public.cafes WHERE deleted_at IS NULL)
 SELECT jsonb_build_object('generatedAt',v_as_of,'timeZone','Asia/Riyadh','days',p_days,
 'recordingStartedAt',(SELECT recording_started_at FROM loyalty_audit_private.settings),
 'walletRecordingStartedAt',(SELECT wallet_recording_started_at FROM loyalty_audit_private.settings),
 'brands',coalesce(jsonb_agg(row_data ORDER BY row_data->>'name',row_data->>'id'),'[]'::jsonb),
 'summary',jsonb_build_object('brands',count(*),'registeredCustomers',coalesce(sum((row_data->>'registeredCustomers')::bigint),0),
 'cardholders',coalesce(sum((row_data->>'cardholders')::bigint),0),'activeCustomers',coalesce(sum((row_data->>'activeCustomers')::bigint),0),
 'inactiveCustomers',coalesce(sum((row_data->>'inactiveCustomers')::bigint),0),'returningCustomers',coalesce(sum((row_data->>'returningCustomers')::bigint),0),
 'loyalCustomers',coalesce(sum((row_data->>'loyalCustomers')::bigint),0),'walletCustomers',coalesce(sum((row_data->>'walletCustomers')::bigint),0)))
 INTO v_result FROM brands;
 RETURN v_result;
END $$;

CREATE FUNCTION public.get_admin_brand_analytics_detail(p_brand_id uuid,p_days integer DEFAULT 30,p_search text DEFAULT '',
 p_segment text DEFAULT 'all',p_sort text DEFAULT 'recent',p_page integer DEFAULT 1,p_page_size integer DEFAULT 25,p_as_of timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_as_of timestamptz; v_brand jsonb; v_result jsonb;
BEGIN
 v_as_of:=brand_loyalty_analytics_private.assert_admin(p_days,p_as_of);
 IF p_brand_id IS NULL OR p_search IS NULL OR length(p_search)>100 OR p_segment IS NULL OR p_segment NOT IN('all','inactive','loyal','returning','new','no_card')
 OR p_sort IS NULL OR p_sort NOT IN('recent','inactive','visits','name') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000
 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid customer filters' USING ERRCODE='22023'; END IF;
 v_brand:=brand_loyalty_analytics_private.brand(p_brand_id,p_days,v_as_of);
 IF v_brand IS NULL THEN RAISE EXCEPTION 'Brand not found' USING ERRCODE='P0002'; END IF;
 WITH customers AS MATERIALIZED(SELECT * FROM brand_loyalty_analytics_private.customers(p_brand_id,v_as_of)),
 filtered AS MATERIALIZED(
 SELECT * FROM customers c WHERE (btrim(p_search)='' OR position(lower(btrim(p_search)) IN lower(concat_ws(' ',row_data->>'name',row_data->>'phone',row_data->>'email')))>0)
 AND (p_segment='all' OR p_segment='inactive' AND c.is_inactive OR p_segment='loyal' AND c.is_loyal OR p_segment='returning' AND c.visit_days>=2
   OR p_segment='new' AND coalesce(c.card_issued_at,c.joined_at)>=v_as_of-interval '10 days' OR p_segment='no_card' AND c.card_issued_at IS NULL)
 ), paged AS (
 SELECT row_data FROM filtered ORDER BY CASE WHEN p_sort='name' THEN row_data->>'name' END ASC,
 CASE WHEN p_sort='inactive' THEN (row_data->>'inactiveDays')::integer END DESC,
 CASE WHEN p_sort='visits' THEN visit_days END DESC,CASE WHEN p_sort='recent' THEN last_visit_at END DESC NULLS LAST,id LIMIT p_page_size OFFSET(p_page-1)*p_page_size
 ), visits AS (
 SELECT identity_key,(at AT TIME ZONE 'Asia/Riyadh')::date AS day,min(at) AS first_at
 FROM brand_loyalty_analytics_private.events(p_brand_id,v_as_of)
 WHERE at>=((v_as_of AT TIME ZONE 'Asia/Riyadh')::date-(p_days-1))::timestamp AT TIME ZONE 'Asia/Riyadh'
 GROUP BY identity_key,(at AT TIME ZONE 'Asia/Riyadh')::date
 ), peaks AS (
 SELECT extract(dow FROM day)::integer AS day,extract(hour FROM first_at AT TIME ZONE 'Asia/Riyadh')::integer AS hour,count(*) AS visits
 FROM visits GROUP BY 1,2
 ), cohort_counts AS (
 SELECT to_char(c.card_issued_at AT TIME ZONE 'Asia/Riyadh','YYYY-MM') AS month,d.days,count(*) AS issued,
 count(*) FILTER(WHERE c.card_issued_at<=v_as_of-make_interval(days=>d.days)) AS eligible,
 count(*) FILTER(WHERE c.card_issued_at<=v_as_of-make_interval(days=>d.days) AND c.first_return_at<=c.card_issued_at+make_interval(days=>d.days)) AS retained
 FROM customers c CROSS JOIN(VALUES(7),(14),(30))d(days) WHERE c.card_issued_at IS NOT NULL GROUP BY 1,2
 ), cohorts AS (
 SELECT month,max(issued) AS issued,jsonb_agg(jsonb_build_object('days',days,'eligible',eligible,'retained',retained,
 'rate',CASE WHEN eligible>0 THEN round(100.0*retained/eligible,1) END) ORDER BY days) AS retention FROM cohort_counts GROUP BY month
 )
 SELECT jsonb_build_object('generatedAt',v_as_of,'days',p_days,'brand',v_brand,'customers',coalesce((SELECT jsonb_agg(row_data) FROM paged),'[]'::jsonb),
 'total',(SELECT count(*) FROM filtered),'page',p_page,'pageSize',p_page_size,
 'heatmap',(SELECT jsonb_agg(jsonb_build_object('day',d.day,'hour',h.hour,'visits',coalesce(p.visits,0)) ORDER BY d.day,h.hour)
   FROM generate_series(0,6)d(day) CROSS JOIN generate_series(0,23)h(hour) LEFT JOIN peaks p ON p.day=d.day AND p.hour=h.hour),
 'cohorts',coalesce((SELECT jsonb_agg(jsonb_build_object('month',month,'issued',issued,'retention',retention) ORDER BY month DESC) FROM cohorts),'[]'::jsonb)) INTO v_result;
 RETURN v_result;
END $$;

CREATE FUNCTION public.get_admin_brand_analytics_customer(p_brand_id uuid,p_customer_id uuid,p_page integer DEFAULT 1,p_as_of timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_as_of timestamptz; v_customer jsonb; v_key text; v_result jsonb;
BEGIN
 v_as_of:=brand_loyalty_analytics_private.assert_admin(30,p_as_of);
 IF p_brand_id IS NULL OR p_customer_id IS NULL OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'Invalid customer filters' USING ERRCODE='22023'; END IF;
 SELECT row_data,identity_key INTO v_customer,v_key FROM brand_loyalty_analytics_private.customers(p_brand_id,v_as_of) WHERE id=p_customer_id;
 IF v_customer IS NULL THEN RAISE EXCEPTION 'Customer not found' USING ERRCODE='P0002'; END IF;
 WITH cards AS MATERIALIZED(
 SELECT c.* FROM public.loyalty_cards c JOIN brand_loyalty_analytics_private.identities i ON i.id=c.customer_profile_id AND i.cafe_id=c.cafe_id
 WHERE c.cafe_id=p_brand_id AND i.identity_key=v_key AND c.issued_at<=v_as_of
 ), events AS MATERIALIZED(
 SELECT id,at,kind,NULL::text AS provider,origin,stamps_delta,reward_name FROM brand_loyalty_analytics_private.events(p_brand_id,v_as_of) WHERE identity_key=v_key
 UNION ALL SELECT 'issued:'||id,issued_at,'card_issued',NULL,'historical',0,NULL FROM cards
 UNION ALL SELECT 'wallet:'||w.id,w.occurred_at,w.kind,w.provider,w.origin,0,NULL FROM loyalty_audit_private.wallet_customer_events w JOIN cards c ON c.id=w.card_id AND c.cafe_id=w.cafe_id WHERE w.occurred_at<=v_as_of
 ), paged AS(SELECT * FROM events ORDER BY at DESC,id LIMIT 25 OFFSET(p_page-1)*25)
 SELECT jsonb_build_object('generatedAt',v_as_of,'customer',v_customer,'events',coalesce((SELECT jsonb_agg(jsonb_build_object(
 'id',id,'at',at,'kind',kind,'provider',provider,'origin',origin,'stampsDelta',stamps_delta,'rewardName',reward_name) ORDER BY at DESC,id) FROM paged),'[]'::jsonb),
 'total',(SELECT count(*) FROM events),'page',p_page,'pageSize',25) INTO v_result;
 RETURN v_result;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA brand_loyalty_analytics_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA brand_loyalty_analytics_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_admin_brand_customer_analytics(integer,timestamptz),
 public.get_admin_brand_analytics_detail(uuid,integer,text,text,text,integer,integer,timestamptz),
 public.get_admin_brand_analytics_customer(uuid,uuid,integer,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_brand_customer_analytics(integer,timestamptz),
 public.get_admin_brand_analytics_detail(uuid,integer,text,text,text,integer,integer,timestamptz),
 public.get_admin_brand_analytics_customer(uuid,uuid,integer,timestamptz) TO authenticated;
COMMIT;

