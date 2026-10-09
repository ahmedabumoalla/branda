BEGIN;

CREATE SCHEMA IF NOT EXISTS platform_access_private;
REVOKE ALL ON SCHEMA platform_access_private FROM PUBLIC;
GRANT USAGE ON SCHEMA platform_access_private TO anon, authenticated, service_role;

-- Private to the database policies; it is not a Data API RPC. Positive brand
-- overrides never grant a service absent from the assigned, current package.
CREATE FUNCTION platform_access_private.service_enabled(p_cafe_id uuid, p_feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p_feature IN ('menu','offers','loyalty','settings')
    AND EXISTS (
      SELECT 1 FROM (
        SELECT p.features, p.active, s.started_at, s.expires_at
        FROM public.subscriptions s JOIN public.platform_plans p ON p.id=s.plan_id
        WHERE s.cafe_id=p_cafe_id AND s.status IN ('active','trialing')
        ORDER BY s.created_at DESC LIMIT 1
      ) plan
      WHERE plan.active AND (plan.started_at IS NULL OR plan.started_at<=now()) AND (plan.expires_at IS NULL OR plan.expires_at>now())
        AND (plan.features ? p_feature OR plan.features ? 'all')
    )
    AND NOT EXISTS (SELECT 1 FROM public.brand_feature_overrides o
      WHERE o.cafe_id=p_cafe_id AND o.feature_id=p_feature AND NOT o.enabled);
$$;
REVOKE ALL ON FUNCTION platform_access_private.service_enabled(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_access_private.service_enabled(uuid,text) TO anon,authenticated,service_role;

-- Preserve underlying records, ownership rules and admin maintenance. Restrictive
-- policies combine with, rather than replace, existing tenant authorization.
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('menu_products','menu'),('menu_categories','menu'),('offers','offers'),
    ('cafe_settings','settings'),('cafe_loyalty_programs','loyalty'),
    ('cafe_loyalty_experience','loyalty'),('loyalty_cards','loyalty'),
    ('loyalty_card_events','loyalty'),('cafe_cashiers','loyalty'),
    ('customer_reward_instances','loyalty'),('customer_reward_redemptions','loyalty'),('customer_profiles','loyalty'),
    ('loyalty_accounts','loyalty'),('loyalty_transactions','loyalty'),('loyalty_rules','loyalty'),('loyalty_rewards','loyalty')
  ) AS mapping(table_name, feature) LOOP
    IF to_regclass('public.'||item.table_name) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',item.table_name);
    EXECUTE format('CREATE POLICY package_service_access ON public.%I AS RESTRICTIVE FOR ALL TO anon,authenticated USING (public.is_platform_admin() OR platform_access_private.service_enabled(cafe_id,%L)) WITH CHECK (public.is_platform_admin() OR platform_access_private.service_enabled(cafe_id,%L))',item.table_name,item.feature,item.feature);
  END LOOP;
END $$;

-- RLS does not protect SECURITY DEFINER writes. These checks also protect RPC
-- issuance/stamps/settings invoked directly, before they mutate the service.
CREATE FUNCTION platform_access_private.guard_service_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.is_platform_admin() AND NOT platform_access_private.service_enabled(NEW.cafe_id,TG_ARGV[0])
    THEN RAISE EXCEPTION 'Service unavailable for current subscription' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND OLD.cafe_id IS DISTINCT FROM NEW.cafe_id AND NOT public.is_platform_admin()
    THEN RAISE EXCEPTION 'Service tenant cannot change' USING ERRCODE='42501'; END IF;
  IF NOT public.is_platform_admin() AND TG_TABLE_NAME='customer_reward_instances' THEN
    IF NEW.source_type<>'loyalty' THEN RAISE EXCEPTION 'Experience rewards are archived' USING ERRCODE='42501'; END IF;
  END IF;
  IF NOT public.is_platform_admin() AND TG_TABLE_NAME='customer_reward_redemptions' THEN
    IF NOT EXISTS(SELECT 1 FROM public.customer_reward_instances r WHERE r.id=NEW.reward_instance_id
      AND r.cafe_id=NEW.cafe_id AND r.source_type='loyalty')
      THEN RAISE EXCEPTION 'Reward service unavailable' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_access_private.guard_service_write() FROM PUBLIC,anon,authenticated,service_role;
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('menu_products','menu'),('menu_categories','menu'),('offers','offers'),
    ('cafe_loyalty_programs','loyalty'),
    ('cafe_loyalty_experience','loyalty'),('loyalty_cards','loyalty'),
    ('loyalty_card_events','loyalty'),('cafe_cashiers','loyalty'),
    ('customer_reward_instances','loyalty'),('customer_reward_redemptions','loyalty'),('customer_profiles','loyalty'),
    ('loyalty_accounts','loyalty'),('loyalty_transactions','loyalty'),('loyalty_rules','loyalty'),('loyalty_rewards','loyalty')
  ) AS mapping(table_name, feature) LOOP
    IF to_regclass('public.'||item.table_name) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('CREATE TRIGGER package_service_write BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION platform_access_private.guard_service_write(%L)',item.table_name,item.feature);
  END LOOP;
