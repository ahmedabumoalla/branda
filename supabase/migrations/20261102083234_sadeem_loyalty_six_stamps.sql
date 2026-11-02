-- Explicit owner approval: six stamps earn a ten percent discount
-- Catalog, subscription terms and existing customer balances are not modified
BEGIN;

DO $guard$
BEGIN
  PERFORM 1 FROM public.cafes
  WHERE id='28fe7547-ab2a-47b6-ac62-36121fbb1bae'
    AND slug='brand-3f7b257437a6' AND status='active' AND is_public AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sadeem identity or publication state differs'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.cafe_loyalty_programs
    WHERE cafe_id='28fe7547-ab2a-47b6-ac62-36121fbb1bae'
      AND (NOT enabled OR purchases_required<>6 OR reward_product_id IS NOT NULL
        OR reward_name<>'خصم 10%' OR NOT wallet_enabled
        OR NOT apple_wallet_enabled OR NOT google_wallet_enabled)
  ) OR EXISTS (
    SELECT 1 FROM public.cafe_loyalty_experience
    WHERE cafe_id='28fe7547-ab2a-47b6-ac62-36121fbb1bae'
      AND (reward_kind IS DISTINCT FROM 'discount' OR reward_discount_percent IS DISTINCT FROM 10)
  ) THEN RAISE EXCEPTION 'Existing Sadeem loyalty differs; preserve owner changes'; END IF;
END $guard$;

INSERT INTO public.cafe_loyalty_programs (
  cafe_id,enabled,purchases_required,reward_product_id,reward_name,
  card_title,card_subtitle,stamp_label,terms,card_background,card_foreground,card_accent,
  wallet_enabled,apple_wallet_enabled,google_wallet_enabled,card_design
) VALUES (
  '28fe7547-ab2a-47b6-ac62-36121fbb1bae',true,6,null,'خصم 10%',
  'بطاقة ولاء سديم','لكل رشفة حكاية ولكل زيارة مكافأة','الأختام',
  'اجمع 6 أختام واحصل على خصم 10%','#FFF7EA','#392014','#C85922',
  true,true,true,'{"layoutVersion":"brand-stamps-v1","stampStyle":"ceramic"}'::jsonb
) ON CONFLICT(cafe_id) DO NOTHING;

-- Redemption uses structured reward terms, not only the display label
-- Reward expiry retains the established thirty-day schema default
INSERT INTO public.cafe_loyalty_experience (
  cafe_id,reward_kind,reward_discount_percent,nearby_message
) VALUES (
  '28fe7547-ab2a-47b6-ac62-36121fbb1bae','discount',10,
  'قريب منّا؟ شاي سديم ومخبوزاتنا بانتظارك'
) ON CONFLICT(cafe_id) DO NOTHING;

COMMIT;
