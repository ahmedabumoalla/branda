BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DROP TABLE IF EXISTS public.reward_purchase_events CASCADE;
DROP TABLE IF EXISTS public.reward_redemptions CASCADE;
DROP TABLE IF EXISTS public.reward_cards CASCADE;
DROP TABLE IF EXISTS public.reward_programs CASCADE;
DROP TABLE IF EXISTS public.mobile_customer_profiles CASCADE;

CREATE TABLE IF NOT EXISTS public.cafe_loyalty_programs (
  cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  card_title text NOT NULL DEFAULT 'بطاقة الولاء',
  card_subtitle text NOT NULL DEFAULT 'اجمع الأختام واحصل على مكافأتك',
  purchases_required integer NOT NULL DEFAULT 7 CHECK (purchases_required BETWEEN 1 AND 100),
  reward_product_id uuid NULL REFERENCES public.menu_products(id) ON DELETE SET NULL,
  reward_name text NOT NULL DEFAULT 'منتج مجاني',
  stamp_label text NOT NULL DEFAULT 'ختم',
  terms text NOT NULL DEFAULT 'تطبق الشروط والأحكام الخاصة بالعلامة التجارية',
  card_background text NOT NULL DEFAULT '#4A281D',
  card_foreground text NOT NULL DEFAULT '#FCF8F3',
  card_accent text NOT NULL DEFAULT '#D9A33F',
  wallet_enabled boolean NOT NULL DEFAULT false,
  apple_wallet_enabled boolean NOT NULL DEFAULT false,
  google_wallet_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.loyalty_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  customer_profile_id uuid NOT NULL REFERENCES public.customer_profiles(id) ON DELETE CASCADE,
  card_code text NOT NULL UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
  customer_name text NOT NULL,
  customer_phone text,
  customer_email text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  stamps_in_cycle integer NOT NULL DEFAULT 0 CHECK (stamps_in_cycle >= 0),
  completed_cycles integer NOT NULL DEFAULT 0 CHECK (completed_cycles >= 0),
  available_rewards integer NOT NULL DEFAULT 0 CHECK (available_rewards >= 0),
  total_purchases integer NOT NULL DEFAULT 0 CHECK (total_purchases >= 0),
  last_used_at timestamptz,
  issued_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cafe_id, customer_profile_id)
);

CREATE TABLE IF NOT EXISTS public.cafe_cashiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  temporary_password text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cafe_cashiers_cafe_email_unique
  ON public.cafe_cashiers (cafe_id, lower(email));

