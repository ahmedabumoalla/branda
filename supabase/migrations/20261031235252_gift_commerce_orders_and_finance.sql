BEGIN;
SET LOCAL lock_timeout='5s';
CREATE SCHEMA gift_commerce_private;
REVOKE ALL ON SCHEMA gift_commerce_private FROM PUBLIC;
GRANT USAGE ON SCHEMA gift_commerce_private TO authenticated;
ALTER TABLE public.menu_products ADD COLUMN commerce_details jsonb NOT NULL DEFAULT '{}'::jsonb
 CHECK(jsonb_typeof(commerce_details)='object' AND octet_length(commerce_details::text)<=100000);
ALTER TABLE public.cafes DROP CONSTRAINT IF EXISTS cafes_business_category_check;
ALTER TABLE public.cafes ADD CONSTRAINT cafes_business_category_check CHECK(business_category IN(
 'cafes_coffee','restaurants','massage_centers','beauty_centers','hair_salons','clinics_health_centers',
 'gyms_fitness','retail_stores','clothing_stores','furniture','events_conferences','gifts_flowers')) NOT VALID;
ALTER TABLE public.cafes VALIDATE CONSTRAINT cafes_business_category_check;

ALTER TABLE public.category_default_plans DROP CONSTRAINT category_default_plans_category_check;
ALTER TABLE public.category_default_plans ADD CONSTRAINT category_default_plans_category_check
 CHECK(category_id IN('cafes_coffee','restaurants','hair_salons','events_conferences','gifts_flowers'));
DO $$ DECLARE src text; needle text:='NOT IN (''cafes_coffee'',''restaurants'',''hair_salons'')'; BEGIN
 SELECT pg_get_functiondef('public.admin_prepare_brand_account(uuid,uuid,jsonb,text,text)'::regprocedure) INTO src;
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'Unexpected onboarding category guard';END IF;
 EXECUTE replace(src,needle,'NOT IN (''cafes_coffee'',''restaurants'',''hair_salons'',''gifts_flowers'')');
END $$;

