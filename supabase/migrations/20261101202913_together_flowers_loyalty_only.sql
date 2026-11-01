-- Owner requested an unpublished zero-price flowers bundle and loyalty-only access
-- Together's already-active loyalty subscription retains its exact period and price
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.platform_plans WHERE id='flowers' AND
    (name<>'باقة الزهور' OR active OR price_sar<>0)) THEN
    RAISE EXCEPTION 'Flowers plan identity changed; manual review required';
  END IF;
END $$;

INSERT INTO public.platform_plans(id,name,description,price_sar,features,sort_order,active,is_default,
  duration_unit,duration_count,category_id,trial_days,free_after_trial,is_upgrade_bundle)
VALUES('flowers','باقة الزهور','المنتجات والخدمات والطلبات والعروض والولاء والمالية وإعدادات متجر الزهور',
  0,'["menu","offers","loyalty","pager","settings","finance"]'::jsonb,96,false,false,
  'month',1,'gifts_flowers',0,false,false)
ON CONFLICT(id) DO NOTHING;

DO $$
DECLARE v_cafe constant uuid := '4e5a661a-7029-40ec-a3bc-dc75959a05bb';
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=v_cafe AND slug='brand-871ec6e243c0') THEN RETURN; END IF;
  PERFORM 1 FROM public.subscriptions WHERE cafe_id=v_cafe FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.subscriptions WHERE cafe_id=v_cafe
    AND id='054d8d37-5536-4375-b17a-becb76d3dc7b' AND plan_id='pro' AND amount_sar=0
    AND started_at='2026-11-01T20:18:11.109128Z' AND expires_at='2026-12-01T20:18:11.109128Z') THEN
    RAISE EXCEPTION 'Together loyalty period changed; manual review required';
  END IF;
  UPDATE public.subscriptions SET status='cancelled',cancelled_at=now(),updated_at=now()
  WHERE cafe_id=v_cafe AND amount_sar=0 AND status='trialing' AND (
    (id='79ea3eeb-b098-44ca-a379-9a0def0dc942' AND plan_id='finance' AND activation_source='owner_authorized_finance_trial_7d') OR
    (id='51c11a72-2a1f-4598-892e-a52f13025abb' AND plan_id='-' AND activation_source='admin_prepared_trial'));
  -- The shared loyalty package also includes pager; disable it only for this brand
  INSERT INTO public.brand_feature_overrides(cafe_id,feature_id,enabled)
  VALUES(v_cafe,'pager',false)
  ON CONFLICT(cafe_id,feature_id) DO UPDATE SET enabled=false
  WHERE public.brand_feature_overrides.enabled;
END $$;

COMMIT;
