-- pgTAP: notifications + loyalty
BEGIN;
SELECT plan(10);

PERFORM set_config('request.jwt.claim.sub', '10000001-0001-4001-8001-000000000007', true);
PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$UPDATE public.notifications SET body = 'hacked'
    WHERE id = '70000001-0001-4001-8001-000000000001'$$,
  '42501',
  NULL,
  'customer cannot UPDATE notification body directly'
);

SELECT lives_ok(
  $$SELECT public.mark_customer_notification_read('70000001-0001-4001-8001-000000000001'::uuid)$$,
  'customer marks own notification read via RPC'
);

PERFORM set_config('request.jwt.claim.sub', '10000001-0001-4001-8001-000000000004', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$UPDATE public.notifications SET title = 'hacked'
    WHERE id = '70000001-0001-4001-8001-000000000002'$$,
  '42501',
  NULL,
  'staff without notifications permission cannot UPDATE cafe notification'
);

SELECT throws_ok(
  $$SELECT public.create_customer_notification(
      '20000001-0001-4001-8001-000000000001'::uuid,
      '30000001-0001-4001-8001-000000000001'::uuid,
      'Test', 'Body', 'test'
    )$$,
  'P0001',
  NULL,
  'staff without notifications permission cannot create customer notification'
);

PERFORM set_config('request.jwt.claim.sub', '10000001-0001-4001-8001-000000000002', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.create_customer_notification(
      '20000001-0001-4001-8001-000000000001'::uuid,
      '30000001-0001-4001-8001-000000000001'::uuid,
      'Owner msg', 'Hello', 'test'
    )$$,
  'owner can create customer notification'
);

SELECT throws_ok(
  $$SELECT public.create_customer_notification(
      '20000001-0001-4001-8001-000000000001'::uuid,
      '30000001-0001-4001-8001-000000000002'::uuid,
      'Wrong cafe', 'Body', 'test'
    )$$,
  'P0001',
  NULL,
  'cannot notify customer from another cafe'
);

SELECT throws_ok(
  $$INSERT INTO public.loyalty_transactions (
      cafe_id, customer_id, amount, reason
    ) VALUES (
      '20000001-0001-4001-8001-000000000001',
      '30000001-0001-4001-8001-000000000001',
      50, 'manual hack'
    )$$,
  '42501',
  NULL,
  'owner cannot INSERT loyalty_transactions directly (no INSERT policy)'
);

SELECT lives_ok(
  $$SELECT public.adjust_loyalty_points(
      '20000001-0001-4001-8001-000000000001'::uuid,
      '30000001-0001-4001-8001-000000000001'::uuid,
      10,
      'Manual bonus test'
    )$$,
  'owner adjusts loyalty via RPC'
);

SELECT throws_ok(
  $$SELECT public.adjust_loyalty_points(
      '20000001-0001-4001-8001-000000000001'::uuid,
      '30000001-0001-4001-8001-000000000001'::uuid,
      -1000,
      'Drain attempt'
    )$$,
  'P0001',
  NULL,
  'adjust_loyalty_points prevents negative balance'
);

SELECT ok(
  (SELECT count(*) >= 1 FROM public.audit_logs
   WHERE action = 'adjust_loyalty_points'
     AND cafe_id = '20000001-0001-4001-8001-000000000001'),
  'adjust_loyalty_points writes audit log'
);

PERFORM set_config('request.jwt.claim.sub', '10000001-0001-4001-8001-000000000007', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$UPDATE public.loyalty_accounts SET balance = 9999
    WHERE customer_id = '30000001-0001-4001-8001-000000000001'$$,
  '42501',
  NULL,
  'customer cannot UPDATE loyalty balance'
);

SELECT * FROM finish();
ROLLBACK;
