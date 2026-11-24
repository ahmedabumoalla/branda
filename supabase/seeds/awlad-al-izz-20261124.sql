-- LOCAL REVIEW COPY ONLY. Not an automatic migration and not applied remotely.
-- Source: lib/menu/awlad-al-izz-catalog.ts and the owner's 2026-11-24 service list/menu.
-- Owner confirmed IQD; reviewed salon prices are 10000/15000/25000/50000.
-- Requires explicit publication/data activation authorization. Publish the referenced
-- CDN assets first. Existing rows are never overwritten or deleted.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TEMP TABLE awlad_categories_seed (
 id uuid PRIMARY KEY, name text NOT NULL, description text NOT NULL, sort_order integer NOT NULL
) ON COMMIT DROP;
INSERT INTO awlad_categories_seed VALUES
('aeef5901-6ec7-4d77-bac8-569995ac0001'::uuid, 'الحلاقة والعناية', 'خدمات الحلاقة والعناية بالبشرة وبكج العرسان', 1),
('aeef5901-6ec7-4d77-bac8-569995ac0002'::uuid, 'المشروبات الساخنة', 'القهوة والشاي', 2),
('aeef5901-6ec7-4d77-bac8-569995ac0003'::uuid, 'المشروبات الباردة', 'مشروبات باردة وعصائر', 3),
('aeef5901-6ec7-4d77-bac8-569995ac0004'::uuid, 'المعجنات والتسالي', 'معجنات وبسكويت وتسالي', 4),
('aeef5901-6ec7-4d77-bac8-569995ac0005'::uuid, 'خدمات الليزر', '', 5);

