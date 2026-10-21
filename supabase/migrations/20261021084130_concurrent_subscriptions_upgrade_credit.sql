-- Forward-only: preserve all existing subscription/payment history
-- Roll back behavior with a new migration; never remove posted credit evidence
BEGIN;

ALTER TABLE public.platform_plans ADD COLUMN IF NOT EXISTS is_upgrade_bundle boolean NOT NULL DEFAULT false;
ALTER TABLE public.subscription_payment_requests
  ADD COLUMN IF NOT EXISTS upgrade_credit_amount_sar numeric(10,2) NOT NULL DEFAULT 0 CHECK (upgrade_credit_amount_sar>=0),
  ADD COLUMN IF NOT EXISTS upgrade_extra_credit_amount_sar numeric(10,2) NOT NULL DEFAULT 0 CHECK (upgrade_extra_credit_amount_sar>=0),
  ADD COLUMN IF NOT EXISTS upgrade_extension_seconds bigint NOT NULL DEFAULT 0 CHECK (upgrade_extension_seconds>=0),
  ADD COLUMN IF NOT EXISTS upgrade_credit_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(upgrade_credit_snapshot)='array'),
  ADD COLUMN IF NOT EXISTS upgrade_quoted_at timestamptz;
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS upgraded_by_request_id uuid REFERENCES public.subscription_payment_requests(id) ON DELETE RESTRICT;

