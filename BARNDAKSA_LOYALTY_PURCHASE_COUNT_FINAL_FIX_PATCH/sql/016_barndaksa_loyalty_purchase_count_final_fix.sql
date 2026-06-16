BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA public;

ALTER TABLE public.cafe_cashier_sessions
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

CREATE TABLE IF NOT EXISTS public.cafe_cashier_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  cashier_id uuid NOT NULL REFERENCES public.cafe_cashiers(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  target_type text,
  target_id uuid,
  invoice_barcode text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cafe_cashier_activity_logs
  ADD COLUMN IF NOT EXISTS target_type text,
  ADD COLUMN IF NOT EXISTS target_id uuid,
  ADD COLUMN IF NOT EXISTS invoice_barcode text,
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.cafe_cashier_activity_logs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%action_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.cafe_cashier_activity_logs DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.cafe_cashier_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cashier_logs_owner_read ON public.cafe_cashier_activity_logs;
CREATE POLICY cashier_logs_owner_read ON public.cafe_cashier_activity_logs
  FOR SELECT TO authenticated
  USING (public.has_cafe_permission(cafe_id, 'loyalty') OR public.is_platform_admin());

GRANT SELECT ON public.cafe_cashier_activity_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cafe_cashier_activity_logs TO service_role;
GRANT INSERT ON public.cafe_cashier_activity_logs TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_cashier_logs_cafe_created
  ON public.cafe_cashier_activity_logs(cafe_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cashier_logs_cashier_created
  ON public.cafe_cashier_activity_logs(cashier_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.record_loyalty_card_operation(
  p_cafe_id uuid,
  p_card_code text,
  p_invoice_barcode text DEFAULT NULL,
  p_invoice_amount numeric DEFAULT 0,
  p_operation text DEFAULT 'stamp',
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
  v_new_stamps integer := 0;
  v_new_rewards integer := 0;
  v_activity text := 'loyalty_stamp';
  v_card_code text;
  v_invoice_barcode text;
BEGIN
  v_card_code := upper(btrim(coalesce(p_card_code, '')));

  IF v_card_code = '' THEN
    RAISE EXCEPTION 'LOYALTY_CARD_CODE_EMPTY';
  END IF;

  IF v_card_code ~* '/loyalty-card/' THEN
    v_card_code := upper(split_part(split_part(v_card_code, '/loyalty-card/', 2), '?', 1));
    v_card_code := upper(split_part(split_part(v_card_code, '/LOYALTY-CARD/', 2), '?', 1));
    v_card_code := split_part(split_part(v_card_code, '#', 1), '&', 1);
  END IF;

  v_invoice_barcode := nullif(btrim(coalesce(p_invoice_barcode, '')), '');
  IF v_invoice_barcode IS NULL THEN
    v_invoice_barcode := 'LOYALTY-CARD-' || regexp_replace(v_card_code, '[^A-Z0-9_-]', '', 'g') || '-' || extract(epoch from clock_timestamp())::bigint || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  END IF;

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
      RAISE EXCEPTION 'INVALID_CASHIER_SESSION';
    END IF;
  ELSIF NOT (public.has_cafe_permission(p_cafe_id, 'loyalty') OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'FORBIDDEN_LOYALTY_OPERATION';
  END IF;

  SELECT *
  INTO v_program
  FROM public.cafe_loyalty_programs
  WHERE cafe_id = p_cafe_id
    AND enabled = true
  LIMIT 1;

  IF v_program.cafe_id IS NULL THEN
    RAISE EXCEPTION 'LOYALTY_PROGRAM_DISABLED';
  END IF;

  SELECT *
  INTO v_card
  FROM public.loyalty_cards
  WHERE cafe_id = p_cafe_id
    AND upper(card_code) = upper(v_card_code)
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
        v_invoice_barcode,
        jsonb_build_object('cardCode', p_card_code, 'normalizedCardCode', v_card_code, 'reason', 'card_not_found')
      );
    END IF;
    RAISE EXCEPTION 'LOYALTY_CARD_NOT_FOUND:%', v_card_code;
  END IF;

  IF coalesce(p_operation, 'stamp') = 'stamp' THEN
    v_stamp_delta := 1;
    v_new_stamps := coalesce(v_card.stamps_in_cycle, 0) + 1;
    v_new_rewards := coalesce(v_card.available_rewards, 0);
    v_activity := 'loyalty_stamp';

    IF v_new_stamps >= coalesce(v_program.purchases_required, 7) THEN
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
    IF coalesce(v_card.available_rewards, 0) < 1 THEN
      RAISE EXCEPTION 'NO_AVAILABLE_REWARDS';
    END IF;

    v_new_stamps := coalesce(v_card.stamps_in_cycle, 0);
    v_new_rewards := coalesce(v_card.available_rewards, 0) - 1;
    v_reward_delta := -1;
    v_activity := 'loyalty_redeem';

    UPDATE public.loyalty_cards
    SET available_rewards = v_new_rewards,
        last_used_at = now(),
        updated_at = now()
    WHERE id = v_card.id;
  ELSE
    RAISE EXCEPTION 'INVALID_LOYALTY_OPERATION';
  END IF;

  INSERT INTO public.loyalty_card_events (
    cafe_id, card_id, cashier_id, performed_by, event_type, invoice_barcode,
    invoice_amount, stamps_added, reward_delta, stamps_after, rewards_after
  )
  VALUES (
    p_cafe_id, v_card.id, v_cashier_id, auth.uid(), coalesce(p_operation, 'stamp'), v_invoice_barcode,
    coalesce(p_invoice_amount, 0), v_stamp_delta, v_reward_delta, v_new_stamps, v_new_rewards
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
      v_invoice_barcode,
      jsonb_build_object(
        'customerName', v_card.customer_name,
        'cardCode', v_card.card_code,
        'operation', coalesce(p_operation, 'stamp'),
        'stampsAfter', v_new_stamps,
        'rewardsAfter', v_new_rewards,
        'rewardIssued', v_reward_delta = 1,
        'invoiceAmount', coalesce(p_invoice_amount, 0)
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'customerName', v_card.customer_name,
    'cardCode', v_card.card_code,
    'operation', coalesce(p_operation, 'stamp'),
    'stampsInCycle', v_new_stamps,
    'purchasesRequired', v_program.purchases_required,
    'availableRewards', v_new_rewards,
    'rewardIssued', v_reward_delta = 1,
    'rewardName', v_program.reward_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_loyalty_card_operation(uuid, text, text, numeric, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.ensure_loyalty_card_is_active_after_issue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.status := coalesce(NULLIF(NEW.status, ''), 'active');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_loyalty_card_is_active_after_issue_trigger ON public.loyalty_cards;
CREATE TRIGGER ensure_loyalty_card_is_active_after_issue_trigger
BEFORE INSERT OR UPDATE ON public.loyalty_cards
FOR EACH ROW
EXECUTE FUNCTION public.ensure_loyalty_card_is_active_after_issue();

UPDATE public.loyalty_cards
SET status = 'active'
WHERE status IS NULL OR status <> 'active';

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'barndaksa_loyalty_purchase_count_final_fix_ready' AS status;
