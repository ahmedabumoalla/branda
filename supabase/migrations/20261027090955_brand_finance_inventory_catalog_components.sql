BEGIN;
-- New catalogue data is additive. Posted documents, movement quantities and costs are never rewritten
CREATE TABLE public.bf_item_units(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 30),UNIQUE(cafe_id,id),UNIQUE(cafe_id,name));
ALTER TABLE public.bf_items ADD COLUMN unit_id uuid,ADD COLUMN barcode text,ADD COLUMN image_path text,
 ADD COLUMN cost_mode text NOT NULL DEFAULT 'full' CHECK(cost_mode IN('full','equal_split')),
 ADD CONSTRAINT bf_item_unit_tenant FOREIGN KEY(cafe_id,unit_id) REFERENCES public.bf_item_units(cafe_id,id),
 ADD CONSTRAINT bf_item_barcode_valid CHECK(barcode IS NULL OR barcode ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$'),
 ADD CONSTRAINT bf_item_barcode_unique UNIQUE(cafe_id,barcode),
 ADD CONSTRAINT bf_item_image_path CHECK(image_path IS NULL OR image_path ~ ('^'||cafe_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'));
CREATE TABLE public.bf_item_product_links(cafe_id uuid NOT NULL,item_id uuid NOT NULL,product_id uuid NOT NULL REFERENCES public.menu_products(id),quantity numeric(16,3) NOT NULL CHECK(quantity>0 AND quantity<>'NaN'::numeric),PRIMARY KEY(cafe_id,item_id,product_id),FOREIGN KEY(cafe_id,item_id) REFERENCES public.bf_items(cafe_id,id));
CREATE INDEX bf_item_product_lookup ON public.bf_item_product_links(cafe_id,product_id,item_id);
ALTER TABLE public.bf_document_lines ADD COLUMN allocated_cost numeric(16,2) CHECK(allocated_cost>=0 AND allocated_cost<>'NaN'::numeric),ADD CONSTRAINT bf_line_tenant_identity UNIQUE(cafe_id,id);
CREATE TABLE public.bf_line_components(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,line_id uuid NOT NULL,item_id uuid NOT NULL,warehouse_id uuid NOT NULL,
 quantity numeric(16,3) NOT NULL CHECK(quantity>0 AND quantity<>'NaN'::numeric),cost numeric(16,2) NOT NULL CHECK(cost>=0 AND cost<>'NaN'::numeric),allocated_cost numeric(16,2) NOT NULL CHECK(allocated_cost>=0 AND allocated_cost<>'NaN'::numeric),
 cost_mode text NOT NULL CHECK(cost_mode IN('full','equal_split')),allocation_divisor integer NOT NULL CHECK(allocation_divisor>0),cost_status text NOT NULL CHECK(cost_status IN('known','estimated','unknown','legacy')),
 original_component_id uuid REFERENCES public.bf_line_components(id),UNIQUE(cafe_id,line_id,item_id),
 FOREIGN KEY(cafe_id,line_id) REFERENCES public.bf_document_lines(cafe_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(cafe_id,item_id) REFERENCES public.bf_items(cafe_id,id),FOREIGN KEY(cafe_id,warehouse_id) REFERENCES public.bf_warehouses(cafe_id,id)
);
CREATE INDEX bf_components_returns ON public.bf_line_components(original_component_id) WHERE original_component_id IS NOT NULL;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['bf_item_units','bf_item_product_links','bf_line_components'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
END LOOP; END $$;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.bf_line_components FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION brand_finance_private.inventory_catalog_seed(p_cafe uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 INSERT INTO public.bf_item_units(cafe_id,name) SELECT p_cafe,v FROM unnest(ARRAY['وحدة','حبة','كيلوجرام','جرام','لتر','ملليلتر','عبوة']) v ON CONFLICT DO NOTHING;
 INSERT INTO public.bf_item_units(cafe_id,name) SELECT DISTINCT p_cafe,unit FROM public.bf_items WHERE cafe_id=p_cafe ON CONFLICT DO NOTHING;
END $$;
-- Preserve legacy unit labels and single-product consumption without rewriting posted history
INSERT INTO public.bf_item_units(cafe_id,name) SELECT DISTINCT cafe_id,unit FROM public.bf_items ON CONFLICT DO NOTHING;
UPDATE public.bf_items i SET unit_id=u.id FROM public.bf_item_units u WHERE i.cafe_id=u.cafe_id AND i.unit=u.name;
INSERT INTO public.bf_item_product_links(cafe_id,item_id,product_id,quantity) SELECT cafe_id,id,menu_product_id,1 FROM public.bf_items WHERE menu_product_id IS NOT NULL;

CREATE FUNCTION brand_finance_private.inventory_warehouse_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.cafe_id::text,60412));
 IF EXISTS(SELECT 1 FROM public.bf_warehouses WHERE cafe_id=NEW.cafe_id) AND NOT EXISTS(SELECT 1 FROM public.bf_warehouses WHERE cafe_id=NEW.cafe_id AND name=NEW.name) THEN RAISE EXCEPTION 'المتاح مستودع واحد لكل علامة'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bf_one_warehouse BEFORE INSERT ON public.bf_warehouses FOR EACH ROW EXECUTE FUNCTION brand_finance_private.inventory_warehouse_guard();
DO $$ DECLARE source text; needle text:=$s$INSERT INTO public.bf_warehouses(cafe_id,name) VALUES(p_cafe,'المخزن الرئيسي') ON CONFLICT(cafe_id,name) DO NOTHING;$s$; BEGIN
 SELECT pg_get_functiondef('brand_finance_private.seed(uuid)'::regprocedure) INTO source;
 IF strpos(source,needle)=0 THEN RAISE EXCEPTION 'Unexpected warehouse seed'; END IF;
 EXECUTE replace(source,needle,$s$INSERT INTO public.bf_warehouses(cafe_id,name) SELECT p_cafe,'المخزن الرئيسي' WHERE NOT EXISTS(SELECT 1 FROM public.bf_warehouses WHERE cafe_id=p_cafe) ON CONFLICT(cafe_id,name) DO NOTHING;$s$);
END $$;

CREATE FUNCTION public.brand_finance_inventory_unit_save(p_cafe_id uuid,p_name text,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prior public.bf_requests%ROWTYPE; result jsonb; body jsonb:=jsonb_build_object('name',p_name); saved uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 IF brand_finance_private.role_for(p_cafe_id) NOT IN('owner','manager','warehouse') THEN RAISE EXCEPTION 'لا تملك صلاحية إدارة المخزون' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR length(btrim(coalesce(p_name,''))) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'أدخل اسم وحدة صالحًا'; END IF;
 SELECT * INTO prior FROM public.bf_requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN IF prior.operation<>'inventory_unit' OR prior.payload<>body OR prior.created_by<>auth.uid() THEN RAISE EXCEPTION 'Request identifier conflict'; END IF; RETURN prior.result||'{"duplicate":true}'::jsonb; END IF;
 INSERT INTO public.bf_item_units(cafe_id,name) VALUES(p_cafe_id,btrim(p_name)) ON CONFLICT(cafe_id,name) DO UPDATE SET name=excluded.name RETURNING id INTO saved;
 result:=jsonb_build_object('id',saved,'name',btrim(p_name));
 INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by) VALUES(p_cafe_id,p_request_id,'inventory_unit',body,result,auth.uid());
 RETURN result;
END $$;

ALTER FUNCTION public.brand_finance_execute(uuid,text,jsonb,uuid) RENAME TO execute_before_inventory_catalog;
ALTER FUNCTION public.execute_before_inventory_catalog(uuid,text,jsonb,uuid) SET SCHEMA brand_finance_private;
REVOKE ALL ON FUNCTION brand_finance_private.execute_before_inventory_catalog(uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.brand_finance_execute(p_cafe_id uuid,p_operation text,p_payload jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<inventory_item>>
DECLARE old public.bf_requests%ROWTYPE; prior public.bf_items%ROWTYPE; result jsonb; saved uuid; uid uuid; unit_name text; barcode text; code text; image_path text; links jsonb; l jsonb; q numeric; product uuid; mode text;
BEGIN
 IF p_operation<>'item' THEN RETURN brand_finance_private.execute_before_inventory_catalog(p_cafe_id,p_operation,p_payload,p_request_id); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 IF brand_finance_private.role_for(p_cafe_id) NOT IN('owner','manager','warehouse') THEN RAISE EXCEPTION 'لا تملك صلاحية إدارة المخزون' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>100000 OR p_payload::text ~* '"[-+]?(nan|infinity)"' THEN RAISE EXCEPTION 'Invalid inventory command'; END IF;
 SELECT * INTO old FROM public.bf_requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN IF old.operation<>p_operation OR old.payload<>p_payload OR old.created_by<>auth.uid() THEN RAISE EXCEPTION 'Request identifier conflict'; END IF; RETURN old.result||'{"duplicate":true}'::jsonb; END IF;
 IF EXISTS(SELECT 1 FROM public.bf_settings WHERE cafe_id=p_cafe_id AND closed_through>=(now() AT TIME ZONE 'Asia/Riyadh')::date) THEN RAISE EXCEPTION 'الفترة المالية مقفلة'; END IF;
 saved:=coalesce(nullif(p_payload->>'id','')::uuid,gen_random_uuid());
 SELECT * INTO prior FROM public.bf_items WHERE cafe_id=p_cafe_id AND id=saved FOR UPDATE;
 IF p_payload ? 'id' AND NOT FOUND THEN RAISE EXCEPTION 'الصنف غير متاح'; END IF;
 PERFORM brand_finance_private.inventory_catalog_seed(p_cafe_id);
 IF nullif(p_payload->>'unitId','') IS NOT NULL THEN
  uid:=(p_payload->>'unitId')::uuid;SELECT name INTO unit_name FROM public.bf_item_units WHERE cafe_id=p_cafe_id AND id=uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'وحدة القياس غير متاحة'; END IF;
 ELSE
  unit_name:=coalesce(nullif(btrim(p_payload->>'unit'),''),prior.unit,'وحدة');
  INSERT INTO public.bf_item_units(cafe_id,name) VALUES(p_cafe_id,unit_name) ON CONFLICT(cafe_id,name) DO UPDATE SET name=excluded.name RETURNING id INTO uid;
 END IF;
 IF prior.id IS NOT NULL AND uid IS DISTINCT FROM prior.unit_id AND EXISTS(SELECT 1 FROM public.bf_movements WHERE cafe_id=p_cafe_id AND item_id=saved) THEN RAISE EXCEPTION 'لا يمكن تغيير وحدة صنف عليه حركات مخزنية'; END IF;
 barcode:=coalesce(nullif(btrim(p_payload->>'barcode'),''),prior.barcode);
 IF barcode IS NULL THEN
  FOR attempt IN 1..32 LOOP
   barcode:=lpad(floor(random()*1000000)::integer::text,6,'0');
   EXIT WHEN NOT EXISTS(SELECT 1 FROM public.bf_items i WHERE i.cafe_id=p_cafe_id AND i.barcode=inventory_item.barcode);
   barcode:=NULL;
  END LOOP;
  IF barcode IS NULL THEN
   -- A free code is zero or follows an existing code; never materialize the entire namespace
   SELECT lpad(candidate.n::text,6,'0') INTO barcode FROM (
    SELECT 0 n UNION SELECT i.barcode::integer+1 FROM public.bf_items i
    WHERE i.cafe_id=p_cafe_id AND i.barcode ~ '^[0-9]{6}$' AND i.barcode<'999999'
   ) candidate WHERE NOT EXISTS(SELECT 1 FROM public.bf_items i WHERE i.cafe_id=p_cafe_id AND i.barcode=lpad(candidate.n::text,6,'0')) ORDER BY candidate.n LIMIT 1;
  END IF;
  IF barcode IS NULL THEN RAISE EXCEPTION 'لا يتوفر باركود تلقائي أدخل باركودًا مختلفًا'; END IF;
 END IF;
 IF barcode !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$' THEN RAISE EXCEPTION 'الباركود غير صالح'; END IF;
 IF EXISTS(SELECT 1 FROM public.bf_items i WHERE i.cafe_id=p_cafe_id AND i.barcode=inventory_item.barcode AND i.id<>saved) THEN RAISE EXCEPTION 'الباركود مستخدم لصنف آخر'; END IF;
 code:=coalesce(nullif(btrim(p_payload->>'sku'),''),prior.sku,barcode);
 IF EXISTS(SELECT 1 FROM public.bf_items i WHERE i.cafe_id=p_cafe_id AND i.sku=code AND i.id<>saved) THEN RAISE EXCEPTION 'رمز الصنف مستخدم'; END IF;
 mode:=coalesce(p_payload->>'costMode',prior.cost_mode,'full');
 image_path:=CASE WHEN p_payload ? 'imagePath' THEN nullif(p_payload->>'imagePath','') ELSE prior.image_path END;
 IF p_payload ? 'productLinks' THEN links:=p_payload->'productLinks';
 ELSIF p_payload ? 'menuProductId' THEN links:=CASE WHEN nullif(p_payload->>'menuProductId','') IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('productId',p_payload->>'menuProductId','quantity',1)) END;
 ELSE SELECT coalesce(jsonb_agg(jsonb_build_object('productId',product_id,'quantity',quantity)),'[]'::jsonb) INTO links FROM public.bf_item_product_links WHERE cafe_id=p_cafe_id AND item_id=saved; END IF;
 IF jsonb_typeof(links) IS DISTINCT FROM 'array' OR jsonb_array_length(links)>200 OR (SELECT count(DISTINCT value->>'productId') FROM jsonb_array_elements(links))<>jsonb_array_length(links) THEN RAISE EXCEPTION 'روابط المنتجات غير صالحة أو مكررة'; END IF;
 INSERT INTO public.bf_items(id,cafe_id,name,sku,unit,unit_id,barcode,image_path,cost_mode,min_quantity)
 VALUES(saved,p_cafe_id,btrim(p_payload->>'name'),code,unit_name,uid,barcode,image_path,mode,coalesce((p_payload->>'minQuantity')::numeric,prior.min_quantity,0))
 ON CONFLICT(cafe_id,id) DO UPDATE SET name=excluded.name,sku=excluded.sku,unit=excluded.unit,unit_id=excluded.unit_id,barcode=excluded.barcode,image_path=excluded.image_path,cost_mode=excluded.cost_mode,min_quantity=excluded.min_quantity,menu_product_id=NULL;
 DELETE FROM public.bf_item_product_links WHERE cafe_id=p_cafe_id AND item_id=saved;
 FOR l IN SELECT value FROM jsonb_array_elements(links) LOOP
  product:=nullif(l->>'productId','')::uuid;q:=(l->>'quantity')::numeric;
  IF q IS NULL OR q<=0 OR q>1000000 OR q<>round(q,3) OR NOT EXISTS(SELECT 1 FROM public.menu_products WHERE cafe_id=p_cafe_id AND id=product AND deleted_at IS NULL) THEN RAISE EXCEPTION 'اختر منتجًا وكمية استهلاك صحيحة'; END IF;
  INSERT INTO public.bf_item_product_links(cafe_id,item_id,product_id,quantity) VALUES(p_cafe_id,saved,product,q);
 END LOOP;
 result:=jsonb_build_object('id',saved,'barcode',barcode);
 INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by) VALUES(p_cafe_id,p_request_id,p_operation,p_payload,result,auth.uid());
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_execute(uuid,text,jsonb,uuid),public.brand_finance_inventory_unit_save(uuid,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_execute(uuid,text,jsonb,uuid),public.brand_finance_inventory_unit_save(uuid,text,uuid) TO authenticated;

CREATE FUNCTION brand_finance_private.inventory_line_components() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE doc public.bf_documents%ROWTYPE; original public.bf_document_lines%ROWTYPE; c record; s public.bf_stock%ROWTYPE;
 q numeric; actual numeric; allocated numeric; divisor integer; status text; returned_menu numeric; returned_qty numeric; returned_cost numeric; returned_allocated numeric; target_qty numeric;
BEGIN
 SELECT * INTO STRICT doc FROM public.bf_documents WHERE cafe_id=NEW.cafe_id AND id=NEW.document_id;
 IF doc.kind='sale' THEN
  NEW.cost:=0;NEW.allocated_cost:=0;NEW.item_id:=NULL;
  FOR c IN SELECT l.item_id,l.quantity,i.cost_mode,(SELECT count(*) FROM public.bf_item_product_links x JOIN public.menu_products p ON p.id=x.product_id AND p.cafe_id=x.cafe_id AND p.deleted_at IS NULL WHERE x.cafe_id=l.cafe_id AND x.item_id=l.item_id) linked_count
   FROM public.bf_item_product_links l JOIN public.bf_items i ON i.id=l.item_id AND i.cafe_id=l.cafe_id AND i.active
   WHERE l.cafe_id=NEW.cafe_id AND l.product_id=NEW.product_id ORDER BY l.item_id LOOP
   q:=round(NEW.quantity*c.quantity,3);
   IF q<=0 THEN RAISE EXCEPTION 'كمية الاستهلاك أصغر من دقة الوحدة المخزنية'; END IF;
   SELECT * INTO s FROM public.bf_stock WHERE cafe_id=NEW.cafe_id AND item_id=c.item_id AND warehouse_id=doc.warehouse_id FOR UPDATE;
   status:=CASE WHEN NOT coalesce(s.cost_known,false) THEN 'unknown' WHEN coalesce(s.quantity,0)-q<0 THEN 'estimated' ELSE 'known' END;
   actual:=brand_finance_private.stock_move(NEW.cafe_id,NEW.document_id,c.item_id,doc.warehouse_id,-q,0);
   divisor:=CASE WHEN c.cost_mode='equal_split' THEN greatest(c.linked_count,1) ELSE 1 END;
   allocated:=round(actual/divisor,2);
   INSERT INTO public.bf_line_components(cafe_id,line_id,item_id,warehouse_id,quantity,cost,allocated_cost,cost_mode,allocation_divisor,cost_status)
    VALUES(NEW.cafe_id,NEW.id,c.item_id,doc.warehouse_id,q,actual,allocated,c.cost_mode,divisor,status);
   NEW.cost:=NEW.cost+actual;NEW.allocated_cost:=NEW.allocated_cost+allocated;NEW.item_id:=coalesce(NEW.item_id,c.item_id);
  END LOOP;
 ELSIF doc.kind='refund' AND NEW.reference_line_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.bf_line_components WHERE cafe_id=NEW.cafe_id AND line_id=NEW.reference_line_id) THEN
  SELECT * INTO STRICT original FROM public.bf_document_lines WHERE cafe_id=NEW.cafe_id AND id=NEW.reference_line_id;
  SELECT coalesce(sum(quantity),0) INTO returned_menu FROM public.bf_document_lines WHERE cafe_id=NEW.cafe_id AND reference_line_id=original.id;
  NEW.cost:=0;NEW.allocated_cost:=0;NEW.item_id:=original.item_id;
  FOR c IN SELECT * FROM public.bf_line_components WHERE cafe_id=NEW.cafe_id AND line_id=original.id ORDER BY item_id LOOP
   SELECT coalesce(sum(quantity),0),coalesce(sum(cost),0),coalesce(sum(allocated_cost),0) INTO returned_qty,returned_cost,returned_allocated FROM public.bf_line_components WHERE original_component_id=c.id;
   target_qty:=round(c.quantity*(returned_menu+NEW.quantity)/original.quantity,3);q:=target_qty-returned_qty;
   IF q=0 THEN CONTINUE; END IF;
   IF q<0 OR target_qty>c.quantity THEN RAISE EXCEPTION 'Component refund exceeds original consumption'; END IF;
   actual:=round(c.cost*target_qty/c.quantity,2)-returned_cost;allocated:=round(c.allocated_cost*target_qty/c.quantity,2)-returned_allocated;
   PERFORM brand_finance_private.stock_move(NEW.cafe_id,NEW.document_id,c.item_id,c.warehouse_id,q,actual/q);
   INSERT INTO public.bf_line_components(cafe_id,line_id,item_id,warehouse_id,quantity,cost,allocated_cost,cost_mode,allocation_divisor,cost_status,original_component_id)
    VALUES(NEW.cafe_id,NEW.id,c.item_id,c.warehouse_id,q,actual,allocated,c.cost_mode,c.allocation_divisor,c.cost_status,c.id);
   NEW.cost:=NEW.cost+actual;NEW.allocated_cost:=NEW.allocated_cost+allocated;
  END LOOP;
 ELSE NEW.allocated_cost:=NEW.cost;
 END IF;
 RETURN NEW;
END $$;
-- Alphabetical order places component posting before the existing cost-status trigger
CREATE TRIGGER bf_inventory_components BEFORE INSERT ON public.bf_document_lines FOR EACH ROW EXECUTE FUNCTION brand_finance_private.inventory_line_components();
DO $$ DECLARE source text; needle text; BEGIN
 SELECT pg_get_functiondef('brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid)'::regprocedure) INTO source;
 needle:='cost:=0; IF iid IS NOT NULL THEN cost:=brand_finance_private.stock_move';
 IF strpos(source,needle)=0 THEN RAISE EXCEPTION 'Unexpected sale stock posting'; END IF;
 source:=replace(source,needle,'cost:=0; IF p_operation=''purchase'' AND iid IS NOT NULL THEN cost:=brand_finance_private.stock_move');
 needle:=$s$VALUES(p_cafe_id,id,(entry->>'productId')::uuid,iid,entry->>'name',qty,price,amount,line_tax,cost);$s$;
 IF strpos(source,needle)=0 THEN RAISE EXCEPTION 'Unexpected sale line posting'; END IF;
 source:=replace(source,needle,left(needle,length(needle)-1)||' RETURNING bf_document_lines.cost INTO cost;');EXECUTE source;
 SELECT pg_get_functiondef('brand_finance_private.post_refund(uuid,jsonb,uuid)'::regprocedure) INTO source;
 needle:='IF item IS NOT NULL THEN actual_cost:=brand_finance_private.stock_move';
 IF strpos(source,needle)=0 THEN RAISE EXCEPTION 'Unexpected refund stock posting'; END IF;
 source:=replace(source,needle,$s$IF item IS NOT NULL AND NOT (original.kind='sale' AND EXISTS(SELECT 1 FROM public.bf_line_components WHERE cafe_id=p_cafe AND line_id=(entry->>'id')::uuid)) THEN actual_cost:=brand_finance_private.stock_move$s$);
 needle:=$s$VALUES(p_cafe,p_id,(entry->>'id')::uuid,(entry->>'product_id')::uuid,item,entry->>'name',qty,(entry->>'unit_price')::numeric,line_net,line_tax,line_cost);$s$;
 IF strpos(source,needle)=0 THEN RAISE EXCEPTION 'Unexpected refund line posting'; END IF;
 source:=replace(source,needle,left(needle,length(needle)-1)||' RETURNING bf_document_lines.cost INTO line_cost;');EXECUTE source;
 SELECT pg_get_functiondef('brand_finance_private.line_cost_status()'::regprocedure) INTO source;
 needle:='IF NEW.item_id IS NULL THEN';
 IF strpos(source,needle)=0 THEN RAISE EXCEPTION 'Unexpected line cost status'; END IF;
 EXECUTE replace(source,needle,$s$IF EXISTS(SELECT 1 FROM public.bf_line_components WHERE cafe_id=NEW.cafe_id AND line_id=NEW.id) THEN
 SELECT CASE WHEN bool_or(cost_status='unknown') THEN 'unknown' WHEN bool_or(cost_status='estimated') THEN 'estimated' WHEN bool_or(cost_status='legacy') THEN 'legacy' ELSE 'known' END INTO NEW.cost_status FROM public.bf_line_components WHERE cafe_id=NEW.cafe_id AND line_id=NEW.id;
 RETURN NEW; END IF;
 IF NEW.item_id IS NULL THEN$s$);
 SELECT pg_get_functiondef('brand_finance_private.stock_move(uuid,uuid,uuid,uuid,numeric,numeric)'::regprocedure) INTO source;
 needle:=$s$AND (l.cost_status IN('unknown','untracked') OR (l.cost_status='legacy' AND l.cost=0)));$s$;
 IF strpos(source,needle)=0 THEN RAISE EXCEPTION 'Unexpected refund cost provenance'; END IF;
 EXECUTE replace(source,needle,$s$AND NOT EXISTS(SELECT 1 FROM public.bf_line_components snapshot WHERE snapshot.cafe_id=l.cafe_id AND snapshot.line_id=l.id)
    AND (l.cost_status IN('unknown','untracked') OR (l.cost_status='legacy' AND l.cost=0))) AND NOT EXISTS(SELECT 1 FROM public.bf_line_components c JOIN public.bf_document_lines l ON l.cafe_id=c.cafe_id AND l.id=c.line_id WHERE c.cafe_id=p_cafe AND l.document_id=doc.reference_id AND c.item_id=p_item AND (c.cost_status='unknown' OR (c.cost_status='legacy' AND c.cost=0)));$s$);
 -- Existing cashier cost redaction must cover the new analytical amount too
 SELECT pg_get_functiondef('brand_finance_private.refund_lines(uuid,uuid,boolean)'::regprocedure) INTO source;
 source:=replace(source,$s$'{"cost":0}'::jsonb$s$,$s$'{"cost":0,"allocated_cost":0}'::jsonb$s$);EXECUTE source;
END $$;

CREATE FUNCTION brand_finance_private.inventory_catalog_items(p_cafe uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(i)-'cafe_id'||jsonb_build_object('quantity',coalesce((SELECT sum(quantity) FROM public.bf_stock WHERE cafe_id=p_cafe AND item_id=i.id),0),
 'average_cost',coalesce((SELECT coalesce(sum(abs(quantity)*average_cost)/nullif(sum(abs(quantity)),0),avg(average_cost)) FROM public.bf_stock WHERE cafe_id=p_cafe AND item_id=i.id),0),
 'cost_known',coalesce((SELECT bool_and(cost_known) FROM public.bf_stock WHERE cafe_id=p_cafe AND item_id=i.id),false),
 'product_links',coalesce((SELECT jsonb_agg(jsonb_build_object('product_id',l.product_id,'quantity',l.quantity) ORDER BY l.product_id) FROM public.bf_item_product_links l WHERE l.cafe_id=p_cafe AND l.item_id=i.id),'[]'::jsonb)) ORDER BY i.name,i.id),'[]'::jsonb) FROM public.bf_items i WHERE cafe_id=p_cafe
$$;
CREATE FUNCTION public.brand_finance_inventory_catalog(p_cafe_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF brand_finance_private.role_for(p_cafe_id) NOT IN('owner','manager','accountant','warehouse','auditor') THEN RAISE EXCEPTION 'Inventory access denied' USING ERRCODE='42501'; END IF;
 PERFORM brand_finance_private.inventory_catalog_seed(p_cafe_id);
 RETURN jsonb_build_object('items',brand_finance_private.inventory_catalog_items(p_cafe_id),'units',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name,id) FROM public.bf_item_units WHERE cafe_id=p_cafe_id),'[]'::jsonb));
