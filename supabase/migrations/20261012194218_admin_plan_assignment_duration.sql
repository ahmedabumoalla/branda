BEGIN;
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
    WHERE cafe_id=p_cafe_id AND status IN ('active','trialing','past_due');
  INSERT INTO public.subscriptions(cafe_id,plan_id,status,amount_sar,base_amount_sar,discount_amount_sar,
    plan_name_snapshot,duration_unit,duration_count,activation_source,payment_provider,payment_method_label,started_at,expires_at)
  VALUES(p_cafe_id,p_plan_id,CASE WHEN v_trial THEN 'trialing' ELSE 'active' END,0,0,0,
    v_plan.name,v_unit,v_count,'admin_manual_change','admin','تغيير يدوي من الأدمن',v_start,v_end);
END $$;
REVOKE ALL ON FUNCTION public.admin_assign_plan_without_payment(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_plan_without_payment(uuid,text) TO authenticated;
COMMIT;
