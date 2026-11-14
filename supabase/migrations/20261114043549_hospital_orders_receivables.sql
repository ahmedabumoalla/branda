BEGIN;
CREATE SCHEMA IF NOT EXISTS hospital_private;
REVOKE ALL ON SCHEMA hospital_private FROM PUBLIC,anon,authenticated;
CREATE TABLE public.hospital_store_settings(cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),enabled boolean NOT NULL DEFAULT false);
CREATE TABLE public.hospital_orders(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),number bigint GENERATED ALWAYS AS IDENTITY,
 request_id uuid NOT NULL,fingerprint text NOT NULL,source text NOT NULL CHECK(source IN('menu','counter')),
 customer_name text NOT NULL,phone text NOT NULL,floor text NOT NULL,clinic text NOT NULL,doctor text NOT NULL DEFAULT '',notes text NOT NULL DEFAULT '',language text NOT NULL CHECK(language IN('ar','en')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','preparing','ready','completed','cancelled')),
 payment_status text NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN('unpaid','paid','credit')),
 items jsonb NOT NULL CHECK(jsonb_typeof(items)='array'),total numeric(14,2) NOT NULL,total_max numeric(14,2) NOT NULL,
 vat_rate numeric NOT NULL,tax_inclusive boolean NOT NULL,finance_document_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(cafe_id,id),UNIQUE(cafe_id,request_id),FOREIGN KEY(cafe_id,finance_document_id) REFERENCES public.bf_documents(cafe_id,id)
);
CREATE INDEX hospital_orders_inbox ON public.hospital_orders(cafe_id,created_at DESC,id);
CREATE TABLE public.hospital_order_events(cafe_id uuid NOT NULL,request_id uuid NOT NULL,order_id uuid,action text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(cafe_id,request_id),FOREIGN KEY(cafe_id,order_id) REFERENCES public.hospital_orders(cafe_id,id));
CREATE TABLE hospital_private.rate_limits(cafe_id uuid NOT NULL,key text NOT NULL,window_start timestamptz NOT NULL,count integer NOT NULL,PRIMARY KEY(cafe_id,key));
CREATE TABLE hospital_private.checkout_quotes(cafe_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL,transaction_id bigint NOT NULL,lines jsonb NOT NULL,PRIMARY KEY(cafe_id,request_id));
CREATE TABLE hospital_private.collection_context(cafe_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL,transaction_id bigint NOT NULL,payload jsonb NOT NULL,PRIMARY KEY(cafe_id,request_id));
ALTER TABLE public.hospital_store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospital_private.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospital_private.checkout_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospital_private.collection_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hospital_store_settings,public.hospital_orders,public.hospital_order_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON hospital_private.rate_limits,hospital_private.checkout_quotes FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON hospital_private.collection_context FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION hospital_private.can_manage(c uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.hospital_store_settings WHERE cafe_id=c AND enabled) THEN RETURN false;END IF;
 RETURN brand_finance_private.role_for(c) IN('owner','manager','cashier','accountant');
EXCEPTION WHEN insufficient_privilege THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION hospital_private.can_manage(uuid) FROM PUBLIC,anon,service_role;
GRANT USAGE ON SCHEMA hospital_private TO authenticated;
GRANT EXECUTE ON FUNCTION hospital_private.can_manage(uuid) TO authenticated;
CREATE POLICY hospital_order_read ON public.hospital_orders FOR SELECT TO authenticated USING(hospital_private.can_manage(cafe_id));
GRANT SELECT ON public.hospital_orders TO authenticated;

