-- Transactional pgTAP regression: run after migrations against local/staging fixtures.
BEGIN;
SELECT plan(64);
CREATE TEMP TABLE loyalty_test_context AS SELECT
  (array_agg(id ORDER BY created_at))[1] AS cafe_a,
  (array_agg(id ORDER BY created_at DESC))[1] AS cafe_b,
  gen_random_uuid() AS customer_a, gen_random_uuid() AS customer_b,
  gen_random_uuid() AS cashier_a, gen_random_uuid() AS cashier_b,
  gen_random_uuid() AS card_a, gen_random_uuid() AS card_b,
  gen_random_uuid() AS stamp_request, gen_random_uuid() AS redeem_request
FROM public.cafes WHERE id IN ('20000001-0001-4001-8001-000000000001', '20000001-0001-4001-8001-000000000002') HAVING count(*) >= 2;
INSERT INTO public.customer_profiles(id, cafe_id, full_name, phone)
  SELECT customer_a, cafe_a, 'Scanner Test A', '966559900013' FROM loyalty_test_context
  UNION ALL SELECT customer_b, cafe_b, 'Scanner Test B', '966559900014' FROM loyalty_test_context;
INSERT INTO public.cafe_cashiers(id, cafe_id, full_name, email, password_hash, temporary_password)
  SELECT cashier_a, cafe_a, 'Employee A', 'scanner-a@test.local', 'test-only', '' FROM loyalty_test_context
  UNION ALL SELECT cashier_b, cafe_b, 'Employee B', 'scanner-b@test.local', 'test-only', '' FROM loyalty_test_context;
INSERT INTO public.cafe_cashier_sessions(cashier_id, cafe_id, token)
  SELECT cashier_a, cafe_a, 'scanner-test-a' FROM loyalty_test_context
  UNION ALL SELECT cashier_b, cafe_b, 'scanner-test-b' FROM loyalty_test_context;
INSERT INTO public.cafe_loyalty_programs(cafe_id, purchases_required, enabled, reward_name)
  SELECT cafe_a, 2, true, 'Test reward' FROM loyalty_test_context
  ON CONFLICT(cafe_id) DO UPDATE SET purchases_required = 2, enabled = true;
INSERT INTO public.cafe_loyalty_experience(cafe_id, reward_validity_days)
  SELECT cafe_a, 9 FROM loyalty_test_context
  ON CONFLICT(cafe_id) DO UPDATE SET reward_validity_days = 9;
INSERT INTO public.loyalty_cards(id, cafe_id, customer_profile_id, card_code, customer_name)
  SELECT card_a, cafe_a, customer_a, 'SCANNER_TEST_A', 'Scanner Test A' FROM loyalty_test_context
  UNION ALL SELECT card_b, cafe_b, customer_b, 'SCANNER_TEST_B', 'Scanner Test B' FROM loyalty_test_context;
INSERT INTO public.wallet_passes(card_id, cafe_id, provider)
  SELECT card_a, cafe_a, 'apple' FROM loyalty_test_context;
