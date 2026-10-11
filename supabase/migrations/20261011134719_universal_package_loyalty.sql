-- Share the approved loyalty engine across subscribed brands without changing
-- menus, existing balances, reward promises, subscription assignments or grants
BEGIN;

-- Patch the current definitions so the intervening staff permission guards and
-- audit/idempotency fixes remain intact. Every targeted predicate must exist
DO $$
DECLARE item record; signature regprocedure; definition text; before_definition text;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('issue_rast_loyalty_card(uuid)', 'c.slug = ''rast''', 'platform_access_private.service_enabled(c.id,''loyalty'')'),
    ('apply_rast_loyalty_stamp(uuid,text,uuid,uuid,uuid)', 'c.slug = ''rast''', 'platform_access_private.service_enabled(c.id,''loyalty'')'),
    ('scan_loyalty_stamp(text,text,uuid)', 'b.slug = ''rast''', 'platform_access_private.service_enabled(b.id,''loyalty'')'),
    ('redeem_loyalty_reward(text,text,uuid)', 'b.slug = ''rast''', 'platform_access_private.service_enabled(b.id,''loyalty'')'),
    ('preview_loyalty_card(text,text)', 'b.slug=''rast''', 'platform_access_private.service_enabled(b.id,''loyalty'')'),
    ('preview_loyalty_reward(text,text)', 'b.slug=''rast''', 'platform_access_private.service_enabled(b.id,''loyalty'')'),
    ('execute_loyalty_audited_operation(text,text,uuid,text)', 'b.slug=''rast''', 'platform_access_private.service_enabled(b.id,''loyalty'')'),
    ('set_rast_loyalty_settings(uuid,jsonb,jsonb)', 'slug = ''rast''', 'platform_access_private.service_enabled(p_cafe_id,''loyalty'')'),
    ('enqueue_rast_wallet_announcement(uuid,text,text)', 'slug=''rast''', 'platform_access_private.service_enabled(p_cafe_id,''loyalty'')'),
    ('queue_rast_wallet_update()', 'slug = ''rast''', 'platform_access_private.service_enabled(v_cafe_id,''loyalty'')'),
    ('snapshot_rast_loyalty_reward()', ' AND slug = ''rast''', ''),
    ('preserve_rast_reward_terms()', ' AND slug=''rast''', ''),
    ('guard_rast_loyalty_ledger()', 'slug=''rast'' AND ', ''),
    ('record_brand_engagement(text,text,uuid,text)', ' OR p_slug<>''rast''', '')
  ) AS patches(fn,old_predicate,new_predicate) LOOP
    signature:=to_regprocedure('public.'||item.fn);
    IF signature IS NULL THEN RAISE EXCEPTION 'Missing loyalty function %',item.fn; END IF;
    before_definition:=pg_get_functiondef(signature);
    definition:=replace(before_definition,item.old_predicate,item.new_predicate);
    IF definition=before_definition THEN RAISE EXCEPTION 'Unexpected loyalty function definition %',item.fn; END IF;
    EXECUTE definition;
  END LOOP;
END $$;

ALTER POLICY loyalty_experience_owner ON public.cafe_loyalty_experience
  USING (public.has_cafe_permission(cafe_id,'loyalty') OR public.is_platform_admin())
  WITH CHECK (
    (public.has_cafe_permission(cafe_id,'loyalty') OR public.is_platform_admin())
    AND EXISTS(SELECT 1 FROM public.cafes c WHERE c.id=cafe_id AND c.deleted_at IS NULL)
  );
-- The existing restrictive package_service_access policy and write trigger remain

CREATE OR REPLACE FUNCTION public.claim_customer_phone_otp_dispatch(p_phone_normalized text,p_provider_instance text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_request_id uuid; v_slug text;
BEGIN
  IF p_phone_normalized IS NULL OR p_phone_normalized !~ '^9665[0-9]{8}$'
    OR p_provider_instance IS NULL OR char_length(p_provider_instance) NOT BETWEEN 1 AND 200 THEN RETURN NULL; END IF;
  SELECT r.id,c.slug::text INTO v_request_id,v_slug
  FROM public.customer_phone_otp_requests r JOIN public.cafes c ON c.id=r.cafe_id
  WHERE r.phone_normalized=p_phone_normalized AND r.provider_instance=p_provider_instance
    AND r.status='pending' AND r.provider_dispatched_at IS NULL AND r.created_at>now()-interval '2 minutes'
    AND c.deleted_at IS NULL AND c.status='active' AND c.is_public
    AND platform_access_private.service_enabled(c.id,'loyalty')
    AND EXISTS(SELECT 1 FROM public.cafe_loyalty_programs p WHERE p.cafe_id=c.id AND p.enabled)
  ORDER BY r.created_at DESC,r.id DESC LIMIT 1 FOR UPDATE OF r SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.customer_phone_otp_requests SET provider_dispatched_at=now() WHERE id=v_request_id;
  RETURN v_slug;
END $$;
REVOKE ALL ON FUNCTION public.claim_customer_phone_otp_dispatch(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_customer_phone_otp_dispatch(text,text) TO service_role;

-- All brands now use verified enrollment and the audited cashier scanner
CREATE OR REPLACE FUNCTION public.issue_loyalty_card_for_customer(p_cafe_slug text)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Verified phone enrollment required' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION public.issue_loyalty_card_for_customer(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.record_loyalty_card_operation(
  p_cafe_id uuid,p_card_code text,p_invoice_barcode text,p_invoice_amount numeric,p_operation text,p_cashier_session_token text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Use authenticated loyalty cashier scanner' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION public.record_loyalty_card_operation(uuid,text,text,numeric,text,text) FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
