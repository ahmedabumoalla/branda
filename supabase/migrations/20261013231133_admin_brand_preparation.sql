CREATE SCHEMA IF NOT EXISTS brand_onboarding_private;
REVOKE ALL ON SCHEMA brand_onboarding_private FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE brand_onboarding_private.accounts (
  id uuid PRIMARY KEY,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  draft jsonb NOT NULL,
  fingerprint text NOT NULL,
  proof text NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  password_ciphertext text,
  owner_password_hash text,
  cafe_id uuid UNIQUE REFERENCES public.cafes(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','ready','sending','uncertain','sent')),
  attempt_id uuid,
  attempt_started_at timestamptz,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE brand_onboarding_private.accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON brand_onboarding_private.accounts FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION brand_onboarding_private.require_admin(p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='platform_admin' AND status='active') THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION brand_onboarding_private.require_admin(uuid) FROM PUBLIC;

CREATE FUNCTION public.admin_prepare_brand_account(p_id uuid,p_actor uuid,p_draft jsonb,p_fingerprint text,p_ciphertext text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v brand_onboarding_private.accounts%ROWTYPE; v_plan text;
BEGIN
  PERFORM brand_onboarding_private.require_admin(p_actor);
  PERFORM pg_advisory_xact_lock(hashtextextended('admin-brand-create:'||p_id::text,0));
  SELECT * INTO v FROM brand_onboarding_private.accounts WHERE id=p_id FOR UPDATE;
  IF FOUND THEN
    IF v.created_by<>p_actor OR v.fingerprint<>p_fingerprint THEN RAISE EXCEPTION 'REQUEST_CHANGED'; END IF;
    RETURN jsonb_build_object('cafeId',v.cafe_id,'proof',v.proof);
  END IF;
  IF p_draft->>'slug' !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(p_draft->>'slug') NOT BETWEEN 3 AND 60
    OR p_draft->>'phone' !~ '^9665[0-9]{8}$' OR length(coalesce(p_draft->>'brandName','')) NOT BETWEEN 2 AND 120
    OR length(coalesce(p_draft->>'ownerName','')) NOT BETWEEN 2 AND 120
    OR coalesce(p_draft->>'category','') NOT IN ('cafes_coffee','restaurants','events_conferences')
    OR length(coalesce(p_ciphertext,'')) NOT BETWEEN 40 AND 1000 OR length(coalesce(p_fingerprint,''))<>64 THEN
    RAISE EXCEPTION 'INVALID_ACCOUNT_DATA';
  END IF;
  IF EXISTS(SELECT 1 FROM public.cafes WHERE slug=p_draft->>'slug') THEN RAISE EXCEPTION 'SLUG_EXISTS'; END IF;
  IF EXISTS(SELECT 1 FROM auth.users WHERE regexp_replace(coalesce(phone,''),'[^0-9]','','g')=p_draft->>'phone')
    OR EXISTS(SELECT 1 FROM public.profiles WHERE regexp_replace(coalesce(phone,''),'[^0-9]','','g')=p_draft->>'phone') THEN
    RAISE EXCEPTION 'PHONE_EXISTS';
  END IF;
  SELECT p.id INTO v_plan FROM public.platform_plans p
    WHERE p.id=coalesce((SELECT default_plan_id FROM public.category_default_plans WHERE category_id=p_draft->>'category'),
      (SELECT default_plan_id FROM public.platform_settings WHERE id='default'))
    AND p.active AND p.price_sar=0 AND p.trial_days>0;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRIAL_PLAN_UNAVAILABLE'; END IF;
  INSERT INTO brand_onboarding_private.accounts(id,created_by,draft,fingerprint,password_ciphertext)
    VALUES(p_id,p_actor,p_draft||jsonb_build_object('planId',v_plan),p_fingerprint,p_ciphertext) RETURNING * INTO v;
  RETURN jsonb_build_object('cafeId',NULL,'proof',v.proof);
END $$;

CREATE FUNCTION brand_onboarding_private.complete_account(p_owner uuid,p_phone text,p_id text,p_proof text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v brand_onboarding_private.accounts%ROWTYPE; v_cafe uuid; v_sub uuid; v_plan public.platform_plans%ROWTYPE;
BEGIN
  SELECT * INTO v FROM brand_onboarding_private.accounts WHERE id::text=p_id AND proof=p_proof FOR UPDATE;
  IF NOT FOUND OR v.state<>'draft' OR v.cafe_id IS NOT NULL OR v.created_at<now()-interval '1 day'
    OR regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')<>v.draft->>'phone' THEN
    RAISE EXCEPTION 'ADMIN_ONBOARDING_REQUIRED' USING ERRCODE='42501';
  END IF;
  PERFORM brand_onboarding_private.require_admin(v.created_by);
  SELECT * INTO v_plan FROM public.platform_plans WHERE id=v.draft->>'planId' AND active AND price_sar=0 FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRIAL_PLAN_UNAVAILABLE'; END IF;
  IF coalesce(v.draft->>'email','')<>'' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('owner_signup_email:'||lower(v.draft->>'email'),0));
    IF EXISTS(SELECT 1 FROM public.profiles WHERE lower(email::text)=lower(v.draft->>'email'))
      OR EXISTS(SELECT 1 FROM auth.users WHERE lower(email::text)=lower(v.draft->>'email')) THEN RAISE EXCEPTION 'EMAIL_EXISTS'; END IF;
  END IF;
  INSERT INTO public.profiles(id,email,full_name,phone,role,status)
    VALUES(p_owner,nullif(v.draft->>'email',''),v.draft->>'ownerName',v.draft->>'phone','cafe_owner','active');
  INSERT INTO public.cafes(slug,name,name_en,owner_user_id,status,is_public,business_category)
    VALUES(v.draft->>'slug',v.draft->>'brandName',v.draft->>'brandNameEn',p_owner,'active',true,v.draft->>'category') RETURNING id INTO v_cafe;
  INSERT INTO public.cafe_members(cafe_id,user_id,role,permissions) VALUES(v_cafe,p_owner,'owner','{}'::jsonb);
  INSERT INTO public.cafe_settings(cafe_id,owner_name,owner_email,owner_phone)
    VALUES(v_cafe,v.draft->>'ownerName',v.draft->>'email',v.draft->>'phone');
  -- Access is ready immediately. The actual seven-day window is assigned only after send acknowledgement.
  INSERT INTO public.subscriptions(cafe_id,plan_id,status,amount_sar,started_at,expires_at,plan_name_snapshot,duration_unit,duration_count,activation_source)
    VALUES(v_cafe,v_plan.id,'trialing',0,now(),NULL,v_plan.name,'day',7,'admin_prepared_trial') RETURNING id INTO v_sub;
  UPDATE brand_onboarding_private.accounts SET cafe_id=v_cafe,owner_id=p_owner,subscription_id=v_sub,state='ready',
    owner_password_hash=(SELECT encrypted_password FROM auth.users WHERE id=p_owner) WHERE id=v.id;
END $$;
REVOKE ALL ON FUNCTION brand_onboarding_private.complete_account(uuid,text,text,text) FROM PUBLIC;

CREATE FUNCTION public.admin_brand_onboarding_status() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('cafeId',cafe_id,
    'state',CASE WHEN state='sending' AND attempt_started_at<now()-interval '2 minutes' THEN 'uncertain' ELSE state END,
    'sentAt',sent_at)) FROM brand_onboarding_private.accounts WHERE cafe_id IS NOT NULL),'[]'::jsonb);
