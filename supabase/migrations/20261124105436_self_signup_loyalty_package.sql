BEGIN;

-- New verified self-registrations always receive the existing loyalty package
-- Keep the free period, protected onboarding proof and administrator flow intact
DO $migration$
DECLARE
  body text := replace(pg_get_functiondef('public.handle_new_user()'::regprocedure), E'\r\n', E'\n');
  old_selection text := $selection$WHERE plan.id=CASE challenge.draft->>'planChoice'
      WHEN 'loyalty' THEN 'pro'
      WHEN 'menu_loyalty' THEN '-'
      ELSE coalesce(
        (SELECT default_plan_id FROM public.category_default_plans WHERE category_id='cafes_coffee'),
        (SELECT default_plan_id FROM public.platform_settings WHERE id='default')) END$selection$;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.platform_plans
    WHERE id = 'pro' AND active AND features ? 'loyalty' AND trial_days BETWEEN 1 AND 365
  ) THEN
    RAISE EXCEPTION 'Self-signup loyalty package unavailable';
  END IF;
  IF position(old_selection IN body) = 0 THEN
    RAISE EXCEPTION 'Unexpected owner plan selection';
  END IF;
  EXECUTE replace(body, old_selection, 'WHERE plan.id=''pro''');
END $migration$;

COMMIT;