SELECT throws_ok($$SELECT public.scan_loyalty_stamp('missing', 'SCANNER_TEST_A', gen_random_uuid())$$, '42501', 'Invalid cashier session', 'invalid session denied');
SELECT is(public.scan_loyalty_stamp('scanner-test-a', 'SCANNER_TEST_B', gen_random_uuid())->>'status', 'not_found', 'foreign card is hidden');
CREATE TEMP TABLE loyalty_first_scan AS SELECT public.scan_loyalty_stamp('scanner-test-a', 'SCANNER_TEST_A', stamp_request) AS result FROM loyalty_test_context;
SELECT is((SELECT result->>'status' FROM loyalty_first_scan), 'stamped', 'valid scan adds stamp');
SELECT is((SELECT stamps_in_cycle FROM public.loyalty_cards WHERE card_code = 'SCANNER_TEST_A'), 1, 'exactly one stamp added');
SELECT is(public.scan_loyalty_stamp('scanner-test-a', 'SCANNER_TEST_A', (SELECT stamp_request FROM loyalty_test_context)), (SELECT result FROM loyalty_first_scan), 'request replay returns same result');
SELECT is((SELECT total_purchases FROM public.loyalty_cards WHERE card_code = 'SCANNER_TEST_A'), 1, 'replay does not count another purchase');
SELECT throws_ok($$SELECT public.scan_loyalty_stamp('scanner-test-a', 'SCANNER_TEST_B', (SELECT stamp_request FROM loyalty_test_context))$$, '22023', 'Scan request already used', 'request cannot be reused for another card');
SELECT is(public.scan_loyalty_stamp('scanner-test-a', 'SCANNER_TEST_A', gen_random_uuid())->>'status', 'cooldown', 'camera repeats prevented by cooldown');
SELECT is((SELECT count(*)::integer FROM public.loyalty_card_events WHERE card_id = (SELECT card_a FROM loyalty_test_context)), 1, 'cooldown creates no stamp event');
UPDATE public.loyalty_card_events SET created_at = now() - interval '16 seconds' WHERE card_id = (SELECT card_a FROM loyalty_test_context);
CREATE TEMP TABLE loyalty_reward_scan AS SELECT public.scan_loyalty_stamp('scanner-test-a', 'SCANNER_TEST_A', gen_random_uuid()) AS result;
SELECT is((SELECT result->>'status' FROM loyalty_reward_scan), 'reward_issued', 'cycle completion issues reward');
SELECT is((SELECT stamps_in_cycle FROM public.loyalty_cards WHERE card_code = 'SCANNER_TEST_A'), 0, 'completed cycle resets stamps');
SELECT is((SELECT completed_cycles FROM public.loyalty_cards WHERE card_code = 'SCANNER_TEST_A'), 1, 'completed cycle counted once');
SELECT is((SELECT available_rewards FROM public.loyalty_cards WHERE card_code = 'SCANNER_TEST_A'), 1, 'reward balance incremented');
SELECT is((SELECT count(*)::integer FROM public.customer_reward_instances WHERE loyalty_card_id = (SELECT card_a FROM loyalty_test_context)), 1, 'one reward instance created');
SELECT ok((SELECT expires_at = issued_at + interval '9 days' FROM public.customer_reward_instances WHERE loyalty_card_id = (SELECT card_a FROM loyalty_test_context)), 'configured validity recorded atomically');
SELECT is(public.redeem_loyalty_reward('scanner-test-b', (SELECT result->>'rewardCode' FROM loyalty_reward_scan), gen_random_uuid())->>'status', 'not_found', 'foreign reward is hidden');
CREATE TEMP TABLE loyalty_redeem_result AS SELECT public.redeem_loyalty_reward('scanner-test-a', (SELECT result->>'rewardCode' FROM loyalty_reward_scan), redeem_request) AS result FROM loyalty_test_context;
SELECT is((SELECT result->>'status' FROM loyalty_redeem_result), 'redeemed', 'reward redeems successfully');
SELECT is((SELECT available_rewards FROM public.loyalty_cards WHERE card_code = 'SCANNER_TEST_A'), 0, 'balance decremented with redemption');
SELECT is(public.redeem_loyalty_reward('scanner-test-a', (SELECT result->>'rewardCode' FROM loyalty_reward_scan), (SELECT redeem_request FROM loyalty_test_context)), (SELECT result FROM loyalty_redeem_result), 'redemption replay is idempotent');
SELECT is((SELECT count(*)::integer FROM public.customer_reward_redemptions WHERE reward_instance_id = (SELECT (result->>'rewardInstanceId')::uuid FROM loyalty_redeem_result)), 1, 'only one redemption audit row');
SELECT is(public.redeem_loyalty_reward('scanner-test-a', (SELECT result->>'rewardCode' FROM loyalty_reward_scan), gen_random_uuid())->>'status', 'redeemed', 'used reward cannot redeem again');
SELECT is((SELECT available_rewards FROM public.loyalty_cards WHERE card_code = 'SCANNER_TEST_A'), 0, 'second redemption leaves balance unchanged');
UPDATE public.cafe_cashiers SET active = false WHERE id = (SELECT cashier_a FROM loyalty_test_context);
SELECT throws_ok($$SELECT public.scan_loyalty_stamp('scanner-test-a', 'SCANNER_TEST_A', gen_random_uuid())$$, '42501', 'Invalid cashier session', 'disabled employee denied despite live session');
UPDATE public.cafe_cashiers SET active = true WHERE id = (SELECT cashier_a FROM loyalty_test_context);
UPDATE public.cafe_cashier_sessions SET revoked_at = now() WHERE token = 'scanner-test-a';
SELECT throws_ok($$SELECT public.scan_loyalty_stamp('scanner-test-a', 'SCANNER_TEST_A', gen_random_uuid())$$, '42501', 'Invalid cashier session', 'revoked session denied');
UPDATE public.cafe_cashier_sessions SET revoked_at = NULL, expires_at = now() - interval '1 second' WHERE token = 'scanner-test-a';
SELECT throws_ok($$SELECT public.scan_loyalty_stamp('scanner-test-a', 'SCANNER_TEST_A', gen_random_uuid())$$, '42501', 'Invalid cashier session', 'expired session denied');
UPDATE public.cafe_cashier_sessions SET expires_at = now() + interval '1 hour' WHERE token = 'scanner-test-a';
INSERT INTO public.customer_reward_instances(cafe_id, customer_id, loyalty_card_id, source_type, reward_title, reward_code, qr_payload, expires_at)
  SELECT cafe_a, customer_a, card_a, 'loyalty', 'Expired test', 'SCANNER_EXPIRED', 'SCANNER_EXPIRED_QR', now() - interval '1 second' FROM loyalty_test_context;
