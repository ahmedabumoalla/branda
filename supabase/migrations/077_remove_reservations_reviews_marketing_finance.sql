-- Reservations
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'create_customer_reservation',
        'create_customer_reservation_v2',
        'respond_to_reservation',
        'cashier_accept_reservation',
        'ensure_reservation_code',
        'upsert_reservation_service',
        'upsert_reservation_service_v2',
        'upsert_reservation_service_v3',
        'confirm_reservation_code'
      )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', fn.signature);
  END LOOP;
END $$;

DROP TABLE IF EXISTS public.reservation_checkins CASCADE;
DROP TABLE IF EXISTS public.reservation_responses CASCADE;
DROP TABLE IF EXISTS public.reservations CASCADE;
DROP TABLE IF EXISTS public.reservation_services CASCADE;
DROP TABLE IF EXISTS public.reservation_service_types CASCADE;
ALTER TABLE IF EXISTS public.platform_plans
  DROP COLUMN IF EXISTS max_reservations_monthly CASCADE;
ALTER TABLE IF EXISTS public.offers
  DROP COLUMN IF EXISTS reservation_service_id CASCADE;
ALTER TABLE IF EXISTS public.experience_campaigns
  DROP COLUMN IF EXISTS reward_reservation_service_id CASCADE;

-- Product reviews and questions
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'enforce_review_owner_reply_only',
        'set_review_owner_reply',
        'create_customer_review'
      )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', fn.signature);
  END LOOP;
END $$;

DROP TABLE IF EXISTS public.product_answers CASCADE;
DROP TABLE IF EXISTS public.product_questions CASCADE;
DROP TABLE IF EXISTS public.product_ratings CASCADE;
DROP TABLE IF EXISTS public.product_reviews CASCADE;
DROP TABLE IF EXISTS public.reviews CASCADE;

-- Marketing tools (offers remain intact)
DROP FUNCTION IF EXISTS public.storage_marketing_is_public(uuid, uuid) CASCADE;
DROP TABLE IF EXISTS public.marketing_campaigns CASCADE;

-- Standalone Branda Finance. Subscription billing and payment tables remain intact.
DO $$
DECLARE tbl record;
BEGIN
  FOR tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'finance_%'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', tbl.tablename);
  END LOOP;
END $$;
