-- pgTAP: orders + order_items security
BEGIN;
SELECT plan(10);

-- customer_a: 10000001-0001-4001-8001-000000000007
-- profile_a: 30000001-0001-4001-8001-000000000001
-- cafe_a:    20000001-0001-4001-8001-000000000001
-- product:   50000001-0001-4001-8001-000000000001 (pickup ok)
-- hidden:    50000001-0001-4001-8001-000000000002 (pickup false)
-- staff_orders: 10000001-0001-4001-8001-000000000005

PERFORM set_config('request.jwt.claim.sub', '10000001-0001-4001-8001-000000000007', true);
PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$INSERT INTO public.orders (
      cafe_id, customer_id, customer_name, customer_phone, fulfillment_type,
      status, payment_status, subtotal, discount_amount, tax_amount, total
    ) VALUES (
      '20000001-0001-4001-8001-000000000001',
      '30000001-0001-4001-8001-000000000001',
      'Customer A', '0507000001', 'pickup',
      'pending_cafe', 'pay_at_pickup', 1, 0, 0, 1
    )$$,
  '42501',
  NULL,
  'customer cannot INSERT orders directly'
);

SELECT throws_ok(
  $$INSERT INTO public.order_items (order_id, product_id, name, quantity, unit_price)
    VALUES (gen_random_uuid(), '50000001-0001-4001-8001-000000000001', 'X', 1, 0.01)$$,
  '42501',
  NULL,
  'customer cannot INSERT order_items directly'
);

SELECT throws_ok(
  $$SELECT public.create_pickup_order(
      '20000001-0001-4001-8001-000000000001'::uuid,
      NULL, NULL, NULL,
      '[{"product_id":"50000001-0001-4001-8001-000000000002","quantity":1}]'::jsonb
    )$$,
  'P0001',
  NULL,
  'create_pickup_order rejects non-pickup product'
);

SELECT throws_ok(
  $$SELECT public.create_pickup_order(
      '20000001-0001-4001-8001-000000000001'::uuid,
      NULL, NULL, NULL,
      '[{"product_id":"50000001-0001-4001-8001-000000000001","quantity":0}]'::jsonb
    )$$,
  'P0001',
  NULL,
  'create_pickup_order rejects zero quantity'
);

SELECT lives_ok(
  $$SELECT public.create_pickup_order(
      '20000001-0001-4001-8001-000000000001'::uuid,
      NULL, NULL, NULL,
      '[{"product_id":"50000001-0001-4001-8001-000000000001","quantity":2}]'::jsonb
    )$$,
  'create_pickup_order succeeds for valid pickup product'
);

SELECT ok(
  (
    SELECT o.total = round(o.subtotal - o.discount_amount + o.tax_amount, 2)
    FROM public.orders o
    WHERE o.customer_id = '30000001-0001-4001-8001-000000000001'
    ORDER BY o.created_at DESC
    LIMIT 1
  ),
  'order total equals subtotal - discount + tax'
);

SELECT ok(
  (
    SELECT oi.unit_price = mp.price
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    JOIN public.menu_products mp ON mp.id = oi.product_id
    WHERE o.customer_id = '30000001-0001-4001-8001-000000000001'
    ORDER BY o.created_at DESC
    LIMIT 1
  ),
  'order_items unit_price matches menu_products.price'
);

-- staff with orders permission responds to order
PERFORM set_config('request.jwt.claim.sub', '10000001-0001-4001-8001-000000000005', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    $$SELECT public.respond_to_pickup_order('%s'::uuid, 'accepted'::public.order_status, NULL)$$,
    (SELECT o.id FROM public.orders o
     WHERE o.cafe_id = '20000001-0001-4001-8001-000000000001'
     ORDER BY o.created_at DESC LIMIT 1)
  ),
  'staff with orders permission can accept order via RPC'
);

SELECT throws_ok(
  format(
    $$UPDATE public.orders SET total = 0.01 WHERE id = '%s'$$,
    (SELECT o.id FROM public.orders o
     WHERE o.cafe_id = '20000001-0001-4001-8001-000000000001'
     ORDER BY o.created_at DESC LIMIT 1)
  ),
  '42501',
  NULL,
  'staff cannot UPDATE orders.total directly'
);

SELECT throws_ok(
  $$SELECT public.respond_to_pickup_order(
      gen_random_uuid(),
      'accepted'::public.order_status,
      NULL
    )$$,
  'P0001',
  NULL,
  'respond_to_pickup_order rejects unknown order'
);

SELECT * FROM finish();
ROLLBACK;
