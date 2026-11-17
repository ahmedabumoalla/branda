-- Future registrations only; never rewrite existing subscription clocks
-- Forward rollback restores catalog trial_days to 7 for '-' and 0 for the
-- other three plans, without altering subscriptions already created
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF (SELECT count(*) FROM public.platform_plans WHERE id IN('-','starter','pro','plan-b523d348') AND active)<>4
 THEN RAISE EXCEPTION 'Expected active trial, menu, loyalty and combined plans'; END IF;
END $$;
UPDATE public.platform_plans SET trial_days=30 WHERE id IN('-','starter','pro','plan-b523d348');
COMMIT;
