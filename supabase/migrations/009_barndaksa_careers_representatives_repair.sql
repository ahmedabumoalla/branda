-- Barndaksa Platform — Careers and representatives repair
-- Version: 009
-- Run after 008_barndaksa_platform_growth_suite.sql
-- TARGET: barndaksa-production

BEGIN;

ALTER TABLE public.platform_representatives
  ADD COLUMN IF NOT EXISTS auth_login_email citext;

ALTER TABLE public.platform_representatives
  ALTER COLUMN bank_account_number DROP NOT NULL,
  ALTER COLUMN iban DROP NOT NULL,
  ALTER COLUMN account_name DROP NOT NULL,
  ALTER COLUMN bank_document_storage_path DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_representatives_auth_login_email
  ON public.platform_representatives(auth_login_email)
  WHERE auth_login_email IS NOT NULL;

UPDATE storage.buckets
SET
  public = false,
  file_size_limit = 8388608,
  allowed_mime_types = ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
WHERE id = 'representative-documents';

COMMIT;

SELECT
  column_name,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'platform_representatives'
  AND column_name IN (
    'auth_login_email',
    'bank_account_number',
    'iban',
    'account_name',
    'swift_code',
    'bank_document_storage_path'
  )
ORDER BY column_name;
