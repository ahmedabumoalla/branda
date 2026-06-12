
-- Barndaksa all-in-one upgrade closure
-- Version: 017
-- Run once after 016
BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','blocked')),
  ADD COLUMN IF NOT EXISTS app_installed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_visit_at timestamptz;

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS reservation_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS reservation_code_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS reservation_service_id uuid,
  ADD COLUMN IF NOT EXISTS reservation_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS cashier_confirmed_by uuid REFERENCES public.cafe_cashiers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cashier_confirmed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.reservation_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price numeric(12,2),
  is_free boolean NOT NULL DEFAULT false,
  max_guests integer,
  available_slots text[] NOT NULL DEFAULT '{}',
  image_storage_path text,
  video_storage_path text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reservation_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  cashier_id uuid REFERENCES public.cafe_cashiers(id) ON DELETE SET NULL,
  code text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reservation_id)
);

CREATE TABLE IF NOT EXISTS public.customer_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  customer_profile_id uuid REFERENCES public.customer_profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  source text,
  target_type text,
  target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cafe_visit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  customer_profile_id uuid REFERENCES public.customer_profiles(id) ON DELETE SET NULL,
  session_id text NOT NULL,
  path text NOT NULL,
  referrer text,
  duration_seconds integer,
  converted_order boolean NOT NULL DEFAULT false,
  converted_reservation boolean NOT NULL DEFAULT false,
  repeated_visit boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservation_services_cafe_active ON public.reservation_services(cafe_id, active, sort_order);
