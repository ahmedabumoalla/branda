BEGIN;
CREATE SCHEMA customer_analytics_private;
REVOKE ALL ON SCHEMA customer_analytics_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE customer_analytics_private.settings(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),recording_started_at timestamptz NOT NULL DEFAULT now());
INSERT INTO customer_analytics_private.settings DEFAULT VALUES;
CREATE TABLE customer_analytics_private.sessions(
 id uuid PRIMARY KEY,user_id uuid NOT NULL,cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('menu_view','menu_loyalty_click','loyalty_menu_visit','loyalty_qr_visit','loyalty_direct_visit')),
 device jsonb NOT NULL,started_at timestamptz NOT NULL DEFAULT clock_timestamp(),last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reported_at timestamptz NOT NULL DEFAULT clock_timestamp(),reported_seconds integer NOT NULL DEFAULT 0,
 active_seconds integer NOT NULL DEFAULT 0 CHECK(active_seconds BETWEEN 0 AND 21600)
);
CREATE INDEX ON customer_analytics_private.sessions(user_id,last_seen_at DESC);
CREATE INDEX ON customer_analytics_private.sessions(cafe_id,last_seen_at DESC);
CREATE TABLE customer_analytics_private.meters(user_id uuid PRIMARY KEY,credited_at timestamptz NOT NULL);
ALTER TABLE customer_analytics_private.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_analytics_private.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_analytics_private.meters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA customer_analytics_private FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.record_customer_activity(p_user_id uuid,p_slug text,p_id uuid,p_kind text,p_seconds integer,p_device jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_cafe uuid; v_now timestamptz:=clock_timestamp(); v_old customer_analytics_private.sessions; v_credit timestamptz; v_delta integer;
BEGIN
 IF p_user_id IS NULL OR p_id IS NULL OR p_seconds IS NULL OR p_seconds NOT BETWEEN 0 AND 21600 OR p_kind NOT IN ('menu_view','menu_loyalty_click','loyalty_menu_visit','loyalty_qr_visit','loyalty_direct_visit')
 OR jsonb_typeof(p_device)<>'object' OR octet_length(p_device::text)>600 THEN RAISE EXCEPTION 'invalid telemetry'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.customer_profiles WHERE user_id=p_user_id AND status='active' AND blocked_at IS NULL AND NOT coalesce(phone_auth_conflict,false)) THEN RETURN; END IF;
 SELECT id INTO v_cafe FROM public.cafes WHERE slug=p_slug AND deleted_at IS NULL;
 IF v_cafe IS NULL THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,718));
 SELECT * INTO v_old FROM customer_analytics_private.sessions WHERE id=p_id;
 IF FOUND THEN
  IF v_old.user_id<>p_user_id OR v_old.cafe_id<>v_cafe OR v_old.kind<>p_kind THEN RAISE EXCEPTION 'session mismatch'; END IF;
  IF p_seconds<=v_old.reported_seconds THEN RETURN; END IF;
  SELECT credited_at INTO v_credit FROM customer_analytics_private.meters WHERE user_id=p_user_id;
  v_delta:=greatest(0,least(p_seconds-v_old.reported_seconds,45,floor(extract(epoch FROM v_now-v_old.reported_at))::integer,floor(extract(epoch FROM v_now-coalesce(v_credit,v_old.reported_at)))::integer));
  UPDATE customer_analytics_private.sessions SET reported_seconds=p_seconds,reported_at=v_now,
   last_seen_at=CASE WHEN v_delta>0 THEN v_now ELSE last_seen_at END,active_seconds=least(21600,active_seconds+v_delta) WHERE id=p_id;
 ELSE
  IF (SELECT count(*) FROM customer_analytics_private.sessions WHERE user_id=p_user_id AND started_at>v_now-interval '10 minutes')>=40 THEN RETURN; END IF;
  INSERT INTO customer_analytics_private.sessions(id,user_id,cafe_id,kind,device,reported_seconds) VALUES(p_id,p_user_id,v_cafe,p_kind,p_device,p_seconds);
 END IF;
 INSERT INTO customer_analytics_private.meters VALUES(p_user_id,v_now) ON CONFLICT(user_id) DO UPDATE SET credited_at=excluded.credited_at;