CREATE TABLE public.gift_store_settings(
 cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id), enabled boolean NOT NULL DEFAULT false,
 delivery_enabled boolean NOT NULL DEFAULT true,pickup_enabled boolean NOT NULL DEFAULT false,
 delivery_fee numeric(12,2) NOT NULL DEFAULT 25 CHECK(delivery_fee BETWEEN 0 AND 10000),
 payment_methods text[] NOT NULL DEFAULT ARRAY['cod','bank_transfer']::text[] CHECK(cardinality(payment_methods) BETWEEN 1 AND 2 AND payment_methods<@ARRAY['cod','bank_transfer']::text[]),
 pickup_location text NOT NULL DEFAULT '' CHECK(length(pickup_location)<=1000),delivery_notes text NOT NULL DEFAULT '' CHECK(length(delivery_notes)<=1000),bank_instructions text NOT NULL DEFAULT '' CHECK(length(bank_instructions)<=2000),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.gift_orders(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),number bigint GENERATED ALWAYS AS IDENTITY,
 request_id uuid NOT NULL,request_fingerprint text NOT NULL,tracking_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 customer_name text NOT NULL CHECK(length(customer_name) BETWEEN 2 AND 120),phone text NOT NULL CHECK(phone~'^9665[0-9]{8}$'),
 fulfillment text NOT NULL CHECK(fulfillment IN('delivery','pickup')),city text NOT NULL DEFAULT '' CHECK(length(city)<=100),address text NOT NULL DEFAULT '' CHECK(length(address)<=1000),
 gift_message text NOT NULL DEFAULT '' CHECK(length(gift_message)<=1000),notes text NOT NULL DEFAULT '' CHECK(length(notes)<=1000),
 payment_method text NOT NULL CHECK(payment_method IN('cod','bank_transfer')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','quote_requested','accepted','preparing','ready','completed','cancelled','refunded')),
 payment_status text NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN('unpaid','paid','partially_refunded','refunded')),
 subtotal numeric(16,2) NOT NULL CHECK(subtotal>=0),delivery_fee numeric(12,2) NOT NULL CHECK(delivery_fee>=0),tax numeric(16,2) NOT NULL CHECK(tax>=0),total numeric(16,2) NOT NULL CHECK(total>=0),
 vat_rate numeric(5,2) NOT NULL CHECK(vat_rate BETWEEN 0 AND 100),tax_inclusive boolean NOT NULL,
 finance_document_id uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(cafe_id,id),UNIQUE(cafe_id,request_id),UNIQUE(cafe_id,finance_document_id),
 FOREIGN KEY(cafe_id,finance_document_id) REFERENCES public.bf_documents(cafe_id,id)
);
CREATE INDEX gift_orders_cafe_created ON public.gift_orders(cafe_id,created_at DESC,id);
CREATE INDEX gift_orders_phone_created ON public.gift_orders(cafe_id,phone,created_at DESC);
CREATE TABLE public.gift_order_lines(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,order_id uuid NOT NULL,product_id uuid NOT NULL,
 name text NOT NULL,catalog_kind text NOT NULL CHECK(catalog_kind IN('product','service')),option_id text,
 selections jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(selections)='array'),
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 99),unit_price numeric(16,2) NOT NULL CHECK(unit_price>=0),line_total numeric(16,2) NOT NULL CHECK(line_total>=0),
 stock_tracked boolean NOT NULL DEFAULT false,FOREIGN KEY(cafe_id,order_id) REFERENCES public.gift_orders(cafe_id,id),FOREIGN KEY(product_id) REFERENCES public.menu_products(id)
);
ALTER TABLE public.gift_order_lines ADD COLUMN finance_line_id uuid UNIQUE REFERENCES public.bf_document_lines(id);
CREATE INDEX gift_order_lines_order ON public.gift_order_lines(cafe_id,order_id);
CREATE INDEX gift_order_lines_product ON public.gift_order_lines(product_id,option_id,order_id);
CREATE TABLE public.gift_order_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,order_id uuid NOT NULL,request_id uuid NOT NULL,
 action text NOT NULL,payload jsonb NOT NULL DEFAULT '{}',actor_id uuid REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(cafe_id,request_id),FOREIGN KEY(cafe_id,order_id) REFERENCES public.gift_orders(cafe_id,id)
);
CREATE INDEX gift_order_events_order ON public.gift_order_events(cafe_id,order_id,created_at);
CREATE TABLE gift_commerce_private.rate_limits(key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX gift_rate_limits_key_time ON gift_commerce_private.rate_limits(key,created_at);

CREATE FUNCTION gift_commerce_private.can_manage(p_cafe uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active')
 AND EXISTS(SELECT 1 FROM public.cafes c WHERE c.id=p_cafe AND c.business_category='gifts_flowers' AND c.status IN('active','published') AND c.deleted_at IS NULL)
 AND platform_access_private.service_enabled(p_cafe,'menu')
 AND (public.is_platform_admin() OR public.is_cafe_owner(p_cafe) OR EXISTS(SELECT 1 FROM public.cafe_members m WHERE m.cafe_id=p_cafe AND m.user_id=auth.uid() AND m.role='manager'))
$$;
REVOKE ALL ON FUNCTION gift_commerce_private.can_manage(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION gift_commerce_private.can_manage(uuid) TO authenticated;
ALTER TABLE public.gift_store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_commerce_private.rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY gift_settings_owner ON public.gift_store_settings FOR SELECT TO authenticated USING(gift_commerce_private.can_manage(cafe_id));
CREATE POLICY gift_orders_owner ON public.gift_orders FOR SELECT TO authenticated USING(gift_commerce_private.can_manage(cafe_id));
CREATE POLICY gift_lines_owner ON public.gift_order_lines FOR SELECT TO authenticated USING(gift_commerce_private.can_manage(cafe_id));
CREATE POLICY gift_events_owner ON public.gift_order_events FOR SELECT TO authenticated USING(gift_commerce_private.can_manage(cafe_id));
REVOKE ALL ON public.gift_store_settings,public.gift_orders,public.gift_order_lines,public.gift_order_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.gift_store_settings,public.gift_orders,public.gift_order_lines,public.gift_order_events TO authenticated;
GRANT ALL ON public.gift_store_settings,public.gift_orders,public.gift_order_lines,public.gift_order_events TO service_role;

CREATE FUNCTION public.gift_store_config(p_slug text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid;s public.gift_store_settings%ROWTYPE;v numeric;inc boolean;
BEGIN
 SELECT id INTO c FROM public.cafes WHERE slug=p_slug AND business_category='gifts_flowers' AND status IN('active','published') AND deleted_at IS NULL;
 IF c IS NULL OR NOT platform_access_private.service_enabled(c,'menu') THEN RETURN NULL;END IF;
 SELECT * INTO s FROM public.gift_store_settings WHERE cafe_id=c;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT vat_rate,tax_inclusive INTO v,inc FROM public.bf_settings WHERE cafe_id=c;
 RETURN jsonb_build_object('enabled',s.enabled,'deliveryEnabled',s.delivery_enabled,'pickupEnabled',s.pickup_enabled,'deliveryFee',s.delivery_fee,'paymentMethods',s.payment_methods,'pickupLocation',s.pickup_location,'deliveryNotes',s.delivery_notes,'bankInstructions',s.bank_instructions,'vatRate',coalesce(v,0),'taxInclusive',coalesce(inc,true));
END $$;

CREATE FUNCTION public.gift_store_settings_save(p_cafe uuid,p_payload jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE methods text[];
BEGIN
 IF NOT gift_commerce_private.can_manage(p_cafe) THEN RAISE EXCEPTION 'لا تملك صلاحية إعدادات هذا المتجر' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>10000 OR jsonb_typeof(p_payload->'enabled') IS DISTINCT FROM 'boolean'
 OR jsonb_typeof(p_payload->'deliveryEnabled') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_payload->'pickupEnabled') IS DISTINCT FROM 'boolean'
 OR NOT ((p_payload->>'deliveryEnabled')::boolean OR (p_payload->>'pickupEnabled')::boolean)
 OR jsonb_typeof(p_payload->'deliveryFee') IS DISTINCT FROM 'number' OR (p_payload->>'deliveryFee')::numeric NOT BETWEEN 0 AND 10000
 OR jsonb_typeof(p_payload->'paymentMethods') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'paymentMethods') NOT BETWEEN 1 AND 2
 OR length(coalesce(p_payload->>'pickupLocation',''))>1000 OR length(coalesce(p_payload->>'deliveryNotes',''))>1000 OR length(coalesce(p_payload->>'bankInstructions',''))>2000 THEN RAISE EXCEPTION 'راجع إعدادات التوصيل والدفع';END IF;
 SELECT array_agg(value) INTO methods FROM jsonb_array_elements_text(p_payload->'paymentMethods');
 IF NOT methods<@ARRAY['cod','bank_transfer']::text[] THEN RAISE EXCEPTION 'طريقة الدفع غير متاحة';END IF;
 INSERT INTO public.gift_store_settings(cafe_id,enabled,delivery_enabled,pickup_enabled,delivery_fee,payment_methods,pickup_location,delivery_notes,bank_instructions)
 VALUES(p_cafe,(p_payload->>'enabled')::boolean,(p_payload->>'deliveryEnabled')::boolean,(p_payload->>'pickupEnabled')::boolean,round((p_payload->>'deliveryFee')::numeric,2),methods,coalesce(p_payload->>'pickupLocation',''),coalesce(p_payload->>'deliveryNotes',''),coalesce(p_payload->>'bankInstructions',''))
 ON CONFLICT(cafe_id) DO UPDATE SET enabled=excluded.enabled,delivery_enabled=excluded.delivery_enabled,pickup_enabled=excluded.pickup_enabled,delivery_fee=excluded.delivery_fee,payment_methods=excluded.payment_methods,pickup_location=excluded.pickup_location,delivery_notes=excluded.delivery_notes,bank_instructions=excluded.bank_instructions,updated_at=now();
END $$;

CREATE FUNCTION public.gift_order_submit(p_slug text,p_request uuid,p_payload jsonb,p_rate_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid;cfg jsonb;o public.gift_orders%ROWTYPE;p public.menu_products%ROWTYPE;entry jsonb;opt jsonb;g jsonb;sel jsonb;ch jsonb;
 lines jsonb:='[]';snap jsonb;choices jsonb;qty integer;unit numeric;subtotal numeric:=0;fee numeric;tax numeric;total numeric;rate numeric;inc boolean;quote boolean:=false;
 reserved integer;stock integer;fingerprint text;v_phone text;new_id uuid:=gen_random_uuid();r record;
BEGIN
 IF p_request IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>50000 OR coalesce(p_rate_key,'')!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'بيانات الطلب غير صالحة';END IF;
 SELECT id INTO c FROM public.cafes WHERE slug=p_slug;
 PERFORM 1 FROM public.gift_store_settings WHERE cafe_id=c FOR SHARE;
 cfg:=public.gift_store_config(p_slug);IF cfg IS NULL OR NOT (cfg->>'enabled')::boolean THEN RAISE EXCEPTION 'المتجر غير متاح للطلبات حاليًا';END IF;
 fingerprint:=md5(p_payload::text);
 PERFORM pg_advisory_xact_lock(hashtextextended('gift-submit:'||c::text||p_request::text,0));
 SELECT * INTO o FROM public.gift_orders WHERE cafe_id=c AND request_id=p_request;
 IF FOUND THEN
  IF o.request_fingerprint<>fingerprint THEN RAISE EXCEPTION 'تغيرت بيانات الطلب أعد المحاولة بطلب جديد';END IF;
  RETURN jsonb_build_object('id',o.id,'number',o.number,'trackingToken',o.tracking_token,'total',o.total,'status',o.status,'paymentStatus',o.payment_status,'duplicate',true);
 END IF;
 v_phone:=p_payload->>'phone';
 IF length(btrim(coalesce(p_payload->>'customerName',''))) NOT BETWEEN 2 AND 120 OR coalesce(v_phone,'')!~'^9665[0-9]{8}$'
 OR coalesce(p_payload->>'fulfillment','') NOT IN('delivery','pickup') OR NOT (cfg->'paymentMethods' ? coalesce(p_payload->>'paymentMethod',''))
 OR length(coalesce(p_payload->>'city',''))>100 OR length(coalesce(p_payload->>'address',''))>1000 OR length(coalesce(p_payload->>'notes',''))>1000 OR length(coalesce(p_payload->>'giftMessage',''))>1000
 OR jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'راجع بيانات العميل والطلب';END IF;
 IF p_payload->>'fulfillment'='delivery' AND (NOT (cfg->>'deliveryEnabled')::boolean OR length(btrim(coalesce(p_payload->>'city','')))<2 OR length(btrim(coalesce(p_payload->>'address','')))<8) THEN RAISE EXCEPTION 'أدخل المدينة وعنوان التوصيل كاملًا';END IF;
 IF p_payload->>'fulfillment'='pickup' AND NOT (cfg->>'pickupEnabled')::boolean THEN RAISE EXCEPTION 'الاستلام من المحل غير متاح';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('gift-rate:'||p_rate_key,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('gift-phone:'||c::text||v_phone,0));
 IF (SELECT count(*) FROM gift_commerce_private.rate_limits WHERE key=p_rate_key AND created_at>now()-interval '15 minutes')>=20
 OR (SELECT count(*) FROM public.gift_orders WHERE cafe_id=c AND gift_orders.phone=v_phone AND created_at>now()-interval '1 hour')>=5 THEN RAISE EXCEPTION 'انتظر قليلًا قبل إرسال طلب آخر';END IF;
 INSERT INTO gift_commerce_private.rate_limits(key) VALUES(p_rate_key);
 DELETE FROM gift_commerce_private.rate_limits WHERE created_at<now()-interval '1 day';
 -- Product locks follow stable ID order, including duplicate selections of one product.
 FOR entry IN SELECT value FROM jsonb_array_elements(p_payload->'items') ORDER BY value->>'productId' LOOP
  qty:=(entry->>'quantity')::integer;
  IF qty NOT BETWEEN 1 AND 99 OR (entry->>'quantity')::numeric<>qty THEN RAISE EXCEPTION 'الكمية غير صالحة';END IF;
  SELECT * INTO p FROM public.menu_products WHERE id=(entry->>'productId')::uuid AND cafe_id=c AND deleted_at IS NULL AND available FOR UPDATE;
  IF NOT FOUND OR (p.category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.menu_categories WHERE id=p.category_id AND cafe_id=c AND visible AND deleted_at IS NULL)) THEN RAISE EXCEPTION 'أحد المنتجات غير متاح للطلب';END IF;
  IF p.branch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.branches WHERE id=p.branch_id AND cafe_id=c AND active AND deleted_at IS NULL) THEN RAISE EXCEPTION 'الفرع غير متاح';END IF;
  unit:=p.price;opt:=NULL;stock:=NULL;snap:='[]';
  IF jsonb_array_length(coalesce(p.commerce_details->'options','[]'))>0 THEN
   SELECT value INTO opt FROM jsonb_array_elements(p.commerce_details->'options') WHERE value->>'id'=entry->>'optionId';
   IF opt IS NULL OR NOT coalesce((opt->>'available')::boolean,true) THEN RAISE EXCEPTION 'اختر خيار المنتج المتاح';END IF;
   unit:=(opt->>'price')::numeric;stock:=nullif(opt->>'stock','')::integer;
   snap:=jsonb_build_array(jsonb_build_object('label','الخيار','value',opt->>'label','priceDelta',0));
  ELSIF nullif(entry->>'optionId','') IS NOT NULL THEN RAISE EXCEPTION 'خيار المنتج غير صالح';
  ELSE stock:=nullif(p.commerce_details->>'stock','')::integer;END IF;
  IF jsonb_typeof(coalesce(entry->'selections','[]'))<>'array' OR jsonb_array_length(coalesce(entry->'selections','[]'))>20 THEN RAISE EXCEPTION 'خيارات الطلب غير صالحة';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(entry->'selections','[]')) a WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p.commerce_details->'optionGroups','[]')) b WHERE b->>'id'=a->>'groupId'))
   OR (SELECT count(*) FROM jsonb_array_elements(coalesce(entry->'selections','[]')))<>(SELECT count(DISTINCT a->>'groupId') FROM jsonb_array_elements(coalesce(entry->'selections','[]')) a) THEN RAISE EXCEPTION 'خيارات الطلب غير صالحة';END IF;
  FOR g IN SELECT value FROM jsonb_array_elements(coalesce(p.commerce_details->'optionGroups','[]')) LOOP
   SELECT value INTO sel FROM jsonb_array_elements(coalesce(entry->'selections','[]')) WHERE value->>'groupId'=g->>'id';
   IF g->>'type'='text' THEN
    IF length(coalesce(sel->>'text',''))>1000 OR (coalesce((g->>'required')::boolean,false) AND length(btrim(coalesce(sel->>'text','')))=0) THEN RAISE EXCEPTION 'أكمل البيانات المطلوبة للمنتج';END IF;
    IF nullif(btrim(sel->>'text'),'') IS NOT NULL THEN snap:=snap||jsonb_build_array(jsonb_build_object('label',g->>'label','value',btrim(sel->>'text'),'priceDelta',0));END IF;
   ELSE
    choices:=coalesce(sel->'choiceIds','[]');
    IF jsonb_typeof(choices)<>'array' OR jsonb_array_length(choices)>50 OR (SELECT count(*) FROM jsonb_array_elements_text(choices))<>(SELECT count(DISTINCT value) FROM jsonb_array_elements_text(choices))
     OR (g->>'type'='select' AND jsonb_array_length(choices)>1)
     OR jsonb_array_length(choices)>coalesce((g->>'maxChoices')::integer,jsonb_array_length(coalesce(g->'choices','[]')))
     OR (jsonb_array_length(choices)>0 AND jsonb_array_length(choices)<coalesce((g->>'minChoices')::integer,0))
     OR (coalesce((g->>'required')::boolean,false) AND jsonb_array_length(choices)<greatest(coalesce((g->>'minChoices')::integer,1),1)) THEN RAISE EXCEPTION 'اختر خيارات المنتج المطلوبة';END IF;
    FOR r IN SELECT value FROM jsonb_array_elements_text(choices) LOOP
     SELECT value INTO ch FROM jsonb_array_elements(g->'choices') WHERE value->>'id'=r.value;
     IF ch IS NULL OR (ch->>'priceDelta')::numeric<0 THEN RAISE EXCEPTION 'خيار المنتج غير صالح';END IF;
     unit:=unit+(ch->>'priceDelta')::numeric;
     snap:=snap||jsonb_build_array(jsonb_build_object('label',g->>'label','value',ch->>'label','priceDelta',(ch->>'priceDelta')::numeric));
    END LOOP;
   END IF;
  END LOOP;
  IF coalesce((p.commerce_details->>'quoteOnly')::boolean,false) THEN
   IF p.catalog_kind<>'service' OR jsonb_array_length(p_payload->'items')<>1 OR qty<>1 THEN RAISE EXCEPTION 'أرسل طلب تسعير الخدمة بشكل مستقل';END IF;quote:=true;unit:=0;
  ELSIF unit IS NULL OR unit<=0 OR unit>1000000 THEN RAISE EXCEPTION 'المنتج يحتاج سعرًا صالحًا قبل الطلب';END IF;
  unit:=round(unit,2);
  IF stock IS NOT NULL THEN
   SELECT coalesce(sum(l.quantity),0) INTO reserved FROM public.gift_order_lines l JOIN public.gift_orders x ON x.id=l.order_id AND x.cafe_id=l.cafe_id
    WHERE l.product_id=p.id AND l.option_id IS NOT DISTINCT FROM nullif(entry->>'optionId','') AND x.payment_status='unpaid' AND x.status NOT IN('cancelled','refunded') AND x.created_at>now()-interval '24 hours';
   reserved:=reserved+coalesce((SELECT sum((x->>'quantity')::integer) FROM jsonb_array_elements(lines) x WHERE x->>'productId'=p.id::text AND x->>'optionId' IS NOT DISTINCT FROM nullif(entry->>'optionId','')),0);
   IF reserved+qty>stock THEN RAISE EXCEPTION 'الكمية المطلوبة غير متوفرة حاليًا';END IF;
  END IF;
  subtotal:=subtotal+round(unit*qty,2);
  lines:=lines||jsonb_build_array(jsonb_build_object('productId',p.id,'name',p.name,'catalogKind',p.catalog_kind,'optionId',nullif(entry->>'optionId',''),'selections',snap,'quantity',qty,'unitPrice',unit,'lineTotal',round(unit*qty,2),'stockTracked',stock IS NOT NULL));
 END LOOP;
 fee:=CASE WHEN quote OR p_payload->>'fulfillment'='pickup' THEN 0 ELSE (cfg->>'deliveryFee')::numeric END;
 rate:=(cfg->>'vatRate')::numeric;inc:=(cfg->>'taxInclusive')::boolean;
 tax:=CASE WHEN inc THEN round((subtotal+fee)-(subtotal+fee)/(1+rate/100),2) ELSE round((subtotal+fee)*rate/100,2) END;
 total:=subtotal+fee+CASE WHEN inc THEN 0 ELSE tax END;
 IF (p_payload->>'expectedTotal')::numeric IS DISTINCT FROM total THEN RAISE EXCEPTION 'تغير إجمالي الطلب حدث المنتجات وراجع الخيارات';END IF;
 INSERT INTO public.gift_orders(id,cafe_id,request_id,request_fingerprint,customer_name,phone,fulfillment,city,address,gift_message,notes,payment_method,status,subtotal,delivery_fee,tax,total,vat_rate,tax_inclusive)
 VALUES(new_id,c,p_request,fingerprint,btrim(p_payload->>'customerName'),v_phone,p_payload->>'fulfillment',coalesce(p_payload->>'city',''),coalesce(p_payload->>'address',''),coalesce(p_payload->>'giftMessage',''),coalesce(p_payload->>'notes',''),p_payload->>'paymentMethod',CASE WHEN quote THEN 'quote_requested' ELSE 'pending' END,subtotal,fee,tax,total,rate,inc) RETURNING * INTO o;
 INSERT INTO public.gift_order_lines(cafe_id,order_id,product_id,name,catalog_kind,option_id,selections,quantity,unit_price,line_total,stock_tracked)
 SELECT c,new_id,(x->>'productId')::uuid,x->>'name',x->>'catalogKind',x->>'optionId',x->'selections',(x->>'quantity')::integer,(x->>'unitPrice')::numeric,(x->>'lineTotal')::numeric,(x->>'stockTracked')::boolean FROM jsonb_array_elements(lines) x;
 INSERT INTO public.gift_order_events(cafe_id,order_id,request_id,action) VALUES(c,new_id,p_request,'submitted');
 RETURN jsonb_build_object('id',o.id,'number',o.number,'trackingToken',o.tracking_token,'total',o.total,'status',o.status,'paymentStatus',o.payment_status);
