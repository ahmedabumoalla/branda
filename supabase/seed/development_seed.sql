-- Branda Development Seed (manual only — NEVER run in production automatically)
-- Run after 001_branda_production_schema.sql
-- Create auth users in Supabase Dashboard first, then replace UUIDs below.

-- Example cafe (requires owner auth user UUID)
-- INSERT INTO cafes (id, slug, name, owner_user_id, is_public)
-- VALUES (
--   '11111111-1111-1111-1111-111111111111',
--   'qatrah',
--   'كوفي قطرة',
--   '<OWNER_AUTH_USER_UUID>',
--   true
-- );

-- INSERT INTO cafe_settings (cafe_id, owner_name, owner_email, owner_phone, description, theme_id)
-- VALUES (
--   '11111111-1111-1111-1111-111111111111',
--   'مالك الكوفي',
--   'owner@qatrah.com',
--   '0550000000',
--   'كوفي مختص — بيانات تجريبية للتطوير فقط',
--   'soft-cream-3d'
-- );

-- INSERT INTO cafe_members (cafe_id, user_id, role)
-- VALUES ('11111111-1111-1111-1111-111111111111', '<OWNER_AUTH_USER_UUID>', 'owner');

-- Sample menu category + product (after cafe exists)
-- INSERT INTO menu_categories (cafe_id, name, sort_order, visible, featured)
-- VALUES ('11111111-1111-1111-1111-111111111111', 'قهوة ساخنة', 1, true, true);

-- INSERT INTO menu_products (cafe_id, name, description, price, loyalty_points, available, image_variant)
-- VALUES (
--   '11111111-1111-1111-1111-111111111111',
--   'لاتيه فانيلا',
--   'قهوة ناعمة بطعم الفانيلا',
--   18,
--   18,
--   true,
--   'latte'
-- );

-- Active subscription for dev
-- INSERT INTO subscriptions (cafe_id, plan_id, status, amount_sar)
-- VALUES ('11111111-1111-1111-1111-111111111111', 'pro', 'active', 199);

-- NOTE: platform_plans and cafe_themes are seeded in migration 001.
