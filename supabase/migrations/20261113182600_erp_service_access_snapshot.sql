BEGIN;

-- One fresh service-role read replaces three sequential entitlement reads.
-- The existing TypeScript subscription/override rules remain authoritative.
CREATE FUNCTION public.brand_service_access_snapshot(p_cafe_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id)
    OR public.brand_account_not_cancelled(p_cafe_id) IS DISTINCT FROM true THEN
  RETURN jsonb_build_object('allowed',false,'subscriptions','[]'::jsonb,'overrides','[]'::jsonb);
 END IF;
 RETURN jsonb_build_object('allowed',true,
  'subscriptions',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'plan_id',s.plan_id,'status',s.status,'started_at',s.started_at,'expires_at',s.expires_at,
   'platform_plans',CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('name',p.name,'features',p.features,'active',p.active) END
  ) ORDER BY s.created_at DESC) FROM public.subscriptions s LEFT JOIN public.platform_plans p ON p.id=s.plan_id
   WHERE s.cafe_id=p_cafe_id AND s.status IN('active','trialing')),'[]'::jsonb),
  'overrides',coalesce((SELECT jsonb_agg(jsonb_build_object('feature_id',o.feature_id,'enabled',o.enabled))
   FROM public.brand_feature_overrides o WHERE o.cafe_id=p_cafe_id),'[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.brand_service_access_snapshot(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.brand_service_access_snapshot(uuid) TO service_role;

COMMIT;