END $$;

CREATE FUNCTION public.admin_claim_brand_welcome(p_actor uuid,p_cafe uuid,p_attempt uuid,p_retry_uncertain boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v brand_onboarding_private.accounts%ROWTYPE;
BEGIN
  PERFORM brand_onboarding_private.require_admin(p_actor);
  PERFORM 1 FROM public.cafes WHERE id=p_cafe AND deleted_at IS NULL AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BRAND_UNAVAILABLE'; END IF;
  SELECT * INTO v FROM brand_onboarding_private.accounts WHERE cafe_id=p_cafe FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_PREPARED'; END IF;
  IF v.state='sent' THEN RETURN jsonb_build_object('sent',true); END IF;
  IF v.state='sending' AND v.attempt_started_at>now()-interval '2 minutes' THEN RAISE EXCEPTION 'SEND_IN_PROGRESS'; END IF;
  IF v.state IN ('sending','uncertain') AND NOT p_retry_uncertain THEN RAISE EXCEPTION 'SEND_UNCERTAIN'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.subscriptions s JOIN public.platform_plans p ON p.id=s.plan_id
    WHERE s.id=v.subscription_id AND s.status='trialing' AND s.activation_source='admin_prepared_trial' AND p.active) THEN
    RAISE EXCEPTION 'PREPARED_TRIAL_CHANGED';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v.owner_id AND regexp_replace(coalesce(phone,''),'[^0-9]','','g')=v.draft->>'phone') THEN
    RAISE EXCEPTION 'OWNER_PHONE_CHANGED';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v.owner_id AND encrypted_password=v.owner_password_hash) THEN
    RAISE EXCEPTION 'OWNER_PASSWORD_CHANGED';
  END IF;
  UPDATE brand_onboarding_private.accounts SET state='sending',attempt_id=p_attempt,attempt_started_at=now() WHERE id=v.id;
  RETURN jsonb_build_object('sent',false,'requestId',v.id,'phone',v.draft->>'phone','brandName',v.draft->>'brandName','ciphertext',v.password_ciphertext);