END $$;
ALTER FUNCTION public.brand_finance_snapshot(uuid) RENAME TO snapshot_before_inventory_catalog;
ALTER FUNCTION public.snapshot_before_inventory_catalog(uuid) SET SCHEMA brand_finance_private;
REVOKE ALL ON FUNCTION brand_finance_private.snapshot_before_inventory_catalog(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.brand_finance_snapshot(p_cafe_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE answer jsonb; r text; products jsonb;
BEGIN
 r:=brand_finance_private.role_for(p_cafe_id);answer:=brand_finance_private.snapshot_before_inventory_catalog(p_cafe_id);
 IF r<>'cashier' THEN answer:=answer||public.brand_finance_inventory_catalog(p_cafe_id); END IF;
 SELECT coalesce(jsonb_agg(p||jsonb_build_object('stockTracked',parts.data<>'[]'::jsonb,'itemId',parts.first_item,'stock_components',parts.data,'quantity',coalesce(parts.available,0))),'[]'::jsonb) INTO products
 FROM jsonb_array_elements(answer->'products') p LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('item_id',l.item_id,'quantity',l.quantity) ORDER BY l.item_id) data,(array_agg(l.item_id ORDER BY l.item_id))[1] first_item,
   min(trunc(coalesce((SELECT sum(quantity) FROM public.bf_stock WHERE cafe_id=p_cafe_id AND item_id=l.item_id),0)/l.quantity,3)) available
  FROM public.bf_item_product_links l JOIN public.bf_items i ON i.id=l.item_id AND i.cafe_id=l.cafe_id AND i.active WHERE l.cafe_id=p_cafe_id AND l.product_id=(p->>'id')::uuid
 ) parts ON true;
 -- Empty aggregate is an explicit untracked component list, never a legacy first-item fallback
 SELECT coalesce(jsonb_agg(p||jsonb_build_object('stock_components',coalesce(nullif(p->'stock_components','null'::jsonb),'[]'::jsonb),'stockTracked',coalesce((p->>'stockTracked')::boolean,false))),'[]'::jsonb) INTO products FROM jsonb_array_elements(products) p;
 RETURN answer||jsonb_build_object('products',products);
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_snapshot(uuid),public.brand_finance_inventory_catalog(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_snapshot(uuid),public.brand_finance_inventory_catalog(uuid) TO authenticated;
REVOKE ALL ON FUNCTION brand_finance_private.inventory_catalog_seed(uuid),brand_finance_private.inventory_warehouse_guard(),brand_finance_private.inventory_line_components(),brand_finance_private.inventory_catalog_items(uuid) FROM PUBLIC,anon,authenticated,service_role;
-- Shift reporting keeps actual COGS as its primary financial result and exposes
-- allocated managerial cost separately, with every consumed component in stock detail
DO $$ DECLARE source text; needle text; BEGIN
 SELECT pg_get_functiondef('public.brand_finance_shift_analytics(uuid,uuid)'::regprocedure) INTO source;
 needle:='sum(net*direction) AS revenue,sum(cost*direction) AS cost,';
 IF strpos(source,needle)=0 THEN RAISE EXCEPTION 'Unexpected analytics product cost'; END IF;
 source:=replace(source,needle,needle||'sum(coalesce(allocated_cost,cost)*direction) AS allocated_cost,');
 needle:='coalesce(sum(net*direction),0) AS revenue,coalesce(sum(cost*direction),0) AS cost,';
 IF strpos(source,needle)=0 THEN RAISE EXCEPTION 'Unexpected analytics total cost'; END IF;
 source:=replace(source,needle,needle||'coalesce(sum(coalesce(allocated_cost,cost)*direction),0) AS allocated_cost,');
 needle:='SELECT DISTINCT l.product_key,l.item_id,s.warehouse_id';
 source:=replace(source,needle,'SELECT DISTINCT l.product_key,component.item_id,s.warehouse_id');
 needle:='FROM lines l JOIN public.bf_items i ON i.cafe_id=p_cafe_id AND i.id=l.item_id';
 IF strpos(source,needle)=0 THEN RAISE EXCEPTION 'Unexpected analytics stock detail'; END IF;
 source:=replace(source,needle,$s$FROM lines l JOIN LATERAL (
 SELECT c.item_id FROM public.bf_line_components c WHERE c.cafe_id=p_cafe_id AND c.line_id=l.id
 UNION SELECT l.item_id WHERE NOT EXISTS(SELECT 1 FROM public.bf_line_components c WHERE c.cafe_id=p_cafe_id AND c.line_id=l.id)
 ) component ON true JOIN public.bf_items i ON i.cafe_id=p_cafe_id AND i.id=component.item_id$s$);
 source:=replace(source,$s$'cost',lt.cost,'knownProfit'$s$,$s$'cost',lt.cost,'allocatedCost',lt.allocated_cost,'allocatedProfit',CASE WHEN lt.profit IS NULL THEN NULL ELSE lt.revenue-lt.allocated_cost END,'knownProfit'$s$);
 source:=replace(source,$s$'cost',p.cost,'knownProfit'$s$,$s$'cost',p.cost,'allocatedCost',p.allocated_cost,'allocatedProfit',CASE WHEN p.profit IS NULL THEN NULL ELSE p.revenue-p.allocated_cost END,'knownProfit'$s$);
 EXECUTE source;
END $$;
CREATE POLICY bf_inventory_images_server_only ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated USING(bucket_id<>'bf-inventory-images') WITH CHECK(bucket_id<>'bf-inventory-images');
NOTIFY pgrst,'reload schema';
COMMIT;
