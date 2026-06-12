-- BARNDAKSA STAGING INITIAL INSTALL
-- TARGET: Fresh empty Supabase Staging project only
-- DO NOT RUN ON PRODUCTION
-- SOURCE: Final reviewed migrations 001 -> 002 -> 003 -> 004
-- DATABASE STATUS BEFORE RUN: Must be empty / no Barndaksa migrations previously applied

-- ============================================================
-- BEGIN MIGRATION 001: barndaksa_production_schema
-- SOURCE FILE: supabase/migrations/001_barndaksa_production_schema.sql
-- ============================================================

-- Barndaksa Platform — Production Schema
-- Apply via Supabase Dashboard → SQL Editor or `supabase db push`
-- Version: 001

-- ─── Extensions ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ─── Enums ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM (
    'customer', 'cafe_owner', 'cafe_manager', 'cafe_staff', 'platform_admin'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cafe_member_role AS ENUM (
    'owner', 'manager', 'staff'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'pending_cafe', 'accepted', 'rejected', 'cancelled_by_customer'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE reservation_status AS ENUM (
    'pending', 'accepted', 'rejected', 'modification_requested'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_audience AS ENUM ('customer', 'cafe');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM (
    'trialing', 'active', 'past_due', 'cancelled', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE experience_submission_status AS ENUM (
    'pending', 'approved', 'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE experience_campaign_status AS ENUM ('draft', 'active', 'ended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Utility: updated_at trigger ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── Profiles (extends auth.users) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL DEFAULT '',
  email         CITEXT,
  phone         TEXT,
  avatar_url    TEXT,
  role          user_role NOT NULL DEFAULT 'customer',
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Platform plans ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_plans (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  price_sar     NUMERIC(10,2) NOT NULL DEFAULT 0,
  features      JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order    INT NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER platform_plans_updated_at
  BEFORE UPDATE ON platform_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Cafes ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cafes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          CITEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  owner_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  is_public     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cafes_slug ON cafes(slug) WHERE deleted_at IS NULL;
CREATE TRIGGER cafes_updated_at
  BEFORE UPDATE ON cafes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Cafe members ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cafe_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id       UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role          cafe_member_role NOT NULL DEFAULT 'staff',
  permissions   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cafe_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cafe_members_user ON cafe_members(user_id);
CREATE TRIGGER cafe_members_updated_at
  BEFORE UPDATE ON cafe_members FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Cafe settings ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cafe_settings (
  cafe_id               UUID PRIMARY KEY REFERENCES cafes(id) ON DELETE CASCADE,
  owner_name            TEXT,
  owner_email           CITEXT,
  owner_phone           TEXT,
  logo_url              TEXT,
  logo_storage_path     TEXT,
  tax_number            TEXT,
  commercial_register   TEXT,
  maroof_certificate    TEXT,
  instagram             TEXT,
  whatsapp              TEXT,
  description           TEXT,
  custom_domain         TEXT,
  domain_status         TEXT DEFAULT 'unlinked',
  purchased_domain      TEXT,
  purchased_domain_status TEXT,
  theme_id              TEXT NOT NULL DEFAULT 'soft-cream-3d',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER cafe_settings_updated_at
  BEFORE UPDATE ON cafe_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Theme catalog (seed) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cafe_themes (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  preview_gradient TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Custom identity ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cafe_custom_identity (
  cafe_id                 UUID PRIMARY KEY REFERENCES cafes(id) ON DELETE CASCADE,
  logo_storage_path       TEXT,
  logo_url                TEXT,
  background_storage_path TEXT,
  background_url          TEXT,
  palette                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  background_scope        TEXT NOT NULL DEFAULT 'home-only',
  background_fit          TEXT NOT NULL DEFAULT 'cover',
  overlay_strength        TEXT NOT NULL DEFAULT 'medium',
  featured_section_mode   TEXT NOT NULL DEFAULT 'latest',
  featured_category_id    UUID,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER cafe_custom_identity_updated_at
  BEFORE UPDATE ON cafe_custom_identity FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Branches ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id       UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  address       TEXT,
  city          TEXT,
  phone         TEXT,
  lat           NUMERIC(10,7),
  lng           NUMERIC(10,7),
  hours         JSONB DEFAULT '{}'::jsonb,
  active        BOOLEAN NOT NULL DEFAULT true,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_branches_cafe ON branches(cafe_id) WHERE deleted_at IS NULL;
CREATE TRIGGER branches_updated_at
  BEFORE UPDATE ON branches FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Menu categories ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id         UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  image_url       TEXT,
  image_storage_path TEXT,
  icon            TEXT,
  sort_order      INT NOT NULL DEFAULT 0,
  visible         BOOLEAN NOT NULL DEFAULT true,
  featured        BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (cafe_id, name)
);

CREATE INDEX IF NOT EXISTS idx_menu_categories_cafe ON menu_categories(cafe_id, sort_order)
  WHERE deleted_at IS NULL;
CREATE TRIGGER menu_categories_updated_at
  BEFORE UPDATE ON menu_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Menu products ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_products (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id                 UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  category_id             UUID REFERENCES menu_categories(id) ON DELETE SET NULL,
  legacy_category         TEXT,
  name                    TEXT NOT NULL,
  description             TEXT NOT NULL DEFAULT '',
  image_url               TEXT,
  image_storage_path      TEXT,
  image_variant           TEXT NOT NULL DEFAULT 'latte',
  price                   NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  calories                INT,
  loyalty_points          INT NOT NULL DEFAULT 0,
  preparation_time_minutes INT,
  redeemable_with_points  BOOLEAN NOT NULL DEFAULT false,
  redemption_points       INT,
  available_for_pickup    BOOLEAN NOT NULL DEFAULT true,
  pickup_lead_minutes    INT,
  ingredients             JSONB NOT NULL DEFAULT '[]'::jsonb,
  available               BOOLEAN NOT NULL DEFAULT true,
  promo                   JSONB,
  sort_order              INT NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at              TIMESTAMPTZ,
  created_by              UUID REFERENCES profiles(id),
  updated_by              UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_menu_products_cafe ON menu_products(cafe_id)
  WHERE deleted_at IS NULL AND available = true;
CREATE INDEX IF NOT EXISTS idx_menu_products_category ON menu_products(category_id);
CREATE TRIGGER menu_products_updated_at
  BEFORE UPDATE ON menu_products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Offers ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id         UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  offer_type      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active',
  placement       TEXT NOT NULL DEFAULT 'both',
  visible_in_cafe BOOLEAN NOT NULL DEFAULT true,
  discount_percent NUMERIC(5,2),
  code            TEXT,
  start_date      DATE,
  end_date        DATE,
  linked_product_id UUID REFERENCES menu_products(id) ON DELETE SET NULL,
  banner_url      TEXT,
  banner_storage_path TEXT,
  cta_text        TEXT,
  promo_payload   JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  is_archived     BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_offers_cafe ON offers(cafe_id) WHERE deleted_at IS NULL;
CREATE TRIGGER offers_updated_at
  BEFORE UPDATE ON offers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Customer profiles (per cafe) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id       UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  full_name     TEXT NOT NULL,
  phone         TEXT NOT NULL,
  email         CITEXT,
  avatar_url    TEXT,
  avatar_storage_path TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cafe_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_customer_profiles_user ON customer_profiles(user_id);
CREATE TRIGGER customer_profiles_updated_at
  BEFORE UPDATE ON customer_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Orders ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id             UUID NOT NULL REFERENCES cafes(id) ON DELETE RESTRICT,
  customer_id         UUID REFERENCES customer_profiles(id) ON DELETE SET NULL,
  customer_name       TEXT NOT NULL,
  customer_phone      TEXT NOT NULL,
  customer_email      CITEXT,
  branch_name         TEXT,
  fulfillment_type    TEXT NOT NULL DEFAULT 'pickup',
  status              order_status NOT NULL DEFAULT 'pending_cafe',
  payment_status      TEXT NOT NULL DEFAULT 'pay_at_pickup',
  pickup_at           TIMESTAMPTZ,
  rejection_reason    TEXT,
  responded_at        TIMESTAMPTZ,
  subtotal            NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_amount          NUMERIC(10,2) NOT NULL DEFAULT 0,
  total               NUMERIC(10,2) NOT NULL DEFAULT 0,
  loyalty_points_earned INT NOT NULL DEFAULT 0,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orders_cafe_status ON orders(cafe_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at DESC);
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES menu_products(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  quantity      INT NOT NULL CHECK (quantity > 0),
  unit_price    NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ─── Reservations ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reservations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id             UUID NOT NULL REFERENCES cafes(id) ON DELETE RESTRICT,
  customer_id         UUID REFERENCES customer_profiles(id) ON DELETE SET NULL,
  customer_name       TEXT NOT NULL,
  phone               TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  guests              INT NOT NULL CHECK (guests > 0),
  reservation_date    DATE NOT NULL,
  reservation_time    TIME NOT NULL,
  duration_minutes    INT,
  branch_name         TEXT,
  space_type          TEXT,
  event_title         TEXT,
  needs_decoration    BOOLEAN DEFAULT false,
  needs_catering      BOOLEAN DEFAULT false,
  budget_estimate     NUMERIC(10,2),
  notes               TEXT,
  status              reservation_status NOT NULL DEFAULT 'pending',
  rejection_reason    TEXT,
  cafe_message        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reservations_cafe ON reservations(cafe_id, status, reservation_date);
CREATE TRIGGER reservations_updated_at
  BEFORE UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS reservation_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id  UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  responder_id    UUID REFERENCES profiles(id),
  status          reservation_status NOT NULL,
  message         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Loyalty ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_rules (
  cafe_id         UUID PRIMARY KEY REFERENCES cafes(id) ON DELETE CASCADE,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  points_per_sar  NUMERIC(10,2) NOT NULL DEFAULT 1,
  welcome_points  INT NOT NULL DEFAULT 0,
  earn_rules      JSONB NOT NULL DEFAULT '[]'::jsonb,
  redemption_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER loyalty_rules_updated_at
  BEFORE UPDATE ON loyalty_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS loyalty_rewards (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id       UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  points        INT NOT NULL CHECK (points > 0),
  description   TEXT,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id       UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  customer_id   UUID NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  balance       INT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cafe_id, customer_id)
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id       UUID NOT NULL REFERENCES cafes(id) ON DELETE RESTRICT,
  customer_id   UUID NOT NULL REFERENCES customer_profiles(id) ON DELETE RESTRICT,
  amount        INT NOT NULL,
  reason        TEXT NOT NULL,
  reference_type TEXT,
  reference_id  UUID,
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_tx_customer ON loyalty_transactions(customer_id, created_at DESC);

-- ─── Marketing & experience ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id       UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  channel       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft',
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  image_url     TEXT,
  image_storage_path TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS experience_campaigns (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id                   UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  title                     TEXT NOT NULL,
  description               TEXT NOT NULL DEFAULT '',
  start_date                DATE NOT NULL,
  end_date                  DATE NOT NULL,
  terms                     TEXT,
  platforms                 TEXT[] NOT NULL DEFAULT '{}',
  min_followers             INT,
  base_points               INT NOT NULL DEFAULT 0,
  points_per_view           NUMERIC(10,2) NOT NULL DEFAULT 0,
  points_per_like           NUMERIC(10,2) NOT NULL DEFAULT 0,
  points_per_comment        NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_points_per_submission INT NOT NULL DEFAULT 0,
  requires_manual_approval  BOOLEAN NOT NULL DEFAULT true,
  status                    experience_campaign_status NOT NULL DEFAULT 'draft',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS experience_submissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID NOT NULL REFERENCES experience_campaigns(id) ON DELETE CASCADE,
  cafe_id           UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  customer_id       UUID NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  platform          TEXT NOT NULL,
  video_url         TEXT NOT NULL,
  platform_username TEXT,
  note              TEXT,
  status            experience_submission_status NOT NULL DEFAULT 'pending',
  views             INT,
  likes             INT,
  comments          INT,
  shares            INT,
  suggested_points  INT,
  awarded_points    INT,
  rejection_reason  TEXT,
  media_storage_path TEXT,
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       UUID REFERENCES profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Notifications ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id       UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  audience      notification_audience NOT NULL,
  customer_id   UUID REFERENCES customer_profiles(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  type          TEXT NOT NULL,
  read          BOOLEAN NOT NULL DEFAULT false,
  meta          JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_cafe ON notifications(cafe_id, audience, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_customer ON notifications(customer_id, read, created_at DESC);

-- ─── Subscriptions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id       UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  plan_id       TEXT NOT NULL REFERENCES platform_plans(id),
  status        subscription_status NOT NULL DEFAULT 'active',
  amount_sar    NUMERIC(10,2) NOT NULL DEFAULT 0,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ,
  cancelled_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_cafe ON subscriptions(cafe_id, status);

-- ─── Reviews ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id       UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES menu_products(id) ON DELETE SET NULL,
  customer_id   UUID REFERENCES customer_profiles(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  rating        INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  owner_reply   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Cafe info pages ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cafe_pages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id       UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL DEFAULT '',
  published     BOOLEAN NOT NULL DEFAULT false,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cafe_id, slug)
);

-- ─── Audit logs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  cafe_id       UUID REFERENCES cafes(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  entity_table  TEXT,
  entity_id     UUID,
  old_data      JSONB,
  new_data      JSONB,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_cafe ON audit_logs(cafe_id, created_at DESC);

-- ─── RLS helper functions ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'platform_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_cafe_owner(p_cafe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cafe_members
    WHERE cafe_id = p_cafe_id AND user_id = auth.uid() AND role = 'owner'
  ) OR EXISTS (
    SELECT 1 FROM public.cafes WHERE id = p_cafe_id AND owner_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.has_cafe_access(p_cafe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_platform_admin()
    OR public.is_cafe_owner(p_cafe_id)
    OR EXISTS (
      SELECT 1 FROM public.cafe_members
      WHERE cafe_id = p_cafe_id AND user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.has_cafe_permission(p_cafe_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_platform_admin()
    OR public.is_cafe_owner(p_cafe_id)
    OR EXISTS (
      SELECT 1 FROM public.cafe_members cm
      WHERE cm.cafe_id = p_cafe_id AND cm.user_id = auth.uid()
        AND (
          cm.role IN ('owner', 'manager')
          OR (cm.permissions ? p_permission AND (cm.permissions->>p_permission)::boolean = true)
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.get_customer_profile_id(p_cafe_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM public.customer_profiles
  WHERE cafe_id = p_cafe_id AND user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_cafe_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_cafe_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_cafe_permission(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_customer_profile_id(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_cafe_owner(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_cafe_access(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_cafe_permission(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_profile_id(uuid) TO authenticated, service_role;

-- ─── Enable RLS ─────────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_custom_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE experience_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE experience_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_themes ENABLE ROW LEVEL SECURITY;

-- ─── RLS Policies (core) ────────────────────────────────────────────────────

-- profiles
CREATE POLICY profiles_select_own ON profiles FOR SELECT USING (
  id = auth.uid() OR is_platform_admin()
);
CREATE POLICY profiles_update_own ON profiles FOR UPDATE USING (
  id = auth.uid() OR is_platform_admin()
);

-- cafes: public read active; owners/admins manage
CREATE POLICY cafes_public_read ON cafes FOR SELECT USING (
  (is_public AND status = 'active' AND deleted_at IS NULL)
  OR has_cafe_access(id)
  OR is_platform_admin()
);
CREATE POLICY cafes_admin_write ON cafes FOR ALL USING (is_platform_admin());

-- cafe_settings (staff/owner/admin only; public fields via get_cafe_public_settings in 004)
CREATE POLICY cafe_settings_staff_read ON cafe_settings FOR SELECT USING (
  has_cafe_permission(cafe_id, 'settings') OR is_cafe_owner(cafe_id) OR is_platform_admin()
);
CREATE POLICY cafe_settings_owner_write ON cafe_settings FOR ALL USING (
  has_cafe_permission(cafe_id, 'settings') OR is_cafe_owner(cafe_id) OR is_platform_admin()
);

-- menu_categories: public visible; staff write
CREATE POLICY menu_categories_public_read ON menu_categories FOR SELECT USING (
  (visible AND deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM cafes c WHERE c.id = cafe_id AND c.is_public AND c.status = 'active'
  ))
  OR has_cafe_access(cafe_id)
  OR is_platform_admin()
);
CREATE POLICY menu_categories_staff_write ON menu_categories FOR ALL USING (
  has_cafe_permission(cafe_id, 'menu') OR is_cafe_owner(cafe_id) OR is_platform_admin()
);

-- menu_products
CREATE POLICY menu_products_public_read ON menu_products FOR SELECT USING (
  (available AND deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM cafes c WHERE c.id = cafe_id AND c.is_public AND c.status = 'active'
  ))
  OR has_cafe_access(cafe_id)
  OR is_platform_admin()
);
CREATE POLICY menu_products_staff_write ON menu_products FOR ALL USING (
  has_cafe_permission(cafe_id, 'menu') OR is_cafe_owner(cafe_id) OR is_platform_admin()
);

-- offers
CREATE POLICY offers_public_read ON offers FOR SELECT USING (
  (visible_in_cafe AND deleted_at IS NULL AND NOT is_archived AND EXISTS (
    SELECT 1 FROM cafes c WHERE c.id = cafe_id AND c.is_public AND c.status = 'active'
  ))
  OR has_cafe_access(cafe_id)
  OR is_platform_admin()
);
CREATE POLICY offers_staff_write ON offers FOR ALL USING (
  has_cafe_permission(cafe_id, 'offers') OR is_cafe_owner(cafe_id) OR is_platform_admin()
);

-- customer_profiles (INSERT via create_customer_profile RPC in 004)
CREATE POLICY customer_profiles_select ON customer_profiles FOR SELECT USING (
  user_id = auth.uid()
  OR public.is_cafe_owner(cafe_id)
  OR public.has_cafe_permission(cafe_id, 'customers')
  OR public.is_platform_admin()
);

-- orders: customer own; staff with orders permission
CREATE POLICY orders_select ON orders FOR SELECT USING (
  customer_id = get_customer_profile_id(cafe_id)
  OR is_cafe_owner(cafe_id)
  OR has_cafe_permission(cafe_id, 'orders')
  OR is_platform_admin()
);

-- order_items (via order access)
CREATE POLICY order_items_select ON order_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND (
    o.customer_id = get_customer_profile_id(o.cafe_id)
    OR is_cafe_owner(o.cafe_id)
    OR has_cafe_permission(o.cafe_id, 'orders')
    OR is_platform_admin()
  ))
);

-- reservations
CREATE POLICY reservations_select ON reservations FOR SELECT USING (
  customer_id = get_customer_profile_id(cafe_id)
  OR is_cafe_owner(cafe_id)
  OR has_cafe_permission(cafe_id, 'reservations')
  OR is_platform_admin()
);

-- notifications (tightened in 004; baseline avoids broad has_cafe_access)
CREATE POLICY notifications_select ON notifications FOR SELECT USING (
  (audience = 'customer' AND customer_id = get_customer_profile_id(cafe_id))
  OR (audience = 'cafe' AND (
    is_cafe_owner(cafe_id)
    OR has_cafe_permission(cafe_id, 'notifications')
    OR is_platform_admin()
  ))
  OR is_platform_admin()
);

-- loyalty (cafe staff + customer own account)
CREATE POLICY loyalty_accounts_select ON loyalty_accounts FOR SELECT USING (
  customer_id = get_customer_profile_id(cafe_id)
  OR is_cafe_owner(cafe_id)
  OR has_cafe_permission(cafe_id, 'loyalty')
  OR is_platform_admin()
);
CREATE POLICY loyalty_rules_staff ON loyalty_rules FOR ALL USING (
  has_cafe_permission(cafe_id, 'loyalty') OR is_cafe_owner(cafe_id) OR is_platform_admin()
);

-- experience
CREATE POLICY experience_campaigns_public ON experience_campaigns FOR SELECT USING (
  (status = 'active' AND EXISTS (
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
CREATE POLICY experience_campaigns_staff ON experience_campaigns FOR ALL USING (
  has_cafe_permission(cafe_id, 'marketing') OR is_cafe_owner(cafe_id) OR is_platform_admin()
);
CREATE POLICY experience_submissions_select ON experience_submissions FOR SELECT USING (
  customer_id = get_customer_profile_id(cafe_id)
  OR is_cafe_owner(cafe_id)
  OR has_cafe_permission(cafe_id, 'marketing')
  OR is_platform_admin()
);

-- subscriptions
CREATE POLICY subscriptions_select ON subscriptions FOR SELECT USING (
  is_cafe_owner(cafe_id) OR is_platform_admin()
);

-- reviews
CREATE POLICY reviews_public ON reviews FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM cafes c
    WHERE c.id = cafe_id
      AND c.is_public = true
      AND c.status = 'active'
      AND c.deleted_at IS NULL
  )
  OR is_cafe_owner(cafe_id)
  OR has_cafe_permission(cafe_id, 'customers')
  OR is_platform_admin()
);

-- audit_logs: admin + cafe owner only
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT USING (
  is_platform_admin() OR is_cafe_owner(cafe_id)
);

-- platform_plans: public read active
CREATE POLICY platform_plans_read ON platform_plans FOR SELECT USING (active OR is_platform_admin());
CREATE POLICY platform_plans_admin ON platform_plans FOR ALL USING (is_platform_admin());

-- cafe_themes: public read
CREATE POLICY cafe_themes_read ON cafe_themes FOR SELECT USING (active);

-- cafe_custom_identity
CREATE POLICY cafe_custom_identity_public ON cafe_custom_identity FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM cafes c
    WHERE c.id = cafe_id
      AND c.is_public = true
      AND c.status = 'active'
      AND c.deleted_at IS NULL
  )
  OR is_cafe_owner(cafe_id)
  OR has_cafe_permission(cafe_id, 'settings')
  OR is_platform_admin()
);
CREATE POLICY cafe_custom_identity_write ON cafe_custom_identity FOR ALL USING (
  is_cafe_owner(cafe_id) OR is_platform_admin()
);

-- branches
CREATE POLICY branches_public ON branches FOR SELECT USING (
  (active AND deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM cafes c
    WHERE c.id = cafe_id
      AND c.is_public = true
      AND c.status = 'active'
      AND c.deleted_at IS NULL
  ))
  OR is_cafe_owner(cafe_id)
  OR has_cafe_permission(cafe_id, 'branches')
  OR is_platform_admin()
);
CREATE POLICY branches_staff ON branches FOR ALL USING (
  has_cafe_permission(cafe_id, 'branches') OR is_cafe_owner(cafe_id) OR is_platform_admin()
);

-- ─── Storage buckets (run in Supabase Storage UI or via API) ─────────────────
-- Buckets: cafe-logos, cafe-backgrounds, menu-products, menu-categories,
--          offer-banners, customer-avatars, marketing-assets, experience-submissions
-- Policies: upload/read scoped by cafe_id folder prefix and permission checks

-- ─── Seed theme catalog ─────────────────────────────────────────────────────
INSERT INTO cafe_themes (id, name, description, preview_gradient) VALUES
  ('marketplace-amazon', 'ماركت بليس', 'تجربة ماركت بليس', 'from-orange-400 to-yellow-200'),
  ('premium-apple', 'بريميوم', 'أسلوب Apple', 'from-gray-100 to-gray-300'),
  ('noon-commerce', 'نون', 'تجارة سريعة', 'from-yellow-400 to-orange-300'),
  ('luxury-boutique', 'بوتيك', 'فاخر', 'from-stone-800 to-amber-200'),
  ('mobile-first-cafe', 'موبايل', 'تطبيق جوال', 'from-blue-400 to-purple-300'),
  ('cyber-eco-dark', 'سايبر', 'داكن نيون', 'from-green-900 to-black'),
  ('soft-cream-3d', 'كريمي', 'نيو مorphic', 'from-amber-100 to-orange-50'),
  ('magazine-editorial', 'مجلة', 'تحريري', 'from-red-900 to-stone-200'),
  ('fast-order-kiosk', 'كiosk', 'طلب سريع', 'from-orange-600 to-yellow-400'),
  ('reservation-lounge', 'لاounge', 'حجز', 'from-brown-800 to-amber-100'),
  ('brand-identity-custom', 'هوية مخصصة', 'هوية الكوفي', 'from-brown-700 to-amber-300')
ON CONFLICT (id) DO NOTHING;

INSERT INTO platform_plans (id, name, price_sar, features, sort_order) VALUES
  ('starter', 'Starter', 99, '["menu","orders"]', 1),
  ('pro', 'Pro', 199, '["menu","orders","loyalty","marketing"]', 2),
  ('enterprise', 'Enterprise', 399, '["all"]', 3)
ON CONFLICT (id) DO NOTHING;

-- ─── Profile bootstrap on signup ──────────────────────────────────────────────
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- END MIGRATION 001
-- ============================================================

-- ============================================================
-- BEGIN MIGRATION 002: barndaksa_storage_policies
-- SOURCE FILE: supabase/migrations/002_barndaksa_storage_policies.sql
-- ============================================================

-- Barndaksa Platform — Storage buckets & RLS policies
-- Version: 002
-- Run after 001_barndaksa_production_schema.sql

-- ─── Path helpers (SECURITY INVOKER — pure parsing, no RLS bypass) ─────────────
CREATE OR REPLACE FUNCTION public.storage_path_segment(object_name text, segment int)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT split_part(object_name, '/', segment);
$$;

CREATE OR REPLACE FUNCTION public.storage_path_cafe_id(object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(public.storage_path_segment(object_name, 1), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.storage_path_user_id(object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(public.storage_path_segment(object_name, 1), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.storage_path_entity_id(object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(public.storage_path_segment(object_name, 2), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.storage_cafe_is_public(p_cafe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cafes c
    WHERE c.id = p_cafe_id
      AND c.is_public = true
      AND c.status = 'active'
      AND c.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.storage_menu_product_is_public(p_cafe_id uuid, p_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.storage_cafe_is_public(p_cafe_id)
    AND EXISTS (
      SELECT 1 FROM public.menu_products mp
      WHERE mp.id = p_product_id
        AND mp.cafe_id = p_cafe_id
        AND mp.available = true
        AND mp.available_for_pickup = true
        AND mp.deleted_at IS NULL
    );
$$;

CREATE OR REPLACE FUNCTION public.storage_menu_category_is_public(p_cafe_id uuid, p_category_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.storage_cafe_is_public(p_cafe_id)
    AND EXISTS (
      SELECT 1 FROM public.menu_categories mc
      WHERE mc.id = p_category_id
        AND mc.cafe_id = p_cafe_id
        AND mc.visible = true
        AND mc.deleted_at IS NULL
    );
$$;

CREATE OR REPLACE FUNCTION public.storage_offer_is_public(p_cafe_id uuid, p_offer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.storage_cafe_is_public(p_cafe_id)
    AND EXISTS (
      SELECT 1 FROM public.offers o
      WHERE o.id = p_offer_id
        AND o.cafe_id = p_cafe_id
        AND o.visible_in_cafe = true
        AND o.deleted_at IS NULL
        AND NOT o.is_archived
        AND (o.start_date IS NULL OR o.start_date <= CURRENT_DATE)
        AND (o.end_date IS NULL OR o.end_date >= CURRENT_DATE)
    );
$$;

CREATE OR REPLACE FUNCTION public.storage_marketing_is_public(p_cafe_id uuid, p_campaign_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.storage_cafe_is_public(p_cafe_id)
    AND EXISTS (
      SELECT 1 FROM public.marketing_campaigns mc
      WHERE mc.id = p_campaign_id
        AND mc.cafe_id = p_cafe_id
        AND mc.status = 'active'
        AND mc.deleted_at IS NULL
    );
$$;

CREATE OR REPLACE FUNCTION public.storage_submission_cafe_id(object_name text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT es.cafe_id
  FROM public.experience_submissions es
  WHERE es.id = public.storage_path_entity_id(object_name)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.storage_can_write_cafe_asset(p_cafe_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_platform_admin()
    OR public.is_cafe_owner(p_cafe_id)
    OR public.has_cafe_permission(p_cafe_id, p_permission);
$$;

REVOKE ALL ON FUNCTION public.storage_cafe_is_public(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_menu_product_is_public(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_menu_category_is_public(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_offer_is_public(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_marketing_is_public(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_submission_cafe_id(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_can_write_cafe_asset(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.storage_cafe_is_public(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_menu_product_is_public(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_menu_category_is_public(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_offer_is_public(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_marketing_is_public(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_submission_cafe_id(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_can_write_cafe_asset(uuid, text) TO authenticated, service_role;

-- ─── Safe storage object path (allows file extensions; blocks traversal) ───────
CREATE OR REPLACE FUNCTION public.storage_object_path_is_safe(p_path text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_path IS NOT NULL
    AND btrim(p_path) <> ''
    AND p_path NOT LIKE '/%'
    AND strpos(p_path, chr(92)) = 0
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(string_to_array(p_path, '/')) AS seg
      WHERE seg IS NULL OR seg = '' OR seg = '..' OR seg = '.'
    );
$$;

CREATE OR REPLACE FUNCTION public.storage_path_has_allowed_image_ext(p_path text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(p_path, '^.*\.([^.]+)$', '\1')) IN ('webp', 'jpg', 'jpeg', 'png');
$$;

CREATE OR REPLACE FUNCTION public.storage_staff_can_read_cafe_asset(p_cafe_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_platform_admin()
    OR public.is_cafe_owner(p_cafe_id)
    OR public.has_cafe_permission(p_cafe_id, p_permission);
$$;

REVOKE ALL ON FUNCTION public.storage_staff_can_read_cafe_asset(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storage_staff_can_read_cafe_asset(uuid, text) TO authenticated, service_role;

-- ─── Public object access (DB path binding — used by storage.objects SELECT) ─
CREATE OR REPLACE FUNCTION public.can_access_public_storage_object(
  p_bucket text,
  p_storage_path text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cafe_id uuid;
  v_entity_id uuid;
  v_seg2 text;
  v_seg3 text;
BEGIN
  IF p_bucket IN ('customer-avatars', 'experience-submissions') THEN
    RETURN false;
  END IF;

  IF p_storage_path IS NULL OR NOT public.storage_object_path_is_safe(p_storage_path) THEN
    RETURN false;
  END IF;

  v_cafe_id := public.storage_path_cafe_id(p_storage_path);
  IF v_cafe_id IS NULL OR NOT public.storage_cafe_is_public(v_cafe_id) THEN
    RETURN false;
  END IF;

  v_seg2 := public.storage_path_segment(p_storage_path, 2);
  v_seg3 := public.storage_path_segment(p_storage_path, 3);

  CASE p_bucket
    WHEN 'cafe-logos' THEN
      IF v_seg2 IS NULL OR v_seg2 = '' THEN
        RETURN false;
      END IF;
      RETURN EXISTS (
        SELECT 1 FROM public.cafe_settings cs
        WHERE cs.cafe_id = v_cafe_id
          AND cs.logo_storage_path = p_storage_path
      ) OR EXISTS (
        SELECT 1 FROM public.cafe_custom_identity ci
        WHERE ci.cafe_id = v_cafe_id
          AND ci.logo_storage_path = p_storage_path
      );

    WHEN 'cafe-backgrounds' THEN
      IF v_seg2 IS NULL OR v_seg2 = '' THEN
        RETURN false;
      END IF;
      RETURN EXISTS (
        SELECT 1 FROM public.cafe_custom_identity ci
        WHERE ci.cafe_id = v_cafe_id
          AND ci.background_storage_path = p_storage_path
      );

    WHEN 'menu-products' THEN
      v_entity_id := public.storage_path_entity_id(p_storage_path);
      IF v_entity_id IS NULL OR v_seg3 IS NULL OR v_seg3 = '' THEN
        RETURN false;
      END IF;
      IF NOT public.storage_menu_product_is_public(v_cafe_id, v_entity_id) THEN
        RETURN false;
      END IF;
      RETURN EXISTS (
        SELECT 1 FROM public.menu_products mp
        WHERE mp.id = v_entity_id
          AND mp.cafe_id = v_cafe_id
          AND mp.image_storage_path = p_storage_path
      );

    WHEN 'menu-categories' THEN
      v_entity_id := public.storage_path_entity_id(p_storage_path);
      IF v_entity_id IS NULL OR v_seg3 IS NULL OR v_seg3 = '' THEN
        RETURN false;
      END IF;
      IF NOT public.storage_menu_category_is_public(v_cafe_id, v_entity_id) THEN
        RETURN false;
      END IF;
      RETURN EXISTS (
        SELECT 1 FROM public.menu_categories mc
        WHERE mc.id = v_entity_id
          AND mc.cafe_id = v_cafe_id
          AND mc.image_storage_path = p_storage_path
      );

    WHEN 'offer-banners' THEN
      v_entity_id := public.storage_path_entity_id(p_storage_path);
      IF v_entity_id IS NULL OR v_seg3 IS NULL OR v_seg3 = '' THEN
        RETURN false;
      END IF;
      IF NOT public.storage_offer_is_public(v_cafe_id, v_entity_id) THEN
        RETURN false;
      END IF;
      RETURN EXISTS (
        SELECT 1 FROM public.offers o
        WHERE o.id = v_entity_id
          AND o.cafe_id = v_cafe_id
          AND o.banner_storage_path = p_storage_path
      );

    WHEN 'marketing-assets' THEN
      v_entity_id := public.storage_path_entity_id(p_storage_path);
      IF v_entity_id IS NULL OR v_seg3 IS NULL OR v_seg3 = '' THEN
        RETURN false;
      END IF;
      IF NOT public.storage_marketing_is_public(v_cafe_id, v_entity_id) THEN
        RETURN false;
      END IF;
      RETURN EXISTS (
        SELECT 1 FROM public.marketing_campaigns mc
        WHERE mc.id = v_entity_id
          AND mc.cafe_id = v_cafe_id
          AND mc.image_storage_path = p_storage_path
      );

    ELSE
      RETURN false;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.storage_can_access_experience_object(p_object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_submission_id uuid;
  v_cafe_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  v_submission_id := public.storage_path_entity_id(p_object_name);
  IF v_submission_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.storage_path_user_id(p_object_name) = auth.uid() THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.experience_submissions es
      JOIN public.customer_profiles cp ON cp.id = es.customer_id
      WHERE es.id = v_submission_id
        AND cp.user_id = auth.uid()
        AND es.media_storage_path = p_object_name
    );
  END IF;

  IF public.is_platform_admin() THEN
    RETURN EXISTS (
      SELECT 1 FROM public.experience_submissions es
      WHERE es.id = v_submission_id
        AND es.media_storage_path = p_object_name
    );
  END IF;

  SELECT es.cafe_id INTO v_cafe_id
  FROM public.experience_submissions es
  WHERE es.id = v_submission_id
    AND es.media_storage_path = p_object_name;

  IF v_cafe_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.is_cafe_owner(v_cafe_id)
    OR public.has_cafe_permission(v_cafe_id, 'marketing');
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_public_storage_object(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_can_access_experience_object(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_public_storage_object(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_can_access_experience_object(text) TO authenticated, service_role;

-- ─── Buckets (private — no public write) ─────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('cafe-logos', 'cafe-logos', false, 5242880, ARRAY['image/webp', 'image/jpeg', 'image/png']),
  ('cafe-backgrounds', 'cafe-backgrounds', false, 8388608, ARRAY['image/webp', 'image/jpeg', 'image/png']),
  ('menu-products', 'menu-products', false, 5242880, ARRAY['image/webp', 'image/jpeg', 'image/png']),
  ('menu-categories', 'menu-categories', false, 5242880, ARRAY['image/webp', 'image/jpeg', 'image/png']),
  ('offer-banners', 'offer-banners', false, 8388608, ARRAY['image/webp', 'image/jpeg', 'image/png']),
  ('customer-avatars', 'customer-avatars', false, 2097152, ARRAY['image/webp', 'image/jpeg', 'image/png']),
  ('marketing-assets', 'marketing-assets', false, 8388608, ARRAY['image/webp', 'image/jpeg', 'image/png']),
  ('experience-submissions', 'experience-submissions', false, 52428800, ARRAY['image/webp', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── cafe-logos: {cafe_id}/{file_name} ───────────────────────────────────────
CREATE POLICY storage_cafe_logos_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'cafe-logos'
    AND public.can_access_public_storage_object(bucket_id, name)
  );
CREATE POLICY storage_cafe_logos_select_staff ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'cafe-logos'
    AND public.storage_staff_can_read_cafe_asset(public.storage_path_cafe_id(name), 'settings')
  );
CREATE POLICY storage_cafe_logos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cafe-logos'
    AND public.storage_object_path_is_safe(name)
    AND array_length(string_to_array(name, '/'), 1) = 2
    AND storage_path_segment(name, 2) <> ''
    AND EXISTS (
      SELECT 1 FROM public.cafes c
      WHERE c.id = public.storage_path_cafe_id(name)
        AND c.deleted_at IS NULL
    )
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'settings')
  );
CREATE POLICY storage_cafe_logos_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'cafe-logos'
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'settings')
  );
CREATE POLICY storage_cafe_logos_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'cafe-logos'
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'settings')
  );

-- ─── cafe-backgrounds: {cafe_id}/{file_name} ─────────────────────────────────
CREATE POLICY storage_cafe_backgrounds_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'cafe-backgrounds'
    AND public.can_access_public_storage_object(bucket_id, name)
  );
CREATE POLICY storage_cafe_backgrounds_select_staff ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'cafe-backgrounds'
    AND public.storage_staff_can_read_cafe_asset(public.storage_path_cafe_id(name), 'settings')
  );
CREATE POLICY storage_cafe_backgrounds_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cafe-backgrounds'
    AND public.storage_object_path_is_safe(name)
    AND array_length(string_to_array(name, '/'), 1) = 2
    AND storage_path_segment(name, 2) <> ''
    AND EXISTS (
      SELECT 1 FROM public.cafes c
      WHERE c.id = public.storage_path_cafe_id(name)
        AND c.deleted_at IS NULL
    )
    AND (is_cafe_owner(storage_path_cafe_id(name)) OR is_platform_admin())
  );
CREATE POLICY storage_cafe_backgrounds_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'cafe-backgrounds'
    AND (is_cafe_owner(storage_path_cafe_id(name)) OR is_platform_admin())
  );
CREATE POLICY storage_cafe_backgrounds_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'cafe-backgrounds'
    AND (is_cafe_owner(storage_path_cafe_id(name)) OR is_platform_admin())
  );

-- ─── menu-products: {cafe_id}/{product_id}/{file_name} ───────────────────────
CREATE POLICY storage_menu_products_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'menu-products'
    AND public.can_access_public_storage_object(bucket_id, name)
  );
CREATE POLICY storage_menu_products_select_staff ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'menu-products'
    AND public.storage_staff_can_read_cafe_asset(public.storage_path_cafe_id(name), 'menu')
  );
CREATE POLICY storage_menu_products_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'menu-products'
    AND public.storage_object_path_is_safe(name)
    AND array_length(string_to_array(name, '/'), 1) = 3
    AND storage_path_segment(name, 3) <> ''
    AND EXISTS (
      SELECT 1 FROM public.menu_products mp
      WHERE mp.id = public.storage_path_entity_id(name)
        AND mp.cafe_id = public.storage_path_cafe_id(name)
        AND mp.deleted_at IS NULL
    )
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'menu')
  );
CREATE POLICY storage_menu_products_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'menu-products'
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'menu')
  );
CREATE POLICY storage_menu_products_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'menu-products'
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'menu')
  );

-- ─── menu-categories: {cafe_id}/{category_id}/{file_name} ────────────────────
CREATE POLICY storage_menu_categories_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'menu-categories'
    AND public.can_access_public_storage_object(bucket_id, name)
  );
CREATE POLICY storage_menu_categories_select_staff ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'menu-categories'
    AND public.storage_staff_can_read_cafe_asset(public.storage_path_cafe_id(name), 'menu')
  );
CREATE POLICY storage_menu_categories_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'menu-categories'
    AND public.storage_object_path_is_safe(name)
    AND array_length(string_to_array(name, '/'), 1) = 3
    AND storage_path_segment(name, 3) <> ''
    AND EXISTS (
      SELECT 1 FROM public.menu_categories mc
      WHERE mc.id = public.storage_path_entity_id(name)
        AND mc.cafe_id = public.storage_path_cafe_id(name)
        AND mc.deleted_at IS NULL
    )
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'menu')
  );
CREATE POLICY storage_menu_categories_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'menu-categories'
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'menu')
  );
CREATE POLICY storage_menu_categories_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'menu-categories'
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'menu')
  );

-- ─── offer-banners: {cafe_id}/{offer_id}/{file_name} ─────────────────────────
CREATE POLICY storage_offer_banners_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'offer-banners'
    AND public.can_access_public_storage_object(bucket_id, name)
  );
CREATE POLICY storage_offer_banners_select_staff ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'offer-banners'
    AND public.storage_staff_can_read_cafe_asset(public.storage_path_cafe_id(name), 'offers')
  );
CREATE POLICY storage_offer_banners_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'offer-banners'
    AND public.storage_object_path_is_safe(name)
    AND array_length(string_to_array(name, '/'), 1) = 3
    AND storage_path_segment(name, 3) <> ''
    AND EXISTS (
      SELECT 1 FROM public.offers o
      WHERE o.id = public.storage_path_entity_id(name)
        AND o.cafe_id = public.storage_path_cafe_id(name)
        AND o.deleted_at IS NULL
    )
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'offers')
  );
CREATE POLICY storage_offer_banners_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'offer-banners'
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'offers')
  );
CREATE POLICY storage_offer_banners_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'offer-banners'
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'offers')
  );

-- ─── marketing-assets: {cafe_id}/{campaign_id}/{file_name} ───────────────────
CREATE POLICY storage_marketing_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'marketing-assets'
    AND public.can_access_public_storage_object(bucket_id, name)
  );
CREATE POLICY storage_marketing_select_staff ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'marketing-assets'
    AND public.storage_staff_can_read_cafe_asset(public.storage_path_cafe_id(name), 'marketing')
  );
CREATE POLICY storage_marketing_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'marketing-assets'
    AND public.storage_object_path_is_safe(name)
    AND array_length(string_to_array(name, '/'), 1) = 3
    AND storage_path_segment(name, 3) <> ''
    AND EXISTS (
      SELECT 1 FROM public.marketing_campaigns mc
      WHERE mc.id = public.storage_path_entity_id(name)
        AND mc.cafe_id = public.storage_path_cafe_id(name)
        AND mc.deleted_at IS NULL
    )
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'marketing')
  );
CREATE POLICY storage_marketing_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'marketing-assets'
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'marketing')
  );
CREATE POLICY storage_marketing_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'marketing-assets'
    AND storage_can_write_cafe_asset(storage_path_cafe_id(name), 'marketing')
  );

-- ─── customer-avatars: {user_id}/{file_name} — owner + platform_admin only ───
CREATE POLICY storage_customer_avatars_select_own ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'customer-avatars'
    AND public.storage_path_user_id(name) = auth.uid()
  );
CREATE POLICY storage_customer_avatars_select_admin ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'customer-avatars'
    AND public.is_platform_admin()
  );
CREATE POLICY storage_customer_avatars_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'customer-avatars'
    AND public.storage_object_path_is_safe(name)
    AND public.storage_path_has_allowed_image_ext(name)
    AND array_length(string_to_array(name, '/'), 1) = 2
    AND public.storage_path_user_id(name) = auth.uid()
    AND public.storage_path_segment(name, 2) <> ''
  );
CREATE POLICY storage_customer_avatars_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'customer-avatars'
    AND (
      public.storage_path_user_id(name) = auth.uid()
      OR public.is_platform_admin()
    )
  );

-- ─── experience-submissions: {user_id}/{submission_id}/{file_name} — private ─
CREATE POLICY storage_experience_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'experience-submissions'
    AND public.storage_can_access_experience_object(name)
  );
CREATE POLICY storage_experience_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'experience-submissions'
    AND public.storage_object_path_is_safe(name)
    AND public.storage_path_has_allowed_image_ext(name)
    AND array_length(string_to_array(name, '/'), 1) = 3
    AND public.storage_path_user_id(name) = auth.uid()
    AND public.storage_path_segment(name, 3) <> ''
    AND EXISTS (
      SELECT 1 FROM public.experience_submissions es
      WHERE es.id = public.storage_path_entity_id(name)
        AND es.customer_id = public.get_customer_profile_id(es.cafe_id)
        AND es.status = 'pending'
    )
  );
CREATE POLICY storage_experience_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'experience-submissions'
    AND (
      (
        public.storage_path_user_id(name) = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.experience_submissions es
          JOIN public.customer_profiles cp ON cp.id = es.customer_id
          WHERE es.id = public.storage_path_entity_id(name)
            AND cp.user_id = auth.uid()
            AND es.status = 'pending'
        )
      )
      OR public.is_platform_admin()
      OR (
        public.storage_can_access_experience_object(name)
        AND (
          public.is_cafe_owner(public.storage_submission_cafe_id(name))
          OR public.has_cafe_permission(public.storage_submission_cafe_id(name), 'marketing')
        )
      )
    )
  );

-- ============================================================
-- END MIGRATION 002
-- ============================================================

-- ============================================================
-- BEGIN MIGRATION 003: barndaksa_security_hardening
-- SOURCE FILE: supabase/migrations/003_barndaksa_security_hardening.sql
-- ============================================================

-- Barndaksa Platform — RLS hardening, platform_settings, domain_orders
-- Version: 003
-- Run after 002_barndaksa_storage_policies.sql

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
  support_email               CITEXT NOT NULL DEFAULT 'support@barndaksa.com',
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

-- ============================================================
-- END MIGRATION 003
-- ============================================================

-- ============================================================
-- BEGIN MIGRATION 004: barndaksa_critical_security_fixes
-- SOURCE FILE: supabase/migrations/004_barndaksa_critical_security_fixes.sql
-- ============================================================

-- Barndaksa Platform — Critical security fixes
-- Version: 004
-- Run after 003_barndaksa_security_hardening.sql
-- =============================================================================
-- Shared helpers (SECURITY DEFINER, search_path = '')
-- =============================================================================
CREATE OR REPLACE FUNCTION public.assert_cafe_open_to_customers(p_cafe_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.cafes c
    WHERE c.id = p_cafe_id
      AND c.status = 'active'
      AND c.is_public = true
      AND c.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cafe is not available';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_cafe_open_to_customers(uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_cafe_id uuid,
  p_action text,
  p_entity_table text,
  p_entity_id uuid,
  p_new_data jsonb DEFAULT NULL,
  p_old_data jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    actor_id, cafe_id, action, entity_table, entity_id, old_data, new_data
  ) VALUES (
    auth.uid(), p_cafe_id, p_action, p_entity_table, p_entity_id, p_old_data, p_new_data
  );
END;
$$;
REVOKE ALL ON FUNCTION public.write_audit_log(uuid, text, text, uuid, jsonb, jsonb) FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.internal_notify_cafe(
  p_cafe_id uuid,
  p_title text,
  p_body text,
  p_type text,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.notifications (cafe_id, audience, title, body, type, meta)
  VALUES (p_cafe_id, 'cafe', p_title, p_body, p_type, p_meta)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.internal_notify_cafe(uuid, text, text, text, jsonb) FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.internal_notify_customer(
  p_cafe_id uuid,
  p_customer_id uuid,
  p_title text,
  p_body text,
  p_type text,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.notifications (cafe_id, audience, customer_id, title, body, type, meta)
  VALUES (p_cafe_id, 'customer', p_customer_id, p_title, p_body, p_type, p_meta)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.internal_notify_customer(uuid, uuid, text, text, text, jsonb) FROM PUBLIC;
-- =============================================================================
-- 1. cafe_settings — close public leak
-- =============================================================================
DROP POLICY IF EXISTS cafe_settings_public_read ON cafe_settings;
CREATE OR REPLACE FUNCTION public.get_cafe_public_settings(p_cafe_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'cafe_id', cs.cafe_id,
    'description', cs.description,
    'logo_url', cs.logo_url,
    'logo_storage_path', cs.logo_storage_path,
    'instagram', cs.instagram,
    'whatsapp', cs.whatsapp,
    'theme_id', cs.theme_id
  )
  FROM public.cafe_settings cs
  JOIN public.cafes c ON c.id = cs.cafe_id
  WHERE cs.cafe_id = p_cafe_id
    AND c.is_public = true
    AND c.status = 'active'
    AND c.deleted_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.get_cafe_public_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cafe_public_settings(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS orders_customer_insert ON orders;
DROP POLICY IF EXISTS order_items_insert ON order_items;
DROP POLICY IF EXISTS orders_cafe_update ON orders;
CREATE OR REPLACE FUNCTION public.create_pickup_order(
  p_cafe_id uuid,
  p_branch_name text DEFAULT NULL,
  p_pickup_at timestamptz DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_id uuid;
  v_profile public.customer_profiles%ROWTYPE;
  v_item jsonb;
  v_product public.menu_products%ROWTYPE;
  v_subtotal numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_tax numeric(10,2);
  v_total numeric(10,2);
  v_loyalty int := 0;
  v_order_id uuid;
  v_qty int;
  v_lines jsonb := '[]'::jsonb;
  v_line jsonb;
  v_item_count int := 0;
  c_max_items constant int := 50;
  c_max_qty constant int := 99;
  c_max_notes constant int := 500;
  c_max_branch constant int := 100;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  PERFORM public.assert_cafe_open_to_customers(p_cafe_id);
  v_customer_id := public.get_customer_profile_id(p_cafe_id);
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer profile not found for this cafe';
  END IF;
  SELECT * INTO v_profile
  FROM public.customer_profiles
  WHERE id = v_customer_id;
  IF p_branch_name IS NOT NULL AND char_length(p_branch_name) > c_max_branch THEN
    RAISE EXCEPTION 'Branch name too long';
  END IF;
  IF p_notes IS NOT NULL AND char_length(p_notes) > c_max_notes THEN
    RAISE EXCEPTION 'Notes too long';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;
  IF jsonb_array_length(p_items) > c_max_items THEN
    RAISE EXCEPTION 'Too many items in order';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_product
    FROM public.menu_products
    WHERE id = (v_item->>'product_id')::uuid
      AND cafe_id = p_cafe_id
      AND available = true
      AND available_for_pickup = true
      AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid or unavailable product for pickup: %', v_item->>'product_id';
    END IF;
    v_qty := (v_item->>'quantity')::int;
    IF v_qty IS NULL OR v_qty <= 0 OR v_qty > c_max_qty THEN
      RAISE EXCEPTION 'Invalid quantity';
    END IF;
    IF v_item->>'notes' IS NOT NULL AND char_length(v_item->>'notes') > c_max_notes THEN
      RAISE EXCEPTION 'Item notes too long';
    END IF;
    v_subtotal := v_subtotal + (v_product.price * v_qty);
    v_loyalty := v_loyalty + COALESCE(v_product.loyalty_points, 0) * v_qty;
    v_item_count := v_item_count + 1;
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'product_id', v_product.id,
        'name', v_product.name,
        'quantity', v_qty,
        'unit_price', v_product.price,
        'notes', NULLIF(v_item->>'notes', '')
      )
    );
  END LOOP;
  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;
  v_tax := round(v_subtotal * 0.15, 2);
  v_total := round(v_subtotal - v_discount + v_tax, 2);
  IF v_total <> round(v_subtotal - v_discount + v_tax, 2) THEN
    RAISE EXCEPTION 'Order total mismatch';
  END IF;
  INSERT INTO public.orders (
    cafe_id, customer_id, customer_name, customer_phone, customer_email,
    branch_name, fulfillment_type, status, payment_status,
    pickup_at, notes, subtotal, discount_amount, tax_amount, total, loyalty_points_earned
  ) VALUES (
    p_cafe_id, v_customer_id, v_profile.full_name, v_profile.phone, v_profile.email,
    NULLIF(btrim(p_branch_name), ''), 'pickup', 'pending_cafe', 'pay_at_pickup',
    p_pickup_at, NULLIF(btrim(p_notes), ''), v_subtotal, v_discount, v_tax, v_total, v_loyalty
  )
  RETURNING id INTO v_order_id;
  FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines)
  LOOP
    INSERT INTO public.order_items (order_id, product_id, name, quantity, unit_price, notes)
    VALUES (
      v_order_id,
      (v_line->>'product_id')::uuid,
      v_line->>'name',
      (v_line->>'quantity')::int,
      (v_line->>'unit_price')::numeric(10,2),
      NULLIF(v_line->>'notes', '')
    );
  END LOOP;
  PERFORM public.internal_notify_cafe(
    p_cafe_id,
    'طلب استلام جديد',
    'طلب جديد من ' || v_profile.full_name,
    'new_pickup_order',
    jsonb_build_object('order_id', v_order_id)
  );
  PERFORM public.internal_notify_customer(
    p_cafe_id,
    v_customer_id,
    'تم إرسال طلبك',
    'طلبك ' || v_order_id::text || ' بانتظار موافقة الكوفي. الدفع عند الاستلام.',
    'new_pickup_order',
    jsonb_build_object('order_id', v_order_id)
  );
  RETURN v_order_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_pickup_order(uuid, text, timestamptz, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pickup_order(uuid, text, timestamptz, text, jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.respond_to_pickup_order(
  p_order_id uuid,
  p_status public.order_status,
  p_rejection_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF NOT (
    public.is_platform_admin()
    OR public.is_cafe_owner(v_order.cafe_id)
    OR public.has_cafe_permission(v_order.cafe_id, 'orders')
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF v_order.status <> 'pending_cafe' THEN
    RAISE EXCEPTION 'Order is not awaiting cafe response';
  END IF;
  IF p_status NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'Invalid status transition';
  END IF;
  IF p_status = 'rejected' AND (p_rejection_reason IS NULL OR btrim(p_rejection_reason) = '') THEN
    RAISE EXCEPTION 'Rejection reason required';
  END IF;
  UPDATE public.orders
  SET status = p_status,
      rejection_reason = CASE WHEN p_status = 'rejected' THEN btrim(p_rejection_reason) ELSE NULL END,
      responded_at = now()
  WHERE id = p_order_id;
  PERFORM public.write_audit_log(
    v_order.cafe_id,
    'respond_to_pickup_order',
    'orders',
    p_order_id,
    jsonb_build_object('status', p_status, 'rejection_reason', p_rejection_reason),
    to_jsonb(v_order)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.respond_to_pickup_order(uuid, public.order_status, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_pickup_order(uuid, public.order_status, text) TO authenticated;
-- =============================================================================
-- =============================================================================
-- =============================================================================
ALTER TABLE public.experience_campaigns
  ADD CONSTRAINT experience_campaigns_id_cafe_unique UNIQUE (id, cafe_id);
ALTER TABLE public.experience_submissions
  DROP CONSTRAINT IF EXISTS experience_submissions_campaign_id_fkey;
ALTER TABLE public.experience_submissions
  ADD CONSTRAINT experience_submissions_campaign_cafe_fkey
  FOREIGN KEY (campaign_id, cafe_id)
  REFERENCES public.experience_campaigns(id, cafe_id)
  ON DELETE CASCADE;
ALTER TABLE public.experience_submissions
  ALTER COLUMN video_url DROP NOT NULL;
DROP POLICY IF EXISTS experience_submissions_insert ON public.experience_submissions;
DROP POLICY IF EXISTS experience_submissions_customer ON public.experience_submissions;
DROP POLICY IF EXISTS experience_submissions_review ON public.experience_submissions;
CREATE OR REPLACE FUNCTION public.submit_experience_submission(
  p_cafe_id uuid,
  p_campaign_id uuid,
  p_platform text,
  p_video_url text DEFAULT NULL,
  p_platform_username text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_id uuid;
  v_campaign public.experience_campaigns%ROWTYPE;
  v_id uuid;
  v_video text;
  c_max_note constant int := 500;
  c_max_username constant int := 100;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  PERFORM public.assert_cafe_open_to_customers(p_cafe_id);
  v_customer_id := public.get_customer_profile_id(p_cafe_id);
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer profile not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.customer_profiles cp
    WHERE cp.id = v_customer_id
      AND cp.cafe_id = p_cafe_id
      AND cp.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Customer profile mismatch';
  END IF;
  SELECT * INTO v_campaign
  FROM public.experience_campaigns
  WHERE id = p_campaign_id
    AND cafe_id = p_cafe_id
    AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not active for this cafe';
  END IF;
  IF current_date < v_campaign.start_date OR current_date > v_campaign.end_date THEN
    RAISE EXCEPTION 'Campaign is not open on this date';
  END IF;
  IF NOT (p_platform = ANY(v_campaign.platforms)) THEN
    RAISE EXCEPTION 'Platform not allowed for this campaign';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.experience_submissions es
    WHERE es.campaign_id = p_campaign_id
      AND es.customer_id = v_customer_id
  ) THEN
    RAISE EXCEPTION 'Already submitted for this campaign';
  END IF;
  v_video := NULLIF(btrim(p_video_url), '');
  IF v_video IS NOT NULL AND v_video NOT LIKE 'https://%' THEN
    RAISE EXCEPTION 'Video URL must use HTTPS';
  END IF;
  IF p_note IS NOT NULL AND char_length(p_note) > c_max_note THEN
    RAISE EXCEPTION 'Note too long';
  END IF;
  IF p_platform_username IS NOT NULL AND char_length(p_platform_username) > c_max_username THEN
    RAISE EXCEPTION 'Platform username too long';
  END IF;
  INSERT INTO public.experience_submissions (
    campaign_id, cafe_id, customer_id, platform, video_url,
    platform_username, note, media_storage_path, status
  ) VALUES (
    p_campaign_id, p_cafe_id, v_customer_id, p_platform,
    COALESCE(v_video, ''),
    NULLIF(btrim(p_platform_username), ''),
    NULLIF(btrim(p_note), ''),
    NULL,
    'pending'
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_experience_submission(uuid, uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_experience_submission(uuid, uuid, text, text, text, text) TO authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_tx_experience_submission
  ON public.loyalty_transactions(reference_type, reference_id)
  WHERE reference_type = 'experience_submission';
CREATE OR REPLACE FUNCTION public.approve_experience_submission(
  p_submission_id uuid,
  p_awarded_points int
)
RETURNS public.experience_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub public.experience_submissions%ROWTYPE;
  v_campaign public.experience_campaigns%ROWTYPE;
  v_account public.loyalty_accounts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT * INTO v_sub
  FROM public.experience_submissions
  WHERE id = p_submission_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;
  IF NOT (
    public.is_platform_admin()
    OR public.is_cafe_owner(v_sub.cafe_id)
    OR public.has_cafe_permission(v_sub.cafe_id, 'marketing')
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF v_sub.status <> 'pending' THEN
    RAISE EXCEPTION 'Submission is not pending';
  END IF;
  IF p_awarded_points <= 0 THEN
    RAISE EXCEPTION 'Invalid points';
  END IF;
  SELECT * INTO v_campaign
  FROM public.experience_campaigns
  WHERE id = v_sub.campaign_id
    AND cafe_id = v_sub.cafe_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;
  IF p_awarded_points > v_campaign.max_points_per_submission THEN
    RAISE EXCEPTION 'Points exceed campaign maximum';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.loyalty_transactions lt
    WHERE lt.reference_type = 'experience_submission'
      AND lt.reference_id = p_submission_id
  ) THEN
    RAISE EXCEPTION 'Submission already rewarded';
  END IF;
  UPDATE public.experience_submissions
  SET status = 'approved',
      awarded_points = p_awarded_points,
      reviewed_at = now(),
      reviewed_by = auth.uid()
  WHERE id = p_submission_id
  RETURNING * INTO v_sub;
  INSERT INTO public.loyalty_transactions (
    cafe_id, customer_id, amount, reason, reference_type, reference_id, created_by
  ) VALUES (
    v_sub.cafe_id, v_sub.customer_id, p_awarded_points,
    'مكافأة وثّق تجربتك', 'experience_submission', p_submission_id, auth.uid()
  );
  SELECT * INTO v_account
  FROM public.loyalty_accounts
  WHERE cafe_id = v_sub.cafe_id AND customer_id = v_sub.customer_id
  FOR UPDATE;
  IF FOUND THEN
    UPDATE public.loyalty_accounts
    SET balance = balance + p_awarded_points
    WHERE id = v_account.id;
  ELSE
    INSERT INTO public.loyalty_accounts (cafe_id, customer_id, balance)
    VALUES (v_sub.cafe_id, v_sub.customer_id, p_awarded_points);
  END IF;
  PERFORM public.write_audit_log(
    v_sub.cafe_id,
    'approve_experience_submission',
    'experience_submissions',
    p_submission_id,
    jsonb_build_object('awarded_points', p_awarded_points)
  );
  RETURN v_sub;
END;
$$;
REVOKE ALL ON FUNCTION public.approve_experience_submission(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_experience_submission(uuid, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.attach_experience_submission_media(
  p_submission_id uuid,
  p_media_storage_path text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub public.experience_submissions%ROWTYPE;
  v_media text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_media := NULLIF(btrim(p_media_storage_path), '');
  IF v_media IS NULL THEN
    RAISE EXCEPTION 'Media path required';
  END IF;

  IF NOT public.storage_object_path_is_safe(v_media) THEN
    RAISE EXCEPTION 'Invalid media storage path';
  END IF;
  IF NOT public.storage_path_has_allowed_image_ext(v_media) THEN
    RAISE EXCEPTION 'Invalid media file extension';
  END IF;
  IF array_length(string_to_array(v_media, '/'), 1) <> 3 THEN
    RAISE EXCEPTION 'Invalid media storage path format';
  END IF;
  IF split_part(v_media, '/', 1) <> auth.uid()::text THEN
    RAISE EXCEPTION 'Media path must belong to current user';
  END IF;

  IF split_part(v_media, '/', 2) <> p_submission_id::text THEN
    RAISE EXCEPTION 'Media path must reference this submission';
  END IF;

  IF split_part(v_media, '/', 3) = '' THEN
    RAISE EXCEPTION 'Invalid media file name in path';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = 'experience-submissions'
      AND o.name = v_media
      AND split_part(o.name, '/', 1) = auth.uid()::text
      AND split_part(o.name, '/', 2) = p_submission_id::text
  ) THEN
    RAISE EXCEPTION 'Media file not found in storage';
  END IF;

  SELECT * INTO v_sub
  FROM public.experience_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  IF v_sub.customer_id <> public.get_customer_profile_id(v_sub.cafe_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_sub.status <> 'pending' THEN
    RAISE EXCEPTION 'Submission is not editable';
  END IF;

  UPDATE public.experience_submissions
  SET media_storage_path = v_media
  WHERE id = p_submission_id;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_experience_submission_media(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_experience_submission_media(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_experience_submission_metrics(
  p_submission_id uuid,
  p_views int DEFAULT NULL,
  p_likes int DEFAULT NULL,
  p_comments int DEFAULT NULL,
  p_shares int DEFAULT NULL
)
RETURNS public.experience_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub public.experience_submissions%ROWTYPE;
  v_campaign public.experience_campaigns%ROWTYPE;
  v_views int;
  v_likes int;
  v_comments int;
  v_shares int;
  v_suggested int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_sub
  FROM public.experience_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  IF NOT (
    public.is_platform_admin()
    OR public.is_cafe_owner(v_sub.cafe_id)
    OR public.has_cafe_permission(v_sub.cafe_id, 'marketing')
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_campaign
  FROM public.experience_campaigns
  WHERE id = v_sub.campaign_id
    AND cafe_id = v_sub.cafe_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  v_views := COALESCE(p_views, v_sub.views, 0);
  v_likes := COALESCE(p_likes, v_sub.likes, 0);
  v_comments := COALESCE(p_comments, v_sub.comments, 0);
  v_shares := COALESCE(p_shares, v_sub.shares, 0);

  v_suggested := v_campaign.base_points
    + (v_views / 100) * v_campaign.points_per_view::numeric
    + v_likes * v_campaign.points_per_like::numeric
    + v_comments * v_campaign.points_per_comment::numeric;
  v_suggested := LEAST(floor(v_suggested)::int, v_campaign.max_points_per_submission);

  UPDATE public.experience_submissions
  SET views = v_views,
      likes = v_likes,
      comments = v_comments,
      shares = v_shares,
      suggested_points = v_suggested,
      updated_at = now()
  WHERE id = p_submission_id
  RETURNING * INTO v_sub;

  RETURN v_sub;
END;
$$;
REVOKE ALL ON FUNCTION public.update_experience_submission_metrics(uuid, int, int, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_experience_submission_metrics(uuid, int, int, int, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_experience_submission(
  p_submission_id uuid,
  p_rejection_reason text
)
RETURNS public.experience_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub public.experience_submissions%ROWTYPE;
  v_reason text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_reason := NULLIF(btrim(p_rejection_reason), '');
  IF v_reason IS NULL THEN
    v_reason := 'لم تستوفِ شروط الحملة';
  END IF;

  SELECT * INTO v_sub
  FROM public.experience_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  IF NOT (
    public.is_platform_admin()
    OR public.is_cafe_owner(v_sub.cafe_id)
    OR public.has_cafe_permission(v_sub.cafe_id, 'marketing')
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_sub.status <> 'pending' THEN
    RAISE EXCEPTION 'Submission is not pending';
  END IF;

  UPDATE public.experience_submissions
  SET status = 'rejected',
      rejection_reason = v_reason,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      updated_at = now()
  WHERE id = p_submission_id
  RETURNING * INTO v_sub;

  RETURN v_sub;
END;
$$;
REVOKE ALL ON FUNCTION public.reject_experience_submission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_experience_submission(uuid, text) TO authenticated;

DROP POLICY IF EXISTS reservations_customer_insert ON reservations;
DROP POLICY IF EXISTS reservations_cafe_update ON reservations;
DROP POLICY IF EXISTS reservation_responses_insert ON reservation_responses;
DROP POLICY IF EXISTS reservation_responses_read ON reservation_responses;
CREATE OR REPLACE FUNCTION public.create_customer_reservation(
  p_cafe_id uuid,
  p_event_type text,
  p_guests int,
  p_reservation_date date,
  p_reservation_time time,
  p_duration_minutes int DEFAULT NULL,
  p_branch_name text DEFAULT NULL,
  p_space_type text DEFAULT NULL,
  p_event_title text DEFAULT NULL,
  p_needs_decoration boolean DEFAULT false,
  p_needs_catering boolean DEFAULT false,
  p_budget_estimate numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_id uuid;
  v_profile public.customer_profiles%ROWTYPE;
  v_id uuid;
  c_max_guests constant int := 500;
  c_min_duration constant int := 15;
  c_max_duration constant int := 480;
  c_max_text constant int := 200;
  c_max_notes constant int := 500;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  PERFORM public.assert_cafe_open_to_customers(p_cafe_id);
  v_customer_id := public.get_customer_profile_id(p_cafe_id);
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer profile not found';
  END IF;
  SELECT * INTO v_profile
  FROM public.customer_profiles
  WHERE id = v_customer_id;
  IF p_guests IS NULL OR p_guests <= 0 OR p_guests > c_max_guests THEN
    RAISE EXCEPTION 'Invalid guests count';
  END IF;
  IF p_reservation_date < current_date THEN
    RAISE EXCEPTION 'Reservation date cannot be in the past';
  END IF;
  IF p_duration_minutes IS NOT NULL
     AND (p_duration_minutes < c_min_duration OR p_duration_minutes > c_max_duration) THEN
    RAISE EXCEPTION 'Invalid duration';
  END IF;
  IF char_length(p_event_type) > c_max_text THEN
    RAISE EXCEPTION 'Event type too long';
  END IF;
  IF p_branch_name IS NOT NULL AND char_length(p_branch_name) > c_max_text THEN
    RAISE EXCEPTION 'Branch name too long';
  END IF;
  IF p_space_type IS NOT NULL AND char_length(p_space_type) > c_max_text THEN
    RAISE EXCEPTION 'Space type too long';
  END IF;
  IF p_event_title IS NOT NULL AND char_length(p_event_title) > c_max_text THEN
    RAISE EXCEPTION 'Event title too long';
  END IF;
  IF p_notes IS NOT NULL AND char_length(p_notes) > c_max_notes THEN
    RAISE EXCEPTION 'Notes too long';
  END IF;
  INSERT INTO public.reservations (
    cafe_id, customer_id, customer_name, phone, event_type, guests,
    reservation_date, reservation_time, duration_minutes, branch_name,
    space_type, event_title, needs_decoration, needs_catering,
    budget_estimate, notes, status
  ) VALUES (
    p_cafe_id, v_customer_id, v_profile.full_name, v_profile.phone, p_event_type, p_guests,
    p_reservation_date, p_reservation_time, p_duration_minutes, NULLIF(btrim(p_branch_name), ''),
    NULLIF(btrim(p_space_type), ''), NULLIF(btrim(p_event_title), ''), p_needs_decoration, p_needs_catering,
    p_budget_estimate, NULLIF(btrim(p_notes), ''), 'pending'
  )
  RETURNING id INTO v_id;
  PERFORM public.internal_notify_cafe(
    p_cafe_id,
    'حجز جديد',
    'حجز من ' || v_profile.full_name,
    'new_reservation',
    jsonb_build_object('reservation_id', v_id)
  );
  PERFORM public.internal_notify_customer(
    p_cafe_id,
    v_customer_id,
    'تم إرسال طلب الحجز',
    'طلبك (' || p_event_type || ') بانتظار رد الكوفي. سنبلغك عند القبول أو الرفض.',
    'new_reservation',
    jsonb_build_object('reservation_id', v_id)
  );
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_customer_reservation(uuid, text, int, date, time, int, text, text, text, boolean, boolean, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_customer_reservation(uuid, text, int, date, time, int, text, text, text, boolean, boolean, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_to_reservation(
  p_reservation_id uuid,
  p_status reservation_status,
  p_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_res public.reservations%ROWTYPE;
  v_msg text;
  c_max_message constant int := 500;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_status NOT IN ('accepted', 'rejected', 'modification_requested') THEN
    RAISE EXCEPTION 'Invalid reservation status transition';
  END IF;

  v_msg := NULLIF(btrim(p_message), '');
  IF v_msg IS NOT NULL AND char_length(v_msg) > c_max_message THEN
    RAISE EXCEPTION 'Message too long';
  END IF;

  SELECT * INTO v_res
  FROM public.reservations
  WHERE id = p_reservation_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  IF NOT (
    public.is_platform_admin()
    OR public.is_cafe_owner(v_res.cafe_id)
    OR public.has_cafe_permission(v_res.cafe_id, 'reservations')
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_res.status <> 'pending' THEN
    RAISE EXCEPTION 'Reservation is not pending';
  END IF;

  UPDATE public.reservations
  SET status = p_status,
      cafe_message = CASE WHEN p_status = 'rejected' THEN NULL ELSE v_msg END,
      rejection_reason = CASE WHEN p_status = 'rejected' THEN COALESCE(v_msg, 'تم رفض الحجز') ELSE NULL END,
      updated_at = now()
  WHERE id = p_reservation_id;

  INSERT INTO public.reservation_responses (
    reservation_id, responder_id, status, message
  ) VALUES (
    p_reservation_id, auth.uid(), p_status, v_msg
  );

  PERFORM public.internal_notify_customer(
    v_res.cafe_id,
    v_res.customer_id,
    CASE p_status
      WHEN 'accepted' THEN 'تم قبول حجزك'
      WHEN 'rejected' THEN 'تم رفض حجزك'
      ELSE 'طلب تعديل على حجزك'
    END,
    COALESCE(v_msg, 'تم تحديث حالة حجزك.'),
    'reservation_response',
    jsonb_build_object('reservation_id', p_reservation_id, 'status', p_status)
  );

  PERFORM public.write_audit_log(
    v_res.cafe_id,
    'respond_to_reservation',
    'reservations',
    p_reservation_id,
    jsonb_build_object('status', p_status, 'message', v_msg)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.respond_to_reservation(uuid, reservation_status, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_reservation(uuid, reservation_status, text) TO authenticated;

-- =============================================================================
-- 5. Notifications — no direct UPDATE; restricted create RPCs
-- =============================================================================
DROP POLICY IF EXISTS notifications_update_read ON notifications;
DROP POLICY IF EXISTS notifications_cafe_update_read ON notifications;
CREATE OR REPLACE FUNCTION public.mark_customer_notification_read(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE public.notifications n
  SET read = true
  WHERE n.id = p_notification_id
    AND n.audience = 'customer'
    AND n.customer_id = public.get_customer_profile_id(n.cafe_id)
    AND n.read = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification not found or forbidden';
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.mark_cafe_notification_read(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cafe_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT cafe_id INTO v_cafe_id
  FROM public.notifications
  WHERE id = p_notification_id
    AND audience = 'cafe';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification not found';
  END IF;
  IF NOT (
    public.is_platform_admin()
    OR public.is_cafe_owner(v_cafe_id)
    OR public.has_cafe_permission(v_cafe_id, 'notifications')
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.notifications
  SET read = true
  WHERE id = p_notification_id
    AND audience = 'cafe'
    AND read = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification not found or already read';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_customer_notification_read(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_cafe_notification_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_customer_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_cafe_notification_read(uuid) TO authenticated;
DROP POLICY IF EXISTS notifications_insert ON notifications;
CREATE OR REPLACE FUNCTION public.create_cafe_notification(
  p_cafe_id uuid,
  p_title text,
  p_body text,
  p_type text,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF NOT (
    public.has_cafe_permission(p_cafe_id, 'notifications')
    OR public.is_cafe_owner(p_cafe_id)
    OR public.is_platform_admin()
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN public.internal_notify_cafe(p_cafe_id, p_title, p_body, p_type, p_meta);
END;
$$;
CREATE OR REPLACE FUNCTION public.create_customer_notification(
  p_cafe_id uuid,
  p_customer_id uuid,
  p_title text,
  p_body text,
  p_type text,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF NOT (
    public.has_cafe_permission(p_cafe_id, 'notifications')
    OR public.is_cafe_owner(p_cafe_id)
    OR public.is_platform_admin()
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.customer_profiles cp
    WHERE cp.id = p_customer_id
      AND cp.cafe_id = p_cafe_id
  ) THEN
    RAISE EXCEPTION 'Customer not found in this cafe';
  END IF;
  INSERT INTO public.notifications (cafe_id, audience, customer_id, title, body, type, meta)
  VALUES (p_cafe_id, 'customer', p_customer_id, p_title, p_body, p_type, p_meta)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_cafe_notification(uuid, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_customer_notification(uuid, uuid, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_cafe_notification(uuid, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_notification(uuid, uuid, text, text, text, jsonb) TO authenticated;
DROP FUNCTION IF EXISTS public.create_customer_self_notification(uuid, text, text, text, jsonb);
-- =============================================================================
-- 6. Loyalty — RPC only for balance/transaction writes
-- =============================================================================
DROP POLICY IF EXISTS loyalty_transactions_insert_staff ON loyalty_transactions;
DROP POLICY IF EXISTS loyalty_accounts_update ON loyalty_accounts;
CREATE OR REPLACE FUNCTION public.adjust_loyalty_points(
  p_cafe_id uuid,
  p_customer_id uuid,
  p_amount int,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account public.loyalty_accounts%ROWTYPE;
  v_new_balance int;
  c_max_reason constant int := 500;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF NOT (
    public.has_cafe_permission(p_cafe_id, 'loyalty')
    OR public.is_cafe_owner(p_cafe_id)
    OR public.is_platform_admin()
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_amount = 0 THEN
    RAISE EXCEPTION 'Amount must not be zero';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR char_length(p_reason) > c_max_reason THEN
    RAISE EXCEPTION 'Invalid reason';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.customer_profiles cp
    WHERE cp.id = p_customer_id
      AND cp.cafe_id = p_cafe_id
  ) THEN
    RAISE EXCEPTION 'Customer not found in this cafe';
  END IF;
  SELECT * INTO v_account
  FROM public.loyalty_accounts
  WHERE cafe_id = p_cafe_id AND customer_id = p_customer_id
  FOR UPDATE;
  IF FOUND THEN
    v_new_balance := v_account.balance + p_amount;
  ELSE
    IF p_amount < 0 THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;
    v_new_balance := p_amount;
  END IF;
  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;
  INSERT INTO public.loyalty_transactions (
    cafe_id, customer_id, amount, reason, reference_type, reference_id, created_by
  ) VALUES (
    p_cafe_id, p_customer_id, p_amount, btrim(p_reason), 'manual_adjustment', NULL, auth.uid()
  );
  IF v_account.id IS NOT NULL THEN
    UPDATE public.loyalty_accounts
    SET balance = v_new_balance
    WHERE id = v_account.id;
  ELSE
    INSERT INTO public.loyalty_accounts (cafe_id, customer_id, balance)
    VALUES (p_cafe_id, p_customer_id, v_new_balance);
  END IF;
  PERFORM public.write_audit_log(
    p_cafe_id,
    'adjust_loyalty_points',
    'loyalty_accounts',
    p_customer_id,
    jsonb_build_object('amount', p_amount, 'reason', p_reason, 'new_balance', v_new_balance)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.adjust_loyalty_points(uuid, uuid, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_loyalty_points(uuid, uuid, int, text) TO authenticated;
-- =============================================================================
-- 7. Permission-scoped staff policies
-- =============================================================================
DROP POLICY IF EXISTS loyalty_rules_staff ON loyalty_rules;
CREATE POLICY loyalty_rules_public_read ON loyalty_rules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.cafes c
      WHERE c.id = cafe_id AND c.is_public AND c.status = 'active' AND c.deleted_at IS NULL
    )
    OR public.has_cafe_permission(cafe_id, 'loyalty')
    OR public.is_cafe_owner(cafe_id)
    OR public.is_platform_admin()
  );
CREATE POLICY loyalty_rules_write ON loyalty_rules
  FOR ALL USING (
    public.has_cafe_permission(cafe_id, 'loyalty') OR public.is_cafe_owner(cafe_id) OR public.is_platform_admin()
  );
DROP POLICY IF EXISTS experience_campaigns_staff ON experience_campaigns;
CREATE POLICY experience_campaigns_write ON experience_campaigns
  FOR ALL USING (
    public.has_cafe_permission(cafe_id, 'marketing') OR public.is_cafe_owner(cafe_id) OR public.is_platform_admin()
  );
DROP POLICY IF EXISTS branches_staff ON branches;
CREATE POLICY branches_write ON branches
  FOR ALL USING (
    public.has_cafe_permission(cafe_id, 'branches') OR public.is_cafe_owner(cafe_id) OR public.is_platform_admin()
  );
DROP POLICY IF EXISTS reviews_cafe_update ON reviews;
CREATE OR REPLACE FUNCTION public.enforce_review_owner_reply_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NOT (
      public.is_platform_admin()
      OR public.is_cafe_owner(NEW.cafe_id)
      OR public.has_cafe_permission(NEW.cafe_id, 'reviews')
    ) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
    IF NEW.rating IS DISTINCT FROM OLD.rating
       OR NEW.comment IS DISTINCT FROM OLD.comment
       OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
       OR NEW.product_id IS DISTINCT FROM OLD.product_id
       OR NEW.cafe_id IS DISTINCT FROM OLD.cafe_id THEN
      RAISE EXCEPTION 'Only owner_reply may be modified';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS reviews_owner_reply_only ON reviews;
CREATE TRIGGER reviews_owner_reply_only
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION public.enforce_review_owner_reply_only();
CREATE POLICY reviews_owner_reply_update ON reviews
  FOR UPDATE USING (
    public.has_cafe_permission(cafe_id, 'reviews') OR public.is_cafe_owner(cafe_id) OR public.is_platform_admin()
  );
CREATE OR REPLACE FUNCTION public.set_review_owner_reply(
  p_review_id uuid,
  p_owner_reply text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cafe_id uuid;
BEGIN
  SELECT cafe_id INTO v_cafe_id FROM public.reviews WHERE id = p_review_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review not found';
  END IF;
  IF NOT (
    public.is_platform_admin()
    OR public.is_cafe_owner(v_cafe_id)
    OR public.has_cafe_permission(v_cafe_id, 'reviews')
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.reviews SET owner_reply = p_owner_reply WHERE id = p_review_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_review_owner_reply(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_review_owner_reply(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_customer_review(
  p_cafe_id uuid,
  p_product_id uuid,
  p_rating int,
  p_comment text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_id uuid;
  v_profile public.customer_profiles%ROWTYPE;
  v_id uuid;
  c_max_comment constant int := 2000;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  PERFORM public.assert_cafe_open_to_customers(p_cafe_id);

  v_customer_id := public.get_customer_profile_id(p_cafe_id);
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer profile not found';
  END IF;

  SELECT * INTO v_profile
  FROM public.customer_profiles
  WHERE id = v_customer_id
    AND cafe_id = p_cafe_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer profile mismatch';
  END IF;

  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Invalid rating';
  END IF;

  IF p_comment IS NOT NULL AND char_length(p_comment) > c_max_comment THEN
    RAISE EXCEPTION 'Comment too long';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.menu_products mp
    WHERE mp.id = p_product_id
      AND mp.cafe_id = p_cafe_id
      AND mp.deleted_at IS NULL
      AND mp.available = true
  ) THEN
    RAISE EXCEPTION 'Product not found or not available';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.reviews r
    WHERE r.cafe_id = p_cafe_id
      AND r.product_id = p_product_id
      AND r.customer_id = v_customer_id
  ) THEN
    RAISE EXCEPTION 'Review already submitted for this product';
  END IF;

  INSERT INTO public.reviews (
    cafe_id, product_id, customer_id, customer_name, rating, comment
  ) VALUES (
    p_cafe_id,
    p_product_id,
    v_customer_id,
    v_profile.full_name,
    p_rating,
    NULLIF(btrim(p_comment), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_customer_review(uuid, uuid, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_customer_review(uuid, uuid, int, text) TO authenticated;

-- =============================================================================
-- 8. profiles INSERT — force customer role
-- =============================================================================
DROP POLICY IF EXISTS profiles_insert_own ON profiles;
CREATE POLICY profiles_insert_own ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    (id = auth.uid() AND role = 'customer' AND status = 'active')
    OR public.is_platform_admin()
  );
-- =============================================================================
-- =============================================================================
-- =============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_profiles_unique_user_cafe
  ON public.customer_profiles(cafe_id, user_id)
  WHERE user_id IS NOT NULL;

DROP POLICY IF EXISTS customer_profiles_own ON public.customer_profiles;
DROP POLICY IF EXISTS customer_profiles_update ON public.customer_profiles;
DROP POLICY IF EXISTS customer_profiles_insert ON public.customer_profiles;

CREATE OR REPLACE FUNCTION public.set_customer_avatar_storage_path(
  p_profile_id uuid,
  p_storage_path text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_storage_path IS NULL OR btrim(p_storage_path) = '' THEN
    RAISE EXCEPTION 'Storage path required';
  END IF;
  IF NOT public.storage_object_path_is_safe(p_storage_path) THEN
    RAISE EXCEPTION 'Invalid storage path';
  END IF;
  IF split_part(p_storage_path, '/', 1) <> auth.uid()::text THEN
    RAISE EXCEPTION 'Avatar path must belong to current user';
  END IF;
  IF split_part(p_storage_path, '/', 2) = '' THEN
    RAISE EXCEPTION 'Invalid storage path';
  END IF;
  IF array_length(string_to_array(p_storage_path, '/'), 1) <> 2 THEN
    RAISE EXCEPTION 'Invalid avatar path format';
  END IF;
  IF NOT public.storage_path_has_allowed_image_ext(p_storage_path) THEN
    RAISE EXCEPTION 'Invalid avatar file extension';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = 'customer-avatars'
      AND o.name = p_storage_path
      AND split_part(o.name, '/', 1) = auth.uid()::text
  ) THEN
    RAISE EXCEPTION 'Avatar file not found in storage';
  END IF;

  PERFORM set_config('barndaksa.avatar_path_update', '1', true);

  UPDATE public.customer_profiles
  SET avatar_storage_path = p_storage_path,
      avatar_url = NULL,
      updated_at = now()
  WHERE id = p_profile_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    PERFORM set_config('barndaksa.avatar_path_update', '', true);
    RAISE EXCEPTION 'Profile not found or forbidden';
  END IF;

  PERFORM set_config('barndaksa.avatar_path_update', '', true);
END;
$$;
REVOKE ALL ON FUNCTION public.set_customer_avatar_storage_path(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_customer_avatar_storage_path(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_customer_profile_update_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.avatar_url := NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.avatar_url := NULL;

    IF (NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.cafe_id IS DISTINCT FROM OLD.cafe_id)
       AND NOT public.is_platform_admin() THEN
      RAISE EXCEPTION 'Cannot reassign customer profile';
    END IF;
    IF NEW.avatar_storage_path IS DISTINCT FROM OLD.avatar_storage_path THEN
      IF NEW.avatar_storage_path IS NOT NULL
         AND NOT public.storage_object_path_is_safe(NEW.avatar_storage_path) THEN
        RAISE EXCEPTION 'Invalid avatar storage path';
      END IF;
      IF NEW.avatar_storage_path IS NOT NULL
         AND split_part(NEW.avatar_storage_path, '/', 1) <> OLD.user_id::text THEN
        RAISE EXCEPTION 'Avatar path must belong to profile user';
      END IF;
      IF NOT public.is_platform_admin()
         AND COALESCE(current_setting('barndaksa.avatar_path_update', true), '') <> '1' THEN
        RAISE EXCEPTION 'Avatar path can only be updated via upload';
      END IF;
    END IF;
    IF auth.uid() IS NOT NULL
       AND OLD.user_id = auth.uid()
       AND NOT public.is_platform_admin()
       AND NOT public.is_cafe_owner(OLD.cafe_id)
       AND NOT public.has_cafe_permission(OLD.cafe_id, 'customers') THEN
      IF NEW.id IS DISTINCT FROM OLD.id
         OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Forbidden customer profile change';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_customer_profile_update_rules() FROM PUBLIC;
DROP TRIGGER IF EXISTS customer_profiles_immutable_binding ON public.customer_profiles;
CREATE TRIGGER customer_profiles_immutable_binding
  BEFORE INSERT OR UPDATE ON public.customer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_customer_profile_update_rules();
-- =============================================================================
-- 10. domain_orders — cancel via RPC only
-- =============================================================================
DROP POLICY IF EXISTS domain_orders_owner_cancel ON domain_orders;

CREATE OR REPLACE FUNCTION public.create_domain_order(
  p_cafe_id uuid,
  p_domain text,
  p_tld text,
  p_years int,
  p_auto_renew boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_domain text;
  v_tld text;
  c_max_domain constant int := 253;
  c_max_tld constant int := 63;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT (public.is_cafe_owner(p_cafe_id) OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_domain := lower(btrim(p_domain));
  v_tld := lower(btrim(p_tld));

  IF v_domain = '' OR char_length(v_domain) > c_max_domain THEN
    RAISE EXCEPTION 'Invalid domain';
  END IF;
  IF v_tld = '' OR char_length(v_tld) > c_max_tld OR v_tld !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'Invalid TLD';
  END IF;
  IF p_years IS NULL OR p_years <= 0 OR p_years > 10 THEN
    RAISE EXCEPTION 'Invalid years';
  END IF;

  INSERT INTO public.domain_orders (
    cafe_id, requested_by, domain, tld, years, auto_renew,
    price_estimate, currency, status,
    provider, provider_order_id, error_message,
    reviewed_by, reviewed_at, completed_at
  ) VALUES (
    p_cafe_id, auth.uid(), v_domain, v_tld, p_years, COALESCE(p_auto_renew, false),
    NULL, 'SAR', 'pending_review',
    NULL, NULL, NULL,
    NULL, NULL, NULL
  )
  RETURNING id INTO v_id;

  PERFORM public.write_audit_log(
    p_cafe_id,
    'create_domain_order',
    'domain_orders',
    v_id,
    jsonb_build_object('domain', v_domain, 'tld', v_tld, 'years', p_years)
  );

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_domain_order(uuid, text, text, int, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_domain_order(uuid, text, text, int, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_domain_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.domain_orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT * INTO v_order FROM public.domain_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF NOT (public.is_cafe_owner(v_order.cafe_id) OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF v_order.status <> 'pending_review' THEN
    RAISE EXCEPTION 'Only pending_review orders can be cancelled';
  END IF;
  UPDATE public.domain_orders SET status = 'cancelled' WHERE id = p_order_id;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_domain_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_domain_order(uuid) TO authenticated;

-- =============================================================================
-- 11. Defensive DROP of legacy policy names (superseded in 001–003)
-- =============================================================================
DROP POLICY IF EXISTS orders_customer_read ON public.orders;
DROP POLICY IF EXISTS orders_customer_insert ON public.orders;
DROP POLICY IF EXISTS orders_cafe_update ON public.orders;
DROP POLICY IF EXISTS order_items_read ON public.order_items;
DROP POLICY IF EXISTS order_items_insert ON public.order_items;
DROP POLICY IF EXISTS reservations_customer_read ON public.reservations;
DROP POLICY IF EXISTS reservations_customer_insert ON public.reservations;
DROP POLICY IF EXISTS reservations_cafe_update ON public.reservations;
DROP POLICY IF EXISTS reservation_responses_read ON public.reservation_responses;
DROP POLICY IF EXISTS reservation_responses_insert ON public.reservation_responses;
DROP POLICY IF EXISTS notifications_read ON public.notifications;
DROP POLICY IF EXISTS notifications_update_read ON public.notifications;
DROP POLICY IF EXISTS audit_logs_read ON public.audit_logs;
DROP POLICY IF EXISTS subscriptions_cafe ON public.subscriptions;
DROP POLICY IF EXISTS loyalty_accounts_read ON public.loyalty_accounts;
DROP POLICY IF EXISTS loyalty_accounts_update ON public.loyalty_accounts;
DROP POLICY IF EXISTS domain_orders_insert ON public.domain_orders;
DROP POLICY IF EXISTS domain_orders_owner_cancel ON public.domain_orders;
DROP POLICY IF EXISTS reviews_customer_insert ON public.reviews;
DROP POLICY IF EXISTS reviews_cafe_update ON public.reviews;
DROP POLICY IF EXISTS experience_submissions_insert ON public.experience_submissions;
DROP POLICY IF EXISTS experience_submissions_customer ON public.experience_submissions;
DROP POLICY IF EXISTS experience_submissions_review ON public.experience_submissions;
DROP POLICY IF EXISTS platform_settings_read ON public.platform_settings;
DROP POLICY IF EXISTS customer_profiles_insert ON public.customer_profiles;

-- =============================================================================
-- 12. Customer profile creation — RPC only (no direct INSERT from client)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_customer_profile(
  p_cafe_id uuid,
  p_full_name text,
  p_phone text,
  p_email text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  c_max_name constant int := 200;
  c_max_phone constant int := 20;
  c_max_email constant int := 320;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  PERFORM public.assert_cafe_open_to_customers(p_cafe_id);

  IF p_full_name IS NULL OR btrim(p_full_name) = '' OR char_length(p_full_name) > c_max_name THEN
    RAISE EXCEPTION 'Invalid full name';
  END IF;
  IF p_phone IS NULL OR btrim(p_phone) = '' OR char_length(p_phone) > c_max_phone THEN
    RAISE EXCEPTION 'Invalid phone';
  END IF;
  IF p_email IS NOT NULL AND char_length(p_email) > c_max_email THEN
    RAISE EXCEPTION 'Invalid email';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.customer_profiles cp
    WHERE cp.cafe_id = p_cafe_id
      AND cp.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Profile already exists for this cafe';
  END IF;

  INSERT INTO public.customer_profiles (
    cafe_id, user_id, full_name, phone, email
  ) VALUES (
    p_cafe_id,
    auth.uid(),
    btrim(p_full_name),
    btrim(p_phone),
    NULLIF(btrim(p_email), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_customer_profile(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_customer_profile(uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_customer_profile(
  p_cafe_id uuid,
  p_full_name text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max_name constant int := 200;
  c_max_phone constant int := 20;
  c_max_email constant int := 320;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_full_name IS NULL OR btrim(p_full_name) = '' OR char_length(p_full_name) > c_max_name THEN
    RAISE EXCEPTION 'Invalid full name';
  END IF;
  IF p_phone IS NOT NULL AND (btrim(p_phone) = '' OR char_length(p_phone) > c_max_phone) THEN
    RAISE EXCEPTION 'Invalid phone';
  END IF;
  IF p_email IS NOT NULL AND char_length(p_email) > c_max_email THEN
    RAISE EXCEPTION 'Invalid email';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.customer_profiles cp
    WHERE cp.cafe_id = p_cafe_id
      AND cp.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Profile not found or forbidden';
  END IF;

  UPDATE public.customer_profiles
  SET full_name = btrim(p_full_name),
      email = NULLIF(btrim(p_email), ''),
      phone = COALESCE(NULLIF(btrim(p_phone), ''), phone),
      avatar_url = NULL,
      updated_at = now()
  WHERE cafe_id = p_cafe_id
    AND user_id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.update_customer_profile(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_customer_profile(uuid, text, text, text) TO authenticated;

-- ============================================================
-- END MIGRATION 004
-- ============================================================

