BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE public.category_default_plans DROP CONSTRAINT category_default_plans_category_check;
ALTER TABLE public.category_default_plans ADD CONSTRAINT category_default_plans_category_check
CHECK(category_id IN ('cafes_coffee','restaurants','hair_salons','events_conferences','gifts_flowers','butcher_shops','retail_stores')) NOT VALID;
ALTER TABLE public.category_default_plans VALIDATE CONSTRAINT category_default_plans_category_check;
DO $change$
DECLARE signature text; source text; old_guard text; new_guard text;
BEGIN
  FOREACH signature IN ARRAY ARRAY['public.admin_prepare_brand_account(uuid,uuid,jsonb,text,text)','gift_commerce_private.can_manage(uuid)','public.gift_store_config(text)','public.storage_menu_product_is_public(uuid,uuid)'] LOOP
    source:=pg_get_functiondef(signature::regprocedure);
    IF signature LIKE 'public.admin_prepare%' THEN
      old_guard:='NOT IN (''cafes_coffee'',''restaurants'',''hair_salons'',''gifts_flowers'',''butcher_shops'')';
      new_guard:='NOT IN (''cafes_coffee'',''restaurants'',''hair_salons'',''gifts_flowers'',''butcher_shops'',''retail_stores'')';
    ELSE
      old_guard:='business_category IN (''gifts_flowers'',''clothing_stores'')';
      new_guard:='business_category IN (''gifts_flowers'',''clothing_stores'',''retail_stores'')';
    END IF;
    IF (length(source)-length(replace(source,old_guard,'')))/length(old_guard)<>1 THEN
      RAISE EXCEPTION 'Unexpected category guard in %',signature;
    END IF;
    EXECUTE replace(source,old_guard,new_guard);
  END LOOP;
  IF has_function_privilege('anon','public.admin_prepare_brand_account(uuid,uuid,jsonb,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.admin_prepare_brand_account(uuid,uuid,jsonb,text,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.admin_prepare_brand_account(uuid,uuid,jsonb,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected onboarding grants';
  END IF;
END $change$;
COMMIT;
