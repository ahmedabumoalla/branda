-- Platform-admin customer intelligence; customer data stays in its original tables.
-- No customer/owner grants are expanded. Wallet delivery is not proof of installation.
BEGIN;

-- Last version generated for an authenticated Apple update request. This is a
-- server response acknowledgement, not proof the phone displayed the update.
ALTER TABLE public.wallet_passes ADD COLUMN apple_last_served_update timestamptz;

CREATE TABLE loyalty_audit_private.wallet_customer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL,
  card_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('apple','google')),
  kind text NOT NULL CHECK (kind IN ('download','save_link','installed','unregistered')),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  origin text NOT NULL DEFAULT 'live' CHECK (origin IN ('live','historical'))
);
ALTER TABLE loyalty_audit_private.wallet_customer_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON loyalty_audit_private.wallet_customer_events FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX wallet_customer_events_card_time_idx ON loyalty_audit_private.wallet_customer_events(card_id,occurred_at DESC,id DESC);
ALTER TABLE loyalty_audit_private.settings ADD COLUMN wallet_recording_started_at timestamptz NOT NULL DEFAULT clock_timestamp();

CREATE FUNCTION loyalty_audit_private.capture_wallet_registration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_card_id uuid; v_cafe_id uuid;
BEGIN
  IF TG_OP='UPDATE' AND NEW.push_token IS NOT DISTINCT FROM OLD.push_token THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN
    INSERT INTO loyalty_audit_private.wallet_customer_events(cafe_id,card_id,provider,kind)
      VALUES(NEW.cafe_id,NEW.card_id,'apple','installed');
  ELSIF TG_OP='DELETE' THEN
    INSERT INTO loyalty_audit_private.wallet_customer_events(cafe_id,card_id,provider,kind)
      VALUES(OLD.cafe_id,OLD.card_id,'apple','unregistered');
  END IF;
  v_card_id:=CASE WHEN TG_OP='DELETE' THEN OLD.card_id ELSE NEW.card_id END;
  v_cafe_id:=CASE WHEN TG_OP='DELETE' THEN OLD.cafe_id ELSE NEW.cafe_id END;
  -- A card-wide served version belongs to the old device set. Invalidate it
  -- atomically for additions, removals and token changes, including reinstall.
  -- During a card's cascading deletion there is no remaining pass to update.
  IF EXISTS(SELECT 1 FROM public.loyalty_cards WHERE id=v_card_id AND cafe_id=v_cafe_id) THEN
    IF TG_OP='INSERT' THEN
      INSERT INTO public.wallet_passes(card_id,cafe_id,provider,updated_at,apple_last_served_update)
        VALUES(v_card_id,v_cafe_id,'apple',clock_timestamp(),NULL)
        ON CONFLICT(card_id,provider) DO UPDATE
          SET updated_at=GREATEST(clock_timestamp(),public.wallet_passes.updated_at+interval '1 microsecond'),apple_last_served_update=NULL;
    ELSE
      UPDATE public.wallet_passes SET updated_at=GREATEST(clock_timestamp(),updated_at+interval '1 microsecond'),apple_last_served_update=NULL
        WHERE card_id=v_card_id AND cafe_id=v_cafe_id AND provider='apple';
    END IF;
    INSERT INTO public.wallet_notification_jobs(cafe_id,card_id,kind)
      SELECT v_cafe_id,v_card_id,'sync' WHERE EXISTS(SELECT 1 FROM public.wallet_passes WHERE card_id=v_card_id AND provider='apple')
      ON CONFLICT(card_id) WHERE kind='sync' AND status='pending' DO UPDATE
        SET attempts=0,delivery_state='{}'::jsonb,available_at=clock_timestamp(),last_error=NULL,updated_at=clock_timestamp();
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION loyalty_audit_private.capture_wallet_registration() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER wallet_customer_registration_history AFTER INSERT OR DELETE OR UPDATE OF push_token ON public.wallet_apple_registrations
  FOR EACH ROW EXECUTE FUNCTION loyalty_audit_private.capture_wallet_registration();
-- Existing registrations are factual installation evidence; no inferred downloads.
INSERT INTO loyalty_audit_private.wallet_customer_events(cafe_id,card_id,provider,kind,occurred_at,origin)
SELECT cafe_id,card_id,'apple','installed',created_at,'historical' FROM public.wallet_apple_registrations;

