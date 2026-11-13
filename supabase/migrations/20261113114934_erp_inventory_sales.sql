BEGIN;
-- Independent ERP items enter the company invoice catalogue only. POS/menu snapshots stay unchanged.
ALTER TABLE public.bf_document_lines ADD COLUMN inventory_item_id uuid,
 ADD CONSTRAINT bf_line_inventory_item_tenant FOREIGN KEY(cafe_id,inventory_item_id) REFERENCES public.bf_items(cafe_id,id),
 ADD CONSTRAINT bf_line_single_catalog CHECK(inventory_item_id IS NULL OR product_id IS NULL);
CREATE INDEX bf_line_inventory_sales ON public.bf_document_lines(cafe_id,inventory_item_id,document_id) WHERE inventory_item_id IS NOT NULL;
CREATE FUNCTION erp_inventory_private.sale_kind_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$BEGIN
 IF NEW.kind<>'product' AND (EXISTS(SELECT 1 FROM public.bf_item_product_links WHERE cafe_id=NEW.cafe_id AND item_id=NEW.item_id) OR EXISTS(SELECT 1 FROM public.bf_movements WHERE cafe_id=NEW.cafe_id AND item_id=NEW.item_id)) THEN RAISE EXCEPTION 'الصنف المرتبط بالمنيو أو بحركة مخزون يجب أن يبقى منتجًا مخزنيًا';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER erp_inventory_preserve_stock_kind BEFORE INSERT OR UPDATE OF kind ON public.erp_inventory_items FOR EACH ROW EXECUTE FUNCTION erp_inventory_private.sale_kind_guard();
REVOKE ALL ON FUNCTION erp_inventory_private.sale_kind_guard() FROM PUBLIC,anon,authenticated,service_role;
-- A stopped item cannot be sold again, but its documented original sale/purchase can still be returned.
DO $$DECLARE source text;needle text:='(kind<>''product'' OR status<>''active'')';replacement text:=$new$(kind<>'product' OR (status<>'active' AND NOT EXISTS(SELECT 1 FROM public.bf_documents d JOIN public.bf_movements m ON m.cafe_id=d.cafe_id AND m.document_id=d.reference_id WHERE d.cafe_id=p_cafe AND d.id=p_doc AND d.kind='refund' AND m.item_id=p_item AND m.warehouse_id=p_warehouse AND m.quantity*p_quantity<0)))$new$;BEGIN
 SELECT pg_get_functiondef('brand_finance_private.stock_move(uuid,uuid,uuid,uuid,numeric,numeric)'::regprocedure) INTO source;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Inventory sales stock guard baseline mismatch';END IF;
 EXECUTE replace(source,needle,replacement);
END $$;

