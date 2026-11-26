BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Extend deployed checks in place, retaining every existing category (including legacy tenants).
DO $catalog$
DECLARE
  item text[];
  prior text;
BEGIN
  FOREACH item SLICE 1 IN ARRAY ARRAY[
    ARRAY['public.cafes','cafes_business_category_check',$new$business_category IN ('car_washes','other')$new$],
    ARRAY['public.category_default_plans','category_default_plans_category_check',$new$category_id = 'car_washes'$new$]
  ] LOOP
    EXECUTE format('LOCK TABLE %s IN ACCESS EXCLUSIVE MODE', item[1]::regclass);
    SELECT pg_get_expr(conbin,conrelid) INTO STRICT prior
    FROM pg_constraint WHERE conrelid = item[1]::regclass AND conname = item[2] AND contype = 'c';
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I, ADD CONSTRAINT %I CHECK ((%s) OR (%s)) NOT VALID',
      item[1]::regclass, item[2], item[2], prior, item[3]);
    EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', item[1]::regclass, item[2]);
  END LOOP;
END $catalog$;

ALTER TABLE public.cafes
  ADD COLUMN business_category_custom_name text,
  ADD CONSTRAINT cafes_business_category_custom_name_check CHECK (
    CASE WHEN business_category = 'other' THEN
      business_category_custom_name IS NOT NULL
      AND char_length(business_category_custom_name) BETWEEN 1 AND 80
      AND business_category_custom_name !~ '^[[:space:]]|[[:space:]]$'
    ELSE business_category_custom_name IS NULL END
  ) NOT VALID;
ALTER TABLE public.cafes VALIDATE CONSTRAINT cafes_business_category_custom_name_check;

-- Older verified drafts have no category key. Explicit unknown or malformed values fail closed.
CREATE FUNCTION owner_onboarding_private.signup_category(draft jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $body$
DECLARE
  category text := draft->>'category';
  label text;
BEGIN
  IF jsonb_typeof(draft) IS DISTINCT FROM 'object' THEN RETURN NULL; END IF;
  IF NOT (draft ? 'category') THEN RETURN 'cafes_coffee'; END IF;
  IF category IN ('cafes_coffee','restaurants','butcher_shops','hair_salons','gifts_flowers','retail_stores','car_washes') THEN
    RETURN category;
  END IF;
  IF category = 'other' AND jsonb_typeof(draft->'customCategoryName') = 'string' THEN
    label := regexp_replace(draft->>'customCategoryName', '^[[:space:]]+|[[:space:]]+$', '', 'g');
    IF char_length(label) BETWEEN 1 AND 80 THEN RETURN category; END IF;
  END IF;
  RETURN NULL;
END $body$;
REVOKE ALL ON FUNCTION owner_onboarding_private.signup_category(jsonb) FROM PUBLIC, anon, authenticated;

-- Preserve the deployed OTP, country, subscription, admin and Auth routing logic.
DO $update$
DECLARE
  edit text[];
  body text;
BEGIN
  FOREACH edit SLICE 1 IN ARRAY ARRAY[
    ARRAY['public.begin_owner_onboarding(uuid,text,text,text,text,jsonb)',
      $old$  PERFORM pg_advisory_xact_lock(hashtextextended('owner_signup_send',0));$old$,
      $new$  IF owner_onboarding_private.signup_category(p_draft) IS NULL THEN RETURN '{"ok":false}'::jsonb; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('owner_signup_send',0));$new$],
    ARRAY['public.handle_new_user()',
      $old$  SELECT plan.* INTO v_plan FROM public.platform_plans plan$old$,
      $new$  IF owner_onboarding_private.signup_category(challenge.draft) IS NULL THEN
    RAISE EXCEPTION 'Invalid signup category' USING ERRCODE='22023';
  END IF;
  SELECT plan.* INTO v_plan FROM public.platform_plans plan$new$],
    ARRAY['public.handle_new_user()',
      $old$referral_started_at,business_category)$old$,
      $new$referral_started_at,business_category,business_category_custom_name)$new$],
    ARRAY['public.handle_new_user()',
      $old$ELSE NULL END,'cafes_coffee') RETURNING id INTO v_cafe_id;$old$,
      $new$ELSE NULL END,owner_onboarding_private.signup_category(challenge.draft),
      CASE WHEN challenge.draft->>'category'='other' THEN
        regexp_replace(challenge.draft->>'customCategoryName','^[[:space:]]+|[[:space:]]+$','','g')
      END) RETURNING id INTO v_cafe_id;$new$],
    ARRAY['public.admin_prepare_brand_account(uuid,uuid,jsonb,text,text)',
      $old$NOT IN ('cafes_coffee','restaurants','hair_salons','gifts_flowers','butcher_shops','retail_stores')$old$,
      $new$NOT IN ('cafes_coffee','restaurants','hair_salons','gifts_flowers','butcher_shops','retail_stores','car_washes')$new$]
  ] LOOP
    body := pg_get_functiondef(edit[1]::regprocedure);
    IF (length(body) - length(replace(body, edit[2], ''))) / length(edit[2]) <> 1 THEN
      RAISE EXCEPTION 'Unexpected signup category anchor in %', edit[1];
    END IF;
    EXECUTE replace(body, edit[2], edit[3]);
  END LOOP;
END $update$;

COMMIT;
