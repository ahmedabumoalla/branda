BEGIN;
SET LOCAL lock_timeout='5s';
-- Brand identity remains available independently of packages. Existing finance
-- settings, cancellation, ownership and Storage policies stay authoritative.
CREATE OR REPLACE FUNCTION platform_access_private.service_enabled(p_cafe_id uuid, p_feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT NOT brand_cancellation_private.cancelled(p_cafe_id) AND CASE
 WHEN p_feature='settings' AND NOT brand_cancellation_private.service_enabled_previous(p_cafe_id,'finance') THEN
  EXISTS(SELECT 1 FROM public.cafes c WHERE c.id=p_cafe_id AND c.deleted_at IS NULL AND c.status IN('active','published'))
 WHEN p_feature='branches' THEN
  brand_cancellation_private.service_enabled_previous(p_cafe_id,'menu')
  AND EXISTS(SELECT 1 FROM public.subscriptions s JOIN public.platform_plans p ON p.id=s.plan_id
   WHERE s.cafe_id=p_cafe_id AND s.status IN('active','trialing') AND p.active
    AND (s.started_at IS NULL OR s.started_at<=now()) AND (s.expires_at IS NULL OR s.expires_at>now())
    AND (p.features ? 'branches' OR p.features ? 'all'))
  AND NOT EXISTS(SELECT 1 FROM public.brand_feature_overrides o WHERE o.cafe_id=p_cafe_id AND o.feature_id='branches' AND NOT o.enabled)
 ELSE brand_cancellation_private.service_enabled_previous(p_cafe_id,p_feature) END;
$$;
NOTIFY pgrst,'reload schema';
COMMIT;
