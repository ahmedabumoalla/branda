-- Explicit owner-selected cashier pricing; no existing product prices are changed
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE OR REPLACE FUNCTION hospital_private.items(c uuid,raw jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE e jsonb;p public.menu_products%ROWTYPE;o jsonb;result jsonb:='[]';low numeric;high numeric;idx integer;qty integer;mode text;
BEGIN
 IF jsonb_typeof(raw) IS DISTINCT FROM 'array' OR jsonb_array_length(raw) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'HOSPITAL_INVALID_ITEMS';END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(raw) LOOP
  qty:=(e->>'quantity')::integer;
  IF qty IS NULL OR qty NOT BETWEEN 1 AND 50 OR (e->>'quantity')::numeric<>qty THEN RAISE EXCEPTION 'HOSPITAL_INVALID_ITEMS';END IF;
  SELECT * INTO p FROM public.menu_products WHERE cafe_id=c AND id=(e->>'productId')::uuid AND deleted_at IS NULL AND available AND catalog_kind='product' FOR SHARE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.menu_categories WHERE cafe_id=c AND id=p.category_id AND visible AND deleted_at IS NULL) THEN RAISE EXCEPTION 'HOSPITAL_PRODUCT_UNAVAILABLE';END IF;
  low:=p.price;high:=p.price;idx:=NULL;o:=NULL;mode:=p.commerce_details->>'menuPriceMode';
  IF mode='cashier' THEN
   IF coalesce(cardinality(p.price_options),0)>0 OR e ? 'priceOptionIndex' THEN RAISE EXCEPTION 'HOSPITAL_CHOOSE_OPTION';END IF;
   low:=0;high:=0;
  ELSIF coalesce(cardinality(p.price_options),0)>0 THEN
   idx:=(e->>'priceOptionIndex')::integer;
   IF idx IS NULL OR idx<0 OR idx>=cardinality(p.price_options) THEN RAISE EXCEPTION 'HOSPITAL_CHOOSE_OPTION';END IF;
   low:=p.price_options[idx+1];high:=low;
  ELSIF e ? 'priceOptionIndex' THEN RAISE EXCEPTION 'HOSPITAL_CHOOSE_OPTION';
  ELSIF mode IS DISTINCT FROM 'fixed' AND jsonb_typeof(p.commerce_details->'menuPriceRange')='object' THEN
   low:=(p.commerce_details#>>'{menuPriceRange,min}')::numeric;high:=(p.commerce_details#>>'{menuPriceRange,max}')::numeric;
  END IF;
  IF low IS NULL OR high IS NULL OR low<0 OR high<low OR high>100000 OR low<>round(low,2) OR high<>round(high,2) THEN RAISE EXCEPTION 'HOSPITAL_PRICE_UNAVAILABLE';END IF;
  result:=result||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('productId',p.id,'name',p.name,'nameEn',nullif(p.commerce_details->>'nameEn',''),'quantity',qty,'unitPrice',low,'maxUnitPrice',high,'priceMode',CASE WHEN mode='cashier' THEN 'cashier' END,'priceOptionIndex',idx,'optionLabel',o->>'label')));
 END LOOP;
 RETURN result;
END $$;

CREATE FUNCTION hospital_private.needs_price_confirmation(o public.hospital_orders) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT o.finance_document_id IS NULL AND (o.total<>o.total_max OR EXISTS(SELECT 1 FROM jsonb_array_elements(o.items) x WHERE x->>'priceMode'='cashier'))
$$;
REVOKE ALL ON FUNCTION hospital_private.needs_price_confirmation(public.hospital_orders) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION hospital_private.sale_price(c uuid,request uuid,e jsonb,base_price numeric) RETURNS numeric LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE quoted numeric;entered numeric;
BEGIN
 quoted:=hospital_private.confirmed_price(c,request,e);
 -- Quote is created only by the authorized order checkout in this same transaction
 IF quoted IS NOT NULL THEN RETURN quoted;END IF;
 IF EXISTS(SELECT 1 FROM public.menu_products p JOIN public.cafes b ON b.id=p.cafe_id
   WHERE p.cafe_id=c AND p.id=(e->>'productId')::uuid AND b.slug='mind-hospital'
   AND p.commerce_details->>'menuPriceMode'='cashier') THEN
  IF jsonb_typeof(e->'unitPrice') IS DISTINCT FROM 'number' OR jsonb_typeof(e->'expectedUnitPrice') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'HOSPITAL_CONFIRM_PRICES';END IF;
  entered:=(e->>'unitPrice')::numeric;
  IF entered<=0 OR entered>100000 OR entered<>round(entered,2) OR entered::text IN('NaN','Infinity','-Infinity') OR entered IS DISTINCT FROM (e->>'expectedUnitPrice')::numeric THEN RAISE EXCEPTION 'HOSPITAL_CONFIRM_PRICES';END IF;
  RETURN entered;
 END IF;
 RETURN base_price;
