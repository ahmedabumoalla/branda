-- Explicit owner approval: six stamps earn a ten percent discount
-- Catalog, subscription terms and existing customer balances are not modified
BEGIN;

DO $guard$
BEGIN
  PERFORM 1 FROM public.cafes
  WHERE id='26d964ab-7435-45e3-b721-536746dfcf12'
    AND slug='brand-dcf7296f722c' AND status='active' AND is_public AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hadiqa identity or publication state differs'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cafe_settings s JOIN public.cafe_custom_identity i USING(cafe_id)
    WHERE s.cafe_id='26d964ab-7435-45e3-b721-536746dfcf12'
      AND s.logo_storage_path IS NOT NULL AND s.logo_storage_path=i.logo_storage_path)
  THEN RAISE EXCEPTION 'Hadiqa original logo must be imported first'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.cafe_loyalty_programs
    WHERE cafe_id='26d964ab-7435-45e3-b721-536746dfcf12'
      AND (NOT enabled OR purchases_required<>6 OR reward_product_id IS NOT NULL
        OR reward_name<>'خصم 10%' OR NOT wallet_enabled
        OR NOT apple_wallet_enabled OR NOT google_wallet_enabled)
  ) OR EXISTS (
    SELECT 1 FROM public.cafe_loyalty_experience
    WHERE cafe_id='26d964ab-7435-45e3-b721-536746dfcf12'
      AND (reward_kind IS DISTINCT FROM 'discount' OR reward_discount_percent IS DISTINCT FROM 10)
  ) THEN RAISE EXCEPTION 'Existing Hadiqa loyalty differs; preserve owner changes'; END IF;
END $guard$;

INSERT INTO public.cafe_loyalty_programs (
  cafe_id,enabled,purchases_required,reward_product_id,reward_name,
  card_title,card_subtitle,stamp_label,terms,card_background,card_foreground,card_accent,
  wallet_enabled,apple_wallet_enabled,google_wallet_enabled,card_design
) VALUES (
  '26d964ab-7435-45e3-b721-536746dfcf12',true,6,null,'خصم 10%',
  'بطاقة ولاء الحديقة','زياراتك تجمع المكافآت على سفرة الحديقة','الأختام',
  'اجمع 6 أختام واحصل على خصم 10%','#171D2B','#FCF5E8','#DDB35C',
  true,true,true,'{"layoutVersion":"brand-stamps-v1","stampStyle":"brand"}'::jsonb
) ON CONFLICT(cafe_id) DO NOTHING;

-- Redemption uses structured reward terms, not only the display label
-- Reward expiry retains the established thirty-day schema default
INSERT INTO public.cafe_loyalty_experience (
  cafe_id,reward_kind,reward_discount_percent,nearby_message
) VALUES (
  '26d964ab-7435-45e3-b721-536746dfcf12','discount',10,
  'قريب منّا؟ سفرة الحديقة ومشاويها بانتظارك'
) ON CONFLICT(cafe_id) DO NOTHING;

COMMIT;
