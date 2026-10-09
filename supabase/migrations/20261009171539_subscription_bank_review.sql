BEGIN;

ALTER TABLE public.subscription_payment_requests
  ADD COLUMN IF NOT EXISTS receipt_channel text NOT NULL DEFAULT 'upload'
  CHECK (receipt_channel IN ('upload', 'whatsapp'));
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS subscription_bank_details jsonb;

CREATE OR REPLACE FUNCTION public.create_bank_subscription_request(p_plan_id text, p_duration_months integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cafe_id uuid;
  v_plan public.platform_plans%ROWTYPE;
  v_plan_json jsonb;
  v_id uuid;
  v_price numeric(10,2);
  v_total numeric(10,2);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT id INTO v_cafe_id FROM public.cafes
    WHERE owner_user_id = auth.uid() AND deleted_at IS NULL LIMIT 1 FOR UPDATE;
  IF v_cafe_id IS NULL OR NOT public.is_cafe_owner(v_cafe_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF p_duration_months NOT IN (1, 2, 12, 24) OR p_duration_months IS NULL THEN RAISE EXCEPTION 'Invalid duration'; END IF;
  IF EXISTS (SELECT 1 FROM public.subscription_payment_requests WHERE cafe_id = v_cafe_id AND status IN ('awaiting_receipt', 'pending_review'))
    THEN RAISE EXCEPTION 'An open request already exists'; END IF;
  SELECT * INTO v_plan FROM public.platform_plans WHERE id = p_plan_id AND active = true FOR SHARE;
  IF NOT FOUND OR v_plan.price_sar <= 0 OR v_plan.id = 'owner_trial_7d' THEN RAISE EXCEPTION 'Plan unavailable'; END IF;
  v_plan_json := to_jsonb(v_plan);
  IF jsonb_typeof(v_plan_json->'duration_options') = 'array' AND jsonb_array_length(v_plan_json->'duration_options') > 0
    AND NOT (v_plan_json->'duration_options' @> jsonb_build_array(p_duration_months)) THEN RAISE EXCEPTION 'Duration unavailable'; END IF;
  v_price := CASE WHEN v_plan.offer_enabled AND v_plan.offer_price_sar IS NOT NULL
    AND ((v_plan_json->>'offer_ends_at') IS NULL OR (v_plan_json->>'offer_ends_at')::timestamptz >= now())
    THEN v_plan.offer_price_sar ELSE v_plan.price_sar END;
  v_total := round(v_price * p_duration_months, 2);
  INSERT INTO public.subscription_payment_requests(cafe_id, plan_id, requested_by, plan_name,
    base_amount_sar, discount_amount_sar, tax_amount_sar, amount_sar, duration_unit, duration_count,
    payment_method, branch_id, status, receipt_channel)
  VALUES(v_cafe_id, v_plan.id, auth.uid(), v_plan.name, round(v_plan.price_sar * p_duration_months, 2),
    round((v_plan.price_sar - v_price) * p_duration_months, 2), round(v_total - v_total / 1.15, 2), v_total,
    'month', p_duration_months, 'bank_transfer', NULL, 'awaiting_receipt', 'upload') RETURNING id INTO v_id;
  PERFORM public.write_audit_log(v_cafe_id, 'create_bank_subscription_request', 'subscription_payment_requests', v_id,
    jsonb_build_object('plan_id', p_plan_id, 'amount_sar', v_total, 'duration_months', p_duration_months));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_bank_subscription_request(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_bank_subscription_request(text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_subscription_whatsapp_receipt(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_request public.subscription_payment_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO v_request FROM public.subscription_payment_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.requested_by <> auth.uid() OR NOT public.is_cafe_owner(v_request.cafe_id)
    OR v_request.payment_method <> 'bank_transfer' OR v_request.status <> 'awaiting_receipt'
    THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.subscription_payment_requests SET receipt_channel = 'whatsapp', status = 'pending_review', updated_at = now()
    WHERE id = p_request_id;
  PERFORM public.write_audit_log(v_request.cafe_id, 'submit_subscription_whatsapp_receipt', 'subscription_payment_requests', p_request_id,
    jsonb_build_object('receipt_channel', 'whatsapp', 'requires_admin_verification', true));
END;
$$;
REVOKE ALL ON FUNCTION public.submit_subscription_whatsapp_receipt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_subscription_whatsapp_receipt(uuid) TO authenticated;

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
     AND v_request.receipt_storage_path IS NULL AND v_request.receipt_channel <> 'whatsapp' THEN
    RAISE EXCEPTION 'Receipt is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.platform_plans WHERE id = v_request.plan_id AND active = true) THEN
    RAISE EXCEPTION 'Plan unavailable';
  END IF;
  PERFORM 1 FROM public.cafes WHERE id = v_request.cafe_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Brand unavailable'; END IF;

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



COMMIT;
