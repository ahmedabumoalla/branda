-- Butcher product measures and shift-optional POS; other business categories retain their contracts
BEGIN;
ALTER TABLE public.menu_products ADD COLUMN butcher_details jsonb;
ALTER TABLE public.menu_products ALTER COLUMN price TYPE numeric(18,6);
ALTER TABLE public.bf_document_lines ALTER COLUMN unit_price TYPE numeric(18,6),
 ADD COLUMN unit_id text, ADD COLUMN unit_label text,
 ADD COLUMN stock_unit_factor numeric(18,6) NOT NULL DEFAULT 1 CHECK(stock_unit_factor>0);

CREATE FUNCTION brand_finance_private.validate_butcher_product() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE unit jsonb; unit_ids text[]:='{}'; unit_labels text[]:='{}'; label text; amount numeric; category text;
BEGIN
 IF TG_OP='UPDATE' AND (OLD.butcher_details->'units'->0->>'id') IS DISTINCT FROM (NEW.butcher_details->'units'->0->>'id')
 AND EXISTS(SELECT 1 FROM public.bf_item_product_links l WHERE l.cafe_id=NEW.cafe_id AND l.product_id=NEW.id) THEN
  RAISE EXCEPTION 'وحدة المنتج الأساسية مرتبطة بالمخزون احتفظ بها أول وحدة أو أزل ارتباط المخزون قبل تغييرها';
 END IF;
 IF NEW.butcher_details IS NULL THEN RETURN NEW; END IF;
 SELECT business_category INTO category FROM public.cafes WHERE id=NEW.cafe_id;
 IF category IS DISTINCT FROM 'butcher_shops' THEN RAISE EXCEPTION 'تفاصيل اللحوم متاحة لحساب الملحمة فقط'; END IF;
 IF jsonb_typeof(NEW.butcher_details) IS DISTINCT FROM 'object'
 OR NEW.butcher_details->>'meatType' IS NULL OR NEW.butcher_details->>'meatType' NOT IN('calf','sheep','camel','goat')
 OR jsonb_typeof(NEW.butcher_details->'units') IS DISTINCT FROM 'array'
 OR jsonb_array_length(NEW.butcher_details->'units') NOT BETWEEN 1 AND 24
 OR (NEW.butcher_details->'origin' IS NOT NULL AND NEW.butcher_details->'origin'<>'null'::jsonb AND (jsonb_typeof(NEW.butcher_details->'origin')<>'string' OR length(btrim(NEW.butcher_details->>'origin')) NOT BETWEEN 1 AND 60)) THEN
  RAISE EXCEPTION 'أدخل نوع اللحم ووحدات البيع وأسعارها بشكل صحيح';
 END IF;
 FOR unit IN SELECT value FROM jsonb_array_elements(NEW.butcher_details->'units') LOOP
  IF jsonb_typeof(unit) IS DISTINCT FROM 'object' OR jsonb_typeof(unit->'id') IS DISTINCT FROM 'string'
  OR (unit->>'id' NOT IN('kg','g','carcass','half','quarter') AND unit->>'id' !~ '^custom_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
  OR unit->>'id'=ANY(unit_ids) OR jsonb_typeof(unit->'label') IS DISTINCT FROM 'string'
  OR length(btrim(unit->>'label')) NOT BETWEEN 1 AND 60 OR jsonb_typeof(unit->'price') IS DISTINCT FROM 'number' THEN
   RAISE EXCEPTION 'راجع أسماء وحدات البيع ومنع تكرارها';
  END IF;
  label:=CASE unit->>'id' WHEN 'kg' THEN 'كيلو' WHEN 'g' THEN 'جرام' WHEN 'carcass' THEN 'ذبيحة' WHEN 'half' THEN 'نصف ذبيحة' WHEN 'quarter' THEN 'ربع ذبيحة' ELSE btrim(unit->>'label') END;
  IF unit->>'label'<>label THEN RAISE EXCEPTION 'اسم وحدة البيع لا يطابق نوعها'; END IF;
  IF lower(label)=ANY(unit_labels) THEN RAISE EXCEPTION 'أسماء وحدات البيع يجب أن تكون مختلفة'; END IF;
  amount:=(unit->>'price')::numeric;
  IF amount<=0 OR amount>1000000 OR amount<>round(amount,6) THEN RAISE EXCEPTION 'أدخل سعرًا صحيحًا لكل وحدة بيع'; END IF;
  unit_ids:=array_append(unit_ids,unit->>'id');
  unit_labels:=array_append(unit_labels,lower(label));
 END LOOP;
 -- Store the displayed default price with its full gram precision
 NEW.price:=(NEW.butcher_details->'units'->0->>'price')::numeric;
 RETURN NEW;
END $$;
CREATE TRIGGER menu_product_butcher_details BEFORE INSERT OR UPDATE OF butcher_details,price,cafe_id ON public.menu_products
 FOR EACH ROW EXECUTE FUNCTION brand_finance_private.validate_butcher_product();
REVOKE ALL ON FUNCTION brand_finance_private.validate_butcher_product() FROM PUBLIC,anon,authenticated,service_role;

-- Only compatible dimensions can share an inventory recipe; a carcass has no invented weight
CREATE FUNCTION brand_finance_private.butcher_stock_factor(p_base text,p_selected text) RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN p_base=p_selected THEN 1::numeric
 WHEN p_base IN('kg','g') AND p_selected IN('kg','g') THEN
  (CASE p_selected WHEN 'kg' THEN 1000 ELSE 1 END)::numeric/(CASE p_base WHEN 'kg' THEN 1000 ELSE 1 END)
 WHEN p_base IN('carcass','half','quarter') AND p_selected IN('carcass','half','quarter') THEN
  (CASE p_selected WHEN 'carcass' THEN 1 WHEN 'half' THEN 0.5 ELSE 0.25 END)/(CASE p_base WHEN 'carcass' THEN 1 WHEN 'half' THEN 0.5 ELSE 0.25 END)
 ELSE NULL END
$$;
REVOKE ALL ON FUNCTION brand_finance_private.butcher_stock_factor(text,text) FROM PUBLIC,anon,authenticated,service_role;

DO $migration$
DECLARE source text; old text; replacement text;
BEGIN
 SELECT pg_get_functiondef('brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid)'::regprocedure) INTO source;
 old:='DECLARE approval public.bf_refund_requests%ROWTYPE;';
 IF strpos(source,old)=0 THEN RAISE EXCEPTION 'Butcher core declaration anchor changed'; END IF;
 source:=replace(source,old,'DECLARE is_butcher boolean; butcher_unit jsonb; butcher_factor numeric; '||substr(old,9));
 old:='r:=brand_finance_private.role_for(p_cafe_id);';
 IF strpos(source,old)=0 THEN RAISE EXCEPTION 'Butcher category authority anchor changed'; END IF;
 source:=replace(source,old,old||E'\n SELECT coalesce(business_category=''butcher_shops'',false) INTO is_butcher FROM public.cafes WHERE cafes.id=p_cafe_id;');
 old:='IF sh.id IS NULL THEN RAISE EXCEPTION ''ابدأ وردية قبل تسجيل المبيعات''; END IF;';
 IF strpos(source,old)=0 THEN RAISE EXCEPTION 'Butcher shift contract anchor changed'; END IF;
 replacement:=$patch$IF sh.id IS NULL THEN
    IF NOT is_butcher OR sid IS NOT NULL THEN RAISE EXCEPTION 'ابدأ وردية قبل تسجيل المبيعات'; END IF;
    IF EXISTS(SELECT 1 FROM public.bf_shifts active_shift WHERE active_shift.cafe_id=p_cafe_id AND active_shift.user_id=auth.uid() AND active_shift.status IN('open','handover')) THEN
     RAISE EXCEPTION 'لديك وردية قائمة حدث الكاشير وأكمل البيع من ورديتك';
    END IF;
    IF aid IS NULL THEN RAISE EXCEPTION 'اختر حساب استلام قيمة البيع'; END IF;
    IF EXISTS(SELECT 1 FROM public.bf_accounts a WHERE a.id=aid AND a.kind='cash') AND
       (NOT EXISTS(SELECT 1 FROM public.bf_accounts a WHERE a.id=aid AND a.cafe_id=p_cafe_id AND a.is_cashier_drawer AND a.active)
        OR EXISTS(SELECT 1 FROM public.bf_shifts held WHERE held.cafe_id=p_cafe_id AND held.account_id=aid AND held.status IN('open','handover'))) THEN
     RAISE EXCEPTION 'اختر صندوق كاشير متاحًا لا يرتبط بوردية أخرى';
    END IF;
   END IF;$patch$;
 source:=replace(source,old,replacement);
 old:='SELECT mp.id,mp.name,mp.price,bi.id item_id INTO prod';
 IF strpos(source,old)=0 THEN RAISE EXCEPTION 'Butcher product lookup anchor changed'; END IF;
 source:=replace(source,old,'SELECT mp.id,mp.name,mp.price,mp.butcher_details,bi.id item_id INTO prod');
 old:='IF prod.id IS NULL THEN RAISE EXCEPTION ''الصنف غير متاح للبيع''; END IF; price:=prod.price; iid:=prod.item_id;';
 IF strpos(source,old)=0 THEN RAISE EXCEPTION 'Butcher unit pricing anchor changed'; END IF;
 source:=replace(source,old,old||$patch$
    butcher_unit:=NULL; butcher_factor:=1;
    IF is_butcher AND prod.butcher_details IS NOT NULL THEN
     SELECT value INTO butcher_unit FROM jsonb_array_elements(prod.butcher_details->'units') WHERE value->>'id'=entry->>'unitId';
     IF butcher_unit IS NULL THEN RAISE EXCEPTION 'اختر وحدة بيع متاحة لهذا المنتج'; END IF;
     price:=(butcher_unit->>'price')::numeric;
     prod.name:=prod.name||' · '||(butcher_unit->>'label');
     butcher_factor:=brand_finance_private.butcher_stock_factor(prod.butcher_details->'units'->0->>'id',butcher_unit->>'id');
     IF butcher_factor IS NULL AND EXISTS(SELECT 1 FROM public.bf_item_product_links l JOIN public.bf_items i ON i.id=l.item_id AND i.cafe_id=l.cafe_id AND i.active WHERE l.cafe_id=p_cafe_id AND l.product_id=prod.id) THEN
      RAISE EXCEPTION 'وحدة البيع لا تتوافق مع وحدة المنتج المرتبط بالمخزون';
     END IF;
     butcher_factor:=coalesce(butcher_factor,1);
    ELSIF nullif(entry->>'unitId','') IS NOT NULL THEN RAISE EXCEPTION 'هذا المنتج لا يدعم وحدة البيع المحددة';
    END IF;
$patch$);
 old:='''quantity'',qty,''price'',price));';
 IF strpos(source,old)=0 THEN RAISE EXCEPTION 'Butcher immutable unit snapshot anchor changed'; END IF;
 source:=replace(source,old,'''quantity'',qty,''price'',price,''unitId'',CASE WHEN p_operation=''sale'' THEN butcher_unit->>''id'' END,''unitLabel'',CASE WHEN p_operation=''sale'' THEN butcher_unit->>''label'' END,''stockUnitFactor'',CASE WHEN p_operation=''sale'' THEN coalesce(butcher_factor,1) ELSE 1 END));');
 old:='CASE WHEN p_operation=''sale'' THEN brand_finance_private.customer_phone(p_payload->>''customerPhone'') END';
 IF strpos(source,old)=0 THEN RAISE EXCEPTION 'Butcher customer phone guard anchor changed'; END IF;
 source:=replace(source,old,'CASE WHEN p_operation=''sale'' AND NOT is_butcher THEN brand_finance_private.customer_phone(p_payload->>''customerPhone'') END');
 old:='IF p_operation=''sale'' AND (nullif(btrim(p_payload->>''customerPhone''),'''') IS NOT NULL';
 IF strpos(source,old)=0 THEN RAISE EXCEPTION 'Butcher customer effect guard anchor changed'; END IF;
 source:=replace(source,old,'IF p_operation=''sale'' AND NOT is_butcher AND (nullif(btrim(p_payload->>''customerPhone''),'''') IS NOT NULL');
 old:='INSERT INTO public.bf_document_lines(cafe_id,document_id,product_id,item_id,name,quantity,unit_price,net,tax,cost) VALUES(p_cafe_id,id,(entry->>''productId'')::uuid,iid,entry->>''name'',qty,price,amount,line_tax,cost)';
 IF strpos(source,old)=0 THEN RAISE EXCEPTION 'Butcher line insert anchor changed'; END IF;
 source:=replace(source,old,'INSERT INTO public.bf_document_lines(cafe_id,document_id,product_id,item_id,name,quantity,unit_price,net,tax,cost,unit_id,unit_label,stock_unit_factor) VALUES(p_cafe_id,id,(entry->>''productId'')::uuid,iid,entry->>''name'',qty,price,amount,line_tax,cost,entry->>''unitId'',entry->>''unitLabel'',coalesce((entry->>''stockUnitFactor'')::numeric,1))');
 EXECUTE source;

 SELECT pg_get_functiondef('brand_finance_private.inventory_line_components()'::regprocedure) INTO source;
 old:='q:=round(NEW.quantity*c.quantity,3);';
 IF strpos(source,old)=0 THEN RAISE EXCEPTION 'Butcher stock consumption anchor changed'; END IF;
 source:=replace(source,old,'q:=round(NEW.quantity*c.quantity*NEW.stock_unit_factor,3);');
 old:='SELECT * INTO STRICT original FROM public.bf_document_lines WHERE cafe_id=NEW.cafe_id AND id=NEW.reference_line_id;';
 IF strpos(source,old)=0 THEN RAISE EXCEPTION 'Butcher refund lineage anchor changed'; END IF;
 source:=replace(source,old,old||' NEW.unit_id:=original.unit_id; NEW.unit_label:=original.unit_label; NEW.stock_unit_factor:=original.stock_unit_factor;');
 -- Untracked returns also retain their exact original measure
 old:='ELSE NEW.allocated_cost:=NEW.cost;';
 IF strpos(source,old)=0 THEN RAISE EXCEPTION 'Butcher untracked return anchor changed'; END IF;
 source:=replace(source,old,$patch$ELSE
  IF doc.kind='refund' AND NEW.reference_line_id IS NOT NULL THEN
   SELECT * INTO STRICT original FROM public.bf_document_lines WHERE cafe_id=NEW.cafe_id AND id=NEW.reference_line_id;
   NEW.unit_id:=original.unit_id; NEW.unit_label:=original.unit_label; NEW.stock_unit_factor:=original.stock_unit_factor;
  END IF;
  NEW.allocated_cost:=NEW.cost;$patch$);
 EXECUTE source;

 SELECT pg_get_functiondef('brand_finance_private.refund_quote(uuid,jsonb)'::regprocedure) INTO source;
 old:='ELSIF nullif(p_payload->>''shiftId'','''') IS NOT NULL OR r=''cashier'' THEN RAISE EXCEPTION ''اختر وردية مفتوحة تابعة للكاشير لصرف المرتجع النقدي''; END IF;';
 IF strpos(source,old)=0 THEN RAISE EXCEPTION 'Butcher shiftless refund anchor changed'; END IF;
 source:=replace(source,old,$patch$ELSIF nullif(p_payload->>'shiftId','') IS NOT NULL OR (r='cashier' AND NOT EXISTS(SELECT 1 FROM public.cafes c JOIN public.bf_accounts a ON a.cafe_id=c.id WHERE c.id=p_cafe AND c.business_category='butcher_shops' AND a.id=aid AND a.is_cashier_drawer AND a.active)) THEN RAISE EXCEPTION 'اختر وردية مفتوحة تابعة للكاشير لصرف المرتجع النقدي'; END IF;$patch$);
 EXECUTE source;

 SELECT pg_get_functiondef('public.brand_finance_context(text)'::regprocedure) INTO source;
 old:='''slug'',c.slug,''role'',r';
 IF strpos(source,old)=0 THEN RAISE EXCEPTION 'Butcher context category anchor changed'; END IF;
 EXECUTE replace(source,old,'''slug'',c.slug,''role'',r,''businessCategory'',c.business_category');

 SELECT pg_get_functiondef('brand_finance_private.snapshot_before_job_roles(uuid)'::regprocedure) INTO source;
 old:='''id'',id,''name'',name,''slug'',slug';
 IF strpos(source,old)=0 THEN RAISE EXCEPTION 'Butcher snapshot category anchor changed'; END IF;
 source:=replace(source,old,'''id'',id,''name'',name,''slug'',slug,''businessCategory'',business_category');
 old:='''id'',p.id,''name'',p.name,''price'',p.price';
 IF strpos(source,old)=0 THEN RAISE EXCEPTION 'Butcher snapshot units anchor changed'; END IF;
 source:=replace(source,old,old||',''butcherDetails'',p.butcher_details');
 old:='to_jsonb(d)-''cafe_id''-''created_by''';
 IF strpos(source,old)=0 THEN RAISE EXCEPTION 'Butcher own sale history anchor changed'; END IF;
 source:=replace(source,old,'to_jsonb(d)-''cafe_id''');
 old:='to_jsonb(a)-''cafe_id''||jsonb_build_object(''balance'',CASE WHEN managed';
 IF strpos(source,old)=0 THEN RAISE EXCEPTION 'Butcher eligible drawer snapshot anchor changed'; END IF;
 source:=replace(source,old,'to_jsonb(a)-''cafe_id''||jsonb_build_object(''availableWithoutShift'',a.is_cashier_drawer AND NOT EXISTS(SELECT 1 FROM public.bf_shifts held WHERE held.cafe_id=p_cafe_id AND held.account_id=a.id AND held.status IN(''open'',''handover'')),''balance'',CASE WHEN managed');
 EXECUTE source;
END $migration$;
NOTIFY pgrst,'reload schema';
COMMIT;
