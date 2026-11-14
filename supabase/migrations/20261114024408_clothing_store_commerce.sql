BEGIN;
SET LOCAL lock_timeout = '5s';

-- Reuse the existing commerce authorization, settlement and reservation engine.
-- Only widen its category predicate; preserve current function bodies and ACLs.
DO $migration$
DECLARE
  signature text;
  source text;
  needle text := 'business_category=''gifts_flowers''';
  replacement text := 'business_category IN (''gifts_flowers'',''clothing_stores'')';
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'gift_commerce_private.can_manage(uuid)',
    'public.gift_store_config(text)',
    'public.storage_menu_product_is_public(uuid,uuid)'
  ] LOOP
    source := pg_get_functiondef(signature::regprocedure);
    IF (length(source) - length(replace(source, needle, ''))) / length(needle) <> 1 THEN
      RAISE EXCEPTION 'Unexpected commerce category guard in %; inspect before applying', signature;
    END IF;
    EXECUTE replace(source, needle, replacement);
  END LOOP;
END;
$migration$;

-- Explicitly retain the existing least-privilege boundary.
REVOKE ALL ON FUNCTION gift_commerce_private.can_manage(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION gift_commerce_private.can_manage(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.gift_store_config(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gift_store_config(text) TO service_role;
COMMIT;
