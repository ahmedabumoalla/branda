BEGIN;
-- A merchant-editable editorial placement for a published gift, with no monetary promotion.
INSERT INTO public.offers (id, cafe_id, title, description, offer_type, status, placement, visible_in_cafe, target_type, offer_rules)
SELECT 'c349485e-7823-5d81-9f63-98126a9b6e12'::uuid, c.id, 'هدية للمولود', 'اكتشف سلة الصغير المدلل وأرفق معها كلمات الترحيب بالمولود',
       'عرض مخصص', 'active', 'بانر الكوفي', true, 'products',
       jsonb_build_object('rastKind','announcement','selectedProductIds',jsonb_build_array(p.id::text),'appliesToAllProducts',false)
FROM public.cafes c
JOIN public.menu_products p ON p.cafe_id = c.id AND p.id = '05a633f1-412d-5bb6-abbf-66827cef7633'::uuid
WHERE c.id = '98fd33d5-522d-46e7-adeb-34b04a665f4f'::uuid AND c.slug = 'brand-5fbb1397e4c4'
  AND c.deleted_at IS NULL AND p.available AND p.deleted_at IS NULL
ON CONFLICT (id) DO NOTHING;
COMMIT;
