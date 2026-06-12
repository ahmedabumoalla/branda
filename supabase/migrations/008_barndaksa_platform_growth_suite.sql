-- Barndaksa Platform — Public content, contacts, careers and representative referrals
-- Version: 008
-- Run after 007_barndaksa_platform_plans_description_fix.sql
-- TARGET: barndaksa-production

BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_home_settings (
  id text PRIMARY KEY DEFAULT 'home' CHECK (id = 'home'),
  hero_badge text NOT NULL,
  hero_title text NOT NULL,
  hero_description text NOT NULL,
  hero_side_text text NOT NULL DEFAULT '',
  features_title text NOT NULL,
  loyalty_description text NOT NULL,
  cta_title text NOT NULL,
  cta_description text NOT NULL,
  about_us text NOT NULL DEFAULT '',
  vision text NOT NULL DEFAULT '',
  mission text NOT NULL DEFAULT '',
  carousel_interval_seconds int NOT NULL DEFAULT 5 CHECK (carousel_interval_seconds BETWEEN 4 AND 12),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_home_settings (
  id, hero_badge, hero_title, hero_description, hero_side_text,
  features_title, loyalty_description, cta_title, cta_description,
  about_us, vision, mission, carousel_interval_seconds
) VALUES (
  'home',
  'شريكك التقني في تطوير علامتك التجارية',
  'منيو تفاعلي - بطاقات ولاء - تسويق في مكان واحد',
  'بارنداكسا تساعد العلامة التجارية في إدارة المنيو التفاعلي - نظام الحجوزات والطلبات - نظام العروض والخصومات - متابعة العملاء - بطاقات الولاء - وتقديم تقارير فورية وشاملة من لوحة تحكم واحدة',
  'ابن حضور علامتك الرقمية وقدم تجربة أسهل لعملائك من أول زيارة حتى تكرار الشراء',
  'كل ما تحتاجه لإدارة علامتك التجارية',
  'كل نقطة تقرب عميلك أكثر — برنامج ولاء مرن يكافئ الزيارات المتكررة ويحوّل الزائر إلى عميل دائم',
  'جاهز تطور علامتك التجارية ؟',
  'انضم الآن وابدأ رحلتك مع بارنداكسا — ابن منصتك التقنية وهويتك الرقمية في منصة واحدة',
  'بارنداكسا منصة تقنية تساعد العلامات التجارية في قطاع الضيافة على بناء حضور رقمي متكامل وإدارة تجربة العميل',
  'أن تصبح بارنداكسا الشريك التقني الأول للعلامات التجارية الطموحة في قطاع الضيافة',
  'تمكين العلامات التجارية من النمو بأدوات رقمية عملية تربط التشغيل بالتسويق والولاء',
  5
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.platform_contact_settings (
  id text PRIMARY KEY DEFAULT 'main' CHECK (id = 'main'),
  email citext,
  whatsapp text,
  instagram text,
  facebook text,
  tiktok text,
  x text,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_contact_settings (id)
VALUES ('main')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.platform_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placement text NOT NULL CHECK (placement IN ('hero', 'intro_video', 'loyalty_cards', 'social_post')),
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  alt_text text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_media_active_placement
  ON public.platform_media_assets(placement, sort_order)
  WHERE active = true;

CREATE TABLE IF NOT EXISTS public.platform_public_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('intro_video_click', 'intro_video_view')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_public_events_type_date
  ON public.platform_public_events(event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.platform_contact_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 120),
  email citext NOT NULL,
  message text NOT NULL CHECK (char_length(message) BETWEEN 5 AND 2000),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE CHECK (provider IN ('facebook', 'instagram', 'tiktok', 'x', 'whatsapp')),
  display_name text,
  handle text,
  status text NOT NULL DEFAULT 'ready_for_connection' CHECK (status IN ('ready_for_connection', 'connected', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_social_accounts (provider)
VALUES ('facebook'), ('instagram'), ('tiktok'), ('x'), ('whatsapp')
ON CONFLICT (provider) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.platform_social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 2200),
  channels text[] NOT NULL CHECK (array_length(channels, 1) >= 1),
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_social_post_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.platform_social_posts(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  mime_type text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  birth_date date NOT NULL,
  gender text NOT NULL CHECK (gender IN ('male', 'female')),
  experience text NOT NULL DEFAULT '',
  languages text NOT NULL,
  region text NOT NULL,
  phone text NOT NULL,
  email citext NOT NULL,
  cv_storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'accepted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_representatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_number text NOT NULL UNIQUE DEFAULT ('BR-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  full_name text NOT NULL,
  phone text NOT NULL,
  birth_date date NOT NULL,
  email citext NOT NULL UNIQUE,
  region text NOT NULL,
  nationality text NOT NULL,
  bank_account_number text NOT NULL,
  iban text NOT NULL,
  account_name text NOT NULL,
  swift_code text,
  bank_document_storage_path text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.representative_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  representative_id uuid NOT NULL REFERENCES public.platform_representatives(id) ON DELETE CASCADE,
  code citext NOT NULL UNIQUE,
  discount_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  free_trial_days int NOT NULL DEFAULT 0 CHECK (free_trial_days BETWEEN 0 AND 365),
  eligible_plan_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cafes
  ADD COLUMN IF NOT EXISTS representative_id uuid REFERENCES public.platform_representatives(id),
  ADD COLUMN IF NOT EXISTS referral_coupon_id uuid REFERENCES public.representative_coupons(id),
  ADD COLUMN IF NOT EXISTS referral_started_at timestamptz;

CREATE TABLE IF NOT EXISTS public.brand_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL UNIQUE REFERENCES public.cafes(id) ON DELETE CASCADE,
  representative_id uuid NOT NULL REFERENCES public.platform_representatives(id),
  coupon_id uuid NOT NULL REFERENCES public.representative_coupons(id),
  registered_at timestamptz NOT NULL DEFAULT now(),
  first_paid_subscription_at timestamptz,
  commission_end_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.representative_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  representative_id uuid NOT NULL REFERENCES public.platform_representatives(id),
  referral_id uuid NOT NULL REFERENCES public.brand_referrals(id),
  subscription_id uuid REFERENCES public.subscriptions(id),
  payment_request_id uuid UNIQUE REFERENCES public.subscription_payment_requests(id),
  commission_type text NOT NULL CHECK (commission_type IN ('initial', 'renewal')),
  base_amount_sar numeric(10,2) NOT NULL,
  rate_percent numeric(5,2) NOT NULL CHECK (rate_percent IN (20, 40)),
  amount_sar numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'accrued' CHECK (status IN ('accrued', 'paid', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('platform-media', 'platform-media', false, 125829120, ARRAY['image/jpeg','image/png','image/webp','image/avif','image/gif','video/mp4','video/webm','video/quicktime']),
  ('job-applications', 'job-applications', false, 8388608, ARRAY['application/pdf']),
  ('representative-documents', 'representative-documents', false, 8388608, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.platform_home_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_contact_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_public_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_contact_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_social_post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_representatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.representative_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.representative_commissions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.platform_home_settings,
  public.platform_contact_settings,
  public.platform_media_assets,
  public.platform_social_accounts,
  public.platform_social_posts,
  public.platform_social_post_media,
  public.platform_contact_requests,
  public.job_applications,
  public.platform_representatives,
  public.representative_coupons,
  public.brand_referrals,
  public.representative_commissions
TO authenticated;

DROP POLICY IF EXISTS platform_home_admin_manage ON public.platform_home_settings;
CREATE POLICY platform_home_admin_manage ON public.platform_home_settings
  FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS platform_contact_settings_admin_manage ON public.platform_contact_settings;
CREATE POLICY platform_contact_settings_admin_manage ON public.platform_contact_settings
  FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS platform_media_admin_manage ON public.platform_media_assets;
CREATE POLICY platform_media_admin_manage ON public.platform_media_assets
  FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS platform_social_accounts_admin_manage ON public.platform_social_accounts;
CREATE POLICY platform_social_accounts_admin_manage ON public.platform_social_accounts
  FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS platform_social_posts_admin_manage ON public.platform_social_posts;
CREATE POLICY platform_social_posts_admin_manage ON public.platform_social_posts
  FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS platform_social_post_media_admin_manage ON public.platform_social_post_media;
CREATE POLICY platform_social_post_media_admin_manage ON public.platform_social_post_media
  FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS platform_contact_requests_admin_read ON public.platform_contact_requests;
CREATE POLICY platform_contact_requests_admin_read ON public.platform_contact_requests
  FOR SELECT TO authenticated USING (public.is_platform_admin());

DROP POLICY IF EXISTS job_applications_admin_manage ON public.job_applications;
CREATE POLICY job_applications_admin_manage ON public.job_applications
  FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS platform_representatives_admin_manage ON public.platform_representatives;
CREATE POLICY platform_representatives_admin_manage ON public.platform_representatives
  FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS representative_coupons_admin_manage ON public.representative_coupons;
CREATE POLICY representative_coupons_admin_manage ON public.representative_coupons
  FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS brand_referrals_admin_read ON public.brand_referrals;
CREATE POLICY brand_referrals_admin_read ON public.brand_referrals
  FOR SELECT TO authenticated USING (public.is_platform_admin());

DROP POLICY IF EXISTS representative_commissions_admin_read ON public.representative_commissions;
CREATE POLICY representative_commissions_admin_read ON public.representative_commissions
  FOR SELECT TO authenticated USING (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.record_platform_public_event(p_event_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_event_type NOT IN ('intro_video_click', 'intro_video_view') THEN
    RAISE EXCEPTION 'Invalid event type';
  END IF;
  INSERT INTO public.platform_public_events(event_type) VALUES (p_event_type);
END;
$$;

REVOKE ALL ON FUNCTION public.record_platform_public_event(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_platform_public_event(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_platform_contact_request(
  p_full_name text,
  p_email text,
  p_message text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF char_length(btrim(p_full_name)) < 2 OR char_length(btrim(p_full_name)) > 120 THEN
    RAISE EXCEPTION 'Invalid full name';
  END IF;
  IF btrim(p_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid email';
  END IF;
  IF char_length(btrim(p_message)) < 5 OR char_length(btrim(p_message)) > 2000 THEN
    RAISE EXCEPTION 'Invalid message';
  END IF;
  INSERT INTO public.platform_contact_requests(full_name, email, message)
  VALUES (btrim(p_full_name), lower(btrim(p_email))::citext, btrim(p_message))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_platform_contact_request(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_platform_contact_request(text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.validate_representative_coupon(p_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.representative_coupons coupon
    JOIN public.platform_representatives representative ON representative.id = coupon.representative_id
    WHERE lower(coupon.code::text) = lower(btrim(p_code))
      AND coupon.active = true
      AND representative.active = true
      AND coupon.valid_from <= now()
      AND (coupon.valid_until IS NULL OR coupon.valid_until >= now())
  );
$$;

REVOKE ALL ON FUNCTION public.validate_representative_coupon(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_representative_coupon(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_type text := COALESCE(NEW.raw_user_meta_data->>'account_type', 'customer');
  v_cafe_id uuid;
  v_slug text;
  v_name text;
  v_phone text;
  v_coupon_code text;
  v_coupon public.representative_coupons%ROWTYPE;
  v_default_plan public.platform_plans%ROWTYPE;
  v_started_at timestamptz := now();
BEGIN
  IF v_account_type <> 'cafe_owner' THEN
    INSERT INTO public.profiles (id, email, full_name, role, status)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 'customer', 'active')
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END IF;

  v_slug := lower(btrim(COALESCE(NEW.raw_user_meta_data->>'cafe_slug', '')));
  v_name := btrim(COALESCE(NEW.raw_user_meta_data->>'cafe_name', ''));
  v_phone := regexp_replace(COALESCE(NEW.raw_user_meta_data->>'phone', ''), '[^0-9]', '', 'g');
  v_coupon_code := upper(btrim(COALESCE(NEW.raw_user_meta_data->>'coupon_code', '')));

  IF v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' OR char_length(v_slug) < 3 OR char_length(v_slug) > 60 THEN
    RAISE EXCEPTION 'Invalid cafe slug';
  END IF;
  IF v_name = '' OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'Invalid cafe name';
  END IF;

  SELECT plan.* INTO v_default_plan
  FROM public.platform_plans plan
  JOIN public.platform_settings settings ON settings.default_plan_id = plan.id
  WHERE settings.id = 'default' AND plan.active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Default plan is not configured';
  END IF;

  IF v_coupon_code <> '' THEN
    SELECT coupon.* INTO v_coupon
    FROM public.representative_coupons coupon
    JOIN public.platform_representatives representative ON representative.id = coupon.representative_id
    WHERE lower(coupon.code::text) = lower(v_coupon_code)
      AND coupon.active = true
      AND representative.active = true
      AND coupon.valid_from <= now()
      AND (coupon.valid_until IS NULL OR coupon.valid_until >= now())
    LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid representative coupon';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone, role, status)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), v_phone, 'cafe_owner', 'active');

  INSERT INTO public.cafes (slug, name, owner_user_id, status, is_public, representative_id, referral_coupon_id, referral_started_at)
  VALUES (
    v_slug, v_name, NEW.id, 'active', true,
    CASE WHEN v_coupon.id IS NOT NULL THEN v_coupon.representative_id ELSE NULL END,
    v_coupon.id,
    CASE WHEN v_coupon.id IS NOT NULL THEN now() ELSE NULL END
  )
  RETURNING id INTO v_cafe_id;

  INSERT INTO public.cafe_members (cafe_id, user_id, role, permissions)
  VALUES (v_cafe_id, NEW.id, 'owner', '{}'::jsonb);

  INSERT INTO public.cafe_settings (cafe_id, owner_name, owner_email, owner_phone)
  VALUES (v_cafe_id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email, v_phone);

  INSERT INTO public.subscriptions (
    cafe_id, plan_id, status, amount_sar, started_at, expires_at,
    plan_name_snapshot, duration_unit, duration_count, activation_source
  ) VALUES (
    v_cafe_id, v_default_plan.id, 'active', 0, v_started_at,
    public.calculate_subscription_expiry(v_started_at, v_default_plan.duration_unit, v_default_plan.duration_count),
    v_default_plan.name, v_default_plan.duration_unit, v_default_plan.duration_count,
    'signup_default_plan'
  );

  IF v_coupon.id IS NOT NULL THEN
    INSERT INTO public.brand_referrals(cafe_id, representative_id, coupon_id)
    VALUES (v_cafe_id, v_coupon.representative_id, v_coupon.id);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

DROP TRIGGER IF EXISTS platform_home_settings_updated_at ON public.platform_home_settings;
CREATE TRIGGER platform_home_settings_updated_at BEFORE UPDATE ON public.platform_home_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS platform_contact_settings_updated_at ON public.platform_contact_settings;
CREATE TRIGGER platform_contact_settings_updated_at BEFORE UPDATE ON public.platform_contact_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS platform_media_assets_updated_at ON public.platform_media_assets;
CREATE TRIGGER platform_media_assets_updated_at BEFORE UPDATE ON public.platform_media_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS platform_contact_requests_updated_at ON public.platform_contact_requests;
CREATE TRIGGER platform_contact_requests_updated_at BEFORE UPDATE ON public.platform_contact_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS platform_social_posts_updated_at ON public.platform_social_posts;
CREATE TRIGGER platform_social_posts_updated_at BEFORE UPDATE ON public.platform_social_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS platform_representatives_updated_at ON public.platform_representatives;
CREATE TRIGGER platform_representatives_updated_at BEFORE UPDATE ON public.platform_representatives
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS representative_coupons_updated_at ON public.representative_coupons;
CREATE TRIGGER representative_coupons_updated_at BEFORE UPDATE ON public.representative_coupons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE OR REPLACE FUNCTION public.create_subscription_payment_request(
  p_plan_id text,
  p_payment_method text,
  p_branch_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cafe_id uuid;
  v_plan public.platform_plans%ROWTYPE;
  v_coupon public.representative_coupons%ROWTYPE;
  v_id uuid;
  v_list_price numeric(10,2);
  v_subtotal numeric(10,2);
  v_tax numeric(10,2);
  v_total numeric(10,2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT c.id INTO v_cafe_id
  FROM public.cafes c
  WHERE c.owner_user_id = auth.uid()
    AND c.deleted_at IS NULL
  LIMIT 1;

  IF v_cafe_id IS NULL OR NOT public.is_cafe_owner(v_cafe_id) THEN
    RAISE EXCEPTION 'Only cafe owner can request subscription';
  END IF;

  IF p_payment_method NOT IN ('cash', 'bank_transfer') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.subscription_payment_requests
    WHERE cafe_id = v_cafe_id
      AND status IN ('awaiting_receipt', 'pending_review')
  ) THEN
    RAISE EXCEPTION 'There is an active subscription request under review';
  END IF;

  SELECT * INTO v_plan
  FROM public.platform_plans
  WHERE id = p_plan_id AND active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found';
  END IF;

  IF p_payment_method = 'cash' THEN
    IF p_branch_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.branches
      WHERE id = p_branch_id
        AND cafe_id = v_cafe_id
        AND active = true
        AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Active branch required for cash collection';
    END IF;
  ELSE
    p_branch_id := NULL;
  END IF;

  v_list_price := CASE
    WHEN v_plan.offer_enabled AND v_plan.offer_price_sar IS NOT NULL THEN v_plan.offer_price_sar
    ELSE v_plan.price_sar
  END;

  SELECT coupon.* INTO v_coupon
  FROM public.brand_referrals referral
  JOIN public.representative_coupons coupon ON coupon.id = referral.coupon_id
  WHERE referral.cafe_id = v_cafe_id
    AND coupon.active = true
    AND coupon.valid_from <= now()
    AND (coupon.valid_until IS NULL OR coupon.valid_until >= now())
    AND (
      cardinality(coupon.eligible_plan_ids) = 0
      OR p_plan_id = ANY(coupon.eligible_plan_ids)
    )
  LIMIT 1;

  IF FOUND THEN
    v_subtotal := round(v_list_price * (1 - v_coupon.discount_percent / 100), 2);
  ELSE
    v_subtotal := v_list_price;
  END IF;

  v_tax := round(v_subtotal * 0.15, 2);
  v_total := round(v_subtotal + v_tax, 2);

  INSERT INTO public.subscription_payment_requests (
    cafe_id, plan_id, requested_by, plan_name, base_amount_sar,
    discount_amount_sar, tax_amount_sar, amount_sar,
    duration_unit, duration_count, payment_method, branch_id, status
  ) VALUES (
    v_cafe_id, v_plan.id, auth.uid(), v_plan.name, v_plan.price_sar,
    v_plan.price_sar - v_subtotal, v_tax, v_total,
    v_plan.duration_unit, v_plan.duration_count, p_payment_method, p_branch_id,
    CASE WHEN p_payment_method = 'bank_transfer' THEN 'awaiting_receipt' ELSE 'pending_review' END
  )
  RETURNING id INTO v_id;

  PERFORM public.write_audit_log(
    v_cafe_id,
    'create_subscription_payment_request',
    'subscription_payment_requests',
    v_id,
    jsonb_build_object('plan_id', p_plan_id, 'payment_method', p_payment_method, 'amount_sar', v_total)
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_subscription_payment_request(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_subscription_payment_request(text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_approve_subscription_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.subscription_payment_requests%ROWTYPE;
  v_subscription_id uuid;
  v_started_at timestamptz := now();
  v_referral public.brand_referrals%ROWTYPE;
  v_months_elapsed int;
  v_rate numeric(5,2);
  v_commission_type text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_request
  FROM public.subscription_payment_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR v_request.status <> 'pending_review' THEN
    RAISE EXCEPTION 'Request is not ready for approval';
  END IF;

  IF v_request.payment_method = 'bank_transfer' AND v_request.receipt_storage_path IS NULL THEN
    RAISE EXCEPTION 'Receipt is required';
  END IF;

  UPDATE public.subscriptions
  SET status = 'cancelled', cancelled_at = v_started_at, updated_at = now()
  WHERE cafe_id = v_request.cafe_id
    AND status IN ('active', 'trialing');

  INSERT INTO public.subscriptions (
    cafe_id, plan_id, status, amount_sar, started_at, expires_at,
    plan_name_snapshot, duration_unit, duration_count,
    activation_source, payment_request_id
  ) VALUES (
    v_request.cafe_id, v_request.plan_id, 'active', v_request.amount_sar,
    v_started_at,
    public.calculate_subscription_expiry(v_started_at, v_request.duration_unit, v_request.duration_count),
    v_request.plan_name, v_request.duration_unit, v_request.duration_count,
    v_request.payment_method, v_request.id
  )
  RETURNING id INTO v_subscription_id;

  UPDATE public.subscription_payment_requests
  SET status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      approved_subscription_id = v_subscription_id,
      updated_at = now()
  WHERE id = p_request_id;

  SELECT * INTO v_referral
  FROM public.brand_referrals
  WHERE cafe_id = v_request.cafe_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_referral.first_paid_subscription_at IS NULL THEN
      UPDATE public.brand_referrals
      SET first_paid_subscription_at = v_started_at,
          commission_end_at = v_started_at + interval '12 months'
      WHERE id = v_referral.id;
      v_months_elapsed := 0;
      v_commission_type := 'initial';
    ELSE
      v_months_elapsed :=
        EXTRACT(YEAR FROM age(v_started_at, v_referral.first_paid_subscription_at))::int * 12
        + EXTRACT(MONTH FROM age(v_started_at, v_referral.first_paid_subscription_at))::int;
      v_commission_type := 'renewal';
    END IF;

    v_rate := CASE
      WHEN v_months_elapsed < 6 THEN 40
      WHEN v_months_elapsed < 12 THEN 20
      ELSE 0
    END;

    IF v_rate > 0 THEN
      INSERT INTO public.representative_commissions (
        representative_id, referral_id, subscription_id, payment_request_id,
        commission_type, base_amount_sar, rate_percent, amount_sar
      ) VALUES (
        v_referral.representative_id, v_referral.id, v_subscription_id, p_request_id,
        v_commission_type, v_request.amount_sar, v_rate,
        round(v_request.amount_sar * v_rate / 100, 2)
      )
      ON CONFLICT (payment_request_id) DO NOTHING;
    END IF;
  END IF;

  PERFORM public.write_audit_log(
    v_request.cafe_id,
    'admin_approve_subscription_request',
    'subscription_payment_requests',
    p_request_id,
    jsonb_build_object('subscription_id', v_subscription_id, 'amount_sar', v_request.amount_sar)
  );

  RETURN v_subscription_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_subscription_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_approve_subscription_request(uuid) TO authenticated;



DO $$
DECLARE
  v_table text;
BEGIN
  IF to_regprocedure('public.capture_platform_admin_audit()') IS NOT NULL THEN
    FOREACH v_table IN ARRAY ARRAY[
      'platform_home_settings',
      'platform_contact_settings',
      'platform_media_assets',
      'platform_social_accounts',
      'platform_social_posts',
      'job_applications',
      'platform_representatives',
      'representative_coupons'
    ]
    LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS admin_audit_%I ON public.%I', v_table, v_table);
      EXECUTE format(
        'CREATE TRIGGER admin_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.capture_platform_admin_audit()',
        v_table,
        v_table
      );
    END LOOP;
  END IF;
END;
$$;

COMMIT;

SELECT
  table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'platform_home_settings',
    'platform_media_assets',
    'platform_contact_requests',
    'platform_social_posts',
    'job_applications',
    'platform_representatives',
    'representative_coupons',
    'brand_referrals',
    'representative_commissions'
  )
ORDER BY table_name;