END $$;
REVOKE ALL ON FUNCTION public.record_customer_activity(uuid,text,uuid,text,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_customer_activity(uuid,text,uuid,text,integer,jsonb) TO service_role;

CREATE VIEW customer_analytics_private.events AS
 SELECT DISTINCT r.identity_key,'web:'||s.id::text AS id,s.last_seen_at AS at,s.kind,'browser'::text AS source,c.name AS brand_name,'success'::text AS outcome,s.active_seconds,s.device,NULL::text AS detail
 FROM customer_analytics_private.sessions s JOIN public.cafes c ON c.id=s.cafe_id AND c.deleted_at IS NULL
 JOIN LATERAL(SELECT p.id FROM public.customer_profiles p JOIN public.cafes pc ON pc.id=p.cafe_id AND pc.deleted_at IS NULL
   WHERE p.user_id=s.user_id AND NOT coalesce(p.phone_auth_conflict,false) ORDER BY p.created_at DESC,p.id LIMIT 1)p ON true
 JOIN loyalty_audit_private.brand_customer_rows r ON r.id=p.id
 UNION ALL
 SELECT r.identity_key,'audit:'||a.id::text,a.occurred_at,a.kind,'loyalty',c.name,a.outcome,NULL,NULL,a.actor_name
 FROM public.loyalty_activity_events a LEFT JOIN public.loyalty_cards l ON l.id=a.card_id AND l.cafe_id=a.cafe_id
 LEFT JOIN public.customer_reward_redemptions d ON d.id=a.source_redemption_id AND d.cafe_id=a.cafe_id
 JOIN loyalty_audit_private.brand_customer_rows r ON r.id=coalesce(l.customer_profile_id,d.customer_id)
 JOIN public.cafes c ON c.id=a.cafe_id AND c.deleted_at IS NULL
 UNION ALL
 SELECT r.identity_key,'wallet:'||w.id::text,w.occurred_at,w.kind,'wallet',r.brand_name,'success',NULL,NULL,w.provider
 FROM loyalty_audit_private.wallet_customer_events w JOIN public.loyalty_cards l ON l.id=w.card_id AND l.cafe_id=w.cafe_id
 JOIN loyalty_audit_private.brand_customer_rows r ON r.id=l.customer_profile_id
 UNION ALL
 SELECT r.identity_key,'joined:'||r.id::text,(r.row_data->>'joinedAt')::timestamptz,'joined','loyalty',r.brand_name,'success',NULL,NULL,NULL
 FROM loyalty_audit_private.brand_customer_rows r
 UNION ALL
 SELECT r.identity_key,'issued:'||l.id::text,l.issued_at,'card_issued','loyalty',r.brand_name,'success',NULL,NULL,NULL
 FROM public.loyalty_cards l JOIN loyalty_audit_private.brand_customer_rows r ON r.id=l.customer_profile_id
 UNION ALL
 SELECT r.identity_key,'reward:'||w.id::text,w.issued_at,'reward_earned','loyalty',r.brand_name,'success',NULL,NULL,w.reward_title
 FROM public.customer_reward_instances w LEFT JOIN public.loyalty_cards l ON l.id=w.loyalty_card_id AND l.cafe_id=w.cafe_id
 JOIN loyalty_audit_private.brand_customer_rows r ON r.id=coalesce(w.customer_id,l.customer_profile_id) AND r.brand_id=w.cafe_id;

CREATE VIEW customer_analytics_private.customers AS
 WITH memberships AS (
 SELECT identity_key,(array_agg(id ORDER BY (row_data->>'joinedAt')::timestamptz,id))[1] AS id,
 (array_agg(row_data ORDER BY (row_data->>'joinedAt')::timestamptz DESC,id))[1] AS info,
 min((row_data->>'joinedAt')::timestamptz) AS joined_at,
 CASE WHEN count(DISTINCT row_data->>'status')=1 THEN min(row_data->>'status') ELSE 'mixed' END AS status,
 string_agg(search_text,' ') AS search_text,array_agg(DISTINCT brand_id) AS brand_ids,
 jsonb_agg(jsonb_build_object('id',brand_id,'name',brand_name,'slug',brand_slug,'joinedAt',row_data->>'joinedAt','status',row_data->>'status','stamps',stamps,'scans',scans,'rewards',rewards_earned) ORDER BY brand_name) AS brands,
 count(DISTINCT brand_id)::integer AS brand_count,sum(stamps)::integer AS stamps,sum(scans)::integer AS scans,sum(rewards_earned)::integer AS rewards
 FROM loyalty_audit_private.brand_customer_rows GROUP BY identity_key
 ), browsing AS (
 SELECT identity_key,max(at) AS last_seen_at,sum(active_seconds)::integer AS active_seconds,
 count(*) FILTER(WHERE kind<>'menu_loyalty_click')::integer AS sessions,
 count(*) FILTER(WHERE kind='menu_view')::integer AS menu_sessions,
 count(*) FILTER(WHERE kind LIKE 'loyalty_%')::integer AS loyalty_sessions,
 (array_agg(device ORDER BY at DESC,id))[1] AS device
 FROM customer_analytics_private.events WHERE source='browser' GROUP BY identity_key
 )
 SELECT m.*,e.at AS last_activity_at,b.last_seen_at,b.active_seconds,b.sessions,
 jsonb_build_object('id',m.id,'name',m.info->>'name','phone',m.info->>'phone','email',m.info->'email',
 'status',m.status,'joinedAt',m.joined_at,'brands',m.brands,'brandCount',m.brand_count,'identityMatch',m.info->>'identityMatch',
 'lastActivity',CASE WHEN e.at IS NULL THEN NULL ELSE jsonb_build_object('at',e.at,'kind',e.kind,'brandName',e.brand_name,'source',e.source) END,
 'lastSeenAt',b.last_seen_at,'device',b.device,'activeSeconds',CASE WHEN b.sessions>0 THEN b.active_seconds ELSE NULL END,
 'sessions',coalesce(b.sessions,0),'menuSessions',coalesce(b.menu_sessions,0),'loyaltySessions',coalesce(b.loyalty_sessions,0),
 'scans',m.scans,'stamps',m.stamps,'rewards',m.rewards) AS row_data
 FROM memberships m LEFT JOIN browsing b USING(identity_key)
 LEFT JOIN LATERAL(SELECT * FROM customer_analytics_private.events x WHERE x.identity_key=m.identity_key ORDER BY at DESC,id LIMIT 1)e ON true;
REVOKE ALL ON ALL TABLES IN SCHEMA customer_analytics_private FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_customer_intelligence(p_search text DEFAULT '',p_brand uuid DEFAULT NULL,p_segment text DEFAULT 'all',p_sort text DEFAULT 'recent',p_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='platform_admin' AND status='active') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_search IS NULL OR length(p_search)>100 OR p_segment IS NULL OR p_segment NOT IN ('all','recent','shared','unmeasured') OR p_sort IS NULL OR p_sort NOT IN ('recent','name','time') THEN RAISE EXCEPTION 'invalid filters'; END IF;
 WITH filtered AS MATERIALIZED(SELECT * FROM customer_analytics_private.customers WHERE
  (p_search='' OR position(lower(p_search) IN search_text)>0) AND (p_brand IS NULL OR p_brand=ANY(brand_ids)) AND
  (p_segment='all' OR p_segment='shared' AND brand_count>1 OR p_segment='recent' AND last_activity_at>now()-interval '7 days' OR p_segment='unmeasured' AND coalesce(sessions,0)=0)),
 paged AS(SELECT * FROM filtered ORDER BY CASE WHEN p_sort='name' THEN row_data->>'name' END ASC,
  CASE WHEN p_sort='time' THEN active_seconds END DESC NULLS LAST,CASE WHEN p_sort='recent' THEN last_activity_at END DESC NULLS LAST,id LIMIT 20 OFFSET (p_page-1)*20)
 SELECT jsonb_build_object('customers',coalesce((SELECT jsonb_agg(row_data) FROM paged),'[]'::jsonb),'total',(SELECT count(*) FROM filtered),'page',p_page,'pageSize',20,
 'brands',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name) FROM public.cafes WHERE deleted_at IS NULL),'[]'::jsonb),
 'summary',(SELECT jsonb_build_object('customers',count(*),'shared',count(*) FILTER(WHERE brand_count>1),'activeToday',count(*) FILTER(WHERE (last_activity_at AT TIME ZONE 'Asia/Riyadh')::date=(now() AT TIME ZONE 'Asia/Riyadh')::date),'measured',count(*) FILTER(WHERE sessions>0),'activeSeconds',coalesce(sum(active_seconds),0)) FROM filtered),
 'recordingStartedAt',(SELECT recording_started_at FROM customer_analytics_private.settings),'generatedAt',now()) INTO v_result;
 RETURN v_result;