CREATE FUNCTION hospital_private.items(c uuid,raw jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE e jsonb;p public.menu_products%ROWTYPE;o jsonb;result jsonb:='[]';low numeric;high numeric;idx integer;qty integer;
BEGIN
 IF jsonb_typeof(raw) IS DISTINCT FROM 'array' OR jsonb_array_length(raw) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'HOSPITAL_INVALID_ITEMS';END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(raw) LOOP
  qty:=(e->>'quantity')::integer;
  IF qty IS NULL OR qty NOT BETWEEN 1 AND 50 OR (e->>'quantity')::numeric<>qty THEN RAISE EXCEPTION 'HOSPITAL_INVALID_ITEMS';END IF;
  SELECT * INTO p FROM public.menu_products WHERE cafe_id=c AND id=(e->>'productId')::uuid AND deleted_at IS NULL AND available AND catalog_kind='product' FOR SHARE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.menu_categories WHERE cafe_id=c AND id=p.category_id AND visible AND deleted_at IS NULL) THEN RAISE EXCEPTION 'HOSPITAL_PRODUCT_UNAVAILABLE';END IF;
  low:=p.price;high:=p.price;idx:=NULL;o:=NULL;
  IF coalesce(cardinality(p.price_options),0)>0 THEN
   idx:=(e->>'priceOptionIndex')::integer;
   IF idx IS NULL OR idx<0 OR idx>=cardinality(p.price_options) THEN RAISE EXCEPTION 'HOSPITAL_CHOOSE_OPTION';END IF;
   low:=p.price_options[idx+1];high:=low;
  ELSIF e ? 'priceOptionIndex' THEN RAISE EXCEPTION 'HOSPITAL_CHOOSE_OPTION';
  ELSIF jsonb_typeof(p.commerce_details->'menuPriceRange')='object' THEN
   low:=(p.commerce_details#>>'{menuPriceRange,min}')::numeric;high:=(p.commerce_details#>>'{menuPriceRange,max}')::numeric;
  END IF;
  IF low IS NULL OR high IS NULL OR low<0 OR high<low OR high>100000 OR low<>round(low,2) OR high<>round(high,2) THEN RAISE EXCEPTION 'HOSPITAL_PRICE_UNAVAILABLE';END IF;
  result:=result||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('productId',p.id,'name',p.name,'nameEn',nullif(p.commerce_details->>'nameEn',''),'quantity',qty,'unitPrice',low,'maxUnitPrice',high,'priceOptionIndex',idx,'optionLabel',o->>'label')));
 END LOOP;
 RETURN result;
END $$;

CREATE FUNCTION hospital_private.dto(o public.hospital_orders) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',o.id,'number',o.number,'source',o.source,'customerName',o.customer_name,'phone',o.phone,'floor',o.floor,'clinic',o.clinic,'doctor',o.doctor,'notes',o.notes,'language',o.language,'status',o.status,'paymentStatus',o.payment_status,'financeDocumentId',o.finance_document_id,'total',o.total,'totalMax',o.total_max,'needsPriceConfirmation',o.total<>o.total_max,'items',o.items,'createdAt',o.created_at)
$$;

CREATE FUNCTION hospital_private.create_order(c uuid,request uuid,p jsonb,source text) RETURNS public.hospital_orders LANGUAGE plpgsql SET search_path='' AS $$
DECLARE o public.hospital_orders%ROWTYPE;lines jsonb;lo numeric;hi numeric;cfg public.bf_settings%ROWTYPE;fp text:=md5(p::text||source);
BEGIN
 IF request IS NULL OR jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>20000 OR coalesce(p->>'language','') NOT IN('ar','en') THEN RAISE EXCEPTION 'HOSPITAL_INVALID_INPUT';END IF;
 IF length(btrim(coalesce(p->>'customerName',''))) NOT BETWEEN (CASE WHEN source='menu' THEN 2 ELSE 0 END) AND 120 OR length(coalesce(p->>'floor',''))>60 OR length(coalesce(p->>'clinic',''))>120 OR length(coalesce(p->>'doctor',''))>120 OR length(coalesce(p->>'notes',''))>500 THEN RAISE EXCEPTION 'HOSPITAL_INVALID_INPUT';END IF;
 IF source='menu' AND (coalesce(p->>'phone','')!~'^9665[0-9]{8}$' OR btrim(coalesce(p->>'floor',''))='' OR btrim(coalesce(p->>'clinic',''))='') THEN RAISE EXCEPTION 'HOSPITAL_INVALID_INPUT';END IF;
 IF source='counter' AND coalesce(p->>'phone','')!~'^(9665[0-9]{8})?$' THEN RAISE EXCEPTION 'HOSPITAL_INVALID_INPUT';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hospital-order:'||c::text||request::text,0));
 SELECT * INTO o FROM public.hospital_orders WHERE cafe_id=c AND request_id=request;
 IF FOUND THEN IF o.fingerprint<>fp THEN RAISE EXCEPTION 'HOSPITAL_REQUEST_CHANGED';END IF;RETURN o;END IF;
 lines:=hospital_private.items(c,p->'items');
 SELECT * INTO STRICT cfg FROM public.bf_settings WHERE cafe_id=c;
 SELECT sum((x->>'unitPrice')::numeric*(x->>'quantity')::numeric),sum((x->>'maxUnitPrice')::numeric*(x->>'quantity')::numeric) INTO lo,hi FROM jsonb_array_elements(lines)x;
 IF NOT cfg.tax_inclusive THEN lo:=lo+round(lo*cfg.vat_rate/100,2);hi:=hi+round(hi*cfg.vat_rate/100,2);END IF;
 IF hi<=0 OR hi>100000000 THEN RAISE EXCEPTION 'HOSPITAL_PRICE_UNAVAILABLE';END IF;
 INSERT INTO public.hospital_orders(cafe_id,request_id,fingerprint,source,customer_name,phone,floor,clinic,doctor,notes,language,items,total,total_max,vat_rate,tax_inclusive)
 VALUES(c,request,fp,source,btrim(coalesce(p->>'customerName','')),coalesce(p->>'phone',''),btrim(coalesce(p->>'floor','')),btrim(coalesce(p->>'clinic','')),btrim(coalesce(p->>'doctor','')),btrim(coalesce(p->>'notes','')),p->>'language',lines,lo,hi,cfg.vat_rate,cfg.tax_inclusive) RETURNING * INTO o;
 RETURN o;
