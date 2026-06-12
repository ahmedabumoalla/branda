-- Branda Platform — Admin dashboard audit tracking
-- Version: 005
-- Run after 004_branda_critical_security_fixes.sql

BEGIN;

CREATE INDEX IF NOT EXISTS idx_subscriptions_started_status
  ON public.subscriptions(started_at DESC, status);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON public.audit_logs(created_at DESC);

GRANT SELECT ON TABLE
  public.cafes,
  public.menu_products,
  public.customer_profiles,
  public.experience_submissions,
  public.audit_logs,
  public.profiles
TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.subscriptions TO authenticated;
GRANT UPDATE ON TABLE public.cafes TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.platform_plans TO authenticated;
GRANT UPDATE ON TABLE public.platform_settings TO authenticated;

DROP POLICY IF EXISTS subscriptions_admin_manage ON public.subscriptions;

CREATE POLICY subscriptions_admin_manage ON public.subscriptions
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.capture_platform_admin_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row jsonb;
  v_cafe_id uuid;
  v_entity_id uuid;
  v_id_value text;
  v_cafe_value text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_row := to_jsonb(OLD);
  ELSE
    v_row := to_jsonb(NEW);
  END IF;

  v_id_value := v_row ->> 'id';
  v_cafe_value := v_row ->> 'cafe_id';

  IF TG_TABLE_NAME = 'cafes'
     AND v_id_value IS NOT NULL
     AND v_id_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_cafe_id := v_id_value::uuid;
  ELSIF v_cafe_value IS NOT NULL
     AND v_cafe_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_cafe_id := v_cafe_value::uuid;
  ELSE
    v_cafe_id := NULL;
  END IF;

  IF v_id_value IS NOT NULL
     AND v_id_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_entity_id := v_id_value::uuid;
  ELSE
    v_entity_id := NULL;
  END IF;

  INSERT INTO public.audit_logs (
    actor_id,
    cafe_id,
    action,
    entity_table,
    entity_id,
    old_data,
    new_data
  )
  VALUES (
    auth.uid(),
    v_cafe_id,
    'admin_' || lower(TG_OP) || '_' || TG_TABLE_NAME,
    TG_TABLE_NAME,
    v_entity_id,
    CASE
      WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD)
      ELSE NULL
    END,
    CASE
      WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW)
      ELSE NULL
    END
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_platform_admin_audit() FROM PUBLIC;

DROP TRIGGER IF EXISTS admin_audit_cafes ON public.cafes;
CREATE TRIGGER admin_audit_cafes
  AFTER INSERT OR UPDATE OR DELETE ON public.cafes
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_platform_admin_audit();

DROP TRIGGER IF EXISTS admin_audit_platform_plans ON public.platform_plans;
CREATE TRIGGER admin_audit_platform_plans
  AFTER INSERT OR UPDATE OR DELETE ON public.platform_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_platform_admin_audit();

DROP TRIGGER IF EXISTS admin_audit_platform_settings ON public.platform_settings;
CREATE TRIGGER admin_audit_platform_settings
  AFTER INSERT OR UPDATE OR DELETE ON public.platform_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_platform_admin_audit();

DROP TRIGGER IF EXISTS admin_audit_subscriptions ON public.subscriptions;
CREATE TRIGGER admin_audit_subscriptions
  AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_platform_admin_audit();

DROP TRIGGER IF EXISTS admin_audit_offers ON public.offers;
CREATE TRIGGER admin_audit_offers
  AFTER INSERT OR UPDATE OR DELETE ON public.offers
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_platform_admin_audit();

DROP TRIGGER IF EXISTS admin_audit_menu_products ON public.menu_products;
CREATE TRIGGER admin_audit_menu_products
  AFTER INSERT OR UPDATE OR DELETE ON public.menu_products
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_platform_admin_audit();

DROP TRIGGER IF EXISTS admin_audit_menu_categories ON public.menu_categories;
CREATE TRIGGER admin_audit_menu_categories
  AFTER INSERT OR UPDATE OR DELETE ON public.menu_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_platform_admin_audit();

DROP TRIGGER IF EXISTS admin_audit_marketing_campaigns ON public.marketing_campaigns;
CREATE TRIGGER admin_audit_marketing_campaigns
  AFTER INSERT OR UPDATE OR DELETE ON public.marketing_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_platform_admin_audit();

DROP TRIGGER IF EXISTS admin_audit_experience_campaigns ON public.experience_campaigns;
CREATE TRIGGER admin_audit_experience_campaigns
  AFTER INSERT OR UPDATE OR DELETE ON public.experience_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_platform_admin_audit();

DROP TRIGGER IF EXISTS admin_audit_domain_orders ON public.domain_orders;
CREATE TRIGGER admin_audit_domain_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.domain_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_platform_admin_audit();

DROP TRIGGER IF EXISTS admin_audit_loyalty_rules ON public.loyalty_rules;
CREATE TRIGGER admin_audit_loyalty_rules
  AFTER INSERT OR UPDATE OR DELETE ON public.loyalty_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_platform_admin_audit();

DROP TRIGGER IF EXISTS admin_audit_loyalty_rewards ON public.loyalty_rewards;
CREATE TRIGGER admin_audit_loyalty_rewards
  AFTER INSERT OR UPDATE OR DELETE ON public.loyalty_rewards
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_platform_admin_audit();

DROP TRIGGER IF EXISTS admin_audit_branches ON public.branches;
CREATE TRIGGER admin_audit_branches
  AFTER INSERT OR UPDATE OR DELETE ON public.branches
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_platform_admin_audit();

COMMIT;

SELECT
  trigger_name,
  event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name LIKE 'admin_audit_%'
ORDER BY event_object_table;