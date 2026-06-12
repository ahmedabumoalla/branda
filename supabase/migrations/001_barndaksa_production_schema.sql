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
