-- Branda Platform — RLS hardening, platform_settings, domain_orders
-- Version: 003
-- Run after 002_branda_storage_policies.sql

-- ─── Profile role escalation guard ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.is_platform_admin() THEN
      NEW.role := OLD.role;
    END IF;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT public.is_platform_admin() THEN
    NEW.status := OLD.status;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_profile_role_escalation() FROM PUBLIC;

DROP TRIGGER IF EXISTS profiles_prevent_role_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_role_escalation();

CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    (id = auth.uid() AND role = 'customer' AND status = 'active')
    OR public.is_platform_admin()
  );

-- ─── Bootstrap new auth users as customer only ────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'customer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

-- ─── cafe_members policies (missing in 001) ───────────────────────────────────
CREATE POLICY cafe_members_select ON cafe_members FOR SELECT USING (
  user_id = auth.uid()
  OR has_cafe_access(cafe_id)
  OR is_platform_admin()
);
CREATE POLICY cafe_members_insert ON cafe_members FOR INSERT WITH CHECK (
  is_cafe_owner(cafe_id) OR is_platform_admin()
);
CREATE POLICY cafe_members_update ON cafe_members FOR UPDATE USING (
  is_cafe_owner(cafe_id) OR is_platform_admin()
);
CREATE POLICY cafe_members_delete ON cafe_members FOR DELETE USING (
  is_cafe_owner(cafe_id) OR is_platform_admin()
);

-- ─── loyalty rewards ─────────────────────────────────────────────────────────
CREATE POLICY loyalty_rewards_read ON loyalty_rewards FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM cafes c
    WHERE c.id = cafe_id
      AND c.is_public = true
      AND c.status = 'active'
      AND c.deleted_at IS NULL
  )
  OR has_cafe_permission(cafe_id, 'loyalty')
  OR is_cafe_owner(cafe_id)
  OR is_platform_admin()
);
CREATE POLICY loyalty_rewards_write ON loyalty_rewards FOR ALL USING (
  has_cafe_permission(cafe_id, 'loyalty') OR is_cafe_owner(cafe_id) OR is_platform_admin()
);

CREATE POLICY loyalty_transactions_read ON loyalty_transactions FOR SELECT USING (
  customer_id = get_customer_profile_id(cafe_id)
  OR has_cafe_permission(cafe_id, 'loyalty')
  OR is_cafe_owner(cafe_id)
  OR is_platform_admin()
);

-- ─── marketing_campaigns ─────────────────────────────────────────────────────
CREATE POLICY marketing_campaigns_read ON marketing_campaigns FOR SELECT USING (
  (status = 'active' AND deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM cafes c
    WHERE c.id = cafe_id
      AND c.is_public = true
      AND c.status = 'active'
      AND c.deleted_at IS NULL
  ))
  OR is_cafe_owner(cafe_id)
  OR has_cafe_permission(cafe_id, 'marketing')
  OR is_platform_admin()
);
CREATE POLICY marketing_campaigns_write ON marketing_campaigns FOR ALL USING (
  has_cafe_permission(cafe_id, 'marketing') OR is_cafe_owner(cafe_id) OR is_platform_admin()
);

-- ─── reservation_responses (read follows reservation access; write via RPC only) ─
CREATE POLICY reservation_responses_select ON reservation_responses FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM reservations r
    WHERE r.id = reservation_id
      AND (
        r.customer_id = get_customer_profile_id(r.cafe_id)
        OR is_cafe_owner(r.cafe_id)
        OR has_cafe_permission(r.cafe_id, 'reservations')
        OR is_platform_admin()
      )
  )
);

-- ─── Restrict security function execute ──────────────────────────────────────
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_cafe_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_cafe_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_cafe_permission(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_customer_profile_id(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_cafe_owner(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.has_cafe_access(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.has_cafe_permission(uuid, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_profile_id(uuid) TO authenticated, service_role;

-- ─── platform_settings (admin-only; public fields via RPC in 004) ────────────
CREATE TABLE IF NOT EXISTS platform_settings (
  id                          TEXT PRIMARY KEY DEFAULT 'default',
  allow_cafe_signup           BOOLEAN NOT NULL DEFAULT true,
  require_cafe_approval       BOOLEAN NOT NULL DEFAULT true,
  platform_commission_percent   NUMERIC(5,2) NOT NULL DEFAULT 3 CHECK (platform_commission_percent >= 0),
  support_email               CITEXT NOT NULL DEFAULT 'support@branda.com',
  default_plan_id             TEXT NOT NULL DEFAULT 'starter' REFERENCES platform_plans(id),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER platform_settings_updated_at
  BEFORE UPDATE ON platform_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO platform_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_settings_admin ON platform_settings FOR ALL USING (is_platform_admin());

-- ─── domain_orders (SELECT owner/admin; create/cancel via RPC in 004) ────────
DO $$ BEGIN
  CREATE TYPE domain_order_status AS ENUM (
    'pending_review', 'processing', 'completed', 'failed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS domain_orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id             UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  requested_by        UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  domain              CITEXT NOT NULL,
  tld                 TEXT NOT NULL,
  years               INT NOT NULL DEFAULT 1 CHECK (years > 0),
  auto_renew          BOOLEAN NOT NULL DEFAULT false,
  price_estimate      NUMERIC(10,2),
  currency            TEXT NOT NULL DEFAULT 'SAR',
  status              domain_order_status NOT NULL DEFAULT 'pending_review',
  provider            TEXT,
  provider_order_id   TEXT,
  error_message       TEXT,
  reviewed_by         UUID REFERENCES profiles(id),
  reviewed_at         TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_domain_orders_cafe ON domain_orders(cafe_id, created_at DESC);
CREATE TRIGGER domain_orders_updated_at
  BEFORE UPDATE ON domain_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE domain_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY domain_orders_select ON domain_orders FOR SELECT USING (
  is_cafe_owner(cafe_id) OR is_platform_admin()
);
CREATE POLICY domain_orders_admin_update ON domain_orders FOR UPDATE USING (is_platform_admin());
