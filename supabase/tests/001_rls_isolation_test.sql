-- pgTAP: cafe isolation + cafe_settings exposure
-- Run: supabase test db
BEGIN;
SELECT plan(8);

-- UUIDs from supabase/seed/security_test_seed.sql
-- owner_a: 10000001-0001-4001-8001-000000000002
-- owner_b: 10000001-0001-4001-8001-000000000003
-- cafe_a:  20000001-0001-4001-8001-000000000001
-- cafe_b:  20000001-0001-4001-8001-000000000002

-- anon cannot read sensitive cafe_settings columns via direct SELECT
SET LOCAL ROLE anon;
SELECT is(
  (SELECT count(*)::int FROM public.cafe_settings WHERE owner_email IS NOT NULL),
  0,
  'anon cannot read cafe_settings rows'
);

-- public settings RPC returns only whitelisted keys
SELECT ok(
  (
    SELECT public.get_cafe_public_settings('20000001-0001-4001-8001-000000000001'::uuid)
      ?& ARRAY['cafe_id', 'description', 'logo_url', 'logo_storage_path', 'instagram', 'whatsapp', 'theme_id']
  ),
  'get_cafe_public_settings returns expected public keys'
);

SELECT ok(
  NOT (
    SELECT COALESCE(
      (public.get_cafe_public_settings('20000001-0001-4001-8001-000000000001'::uuid) ? 'owner_email'),
      false
    )
  ),
  'get_cafe_public_settings excludes owner_email'
);

-- owner_a cannot read cafe_b menu products
PERFORM set_config('request.jwt.claim.sub', '10000001-0001-4001-8001-000000000002', true);
PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.menu_products WHERE cafe_id = '20000001-0001-4001-8001-000000000002'),
  0,
  'owner_a cannot SELECT menu_products for cafe_b'
);

-- owner_b cannot read cafe_a orders
PERFORM set_config('request.jwt.claim.sub', '10000001-0001-4001-8001-000000000003', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.orders WHERE cafe_id = '20000001-0001-4001-8001-000000000001'),
  0,
  'owner_b cannot SELECT orders for cafe_a'
);

-- staff without permissions cannot update loyalty_rules
PERFORM set_config('request.jwt.claim.sub', '10000001-0001-4001-8001-000000000004', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$UPDATE public.loyalty_rules SET enabled = false WHERE cafe_id = '20000001-0001-4001-8001-000000000001'$$,
  '42501',
  NULL,
  'staff_a_no_perm cannot UPDATE loyalty_rules'
);

-- staff without marketing cannot update experience_campaigns
SELECT throws_ok(
  $$UPDATE public.experience_campaigns SET title = 'hacked' WHERE cafe_id = '20000001-0001-4001-8001-000000000001'$$,
  '42501',
  NULL,
  'staff_a_no_perm cannot UPDATE experience_campaigns'
);

-- staff without branches permission cannot mutate branches (insert test)
SELECT throws_ok(
  $$INSERT INTO public.branches (cafe_id, name, address) VALUES ('20000001-0001-4001-8001-000000000001', 'X', 'Y')$$,
  '42501',
  NULL,
  'staff_a_no_perm cannot INSERT branches'
);

SELECT * FROM finish();
ROLLBACK;
