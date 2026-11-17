-- User-requested display identity correction for this existing account only
-- No slugs, credentials, logos, customer names or issued-document snapshots change
-- Rollback uses a new forward migration restoring the audited display names
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.cafes WHERE id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef' AND slug='mind-hospital' AND name IN('مايند','MND')) THEN RAISE EXCEPTION 'Brand identity changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.branches WHERE id='f79f8cf8-9241-4c70-a9a7-b1810e163db3' AND cafe_id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef' AND name IN('مايند المستشفى','MND المستشفى')) THEN RAISE EXCEPTION 'Branch identity changed'; END IF;
END $$;
UPDATE public.cafes SET name='MND',name_en='MND Café & Bakery'
 WHERE id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef' AND slug='mind-hospital';
UPDATE public.branches SET name='MND المستشفى'
 WHERE id='f79f8cf8-9241-4c70-a9a7-b1810e163db3' AND cafe_id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef';
COMMIT;