END $$;

CREATE FUNCTION public.hospital_order_submit(p_slug text,p_request uuid,p_payload jsonb,p_rate_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid;o public.hospital_orders%ROWTYPE;r hospital_private.rate_limits%ROWTYPE;
BEGIN
 SELECT s.cafe_id INTO c FROM public.hospital_store_settings s JOIN public.cafes b ON b.id=s.cafe_id WHERE b.slug=p_slug AND s.enabled AND b.status IN('active','published') AND b.deleted_at IS NULL AND platform_access_private.service_enabled(b.id,'finance') AND platform_access_private.service_enabled(b.id,'menu');
 IF c IS NULL THEN RAISE EXCEPTION 'HOSPITAL_UNAVAILABLE';END IF;
 IF coalesce(p_rate_key,'')!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'HOSPITAL_INVALID_INPUT';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hospital-rate:'||c::text||p_rate_key,0));
 IF NOT EXISTS(SELECT 1 FROM public.hospital_orders WHERE cafe_id=c AND request_id=p_request) THEN
  INSERT INTO hospital_private.rate_limits(cafe_id,key,window_start,count) VALUES(c,p_rate_key,now(),1) ON CONFLICT(cafe_id,key) DO UPDATE SET window_start=CASE WHEN rate_limits.window_start<now()-interval '10 minutes' THEN now() ELSE rate_limits.window_start END,count=CASE WHEN rate_limits.window_start<now()-interval '10 minutes' THEN 1 ELSE rate_limits.count+1 END RETURNING * INTO r;
  IF r.count>15 THEN RAISE EXCEPTION 'HOSPITAL_RATE_LIMIT';END IF;
 END IF;
 o:=hospital_private.create_order(c,p_request,p_payload,'menu');
 RETURN jsonb_build_object('id',o.id,'number',o.number,'total',o.total,'totalMax',o.total_max,'needsPriceConfirmation',o.total<>o.total_max,'status',o.status);
END $$;
CREATE FUNCTION public.hospital_counter_order(p_cafe uuid,p_request uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.hospital_orders%ROWTYPE;
BEGIN
 IF NOT hospital_private.can_manage(p_cafe) OR brand_finance_private.role_for(p_cafe) NOT IN('owner','manager','cashier') THEN RAISE EXCEPTION 'HOSPITAL_FORBIDDEN' USING ERRCODE='42501';END IF;
 o:=hospital_private.create_order(p_cafe,p_request,p_payload,'counter');RETURN hospital_private.dto(o);
END $$;
CREATE FUNCTION public.hospital_orders_read(p_cafe uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT hospital_private.can_manage(p_cafe) THEN RAISE EXCEPTION 'HOSPITAL_FORBIDDEN' USING ERRCODE='42501';END IF;
 RETURN coalesce((SELECT jsonb_agg(hospital_private.dto(o) ORDER BY CASE WHEN o.status IN('completed','cancelled') THEN 1 ELSE 0 END,o.created_at,o.id) FROM (SELECT * FROM public.hospital_orders WHERE cafe_id=p_cafe ORDER BY CASE WHEN status IN('completed','cancelled') THEN 1 ELSE 0 END,CASE WHEN status NOT IN('completed','cancelled') THEN created_at END ASC,created_at DESC,id LIMIT 500)o),'[]'::jsonb);
END $$;

-- The core sale engine remains authoritative for stock, VAT, shifts and journals.
-- Only this transaction's validated checkout RPC can stage a price override.
CREATE FUNCTION hospital_private.confirmed_price(c uuid,request uuid,e jsonb) RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT (l->>'price')::numeric FROM hospital_private.checkout_quotes q CROSS JOIN LATERAL jsonb_array_elements(q.lines)l
 WHERE q.cafe_id=c AND q.request_id=request AND q.actor_id=auth.uid() AND q.transaction_id=txid_current() AND l->>'productId'=e->>'productId' AND l->>'hospitalLineIndex'=e->>'hospitalLineIndex'
$$;
CREATE FUNCTION hospital_private.collection_authorized(c uuid,request uuid,p jsonb) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM hospital_private.collection_context q WHERE q.cafe_id=c AND q.request_id=request AND q.actor_id=auth.uid() AND q.transaction_id=txid_current() AND q.payload=p)
$$;
CREATE FUNCTION hospital_private.collection_shift(c uuid,request uuid) RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT (q.payload->>'shiftId')::uuid FROM hospital_private.collection_context q WHERE q.cafe_id=c AND q.request_id=request AND q.actor_id=auth.uid() AND q.transaction_id=txid_current()
$$;
DO $$ DECLARE src text;needle text:='price:=prod.price; iid:=prod.item_id;';guard text:='IF r=''cashier'' AND p_operation NOT IN(''sale'',''refund'',''shift_open'',''shift_close'',''shift_handover'',''shift_accept'') THEN';settlement text:='INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,account_id,total,paid,reference_id,note,created_by) VALUES(id,p_cafe_id,''settlement'',original.party_id,aid,amount,amount,original.id,note,auth.uid())';BEGIN
 SELECT pg_get_functiondef('brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid)'::regprocedure) INTO src;
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'Hospital price hook source drift';END IF;
 src:=replace(src,needle,'price:=coalesce(hospital_private.confirmed_price(p_cafe_id,p_request_id,entry),prod.price); iid:=prod.item_id;');
 IF strpos(src,guard)=0 OR strpos(src,settlement)=0 THEN RAISE EXCEPTION 'Hospital collection hook source drift';END IF;
 src:=replace(src,guard,'IF r=''cashier'' AND p_operation NOT IN(''sale'',''refund'',''shift_open'',''shift_close'',''shift_handover'',''shift_accept'') AND NOT(p_operation=''settlement'' AND hospital_private.collection_authorized(p_cafe_id,p_request_id,p_payload)) THEN');
 src:=replace(src,settlement,'INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,account_id,shift_id,total,paid,reference_id,note,created_by) VALUES(id,p_cafe_id,''settlement'',original.party_id,aid,hospital_private.collection_shift(p_cafe_id,p_request_id),amount,amount,original.id,note,auth.uid())');
 EXECUTE src;
END $$;

-- The ordinary job policy remains unchanged outside an exact staged hospital receipt.
DO $$ DECLARE src text;needle text:='PERFORM brand_finance_private.assert_job_access(p_cafe_id,''brand_finance_execute'',p_operation);';BEGIN
 SELECT pg_get_functiondef('brand_finance_private.execute_before_inventory_catalog(uuid,text,jsonb,uuid)'::regprocedure) INTO src;
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'Hospital collection job hook source drift';END IF;
 src:=replace(src,needle,'IF NOT(p_operation=''settlement'' AND hospital_private.collection_authorized(p_cafe_id,p_request_id,p_payload)) THEN '||needle||' END IF;');
 EXECUTE src;
END $$;

CREATE FUNCTION hospital_private.account_guard(c uuid,method text,account uuid,shift uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.bf_accounts%ROWTYPE;s public.bf_shifts%ROWTYPE;
BEGIN
 IF method NOT IN('cash','card') THEN RAISE EXCEPTION 'HOSPITAL_INVALID_PAYMENT';END IF;
 SELECT * INTO a FROM public.bf_accounts WHERE cafe_id=c AND id=account AND active AND kind=CASE WHEN method='cash' THEN 'cash' ELSE 'pos' END FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'HOSPITAL_INVALID_PAYMENT';END IF;
 SELECT * INTO s FROM public.bf_shifts WHERE cafe_id=c AND id=shift AND user_id=auth.uid() AND status='open' AND NOT supervisor_paused FOR UPDATE;
 IF NOT FOUND OR (method='cash' AND s.account_id<>account) THEN RAISE EXCEPTION 'HOSPITAL_SHIFT_REQUIRED';END IF;
END $$;

CREATE FUNCTION hospital_private.posting_guard(c uuid,shift uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.bf_settings WHERE cafe_id=c AND closed_through>=(now() AT TIME ZONE 'Asia/Riyadh')::date)
 OR EXISTS(SELECT 1 FROM public.bf_gl_periods WHERE cafe_id=c AND closed AND (now() AT TIME ZONE 'Asia/Riyadh')::date BETWEEN period_start AND period_end) THEN RAISE EXCEPTION 'HOSPITAL_PERIOD_CLOSED';END IF;
 PERFORM 1 FROM public.bf_shifts WHERE cafe_id=c AND id=shift AND user_id=auth.uid() AND status='open' AND NOT supervisor_paused FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'HOSPITAL_SHIFT_REQUIRED';END IF;
END $$;

CREATE FUNCTION public.hospital_order_manage(p_cafe uuid,p_order uuid,p_request uuid,p_action text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.hospital_orders%ROWTYPE;ev public.hospital_order_events%ROWTYPE;line jsonb;confirmed jsonb;rows jsonb:='[]';idx integer:=0;price numeric;subtotal numeric:=0;final_total numeric;party uuid;party_type text;party_name text;debtor_phone text;result jsonb;sale jsonb;cfg public.bf_settings%ROWTYPE;
BEGIN
 IF NOT hospital_private.can_manage(p_cafe) OR brand_finance_private.role_for(p_cafe) NOT IN('owner','manager','cashier') THEN RAISE EXCEPTION 'HOSPITAL_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>20000 THEN RAISE EXCEPTION 'HOSPITAL_INVALID_INPUT';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,60412));
 SELECT * INTO o FROM public.hospital_orders WHERE cafe_id=p_cafe AND id=p_order FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'HOSPITAL_NOT_FOUND';END IF;
 SELECT * INTO ev FROM public.hospital_order_events WHERE cafe_id=p_cafe AND request_id=p_request;
 IF FOUND THEN IF ev.order_id IS DISTINCT FROM p_order OR ev.action<>p_action OR ev.payload<>p_payload OR ev.actor_id<>auth.uid() THEN RAISE EXCEPTION 'HOSPITAL_REQUEST_CHANGED';END IF;RETURN ev.result||'{"duplicate":true}'::jsonb;END IF;
 IF p_action='checkout' THEN
  IF o.finance_document_id IS NOT NULL OR o.status IN('completed','cancelled') THEN RAISE EXCEPTION 'HOSPITAL_ALREADY_INVOICED';END IF;
  IF coalesce(p_payload->>'paymentMethod','') NOT IN('cash','card','credit') THEN RAISE EXCEPTION 'HOSPITAL_INVALID_PAYMENT';END IF;
  IF jsonb_typeof(p_payload->'confirmedPrices') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'confirmedPrices')<>jsonb_array_length(o.items) THEN RAISE EXCEPTION 'HOSPITAL_CONFIRM_PRICES';END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(o.items) LOOP
   SELECT x INTO confirmed FROM jsonb_array_elements(p_payload->'confirmedPrices')x WHERE (x->>'index')::integer=idx;
   IF confirmed IS NULL OR (SELECT count(*) FROM jsonb_array_elements(p_payload->'confirmedPrices')x WHERE (x->>'index')::integer=idx)<>1 THEN RAISE EXCEPTION 'HOSPITAL_CONFIRM_PRICES';END IF;
   price:=(confirmed->>'unitPrice')::numeric;
   IF price IS NULL OR price< (line->>'unitPrice')::numeric OR price>(line->>'maxUnitPrice')::numeric OR price<>round(price,2) THEN RAISE EXCEPTION 'HOSPITAL_CONFIRM_PRICES';END IF;
   rows:=rows||jsonb_build_array(jsonb_build_object('productId',line->>'productId','quantity',(line->>'quantity')::numeric,'price',price,'expectedUnitPrice',price,'hospitalLineIndex',idx));
   subtotal:=subtotal+round(price*(line->>'quantity')::numeric,2);idx:=idx+1;
  END LOOP;
  SELECT * INTO STRICT cfg FROM public.bf_settings WHERE cafe_id=p_cafe;
  IF cfg.vat_rate<>o.vat_rate OR cfg.tax_inclusive<>o.tax_inclusive THEN RAISE EXCEPTION 'HOSPITAL_TAX_CHANGED';END IF;
  final_total:=subtotal+CASE WHEN cfg.tax_inclusive THEN 0 ELSE round(subtotal*cfg.vat_rate/100,2) END;
  PERFORM hospital_private.posting_guard(p_cafe,(p_payload->>'shiftId')::uuid);
  IF p_payload->>'paymentMethod'='credit' THEN
   party_type:=p_payload->>'debtorType';party:=(p_payload->>'partyId')::uuid;
   IF party_type NOT IN('doctor','clinic') OR party_type IS NULL THEN RAISE EXCEPTION 'HOSPITAL_DEBTOR_REQUIRED';END IF;
   IF party IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.bf_parties WHERE cafe_id=p_cafe AND id=party AND kind='customer' AND active AND details->>'hospitalDebtorType'=party_type) THEN RAISE EXCEPTION 'HOSPITAL_DEBTOR_REQUIRED';END IF;
   ELSE
    party_name:=btrim(coalesce(p_payload->>'debtorName',''));debtor_phone:=coalesce(p_payload->>'debtorPhone','');
    IF length(party_name) NOT BETWEEN 2 AND 120 OR debtor_phone!~'^(9665[0-9]{8})?$' THEN RAISE EXCEPTION 'HOSPITAL_DEBTOR_REQUIRED';END IF;
    IF party_type='doctor' AND debtor_phone='' THEN RAISE EXCEPTION 'HOSPITAL_DEBTOR_REQUIRED';END IF;
    SELECT id INTO party FROM public.bf_parties WHERE cafe_id=p_cafe AND kind='customer' AND active AND details->>'hospitalDebtorType'=party_type AND name=party_name AND (party_type='clinic' OR bf_parties.phone=debtor_phone) ORDER BY id LIMIT 1;
    IF party IS NULL THEN INSERT INTO public.bf_parties(cafe_id,name,kind,phone,details) VALUES(p_cafe,party_name,'customer',debtor_phone,jsonb_build_object('hospitalDebtorType',party_type,'clinic',o.clinic)) RETURNING id INTO party;END IF;
   END IF;
  ELSE PERFORM hospital_private.account_guard(p_cafe,p_payload->>'paymentMethod',(p_payload->>'accountId')::uuid,(p_payload->>'shiftId')::uuid);
  END IF;
  INSERT INTO hospital_private.checkout_quotes(cafe_id,request_id,actor_id,transaction_id,lines) VALUES(p_cafe,p_request,auth.uid(),txid_current(),rows);
  sale:=public.brand_finance_execute(p_cafe,'sale',jsonb_build_object('lines',rows,'discount',0,'partyId',party,'accountId',CASE WHEN p_payload->>'paymentMethod'<>'credit' THEN p_payload->>'accountId' END,'shiftId',p_payload->>'shiftId','warehouseId',p_payload->>'warehouseId','expectedTotal',final_total,'note',left('Hospital #'||o.number||' / '||o.floor||' / '||o.clinic||' / '||o.customer_name||' / '||coalesce(p_payload->>'note',''),1000)),p_request);
  DELETE FROM hospital_private.checkout_quotes WHERE cafe_id=p_cafe AND request_id=p_request;
  UPDATE public.hospital_orders SET finance_document_id=(sale->>'id')::uuid,payment_status=CASE WHEN p_payload->>'paymentMethod'='credit' THEN 'credit' ELSE 'paid' END,status=CASE WHEN status='pending' THEN 'accepted' ELSE status END,total=final_total,total_max=final_total,
   items=(SELECT jsonb_agg(x.value||jsonb_build_object('quotedUnitPrice',x.value->'unitPrice','quotedMaxUnitPrice',x.value->'maxUnitPrice','unitPrice',rows->(x.ordinality::integer-1)->'price','maxUnitPrice',rows->(x.ordinality::integer-1)->'price') ORDER BY x.ordinality) FROM jsonb_array_elements(o.items) WITH ORDINALITY x(value,ordinality)),updated_at=now() WHERE id=o.id RETURNING * INTO o;
 ELSIF p_action='accept' AND o.status='pending' THEN UPDATE public.hospital_orders SET status='accepted',updated_at=now() WHERE id=o.id RETURNING * INTO o;
 ELSIF p_action='prepare' AND o.status='accepted' THEN UPDATE public.hospital_orders SET status='preparing',updated_at=now() WHERE id=o.id RETURNING * INTO o;
 ELSIF p_action='ready' AND o.status='preparing' THEN UPDATE public.hospital_orders SET status='ready',updated_at=now() WHERE id=o.id RETURNING * INTO o;
 ELSIF p_action='complete' AND o.status IN('accepted','preparing','ready') AND o.finance_document_id IS NOT NULL THEN UPDATE public.hospital_orders SET status='completed',updated_at=now() WHERE id=o.id RETURNING * INTO o;
 ELSIF p_action='cancel' AND o.finance_document_id IS NULL AND o.status NOT IN('completed','cancelled') AND length(btrim(coalesce(p_payload->>'note','')))>=3 THEN UPDATE public.hospital_orders SET status='cancelled',updated_at=now() WHERE id=o.id RETURNING * INTO o;
 ELSE RAISE EXCEPTION 'HOSPITAL_INVALID_STATE';END IF;
 result:=jsonb_build_object('id',o.id,'status',o.status,'paymentStatus',o.payment_status,'financeDocumentId',o.finance_document_id,'financeDocumentNumber',sale->'number');
 INSERT INTO public.hospital_order_events(cafe_id,request_id,order_id,action,payload,result,actor_id) VALUES(p_cafe,p_request,p_order,p_action,p_payload,result,auth.uid());
 RETURN result;
END $$;

CREATE FUNCTION public.hospital_debts_read(p_cafe uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT hospital_private.can_manage(p_cafe) THEN RAISE EXCEPTION 'HOSPITAL_FORBIDDEN' USING ERRCODE='42501';END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'phone',p.phone,'debtorType',p.details->>'hospitalDebtorType','balance',coalesce(d.balance,0),'documents',coalesce(d.docs,'[]'::jsonb),'receipts',coalesce(r.receipts,'[]'::jsonb)) ORDER BY p.name,p.id)
 FROM public.bf_parties p LEFT JOIN LATERAL(SELECT sum((brand_finance_private.document_state(p_cafe,x.id)->>'outstanding')::numeric) balance,jsonb_agg(jsonb_build_object('id',x.id,'number',x.number,'total',x.total,'outstanding',(brand_finance_private.document_state(p_cafe,x.id)->>'outstanding')::numeric,'createdAt',x.created_at) ORDER BY x.created_at DESC) docs FROM public.bf_documents x WHERE x.cafe_id=p_cafe AND x.party_id=p.id AND x.kind='sale')d ON true
 LEFT JOIN LATERAL(SELECT jsonb_agg(jsonb_build_object('id',x.id,'number',x.number,'amount',(brand_finance_private.payment_document(x)).total,'paymentMethod',CASE WHEN a.kind='cash' THEN 'cash' ELSE 'card' END,'createdAt',x.created_at,'note',x.note) ORDER BY x.created_at DESC) receipts FROM public.bf_documents x JOIN public.bf_accounts a ON a.cafe_id=x.cafe_id AND a.id=x.account_id WHERE x.cafe_id=p_cafe AND x.party_id=p.id AND x.kind='settlement')r ON true
 WHERE p.cafe_id=p_cafe AND p.kind='customer' AND p.active AND p.details->>'hospitalDebtorType' IN('doctor','clinic')),'[]'::jsonb);