END $$;

CREATE FUNCTION public.gift_order_track(p_slug text,p_token uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('id',o.id,'number',o.number,'status',o.status,'paymentStatus',o.payment_status,'subtotal',o.subtotal,'deliveryFee',o.delivery_fee,'tax',o.tax,'total',o.total,'createdAt',o.created_at,'updatedAt',o.updated_at,
 'items',(SELECT jsonb_agg(jsonb_build_object('name',l.name,'quantity',l.quantity,'unitPrice',l.unit_price,'lineTotal',l.line_total) ORDER BY l.id) FROM public.gift_order_lines l WHERE l.order_id=o.id AND l.cafe_id=o.cafe_id))
 FROM public.gift_orders o JOIN public.cafes c ON c.id=o.cafe_id WHERE c.slug=p_slug AND o.tracking_token=p_token
$$;

CREATE FUNCTION public.gift_order_manage(p_cafe uuid,p_order uuid,p_request uuid,p_action text,p_payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.gift_orders%ROWTYPE;ev public.gift_order_events%ROWTYPE;new_status text;doc uuid:=gen_random_uuid();num bigint;aid uuid;wid uuid;sid uuid;acc public.bf_accounts%ROWTYPE;sh public.bf_shifts%ROWTYPE;
 l record;line_tax numeric;net numeric;cost numeric;remaining_tax numeric;remaining_net numeric;cumulative_base numeric:=0;cumulative_tax numeric:=0;amount numeric;role text;details jsonb;options jsonb;stock integer;line_id uuid;party uuid;
BEGIN
 IF NOT gift_commerce_private.can_manage(p_cafe) OR p_request IS NULL THEN RAISE EXCEPTION 'لا تملك صلاحية إدارة طلبات هذه العلامة' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>10000 THEN RAISE EXCEPTION 'بيانات الإجراء غير صالحة';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('gift-manage:'||p_cafe::text||p_request::text,0));
 IF p_action='confirm_payment' THEN PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,60412));END IF;
 SELECT * INTO o FROM public.gift_orders WHERE id=p_order AND cafe_id=p_cafe FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود';END IF;
 SELECT * INTO ev FROM public.gift_order_events WHERE cafe_id=p_cafe AND request_id=p_request;
 IF FOUND THEN
  IF ev.order_id<>p_order OR ev.action<>p_action OR ev.payload<>p_payload THEN RAISE EXCEPTION 'تغيرت بيانات الإجراء';END IF;
  RETURN jsonb_build_object('id',o.id,'status',o.status,'paymentStatus',o.payment_status,'financeDocumentId',o.finance_document_id,'duplicate',true);
 END IF;
 new_status:=o.status;
 IF p_action='cancel' THEN
  IF o.payment_status<>'unpaid' OR o.status IN('completed','cancelled','refunded') THEN RAISE EXCEPTION 'الطلب المدفوع يحتاج إجراء استرداد من المالية';END IF;
  IF length(btrim(coalesce(p_payload->>'note','')))<3 THEN RAISE EXCEPTION 'اكتب سبب إلغاء الطلب';END IF;
  new_status:='cancelled';
 ELSIF p_action='quote' THEN
  amount:=round((p_payload->>'amount')::numeric,2);
  IF o.status<>'quote_requested' OR amount IS NULL OR amount<=0 OR amount>1000000 THEN RAISE EXCEPTION 'أدخل قيمة تسعير الخدمة الصحيحة';END IF;
  UPDATE public.gift_order_lines SET unit_price=amount,line_total=amount WHERE order_id=o.id AND cafe_id=p_cafe;
  o.subtotal:=amount;o.tax:=CASE WHEN o.tax_inclusive THEN round(amount-amount/(1+o.vat_rate/100),2) ELSE round(amount*o.vat_rate/100,2) END;
  o.total:=amount+CASE WHEN o.tax_inclusive THEN 0 ELSE o.tax END;
  UPDATE public.gift_orders SET subtotal=o.subtotal,tax=o.tax,total=o.total WHERE id=o.id;new_status:='accepted';
 ELSIF p_action='accept' AND o.status='pending' THEN new_status:='accepted';
 ELSIF p_action='prepare' AND o.status='accepted' THEN new_status:='preparing';
 ELSIF p_action='ready' AND o.status='preparing' THEN new_status:='ready';
 ELSIF p_action='complete' AND o.status IN('accepted','preparing','ready') AND o.payment_status='paid' THEN new_status:='completed';
 ELSIF p_action='confirm_payment' THEN
  IF o.status IN('quote_requested','cancelled','refunded') OR o.total<=0 THEN RAISE EXCEPTION 'لا يمكن تسجيل دفعة لهذا الطلب';END IF;
  IF o.finance_document_id IS NOT NULL THEN RAISE EXCEPTION 'سبق تسجيل دفعة هذا الطلب';END IF;
  role:=brand_finance_private.role_for(p_cafe);IF role NOT IN('owner','manager') THEN RAISE EXCEPTION 'تأكيد الدفع يتطلب صلاحية إدارة المالية' USING ERRCODE='42501';END IF;
  PERFORM brand_finance_private.seed(p_cafe);
  IF EXISTS(SELECT 1 FROM public.bf_settings WHERE cafe_id=p_cafe AND closed_through>=(now() AT TIME ZONE 'Asia/Riyadh')::date) THEN RAISE EXCEPTION 'الفترة المحاسبية مغلقة';END IF;
  aid:=nullif(p_payload->>'accountId','')::uuid;wid:=nullif(p_payload->>'warehouseId','')::uuid;sid:=nullif(p_payload->>'shiftId','')::uuid;
  SELECT * INTO acc FROM public.bf_accounts WHERE id=aid AND cafe_id=p_cafe AND active AND kind IN('cash','bank','pos') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'اختر حساب تحصيل صالحًا في المالية';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.bf_warehouses WHERE id=wid AND cafe_id=p_cafe AND active) THEN RAISE EXCEPTION 'اختر المستودع الصحيح';END IF;
  IF acc.kind='cash' OR sid IS NOT NULL THEN
   SELECT * INTO sh FROM public.bf_shifts WHERE id=sid AND cafe_id=p_cafe AND user_id=auth.uid() AND status='open' AND NOT supervisor_paused FOR UPDATE;
   IF NOT FOUND OR (acc.kind='cash' AND sh.account_id<>aid) THEN RAISE EXCEPTION 'التحصيل النقدي يتطلب ورديتك المفتوحة وصندوقها';END IF;
  END IF;
  IF (p_payload->>'amount')::numeric IS DISTINCT FROM o.total THEN RAISE EXCEPTION 'أكد مبلغ التحصيل المطابق لإجمالي الطلب';END IF;
  SELECT id INTO party FROM public.bf_parties WHERE cafe_id=p_cafe AND kind='customer' AND phone=o.phone AND active ORDER BY id LIMIT 1;
  IF party IS NULL THEN INSERT INTO public.bf_parties(cafe_id,name,kind,phone,details) VALUES(p_cafe,o.customer_name,'customer',o.phone,jsonb_build_object('city',o.city,'addressNotes',o.address)) RETURNING id INTO party;END IF;
  -- Only actual, explicitly confirmed receipt posts to the immutable existing finance ledger.
  INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,shift_id,account_id,warehouse_id,subtotal,discount,tax,total,paid,note,created_by,vat_rate,tax_inclusive,customer_phone)
   VALUES(doc,p_cafe,'sale',party,sid,aid,wid,o.subtotal+o.delivery_fee,0,o.tax,o.total,o.total,left('طلب متجر #'||o.number||' — '||o.customer_name||' — '||coalesce(p_payload->>'note',''),1000),auth.uid(),o.vat_rate,o.tax_inclusive,o.phone) RETURNING number INTO num;
  remaining_tax:=o.tax;remaining_net:=o.total-o.tax;
  FOR l IN SELECT id,product_id,name,quantity,unit_price,line_total,option_id,stock_tracked FROM public.gift_order_lines WHERE order_id=o.id AND cafe_id=p_cafe ORDER BY product_id,id LOOP
   IF l.stock_tracked THEN
    SELECT commerce_details INTO details FROM public.menu_products WHERE id=l.product_id AND cafe_id=p_cafe FOR UPDATE;
    IF l.option_id IS NULL THEN
     stock:=(details->>'stock')::integer;IF stock IS NULL OR stock<l.quantity THEN RAISE EXCEPTION 'الكمية المتبقية لا تكفي لتنفيذ الطلب';END IF;
     details:=jsonb_set(details,'{stock}',to_jsonb(stock-l.quantity));
    ELSE
     SELECT (x->>'stock')::integer INTO stock FROM jsonb_array_elements(details->'options') x WHERE x->>'id'=l.option_id;
     IF stock IS NULL OR stock<l.quantity THEN RAISE EXCEPTION 'كمية الخيار المتبقية لا تكفي';END IF;
     SELECT jsonb_agg(CASE WHEN x->>'id'=l.option_id THEN jsonb_set(x,'{stock}',to_jsonb(stock-l.quantity)) ELSE x END ORDER BY ord) INTO options FROM jsonb_array_elements(details->'options') WITH ORDINALITY a(x,ord);
     details:=jsonb_set(details,'{options}',options);
    END IF;
    UPDATE public.menu_products SET commerce_details=details,updated_at=now() WHERE id=l.product_id AND cafe_id=p_cafe;
   END IF;
   -- Allocate rounded cumulative shares so residual cents cannot make the final line negative.
   cumulative_base:=cumulative_base+l.line_total;
   line_tax:=round(o.tax*cumulative_base/(o.subtotal+o.delivery_fee),2)-cumulative_tax;
   cumulative_tax:=cumulative_tax+line_tax;
   net:=l.line_total+CASE WHEN o.tax_inclusive THEN -line_tax ELSE 0 END;
   remaining_tax:=remaining_tax-line_tax;remaining_net:=remaining_net-net;
   INSERT INTO public.bf_document_lines(cafe_id,document_id,product_id,name,quantity,unit_price,net,tax,cost)
    VALUES(p_cafe,doc,l.product_id,l.name,l.quantity,l.unit_price,net,line_tax,0) RETURNING bf_document_lines.cost,bf_document_lines.id INTO cost,line_id;
   UPDATE public.gift_order_lines SET finance_line_id=line_id WHERE id=l.id;
   PERFORM brand_finance_private.line(p_cafe,doc,brand_finance_private.account(p_cafe,'5000'),cost,0);
   PERFORM brand_finance_private.line(p_cafe,doc,brand_finance_private.account(p_cafe,'1200'),0,cost);
  END LOOP;
  IF o.delivery_fee>0 THEN INSERT INTO public.bf_document_lines(cafe_id,document_id,name,quantity,unit_price,net,tax,cost) VALUES(p_cafe,doc,'رسوم التوصيل',1,o.delivery_fee,remaining_net,remaining_tax,0);END IF;
  PERFORM brand_finance_private.line(p_cafe,doc,aid,o.total,0);
  PERFORM brand_finance_private.line(p_cafe,doc,brand_finance_private.account(p_cafe,'4000'),0,o.total-o.tax);
  PERFORM brand_finance_private.line(p_cafe,doc,brand_finance_private.account(p_cafe,'2100'),0,o.tax);
  IF (SELECT coalesce(sum(debit-credit),0) FROM public.bf_journal WHERE document_id=doc AND cafe_id=p_cafe)<>0 THEN RAISE EXCEPTION 'القيد المالي غير متوازن';END IF;
  UPDATE public.gift_orders SET finance_document_id=doc,payment_status='paid' WHERE id=o.id;o.finance_document_id:=doc;o.payment_status:='paid';
  IF o.status='pending' THEN new_status:='accepted';END IF;
 ELSE RAISE EXCEPTION 'هذا الإجراء غير متاح لحالة الطلب الحالية';END IF;
 UPDATE public.gift_orders SET status=new_status,updated_at=now() WHERE id=o.id;
 INSERT INTO public.gift_order_events(cafe_id,order_id,request_id,action,payload,actor_id) VALUES(p_cafe,o.id,p_request,p_action,p_payload,auth.uid());
 RETURN jsonb_build_object('id',o.id,'status',new_status,'paymentStatus',o.payment_status,'financeDocumentId',o.finance_document_id,'financeDocumentNumber',num);
