-- pgTAP: storage helper functions + path ownership
BEGIN;
SELECT plan(9);

SELECT ok(
  public.storage_object_path_is_safe('10000001-0001-4001-8001-000000000007/photo.webp'),
  'safe avatar path allowed'
);

SELECT ok(
  NOT public.storage_object_path_is_safe('../evil.webp'),
  'path traversal blocked in storage_object_path_is_safe'
);

SELECT ok(
  public.storage_cafe_is_public('20000001-0001-4001-8001-000000000001'::uuid),
  'storage_cafe_is_public true for active public cafe_a'
);

SELECT ok(
  NOT public.storage_cafe_is_public('20000001-0001-4001-8001-000000000099'::uuid),
  'storage_cafe_is_public false for unknown cafe'
);

SELECT ok(
  public.storage_menu_product_is_public(
    '20000001-0001-4001-8001-000000000001'::uuid,
    '50000001-0001-4001-8001-000000000001'::uuid
  ),
  'available pickup product is public for storage SELECT policy'
);

SELECT ok(
  NOT public.storage_menu_product_is_public(
    '20000001-0001-4001-8001-000000000001'::uuid,
    '50000001-0001-4001-8001-000000000002'::uuid
  ),
  'product without available_for_pickup is not public for storage'
);

SELECT ok(
  public.storage_menu_category_is_public(
    '20000001-0001-4001-8001-000000000001'::uuid,
    '40000001-0001-4001-8001-000000000001'::uuid
  ),
  'visible category path is public for storage SELECT policy'
);

PERFORM set_config('request.jwt.claim.sub', '10000001-0001-4001-8001-000000000007', true);
PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT ok(
  public.get_customer_profile_id('20000001-0001-4001-8001-000000000001'::uuid)
    = '30000001-0001-4001-8001-000000000001'::uuid,
  'customer_a profile resolved in cafe_a'
);

PERFORM set_config('request.jwt.claim.sub', '10000001-0001-4001-8001-000000000002', true);
SET LOCAL ROLE authenticated;

SELECT ok(
  public.storage_can_write_cafe_asset('20000001-0001-4001-8001-000000000001'::uuid, 'menu'),
  'owner_a can write cafe menu storage assets'
);

SELECT * FROM finish();
ROLLBACK;