CREATE INDEX IF NOT EXISTS idx_customer_activity_cafe_customer ON public.customer_activity_events(cafe_id, customer_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cafe_visit_events_cafe_created ON public.cafe_visit_events(cafe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_code ON public.reservations(reservation_code);

ALTER TABLE public.reservation_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cafe_visit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reservation_services_owner_all ON public.reservation_services;
CREATE POLICY reservation_services_owner_all ON public.reservation_services
  FOR ALL TO authenticated
  USING (public.has_cafe_permission(cafe_id, 'reservations') OR public.has_cafe_permission(cafe_id, 'settings') OR public.is_platform_admin())
  WITH CHECK (public.has_cafe_permission(cafe_id, 'reservations') OR public.has_cafe_permission(cafe_id, 'settings') OR public.is_platform_admin());

DROP POLICY IF EXISTS reservation_services_public_read ON public.reservation_services;
CREATE POLICY reservation_services_public_read ON public.reservation_services
  FOR SELECT TO anon, authenticated
  USING (active = true AND EXISTS (SELECT 1 FROM public.cafes c WHERE c.id = cafe_id AND c.status = 'active' AND c.is_public = true AND c.deleted_at IS NULL));

DROP POLICY IF EXISTS reservation_checkins_owner_read ON public.reservation_checkins;
CREATE POLICY reservation_checkins_owner_read ON public.reservation_checkins
  FOR SELECT TO authenticated
  USING (public.has_cafe_permission(cafe_id, 'reservations') OR public.is_platform_admin());

DROP POLICY IF EXISTS customer_activity_owner_read ON public.customer_activity_events;
CREATE POLICY customer_activity_owner_read ON public.customer_activity_events
  FOR SELECT TO authenticated
  USING (public.has_cafe_permission(cafe_id, 'customers') OR public.is_platform_admin());

DROP POLICY IF EXISTS cafe_visit_owner_read ON public.cafe_visit_events;
CREATE POLICY cafe_visit_owner_read ON public.cafe_visit_events
  FOR SELECT TO authenticated
  USING (public.has_cafe_permission(cafe_id, 'reports') OR public.is_platform_admin());

GRANT SELECT ON public.reservation_services TO anon, authenticated;
GRANT SELECT ON public.reservation_checkins TO authenticated;
GRANT SELECT ON public.customer_activity_events TO authenticated;
GRANT SELECT ON public.cafe_visit_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_services TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_checkins TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_activity_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cafe_visit_events TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_reservation_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.reservation_code IS NULL OR NEW.reservation_code = '' THEN
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
WHERE reservation_code IS NULL;

CREATE OR REPLACE FUNCTION public.upsert_reservation_service(
  p_service_id uuid,
  p_name text,
  p_description text,
  p_price numeric,
  p_is_free boolean,
  p_max_guests integer,
  p_available_slots text[],
  p_image_storage_path text,
  p_video_storage_path text,
  p_active boolean,
  p_sort_order integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cafe_id uuid;
  v_id uuid;
BEGIN
  SELECT c.id INTO v_cafe_id
  FROM public.cafes c
  WHERE c.owner_user_id = auth.uid()
    AND c.deleted_at IS NULL
  LIMIT 1;

  IF v_cafe_id IS NULL THEN
    SELECT cm.cafe_id INTO v_cafe_id
    FROM public.cafe_members cm
    WHERE cm.user_id = auth.uid()
    LIMIT 1;
  END IF;

  IF v_cafe_id IS NULL OR NOT (public.has_cafe_permission(v_cafe_id, 'reservations') OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_service_id IS NOT NULL THEN
    UPDATE public.reservation_services
    SET name = btrim(p_name),
        description = NULLIF(btrim(COALESCE(p_description, '')), ''),
        price = p_price,
        is_free = COALESCE(p_is_free, false),
        max_guests = p_max_guests,
        available_slots = COALESCE(p_available_slots, '{}'),
        image_storage_path = NULLIF(btrim(COALESCE(p_image_storage_path, '')), ''),
        video_storage_path = NULLIF(btrim(COALESCE(p_video_storage_path, '')), ''),
        active = COALESCE(p_active, true),
        sort_order = COALESCE(p_sort_order, 0),
        updated_at = now()
    WHERE id = p_service_id AND cafe_id = v_cafe_id
    RETURNING id INTO v_id;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.reservation_services (
      cafe_id, name, description, price, is_free, max_guests, available_slots,
      image_storage_path, video_storage_path, active, sort_order
    ) VALUES (
      v_cafe_id, btrim(p_name), NULLIF(btrim(COALESCE(p_description, '')), ''), p_price,
      COALESCE(p_is_free, false), p_max_guests, COALESCE(p_available_slots, '{}'),
      NULLIF(btrim(COALESCE(p_image_storage_path, '')), ''),
      NULLIF(btrim(COALESCE(p_video_storage_path, '')), ''),
      COALESCE(p_active, true), COALESCE(p_sort_order, 0)
    ) RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_customer_operational_status(
  p_customer_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cafe_id uuid;
BEGIN
  SELECT cafe_id INTO v_cafe_id FROM public.customer_profiles WHERE id = p_customer_id;

  IF v_cafe_id IS NULL THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  IF NOT (public.has_cafe_permission(v_cafe_id, 'customers') OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_status NOT IN ('active','suspended','blocked') THEN
    RAISE EXCEPTION 'Invalid customer status';
  END IF;

  UPDATE public.customer_profiles SET status = p_status, updated_at = now() WHERE id = p_customer_id;

  INSERT INTO public.customer_activity_events(cafe_id, customer_profile_id, event_type, source, target_type, target_id, metadata)
  VALUES (v_cafe_id, p_customer_id, 'customer_status_changed', 'dashboard', 'customer', p_customer_id, jsonb_build_object('status', p_status, 'by', auth.uid()));
END;
$$;

CREATE OR REPLACE FUNCTION public.track_cafe_visit(
  p_slug text,
  p_session_id text,
  p_path text,
  p_referrer text,
  p_duration_seconds integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cafe_id uuid;
  v_customer_id uuid;
  v_seen boolean;
BEGIN
  SELECT id INTO v_cafe_id FROM public.cafes WHERE slug = lower(btrim(p_slug)) AND deleted_at IS NULL LIMIT 1;
  IF v_cafe_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_customer_id FROM public.customer_profiles WHERE cafe_id = v_cafe_id AND user_id = auth.uid() LIMIT 1;
  SELECT EXISTS(SELECT 1 FROM public.cafe_visit_events WHERE cafe_id = v_cafe_id AND session_id = p_session_id) INTO v_seen;

  INSERT INTO public.cafe_visit_events(cafe_id, customer_profile_id, session_id, path, referrer, duration_seconds, repeated_visit)
  VALUES(v_cafe_id, v_customer_id, p_session_id, COALESCE(p_path, '/'), p_referrer, p_duration_seconds, v_seen);

  IF v_customer_id IS NOT NULL THEN
    UPDATE public.customer_profiles SET last_visit_at = now() WHERE id = v_customer_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_reservation_code(
  p_session_token text,
  p_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.cafe_cashier_sessions%ROWTYPE;
  v_reservation public.reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_session
  FROM public.cafe_cashier_sessions
  WHERE token = p_session_token AND expires_at > now() AND revoked_at IS NULL
  LIMIT 1;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Invalid cashier session';
  END IF;

  SELECT * INTO v_reservation
  FROM public.reservations
  WHERE cafe_id = v_session.cafe_id
    AND upper(reservation_code) = upper(btrim(p_code))
    AND status = 'accepted'
  LIMIT 1;

  IF v_reservation.id IS NULL THEN
    RAISE EXCEPTION 'Reservation not found or not accepted';
  END IF;

  IF v_reservation.reservation_code_used_at IS NOT NULL THEN
    RAISE EXCEPTION 'Reservation code already used';
  END IF;

  UPDATE public.reservations
  SET reservation_code_used_at = now(), cashier_confirmed_by = v_session.cashier_id, cashier_confirmed_at = now(), updated_at = now()
  WHERE id = v_reservation.id;

  INSERT INTO public.reservation_checkins(cafe_id, reservation_id, cashier_id, code, details)
  VALUES(
    v_session.cafe_id,
    v_reservation.id,
    v_session.cashier_id,
    upper(btrim(p_code)),
    jsonb_build_object(
      'customerName', v_reservation.customer_name,
      'phone', v_reservation.phone,
      'eventType', v_reservation.event_type,
      'guests', v_reservation.guests,
      'date', v_reservation.reservation_date,
      'time', v_reservation.reservation_time,
      'notes', v_reservation.notes
    )
  );

  INSERT INTO public.cafe_cashier_activity_logs(cafe_id, cashier_id, action_type, target_type, target_id, details)
  VALUES(v_session.cafe_id, v_session.cashier_id, 'reservation_received', 'reservation_checkin', v_reservation.id, jsonb_build_object('reservationCode', p_code, 'customerName', v_reservation.customer_name));

  RETURN jsonb_build_object(
    'ok', true,
    'reservationId', v_reservation.id,
    'customerName', v_reservation.customer_name,
    'phone', v_reservation.phone,
    'eventType', v_reservation.event_type,
    'guests', v_reservation.guests,
    'date', v_reservation.reservation_date,
    'time', v_reservation.reservation_time,
    'notes', v_reservation.notes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_reservation_service(uuid,text,text,numeric,boolean,integer,text[],text,text,boolean,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_customer_operational_status(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.track_cafe_visit(text,text,text,text,integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_reservation_code(text,text) TO anon, authenticated;

COMMIT;

SELECT 'barndaksa_all_in_one_upgrade_ready' AS status;
