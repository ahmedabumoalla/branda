-- MIND hospital split: forward-only copy, original catalog/history retained
-- Auth identity is separately provisioned through Admin Auth, never a SQL password
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $guard$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('mind-hospital-split-20261114',0));
  IF NOT EXISTS(SELECT 1 FROM public.cafes WHERE id='3813425d-db13-4d30-8b82-9d41aad12e36' AND slug='brand-8ad185ee82e3' AND owner_user_id='8ad185ee-82e3-4dd1-9c52-5a566e609f57') THEN RAISE EXCEPTION 'Source identity changed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.branches WHERE id='5924245c-a143-4170-8699-79fd3c279d92' AND cafe_id='3813425d-db13-4d30-8b82-9d41aad12e36' AND menu_slug='hospital') THEN RAISE EXCEPTION 'Source branch changed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id='cc64b0de-b4d5-494d-b406-045f6821cef1' AND raw_app_meta_data->>'admin_hospital_split'='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef') THEN RAISE EXCEPTION 'Provisioned hospital identity required'; END IF;
  IF EXISTS(SELECT 1 FROM public.cafes WHERE slug='mind-hospital' OR id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef') THEN RAISE EXCEPTION 'Destination already exists; do not repeat copy'; END IF;
  IF (SELECT count(*) FROM public.menu_products WHERE branch_id='5924245c-a143-4170-8699-79fd3c279d92' AND deleted_at IS NULL)<>111 THEN RAISE EXCEPTION 'Review current hospital catalog before split'; END IF;
  IF EXISTS(SELECT 1 FROM public.bf_documents WHERE cafe_id='3813425d-db13-4d30-8b82-9d41aad12e36') THEN RAISE EXCEPTION 'Source accounting history needs explicit branch reconciliation'; END IF;
END $guard$;

CREATE TEMP TABLE mind_source_rows ON COMMIT DROP AS
SELECT 'products'::text kind,id,to_jsonb(p) payload FROM public.menu_products p WHERE cafe_id='3813425d-db13-4d30-8b82-9d41aad12e36'
UNION ALL SELECT 'categories',id,to_jsonb(c) FROM public.menu_categories c WHERE cafe_id='3813425d-db13-4d30-8b82-9d41aad12e36'
UNION ALL SELECT 'branches',id,to_jsonb(b) FROM public.branches b WHERE cafe_id='3813425d-db13-4d30-8b82-9d41aad12e36';
CREATE TEMP TABLE mind_source_owner ON COMMIT DROP AS SELECT to_jsonb(p) profile,(SELECT to_jsonb(c) FROM public.cafes c WHERE c.id='3813425d-db13-4d30-8b82-9d41aad12e36') cafe FROM public.profiles p WHERE p.id='8ad185ee-82e3-4dd1-9c52-5a566e609f57';

UPDATE public.profiles p SET full_name=src.full_name,email=src.email,phone=src.phone,role='cafe_owner',status='active'
FROM public.profiles src WHERE p.id='cc64b0de-b4d5-494d-b406-045f6821cef1' AND src.id='8ad185ee-82e3-4dd1-9c52-5a566e609f57';
INSERT INTO public.cafes(id,slug,name,name_en,owner_user_id,status,is_public,business_category)
VALUES('ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef','mind-hospital','مايند','MIND Café & Bakery','cc64b0de-b4d5-494d-b406-045f6821cef1','active',true,'cafes_coffee');
INSERT INTO public.cafe_members(cafe_id,user_id,role,permissions) VALUES('ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef','cc64b0de-b4d5-494d-b406-045f6821cef1','owner','{}');
-- Existing zero-price technical administration plan, its standard one-month term
-- No payment, invoice, welcome message or subscription payment request is fabricated
INSERT INTO public.subscriptions(id,cafe_id,plan_id,status,amount_sar,started_at,expires_at,plan_name_snapshot,duration_unit,duration_count,activation_source)
SELECT '4fc964e8-2434-43b8-9ec1-01dc8ef7c0e7','ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef',id,'active',0,now(),now()+interval '1 month',name,'month',1,'admin_hospital_split' FROM public.platform_plans WHERE id='plan-0f39875b' AND active AND price_sar=0;
INSERT INTO public.brand_feature_overrides(cafe_id,feature_id,enabled)
SELECT 'ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef',feature,enabled FROM (VALUES('menu',true),('finance',true),('settings',true),('pager',false),('marketing_campaigns',false),('offers',false),('loyalty',false)) f(feature,enabled);
SELECT brand_finance_private.seed('ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef');
SELECT brand_finance_private.inventory_catalog_seed('ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef');

INSERT INTO public.cafe_settings SELECT (jsonb_populate_record(NULL::public.cafe_settings,to_jsonb(s)||jsonb_build_object('cafe_id','ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef','logo_storage_path',NULL,'logo_url','https://barndaksa.com/menu-art/dabab/dabab-hospital-logo-v1.webp','description','مايند كافيه ومخبز فرع المستشفى','custom_domain',NULL,'domain_status',NULL,'purchased_domain',NULL,'purchased_domain_status',NULL,'created_at',now(),'updated_at',now()))).* FROM public.cafe_settings s WHERE cafe_id='3813425d-db13-4d30-8b82-9d41aad12e36';
INSERT INTO public.branches SELECT (jsonb_populate_record(NULL::public.branches,to_jsonb(b)||jsonb_build_object('id','f79f8cf8-9241-4c70-a9a7-b1810e163db3','cafe_id','ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef','name','مايند المستشفى','is_primary',true,'active',true,'deleted_at',NULL,'created_at',now(),'updated_at',now()))).* FROM public.branches b WHERE id='5924245c-a143-4170-8699-79fd3c279d92';

INSERT INTO public.menu_categories SELECT (jsonb_populate_record(NULL::public.menu_categories,
  replace(to_jsonb(c)::text,'3813425d-db13-4d30-8b82-9d41aad12e36','ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef')::jsonb||jsonb_build_object('id',md5('mind-hospital-category:'||c.id::text)::uuid,'branch_id','f79f8cf8-9241-4c70-a9a7-b1810e163db3'))).* FROM public.menu_categories c WHERE branch_id='5924245c-a143-4170-8699-79fd3c279d92' AND cafe_id='3813425d-db13-4d30-8b82-9d41aad12e36';
INSERT INTO public.menu_products SELECT (jsonb_populate_record(NULL::public.menu_products,
  replace(to_jsonb(p)::text,'3813425d-db13-4d30-8b82-9d41aad12e36','ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef')::jsonb||jsonb_build_object('id',md5('mind-hospital-product:'||p.id::text)::uuid,'branch_id','f79f8cf8-9241-4c70-a9a7-b1810e163db3','category_id',CASE WHEN p.category_id IS NULL THEN NULL ELSE md5('mind-hospital-category:'||p.category_id::text)::uuid END,'created_by','cc64b0de-b4d5-494d-b406-045f6821cef1','updated_by','cc64b0de-b4d5-494d-b406-045f6821cef1'))).* FROM public.menu_products p WHERE branch_id='5924245c-a143-4170-8699-79fd3c279d92' AND cafe_id='3813425d-db13-4d30-8b82-9d41aad12e36';

-- Copy tax configuration if one exists; never fabricate a tax registration number or opening balances
UPDATE public.bf_settings n SET vat_rate=o.vat_rate,tax_inclusive=o.tax_inclusive FROM public.bf_settings o WHERE n.cafe_id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef' AND o.cafe_id='3813425d-db13-4d30-8b82-9d41aad12e36';

DO $verify$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.subscriptions WHERE id='4fc964e8-2434-43b8-9ec1-01dc8ef7c0e7' AND expires_at>now()) THEN RAISE EXCEPTION 'Technical activation missing'; END IF;
  IF (SELECT count(*) FROM public.menu_products WHERE cafe_id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef' AND deleted_at IS NULL)<>111 THEN RAISE EXCEPTION 'Incomplete hospital copy'; END IF;
  IF EXISTS(SELECT 1 FROM mind_source_rows s LEFT JOIN LATERAL(SELECT to_jsonb(p) payload FROM public.menu_products p WHERE s.kind='products' AND p.id=s.id UNION ALL SELECT to_jsonb(c) FROM public.menu_categories c WHERE s.kind='categories' AND c.id=s.id UNION ALL SELECT to_jsonb(b) FROM public.branches b WHERE s.kind='branches' AND b.id=s.id) actual ON true WHERE s.payload IS DISTINCT FROM actual.payload) THEN RAISE EXCEPTION 'Source data changed'; END IF;
  IF EXISTS(SELECT 1 FROM mind_source_owner s WHERE s.profile IS DISTINCT FROM (SELECT to_jsonb(p) FROM public.profiles p WHERE id='8ad185ee-82e3-4dd1-9c52-5a566e609f57') OR s.cafe IS DISTINCT FROM (SELECT to_jsonb(c) FROM public.cafes c WHERE id='3813425d-db13-4d30-8b82-9d41aad12e36')) THEN RAISE EXCEPTION 'Source owner changed'; END IF;
END $verify$;
-- The old public hospital QR is redirected by the release; retiring its branch is a separate post-deploy step
