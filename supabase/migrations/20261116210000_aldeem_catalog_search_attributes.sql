-- Extend the existing bounded, owner-only Aldeem lookup without loading the catalog upfront
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $patch$
DECLARE source text; anchor text;
BEGIN
  SELECT pg_get_functiondef('public.aldeem_invoice_catalog_lookup(uuid,text,uuid[])'::regprocedure) INTO source;
  anchor := 'OR m.payload->>''weight'' ILIKE term';
  IF position(anchor IN source) = 0 THEN RAISE EXCEPTION 'Inventory search anchor changed'; END IF;
  source := replace(source, anchor, anchor || ' OR m.payload->>''size'' ILIKE term OR m.payload->>''volume'' ILIKE term OR m.payload->>''attributes'' ILIKE term');
  anchor := 'OR commerce_details->>''attributes'' ILIKE term';
  IF position(anchor IN source) = 0 THEN RAISE EXCEPTION 'Menu search anchor changed'; END IF;
  source := replace(source, anchor, anchor || ' OR commerce_details->>''options'' ILIKE term');
  EXECUTE source;
END $patch$;
NOTIFY pgrst, 'reload schema';
COMMIT;
