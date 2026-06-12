-- Branda Platform — Subscription plans, default signup plan and manual payment requests
-- Version: 006
-- Run after 005 if it was executed; otherwise run after the latest installed migration.
-- TARGET: branda-production

BEGIN;

ALTER TABLE public.platform_plans
  ADD COLUMN IF NOT EXISTS duration_unit text NOT NULL DEFAULT 'month',
  ADD COLUMN IF NOT EXISTS duration_count int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS offer_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offer_price_sar numeric(10,2),
  ADD CONSTRAINT platform_plans_duration_unit_check
    CHECK (duration_unit IN ('day', 'month', 'year')) NOT VALID,
  ADD CONSTRAINT platform_plans_duration_count_check
    CHECK (duration_count > 0 AND duration_count <= 120) NOT VALID,
  ADD CONSTRAINT platform_plans_offer_price_check
    CHECK (
      offer_enabled = false
      OR (
        offer_price_sar IS NOT NULL
        AND offer_price_sar >= 0
        AND offer_price_sar < price_sar
      )
    ) NOT VALID;

ALTER TABLE public.platform_plans VALIDATE CONSTRAINT platform_plans_duration_unit_check;
ALTER TABLE public.platform_plans VALIDATE CONSTRAINT platform_plans_duration_count_check;
ALTER TABLE public.platform_plans VALIDATE CONSTRAINT platform_plans_offer_price_check;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_name_snapshot text,
  ADD COLUMN IF NOT EXISTS duration_unit text NOT NULL DEFAULT 'month',
  ADD COLUMN IF NOT EXISTS duration_count int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS activation_source text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS payment_request_id uuid;

CREATE OR REPLACE FUNCTION public.calculate_subscription_expiry(
  p_started_at timestamptz,
  p_duration_unit text,
  p_duration_count int
)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_duration_unit
    WHEN 'day' THEN p_started_at + make_interval(days => p_duration_count)
    WHEN 'month' THEN p_started_at + make_interval(months => p_duration_count)
    WHEN 'year' THEN p_started_at + make_interval(years => p_duration_count)
    ELSE p_started_at
  END;
$$;

REVOKE ALL ON FUNCTION public.calculate_subscription_expiry(timestamptz, text, int) FROM PUBLIC;

CREATE TABLE IF NOT EXISTS public.subscription_payment_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id               uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  plan_id               text NOT NULL REFERENCES public.platform_plans(id),
  requested_by          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  plan_name             text NOT NULL,
  base_amount_sar       numeric(10,2) NOT NULL,
  discount_amount_sar   numeric(10,2) NOT NULL DEFAULT 0,
  tax_amount_sar        numeric(10,2) NOT NULL DEFAULT 0,
  amount_sar            numeric(10,2) NOT NULL,
  duration_unit         text NOT NULL CHECK (duration_unit IN ('day', 'month', 'year')),
  duration_count        int NOT NULL CHECK (duration_count > 0 AND duration_count <= 120),
  payment_method        text NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer')),
  branch_id             uuid REFERENCES public.branches(id) ON DELETE RESTRICT,
  receipt_storage_path  text,
  status                text NOT NULL CHECK (status IN ('awaiting_receipt', 'pending_review', 'approved', 'rejected', 'cancelled')),
  admin_response        text,
  reviewed_by           uuid REFERENCES public.profiles(id),
  reviewed_at           timestamptz,
  approved_subscription_id uuid REFERENCES public.subscriptions(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS subscription_payment_requests_updated_at ON public.subscription_payment_requests;
CREATE TRIGGER subscription_payment_requests_updated_at
  BEFORE UPDATE ON public.subscription_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_subscription_payment_requests_cafe_status
  ON public.subscription_payment_requests(cafe_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_payment_requests_open_cafe
  ON public.subscription_payment_requests(cafe_id)
  WHERE status IN ('awaiting_receipt', 'pending_review');

ALTER TABLE public.subscription_payment_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscription_requests_select ON public.subscription_payment_requests;
CREATE POLICY subscription_requests_select ON public.subscription_payment_requests
  FOR SELECT TO authenticated
  USING (public.is_cafe_owner(cafe_id) OR public.is_platform_admin());

GRANT SELECT ON TABLE public.platform_plans TO authenticated, anon;
GRANT SELECT ON TABLE public.platform_settings TO authenticated;
GRANT SELECT ON TABLE public.subscription_payment_requests TO authenticated;
GRANT SELECT ON TABLE public.branches TO authenticated;
GRANT SELECT ON TABLE public.subscriptions TO authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('subscription-receipts', 'subscription-receipts', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS subscription_receipts_insert_owner ON storage.objects;
CREATE POLICY subscription_receipts_insert_owner ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'subscription-receipts'
    AND EXISTS (
      SELECT 1
      FROM public.subscription_payment_requests request
      WHERE request.id::text = split_part(name, '/', 2)
        AND request.cafe_id::text = split_part(name, '/', 1)
        AND request.requested_by = auth.uid()
        AND request.status = 'awaiting_receipt'
        AND public.is_cafe_owner(request.cafe_id)
    )
  );

DROP POLICY IF EXISTS subscription_receipts_select_scoped ON storage.objects;
CREATE POLICY subscription_receipts_select_scoped ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'subscription-receipts'
    AND EXISTS (
      SELECT 1
      FROM public.subscription_payment_requests request
      WHERE request.id::text = split_part(name, '/', 2)
        AND request.cafe_id::text = split_part(name, '/', 1)
        AND (
          public.is_cafe_owner(request.cafe_id)
          OR public.is_platform_admin()
        )
    )
  );

DROP POLICY IF EXISTS subscription_receipts_delete_owner ON storage.objects;
CREATE POLICY subscription_receipts_delete_owner ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'subscription-receipts'
    AND EXISTS (
      SELECT 1
      FROM public.subscription_payment_requests request
      WHERE request.id::text = split_part(name, '/', 2)
        AND request.cafe_id::text = split_part(name, '/', 1)
        AND request.requested_by = auth.uid()
        AND request.status = 'awaiting_receipt'
        AND public.is_cafe_owner(request.cafe_id)
    )
  );

