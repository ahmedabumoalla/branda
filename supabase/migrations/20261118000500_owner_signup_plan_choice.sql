BEGIN;
DO $migration$
DECLARE body text:=replace(pg_get_functiondef('public.handle_new_user()'::regprocedure),E'\r\n',E'\n');
DECLARE old_selection text:=E'WHERE plan.id=coalesce(\n      (SELECT default_plan_id FROM public.category_default_plans WHERE category_id=''cafes_coffee''),\n      (SELECT default_plan_id FROM public.platform_settings WHERE id=''default''))';
BEGIN
 IF position(old_selection IN body)=0 THEN RAISE EXCEPTION 'Unexpected owner plan selection'; END IF;
 body:=replace(body,'  SELECT plan.* INTO v_plan FROM public.platform_plans plan',E'  IF challenge.draft ? ''planChoice'' AND (challenge.draft->>''planChoice'' IS NULL OR challenge.draft->>''planChoice'' NOT IN (''loyalty'',''menu_loyalty'')) THEN\n    RAISE EXCEPTION ''Invalid signup plan choice'' USING ERRCODE=''22023'';\n  END IF;\n  SELECT plan.* INTO v_plan FROM public.platform_plans plan');
 body:=replace(body,old_selection,E'WHERE plan.id=CASE challenge.draft->>''planChoice''\n      WHEN ''loyalty'' THEN ''pro''\n      WHEN ''menu_loyalty'' THEN ''-''\n      ELSE coalesce(\n        (SELECT default_plan_id FROM public.category_default_plans WHERE category_id=''cafes_coffee''),\n        (SELECT default_plan_id FROM public.platform_settings WHERE id=''default'')) END');
 EXECUTE body;
END $migration$;
COMMIT;