END $$;

CREATE FUNCTION public.admin_finish_brand_welcome(p_actor uuid,p_cafe uuid,p_attempt uuid,p_message_id text,p_sent_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v brand_onboarding_private.accounts%ROWTYPE;
BEGIN
  PERFORM brand_onboarding_private.require_admin(p_actor);
  PERFORM 1 FROM public.cafes WHERE id=p_cafe FOR UPDATE;
  SELECT * INTO v FROM brand_onboarding_private.accounts WHERE cafe_id=p_cafe FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_PREPARED'; END IF;
  IF v.state='sent' THEN RETURN; END IF;
  IF v.attempt_id IS DISTINCT FROM p_attempt OR v.state<>'sending' OR length(coalesce(p_message_id,'')) NOT BETWEEN 1 AND 256
    OR p_sent_at IS NULL OR p_sent_at>now()+interval '1 minute' OR p_sent_at<v.attempt_started_at-interval '1 minute' THEN
    RAISE EXCEPTION 'INVALID_SEND_RECEIPT';
  END IF;
  UPDATE public.subscriptions SET started_at=p_sent_at,expires_at=p_sent_at+interval '7 days',duration_unit='day',duration_count=7,
    activation_source='admin_whatsapp_trial',updated_at=now()
    WHERE id=v.subscription_id AND status='trialing' AND activation_source='admin_prepared_trial';
  UPDATE brand_onboarding_private.accounts SET state='sent',sent_at=p_sent_at,provider_message_id=p_message_id,password_ciphertext=NULL,
    owner_password_hash=NULL,proof='' WHERE id=v.id;
END $$;

CREATE FUNCTION public.admin_fail_brand_welcome(p_actor uuid,p_cafe uuid,p_attempt uuid,p_uncertain boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM brand_onboarding_private.require_admin(p_actor);
  UPDATE brand_onboarding_private.accounts SET state=CASE WHEN p_uncertain THEN 'uncertain' ELSE 'ready' END
    WHERE cafe_id=p_cafe AND attempt_id=p_attempt AND state='sending';
END $$;

REVOKE ALL ON FUNCTION public.admin_prepare_brand_account(uuid,uuid,jsonb,text,text),public.admin_claim_brand_welcome(uuid,uuid,uuid,boolean),
  public.admin_finish_brand_welcome(uuid,uuid,uuid,text,timestamptz),public.admin_fail_brand_welcome(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_prepare_brand_account(uuid,uuid,jsonb,text,text),public.admin_claim_brand_welcome(uuid,uuid,uuid,boolean),
  public.admin_finish_brand_welcome(uuid,uuid,uuid,text,timestamptz),public.admin_fail_brand_welcome(uuid,uuid,uuid,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.admin_brand_onboarding_status() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_brand_onboarding_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  challenge owner_onboarding_private.challenges%ROWTYPE;
  v_cafe_id uuid;
  v_plan public.platform_plans%ROWTYPE;
  v_coupon public.representative_coupons%ROWTYPE;
  v_coupon_code text;
  v_slug text;
BEGIN
  IF NEW.raw_app_meta_data->>'admin_brand_onboarding_id' IS NOT NULL THEN
    PERFORM brand_onboarding_private.complete_account(NEW.id,NEW.phone,
      NEW.raw_app_meta_data->>'admin_brand_onboarding_id',NEW.raw_app_meta_data->>'admin_brand_onboarding_proof');
    RETURN NEW;
  END IF;
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
  SELECT plan.* INTO v_plan FROM public.platform_plans plan
    WHERE plan.id=coalesce(
      (SELECT default_plan_id FROM public.category_default_plans WHERE category_id='cafes_coffee'),
      (SELECT default_plan_id FROM public.platform_settings WHERE id='default'))
    AND plan.active AND plan.trial_days BETWEEN 1 AND 365 FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Configured owner trial plan unavailable'; END IF;
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
    VALUES(v_cafe_id,v_plan.id,'trialing',0,now(),now()+make_interval(days=>v_plan.trial_days),v_plan.name,'day',v_plan.trial_days,'verified_owner_signup');
  IF v_coupon.id IS NOT NULL THEN
    INSERT INTO public.brand_referrals(cafe_id,representative_id,coupon_id) VALUES(v_cafe_id,v_coupon.representative_id,v_coupon.id);
  END IF;
  RETURN NEW;
END $function$
;
