-- pgTAP: domain orders, reviews, storage existence, staff scoping
BEGIN;
SELECT plan(8);

-- owner cannot INSERT domain order with forged completed status
PERFORM set_config('request.jwt.claim.sub', '10000001-0001-4001-8001-000000000001', true);
PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$INSERT INTO public.domain_orders (
      cafe_id, requested_by, domain, tld, years, status, completed_at
    ) VALUES (
      '20000001-0001-4001-8001-000000000001',
      '10000001-0001-4001-8001-000000000001',
      'test', 'com', 1, 'completed', now()
    )$$,
  '42501',
  NULL,
  'owner cannot INSERT domain_orders directly'
);

SELECT lives_ok(
  $$SELECT public.create_domain_order(
      '20000001-0001-4001-8001-000000000001'::uuid,
      'mybrand', 'com', 1, false
    )$$,
  'create_domain_order RPC succeeds for owner'
);

SELECT ok(
  (
    SELECT status = 'pending_review'
      AND provider IS NULL
      AND completed_at IS NULL
    FROM public.domain_orders
    WHERE domain = 'mybrand' AND tld = 'com'
    ORDER BY created_at DESC LIMIT 1
  ),
  'create_domain_order forces pending_review and null provider fields'
);

-- customer cannot INSERT forged review
PERFORM set_config('request.jwt.claim.sub', '10000001-0001-4001-8001-000000000007', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$INSERT INTO public.reviews (
      cafe_id, product_id, customer_id, customer_name, rating, comment
    ) VALUES (
      '20000001-0001-4001-8001-000000000001',
      '50000001-0001-4001-8001-000000000001',
      '30000001-0001-4001-8001-000000000001',
      'Fake Name', 5, 'Great'
    )$$,
  '42501',
  NULL,
  'customer cannot INSERT reviews directly'
);

SELECT lives_ok(
  $$SELECT public.create_customer_review(
      '20000001-0001-4001-8001-000000000001'::uuid,
      '50000001-0001-4001-8001-000000000001'::uuid,
      5, 'Excellent coffee'
    )$$,
  'create_customer_review RPC succeeds'
);

-- staff without orders permission cannot read orders
PERFORM set_config('request.jwt.claim.sub', '10000001-0001-4001-8001-000000000004', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.orders
   WHERE cafe_id = '20000001-0001-4001-8001-000000000001'),
  0,
  'staff without orders permission sees zero orders'
);

-- staff without reservations permission cannot read reservations
SELECT is(
  (SELECT count(*)::int FROM public.reservations
   WHERE cafe_id = '20000001-0001-4001-8001-000000000001'),
  0,
  'staff without reservations permission sees zero reservations'
);

-- storage_object_exists must not be callable by authenticated
SELECT throws_ok(
  $$SELECT public.storage_object_exists('customer-avatars', 'x/y.webp')$$,
  '42883',
  NULL,
  'storage_object_exists is not granted to authenticated'
);

SELECT * FROM finish();
ROLLBACK;
