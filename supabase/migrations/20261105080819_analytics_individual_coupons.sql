BEGIN;

-- Coupon issuance is separate from legacy shared brand coupons: their redemption
-- RPCs never see these private, recipient-bound codes.
DO $guard$ BEGIN
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid='public.platform_marketing_claim_job()'::regprocedure)
    IS DISTINCT FROM '5ba33c9f1285e33d0d8e914ec1ead3c5'
 OR (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid='brand_loyalty_analytics_private.campaign_recipient_allowed(jsonb,text)'::regprocedure)
    IS DISTINCT FROM 'a96689cf66803177e1fa6c1a4bbd365d'
 OR (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid='brand_loyalty_analytics_private.events(uuid,timestamptz)'::regprocedure)
    IS DISTINCT FROM 'abbe4b2d63d3fe2ade99eef15514a282' THEN
   RAISE EXCEPTION 'Analytics campaign worker changed since review';
 END IF;
END $guard$;

CREATE TABLE brand_loyalty_analytics_private.coupons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 campaign_id uuid NOT NULL REFERENCES public.platform_marketing_campaigns(id) ON DELETE CASCADE,
 recipient_id uuid NOT NULL UNIQUE REFERENCES public.platform_marketing_recipients(id) ON DELETE CASCADE,
 cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
 customer_id uuid NOT NULL REFERENCES public.customer_profiles(id) ON DELETE CASCADE,
 phone text NOT NULL CHECK(phone ~ '^9665[0-9]{8}$'),
 code text NOT NULL UNIQUE CHECK(code ~ '^BC-[A-F0-9]{32}$'),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 100),
 customer_name text NOT NULL,
 discount_type text NOT NULL CHECK(discount_type IN('percentage','fixed')),
 discount_value numeric NOT NULL CHECK(discount_value>0 AND discount_value<=100000 AND discount_value=round(discount_value,2)),
 minimum_order_amount numeric NOT NULL CHECK(minimum_order_amount>=0 AND minimum_order_amount<=1000000 AND minimum_order_amount=round(minimum_order_amount,2)),
 starts_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL CHECK(expires_at>starts_at),
 terms text NOT NULL CHECK(length(terms)<=400),
 message_body text NOT NULL CHECK(length(message_body) BETWEEN 1 AND 3000),
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','redeemed','disabled')),
 redeemed_at timestamptz,
 redeemed_by_cashier_id uuid REFERENCES public.cafe_cashiers(id),
 redemption_key uuid,
 redemption_result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(discount_type<>'percentage' OR discount_value<=100),
 CHECK((status='redeemed' AND redeemed_at IS NOT NULL AND redeemed_by_cashier_id IS NOT NULL AND redemption_key IS NOT NULL AND redemption_result IS NOT NULL)
   OR (status<>'redeemed' AND redeemed_at IS NULL AND redeemed_by_cashier_id IS NULL AND redemption_key IS NULL AND redemption_result IS NULL)),
 UNIQUE(campaign_id,phone),
 UNIQUE(cafe_id,redeemed_by_cashier_id,redemption_key)
);
CREATE INDEX analytics_coupons_customer_idx ON brand_loyalty_analytics_private.coupons(customer_id);
CREATE INDEX analytics_coupons_cashier_idx ON brand_loyalty_analytics_private.coupons(redeemed_by_cashier_id);
CREATE INDEX analytics_coupons_visits_idx ON brand_loyalty_analytics_private.coupons(cafe_id,redeemed_at) WHERE status='redeemed';
ALTER TABLE brand_loyalty_analytics_private.coupons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON brand_loyalty_analytics_private.coupons FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION brand_loyalty_analytics_private.coupon_config(p_coupon jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE v_type text; v_value numeric; v_min numeric; v_days numeric; v_terms text;
BEGIN
 IF p_coupon IS NULL OR jsonb_typeof(p_coupon)<>'object'
   OR NOT(p_coupon ?& ARRAY['discountType','discountValue','minimumOrderAmount','validityDays','terms'])
   OR (SELECT count(*) FROM jsonb_object_keys(p_coupon))<>5
   OR jsonb_typeof(p_coupon->'discountType')<>'string' OR jsonb_typeof(p_coupon->'discountValue')<>'number'
   OR jsonb_typeof(p_coupon->'minimumOrderAmount')<>'number' OR jsonb_typeof(p_coupon->'validityDays')<>'number'
   OR jsonb_typeof(p_coupon->'terms')<>'string' THEN
   RAISE EXCEPTION 'Invalid coupon configuration' USING ERRCODE='22023'; END IF;
 v_type:=p_coupon->>'discountType'; v_value:=(p_coupon->>'discountValue')::numeric;
 v_min:=(p_coupon->>'minimumOrderAmount')::numeric; v_days:=(p_coupon->>'validityDays')::numeric; v_terms:=btrim(p_coupon->>'terms');
 IF v_type NOT IN('percentage','fixed') OR v_value<=0 OR v_value>100000 OR v_value<>round(v_value,2)
   OR (v_type='percentage' AND v_value>100) OR v_min<0 OR v_min>1000000 OR v_min<>round(v_min,2)
   OR v_days NOT BETWEEN 1 AND 365 OR v_days<>trunc(v_days) OR length(v_terms)>400 THEN
   RAISE EXCEPTION 'Invalid coupon configuration' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('discountType',v_type,'discountValue',v_value,'minimumOrderAmount',v_min,'validityDays',v_days::integer,'terms',v_terms);
END $$;

CREATE FUNCTION brand_loyalty_analytics_private.coupon_message(p_body text,p_coupon jsonb,p_code text,p_expires timestamptz)
RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT btrim(p_body)||E'\n\n'||'كوبونك الخاص: '||p_code||E'\n'||'الخصم: '
   ||trim_scale((p_coupon->>'discountValue')::numeric)::text||CASE WHEN p_coupon->>'discountType'='percentage' THEN '%' ELSE ' ر.س' END
   ||E'\n'||'الحد الأدنى للفاتورة: '||trim_scale((p_coupon->>'minimumOrderAmount')::numeric)::text||' ر.س'
   ||E'\n'||'صالح حتى: '||to_char(p_expires AT TIME ZONE 'Asia/Riyadh','YYYY-MM-DD HH24:MI')||' بتوقيت الرياض'
   ||E'\n'||'يستخدم مرة واحدة لصاحب هذا الرقم لدى العلامة'
   ||CASE WHEN p_coupon->>'terms'<>'' THEN E'\n'||'الشروط: '||(p_coupon->>'terms') ELSE '' END
$$;

CREATE FUNCTION public.platform_marketing_create_coupon_campaign(p_actor uuid,p_key uuid,p_title text,p_body text,p_cafe uuid,
 p_segment text,p_inactive_days integer,p_audience_digest text,p_scheduled_at timestamptz DEFAULT NULL,p_coupon jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_existing public.platform_marketing_campaigns; v_config jsonb; v_payload jsonb; v_result jsonb; v_campaign uuid; v_start timestamptz; v_expires timestamptz; v_count integer;
BEGIN
 IF NOT public.platform_marketing_actor_allowed(p_actor) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR p_cafe IS NULL OR NOT brand_loyalty_analytics_private.campaign_segment_valid(p_segment,p_inactive_days)
   OR p_audience_digest IS NULL OR p_audience_digest !~ '^[0-9a-f]{64}$'
   OR length(btrim(coalesce(p_title,''))) NOT BETWEEN 1 AND 100 OR length(btrim(coalesce(p_body,''))) NOT BETWEEN 1 AND 2000 THEN
   RAISE EXCEPTION 'Invalid analytics coupon campaign' USING ERRCODE='22023'; END IF;
 v_config:=brand_loyalty_analytics_private.coupon_config(p_coupon);
 v_payload:=jsonb_build_object('version',1,'brandId',p_cafe,'segment',p_segment,'inactiveDays',p_inactive_days,'digest',p_audience_digest,
   'title',btrim(p_title),'body',btrim(p_body),'scheduledAt',extract(epoch FROM p_scheduled_at),'contentKind','coupon','coupon',v_config);
 PERFORM pg_advisory_xact_lock(hashtextextended('platform-campaign:'||p_actor::text||':'||p_key::text,0));
 SELECT * INTO v_existing FROM public.platform_marketing_campaigns WHERE created_by=p_actor AND idempotency_key=p_key;
 IF FOUND THEN
   IF v_existing.request_payload->'couponRequest' IS DISTINCT FROM v_payload THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='22023'; END IF;
   RETURN jsonb_build_object('campaignId',v_existing.id,'total',(SELECT count(*) FROM public.platform_marketing_recipients WHERE campaign_id=v_existing.id));
 END IF;
 v_result:=public.platform_marketing_create_analytics_campaign(p_actor,p_key,p_title,p_body,p_cafe,p_segment,p_inactive_days,p_audience_digest,p_scheduled_at,'offer');
 v_campaign:=(v_result->>'campaignId')::uuid;
 SELECT scheduled_at INTO STRICT v_start FROM public.platform_marketing_campaigns WHERE id=v_campaign;
 v_expires:=v_start+make_interval(secs=>(v_config->>'validityDays')::integer*86400);
 WITH selected AS MATERIALIZED(
   SELECT r.id AS recipient_id,r.phone,r.name,a.id AS customer_id,'BC-'||upper(replace(gen_random_uuid()::text,'-','')) AS code
   FROM public.platform_marketing_recipients r JOIN brand_loyalty_analytics_private.campaign_audience(p_cafe,p_segment,p_inactive_days,now()) a
   ON a.eligible AND a.phone=r.phone WHERE r.campaign_id=v_campaign
 )
 INSERT INTO brand_loyalty_analytics_private.coupons(campaign_id,recipient_id,cafe_id,customer_id,phone,code,title,customer_name,
   discount_type,discount_value,minimum_order_amount,starts_at,expires_at,terms,message_body)
 SELECT v_campaign,s.recipient_id,p_cafe,s.customer_id,s.phone,s.code,btrim(p_title),s.name,v_config->>'discountType',
   (v_config->>'discountValue')::numeric,(v_config->>'minimumOrderAmount')::numeric,v_start,v_expires,v_config->>'terms',
   brand_loyalty_analytics_private.coupon_message(p_body,v_config,s.code,v_expires) FROM selected s;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 IF v_count<>(v_result->>'total')::integer THEN RAISE EXCEPTION 'Audience changed' USING ERRCODE='22023'; END IF;
 UPDATE public.platform_marketing_campaigns SET request_payload=request_payload||jsonb_build_object('analyticsRequest',v_payload,'couponRequest',v_payload),
   audience_filter=jsonb_set(audience_filter,'{analytics}',(audience_filter->'analytics')||jsonb_build_object('contentKind','coupon','coupon',v_config,'couponCampaignId',v_campaign))
 WHERE id=v_campaign;
 RETURN v_result;
END $$;

-- Existing segment/contact rules remain intact. Only coupon campaigns add a
-- recipient-bound availability check; returning for redemption does not require
-- the customer to remain in their original marketing segment.
CREATE OR REPLACE FUNCTION brand_loyalty_analytics_private.campaign_recipient_allowed(p_filter jsonb,p_phone text)
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
 IF p_filter->'analytics'->>'contentKind'='coupon' THEN
   IF coalesce(p_filter->'analytics'->>'couponCampaignId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR NOT EXISTS(SELECT 1 FROM brand_loyalty_analytics_private.coupons c
       WHERE c.campaign_id=(p_filter->'analytics'->>'couponCampaignId')::uuid AND c.cafe_id=brand_id AND c.phone=p_phone
       AND c.status='active' AND c.starts_at<=now() AND c.expires_at>now()) THEN RETURN false; END IF;
 END IF;
 RETURN EXISTS(SELECT 1 FROM brand_loyalty_analytics_private.campaign_audience(brand_id,segment,days,now()) WHERE eligible AND phone=p_phone);
END $$;

CREATE FUNCTION brand_loyalty_analytics_private.coupon_dispatch_body(p_campaign uuid,p_recipient uuid,p_phone text)
RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT message_body FROM brand_loyalty_analytics_private.coupons
 WHERE campaign_id=p_campaign AND recipient_id=p_recipient AND phone=p_phone AND status='active'
$$;

-- Guarded body substitution only: queue pacing, leases, suppression and all
-- ambiguous-attempt handling stay byte-for-byte equivalent to the existing SQL.
DO $patch$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.platform_marketing_claim_job()'::regprocedure) INTO definition;
 IF position('''body'',campaign.body' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected claim body'; END IF;
 EXECUTE replace(definition,'''body'',campaign.body',
   '''body'',CASE WHEN campaign.audience_filter->''analytics''->>''contentKind''=''coupon'' THEN brand_loyalty_analytics_private.coupon_dispatch_body(campaign.id,recipient.id,recipient.phone) ELSE campaign.body END');
END $patch$;

-- Coupon redemption is a real visit, not a loyalty stamp or loyalty reward.
-- All existing distinct-day, retention and peak-hour calculations share events.
CREATE OR REPLACE FUNCTION brand_loyalty_analytics_private.events(p_brand uuid,p_as_of timestamptz)
RETURNS TABLE(id text,cafe_id uuid,identity_key text,at timestamptz,kind text,origin text,stamps_delta integer,reward_name text)
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT a.id,a.cafe_id,a.identity_key,a.at,a.kind,a.origin,a.stamps_delta,a.reward_name
 FROM brand_loyalty_analytics_private.activity a
 WHERE (p_brand IS NULL OR a.cafe_id=p_brand) AND a.at<=p_as_of
 AND (a.kind<>'stamp' OR NOT EXISTS(
   SELECT 1 FROM public.loyalty_card_events v WHERE v.cafe_id=a.cafe_id AND v.card_id=a.card_id
   AND v.event_type='void' AND v.invoice_barcode IS NOT NULL AND v.invoice_barcode=a.invoice_barcode
   AND v.created_at>=a.at AND v.created_at<=p_as_of))
 UNION ALL
 SELECT 'coupon:'||c.id::text,c.cafe_id,i.identity_key,c.redeemed_at,'coupon_redeemed','live',0,c.title
 FROM brand_loyalty_analytics_private.coupons c JOIN brand_loyalty_analytics_private.identities i ON i.id=c.customer_id AND i.cafe_id=c.cafe_id
 WHERE c.status='redeemed' AND c.redeemed_at IS NOT NULL AND (p_brand IS NULL OR c.cafe_id=p_brand) AND c.redeemed_at<=p_as_of
$$;

CREATE FUNCTION brand_loyalty_analytics_private.coupon_operation(p_session_token text,p_code text,p_phone text,p_subtotal numeric,p_key uuid,p_redeem boolean)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_session public.cafe_cashier_sessions; v_coupon brand_loyalty_analytics_private.coupons; v_campaign public.platform_marketing_campaigns;
 v_code text:=upper(btrim(coalesce(p_code,''))); v_phone text; v_discount numeric; v_result jsonb; v_at timestamptz;
BEGIN
 PERFORM platform_access_private.assert_cashier_loyalty(p_session_token);
 SELECT * INTO STRICT v_session FROM public.cafe_cashier_sessions WHERE token=p_session_token;
 v_phone:=translate(btrim(coalesce(p_phone,'')),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789');
 IF v_phone !~ '^[+0-9[:space:]()-]+$' THEN RAISE EXCEPTION 'Coupon unavailable' USING ERRCODE='22023'; END IF;
 v_phone:=public.normalize_customer_phone(v_phone);
 IF v_code !~ '^BC-[A-F0-9]{32}$' OR v_phone IS NULL OR v_phone !~ '^9665[0-9]{8}$' THEN RAISE EXCEPTION 'Coupon unavailable' USING ERRCODE='22023'; END IF;
 IF p_subtotal IS NULL OR p_subtotal<=0 OR p_subtotal>1000000 OR p_subtotal<>round(p_subtotal,2) OR p_subtotal::text IN('NaN','Infinity','-Infinity') THEN
   RAISE EXCEPTION 'Invalid coupon subtotal' USING ERRCODE='22023'; END IF;
 IF p_redeem THEN
   IF p_key IS NULL THEN RAISE EXCEPTION 'Invalid redemption key' USING ERRCODE='22023'; END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended('analytics-coupon:'||v_session.cafe_id::text||':'||v_session.cashier_id::text||':'||p_key::text,0));
   SELECT * INTO v_coupon FROM brand_loyalty_analytics_private.coupons
   WHERE cafe_id=v_session.cafe_id AND redeemed_by_cashier_id=v_session.cashier_id AND redemption_key=p_key;
   IF FOUND THEN
     IF v_coupon.code<>v_code OR v_coupon.phone<>v_phone OR (v_coupon.redemption_result->>'subtotal')::numeric<>p_subtotal THEN
       RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='22023'; END IF;
     RETURN v_coupon.redemption_result;
   END IF;
   SELECT * INTO v_coupon FROM brand_loyalty_analytics_private.coupons WHERE cafe_id=v_session.cafe_id AND code=v_code AND phone=v_phone FOR UPDATE;
 ELSE
   SELECT * INTO v_coupon FROM brand_loyalty_analytics_private.coupons WHERE cafe_id=v_session.cafe_id AND code=v_code AND phone=v_phone;
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'Coupon unavailable' USING ERRCODE='22023'; END IF;
 IF v_coupon.status='redeemed' THEN RAISE EXCEPTION 'Coupon already redeemed' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_campaign FROM public.platform_marketing_campaigns WHERE id=v_coupon.campaign_id FOR SHARE;
 IF v_coupon.status<>'active' OR v_coupon.starts_at>clock_timestamp() OR v_coupon.expires_at<=clock_timestamp()
   OR v_campaign.status='cancelled' OR NOT public.platform_marketing_actor_allowed(v_campaign.created_by)
   OR NOT EXISTS(SELECT 1 FROM public.platform_marketing_contacts(v_session.cafe_id,'',v_phone))
   OR NOT EXISTS(SELECT 1 FROM public.customer_profiles p WHERE p.id=v_coupon.customer_id AND p.cafe_id=v_session.cafe_id
     AND p.status='active' AND p.blocked_at IS NULL AND NOT coalesce(p.phone_auth_conflict,false)
     AND public.normalize_customer_phone(translate(p.phone,'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'))=v_phone)
   OR NOT EXISTS(SELECT 1 FROM public.platform_marketing_recipients r WHERE r.id=v_coupon.recipient_id AND r.campaign_id=v_coupon.campaign_id
     AND r.phone=v_phone AND r.attempted_at IS NOT NULL AND r.status IN('processing','accepted','uncertain')) THEN
   RAISE EXCEPTION 'Coupon unavailable' USING ERRCODE='22023'; END IF;
 IF p_subtotal<v_coupon.minimum_order_amount THEN RAISE EXCEPTION 'Minimum order amount not met' USING ERRCODE='22023'; END IF;
 v_discount:=round(least(p_subtotal,CASE WHEN v_coupon.discount_type='percentage' THEN p_subtotal*v_coupon.discount_value/100 ELSE v_coupon.discount_value END),2);
 IF v_discount<=0 THEN RAISE EXCEPTION 'Invalid coupon subtotal' USING ERRCODE='22023'; END IF;
 v_at:=CASE WHEN p_redeem THEN clock_timestamp() ELSE NULL END;
 v_result:=jsonb_build_object('couponId',v_coupon.id,'title',v_coupon.title,'customerName',v_coupon.customer_name,
   'discountType',v_coupon.discount_type,'discountValue',v_coupon.discount_value,'minimumOrderAmount',v_coupon.minimum_order_amount,
   'subtotal',p_subtotal,'discountAmount',v_discount,'totalAfterDiscount',p_subtotal-v_discount,'expiresAt',v_coupon.expires_at,
   'terms',v_coupon.terms,'status',CASE WHEN p_redeem THEN 'redeemed' ELSE 'available' END,'redeemedAt',v_at);
 IF p_redeem THEN
   UPDATE brand_loyalty_analytics_private.coupons SET status='redeemed',redeemed_at=v_at,redeemed_by_cashier_id=v_session.cashier_id,
     redemption_key=p_key,redemption_result=v_result WHERE id=v_coupon.id;
 END IF;
 RETURN v_result;
END $$;

CREATE FUNCTION public.analytics_coupon_preview(p_session_token text,p_code text,p_phone text,p_subtotal numeric)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT brand_loyalty_analytics_private.coupon_operation(p_session_token,p_code,p_phone,p_subtotal,NULL,false)
$$;
CREATE FUNCTION public.analytics_coupon_redeem(p_session_token text,p_code text,p_phone text,p_subtotal numeric,p_key uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT brand_loyalty_analytics_private.coupon_operation(p_session_token,p_code,p_phone,p_subtotal,p_key,true)
$$;

REVOKE ALL ON FUNCTION brand_loyalty_analytics_private.coupon_config(jsonb),brand_loyalty_analytics_private.coupon_message(text,jsonb,text,timestamptz),
 brand_loyalty_analytics_private.coupon_dispatch_body(uuid,uuid,text),brand_loyalty_analytics_private.coupon_operation(text,text,text,numeric,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.platform_marketing_create_coupon_campaign(uuid,uuid,text,text,uuid,text,integer,text,timestamptz,jsonb),
 public.analytics_coupon_preview(text,text,text,numeric),public.analytics_coupon_redeem(text,text,text,numeric,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_marketing_create_coupon_campaign(uuid,uuid,text,text,uuid,text,integer,text,timestamptz,jsonb),
 public.analytics_coupon_preview(text,text,text,numeric),public.analytics_coupon_redeem(text,text,text,numeric,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