END $$;
REVOKE ALL ON FUNCTION hospital_private.sale_price(uuid,uuid,jsonb,numeric) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION brand_finance_private.receipt_seller(p_cafe uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('name',c.name,'vatNumber',coalesce(nullif(btrim(s.tax_number),''),''))
 FROM public.cafes c LEFT JOIN public.cafe_settings s ON s.cafe_id=c.id
 WHERE c.id=p_cafe AND (c.business_category='butcher_shops' OR (c.slug='mind-hospital' AND EXISTS(SELECT 1 FROM public.hospital_store_settings h WHERE h.cafe_id=c.id AND h.enabled)))
$$;

DO $migration$
DECLARE src text;needle text;replacement text;signature text;
BEGIN
 SELECT pg_get_functiondef('brand_finance_private.snapshot_before_job_roles(uuid)'::regprocedure) INTO src;
 needle:=$old$'price',p.price,'butcherDetails'$old$;
 IF (length(src)-length(replace(src,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Hospital snapshot product mode anchor drift';END IF;
 EXECUTE replace(src,needle,$new$'price',p.price,'priceMode',CASE WHEN p.commerce_details->>'menuPriceMode'='cashier' AND EXISTS(SELECT 1 FROM public.cafes mode_cafe WHERE mode_cafe.id=p_cafe_id AND mode_cafe.slug='mind-hospital') THEN 'cashier' ELSE 'fixed' END,'butcherDetails'$new$);
 SELECT pg_get_functiondef('brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid)'::regprocedure) INTO src;
 needle:=$old$price:=coalesce(hospital_private.confirmed_price(p_cafe_id,p_request_id,entry),prod.price);$old$;
 IF (length(src)-length(replace(src,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Hospital canonical price hook drift';END IF;
 EXECUTE replace(src,needle,$new$price:=hospital_private.sale_price(p_cafe_id,p_request_id,entry,prod.price);$new$);
 -- A pending unknown-price order is valid, but must never be presented as a free invoice
 SELECT pg_get_functiondef('hospital_private.create_order(uuid,uuid,jsonb,text)'::regprocedure) INTO src;
 needle:=$old$IF hi<=0 OR hi>100000000 THEN$old$;
 replacement:=$new$IF (hi<=0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(lines) x WHERE x->>'priceMode'='cashier')) OR hi>100000000 THEN$new$;
 IF (length(src)-length(replace(src,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Hospital order total guard drift';END IF;
 EXECUTE replace(src,needle,replacement);
 FOREACH signature IN ARRAY ARRAY['hospital_private.dto(public.hospital_orders)','public.hospital_order_submit(text,uuid,jsonb,text)'] LOOP
  SELECT pg_get_functiondef(signature::regprocedure) INTO src;
  needle:=$old$'needsPriceConfirmation',o.total<>o.total_max$old$;
  IF (length(src)-length(replace(src,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Hospital receipt confirmation guard drift';END IF;
  EXECUTE replace(src,needle,$new$'needsPriceConfirmation',hospital_private.needs_price_confirmation(o)$new$);
 END LOOP;
 SELECT pg_get_functiondef('public.hospital_order_manage(uuid,uuid,uuid,text,jsonb)'::regprocedure) INTO src;
 needle:=$old$IF price IS NULL OR price< (line->>'unitPrice')::numeric OR price>(line->>'maxUnitPrice')::numeric OR price<>round(price,2) THEN RAISE EXCEPTION 'HOSPITAL_CONFIRM_PRICES';END IF;$old$;
 replacement:=$new$IF line->>'priceMode'='cashier' THEN
    IF price IS NULL OR price<=0 OR price>100000 OR price<>round(price,2) OR price::text IN('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'HOSPITAL_CONFIRM_PRICES';END IF;
   ELSIF price IS NULL OR price< (line->>'unitPrice')::numeric OR price>(line->>'maxUnitPrice')::numeric OR price<>round(price,2) THEN RAISE EXCEPTION 'HOSPITAL_CONFIRM_PRICES';END IF;$new$;
 IF (length(src)-length(replace(src,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Hospital checkout price guard drift';END IF;
 EXECUTE replace(src,needle,replacement);
END $migration$;

NOTIFY pgrst,'reload schema';
COMMIT;
