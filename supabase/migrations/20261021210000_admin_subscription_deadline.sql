-- Change only the current assignment's deadline, never its plan or financial fields.
CREATE OR REPLACE FUNCTION public.admin_update_subscription_deadline(
  p_cafe_id uuid, p_subscription_id uuid, p_expected_updated_at timestamptz, p_expires_at timestamptz
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_subscription public.subscriptions%ROWTYPE; v_current uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='platform_admin' AND status='active'
  ) THEN RAISE EXCEPTION 'expiry_forbidden' USING ERRCODE='42501'; END IF;
  -- Same lock order as administrative plan assignment and paid activation.
  PERFORM 1 FROM public.cafes WHERE id=p_cafe_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'expiry_unavailable'; END IF;
  SELECT id INTO v_current FROM public.subscriptions
    WHERE cafe_id=p_cafe_id AND status IN ('active','trialing') ORDER BY created_at DESC,id DESC LIMIT 1;
  IF v_current IS DISTINCT FROM p_subscription_id THEN RAISE EXCEPTION 'expiry_conflict'; END IF;
  SELECT * INTO v_subscription FROM public.subscriptions WHERE id=p_subscription_id AND cafe_id=p_cafe_id FOR UPDATE;
  IF NOT FOUND OR v_subscription.status NOT IN ('active','trialing')
    OR v_subscription.activation_source='admin_prepared_trial'
    OR v_subscription.started_at IS NULL OR v_subscription.started_at>now()
  THEN RAISE EXCEPTION 'expiry_unavailable'; END IF;
  IF p_expected_updated_at IS NULL OR v_subscription.updated_at IS DISTINCT FROM p_expected_updated_at
  THEN RAISE EXCEPTION 'expiry_conflict'; END IF;
  IF p_expires_at IS NULL OR NOT isfinite(p_expires_at) OR p_expires_at<=v_subscription.started_at
  THEN RAISE EXCEPTION 'expiry_invalid'; END IF;
  IF v_subscription.expires_at IS NOT DISTINCT FROM p_expires_at THEN RETURN; END IF;
  UPDATE public.subscriptions SET expires_at=p_expires_at,updated_at=clock_timestamp() WHERE id=v_subscription.id;
  INSERT INTO public.audit_logs(actor_id,cafe_id,action,entity_table,entity_id,old_data,new_data)
  VALUES(auth.uid(),p_cafe_id,'admin_subscription_deadline_updated','subscriptions',v_subscription.id,
    jsonb_build_object('expires_at',v_subscription.expires_at,'plan_id',v_subscription.plan_id,'status',v_subscription.status),
    jsonb_build_object('expires_at',p_expires_at,'plan_id',v_subscription.plan_id,'status',v_subscription.status,'timezone','Asia/Riyadh'));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_subscription_deadline(uuid,uuid,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_update_subscription_deadline(uuid,uuid,timestamptz,timestamptz) TO authenticated;
