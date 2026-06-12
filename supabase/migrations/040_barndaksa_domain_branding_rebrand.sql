-- 040_barndaksa_domain_branding_rebrand.sql
-- Rebrand persisted database names/content from Branda to Barndaksa and prepare barndaksa.com.

-- 1) Finance owners table was previously named branda_owners in migration 032.
DO $$
BEGIN
  IF to_regclass('public.branda_owners') IS NOT NULL AND to_regclass('public.barndaksa_owners') IS NULL THEN
    ALTER TABLE public.branda_owners RENAME TO barndaksa_owners;
  ELSIF to_regclass('public.branda_owners') IS NOT NULL AND to_regclass('public.barndaksa_owners') IS NOT NULL THEN
    INSERT INTO public.barndaksa_owners (id, name, ownership_percent, active, created_at)
    SELECT id, name, ownership_percent, active, created_at
    FROM public.branda_owners
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Rename old policy when possible, otherwise recreate the expected policy.
DO $$
BEGIN
  IF to_regclass('public.barndaksa_owners') IS NOT NULL THEN
    BEGIN
      ALTER POLICY branda_owners_admin_read ON public.barndaksa_owners RENAME TO barndaksa_owners_admin_read;
    EXCEPTION WHEN undefined_object THEN
      NULL;
    END;
  END IF;
END $$;

DROP POLICY IF EXISTS barndaksa_owners_admin_read ON public.barndaksa_owners;
CREATE POLICY barndaksa_owners_admin_read ON public.barndaksa_owners
  FOR SELECT
  USING (public.is_platform_admin());

GRANT SELECT ON public.barndaksa_owners TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.barndaksa_owners TO service_role;

-- 2) Recreate finance distribution function with the new owners table name.
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

-- 3) Update persisted platform support email / public domain-friendly values.
UPDATE public.platform_settings
SET support_email = 'support@barndaksa.com'
WHERE id = 'default';

-- 4) Best-effort replace old brand/domain text inside known text columns, only if they exist.
DO $brand$
BEGIN
  IF to_regclass('public.domain_orders') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='domain_orders' AND column_name='domain_name') THEN
      EXECUTE $sql$UPDATE public.domain_orders SET domain_name = replace(replace(domain_name, 'branda.local', 'barndaksa.com'), 'branda', 'barndaksa') WHERE domain_name ILIKE '%branda%'$sql$;
    END IF;
  END IF;

  IF to_regclass('public.platform_content_sections') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='platform_content_sections' AND column_name='title') THEN
      EXECUTE $sql$UPDATE public.platform_content_sections SET title = replace(replace(title, 'Branda', 'Barndaksa'), 'برندة', 'بارنداكسا') WHERE title ILIKE '%branda%' OR title LIKE '%برندة%'$sql$;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='platform_content_sections' AND column_name='body') THEN
      EXECUTE $sql$UPDATE public.platform_content_sections SET body = replace(replace(body, 'Branda', 'Barndaksa'), 'برندة', 'بارنداكسا') WHERE body ILIKE '%branda%' OR body LIKE '%برندة%'$sql$;
    END IF;
  END IF;
END
$brand$;

SELECT 'barndaksa_domain_branding_rebrand_ready' AS status;
