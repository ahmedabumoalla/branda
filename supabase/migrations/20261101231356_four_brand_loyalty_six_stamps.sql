-- User-authorized six stamps / ten percent reward for these four existing brands
-- Their current subscription periods, customer cards and unrelated identities are preserved
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $identity$
BEGIN
  IF (SELECT count(*) FROM public.cafes c JOIN (VALUES
    ('7f28312f-4df2-4a1d-bedd-34b73f415307'::uuid,'brand-c138e578b03c'),
    ('318df308-e39f-4ef2-a0fd-05c126720d82'::uuid,'brand-bd0eeac9e747'),
    ('6d01bd09-c7e0-4307-8cfb-93171d69d9db'::uuid,'brand-5e0a98e765d2'),
    ('a3c65c66-d5de-41e2-a2c7-0cc451a92bf3'::uuid,'brand-f9e223695585')
  ) expected(id,slug) ON c.id=expected.id AND c.slug=expected.slug
  WHERE c.status IN ('active','published') AND c.deleted_at IS NULL) <> 4 THEN
    RAISE EXCEPTION 'Four brand identities changed; review before activation';
  END IF;
END $identity$;

INSERT INTO public.cafe_loyalty_programs
  (cafe_id,enabled,purchases_required,reward_product_id,reward_name,
   card_title,card_subtitle,stamp_label,terms,wallet_enabled,apple_wallet_enabled,google_wallet_enabled,card_design)
SELECT c.id,true,6,null,'خصم 10%',
  'بطاقة ولاء '||c.name,'كل زيارة تقرّب مكافأتك','الأختام','اجمع 6 أختام واحصل على خصم 10%',
  true,true,true,jsonb_build_object('layoutVersion','brand-stamps-v1','stampStyle',CASE WHEN c.id='318df308-e39f-4ef2-a0fd-05c126720d82'::uuid THEN 'brand' ELSE 'ceramic' END)
FROM public.cafes c
WHERE c.id IN ('7f28312f-4df2-4a1d-bedd-34b73f415307','318df308-e39f-4ef2-a0fd-05c126720d82',
  '6d01bd09-c7e0-4307-8cfb-93171d69d9db','a3c65c66-d5de-41e2-a2c7-0cc451a92bf3')
ON CONFLICT(cafe_id) DO UPDATE SET
  enabled=true,purchases_required=6,reward_product_id=null,reward_name=excluded.reward_name,
  terms=excluded.terms,wallet_enabled=true,apple_wallet_enabled=true,google_wallet_enabled=true,updated_at=now()
WHERE (cafe_loyalty_programs.enabled,cafe_loyalty_programs.purchases_required,
  cafe_loyalty_programs.reward_product_id,cafe_loyalty_programs.reward_name,cafe_loyalty_programs.terms,
  cafe_loyalty_programs.wallet_enabled,cafe_loyalty_programs.apple_wallet_enabled,cafe_loyalty_programs.google_wallet_enabled)
  IS DISTINCT FROM (true,6,null::uuid,excluded.reward_name,excluded.terms,true,true,true);

-- The actual redemption type is stored separately from the card's display label
-- New rows use the established schema default of thirty days; existing validity is retained
INSERT INTO public.cafe_loyalty_experience(cafe_id,reward_kind,reward_discount_percent,nearby_message)
SELECT c.id,'discount',10,'قريب منّا؟ يسعدنا نشوفك في '||c.name
FROM public.cafes c
WHERE c.id IN ('7f28312f-4df2-4a1d-bedd-34b73f415307','318df308-e39f-4ef2-a0fd-05c126720d82',
  '6d01bd09-c7e0-4307-8cfb-93171d69d9db','a3c65c66-d5de-41e2-a2c7-0cc451a92bf3')
ON CONFLICT(cafe_id) DO UPDATE SET reward_kind='discount',reward_discount_percent=10,updated_at=now()
WHERE cafe_loyalty_experience.reward_kind IS DISTINCT FROM 'discount'
  OR cafe_loyalty_experience.reward_discount_percent IS DISTINCT FROM 10;

COMMIT;
