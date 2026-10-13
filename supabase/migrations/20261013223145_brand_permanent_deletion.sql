-- Permanent tenant deletion: atomic relational purge, durable Storage API cleanup.
CREATE TABLE public.brand_deletion_jobs (
  cafe_id uuid PRIMARY KEY,
  slug text NOT NULL,
  assets jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(assets) = 'array'),
  requested_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.brand_deletion_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brand_deletion_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.brand_deletion_jobs TO authenticated;
GRANT ALL ON public.brand_deletion_jobs TO service_role;
CREATE POLICY admin_read_brand_deletion_jobs ON public.brand_deletion_jobs FOR SELECT TO authenticated
  USING ((SELECT public.is_platform_admin()));

-- Append-only records remain immutable outside the authorized tenant purge.
CREATE OR REPLACE FUNCTION loyalty_audit_private.reject_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $fn$
BEGIN
  IF TG_OP = 'DELETE' AND current_user IN ('postgres','supabase_admin')
     AND public.is_platform_admin()
     AND current_setting('branda.deleting_cafe', true) = OLD.cafe_id::text
     AND EXISTS (SELECT 1 FROM public.brand_deletion_jobs WHERE cafe_id = OLD.cafe_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Loyalty activity is append-only';
END;
$fn$;

CREATE OR REPLACE FUNCTION public.capture_platform_admin_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_row jsonb;
  v_cafe_id uuid;
  v_entity_id uuid;
  v_id_value text;
  v_cafe_value text;
BEGIN
  -- Purged tenant details must not be recreated as full-row audit snapshots.
  IF TG_OP = 'DELETE' AND public.is_platform_admin()
     AND current_setting('branda.deleting_cafe', true) =
       (CASE WHEN TG_TABLE_NAME = 'cafes' THEN to_jsonb(OLD)->>'id' ELSE to_jsonb(OLD)->>'cafe_id' END)
     AND EXISTS (SELECT 1 FROM public.brand_deletion_jobs
       WHERE cafe_id::text = current_setting('branda.deleting_cafe', true)) THEN
    RETURN OLD;
  END IF;
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_row := to_jsonb(OLD);
  ELSE
    v_row := to_jsonb(NEW);
  END IF;

  v_id_value := v_row ->> 'id';
  v_cafe_value := v_row ->> 'cafe_id';

  IF TG_TABLE_NAME = 'cafes'
     AND v_id_value IS NOT NULL
     AND v_id_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_cafe_id := v_id_value::uuid;
  ELSIF v_cafe_value IS NOT NULL
     AND v_cafe_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_cafe_id := v_cafe_value::uuid;
  ELSE
    v_cafe_id := NULL;
  END IF;

  IF v_id_value IS NOT NULL
     AND v_id_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_entity_id := v_id_value::uuid;
  ELSE
    v_entity_id := NULL;
  END IF;

  INSERT INTO public.audit_logs (
    actor_id,
    cafe_id,
    action,
    entity_table,
    entity_id,
    old_data,
    new_data
  )
  VALUES (
    auth.uid(),
    v_cafe_id,
    'admin_' || lower(TG_OP) || '_' || TG_TABLE_NAME,
    TG_TABLE_NAME,
    v_entity_id,
    CASE
      WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD)
      ELSE NULL
    END,
    CASE
      WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW)
      ELSE NULL
    END
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_delete_brand(p_cafe_id uuid, p_confirmation text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_cafe public.cafes%ROWTYPE; v_job public.brand_deletion_jobs%ROWTYPE; v_assets jsonb;
  v_fk record; v_cross_brand boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('brand-delete:' || p_cafe_id::text, 0));
  SELECT * INTO v_job FROM public.brand_deletion_jobs WHERE cafe_id = p_cafe_id;
  IF FOUND THEN
    IF p_confirmation IS DISTINCT FROM v_job.slug THEN RAISE EXCEPTION 'CONFIRMATION_MISMATCH'; END IF;
    RETURN jsonb_build_object('cafeId', p_cafe_id, 'slug', v_job.slug);
  END IF;
  SELECT * INTO v_cafe FROM public.cafes WHERE id = p_cafe_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('cafeId', p_cafe_id, 'slug', NULL); END IF;
  IF p_confirmation IS DISTINCT FROM v_cafe.slug::text THEN RAISE EXCEPTION 'CONFIRMATION_MISMATCH'; END IF;

  -- Fail closed if legacy inconsistent foreign keys could touch a different tenant.
  FOR v_fk IN
    SELECT child.relname AS child_table, parent.relname AS parent_table,
      string_agg(format('child.%I = parent.%I', ca.attname, pa.attname), ' AND ' ORDER BY cols.ord) AS join_sql
    FROM pg_catalog.pg_constraint fk
    JOIN pg_catalog.pg_class child ON child.oid=fk.conrelid
    JOIN pg_catalog.pg_class parent ON parent.oid=fk.confrelid
    CROSS JOIN LATERAL unnest(fk.conkey,fk.confkey) WITH ORDINALITY AS cols(child_col,parent_col,ord)
    JOIN pg_catalog.pg_attribute ca ON ca.attrelid=child.oid AND ca.attnum=cols.child_col
    JOIN pg_catalog.pg_attribute pa ON pa.attrelid=parent.oid AND pa.attnum=cols.parent_col
    WHERE fk.contype='f' AND child.relnamespace='public'::regnamespace AND parent.relnamespace='public'::regnamespace
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=child.oid AND attname='cafe_id' AND NOT attisdropped)
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=parent.oid AND attname='cafe_id' AND NOT attisdropped)
    GROUP BY fk.oid,child.relname,parent.relname
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I child JOIN public.%I parent ON %s WHERE parent.cafe_id=$1 AND child.cafe_id IS DISTINCT FROM $1)',
      v_fk.child_table,v_fk.parent_table,v_fk.join_sql) INTO v_cross_brand USING p_cafe_id;
    IF v_cross_brand THEN RAISE EXCEPTION 'CROSS_BRAND_REFERENCE'; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.order_items i JOIN public.orders o ON o.id=i.order_id
      JOIN public.menu_products p ON p.id=i.product_id WHERE p.cafe_id=p_cafe_id AND o.cafe_id<>p_cafe_id)
    OR EXISTS (SELECT 1 FROM public.experience_reward_items i JOIN public.experience_reward_submissions s ON s.id=i.submission_id
      JOIN public.menu_products p ON p.id=i.product_id WHERE p.cafe_id=p_cafe_id AND s.cafe_id<>p_cafe_id) THEN
    RAISE EXCEPTION 'CROSS_BRAND_REFERENCE';
  END IF;

  -- Ownership comes from exact tenant path segments, never caller-supplied paths.
  SELECT coalesce(jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'path', o.name)), '[]'::jsonb)
  INTO v_assets FROM storage.objects o
  WHERE split_part(o.name, '/', 1) = p_cafe_id::text
     OR EXISTS (SELECT 1 FROM public.platform_finance_entries f
       WHERE f.cafe_id = p_cafe_id AND f.receipt_bucket = 'platform-finance-receipts'
         AND o.bucket_id = f.receipt_bucket AND o.name = f.receipt_path
         AND split_part(o.name, '/', 1) = f.id::text);
  INSERT INTO public.brand_deletion_jobs(cafe_id, slug, assets, requested_by)
  VALUES (p_cafe_id, v_cafe.slug::text, v_assets, auth.uid());
  PERFORM set_config('branda.deleting_cafe', p_cafe_id::text, true);

  -- Child-first order follows the deployed FK graph; no shared Auth/profile deletion.
  DELETE FROM public.loyalty_card_events WHERE cafe_id = p_cafe_id;
  DELETE FROM public.wallet_apple_registrations WHERE cafe_id = p_cafe_id;
  DELETE FROM public.wallet_passes WHERE cafe_id = p_cafe_id;
  DELETE FROM public.wallet_notification_jobs WHERE cafe_id = p_cafe_id;
  DELETE FROM public.phone_verification_challenges WHERE cafe_id = p_cafe_id;
  DELETE FROM public.menu_import_items WHERE cafe_id = p_cafe_id;
  DELETE FROM public.representative_activity_logs WHERE cafe_id = p_cafe_id;
  DELETE FROM public.notifications WHERE cafe_id = p_cafe_id;
  DELETE FROM public.cafe_cashier_activity_logs WHERE cafe_id = p_cafe_id;
  DELETE FROM public.cafe_cashier_sessions WHERE cafe_id = p_cafe_id;
  DELETE FROM public.table_wars_v2_daily_player_stats WHERE cafe_id = p_cafe_id;
  DELETE FROM public.platform_finance_entries WHERE cafe_id = p_cafe_id;
  DELETE FROM public.table_wars_moves WHERE cafe_id = p_cafe_id;
  DELETE FROM public.table_wars_v2_units WHERE cafe_id = p_cafe_id;
  DELETE FROM public.loyalty_scan_requests WHERE cafe_id = p_cafe_id;
  DELETE FROM public.cafe_visit_events WHERE cafe_id = p_cafe_id;
  DELETE FROM public.customer_phone_auth_conflicts WHERE cafe_id = p_cafe_id;
  DELETE FROM public.experience_reward_items WHERE submission_id IN (SELECT id FROM public.experience_reward_submissions WHERE cafe_id = p_cafe_id);
  DELETE FROM public.table_wars_v2_events WHERE cafe_id = p_cafe_id;
  DELETE FROM public.cafe_printer_settings WHERE cafe_id = p_cafe_id;
  DELETE FROM public.pager_message_attempts WHERE cafe_id = p_cafe_id;
  DELETE FROM public.experience_submissions WHERE cafe_id = p_cafe_id;
  DELETE FROM public.customer_reward_redemptions WHERE cafe_id = p_cafe_id;
  DELETE FROM public.subscription_profit_distributions WHERE cafe_id = p_cafe_id;
  DELETE FROM public.table_wars_rewards WHERE cafe_id = p_cafe_id;
  DELETE FROM public.cafe_custom_identity WHERE cafe_id = p_cafe_id;
  DELETE FROM public.cafe_loyalty_experience WHERE cafe_id = p_cafe_id;
  DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE cafe_id = p_cafe_id);
  DELETE FROM public.experience_proof_links WHERE cafe_id = p_cafe_id;
  DELETE FROM public.loyalty_activity_events WHERE cafe_id = p_cafe_id;
  DELETE FROM public.loyalty_accounts WHERE cafe_id = p_cafe_id;
  DELETE FROM public.customer_phone_verifications WHERE cafe_id = p_cafe_id;
  DELETE FROM public.loyalty_transactions WHERE cafe_id = p_cafe_id;
  DELETE FROM public.event_tickets WHERE cafe_id = p_cafe_id;
  DELETE FROM public.representative_commissions WHERE referral_id IN (SELECT id FROM public.brand_referrals WHERE cafe_id = p_cafe_id)
    OR subscription_id IN (SELECT id FROM public.subscriptions WHERE cafe_id = p_cafe_id)
    OR payment_request_id IN (SELECT id FROM public.subscription_payment_requests WHERE cafe_id = p_cafe_id);
  DELETE FROM public.domain_orders WHERE cafe_id = p_cafe_id;
  DELETE FROM public.offer_media WHERE cafe_id = p_cafe_id;
  DELETE FROM public.loyalty_rewards WHERE cafe_id = p_cafe_id;
  DELETE FROM public.cafe_settings WHERE cafe_id = p_cafe_id;
  DELETE FROM public.event_ticket_settings WHERE cafe_id = p_cafe_id;
  DELETE FROM public.menu_categories WHERE cafe_id = p_cafe_id;
  DELETE FROM public.cafe_members WHERE cafe_id = p_cafe_id;
  DELETE FROM public.table_wars_v2_players WHERE cafe_id = p_cafe_id;
  DELETE FROM public.brand_support_tickets WHERE cafe_id = p_cafe_id;
  DELETE FROM public.cafe_loyalty_programs WHERE cafe_id = p_cafe_id;
  DELETE FROM public.brand_feature_overrides WHERE cafe_id = p_cafe_id;
  DELETE FROM public.platform_home_promotions WHERE cafe_id = p_cafe_id;
  DELETE FROM public.cafe_operation_events WHERE cafe_id = p_cafe_id;
  DELETE FROM public.home_banners WHERE cafe_id = p_cafe_id;
  DELETE FROM public.audit_logs WHERE cafe_id = p_cafe_id;
  DELETE FROM public.loyalty_rules WHERE cafe_id = p_cafe_id;
  DELETE FROM public.customer_activity_events WHERE cafe_id = p_cafe_id;
  DELETE FROM public.customer_phone_otp_requests WHERE cafe_id = p_cafe_id;
  DELETE FROM public.product_media WHERE cafe_id = p_cafe_id;
  DELETE FROM public.subscription_payment_events WHERE subscription_id IN (SELECT id FROM public.subscriptions WHERE cafe_id = p_cafe_id);
  DELETE FROM public.loyalty_cards WHERE cafe_id = p_cafe_id;
  DELETE FROM public.menu_import_jobs WHERE cafe_id = p_cafe_id;
  DELETE FROM public.table_wars_players WHERE cafe_id = p_cafe_id;
  DELETE FROM public.table_wars_cells WHERE cafe_id = p_cafe_id;
  DELETE FROM public.table_wars_v2_cells WHERE cafe_id = p_cafe_id;
  DELETE FROM public.experience_reward_submissions WHERE cafe_id = p_cafe_id;
  DELETE FROM public.pager_message_jobs WHERE cafe_id = p_cafe_id;
  DELETE FROM public.experience_campaigns WHERE cafe_id = p_cafe_id;
  DELETE FROM public.customer_reward_instances WHERE cafe_id = p_cafe_id;
  DELETE FROM public.orders WHERE cafe_id = p_cafe_id;
  DELETE FROM public.brand_referrals WHERE cafe_id = p_cafe_id;
  DELETE FROM public.subscription_payment_requests WHERE cafe_id = p_cafe_id;
  DELETE FROM public.offers WHERE cafe_id = p_cafe_id;
  DELETE FROM public.menu_products WHERE cafe_id = p_cafe_id;
  DELETE FROM public.table_wars_tables WHERE cafe_id = p_cafe_id;
  DELETE FROM public.table_wars_rounds WHERE cafe_id = p_cafe_id;
  DELETE FROM public.table_wars_v2_rounds WHERE cafe_id = p_cafe_id;
  DELETE FROM public.cafe_cashiers WHERE cafe_id = p_cafe_id;
  DELETE FROM public.customer_profiles WHERE cafe_id = p_cafe_id;
  DELETE FROM public.pager_orders WHERE cafe_id = p_cafe_id;
  DELETE FROM public.branches WHERE cafe_id = p_cafe_id;
  DELETE FROM public.subscriptions WHERE cafe_id = p_cafe_id;
  DELETE FROM public.cafes WHERE id = p_cafe_id;
  PERFORM set_config('branda.deleting_cafe', '', true);
  -- Minimal administrative evidence; no deleted brand names or private snapshots.
  INSERT INTO public.audit_logs(actor_id, action, entity_table, entity_id)
  VALUES (auth.uid(), 'admin_permanent_delete_brand', 'cafes', p_cafe_id);
  RETURN jsonb_build_object('cafeId', p_cafe_id, 'slug', v_cafe.slug::text);
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_delete_brand(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_brand(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_brand_deletion_assets(p_cafe_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_assets jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.brand_deletion_jobs WHERE cafe_id=p_cafe_id) THEN RETURN '[]'::jsonb; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('bucket',o.bucket_id,'path',o.name)), '[]'::jsonb)
    INTO v_assets FROM storage.objects o
    WHERE split_part(o.name,'/',1)=p_cafe_id::text
      OR EXISTS (SELECT 1 FROM public.brand_deletion_jobs j, jsonb_array_elements(j.assets) a
        WHERE j.cafe_id=p_cafe_id AND o.bucket_id=a->>'bucket' AND o.name=a->>'path');
  RETURN v_assets;
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_brand_deletion_assets(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_brand_deletion_assets(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_finish_brand_deletion(p_cafe_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('brand-delete:' || p_cafe_id::text,0));
  IF jsonb_array_length(public.admin_brand_deletion_assets(p_cafe_id)) > 0 THEN RETURN false; END IF;
  DELETE FROM public.brand_deletion_jobs WHERE cafe_id=p_cafe_id;
  RETURN true;
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_finish_brand_deletion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_finish_brand_deletion(uuid) TO authenticated;
