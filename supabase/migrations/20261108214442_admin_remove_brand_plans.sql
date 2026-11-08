-- Add a guarded removal operation; deployment does not change any subscription.
-- Rollback is a forward migration revoking/dropping only this new RPC.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$ BEGIN
 IF md5(pg_get_functiondef('subscription_terms_private.require_admin()'::regprocedure))<>'80b8bae5e823e361886c0e750c527d13'
 OR md5(pg_get_functiondef('subscription_terms_private.state(uuid)'::regprocedure))<>'8fe176a7156aae38e57df748213753df'
 OR md5(pg_get_functiondef('subscription_terms_private.synchronize()'::regprocedure))<>'62b73be313f2030c8d73c988e8153f2f'
 OR md5(pg_get_functiondef('public.admin_finish_brand_welcome(uuid,uuid,uuid,text,timestamptz)'::regprocedure))<>'071383b4c883de7c4677be8b803dabb4'
 THEN RAISE EXCEPTION 'Subscription prerequisites changed; review removal migration';END IF;
END $guard$;

CREATE FUNCTION public.admin_remove_brand_plans(p_cafe_id uuid,p_plan_ids text[],p_expected_revision text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_before jsonb;v_after jsonb;v_ids uuid[];v_plan_ids text[];v_old_rows jsonb;v_now timestamptz;
BEGIN
 PERFORM subscription_terms_private.require_admin();
 IF p_plan_ids IS NULL OR cardinality(p_plan_ids) NOT BETWEEN 1 AND 50
  OR array_ndims(p_plan_ids) IS DISTINCT FROM 1 OR array_position(p_plan_ids,NULL) IS NOT NULL
  OR EXISTS(SELECT 1 FROM unnest(p_plan_ids)x WHERE length(x) NOT BETWEEN 1 AND 100 OR x<>btrim(x))
  OR (SELECT count(DISTINCT x) FROM unnest(p_plan_ids)x)<>cardinality(p_plan_ids)
 THEN RAISE EXCEPTION 'brand_subscription_invalid_plan';END IF;
 IF p_expected_revision IS NULL OR p_expected_revision !~ '^[a-f0-9]{32}$' THEN
  RAISE EXCEPTION 'brand_subscription_conflict';END IF;
 -- Match add/deadline lock order: brand, ordered subscriptions, ordered plans.
 PERFORM 1 FROM public.cafes WHERE id=p_cafe_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'brand_subscription_unavailable';END IF;
 PERFORM 1 FROM public.subscriptions WHERE cafe_id=p_cafe_id ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.platform_plans WHERE id=ANY(p_plan_ids)
  OR id IN(SELECT plan_id FROM public.subscriptions WHERE cafe_id=p_cafe_id) ORDER BY id FOR SHARE;
 IF EXISTS(SELECT 1 FROM unnest(p_plan_ids)x WHERE NOT EXISTS(SELECT 1 FROM public.platform_plans WHERE id=x)) THEN
  RAISE EXCEPTION 'brand_subscription_invalid_plan';END IF;
 v_before:=subscription_terms_private.state(p_cafe_id);
 SELECT array_agg(s.id ORDER BY s.id),array_agg(DISTINCT s.plan_id ORDER BY s.plan_id),
  jsonb_agg(jsonb_build_object('id',s.id,'plan_id',s.plan_id,'status',s.status,'cancelled_at',s.cancelled_at) ORDER BY s.id)
 INTO v_ids,v_plan_ids,v_old_rows FROM public.subscriptions s
 WHERE s.cafe_id=p_cafe_id AND s.plan_id=ANY(p_plan_ids) AND s.status IN('active','trialing');
 -- A retry with nothing left to remove is a no-op. A new assignment is not:
 -- the revision must still match before any current row can be cancelled.
 IF coalesce(cardinality(v_ids),0)=0 THEN RETURN v_before;END IF;
 IF p_expected_revision IS DISTINCT FROM v_before->>'revision' THEN
  RAISE EXCEPTION 'brand_subscription_conflict';END IF;
 v_now:=clock_timestamp();
 UPDATE public.subscriptions SET status='cancelled',cancelled_at=v_now,updated_at=v_now
 WHERE cafe_id=p_cafe_id AND id=ANY(v_ids) AND status IN('active','trialing');
 v_after:=subscription_terms_private.state(p_cafe_id);
 INSERT INTO public.audit_logs(actor_id,cafe_id,action,entity_table,entity_id,old_data,new_data)
 VALUES(auth.uid(),p_cafe_id,'admin_brand_plans_removed','cafes',p_cafe_id,
  jsonb_build_object('revision',v_before->>'revision','subscriptions',v_old_rows),
  jsonb_build_object('revision',v_after->>'revision','plan_ids',v_plan_ids,'subscription_ids',v_ids,'status','cancelled','cancelled_at',v_now));
 RETURN v_after;
END $$;
REVOKE ALL ON FUNCTION public.admin_remove_brand_plans(uuid,text[],text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.admin_remove_brand_plans(uuid,text[],text) TO authenticated;
COMMIT;