CREATE FUNCTION erp_inventory_private.sale_item(c uuid,i uuid,u text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE item public.bf_items%ROWTYPE;m public.erp_inventory_items%ROWTYPE;units jsonb;unit_name text;f numeric;sale_f numeric;tax numeric;category text;category_id uuid;
BEGIN
 SELECT * INTO item FROM public.bf_items WHERE cafe_id=c AND id=i AND active FOR SHARE;
 SELECT * INTO m FROM public.erp_inventory_items WHERE cafe_id=c AND item_id=i AND status='active' FOR SHARE;
 IF item.id IS NULL OR m.item_id IS NULL OR EXISTS(SELECT 1 FROM public.menu_products WHERE cafe_id=c AND id=i) THEN RAISE EXCEPTION 'صنف المخزون غير متاح للبيع' USING ERRCODE='22023';END IF;
 SELECT payload->'units' INTO units FROM public.erp_inventory_catalogs WHERE cafe_id=c AND id=m.unit_template_id AND active;
 units:=coalesce(units,jsonb_build_array(jsonb_build_object('name',item.unit,'factor',1)));
 unit_name:=coalesce(nullif(u,''),nullif(m.payload->>'saleUnitName',''),item.unit);
 f:=erp_inventory_private.unit_factor(c,i,unit_name);
 sale_f:=erp_inventory_private.unit_factor(c,i,coalesce(nullif(m.payload->>'saleUnitName',''),item.unit));
 tax:=coalesce((m.payload->>'tax1')::numeric,15)+coalesce((m.payload->>'tax2')::numeric,0);
 IF tax NOT IN(0,15) THEN RAISE EXCEPTION 'راجع ضرائب الصنف قبل إضافته إلى الفاتورة' USING ERRCODE='22023';END IF;
 SELECT name,id INTO category,category_id FROM public.erp_inventory_catalogs WHERE cafe_id=c AND id=m.category_id;
 RETURN jsonb_build_object('id',i,'catalogSource','inventory','name',item.name,'sku',item.sku,'barcode',item.barcode,'description',coalesce(m.payload->>'description',''),
 'kind',CASE WHEN m.kind='product' THEN 'product' ELSE 'service' END,'available',true,'imageUrl',NULL,'stockTracked',m.kind='product','itemId',i,
 'quantity',coalesce((SELECT sum(quantity) FROM public.bf_stock WHERE cafe_id=c AND item_id=i AND erp_inventory_private.warehouse_allowed(c,warehouse_id,'read')),0),
 'category',coalesce(category,''),'categoryId',category_id,'unitName',unit_name,'unitFactor',f,'saleUnitFactor',sale_f,'units',units,
 'price',round(coalesce((m.payload->>'salePrice')::numeric,0)*f/sale_f,2),'minimumPrice',round(coalesce((m.payload->>'minimumPrice')::numeric,0)*f/sale_f,2),
 'discount',coalesce((m.payload->>'discount')::numeric,0),'discountKind',coalesce(m.payload->>'discountType','amount'),
 'vatRate',tax,'taxCategory',CASE WHEN tax=15 THEN 'S' ELSE coalesce(m.payload->>'taxCategory','Z') END,'exemptionReason',coalesce(m.payload->>'exemptionReason',''));
END $$;

CREATE FUNCTION erp_inventory_private.sale_warehouse_allowed(c uuid,w uuid,a uuid) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE r text;rule jsonb;mode text;BEGIN
 SELECT CASE WHEN owner_user_id=a THEN 'owner' ELSE (SELECT role FROM public.bf_staff WHERE cafe_id=c AND user_id=a AND active) END INTO r FROM public.cafes WHERE id=c;
 IF r IS NULL THEN RETURN false;END IF;
 SELECT inventory_payload#>'{permissions,write}' INTO rule FROM public.bf_warehouses WHERE cafe_id=c AND id=w AND active;IF NOT FOUND THEN RETURN false;END IF;
 IF r IN('owner','manager') THEN RETURN true;END IF;mode:=coalesce(rule->>'mode','all');
 RETURN CASE mode WHEN 'all' THEN true WHEN 'roles' THEN rule->'ids' ? r WHEN 'employees' THEN EXISTS(SELECT 1 FROM public.erp_hr_employees e WHERE e.cafe_id=c AND e.user_id=a AND e.active AND rule->'ids' ? e.id::text) WHEN 'branches' THEN EXISTS(SELECT 1 FROM public.erp_hr_employees e WHERE e.cafe_id=c AND e.user_id=a AND e.active AND rule->'ids' ? e.branch_id::text) ELSE false END;
END $$;
REVOKE ALL ON FUNCTION erp_inventory_private.sale_warehouse_allowed(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.erp_inventory_sales_catalog(p_cafe uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb:='[]';i uuid;BEGIN
 IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe),'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 FOR i IN SELECT m.item_id FROM public.erp_inventory_items m JOIN public.bf_items b ON b.cafe_id=m.cafe_id AND b.id=m.item_id WHERE m.cafe_id=p_cafe AND m.status='active' AND b.active ORDER BY b.name,b.id LOOP
  result:=result||jsonb_build_array(erp_inventory_private.sale_item(p_cafe,i));
 END LOOP;RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.erp_inventory_sales_catalog(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.erp_inventory_sales_catalog(uuid) TO authenticated;
REVOKE ALL ON FUNCTION erp_inventory_private.sale_item(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;






-- GENERATED GUARDED PATCHES
DO $patch$ DECLARE source text;needle text;replacement text;BEGIN
SELECT pg_get_functiondef('brand_finance_private.issue_company_invoice_actor(uuid,boolean,uuid,uuid,integer,numeric,uuid,text)'::regprocedure) INTO source;
needle:=$old$DECLARE draft public.bf_invoice_drafts%ROWTYPE;$old$;replacement:=$new$DECLARE inventory jsonb;inventory_factor numeric;inventory_unit text;inventory_source boolean;draft public.bf_invoice_drafts%ROWTYPE;$new$;
IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Inventory sales patch baseline mismatch: brand_finance_private.issue_company_invoice_actor(uuid,boolean,uuid,uuid,integer,numeric,uuid,text)';END IF;
source:=replace(source,needle,replacement);
needle:=$old$product:=NULL;policy:=NULL;product_id:=nullif(entry->>'productId','')::uuid;
   IF product_id IS NULL THEN$old$;replacement:=$new$product:=NULL;policy:=NULL;product_id:=nullif(entry->>'productId','')::uuid;inventory:=NULL;inventory_factor:=1;inventory_unit:='';
   IF coalesce(entry->>'catalogSource','menu') NOT IN('menu','inventory') THEN RAISE EXCEPTION 'مصدر البند غير صالح';END IF;
   inventory_source:=entry->>'catalogSource'='inventory';
   IF inventory_source THEN
    inventory:=erp_inventory_private.sale_item(p_cafe_id,product_id,coalesce(entry->>'unitName',''));
    inventory_factor:=(inventory->>'unitFactor')::numeric;inventory_unit:=inventory->>'unitName';
    IF entry ? 'unitFactor' AND (entry->>'unitFactor')::numeric IS DISTINCT FROM inventory_factor THEN RAISE EXCEPTION 'تغير تحويل الوحدة حدث الصنف ثم أعد المحاولة';END IF;
    IF round((entry->>'quantity')::numeric*inventory_factor,3) IS DISTINCT FROM (entry->>'quantity')::numeric*inventory_factor OR (entry->>'quantity')::numeric*inventory_factor>1000000 THEN RAISE EXCEPTION 'الكمية لا تطابق دقة وحدة المخزون';END IF;
    product.name:=inventory->>'name';product.description:=inventory->>'description';product.price:=(inventory->>'price')::numeric;
    policy:=inventory;line_name:=inventory->>'name';line_kind:=inventory->>'kind';
    IF line_kind='product' AND NOT erp_inventory_private.sale_warehouse_allowed(p_cafe_id,wid,p_actor) THEN RAISE EXCEPTION 'Inventory warehouse write denied' USING ERRCODE='42501';END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(advanced->'excludedCategories') x WHERE x=inventory->>'categoryId' OR x=inventory->>'category') THEN RAISE EXCEPTION 'صنف البند مستبعد من الفواتير';END IF;
   ELSIF product_id IS NULL THEN$new$;
IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Inventory sales patch baseline mismatch: brand_finance_private.issue_company_invoice_actor(uuid,boolean,uuid,uuid,integer,numeric,uuid,text)';END IF;
source:=replace(source,needle,replacement);
needle:=$old$WHERE x->>'productId'=product_id::text;catalog_price:=coalesce(catalog_price,product.price);$old$;replacement:=$new$WHERE x->>'productId'=product_id::text AND coalesce(x->>'catalogSource','menu')=CASE WHEN inventory_source THEN 'inventory' ELSE 'menu' END;
    IF inventory_source AND catalog_price IS NOT NULL THEN catalog_price:=round(catalog_price*inventory_factor/(inventory->>'saleUnitFactor')::numeric,2);END IF;
    catalog_price:=coalesce(catalog_price,product.price);$new$;
IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Inventory sales patch baseline mismatch: brand_finance_private.issue_company_invoice_actor(uuid,boolean,uuid,uuid,integer,numeric,uuid,text)';END IF;
source:=replace(source,needle,replacement);
needle:=$old$'productId',coalesce(product_id::text,''),'name',line_name$old$;replacement:=$new$'productId',coalesce(product_id::text,''),'catalogSource',CASE WHEN inventory_source THEN 'inventory' ELSE 'menu' END,'unitName',inventory_unit,'unitFactor',inventory_factor,'name',line_name$new$;
IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Inventory sales patch baseline mismatch: brand_finance_private.issue_company_invoice_actor(uuid,boolean,uuid,uuid,integer,numeric,uuid,text)';END IF;
source:=replace(source,needle,replacement);
needle:=$old$INSERT INTO public.bf_document_lines(id,cafe_id,document_id,product_id,name,quantity,unit_price,net,tax,cost,activity_kind,vat_rate,tax_category,exemption_reason)$old$;replacement:=$new$INSERT INTO public.bf_document_lines(id,cafe_id,document_id,product_id,name,quantity,unit_price,net,tax,cost,activity_kind,vat_rate,tax_category,exemption_reason,inventory_item_id,unit_label,stock_unit_factor)$new$;
IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Inventory sales patch baseline mismatch: brand_finance_private.issue_company_invoice_actor(uuid,boolean,uuid,uuid,integer,numeric,uuid,text)';END IF;
source:=replace(source,needle,replacement);
needle:=$old$VALUES(line_id,p_cafe_id,doc,nullif(entry->>'productId','')::uuid,entry->>'name'$old$;replacement:=$new$VALUES(line_id,p_cafe_id,doc,CASE WHEN entry->>'catalogSource'='inventory' THEN NULL ELSE nullif(entry->>'productId','')::uuid END,entry->>'name'$new$;
IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Inventory sales patch baseline mismatch: brand_finance_private.issue_company_invoice_actor(uuid,boolean,uuid,uuid,integer,numeric,uuid,text)';END IF;
source:=replace(source,needle,replacement);
needle:=$old$entry->>'taxCategory',entry->>'exemptionReason')
    RETURNING$old$;replacement:=$new$entry->>'taxCategory',entry->>'exemptionReason',CASE WHEN entry->>'catalogSource'='inventory' THEN (entry->>'productId')::uuid ELSE NULL END,nullif(entry->>'unitName',''),coalesce((entry->>'unitFactor')::numeric,1))
    RETURNING$new$;
IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Inventory sales patch baseline mismatch: brand_finance_private.issue_company_invoice_actor(uuid,boolean,uuid,uuid,integer,numeric,uuid,text)';END IF;
source:=replace(source,needle,replacement);
EXECUTE source;END $patch$;
DO $patch$ DECLARE source text;needle text;replacement text;BEGIN
SELECT pg_get_functiondef('brand_finance_private.issue_manual_invoice_shipping_actor(uuid,boolean,uuid,uuid,integer,numeric,uuid,text)'::regprocedure) INTO source;
needle:=$old$DECLARE draft public.bf_invoice_drafts%ROWTYPE;$old$;replacement:=$new$DECLARE inventory jsonb;inventory_factor numeric;inventory_unit text;inventory_source boolean;draft public.bf_invoice_drafts%ROWTYPE;$new$;
IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Inventory sales patch baseline mismatch: brand_finance_private.issue_manual_invoice_shipping_actor(uuid,boolean,uuid,uuid,integer,numeric,uuid,text)';END IF;
source:=replace(source,needle,replacement);
needle:=$old$product:=NULL;policy:=NULL;product_id:=nullif(entry->>'productId','')::uuid;
   IF product_id IS NULL THEN$old$;replacement:=$new$product:=NULL;policy:=NULL;product_id:=nullif(entry->>'productId','')::uuid;inventory:=NULL;inventory_factor:=1;inventory_unit:='';
   IF coalesce(entry->>'catalogSource','menu') NOT IN('menu','inventory') THEN RAISE EXCEPTION 'مصدر البند غير صالح';END IF;
   inventory_source:=entry->>'catalogSource'='inventory';
   IF inventory_source THEN
    inventory:=erp_inventory_private.sale_item(p_cafe_id,product_id,coalesce(entry->>'unitName',''));
    inventory_factor:=(inventory->>'unitFactor')::numeric;inventory_unit:=inventory->>'unitName';
    IF entry ? 'unitFactor' AND (entry->>'unitFactor')::numeric IS DISTINCT FROM inventory_factor THEN RAISE EXCEPTION 'تغير تحويل الوحدة حدث الصنف ثم أعد المحاولة';END IF;
    IF round((entry->>'quantity')::numeric*inventory_factor,3) IS DISTINCT FROM (entry->>'quantity')::numeric*inventory_factor OR (entry->>'quantity')::numeric*inventory_factor>1000000 THEN RAISE EXCEPTION 'الكمية لا تطابق دقة وحدة المخزون';END IF;
    product.name:=inventory->>'name';product.description:=inventory->>'description';product.price:=(inventory->>'price')::numeric;
    policy:=inventory;line_name:=inventory->>'name';line_kind:=inventory->>'kind';
    IF line_kind='product' AND NOT erp_inventory_private.sale_warehouse_allowed(p_cafe_id,wid,p_actor) THEN RAISE EXCEPTION 'Inventory warehouse write denied' USING ERRCODE='42501';END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(advanced->'excludedCategories') x WHERE x=inventory->>'categoryId' OR x=inventory->>'category') THEN RAISE EXCEPTION 'صنف البند مستبعد من الفواتير';END IF;
   ELSIF product_id IS NULL THEN$new$;
IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Inventory sales patch baseline mismatch: brand_finance_private.issue_manual_invoice_shipping_actor(uuid,boolean,uuid,uuid,integer,numeric,uuid,text)';END IF;
source:=replace(source,needle,replacement);
needle:=$old$WHERE x->>'productId'=product_id::text;catalog_price:=coalesce(catalog_price,product.price);$old$;replacement:=$new$WHERE x->>'productId'=product_id::text AND coalesce(x->>'catalogSource','menu')=CASE WHEN inventory_source THEN 'inventory' ELSE 'menu' END;
    IF inventory_source AND catalog_price IS NOT NULL THEN catalog_price:=round(catalog_price*inventory_factor/(inventory->>'saleUnitFactor')::numeric,2);END IF;
    catalog_price:=coalesce(catalog_price,product.price);$new$;
IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Inventory sales patch baseline mismatch: brand_finance_private.issue_manual_invoice_shipping_actor(uuid,boolean,uuid,uuid,integer,numeric,uuid,text)';END IF;
source:=replace(source,needle,replacement);
needle:=$old$'productId',coalesce(product_id::text,''),'name',line_name$old$;replacement:=$new$'productId',coalesce(product_id::text,''),'catalogSource',CASE WHEN inventory_source THEN 'inventory' ELSE 'menu' END,'unitName',inventory_unit,'unitFactor',inventory_factor,'name',line_name$new$;
IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Inventory sales patch baseline mismatch: brand_finance_private.issue_manual_invoice_shipping_actor(uuid,boolean,uuid,uuid,integer,numeric,uuid,text)';END IF;
source:=replace(source,needle,replacement);
needle:=$old$INSERT INTO public.bf_document_lines(id,cafe_id,document_id,product_id,name,quantity,unit_price,net,tax,cost,activity_kind,vat_rate,tax_category,exemption_reason)$old$;replacement:=$new$INSERT INTO public.bf_document_lines(id,cafe_id,document_id,product_id,name,quantity,unit_price,net,tax,cost,activity_kind,vat_rate,tax_category,exemption_reason,inventory_item_id,unit_label,stock_unit_factor)$new$;
IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Inventory sales patch baseline mismatch: brand_finance_private.issue_manual_invoice_shipping_actor(uuid,boolean,uuid,uuid,integer,numeric,uuid,text)';END IF;
source:=replace(source,needle,replacement);
needle:=$old$VALUES(line_id,p_cafe_id,doc,nullif(entry->>'productId','')::uuid,entry->>'name'$old$;replacement:=$new$VALUES(line_id,p_cafe_id,doc,CASE WHEN entry->>'catalogSource'='inventory' THEN NULL ELSE nullif(entry->>'productId','')::uuid END,entry->>'name'$new$;
IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Inventory sales patch baseline mismatch: brand_finance_private.issue_manual_invoice_shipping_actor(uuid,boolean,uuid,uuid,integer,numeric,uuid,text)';END IF;
source:=replace(source,needle,replacement);
needle:=$old$entry->>'taxCategory',entry->>'exemptionReason')
    RETURNING$old$;replacement:=$new$entry->>'taxCategory',entry->>'exemptionReason',CASE WHEN entry->>'catalogSource'='inventory' THEN (entry->>'productId')::uuid ELSE NULL END,nullif(entry->>'unitName',''),coalesce((entry->>'unitFactor')::numeric,1))
    RETURNING$new$;
IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Inventory sales patch baseline mismatch: brand_finance_private.issue_manual_invoice_shipping_actor(uuid,boolean,uuid,uuid,integer,numeric,uuid,text)';END IF;
source:=replace(source,needle,replacement);
EXECUTE source;END $patch$;
DO $patch$ DECLARE source text;needle text;replacement text;BEGIN
SELECT pg_get_functiondef('brand_finance_private.inventory_line_components()'::regprocedure) INTO source;
needle:=$old$BEGIN
 IF NEW.activity_kind=$old$;replacement:=$new$BEGIN
 IF NEW.reference_line_id IS NOT NULL THEN SELECT inventory_item_id INTO NEW.inventory_item_id FROM public.bf_document_lines WHERE cafe_id=NEW.cafe_id AND id=NEW.reference_line_id;END IF;
 IF NEW.activity_kind=$new$;
IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Inventory sales patch baseline mismatch: brand_finance_private.inventory_line_components()';END IF;
source:=replace(source,needle,replacement);
needle:=$old$NEW.cost:=0;NEW.allocated_cost:=0;NEW.item_id:=NULL;
  FOR c IN SELECT$old$;replacement:=$new$NEW.cost:=0;NEW.allocated_cost:=0;NEW.item_id:=NULL;
  IF NEW.inventory_item_id IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.erp_inventory_items m WHERE m.cafe_id=NEW.cafe_id AND m.item_id=NEW.inventory_item_id AND m.kind='product' AND m.status='active') THEN RAISE EXCEPTION 'صنف المخزون غير متاح';END IF;
   IF erp_inventory_private.unit_factor(NEW.cafe_id,NEW.inventory_item_id,NEW.unit_label) IS DISTINCT FROM NEW.stock_unit_factor THEN RAISE EXCEPTION 'تحويل وحدة المخزون غير صالح';END IF;
   q:=NEW.quantity*NEW.stock_unit_factor;
   IF q<=0 OR q<>round(q,3) OR q>1000000 THEN RAISE EXCEPTION 'كمية المخزون غير صالحة';END IF;
   SELECT * INTO s FROM public.bf_stock WHERE cafe_id=NEW.cafe_id AND item_id=NEW.inventory_item_id AND warehouse_id=doc.warehouse_id FOR UPDATE;
   status:=CASE WHEN NOT coalesce(s.cost_known,false) THEN 'unknown' WHEN coalesce(s.quantity,0)-q<0 THEN 'estimated' ELSE 'known' END;
   actual:=brand_finance_private.stock_move(NEW.cafe_id,NEW.document_id,NEW.inventory_item_id,doc.warehouse_id,-q,0);
   INSERT INTO public.bf_line_components(cafe_id,line_id,item_id,warehouse_id,quantity,cost,allocated_cost,cost_mode,allocation_divisor,cost_status)
    VALUES(NEW.cafe_id,NEW.id,NEW.inventory_item_id,doc.warehouse_id,q,actual,actual,'full',1,status);
   NEW.cost:=actual;NEW.allocated_cost:=actual;NEW.item_id:=NEW.inventory_item_id;RETURN NEW;
  END IF;
  FOR c IN SELECT$new$;
IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Inventory sales patch baseline mismatch: brand_finance_private.inventory_line_components()';END IF;
source:=replace(source,needle,replacement);
EXECUTE source;END $patch$;
DO $patch$ DECLARE source text;needle text;replacement text;BEGIN
SELECT pg_get_functiondef('brand_finance_private.invoice_advanced_validate(uuid,jsonb)'::regprocedure) INTO source;
needle:=$old$     IF NOT brand_finance_private.invoice_object_keys(y,ARRAY['productId','price']) OR NOT brand_finance_private.invoice_number_valid(y->'price',0,1000000000,2) OR NOT EXISTS(SELECT 1 FROM public.menu_products WHERE cafe_id=cafe AND id=(y->>'productId')::uuid AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Invalid listed product price' USING ERRCODE='22023';END IF;$old$;replacement:=$new$     IF NOT brand_finance_private.invoice_object_keys(y- 'catalogSource',ARRAY['productId','price']) OR coalesce(y->>'catalogSource','menu') NOT IN('menu','inventory') OR NOT brand_finance_private.invoice_number_valid(y->'price',0,1000000000,2) OR
      (CASE WHEN y->>'catalogSource'='inventory' THEN NOT EXISTS(SELECT 1 FROM public.erp_inventory_items m JOIN public.bf_items b ON b.cafe_id=m.cafe_id AND b.id=m.item_id WHERE m.cafe_id=cafe AND m.item_id=(y->>'productId')::uuid AND m.status='active' AND b.active AND NOT EXISTS(SELECT 1 FROM public.menu_products p WHERE p.cafe_id=cafe AND p.id=m.item_id)) ELSE NOT EXISTS(SELECT 1 FROM public.menu_products WHERE cafe_id=cafe AND id=(y->>'productId')::uuid AND deleted_at IS NULL) END) THEN RAISE EXCEPTION 'Invalid listed product price' USING ERRCODE='22023';END IF;$new$;
IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Inventory sales patch baseline mismatch: brand_finance_private.invoice_advanced_validate(uuid,jsonb)';END IF;
source:=replace(source,needle,replacement);
EXECUTE source;END $patch$;

-- Keep the original context contract and append ERP items with the same tenant and customer validation.
DO $$ DECLARE source text;BEGIN SELECT pg_get_functiondef('public.brand_finance_invoice_context(uuid,uuid,uuid[])'::regprocedure) INTO source;EXECUTE replace(source,'public.brand_finance_invoice_context(','erp_inventory_private.invoice_context_before_sales(');END $$;
CREATE OR REPLACE FUNCTION public.brand_finance_invoice_context(p_cafe_id uuid,p_party_id uuid DEFAULT NULL,p_product_ids uuid[] DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;menu_ids uuid[];item_ids uuid[];i uuid;v jsonb;cost numeric;known boolean;last_price numeric;f numeric;BEGIN
 IF p_product_ids IS NULL OR cardinality(p_product_ids)>500 OR array_position(p_product_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'Invalid product context' USING ERRCODE='22023';END IF;
 SELECT coalesce(array_agg(DISTINCT x),'{}') INTO item_ids FROM unnest(p_product_ids) x WHERE EXISTS(SELECT 1 FROM public.erp_inventory_items WHERE cafe_id=p_cafe_id AND item_id=x);
 SELECT coalesce(array_agg(DISTINCT x),'{}') INTO menu_ids FROM unnest(p_product_ids) x WHERE NOT(x=ANY(item_ids));
 result:=erp_inventory_private.invoice_context_before_sales(p_cafe_id,p_party_id,menu_ids);
 FOREACH i IN ARRAY item_ids LOOP
  v:=erp_inventory_private.sale_item(p_cafe_id,i);f:=(v->>'unitFactor')::numeric;
  SELECT sum(abs(quantity)*average_cost)/nullif(sum(abs(quantity)),0),count(*)>0 AND bool_and(cost_known) AND sum(quantity)>0 INTO cost,known FROM public.bf_stock WHERE cafe_id=p_cafe_id AND item_id=i AND erp_inventory_private.warehouse_allowed(p_cafe_id,warehouse_id,'read');
  SELECT l.unit_price/l.stock_unit_factor*f INTO last_price FROM public.bf_document_lines l JOIN public.bf_documents d ON d.cafe_id=l.cafe_id AND d.id=l.document_id WHERE l.cafe_id=p_cafe_id AND l.inventory_item_id=i AND d.kind='sale' AND d.party_id=p_party_id AND NOT coalesce((brand_finance_private.document_state(p_cafe_id,d.id)->>'refunded')::boolean,false) ORDER BY d.created_at DESC,d.id DESC,l.id DESC LIMIT 1;
  result:=jsonb_set(result,'{products}',(result->'products')||jsonb_build_array(jsonb_build_object('productId',i,'minimumPrice',CASE WHEN (brand_finance_private.invoice_settings(p_cafe_id)#>>'{advanced,advancedPricing}')::boolean THEN (v->>'minimumPrice')::numeric ELSE 0 END,'averageCost',CASE WHEN known THEN round(cost*f,2) ELSE NULL END,'costKnown',coalesce(known,false),'lastPrice',round(last_price,2),'kind',v->>'kind','vatRate',(v->>'vatRate')::numeric,'taxCategory',v->>'taxCategory','exemptionReason',v->>'exemptionReason')));
 END LOOP;RETURN result;END $$;
REVOKE ALL ON FUNCTION erp_inventory_private.invoice_context_before_sales(uuid,uuid,uuid[]) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