END $$;

CREATE FUNCTION public.hospital_debt_collect(p_cafe uuid,p_request uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ev public.hospital_order_events%ROWTYPE;party uuid:=(p_payload->>'partyId')::uuid;aid uuid:=(p_payload->>'accountId')::uuid;sid uuid:=(p_payload->>'shiftId')::uuid;amount numeric:=(p_payload->>'amount')::numeric;leftover numeric;balance numeric;due numeric;take numeric;d public.bf_documents%ROWTYPE;child_request uuid;settlement_payload jsonb;posted jsonb;receipts jsonb:='[]';result jsonb;
BEGIN
 IF NOT hospital_private.can_manage(p_cafe) OR brand_finance_private.role_for(p_cafe) NOT IN('owner','manager','cashier') THEN RAISE EXCEPTION 'HOSPITAL_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR amount IS NULL OR amount<=0 OR amount>100000000 OR amount<>round(amount,2) OR octet_length(p_payload::text)>3000 THEN RAISE EXCEPTION 'HOSPITAL_INVALID_INPUT';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,60412));
 SELECT * INTO ev FROM public.hospital_order_events WHERE cafe_id=p_cafe AND request_id=p_request;
 IF FOUND THEN IF ev.action<>'collect' OR ev.payload<>p_payload OR ev.actor_id<>auth.uid() THEN RAISE EXCEPTION 'HOSPITAL_REQUEST_CHANGED';END IF;RETURN ev.result||'{"duplicate":true}'::jsonb;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bf_parties WHERE cafe_id=p_cafe AND id=party AND active AND kind='customer' AND details->>'hospitalDebtorType' IN('doctor','clinic')) THEN RAISE EXCEPTION 'HOSPITAL_DEBTOR_REQUIRED';END IF;
 PERFORM hospital_private.posting_guard(p_cafe,sid);
 PERFORM hospital_private.account_guard(p_cafe,p_payload->>'paymentMethod',aid,sid);
 SELECT coalesce(sum((brand_finance_private.document_state(p_cafe,id)->>'outstanding')::numeric),0) INTO balance FROM public.bf_documents WHERE cafe_id=p_cafe AND party_id=party AND kind='sale';
 IF amount>balance THEN RAISE EXCEPTION 'HOSPITAL_OVERPAYMENT';END IF;
 leftover:=amount;
 FOR d IN SELECT * FROM public.bf_documents WHERE cafe_id=p_cafe AND party_id=party AND kind='sale' ORDER BY created_at,id FOR UPDATE LOOP
  due:=(brand_finance_private.document_state(p_cafe,d.id)->>'outstanding')::numeric;take:=least(due,leftover);IF take<=0 THEN CONTINUE;END IF;
  child_request:=gen_random_uuid();settlement_payload:=jsonb_build_object('documentId',d.id,'amount',take,'accountId',aid,'shiftId',sid,'note',left(coalesce(p_payload->>'note','Hospital debt collection'),500));
  INSERT INTO hospital_private.collection_context(cafe_id,request_id,actor_id,transaction_id,payload) VALUES(p_cafe,child_request,auth.uid(),txid_current(),settlement_payload);
  posted:=public.brand_finance_execute(p_cafe,'settlement',settlement_payload,child_request);
  DELETE FROM hospital_private.collection_context WHERE cafe_id=p_cafe AND request_id=child_request;
  receipts:=receipts||jsonb_build_array(jsonb_build_object('id',posted->'id','number',posted->'number','amount',take));leftover:=leftover-take;EXIT WHEN leftover=0;
 END LOOP;
 IF leftover<>0 THEN RAISE EXCEPTION 'HOSPITAL_OVERPAYMENT';END IF;
 result:=jsonb_build_object('partyId',party,'amount',amount,'balance',balance-amount,'receipts',receipts);
 INSERT INTO public.hospital_order_events(cafe_id,request_id,action,payload,result,actor_id) VALUES(p_cafe,p_request,'collect',p_payload,result,auth.uid());RETURN result;
END $$;

CREATE FUNCTION public.hospital_access_enabled(p_cafe uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT hospital_private.can_manage(p_cafe) $$;
REVOKE ALL ON FUNCTION public.hospital_access_enabled(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.hospital_access_enabled(uuid) TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hospital_private FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION hospital_private.can_manage(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.hospital_order_submit(text,uuid,jsonb,text),public.hospital_counter_order(uuid,uuid,jsonb),public.hospital_orders_read(uuid),public.hospital_order_manage(uuid,uuid,uuid,text,jsonb),public.hospital_debts_read(uuid),public.hospital_debt_collect(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hospital_order_submit(text,uuid,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hospital_counter_order(uuid,uuid,jsonb),public.hospital_orders_read(uuid),public.hospital_order_manage(uuid,uuid,uuid,text,jsonb),public.hospital_debts_read(uuid),public.hospital_debt_collect(uuid,uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') AND NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='hospital_orders') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.hospital_orders;END IF;
END $$;
COMMIT;
