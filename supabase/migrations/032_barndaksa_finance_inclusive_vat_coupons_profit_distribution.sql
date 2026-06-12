BEGIN;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS base_amount_sar numeric(10,2),
  ADD COLUMN IF NOT EXISTS discount_amount_sar numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_code_snapshot text,
  ADD COLUMN IF NOT EXISTS representative_id uuid REFERENCES public.platform_representatives(id),
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

UPDATE public.subscriptions
SET base_amount_sar = COALESCE(base_amount_sar, amount_sar)
WHERE base_amount_sar IS NULL;

CREATE TABLE IF NOT EXISTS public.barndaksa_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  ownership_percent numeric(5,2) NOT NULL CHECK (ownership_percent >= 0 AND ownership_percent <= 100),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subscription_profit_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  recipient_type text NOT NULL CHECK (recipient_type IN ('platform_capital_reserve', 'owner', 'representative')),
  recipient_name text NOT NULL,
  owner_id uuid REFERENCES public.barndaksa_owners(id),
  representative_id uuid REFERENCES public.platform_representatives(id),
  rate_percent numeric(5,2) NOT NULL DEFAULT 0,
  gross_amount_sar numeric(10,2) NOT NULL DEFAULT 0,
  net_amount_sar numeric(10,2) NOT NULL DEFAULT 0,
  amount_sar numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subscription_id, recipient_type, recipient_name)
);

INSERT INTO public.barndaksa_owners (name, ownership_percent)
VALUES
  ('احمد ابومعلا', 30),
  ('عبدالله ابومعلا', 30),
  ('ماهر الشريف', 10),
  ('ماجد مجرشي', 30)
ON CONFLICT (name) DO UPDATE SET
  ownership_percent = EXCLUDED.ownership_percent,
  active = true,
  updated_at = now();

CREATE UNIQUE INDEX IF NOT EXISTS representative_commissions_subscription_unique
  ON public.representative_commissions(subscription_id)
  WHERE subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_finance_cafe_status
  ON public.subscriptions(cafe_id, status, started_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscriptions_finance_paid
  ON public.subscriptions(status, amount_sar, started_at DESC)
  WHERE amount_sar > 0;

CREATE INDEX IF NOT EXISTS idx_subscription_profit_distributions_subscription
  ON public.subscription_profit_distributions(subscription_id);

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

  v_started_at := COALESCE(v_subscription.started_at, v_subscription.paid_at, v_subscription.created_at, now());
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

CREATE OR REPLACE FUNCTION public.trg_record_subscription_finance_distribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.amount_sar > 0
     AND NEW.status IN ('active', 'trialing', 'paid')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.amount_sar IS DISTINCT FROM NEW.amount_sar) THEN
    PERFORM public.record_subscription_finance_distribution(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscriptions_finance_distribution_trigger ON public.subscriptions;
CREATE TRIGGER subscriptions_finance_distribution_trigger
AFTER INSERT OR UPDATE OF status, amount_sar, started_at, paid_at ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.trg_record_subscription_finance_distribution();

ALTER TABLE public.barndaksa_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_profit_distributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS barndaksa_owners_admin_read ON public.barndaksa_owners;
CREATE POLICY barndaksa_owners_admin_read ON public.barndaksa_owners
  FOR SELECT USING (public.is_platform_admin());

DROP POLICY IF EXISTS subscription_profit_distributions_admin_read ON public.subscription_profit_distributions;
CREATE POLICY subscription_profit_distributions_admin_read ON public.subscription_profit_distributions
  FOR SELECT USING (public.is_platform_admin());

GRANT SELECT ON public.barndaksa_owners TO authenticated;
GRANT SELECT ON public.subscription_profit_distributions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.barndaksa_owners TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_profit_distributions TO service_role;

COMMIT;