END $$;

-- Onboarding creates cafe_settings before assigning a subscription; preserve that
-- trusted insert while rejecting later mutation of an unavailable settings service.
CREATE TRIGGER package_settings_write BEFORE UPDATE ON public.cafe_settings
  FOR EACH ROW EXECUTE FUNCTION platform_access_private.guard_service_write('settings');

-- Archived storefront tables have no customer/owner Data API path. Admin reports
-- can still inspect history. Reactivation requires an explicit reviewed migration.
CREATE TABLE platform_access_private.archived_rpc_grants(signature text NOT NULL,grantee text NOT NULL,is_grantable boolean NOT NULL,PRIMARY KEY(signature,grantee));
ALTER TABLE platform_access_private.archived_rpc_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_access_private.archived_rpc_grants FROM PUBLIC,anon,authenticated,service_role;
DO $$
DECLARE table_name text; fn record;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['orders','order_items','branches','reservations','reservation_services','cafe_visit_events','cafe_visits','cafe_custom_identity',
    'reward_programs','reward_cards','reward_purchase_events','reward_redemptions','experience_reward_submissions','experience_reward_items'] LOOP
    IF to_regclass('public.'||table_name) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY archived_storefront_access ON public.%I AS RESTRICTIVE FOR ALL TO anon,authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin())',table_name);
  END LOOP;
  FOR fn IN SELECT p.oid::regprocedure AS signature,p.proacl,p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=ANY(ARRAY[
      'create_pickup_order','respond_to_pickup_order','create_customer_reservation','create_customer_reservation_v2',
      'respond_to_reservation','cashier_accept_order','cashier_accept_reservation','get_cashier_console','track_cafe_visit','confirm_reservation_code',
      'upsert_reservation_service','upsert_reservation_service_v2','upsert_reservation_service_v3',
      'get_public_brands_and_branches','get_my_reward_wallet','record_reward_purchase','redeem_reward','redeem_experience_reward','set_reward_program',
      'get_owner_dashboard_shell_fast','get_public_cafe_catalog_fast','get_public_cafe_menu_fast'
    ]) LOOP
    INSERT INTO platform_access_private.archived_rpc_grants(signature,grantee,is_grantable)
      SELECT fn.signature::text,CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee)::text END,acl.is_grantable
      FROM aclexplode(coalesce(fn.proacl,acldefault('f',fn.proowner))) acl
      WHERE acl.privilege_type='EXECUTE' AND (acl.grantee=0 OR pg_get_userbyid(acl.grantee) IN ('anon','authenticated'));
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC,anon,authenticated',fn.signature);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_cafe_public_settings(p_cafe_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('cafe_id',cs.cafe_id,'description',cs.description,'logo_url',cs.logo_url,
    'logo_storage_path',cs.logo_storage_path,'instagram',cs.instagram,'whatsapp',cs.whatsapp,'theme_id',cs.theme_id)
  FROM public.cafe_settings cs JOIN public.cafes c ON c.id=cs.cafe_id
  WHERE cs.cafe_id=p_cafe_id AND c.is_public AND c.status='active' AND c.deleted_at IS NULL
    AND (platform_access_private.service_enabled(c.id,'menu') OR platform_access_private.service_enabled(c.id,'loyalty')
      OR platform_access_private.service_enabled(c.id,'offers'));
$$;
REVOKE ALL ON FUNCTION public.get_cafe_public_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cafe_public_settings(uuid) TO anon,authenticated,service_role;

