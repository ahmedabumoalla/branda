-- Enable men's barbershops for new admin-created brands; preserve existing event accounts and plans.
BEGIN;
ALTER TABLE public.category_default_plans DROP CONSTRAINT category_default_plans_category_check;
ALTER TABLE public.category_default_plans ADD CONSTRAINT category_default_plans_category_check
 CHECK (category_id IN ('cafes_coffee','restaurants','hair_salons','events_conferences'));

CREATE OR REPLACE FUNCTION public.admin_prepare_brand_account(p_id uuid,p_actor uuid,p_draft jsonb,p_fingerprint text,p_ciphertext text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v brand_onboarding_private.accounts%ROWTYPE; v_plan text;
BEGIN
  PERFORM brand_onboarding_private.require_admin(p_actor);
  PERFORM pg_advisory_xact_lock(hashtextextended('admin-brand-create:'||p_id::text,0));
  SELECT * INTO v FROM brand_onboarding_private.accounts WHERE id=p_id FOR UPDATE;
  IF FOUND THEN
    IF v.created_by<>p_actor OR v.fingerprint<>p_fingerprint THEN RAISE EXCEPTION 'REQUEST_CHANGED'; END IF;
    RETURN jsonb_build_object('cafeId',v.cafe_id,'proof',v.proof,'ciphertext',v.password_ciphertext);
  END IF;
  IF p_draft->>'slug' !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(p_draft->>'slug') NOT BETWEEN 3 AND 60
    OR (coalesce(p_draft->>'phone','')<>'' AND p_draft->>'phone' !~ '^9665[0-9]{8}$') OR length(coalesce(p_draft->>'brandName','')) NOT BETWEEN 2 AND 120
    OR length(coalesce(p_draft->>'ownerName',''))>120
    OR coalesce(p_draft->>'category','') NOT IN ('cafes_coffee','restaurants','hair_salons')
    OR length(coalesce(p_ciphertext,'')) NOT BETWEEN 40 AND 1000 OR length(coalesce(p_fingerprint,''))<>64 THEN
    RAISE EXCEPTION 'INVALID_ACCOUNT_DATA';
  END IF;
  IF EXISTS(SELECT 1 FROM public.cafes WHERE slug=p_draft->>'slug') THEN RAISE EXCEPTION 'SLUG_EXISTS'; END IF;
  IF coalesce(p_draft->>'phone','')<>'' AND (EXISTS(SELECT 1 FROM auth.users WHERE regexp_replace(coalesce(phone,''),'[^0-9]','','g')=p_draft->>'phone')
    OR EXISTS(SELECT 1 FROM public.profiles WHERE regexp_replace(coalesce(phone,''),'[^0-9]','','g')=p_draft->>'phone')) THEN
    RAISE EXCEPTION 'PHONE_EXISTS';
  END IF;
  SELECT p.id INTO v_plan FROM public.platform_plans p
    WHERE p.id=coalesce((SELECT default_plan_id FROM public.category_default_plans WHERE category_id=p_draft->>'category'),
      (SELECT default_plan_id FROM public.platform_settings WHERE id='default'))
    AND p.active AND p.price_sar=0 AND p.trial_days>0;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRIAL_PLAN_UNAVAILABLE'; END IF;
  INSERT INTO brand_onboarding_private.accounts(id,created_by,draft,fingerprint,password_ciphertext)
    VALUES(p_id,p_actor,p_draft||jsonb_build_object('planId',v_plan),p_fingerprint,p_ciphertext) RETURNING * INTO v;
  RETURN jsonb_build_object('cafeId',NULL,'proof',v.proof,'ciphertext',v.password_ciphertext);
END $$;

REVOKE ALL ON FUNCTION public.admin_prepare_brand_account(uuid,uuid,jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_prepare_brand_account(uuid,uuid,jsonb,text,text) TO service_role;
COMMIT;
