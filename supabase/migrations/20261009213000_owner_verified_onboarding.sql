BEGIN;

CREATE SCHEMA IF NOT EXISTS owner_onboarding_private;
REVOKE ALL ON SCHEMA owner_onboarding_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE owner_onboarding_private.challenges (
  id uuid PRIMARY KEY,
  phone text NOT NULL CHECK(phone ~ '^9665[0-9]{8}$'),
  ip_hash text NOT NULL,
  session_hash text NOT NULL,
  code_hash text NOT NULL,
  draft jsonb NOT NULL,
  sent boolean NOT NULL DEFAULT false,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',
  verified_at timestamptz,
  consumed_by uuid
);
ALTER TABLE owner_onboarding_private.challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON owner_onboarding_private.challenges FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX owner_signup_phone_created ON owner_onboarding_private.challenges(phone,created_at DESC);
CREATE INDEX owner_signup_ip_created ON owner_onboarding_private.challenges(ip_hash,created_at DESC);
CREATE INDEX owner_signup_created ON owner_onboarding_private.challenges(created_at DESC);

ALTER TABLE public.cafes ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.cafe_settings ADD COLUMN IF NOT EXISTS google_maps_url text;
ALTER TABLE public.cafe_settings ADD COLUMN IF NOT EXISTS google_maps_latitude numeric(10,7) CHECK(google_maps_latitude BETWEEN -90 AND 90);
ALTER TABLE public.cafe_settings ADD COLUMN IF NOT EXISTS google_maps_longitude numeric(10,7) CHECK(google_maps_longitude BETWEEN -180 AND 180);

-- Dedicated plan: never edit a paid plan or reassign any existing subscription.
INSERT INTO public.platform_plans(id,name,price_sar,features,active,duration_unit,duration_count,category_id,trial_days,free_after_trial,sort_order)
VALUES('owner_trial_7d','تجربة المنيو لمدة ٧ أيام',0,'["menu","settings"]',true,'day',7,'cafes_coffee',7,false,999)
ON CONFLICT(id) DO NOTHING;

CREATE FUNCTION public.begin_owner_onboarding(p_id uuid,p_phone text,p_ip_hash text,p_session_hash text,p_code_hash text,p_draft jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE latest timestamptz;
BEGIN
  IF p_phone !~ '^9665[0-9]{8}$' OR p_session_hash !~ '^[a-f0-9]{64}$' OR p_code_hash !~ '^[a-f0-9]{64}$'
    OR p_ip_hash !~ '^[a-f0-9]{64}$' OR jsonb_typeof(p_draft)<>'object' THEN RETURN '{"ok":false}'::jsonb; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('owner_signup_send',0));
  IF EXISTS(SELECT 1 FROM public.profiles WHERE role='cafe_owner' AND regexp_replace(coalesce(phone,''),'[^0-9]','','g') IN(p_phone,'+'||p_phone,'0'||substring(p_phone from 4)))
    THEN RETURN '{"ok":false,"reason":"registered"}'::jsonb; END IF;
  SELECT max(created_at) INTO latest FROM owner_onboarding_private.challenges WHERE phone=p_phone;
  IF latest>now()-interval '60 seconds' THEN RETURN jsonb_build_object('ok',false,'retryAfterSeconds',60); END IF;
  IF (SELECT count(*) FROM owner_onboarding_private.challenges WHERE phone=p_phone AND created_at>now()-interval '1 hour')>=3
    OR (SELECT count(*) FROM owner_onboarding_private.challenges WHERE phone=p_phone AND created_at>now()-interval '1 day')>=5
    OR (SELECT count(*) FROM owner_onboarding_private.challenges WHERE ip_hash=p_ip_hash AND created_at>now()-interval '1 hour')>=10
    OR (SELECT count(*) FROM owner_onboarding_private.challenges WHERE created_at>now()-interval '1 day')>=100
    THEN RETURN '{"ok":false,"reason":"limit"}'::jsonb; END IF;
  UPDATE owner_onboarding_private.challenges SET expires_at=now() WHERE phone=p_phone AND consumed_by IS NULL;
  INSERT INTO owner_onboarding_private.challenges(id,phone,ip_hash,session_hash,code_hash,draft)
    VALUES(p_id,p_phone,p_ip_hash,p_session_hash,p_code_hash,p_draft);
  RETURN '{"ok":true}'::jsonb;
