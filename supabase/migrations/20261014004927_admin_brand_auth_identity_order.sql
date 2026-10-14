-- Keep the existing signup paths; fix only service-staged admin identities
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
  v_admin_proof text;
BEGIN
  -- Admin Auth inserts the user BEFORE applying app_metadata. Bind the initial
  -- INSERT to the exact UUID reserved by the service-only admin staging RPC.
  -- No user_metadata value grants authorization; complete_account rechecks the
  -- issuing administrator, identity, expiry and trial configuration atomically.
  SELECT proof INTO v_admin_proof FROM brand_onboarding_private.accounts
    WHERE id=NEW.id AND state='draft' AND cafe_id IS NULL;
  IF FOUND THEN
    PERFORM brand_onboarding_private.complete_account(NEW.id,NEW.phone,NEW.id::text,v_admin_proof);
    RETURN NEW;
  END IF;
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
