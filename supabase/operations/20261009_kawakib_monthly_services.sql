-- Requested monthly menu, loyalty and offers for Kawakib only.
BEGIN;
CREATE TABLE platform_access_private.kawakib_monthly_grant_20261009 (
  cafe_id uuid PRIMARY KEY, before_subscriptions jsonb NOT NULL,
  before_overrides jsonb NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_access_private.kawakib_monthly_grant_20261009 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_access_private.kawakib_monthly_grant_20261009 FROM PUBLIC,anon,authenticated,service_role;
DO $$
DECLARE
  target_id uuid := '3c697864-d371-4190-87ab-48f183cdf2d5';
  original_start timestamptz;
BEGIN
  PERFORM 1 FROM public.cafes WHERE id=target_id AND slug='rast' AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kawakib identity missing'; END IF;
  SELECT started_at INTO original_start FROM public.subscriptions
    WHERE cafe_id=target_id AND activation_source='signup_default_plan' ORDER BY created_at DESC LIMIT 1;
  IF original_start IS DISTINCT FROM timestamptz '2026-10-02 17:21:31.97918+00' THEN
    RAISE EXCEPTION 'Original subscription date changed';
  END IF;
  INSERT INTO platform_access_private.kawakib_monthly_grant_20261009
    (cafe_id,before_subscriptions,before_overrides)
  VALUES(target_id,
    (SELECT jsonb_agg(to_jsonb(s)) FROM public.subscriptions s WHERE cafe_id=target_id),
    coalesce((SELECT jsonb_agg(to_jsonb(o)) FROM public.brand_feature_overrides o WHERE cafe_id=target_id),'[]'::jsonb));
  INSERT INTO public.platform_plans(id,name,price_sar,features,active,duration_unit,duration_count,category_id,trial_days,free_after_trial,is_default,sort_order)
  VALUES('kawakib_monthly_20261009','المنيو والولاء والعروض — اشتراك شهري',0,'["menu","loyalty","offers"]',true,'month',1,'cafes_coffee',0,false,false,999);
  UPDATE public.subscriptions SET status='cancelled',cancelled_at=now(),updated_at=now()
    WHERE cafe_id=target_id AND status IN ('active','trialing');
  INSERT INTO public.subscriptions(cafe_id,plan_id,status,amount_sar,base_amount_sar,discount_amount_sar,started_at,expires_at,plan_name_snapshot,duration_unit,duration_count,activation_source,payment_provider,payment_method_label)
  VALUES(target_id,'kawakib_monthly_20261009','active',0,0,0,original_start,original_start+interval '1 month',
    'المنيو والولاء والعروض — اشتراك شهري','month',1,'kawakib_grant_20261009','internal','تفعيل بطلب مدير المنصة');
  DELETE FROM public.brand_feature_overrides WHERE cafe_id=target_id AND feature_id IN ('menu','loyalty','offers') AND enabled=false;
END $$;
COMMIT;