CREATE OR REPLACE FUNCTION public.admin_save_platform_plan(
  p_id text,
  p_name text,
  p_price_sar numeric,
  p_offer_enabled boolean,
  p_offer_price_sar numeric,
  p_duration_unit text,
  p_duration_count int,
  p_description text,
  p_features text[],
  p_active boolean,
  p_is_default boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_id IS NULL OR p_id !~ '^[a-z0-9-]{1,60}$' THEN
    RAISE EXCEPTION 'Invalid plan id';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' OR char_length(p_name) > 80 THEN
    RAISE EXCEPTION 'Invalid plan name';
  END IF;
  IF p_price_sar IS NULL OR p_price_sar < 0 THEN
    RAISE EXCEPTION 'Invalid plan price';
  END IF;
  IF p_duration_unit NOT IN ('day', 'month', 'year')
     OR p_duration_count IS NULL OR p_duration_count <= 0 OR p_duration_count > 120 THEN
    RAISE EXCEPTION 'Invalid plan duration';
  END IF;
  IF p_offer_enabled AND (
    p_offer_price_sar IS NULL
    OR p_offer_price_sar < 0
    OR p_offer_price_sar >= p_price_sar
  ) THEN
    RAISE EXCEPTION 'Invalid offer price';
  END IF;
  IF p_is_default AND NOT p_active THEN
    RAISE EXCEPTION 'Default plan must be active';
  END IF;

  INSERT INTO public.platform_plans (
    id, name, description, price_sar, offer_enabled, offer_price_sar,
    duration_unit, duration_count, features, active
  ) VALUES (
    p_id, btrim(p_name), NULLIF(btrim(p_description), ''), p_price_sar,
    p_offer_enabled, CASE WHEN p_offer_enabled THEN p_offer_price_sar ELSE NULL END,
    p_duration_unit, p_duration_count, to_jsonb(p_features), p_active
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    price_sar = EXCLUDED.price_sar,
    offer_enabled = EXCLUDED.offer_enabled,
    offer_price_sar = EXCLUDED.offer_price_sar,
    duration_unit = EXCLUDED.duration_unit,
    duration_count = EXCLUDED.duration_count,
    features = EXCLUDED.features,
    active = EXCLUDED.active,
    updated_at = now();

  IF p_is_default THEN
    UPDATE public.platform_settings
    SET default_plan_id = p_id,
        updated_at = now()
    WHERE id = 'default';
  END IF;

  PERFORM public.write_audit_log(
    NULL,
    'admin_save_platform_plan',
    'platform_plans',
    NULL,
    jsonb_build_object(
      'plan_id', p_id,
      'price_sar', p_price_sar,
      'offer_enabled', p_offer_enabled,
      'offer_price_sar', p_offer_price_sar,
      'duration_unit', p_duration_unit,
      'duration_count', p_duration_count,
      'is_default', p_is_default
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_platform_plan(text, text, numeric, boolean, numeric, text, int, text, text[], boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_save_platform_plan(text, text, numeric, boolean, numeric, text, int, text, text[], boolean, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_subscription_payment_request(
  p_plan_id text,
  p_payment_method text,
  p_branch_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cafe_id uuid;
  v_plan public.platform_plans%ROWTYPE;
  v_id uuid;
  v_subtotal numeric(10,2);
  v_tax numeric(10,2);
  v_total numeric(10,2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT c.id INTO v_cafe_id
  FROM public.cafes c
  WHERE c.owner_user_id = auth.uid()
    AND c.deleted_at IS NULL
  LIMIT 1;

  IF v_cafe_id IS NULL OR NOT public.is_cafe_owner(v_cafe_id) THEN
    RAISE EXCEPTION 'Only cafe owner can request subscription';
  END IF;

  IF p_payment_method NOT IN ('cash', 'bank_transfer') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.subscription_payment_requests
    WHERE cafe_id = v_cafe_id
      AND status IN ('awaiting_receipt', 'pending_review')
  ) THEN
    RAISE EXCEPTION 'There is an active subscription request under review';
  END IF;

  SELECT * INTO v_plan
  FROM public.platform_plans
  WHERE id = p_plan_id AND active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found';
  END IF;

  IF p_payment_method = 'cash' THEN
    IF p_branch_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.branches
      WHERE id = p_branch_id
        AND cafe_id = v_cafe_id
        AND active = true
        AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Active branch required for cash collection';
    END IF;
  ELSE
    p_branch_id := NULL;
  END IF;

  v_subtotal := CASE
    WHEN v_plan.offer_enabled AND v_plan.offer_price_sar IS NOT NULL THEN v_plan.offer_price_sar
    ELSE v_plan.price_sar
  END;
  v_tax := round(v_subtotal * 0.15, 2);
  v_total := round(v_subtotal + v_tax, 2);

  INSERT INTO public.subscription_payment_requests (
    cafe_id, plan_id, requested_by, plan_name, base_amount_sar,
    discount_amount_sar, tax_amount_sar, amount_sar,
    duration_unit, duration_count, payment_method, branch_id, status
  ) VALUES (
    v_cafe_id, v_plan.id, auth.uid(), v_plan.name, v_plan.price_sar,
    v_plan.price_sar - v_subtotal, v_tax, v_total,
    v_plan.duration_unit, v_plan.duration_count, p_payment_method, p_branch_id,
    CASE WHEN p_payment_method = 'bank_transfer' THEN 'awaiting_receipt' ELSE 'pending_review' END
  )
  RETURNING id INTO v_id;

  PERFORM public.write_audit_log(
    v_cafe_id,
    'create_subscription_payment_request',
    'subscription_payment_requests',
    v_id,
    jsonb_build_object('plan_id', p_plan_id, 'payment_method', p_payment_method, 'amount_sar', v_total)
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_subscription_payment_request(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_subscription_payment_request(text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.attach_subscription_payment_receipt(
  p_request_id uuid,
  p_storage_path text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.subscription_payment_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request
  FROM public.subscription_payment_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_request.requested_by <> auth.uid()
     OR NOT public.is_cafe_owner(v_request.cafe_id)
     OR v_request.payment_method <> 'bank_transfer'
     OR v_request.status <> 'awaiting_receipt' THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF split_part(p_storage_path, '/', 1) <> v_request.cafe_id::text
     OR split_part(p_storage_path, '/', 2) <> p_request_id::text
     OR array_length(string_to_array(p_storage_path, '/'), 1) <> 3 THEN
    RAISE EXCEPTION 'Invalid receipt path';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'subscription-receipts'
      AND name = p_storage_path
  ) THEN
    RAISE EXCEPTION 'Receipt not found';
  END IF;

  UPDATE public.subscription_payment_requests
  SET receipt_storage_path = p_storage_path,
      status = 'pending_review',
      updated_at = now()
  WHERE id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_subscription_payment_receipt(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_subscription_payment_receipt(uuid, text) TO authenticated;

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

  IF v_request.payment_method = 'bank_transfer' AND v_request.receipt_storage_path IS NULL THEN
    RAISE EXCEPTION 'Receipt is required';
  END IF;

  UPDATE public.subscriptions
  SET status = 'cancelled', cancelled_at = v_started_at, updated_at = now()
  WHERE cafe_id = v_request.cafe_id
    AND status IN ('active', 'trialing');

  INSERT INTO public.subscriptions (
    cafe_id, plan_id, status, amount_sar, started_at, expires_at,
    plan_name_snapshot, duration_unit, duration_count,
    activation_source, payment_request_id
  ) VALUES (
    v_request.cafe_id, v_request.plan_id, 'active', v_request.amount_sar,
    v_started_at,
    public.calculate_subscription_expiry(v_started_at, v_request.duration_unit, v_request.duration_count),
    v_request.plan_name, v_request.duration_unit, v_request.duration_count,
    v_request.payment_method, v_request.id
  )
  RETURNING id INTO v_subscription_id;

  UPDATE public.subscription_payment_requests
  SET status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      approved_subscription_id = v_subscription_id,
      updated_at = now()
  WHERE id = p_request_id;

  PERFORM public.write_audit_log(
    v_request.cafe_id,
    'admin_approve_subscription_request',
    'subscription_payment_requests',
    p_request_id,
    jsonb_build_object('subscription_id', v_subscription_id, 'amount_sar', v_request.amount_sar)
  );

  RETURN v_subscription_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_subscription_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_approve_subscription_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reject_subscription_request(
  p_request_id uuid,
  p_response text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.subscription_payment_requests%ROWTYPE;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_request
  FROM public.subscription_payment_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR v_request.status NOT IN ('pending_review', 'awaiting_receipt') THEN
    RAISE EXCEPTION 'Request cannot be rejected';
  END IF;

  UPDATE public.subscription_payment_requests
  SET status = 'rejected',
      admin_response = NULLIF(btrim(p_response), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_request_id;

  PERFORM public.write_audit_log(
    v_request.cafe_id,
    'admin_reject_subscription_request',
    'subscription_payment_requests',
    p_request_id,
    jsonb_build_object('response', p_response)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reject_subscription_request(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reject_subscription_request(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_assign_plan_without_payment(
  p_cafe_id uuid,
  p_plan_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan public.platform_plans%ROWTYPE;
  v_id uuid;
  v_started_at timestamptz := now();
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_plan FROM public.platform_plans WHERE id = p_plan_id AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found';
  END IF;

  UPDATE public.subscriptions
  SET status = 'cancelled', cancelled_at = v_started_at, updated_at = now()
  WHERE cafe_id = p_cafe_id AND status IN ('active', 'trialing');

  INSERT INTO public.subscriptions (
    cafe_id, plan_id, status, amount_sar, started_at, expires_at,
    plan_name_snapshot, duration_unit, duration_count, activation_source
  ) VALUES (
    p_cafe_id, v_plan.id, 'active', 0, v_started_at,
    public.calculate_subscription_expiry(v_started_at, v_plan.duration_unit, v_plan.duration_count),
    v_plan.name, v_plan.duration_unit, v_plan.duration_count, 'admin_assignment'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_assign_plan_without_payment(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_assign_plan_without_payment(uuid, text) TO authenticated;

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
  v_default_plan public.platform_plans%ROWTYPE;
  v_started_at timestamptz := now();
BEGIN
  IF v_account_type <> 'cafe_owner' THEN
    INSERT INTO public.profiles (id, email, full_name, role, status)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 'customer', 'active')
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END IF;

  v_slug := lower(btrim(COALESCE(NEW.raw_user_meta_data->>'cafe_slug', '')));
  v_name := btrim(COALESCE(NEW.raw_user_meta_data->>'cafe_name', ''));
  v_phone := regexp_replace(COALESCE(NEW.raw_user_meta_data->>'phone', ''), '[^0-9]', '', 'g');

  IF v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' OR char_length(v_slug) < 3 OR char_length(v_slug) > 60 THEN
    RAISE EXCEPTION 'Invalid cafe slug';
  END IF;
  IF v_name = '' OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'Invalid cafe name';
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

  INSERT INTO public.profiles (id, email, full_name, phone, role, status)
  VALUES (
    NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    v_phone, 'cafe_owner', 'active'
  );

  INSERT INTO public.cafes (slug, name, owner_user_id, status, is_public)
  VALUES (v_slug, v_name, NEW.id, 'active', true)
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

  INSERT INTO public.subscriptions (
    cafe_id, plan_id, status, amount_sar, started_at, expires_at,
    plan_name_snapshot, duration_unit, duration_count, activation_source
  ) VALUES (
    v_cafe_id, v_default_plan.id, 'active', 0, v_started_at,
    public.calculate_subscription_expiry(v_started_at, v_default_plan.duration_unit, v_default_plan.duration_count),
    v_default_plan.name, v_default_plan.duration_unit, v_default_plan.duration_count,
    'signup_default_plan'
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

UPDATE public.platform_plans
SET duration_unit = COALESCE(duration_unit, 'month'),
    duration_count = COALESCE(duration_count, 1)
WHERE duration_unit IS NULL OR duration_count IS NULL;

COMMIT;
