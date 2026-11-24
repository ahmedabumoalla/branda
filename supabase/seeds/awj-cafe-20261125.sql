-- AWJ CAFE | First catalog activation after the menu assets are published.
-- Source: supplied AWJ printed menu and lib/menu/awj-catalog.json. Prices in SYP.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TEMP TABLE awj_categories_seed (
 id uuid PRIMARY KEY, name text NOT NULL, description text NOT NULL, sort_order integer NOT NULL
) ON COMMIT DROP;
INSERT INTO awj_categories_seed VALUES
('9c99d8cb-037e-5172-aae8-f68d491c7300','المشروبات الساخنة','Hot coffee & tea',1),
('c6a01392-3b33-5d47-acf2-c7257aba99a6','المشروبات الباردة','Cold drinks',2),
('3ede9a37-f982-5030-a667-7dad8033ab1a','الموهيتو','Mojito',3),
('19fe9065-f52e-5dc6-b021-b0eaeab975ae','الآيس كريم','Ice cream',4),
('8291339d-b1d8-5aaf-bd4e-5f038766c792','الحلويات والكيك','Cakes & desserts',5);

CREATE TEMP TABLE awj_products_seed (
 id uuid PRIMARY KEY, category_id uuid NOT NULL, name text NOT NULL, description text NOT NULL,
 price numeric NOT NULL, price_options numeric[] NOT NULL, catalog_kind text NOT NULL, image_url text, sort_order integer NOT NULL
) ON COMMIT DROP;
INSERT INTO awj_products_seed VALUES
('56215527-2971-57a5-8b70-ba55a0f6b716','9c99d8cb-037e-5172-aae8-f68d491c7300','إسبريسو روبوستا','Robusta Espresso',60,ARRAY[]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/robusta.webp',1),
('ad918caa-41e0-5ce3-8ef5-5f9a3fc4b6e8','9c99d8cb-037e-5172-aae8-f68d491c7300','شاي أحمر','Black Tea',60,ARRAY[]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/black-tea.webp',2),
('9cc90ae3-fbc1-5315-a2ec-b566938b8c3a','9c99d8cb-037e-5172-aae8-f68d491c7300','شاي أخضر','Green Tea',60,ARRAY[]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/green-tea.webp',3),
('3efa71af-c762-50a9-b78c-c90ab13c179a','9c99d8cb-037e-5172-aae8-f68d491c7300','زهورات','Herbal Tea',60,ARRAY[]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/herbal.webp',4),
('a50967df-d4ba-5d30-9392-6625c94499c8','9c99d8cb-037e-5172-aae8-f68d491c7300','كمون وليمون','Cumin & Lemon',60,ARRAY[]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/cumin-lemon.webp',5),
('73692022-0c25-5f72-8305-e612b9c41ca9','9c99d8cb-037e-5172-aae8-f68d491c7300','إسبريسو أرابيكا مختص','Specialty Arabica Espresso',150,ARRAY[]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/arabica.webp',6),
('355eb397-063d-583d-91d0-12b96cdc4963','9c99d8cb-037e-5172-aae8-f68d491c7300','لاتيه','Latte',150,ARRAY[]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/latte.webp',7),
('255fb380-d59f-5ee4-98e7-d317121bdcdf','9c99d8cb-037e-5172-aae8-f68d491c7300','سبانش لاتيه','Spanish Latte',150,ARRAY[]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/spanish.webp',8),
('357a7fc8-c76e-5198-bfd4-d713361431b1','9c99d8cb-037e-5172-aae8-f68d491c7300','هوت شوكليت','Hot Chocolate',150,ARRAY[]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/hot-chocolate.webp',9),
('99a34733-c887-5902-8c81-3f3de6ebe789','9c99d8cb-037e-5172-aae8-f68d491c7300','قهوة تركية','Turkish Coffee',150,ARRAY[]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/turkish.webp',10),
('413cdc66-660b-5ab0-988f-641e36418ed7','9c99d8cb-037e-5172-aae8-f68d491c7300','قهوة عربية','Arabic Coffee',150,ARRAY[]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/arabic.webp',11),
('4b8447b4-6a30-546e-9a61-7324eb94da4f','9c99d8cb-037e-5172-aae8-f68d491c7300','نسكافيه غولد','Nescafé Gold',80,ARRAY[]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/nescafe.webp',12),
('5c48d8a1-8b34-5cbf-b16a-e9459d75bc6b','9c99d8cb-037e-5172-aae8-f68d491c7300','كاراميل لاتيه','Caramel Latte',200,ARRAY[]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/caramel.webp',13),
('f5f5c016-bde2-5afe-962b-bfc42d6a0605','9c99d8cb-037e-5172-aae8-f68d491c7300','فرنش فانيلا','French Vanilla',200,ARRAY[]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/hot-vanilla.webp',14),
('5bde50fb-1637-55d3-84af-f9d0dd0dfa0c','c6a01392-3b33-5d47-acf2-c7257aba99a6','آيس موكا','Iced Mocha',250,ARRAY[250,300]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/iced-mocha.webp',15),
('cbe33852-a322-5e1c-b3d4-e1eddebae85d','c6a01392-3b33-5d47-acf2-c7257aba99a6','آيس كاراميل لاتيه','Iced Caramel Latte',250,ARRAY[250,300]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/iced-caramel.webp',16),
('c476b26e-6cfb-5c13-b9bb-ba9ee6e032b9','c6a01392-3b33-5d47-acf2-c7257aba99a6','آيس سبانش لاتيه','Iced Spanish Latte',250,ARRAY[250,300]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/iced-spanish.webp',17),
('5a0d5a63-cd8e-57f9-886a-206c5b387d11','c6a01392-3b33-5d47-acf2-c7257aba99a6','فرابيه','Frappe',250,ARRAY[250,300]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/frappe.webp',18),
('9927a5d1-b5ad-59d9-b3cd-0e0f52d18ec9','c6a01392-3b33-5d47-acf2-c7257aba99a6','ميلك شيك شوكولا','Chocolate Milkshake',250,ARRAY[250,300]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/milkshake.webp',19),
('01158a92-81d9-5780-8e52-ceebfa7f2406','c6a01392-3b33-5d47-acf2-c7257aba99a6','ماتشا','Matcha',200,ARRAY[200,250]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/matcha.webp',20),
('0d90fc64-b707-5955-ae69-37d2b565d46f','c6a01392-3b33-5d47-acf2-c7257aba99a6','فرنش فانيلا','French Vanilla',200,ARRAY[200,250]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/cold-vanilla.webp',21),
('63bcabe9-211c-5996-a770-66b9cc7e59c1','c6a01392-3b33-5d47-acf2-c7257aba99a6','آيس لاتيه','Iced Latte',200,ARRAY[200,250]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/iced-latte.webp',22),
('a421e043-ccf9-5bd5-bd1d-cd2ad89c68de','c6a01392-3b33-5d47-acf2-c7257aba99a6','كركديه','Hibiscus',200,ARRAY[200,250]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/hibiscus.webp',23),
('c4256fee-8dea-5b26-aa4f-4804be8c9d83','c6a01392-3b33-5d47-acf2-c7257aba99a6','عصير طاقة أوج','AWJ Energy Drink',200,ARRAY[200,250]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/energy.webp',24),
('0c5572ce-a69f-5422-b36d-105afd653211','c6a01392-3b33-5d47-acf2-c7257aba99a6','آيس تي ليمون','Lemon Iced Tea',150,ARRAY[150,200]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/iced-lemon.webp',25),
('dfa33114-e40a-5bbf-a700-9ddf4468e161','c6a01392-3b33-5d47-acf2-c7257aba99a6','آيس تي دراق','Peach Iced Tea',150,ARRAY[150,200]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/iced-peach.webp',26),
('84a0dff6-34c3-54d1-9efd-6c778b6cf7c1','c6a01392-3b33-5d47-acf2-c7257aba99a6','أمريكانو','Americano',150,ARRAY[]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/americano.webp',27),
('7fb779ae-7424-55a1-a850-3ce661aeef71','c6a01392-3b33-5d47-acf2-c7257aba99a6','قهوة اليوم','Coffee of the Day',250,ARRAY[]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/day-coffee.webp',28),
('638f9499-2662-5564-a4be-f38d88501b99','c6a01392-3b33-5d47-acf2-c7257aba99a6','V60','V60 Specialty Coffee',450,ARRAY[]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/v60.webp',29),
('4991a7f1-2e45-556f-9038-8e1d8e9fbbc0','3ede9a37-f982-5030-a667-7dad8033ab1a','ليمون','Lemon',200,ARRAY[200,250]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/lemon.webp',30),
('ea3e2fef-b029-58eb-b4f6-1dce412db40f','3ede9a37-f982-5030-a667-7dad8033ab1a','نعناع','Mint',200,ARRAY[200,250]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/mint.webp',31),
('a87bc40e-8168-59e9-9e5b-090b426bd666','3ede9a37-f982-5030-a667-7dad8033ab1a','ليمون ونعناع','Lemon & Mint',200,ARRAY[200,250]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/lemon-mint.webp',32),
('ed4350d2-9196-5b27-a10b-b5a909e81b21','3ede9a37-f982-5030-a667-7dad8033ab1a','أناناس','Pineapple',200,ARRAY[200,250]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/pineapple.webp',33),
('a8ec94a3-dce6-57fc-9f80-c81bb34f412e','3ede9a37-f982-5030-a667-7dad8033ab1a','توت وليمون','Berry & Lemon',200,ARRAY[200,250]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/berry-lemon.webp',34),
('385f597c-a9b8-576f-a353-a85683f44b13','3ede9a37-f982-5030-a667-7dad8033ab1a','بطيخ','Watermelon',200,ARRAY[200,250]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/watermelon.webp',35),
('71418ad7-f08c-56ae-a12e-dfd264b9923b','3ede9a37-f982-5030-a667-7dad8033ab1a','فراولة','Strawberry',200,ARRAY[200,250]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/strawberry.webp',36),
('266f03af-808a-5a49-83f5-bd0e2d1c2725','3ede9a37-f982-5030-a667-7dad8033ab1a','تفاح أخضر','Green Apple',200,ARRAY[200,250]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/green-apple.webp',37),
('3afd7de6-384b-5222-aecb-55dad01bd1d9','3ede9a37-f982-5030-a667-7dad8033ab1a','توت أسود','Blackberry',200,ARRAY[200,250]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/blackberry.webp',38),
('79d3b77c-d43a-5260-af18-eaf732ff651c','3ede9a37-f982-5030-a667-7dad8033ab1a','توت أحمر','Raspberry',200,ARRAY[200,250]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/raspberry.webp',39),
('31cba9dd-96b1-50d9-9377-f02754c9b031','3ede9a37-f982-5030-a667-7dad8033ab1a','توت أزرق','Blueberry',200,ARRAY[200,250]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/blueberry.webp',40),
('168c40fc-851d-5925-a465-b4b5445a61eb','3ede9a37-f982-5030-a667-7dad8033ab1a','بلو كوراساو','Blue Curaçao',200,ARRAY[200,250]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/blue-curacao.webp',41),
('b99d58b1-5019-50b0-9f83-f0324344508e','3ede9a37-f982-5030-a667-7dad8033ab1a','مانجو','Mango',200,ARRAY[200,250]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/mango.webp',42),
('a3f51324-503c-529f-a20d-1251b6570b17','3ede9a37-f982-5030-a667-7dad8033ab1a','برتقال','Orange',200,ARRAY[200,250]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/orange.webp',43),
('54bc8dc3-0c51-52fd-b60b-fa63c1894a4f','3ede9a37-f982-5030-a667-7dad8033ab1a','كيوي','Kiwi',200,ARRAY[200,250]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/kiwi.webp',44),
('10c92e4c-7508-5d3d-a12d-f3a77478e051','3ede9a37-f982-5030-a667-7dad8033ab1a','رمان','Pomegranate',200,ARRAY[200,250]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/pomegranate.webp',45),
('b4273fdf-7f11-5c78-8559-2fb2d3df2770','19fe9065-f52e-5dc6-b021-b0eaeab975ae','بوظة حليب','Milk Ice Cream',360,ARRAY[]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/milk-ice.webp',46),
('fcddbbc3-19a7-582d-a39c-84ac6a7a4c61','19fe9065-f52e-5dc6-b021-b0eaeab975ae','بوظة كرز','Cherry Ice',300,ARRAY[]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/cherry-ice.webp',47),
('f8a6ea2a-2718-58ad-9ee8-f8af7cc88071','19fe9065-f52e-5dc6-b021-b0eaeab975ae','قمع','Cone',30,ARRAY[30,80]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/cone.webp',48),
('73bf7109-3f0c-5e3f-8518-393d370f8bfc','19fe9065-f52e-5dc6-b021-b0eaeab975ae','كوب','Cup',60,ARRAY[60,90]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/cup.webp',49),
('f284d9e1-b128-581e-adc2-fec26c43d712','8291339d-b1d8-5aaf-bd4e-5f038766c792','سينابون','Cinnamon Roll',100,ARRAY[]::numeric[],'product','https://barndaksa.com/brand-assets/awj/products/cinnamon.webp',50);

DO $preflight$
BEGIN
  PERFORM 1 FROM public.cafes WHERE id = '5dbdc67a-5a76-4781-8bcc-eb8245930b94'
    AND slug = 'brand-0c1c249cb74b' AND name = 'AWJ CAFE'
    AND business_category = 'cafes_coffee' AND phone_country = 'SY'
    AND status::text IN ('active','published') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AWJ tenant identity or status changed'; END IF;
  IF EXISTS (SELECT 1 FROM public.branches WHERE cafe_id = '5dbdc67a-5a76-4781-8bcc-eb8245930b94' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'AWJ branch catalog changed; review branch placement before activation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.menu_categories c JOIN awj_categories_seed s ON c.id = s.id
    WHERE c.cafe_id <> '5dbdc67a-5a76-4781-8bcc-eb8245930b94' OR c.branch_id IS NOT NULL OR c.deleted_at IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM public.menu_products p JOIN awj_products_seed s ON p.id = s.id
    WHERE p.cafe_id <> '5dbdc67a-5a76-4781-8bcc-eb8245930b94' OR p.branch_id IS NOT NULL OR p.deleted_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Seed identity collision or retired record; no rows changed'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.menu_categories c JOIN awj_categories_seed s ON trim(c.name) = s.name
    WHERE c.cafe_id = '5dbdc67a-5a76-4781-8bcc-eb8245930b94' AND c.deleted_at IS NULL AND c.id <> s.id
  ) OR EXISTS (
    SELECT 1 FROM public.menu_products p JOIN awj_products_seed s ON trim(p.name) = s.name AND p.category_id = s.category_id
    WHERE p.cafe_id = '5dbdc67a-5a76-4781-8bcc-eb8245930b94' AND p.deleted_at IS NULL AND p.id <> s.id
  ) THEN RAISE EXCEPTION 'An existing catalog item needs explicit reconciliation; no duplicate created'; END IF;
END
$preflight$;

INSERT INTO public.menu_categories (id,cafe_id,name,description,sort_order,visible,featured,branch_id)
SELECT id,'5dbdc67a-5a76-4781-8bcc-eb8245930b94'::uuid,name,description,sort_order,true,false,NULL
FROM awj_categories_seed ON CONFLICT (id) DO NOTHING;

INSERT INTO public.menu_products
 (id,cafe_id,category_id,name,description,price,price_options,catalog_kind,image_url,sort_order,available,branch_id)
SELECT id,'5dbdc67a-5a76-4781-8bcc-eb8245930b94'::uuid,category_id,name,description,price,price_options,catalog_kind,image_url,sort_order,true,NULL
FROM awj_products_seed ON CONFLICT (id) DO NOTHING;

DO $postflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM awj_categories_seed s LEFT JOIN public.menu_categories c ON c.id=s.id
    WHERE c.id IS NULL OR c.cafe_id <> '5dbdc67a-5a76-4781-8bcc-eb8245930b94' OR c.branch_id IS NOT NULL OR c.deleted_at IS NOT NULL
      OR c.name IS DISTINCT FROM s.name OR c.description IS DISTINCT FROM s.description
      OR c.sort_order IS DISTINCT FROM s.sort_order OR c.visible IS DISTINCT FROM true
  ) OR EXISTS (
    SELECT 1 FROM awj_products_seed s LEFT JOIN public.menu_products p ON p.id=s.id
    WHERE p.id IS NULL OR p.cafe_id <> '5dbdc67a-5a76-4781-8bcc-eb8245930b94' OR p.branch_id IS NOT NULL OR p.deleted_at IS NOT NULL
      OR p.name IS DISTINCT FROM s.name OR p.description IS DISTINCT FROM s.description
      OR p.price_options IS DISTINCT FROM s.price_options OR p.price IS DISTINCT FROM s.price OR p.category_id IS DISTINCT FROM s.category_id
      OR p.catalog_kind IS DISTINCT FROM s.catalog_kind OR p.image_url IS DISTINCT FROM s.image_url
      OR p.sort_order IS DISTINCT FROM s.sort_order OR p.available IS DISTINCT FROM true
  ) THEN RAISE EXCEPTION 'Catalog differs from reviewed seed; transaction rolled back without overwriting existing data'; END IF;
END
$postflight$;
COMMIT;
