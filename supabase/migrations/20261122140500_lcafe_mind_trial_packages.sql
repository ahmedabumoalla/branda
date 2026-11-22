-- Trial packages for the brand the user named on 2026-11-22: l-cafe-59cfdc54
-- User request: open for it the same options that are open for MIND as a trial counted from the day the
-- account was created. The user then chose to keep the brand's current end date, 2026-12-19 at 18:56 Riyadh
-- time, instead of shortening the whole account to 14 days. The platform keeps one end date for all packages
-- of a brand (subscription_terms_private.synchronize), so the new package ends with the signup trial
-- It writes the same rows the admin package tools write:
--   1. The package MIND is on (plan-0f39875b) is added as a trial that started with the account and ends on
--      the brand's current end date
--   2. The two services that are closed for MIND and that this package would otherwise open stay closed:
--      marketing campaigns and the pager. Nothing the brand already had is taken away
-- Safe to run again: it changes nothing once the brand holds this package
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $$
DECLARE
  v_cafe constant uuid:='8a826ee6-d3d2-4538-8c5e-41109cc072c5';
  v_plan constant text:='plan-0f39875b';
  v_note constant text:='Platform owner request of 2026-11-22, applied from the database by Claude';
  v_created timestamptz; v_end timestamptz; v_name text; v_days integer;
BEGIN
  SELECT created_at INTO v_created FROM public.cafes
    WHERE id=v_cafe AND slug='l-cafe-59cfdc54' AND deleted_at IS NULL AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The brand is missing or not active'; END IF;
  PERFORM 1 FROM public.subscriptions WHERE cafe_id=v_cafe ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.subscriptions WHERE cafe_id=v_cafe AND plan_id=v_plan) THEN
    RAISE NOTICE 'The brand already holds this package, nothing changed';
    RETURN;
  END IF;
  SELECT name INTO v_name FROM public.platform_plans WHERE id=v_plan AND active AND features ? 'finance' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The MIND package is unavailable'; END IF;
  -- The reviewed starting point: the signup trial alone, with no service switches
  IF (SELECT count(*) FROM public.subscriptions s JOIN public.platform_plans p ON p.id=s.plan_id
        WHERE s.cafe_id=v_cafe AND s.status IN('active','trialing') AND p.active)<>1
     OR NOT EXISTS(SELECT 1 FROM public.subscriptions WHERE cafe_id=v_cafe AND plan_id='-'
        AND status='trialing' AND activation_source='verified_owner_signup')
     OR EXISTS(SELECT 1 FROM public.brand_feature_overrides WHERE cafe_id=v_cafe) THEN
    RAISE EXCEPTION 'The brand packages changed since the review';
  END IF;
  SELECT max(expires_at) INTO v_end FROM public.subscriptions WHERE cafe_id=v_cafe AND status IN('active','trialing');
  IF v_end IS NULL OR v_end<=now() OR v_end<=v_created THEN RAISE EXCEPTION 'The brand has no running end date'; END IF;
  v_days:=round(extract(epoch FROM v_end-v_created)/86400)::integer;
  IF v_days NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'The trial length is out of range'; END IF;

  -- Same row as admin_add_brand_plans: a new package joins the brand's current end date
  INSERT INTO public.subscriptions(cafe_id,plan_id,status,amount_sar,base_amount_sar,discount_amount_sar,plan_name_snapshot,
    duration_unit,duration_count,activation_source,payment_provider,payment_method_label,started_at,expires_at)
  VALUES(v_cafe,v_plan,'trialing',0,0,0,v_name,'day',v_days,'admin_manual_change','admin','تفعيل باقات من الأدمن',v_created,v_end);
  INSERT INTO public.audit_logs(actor_id,cafe_id,action,entity_table,entity_id,new_data)
  VALUES(NULL,v_cafe,'admin_brand_plans_added','cafes',v_cafe,
    jsonb_build_object('plan_ids',ARRAY[v_plan],'shared_expires_at',v_end,'prepared_trial',false,'note',v_note));

  -- Closed for MIND, so closed here too. The brand file in the admin panel can open either one later
  INSERT INTO public.brand_feature_overrides(cafe_id,feature_id,enabled)
  VALUES(v_cafe,'marketing_campaigns',false),(v_cafe,'pager',false);

  IF (SELECT count(*) FROM public.subscriptions s JOIN public.platform_plans p ON p.id=s.plan_id
        WHERE s.cafe_id=v_cafe AND s.status IN('active','trialing') AND p.active AND s.expires_at=v_end)<>2 THEN
    RAISE EXCEPTION 'The packages do not share one end date';
  END IF;
END $$;

COMMIT;
