BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cafes WHERE id='59606e0a-ac48-4d3a-b92d-4e53246468be' AND slug='brand-dc78f4cd5bb8' AND business_category='hair_salons' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION '100 Degrees salon account not found';
  END IF;
END $$;

-- Printed menu snapshot. The stable IDs preserve later owner edits on replay.
INSERT INTO public.menu_categories (id,cafe_id,name,sort_order,visible)
SELECT md5('100-degrees:category:' || position)::uuid,'59606e0a-ac48-4d3a-b92d-4e53246468be',name,position,true
FROM (VALUES (0,'خدمات الحلاقة'), (1,'خدمات العناية'), (2,'الخدمات الخاصة')) AS categories(position,name)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.menu_products (id,cafe_id,category_id,name,price,sort_order,catalog_kind,available,available_for_pickup,commerce_details)
SELECT md5('100-degrees:service:' || category || ':' || position)::uuid,'59606e0a-ac48-4d3a-b92d-4e53246468be',
       md5('100-degrees:category:' || category)::uuid,name,coalesce(amount,0),position,'service',amount IS NOT NULL,false,
       CASE WHEN amount IS NULL THEN '{"quoteOnly":true}'::jsonb ELSE '{}'::jsonb END
FROM (VALUES
  (0,0,'قص شعر',25),
  (0,1,'قص شعر أطفال',20),
  (0,2,'حلاقة ذقن',20),
  (0,3,'صبغة للشعر',45),
  (0,4,'صبغة للذقن',25),
  (1,0,'لصقة أنف',10),
  (1,1,'ماسك طيني',15),
  (1,2,'ماسك بروتين',15),
  (1,3,'ماسك عسل',15),
  (1,4,'صنفرة وجه',15),
  (1,5,'حمام زيت شعر',40),
  (1,6,'تنظيف البشرة بخار',120),
  (1,7,'شفط وليزر للوجه',200),
  (1,8,'بروتين',250),
  (1,9,'كرياتين',200),
  (1,10,'معالجة شعر',300),
  (2,0,'خدمات VIP',NULL),
  (2,1,'تجهيز عريس',NULL)
) AS services(category,position,name,amount)
ON CONFLICT (id) DO NOTHING;

-- An unpriced consultation must also remain unpriced in its immutable booking receipt.
DO $$
DECLARE
  original text := pg_get_functiondef('public.salon_create_booking(uuid,uuid,text,text,uuid,timestamptz,text,text)'::regprocedure);
  needle text := 'SELECT name,price,preparation_time_minutes INTO item FROM public.menu_products m';
  adjusted text := $q$SELECT name,CASE WHEN m.cafe_id='59606e0a-ac48-4d3a-b92d-4e53246468be' AND m.price=0 AND m.commerce_details @> '{"quoteOnly":true}'::jsonb THEN NULL ELSE m.price END AS price,preparation_time_minutes INTO item FROM public.menu_products m$q$;
BEGIN
  IF strpos(original,adjusted)>0 THEN RETURN; END IF;
  IF (length(original)-length(replace(original,needle,''))) <> length(needle) THEN RAISE EXCEPTION 'Review salon booking price snapshot'; END IF;
  EXECUTE replace(original,needle,adjusted);
END $$;
COMMIT;
