-- Barndaksa: enable events/conferences as a platform business category.
-- Additive only: no data deletion, no route changes, no Supabase CLI execution.

CREATE TABLE IF NOT EXISTS public.category_default_plans (
  category_id text PRIMARY KEY,
  default_plan_id text NOT NULL REFERENCES public.platform_plans(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT category_default_plans_category_check
    CHECK (category_id IN ('cafes_coffee', 'restaurants', 'events_conferences'))
);

CREATE TABLE IF NOT EXISTS public.event_ticket_settings (
  product_id uuid PRIMARY KEY REFERENCES public.menu_products(id) ON DELETE CASCADE,
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  event_start_at timestamptz,
  event_end_at timestamptz,
  venue_name text,
  gate_name text,
  capacity integer CHECK (capacity IS NULL OR capacity >= 0),
  sold_count integer NOT NULL DEFAULT 0 CHECK (sold_count >= 0),
  ticket_type text NOT NULL DEFAULT 'general_admission',
  ticket_valid_from timestamptz,
  ticket_valid_until timestamptz,
  max_per_customer integer CHECK (max_per_customer IS NULL OR max_per_customer > 0),
  checkin_policy text NOT NULL DEFAULT 'single_use'
    CHECK (checkin_policy IN ('single_use', 'multi_use')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_ticket_settings_cafe
  ON public.event_ticket_settings(cafe_id, event_start_at);

CREATE TABLE IF NOT EXISTS public.event_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  customer_profile_id uuid REFERENCES public.customer_profiles(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.menu_products(id) ON DELETE SET NULL,
  ticket_code text NOT NULL UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
  status text NOT NULL DEFAULT 'valid'
    CHECK (status IN ('valid', 'used', 'expired', 'cancelled')),
  valid_from timestamptz,
  valid_until timestamptz,
  used_at timestamptz,
  used_by_cashier_id uuid REFERENCES public.cafe_cashiers(id) ON DELETE SET NULL,
  used_gate_name text,
  scan_count integer NOT NULL DEFAULT 0 CHECK (scan_count >= 0),
  max_scan_count integer NOT NULL DEFAULT 1 CHECK (max_scan_count > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_tickets_cafe_customer
  ON public.event_tickets(cafe_id, customer_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_tickets_cafe_code
  ON public.event_tickets(cafe_id, upper(ticket_code));

ALTER TABLE public.category_default_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_ticket_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS category_default_plans_service_role_all ON public.category_default_plans;
CREATE POLICY category_default_plans_service_role_all
  ON public.category_default_plans
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS category_default_plans_platform_admin_all ON public.category_default_plans;
CREATE POLICY category_default_plans_platform_admin_all
  ON public.category_default_plans
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS category_default_plans_owner_read_own_category ON public.category_default_plans;
CREATE POLICY category_default_plans_owner_read_own_category
  ON public.category_default_plans
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.cafes cafe
      WHERE cafe.business_category = category_default_plans.category_id
        AND public.is_cafe_owner(cafe.id)
    )
  );

DROP POLICY IF EXISTS event_ticket_settings_service_role_all ON public.event_ticket_settings;
CREATE POLICY event_ticket_settings_service_role_all
  ON public.event_ticket_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS event_ticket_settings_platform_admin_all ON public.event_ticket_settings;
CREATE POLICY event_ticket_settings_platform_admin_all
  ON public.event_ticket_settings
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS event_ticket_settings_staff_read ON public.event_ticket_settings;
CREATE POLICY event_ticket_settings_staff_read
  ON public.event_ticket_settings
  FOR SELECT
  TO authenticated
  USING (
    public.is_cafe_owner(cafe_id)
    OR public.has_cafe_permission(cafe_id, 'menu')
    OR public.has_cafe_permission(cafe_id, 'settings')
    OR public.has_cafe_permission(cafe_id, 'orders')
  );

DROP POLICY IF EXISTS event_ticket_settings_staff_write ON public.event_ticket_settings;
CREATE POLICY event_ticket_settings_staff_write
  ON public.event_ticket_settings
  FOR ALL
  TO authenticated
  USING (
    public.is_cafe_owner(cafe_id)
    OR public.has_cafe_permission(cafe_id, 'menu')
    OR public.has_cafe_permission(cafe_id, 'settings')
    OR public.has_cafe_permission(cafe_id, 'orders')
  )
  WITH CHECK (
    public.is_cafe_owner(cafe_id)
    OR public.has_cafe_permission(cafe_id, 'menu')
    OR public.has_cafe_permission(cafe_id, 'settings')
    OR public.has_cafe_permission(cafe_id, 'orders')
  );

DROP POLICY IF EXISTS event_tickets_service_role_all ON public.event_tickets;
CREATE POLICY event_tickets_service_role_all
  ON public.event_tickets
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS event_tickets_platform_admin_all ON public.event_tickets;
CREATE POLICY event_tickets_platform_admin_all
  ON public.event_tickets
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS event_tickets_staff_read ON public.event_tickets;
CREATE POLICY event_tickets_staff_read
  ON public.event_tickets
  FOR SELECT
  TO authenticated
  USING (
    public.is_cafe_owner(cafe_id)
    OR public.has_cafe_permission(cafe_id, 'orders')
    OR public.has_cafe_permission(cafe_id, 'reports')
    OR public.has_cafe_permission(cafe_id, 'cashier')
  );

DROP POLICY IF EXISTS event_tickets_customer_read_own ON public.event_tickets;
CREATE POLICY event_tickets_customer_read_own
  ON public.event_tickets
  FOR SELECT
  TO authenticated
  USING (
    customer_profile_id IS NOT NULL
    AND customer_profile_id = public.get_customer_profile_id(cafe_id)
  );

CREATE OR REPLACE FUNCTION public.ensure_event_ticket_same_cafe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product_cafe_id uuid;
  v_customer_cafe_id uuid;
  v_order_cafe_id uuid;
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    SELECT cafe_id INTO v_product_cafe_id
    FROM public.menu_products
    WHERE id = NEW.product_id;

    IF v_product_cafe_id IS NULL OR v_product_cafe_id <> NEW.cafe_id THEN
      RAISE EXCEPTION 'Event ticket product does not belong to ticket cafe';
    END IF;
  END IF;

  IF NEW.customer_profile_id IS NOT NULL THEN
    SELECT cafe_id INTO v_customer_cafe_id
    FROM public.customer_profiles
    WHERE id = NEW.customer_profile_id;

    IF v_customer_cafe_id IS NULL OR v_customer_cafe_id <> NEW.cafe_id THEN
      RAISE EXCEPTION 'Event ticket customer does not belong to ticket cafe';
    END IF;
  END IF;

  IF NEW.order_id IS NOT NULL THEN
    SELECT cafe_id INTO v_order_cafe_id
    FROM public.orders
    WHERE id = NEW.order_id;

    IF v_order_cafe_id IS NULL OR v_order_cafe_id <> NEW.cafe_id THEN
      RAISE EXCEPTION 'Event ticket order does not belong to ticket cafe';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_tickets_same_cafe ON public.event_tickets;
CREATE TRIGGER trg_event_tickets_same_cafe
  BEFORE INSERT OR UPDATE OF cafe_id, customer_profile_id, order_id, product_id
  ON public.event_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_event_ticket_same_cafe();

CREATE OR REPLACE FUNCTION public.ensure_event_ticket_setting_product_same_cafe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product_cafe_id uuid;
BEGIN
  SELECT cafe_id INTO v_product_cafe_id
  FROM public.menu_products
  WHERE id = NEW.product_id;

  IF v_product_cafe_id IS NULL OR v_product_cafe_id <> NEW.cafe_id THEN
    RAISE EXCEPTION 'Event ticket setting product does not belong to setting cafe';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_ticket_settings_product_same_cafe ON public.event_ticket_settings;
CREATE TRIGGER trg_event_ticket_settings_product_same_cafe
  BEFORE INSERT OR UPDATE OF product_id, cafe_id
  ON public.event_ticket_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_event_ticket_setting_product_same_cafe();

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

  IF v_business_category NOT IN ('cafes_coffee', 'restaurants', 'events_conferences') THEN
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
  FROM public.category_default_plans defaults
  JOIN public.platform_plans plan ON plan.id = defaults.default_plan_id
  WHERE defaults.category_id = v_business_category
    AND plan.active = true
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT plan.* INTO v_default_plan
    FROM public.platform_plans plan
    WHERE plan.active = true
      AND COALESCE(plan.category_id, 'cafes_coffee') = v_business_category
    ORDER BY plan.is_default DESC, plan.free_after_trial DESC, plan.price_sar ASC, plan.sort_order ASC
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    SELECT plan.* INTO v_default_plan
    FROM public.platform_plans plan
    JOIN public.platform_settings settings ON settings.default_plan_id = plan.id
    WHERE settings.id = 'default'
      AND plan.active = true
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Default plan is not configured for business category';
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
