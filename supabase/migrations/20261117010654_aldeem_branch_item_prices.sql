BEGIN;
CREATE TABLE aldeem_pos_private.branch_item_prices(
 cafe_id uuid NOT NULL,branch_id uuid NOT NULL,item_id uuid NOT NULL,
 price numeric(14,2) CHECK(price BETWEEN 0 AND 100000),
 unit_name text NOT NULL,unit_factor numeric NOT NULL CHECK(unit_factor>0),base_unit text NOT NULL,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),updated_by uuid NOT NULL REFERENCES auth.users(id),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(cafe_id,branch_id,item_id),FOREIGN KEY(branch_id,cafe_id) REFERENCES public.branches(id,cafe_id),FOREIGN KEY(cafe_id,item_id) REFERENCES public.bf_items(cafe_id,id)
);
CREATE TABLE aldeem_pos_private.branch_price_requests(
 cafe_id uuid NOT NULL,request_id uuid NOT NULL,actor uuid NOT NULL REFERENCES auth.users(id),payload jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(cafe_id,request_id)
);
ALTER TABLE aldeem_pos_private.branch_item_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE aldeem_pos_private.branch_price_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON aldeem_pos_private.branch_item_prices,aldeem_pos_private.branch_price_requests FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON aldeem_pos_private.branch_price_requests FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION aldeem_pos_private.branch_price_stale(c uuid,b uuid,i uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM aldeem_pos_private.branch_item_prices p JOIN public.bf_items x ON x.cafe_id=p.cafe_id AND x.id=p.item_id
 WHERE p.cafe_id=c AND p.branch_id=b AND p.item_id=i AND p.price IS NOT NULL AND p.base_unit IS DISTINCT FROM x.unit)
$$;
CREATE FUNCTION aldeem_pos_private.branch_price(c uuid,b uuid,i uuid,f numeric) RETURNS numeric
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT round(p.price*f/p.unit_factor,2) FROM aldeem_pos_private.branch_item_prices p JOIN public.bf_items x ON x.cafe_id=p.cafe_id AND x.id=p.item_id
 WHERE p.cafe_id=c AND p.branch_id=b AND p.item_id=i AND p.base_unit=x.unit
