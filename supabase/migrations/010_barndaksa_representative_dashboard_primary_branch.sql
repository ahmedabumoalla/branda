-- Barndaksa Platform — Representative dashboard and required primary brand branch
-- Version: 010
-- Run after 008 and 009
-- TARGET: barndaksa-production

BEGIN;

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_one_primary_per_cafe
  ON public.branches(cafe_id)
  WHERE is_primary = true AND deleted_at IS NULL;

WITH first_branch AS (
  SELECT DISTINCT ON (b.cafe_id) b.id, b.cafe_id
  FROM public.branches b
  WHERE b.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.branches current_primary
      WHERE current_primary.cafe_id = b.cafe_id
        AND current_primary.is_primary = true
        AND current_primary.deleted_at IS NULL
    )
  ORDER BY b.cafe_id, b.sort_order ASC, b.created_at ASC
)
UPDATE public.branches b
SET is_primary = true,
    updated_at = now()
FROM first_branch candidate
WHERE b.id = candidate.id;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.platform_representatives,
  public.representative_coupons
TO service_role;

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
    referral_started_at
  )
  VALUES (
    v_slug,
    v_name,
    NEW.id,
    'active',
    true,
    CASE WHEN v_coupon.id IS NOT NULL THEN v_coupon.representative_id ELSE NULL END,
    v_coupon.id,
    CASE WHEN v_coupon.id IS NOT NULL THEN now() ELSE NULL END
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

CREATE OR REPLACE FUNCTION public.admin_approve_subscription_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.subscription_payment_requests%ROWTYPE;
  v_subscription_id uuid;
  v_started_at timestamptz := now();
  v_referral public.brand_referrals%ROWTYPE;
  v_months_elapsed int;
  v_rate numeric(5,2);
  v_commission_type text;
  v_commission_base numeric(10,2);
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_request
  FROM public.subscription_payment_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR v_request.status <> 'pending_review' THEN
    RAISE EXCEPTION 'Request is not ready for approval';
  END IF;

  IF v_request.payment_method = 'bank_transfer'
     AND v_request.receipt_storage_path IS NULL THEN
    RAISE EXCEPTION 'Receipt is required';
  END IF;

  UPDATE public.subscriptions
  SET status = 'cancelled',
      cancelled_at = v_started_at,
      updated_at = now()
  WHERE cafe_id = v_request.cafe_id
    AND status IN ('active', 'trialing');

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
    activation_source,
    payment_request_id
  )
  VALUES (
    v_request.cafe_id,
    v_request.plan_id,
    'active',
    v_request.amount_sar,
    v_started_at,
    public.calculate_subscription_expiry(
      v_started_at,
      v_request.duration_unit,
      v_request.duration_count
    ),
    v_request.plan_name,
    v_request.duration_unit,
    v_request.duration_count,
    v_request.payment_method,
    v_request.id
  )
  RETURNING id INTO v_subscription_id;

  UPDATE public.subscription_payment_requests
  SET status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      approved_subscription_id = v_subscription_id,
      updated_at = now()
  WHERE id = p_request_id;

  SELECT * INTO v_referral
  FROM public.brand_referrals
  WHERE cafe_id = v_request.cafe_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_referral.first_paid_subscription_at IS NULL THEN
      UPDATE public.brand_referrals
      SET first_paid_subscription_at = v_started_at,
          commission_end_at = v_started_at + interval '12 months'
      WHERE id = v_referral.id;

      v_months_elapsed := 0;
      v_commission_type := 'initial';
    ELSE
      v_months_elapsed :=
        EXTRACT(YEAR FROM age(v_started_at, v_referral.first_paid_subscription_at))::int * 12
        + EXTRACT(MONTH FROM age(v_started_at, v_referral.first_paid_subscription_at))::int;
      v_commission_type := 'renewal';
    END IF;

    v_rate := CASE
      WHEN v_months_elapsed < 6 THEN 40
      WHEN v_months_elapsed < 12 THEN 20
      ELSE 0
    END;

    v_commission_base := GREATEST(
      round(v_request.amount_sar - COALESCE(v_request.tax_amount_sar, 0), 2),
      0
    );

    IF v_rate > 0 THEN
      INSERT INTO public.representative_commissions (
        representative_id,
        referral_id,
        subscription_id,
        payment_request_id,
        commission_type,
        base_amount_sar,
        rate_percent,
        amount_sar
      )
      VALUES (
        v_referral.representative_id,
        v_referral.id,
        v_subscription_id,
        p_request_id,
        v_commission_type,
        v_commission_base,
        v_rate,
        round(v_commission_base * v_rate / 100, 2)
      )
      ON CONFLICT (payment_request_id) DO NOTHING;
    END IF;
  END IF;

  PERFORM public.write_audit_log(
    v_request.cafe_id,
    'admin_approve_subscription_request',
    'subscription_payment_requests',
    p_request_id,
    jsonb_build_object(
      'subscription_id', v_subscription_id,
      'amount_sar', v_request.amount_sar,
      'commission_base_excluding_tax', v_commission_base
    )
  );

  RETURN v_subscription_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_subscription_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_approve_subscription_request(uuid) TO authenticated;


