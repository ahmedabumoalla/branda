-- Rebrand the existing tenant while keeping its public slug, product IDs and loyalty history.
DO $vibe_yard$
DECLARE
  cafe_id_target constant uuid := 'f91cbe65-1921-412b-98cc-451cccf2a86a';
  previous_logo constant text := 'f91cbe65-1921-412b-98cc-451cccf2a86a/french-identity/official-logo-d05e311ad279.png';
  new_logo constant text := 'f91cbe65-1921-412b-98cc-451cccf2a86a/vibe-yard/crowned-e30c8faa8c23.webp';
  item record;
  old_path text;
  new_path text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cafes WHERE id = cafe_id_target) THEN RETURN; END IF;
  PERFORM 1 FROM public.cafes WHERE id = cafe_id_target AND slug = 'brand-10620d3a586c'
    AND deleted_at IS NULL AND name IN ('مقهى الركن الفرنسي', 'مقهى فايب يارد') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vibe Yard tenant identity changed'; END IF;
  UPDATE public.cafes SET name = 'مقهى فايب يارد', name_en = 'Vibe Yard Café'
    WHERE id = cafe_id_target AND (name, name_en) IS DISTINCT FROM ('مقهى فايب يارد', 'Vibe Yard Café');
  UPDATE public.cafe_settings SET logo_storage_path = new_logo, logo_url = NULL WHERE cafe_id = cafe_id_target AND logo_storage_path = previous_logo;
  UPDATE public.cafe_custom_identity SET logo_storage_path = new_logo, logo_url = NULL WHERE cafe_id = cafe_id_target AND logo_storage_path = previous_logo;
  IF NOT EXISTS (SELECT 1 FROM public.cafe_settings WHERE cafe_id = cafe_id_target AND logo_storage_path = new_logo)
     OR NOT EXISTS (SELECT 1 FROM public.cafe_custom_identity WHERE cafe_id = cafe_id_target AND logo_storage_path = new_logo)
     THEN RAISE EXCEPTION 'Vibe Yard logo source changed'; END IF;
  UPDATE public.cafe_loyalty_programs SET card_title = 'بطاقة مقهى فايب يارد' WHERE cafe_id = cafe_id_target AND card_title = 'بطاقة الركن الفرنسي';
  UPDATE public.cafe_loyalty_experience SET nearby_message = replace(nearby_message, 'مقهى الركن الفرنسي', 'مقهى فايب يارد')
    WHERE cafe_id = cafe_id_target AND nearby_message LIKE '%مقهى الركن الفرنسي%';

  FOR item IN SELECT * FROM (VALUES
      ('67f01442-089e-4883-87d7-b9147a59d9c7'::uuid, 'refresh-20261023-cappuccino-ade369b85df5.webp', 'vibe-yard-cappuccino-762bdc6d2c24.webp'),
      ('3dfc3df6-b61c-49b8-93e4-a8c52deb20ac'::uuid, 'refresh-20261023-v60-iced-96a4f25a6985.webp', 'vibe-yard-v60-iced-fe8ccc159675.webp'),
      ('108c4499-a5d5-4ad0-bfe2-8f20ca55f0b0'::uuid, 'refresh-20261023-classic-mojito-dab937f2465b.webp', 'vibe-yard-classic-mojito-5436b6645029.webp'),
      ('3805d950-7709-40ad-9123-470ddcd8b3ed'::uuid, 'refresh-20261023-orange-e38416a28535.webp', 'vibe-yard-orange-51ce59a09234.webp'),
      ('2af71ae8-9f5b-4f6b-ae1f-cb7d9cb64655'::uuid, 'refresh-20261023-mini-pancakes-1ddb4e25f0f1.webp', 'vibe-yard-mini-pancakes-6b866df60e3a.webp'),
      ('aa812730-44a8-4d95-904c-a6c405b1af06'::uuid, 'refresh-20261023-red-tea-5b6c5cd3e647.webp', 'vibe-yard-red-tea-2fb51f65cd04.webp'),
      ('5bb3add8-6805-4263-b092-332a65c2410f'::uuid, '199d0831-e942-45b6-9f0b-1cce20616fb9.webp', 'vibe-yard-cold-hibiscus-e6a8a544b71c.webp'),
      ('a8e4c83e-bd72-4458-aa92-ad6909ee5221'::uuid, 'cb529128-2dd9-4786-9cde-ba16291d908e.webp', 'vibe-yard-shisha-head-11a3c99433ef.webp'),
      ('d3c3891c-5957-4a08-8b16-d7b8a5ad2ee8'::uuid, '0f03ed07-dee0-4556-9c33-0dfe727c1282.webp', 'vibe-yard-turkish-sahlab-9a63cbc97313.webp'),
      ('25982c9e-df63-456d-b62d-7dafd3107bfe'::uuid, 'c06e3e25-8564-4717-a248-ea5c1d33b629.webp', 'vibe-yard-cloud-cake-93d468ab9c85.webp'),
      ('84258dd8-1847-47ac-abbb-ea1da0398e7b'::uuid, 'refresh-20261023-latte-3a2a4ad75358.webp', 'vibe-yard-latte-87d0364d3500.webp'),
      ('ca1c133b-2e38-4eff-98b9-e0eacc5ea9a8'::uuid, 'refresh-20261023-iced-spanish-af40a25b13b6.webp', 'vibe-yard-iced-spanish-7555712817be.webp'),
      ('d5d11ff4-5eb2-4ddd-be8d-c160cd141aa7'::uuid, 'refresh-20261023-blue-ocean-13980529325c.webp', 'vibe-yard-blue-ocean-244c31151074.webp'),
      ('1b71fd8e-e993-4827-b41b-cba9e8b688cb'::uuid, 'refresh-20261023-lemon-mint-2ca7b4b7de03.webp', 'vibe-yard-lemon-mint-ec5790877993.webp'),
      ('44d1374a-6fba-4417-964a-7927bb1e7cae'::uuid, 'refresh-20261023-dolce-pecan-1faaac1297c0.webp', 'vibe-yard-dolce-pecan-fbbbf753e630.webp'),
      ('0c6fefbf-fcca-4fae-97ad-2e62f71086d2'::uuid, 'refresh-20261023-red-teapot-119ee2b2fd15.webp', 'vibe-yard-red-teapot-4b170dce004d.webp'),
      ('ee4aa260-8967-4e36-a08e-9c56f8a10709'::uuid, 'refresh-20261023-espresso-80b59172ca94.webp', 'vibe-yard-espresso-12221ceac0ae.webp'),
      ('b6a19a99-faa2-4842-b2f3-39258a9f8864'::uuid, 'refresh-20261023-iced-latte-09955145eaa7.webp', 'vibe-yard-iced-latte-151c4d3e56e9.webp'),
      ('add94637-cc31-48ce-9295-3684d76f254a'::uuid, 'refresh-20261023-mixed-berry-e39993e619b0.webp', 'vibe-yard-mixed-berry-8b689161eb34.webp'),
      ('904d3216-3a27-4ccf-8954-685d8e0ed401'::uuid, 'refresh-20261023-watermelon-cabd33134217.webp', 'vibe-yard-watermelon-a106885c0676.webp'),
      ('cbb744ac-20b0-4d88-911f-1a2d8e32c5ff'::uuid, 'refresh-20261023-dolce-chocolate-684d5adf7dd6.webp', 'vibe-yard-dolce-chocolate-156759c9aa92.webp'),
      ('81c064a1-39cd-4b50-887e-c87f9a9afe40'::uuid, 'refresh-20261023-green-tea-8327c8ba5774.webp', 'vibe-yard-green-tea-e5f6c2b96a68.webp'),
      ('745953b9-da2e-4e99-aaac-fba0ae19c752'::uuid, 'refresh-20261023-turkish-a8d78702ae0d.webp', 'vibe-yard-turkish-8a5e851c43c3.webp'),
      ('db5ac43d-574a-4868-8a67-b4940269becf'::uuid, 'refresh-20261023-iced-caramel-15c6f3713482.webp', 'vibe-yard-iced-caramel-9ced0dccdbf1.webp'),
      ('951c382a-1c32-45e3-82a7-2750238c33fe'::uuid, 'refresh-20261023-mexican-a16c8c7f5c59.webp', 'vibe-yard-mexican-9304d250eaf8.webp'),
      ('ab768e7f-8498-4b8d-9d12-2da087586310'::uuid, 'refresh-20261023-mango-22bf7b2ab9f8.webp', 'vibe-yard-mango-c1d86398a29c.webp'),
      ('932552e3-5939-4ef7-b930-8ee3c2663368'::uuid, 'refresh-20261023-honey-cake-7d24f0134f8e.webp', 'vibe-yard-honey-cake-996844989bcc.webp'),
      ('de610ffd-0044-488e-b85a-200ef0c513b1'::uuid, 'refresh-20261023-green-teapot-9dc71a88558e.webp', 'vibe-yard-green-teapot-ad9a7cb7cf4f.webp'),
      ('0ce20446-5d82-45cf-826f-c6482a63480e'::uuid, 'refresh-20261023-spanish-4a90d12b7b0a.webp', 'vibe-yard-spanish-7d6773c81c12.webp'),
      ('d9cdbce6-6738-4c10-b80d-28e101a0a051'::uuid, 'refresh-20261023-iced-americano-72da9a7a2885.webp', 'vibe-yard-iced-americano-873b612d39c0.webp'),
      ('63ed69a4-5e87-44ff-ad70-53b33f9cab4a'::uuid, 'refresh-20261023-red-berry-a55f999b400f.webp', 'vibe-yard-red-berry-2f69fb2efa3a.webp'),
      ('f854ae88-96f9-4331-8bb7-1853d0765104'::uuid, 'refresh-20261023-coconut-mango-f26f6316651f.webp', 'vibe-yard-coconut-mango-d942fe675a41.webp'),
      ('855e446c-9ec5-4a21-9334-adabeded7c66'::uuid, 'refresh-20261023-hibiscus-8b157a6b0e52.webp', 'vibe-yard-hibiscus-6cc7b7ac9d90.webp'),
      ('3273e28e-539e-4161-ad29-9d75a2326827'::uuid, 'refresh-20261023-hot-chocolate-4e1ce0db8060.webp', 'vibe-yard-hot-chocolate-bd12f4730af3.webp'),
      ('a1566efc-b49e-4a9b-9774-a2941d7f81ce'::uuid, 'refresh-20261023-iced-white-mocha-21ea2326779e.webp', 'vibe-yard-iced-white-mocha-0a118948d029.webp'),
      ('0e670403-5d53-40dd-8750-ebd0210b5fb4'::uuid, 'refresh-20261023-redbull-mix-79ef0678f1a0.webp', 'vibe-yard-redbull-mix-1018f16b97f9.webp'),
      ('a5ebff08-8939-4074-9508-3a4987afa452'::uuid, 'refresh-20261023-dubai-cake-ebb03e6f061d.webp', 'vibe-yard-dubai-cake-0b3e12fe38fd.webp'),
      ('734440d5-6007-4c9e-a9c8-e080c2781080'::uuid, 'refresh-20261023-cortado-3d35b7c56f1a.webp', 'vibe-yard-cortado-143aa5204630.webp'),
      ('1d0a38f4-0237-4d67-a279-3bc832bee314'::uuid, 'refresh-20261023-iced-mocha-7f5f2f8eeb46.webp', 'vibe-yard-iced-mocha-3cbbc6c4e643.webp'),
      ('0a88d6e6-edd9-4360-b616-3af09e6e94db'::uuid, 'refresh-20261023-macchiato-e174fcfa4191.webp', 'vibe-yard-macchiato-c93f3628e4fb.webp'),
      ('632a2db5-e034-4ed4-a323-367f139266a7'::uuid, 'refresh-20261023-americano-fc39c22c6b87.webp', 'vibe-yard-americano-552b427519e2.webp'),
      ('50e67dcd-554b-4afc-992c-c27e69d2e9da'::uuid, 'refresh-20261023-v60-hot-99d4ec59db8c.webp', 'vibe-yard-v60-hot-919abe7d98d0.webp'),
      ('f4bcc9c3-e0a7-4d89-912a-b93267a8577c'::uuid, 'refresh-20261023-italian-47baf18290b0.webp', 'vibe-yard-italian-1f6a16abbe8f.webp'),
      ('99babcf4-1b06-44df-b64e-696e2e8fb7bf'::uuid, 'refresh-20261023-moussy-flavor-7a6ca4cd73ec.webp', 'vibe-yard-moussy-flavor-05feb14142ec.webp'),
      ('cf22c7b5-2f9c-436d-adf0-b6e7c182d6c5'::uuid, 'refresh-20261023-moussy-special-c434526b950a.webp', 'vibe-yard-moussy-special-adc5ce4697ae.webp')
    ) AS photos(product_id, old_file, new_file)
  LOOP
    old_path := cafe_id_target::text || '/' || item.product_id::text || '/' || item.old_file;
    new_path := cafe_id_target::text || '/' || item.product_id::text || '/' || item.new_file;
    UPDATE public.menu_products p SET image_storage_path = new_path,
      gallery_storage_paths = array_replace(p.gallery_storage_paths, old_path, new_path),
      image_gallery = (SELECT coalesce(jsonb_agg(CASE WHEN v->>'imageAssetId' = old_path AND v->>'assetId' = old_path
          THEN (v - 'imageDataUrl') || jsonb_build_object('assetId', new_path, 'imageAssetId', new_path) ELSE v END ORDER BY ord), p.image_gallery)
          FROM jsonb_array_elements(p.image_gallery) WITH ORDINALITY AS x(v,ord)),
      media = (SELECT coalesce(jsonb_agg(CASE WHEN v->>'assetId' = old_path
          THEN (v - 'url') || jsonb_build_object('assetId', new_path) ELSE v END ORDER BY ord), p.media)
          FROM jsonb_array_elements(p.media) WITH ORDINALITY AS x(v,ord))
    WHERE p.cafe_id = cafe_id_target AND p.id = item.product_id AND p.deleted_at IS NULL AND p.image_storage_path = old_path;
    IF NOT EXISTS (SELECT 1 FROM public.menu_products WHERE cafe_id = cafe_id_target AND id = item.product_id AND deleted_at IS NULL AND image_storage_path = new_path)
      THEN RAISE EXCEPTION 'Vibe Yard product image changed for %', item.product_id; END IF;
  END LOOP;
END;
$vibe_yard$;
