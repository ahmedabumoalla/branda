BEGIN;
-- Atomic stock item creation from purchase entry using the existing inventory ledger.
-- Menu visibility and consumption links remain an explicit owner choice.
CREATE FUNCTION public.erp_purchase_product_create(p_cafe uuid,p_input jsonb,p_request uuid,p_shift uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 actor uuid:=auth.uid(); role_name text; saved uuid:=gen_random_uuid(); product uuid:=NULL;
 old public.bf_requests%ROWTYPE; body jsonb; result jsonb; item_row public.bf_items%ROWTYPE;
 k text; n numeric; item_name text; code text; uid uuid; unit_name text; cat uuid; brand uuid; brand_name text;
 image_path text; tracked boolean; minimum numeric; recipe jsonb; part jsonb; qty numeric; part_id uuid;
 attempt integer; buy numeric; sale numeric; cfg jsonb;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'يلزم تسجيل الدخول' USING ERRCODE='42501'; END IF;
 role_name:=brand_finance_private.role_for(p_cafe);
 IF p_shift IS NOT NULL THEN
  PERFORM erp_purchase_private.pos_assert(p_cafe,p_shift);
  IF NOT coalesce((erp_purchase_private.pos_permissions(p_cafe)->>'createItem')::boolean,false) THEN RAISE EXCEPTION 'المالك لم يسمح بإضافة المنتجات من الكاشير' USING ERRCODE='42501'; END IF;
 ELSE
  IF coalesce(role_name,'') NOT IN('owner','manager','warehouse') THEN RAISE EXCEPTION 'لا تملك صلاحية إضافة المنتجات' USING ERRCODE='42501'; END IF;
  PERFORM erp_inventory_private.authorize(p_cafe,'create');
 END IF;
 IF p_request IS NULL OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR octet_length(p_input::text)>60000 THEN RAISE EXCEPTION 'بيانات المنتج غير صالحة'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,60412));
 body:=jsonb_build_object('product',p_input,'shiftId',p_shift);
 SELECT * INTO old FROM public.bf_requests WHERE cafe_id=p_cafe AND request_id=p_request;
 IF FOUND THEN
  IF old.operation<>'purchase_product' OR old.payload<>body OR old.created_by<>actor THEN RAISE EXCEPTION 'معرف الطلب مستخدم لعملية أخرى'; END IF;
  RETURN old.result;
 END IF;
 FOREACH k IN ARRAY ARRAY['name','category','brand','seller','flavor','barcode','unitId','sellerKind','marginType'] LOOP
  IF p_input?k AND (jsonb_typeof(p_input->k) IS DISTINCT FROM 'string' OR length(p_input->>k)>(CASE WHEN k='barcode' THEN 64 WHEN k='flavor' THEN 100 ELSE 150 END)) THEN RAISE EXCEPTION 'راجع بيانات هوية المنتج'; END IF;
 END LOOP;
 IF coalesce(p_input->>'sellerKind','supplier') NOT IN('supplier','family') OR coalesce(p_input->>'marginType','percent') NOT IN('amount','percent') THEN RAISE EXCEPTION 'راجع خيارات المنتج'; END IF;
 FOREACH k IN ARRAY ARRAY['buyPrice','salePrice','margin','minQuantity'] LOOP
  IF p_input?k THEN
   IF jsonb_typeof(p_input->k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'راجع الأسعار والكميات'; END IF;
   n:=(p_input->>k)::numeric;
   IF n<0 OR n>(CASE WHEN k='minQuantity' THEN 1000000 ELSE 99999999 END) THEN RAISE EXCEPTION 'راجع الأسعار والكميات'; END IF;
  END IF;
 END LOOP;
 IF p_input?'trackStock' AND jsonb_typeof(p_input->'trackStock') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'خيار التتبع غير صالح'; END IF;
 tracked:=coalesce((p_input->>'trackStock')::boolean,false);
 minimum:=CASE WHEN tracked THEN round(coalesce((p_input->>'minQuantity')::numeric,0),3) ELSE 0 END;
 buy:=round(coalesce((p_input->>'buyPrice')::numeric,0),2);sale:=round(coalesce((p_input->>'salePrice')::numeric,0),2);
 recipe:=coalesce(p_input->'components','[]');
 IF jsonb_typeof(recipe) IS DISTINCT FROM 'array' OR jsonb_array_length(recipe)>100 THEN RAISE EXCEPTION 'راجع مكونات المنتج'; END IF;
 IF (SELECT count(DISTINCT x->>'itemId') FROM jsonb_array_elements(recipe)x)<>jsonb_array_length(recipe) THEN RAISE EXCEPTION 'لا تكرر المكون داخل المنتج'; END IF;
 FOR part IN SELECT value FROM jsonb_array_elements(recipe) LOOP
  part_id:=(part->>'itemId')::uuid;qty:=(part->>'quantity')::numeric;
  IF jsonb_typeof(part->'quantity') IS DISTINCT FROM 'number' OR qty<=0 OR qty>1000000 OR qty<>round(qty,3) OR NOT EXISTS(SELECT 1 FROM public.bf_items WHERE cafe_id=p_cafe AND id=part_id AND active) THEN RAISE EXCEPTION 'اختر مكونًا مخزنيًا من العلامة وحدد كمية صحيحة'; END IF;
 END LOOP;
 image_path:=nullif(p_input->>'imagePath','');
 IF image_path IS NOT NULL AND (image_path !~ ('^'||p_cafe::text||'/[0-9a-f-]{36}\.webp$') OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='bf-inventory-images' AND name=image_path)) THEN RAISE EXCEPTION 'صورة المنتج لم ترفع أو لا تخص العلامة' USING ERRCODE='42501'; END IF;
 uid:=nullif(p_input->>'unitId','')::uuid;
 IF uid IS NULL THEN
  INSERT INTO public.bf_item_units(cafe_id,name) VALUES(p_cafe,'حبة') ON CONFLICT(cafe_id,name) DO UPDATE SET name=excluded.name RETURNING id,name INTO uid,unit_name;
 ELSE
  SELECT name INTO unit_name FROM public.bf_item_units WHERE cafe_id=p_cafe AND id=uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'وحدة القياس لا تخص العلامة' USING ERRCODE='42501'; END IF;
 END IF;
 code:=nullif(btrim(p_input->>'barcode'),'');
 IF code IS NULL THEN
  FOR attempt IN 1..64 LOOP
   code:=erp_inventory_private.ean13('20'||lpad(floor(random()*10000000000)::bigint::text,10,'0'));
   EXIT WHEN NOT EXISTS(SELECT 1 FROM public.bf_items i WHERE i.cafe_id=p_cafe AND (i.barcode=code OR i.sku=code));
   code:=NULL;
  END LOOP;
 END IF;
 IF code IS NULL OR code !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$' THEN RAISE EXCEPTION 'الباركود غير صالح'; END IF;
 SELECT payload INTO cfg FROM public.erp_inventory_settings WHERE cafe_id=p_cafe;
 IF cfg->>'barcodeFormat'='EAN13' AND (code!~'^[0-9]{13}$' OR code<>erp_inventory_private.ean13(left(code,12))) THEN RAISE EXCEPTION 'الباركود يجب أن يكون EAN13 برقم تحقق صحيح'; END IF;
 IF EXISTS(SELECT 1 FROM public.bf_items i WHERE i.cafe_id=p_cafe AND (i.barcode=code OR i.sku=code)) THEN RAISE EXCEPTION 'الباركود مستخدم لمنتج آخر'; END IF;
 item_name:=coalesce(nullif(btrim(p_input->>'name'),''),'منتج '||code);
 IF nullif(btrim(p_input->>'category'),'') IS NOT NULL THEN
  SELECT id INTO cat FROM public.erp_inventory_catalogs WHERE cafe_id=p_cafe AND kind='category' AND name=btrim(p_input->>'category') AND active;
  IF cat IS NULL THEN INSERT INTO public.erp_inventory_catalogs(cafe_id,kind,name) VALUES(p_cafe,'category',btrim(p_input->>'category')) RETURNING id INTO cat; END IF;
 END IF;
 brand_name:=nullif(btrim(CASE WHEN p_input->>'sellerKind'='family' THEN p_input->>'seller' ELSE p_input->>'brand' END),'');
 IF brand_name IS NOT NULL THEN
  SELECT id INTO brand FROM public.erp_inventory_catalogs WHERE cafe_id=p_cafe AND kind='brand' AND name=brand_name AND active;
  IF brand IS NULL THEN INSERT INTO public.erp_inventory_catalogs(cafe_id,kind,name) VALUES(p_cafe,'brand',brand_name) RETURNING id INTO brand; END IF;
 END IF;
 INSERT INTO public.bf_items(id,cafe_id,name,sku,unit,unit_id,barcode,image_path,min_quantity,active,cost_mode)
 VALUES(saved,p_cafe,item_name,code,unit_name,uid,code,image_path,minimum,true,'full') RETURNING * INTO item_row;
 INSERT INTO public.erp_inventory_items(cafe_id,item_id,kind,status,category_id,brand_id,payload)
 VALUES(p_cafe,saved,'product','active',cat,brand,jsonb_build_object('buyPrice',buy,'salePrice',sale,'margin',coalesce((p_input->>'margin')::numeric,0),'marginType',coalesce(p_input->>'marginType','percent'),'seller',coalesce(p_input->>'seller',''),'sellerKind',coalesce(p_input->>'sellerKind','supplier'),'flavor',coalesce(p_input->>'flavor',''),'trackStock',tracked,'saleComponents',recipe));
 INSERT INTO public.erp_inventory_events(cafe_id,record_id,action,detail,actor) VALUES(p_cafe,saved,'item',jsonb_build_object('source','purchase','productId',product,'shiftId',p_shift),actor);
 result:=jsonb_build_object('item',to_jsonb(item_row)||jsonb_build_object('quantity',0,'average_cost',0,'menu_product_id',NULL),'unit',jsonb_build_object('id',uid,'name',unit_name),'buyPrice',buy,'salePrice',sale,'productId',product);
 INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by) VALUES(p_cafe,p_request,'purchase_product',body,result,actor);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.erp_purchase_product_create(uuid,jsonb,uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.erp_purchase_product_create(uuid,jsonb,uuid,uuid) TO authenticated;
COMMIT;
