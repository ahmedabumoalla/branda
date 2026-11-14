-- Apply only after the new MIND menu and old QR redirect are verified in production
-- Archival preserves original records and shared Dabab loyalty/history
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
BEGIN
  IF current_setting('app.mind_hospital_release_verified',true) IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'Verify the production MIND menu and old QR redirect before retiring source'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('mind-hospital-split-20261114',0));
  IF NOT EXISTS(SELECT 1 FROM public.cafes WHERE id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef' AND slug='mind-hospital' AND status='active')
    OR NOT EXISTS(SELECT 1 FROM public.hospital_store_settings WHERE cafe_id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef' AND enabled) THEN RAISE EXCEPTION 'Destination is not active'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.branches WHERE id='5924245c-a143-4170-8699-79fd3c279d92' AND cafe_id='3813425d-db13-4d30-8b82-9d41aad12e36' AND active AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Source branch state changed'; END IF;
  IF EXISTS(SELECT 1 FROM public.bf_documents WHERE cafe_id='3813425d-db13-4d30-8b82-9d41aad12e36') THEN RAISE EXCEPTION 'Source finance history requires reconciliation before archival'; END IF;
  IF (SELECT count(*) FROM public.menu_products WHERE cafe_id='3813425d-db13-4d30-8b82-9d41aad12e36' AND branch_id='5924245c-a143-4170-8699-79fd3c279d92' AND deleted_at IS NULL)<>111 THEN RAISE EXCEPTION 'Source live catalog changed'; END IF;
  IF EXISTS(SELECT 1 FROM public.menu_products s LEFT JOIN public.menu_products d ON d.id=md5('mind-hospital-product:'||s.id::text)::uuid AND d.cafe_id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef'
    WHERE s.cafe_id='3813425d-db13-4d30-8b82-9d41aad12e36' AND s.branch_id='5924245c-a143-4170-8699-79fd3c279d92' AND s.deleted_at IS NULL
    AND (d.id IS NULL OR d.deleted_at IS NOT NULL OR d.name IS DISTINCT FROM s.name OR d.price IS DISTINCT FROM s.price OR d.price_options IS DISTINCT FROM s.price_options OR d.commerce_details IS DISTINCT FROM s.commerce_details)) THEN RAISE EXCEPTION 'Destination catalog no longer matches transferred source'; END IF;
END $guard$;
UPDATE public.menu_products SET deleted_at=now(),updated_at=now()
 WHERE cafe_id='3813425d-db13-4d30-8b82-9d41aad12e36' AND branch_id='5924245c-a143-4170-8699-79fd3c279d92' AND deleted_at IS NULL;
UPDATE public.menu_categories SET deleted_at=now(),updated_at=now()
 WHERE cafe_id='3813425d-db13-4d30-8b82-9d41aad12e36' AND branch_id='5924245c-a143-4170-8699-79fd3c279d92' AND deleted_at IS NULL;
UPDATE public.branches SET active=false,updated_at=now()
 WHERE id='5924245c-a143-4170-8699-79fd3c279d92' AND cafe_id='3813425d-db13-4d30-8b82-9d41aad12e36';
