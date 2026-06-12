-- Branda thermal printing + reservation attendance hardening
-- Adds safe database support for one-time reservation attendance QR and optional printer preferences.
BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS reservation_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS reservation_code_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS cashier_confirmed_by uuid REFERENCES public.cafe_cashiers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cashier_confirmed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_reservations_cafe_status_code
  ON public.reservations(cafe_id, status, reservation_code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_customer_created
  ON public.reservations(cafe_id, customer_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.cafe_printer_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  default_paper_size text NOT NULL DEFAULT '80mm' CHECK (default_paper_size IN ('58mm','80mm')),
  print_orders boolean NOT NULL DEFAULT true,
  print_reservations boolean NOT NULL DEFAULT true,
  print_rewards boolean NOT NULL DEFAULT true,
  print_reports boolean NOT NULL DEFAULT true,
  connection_mode text NOT NULL DEFAULT 'browser' CHECK (connection_mode IN ('browser','local_bridge','network_escpos','cloud')),
  bridge_url text,
  printer_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cafe_printer_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cafe_printer_settings_owner_all ON public.cafe_printer_settings;
CREATE POLICY cafe_printer_settings_owner_all ON public.cafe_printer_settings
  FOR ALL TO authenticated
  USING (public.has_cafe_permission(cafe_id, 'settings') OR public.has_cafe_permission(cafe_id, 'reports') OR public.is_platform_admin())
  WITH CHECK (public.has_cafe_permission(cafe_id, 'settings') OR public.has_cafe_permission(cafe_id, 'reports') OR public.is_platform_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cafe_printer_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cafe_printer_settings TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_reservation_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.reservation_code IS NULL OR btrim(NEW.reservation_code) = '' THEN
    NEW.reservation_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_reservation_code ON public.reservations;
CREATE TRIGGER trg_ensure_reservation_code
BEFORE INSERT ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.ensure_reservation_code();

UPDATE public.reservations
SET reservation_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
WHERE reservation_code IS NULL OR btrim(reservation_code) = '';

COMMIT;
