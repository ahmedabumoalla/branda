-- Branda security test seed — LOCAL + STAGING ONLY
-- Loaded by `supabase db reset` via supabase/config.toml
-- NEVER run automatically on Production.

-- ─── Fixed UUIDs (stable across test runs) ───────────────────────────────────
-- Users
--   admin:              10000001-0001-4001-8001-000000000001
--   owner_a:            10000001-0001-4001-8001-000000000002
--   owner_b:            10000001-0001-4001-8001-000000000003
--   staff_a_no_perm:    10000001-0001-4001-8001-000000000004
--   staff_a_orders:     10000001-0001-4001-8001-000000000005
--   staff_a_marketing:  10000001-0001-4001-8001-000000000006
--   customer_a:         10000001-0001-4001-8001-000000000007
--   customer_b:         10000001-0001-4001-8001-000000000008
-- Cafes
--   cafe_a:             20000001-0001-4001-8001-000000000001  slug: cafe-a-test
--   cafe_b:             20000001-0001-4001-8001-000000000002  slug: cafe-b-test

CREATE SCHEMA IF NOT EXISTS test_seed;

CREATE OR REPLACE FUNCTION test_seed.create_auth_user(
  p_id uuid,
  p_email text,
  p_password text DEFAULT 'testpass123'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    p_id,
    'authenticated',
    'authenticated',
    p_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;

CREATE SCHEMA IF NOT EXISTS test_seed;

SELECT test_seed.create_auth_user('10000001-0001-4001-8001-000000000001'::uuid, 'admin@test.local');
SELECT test_seed.create_auth_user('10000001-0001-4001-8001-000000000002'::uuid, 'owner_a@test.local');
SELECT test_seed.create_auth_user('10000001-0001-4001-8001-000000000003'::uuid, 'owner_b@test.local');
SELECT test_seed.create_auth_user('10000001-0001-4001-8001-000000000004'::uuid, 'staff_a_no@test.local');
SELECT test_seed.create_auth_user('10000001-0001-4001-8001-000000000005'::uuid, 'staff_a_orders@test.local');
SELECT test_seed.create_auth_user('10000001-0001-4001-8001-000000000006'::uuid, 'staff_a_marketing@test.local');
SELECT test_seed.create_auth_user('10000001-0001-4001-8001-000000000007'::uuid, 'customer_a@test.local');
SELECT test_seed.create_auth_user('10000001-0001-4001-8001-000000000008'::uuid, 'customer_b@test.local');

UPDATE public.profiles SET role = 'platform_admin', full_name = 'Platform Admin'
WHERE id = '10000001-0001-4001-8001-000000000001';
UPDATE public.profiles SET role = 'cafe_owner', full_name = 'Owner A'
WHERE id = '10000001-0001-4001-8001-000000000002';
UPDATE public.profiles SET role = 'cafe_owner', full_name = 'Owner B'
WHERE id = '10000001-0001-4001-8001-000000000003';
UPDATE public.profiles SET role = 'cafe_staff', full_name = 'Staff A No Perm'
WHERE id = '10000001-0001-4001-8001-000000000004';
UPDATE public.profiles SET role = 'cafe_staff', full_name = 'Staff A Orders'
WHERE id = '10000001-0001-4001-8001-000000000005';
UPDATE public.profiles SET role = 'cafe_staff', full_name = 'Staff A Marketing'
WHERE id = '10000001-0001-4001-8001-000000000006';
UPDATE public.profiles SET role = 'customer', full_name = 'Customer A'
WHERE id = '10000001-0001-4001-8001-000000000007';
UPDATE public.profiles SET role = 'customer', full_name = 'Customer B'
WHERE id = '10000001-0001-4001-8001-000000000008';

INSERT INTO public.cafes (id, slug, name, owner_user_id, status, is_public)
VALUES
  ('20000001-0001-4001-8001-000000000001', 'cafe-a-test', 'Cafe A Test', '10000001-0001-4001-8001-000000000002', 'active', true),
  ('20000001-0001-4001-8001-000000000002', 'cafe-b-test', 'Cafe B Test', '10000001-0001-4001-8001-000000000003', 'active', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.cafe_members (cafe_id, user_id, role, permissions)
VALUES
  ('20000001-0001-4001-8001-000000000001', '10000001-0001-4001-8001-000000000002', 'owner', '{}'::jsonb),
  ('20000001-0001-4001-8001-000000000002', '10000001-0001-4001-8001-000000000003', 'owner', '{}'::jsonb),
  ('20000001-0001-4001-8001-000000000001', '10000001-0001-4001-8001-000000000004', 'staff', '{}'::jsonb),
  ('20000001-0001-4001-8001-000000000001', '10000001-0001-4001-8001-000000000005', 'staff', '{"orders": true}'::jsonb),
  ('20000001-0001-4001-8001-000000000001', '10000001-0001-4001-8001-000000000006', 'staff', '{"marketing": true}'::jsonb)
ON CONFLICT (cafe_id, user_id) DO UPDATE SET permissions = EXCLUDED.permissions;

INSERT INTO public.cafe_settings (
  cafe_id, owner_name, owner_email, owner_phone, tax_number,
  commercial_register, maroof_certificate, purchased_domain, domain_status, description, theme_id
) VALUES
  (
    '20000001-0001-4001-8001-000000000001',
    'Owner A Secret', 'owner_a_secret@test.local', '0501111111', 'TAX-A-123',
    'CR-A-456', 'MAR-A-789', 'secret-a.example.com', 'connected', 'Public cafe A', 'soft-cream-3d'
  ),
  (
    '20000001-0001-4001-8001-000000000002',
    'Owner B Secret', 'owner_b_secret@test.local', '0502222222', 'TAX-B-123',
    'CR-B-456', 'MAR-B-789', 'secret-b.example.com', 'connected', 'Public cafe B', 'soft-cream-3d'
  )
ON CONFLICT (cafe_id) DO NOTHING;

INSERT INTO public.customer_profiles (id, cafe_id, user_id, full_name, phone, email)
VALUES
  ('30000001-0001-4001-8001-000000000001', '20000001-0001-4001-8001-000000000001', '10000001-0001-4001-8001-000000000007', 'Customer A', '0507000001', 'customer_a@test.local'),
  ('30000001-0001-4001-8001-000000000002', '20000001-0001-4001-8001-000000000002', '10000001-0001-4001-8001-000000000008', 'Customer B', '0508000001', 'customer_b@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.menu_categories (id, cafe_id, name, sort_order, visible)
VALUES ('40000001-0001-4001-8001-000000000001', '20000001-0001-4001-8001-000000000001', 'Hot Drinks', 1, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.menu_products (
  id, cafe_id, category_id, name, description, price, loyalty_points,
  available, available_for_pickup, image_variant
) VALUES
  (
    '50000001-0001-4001-8001-000000000001',
    '20000001-0001-4001-8001-000000000001',
    '40000001-0001-4001-8001-000000000001',
    'Public Latte', 'Available for pickup', 18, 18, true, true, 'latte'
  ),
  (
    '50000001-0001-4001-8001-000000000002',
    '20000001-0001-4001-8001-000000000001',
    '40000001-0001-4001-8001-000000000001',
    'Hidden Mocha', 'Not for pickup', 20, 20, true, false, 'mocha'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.experience_campaigns (
  id, cafe_id, title, description, start_date, end_date, platforms,
  base_points, max_points_per_submission, requires_manual_approval, status
) VALUES (
  '60000001-0001-4001-8001-000000000001',
  '20000001-0001-4001-8001-000000000001',
  'Test Campaign A',
  'Security test campaign',
  CURRENT_DATE - 1,
  CURRENT_DATE + 30,
  ARRAY['tiktok', 'instagram'],
  10,
  50,
  true,
  'active'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.experience_campaigns (
  id, cafe_id, title, description, start_date, end_date, platforms,
  base_points, max_points_per_submission, requires_manual_approval, status
) VALUES (
  '60000001-0001-4001-8001-000000000002',
  '20000001-0001-4001-8001-000000000002',
  'Test Campaign B',
  'Other cafe campaign',
  CURRENT_DATE - 1,
  CURRENT_DATE + 30,
  ARRAY['tiktok'],
  10,
  50,
  true,
  'active'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.loyalty_accounts (cafe_id, customer_id, balance)
VALUES ('20000001-0001-4001-8001-000000000001', '30000001-0001-4001-8001-000000000001', 100)
ON CONFLICT (cafe_id, customer_id) DO NOTHING;

INSERT INTO public.notifications (id, cafe_id, audience, customer_id, title, body, type)
VALUES
  ('70000001-0001-4001-8001-000000000001', '20000001-0001-4001-8001-000000000001', 'customer', '30000001-0001-4001-8001-000000000001', 'Test', 'Customer notification', 'test'),
  ('70000001-0001-4001-8001-000000000002', '20000001-0001-4001-8001-000000000001', 'cafe', NULL, 'Cafe alert', 'Staff notification', 'test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.domain_orders (id, cafe_id, requested_by, domain, tld, status)
VALUES (
  '80000001-0001-4001-8001-000000000001',
  '20000001-0001-4001-8001-000000000001',
  '10000001-0001-4001-8001-000000000002',
  'test-brand-a',
  'com',
  'pending_review'
)
ON CONFLICT (id) DO NOTHING;

DROP FUNCTION IF EXISTS test_seed.create_auth_user(uuid, text, text);