-- Storage uses its own policy layer. Do not rely on public table RLS for assets.
CREATE FUNCTION platform_access_private.asset_enabled(p_bucket text,p_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE cafe_id uuid; feature text;
BEGIN
  IF public.is_platform_admin() THEN RETURN true; END IF;
  IF split_part(p_name,'/',1) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false; END IF;
  cafe_id:=split_part(p_name,'/',1)::uuid;
  feature:=CASE p_bucket WHEN 'menu-products' THEN 'menu' WHEN 'menu-categories' THEN 'menu'
    WHEN 'offer-banners' THEN 'offers' WHEN 'cafe-logos' THEN 'settings' ELSE NULL END;
  RETURN feature IS NOT NULL AND platform_access_private.service_enabled(cafe_id,feature);
END $$;
REVOKE ALL ON FUNCTION platform_access_private.asset_enabled(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_access_private.asset_enabled(text,text) TO anon,authenticated,service_role;
DO $$ BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    CREATE POLICY package_asset_access ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated
      USING (bucket_id NOT IN ('menu-products','menu-categories','offer-banners','cafe-logos','cafe-backgrounds','marketing-assets','experience-submissions')
        OR platform_access_private.asset_enabled(bucket_id,name))
      WITH CHECK (bucket_id NOT IN ('menu-products','menu-categories','offer-banners','cafe-logos','cafe-backgrounds','marketing-assets','experience-submissions')
        OR platform_access_private.asset_enabled(bucket_id,name));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.record_brand_engagement(p_slug text,p_kind text,p_event_id uuid,p_visitor_key text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_cafe_id uuid;
BEGIN
  IF p_event_id IS NULL OR p_visitor_key IS NULL OR p_visitor_key !~ '^[a-f0-9]{64}$'
    OR p_slug IS NULL OR char_length(p_slug)>100 OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    OR p_kind IS NULL OR p_kind NOT IN ('menu_view','menu_loyalty_click','loyalty_menu_visit','loyalty_qr_visit','loyalty_direct_visit')
    THEN RAISE EXCEPTION 'Invalid engagement input' USING ERRCODE='22023'; END IF;
  SELECT c.id INTO v_cafe_id FROM public.cafes c WHERE c.slug=p_slug AND c.deleted_at IS NULL;
  IF v_cafe_id IS NULL THEN RETURN false; END IF;
  IF p_kind IN ('menu_view','menu_loyalty_click') AND NOT platform_access_private.service_enabled(v_cafe_id,'menu') THEN RETURN false; END IF;
  IF p_kind<>'menu_view' AND (NOT platform_access_private.service_enabled(v_cafe_id,'loyalty') OR p_slug<>'rast'
    OR NOT EXISTS(SELECT 1 FROM public.cafe_loyalty_programs WHERE cafe_id=v_cafe_id AND enabled)) THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_cafe_id::text||p_visitor_key,0));
  IF EXISTS(SELECT 1 FROM brand_analytics_private.events WHERE cafe_id=v_cafe_id AND visitor_key=p_visitor_key
    AND kind=p_kind AND occurred_at>clock_timestamp()-interval '10 seconds') THEN RETURN false; END IF;
  INSERT INTO brand_analytics_private.events(id,cafe_id,visitor_key,kind)
    VALUES(p_event_id,v_cafe_id,p_visitor_key,p_kind) ON CONFLICT(id) DO NOTHING;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.record_brand_engagement(text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_brand_engagement(text,text,uuid,text) TO service_role;

-- Preserve the deployed audit function's complete body, signature and ACL while
-- adding a subscription boundary ahead of its existing tenant authorization.
DO $guard$
DECLARE signature regprocedure:=to_regprocedure('public.get_owner_loyalty_activity(uuid,timestamp with time zone,timestamp with time zone,uuid,text,text,text,integer,integer)');
  definition text; guarded text;
BEGIN
  IF signature IS NULL THEN RETURN; END IF;
  SELECT pg_get_functiondef(signature) INTO definition;
  guarded:=regexp_replace(definition,'\mBEGIN\M',
    'BEGIN IF NOT public.is_platform_admin() AND NOT platform_access_private.service_enabled(p_cafe_id,''loyalty'') THEN RAISE EXCEPTION ''Loyalty service unavailable'' USING ERRCODE=''42501''; END IF;','i');
  IF guarded=definition THEN RAISE EXCEPTION 'Unexpected owner activity definition'; END IF;
  EXECUTE guarded;
END $guard$;

COMMIT;
