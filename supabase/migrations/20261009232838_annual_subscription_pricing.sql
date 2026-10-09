BEGIN;

ALTER TABLE public.platform_plans ADD COLUMN IF NOT EXISTS annual_discount_percent numeric(5,2) NOT NULL DEFAULT 0
  CHECK (annual_discount_percent BETWEEN 0 AND 100);
UPDATE public.platform_plans SET duration_unit='month', duration_count=1, duration_options=ARRAY[1,3,6,12],
  offer_enabled=false WHERE price_sar>0;
UPDATE public.platform_plans SET free_after_trial=false WHERE free_after_trial=true;
ALTER TABLE public.platform_plans ADD CONSTRAINT plans_no_free_fallback CHECK (free_after_trial IS NOT TRUE);

ALTER TABLE public.platform_discount_coupons ADD COLUMN IF NOT EXISTS eligible_duration_months integer[] NOT NULL DEFAULT ARRAY[1,3,6,12]
  CHECK (cardinality(eligible_duration_months)>0 AND eligible_duration_months <@ ARRAY[1,3,6,12] AND array_position(eligible_duration_months,NULL) IS NULL);
ALTER TABLE public.subscription_payment_requests
  ADD COLUMN IF NOT EXISTS platform_coupon_id uuid REFERENCES public.platform_discount_coupons(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS coupon_code_snapshot text,
  ADD COLUMN IF NOT EXISTS annual_discount_amount_sar numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_discount_amount_sar numeric(10,2) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS subscription_requests_coupon_open ON public.subscription_payment_requests(platform_coupon_id)
  WHERE status IN ('awaiting_receipt','pending_review');

-- Both preview and creation calculate the same server-authoritative price
CREATE OR REPLACE FUNCTION public.quote_bank_subscription(p_plan_id text, p_duration_months integer, p_coupon_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_plan public.platform_plans%ROWTYPE;
  v_coupon public.platform_discount_coupons%ROWTYPE;
  v_base numeric(10,2); v_annual numeric(10,2); v_discount numeric(10,2):=0; v_total numeric(10,2);
  v_code text:=nullif(upper(trim(p_coupon_code)), '');
  v_reserved integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.cafes WHERE owner_user_id=auth.uid() AND deleted_at IS NULL)
    THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF p_duration_months IS NULL OR p_duration_months NOT IN (1,3,6,12) THEN RAISE EXCEPTION 'Invalid duration'; END IF;
  SELECT * INTO v_plan FROM public.platform_plans WHERE id=p_plan_id AND active=true FOR SHARE;
  IF NOT FOUND OR v_plan.price_sar<=0 OR v_plan.id='owner_trial_7d' THEN RAISE EXCEPTION 'Plan unavailable'; END IF;
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
  RETURN jsonb_build_object('planName',v_plan.name,'baseAmount',v_base,'annualDiscountAmount',v_annual,
    'couponDiscountAmount',v_discount,'totalAmount',v_total,'couponCode',v_code,'couponId',v_coupon.id,
    'discountPercent',coalesce(v_coupon.discount_percent,0));
END $$;
REVOKE ALL ON FUNCTION public.quote_bank_subscription(text,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quote_bank_subscription(text,integer,text) TO authenticated;

DROP FUNCTION public.create_bank_subscription_request(text,integer);
CREATE OR REPLACE FUNCTION public.create_bank_subscription_request(p_plan_id text,p_duration_months integer,p_coupon_code text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_cafe_id uuid; v_quote jsonb; v_id uuid; v_total numeric(10,2);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT id INTO v_cafe_id FROM public.cafes WHERE owner_user_id=auth.uid() AND deleted_at IS NULL LIMIT 1 FOR UPDATE;
  IF v_cafe_id IS NULL OR NOT public.is_cafe_owner(v_cafe_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF EXISTS(SELECT 1 FROM public.subscription_payment_requests WHERE cafe_id=v_cafe_id AND status IN ('awaiting_receipt','pending_review')) THEN RAISE EXCEPTION 'An open request already exists'; END IF;
  v_quote:=public.quote_bank_subscription(p_plan_id,p_duration_months,p_coupon_code);
  v_total:=(v_quote->>'totalAmount')::numeric;
  INSERT INTO public.subscription_payment_requests(cafe_id,plan_id,requested_by,plan_name,base_amount_sar,
    discount_amount_sar,tax_amount_sar,amount_sar,duration_unit,duration_count,payment_method,branch_id,status,receipt_channel,
    platform_coupon_id,coupon_code_snapshot,annual_discount_amount_sar,coupon_discount_amount_sar)
  VALUES(v_cafe_id,p_plan_id,auth.uid(),v_quote->>'planName',(v_quote->>'baseAmount')::numeric,
    (v_quote->>'annualDiscountAmount')::numeric+(v_quote->>'couponDiscountAmount')::numeric,round(v_total-v_total/1.15,2),v_total,
    'month',p_duration_months,'bank_transfer',NULL,'awaiting_receipt','upload',(v_quote->>'couponId')::uuid,
    v_quote->>'couponCode',(v_quote->>'annualDiscountAmount')::numeric,(v_quote->>'couponDiscountAmount')::numeric) RETURNING id INTO v_id;
  PERFORM public.write_audit_log(v_cafe_id,'create_bank_subscription_request','subscription_payment_requests',v_id,
    jsonb_build_object('plan_id',p_plan_id,'amount_sar',v_total,'duration_months',p_duration_months,'coupon_code',v_quote->>'couponCode'));
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.create_bank_subscription_request(text,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_bank_subscription_request(text,integer,text) TO authenticated;

-- Pending requests reserve a limited coupon slot; only successful approval counts as redemption
CREATE OR REPLACE FUNCTION public.record_bank_coupon_redemption()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.status='approved' AND OLD.status<>'approved' AND NEW.platform_coupon_id IS NOT NULL THEN
    UPDATE public.platform_discount_coupons SET redeemed_count=redeemed_count+1,updated_at=now() WHERE id=NEW.platform_coupon_id;
    UPDATE public.subscriptions SET platform_coupon_id=NEW.platform_coupon_id,coupon_code_snapshot=NEW.coupon_code_snapshot,
      base_amount_sar=NEW.base_amount_sar,discount_amount_sar=NEW.discount_amount_sar WHERE id=NEW.approved_subscription_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_bank_coupon_redemption() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER bank_coupon_redemption AFTER UPDATE OF status ON public.subscription_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.record_bank_coupon_redemption();
REVOKE ALL ON FUNCTION public.increment_platform_coupon_redemption(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.increment_platform_coupon_redemption(uuid) TO service_role;

-- Keep the existing scheduled entry point without creating replacement subscriptions
CREATE OR REPLACE FUNCTION public.move_expired_trials_to_free_plan()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed integer;
BEGIN
  UPDATE public.subscriptions SET status='expired'
    WHERE status IN ('active','trialing') AND expires_at IS NOT NULL AND expires_at<=now();
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed;
END $$;
REVOKE ALL ON FUNCTION public.move_expired_trials_to_free_plan() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.move_expired_trials_to_free_plan() TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