$$;
REVOKE ALL ON FUNCTION aldeem_pos_private.branch_price_stale(uuid,uuid,uuid),aldeem_pos_private.branch_price(uuid,uuid,uuid,numeric) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.aldeem_item_branch_price_save(p_cafe uuid,p_item uuid,p_branch uuid,p_price numeric,p_revision integer,p_unit_name text,p_unit_factor numeric,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text;scope_id uuid;v jsonb;body jsonb;prior aldeem_pos_private.branch_price_requests;old aldeem_pos_private.branch_item_prices;answer jsonb;next_revision integer;unit_base text;
BEGIN
 role_name:=aldeem_pos_private.role_for(p_cafe);
 IF role_name IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'تعديل أسعار الفروع متاح لمالك الحساب' USING ERRCODE='42501';END IF;
 scope_id:=erp_enterprise_private.branch_for(p_cafe,role_name);
 IF p_branch IS NULL OR NOT EXISTS(SELECT 1 FROM public.branches WHERE cafe_id=p_cafe AND id=p_branch AND active AND deleted_at IS NULL)
  OR scope_id IS NOT NULL AND scope_id<>p_branch OR NOT coalesce(erp_branch_private.allowed_resource(p_cafe,p_branch,'item',p_item),false) THEN
  RAISE EXCEPTION 'الصنف أو الفرع غير متاح' USING ERRCODE='42501';
 END IF;
 IF p_request IS NULL OR p_item IS NULL OR p_revision IS NULL OR p_revision<0 OR p_price IS NOT NULL AND (p_price<0 OR p_price>100000 OR p_price<>round(p_price,2))
  OR nullif(btrim(p_unit_name),'') IS NULL OR length(p_unit_name)>100 OR p_unit_factor IS NULL OR p_unit_factor<=0 OR p_unit_factor>1000000 THEN
  RAISE EXCEPTION 'راجع السعر ووحدة البيع والفرع' USING ERRCODE='22023';
 END IF;
 body:=jsonb_build_object('itemId',p_item,'branchId',p_branch,'price',p_price,'revision',p_revision,'unitName',p_unit_name,'unitFactor',p_unit_factor);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text||p_request::text,60421));
 SELECT * INTO prior FROM aldeem_pos_private.branch_price_requests WHERE cafe_id=p_cafe AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor IS DISTINCT FROM auth.uid() OR prior.payload IS DISTINCT FROM body THEN RAISE EXCEPTION 'معرف الطلب مستخدم لبيانات مختلفة' USING ERRCODE='22023';END IF;
  RETURN prior.result;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text||p_branch::text||p_item::text,60422));
 v:=erp_inventory_private.sale_item(p_cafe,p_item);
 IF v->>'kind'<>'product' OR p_unit_name IS DISTINCT FROM v->>'unitName' OR p_unit_factor IS DISTINCT FROM (v->>'unitFactor')::numeric THEN
  RAISE EXCEPTION 'تغيرت وحدة بيع الصنف حدّث البطاقة وأعد المحاولة' USING ERRCODE='40001';
 END IF;
 IF p_price IS NOT NULL AND p_price<coalesce((v->>'minimumPrice')::numeric,0) THEN RAISE EXCEPTION 'السعر أقل من الحد الأدنى للصنف' USING ERRCODE='22023';END IF;
 SELECT unit INTO STRICT unit_base FROM public.bf_items WHERE cafe_id=p_cafe AND id=p_item;
 SELECT * INTO old FROM aldeem_pos_private.branch_item_prices WHERE cafe_id=p_cafe AND branch_id=p_branch AND item_id=p_item FOR UPDATE;
 IF p_revision<>coalesce(old.revision,0) THEN RAISE EXCEPTION 'تغير سعر الفرع حدّث البطاقة قبل الحفظ' USING ERRCODE='40001';END IF;
 next_revision:=coalesce(old.revision,0)+1;
 INSERT INTO aldeem_pos_private.branch_item_prices(cafe_id,branch_id,item_id,price,unit_name,unit_factor,base_unit,revision,updated_by)
 VALUES(p_cafe,p_branch,p_item,p_price,p_unit_name,p_unit_factor,unit_base,next_revision,auth.uid())
 ON CONFLICT ON CONSTRAINT branch_item_prices_pkey DO UPDATE SET price=excluded.price,unit_name=excluded.unit_name,unit_factor=excluded.unit_factor,base_unit=excluded.base_unit,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=clock_timestamp();
 answer:=jsonb_build_object('itemId',p_item,'branchId',p_branch,'price',p_price,'revision',next_revision,'unitName',p_unit_name,'unitFactor',p_unit_factor);
 INSERT INTO aldeem_pos_private.branch_price_requests(cafe_id,request_id,actor,payload,result) VALUES(p_cafe,p_request,auth.uid(),body,answer);
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.aldeem_item_branch_price_save(uuid,uuid,uuid,numeric,integer,text,numeric,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.aldeem_item_branch_price_save(uuid,uuid,uuid,numeric,integer,text,numeric,uuid) TO authenticated;

DO $patch$ DECLARE source text;needle text;replacement text;BEGIN
 source:=pg_get_functiondef('erp_inventory_private.sale_item(uuid,uuid,text)'::regprocedure);
 needle:=$old$'price',round(coalesce((m.payload->>'salePrice')::numeric,0)*f/sale_f,2),$old$;
 replacement:=$new$'defaultPrice',round(coalesce((m.payload->>'salePrice')::numeric,0)*f/sale_f,2),
 'branchPriceStale',aldeem_pos_private.branch_price_stale(c,erp_branch_private.current_branch(c),i),
 'price',coalesce(aldeem_pos_private.branch_price(c,erp_branch_private.current_branch(c),i,f),round(coalesce((m.payload->>'salePrice')::numeric,0)*f/sale_f,2)),$new$;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Review inventory sale price baseline';END IF;
 EXECUTE replace(source,needle,replacement);

 source:=pg_get_functiondef('aldeem_pos_private.stock_product(uuid,uuid,uuid)'::regprocedure);
 needle:=$old$RETURN v||jsonb_build_object('price',coalesce(custom_price,(v->>'price')::numeric),$old$;
 replacement:=$new$RETURN v||jsonb_build_object(
  'price',coalesce(custom_price,aldeem_pos_private.branch_price(c,p.branch_id,i,(v->>'unitFactor')::numeric),(v->>'defaultPrice')::numeric),
  'priceSource',CASE WHEN custom_price IS NOT NULL THEN 'point' WHEN aldeem_pos_private.branch_price(c,p.branch_id,i,(v->>'unitFactor')::numeric) IS NOT NULL THEN 'branch' ELSE 'default' END,
  'available',custom_price IS NOT NULL OR NOT aldeem_pos_private.branch_price_stale(c,p.branch_id,i),
  'pricingError',CASE WHEN custom_price IS NULL AND aldeem_pos_private.branch_price_stale(c,p.branch_id,i) THEN 'تغيرت الوحدة الأساسية حدّث سعر الفرع من بطاقة الصنف' ELSE NULL END,$new$;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Review POS stock price baseline';END IF;
 EXECUTE replace(source,needle,replacement);

 source:=pg_get_functiondef('aldeem_pos_private.pending_stock_product(uuid,uuid,jsonb)'::regprocedure);
 needle:=$old$v:=aldeem_pos_private.stock_product(c,pid,(e->>'productId')::uuid);$old$;
 replacement:=needle||$new$
 IF NOT coalesce((v->>'available')::boolean,false) THEN RAISE EXCEPTION 'حدّث سعر الفرع بعد تغيير الوحدة الأساسية للصنف' USING ERRCODE='22023';END IF;$new$;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Review POS pending stock price baseline';END IF;
 EXECUTE replace(source,needle,replacement);

 source:=pg_get_functiondef('public.aldeem_invoice_catalog_lookup(uuid,text,uuid[])'::regprocedure);
 needle:=$old$RETURN jsonb_build_object('menu',menu,'items',items,'metas',metas,'catalogs',catalogs,'categories',categories);$old$;
 replacement:=$new$RETURN jsonb_build_object('menu',menu,'items',items,'metas',metas,'catalogs',catalogs,'categories',categories,
 'branchPrices',coalesce((SELECT jsonb_agg(jsonb_build_object('itemId',p.item_id,'price',p.price,'unitFactor',p.unit_factor,'stale',p.base_unit IS DISTINCT FROM i.unit))
 FROM aldeem_pos_private.branch_item_prices p JOIN public.bf_items i ON i.cafe_id=p.cafe_id AND i.id=p.item_id
 WHERE p.cafe_id=p_cafe_id AND p.branch_id=erp_branch_private.current_branch(p_cafe_id) AND p.item_id IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(items) x)),'[]'::jsonb));$new$;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Review Aldeem invoice catalogue price baseline';END IF;
 EXECUTE replace(source,needle,replacement);
END $patch$;
COMMIT;