UPDATE public.loyalty_cards SET available_rewards = 1 WHERE id = (SELECT card_a FROM loyalty_test_context);
SELECT is(public.redeem_loyalty_reward('scanner-test-a', 'SCANNER_EXPIRED', gen_random_uuid())->>'status', 'expired', 'expired reward denied');
SELECT is((SELECT count(*)::integer FROM public.customer_reward_redemptions WHERE scanned_code = 'SCANNER_EXPIRED'), 0, 'expired reward has no redemption');
SELECT is((SELECT available_rewards FROM public.loyalty_cards WHERE card_code = 'SCANNER_TEST_A'), 0, 'expired balance removed once');
SELECT throws_ok($$UPDATE public.cafe_loyalty_experience SET reward_validity_days = 366 WHERE cafe_id = (SELECT cafe_a FROM loyalty_test_context)$$, '23514', NULL, 'invalid validity rejected');
SELECT throws_ok($$UPDATE public.cafe_loyalty_experience SET branch_latitude = 24 WHERE cafe_id = (SELECT cafe_a FROM loyalty_test_context)$$, '23514', NULL, 'partial coordinates rejected');
SELECT throws_ok($$INSERT INTO public.wallet_passes(card_id,cafe_id,provider) SELECT card_a,cafe_b,'google' FROM loyalty_test_context$$, '23503', NULL, 'wallet tenant mismatch rejected');
SELECT ok(NOT has_function_privilege('anon', 'public.scan_loyalty_stamp(text,text,uuid)', 'EXECUTE') AND NOT has_function_privilege('authenticated', 'public.scan_loyalty_stamp(text,text,uuid)', 'EXECUTE'), 'scan RPC reserved for server');
SELECT ok(NOT has_table_privilege('authenticated','public.wallet_apple_registrations','SELECT') AND NOT has_table_privilege('anon','public.wallet_notification_jobs','SELECT'), 'wallet tokens and queue private');
SELECT ok((SELECT count(*) > 0 FROM public.wallet_notification_jobs WHERE card_id = (SELECT card_a FROM loyalty_test_context)), 'state changes queue wallet updates');
CREATE TEMP TABLE loyalty_settings_test AS SELECT cafe_a AS cafe_id,
  '{"enabled":true,"cardTitle":"Test card","cardSubtitle":"Test subtitle","purchasesRequired":3,"rewardProductId":null,"rewardName":"Test reward","stampLabel":"stamp","terms":"","cardBackground":"#441122","cardForeground":"#ffffff","cardAccent":"#bb8844","appleWalletEnabled":true,"googleWalletEnabled":true}'::jsonb AS program,
  '{"rewardValidityDays":12,"nearbyMessage":"Visit us","latitude":null,"longitude":null}'::jsonb AS experience FROM loyalty_test_context;
