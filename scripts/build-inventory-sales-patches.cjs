// Generates guarded, narrow edits against the read-only extracted live definitions.
const fs=require('node:fs');
const file='supabase/migrations/20261113114934_erp_inventory_sales.sql';
let sql=fs.readFileSync(file,'utf8').split('-- GENERATED GUARDED PATCHES')[0];
sql+='\n-- GENERATED GUARDED PATCHES\n';
function patch(signature,sourceFile,changes){
 let source=fs.readFileSync(sourceFile,'utf8');
 sql+=`DO $patch$ DECLARE source text;needle text;replacement text;BEGIN\nSELECT pg_get_functiondef('${signature}'::regprocedure) INTO source;\n`;
 for(const [needle,replacement] of changes){
  if(source.split(needle).length!==2)throw Error('Nonunique anchor '+signature+' '+needle.slice(0,90));
  source=source.replace(needle,replacement);
  sql+=`needle:=$old$${needle}$old$;replacement:=$new$${replacement}$new$;\nIF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Inventory sales patch baseline mismatch: ${signature}';END IF;\nsource:=replace(source,needle,replacement);\n`;
 }
 sql+='EXECUTE source;END $patch$;\n';
 fs.writeFileSync('output/erp-database/inventory-sales-patched-'+signature.split('(')[0].replaceAll('.','-')+'.sql',source);
}
const issuerChanges=[
 ['DECLARE draft public.bf_invoice_drafts%ROWTYPE;',"DECLARE inventory jsonb;inventory_factor numeric;inventory_unit text;inventory_source boolean;draft public.bf_invoice_drafts%ROWTYPE;"],
 ["product:=NULL;policy:=NULL;product_id:=nullif(entry->>'productId','')::uuid;\n   IF product_id IS NULL THEN",`product:=NULL;policy:=NULL;product_id:=nullif(entry->>'productId','')::uuid;inventory:=NULL;inventory_factor:=1;inventory_unit:='';
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
   ELSIF product_id IS NULL THEN`],
 ["WHERE x->>'productId'=product_id::text;catalog_price:=coalesce(catalog_price,product.price);",`WHERE x->>'productId'=product_id::text AND coalesce(x->>'catalogSource','menu')=CASE WHEN inventory_source THEN 'inventory' ELSE 'menu' END;
    IF inventory_source AND catalog_price IS NOT NULL THEN catalog_price:=round(catalog_price*inventory_factor/(inventory->>'saleUnitFactor')::numeric,2);END IF;
    catalog_price:=coalesce(catalog_price,product.price);`],
 ["'productId',coalesce(product_id::text,''),'name',line_name", "'productId',coalesce(product_id::text,''),'catalogSource',CASE WHEN inventory_source THEN 'inventory' ELSE 'menu' END,'unitName',inventory_unit,'unitFactor',inventory_factor,'name',line_name"],
 ["INSERT INTO public.bf_document_lines(id,cafe_id,document_id,product_id,name,quantity,unit_price,net,tax,cost,activity_kind,vat_rate,tax_category,exemption_reason)","INSERT INTO public.bf_document_lines(id,cafe_id,document_id,product_id,name,quantity,unit_price,net,tax,cost,activity_kind,vat_rate,tax_category,exemption_reason,inventory_item_id,unit_label,stock_unit_factor)"],
 ["VALUES(line_id,p_cafe_id,doc,nullif(entry->>'productId','')::uuid,entry->>'name'", "VALUES(line_id,p_cafe_id,doc,CASE WHEN entry->>'catalogSource'='inventory' THEN NULL ELSE nullif(entry->>'productId','')::uuid END,entry->>'name'"],
 ["entry->>'taxCategory',entry->>'exemptionReason')\n    RETURNING", "entry->>'taxCategory',entry->>'exemptionReason',CASE WHEN entry->>'catalogSource'='inventory' THEN (entry->>'productId')::uuid ELSE NULL END,nullif(entry->>'unitName',''),coalesce((entry->>'unitFactor')::numeric,1))\n    RETURNING"],
];
for(const name of ['issue_company_invoice_actor','issue_manual_invoice_shipping_actor'])patch('brand_finance_private.'+name+'(uuid,boolean,uuid,uuid,integer,numeric,uuid,text)','output/erp-database/inventory-sales-brand_finance_private-'+name+'.sql',issuerChanges);
patch('brand_finance_private.inventory_line_components()','output/erp-database/inventory-sales-brand_finance_private-inventory_line_components.sql',[
 ['BEGIN\n IF NEW.activity_kind=',`BEGIN
 IF NEW.reference_line_id IS NOT NULL THEN SELECT inventory_item_id INTO NEW.inventory_item_id FROM public.bf_document_lines WHERE cafe_id=NEW.cafe_id AND id=NEW.reference_line_id;END IF;
 IF NEW.activity_kind=`],
 ['NEW.cost:=0;NEW.allocated_cost:=0;NEW.item_id:=NULL;\n  FOR c IN SELECT',`NEW.cost:=0;NEW.allocated_cost:=0;NEW.item_id:=NULL;
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
  FOR c IN SELECT`],
]);
const validator=fs.readFileSync('output/erp-database/inventory-sales-validator-definition.sql','utf8');
const old=validator.split('\n').find(line=>line.includes("invoice_object_keys(y,ARRAY['productId','price'])"));
patch('brand_finance_private.invoice_advanced_validate(uuid,jsonb)','output/erp-database/inventory-sales-validator-definition.sql',[[old,`     IF NOT brand_finance_private.invoice_object_keys(y- 'catalogSource',ARRAY['productId','price']) OR coalesce(y->>'catalogSource','menu') NOT IN('menu','inventory') OR NOT brand_finance_private.invoice_number_valid(y->'price',0,1000000000,2) OR
      (CASE WHEN y->>'catalogSource'='inventory' THEN NOT EXISTS(SELECT 1 FROM public.erp_inventory_items m JOIN public.bf_items b ON b.cafe_id=m.cafe_id AND b.id=m.item_id WHERE m.cafe_id=cafe AND m.item_id=(y->>'productId')::uuid AND m.status='active' AND b.active AND NOT EXISTS(SELECT 1 FROM public.menu_products p WHERE p.cafe_id=cafe AND p.id=m.item_id)) ELSE NOT EXISTS(SELECT 1 FROM public.menu_products WHERE cafe_id=cafe AND id=(y->>'productId')::uuid AND deleted_at IS NULL) END) THEN RAISE EXCEPTION 'Invalid listed product price' USING ERRCODE='22023';END IF;`]]);
sql+=`\n-- Keep the original context contract and append ERP items with the same tenant and customer validation.
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
COMMIT;\n`;
fs.writeFileSync(file,sql);
console.log('Generated guarded inventory sales patches');
