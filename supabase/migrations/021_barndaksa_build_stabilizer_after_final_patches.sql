-- Barndaksa build stabilizer after final patches
-- Version 021

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscription_payment_requests'
      AND column_name = 'payment_method'
  ) THEN
    BEGIN
      ALTER TABLE public.subscription_payment_requests
        DROP CONSTRAINT IF EXISTS subscription_payment_requests_payment_method_check;
    EXCEPTION WHEN undefined_object THEN
      NULL;
    END;

    ALTER TABLE public.subscription_payment_requests
      ADD CONSTRAINT subscription_payment_requests_payment_method_check
      CHECK (payment_method IN ('bank_transfer','card_paypal','cash'));
  END IF;
END $$;

COMMIT;

SELECT 'barndaksa_build_stabilizer_ready' AS status;
