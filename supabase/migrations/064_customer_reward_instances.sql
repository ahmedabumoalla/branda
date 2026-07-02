-- Branda: unified customer reward instances for loyalty and experience rewards.
-- Non-destructive: creates redeemable reward instances and backfills available rewards.

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.customer_reward_instances (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customer_profiles(id) ON DELETE SET NULL,
  loyalty_card_id uuid REFERENCES public.loyalty_cards(id) ON DELETE SET NULL,
  source_type text NOT NULL CHECK (source_type IN ('loyalty', 'experience')),
  source_id uuid,
  reward_definition_id uuid,
  reward_title text NOT NULL,
  reward_description text,
  reward_code text NOT NULL UNIQUE,
  qr_payload text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'redeemed', 'expired', 'cancelled')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_by uuid REFERENCES public.profiles(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_reward_redemptions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  reward_instance_id uuid NOT NULL REFERENCES public.customer_reward_instances(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customer_profiles(id) ON DELETE SET NULL,
  redeemed_by uuid REFERENCES public.profiles(id),
  redeemed_by_cashier_id uuid REFERENCES public.cafe_cashiers(id) ON DELETE SET NULL,
  scanned_code text NOT NULL,
  status text NOT NULL DEFAULT 'redeemed',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_reward_instances_customer
  ON public.customer_reward_instances(customer_id, status, issued_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_reward_instances_cafe_code
  ON public.customer_reward_instances(cafe_id, upper(reward_code));

CREATE INDEX IF NOT EXISTS idx_customer_reward_instances_cafe_status
  ON public.customer_reward_instances(cafe_id, status, issued_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_reward_instances_experience_source
  ON public.customer_reward_instances(source_type, source_id)
  WHERE source_type = 'experience' AND source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_reward_redemptions_cafe_created
  ON public.customer_reward_redemptions(cafe_id, created_at DESC);

DROP TRIGGER IF EXISTS customer_reward_instances_updated_at ON public.customer_reward_instances;
CREATE TRIGGER customer_reward_instances_updated_at
  BEFORE UPDATE ON public.customer_reward_instances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.customer_reward_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_reward_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_reward_instances_customer_read ON public.customer_reward_instances;
CREATE POLICY customer_reward_instances_customer_read
  ON public.customer_reward_instances
  FOR SELECT TO authenticated
  USING (
    customer_id = public.get_customer_profile_id(cafe_id)
    OR public.has_cafe_permission(cafe_id, 'loyalty')
    OR public.has_cafe_permission(cafe_id, 'marketing')
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS customer_reward_instances_staff_update ON public.customer_reward_instances;
CREATE POLICY customer_reward_instances_staff_update
  ON public.customer_reward_instances
  FOR UPDATE TO authenticated
  USING (
    public.has_cafe_permission(cafe_id, 'loyalty')
    OR public.has_cafe_permission(cafe_id, 'marketing')
    OR public.is_platform_admin()
  )
  WITH CHECK (
    public.has_cafe_permission(cafe_id, 'loyalty')
    OR public.has_cafe_permission(cafe_id, 'marketing')
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS customer_reward_redemptions_staff_read ON public.customer_reward_redemptions;
CREATE POLICY customer_reward_redemptions_staff_read
  ON public.customer_reward_redemptions
  FOR SELECT TO authenticated
  USING (
    public.has_cafe_permission(cafe_id, 'loyalty')
    OR public.has_cafe_permission(cafe_id, 'marketing')
    OR public.is_platform_admin()
  );

GRANT SELECT ON public.customer_reward_instances TO authenticated;
GRANT SELECT, UPDATE ON public.customer_reward_instances TO authenticated;
GRANT SELECT ON public.customer_reward_redemptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_reward_instances TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_reward_redemptions TO service_role;

CREATE OR REPLACE FUNCTION public.make_customer_reward_code(p_prefix text DEFAULT 'RWD')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code text;
BEGIN
  LOOP
    v_code := upper(regexp_replace(COALESCE(NULLIF(p_prefix, ''), 'RWD'), '[^A-Za-z0-9]+', '', 'g'))
      || '-'
      || upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 12));

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.customer_reward_instances
      WHERE reward_code = v_code
    );
  END LOOP;

  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_loyalty_reward_instance_from_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_card public.loyalty_cards%ROWTYPE;
  v_program public.cafe_loyalty_programs%ROWTYPE;
  v_code text;
BEGIN
  IF NEW.event_type <> 'stamp' OR COALESCE(NEW.reward_delta, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.customer_reward_instances
    WHERE source_type = 'loyalty'
      AND source_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO v_card
  FROM public.loyalty_cards
  WHERE id = NEW.card_id
    AND cafe_id = NEW.cafe_id
  LIMIT 1;

  IF v_card.id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO v_program
  FROM public.cafe_loyalty_programs
  WHERE cafe_id = NEW.cafe_id
    AND enabled = true
  LIMIT 1;

  v_code := public.make_customer_reward_code('LOY');

  INSERT INTO public.customer_reward_instances (
    cafe_id,
    customer_id,
    loyalty_card_id,
    source_type,
    source_id,
    reward_definition_id,
    reward_title,
    reward_description,
    reward_code,
    qr_payload,
    metadata
  )
  VALUES (
    NEW.cafe_id,
    v_card.customer_profile_id,
    v_card.id,
    'loyalty',
    NEW.id,
    v_program.reward_product_id,
    COALESCE(NULLIF(v_program.reward_name, ''), 'مكافأة ولاء'),
    COALESCE(NULLIF(v_program.reward_name, ''), 'مكافأة ولاء'),
    v_code,
    'BARNDAKSA_REWARD:' || v_code,
    jsonb_build_object(
      'source', 'loyalty_card_event',
      'cardCode', v_card.card_code,
      'eventId', NEW.id,
      'purchasesRequired', v_program.purchases_required
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_issue_loyalty_reward_instance_from_event ON public.loyalty_card_events;
CREATE TRIGGER trg_issue_loyalty_reward_instance_from_event
  AFTER INSERT ON public.loyalty_card_events
  FOR EACH ROW
  EXECUTE FUNCTION public.issue_loyalty_reward_instance_from_event();

INSERT INTO public.customer_reward_instances (
  cafe_id,
  customer_id,
  source_type,
  source_id,
  reward_title,
  reward_description,
  reward_code,
  qr_payload,
  status,
  issued_at,
  expires_at,
  redeemed_at,
  metadata
)
SELECT
  s.cafe_id,
  s.customer_id,
  'experience',
  s.id,
  COALESCE(
    NULLIF(string_agg(i.product_name || ' × ' || i.quantity::text, '، ' ORDER BY i.created_at), ''),
    'مكافأة توثيق تجربة'
  ),
  s.experience_url,
  upper(s.reward_code),
  'BARNDAKSA_REWARD:' || upper(s.reward_code),
  CASE
    WHEN s.status = 'redeemed' THEN 'redeemed'
    WHEN s.reward_expires_at IS NOT NULL AND s.reward_expires_at < current_date THEN 'expired'
    ELSE 'available'
  END,
  COALESCE(s.approved_at, s.created_at, now()),
  CASE
    WHEN s.reward_expires_at IS NULL THEN NULL
    ELSE s.reward_expires_at::timestamptz
  END,
  s.used_at,
  jsonb_build_object('source', 'experience_reward_submission')
FROM public.experience_reward_submissions s
LEFT JOIN public.experience_reward_items i ON i.submission_id = s.id
WHERE s.reward_code IS NOT NULL
  AND s.status IN ('approved', 'redeemed')
  AND NOT EXISTS (
    SELECT 1
    FROM public.customer_reward_instances cri
    WHERE cri.source_type = 'experience'
      AND cri.source_id = s.id
  )
GROUP BY s.id;

INSERT INTO public.customer_reward_instances (
  cafe_id,
  customer_id,
  loyalty_card_id,
  source_type,
  source_id,
  reward_definition_id,
  reward_title,
  reward_description,
  reward_code,
  qr_payload,
  metadata
)
SELECT
  lc.cafe_id,
  lc.customer_profile_id,
  lc.id,
  'loyalty',
  lc.id,
  clp.reward_product_id,
  COALESCE(NULLIF(clp.reward_name, ''), 'مكافأة ولاء'),
  COALESCE(NULLIF(clp.reward_name, ''), 'مكافأة ولاء'),
  codes.code,
  'BARNDAKSA_REWARD:' || codes.code,
  jsonb_build_object(
    'source', 'loyalty_available_rewards_backfill',
    'cardCode', lc.card_code,
    'legacyIndex', gs.reward_index
  )
FROM public.loyalty_cards lc
JOIN public.cafe_loyalty_programs clp ON clp.cafe_id = lc.cafe_id
JOIN LATERAL generate_series(1, GREATEST(0, COALESCE(lc.available_rewards, 0))) AS gs(reward_index) ON true
JOIN LATERAL (SELECT public.make_customer_reward_code('LOY') AS code) codes ON true
WHERE lc.status = 'active'
  AND clp.enabled = true
  AND COALESCE(lc.available_rewards, 0) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.customer_reward_instances cri
    WHERE cri.source_type = 'loyalty'
      AND cri.loyalty_card_id = lc.id
  );

REVOKE ALL ON FUNCTION public.make_customer_reward_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.make_customer_reward_code(text) TO service_role;

COMMIT;
