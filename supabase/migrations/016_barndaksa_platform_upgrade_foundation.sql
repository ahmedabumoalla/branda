-- Barndaksa platform upgrade foundation
-- Version: 016
-- Safe additive migration for product offers, reservation check-in, customer state and visit analytics

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'blocked')),
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_reason text;

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS checkin_code text UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
  ADD COLUMN IF NOT EXISTS checkin_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS checkin_used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.reservation_service_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  price numeric(12,2),
  max_guests integer,
  available_periods jsonb NOT NULL DEFAULT '[]'::jsonb,
  media jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservation_service_types_cafe
  ON public.reservation_service_types(cafe_id, active, sort_order);

CREATE TABLE IF NOT EXISTS public.cafe_visit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  customer_profile_id uuid REFERENCES public.customer_profiles(id) ON DELETE SET NULL,
  visitor_token text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('page_view', 'product_view', 'order_started', 'order_created', 'reservation_started', 'reservation_created', 'pwa_install_clicked', 'loyalty_card_loaded')),
  session_id text NOT NULL,
  duration_seconds integer,
  path text,
  referrer text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cafe_visit_events_cafe_created
  ON public.cafe_visit_events(cafe_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cafe_visit_events_session
  ON public.cafe_visit_events(cafe_id, session_id);

CREATE TABLE IF NOT EXISTS public.product_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.menu_products(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  storage_path text NOT NULL,
  thumbnail_path text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_media_product
  ON public.product_media(product_id, sort_order);

CREATE TABLE IF NOT EXISTS public.offer_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  offer_id uuid REFERENCES public.offers(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  storage_path text NOT NULL,
  thumbnail_path text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offer_media_offer
  ON public.offer_media(offer_id, sort_order);

ALTER TABLE public.reservation_service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cafe_visit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reservation_service_owner ON public.reservation_service_types;
CREATE POLICY reservation_service_owner ON public.reservation_service_types
  FOR ALL TO authenticated
  USING (public.has_cafe_access(cafe_id) OR public.is_platform_admin())
  WITH CHECK (public.has_cafe_access(cafe_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS reservation_service_public ON public.reservation_service_types;
CREATE POLICY reservation_service_public ON public.reservation_service_types
  FOR SELECT TO anon, authenticated
  USING (active = true);

DROP POLICY IF EXISTS visit_events_owner_read ON public.cafe_visit_events;
CREATE POLICY visit_events_owner_read ON public.cafe_visit_events
  FOR SELECT TO authenticated
  USING (public.has_cafe_access(cafe_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS product_media_owner ON public.product_media;
CREATE POLICY product_media_owner ON public.product_media
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS offer_media_owner ON public.offer_media;
CREATE POLICY offer_media_owner ON public.offer_media
  FOR SELECT TO anon, authenticated
  USING (true);

GRANT SELECT ON public.reservation_service_types TO anon, authenticated;
GRANT SELECT ON public.product_media TO anon, authenticated;
GRANT SELECT ON public.offer_media TO anon, authenticated;
GRANT SELECT ON public.cafe_visit_events TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_service_types TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cafe_visit_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_media TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offer_media TO service_role;

COMMIT;

SELECT 'platform_upgrade_foundation_ready' AS status;
