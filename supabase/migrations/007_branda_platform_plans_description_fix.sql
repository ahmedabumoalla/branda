-- Branda Platform — Fix platform plan description persistence
-- Version: 007
-- Run after 006_branda_subscription_checkout_upgrade.sql
-- TARGET: branda-production

BEGIN;

ALTER TABLE public.platform_plans
  ADD COLUMN IF NOT EXISTS description text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'platform_plans_description_length_check'
      AND conrelid = 'public.platform_plans'::regclass
  ) THEN
    ALTER TABLE public.platform_plans
      ADD CONSTRAINT platform_plans_description_length_check
      CHECK (
        description IS NULL
        OR char_length(description) <= 500
      ) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.platform_plans
  VALIDATE CONSTRAINT platform_plans_description_length_check;

COMMIT;

SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'platform_plans'
  AND column_name = 'description';