-- Existing per-brand pending-request uniqueness serializes coupon and credit reservations
-- Independent paid packages remain active together; paid renewals are future periods
CREATE OR REPLACE FUNCTION public.quote_bank_subscription(p_plan_id text, p_duration_months integer, p_coupon_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_plan public.platform_plans%ROWTYPE;
  v_coupon public.platform_discount_coupons%ROWTYPE;
  v_base numeric(10,2); v_annual numeric(10,2); v_discount numeric(10,2):=0; v_total numeric(10,2);
  v_code text:=nullif(upper(trim(p_coupon_code)), '');
  v_reserved integer; v_cafe_id uuid;
  v_source record; v_days integer; v_used integer; v_remaining integer;
  v_credit numeric(10,2); v_credit_total numeric(10,2):=0;
  v_credits jsonb:='[]'::jsonb; v_extra numeric(10,2):=0; v_extension bigint:=0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT id INTO v_cafe_id FROM public.cafes WHERE owner_user_id=auth.uid() AND deleted_at IS NULL ORDER BY id LIMIT 1 FOR UPDATE;
  IF v_cafe_id IS NULL OR NOT public.is_cafe_owner(v_cafe_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF p_duration_months IS NULL OR p_duration_months NOT IN (1,3,6,12) THEN RAISE EXCEPTION 'Invalid duration'; END IF;
  SELECT * INTO v_plan FROM public.platform_plans WHERE id=p_plan_id AND active=true FOR SHARE;
  IF NOT FOUND OR v_plan.price_sar<=0 OR v_plan.id='owner_trial_7d' THEN RAISE EXCEPTION 'Plan unavailable'; END IF;
  IF cardinality(v_plan.duration_options)>0 AND NOT p_duration_months=ANY(v_plan.duration_options) THEN RAISE EXCEPTION 'Duration unavailable'; END IF;
  v_base:=round(v_plan.price_sar*p_duration_months,2);
  v_annual:=CASE WHEN p_duration_months=12 THEN round(v_base*v_plan.annual_discount_percent/100,2) ELSE 0 END;
  v_total:=v_base-v_annual;
  IF v_code IS NOT NULL THEN
    SELECT * INTO v_coupon FROM public.platform_discount_coupons WHERE code=v_code FOR UPDATE;
    IF NOT FOUND OR NOT v_coupon.active THEN RAISE EXCEPTION 'Coupon invalid'; END IF;
    IF v_coupon.valid_from>now() THEN RAISE EXCEPTION 'Coupon scheduled'; END IF;
    IF v_coupon.valid_until<now() THEN RAISE EXCEPTION 'Coupon expired'; END IF;
    IF cardinality(v_coupon.eligible_plan_ids)>0 AND NOT p_plan_id=ANY(v_coupon.eligible_plan_ids) THEN RAISE EXCEPTION 'Coupon plan unavailable'; END IF;
    IF NOT p_duration_months=ANY(v_coupon.eligible_duration_months) THEN RAISE EXCEPTION 'Coupon duration unavailable'; END IF;
    SELECT count(*) INTO v_reserved FROM public.subscription_payment_requests WHERE platform_coupon_id=v_coupon.id AND status IN ('awaiting_receipt','pending_review');
    IF v_coupon.max_redemptions IS NOT NULL AND v_coupon.redeemed_count+v_reserved>=v_coupon.max_redemptions THEN RAISE EXCEPTION 'Coupon exhausted'; END IF;
    v_discount:=round(v_total*v_coupon.discount_percent/100,2);
    v_total:=v_total-v_discount;
  END IF;
  IF v_total>0 AND v_plan.is_upgrade_bundle AND NOT EXISTS (
    SELECT 1 FROM public.subscriptions s JOIN public.platform_plans p ON p.id=s.plan_id
    WHERE s.cafe_id=v_cafe_id AND s.status IN ('active','trialing') AND p.is_upgrade_bundle
      AND (s.expires_at IS NULL OR s.expires_at>now())
  ) THEN
    FOR v_source IN
      SELECT s.*,p.name AS current_plan_name FROM public.subscriptions s
      JOIN public.platform_plans p ON p.id=s.plan_id
      WHERE s.cafe_id=v_cafe_id AND s.status='active' AND s.amount_sar>0
        AND s.plan_id<>p_plan_id AND s.plan_id<>'owner_trial_7d' AND NOT p.is_upgrade_bundle
        AND s.started_at IS NOT NULL AND s.expires_at>now()
        AND s.upgraded_by_request_id IS NULL
        AND coalesce(s.activation_source,'') NOT IN ('admin_assignment','admin_manual_change','signup_default_plan','default_trial','verified_owner_signup')
        AND jsonb_typeof(p.features)='array' AND jsonb_array_length(p.features)>0
        AND (v_plan.features ? 'all' OR p.features <@ v_plan.features)
      ORDER BY s.expires_at,s.id FOR UPDATE OF s
    LOOP
      v_days:=CASE v_source.duration_unit WHEN 'month' THEN 30*v_source.duration_count
        WHEN 'year' THEN 360*v_source.duration_count WHEN 'day' THEN v_source.duration_count ELSE 0 END;
      IF coalesce(v_days,0)<=0 THEN CONTINUE; END IF;
      -- Whole completed days; future paid renewal periods have not used any days
      v_used:=least(v_days,greatest(0,floor(extract(epoch FROM (now()-v_source.started_at))/86400)::integer));
      v_remaining:=v_days-v_used;
      v_credit:=round(v_source.amount_sar*v_remaining/v_days,2);
      IF v_credit<=0 THEN CONTINUE; END IF;
      v_credit_total:=v_credit_total+v_credit;
      v_credits:=v_credits||jsonb_build_array(jsonb_build_object(
        'subscriptionId',v_source.id,'planName',coalesce(v_source.plan_name_snapshot,v_source.current_plan_name),
        'paidAmount',v_source.amount_sar,'totalDays',v_days,'usedDays',v_used,
        'remainingDays',v_remaining,'creditAmount',v_credit,
        'startedAt',v_source.started_at,'expiresAt',v_source.expires_at,
        'durationUnit',v_source.duration_unit,'durationCount',v_source.duration_count));
    END LOOP;
  END IF;
  v_extra:=greatest(v_credit_total-v_total,0);
  IF v_extra>0 THEN
    -- Preserve every halala of excess credit as time at the selected net daily price
    v_extension:=ceil(v_extra/v_total*(30*p_duration_months)*86400)::bigint;
  END IF;
  RETURN jsonb_build_object('planName',v_plan.name,'baseAmount',v_base,'annualDiscountAmount',v_annual,
    'couponDiscountAmount',v_discount,'totalAmount',greatest(v_total-v_credit_total,0),
    'upgradeCreditAmount',least(v_total,v_credit_total),'upgradeCredits',v_credits,
    'upgradeExtraCreditAmount',v_extra,'extendedSeconds',v_extension,'extendedDays',round(v_extension::numeric/86400,6),
    'couponCode',v_code,'couponId',v_coupon.id,
    'discountPercent',coalesce(v_coupon.discount_percent,0));
END $$;
REVOKE ALL ON FUNCTION public.quote_bank_subscription(text,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quote_bank_subscription(text,integer,text) TO authenticated;

DROP FUNCTION public.create_bank_subscription_request(text,integer,text);
CREATE OR REPLACE FUNCTION public.create_bank_subscription_request(p_plan_id text,p_duration_months integer,p_coupon_code text DEFAULT NULL,p_expected_total_amount numeric DEFAULT NULL,p_expected_upgrade_credit_amount numeric DEFAULT NULL,p_expected_extension_seconds bigint DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_cafe_id uuid; v_quote jsonb; v_id uuid; v_total numeric(10,2);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT id INTO v_cafe_id FROM public.cafes WHERE owner_user_id=auth.uid() AND deleted_at IS NULL ORDER BY id LIMIT 1 FOR UPDATE;
  IF v_cafe_id IS NULL OR NOT public.is_cafe_owner(v_cafe_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF EXISTS(SELECT 1 FROM public.subscription_payment_requests WHERE cafe_id=v_cafe_id AND status IN ('awaiting_receipt','pending_review')) THEN RAISE EXCEPTION 'An open request already exists'; END IF;
  v_quote:=public.quote_bank_subscription(p_plan_id,p_duration_months,p_coupon_code);
  v_total:=(v_quote->>'totalAmount')::numeric;
  IF p_expected_total_amount IS NOT NULL AND round(p_expected_total_amount,2) IS DISTINCT FROM v_total THEN RAISE EXCEPTION 'Quote changed'; END IF;
  IF p_expected_upgrade_credit_amount IS NOT NULL AND round(p_expected_upgrade_credit_amount,2) IS DISTINCT FROM
    (v_quote->>'upgradeCreditAmount')::numeric+(v_quote->>'upgradeExtraCreditAmount')::numeric THEN RAISE EXCEPTION 'Quote changed'; END IF;
  IF p_expected_extension_seconds IS NOT NULL AND p_expected_extension_seconds IS DISTINCT FROM
    (v_quote->>'extendedSeconds')::bigint THEN RAISE EXCEPTION 'Quote changed'; END IF;
  INSERT INTO public.subscription_payment_requests(cafe_id,plan_id,requested_by,plan_name,base_amount_sar,
    discount_amount_sar,tax_amount_sar,amount_sar,duration_unit,duration_count,payment_method,branch_id,status,receipt_channel,
    platform_coupon_id,coupon_code_snapshot,annual_discount_amount_sar,coupon_discount_amount_sar,
    upgrade_credit_amount_sar,upgrade_credit_snapshot,upgrade_quoted_at,upgrade_extra_credit_amount_sar,upgrade_extension_seconds)
  VALUES(v_cafe_id,p_plan_id,auth.uid(),v_quote->>'planName',(v_quote->>'baseAmount')::numeric,
    (v_quote->>'annualDiscountAmount')::numeric+(v_quote->>'couponDiscountAmount')::numeric+(v_quote->>'upgradeCreditAmount')::numeric,round(v_total-v_total/1.15,2),v_total,
    'month',p_duration_months,'bank_transfer',NULL,CASE WHEN v_total=0 THEN 'pending_review' ELSE 'awaiting_receipt' END,'upload',(v_quote->>'couponId')::uuid,
    v_quote->>'couponCode',(v_quote->>'annualDiscountAmount')::numeric,(v_quote->>'couponDiscountAmount')::numeric,
    (v_quote->>'upgradeCreditAmount')::numeric,v_quote->'upgradeCredits',now(),
    (v_quote->>'upgradeExtraCreditAmount')::numeric,(v_quote->>'extendedSeconds')::bigint) RETURNING id INTO v_id;
  PERFORM public.write_audit_log(v_cafe_id,'create_bank_subscription_request','subscription_payment_requests',v_id,
    jsonb_build_object('plan_id',p_plan_id,'amount_sar',v_total,'duration_months',p_duration_months,'coupon_code',v_quote->>'couponCode','upgrade_credit_amount_sar',v_quote->'upgradeCreditAmount'));
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.create_bank_subscription_request(text,integer,text,numeric,numeric,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_bank_subscription_request(text,integer,text,numeric,numeric,bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_approve_subscription_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.subscription_payment_requests%ROWTYPE;
  v_subscription_id uuid;
  v_credit jsonb; v_source public.subscriptions%ROWTYPE;
  v_credit_sum numeric(10,2):=0;
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

  -- Same lock order as checkout and assignment: brand, request, subscription
  PERFORM 1 FROM public.cafes WHERE id=(SELECT cafe_id FROM public.subscription_payment_requests WHERE id=p_request_id)
    AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Brand unavailable'; END IF;
  SELECT * INTO v_request
  FROM public.subscription_payment_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR v_request.status <> 'pending_review' THEN
    RAISE EXCEPTION 'Request is not ready for approval';
  END IF;

  IF v_request.amount_sar > 0 AND v_request.payment_method = 'bank_transfer'
     AND v_request.receipt_storage_path IS NULL AND v_request.receipt_channel <> 'whatsapp' THEN
    RAISE EXCEPTION 'Receipt is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.platform_plans WHERE id = v_request.plan_id AND active = true) THEN
    RAISE EXCEPTION 'Plan unavailable';
  END IF;
  PERFORM 1 FROM public.cafes WHERE id = v_request.cafe_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Brand unavailable'; END IF;

  -- Honor the server-created price snapshot, including elapsed review time
  FOR v_credit IN SELECT value FROM jsonb_array_elements(v_request.upgrade_credit_snapshot) LOOP
    SELECT * INTO v_source FROM public.subscriptions WHERE id=(v_credit->>'subscriptionId')::uuid FOR UPDATE;
    IF NOT FOUND OR v_source.cafe_id<>v_request.cafe_id OR v_source.upgraded_by_request_id IS NOT NULL
      OR v_source.status NOT IN ('active','expired')
      OR v_source.amount_sar IS DISTINCT FROM (v_credit->>'paidAmount')::numeric
      OR v_source.started_at IS DISTINCT FROM (v_credit->>'startedAt')::timestamptz
      OR v_source.expires_at IS DISTINCT FROM (v_credit->>'expiresAt')::timestamptz
      OR v_source.duration_unit IS DISTINCT FROM v_credit->>'durationUnit'
      OR v_source.duration_count IS DISTINCT FROM (v_credit->>'durationCount')::integer
      THEN RAISE EXCEPTION 'Upgrade source changed'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.platform_plans target JOIN public.platform_plans source ON source.id=v_source.plan_id
      WHERE target.id=v_request.plan_id AND target.is_upgrade_bundle
        AND (target.features ? 'all' OR source.features <@ target.features))
      THEN RAISE EXCEPTION 'Upgrade plan changed'; END IF;
    v_credit_sum:=v_credit_sum+(v_credit->>'creditAmount')::numeric;
    UPDATE public.subscriptions SET status='cancelled',cancelled_at=now(),updated_at=now(),upgraded_by_request_id=v_request.id
      WHERE id=v_source.id;
  END LOOP;
  IF v_credit_sum IS DISTINCT FROM v_request.upgrade_credit_amount_sar+v_request.upgrade_extra_credit_amount_sar THEN RAISE EXCEPTION 'Invalid upgrade credit'; END IF;
  -- Renewal preserves all already paid time, including queued renewal periods
  SELECT greatest(now(),coalesce(max(expires_at),now())) INTO v_started_at
    FROM public.subscriptions WHERE cafe_id=v_request.cafe_id AND plan_id=v_request.plan_id
      AND status IN ('active','trialing') AND expires_at>now();

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
    paid_at,
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
    ) + v_request.upgrade_extension_seconds * interval '1 second',
    v_request.plan_name,
    v_request.duration_unit,
    v_request.duration_count,
    v_request.payment_method,
    CASE WHEN v_request.amount_sar>0 THEN now() ELSE NULL END,
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

  IF FOUND AND v_request.amount_sar>0 THEN
    IF v_referral.first_paid_subscription_at IS NULL THEN
      UPDATE public.brand_referrals
      SET first_paid_subscription_at = now(),
          commission_end_at = now() + interval '12 months'
      WHERE id = v_referral.id;

      v_months_elapsed := 0;
      v_commission_type := 'initial';
    ELSE
      v_months_elapsed :=
        EXTRACT(YEAR FROM age(now(), v_referral.first_paid_subscription_at))::int * 12
        + EXTRACT(MONTH FROM age(now(), v_referral.first_paid_subscription_at))::int;
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
      ON CONFLICT (subscription_id) WHERE subscription_id IS NOT NULL DO UPDATE SET
        payment_request_id=EXCLUDED.payment_request_id,
        base_amount_sar=EXCLUDED.base_amount_sar,rate_percent=EXCLUDED.rate_percent,amount_sar=EXCLUDED.amount_sar;
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
      'upgrade_credit_amount_sar',v_request.upgrade_credit_amount_sar,
      'commission_base_excluding_tax', v_commission_base
    )
  );

  RETURN v_subscription_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_subscription_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_approve_subscription_request(uuid) TO authenticated;



CREATE OR REPLACE FUNCTION public.admin_assign_plan_without_payment(p_cafe_id uuid, p_plan_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_plan public.platform_plans%ROWTYPE;
  v_start timestamptz := now();
  v_end timestamptz;
  v_unit text;
  v_count integer;
  v_trial boolean;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  -- Serialize competing assignments, and keep cancellation/insertion in one transaction.
  PERFORM 1 FROM public.cafes WHERE id=p_cafe_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Brand not found'; END IF;
  SELECT * INTO v_plan FROM public.platform_plans WHERE id=p_plan_id AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active plan not found'; END IF;
  v_trial := v_plan.price_sar=0 AND coalesce(v_plan.trial_days,0)>0;
  v_unit := CASE WHEN v_trial THEN 'day' ELSE v_plan.duration_unit END;
  v_count := CASE WHEN v_trial THEN v_plan.trial_days ELSE v_plan.duration_count END;
  IF v_count IS NULL OR v_count<1 OR v_unit NOT IN ('day','month','year') THEN
    RAISE EXCEPTION 'Invalid plan duration';
  END IF;
  v_end := v_start + CASE v_unit WHEN 'day' THEN make_interval(days=>v_count)
    WHEN 'month' THEN make_interval(months=>v_count) WHEN 'year' THEN make_interval(years=>v_count) END;
  IF v_end IS NULL THEN RAISE EXCEPTION 'Plan expiry required'; END IF;
  UPDATE public.subscriptions SET status='cancelled',cancelled_at=v_start,updated_at=v_start
    WHERE cafe_id=p_cafe_id AND plan_id=p_plan_id AND status IN ('active','trialing','past_due');
  INSERT INTO public.subscriptions(cafe_id,plan_id,status,amount_sar,base_amount_sar,discount_amount_sar,
    plan_name_snapshot,duration_unit,duration_count,activation_source,payment_provider,payment_method_label,started_at,expires_at)
  VALUES(p_cafe_id,p_plan_id,(CASE WHEN v_trial THEN 'trialing' ELSE 'active' END)::public.subscription_status,0,0,0,
    v_plan.name,v_unit,v_count,'admin_manual_change','admin','تغيير يدوي من الأدمن',v_start,v_end);
END $$;
REVOKE ALL ON FUNCTION public.admin_assign_plan_without_payment(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_plan_without_payment(uuid,text) TO authenticated;
-- Renewal commission timing follows actual collection, not the queued service start
CREATE OR REPLACE FUNCTION public.record_subscription_finance_distribution(p_subscription_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_subscription public.subscriptions%ROWTYPE;
  v_referral public.brand_referrals%ROWTYPE;
  v_started_at timestamptz;
  v_months_elapsed int := 12;
  v_net_amount numeric(10,2);
  v_rep_rate numeric(5,2) := 0;
  v_platform_rate numeric(5,2) := 60;
  v_owner_rate numeric(5,2) := 10;
  v_commission_type text := 'renewal';
  v_owner public.barndaksa_owners%ROWTYPE;
BEGIN
  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE id = p_subscription_id
  FOR UPDATE;

  IF NOT FOUND OR v_subscription.amount_sar <= 0 OR v_subscription.status NOT IN ('active', 'trialing', 'paid') THEN
    RETURN;
  END IF;

  v_started_at := COALESCE(v_subscription.paid_at, v_subscription.started_at, v_subscription.created_at, now());
  v_net_amount := round((COALESCE(v_subscription.amount_sar, 0) / 1.15)::numeric, 2);

  SELECT * INTO v_referral
  FROM public.brand_referrals
  WHERE cafe_id = v_subscription.cafe_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_referral.first_paid_subscription_at IS NULL THEN
      UPDATE public.brand_referrals
      SET first_paid_subscription_at = v_started_at,
          commission_end_at = v_started_at + interval '12 months'
      WHERE id = v_referral.id;
      v_referral.first_paid_subscription_at := v_started_at;
      v_months_elapsed := 0;
      v_commission_type := 'initial';
    ELSE
      v_months_elapsed :=
        EXTRACT(YEAR FROM age(v_started_at, v_referral.first_paid_subscription_at))::int * 12
        + EXTRACT(MONTH FROM age(v_started_at, v_referral.first_paid_subscription_at))::int;
      v_commission_type := 'renewal';
    END IF;

    v_rep_rate := CASE
      WHEN v_months_elapsed < 6 THEN 40
      WHEN v_months_elapsed < 12 THEN 20
      ELSE 0
    END;

    v_platform_rate := CASE
      WHEN v_months_elapsed < 6 THEN 40
      ELSE 60
    END;

    v_owner_rate := CASE
      WHEN v_months_elapsed < 12 THEN 5
      ELSE 10
    END;

    UPDATE public.subscriptions
    SET representative_id = COALESCE(representative_id, v_referral.representative_id),
        coupon_code_snapshot = COALESCE(coupon_code_snapshot, (
          SELECT coupon.code::text FROM public.representative_coupons coupon WHERE coupon.id = v_referral.coupon_id
        )),
        paid_at = COALESCE(paid_at, v_started_at)
    WHERE id = v_subscription.id;

    IF v_rep_rate > 0 THEN
      INSERT INTO public.representative_commissions (
        representative_id,
        referral_id,
        subscription_id,
        commission_type,
        base_amount_sar,
        rate_percent,
        amount_sar
      ) VALUES (
        v_referral.representative_id,
        v_referral.id,
        v_subscription.id,
        v_commission_type,
        v_net_amount,
        v_rep_rate,
        round(v_net_amount * v_rep_rate / 100, 2)
      )
      ON CONFLICT (subscription_id) WHERE subscription_id IS NOT NULL DO UPDATE SET
        base_amount_sar = EXCLUDED.base_amount_sar,
        rate_percent = EXCLUDED.rate_percent,
        amount_sar = EXCLUDED.amount_sar,
        commission_type = EXCLUDED.commission_type;

      INSERT INTO public.subscription_profit_distributions (
        subscription_id, cafe_id, recipient_type, recipient_name, representative_id,
        rate_percent, gross_amount_sar, net_amount_sar, amount_sar, notes
      ) VALUES (
        v_subscription.id, v_subscription.cafe_id, 'representative', 'مندوب الكوبون', v_referral.representative_id,
        v_rep_rate, v_subscription.amount_sar, v_net_amount, round(v_net_amount * v_rep_rate / 100, 2),
        'عمولة مندوب من أول اشتراك مدفوع وليس من التجربة المجانية'
      )
      ON CONFLICT (subscription_id, recipient_type, recipient_name) DO UPDATE SET
        rate_percent = EXCLUDED.rate_percent,
        gross_amount_sar = EXCLUDED.gross_amount_sar,
        net_amount_sar = EXCLUDED.net_amount_sar,
        amount_sar = EXCLUDED.amount_sar;
    END IF;
  END IF;

  INSERT INTO public.subscription_profit_distributions (
    subscription_id, cafe_id, recipient_type, recipient_name,
    rate_percent, gross_amount_sar, net_amount_sar, amount_sar, notes
  ) VALUES (
    v_subscription.id, v_subscription.cafe_id, 'platform_capital_reserve', 'الصب في رأس المال',
    v_platform_rate, v_subscription.amount_sar, v_net_amount, round(v_net_amount * v_platform_rate / 100, 2),
    'حصة المنصة التشغيلية ورأس المال'
  )
  ON CONFLICT (subscription_id, recipient_type, recipient_name) DO UPDATE SET
    rate_percent = EXCLUDED.rate_percent,
    gross_amount_sar = EXCLUDED.gross_amount_sar,
    net_amount_sar = EXCLUDED.net_amount_sar,
    amount_sar = EXCLUDED.amount_sar;

  FOR v_owner IN SELECT * FROM public.barndaksa_owners WHERE active = true ORDER BY name LOOP
    INSERT INTO public.subscription_profit_distributions (
      subscription_id, cafe_id, recipient_type, recipient_name, owner_id,
      rate_percent, gross_amount_sar, net_amount_sar, amount_sar, notes
    ) VALUES (
      v_subscription.id, v_subscription.cafe_id, 'owner', v_owner.name, v_owner.id,
      v_owner_rate, v_subscription.amount_sar, v_net_amount, round(v_net_amount * v_owner_rate / 100, 2),
      'توزيع الملاك حسب مرحلة العميل المدفوع'
    )
    ON CONFLICT (subscription_id, recipient_type, recipient_name) DO UPDATE SET
      rate_percent = EXCLUDED.rate_percent,
      gross_amount_sar = EXCLUDED.gross_amount_sar,
      net_amount_sar = EXCLUDED.net_amount_sar,
      amount_sar = EXCLUDED.amount_sar;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.record_subscription_finance_distribution(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_subscription_finance_distribution(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION platform_access_private.service_enabled(p_cafe_id uuid, p_feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p_feature IN ('menu','offers','loyalty','settings','pager') AND EXISTS (
  SELECT 1 FROM public.subscriptions s JOIN public.platform_plans p ON p.id=s.plan_id
  WHERE s.cafe_id=p_cafe_id AND s.status IN ('active','trialing') AND p.active
    AND (s.started_at IS NULL OR s.started_at<=now()) AND (s.expires_at IS NULL OR s.expires_at>now())
    AND (p.features ? p_feature OR p.features ? 'all')
 ) AND NOT EXISTS(SELECT 1 FROM public.brand_feature_overrides o
    WHERE o.cafe_id=p_cafe_id AND o.feature_id=p_feature AND NOT o.enabled);
$$;
REVOKE ALL ON FUNCTION platform_access_private.service_enabled(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_access_private.service_enabled(uuid,text) TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION pager_private.enabled(p_cafe uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND deleted_at IS NULL AND status='active')
 AND EXISTS(SELECT 1 FROM public.subscriptions s JOIN public.platform_plans p ON p.id=s.plan_id
  WHERE s.cafe_id=p_cafe AND s.status IN ('active','trialing') AND p.active
    AND (s.started_at IS NULL OR s.started_at<=now()) AND (s.expires_at IS NULL OR s.expires_at>now())
    AND (p.features ? 'pager' OR p.features ? 'all'))
 AND NOT EXISTS(SELECT 1 FROM public.brand_feature_overrides WHERE cafe_id=p_cafe AND feature_id='pager' AND NOT enabled);
$$;
REVOKE ALL ON FUNCTION pager_private.enabled(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION pager_private.enabled(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.marketing_actor_allowed(p_cafe uuid,p_actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.cafes c JOIN public.profiles actor ON actor.id=p_actor AND actor.status='active'
  JOIN public.subscriptions s ON s.cafe_id=c.id AND s.status IN ('active','trialing')
  JOIN public.platform_plans p ON p.id=s.plan_id AND p.active
  WHERE c.id=p_cafe AND c.deleted_at IS NULL AND c.status IN ('active','published')
   AND (c.owner_user_id=p_actor OR actor.role='platform_admin' OR EXISTS(SELECT 1 FROM public.cafe_members m WHERE m.cafe_id=c.id AND m.user_id=p_actor AND m.role IN ('owner','manager')))
   AND (s.started_at IS NULL OR s.started_at<=now()) AND (s.expires_at IS NULL OR s.expires_at>now())
   AND (p.features @> '["marketing_campaigns"]'::jsonb OR p.features @> '["all"]'::jsonb)
   AND NOT EXISTS(SELECT 1 FROM public.brand_feature_overrides o WHERE o.cafe_id=c.id AND o.feature_id='marketing_campaigns' AND NOT o.enabled)
 );
$$;

REVOKE ALL ON FUNCTION public.marketing_actor_allowed(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_actor_allowed(uuid,uuid) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
