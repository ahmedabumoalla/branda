-- Forward-only. Existing payment snapshots and subscription expiry dates are preserved.
-- Roll back with a new migration restoring the previous quote/finance definitions and
-- dropping these policy triggers. Never recompute historical prices or paid periods.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Preserve the existing authenticated, owner-scoped quote and credit workflow.
-- Keep legacy annual_* column/API names so old payment snapshots remain readable.
DO $$
DECLARE definition text; before_text text;
BEGIN
  SELECT pg_get_functiondef('public.quote_bank_subscription(text,integer,text)'::regprocedure) INTO definition;
  before_text := 'p_duration_months NOT IN (1,3,6,12)';
  IF strpos(definition,before_text)=0 THEN RAISE EXCEPTION 'Quote duration definition changed'; END IF;
  definition := replace(definition,before_text,'p_duration_months NOT IN (1,3)');
  before_text := 'WHEN p_duration_months=12 THEN round(v_base*v_plan.annual_discount_percent/100,2)';
  IF strpos(definition,before_text)=0 THEN RAISE EXCEPTION 'Quote discount definition changed'; END IF;
  EXECUTE replace(definition,before_text,'WHEN p_duration_months=3 THEN round(v_base*v_plan.annual_discount_percent/100,2)');

  SELECT pg_get_functiondef('public.admin_post_finance_entry(uuid,jsonb)'::regprocedure) INTO definition;
  before_text := 'v_months NOT IN (1,3,6,12)';
  IF strpos(definition,before_text)=0 THEN RAISE EXCEPTION 'Finance duration definition changed'; END IF;
  definition := replace(definition,before_text,'v_months NOT IN (1,3)');
  before_text := 'v_annual:=CASE WHEN v_months=12 THEN round(v_base*v_plan.annual_discount_percent/100,2) ELSE 0 END;';
  IF strpos(definition,before_text)=0 THEN RAISE EXCEPTION 'Finance discount definition changed'; END IF;
  EXECUTE replace(definition,before_text,'v_annual:=CASE WHEN v_months=3 THEN round(v_base*(CASE WHEN v_plan.id=''finance'' THEN 20 ELSE v_plan.annual_discount_percent END)/100,2) ELSE 0 END;');
END $$;

CREATE FUNCTION public.normalize_platform_plan_terms()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  NEW.max_products_monthly := NULL;
  NEW.duration_options := ARRAY[1,3];
  IF NEW.price_sar > 0 THEN
    NEW.duration_unit := 'month';
    NEW.duration_count := 1;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.normalize_platform_plan_terms() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER normalize_platform_plan_terms
BEFORE INSERT OR UPDATE ON public.platform_plans
FOR EACH ROW EXECUTE FUNCTION public.normalize_platform_plan_terms();

-- Status updates to historical rows remain possible. New periods, including direct
-- manual activation and approval of old requests, must obey the current term policy.
CREATE FUNCTION public.check_new_subscription_term()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.duration_unit IS NOT DISTINCT FROM OLD.duration_unit
      AND NEW.duration_count IS NOT DISTINCT FROM OLD.duration_count THEN RETURN NEW; END IF;
  END IF;
  IF NEW.duration_unit IS NULL OR NEW.duration_count IS NULL
    OR NOT ((NEW.duration_unit='month' AND NEW.duration_count IN (1,3))
      OR (TG_TABLE_NAME='subscriptions' AND coalesce(NEW.amount_sar,0)=0 AND NEW.duration_unit='day' AND NEW.duration_count BETWEEN 1 AND 365))
    THEN RAISE EXCEPTION 'Subscriptions support one or three months only'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.check_new_subscription_term() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER check_new_subscription_term
BEFORE INSERT OR UPDATE OF duration_unit,duration_count ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.check_new_subscription_term();
CREATE TRIGGER check_new_payment_request_term
BEFORE INSERT OR UPDATE OF duration_unit,duration_count ON public.subscription_payment_requests
FOR EACH ROW EXECUTE FUNCTION public.check_new_subscription_term();

ALTER TABLE public.platform_plans ALTER COLUMN duration_options SET DEFAULT ARRAY[1,3];
ALTER TABLE public.platform_discount_coupons ALTER COLUMN eligible_duration_months SET DEFAULT ARRAY[1,3];
COMMENT ON COLUMN public.platform_plans.annual_discount_percent IS 'Three-month subscription discount percentage; legacy column name retained for API compatibility';
COMMENT ON COLUMN public.platform_plans.max_products_monthly IS 'Retired: all plans have unlimited products; writes normalize this field to NULL';
NOTIFY pgrst,'reload schema';
COMMIT;
