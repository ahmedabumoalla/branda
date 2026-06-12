-- Barndaksa Platform — stable cashier and loyalty fix
-- Version: 015
-- TARGET: barndaksa-production
-- Run once after previous loyalty migrations

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

ALTER TABLE public.cafe_cashiers
  ADD COLUMN IF NOT EXISTS employee_number text,
  ADD COLUMN IF NOT EXISTS last_logout_at timestamptz;

ALTER TABLE public.cafe_cashier_sessions
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

CREATE TABLE IF NOT EXISTS public.cafe_cashier_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  cashier_id uuid NOT NULL REFERENCES public.cafe_cashiers(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (
    action_type IN (
      'login',
      'logout',
      'order_received',
      'reservation_received',
      'loyalty_stamp',
      'loyalty_redeem',
      'scan_failed'
    )
  ),
  target_type text,
  target_id uuid,
  invoice_barcode text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cashier_logs_cafe_created
  ON public.cafe_cashier_activity_logs(cafe_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cashier_logs_cashier_created
  ON public.cafe_cashier_activity_logs(cashier_id, created_at DESC);

ALTER TABLE public.cafe_cashier_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cashier_logs_owner_read ON public.cafe_cashier_activity_logs;
CREATE POLICY cashier_logs_owner_read ON public.cafe_cashier_activity_logs
  FOR SELECT TO authenticated
  USING (public.has_cafe_permission(cafe_id, 'loyalty') OR public.is_platform_admin());

GRANT SELECT ON public.cafe_cashier_activity_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cafe_cashier_activity_logs TO service_role;

DROP FUNCTION IF EXISTS public.create_cafe_cashier(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.create_cafe_cashier(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.login_cafe_cashier(text, text);
DROP FUNCTION IF EXISTS public.logout_cafe_cashier(text);
DROP FUNCTION IF EXISTS public.get_cashier_console(text);
DROP FUNCTION IF EXISTS public.cashier_accept_order(text, uuid);
DROP FUNCTION IF EXISTS public.cashier_accept_reservation(text, uuid);
DROP FUNCTION IF EXISTS public.record_loyalty_card_operation(uuid, text, text, numeric, text, text);

CREATE OR REPLACE FUNCTION public.create_cafe_cashier(
  p_cafe_id uuid,
  p_full_name text,
  p_email text,
  p_temp_password text,
  p_employee_number text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT (public.has_cafe_permission(p_cafe_id, 'loyalty') OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF btrim(p_full_name) = '' OR char_length(btrim(p_full_name)) > 80 THEN
    RAISE EXCEPTION 'Invalid cashier name';
  END IF;

  IF p_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email';
  END IF;

  IF char_length(p_temp_password) < 6 OR char_length(p_temp_password) > 40 THEN
    RAISE EXCEPTION 'Invalid temporary password';
  END IF;

  INSERT INTO public.cafe_cashiers (
    cafe_id,
    full_name,
    email,
    employee_number,
    password_hash,
    temporary_password,
    created_by
  )
  VALUES (
    p_cafe_id,
    btrim(p_full_name),
    lower(btrim(p_email)),
    NULLIF(btrim(COALESCE(p_employee_number, '')), ''),
    extensions.crypt(p_temp_password, extensions.gen_salt('bf')),
    p_temp_password,
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.login_cafe_cashier(
  p_email text,
  p_password text
)
RETURNS TABLE (
  token text,
  cafe_id uuid,
  cashier_id uuid,
  cashier_name text,
  cafe_name text,
  cafe_slug text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cashier public.cafe_cashiers%ROWTYPE;
  v_cafe public.cafes%ROWTYPE;
  v_token text;
BEGIN
  SELECT *
  INTO v_cashier
  FROM public.cafe_cashiers
  WHERE lower(email) = lower(btrim(p_email))
    AND active = true
  LIMIT 1;

  IF v_cashier.id IS NULL
     OR v_cashier.password_hash <> extensions.crypt(p_password, v_cashier.password_hash) THEN
    RAISE EXCEPTION 'Invalid cashier credentials';
  END IF;

  SELECT *
  INTO v_cafe
  FROM public.cafes
  WHERE id = v_cashier.cafe_id;

  IF v_cafe.id IS NULL THEN
    RAISE EXCEPTION 'Brand not found';
  END IF;

  INSERT INTO public.cafe_cashier_sessions (cashier_id, cafe_id)
  VALUES (v_cashier.id, v_cashier.cafe_id)
  RETURNING cafe_cashier_sessions.token INTO v_token;

  UPDATE public.cafe_cashiers
  SET last_login_at = now()
  WHERE id = v_cashier.id;

  INSERT INTO public.cafe_cashier_activity_logs (
    cafe_id, cashier_id, action_type, target_type, details
  )
  VALUES (
    v_cashier.cafe_id,
    v_cashier.id,
    'login',
    'cashier_session',
    jsonb_build_object('email', v_cashier.email, 'cashierName', v_cashier.full_name)
  );

  RETURN QUERY
  SELECT
    v_token,
    v_cashier.cafe_id,
    v_cashier.id,
    v_cashier.full_name,
    v_cafe.name,
    v_cafe.slug::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.logout_cafe_cashier(
  p_session_token text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.cafe_cashier_sessions%ROWTYPE;
BEGIN
  SELECT *
  INTO v_session
  FROM public.cafe_cashier_sessions
  WHERE token = p_session_token
    AND revoked_at IS NULL
  LIMIT 1;

  IF v_session.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.cafe_cashier_sessions
  SET revoked_at = now()
  WHERE id = v_session.id;

  UPDATE public.cafe_cashiers
  SET last_logout_at = now()
  WHERE id = v_session.cashier_id;

  INSERT INTO public.cafe_cashier_activity_logs (
    cafe_id, cashier_id, action_type, target_type, details
  )
  VALUES (
    v_session.cafe_id,
    v_session.cashier_id,
    'logout',
    'cashier_session',
    jsonb_build_object('sessionId', v_session.id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cashier_console(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.cafe_cashier_sessions%ROWTYPE;
  v_cashier public.cafe_cashiers%ROWTYPE;
  v_cafe public.cafes%ROWTYPE;
  v_orders jsonb := '[]'::jsonb;
  v_reservations jsonb := '[]'::jsonb;
  v_logs jsonb := '[]'::jsonb;
BEGIN
  SELECT *
  INTO v_session
  FROM public.cafe_cashier_sessions
  WHERE token = p_session_token
    AND expires_at > now()
    AND revoked_at IS NULL
  LIMIT 1;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Invalid cashier session';
  END IF;

  SELECT * INTO v_cashier FROM public.cafe_cashiers WHERE id = v_session.cashier_id;
  SELECT * INTO v_cafe FROM public.cafes WHERE id = v_session.cafe_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'status', o.status,
      'customerName', COALESCE(o.customer_name, ''),
      'customerPhone', COALESCE(o.customer_phone, ''),
      'total', COALESCE(o.total, 0),
      'pickupAt', o.pickup_at,
      'notes', COALESCE(o.notes, ''),
      'createdAt', o.created_at
    )
    ORDER BY o.created_at DESC
  ), '[]'::jsonb)
  INTO v_orders
  FROM public.orders o
  WHERE o.cafe_id = v_session.cafe_id
    AND o.deleted_at IS NULL
    AND o.status IN ('pending_cafe', 'accepted');

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'status', r.status,
      'customerName', COALESCE(r.customer_name, ''),
      'customerPhone', COALESCE(r.phone, ''),
      'eventType', COALESCE(r.event_type, ''),
      'guests', COALESCE(r.guests, 0),
      'reservationDate', r.reservation_date,
      'reservationTime', r.reservation_time,
      'notes', COALESCE(r.notes, ''),
      'createdAt', r.created_at
    )
    ORDER BY r.created_at DESC
  ), '[]'::jsonb)
  INTO v_reservations
  FROM public.reservations r
  WHERE r.cafe_id = v_session.cafe_id
    AND r.deleted_at IS NULL
    AND r.status IN ('pending', 'accepted');

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', l.id,
      'actionType', l.action_type,
      'targetType', l.target_type,
      'targetId', l.target_id,
      'invoiceBarcode', l.invoice_barcode,
      'details', l.details,
      'createdAt', l.created_at
    )
    ORDER BY l.created_at DESC
  ), '[]'::jsonb)
  INTO v_logs
  FROM public.cafe_cashier_activity_logs l
  WHERE l.cashier_id = v_session.cashier_id;

  RETURN jsonb_build_object(
    'cafe', jsonb_build_object('id', v_cafe.id, 'name', v_cafe.name, 'slug', v_cafe.slug),
    'cashier', jsonb_build_object(
      'id', v_cashier.id,
      'fullName', v_cashier.full_name,
      'email', v_cashier.email,
      'employeeNumber', v_cashier.employee_number
    ),
    'orders', v_orders,
    'reservations', v_reservations,
    'logs', v_logs
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cashier_accept_order(
  p_session_token text,
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.cafe_cashier_sessions%ROWTYPE;
  v_order public.orders%ROWTYPE;
BEGIN
  SELECT *
  INTO v_session
  FROM public.cafe_cashier_sessions
  WHERE token = p_session_token
    AND expires_at > now()
    AND revoked_at IS NULL
  LIMIT 1;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Invalid cashier session';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND cafe_id = v_session.cafe_id
  LIMIT 1;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  UPDATE public.orders
  SET status = 'accepted',
      responded_at = now(),
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.cafe_cashier_activity_logs (
    cafe_id, cashier_id, action_type, target_type, target_id, details
  )
  VALUES (
    v_session.cafe_id,
    v_session.cashier_id,
    'order_received',
    'order',
    p_order_id,
    jsonb_build_object(
      'orderId', p_order_id,
      'statusBefore', v_order.status,
      'customerName', COALESCE(v_order.customer_name, ''),
      'total', COALESCE(v_order.total, 0),
      'createdAt', v_order.created_at
    )
  );

  RETURN jsonb_build_object('ok', true, 'orderId', p_order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.cashier_accept_reservation(
  p_session_token text,
  p_reservation_id uuid
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
  SELECT *
  INTO v_session
  FROM public.cafe_cashier_sessions
  WHERE token = p_session_token
    AND expires_at > now()
    AND revoked_at IS NULL
  LIMIT 1;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Invalid cashier session';
  END IF;

  SELECT *
  INTO v_reservation
  FROM public.reservations
  WHERE id = p_reservation_id
    AND cafe_id = v_session.cafe_id
  LIMIT 1;

  IF v_reservation.id IS NULL THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  UPDATE public.reservations
  SET status = 'accepted',
      cafe_message = COALESCE(cafe_message, 'تم استقبال الحجز'),
      updated_at = now()
  WHERE id = p_reservation_id;

  INSERT INTO public.cafe_cashier_activity_logs (
    cafe_id, cashier_id, action_type, target_type, target_id, details
  )
  VALUES (
    v_session.cafe_id,
    v_session.cashier_id,
    'reservation_received',
    'reservation',
    p_reservation_id,
    jsonb_build_object(
      'reservationId', p_reservation_id,
      'statusBefore', v_reservation.status,
      'customerName', COALESCE(v_reservation.customer_name, ''),
      'eventType', COALESCE(v_reservation.event_type, ''),
      'reservationDate', v_reservation.reservation_date,
      'reservationTime', v_reservation.reservation_time,
      'createdAt', v_reservation.created_at
    )
  );

  RETURN jsonb_build_object('ok', true, 'reservationId', p_reservation_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_loyalty_card_operation(
  p_cafe_id uuid,
  p_card_code text,
  p_invoice_barcode text,
  p_invoice_amount numeric,
  p_operation text,
  p_cashier_session_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_card public.loyalty_cards%ROWTYPE;
  v_program public.cafe_loyalty_programs%ROWTYPE;
  v_cashier_id uuid;
  v_stamp_delta integer := 0;
  v_reward_delta integer := 0;
  v_new_stamps integer;
  v_new_rewards integer;
  v_activity text;
BEGIN
  IF p_cashier_session_token IS NOT NULL THEN
    SELECT cs.cashier_id
    INTO v_cashier_id
    FROM public.cafe_cashier_sessions cs
    WHERE cs.token = p_cashier_session_token
      AND cs.cafe_id = p_cafe_id
      AND cs.expires_at > now()
      AND cs.revoked_at IS NULL
    LIMIT 1;

    IF v_cashier_id IS NULL THEN
      RAISE EXCEPTION 'Invalid cashier session';
    END IF;
  ELSIF NOT (public.has_cafe_permission(p_cafe_id, 'loyalty') OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT *
  INTO v_program
  FROM public.cafe_loyalty_programs
  WHERE cafe_id = p_cafe_id
    AND enabled = true;

  IF v_program.cafe_id IS NULL THEN
    RAISE EXCEPTION 'Loyalty program disabled';
  END IF;

  SELECT *
  INTO v_card
  FROM public.loyalty_cards
  WHERE cafe_id = p_cafe_id
    AND upper(card_code) = upper(btrim(p_card_code))
    AND status = 'active'
  LIMIT 1;

  IF v_card.id IS NULL THEN
    IF v_cashier_id IS NOT NULL THEN
      INSERT INTO public.cafe_cashier_activity_logs (
        cafe_id, cashier_id, action_type, target_type, invoice_barcode, details
      )
      VALUES (
        p_cafe_id,
        v_cashier_id,
        'scan_failed',
        'loyalty_card',
        NULLIF(btrim(p_invoice_barcode), ''),
        jsonb_build_object('cardCode', p_card_code, 'reason', 'card_not_found')
      );
    END IF;
    RAISE EXCEPTION 'Loyalty card not found';
  END IF;

  IF p_operation = 'stamp' THEN
    v_stamp_delta := 1;
    v_new_stamps := v_card.stamps_in_cycle + 1;
    v_new_rewards := v_card.available_rewards;
    v_activity := 'loyalty_stamp';

    IF v_new_stamps >= v_program.purchases_required THEN
      v_new_stamps := 0;
      v_new_rewards := v_new_rewards + 1;
      v_reward_delta := 1;

      UPDATE public.loyalty_cards
      SET stamps_in_cycle = v_new_stamps,
          completed_cycles = completed_cycles + 1,
          available_rewards = v_new_rewards,
          total_purchases = total_purchases + 1,
          last_used_at = now(),
          updated_at = now()
      WHERE id = v_card.id;
    ELSE
      UPDATE public.loyalty_cards
      SET stamps_in_cycle = v_new_stamps,
          total_purchases = total_purchases + 1,
          last_used_at = now(),
          updated_at = now()
      WHERE id = v_card.id;
    END IF;

  ELSIF p_operation = 'redeem' THEN
    IF v_card.available_rewards < 1 THEN
      RAISE EXCEPTION 'No available rewards';
    END IF;

    v_new_stamps := v_card.stamps_in_cycle;
    v_new_rewards := v_card.available_rewards - 1;
    v_reward_delta := -1;
    v_activity := 'loyalty_redeem';

    UPDATE public.loyalty_cards
    SET available_rewards = v_new_rewards,
        last_used_at = now(),
        updated_at = now()
    WHERE id = v_card.id;
  ELSE
    RAISE EXCEPTION 'Invalid operation';
  END IF;

  INSERT INTO public.loyalty_card_events (
    cafe_id, card_id, cashier_id, performed_by, event_type, invoice_barcode,
    invoice_amount, stamps_added, reward_delta, stamps_after, rewards_after
  )
  VALUES (
    p_cafe_id, v_card.id, v_cashier_id, auth.uid(), p_operation, NULLIF(btrim(p_invoice_barcode), ''),
    p_invoice_amount, v_stamp_delta, v_reward_delta, v_new_stamps, v_new_rewards
  );

  IF v_cashier_id IS NOT NULL THEN
    INSERT INTO public.cafe_cashier_activity_logs (
      cafe_id, cashier_id, action_type, target_type, target_id, invoice_barcode, details
    )
    VALUES (
      p_cafe_id,
      v_cashier_id,
      v_activity,
      'loyalty_card',
      v_card.id,
      NULLIF(btrim(p_invoice_barcode), ''),
      jsonb_build_object(
        'customerName', v_card.customer_name,
        'cardCode', v_card.card_code,
        'operation', p_operation,
        'stampsAfter', v_new_stamps,
        'rewardsAfter', v_new_rewards,
        'rewardIssued', v_reward_delta = 1,
        'invoiceAmount', p_invoice_amount
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'customerName', v_card.customer_name,
    'cardCode', v_card.card_code,
    'operation', p_operation,
    'stampsInCycle', v_new_stamps,
    'purchasesRequired', v_program.purchases_required,
    'availableRewards', v_new_rewards,
    'rewardIssued', v_reward_delta = 1,
    'rewardName', v_program.reward_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_cafe_cashier(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.login_cafe_cashier(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.logout_cafe_cashier(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cashier_console(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cashier_accept_order(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cashier_accept_reservation(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_loyalty_card_operation(uuid, text, text, numeric, text, text) TO anon, authenticated;

COMMIT;

SELECT 'cashier_loyalty_stable_fixed' AS status;
