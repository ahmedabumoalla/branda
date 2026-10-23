BEGIN;

-- Keep the existing authoritative quote, coupon, credit and approval workflow.
-- Guarded definition replacements fail closed if its reviewed implementation drifts.
DO $$
DECLARE definition text; before_text text; after_text text;
BEGIN
 SELECT pg_get_functiondef('public.quote_bank_subscription(text,integer,text)'::regprocedure) INTO definition;
 before_text := 'v_annual:=CASE WHEN p_duration_months=12 THEN round(v_base*v_plan.annual_discount_percent/100,2) ELSE 0 END;';
 after_text := 'v_annual:=CASE WHEN v_plan.id=''finance'' AND p_duration_months=3 THEN round(v_base*20/100,2) WHEN p_duration_months=12 THEN round(v_base*v_plan.annual_discount_percent/100,2) ELSE 0 END;';
 IF strpos(definition,before_text)=0 THEN RAISE EXCEPTION 'Subscription quote pricing definition changed'; END IF;
 definition:=replace(definition,before_text,after_text);
 before_text := '(v_plan.features ? ''all'' OR p.features <@ v_plan.features)';
 after_text := '((v_plan.features ? ''all'' AND NOT (p.features ? ''finance'')) OR p.features <@ v_plan.features)';
 IF strpos(definition,before_text)=0 THEN RAISE EXCEPTION 'Subscription quote upgrade definition changed'; END IF;
 EXECUTE replace(definition,before_text,after_text);

 SELECT pg_get_functiondef('public.admin_approve_subscription_request(uuid)'::regprocedure) INTO definition;
 before_text := '(target.features ? ''all'' OR source.features <@ target.features)';
 after_text := '((target.features ? ''all'' AND NOT (source.features ? ''finance'')) OR source.features <@ target.features)';
 IF strpos(definition,before_text)=0 THEN RAISE EXCEPTION 'Subscription approval upgrade definition changed'; END IF;
 EXECUTE replace(definition,before_text,after_text);
END $$;

UPDATE public.platform_plans SET price_sar=1099,active=true,duration_unit='month',duration_count=1,
 duration_options=ARRAY[1,3],annual_discount_percent=0,is_upgrade_bundle=false,trial_days=0,free_after_trial=false
 WHERE id='finance';

ALTER TABLE public.platform_plans ADD CONSTRAINT finance_plan_supported_terms
 CHECK (id <> 'finance' OR (duration_unit='month' AND duration_count IN(1,3)
   AND duration_options=ARRAY[1,3] AND annual_discount_percent=0 AND NOT is_upgrade_bundle));
ALTER TABLE public.subscriptions ADD CONSTRAINT finance_subscription_supported_terms
 CHECK (plan_id <> 'finance' OR (duration_unit IS NOT NULL AND duration_count IS NOT NULL AND duration_unit='month' AND duration_count IN(1,3)));
ALTER TABLE public.subscription_payment_requests ADD CONSTRAINT finance_request_supported_terms
 CHECK (plan_id <> 'finance' OR (duration_unit IS NOT NULL AND duration_count IS NOT NULL AND duration_unit='month' AND duration_count IN(1,3)));

NOTIFY pgrst,'reload schema';
COMMIT;