CREATE FUNCTION public.record_wallet_download(p_card_id uuid,p_provider text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_cafe_id uuid;
BEGIN
  IF p_provider IS NULL OR p_provider NOT IN ('apple','google') THEN RAISE EXCEPTION 'Invalid wallet provider'; END IF;
  SELECT p.cafe_id INTO v_cafe_id FROM public.wallet_passes p
    JOIN public.loyalty_cards c ON c.id=p.card_id AND c.cafe_id=p.cafe_id
    WHERE p.card_id=p_card_id AND p.provider=p_provider;
  IF v_cafe_id IS NULL THEN RAISE EXCEPTION 'Wallet pass not found'; END IF;
  INSERT INTO loyalty_audit_private.wallet_customer_events(cafe_id,card_id,provider,kind)
    VALUES(v_cafe_id,p_card_id,p_provider,CASE WHEN p_provider='apple' THEN 'download' ELSE 'save_link' END);
END;
$$;
REVOKE ALL ON FUNCTION public.record_wallet_download(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_wallet_download(uuid,text) TO service_role;

-- Card detail and timeline queries use these indexes; existing tenant/time indexes remain.
CREATE INDEX loyalty_activity_card_time_idx ON public.loyalty_activity_events(card_id,occurred_at DESC,id DESC) WHERE card_id IS NOT NULL;
CREATE INDEX customer_reward_instances_card_time_idx ON public.customer_reward_instances(loyalty_card_id,issued_at DESC) WHERE loyalty_card_id IS NOT NULL;

CREATE VIEW loyalty_audit_private.brand_customer_rows AS
WITH identities AS (
  SELECT p.*,c.name AS brand_name,c.slug::text AS brand_slug,
    CASE WHEN NOT p.phone_auth_conflict AND p.phone_normalized ~ '^9665[0-9]{8}$' THEN 'phone:'||p.phone_normalized
      WHEN p.user_id IS NOT NULL THEN 'account:'||p.user_id::text ELSE 'profile:'||p.id::text END AS identity_key,
    CASE WHEN NOT p.phone_auth_conflict AND p.phone_normalized ~ '^9665[0-9]{8}$' THEN 'phone'
      WHEN p.user_id IS NOT NULL THEN 'account' ELSE 'profile' END AS identity_match
  FROM public.customer_profiles p JOIN public.cafes c ON c.id=p.cafe_id AND c.deleted_at IS NULL
), shared AS (
  SELECT identity_key,count(DISTINCT cafe_id) AS brand_count,
    jsonb_agg(jsonb_build_object('id',cafe_id,'name',brand_name,'slug',brand_slug) ORDER BY brand_name,cafe_id) AS brands
  FROM (SELECT DISTINCT identity_key,cafe_id,brand_name,brand_slug FROM identities) i GROUP BY identity_key
), audit_counts AS (
  SELECT card_id,count(*) FILTER(WHERE kind='scan' AND outcome='success') AS scans,
    count(*) FILTER(WHERE kind='stamp' AND outcome='success') AS stamp_transactions,max(occurred_at) AS last_at
  FROM public.loyalty_activity_events WHERE card_id IS NOT NULL GROUP BY card_id
), reward_counts AS (
  SELECT r.cafe_id,coalesce(r.customer_id,c.customer_profile_id) AS customer_id,count(*) AS earned,
    count(*) FILTER(WHERE r.status='redeemed') AS redeemed,
    count(*) FILTER(WHERE r.status='expired' OR (r.status='available' AND r.expires_at<=now())) AS expired,
    count(*) FILTER(WHERE r.status='available' AND (r.expires_at IS NULL OR r.expires_at>now())) AS available,
    max(greatest(r.issued_at,r.redeemed_at)) AS last_at
  FROM public.customer_reward_instances r LEFT JOIN public.loyalty_cards c ON c.id=r.loyalty_card_id AND c.cafe_id=r.cafe_id
  GROUP BY r.cafe_id,coalesce(r.customer_id,c.customer_profile_id)
), wallet_counts AS (
  SELECT card_id,min(occurred_at) FILTER(WHERE kind='download') AS first_download,
    max(occurred_at) FILTER(WHERE kind='download') AS last_download,
    count(*) FILTER(WHERE kind='download') AS downloads,
    min(occurred_at) FILTER(WHERE kind='installed') AS first_installed,max(occurred_at) AS last_at
  FROM loyalty_audit_private.wallet_customer_events GROUP BY card_id
), devices AS (
  SELECT card_id,count(*) AS total FROM public.wallet_apple_registrations GROUP BY card_id
), providers AS (
  SELECT card_id,jsonb_agg(provider ORDER BY provider) AS providers FROM public.wallet_passes GROUP BY card_id
)
SELECT i.id,i.identity_key,i.cafe_id AS brand_id,i.brand_name,i.brand_slug,s.brand_count,
  coalesce(c.total_purchases,0) AS stamps,coalesce(a.scans,0) AS scans,
  coalesce(r.earned,0) AS rewards_earned,coalesce(r.redeemed,0) AS rewards_redeemed,
  coalesce(r.expired,0) AS rewards_expired,
  greatest(i.created_at,c.issued_at,c.last_used_at,a.last_at,r.last_at,w.last_at) AS last_activity_at,
  lower(concat_ws(' ',i.full_name,i.phone,i.email::text,i.brand_name,i.brand_slug)) AS search_text,
  jsonb_build_object(
    'id',i.id,'cardId',c.id,'name',coalesce(i.full_name,''),'phone',coalesce(i.phone,''),'email',coalesce(i.email::text,''),
    'brand',jsonb_build_object('id',i.cafe_id,'name',i.brand_name,'slug',i.brand_slug),'sharedBrands',s.brands,'identityMatch',i.identity_match,
    'status',CASE WHEN i.status='blocked' OR i.blocked_at IS NOT NULL THEN 'blocked' WHEN i.status='suspended' OR c.status='suspended' THEN 'suspended' ELSE 'active' END,
    'cardSuffix',CASE WHEN length(c.card_code)>4 THEN right(c.card_code,4) ELSE NULL END,
    'joinedAt',i.created_at,'cardIssuedAt',c.issued_at,'lastActivityAt',greatest(c.last_used_at,a.last_at,r.last_at,w.last_at),
    'stamps',coalesce(c.total_purchases,0),'stampsInCycle',coalesce(c.stamps_in_cycle,0),'stampTarget',coalesce(p.purchases_required,7),
    'stampTransactions',coalesce(a.stamp_transactions,0),'scans',coalesce(a.scans,0),
    'rewardsEarned',coalesce(r.earned,0),'rewardsRedeemed',coalesce(r.redeemed,0),'rewardsExpired',coalesce(r.expired,0),'rewardsAvailable',coalesce(r.available,0),
    'isFrequent',coalesce(c.total_purchases,0)>=10,
    'firstDownloadAt',w.first_download,'lastDownloadAt',w.last_download,'downloadCount',coalesce(w.downloads,0),
    'firstInstalledAt',w.first_installed,'installedDeviceCount',coalesce(d.total,0),'walletProviders',coalesce(v.providers,'[]'::jsonb)
  ) AS row_data
FROM identities i JOIN shared s USING(identity_key)
LEFT JOIN public.loyalty_cards c ON c.customer_profile_id=i.id AND c.cafe_id=i.cafe_id
LEFT JOIN public.cafe_loyalty_programs p ON p.cafe_id=i.cafe_id
LEFT JOIN audit_counts a ON a.card_id=c.id
LEFT JOIN reward_counts r ON r.customer_id=i.id AND r.cafe_id=i.cafe_id
LEFT JOIN wallet_counts w ON w.card_id=c.id
LEFT JOIN devices d ON d.card_id=c.id
LEFT JOIN providers v ON v.card_id=c.id;
REVOKE ALL ON loyalty_audit_private.brand_customer_rows FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_admin_brand_customers(
  p_search text DEFAULT '',p_brand_id uuid DEFAULT NULL,p_segment text DEFAULT 'all',
  p_sort text DEFAULT 'recent',p_page integer DEFAULT 1,p_page_size integer DEFAULT 25
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb; v_search text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='platform_admin' AND status='active')
    THEN RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501'; END IF;
  IF p_search IS NULL OR length(p_search)>100 OR p_segment IS NULL OR p_segment NOT IN ('all','shared','frequent','rewarded','expired')
    OR p_sort IS NULL OR p_sort NOT IN ('recent','stamps','rewards') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000
    OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Invalid customer filters'; END IF;
  v_search:=lower(btrim(p_search));
  WITH matching AS MATERIALIZED (
    SELECT * FROM loyalty_audit_private.brand_customer_rows
    WHERE (v_search='' OR position(v_search IN search_text)>0)
      AND (p_segment='all' OR (p_segment='shared' AND brand_count>1) OR (p_segment='frequent' AND stamps>=10)
        OR (p_segment='rewarded' AND rewards_earned>0) OR (p_segment='expired' AND rewards_expired>0))
  ), filtered AS MATERIALIZED (
    SELECT * FROM matching WHERE p_brand_id IS NULL OR brand_id=p_brand_id
  ), ranked AS (
    SELECT *,row_number() OVER(ORDER BY CASE WHEN p_sort='stamps' THEN stamps WHEN p_sort='rewards' THEN rewards_redeemed ELSE 0 END DESC,
      last_activity_at DESC NULLS LAST,id) AS row_number FROM filtered
  ), brand_summary AS (
    SELECT brand_id,brand_name,brand_slug,count(*) AS customers,sum(stamps) AS stamps,sum(rewards_redeemed) AS redeemed
    FROM matching GROUP BY brand_id,brand_name,brand_slug
  ) SELECT jsonb_build_object(
    'customers',coalesce((SELECT jsonb_agg(row_data ORDER BY row_number) FROM ranked WHERE row_number>(p_page-1)*p_page_size AND row_number<=p_page*p_page_size),'[]'::jsonb),
    'brands',coalesce((SELECT jsonb_agg(jsonb_build_object('id',brand_id,'name',brand_name,'slug',brand_slug,'customers',customers,'stamps',stamps,'rewardsRedeemed',redeemed) ORDER BY customers DESC,brand_name,brand_id) FROM brand_summary),'[]'::jsonb),
    'summary',(SELECT jsonb_build_object('memberships',count(*),'uniqueCustomers',count(DISTINCT identity_key),
      'sharedCustomers',count(DISTINCT identity_key) FILTER(WHERE brand_count>1),'frequentCustomers',count(DISTINCT identity_key) FILTER(WHERE stamps>=10),
      'stamps',coalesce(sum(stamps),0),'scans',coalesce(sum(scans),0),'rewardsEarned',coalesce(sum(rewards_earned),0),
      'rewardsRedeemed',coalesce(sum(rewards_redeemed),0),'rewardsExpired',coalesce(sum(rewards_expired),0)) FROM filtered),
    'total',(SELECT count(*) FROM filtered),'page',p_page,'pageSize',p_page_size,'frequentThreshold',10,
    'recordingStartedAt',(SELECT recording_started_at FROM loyalty_audit_private.settings),
    'walletRecordingStartedAt',(SELECT wallet_recording_started_at FROM loyalty_audit_private.settings)
  ) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_admin_brand_customers(text,uuid,text,text,integer,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_brand_customers(text,uuid,text,text,integer,integer) TO authenticated;

CREATE FUNCTION public.get_admin_brand_customer_detail(p_customer_id uuid,p_page integer DEFAULT 1,p_page_size integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_customer jsonb; v_identity text; v_card_id uuid; v_brand_id uuid; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='platform_admin' AND status='active')
    THEN RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501'; END IF;
  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Invalid customer page'; END IF;
  SELECT row_data,identity_key,brand_id,(row_data->>'cardId')::uuid INTO v_customer,v_identity,v_brand_id,v_card_id
    FROM loyalty_audit_private.brand_customer_rows WHERE id=p_customer_id;
  IF v_customer IS NULL THEN RAISE EXCEPTION 'Customer not found'; END IF;
  WITH timeline AS (
    SELECT 'profile:'||p_customer_id AS id,(v_customer->>'joinedAt')::timestamptz AS occurred_at,'joined'::text AS kind,
      'success'::text AS outcome,'historical'::text AS origin,NULL::text AS actor_name,0 AS stamps_delta,NULL::integer AS stamps_after,
      0 AS rewards_delta,NULL::text AS reward_name,NULL::timestamptz AS reward_expires_at,NULL::text AS reason_code,NULL::text AS provider
    UNION ALL SELECT 'card:'||v_card_id,(v_customer->>'cardIssuedAt')::timestamptz,'card_issued','success','historical',NULL,0,NULL,0,NULL,NULL,NULL,NULL WHERE v_card_id IS NOT NULL
    UNION ALL SELECT 'audit:'||a.id,a.occurred_at,a.kind,a.outcome,a.origin,a.actor_name,a.stamps_delta,a.stamps_after,a.rewards_delta,a.reward_name,a.reward_expires_at,a.reason_code,NULL
      FROM public.loyalty_activity_events a WHERE a.cafe_id=v_brand_id AND (a.card_id=v_card_id OR EXISTS (
        SELECT 1 FROM public.customer_reward_redemptions d JOIN public.customer_reward_instances r ON r.id=d.reward_instance_id AND r.cafe_id=d.cafe_id
        WHERE d.id=a.source_redemption_id AND d.cafe_id=v_brand_id AND r.customer_id=p_customer_id
      ))
    UNION ALL SELECT 'wallet:'||w.id,w.occurred_at,w.kind,'success',w.origin,NULL,0,NULL,0,NULL,NULL,NULL,w.provider
      FROM loyalty_audit_private.wallet_customer_events w WHERE w.card_id=v_card_id AND w.cafe_id=v_brand_id
    UNION ALL SELECT 'earned:'||r.id,r.issued_at,'reward_earned','success','historical',NULL,0,NULL,1,r.reward_title,r.expires_at,NULL,NULL
      FROM public.customer_reward_instances r WHERE r.cafe_id=v_brand_id AND (r.customer_id=p_customer_id OR (r.customer_id IS NULL AND r.loyalty_card_id=v_card_id))
    -- Old/customer-only redemptions may have no loyalty ledger entry. Include
    -- their persisted timestamp once, but never duplicate a captured audit event.
    UNION ALL SELECT 'redeemed:'||r.id,r.redeemed_at,'redeem','success','historical',NULL,0,NULL,-1,r.reward_title,r.expires_at,NULL,NULL
      FROM public.customer_reward_instances r WHERE r.cafe_id=v_brand_id AND (r.customer_id=p_customer_id OR (r.customer_id IS NULL AND r.loyalty_card_id=v_card_id))
        AND r.status='redeemed' AND r.redeemed_at IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM public.loyalty_activity_events a
          LEFT JOIN public.customer_reward_redemptions d ON d.id=a.source_redemption_id AND d.cafe_id=a.cafe_id
          LEFT JOIN public.loyalty_card_events e ON e.id=a.source_event_id AND e.cafe_id=a.cafe_id
          WHERE a.cafe_id=r.cafe_id AND a.kind='redeem' AND a.outcome='success'
            AND (d.reward_instance_id=r.id OR (e.card_id=r.loyalty_card_id AND e.invoice_barcode=r.reward_code))
        )
    UNION ALL SELECT 'expired:'||r.id,r.expires_at,'reward_expired','success','historical',NULL,0,NULL,-1,r.reward_title,r.expires_at,NULL,NULL
      FROM public.customer_reward_instances r WHERE r.cafe_id=v_brand_id AND (r.customer_id=p_customer_id OR (r.customer_id IS NULL AND r.loyalty_card_id=v_card_id))
        AND r.expires_at<=now() AND (r.status='expired' OR r.status='available')
  ), ranked AS (
    SELECT *,row_number() OVER(ORDER BY occurred_at DESC,id DESC) AS row_number FROM timeline
  ) SELECT jsonb_build_object('customer',v_customer,
    'memberships',(SELECT jsonb_agg(row_data ORDER BY brand_name,id) FROM loyalty_audit_private.brand_customer_rows WHERE identity_key=v_identity),
    'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'occurredAt',occurred_at,'kind',kind,'outcome',outcome,'origin',origin,
      'actorName',actor_name,'stampsDelta',stamps_delta,'stampsAfter',stamps_after,'rewardsDelta',rewards_delta,'rewardName',reward_name,
      'rewardExpiresAt',reward_expires_at,'reasonCode',reason_code,'provider',provider) ORDER BY row_number)
      FROM ranked WHERE row_number>(p_page-1)*p_page_size AND row_number<=p_page*p_page_size),'[]'::jsonb),
    'total',(SELECT count(*) FROM timeline),'page',p_page,'pageSize',p_page_size) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_admin_brand_customer_detail(uuid,integer,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_brand_customer_detail(uuid,integer,integer) TO authenticated;

COMMIT;
