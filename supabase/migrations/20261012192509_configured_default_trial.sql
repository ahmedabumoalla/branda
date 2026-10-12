-- New owners receive the configured default plan once, for its configured trial days.
-- Existing paid and complimentary subscriptions retain their original deadlines.
BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_free_trial_plan_duration()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.price_sar=0 AND NEW.trial_days>0 THEN
    NEW.duration_unit:='day';
    NEW.duration_count:=NEW.trial_days;
    NEW.free_after_trial:=false;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.normalize_free_trial_plan_duration() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER normalize_free_trial_plan_duration
  BEFORE INSERT OR UPDATE OF price_sar,trial_days,duration_unit,duration_count,free_after_trial
  ON public.platform_plans FOR EACH ROW EXECUTE FUNCTION public.normalize_free_trial_plan_duration();

UPDATE public.platform_plans SET duration_unit='day',duration_count=trial_days,free_after_trial=false
WHERE price_sar=0 AND trial_days>0
  AND (duration_unit IS DISTINCT FROM 'day' OR duration_count IS DISTINCT FROM trial_days OR free_after_trial);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  challenge owner_onboarding_private.challenges%ROWTYPE;
  v_cafe_id uuid;
  v_plan public.platform_plans%ROWTYPE;
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
END $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated,service_role;

-- Normalize every automatic signup path with no hidden 15-day fallback.
CREATE OR REPLACE FUNCTION public.force_signup_default_plan_to_trial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_trial_days integer;
BEGIN
  IF NEW.activation_source IN ('signup_default_plan','default_trial','verified_owner_signup') THEN
    SELECT trial_days INTO v_trial_days FROM public.platform_plans WHERE id=NEW.plan_id AND active FOR SHARE;
    IF v_trial_days IS NULL OR v_trial_days NOT BETWEEN 1 AND 365 THEN
      RAISE EXCEPTION 'Configured owner trial days unavailable';
    END IF;
    NEW.status:='trialing';
    NEW.amount_sar:=0;
    NEW.base_amount_sar:=0;
    NEW.discount_amount_sar:=0;
    NEW.started_at:=coalesce(NEW.started_at,now());
    NEW.expires_at:=NEW.started_at+make_interval(days=>v_trial_days);
    NEW.duration_unit:='day';
    NEW.duration_count:=v_trial_days;
    NEW.payment_provider:='internal';
    NEW.payment_method_label:=format('تجربة مجانية %s أيام',v_trial_days);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.force_signup_default_plan_to_trial() FROM PUBLIC,anon,authenticated,service_role;

-- Registration is the only trial grant; the retired RPC must never reset a deadline.
CREATE OR REPLACE FUNCTION public.activate_default_trial_subscription_for_cafe(p_cafe_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Verified owner onboarding required' USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION public.activate_default_trial_subscription_for_cafe(uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
