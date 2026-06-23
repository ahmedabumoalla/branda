-- Barndaksa: allow restaurant owner registration through the existing cafe-owner flow.
-- This migration only updates the signup trigger function. It does not touch data,
-- tables, columns, subscriptions, or routes.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_type text := COALESCE(NEW.raw_user_meta_data->>'account_type', 'customer');
  v_cafe_id uuid;
  v_slug text;
  v_name text;
  v_phone text;
  v_coupon_code text;
  v_business_category text;
  v_primary_branch_name text;
  v_primary_branch_address text;
  v_primary_branch_city text;
  v_primary_branch_lat numeric(10,7);
  v_primary_branch_lng numeric(10,7);
  v_coupon public.representative_coupons%ROWTYPE;
  v_default_plan public.platform_plans%ROWTYPE;
  v_started_at timestamptz := now();
BEGIN
  IF v_account_type <> 'cafe_owner' THEN
    INSERT INTO public.profiles (id, email, full_name, role, status)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      'customer',
      'active'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END IF;

  v_slug := lower(btrim(COALESCE(NEW.raw_user_meta_data->>'cafe_slug', '')));
  v_name := btrim(COALESCE(NEW.raw_user_meta_data->>'cafe_name', ''));
  v_phone := regexp_replace(COALESCE(NEW.raw_user_meta_data->>'phone', ''), '[^0-9]', '', 'g');
  v_coupon_code := upper(btrim(COALESCE(NEW.raw_user_meta_data->>'coupon_code', '')));
  v_business_category := COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'brand_category'), ''), 'cafes_coffee');
  v_primary_branch_name := btrim(COALESCE(NEW.raw_user_meta_data->>'primary_branch_name', ''));
  v_primary_branch_address := btrim(COALESCE(NEW.raw_user_meta_data->>'primary_branch_address', ''));
  v_primary_branch_city := btrim(COALESCE(NEW.raw_user_meta_data->>'primary_branch_city', ''));

  IF v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     OR char_length(v_slug) < 3
     OR char_length(v_slug) > 60 THEN
    RAISE EXCEPTION 'Invalid cafe slug';
  END IF;

  IF v_name = '' OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'Invalid cafe name';
  END IF;

  IF v_business_category NOT IN ('cafes_coffee', 'restaurants') THEN
    RAISE EXCEPTION 'Business category is not available yet';
  END IF;

  IF v_primary_branch_name = '' OR char_length(v_primary_branch_name) > 100 THEN
    RAISE EXCEPTION 'Primary branch name is required';
  END IF;

  IF v_primary_branch_address = '' OR char_length(v_primary_branch_address) > 250 THEN
    RAISE EXCEPTION 'Primary branch address is required';
  END IF;

  IF v_primary_branch_city = '' OR char_length(v_primary_branch_city) > 100 THEN
    RAISE EXCEPTION 'Primary branch city is required';
  END IF;

  BEGIN
    v_primary_branch_lat := (NEW.raw_user_meta_data->>'primary_branch_lat')::numeric(10,7);
    v_primary_branch_lng := (NEW.raw_user_meta_data->>'primary_branch_lng')::numeric(10,7);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Primary branch location coordinates are required';
  END;

  IF v_primary_branch_lat < -90 OR v_primary_branch_lat > 90
     OR v_primary_branch_lng < -180 OR v_primary_branch_lng > 180 THEN
    RAISE EXCEPTION 'Invalid primary branch location coordinates';
  END IF;

  SELECT plan.* INTO v_default_plan
  FROM public.platform_plans plan
  JOIN public.platform_settings settings ON settings.default_plan_id = plan.id
  WHERE settings.id = 'default'
    AND plan.active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Default plan is not configured';
  END IF;

  IF v_coupon_code <> '' THEN
    SELECT coupon.* INTO v_coupon
    FROM public.representative_coupons coupon
    JOIN public.platform_representatives representative
      ON representative.id = coupon.representative_id
    WHERE lower(coupon.code::text) = lower(v_coupon_code)
      AND coupon.active = true
      AND representative.active = true
      AND coupon.valid_from <= now()
      AND (coupon.valid_until IS NULL OR coupon.valid_until >= now())
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid representative coupon';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    v_phone,
    'cafe_owner',
    'active'
  );

  INSERT INTO public.cafes (
    slug,
    name,
    owner_user_id,
    status,
    is_public,
    representative_id,
    referral_coupon_id,
    referral_started_at,
    business_category
  )
  VALUES (
    v_slug,
    v_name,
    NEW.id,
    'active',
    true,
    CASE WHEN v_coupon.id IS NOT NULL THEN v_coupon.representative_id ELSE NULL END,
    v_coupon.id,
    CASE WHEN v_coupon.id IS NOT NULL THEN now() ELSE NULL END,
    v_business_category
  )
  RETURNING id INTO v_cafe_id;

  INSERT INTO public.cafe_members (cafe_id, user_id, role, permissions)
  VALUES (v_cafe_id, NEW.id, 'owner', '{}'::jsonb);

  INSERT INTO public.cafe_settings (cafe_id, owner_name, owner_email, owner_phone)
  VALUES (
    v_cafe_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    v_phone
  );

  INSERT INTO public.branches (
    cafe_id,
    name,
    address,
    city,
    lat,
    lng,
    active,
    sort_order,
    is_primary
  )
  VALUES (
    v_cafe_id,
    v_primary_branch_name,
    v_primary_branch_address,
    v_primary_branch_city,
    v_primary_branch_lat,
    v_primary_branch_lng,
    true,
    0,
    true
  );

  INSERT INTO public.subscriptions (
    cafe_id,
    plan_id,
    status,
    amount_sar,
    started_at,
    expires_at,
    plan_name_snapshot,
    duration_unit,
    duration_count,
    activation_source
  )
  VALUES (
    v_cafe_id,
    v_default_plan.id,
    'active',
    0,
    v_started_at,
    public.calculate_subscription_expiry(
      v_started_at,
      v_default_plan.duration_unit,
      v_default_plan.duration_count
    ),
    v_default_plan.name,
    v_default_plan.duration_unit,
    v_default_plan.duration_count,
    'signup_default_plan'
  );

  IF v_coupon.id IS NOT NULL THEN
    INSERT INTO public.brand_referrals (cafe_id, representative_id, coupon_id)
    VALUES (v_cafe_id, v_coupon.representative_id, v_coupon.id);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
