-- Move the existing effective 20% finance discount into editable plan configuration
-- Payment snapshots and subscription prices/expiry are never recomputed
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.platform_plans DROP CONSTRAINT finance_plan_supported_terms;
ALTER TABLE public.platform_plans ADD CONSTRAINT finance_plan_supported_terms
  CHECK(id<>'finance' OR (duration_unit='month' AND duration_count IN(1,3)
    AND duration_options=ARRAY[1,3] AND annual_discount_percent IS NOT NULL
    AND annual_discount_percent BETWEEN 0 AND 100 AND NOT is_upgrade_bundle));

DO $$
DECLARE definition text; before_text text;
BEGIN
  SELECT pg_get_functiondef('public.quote_bank_subscription(text,integer,text)'::regprocedure) INTO definition;
  before_text := 'WHEN v_plan.id=''finance'' AND p_duration_months=3 THEN round(v_base*20/100,2) ';
  IF strpos(definition,before_text)=0 THEN RAISE EXCEPTION 'Finance quote definition changed'; END IF;
  EXECUTE replace(definition,before_text,'');

  SELECT pg_get_functiondef('public.admin_post_finance_entry(uuid,jsonb)'::regprocedure) INTO definition;
  before_text := '(CASE WHEN v_plan.id=''finance'' THEN 20 ELSE v_plan.annual_discount_percent END)';
  IF strpos(definition,before_text)=0 THEN RAISE EXCEPTION 'Finance collection definition changed'; END IF;
  EXECUTE replace(definition,before_text,'v_plan.annual_discount_percent');
END $$;

-- The prior schema required stored zero, while the price calculation applied 20%
UPDATE public.platform_plans SET annual_discount_percent=20 WHERE id='finance' AND annual_discount_percent=0;
NOTIFY pgrst,'reload schema';
COMMIT;
-- Rollback through a new migration only; never change historical payment snapshots