UPDATE public.representative_commissions commission
SET
  base_amount_sar = GREATEST(
    round(request.amount_sar - COALESCE(request.tax_amount_sar, 0), 2),
    0
  ),
  amount_sar = round(
    GREATEST(round(request.amount_sar - COALESCE(request.tax_amount_sar, 0), 2), 0)
    * commission.rate_percent / 100,
    2
  )
FROM public.subscription_payment_requests request
WHERE commission.payment_request_id = request.id
  AND commission.status = 'accrued';

CREATE OR REPLACE FUNCTION public.get_current_representative_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_representative public.platform_representatives%ROWTYPE;
  v_coupon public.representative_coupons%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_representative
  FROM public.platform_representatives representative
  WHERE representative.user_id = auth.uid()
    AND representative.active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Representative not found';
  END IF;

  SELECT *
  INTO v_coupon
  FROM public.representative_coupons coupon
  WHERE coupon.representative_id = v_representative.id
    AND coupon.active = true
  ORDER BY coupon.created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'representative',
    jsonb_build_object(
      'id', v_representative.id,
      'employeeNumber', v_representative.employee_number,
      'fullName', v_representative.full_name,
      'email', v_representative.email,
      'couponCode', COALESCE(v_coupon.code::text, '')
    ),
    'summary',
    jsonb_build_object(
      'registeredBrandsCount',
      (
        SELECT count(*)
        FROM public.brand_referrals referral
        WHERE referral.representative_id = v_representative.id
      ),
      'paidBrandsCount',
      (
        SELECT count(*)
        FROM public.brand_referrals referral
        WHERE referral.representative_id = v_representative.id
          AND referral.first_paid_subscription_at IS NOT NULL
      ),
      'subscriptionsAmount',
      COALESCE((
        SELECT sum(subscription.amount_sar)
        FROM public.brand_referrals referral
        JOIN public.subscriptions subscription
          ON subscription.cafe_id = referral.cafe_id
        WHERE referral.representative_id = v_representative.id
          AND subscription.amount_sar > 0
      ), 0),
      'commissionAmount',
      COALESCE((
        SELECT sum(commission.amount_sar)
        FROM public.representative_commissions commission
        WHERE commission.representative_id = v_representative.id
          AND commission.status <> 'cancelled'
      ), 0),
      'unsettledAmount',
      COALESCE((
        SELECT sum(commission.amount_sar)
        FROM public.representative_commissions commission
        WHERE commission.representative_id = v_representative.id
          AND commission.status = 'accrued'
      ), 0)
    ),
    'brands',
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', cafe.id,
          'name', cafe.name,
          'slug', cafe.slug,
          'registeredAt', referral.registered_at,
          'firstPaidSubscriptionAt', referral.first_paid_subscription_at,
          'commissionEndAt', referral.commission_end_at,
          'renewalsCount',
          GREATEST((
            SELECT count(*) - 1
            FROM public.subscriptions paid_subscription
            WHERE paid_subscription.cafe_id = cafe.id
              AND paid_subscription.amount_sar > 0
          ), 0),
          'subscriptionsAmount',
          COALESCE((
            SELECT sum(paid_subscription.amount_sar)
            FROM public.subscriptions paid_subscription
            WHERE paid_subscription.cafe_id = cafe.id
              AND paid_subscription.amount_sar > 0
          ), 0),
          'commissionAmount',
          COALESCE((
            SELECT sum(commission.amount_sar)
            FROM public.representative_commissions commission
            WHERE commission.referral_id = referral.id
              AND commission.status <> 'cancelled'
          ), 0),
          'unsettledAmount',
          COALESCE((
            SELECT sum(commission.amount_sar)
            FROM public.representative_commissions commission
            WHERE commission.referral_id = referral.id
              AND commission.status = 'accrued'
          ), 0),
          'branch',
          CASE
            WHEN primary_branch.id IS NULL THEN NULL
            ELSE jsonb_build_object(
              'name', primary_branch.name,
              'address', primary_branch.address,
              'city', primary_branch.city,
              'lat', primary_branch.lat,
              'lng', primary_branch.lng,
              'mapUrl',
              CASE
                WHEN primary_branch.lat IS NOT NULL AND primary_branch.lng IS NOT NULL
                THEN 'https://www.google.com/maps?q='
                  || primary_branch.lat::text || ',' || primary_branch.lng::text
                ELSE NULL
              END
            )
          END,
          'subscriptions',
          COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', paid_subscription.id,
                'planName', paid_subscription.plan_name,
                'startedAt', paid_subscription.started_at,
                'expiresAt', paid_subscription.expires_at,
                'amount', paid_subscription.amount_sar,
                'commissionRate',
                COALESCE(
                  paid_subscription.rate_percent,
                  CASE
                    WHEN referral.first_paid_subscription_at IS NULL THEN 0
                    WHEN paid_subscription.started_at < referral.first_paid_subscription_at + interval '6 months' THEN 40
                    WHEN paid_subscription.started_at < referral.first_paid_subscription_at + interval '12 months' THEN 20
                    ELSE 0
                  END
                ),
                'commissionAmount', COALESCE(paid_subscription.commission_amount, 0),
                'commissionStatus', COALESCE(paid_subscription.commission_status, 'none'),
                'type',
                CASE WHEN paid_subscription.sequence_number = 1 THEN 'initial' ELSE 'renewal' END
              )
              ORDER BY paid_subscription.started_at DESC
            )
            FROM (
              SELECT
                subscription.id,
                subscription.started_at,
                subscription.expires_at,
                subscription.amount_sar,
                COALESCE(subscription.plan_name_snapshot, plan.name, subscription.plan_id) AS plan_name,
                commission.rate_percent,
                commission.amount_sar AS commission_amount,
                commission.status AS commission_status,
                row_number() OVER (ORDER BY subscription.started_at ASC) AS sequence_number
              FROM public.subscriptions subscription
              LEFT JOIN public.platform_plans plan ON plan.id = subscription.plan_id
              LEFT JOIN public.representative_commissions commission
                ON commission.subscription_id = subscription.id
               AND commission.representative_id = v_representative.id
              WHERE subscription.cafe_id = cafe.id
                AND subscription.amount_sar > 0
            ) paid_subscription
          ), '[]'::jsonb)
        )
        ORDER BY referral.registered_at DESC
      )
      FROM public.brand_referrals referral
      JOIN public.cafes cafe
        ON cafe.id = referral.cafe_id
       AND cafe.deleted_at IS NULL
      LEFT JOIN LATERAL (
        SELECT branch.id, branch.name, branch.address, branch.city, branch.lat, branch.lng
        FROM public.branches branch
        WHERE branch.cafe_id = cafe.id
          AND branch.deleted_at IS NULL
        ORDER BY branch.is_primary DESC, branch.sort_order ASC, branch.created_at ASC
        LIMIT 1
      ) primary_branch ON true
      WHERE referral.representative_id = v_representative.id
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_current_representative_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_representative_dashboard() TO authenticated;

COMMIT;

SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'branches'
  AND column_name = 'is_primary';
