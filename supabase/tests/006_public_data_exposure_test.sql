-- pgTAP: public data exposure + customer_profiles + domain_orders
BEGIN;
SELECT plan(13);

SET LOCAL ROLE anon;
SELECT is(
  (SELECT count(*)::int FROM public.cafe_settings),
  0,
  'anon direct SELECT on cafe_settings returns zero rows'
);

SELECT ok(
  NOT (
    COALESCE(
      public.get_cafe_public_settings('20000001-0001-4001-8001-000000000001'::uuid) ? 'tax_number',
      false
    )
  ),
  'get_cafe_public_settings excludes tax_number'
);

SELECT ok(
  NOT (
    COALESCE(
      public.get_cafe_public_settings('20000001-0001-4001-8001-000000000001'::uuid) ? 'owner_phone',
      false
    )
  ),
  'get_cafe_public_settings excludes owner_phone'
);

PERFORM set_config('request.jwt.claim.sub', '10000001-0001-4001-8001-000000000007', true);
PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customer_profiles'
      AND cmd = 'UPDATE'
  ),
  'no direct UPDATE policy on customer_profiles'
);

SELECT throws_ok(
  $$UPDATE public.customer_profiles SET full_name = 'Hacked'
    WHERE id = '30000001-0001-4001-8001-000000000001'$$,
  '42501',
  NULL,
  'customer cannot UPDATE customer_profiles directly'
);

SELECT lives_ok(
  $$SELECT public.update_customer_profile(
      '20000001-0001-4001-8001-000000000001'::uuid,
      'Customer A Updated',
      'updated@example.com',
      '0507000099'
    )$$,
  'customer updates profile via update_customer_profile RPC'
);

SELECT is(
  (SELECT full_name FROM public.customer_profiles
   WHERE id = '30000001-0001-4001-8001-000000000001'),
  'Customer A Updated',
  'update_customer_profile sets full_name'
);

SELECT throws_ok(
  $$UPDATE public.customer_profiles SET cafe_id = '20000001-0001-4001-8001-000000000002'
    WHERE id = '30000001-0001-4001-8001-000000000001'$$,
  '42501',
  NULL,
  'customer cannot reassign cafe_id via direct UPDATE'
);

SELECT throws_ok(
  $$UPDATE public.customer_profiles SET user_id = '10000001-0001-4001-8001-000000000008'
    WHERE id = '30000001-0001-4001-8001-000000000001'$$,
  '42501',
  NULL,
  'customer cannot reassign user_id via direct UPDATE'
);

SELECT throws_ok(
  $$INSERT INTO public.customer_profiles (cafe_id, user_id, full_name, phone)
    VALUES (
      '20000001-0001-4001-8001-000000000001',
      '10000001-0001-4001-8001-000000000007',
      'Dup', '0507000002'
    )$$,
  '42501',
  NULL,
  'customer cannot INSERT customer_profiles directly'
);

PERFORM set_config('request.jwt.claim.sub', '10000001-0001-4001-8001-000000000002', true);
SET LOCAL ROLE authenticated;

INSERT INTO public.domain_orders (id, cafe_id, requested_by, domain, tld, status)
VALUES (
  '80000001-0001-4001-8001-000000000002',
  '20000001-0001-4001-8001-000000000001',
  '10000001-0001-4001-8001-000000000002',
  'test-brand-cancel-2',
  'com',
  'pending_review'
);

SELECT throws_ok(
  $$UPDATE public.domain_orders SET domain = 'evil.com' WHERE id = '80000001-0001-4001-8001-000000000002'$$,
  '42501',
  NULL,
  'owner cannot mutate domain_orders directly'
);

SELECT lives_ok(
  $$SELECT public.cancel_domain_order('80000001-0001-4001-8001-000000000002'::uuid)$$,
  'cancel_domain_order RPC succeeds'
);

SELECT is(
  (SELECT status::text FROM public.domain_orders WHERE id = '80000001-0001-4001-8001-000000000002'),
  'cancelled',
  'cancel_domain_order only changes status to cancelled'
);

SELECT * FROM finish();
ROLLBACK;