END $$;

CREATE FUNCTION public.mark_owner_onboarding_sent(p_id uuid,p_session_hash text,p_sent boolean,p_location jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  UPDATE owner_onboarding_private.challenges SET sent=p_sent,draft=draft||jsonb_build_object('latitude',p_location->'latitude','longitude',p_location->'longitude'),
    expires_at=CASE WHEN p_sent THEN expires_at ELSE now() END
    WHERE id=p_id AND session_hash=p_session_hash AND consumed_by IS NULL;
$$;

CREATE FUNCTION public.verify_owner_onboarding(p_id uuid,p_session_hash text,p_code_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE challenge owner_onboarding_private.challenges%ROWTYPE;
BEGIN
  SELECT * INTO challenge FROM owner_onboarding_private.challenges WHERE id=p_id AND session_hash=p_session_hash FOR UPDATE;
  IF NOT FOUND OR NOT challenge.sent OR challenge.expires_at<=now() OR challenge.consumed_by IS NOT NULL OR challenge.attempts>=5
    THEN RETURN '{"ok":false}'::jsonb; END IF;
  IF challenge.verified_at IS NOT NULL THEN RETURN '{"ok":true}'::jsonb; END IF;
  UPDATE owner_onboarding_private.challenges SET attempts=attempts+1 WHERE id=p_id;
  IF challenge.code_hash<>p_code_hash THEN RETURN '{"ok":false}'::jsonb; END IF;
  UPDATE owner_onboarding_private.challenges SET verified_at=now(),expires_at=now()+interval '10 minutes' WHERE id=p_id;
  RETURN '{"ok":true}'::jsonb;
END $$;

CREATE FUNCTION public.get_verified_owner_onboarding(p_id uuid,p_session_hash text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('draft',draft,'phone',phone) FROM owner_onboarding_private.challenges
  WHERE id=p_id AND session_hash=p_session_hash AND sent AND verified_at IS NOT NULL AND expires_at>now() AND consumed_by IS NULL;
$$;

REVOKE ALL ON FUNCTION public.begin_owner_onboarding(uuid,text,text,text,text,jsonb),public.mark_owner_onboarding_sent(uuid,text,boolean,jsonb),public.verify_owner_onboarding(uuid,text,text),public.get_verified_owner_onboarding(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_owner_onboarding(uuid,text,text,text,text,jsonb),public.mark_owner_onboarding_sent(uuid,text,boolean,jsonb),public.verify_owner_onboarding(uuid,text,text),public.get_verified_owner_onboarding(uuid,text) TO service_role;

-- The trigger and auth insertion share one transaction: a proof is consumed once,
-- and a failed user/cafe insert rolls it back. Caller-editable metadata is never proof.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  challenge owner_onboarding_private.challenges%ROWTYPE;
  v_cafe_id uuid;
  v_coupon public.representative_coupons%ROWTYPE;
  v_coupon_code text;
  v_slug text;
BEGIN
  IF coalesce(NEW.raw_user_meta_data->>'account_type','customer')<>'cafe_owner' THEN
    INSERT INTO public.profiles(id,email,full_name,role,status)
    VALUES(NEW.id,NEW.email,coalesce(NEW.raw_user_meta_data->>'full_name',''),'customer','active') ON CONFLICT(id) DO NOTHING;
    RETURN NEW;
  END IF;
  SELECT * INTO challenge FROM owner_onboarding_private.challenges
    WHERE id::text=NEW.raw_app_meta_data->>'owner_onboarding_id'
    AND session_hash=NEW.raw_app_meta_data->>'owner_onboarding_proof' FOR UPDATE;
  IF NOT FOUND OR NOT challenge.sent OR challenge.verified_at IS NULL OR challenge.expires_at<=now() OR challenge.consumed_by IS NOT NULL
    OR coalesce(NEW.email,'')<>''
    OR regexp_replace(coalesce(NEW.phone,''),'[^0-9]','','g')<>challenge.phone
    THEN RAISE EXCEPTION 'Verified owner onboarding required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('owner_signup_email:'||lower(challenge.draft->>'email'),0));
  IF EXISTS(SELECT 1 FROM public.profiles WHERE lower(email::text)=lower(challenge.draft->>'email'))
    OR EXISTS(SELECT 1 FROM auth.users WHERE lower(email::text)=lower(challenge.draft->>'email'))
    THEN RAISE EXCEPTION 'Owner identity unavailable' USING ERRCODE='23505'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.platform_plans WHERE id='owner_trial_7d' AND active AND features='["menu","settings"]'::jsonb)
    THEN RAISE EXCEPTION 'Owner trial plan unavailable'; END IF;
  v_slug:=challenge.draft->>'slug';
  IF v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(v_slug)>60 OR length(v_slug)<3
    THEN RAISE EXCEPTION 'Invalid brand slug'; END IF;
  v_coupon_code:=upper(btrim(coalesce(challenge.draft->>'couponCode','')));
  IF v_coupon_code<>'' THEN
    SELECT coupon.* INTO v_coupon FROM public.representative_coupons coupon
    JOIN public.platform_representatives representative ON representative.id=coupon.representative_id
    WHERE lower(coupon.code::text)=lower(v_coupon_code) AND coupon.active AND representative.active
      AND coupon.valid_from<=now() AND (coupon.valid_until IS NULL OR coupon.valid_until>=now()) LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid representative coupon'; END IF;
  END IF;
  UPDATE owner_onboarding_private.challenges SET consumed_by=NEW.id WHERE id=challenge.id;
  INSERT INTO public.profiles(id,email,full_name,phone,role,status)
    VALUES(NEW.id,challenge.draft->>'email',challenge.draft->>'ownerName',challenge.phone,'cafe_owner','active');
  INSERT INTO public.cafes(slug,name,name_en,owner_user_id,status,is_public,representative_id,referral_coupon_id,referral_started_at,business_category)
    VALUES(v_slug,challenge.draft->>'brandNameAr',challenge.draft->>'brandNameEn',NEW.id,'active',true,v_coupon.representative_id,v_coupon.id,
      CASE WHEN v_coupon.id IS NOT NULL THEN now() ELSE NULL END,'cafes_coffee') RETURNING id INTO v_cafe_id;
  INSERT INTO public.cafe_members(cafe_id,user_id,role,permissions) VALUES(v_cafe_id,NEW.id,'owner','{}'::jsonb);
  INSERT INTO public.cafe_settings(cafe_id,owner_name,owner_email,owner_phone,google_maps_url,google_maps_latitude,google_maps_longitude)
    VALUES(v_cafe_id,challenge.draft->>'ownerName',challenge.draft->>'email',challenge.phone,challenge.draft->>'mapsUrl',(challenge.draft->>'latitude')::numeric,(challenge.draft->>'longitude')::numeric);
  INSERT INTO public.subscriptions(cafe_id,plan_id,status,amount_sar,started_at,expires_at,plan_name_snapshot,duration_unit,duration_count,activation_source)
    VALUES(v_cafe_id,'owner_trial_7d','trialing',0,now(),now()+interval '7 days','تجربة المنيو لمدة ٧ أيام','day',7,'verified_owner_signup');
  IF v_coupon.id IS NOT NULL THEN
    INSERT INTO public.brand_referrals(cafe_id,representative_id,coupon_id) VALUES(v_cafe_id,v_coupon.representative_id,v_coupon.id);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated,service_role;
-- Old generic activation RPC must not give arbitrary callers additional trials.
REVOKE EXECUTE ON FUNCTION public.activate_default_trial_subscription_for_cafe(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.move_expired_trials_to_free_plan()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed integer;
BEGIN
  UPDATE public.subscriptions SET status='cancelled'
    WHERE status='trialing' AND expires_at IS NOT NULL AND expires_at<=now();
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed;
END $$;
REVOKE ALL ON FUNCTION public.move_expired_trials_to_free_plan() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.move_expired_trials_to_free_plan() TO service_role;
COMMIT;
