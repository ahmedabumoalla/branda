-- Explicit product identity only; activation, pricing and features remain admin-controlled
BEGIN;
UPDATE public.platform_plans SET is_upgrade_bundle=true WHERE id='plan-e544dced';
NOTIFY pgrst,'reload schema';
COMMIT;