END $$;

CREATE FUNCTION gift_commerce_private.refund_status() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.gift_orders%ROWTYPE;returned numeric;
BEGIN
 IF NEW.kind<>'refund' OR NEW.reference_id IS NULL THEN RETURN NEW;END IF;
 SELECT * INTO o FROM public.gift_orders WHERE cafe_id=NEW.cafe_id AND finance_document_id=NEW.reference_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW;END IF;
 SELECT coalesce(sum(total),0) INTO returned FROM public.bf_documents WHERE cafe_id=NEW.cafe_id AND kind='refund' AND reference_id=NEW.reference_id;
 UPDATE public.gift_orders SET payment_status=CASE WHEN returned>=o.total THEN 'refunded' ELSE 'partially_refunded' END,status=CASE WHEN returned>=o.total THEN 'refunded' ELSE status END,updated_at=now() WHERE id=o.id;
 INSERT INTO public.gift_order_events(cafe_id,order_id,request_id,action,payload,actor_id) VALUES(o.cafe_id,o.id,NEW.id,'finance_refund',jsonb_build_object('documentId',NEW.id,'amount',NEW.total),NEW.created_by);
 RETURN NEW;
END $$;
CREATE TRIGGER gift_order_finance_refund AFTER INSERT ON public.bf_documents FOR EACH ROW EXECUTE FUNCTION gift_commerce_private.refund_status();
CREATE FUNCTION gift_commerce_private.refund_catalog_stock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE l public.gift_order_lines%ROWTYPE;details jsonb;stock integer;options jsonb;
BEGIN
 IF NEW.reference_line_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.bf_documents WHERE id=NEW.document_id AND cafe_id=NEW.cafe_id AND kind='refund') THEN RETURN NEW;END IF;
 SELECT * INTO l FROM public.gift_order_lines WHERE cafe_id=NEW.cafe_id AND finance_line_id=NEW.reference_line_id AND stock_tracked;
 IF NOT FOUND THEN RETURN NEW;END IF;
 IF NEW.quantity<>trunc(NEW.quantity) THEN RAISE EXCEPTION 'كمية إرجاع هذا المنتج يجب أن تكون عددًا صحيحًا';END IF;
 SELECT commerce_details INTO details FROM public.menu_products WHERE id=l.product_id AND cafe_id=l.cafe_id FOR UPDATE;
 IF l.option_id IS NULL THEN
  stock:=(details->>'stock')::integer;
  IF stock IS NOT NULL THEN UPDATE public.menu_products SET commerce_details=jsonb_set(details,'{stock}',to_jsonb(stock+NEW.quantity::integer)),updated_at=now() WHERE id=l.product_id AND cafe_id=l.cafe_id;END IF;
 ELSE
  SELECT (x->>'stock')::integer INTO stock FROM jsonb_array_elements(details->'options') x WHERE x->>'id'=l.option_id;
  IF stock IS NOT NULL THEN
   SELECT jsonb_agg(CASE WHEN x->>'id'=l.option_id THEN jsonb_set(x,'{stock}',to_jsonb(stock+NEW.quantity::integer)) ELSE x END ORDER BY ord) INTO options FROM jsonb_array_elements(details->'options') WITH ORDINALITY a(x,ord);
   UPDATE public.menu_products SET commerce_details=jsonb_set(details,'{options}',options),updated_at=now() WHERE id=l.product_id AND cafe_id=l.cafe_id;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER gift_order_catalog_refund AFTER INSERT ON public.bf_document_lines FOR EACH ROW EXECUTE FUNCTION gift_commerce_private.refund_catalog_stock();
REVOKE ALL ON FUNCTION gift_commerce_private.refund_status() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION gift_commerce_private.refund_catalog_stock() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.gift_store_settings_save(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.gift_store_config(text),public.gift_order_submit(text,uuid,jsonb,text),public.gift_order_track(text,uuid),public.gift_order_manage(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.gift_store_config(text),public.gift_order_submit(text,uuid,jsonb,text),public.gift_order_track(text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_order_manage(uuid,uuid,uuid,text,jsonb),public.gift_store_settings_save(uuid,jsonb) TO authenticated;
COMMIT;
