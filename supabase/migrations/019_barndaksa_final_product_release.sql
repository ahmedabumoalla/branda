-- Barndaksa final product release upgrade
-- Version 019

BEGIN;

ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS location_radius_meters integer NOT NULL DEFAULT 50;
ALTER TABLE public.cafes ADD COLUMN IF NOT EXISTS public_code text;
UPDATE public.cafes SET public_code = upper(substr(replace(id::text, '-', ''), 1, 10)) WHERE public_code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cafes_public_code_unique ON public.cafes(public_code);

ALTER TABLE public.menu_products ADD COLUMN IF NOT EXISTS media jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.menu_products ADD COLUMN IF NOT EXISTS video_storage_path text;
ALTER TABLE public.menu_products ADD COLUMN IF NOT EXISTS gallery_storage_paths text[] NOT NULL DEFAULT '{}';
UPDATE public.menu_products SET loyalty_points = 0, redeemable_with_points = false, redemption_points = NULL WHERE loyalty_points IS DISTINCT FROM 0 OR redeemable_with_points IS DISTINCT FROM false OR redemption_points IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.home_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  subtitle text NOT NULL DEFAULT '',
  image_storage_path text,
  link_url text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.experience_proof_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  customer_name text NOT NULL DEFAULT '',
  contact text NOT NULL DEFAULT '',
  proof_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','rewarded')),
  views_count integer NOT NULL DEFAULT 0,
  likes_count integer NOT NULL DEFAULT 0,
  comments_count integer NOT NULL DEFAULT 0,
  reward_description text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brand_support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid REFERENCES public.cafes(id) ON DELETE SET NULL,
  requester_name text NOT NULL DEFAULT '',
  requester_phone text NOT NULL DEFAULT '',
  requester_email text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_products_public_fast ON public.menu_products(cafe_id, available, sort_order) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_menu_categories_public_fast ON public.menu_categories(cafe_id, visible, sort_order) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_cashier_fast ON public.orders(cafe_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reservations_cashier_fast ON public.reservations(cafe_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cafe_visit_events_fast ON public.cafe_visit_events(cafe_id, session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_admin_fast ON public.brand_support_tickets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_experience_links_cafe_fast ON public.experience_proof_links(cafe_id, status, created_at DESC);

ALTER TABLE public.home_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experience_proof_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_banners_owner_all ON public.home_banners;
CREATE POLICY home_banners_owner_all ON public.home_banners FOR ALL TO authenticated USING (public.has_cafe_access(cafe_id) OR public.is_platform_admin()) WITH CHECK (public.has_cafe_access(cafe_id) OR public.is_platform_admin());
DROP POLICY IF EXISTS home_banners_public_read ON public.home_banners;
CREATE POLICY home_banners_public_read ON public.home_banners FOR SELECT TO anon, authenticated USING (active = true);

DROP POLICY IF EXISTS experience_links_owner_read ON public.experience_proof_links;
CREATE POLICY experience_links_owner_read ON public.experience_proof_links FOR SELECT TO authenticated USING (public.has_cafe_access(cafe_id) OR public.is_platform_admin());
DROP POLICY IF EXISTS experience_links_public_insert ON public.experience_proof_links;
CREATE POLICY experience_links_public_insert ON public.experience_proof_links FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS support_tickets_admin_read ON public.brand_support_tickets;
CREATE POLICY support_tickets_admin_read ON public.brand_support_tickets FOR SELECT TO authenticated USING (public.is_platform_admin() OR (cafe_id IS NOT NULL AND public.has_cafe_access(cafe_id)));
DROP POLICY IF EXISTS support_tickets_public_insert ON public.brand_support_tickets;
CREATE POLICY support_tickets_public_insert ON public.brand_support_tickets FOR INSERT TO anon, authenticated WITH CHECK (true);

COMMIT;
SELECT 'barndaksa_final_product_release_ready' AS status;
