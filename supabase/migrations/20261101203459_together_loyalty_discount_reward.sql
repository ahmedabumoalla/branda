-- Materialize the already-approved four-stamp 10% reward as an actual discount
-- Retain existing validity, location, announcements and offer configuration
BEGIN;
SET LOCAL lock_timeout = '5s';
INSERT INTO public.cafe_loyalty_experience(cafe_id,reward_kind,reward_discount_percent)
SELECT c.id,'discount',10 FROM public.cafes c
JOIN public.cafe_loyalty_programs p ON p.cafe_id=c.id
WHERE c.id='4e5a661a-7029-40ec-a3bc-dc75959a05bb' AND c.slug='brand-871ec6e243c0'
  AND p.enabled AND p.purchases_required=4
ON CONFLICT(cafe_id) DO UPDATE
SET reward_kind='discount',reward_discount_percent=10,updated_at=now()
WHERE public.cafe_loyalty_experience.reward_kind IS DISTINCT FROM 'discount'
   OR public.cafe_loyalty_experience.reward_discount_percent IS DISTINCT FROM 10;
COMMIT;
