-- Barndaksa customer cafe-scoped passwords
-- Version: 054
-- Adds per-cafe customer password hashes, reset tokens, and scoped sessions.
-- Do not store plain-text passwords or session/reset tokens.

BEGIN;

ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS password_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS session_token_hash text,
  ADD COLUMN IF NOT EXISTS session_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS password_reset_token_hash text,
  ADD COLUMN IF NOT EXISTS password_reset_expires_at timestamptz;

ALTER TABLE public.customer_profiles DROP CONSTRAINT IF EXISTS customer_profiles_email_key;
DROP INDEX IF EXISTS public.idx_customer_profiles_email_unique;
DROP INDEX IF EXISTS public.customer_profiles_email_key;

-- Allows the same email to register in different cafes, while preventing
-- duplicate emails inside the same cafe.
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_profiles_cafe_lower_email_unique
  ON public.customer_profiles (cafe_id, lower(email::text))
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_profiles_session_token_hash_unique
  ON public.customer_profiles (session_token_hash)
  WHERE session_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_profiles_reset_token_hash
  ON public.customer_profiles (password_reset_token_hash)
  WHERE password_reset_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_profiles_cafe_email_lookup
  ON public.customer_profiles (cafe_id, lower(email::text));

COMMIT;
