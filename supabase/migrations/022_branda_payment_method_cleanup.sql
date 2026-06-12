-- Branda payment method cleanup
-- Version 022

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
    ALTER TABLE public.subscription_payment_requests
      DROP CONSTRAINT IF EXISTS subscription_payment_requests_payment_method_check;

    ALTER TABLE public.subscription_payment_requests
      ADD CONSTRAINT subscription_payment_requests_payment_method_check
      CHECK (payment_method IN ('bank_transfer','card_paypal','cash'));

    UPDATE public.subscription_payment_requests
    SET payment_method = 'bank_transfer'
    WHERE payment_method = 'cash';
  END IF;
END $$;

COMMIT;

SELECT 'branda_payment_method_cleanup_ready' AS status;
