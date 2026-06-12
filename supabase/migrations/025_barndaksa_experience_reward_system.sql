-- Barndaksa: customer experience proof rewards
-- Adds customer proof submissions, owner review, menu-product rewards, and one-time cashier redemption.

CREATE TABLE IF NOT EXISTS public.experience_reward_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customer_profiles(id) ON DELETE CASCADE,
  experience_url text NOT NULL,
  current_views integer NOT NULL DEFAULT 0 CHECK (current_views >= 0),
  current_comments integer NOT NULL DEFAULT 0 CHECK (current_comments >= 0),
  customer_notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','redeemed')),
  review_notes text,
  reward_code text UNIQUE,
  reward_expires_at date,
  approved_at timestamptz,
  rejected_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  used_at timestamptz,
  used_by_cashier_id uuid REFERENCES public.cafe_cashiers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.experience_reward_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.experience_reward_submissions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.menu_products(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 1 AND quantity <= 20),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exp_reward_submissions_cafe_status
  ON public.experience_reward_submissions(cafe_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exp_reward_submissions_customer
  ON public.experience_reward_submissions(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exp_reward_submissions_code
  ON public.experience_reward_submissions(upper(reward_code));

CREATE INDEX IF NOT EXISTS idx_exp_reward_items_submission
  ON public.experience_reward_items(submission_id);

ALTER TABLE public.experience_reward_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experience_reward_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exp_reward_customer_insert ON public.experience_reward_submissions;
CREATE POLICY exp_reward_customer_insert ON public.experience_reward_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.customer_profiles cp
      WHERE cp.id = customer_id
        AND cp.cafe_id = cafe_id
        AND cp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS exp_reward_customer_read ON public.experience_reward_submissions;
CREATE POLICY exp_reward_customer_read ON public.experience_reward_submissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.customer_profiles cp
      WHERE cp.id = customer_id
        AND cp.cafe_id = cafe_id
        AND cp.user_id = auth.uid()
    )
    OR public.has_cafe_permission(cafe_id, 'marketing')
    OR public.has_cafe_permission(cafe_id, 'loyalty')
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS exp_reward_owner_update ON public.experience_reward_submissions;
CREATE POLICY exp_reward_owner_update ON public.experience_reward_submissions
  FOR UPDATE TO authenticated
  USING (
    public.has_cafe_permission(cafe_id, 'marketing')
    OR public.has_cafe_permission(cafe_id, 'loyalty')
    OR public.is_platform_admin()
  )
  WITH CHECK (
    public.has_cafe_permission(cafe_id, 'marketing')
    OR public.has_cafe_permission(cafe_id, 'loyalty')
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS exp_reward_items_customer_owner_read ON public.experience_reward_items;
CREATE POLICY exp_reward_items_customer_owner_read ON public.experience_reward_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.experience_reward_submissions s
      JOIN public.customer_profiles cp ON cp.id = s.customer_id
      WHERE s.id = submission_id
        AND cp.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.experience_reward_submissions s
      WHERE s.id = submission_id
        AND (
          public.has_cafe_permission(s.cafe_id, 'marketing')
          OR public.has_cafe_permission(s.cafe_id, 'loyalty')
          OR public.is_platform_admin()
        )
    )
  );

DROP POLICY IF EXISTS exp_reward_items_owner_write ON public.experience_reward_items;
CREATE POLICY exp_reward_items_owner_write ON public.experience_reward_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.experience_reward_submissions s
      WHERE s.id = submission_id
        AND (
          public.has_cafe_permission(s.cafe_id, 'marketing')
          OR public.has_cafe_permission(s.cafe_id, 'loyalty')
          OR public.is_platform_admin()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.experience_reward_submissions s
      WHERE s.id = submission_id
        AND (
          public.has_cafe_permission(s.cafe_id, 'marketing')
          OR public.has_cafe_permission(s.cafe_id, 'loyalty')
          OR public.is_platform_admin()
        )
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.experience_reward_submissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.experience_reward_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.experience_reward_submissions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.experience_reward_items TO service_role;

CREATE OR REPLACE FUNCTION public.redeem_experience_reward(
  p_session_token text,
  p_reward_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.cafe_cashier_sessions%ROWTYPE;
  v_submission public.experience_reward_submissions%ROWTYPE;
  v_items jsonb := '[]'::jsonb;
  v_customer public.customer_profiles%ROWTYPE;
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
  INTO v_submission
  FROM public.experience_reward_submissions
  WHERE cafe_id = v_session.cafe_id
    AND upper(reward_code) = upper(btrim(p_reward_code))
  LIMIT 1;

  IF v_submission.id IS NULL THEN
    RAISE EXCEPTION 'Reward not found';
  END IF;

  IF v_submission.status <> 'approved' THEN
    RAISE EXCEPTION 'Reward is not active';
  END IF;

  IF v_submission.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'Reward already used';
  END IF;

  IF v_submission.reward_expires_at IS NOT NULL
     AND v_submission.reward_expires_at < current_date THEN
    RAISE EXCEPTION 'Reward expired';
  END IF;

  SELECT * INTO v_customer
  FROM public.customer_profiles
  WHERE id = v_submission.customer_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'productId', i.product_id,
      'productName', i.product_name,
      'quantity', i.quantity
    )
    ORDER BY i.created_at ASC
  ), '[]'::jsonb)
  INTO v_items
  FROM public.experience_reward_items i
  WHERE i.submission_id = v_submission.id;

  UPDATE public.experience_reward_submissions
  SET status = 'redeemed',
      used_at = now(),
      used_by_cashier_id = v_session.cashier_id,
      updated_at = now()
  WHERE id = v_submission.id;

  INSERT INTO public.cafe_cashier_activity_logs (
    cafe_id,
    cashier_id,
    action_type,
    target_type,
    target_id,
    invoice_barcode,
    details
  )
  VALUES (
    v_session.cafe_id,
    v_session.cashier_id,
    'experience_reward_redeemed',
    'experience_reward_submission',
    v_submission.id,
    upper(btrim(p_reward_code)),
    jsonb_build_object(
      'customerName', COALESCE(v_customer.full_name, ''),
      'rewardCode', upper(btrim(p_reward_code)),
      'experienceUrl', v_submission.experience_url,
      'items', v_items
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'submissionId', v_submission.id,
    'customerName', COALESCE(v_customer.full_name, 'عميل'),
    'rewardCode', upper(btrim(p_reward_code)),
    'experienceUrl', v_submission.experience_url,
    'views', v_submission.current_views,
    'comments', v_submission.current_comments,
    'expiresAt', v_submission.reward_expires_at,
    'items', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_experience_reward(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_experience_reward(text, text) TO anon, authenticated;

SELECT 'experience_reward_system_ready' AS status;
