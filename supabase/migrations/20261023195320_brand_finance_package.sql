BEGIN;

-- Finance is a separate package. Existing `all` plans retain their current services
-- and must not silently acquire access to the brand's accounting ledger.
CREATE OR REPLACE FUNCTION platform_access_private.service_enabled(p_cafe_id uuid, p_feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p_feature IN ('menu','offers','loyalty','settings','pager','finance') AND EXISTS (
  SELECT 1 FROM public.subscriptions s JOIN public.platform_plans p ON p.id=s.plan_id
  WHERE s.cafe_id=p_cafe_id AND s.status IN ('active','trialing') AND p.active
    AND (s.started_at IS NULL OR s.started_at<=now()) AND (s.expires_at IS NULL OR s.expires_at>now())
    AND (p.features ? p_feature OR (p_feature<>'finance' AND p.features ? 'all'))
 ) AND NOT EXISTS(SELECT 1 FROM public.brand_feature_overrides o
    WHERE o.cafe_id=p_cafe_id AND o.feature_id=p_feature AND NOT o.enabled);
$$;
REVOKE ALL ON FUNCTION platform_access_private.service_enabled(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_access_private.service_enabled(uuid,text) TO anon,authenticated,service_role;

-- Pricing is intentionally unconfigured. Only the admin sees the inactive plan;
-- all public plan and checkout paths already require active=true.
INSERT INTO public.platform_plans (
 id,name,description,price_sar,features,sort_order,active,is_default,
 duration_unit,duration_count,category_id,trial_days,free_after_trial,is_upgrade_bundle
) VALUES (
 'finance','برندة المالية','إدارة المبيعات ونقطة البيع والمشتريات والموردين والعملاء والمخزون والخزينة والورديات والحسابات',
 0,'["finance","settings"]'::jsonb,95,false,false,'month',1,'cafes_coffee',0,false,false
) ON CONFLICT (id) DO NOTHING;

-- Prevent accidental publication of an unpriced paid package through direct RPC.
ALTER TABLE public.platform_plans ADD CONSTRAINT finance_plan_requires_price
 CHECK (id <> 'finance' OR NOT active OR price_sar > 0);

NOTIFY pgrst,'reload schema';
COMMIT;