SELECT throws_ok($$SELECT public.set_loyalty_experience_program(cafe_id,program,experience) FROM loyalty_settings_test$$, '42501', 'Forbidden', 'owner mutation requires permission');
-- Use the seeded owner JWT on Supabase; the isolated harness reads this matching test setting.
SELECT set_config('request.jwt.claims', '{"sub":"10000001-0001-4001-8001-000000000002","role":"authenticated"}', true);
SELECT set_config('test.cafe_id', cafe_a::text, true) FROM loyalty_test_context;
GRANT SELECT ON loyalty_settings_test, loyalty_test_context TO authenticated, service_role;
-- On local/staging this assumes the standard security test cafe A fixture.
SET LOCAL ROLE authenticated;
SELECT public.set_loyalty_experience_program(cafe_id,program,experience) FROM loyalty_settings_test;
RESET ROLE;
SELECT is((SELECT purchases_required FROM public.cafe_loyalty_programs WHERE cafe_id = (SELECT cafe_a FROM loyalty_test_context)), 3, 'owner saves program');
SELECT is((SELECT reward_validity_days FROM public.cafe_loyalty_experience WHERE cafe_id = (SELECT cafe_a FROM loyalty_test_context)), 12, 'owner saves experience in same call');
SELECT throws_ok($$SELECT public.set_loyalty_experience_program(cafe_id, jsonb_set(program,'{purchasesRequired}','4'), jsonb_set(experience,'{rewardValidityDays}','366')) FROM loyalty_settings_test$$, '23514', NULL, 'invalid experience rejects complete save');
SELECT is((SELECT purchases_required FROM public.cafe_loyalty_programs WHERE cafe_id = (SELECT cafe_a FROM loyalty_test_context)), 3, 'failed experience rolls back program save');
SELECT is((SELECT reward_validity_days FROM public.cafe_loyalty_experience WHERE cafe_id = (SELECT cafe_a FROM loyalty_test_context)), 12, 'failed experience preserves expiry setting');
CREATE TEMP TABLE loyalty_claimed_jobs AS SELECT id FROM public.claim_wallet_notification_jobs(2);
SELECT is((SELECT count(*)::integer FROM loyalty_claimed_jobs), 2, 'queue claims bounded job batch');
SELECT is((SELECT count(*)::integer FROM public.claim_wallet_notification_jobs(100) j JOIN loyalty_claimed_jobs c ON c.id = j.id), 0, 'active claims cannot be claimed twice');
UPDATE public.wallet_notification_jobs SET claimed_at = now() - interval '6 minutes' WHERE id IN (SELECT id FROM loyalty_claimed_jobs);
SELECT is((SELECT count(*)::integer FROM public.claim_wallet_notification_jobs(100) j JOIN loyalty_claimed_jobs c ON c.id = j.id), 2, 'stale lease can be recovered');
SELECT throws_ok($$SELECT * FROM public.claim_wallet_notification_jobs(101)$$, '22023', 'Invalid job limit', 'unbounded queue claims rejected');
UPDATE public.cafe_loyalty_experience SET offer_title = 'New offer', offer_body = 'Today only' WHERE cafe_id = (SELECT cafe_a FROM loyalty_test_context);
CREATE TEMP TABLE loyalty_offer_stamp AS SELECT offer_updated_at FROM public.cafe_loyalty_experience WHERE cafe_id = (SELECT cafe_a FROM loyalty_test_context);
SELECT ok((SELECT offer_updated_at IS NOT NULL FROM loyalty_offer_stamp), 'new offer records message timestamp');
UPDATE public.cafe_loyalty_experience SET offer_title = 'New offer', offer_body = 'Today only' WHERE cafe_id = (SELECT cafe_a FROM loyalty_test_context);
SELECT is((SELECT offer_updated_at FROM public.cafe_loyalty_experience WHERE cafe_id = (SELECT cafe_a FROM loyalty_test_context)), (SELECT offer_updated_at FROM loyalty_offer_stamp), 'unchanged offer keeps message timestamp');
SELECT ok(NOT has_function_privilege('anon','public.set_loyalty_experience_program(uuid,jsonb,jsonb)','EXECUTE'), 'public cannot call owner settings RPC');
SELECT ok((SELECT apple_wallet_enabled FROM public.cafe_loyalty_programs WHERE cafe_id = (SELECT cafe_a FROM loyalty_test_context)), 'Apple wallet flag persists with settings');
SELECT ok((SELECT google_wallet_enabled FROM public.cafe_loyalty_programs WHERE cafe_id = (SELECT cafe_a FROM loyalty_test_context)), 'Google wallet flag persists with settings');
INSERT INTO public.cafe_loyalty_experience(cafe_id) SELECT cafe_b FROM loyalty_test_context ON CONFLICT(cafe_id) DO NOTHING;
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.cafe_loyalty_experience), 1, 'owner RLS reveals only own experience');
WITH changed AS (UPDATE public.cafe_loyalty_experience SET nearby_message = 'foreign mutation' WHERE cafe_id = (SELECT cafe_b FROM loyalty_test_context) RETURNING cafe_id)
  SELECT is(count(*)::integer, 0, 'owner cannot update foreign experience') FROM changed;