CREATE TEMP TABLE awlad_products_seed (
 id uuid PRIMARY KEY, category_id uuid NOT NULL, name text NOT NULL, description text NOT NULL,
 price numeric NOT NULL, catalog_kind text NOT NULL, image_url text, sort_order integer NOT NULL
) ON COMMIT DROP;
INSERT INTO awlad_products_seed VALUES
('aeef5902-6ec7-4d77-bac8-569995ac0001'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0001'::uuid, 'الحلاقة العادية', 'حلاقة الشعر', 10000, 'service', 'https://barndaksa.com/brand-assets/awlad-al-izz/haircut.webp', 1),
('aeef5902-6ec7-4d77-bac8-569995ac0002'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0001'::uuid, 'حلاقة بمواد استخدام واحد', 'حلاقة باستخدام مواد مخصصة للاستخدام مرة واحدة', 15000, 'service', 'https://barndaksa.com/brand-assets/awlad-al-izz/single-use.webp', 2),
('aeef5902-6ec7-4d77-bac8-569995ac0003'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0001'::uuid, 'تنظيف البشرة ١٢ مرحلة', 'تنظيف البشرة بجهاز ١٢ مرحلة ومواد طبية', 25000, 'service', 'https://barndaksa.com/brand-assets/awlad-al-izz/facial.webp', 3),
('aeef5902-6ec7-4d77-bac8-569995ac0004'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0001'::uuid, 'بكج العرسان VIP', 'حلاقة VIP مع تنظيف البشرة والضيافة', 50000, 'service', 'https://barndaksa.com/brand-assets/awlad-al-izz/groom.webp', 4),
('aeef5902-6ec7-4d77-bac8-569995ac0005'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0002'::uuid, 'قهوة تركية وسط', '', 1500, 'product', 'https://barndaksa.com/brand-assets/awlad-al-izz/coffee.webp', 5),
('aeef5902-6ec7-4d77-bac8-569995ac0006'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0002'::uuid, 'قهوة تركية سادة', '', 1500, 'product', 'https://barndaksa.com/brand-assets/awlad-al-izz/coffee.webp', 6),
('aeef5902-6ec7-4d77-bac8-569995ac0007'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0002'::uuid, 'قهوة حلوة', '', 1500, 'product', 'https://barndaksa.com/brand-assets/awlad-al-izz/coffee.webp', 7),
('aeef5902-6ec7-4d77-bac8-569995ac0008'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0002'::uuid, 'شاي', '', 500, 'product', 'https://barndaksa.com/brand-assets/awlad-al-izz/products/black-tea.webp', 8),
('aeef5902-6ec7-4d77-bac8-569995ac0009'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0002'::uuid, 'شاي نعناع', '', 500, 'product', 'https://barndaksa.com/brand-assets/awlad-al-izz/products/mint-tea.webp', 9),
('aeef5902-6ec7-4d77-bac8-569995ac0010'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0002'::uuid, 'شاي كرك', '', 1500, 'product', 'https://barndaksa.com/brand-assets/awlad-al-izz/products/karak.webp', 10),
('aeef5902-6ec7-4d77-bac8-569995ac0011'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0002'::uuid, 'نومي بصرة', '', 500, 'product', 'https://barndaksa.com/brand-assets/awlad-al-izz/products/black-lime.webp', 11),
('aeef5902-6ec7-4d77-bac8-569995ac0012'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0003'::uuid, 'تايكر', '', 1250, 'product', 'https://barndaksa.com/brand-assets/awlad-al-izz/products/energy.webp', 12),
('aeef5902-6ec7-4d77-bac8-569995ac0013'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0003'::uuid, 'تايكر مكسيكي', '', 1500, 'product', 'https://barndaksa.com/brand-assets/awlad-al-izz/products/mexican-energy.webp', 13),
('aeef5902-6ec7-4d77-bac8-569995ac0014'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0003'::uuid, 'K9', '', 500, 'product', 'https://barndaksa.com/brand-assets/awlad-al-izz/products/k9.webp', 14),
('aeef5902-6ec7-4d77-bac8-569995ac0015'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0003'::uuid, 'عصير أورنجال', '', 750, 'product', 'https://barndaksa.com/brand-assets/awlad-al-izz/products/orange.webp', 15),
('aeef5902-6ec7-4d77-bac8-569995ac0016'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0003'::uuid, 'سينالكو', '', 500, 'product', 'https://barndaksa.com/brand-assets/awlad-al-izz/products/orange-soda.webp', 16),
('aeef5902-6ec7-4d77-bac8-569995ac0017'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0003'::uuid, 'بيبسي', '', 500, 'product', 'https://barndaksa.com/brand-assets/awlad-al-izz/products/cola.webp', 17),
('aeef5902-6ec7-4d77-bac8-569995ac0018'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0003'::uuid, 'سفن', '', 500, 'product', 'https://barndaksa.com/brand-assets/awlad-al-izz/products/lemon-lime.webp', 18),
('aeef5902-6ec7-4d77-bac8-569995ac0019'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0003'::uuid, 'ليمون', '', 500, 'product', 'https://barndaksa.com/brand-assets/awlad-al-izz/cold-drinks.webp', 19),
('aeef5902-6ec7-4d77-bac8-569995ac0020'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0004'::uuid, 'باب الآغا', '', 500, 'product', 'https://barndaksa.com/brand-assets/awlad-al-izz/products/baba-al-agha.webp', 20),
('aeef5902-6ec7-4d77-bac8-569995ac0021'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0004'::uuid, 'بسكويت أوريو', '', 500, 'product', 'https://barndaksa.com/brand-assets/awlad-al-izz/products/sandwich-biscuits.webp', 21),
('aeef5902-6ec7-4d77-bac8-569995ac0022'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0004'::uuid, 'نستله VIP', '', 500, 'product', 'https://barndaksa.com/brand-assets/awlad-al-izz/products/wafer.webp', 22),
('aeef5902-6ec7-4d77-bac8-569995ac0023'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0004'::uuid, 'بوب كيك', '', 500, 'product', 'https://barndaksa.com/brand-assets/awlad-al-izz/products/pop-cake.webp', 23),
('aeef5902-6ec7-4d77-bac8-569995ac0024'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0004'::uuid, 'كرواسون', '', 500, 'product', 'https://barndaksa.com/brand-assets/awlad-al-izz/bakery.webp', 24),
('aeef5902-6ec7-4d77-bac8-569995ac0025'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0004'::uuid, 'ميني كيك', '', 250, 'product', 'https://barndaksa.com/brand-assets/awlad-al-izz/products/mini-cake.webp', 25),
('aeef5902-6ec7-4d77-bac8-569995ac0026'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0004'::uuid, 'بسكويت', '', 500, 'product', 'https://barndaksa.com/brand-assets/awlad-al-izz/products/biscuits.webp', 26),
('aeef5902-6ec7-4d77-bac8-569995ac0027'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0004'::uuid, 'شيبس ليز', '', 500, 'product', 'https://barndaksa.com/brand-assets/awlad-al-izz/products/potato-chips.webp', 27),
('aeef5902-6ec7-4d77-bac8-569995ac0028'::uuid, 'aeef5901-6ec7-4d77-bac8-569995ac0004'::uuid, 'دوريتوس', '', 500, 'product', 'https://barndaksa.com/brand-assets/awlad-al-izz/products/tortilla-chips.webp', 28);

DO $preflight$
BEGIN
  PERFORM 1 FROM public.cafes WHERE id = 'dfa5934b-a097-4fcd-bc5f-2fc8b974e545'
    AND slug = 'brand-7060952bf681' AND name = 'أولاد العز'
    AND business_category = 'hair_salons' AND phone_country = 'IQ'
    AND status::text IN ('active','published') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Awlad tenant identity or status changed'; END IF;
  IF EXISTS (SELECT 1 FROM public.branches WHERE cafe_id = 'dfa5934b-a097-4fcd-bc5f-2fc8b974e545' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Awlad branch catalog changed; review branch placement before activation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.menu_categories c JOIN awlad_categories_seed s ON c.id = s.id
    WHERE c.cafe_id <> 'dfa5934b-a097-4fcd-bc5f-2fc8b974e545' OR c.branch_id IS NOT NULL OR c.deleted_at IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM public.menu_products p JOIN awlad_products_seed s ON p.id = s.id
    WHERE p.cafe_id <> 'dfa5934b-a097-4fcd-bc5f-2fc8b974e545' OR p.branch_id IS NOT NULL OR p.deleted_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Seed identity collision or retired record; no rows changed'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.menu_categories c JOIN awlad_categories_seed s ON trim(c.name) = s.name
    WHERE c.cafe_id = 'dfa5934b-a097-4fcd-bc5f-2fc8b974e545' AND c.deleted_at IS NULL AND c.id <> s.id
  ) OR EXISTS (
    SELECT 1 FROM public.menu_products p JOIN awlad_products_seed s ON trim(p.name) = s.name
    WHERE p.cafe_id = 'dfa5934b-a097-4fcd-bc5f-2fc8b974e545' AND p.deleted_at IS NULL AND p.id <> s.id
  ) THEN RAISE EXCEPTION 'An existing catalog item needs explicit reconciliation; no duplicate created'; END IF;
END
$preflight$;

INSERT INTO public.menu_categories (id,cafe_id,name,description,sort_order,visible,featured,branch_id)
SELECT id,'dfa5934b-a097-4fcd-bc5f-2fc8b974e545'::uuid,name,description,sort_order,true,false,NULL
FROM awlad_categories_seed ON CONFLICT (id) DO NOTHING;

INSERT INTO public.menu_products
 (id,cafe_id,category_id,name,description,price,catalog_kind,image_url,sort_order,available,branch_id)
SELECT id,'dfa5934b-a097-4fcd-bc5f-2fc8b974e545'::uuid,category_id,name,description,price,catalog_kind,image_url,sort_order,true,NULL
FROM awlad_products_seed ON CONFLICT (id) DO NOTHING;

DO $postflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM awlad_categories_seed s LEFT JOIN public.menu_categories c ON c.id=s.id
    WHERE c.id IS NULL OR c.cafe_id <> 'dfa5934b-a097-4fcd-bc5f-2fc8b974e545' OR c.branch_id IS NOT NULL OR c.deleted_at IS NOT NULL
      OR c.name IS DISTINCT FROM s.name OR c.description IS DISTINCT FROM s.description
      OR c.sort_order IS DISTINCT FROM s.sort_order OR c.visible IS DISTINCT FROM true
  ) OR EXISTS (
    SELECT 1 FROM awlad_products_seed s LEFT JOIN public.menu_products p ON p.id=s.id
    WHERE p.id IS NULL OR p.cafe_id <> 'dfa5934b-a097-4fcd-bc5f-2fc8b974e545' OR p.branch_id IS NOT NULL OR p.deleted_at IS NOT NULL
      OR p.name IS DISTINCT FROM s.name OR p.description IS DISTINCT FROM s.description
      OR p.price IS DISTINCT FROM s.price OR p.category_id IS DISTINCT FROM s.category_id
      OR p.catalog_kind IS DISTINCT FROM s.catalog_kind OR p.image_url IS DISTINCT FROM s.image_url
      OR p.sort_order IS DISTINCT FROM s.sort_order OR p.available IS DISTINCT FROM true
  ) THEN RAISE EXCEPTION 'Catalog differs from reviewed seed; transaction rolled back without overwriting existing data'; END IF;
END
$postflight$;
COMMIT;
