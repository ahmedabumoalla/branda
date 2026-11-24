BEGIN;

-- Extend only the existing tenant checks. Preserve function signatures, grants,
-- actor checks, pricing revisions, request replay and notification routing.
DO $migration$
DECLARE
  routine regprocedure;
  original text;
  updated text;
  degrees text := quote_literal('59606e0a-ac48-4d3a-b92d-4e53246468be');
  awlad text := quote_literal('dfa5934b-a097-4fcd-bc5f-2fc8b974e545');
  allowed text := 'p_cafe IN (' || degrees || '::uuid,' || awlad || '::uuid)';
  category_guard text := 'c.visible AND c.deleted_at IS NULL';
BEGIN
  FOREACH routine IN ARRAY ARRAY[
    'salon_private.enabled(uuid,text)'::regprocedure,
    'public.salon_owner_booking_command(uuid,uuid,uuid,text,text,integer,timestamptz)'::regprocedure,
    'public.degrees_create_booking(uuid,uuid,text,text,uuid[],timestamptz,text,text,text)'::regprocedure,
    'public.degrees_set_booking_price(uuid,uuid,uuid,text,integer,integer,numeric)'::regprocedure
  ] LOOP
    original := pg_get_functiondef(routine);
    updated := replace(original, 'p_cafe IS DISTINCT FROM ' || degrees || '::uuid',
                                 '(p_cafe IS NULL OR NOT (' || allowed || '))');
    updated := replace(updated, 'p_cafe=' || degrees, allowed);
    IF updated = original OR strpos(replace(updated, allowed, ''), degrees) > 0 THEN
      RAISE EXCEPTION 'Review booking scope in %', routine;
    END IF;
    IF routine = 'public.degrees_create_booking(uuid,uuid,text,text,uuid[],timestamptz,text,text,text)'::regprocedure THEN
      IF strpos(updated, category_guard) = 0 THEN RAISE EXCEPTION 'Review category selection'; END IF;
      updated := replace(updated, category_guard, category_guard || ' AND (p_cafe <> ' || awlad || ' OR
        (coalesce(c.icon, '''') NOT IN (''awlad-cafe'', ''awlad-laser'')
         AND c.id NOT IN (''aeef5901-6ec7-4d77-bac8-569995ac0002'', ''aeef5901-6ec7-4d77-bac8-569995ac0003'',
                          ''aeef5901-6ec7-4d77-bac8-569995ac0004'', ''aeef5901-6ec7-4d77-bac8-569995ac0005'')))');
    END IF;
    EXECUTE updated;
  END LOOP;
END $migration$;
COMMIT;
