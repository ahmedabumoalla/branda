-- Independent menu-branch entitlement, keeping all other services unchanged
-- Rollback by forward migration restoring these two functions; no data removal
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF md5(replace(pg_get_functiondef('platform_access_private.service_enabled(uuid,text)'::regprocedure),E'\r\n',E'\n'))<>'5c40dc32a156dd6999324e3803d06c5a'
 OR md5(replace(pg_get_functiondef('public.manage_menu_branch(uuid,text,jsonb)'::regprocedure),E'\r\n',E'\n'))<>'e33f9cd59d5f42ed99ae6a2779f95c87' THEN RAISE EXCEPTION 'Branch prerequisites changed'; END IF;
END $$;
CREATE OR REPLACE FUNCTION platform_access_private.service_enabled(p_cafe_id uuid,p_feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT NOT brand_cancellation_private.cancelled(p_cafe_id) AND CASE WHEN p_feature='branches' THEN
  brand_cancellation_private.service_enabled_previous(p_cafe_id,'menu')
  AND EXISTS(SELECT 1 FROM public.subscriptions s JOIN public.platform_plans p ON p.id=s.plan_id
   WHERE s.cafe_id=p_cafe_id AND s.status IN('active','trialing') AND p.active
    AND (s.started_at IS NULL OR s.started_at<=now()) AND (s.expires_at IS NULL OR s.expires_at>now())
    AND (p.features ? 'branches' OR p.features ? 'all'))
  AND NOT EXISTS(SELECT 1 FROM public.brand_feature_overrides o WHERE o.cafe_id=p_cafe_id AND o.feature_id='branches' AND NOT o.enabled)
 ELSE brand_cancellation_private.service_enabled_previous(p_cafe_id,p_feature) END;
$$;
DO $patch$ DECLARE source text; BEGIN
 source:=pg_get_functiondef('public.manage_menu_branch(uuid,text,jsonb)'::regprocedure);
 EXECUTE replace(source,$old$OR NOT platform_access_private.service_enabled(p_cafe,'menu')$old$,$new$OR NOT platform_access_private.service_enabled(p_cafe,'menu')
  OR NOT platform_access_private.service_enabled(p_cafe,'branches')$new$);
END $patch$;
COMMIT;