END $$;

CREATE FUNCTION public.get_customer_intelligence_detail(p_customer uuid,p_page integer DEFAULT 1,p_kind text DEFAULT 'all')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_key text; v_customer jsonb; v_events jsonb; v_total integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='platform_admin' AND status='active') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_kind IS NULL OR p_kind NOT IN ('all','browser','loyalty','wallet') THEN RAISE EXCEPTION 'invalid filters'; END IF;
 SELECT identity_key INTO v_key FROM loyalty_audit_private.brand_customer_rows WHERE id=p_customer;
 IF v_key IS NULL THEN RAISE EXCEPTION 'customer not found'; END IF;
 SELECT row_data INTO v_customer FROM customer_analytics_private.customers WHERE identity_key=v_key;
 SELECT count(*) INTO v_total FROM customer_analytics_private.events WHERE identity_key=v_key AND(p_kind='all' OR source=p_kind);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'at',at,'kind',kind,'source',source,'brandName',brand_name,'outcome',outcome,'activeSeconds',active_seconds,'device',device,'detail',detail)),'[]'::jsonb)
 INTO v_events FROM(SELECT * FROM customer_analytics_private.events WHERE identity_key=v_key AND(p_kind='all' OR source=p_kind) ORDER BY at DESC,id LIMIT 20 OFFSET (p_page-1)*20)e;
 RETURN jsonb_build_object('customer',v_customer,'events',v_events,'total',v_total,'page',p_page,'pageSize',20,'recordingStartedAt',(SELECT recording_started_at FROM customer_analytics_private.settings),'generatedAt',now());
END $$;
REVOKE ALL ON FUNCTION public.get_customer_intelligence(text,uuid,text,text,integer),public.get_customer_intelligence_detail(uuid,integer,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_intelligence(text,uuid,text,text,integer),public.get_customer_intelligence_detail(uuid,integer,text) TO authenticated;
COMMIT;
