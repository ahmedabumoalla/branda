-- Explicit owner request, 2026-10-09: annual menu for the two named brands,
-- menu only through October for all other existing non-deleted brands.
-- One-time transaction; original state retained privately for audit/recovery.
BEGIN;
CREATE TABLE platform_access_private.menu_term_grants_20261009 (
  cafe_id uuid PRIMARY KEY,
  before_cafe jsonb NOT NULL,
  before_subscriptions jsonb NOT NULL,
  before_menu_overrides jsonb NOT NULL,
  new_subscription_id uuid,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_access_private.menu_term_grants_20261009 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_access_private.menu_term_grants_20261009 FROM PUBLIC,anon,authenticated,service_role;

DO $$
DECLARE
  brand public.cafes%ROWTYPE;
  anchor_start timestamptz;
  term_end timestamptz;
  grant_plan text;
  grant_name text;
  new_id uuid;
  annual boolean;
BEGIN
  IF (SELECT count(*) FROM public.cafes WHERE deleted_at IS NULL) <> 23 THEN
    RAISE EXCEPTION 'Brand set changed; review before applying';
  END IF;
  IF (SELECT count(*) FROM public.cafes WHERE deleted_at IS NULL AND slug IN ('double-b-bistro','basilico')) <> 2 THEN
    RAISE EXCEPTION 'Annual brand identities missing';
  END IF;
  INSERT INTO public.platform_plans(id,name,price_sar,features,active,duration_unit,duration_count,category_id,trial_days,free_after_trial,is_default,sort_order)
  VALUES
    ('menu_annual_20261009','المنيو المستقل — مفعّل لمدة سنة',0,'["menu"]',true,'year',1,'cafes_coffee',0,false,false,997),
    ('menu_october_20261009','المنيو المستقل — حتى نهاية أكتوبر ٢٠٢٦',0,'["menu"]',true,'month',1,'cafes_coffee',0,false,false,998);
  FOR brand IN SELECT * FROM public.cafes WHERE deleted_at IS NULL ORDER BY id FOR UPDATE LOOP
    annual := brand.slug IN ('double-b-bistro','basilico');
    INSERT INTO platform_access_private.menu_term_grants_20261009(cafe_id,before_cafe,before_subscriptions,before_menu_overrides)
    VALUES(brand.id,to_jsonb(brand),
      coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM public.subscriptions s WHERE s.cafe_id=brand.id),'[]'::jsonb),
      coalesce((SELECT jsonb_agg(to_jsonb(o)) FROM public.brand_feature_overrides o WHERE o.cafe_id=brand.id AND feature_id='menu'),'[]'::jsonb));
    IF annual THEN
      SELECT started_at INTO anchor_start FROM public.subscriptions
      WHERE cafe_id=brand.id AND status IN ('active','trialing') ORDER BY created_at DESC LIMIT 1;
      IF anchor_start IS NULL OR anchor_start IS DISTINCT FROM (CASE brand.slug
        WHEN 'double-b-bistro' THEN timestamptz '2026-08-30 10:05:42.174535+00'
        ELSE timestamptz '2026-08-24 09:38:03.147905+00' END) THEN
        RAISE EXCEPTION 'Subscription anchor changed for %',brand.slug;
      END IF;
      term_end := anchor_start + interval '1 year';
      grant_plan := 'menu_annual_20261009';
      grant_name := 'المنيو المستقل — مفعّل لمدة سنة';
    ELSE
      anchor_start := now();
      term_end := timestamptz '2026-10-31 23:59:59.999+03';
      grant_plan := 'menu_october_20261009';
      grant_name := 'المنيو المستقل — حتى نهاية أكتوبر ٢٠٢٦';
    END IF;
    IF term_end <= now() THEN RAISE EXCEPTION 'Grant term has already ended'; END IF;
    UPDATE public.subscriptions SET status='cancelled',cancelled_at=now(),updated_at=now()
      WHERE cafe_id=brand.id AND status IN ('active','trialing');
    INSERT INTO public.subscriptions(cafe_id,plan_id,status,amount_sar,base_amount_sar,discount_amount_sar,started_at,expires_at,plan_name_snapshot,duration_unit,duration_count,activation_source,payment_provider,payment_method_label)
    VALUES(brand.id,grant_plan,'active',0,0,0,anchor_start,term_end,grant_name,CASE WHEN annual THEN 'year' ELSE 'month' END,1,
      'menu_grant_20261009','internal','تفعيل المنيو بطلب مدير المنصة') RETURNING id INTO new_id;
    -- Menu-only entitlement remains the authority for all other services.
    DELETE FROM public.brand_feature_overrides WHERE cafe_id=brand.id AND feature_id='menu' AND enabled=false;
    UPDATE public.cafes SET status='active',is_public=true WHERE id=brand.id;
    UPDATE platform_access_private.menu_term_grants_20261009 SET new_subscription_id=new_id WHERE cafe_id=brand.id;
  END LOOP;
END $$;
COMMIT;