SELECT throws_ok($$INSERT INTO public.cafe_loyalty_experience(cafe_id) SELECT cafe_b FROM loyalty_test_context ON CONFLICT(cafe_id) DO UPDATE SET reward_validity_days = 5$$, '42501', NULL, 'owner cannot insert or upsert foreign experience');
SELECT throws_ok($$SELECT public.set_loyalty_experience_program(cafe_id,jsonb_set(program,'{appleWalletEnabled}','"true"'),experience) FROM loyalty_settings_test$$, '22023', 'Invalid loyalty settings', 'wallet flag must be boolean');
RESET ROLE;
SELECT ok(NOT has_table_privilege('anon','public.cafe_loyalty_experience','SELECT'), 'anonymous callers cannot read private experience configuration');
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.scan_loyalty_stamp('scanner-test-a','SCANNER_TEST_A',gen_random_uuid())$$, '42501', NULL, 'anonymous role cannot invoke scanner even with session token');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT is(public.scan_loyalty_stamp('scanner-test-a','SCANNER_TEST_A',gen_random_uuid())->>'status', 'cooldown', 'trusted server role invokes scanner successfully');
RESET ROLE;
UPDATE public.cafe_cashiers SET password_hash = extensions.crypt('Scanner-Valid-Password', extensions.gen_salt('bf')) WHERE id = (SELECT cashier_a FROM loyalty_test_context);
SELECT throws_ok($$SELECT * FROM public.login_cafe_cashier('scanner-a@test.local', NULL)$$, 'P0001', 'Invalid cashier credentials', 'NULL password cannot bypass login');
SELECT throws_ok($$SELECT * FROM public.login_cafe_cashier('scanner-a@test.local', '')$$, 'P0001', 'Invalid cashier credentials', 'empty password denied');
SELECT throws_ok($$SELECT * FROM public.login_cafe_cashier('scanner-a@test.local', 'Wrong-Password')$$, 'P0001', 'Invalid cashier credentials', 'incorrect password denied');
SELECT throws_ok($$SELECT * FROM public.login_cafe_cashier(NULL, 'Scanner-Valid-Password')$$, 'P0001', 'Invalid cashier credentials', 'missing employee email denied');
CREATE TEMP TABLE loyalty_valid_login AS SELECT * FROM public.login_cafe_cashier('scanner-a@test.local', 'Scanner-Valid-Password');
SELECT is((SELECT count(*)::integer FROM loyalty_valid_login), 1, 'valid password still creates login result');
SELECT is((SELECT cashier_id FROM loyalty_valid_login), (SELECT cashier_a FROM loyalty_test_context), 'login session assigned to correct employee');
SELECT ok((SELECT EXISTS(SELECT 1 FROM public.cafe_cashier_sessions s JOIN loyalty_valid_login l ON s.token=l.token AND s.cashier_id=l.cashier_id AND s.cafe_id=l.cafe_id AND s.revoked_at IS NULL AND s.expires_at>now())), 'valid login creates active matching session');
SELECT is((SELECT count(*)::integer FROM public.cafe_cashier_activity_logs WHERE cashier_id=(SELECT cashier_a FROM loyalty_test_context) AND action_type='login'), 1, 'failed logins cannot create session audit rows');
SELECT * FROM finish();
ROLLBACK;
