-- Stamp styles are stored as JSONB, without a database enum restriction
-- The owner settings RPC preserves cardDesign; its client/server allowlist includes plant
BEGIN;
SET LOCAL lock_timeout = '5s';
UPDATE public.cafe_loyalty_programs p
SET card_design=coalesce(p.card_design,'{}'::jsonb)||'{"stampStyle":"plant"}'::jsonb,updated_at=now()
FROM public.cafes c
WHERE p.cafe_id=c.id AND c.id='4e5a661a-7029-40ec-a3bc-dc75959a05bb'
  AND c.slug='brand-871ec6e243c0'
  AND p.card_design->>'stampStyle' IS DISTINCT FROM 'plant';

UPDATE public.cafe_loyalty_experience e
SET nearby_message='قريب منّا؟ اكتشف غرسة تنمو معك وهدية تُسعد أحبابك',updated_at=now()
FROM public.cafes c
WHERE e.cafe_id=c.id AND c.id='4e5a661a-7029-40ec-a3bc-dc75959a05bb'
  AND c.slug='brand-871ec6e243c0'
  AND e.nearby_message IN ('قريب منّا؟ خذ لك لحظة قهوة، يسعدنا نشوفك.','قريب منّا؟ خذ لك لحظة قهوة يسعدنا نشوفك');
COMMIT;
