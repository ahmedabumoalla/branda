-- Branda remove old cafe themes and keep custom identity only
-- Version 023

BEGIN;

UPDATE public.cafe_settings
SET theme_id = 'brand-identity-custom'
WHERE theme_id IS DISTINCT FROM 'brand-identity-custom';

COMMIT;

SELECT 'branda_only_custom_identity_theme_ready' AS status;
