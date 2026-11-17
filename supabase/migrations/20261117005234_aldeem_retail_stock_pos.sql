BEGIN;
-- Aldeem retail cashier uses existing inventory identities and original stock posting.
-- Historical menu products, prices, invoices and recipe links remain untouched.
CREATE TABLE aldeem_pos_private.item_prices(
 cafe_id uuid NOT NULL,point_id uuid NOT NULL,item_id uuid NOT NULL,
 price numeric(14,2) NOT NULL CHECK(price BETWEEN 0 AND 100000),
 PRIMARY KEY(cafe_id,point_id,item_id),
 FOREIGN KEY(cafe_id,point_id) REFERENCES aldeem_pos_private.points(cafe_id,id),
 FOREIGN KEY(cafe_id,item_id) REFERENCES public.bf_items(cafe_id,id)
);
ALTER TABLE aldeem_pos_private.item_prices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE aldeem_pos_private.item_prices FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION aldeem_pos_private.stock_product(c uuid,pid uuid,i uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE p aldeem_pos_private.points;v jsonb;custom_price numeric;
BEGIN
 p:=aldeem_pos_private.point(c,pid);
 IF NOT EXISTS(SELECT 1 FROM public.erp_inventory_items m JOIN public.bf_items b ON b.cafe_id=m.cafe_id AND b.id=m.item_id
  WHERE m.cafe_id=c AND m.item_id=i AND m.kind='product' AND m.status='active' AND b.active)
  OR NOT erp_branch_private.allowed_resource(c,p.branch_id,'item',i)
  OR NOT erp_inventory_private.sale_warehouse_allowed(c,p.warehouse_id,auth.uid()) THEN
  RAISE EXCEPTION 'الصنف أو مستودع نقطة البيع غير متاح' USING ERRCODE='42501';
 END IF;
 v:=erp_inventory_private.sale_item(c,i);
 SELECT price INTO custom_price FROM aldeem_pos_private.item_prices WHERE cafe_id=c AND point_id=p.id AND item_id=i;
 RETURN v||jsonb_build_object('price',coalesce(custom_price,(v->>'price')::numeric),
  'quantity',coalesce((SELECT quantity FROM public.bf_stock WHERE cafe_id=c AND warehouse_id=p.warehouse_id AND item_id=i),0)/(v->>'unitFactor')::numeric);
END $$;
REVOKE ALL ON FUNCTION aldeem_pos_private.stock_product(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION aldeem_pos_private.stock_catalog(c uuid,pid uuid,q text) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE p aldeem_pos_private.points;answer jsonb:='[]';i uuid;
BEGIN
 p:=aldeem_pos_private.point(c,pid);
 FOR i IN SELECT b.id FROM public.bf_items b JOIN public.erp_inventory_items m ON m.cafe_id=c AND m.item_id=b.id
 WHERE b.cafe_id=c AND b.active AND m.kind='product' AND m.status='active'
  AND erp_branch_private.allowed_resource(c,p.branch_id,'item',b.id)
  AND (coalesce(q,'')='' OR b.name ILIKE '%'||q||'%' OR b.sku ILIKE '%'||q||'%' OR b.barcode ILIKE '%'||q||'%')
 ORDER BY b.name,b.id LIMIT 100 LOOP
  answer:=answer||jsonb_build_array(aldeem_pos_private.stock_product(c,p.id,i));
 END LOOP;
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION aldeem_pos_private.stock_catalog(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION aldeem_pos_private.pending_stock_product(c uuid,r uuid,e jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE pid uuid;v jsonb;
BEGIN
 SELECT point_id INTO pid FROM aldeem_pos_private.requests
 WHERE cafe_id=c AND request_id=r AND actor=auth.uid() AND action='sale' AND result IS NULL;
 IF pid IS NULL THEN RAISE EXCEPTION 'طلب بيع المخزون غير متاح' USING ERRCODE='42501';END IF;
 v:=aldeem_pos_private.stock_product(c,pid,(e->>'productId')::uuid);
 IF (v->>'price')::numeric<coalesce((v->>'minimumPrice')::numeric,0) THEN
  RAISE EXCEPTION 'سعر نقطة البيع أقل من الحد الأدنى للصنف' USING ERRCODE='22023';
 END IF;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION aldeem_pos_private.pending_stock_product(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Exact guarded replacements retain the existing branch, shift, points and retry contract.
DO $patch$ DECLARE source text;needle text;replacement text;BEGIN
 source:=pg_get_functiondef('public.aldeem_pos_read(uuid,uuid,text)'::regprocedure);
 needle:=$old$'products',coalesce((SELECT jsonb_agg(x ORDER BY x.name) FROM(SELECT m.id,m.name,coalesce(pp.price,m.price) price,coalesce(cat.name,'') category,m.available,false "stockTracked",NULL "itemId",0 quantity,NULL "imageUrl" FROM public.menu_products m LEFT JOIN public.menu_categories cat ON cat.id=m.category_id LEFT JOIN aldeem_pos_private.prices pp ON pp.cafe_id=c AND pp.point_id=p.id AND pp.product_id=m.id WHERE m.cafe_id=c AND m.deleted_at IS NULL AND m.available AND (m.branch_id IS NULL OR m.branch_id=p.branch_id) AND erp_branch_private.allowed_resource(c,p.branch_id,'item',m.id) AND (p_query='' OR m.name ILIKE '%'||p_query||'%') ORDER BY m.name,m.id LIMIT 100) x),'[]'::jsonb)$old$;
 replacement:=$new$'products',aldeem_pos_private.stock_catalog(c,p.id,p_query)$new$;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Review Aldeem POS catalogue baseline';END IF;
 EXECUTE replace(source,needle,replacement);

 source:=pg_get_functiondef('public.aldeem_pos_execute(uuid,text,jsonb,uuid)'::regprocedure);
 needle:=$old$IF NOT EXISTS(SELECT 1 FROM public.menu_products m WHERE m.cafe_id=c AND m.id=(entry->>'productId')::uuid AND m.deleted_at IS NULL AND (m.branch_id IS NULL OR m.branch_id=p.branch_id) AND erp_branch_private.allowed_resource(c,p.branch_id,'item',m.id)) THEN RAISE EXCEPTION 'الصنف غير متاح للفرع';END IF;
    INSERT INTO aldeem_pos_private.prices VALUES(c,p.id,(entry->>'productId')::uuid,(entry->>'price')::numeric) ON CONFLICT ON CONSTRAINT prices_pkey DO UPDATE SET price=excluded.price;$old$;
 replacement:=$new$IF (entry->>'price')::numeric<coalesce((aldeem_pos_private.stock_product(c,p.id,(entry->>'productId')::uuid)->>'minimumPrice')::numeric,0) THEN RAISE EXCEPTION 'سعر نقطة البيع أقل من الحد الأدنى للصنف' USING ERRCODE='22023';END IF;
    INSERT INTO aldeem_pos_private.item_prices VALUES(c,p.id,(entry->>'productId')::uuid,(entry->>'price')::numeric) ON CONFLICT ON CONSTRAINT item_prices_pkey DO UPDATE SET price=excluded.price;$new$;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Review Aldeem POS prices baseline';END IF;
 source:=replace(source,needle,replacement);
 needle:=$old$IF NOT EXISTS(SELECT 1 FROM public.menu_products m WHERE m.cafe_id=c AND m.id=(entry->>'productId')::uuid AND m.deleted_at IS NULL AND m.available AND (m.branch_id IS NULL OR m.branch_id=p.branch_id) AND erp_branch_private.allowed_resource(c,p.branch_id,'item',m.id)) THEN RAISE EXCEPTION 'الصنف غير متاح في الفرع';END IF;$old$;
 replacement:=$new$PERFORM aldeem_pos_private.stock_product(c,p.id,(entry->>'productId')::uuid);$new$;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Review Aldeem POS sale validation baseline';END IF;
 source:=replace(source,needle,replacement);
 needle:=$old$body:=jsonb_build_object('lines',p_payload->'lines',$old$;
 replacement:=$new$body:=jsonb_build_object('lines',(SELECT jsonb_agg(value||jsonb_build_object('catalogSource','inventory')) FROM jsonb_array_elements(p_payload->'lines')),$new$;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Review Aldeem POS sale body baseline';END IF;
 EXECUTE replace(source,needle,replacement);

 source:=pg_get_functiondef('brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid)'::regprocedure);
 needle:='DECLARE is_butcher boolean;';replacement:='DECLARE retail_stock jsonb; is_butcher boolean;';
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Review original sale declarations';END IF;
 source:=replace(source,needle,replacement);
 needle:=$old$SELECT mp.id,mp.name,mp.price,mp.butcher_details,bi.id item_id INTO prod FROM public.menu_products mp LEFT JOIN public.bf_items bi ON bi.menu_product_id=mp.id AND bi.cafe_id=p_cafe_id AND bi.active WHERE mp.id=(entry->>'productId')::uuid AND mp.cafe_id=p_cafe_id AND mp.deleted_at IS NULL AND mp.available FOR SHARE OF mp;
    IF prod.id IS NULL THEN RAISE EXCEPTION 'الصنف غير متاح للبيع'; END IF; price:=aldeem_pos_private.sale_price(p_cafe_id,p_request_id,entry,prod.price); iid:=prod.item_id;$old$;
 replacement:=$new$retail_stock:=NULL;
    IF entry->>'catalogSource'='inventory' THEN
     retail_stock:=aldeem_pos_private.pending_stock_product(p_cafe_id,p_request_id,entry);
     SELECT (retail_stock->>'id')::uuid id,retail_stock->>'name' name,(retail_stock->>'price')::numeric price,NULL::jsonb butcher_details,(retail_stock->>'id')::uuid item_id INTO prod;
     price:=prod.price;iid:=prod.item_id;
    ELSE
     SELECT mp.id,mp.name,mp.price,mp.butcher_details,bi.id item_id INTO prod FROM public.menu_products mp LEFT JOIN public.bf_items bi ON bi.menu_product_id=mp.id AND bi.cafe_id=p_cafe_id AND bi.active WHERE mp.id=(entry->>'productId')::uuid AND mp.cafe_id=p_cafe_id AND mp.deleted_at IS NULL AND mp.available FOR SHARE OF mp;
     IF prod.id IS NULL THEN RAISE EXCEPTION 'الصنف غير متاح للبيع'; END IF; price:=aldeem_pos_private.sale_price(p_cafe_id,p_request_id,entry,prod.price); iid:=prod.item_id;
    END IF;$new$;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Review original sale product selection';END IF;
 source:=replace(source,needle,replacement);
 needle:=$old$'productId',CASE WHEN p_operation='sale' THEN prod.id ELSE NULL END,'itemId',iid,$old$;
 replacement:=$new$'productId',CASE WHEN p_operation='sale' AND retail_stock IS NULL THEN prod.id ELSE NULL END,'inventoryItemId',CASE WHEN p_operation='sale' THEN retail_stock->>'id' END,'itemId',iid,$new$;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Review original sale identity snapshot';END IF;
 source:=replace(source,needle,replacement);
 needle:=$old$'unitLabel',CASE WHEN p_operation='sale' THEN butcher_unit->>'label' END,'stockUnitFactor',CASE WHEN p_operation='sale' THEN coalesce(butcher_factor,1) ELSE 1 END$old$;
 replacement:=$new$'unitLabel',CASE WHEN p_operation='sale' THEN coalesce(retail_stock->>'unitName',butcher_unit->>'label') END,'stockUnitFactor',CASE WHEN p_operation='sale' THEN coalesce((retail_stock->>'unitFactor')::numeric,butcher_factor,1) ELSE 1 END$new$;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Review original sale unit snapshot';END IF;
 source:=replace(source,needle,replacement);
 needle:=$old$INSERT INTO public.bf_document_lines(cafe_id,document_id,product_id,item_id,name,quantity,unit_price,net,tax,cost,unit_id,unit_label,stock_unit_factor) VALUES(p_cafe_id,id,(entry->>'productId')::uuid,iid,entry->>'name',qty,price,amount,line_tax,cost,entry->>'unitId',entry->>'unitLabel',coalesce((entry->>'stockUnitFactor')::numeric,1))$old$;
 replacement:=$new$INSERT INTO public.bf_document_lines(cafe_id,document_id,product_id,item_id,name,quantity,unit_price,net,tax,cost,unit_id,unit_label,stock_unit_factor,inventory_item_id) VALUES(p_cafe_id,id,(entry->>'productId')::uuid,iid,entry->>'name',qty,price,amount,line_tax,cost,entry->>'unitId',entry->>'unitLabel',coalesce((entry->>'stockUnitFactor')::numeric,1),(entry->>'inventoryItemId')::uuid)$new$;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Review original stock sale line insertion';END IF;
 EXECUTE replace(source,needle,replacement);
END $patch$;
COMMIT;
