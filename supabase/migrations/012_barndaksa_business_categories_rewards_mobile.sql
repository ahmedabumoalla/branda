-- Barndaksa Platform — Brand classification maps and reward cards
-- Version: 012
-- Run after 011_barndaksa_electronic_branch_public_access.sql
-- TARGET: barndaksa-production

BEGIN;

ALTER TABLE public.cafes
  ADD COLUMN IF NOT EXISTS business_category text NOT NULL DEFAULT 'cafes_coffee';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cafes_business_category_check'
      AND conrelid = 'public.cafes'::regclass
  ) THEN
    ALTER TABLE public.cafes
      ADD CONSTRAINT cafes_business_category_check
      CHECK (
        business_category IN (
          'cafes_coffee',
          'restaurants',
          'massage_centers',
          'beauty_centers',
          'hair_salons',
          'clinics_health_centers',
          'gyms_fitness',
          'retail_stores',
          'clothing_stores',
          'furniture',
          'events_conferences'
        )
      ) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.cafes
  VALIDATE CONSTRAINT cafes_business_category_check;

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

  IF v_business_category <> 'cafes_coffee' THEN
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

CREATE TABLE IF NOT EXISTS public.mobile_customer_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  full_name text NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  barcode_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mobile_customer_profiles_username_format
    CHECK (username ~ '^[A-Za-z0-9_][A-Za-z0-9_.-]{2,29}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mobile_customer_profiles_username_lower
  ON public.mobile_customer_profiles(lower(username));

CREATE TABLE IF NOT EXISTS public.reward_programs (
  cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  purchases_required int NOT NULL DEFAULT 5 CHECK (purchases_required BETWEEN 1 AND 100),
  reward_product_id uuid REFERENCES public.menu_products(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reward_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  customer_user_id uuid NOT NULL REFERENCES public.mobile_customer_profiles(user_id) ON DELETE CASCADE,
  purchases_in_cycle int NOT NULL DEFAULT 0 CHECK (purchases_in_cycle >= 0),
  completed_cycles int NOT NULL DEFAULT 0 CHECK (completed_cycles >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cafe_id, customer_user_id)
);

CREATE TABLE IF NOT EXISTS public.reward_purchase_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  customer_user_id uuid NOT NULL REFERENCES public.mobile_customer_profiles(user_id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('purchase', 'redeem')),
  recorded_by uuid REFERENCES auth.users(id),
  product_id uuid REFERENCES public.menu_products(id) ON DELETE SET NULL,
  product_name_snapshot text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reward_events_cafe_created
  ON public.reward_purchase_events(cafe_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.reward_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  customer_user_id uuid NOT NULL REFERENCES public.mobile_customer_profiles(user_id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.menu_products(id) ON DELETE SET NULL,
  product_name_snapshot text NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'redeemed', 'cancelled')),
  earned_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz,
  redeemed_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_reward_redemptions_available
  ON public.reward_redemptions(cafe_id, customer_user_id)
  WHERE status = 'available';

ALTER TABLE public.mobile_customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_purchase_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.mobile_customer_profiles TO authenticated;
GRANT SELECT ON TABLE public.mobile_customer_profiles TO service_role;
GRANT SELECT ON TABLE public.reward_programs TO anon, authenticated;
GRANT SELECT ON TABLE public.reward_cards, public.reward_purchase_events, public.reward_redemptions TO authenticated;

DROP POLICY IF EXISTS mobile_customer_profiles_self_select ON public.mobile_customer_profiles;
CREATE POLICY mobile_customer_profiles_self_select ON public.mobile_customer_profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS reward_programs_public_select ON public.reward_programs;
CREATE POLICY reward_programs_public_select ON public.reward_programs
  FOR SELECT TO anon, authenticated
  USING (
    enabled = true
    AND EXISTS (
      SELECT 1
      FROM public.cafes c
      WHERE c.id = cafe_id
        AND c.status = 'active'
        AND c.is_public = true
        AND c.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS reward_programs_staff_select ON public.reward_programs;
CREATE POLICY reward_programs_staff_select ON public.reward_programs
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR public.is_cafe_owner(cafe_id)
    OR public.has_cafe_permission(cafe_id, 'loyalty')
  );

DROP POLICY IF EXISTS reward_cards_owner_select ON public.reward_cards;
CREATE POLICY reward_cards_owner_select ON public.reward_cards
  FOR SELECT TO authenticated
  USING (
    customer_user_id = auth.uid()
    OR public.is_platform_admin()
    OR public.is_cafe_owner(cafe_id)
    OR public.has_cafe_permission(cafe_id, 'loyalty')
  );

DROP POLICY IF EXISTS reward_events_owner_select ON public.reward_purchase_events;
CREATE POLICY reward_events_owner_select ON public.reward_purchase_events
  FOR SELECT TO authenticated
  USING (
    customer_user_id = auth.uid()
    OR public.is_platform_admin()
    OR public.is_cafe_owner(cafe_id)
    OR public.has_cafe_permission(cafe_id, 'loyalty')
  );

DROP POLICY IF EXISTS reward_redemptions_owner_select ON public.reward_redemptions;
CREATE POLICY reward_redemptions_owner_select ON public.reward_redemptions
  FOR SELECT TO authenticated
  USING (
    customer_user_id = auth.uid()
    OR public.is_platform_admin()
    OR public.is_cafe_owner(cafe_id)
    OR public.has_cafe_permission(cafe_id, 'loyalty')
  );

CREATE OR REPLACE FUNCTION public.create_mobile_customer_profile(
  p_username text,
  p_full_name text,
  p_phone text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_username text := lower(btrim(p_username));
  v_name text := btrim(p_full_name);
  v_phone text := regexp_replace(COALESCE(p_phone, ''), '[^0-9+]', '', 'g');
  v_email text;
  v_token uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_username !~ '^[a-z0-9_][a-z0-9_.-]{2,29}$' THEN
    RAISE EXCEPTION 'Invalid username';
  END IF;

  IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'Invalid full name';
  END IF;

  IF char_length(v_phone) < 8 OR char_length(v_phone) > 20 THEN
    RAISE EXCEPTION 'Invalid phone';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.mobile_customer_profiles (
    user_id, username, full_name, phone, email
  )
  VALUES (
    auth.uid(), v_username, v_name, v_phone, COALESCE(v_email, '')
  )
  ON CONFLICT (user_id) DO UPDATE SET
    username = EXCLUDED.username,
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    updated_at = now()
  RETURNING barcode_token INTO v_token;

  RETURN v_token;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Username already exists';
END;
$$;

REVOKE ALL ON FUNCTION public.create_mobile_customer_profile(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_mobile_customer_profile(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_reward_program(
  p_cafe_id uuid,
  p_enabled boolean,
  p_purchases_required int,
  p_reward_product_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (
    public.is_platform_admin()
    OR public.is_cafe_owner(p_cafe_id)
    OR public.has_cafe_permission(p_cafe_id, 'loyalty')
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_purchases_required < 1 OR p_purchases_required > 100 THEN
    RAISE EXCEPTION 'Invalid purchase count';
  END IF;

  IF p_enabled AND p_reward_product_id IS NULL THEN
    RAISE EXCEPTION 'Reward product required';
  END IF;

  IF p_reward_product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.menu_products product
    WHERE product.id = p_reward_product_id
      AND product.cafe_id = p_cafe_id
      AND product.available = true
      AND product.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Reward product not available';
  END IF;

  INSERT INTO public.reward_programs (
    cafe_id, enabled, purchases_required, reward_product_id, updated_by
  )
  VALUES (
    p_cafe_id, p_enabled, p_purchases_required, p_reward_product_id, auth.uid()
  )
  ON CONFLICT (cafe_id) DO UPDATE SET
    enabled = EXCLUDED.enabled,
    purchases_required = EXCLUDED.purchases_required,
    reward_product_id = EXCLUDED.reward_product_id,
    updated_by = auth.uid(),
    updated_at = now();

  PERFORM public.write_audit_log(
    p_cafe_id,
    'set_reward_program',
    'reward_programs',
    p_cafe_id,
    jsonb_build_object(
      'enabled', p_enabled,
      'purchases_required', p_purchases_required,
      'reward_product_id', p_reward_product_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_reward_program(uuid, boolean, int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_reward_program(uuid, boolean, int, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_reward_purchase(
  p_cafe_id uuid,
  p_barcode_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_program public.reward_programs%ROWTYPE;
  v_customer public.mobile_customer_profiles%ROWTYPE;
  v_card public.reward_cards%ROWTYPE;
  v_product_name text;
  v_reward_available boolean := false;
BEGIN
  IF NOT (
    public.is_cafe_owner(p_cafe_id)
    OR public.has_cafe_permission(p_cafe_id, 'loyalty')
    OR public.is_platform_admin()
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_program
  FROM public.reward_programs
  WHERE cafe_id = p_cafe_id
    AND enabled = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reward program is not active';
  END IF;

  SELECT * INTO v_customer
  FROM public.mobile_customer_profiles
  WHERE barcode_token = p_barcode_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer barcode not found';
  END IF;

  SELECT name INTO v_product_name
  FROM public.menu_products
  WHERE id = v_program.reward_product_id
    AND cafe_id = p_cafe_id
    AND available = true
    AND deleted_at IS NULL;

  IF v_product_name IS NULL THEN
    RAISE EXCEPTION 'Reward product is not available';
  END IF;

  INSERT INTO public.reward_cards (cafe_id, customer_user_id, purchases_in_cycle)
  VALUES (p_cafe_id, v_customer.user_id, 1)
  ON CONFLICT (cafe_id, customer_user_id) DO UPDATE SET
    purchases_in_cycle = public.reward_cards.purchases_in_cycle + 1,
    updated_at = now()
  RETURNING * INTO v_card;

  INSERT INTO public.reward_purchase_events (
    cafe_id, customer_user_id, event_type, recorded_by
  )
  VALUES (p_cafe_id, v_customer.user_id, 'purchase', auth.uid());

  IF v_card.purchases_in_cycle >= v_program.purchases_required THEN
    INSERT INTO public.reward_redemptions (
      cafe_id, customer_user_id, product_id, product_name_snapshot
    )
    VALUES (
      p_cafe_id, v_customer.user_id, v_program.reward_product_id, v_product_name
    );

    UPDATE public.reward_cards
    SET purchases_in_cycle = 0,
        completed_cycles = completed_cycles + 1,
        updated_at = now()
    WHERE id = v_card.id
    RETURNING * INTO v_card;

    v_reward_available := true;
  END IF;

  RETURN jsonb_build_object(
    'customer_name', v_customer.full_name,
    'purchases_in_cycle', v_card.purchases_in_cycle,
    'purchases_required', v_program.purchases_required,
    'reward_available', v_reward_available,
    'reward_product_name', v_product_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_reward_purchase(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_reward_purchase(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_reward(
  p_cafe_id uuid,
  p_barcode_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer public.mobile_customer_profiles%ROWTYPE;
  v_redemption public.reward_redemptions%ROWTYPE;
BEGIN
  IF NOT (
    public.is_cafe_owner(p_cafe_id)
    OR public.has_cafe_permission(p_cafe_id, 'loyalty')
    OR public.is_platform_admin()
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_customer
  FROM public.mobile_customer_profiles
  WHERE barcode_token = p_barcode_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer barcode not found';
  END IF;

  SELECT * INTO v_redemption
  FROM public.reward_redemptions
  WHERE cafe_id = p_cafe_id
    AND customer_user_id = v_customer.user_id
    AND status = 'available'
  ORDER BY earned_at ASC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No available reward';
  END IF;

  UPDATE public.reward_redemptions
  SET status = 'redeemed',
      redeemed_at = now(),
      redeemed_by = auth.uid()
  WHERE id = v_redemption.id;

  INSERT INTO public.reward_purchase_events (
    cafe_id, customer_user_id, event_type, recorded_by, product_id, product_name_snapshot
  ) VALUES (
    p_cafe_id, v_customer.user_id, 'redeem', auth.uid(),
    v_redemption.product_id, v_redemption.product_name_snapshot
  );

  RETURN jsonb_build_object(
    'customer_name', v_customer.full_name,
    'reward_product_name', v_redemption.product_name_snapshot
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_reward(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_reward(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_brands_and_branches()
RETURNS TABLE (
  cafe_id uuid,
  cafe_slug text,
  cafe_name text,
  business_category text,
  branch_id uuid,
  branch_name text,
  address text,
  city text,
  lat numeric,
  lng numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    cafe.id,
    cafe.slug::text,
    cafe.name,
    cafe.business_category,
    branch.id,
    branch.name,
    branch.address,
    branch.city,
    branch.lat,
    branch.lng
  FROM public.cafes cafe
  LEFT JOIN public.branches branch
    ON branch.cafe_id = cafe.id
   AND branch.active = true
   AND branch.deleted_at IS NULL
  WHERE cafe.status = 'active'
    AND cafe.is_public = true
    AND cafe.deleted_at IS NULL
  ORDER BY cafe.name, branch.sort_order, branch.name;
$$;

REVOKE ALL ON FUNCTION public.get_public_brands_and_branches() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_brands_and_branches() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_reward_wallet()
RETURNS TABLE (
  cafe_id uuid,
  cafe_slug text,
  cafe_name text,
  purchases_in_cycle int,
  purchases_required int,
  completed_cycles int,
  reward_product_name text,
  available_rewards bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    cafe.id,
    cafe.slug::text,
    cafe.name,
    COALESCE(card.purchases_in_cycle, 0),
    program.purchases_required,
    COALESCE(card.completed_cycles, 0),
    product.name,
    (
      SELECT count(*)
      FROM public.reward_redemptions redemption
      WHERE redemption.cafe_id = cafe.id
        AND redemption.customer_user_id = auth.uid()
        AND redemption.status = 'available'
    )
  FROM public.reward_programs program
  JOIN public.cafes cafe ON cafe.id = program.cafe_id
  LEFT JOIN public.reward_cards card
    ON card.cafe_id = program.cafe_id
   AND card.customer_user_id = auth.uid()
  LEFT JOIN public.menu_products product ON product.id = program.reward_product_id
  WHERE auth.uid() IS NOT NULL
    AND program.enabled = true
    AND cafe.status = 'active'
    AND cafe.is_public = true
    AND cafe.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.get_my_reward_wallet() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_reward_wallet() TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_experience_submission_without_reward(
  p_submission_id uuid
)
RETURNS public.experience_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_submission public.experience_submissions%ROWTYPE;
BEGIN
  SELECT * INTO v_submission
  FROM public.experience_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  IF NOT (
    public.is_platform_admin()
    OR public.is_cafe_owner(v_submission.cafe_id)
    OR public.has_cafe_permission(v_submission.cafe_id, 'marketing')
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_submission.status <> 'pending' THEN
    RAISE EXCEPTION 'Submission is not pending';
  END IF;

  UPDATE public.experience_submissions
  SET status = 'approved',
      awarded_points = 0,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      updated_at = now()
  WHERE id = p_submission_id
  RETURNING * INTO v_submission;

  PERFORM public.write_audit_log(
    v_submission.cafe_id,
    'approve_experience_submission_without_reward',
    'experience_submissions',
    p_submission_id,
    jsonb_build_object('status', 'approved')
  );

  RETURN v_submission;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_experience_submission_without_reward(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_experience_submission_without_reward(uuid) TO authenticated;

COMMIT;

SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'cafes'
  AND column_name = 'business_category';

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'mobile_customer_profiles',
    'reward_programs',
    'reward_cards',
    'reward_purchase_events',
    'reward_redemptions'
  )
ORDER BY table_name;
