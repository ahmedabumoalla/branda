BEGIN;
-- Explicit opt-in pricing only. Missing priceMode preserves existing fixed prices.
DO $migration$
DECLARE source text; old text; replacement text;
BEGIN
 SELECT pg_get_functiondef('brand_finance_private.validate_butcher_product()'::regprocedure) INTO source;
 old:=$anchor$  IF amount<=0 OR amount>1000000 OR amount<>round(amount,6) THEN RAISE EXCEPTION 'أدخل سعرًا صحيحًا لكل وحدة بيع'; END IF;$anchor$;
 IF (length(source)-length(replace(source,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'Butcher catalog price validation anchor changed'; END IF;
 replacement:=$patch$  IF unit ? 'priceMode' AND (jsonb_typeof(unit->'priceMode') IS DISTINCT FROM 'string' OR unit->>'priceMode' NOT IN('fixed','cashier')) THEN
   RAISE EXCEPTION 'اختر طريقة تسعير صحيحة لوحدة البيع';
  END IF;
  IF coalesce(unit->>'priceMode','fixed')='cashier' THEN
   IF amount<>0 THEN RAISE EXCEPTION 'اترك سعر الوحدة بصفر عند تحديد السعر من الكاشير'; END IF;
  ELSIF amount<=0 OR amount>1000000 OR amount<>round(amount,6) THEN RAISE EXCEPTION 'أدخل سعرًا صحيحًا لكل وحدة بيع'; END IF;$patch$;
 EXECUTE replace(source,old,replacement);

 SELECT pg_get_functiondef('brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid)'::regprocedure) INTO source;
 old:=$anchor$     price:=(butcher_unit->>'price')::numeric;$anchor$;
 IF (length(source)-length(replace(source,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'Butcher selected unit price anchor changed'; END IF;
 replacement:=$patch$     IF coalesce(butcher_unit->>'priceMode','fixed')='cashier' THEN
      IF jsonb_typeof(entry->'unitPrice') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'أدخل سعر وحدة البيع في الكاشير'; END IF;
      price:=(entry->>'unitPrice')::numeric;
      IF price<=0 OR price>1000000 OR price<>round(price,6) THEN RAISE EXCEPTION 'أدخل سعر بيع أكبر من صفر وبحد أقصى مليون وست خانات عشرية'; END IF;
     ELSE price:=(butcher_unit->>'price')::numeric;
     END IF;$patch$;
 source:=replace(source,old,replacement);
 old:=$anchor$    IF (entry->>'expectedUnitPrice')::numeric IS DISTINCT FROM price THEN RAISE EXCEPTION 'تغير سعر الصنف حدث المنتجات وراجع الإجمالي قبل تأكيد البيع'; END IF;$anchor$;
 IF (length(source)-length(replace(source,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'Butcher confirmed sale price anchor changed'; END IF;
 replacement:=$patch$    IF coalesce(butcher_unit->>'priceMode','fixed')<>'cashier' AND entry ? 'unitPrice'
      AND (jsonb_typeof(entry->'unitPrice') IS DISTINCT FROM 'number' OR (entry->>'unitPrice')::numeric IS DISTINCT FROM price)
    THEN RAISE EXCEPTION 'سعر هذه الوحدة ثابت ولا يمكن تغييره من الكاشير'; END IF;
$patch$||old;
 EXECUTE replace(source,old,replacement);
END $migration$;
NOTIFY pgrst,'reload schema';
COMMIT;
