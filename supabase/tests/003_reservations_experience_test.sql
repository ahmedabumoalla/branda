-- pgTAP: reservations + experience submissions
BEGIN;
SELECT plan(14);

PERFORM set_config('request.jwt.claim.sub', '10000001-0001-4001-8001-000000000007', true);
PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$INSERT INTO public.reservations (
      cafe_id, customer_id, customer_name, phone, event_type, guests,
      reservation_date, reservation_time, status
    ) VALUES (
      '20000001-0001-4001-8001-000000000001',
      '30000001-0001-4001-8001-000000000001',
      'Customer A', '0507000001', 'birthday', 4,
      CURRENT_DATE + 1, '18:00', 'pending'
    )$$,
  '42501',
  NULL,
  'customer cannot INSERT reservations directly'
);

SELECT lives_ok(
  $$SELECT public.create_customer_reservation(
      '20000001-0001-4001-8001-000000000001'::uuid,
      'birthday', 4, CURRENT_DATE + 1, '18:00'::time
    )$$,
  'create_customer_reservation succeeds'
);

SELECT throws_ok(
  $$SELECT public.create_customer_reservation(
      '20000001-0001-4001-8001-000000000001'::uuid,
      'birthday', 4, CURRENT_DATE - 1, '18:00'::time
    )$$,
  'P0001',
  NULL,
  'create_customer_reservation rejects past date'
);

SELECT throws_ok(
  $$UPDATE public.reservations
    SET customer_name = 'Hacked', reservation_date = CURRENT_DATE + 30
    WHERE id = (
      SELECT id FROM public.reservations
      WHERE customer_id = '30000001-0001-4001-8001-000000000001'
      ORDER BY created_at DESC LIMIT 1
    )$$,
  '42501',
  NULL,
  'staff/customer cannot UPDATE reservation fields directly'
);

-- owner responds via RPC
PERFORM set_config('request.jwt.claim.sub', '10000001-0001-4001-8001-000000000001', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    $$SELECT public.respond_to_reservation('%s'::uuid, 'accepted'::reservation_status, 'Welcome')$$,
    (SELECT id FROM public.reservations
     WHERE customer_id = '30000001-0001-4001-8001-000000000001'
     ORDER BY created_at DESC LIMIT 1)
  ),
  'owner responds to reservation via RPC'
);

SELECT throws_ok(
  $$INSERT INTO public.experience_submissions (
      campaign_id, cafe_id, customer_id, platform, video_url, status, awarded_points
    ) VALUES (
      '60000001-0001-4001-8001-000000000001',
      '20000001-0001-4001-8001-000000000001',
      '30000001-0001-4001-8001-000000000001',
      'tiktok', 'https://example.com/v', 'approved', 999
    )$$,
  '42501',
  NULL,
  'customer cannot INSERT experience_submissions directly'
);

PERFORM set_config('request.jwt.claim.sub', '10000001-0001-4001-8001-000000000007', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.submit_experience_submission(
      '20000001-0001-4001-8001-000000000001'::uuid,
      '60000001-0001-4001-8001-000000000001'::uuid,
      'tiktok',
      'https://example.com/video/1',
      NULL, NULL
    )$$,
  'submit_experience_submission succeeds with https URL'
);

SELECT lives_ok(
  $$SELECT public.submit_experience_submission(
      '20000001-0001-4001-8001-000000000001'::uuid,
      '60000001-0001-4001-8001-000000000001'::uuid,
      'instagram',
      NULL, NULL, NULL
    )$$,
  'submit_experience_submission allows image-only flow without video URL'
);

SELECT throws_ok(
  $$SELECT public.submit_experience_submission(
      '20000001-0001-4001-8001-000000000001'::uuid,
      '60000001-0001-4001-8001-000000000002'::uuid,
      'tiktok',
      'https://example.com/video/wrong-cafe',
      NULL, NULL
    )$$,
  'P0001',
  NULL,
  'submit rejects campaign not belonging to cafe_a'
);

-- staff without marketing cannot approve
PERFORM set_config('request.jwt.claim.sub', '10000001-0001-4001-8001-000000000004', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.approve_experience_submission(
      (SELECT id FROM public.experience_submissions
       WHERE customer_id = '30000001-0001-4001-8001-000000000001'
       ORDER BY created_at DESC LIMIT 1),
      10
    )$$,
  'P0001',
  NULL,
  'staff without marketing cannot approve submission'
);

-- marketing staff can approve within max points
PERFORM set_config('request.jwt.claim.sub', '10000001-0001-4001-8001-000000000006', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.approve_experience_submission(
      (SELECT id FROM public.experience_submissions
       WHERE customer_id = '30000001-0001-4001-8001-000000000001'
       ORDER BY created_at DESC LIMIT 1),
      999
    )$$,
  'P0001',
  NULL,
  'approve rejects points above max_points_per_submission'
);

SELECT lives_ok(
  $$SELECT public.approve_experience_submission(
      (SELECT id FROM public.experience_submissions
       WHERE customer_id = '30000001-0001-4001-8001-000000000001'
       ORDER BY created_at DESC LIMIT 1),
      25
    )$$,
  'marketing staff approves submission with valid points'
);

SELECT throws_ok(
  $$SELECT public.approve_experience_submission(
      (SELECT id FROM public.experience_submissions
       WHERE customer_id = '30000001-0001-4001-8001-000000000001'
       ORDER BY created_at DESC LIMIT 1),
      25
    )$$,
  'P0001',
  NULL,
  'cannot approve same submission twice'
);

SELECT * FROM finish();
ROLLBACK;
