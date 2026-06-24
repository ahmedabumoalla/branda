-- Barndaksa: harden events/conferences tables after rollout.
-- Additive only: enables RLS and defines scoped policies without exposing public reads.

GRANT SELECT ON public.category_default_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.category_default_plans TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_ticket_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_ticket_settings TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.event_tickets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_tickets TO service_role;

ALTER TABLE public.category_default_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_ticket_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS category_default_plans_service_role_all ON public.category_default_plans;
CREATE POLICY category_default_plans_service_role_all
  ON public.category_default_plans
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS category_default_plans_platform_admin_all ON public.category_default_plans;
CREATE POLICY category_default_plans_platform_admin_all
  ON public.category_default_plans
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS category_default_plans_authenticated_read ON public.category_default_plans;
CREATE POLICY category_default_plans_authenticated_read
  ON public.category_default_plans
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS event_ticket_settings_service_role_all ON public.event_ticket_settings;
CREATE POLICY event_ticket_settings_service_role_all
  ON public.event_ticket_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS event_ticket_settings_platform_admin_all ON public.event_ticket_settings;
CREATE POLICY event_ticket_settings_platform_admin_all
  ON public.event_ticket_settings
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS event_ticket_settings_staff_read ON public.event_ticket_settings;
CREATE POLICY event_ticket_settings_staff_read
  ON public.event_ticket_settings
  FOR SELECT
  TO authenticated
  USING (
    public.is_cafe_owner(cafe_id)
    OR public.has_cafe_permission(cafe_id, 'menu')
    OR public.has_cafe_permission(cafe_id, 'settings')
    OR public.has_cafe_permission(cafe_id, 'orders')
  );

DROP POLICY IF EXISTS event_ticket_settings_staff_write ON public.event_ticket_settings;
CREATE POLICY event_ticket_settings_staff_write
  ON public.event_ticket_settings
  FOR ALL
  TO authenticated
  USING (
    public.is_cafe_owner(cafe_id)
    OR public.has_cafe_permission(cafe_id, 'menu')
    OR public.has_cafe_permission(cafe_id, 'settings')
    OR public.has_cafe_permission(cafe_id, 'orders')
  )
  WITH CHECK (
    public.is_cafe_owner(cafe_id)
    OR public.has_cafe_permission(cafe_id, 'menu')
    OR public.has_cafe_permission(cafe_id, 'settings')
    OR public.has_cafe_permission(cafe_id, 'orders')
  );

DROP POLICY IF EXISTS event_tickets_service_role_all ON public.event_tickets;
CREATE POLICY event_tickets_service_role_all
  ON public.event_tickets
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS event_tickets_platform_admin_all ON public.event_tickets;
CREATE POLICY event_tickets_platform_admin_all
  ON public.event_tickets
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS event_tickets_staff_read ON public.event_tickets;
CREATE POLICY event_tickets_staff_read
  ON public.event_tickets
  FOR SELECT
  TO authenticated
  USING (
    public.is_cafe_owner(cafe_id)
    OR public.has_cafe_permission(cafe_id, 'orders')
    OR public.has_cafe_permission(cafe_id, 'reports')
    OR public.has_cafe_permission(cafe_id, 'cashier')
  );

DROP POLICY IF EXISTS event_tickets_customer_read_own ON public.event_tickets;

DROP POLICY IF EXISTS event_tickets_customer_create_own ON public.event_tickets;

DROP POLICY IF EXISTS event_tickets_staff_update ON public.event_tickets;
CREATE POLICY event_tickets_staff_update
  ON public.event_tickets
  FOR UPDATE
  TO authenticated
  USING (
    public.is_cafe_owner(cafe_id)
    OR public.has_cafe_permission(cafe_id, 'orders')
    OR public.has_cafe_permission(cafe_id, 'cashier')
  )
  WITH CHECK (
    public.is_cafe_owner(cafe_id)
    OR public.has_cafe_permission(cafe_id, 'orders')
    OR public.has_cafe_permission(cafe_id, 'cashier')
  );
