-- Barndaksa Platform — Critical security fixes
-- Version: 004
-- Run after 003_barndaksa_security_hardening.sql
-- =============================================================================
-- Shared helpers (SECURITY DEFINER, search_path = '')
-- =============================================================================
CREATE OR REPLACE FUNCTION public.assert_cafe_open_to_customers(p_cafe_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.cafes c
    WHERE c.id = p_cafe_id
      AND c.status = 'active'
      AND c.is_public = true
      AND c.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cafe is not available';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_cafe_open_to_customers(uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_cafe_id uuid,
  p_action text,
  p_entity_table text,
  p_entity_id uuid,
  p_new_data jsonb DEFAULT NULL,
  p_old_data jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    actor_id, cafe_id, action, entity_table, entity_id, old_data, new_data
  ) VALUES (
    auth.uid(), p_cafe_id, p_action, p_entity_table, p_entity_id, p_old_data, p_new_data
  );
END;
$$;
REVOKE ALL ON FUNCTION public.write_audit_log(uuid, text, text, uuid, jsonb, jsonb) FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.internal_notify_cafe(
  p_cafe_id uuid,
  p_title text,
  p_body text,
  p_type text,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.notifications (cafe_id, audience, title, body, type, meta)
  VALUES (p_cafe_id, 'cafe', p_title, p_body, p_type, p_meta)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.internal_notify_cafe(uuid, text, text, text, jsonb) FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.internal_notify_customer(
  p_cafe_id uuid,
  p_customer_id uuid,
  p_title text,
  p_body text,
  p_type text,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.notifications (cafe_id, audience, customer_id, title, body, type, meta)
  VALUES (p_cafe_id, 'customer', p_customer_id, p_title, p_body, p_type, p_meta)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.internal_notify_customer(uuid, uuid, text, text, text, jsonb) FROM PUBLIC;
-- =============================================================================
-- 1. cafe_settings — close public leak
-- =============================================================================
DROP POLICY IF EXISTS cafe_settings_public_read ON cafe_settings;
CREATE OR REPLACE FUNCTION public.get_cafe_public_settings(p_cafe_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'cafe_id', cs.cafe_id,
    'description', cs.description,
    'logo_url', cs.logo_url,
    'logo_storage_path', cs.logo_storage_path,
    'instagram', cs.instagram,
    'whatsapp', cs.whatsapp,
    'theme_id', cs.theme_id
  )
  FROM public.cafe_settings cs
  JOIN public.cafes c ON c.id = cs.cafe_id
  WHERE cs.cafe_id = p_cafe_id
    AND c.is_public = true
    AND c.status = 'active'
    AND c.deleted_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.get_cafe_public_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cafe_public_settings(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS orders_customer_insert ON orders;
DROP POLICY IF EXISTS order_items_insert ON order_items;
DROP POLICY IF EXISTS orders_cafe_update ON orders;
CREATE OR REPLACE FUNCTION public.create_pickup_order(
  p_cafe_id uuid,
  p_branch_name text DEFAULT NULL,
  p_pickup_at timestamptz DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_id uuid;
  v_profile public.customer_profiles%ROWTYPE;
  v_item jsonb;
  v_product public.menu_products%ROWTYPE;
  v_subtotal numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_tax numeric(10,2);
  v_total numeric(10,2);
  v_loyalty int := 0;
  v_order_id uuid;
  v_qty int;
  v_lines jsonb := '[]'::jsonb;
  v_line jsonb;
  v_item_count int := 0;
  c_max_items constant int := 50;
  c_max_qty constant int := 99;
  c_max_notes constant int := 500;
  c_max_branch constant int := 100;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  PERFORM public.assert_cafe_open_to_customers(p_cafe_id);
  v_customer_id := public.get_customer_profile_id(p_cafe_id);
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer profile not found for this cafe';
  END IF;
  SELECT * INTO v_profile
  FROM public.customer_profiles
  WHERE id = v_customer_id;
  IF p_branch_name IS NOT NULL AND char_length(p_branch_name) > c_max_branch THEN
    RAISE EXCEPTION 'Branch name too long';
  END IF;
  IF p_notes IS NOT NULL AND char_length(p_notes) > c_max_notes THEN
    RAISE EXCEPTION 'Notes too long';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;
  IF jsonb_array_length(p_items) > c_max_items THEN
    RAISE EXCEPTION 'Too many items in order';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_product
    FROM public.menu_products
    WHERE id = (v_item->>'product_id')::uuid
      AND cafe_id = p_cafe_id
      AND available = true
      AND available_for_pickup = true
      AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid or unavailable product for pickup: %', v_item->>'product_id';
    END IF;
    v_qty := (v_item->>'quantity')::int;
    IF v_qty IS NULL OR v_qty <= 0 OR v_qty > c_max_qty THEN
      RAISE EXCEPTION 'Invalid quantity';
    END IF;
    IF v_item->>'notes' IS NOT NULL AND char_length(v_item->>'notes') > c_max_notes THEN
      RAISE EXCEPTION 'Item notes too long';
    END IF;
    v_subtotal := v_subtotal + (v_product.price * v_qty);
    v_loyalty := v_loyalty + COALESCE(v_product.loyalty_points, 0) * v_qty;
    v_item_count := v_item_count + 1;
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'product_id', v_product.id,
        'name', v_product.name,
        'quantity', v_qty,
        'unit_price', v_product.price,
        'notes', NULLIF(v_item->>'notes', '')
      )
    );
  END LOOP;
  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;
  v_tax := round(v_subtotal * 0.15, 2);
  v_total := round(v_subtotal - v_discount + v_tax, 2);
  IF v_total <> round(v_subtotal - v_discount + v_tax, 2) THEN
    RAISE EXCEPTION 'Order total mismatch';
  END IF;
  INSERT INTO public.orders (
    cafe_id, customer_id, customer_name, customer_phone, customer_email,
    branch_name, fulfillment_type, status, payment_status,
    pickup_at, notes, subtotal, discount_amount, tax_amount, total, loyalty_points_earned
  ) VALUES (
    p_cafe_id, v_customer_id, v_profile.full_name, v_profile.phone, v_profile.email,
    NULLIF(btrim(p_branch_name), ''), 'pickup', 'pending_cafe', 'pay_at_pickup',
    p_pickup_at, NULLIF(btrim(p_notes), ''), v_subtotal, v_discount, v_tax, v_total, v_loyalty
  )
  RETURNING id INTO v_order_id;
  FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines)
  LOOP
    INSERT INTO public.order_items (order_id, product_id, name, quantity, unit_price, notes)
    VALUES (
      v_order_id,
      (v_line->>'product_id')::uuid,
      v_line->>'name',
      (v_line->>'quantity')::int,
      (v_line->>'unit_price')::numeric(10,2),
      NULLIF(v_line->>'notes', '')
    );
  END LOOP;
  PERFORM public.internal_notify_cafe(
    p_cafe_id,
    'طلب استلام جديد',
    'طلب جديد من ' || v_profile.full_name,
    'new_pickup_order',
    jsonb_build_object('order_id', v_order_id)
  );
  PERFORM public.internal_notify_customer(
    p_cafe_id,
    v_customer_id,
    'تم إرسال طلبك',
    'طلبك ' || v_order_id::text || ' بانتظار موافقة الكوفي. الدفع عند الاستلام.',
    'new_pickup_order',
    jsonb_build_object('order_id', v_order_id)
  );
  RETURN v_order_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_pickup_order(uuid, text, timestamptz, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pickup_order(uuid, text, timestamptz, text, jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.respond_to_pickup_order(
  p_order_id uuid,
  p_status public.order_status,
  p_rejection_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF NOT (
    public.is_platform_admin()
    OR public.is_cafe_owner(v_order.cafe_id)
    OR public.has_cafe_permission(v_order.cafe_id, 'orders')
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF v_order.status <> 'pending_cafe' THEN
    RAISE EXCEPTION 'Order is not awaiting cafe response';
  END IF;
  IF p_status NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'Invalid status transition';
  END IF;
  IF p_status = 'rejected' AND (p_rejection_reason IS NULL OR btrim(p_rejection_reason) = '') THEN
    RAISE EXCEPTION 'Rejection reason required';
  END IF;
  UPDATE public.orders
  SET status = p_status,
      rejection_reason = CASE WHEN p_status = 'rejected' THEN btrim(p_rejection_reason) ELSE NULL END,
      responded_at = now()
  WHERE id = p_order_id;
  PERFORM public.write_audit_log(
    v_order.cafe_id,
    'respond_to_pickup_order',
    'orders',
    p_order_id,
    jsonb_build_object('status', p_status, 'rejection_reason', p_rejection_reason),
    to_jsonb(v_order)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.respond_to_pickup_order(uuid, public.order_status, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_pickup_order(uuid, public.order_status, text) TO authenticated;
-- =============================================================================
-- =============================================================================
-- =============================================================================
ALTER TABLE public.experience_campaigns
  ADD CONSTRAINT experience_campaigns_id_cafe_unique UNIQUE (id, cafe_id);
ALTER TABLE public.experience_submissions
  DROP CONSTRAINT IF EXISTS experience_submissions_campaign_id_fkey;
ALTER TABLE public.experience_submissions
  ADD CONSTRAINT experience_submissions_campaign_cafe_fkey
  FOREIGN KEY (campaign_id, cafe_id)
  REFERENCES public.experience_campaigns(id, cafe_id)
  ON DELETE CASCADE;
ALTER TABLE public.experience_submissions
  ALTER COLUMN video_url DROP NOT NULL;
DROP POLICY IF EXISTS experience_submissions_insert ON public.experience_submissions;
DROP POLICY IF EXISTS experience_submissions_customer ON public.experience_submissions;
DROP POLICY IF EXISTS experience_submissions_review ON public.experience_submissions;
CREATE OR REPLACE FUNCTION public.submit_experience_submission(
  p_cafe_id uuid,
  p_campaign_id uuid,
  p_platform text,
  p_video_url text DEFAULT NULL,
  p_platform_username text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_id uuid;
  v_campaign public.experience_campaigns%ROWTYPE;
  v_id uuid;
  v_video text;
  c_max_note constant int := 500;
  c_max_username constant int := 100;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  PERFORM public.assert_cafe_open_to_customers(p_cafe_id);
  v_customer_id := public.get_customer_profile_id(p_cafe_id);
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer profile not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.customer_profiles cp
    WHERE cp.id = v_customer_id
      AND cp.cafe_id = p_cafe_id
      AND cp.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Customer profile mismatch';
  END IF;
  SELECT * INTO v_campaign
  FROM public.experience_campaigns
  WHERE id = p_campaign_id
    AND cafe_id = p_cafe_id
    AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not active for this cafe';
  END IF;
  IF current_date < v_campaign.start_date OR current_date > v_campaign.end_date THEN
    RAISE EXCEPTION 'Campaign is not open on this date';
  END IF;
  IF NOT (p_platform = ANY(v_campaign.platforms)) THEN
    RAISE EXCEPTION 'Platform not allowed for this campaign';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.experience_submissions es
    WHERE es.campaign_id = p_campaign_id
      AND es.customer_id = v_customer_id
  ) THEN
    RAISE EXCEPTION 'Already submitted for this campaign';
  END IF;
  v_video := NULLIF(btrim(p_video_url), '');
  IF v_video IS NOT NULL AND v_video NOT LIKE 'https://%' THEN
    RAISE EXCEPTION 'Video URL must use HTTPS';
  END IF;
  IF p_note IS NOT NULL AND char_length(p_note) > c_max_note THEN
    RAISE EXCEPTION 'Note too long';
  END IF;
  IF p_platform_username IS NOT NULL AND char_length(p_platform_username) > c_max_username THEN
    RAISE EXCEPTION 'Platform username too long';
  END IF;
  INSERT INTO public.experience_submissions (
    campaign_id, cafe_id, customer_id, platform, video_url,
    platform_username, note, media_storage_path, status
  ) VALUES (
    p_campaign_id, p_cafe_id, v_customer_id, p_platform,
    COALESCE(v_video, ''),
    NULLIF(btrim(p_platform_username), ''),
    NULLIF(btrim(p_note), ''),
    NULL,
    'pending'
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_experience_submission(uuid, uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_experience_submission(uuid, uuid, text, text, text, text) TO authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_tx_experience_submission
  ON public.loyalty_transactions(reference_type, reference_id)
  WHERE reference_type = 'experience_submission';
CREATE OR REPLACE FUNCTION public.approve_experience_submission(
  p_submission_id uuid,
  p_awarded_points int
)
RETURNS public.experience_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub public.experience_submissions%ROWTYPE;
  v_campaign public.experience_campaigns%ROWTYPE;
  v_account public.loyalty_accounts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT * INTO v_sub
  FROM public.experience_submissions
  WHERE id = p_submission_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;
  IF NOT (
    public.is_platform_admin()
    OR public.is_cafe_owner(v_sub.cafe_id)
    OR public.has_cafe_permission(v_sub.cafe_id, 'marketing')
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF v_sub.status <> 'pending' THEN
    RAISE EXCEPTION 'Submission is not pending';
  END IF;
  IF p_awarded_points <= 0 THEN
    RAISE EXCEPTION 'Invalid points';
  END IF;
  SELECT * INTO v_campaign
  FROM public.experience_campaigns
  WHERE id = v_sub.campaign_id
    AND cafe_id = v_sub.cafe_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;
  IF p_awarded_points > v_campaign.max_points_per_submission THEN
    RAISE EXCEPTION 'Points exceed campaign maximum';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.loyalty_transactions lt
    WHERE lt.reference_type = 'experience_submission'
      AND lt.reference_id = p_submission_id
  ) THEN
    RAISE EXCEPTION 'Submission already rewarded';
  END IF;
  UPDATE public.experience_submissions
  SET status = 'approved',
      awarded_points = p_awarded_points,
      reviewed_at = now(),
      reviewed_by = auth.uid()
  WHERE id = p_submission_id
  RETURNING * INTO v_sub;
  INSERT INTO public.loyalty_transactions (
    cafe_id, customer_id, amount, reason, reference_type, reference_id, created_by
  ) VALUES (
    v_sub.cafe_id, v_sub.customer_id, p_awarded_points,
    'مكافأة وثّق تجربتك', 'experience_submission', p_submission_id, auth.uid()
  );
  SELECT * INTO v_account
  FROM public.loyalty_accounts
  WHERE cafe_id = v_sub.cafe_id AND customer_id = v_sub.customer_id
  FOR UPDATE;
  IF FOUND THEN
    UPDATE public.loyalty_accounts
    SET balance = balance + p_awarded_points
    WHERE id = v_account.id;
  ELSE
    INSERT INTO public.loyalty_accounts (cafe_id, customer_id, balance)
    VALUES (v_sub.cafe_id, v_sub.customer_id, p_awarded_points);
  END IF;
  PERFORM public.write_audit_log(
    v_sub.cafe_id,
    'approve_experience_submission',
    'experience_submissions',
    p_submission_id,
    jsonb_build_object('awarded_points', p_awarded_points)
  );
  RETURN v_sub;
END;
$$;
REVOKE ALL ON FUNCTION public.approve_experience_submission(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_experience_submission(uuid, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.attach_experience_submission_media(
  p_submission_id uuid,
  p_media_storage_path text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub public.experience_submissions%ROWTYPE;
  v_media text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_media := NULLIF(btrim(p_media_storage_path), '');
  IF v_media IS NULL THEN
    RAISE EXCEPTION 'Media path required';
  END IF;

  IF NOT public.storage_object_path_is_safe(v_media) THEN
    RAISE EXCEPTION 'Invalid media storage path';
  END IF;
  IF NOT public.storage_path_has_allowed_image_ext(v_media) THEN
    RAISE EXCEPTION 'Invalid media file extension';
  END IF;
  IF array_length(string_to_array(v_media, '/'), 1) <> 3 THEN
    RAISE EXCEPTION 'Invalid media storage path format';
  END IF;
  IF split_part(v_media, '/', 1) <> auth.uid()::text THEN
    RAISE EXCEPTION 'Media path must belong to current user';
  END IF;

  IF split_part(v_media, '/', 2) <> p_submission_id::text THEN
    RAISE EXCEPTION 'Media path must reference this submission';
  END IF;

  IF split_part(v_media, '/', 3) = '' THEN
    RAISE EXCEPTION 'Invalid media file name in path';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = 'experience-submissions'
      AND o.name = v_media
      AND split_part(o.name, '/', 1) = auth.uid()::text
      AND split_part(o.name, '/', 2) = p_submission_id::text
  ) THEN
    RAISE EXCEPTION 'Media file not found in storage';
  END IF;

  SELECT * INTO v_sub
  FROM public.experience_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  IF v_sub.customer_id <> public.get_customer_profile_id(v_sub.cafe_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_sub.status <> 'pending' THEN
    RAISE EXCEPTION 'Submission is not editable';
  END IF;

  UPDATE public.experience_submissions
  SET media_storage_path = v_media
  WHERE id = p_submission_id;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_experience_submission_media(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_experience_submission_media(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_experience_submission_metrics(
  p_submission_id uuid,
  p_views int DEFAULT NULL,
  p_likes int DEFAULT NULL,
  p_comments int DEFAULT NULL,
  p_shares int DEFAULT NULL
)
RETURNS public.experience_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub public.experience_submissions%ROWTYPE;
  v_campaign public.experience_campaigns%ROWTYPE;
  v_views int;
  v_likes int;
  v_comments int;
  v_shares int;
  v_suggested int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_sub
  FROM public.experience_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  IF NOT (
    public.is_platform_admin()
    OR public.is_cafe_owner(v_sub.cafe_id)
    OR public.has_cafe_permission(v_sub.cafe_id, 'marketing')
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_campaign
  FROM public.experience_campaigns
  WHERE id = v_sub.campaign_id
    AND cafe_id = v_sub.cafe_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  v_views := COALESCE(p_views, v_sub.views, 0);
  v_likes := COALESCE(p_likes, v_sub.likes, 0);
  v_comments := COALESCE(p_comments, v_sub.comments, 0);
  v_shares := COALESCE(p_shares, v_sub.shares, 0);

  v_suggested := v_campaign.base_points
    + (v_views / 100) * v_campaign.points_per_view::numeric
    + v_likes * v_campaign.points_per_like::numeric
    + v_comments * v_campaign.points_per_comment::numeric;
  v_suggested := LEAST(floor(v_suggested)::int, v_campaign.max_points_per_submission);

  UPDATE public.experience_submissions
  SET views = v_views,
      likes = v_likes,
      comments = v_comments,
      shares = v_shares,
      suggested_points = v_suggested,
      updated_at = now()
  WHERE id = p_submission_id
  RETURNING * INTO v_sub;

  RETURN v_sub;
END;
$$;
REVOKE ALL ON FUNCTION public.update_experience_submission_metrics(uuid, int, int, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_experience_submission_metrics(uuid, int, int, int, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_experience_submission(
  p_submission_id uuid,
  p_rejection_reason text
)
RETURNS public.experience_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub public.experience_submissions%ROWTYPE;
  v_reason text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_reason := NULLIF(btrim(p_rejection_reason), '');
  IF v_reason IS NULL THEN
    v_reason := 'لم تستوفِ شروط الحملة';
  END IF;

  SELECT * INTO v_sub
  FROM public.experience_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  IF NOT (
    public.is_platform_admin()
    OR public.is_cafe_owner(v_sub.cafe_id)
    OR public.has_cafe_permission(v_sub.cafe_id, 'marketing')
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_sub.status <> 'pending' THEN
    RAISE EXCEPTION 'Submission is not pending';
  END IF;

  UPDATE public.experience_submissions
  SET status = 'rejected',
      rejection_reason = v_reason,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      updated_at = now()
  WHERE id = p_submission_id
  RETURNING * INTO v_sub;

  RETURN v_sub;
END;
$$;
REVOKE ALL ON FUNCTION public.reject_experience_submission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_experience_submission(uuid, text) TO authenticated;

DROP POLICY IF EXISTS reservations_customer_insert ON reservations;
DROP POLICY IF EXISTS reservations_cafe_update ON reservations;
DROP POLICY IF EXISTS reservation_responses_insert ON reservation_responses;
DROP POLICY IF EXISTS reservation_responses_read ON reservation_responses;
CREATE OR REPLACE FUNCTION public.create_customer_reservation(
  p_cafe_id uuid,
  p_event_type text,
  p_guests int,
  p_reservation_date date,
  p_reservation_time time,
  p_duration_minutes int DEFAULT NULL,
  p_branch_name text DEFAULT NULL,
  p_space_type text DEFAULT NULL,
  p_event_title text DEFAULT NULL,
  p_needs_decoration boolean DEFAULT false,
  p_needs_catering boolean DEFAULT false,
  p_budget_estimate numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_id uuid;
  v_profile public.customer_profiles%ROWTYPE;
  v_id uuid;
  c_max_guests constant int := 500;
  c_min_duration constant int := 15;
  c_max_duration constant int := 480;
  c_max_text constant int := 200;
  c_max_notes constant int := 500;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  PERFORM public.assert_cafe_open_to_customers(p_cafe_id);
  v_customer_id := public.get_customer_profile_id(p_cafe_id);
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer profile not found';
  END IF;
  SELECT * INTO v_profile
  FROM public.customer_profiles
  WHERE id = v_customer_id;
  IF p_guests IS NULL OR p_guests <= 0 OR p_guests > c_max_guests THEN
    RAISE EXCEPTION 'Invalid guests count';
  END IF;
  IF p_reservation_date < current_date THEN
    RAISE EXCEPTION 'Reservation date cannot be in the past';
  END IF;
  IF p_duration_minutes IS NOT NULL
     AND (p_duration_minutes < c_min_duration OR p_duration_minutes > c_max_duration) THEN
    RAISE EXCEPTION 'Invalid duration';
  END IF;
  IF char_length(p_event_type) > c_max_text THEN
    RAISE EXCEPTION 'Event type too long';
  END IF;
  IF p_branch_name IS NOT NULL AND char_length(p_branch_name) > c_max_text THEN
    RAISE EXCEPTION 'Branch name too long';
  END IF;
  IF p_space_type IS NOT NULL AND char_length(p_space_type) > c_max_text THEN
    RAISE EXCEPTION 'Space type too long';
  END IF;
  IF p_event_title IS NOT NULL AND char_length(p_event_title) > c_max_text THEN
    RAISE EXCEPTION 'Event title too long';
  END IF;
  IF p_notes IS NOT NULL AND char_length(p_notes) > c_max_notes THEN
    RAISE EXCEPTION 'Notes too long';
  END IF;
  INSERT INTO public.reservations (
    cafe_id, customer_id, customer_name, phone, event_type, guests,
    reservation_date, reservation_time, duration_minutes, branch_name,
    space_type, event_title, needs_decoration, needs_catering,
    budget_estimate, notes, status
  ) VALUES (
    p_cafe_id, v_customer_id, v_profile.full_name, v_profile.phone, p_event_type, p_guests,
    p_reservation_date, p_reservation_time, p_duration_minutes, NULLIF(btrim(p_branch_name), ''),
    NULLIF(btrim(p_space_type), ''), NULLIF(btrim(p_event_title), ''), p_needs_decoration, p_needs_catering,
    p_budget_estimate, NULLIF(btrim(p_notes), ''), 'pending'
  )
  RETURNING id INTO v_id;
  PERFORM public.internal_notify_cafe(
    p_cafe_id,
    'حجز جديد',
    'حجز من ' || v_profile.full_name,
    'new_reservation',
    jsonb_build_object('reservation_id', v_id)
  );
  PERFORM public.internal_notify_customer(
    p_cafe_id,
    v_customer_id,
    'تم إرسال طلب الحجز',
    'طلبك (' || p_event_type || ') بانتظار رد الكوفي. سنبلغك عند القبول أو الرفض.',
    'new_reservation',
    jsonb_build_object('reservation_id', v_id)
  );
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_customer_reservation(uuid, text, int, date, time, int, text, text, text, boolean, boolean, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_customer_reservation(uuid, text, int, date, time, int, text, text, text, boolean, boolean, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_to_reservation(
  p_reservation_id uuid,
  p_status reservation_status,
  p_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_res public.reservations%ROWTYPE;
  v_msg text;
  c_max_message constant int := 500;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_status NOT IN ('accepted', 'rejected', 'modification_requested') THEN
    RAISE EXCEPTION 'Invalid reservation status transition';
  END IF;

  v_msg := NULLIF(btrim(p_message), '');
  IF v_msg IS NOT NULL AND char_length(v_msg) > c_max_message THEN
    RAISE EXCEPTION 'Message too long';
  END IF;

  SELECT * INTO v_res
  FROM public.reservations
  WHERE id = p_reservation_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  IF NOT (
    public.is_platform_admin()
    OR public.is_cafe_owner(v_res.cafe_id)
    OR public.has_cafe_permission(v_res.cafe_id, 'reservations')
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_res.status <> 'pending' THEN
    RAISE EXCEPTION 'Reservation is not pending';
  END IF;

  UPDATE public.reservations
  SET status = p_status,
      cafe_message = CASE WHEN p_status = 'rejected' THEN NULL ELSE v_msg END,
      rejection_reason = CASE WHEN p_status = 'rejected' THEN COALESCE(v_msg, 'تم رفض الحجز') ELSE NULL END,
      updated_at = now()
  WHERE id = p_reservation_id;

  INSERT INTO public.reservation_responses (
    reservation_id, responder_id, status, message
  ) VALUES (
    p_reservation_id, auth.uid(), p_status, v_msg
  );

  PERFORM public.internal_notify_customer(
    v_res.cafe_id,
    v_res.customer_id,
    CASE p_status
      WHEN 'accepted' THEN 'تم قبول حجزك'
      WHEN 'rejected' THEN 'تم رفض حجزك'
      ELSE 'طلب تعديل على حجزك'
    END,
    COALESCE(v_msg, 'تم تحديث حالة حجزك.'),
    'reservation_response',
    jsonb_build_object('reservation_id', p_reservation_id, 'status', p_status)
  );

  PERFORM public.write_audit_log(
    v_res.cafe_id,
    'respond_to_reservation',
    'reservations',
    p_reservation_id,
    jsonb_build_object('status', p_status, 'message', v_msg)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.respond_to_reservation(uuid, reservation_status, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_reservation(uuid, reservation_status, text) TO authenticated;

-- =============================================================================
-- 5. Notifications — no direct UPDATE; restricted create RPCs
-- =============================================================================
DROP POLICY IF EXISTS notifications_update_read ON notifications;
DROP POLICY IF EXISTS notifications_cafe_update_read ON notifications;
CREATE OR REPLACE FUNCTION public.mark_customer_notification_read(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE public.notifications n
  SET read = true
  WHERE n.id = p_notification_id
    AND n.audience = 'customer'
    AND n.customer_id = public.get_customer_profile_id(n.cafe_id)
    AND n.read = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification not found or forbidden';
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.mark_cafe_notification_read(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cafe_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT cafe_id INTO v_cafe_id
  FROM public.notifications
  WHERE id = p_notification_id
    AND audience = 'cafe';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification not found';
  END IF;
  IF NOT (
    public.is_platform_admin()
    OR public.is_cafe_owner(v_cafe_id)
    OR public.has_cafe_permission(v_cafe_id, 'notifications')
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.notifications
  SET read = true
  WHERE id = p_notification_id
    AND audience = 'cafe'
    AND read = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification not found or already read';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_customer_notification_read(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_cafe_notification_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_customer_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_cafe_notification_read(uuid) TO authenticated;
DROP POLICY IF EXISTS notifications_insert ON notifications;
CREATE OR REPLACE FUNCTION public.create_cafe_notification(
  p_cafe_id uuid,
  p_title text,
  p_body text,
  p_type text,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF NOT (
    public.has_cafe_permission(p_cafe_id, 'notifications')
    OR public.is_cafe_owner(p_cafe_id)
    OR public.is_platform_admin()
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN public.internal_notify_cafe(p_cafe_id, p_title, p_body, p_type, p_meta);
END;
$$;
CREATE OR REPLACE FUNCTION public.create_customer_notification(
  p_cafe_id uuid,
  p_customer_id uuid,
  p_title text,
  p_body text,
  p_type text,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF NOT (
    public.has_cafe_permission(p_cafe_id, 'notifications')
    OR public.is_cafe_owner(p_cafe_id)
    OR public.is_platform_admin()
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.customer_profiles cp
    WHERE cp.id = p_customer_id
      AND cp.cafe_id = p_cafe_id
  ) THEN
    RAISE EXCEPTION 'Customer not found in this cafe';
  END IF;
  INSERT INTO public.notifications (cafe_id, audience, customer_id, title, body, type, meta)
  VALUES (p_cafe_id, 'customer', p_customer_id, p_title, p_body, p_type, p_meta)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_cafe_notification(uuid, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_customer_notification(uuid, uuid, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_cafe_notification(uuid, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_notification(uuid, uuid, text, text, text, jsonb) TO authenticated;
DROP FUNCTION IF EXISTS public.create_customer_self_notification(uuid, text, text, text, jsonb);
-- =============================================================================
-- 6. Loyalty — RPC only for balance/transaction writes
-- =============================================================================
DROP POLICY IF EXISTS loyalty_transactions_insert_staff ON loyalty_transactions;
DROP POLICY IF EXISTS loyalty_accounts_update ON loyalty_accounts;
CREATE OR REPLACE FUNCTION public.adjust_loyalty_points(
  p_cafe_id uuid,
  p_customer_id uuid,
  p_amount int,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account public.loyalty_accounts%ROWTYPE;
  v_new_balance int;
  c_max_reason constant int := 500;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF NOT (
    public.has_cafe_permission(p_cafe_id, 'loyalty')
    OR public.is_cafe_owner(p_cafe_id)
    OR public.is_platform_admin()
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_amount = 0 THEN
    RAISE EXCEPTION 'Amount must not be zero';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR char_length(p_reason) > c_max_reason THEN
    RAISE EXCEPTION 'Invalid reason';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.customer_profiles cp
    WHERE cp.id = p_customer_id
      AND cp.cafe_id = p_cafe_id
  ) THEN
    RAISE EXCEPTION 'Customer not found in this cafe';
  END IF;
  SELECT * INTO v_account
  FROM public.loyalty_accounts
  WHERE cafe_id = p_cafe_id AND customer_id = p_customer_id
  FOR UPDATE;
  IF FOUND THEN
    v_new_balance := v_account.balance + p_amount;
  ELSE
    IF p_amount < 0 THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;
    v_new_balance := p_amount;
  END IF;
  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;
  INSERT INTO public.loyalty_transactions (
    cafe_id, customer_id, amount, reason, reference_type, reference_id, created_by
  ) VALUES (
    p_cafe_id, p_customer_id, p_amount, btrim(p_reason), 'manual_adjustment', NULL, auth.uid()
  );
  IF v_account.id IS NOT NULL THEN
    UPDATE public.loyalty_accounts
    SET balance = v_new_balance
    WHERE id = v_account.id;
  ELSE
    INSERT INTO public.loyalty_accounts (cafe_id, customer_id, balance)
    VALUES (p_cafe_id, p_customer_id, v_new_balance);
  END IF;
  PERFORM public.write_audit_log(
    p_cafe_id,
    'adjust_loyalty_points',
    'loyalty_accounts',
    p_customer_id,
    jsonb_build_object('amount', p_amount, 'reason', p_reason, 'new_balance', v_new_balance)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.adjust_loyalty_points(uuid, uuid, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_loyalty_points(uuid, uuid, int, text) TO authenticated;
-- =============================================================================
-- 7. Permission-scoped staff policies
-- =============================================================================
DROP POLICY IF EXISTS loyalty_rules_staff ON loyalty_rules;
CREATE POLICY loyalty_rules_public_read ON loyalty_rules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.cafes c
      WHERE c.id = cafe_id AND c.is_public AND c.status = 'active' AND c.deleted_at IS NULL
    )
    OR public.has_cafe_permission(cafe_id, 'loyalty')
    OR public.is_cafe_owner(cafe_id)
    OR public.is_platform_admin()
  );
CREATE POLICY loyalty_rules_write ON loyalty_rules
  FOR ALL USING (
    public.has_cafe_permission(cafe_id, 'loyalty') OR public.is_cafe_owner(cafe_id) OR public.is_platform_admin()
  );
DROP POLICY IF EXISTS experience_campaigns_staff ON experience_campaigns;
CREATE POLICY experience_campaigns_write ON experience_campaigns
  FOR ALL USING (
    public.has_cafe_permission(cafe_id, 'marketing') OR public.is_cafe_owner(cafe_id) OR public.is_platform_admin()
  );
DROP POLICY IF EXISTS branches_staff ON branches;
CREATE POLICY branches_write ON branches
  FOR ALL USING (
    public.has_cafe_permission(cafe_id, 'branches') OR public.is_cafe_owner(cafe_id) OR public.is_platform_admin()
  );
DROP POLICY IF EXISTS reviews_cafe_update ON reviews;
CREATE OR REPLACE FUNCTION public.enforce_review_owner_reply_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NOT (
      public.is_platform_admin()
      OR public.is_cafe_owner(NEW.cafe_id)
      OR public.has_cafe_permission(NEW.cafe_id, 'reviews')
    ) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
    IF NEW.rating IS DISTINCT FROM OLD.rating
       OR NEW.comment IS DISTINCT FROM OLD.comment
       OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
       OR NEW.product_id IS DISTINCT FROM OLD.product_id
       OR NEW.cafe_id IS DISTINCT FROM OLD.cafe_id THEN
      RAISE EXCEPTION 'Only owner_reply may be modified';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS reviews_owner_reply_only ON reviews;
CREATE TRIGGER reviews_owner_reply_only
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION public.enforce_review_owner_reply_only();
CREATE POLICY reviews_owner_reply_update ON reviews
  FOR UPDATE USING (
    public.has_cafe_permission(cafe_id, 'reviews') OR public.is_cafe_owner(cafe_id) OR public.is_platform_admin()
  );
CREATE OR REPLACE FUNCTION public.set_review_owner_reply(
  p_review_id uuid,
  p_owner_reply text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cafe_id uuid;
BEGIN
  SELECT cafe_id INTO v_cafe_id FROM public.reviews WHERE id = p_review_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review not found';
  END IF;
  IF NOT (
    public.is_platform_admin()
    OR public.is_cafe_owner(v_cafe_id)
    OR public.has_cafe_permission(v_cafe_id, 'reviews')
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.reviews SET owner_reply = p_owner_reply WHERE id = p_review_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_review_owner_reply(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_review_owner_reply(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_customer_review(
  p_cafe_id uuid,
  p_product_id uuid,
  p_rating int,
  p_comment text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_id uuid;
  v_profile public.customer_profiles%ROWTYPE;
  v_id uuid;
  c_max_comment constant int := 2000;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  PERFORM public.assert_cafe_open_to_customers(p_cafe_id);

  v_customer_id := public.get_customer_profile_id(p_cafe_id);
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer profile not found';
  END IF;

  SELECT * INTO v_profile
  FROM public.customer_profiles
  WHERE id = v_customer_id
    AND cafe_id = p_cafe_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer profile mismatch';
  END IF;

  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Invalid rating';
  END IF;

  IF p_comment IS NOT NULL AND char_length(p_comment) > c_max_comment THEN
    RAISE EXCEPTION 'Comment too long';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.menu_products mp
    WHERE mp.id = p_product_id
      AND mp.cafe_id = p_cafe_id
      AND mp.deleted_at IS NULL
      AND mp.available = true
  ) THEN
    RAISE EXCEPTION 'Product not found or not available';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.reviews r
    WHERE r.cafe_id = p_cafe_id
      AND r.product_id = p_product_id
      AND r.customer_id = v_customer_id
  ) THEN
    RAISE EXCEPTION 'Review already submitted for this product';
  END IF;

  INSERT INTO public.reviews (
    cafe_id, product_id, customer_id, customer_name, rating, comment
  ) VALUES (
    p_cafe_id,
    p_product_id,
    v_customer_id,
    v_profile.full_name,
    p_rating,
    NULLIF(btrim(p_comment), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_customer_review(uuid, uuid, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_customer_review(uuid, uuid, int, text) TO authenticated;

-- =============================================================================
-- 8. profiles INSERT — force customer role
-- =============================================================================
DROP POLICY IF EXISTS profiles_insert_own ON profiles;
CREATE POLICY profiles_insert_own ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    (id = auth.uid() AND role = 'customer' AND status = 'active')
    OR public.is_platform_admin()
  );
-- =============================================================================
-- =============================================================================
-- =============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_profiles_unique_user_cafe
  ON public.customer_profiles(cafe_id, user_id)
  WHERE user_id IS NOT NULL;

DROP POLICY IF EXISTS customer_profiles_own ON public.customer_profiles;
DROP POLICY IF EXISTS customer_profiles_update ON public.customer_profiles;
DROP POLICY IF EXISTS customer_profiles_insert ON public.customer_profiles;

CREATE OR REPLACE FUNCTION public.set_customer_avatar_storage_path(
  p_profile_id uuid,
  p_storage_path text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_storage_path IS NULL OR btrim(p_storage_path) = '' THEN
    RAISE EXCEPTION 'Storage path required';
  END IF;
  IF NOT public.storage_object_path_is_safe(p_storage_path) THEN
    RAISE EXCEPTION 'Invalid storage path';
  END IF;
  IF split_part(p_storage_path, '/', 1) <> auth.uid()::text THEN
    RAISE EXCEPTION 'Avatar path must belong to current user';
  END IF;
  IF split_part(p_storage_path, '/', 2) = '' THEN
    RAISE EXCEPTION 'Invalid storage path';
  END IF;
  IF array_length(string_to_array(p_storage_path, '/'), 1) <> 2 THEN
    RAISE EXCEPTION 'Invalid avatar path format';
  END IF;
  IF NOT public.storage_path_has_allowed_image_ext(p_storage_path) THEN
    RAISE EXCEPTION 'Invalid avatar file extension';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = 'customer-avatars'
      AND o.name = p_storage_path
      AND split_part(o.name, '/', 1) = auth.uid()::text
  ) THEN
    RAISE EXCEPTION 'Avatar file not found in storage';
  END IF;

  PERFORM set_config('barndaksa.avatar_path_update', '1', true);

  UPDATE public.customer_profiles
  SET avatar_storage_path = p_storage_path,
      avatar_url = NULL,
      updated_at = now()
  WHERE id = p_profile_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    PERFORM set_config('barndaksa.avatar_path_update', '', true);
    RAISE EXCEPTION 'Profile not found or forbidden';
  END IF;

  PERFORM set_config('barndaksa.avatar_path_update', '', true);
END;
$$;
REVOKE ALL ON FUNCTION public.set_customer_avatar_storage_path(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_customer_avatar_storage_path(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_customer_profile_update_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.avatar_url := NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.avatar_url := NULL;

    IF (NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.cafe_id IS DISTINCT FROM OLD.cafe_id)
       AND NOT public.is_platform_admin() THEN
      RAISE EXCEPTION 'Cannot reassign customer profile';
    END IF;
    IF NEW.avatar_storage_path IS DISTINCT FROM OLD.avatar_storage_path THEN
      IF NEW.avatar_storage_path IS NOT NULL
         AND NOT public.storage_object_path_is_safe(NEW.avatar_storage_path) THEN
        RAISE EXCEPTION 'Invalid avatar storage path';
      END IF;
      IF NEW.avatar_storage_path IS NOT NULL
         AND split_part(NEW.avatar_storage_path, '/', 1) <> OLD.user_id::text THEN
        RAISE EXCEPTION 'Avatar path must belong to profile user';
      END IF;
      IF NOT public.is_platform_admin()
         AND COALESCE(current_setting('barndaksa.avatar_path_update', true), '') <> '1' THEN
        RAISE EXCEPTION 'Avatar path can only be updated via upload';
      END IF;
    END IF;
    IF auth.uid() IS NOT NULL
       AND OLD.user_id = auth.uid()
       AND NOT public.is_platform_admin()
       AND NOT public.is_cafe_owner(OLD.cafe_id)
       AND NOT public.has_cafe_permission(OLD.cafe_id, 'customers') THEN
      IF NEW.id IS DISTINCT FROM OLD.id
         OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Forbidden customer profile change';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_customer_profile_update_rules() FROM PUBLIC;
DROP TRIGGER IF EXISTS customer_profiles_immutable_binding ON public.customer_profiles;
CREATE TRIGGER customer_profiles_immutable_binding
  BEFORE INSERT OR UPDATE ON public.customer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_customer_profile_update_rules();
-- =============================================================================
-- 10. domain_orders — cancel via RPC only
-- =============================================================================
DROP POLICY IF EXISTS domain_orders_owner_cancel ON domain_orders;

CREATE OR REPLACE FUNCTION public.create_domain_order(
  p_cafe_id uuid,
  p_domain text,
  p_tld text,
  p_years int,
  p_auto_renew boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_domain text;
  v_tld text;
  c_max_domain constant int := 253;
  c_max_tld constant int := 63;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT (public.is_cafe_owner(p_cafe_id) OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_domain := lower(btrim(p_domain));
  v_tld := lower(btrim(p_tld));

  IF v_domain = '' OR char_length(v_domain) > c_max_domain THEN
    RAISE EXCEPTION 'Invalid domain';
  END IF;
  IF v_tld = '' OR char_length(v_tld) > c_max_tld OR v_tld !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'Invalid TLD';
  END IF;
  IF p_years IS NULL OR p_years <= 0 OR p_years > 10 THEN
    RAISE EXCEPTION 'Invalid years';
  END IF;

  INSERT INTO public.domain_orders (
    cafe_id, requested_by, domain, tld, years, auto_renew,
    price_estimate, currency, status,
    provider, provider_order_id, error_message,
    reviewed_by, reviewed_at, completed_at
  ) VALUES (
    p_cafe_id, auth.uid(), v_domain, v_tld, p_years, COALESCE(p_auto_renew, false),
    NULL, 'SAR', 'pending_review',
    NULL, NULL, NULL,
    NULL, NULL, NULL
  )
  RETURNING id INTO v_id;

  PERFORM public.write_audit_log(
    p_cafe_id,
    'create_domain_order',
    'domain_orders',
    v_id,
    jsonb_build_object('domain', v_domain, 'tld', v_tld, 'years', p_years)
  );

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_domain_order(uuid, text, text, int, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_domain_order(uuid, text, text, int, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_domain_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.domain_orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT * INTO v_order FROM public.domain_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF NOT (public.is_cafe_owner(v_order.cafe_id) OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF v_order.status <> 'pending_review' THEN
    RAISE EXCEPTION 'Only pending_review orders can be cancelled';
  END IF;
  UPDATE public.domain_orders SET status = 'cancelled' WHERE id = p_order_id;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_domain_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_domain_order(uuid) TO authenticated;

-- =============================================================================
-- 11. Defensive DROP of legacy policy names (superseded in 001–003)
-- =============================================================================
DROP POLICY IF EXISTS orders_customer_read ON public.orders;
DROP POLICY IF EXISTS orders_customer_insert ON public.orders;
DROP POLICY IF EXISTS orders_cafe_update ON public.orders;
DROP POLICY IF EXISTS order_items_read ON public.order_items;
DROP POLICY IF EXISTS order_items_insert ON public.order_items;
DROP POLICY IF EXISTS reservations_customer_read ON public.reservations;
DROP POLICY IF EXISTS reservations_customer_insert ON public.reservations;
DROP POLICY IF EXISTS reservations_cafe_update ON public.reservations;
DROP POLICY IF EXISTS reservation_responses_read ON public.reservation_responses;
DROP POLICY IF EXISTS reservation_responses_insert ON public.reservation_responses;
DROP POLICY IF EXISTS notifications_read ON public.notifications;
DROP POLICY IF EXISTS notifications_update_read ON public.notifications;
DROP POLICY IF EXISTS audit_logs_read ON public.audit_logs;
DROP POLICY IF EXISTS subscriptions_cafe ON public.subscriptions;
DROP POLICY IF EXISTS loyalty_accounts_read ON public.loyalty_accounts;
DROP POLICY IF EXISTS loyalty_accounts_update ON public.loyalty_accounts;
DROP POLICY IF EXISTS domain_orders_insert ON public.domain_orders;
DROP POLICY IF EXISTS domain_orders_owner_cancel ON public.domain_orders;
DROP POLICY IF EXISTS reviews_customer_insert ON public.reviews;
DROP POLICY IF EXISTS reviews_cafe_update ON public.reviews;
DROP POLICY IF EXISTS experience_submissions_insert ON public.experience_submissions;
DROP POLICY IF EXISTS experience_submissions_customer ON public.experience_submissions;
DROP POLICY IF EXISTS experience_submissions_review ON public.experience_submissions;
DROP POLICY IF EXISTS platform_settings_read ON public.platform_settings;
DROP POLICY IF EXISTS customer_profiles_insert ON public.customer_profiles;

-- =============================================================================
-- 12. Customer profile creation — RPC only (no direct INSERT from client)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_customer_profile(
  p_cafe_id uuid,
  p_full_name text,
  p_phone text,
  p_email text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  c_max_name constant int := 200;
  c_max_phone constant int := 20;
  c_max_email constant int := 320;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  PERFORM public.assert_cafe_open_to_customers(p_cafe_id);

  IF p_full_name IS NULL OR btrim(p_full_name) = '' OR char_length(p_full_name) > c_max_name THEN
    RAISE EXCEPTION 'Invalid full name';
  END IF;
  IF p_phone IS NULL OR btrim(p_phone) = '' OR char_length(p_phone) > c_max_phone THEN
    RAISE EXCEPTION 'Invalid phone';
  END IF;
  IF p_email IS NOT NULL AND char_length(p_email) > c_max_email THEN
    RAISE EXCEPTION 'Invalid email';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.customer_profiles cp
    WHERE cp.cafe_id = p_cafe_id
      AND cp.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Profile already exists for this cafe';
  END IF;

  INSERT INTO public.customer_profiles (
    cafe_id, user_id, full_name, phone, email
  ) VALUES (
    p_cafe_id,
    auth.uid(),
    btrim(p_full_name),
    btrim(p_phone),
    NULLIF(btrim(p_email), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_customer_profile(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_customer_profile(uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_customer_profile(
  p_cafe_id uuid,
  p_full_name text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max_name constant int := 200;
  c_max_phone constant int := 20;
  c_max_email constant int := 320;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_full_name IS NULL OR btrim(p_full_name) = '' OR char_length(p_full_name) > c_max_name THEN
    RAISE EXCEPTION 'Invalid full name';
  END IF;
  IF p_phone IS NOT NULL AND (btrim(p_phone) = '' OR char_length(p_phone) > c_max_phone) THEN
    RAISE EXCEPTION 'Invalid phone';
  END IF;
  IF p_email IS NOT NULL AND char_length(p_email) > c_max_email THEN
    RAISE EXCEPTION 'Invalid email';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.customer_profiles cp
    WHERE cp.cafe_id = p_cafe_id
      AND cp.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Profile not found or forbidden';
  END IF;

  UPDATE public.customer_profiles
  SET full_name = btrim(p_full_name),
      email = NULLIF(btrim(p_email), ''),
      phone = COALESCE(NULLIF(btrim(p_phone), ''), phone),
      avatar_url = NULL,
      updated_at = now()
  WHERE cafe_id = p_cafe_id
    AND user_id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.update_customer_profile(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_customer_profile(uuid, text, text, text) TO authenticated;