CREATE TABLE IF NOT EXISTS public.cafe_cashier_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id uuid NOT NULL REFERENCES public.cafe_cashiers(id) ON DELETE CASCADE,
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '8 hours',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.loyalty_card_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.loyalty_cards(id) ON DELETE CASCADE,
  cashier_id uuid REFERENCES public.cafe_cashiers(id) ON DELETE SET NULL,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('stamp', 'redeem', 'void')),
  invoice_barcode text,
  invoice_amount numeric(12,2),
  stamps_added integer NOT NULL DEFAULT 0,
  reward_delta integer NOT NULL DEFAULT 0,
  stamps_after integer NOT NULL DEFAULT 0,
  rewards_after integer NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_cards_cafe_updated
  ON public.loyalty_cards(cafe_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_loyalty_events_cafe_created
  ON public.loyalty_card_events(cafe_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cashier_sessions_token
  ON public.cafe_cashier_sessions(token, expires_at);

ALTER TABLE public.cafe_loyalty_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cafe_cashiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cafe_cashier_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_card_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cafe_loyalty_programs_owner ON public.cafe_loyalty_programs;
CREATE POLICY cafe_loyalty_programs_owner ON public.cafe_loyalty_programs
  FOR ALL TO authenticated
  USING (public.has_cafe_permission(cafe_id, 'loyalty') OR public.is_platform_admin())
  WITH CHECK (public.has_cafe_permission(cafe_id, 'loyalty') OR public.is_platform_admin());

DROP POLICY IF EXISTS cafe_loyalty_programs_public ON public.cafe_loyalty_programs;
CREATE POLICY cafe_loyalty_programs_public ON public.cafe_loyalty_programs
  FOR SELECT TO anon, authenticated
  USING (
    enabled = true
    AND EXISTS (
      SELECT 1
      FROM public.cafes c
      WHERE c.id = cafe_id
        AND c.status = 'active'
        AND c.is_public = true
        AND c.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS loyalty_cards_owner ON public.loyalty_cards;
CREATE POLICY loyalty_cards_owner ON public.loyalty_cards
  FOR SELECT TO authenticated
  USING (public.has_cafe_permission(cafe_id, 'loyalty') OR public.is_platform_admin());

DROP POLICY IF EXISTS loyalty_cards_customer ON public.loyalty_cards;
CREATE POLICY loyalty_cards_customer ON public.loyalty_cards
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.customer_profiles cp
      WHERE cp.id = customer_profile_id
        AND cp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS cafe_cashiers_owner ON public.cafe_cashiers;
CREATE POLICY cafe_cashiers_owner ON public.cafe_cashiers
  FOR SELECT TO authenticated
  USING (public.has_cafe_permission(cafe_id, 'loyalty') OR public.is_platform_admin());

DROP POLICY IF EXISTS loyalty_events_owner ON public.loyalty_card_events;
CREATE POLICY loyalty_events_owner ON public.loyalty_card_events
  FOR SELECT TO authenticated
  USING (public.has_cafe_permission(cafe_id, 'loyalty') OR public.is_platform_admin());

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT ON public.cafe_loyalty_programs TO anon, authenticated;
GRANT SELECT ON public.loyalty_cards TO authenticated;
GRANT SELECT ON public.loyalty_card_events TO authenticated;
GRANT SELECT ON public.cafe_cashiers TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cafe_loyalty_programs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_cards TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_card_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cafe_cashiers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cafe_cashier_sessions TO service_role;

CREATE OR REPLACE FUNCTION public.set_cafe_loyalty_program(
  p_cafe_id uuid,
  p_enabled boolean,
  p_card_title text,
  p_card_subtitle text,
  p_purchases_required integer,
  p_reward_product_id uuid,
  p_reward_name text,
  p_stamp_label text,
  p_terms text,
  p_card_background text,
  p_card_foreground text,
  p_card_accent text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (public.has_cafe_permission(p_cafe_id, 'loyalty') OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_purchases_required < 1 OR p_purchases_required > 100 THEN
    RAISE EXCEPTION 'Invalid required purchases';
  END IF;

  IF p_reward_product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.menu_products mp
    WHERE mp.id = p_reward_product_id
      AND mp.cafe_id = p_cafe_id
      AND mp.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Reward product not found';
  END IF;

  INSERT INTO public.cafe_loyalty_programs (
    cafe_id,
    enabled,
    card_title,
    card_subtitle,
    purchases_required,
    reward_product_id,
    reward_name,
    stamp_label,
    terms,
    card_background,
    card_foreground,
    card_accent,
    updated_at
  )
  VALUES (
    p_cafe_id,
    p_enabled,
    btrim(p_card_title),
    btrim(p_card_subtitle),
    p_purchases_required,
    p_reward_product_id,
    btrim(p_reward_name),
    btrim(p_stamp_label),
    COALESCE(btrim(p_terms), ''),
    COALESCE(NULLIF(btrim(p_card_background), ''), '#4A281D'),
    COALESCE(NULLIF(btrim(p_card_foreground), ''), '#FCF8F3'),
    COALESCE(NULLIF(btrim(p_card_accent), ''), '#D9A33F'),
    now()
  )
  ON CONFLICT (cafe_id) DO UPDATE SET
    enabled = EXCLUDED.enabled,
    card_title = EXCLUDED.card_title,
    card_subtitle = EXCLUDED.card_subtitle,
    purchases_required = EXCLUDED.purchases_required,
    reward_product_id = EXCLUDED.reward_product_id,
    reward_name = EXCLUDED.reward_name,
    stamp_label = EXCLUDED.stamp_label,
    terms = EXCLUDED.terms,
    card_background = EXCLUDED.card_background,
    card_foreground = EXCLUDED.card_foreground,
    card_accent = EXCLUDED.card_accent,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_loyalty_card_for_customer(
  p_cafe_slug text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cafe_id uuid;
  v_customer public.customer_profiles%ROWTYPE;
  v_code text;
BEGIN
  SELECT c.id
  INTO v_cafe_id
  FROM public.cafes c
  WHERE lower(c.slug::text) = lower(btrim(p_cafe_slug))
    AND c.status = 'active'
    AND c.is_public = true
    AND c.deleted_at IS NULL
  LIMIT 1;

  IF v_cafe_id IS NULL THEN
    RAISE EXCEPTION 'Brand not found';
  END IF;

  SELECT *
  INTO v_customer
  FROM public.customer_profiles cp
  WHERE cp.cafe_id = v_cafe_id
    AND cp.user_id = auth.uid()
  LIMIT 1;

  IF v_customer.id IS NULL THEN
    RAISE EXCEPTION 'Customer profile required';
  END IF;

  INSERT INTO public.loyalty_cards (
    cafe_id,
    customer_profile_id,
    customer_name,
    customer_phone,
    customer_email
  )
  VALUES (
    v_cafe_id,
    v_customer.id,
    v_customer.full_name,
    v_customer.phone,
    v_customer.email
  )
  ON CONFLICT (cafe_id, customer_profile_id) DO UPDATE SET
    customer_name = EXCLUDED.customer_name,
    customer_phone = EXCLUDED.customer_phone,
    customer_email = EXCLUDED.customer_email,
    updated_at = now()
  RETURNING card_code INTO v_code;

  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_cafe_cashier(
  p_cafe_id uuid,
  p_full_name text,
  p_email text,
  p_temp_password text
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

  IF p_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email';
  END IF;

  INSERT INTO public.cafe_cashiers (
    cafe_id,
    full_name,
    email,
    password_hash,
    temporary_password,
    created_by
  )
  VALUES (
    p_cafe_id,
    btrim(p_full_name),
    lower(btrim(p_email)),
    crypt(p_temp_password, gen_salt('bf')),
    p_temp_password,
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_cashier_status(
  p_cashier_id uuid,
  p_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cafe_id uuid;
BEGIN
  SELECT cafe_id INTO v_cafe_id
  FROM public.cafe_cashiers
  WHERE id = p_cashier_id;

  IF v_cafe_id IS NULL THEN
    RAISE EXCEPTION 'Cashier not found';
  END IF;

  IF NOT (public.has_cafe_permission(v_cafe_id, 'loyalty') OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.cafe_cashiers
  SET active = p_active,
      updated_at = now()
  WHERE id = p_cashier_id;
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
  cashier_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cashier public.cafe_cashiers%ROWTYPE;
  v_token text;
BEGIN
  SELECT *
  INTO v_cashier
  FROM public.cafe_cashiers
  WHERE lower(email) = lower(btrim(p_email))
    AND active = true
  LIMIT 1;

  IF v_cashier.id IS NULL OR v_cashier.password_hash <> crypt(p_password, v_cashier.password_hash) THEN
    RAISE EXCEPTION 'Invalid cashier credentials';
  END IF;

  INSERT INTO public.cafe_cashier_sessions (
    cashier_id,
    cafe_id
  )
  VALUES (
    v_cashier.id,
    v_cashier.cafe_id
  )
  RETURNING cafe_cashier_sessions.token INTO v_token;

  UPDATE public.cafe_cashiers
  SET last_login_at = now()
  WHERE id = v_cashier.id;

  RETURN QUERY
  SELECT
    v_token,
    v_cashier.cafe_id,
    v_cashier.id,
    v_cashier.full_name;
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
BEGIN
  IF p_cashier_session_token IS NOT NULL THEN
    SELECT cs.cashier_id
    INTO v_cashier_id
    FROM public.cafe_cashier_sessions cs
    WHERE cs.token = p_cashier_session_token
      AND cs.cafe_id = p_cafe_id
      AND cs.expires_at > now()
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
    RAISE EXCEPTION 'Loyalty card not found';
  END IF;

  IF p_operation = 'stamp' THEN
    v_stamp_delta := 1;
    v_new_stamps := v_card.stamps_in_cycle + 1;
    v_new_rewards := v_card.available_rewards;

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

    UPDATE public.loyalty_cards
    SET available_rewards = v_new_rewards,
        last_used_at = now(),
        updated_at = now()
    WHERE id = v_card.id;
  ELSE
    RAISE EXCEPTION 'Invalid operation';
  END IF;

  INSERT INTO public.loyalty_card_events (
    cafe_id,
    card_id,
    cashier_id,
    performed_by,
    event_type,
    invoice_barcode,
    invoice_amount,
    stamps_added,
    reward_delta,
    stamps_after,
    rewards_after
  )
  VALUES (
    p_cafe_id,
    v_card.id,
    v_cashier_id,
    auth.uid(),
    p_operation,
    NULLIF(btrim(p_invoice_barcode), ''),
    p_invoice_amount,
    v_stamp_delta,
    v_reward_delta,
    v_new_stamps,
    v_new_rewards
  );

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

REVOKE ALL ON FUNCTION public.set_cafe_loyalty_program(uuid, boolean, text, text, integer, uuid, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_loyalty_card_for_customer(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_cafe_cashier(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_cashier_status(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.login_cafe_cashier(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_loyalty_card_operation(uuid, text, text, numeric, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_cafe_loyalty_program(uuid, boolean, text, text, integer, uuid, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_loyalty_card_for_customer(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_cafe_cashier(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_cashier_status(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.login_cafe_cashier(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_loyalty_card_operation(uuid, text, text, numeric, text, text) TO anon, authenticated;

COMMIT;

SELECT
  'loyalty_cards_system_ready' AS status,
  EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'loyalty_cards'
  ) AS loyalty_cards,
  EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'cafe_cashiers'
  ) AS cafe_cashiers;