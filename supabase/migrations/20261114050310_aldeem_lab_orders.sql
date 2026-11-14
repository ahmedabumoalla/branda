BEGIN;
CREATE SCHEMA erp_lab_private;
REVOKE ALL ON SCHEMA erp_lab_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.erp_lab_operators(cafe_id uuid NOT NULL,user_id uuid NOT NULL,enabled boolean NOT NULL DEFAULT true,updated_by uuid NOT NULL REFERENCES auth.users(id),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(cafe_id,user_id),FOREIGN KEY(cafe_id,user_id) REFERENCES public.bf_staff(cafe_id,user_id));
CREATE TABLE public.erp_lab_orders(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),number bigint GENERATED ALWAYS AS IDENTITY,
 branch_id uuid NOT NULL,customer_id uuid NOT NULL,required_at timestamptz NOT NULL,notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
 status text NOT NULL DEFAULT 'requested' CHECK(status IN('requested','preparing','on_hold','prepared','out_for_delivery','delivered','recalled','cancelled')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),lines jsonb NOT NULL CHECK(jsonb_typeof(lines)='array' AND jsonb_array_length(lines) BETWEEN 1 AND 50),
 invoice_id uuid,quality jsonb,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(cafe_id,id),UNIQUE(cafe_id,invoice_id),FOREIGN KEY(branch_id,cafe_id) REFERENCES public.branches(id,cafe_id),FOREIGN KEY(cafe_id,customer_id) REFERENCES public.bf_parties(cafe_id,id),FOREIGN KEY(cafe_id,invoice_id) REFERENCES public.bf_documents(cafe_id,id)
);
CREATE INDEX erp_lab_orders_queue ON public.erp_lab_orders(cafe_id,status,required_at);
CREATE INDEX erp_lab_orders_creator ON public.erp_lab_orders(cafe_id,created_by,created_at DESC);
CREATE INDEX erp_lab_orders_branch ON public.erp_lab_orders(branch_id,cafe_id);
CREATE INDEX erp_lab_orders_customer ON public.erp_lab_orders(cafe_id,customer_id);
CREATE INDEX erp_lab_orders_actor ON public.erp_lab_orders(created_by);
CREATE INDEX erp_lab_operators_actor ON public.erp_lab_operators(updated_by);
CREATE TABLE public.erp_lab_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,order_id uuid,action text NOT NULL,note text NOT NULL DEFAULT '',payload jsonb NOT NULL DEFAULT '{}'::jsonb,actor uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(cafe_id,order_id) REFERENCES public.erp_lab_orders(cafe_id,id));
CREATE INDEX erp_lab_events_order ON public.erp_lab_events(cafe_id,order_id,created_at);
CREATE INDEX erp_lab_events_actor ON public.erp_lab_events(actor);
CREATE TABLE public.erp_lab_safety_profiles(cafe_id uuid NOT NULL REFERENCES public.cafes(id),product_id uuid NOT NULL REFERENCES public.menu_products(id),revision integer NOT NULL CHECK(revision>0),payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=10000),updated_by uuid NOT NULL REFERENCES auth.users(id),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(cafe_id,product_id));
CREATE INDEX erp_lab_safety_profiles_product ON public.erp_lab_safety_profiles(product_id);
CREATE INDEX erp_lab_safety_profiles_actor ON public.erp_lab_safety_profiles(updated_by);
CREATE TABLE erp_lab_private.requests(cafe_id uuid NOT NULL,request_id uuid NOT NULL,actor uuid NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,PRIMARY KEY(cafe_id,request_id));
ALTER TABLE public.erp_lab_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_lab_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_lab_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_lab_safety_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_lab_orders,public.erp_lab_events,public.erp_lab_operators,public.erp_lab_safety_profiles FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.erp_lab_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION erp_lab_private.role_for(c uuid) RETURNS text LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r text;BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'سجل الدخول أولًا' USING ERRCODE='42501';END IF;
 r:=brand_finance_private.role_for(c);
 IF coalesce(r,'') NOT IN('owner','manager','cashier','accountant','warehouse','auditor') THEN RAISE EXCEPTION 'لا تملك صلاحية المعمل' USING ERRCODE='42501';END IF;
 RETURN r;
END $$;
CREATE FUNCTION erp_lab_private.operator(c uuid,r text) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT r IN('owner','manager') OR EXISTS(SELECT 1 FROM public.erp_lab_operators o JOIN public.bf_staff s USING(cafe_id,user_id) WHERE o.cafe_id=c AND o.user_id=auth.uid() AND o.enabled AND s.active AND s.role<>'auditor')
$$;
CREATE FUNCTION erp_lab_private.branch_allowed(c uuid,b uuid,r text) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.branches WHERE cafe_id=c AND id=b AND active AND deleted_at IS NULL)
 AND (r IN('owner','manager') OR erp_branch_private.branch_allowed(c,b) OR NOT EXISTS(SELECT 1 FROM public.erp_hr_employees WHERE cafe_id=c AND user_id=auth.uid()))
$$;
CREATE FUNCTION erp_lab_private.normalize_phone(value text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE western text;saudi text;digits text;BEGIN
 western:=btrim(translate(value,'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'));
 IF western IS NULL OR length(western)>30 OR western !~ '^[+0-9 ()-]+$' THEN RETURN NULL;END IF;
 saudi:=public.normalize_customer_phone(western);IF saudi IS NOT NULL THEN RETURN saudi;END IF;
 digits:=regexp_replace(western,'[^0-9]','','g');IF digits LIKE '00%' THEN digits:=substring(digits FROM 3);END IF;
 IF digits !~ '^[1-9][0-9]{7,14}$' THEN RETURN NULL;END IF;RETURN '+'||digits;
END $$;
CREATE INDEX erp_lab_customer_phone ON public.bf_parties(cafe_id,erp_lab_private.normalize_phone(phone)) WHERE kind='customer';
CREATE FUNCTION erp_lab_private.resource_allowed(c uuid,b uuid,k text,id uuid,r text) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE shared boolean;BEGIN
 IF NOT coalesce(erp_lab_private.branch_allowed(c,b,r),false) THEN RETURN false;END IF;
 IF erp_branch_private.branch_allowed(c,b) THEN RETURN erp_branch_private.allowed_resource(c,b,k,id);END IF;
 -- Existing finance cashiers without an HR branch assignment retain shared-default access.
 SELECT CASE k WHEN 'customer' THEN coalesce((payload->>'shareCustomers')::boolean,true) WHEN 'item' THEN coalesce((payload->>'shareProducts')::boolean,true) ELSE false END INTO shared FROM public.erp_branch_settings WHERE cafe_id=c;
 RETURN coalesce(shared,true) OR NOT EXISTS(SELECT 1 FROM public.erp_branch_resources WHERE cafe_id=c AND kind=k AND record_id=id) OR EXISTS(SELECT 1 FROM public.erp_branch_resources WHERE cafe_id=c AND kind=k AND record_id=id AND branch_id=b);
END $$;
CREATE FUNCTION erp_lab_private.product_allowed(c uuid,b uuid,p_product uuid,r text) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT erp_lab_private.branch_allowed(c,b,r) AND NOT EXISTS(
  SELECT 1 FROM(SELECT i.id FROM public.bf_items i WHERE i.cafe_id=c AND i.menu_product_id=p_product UNION SELECT l.item_id FROM public.bf_item_product_links l WHERE l.cafe_id=c AND l.product_id=p_product) item
  WHERE NOT erp_lab_private.resource_allowed(c,b,'item',item.id,r)
 )
$$;
CREATE FUNCTION erp_lab_private.visible(c uuid,k text,p_record uuid,r text) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT r IN('owner','manager') OR EXISTS(SELECT 1 FROM public.branches b WHERE b.cafe_id=c AND CASE WHEN k='product' THEN erp_lab_private.product_allowed(c,b.id,p_record,r) ELSE erp_lab_private.resource_allowed(c,b.id,k,p_record,r) END)
$$;

CREATE FUNCTION erp_lab_private.execute(c uuid,a text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text;op boolean;o public.erp_lab_orders;invoice public.bf_documents;req uuid;old_req erp_lab_private.requests;result jsonb;lines jsonb;line jsonb;product public.menu_products;b uuid;customer uuid;due timestamptz;target text;q jsonb;target_user uuid;safety public.erp_lab_safety_profiles;profiles jsonb;record_key text;low_temp numeric;high_temp numeric;next_revision integer;normalized_phone text;matches integer;party public.bf_parties;
BEGIN
 r:=erp_lab_private.role_for(c);op:=erp_lab_private.operator(c,r);
 IF jsonb_typeof(p)<>'object' OR octet_length(p::text)>50000 OR length(coalesce(p->>'notes',''))>2000 OR length(coalesce(p->>'note',''))>2000 THEN RAISE EXCEPTION 'بيانات الطلب غير صالحة' USING ERRCODE='22023';END IF;
 IF a='operator' THEN
  IF r<>'owner' THEN RAISE EXCEPTION 'إدارة مسؤولي المعمل للمالك فقط' USING ERRCODE='42501';END IF;
  target_user:=(p->>'userId')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.bf_staff s WHERE s.cafe_id=c AND s.user_id=target_user AND s.active AND s.role<>'auditor') THEN RAISE EXCEPTION 'اختر مستخدمًا نشطًا غير مدقق' USING ERRCODE='22023';END IF;
  INSERT INTO public.erp_lab_operators(cafe_id,user_id,enabled,updated_by) VALUES(c,target_user,(p->>'enabled')::boolean,auth.uid()) ON CONFLICT(cafe_id,user_id) DO UPDATE SET enabled=EXCLUDED.enabled,updated_by=EXCLUDED.updated_by,updated_at=clock_timestamp();
  INSERT INTO public.erp_lab_events(cafe_id,action,payload,actor) VALUES(c,'operator',p,auth.uid());RETURN jsonb_build_object('id',target_user,'revision',1);
 END IF;
 IF a='profile' THEN
  IF r NOT IN('owner','manager') THEN RAISE EXCEPTION 'اعتماد ملف السلامة للمالك أو المدير فقط' USING ERRCODE='42501';END IF;
  PERFORM erp_access_private.assert_allowed(c,'manufacturing','settings');
  SELECT * INTO product FROM public.menu_products WHERE cafe_id=c AND id=(p->>'productId')::uuid AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'المنتج غير موجود في العلامة' USING ERRCODE='22023';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(c::text||product.id::text,19));
  SELECT * INTO safety FROM public.erp_lab_safety_profiles WHERE cafe_id=c AND product_id=product.id FOR UPDATE;
  IF coalesce(safety.revision,0) IS DISTINCT FROM (p->>'revision')::integer THEN RAISE EXCEPTION 'تغير ملف السلامة أعد تحميله' USING ERRCODE='40001';END IF;
  IF jsonb_typeof(p->'enabled') IS DISTINCT FROM 'boolean' OR coalesce(length(trim(p->>'recipeVersion')),0) NOT BETWEEN 1 AND 100 OR coalesce(length(trim(p->>'processReference')),0) NOT BETWEEN 1 AND 500
   OR coalesce(length(trim(p->>'allergens')),0) NOT BETWEEN 1 AND 1000 OR coalesce(length(trim(p->>'storageInstructions')),0) NOT BETWEEN 1 AND 1000
   OR jsonb_typeof(p->'minimumTemperature') IS DISTINCT FROM 'number' OR jsonb_typeof(p->'maximumTemperature') IS DISTINCT FROM 'number'
   OR (p->>'minimumTemperature')::numeric NOT BETWEEN -100 AND 400 OR (p->>'maximumTemperature')::numeric NOT BETWEEN -100 AND 400 OR (p->>'minimumTemperature')::numeric>(p->>'maximumTemperature')::numeric
   OR jsonb_typeof(p->'maxShelfLifeDays') IS DISTINCT FROM 'number' OR (p->>'maxShelfLifeDays')::numeric NOT BETWEEN 1 AND 3660 OR trunc((p->>'maxShelfLifeDays')::numeric)<>(p->>'maxShelfLifeDays')::numeric
   OR jsonb_typeof(p->'requiredRecords') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'requiredRecords') NOT BETWEEN 1 AND 7
   OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p->'requiredRecords') v WHERE v NOT IN('supplier','cleaning','temperature','packaging','lab_test','staff_health','pest_control')) THEN RAISE EXCEPTION 'أكمل الوصفة والحدود والسجلات المعتمدة للمنتج' USING ERRCODE='22023';END IF;
  next_revision:=coalesce(safety.revision,0)+1;
  INSERT INTO public.erp_lab_safety_profiles(cafe_id,product_id,revision,payload,updated_by) VALUES(c,product.id,next_revision,p-'revision'-'productId',auth.uid()) ON CONFLICT(cafe_id,product_id) DO UPDATE SET revision=EXCLUDED.revision,payload=EXCLUDED.payload,updated_by=EXCLUDED.updated_by,updated_at=clock_timestamp();
  INSERT INTO public.erp_lab_events(cafe_id,action,payload,actor) VALUES(c,'safety_profile',jsonb_build_object('productId',product.id,'revision',next_revision,'before',safety.payload,'after',p),auth.uid());
  RETURN jsonb_build_object('id',product.id,'revision',next_revision);
 END IF;
 req:=(p->>'requestId')::uuid;IF req IS NULL THEN RAISE EXCEPTION 'مرجع الطلب مطلوب' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(c::text||req::text,0));
 SELECT * INTO old_req FROM erp_lab_private.requests WHERE cafe_id=c AND request_id=req;
 IF FOUND THEN IF old_req.actor<>auth.uid() OR old_req.payload<>jsonb_build_object('action',a,'payload',p) THEN RAISE EXCEPTION 'مرجع الطلب مستخدم لعملية مختلفة' USING ERRCODE='22023';END IF;RETURN old_req.result||'{"duplicate":true}'::jsonb;END IF;
 IF a='customer' THEN
  IF r NOT IN('owner','manager','cashier','accountant') THEN RAISE EXCEPTION 'لا تملك صلاحية إضافة عميل الطلب' USING ERRCODE='42501';END IF;
  IF p-'requestId'-'branchId'-'name'-'phone'<>'{}'::jsonb OR coalesce(length(trim(p->>'name')),0) NOT BETWEEN 2 AND 150 THEN RAISE EXCEPTION 'أدخل اسم العميل ورقم جواله فقط' USING ERRCODE='22023';END IF;
  b:=nullif(p->>'branchId','')::uuid;
  IF b IS NULL THEN SELECT branch_id INTO b FROM public.erp_branch_scopes WHERE cafe_id=c AND user_id=auth.uid();END IF;
  IF b IS NULL THEN SELECT branch_id INTO b FROM public.erp_hr_employees WHERE cafe_id=c AND user_id=auth.uid() AND active;END IF;
  IF b IS NULL THEN SELECT min(br.id::text)::uuid INTO b FROM public.branches br WHERE br.cafe_id=c AND erp_lab_private.branch_allowed(c,br.id,r) HAVING count(*)=1;END IF;
  IF b IS NOT NULL AND NOT coalesce(erp_lab_private.branch_allowed(c,b,r),false) THEN RAISE EXCEPTION 'الفرع غير متاح لك' USING ERRCODE='42501';END IF;
  IF b IS NULL AND EXISTS(SELECT 1 FROM public.erp_branch_settings WHERE cafe_id=c AND payload->>'shareCustomers'='false') THEN RAISE EXCEPTION 'اختر فرع الطلب قبل إضافة العميل' USING ERRCODE='22023';END IF;
  normalized_phone:=erp_lab_private.normalize_phone(p->>'phone');IF normalized_phone IS NULL THEN RAISE EXCEPTION 'أدخل رقم جوال سعودي أو رقمًا دوليًا مع مفتاح الدولة' USING ERRCODE='22023';END IF;
  IF normalized_phone LIKE '+%' AND btrim(translate(p->>'phone','٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789')) !~ '^(\+|00)' THEN RAISE EXCEPTION 'أضف مفتاح الدولة للرقم الدولي' USING ERRCODE='22023';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(c::text||normalized_phone,57));
  SELECT count(*) INTO matches FROM public.bf_parties p WHERE p.cafe_id=c AND p.kind='customer' AND erp_lab_private.normalize_phone(p.phone)=normalized_phone;
  IF EXISTS(SELECT 1 FROM public.bf_parties party_match WHERE party_match.cafe_id=c AND party_match.kind='customer' AND erp_lab_private.normalize_phone(party_match.phone)=normalized_phone AND NOT CASE WHEN b IS NULL THEN erp_lab_private.visible(c,'customer',party_match.id,r) ELSE erp_lab_private.resource_allowed(c,b,'customer',party_match.id,r) END) THEN RAISE EXCEPTION 'تعذر إضافة العميل بهذا الرقم راجع مسؤول المالية' USING ERRCODE='42501';END IF;
  IF matches>1 THEN RAISE EXCEPTION 'يوجد أكثر من عميل بهذا الرقم اختر العميل الصحيح من القائمة دون دمج السجلات' USING ERRCODE='22023';END IF;
  IF matches=1 THEN
   SELECT * INTO party FROM public.bf_parties p WHERE p.cafe_id=c AND p.kind='customer' AND erp_lab_private.normalize_phone(p.phone)=normalized_phone;
   IF NOT party.active THEN RAISE EXCEPTION 'العميل مسجل لكنه غير نشط اطلب من المالك تفعيله' USING ERRCODE='22023';END IF;
  ELSE
   INSERT INTO public.bf_parties(cafe_id,kind,name,phone) VALUES(c,'customer',trim(p->>'name'),normalized_phone) RETURNING * INTO party;
   IF b IS NOT NULL AND EXISTS(SELECT 1 FROM public.erp_branch_settings WHERE cafe_id=c AND payload->>'shareCustomers'='false') THEN INSERT INTO public.erp_branch_resources(cafe_id,kind,record_id,branch_id) VALUES(c,'customer',party.id,b);END IF;
  END IF;
  result:=jsonb_build_object('id',party.id,'revision',1,'existing',matches=1);
  INSERT INTO public.erp_lab_events(cafe_id,action,payload,actor) VALUES(c,'customer',jsonb_build_object('customerId',party.id,'existing',matches=1),auth.uid());
  INSERT INTO erp_lab_private.requests VALUES(c,req,auth.uid(),jsonb_build_object('action',a,'payload',p),result);
  RETURN result;
 END IF;
 IF a='create' THEN
  IF r NOT IN('owner','manager','cashier','accountant') THEN RAISE EXCEPTION 'لا تملك صلاحية إرسال طلب للمعمل' USING ERRCODE='42501';END IF;
  b:=(p->>'branchId')::uuid;customer:=(p->>'customerId')::uuid;due:=(p->>'requiredAt')::timestamptz;
  IF NOT coalesce(erp_lab_private.branch_allowed(c,b,r),false) THEN RAISE EXCEPTION 'الفرع غير متاح لك' USING ERRCODE='42501';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.bf_parties WHERE cafe_id=c AND id=customer AND kind='customer' AND active) THEN RAISE EXCEPTION 'اختر عميلًا نشطًا من المالية' USING ERRCODE='22023';END IF;
  IF NOT erp_lab_private.resource_allowed(c,b,'customer',customer,r) THEN RAISE EXCEPTION 'العميل غير متاح في فرع الطلب' USING ERRCODE='42501';END IF;
  IF due IS NULL OR due<clock_timestamp()-interval '5 minutes' OR due>clock_timestamp()+interval '2 years' THEN RAISE EXCEPTION 'حدد موعد تسليم قادم خلال سنتين' USING ERRCODE='22023';END IF;
  IF jsonb_typeof(p->'lines')<>'array' OR jsonb_array_length(p->'lines') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'أضف المنتجات المطلوبة' USING ERRCODE='22023';END IF;
  lines:='[]'::jsonb;
  FOR line IN SELECT value FROM jsonb_array_elements(p->'lines') LOOP
   SELECT * INTO product FROM public.menu_products WHERE cafe_id=c AND id=(line->>'productId')::uuid AND deleted_at IS NULL;
   IF NOT FOUND OR coalesce((line->>'quantity')::numeric,0)<=0 OR (line->>'quantity')::numeric>100000 OR round((line->>'quantity')::numeric,3)<>(line->>'quantity')::numeric THEN RAISE EXCEPTION 'راجع المنتج والكمية المطلوبة' USING ERRCODE='22023';END IF;
   IF NOT erp_lab_private.product_allowed(c,b,product.id,r) THEN RAISE EXCEPTION 'المنتج غير متاح في فرع الطلب' USING ERRCODE='42501';END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(lines) x WHERE x->>'productId'=product.id::text) THEN RAISE EXCEPTION 'اجمع كمية المنتج في سطر واحد' USING ERRCODE='22023';END IF;
   lines:=lines||jsonb_build_array(jsonb_build_object('productId',product.id,'name',product.name,'imageUrl',product.image_url,'imageStoragePath',product.image_storage_path,'quantity',(line->>'quantity')::numeric));
  END LOOP;
  INSERT INTO public.erp_lab_orders(cafe_id,branch_id,customer_id,required_at,notes,lines,created_by) VALUES(c,b,customer,due,coalesce(p->>'notes',''),lines,auth.uid()) RETURNING * INTO o;
 ELSE
  SELECT * INTO o FROM public.erp_lab_orders WHERE cafe_id=c AND id=(p->>'id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود' USING ERRCODE='22023';END IF;
  IF o.revision<>(p->>'revision')::integer OR p->>'revision' IS NULL THEN RAISE EXCEPTION 'تغير الطلب أعد تحميله' USING ERRCODE='40001';END IF;
  IF a='invoice' THEN
   IF r NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'ربط الفاتورة يتطلب صلاحية المحاسب' USING ERRCODE='42501';END IF;
   IF NOT erp_lab_private.branch_allowed(c,o.branch_id,r) THEN RAISE EXCEPTION 'طلب المعمل غير متاح في فرعك' USING ERRCODE='42501';END IF;
   IF NOT erp_lab_private.resource_allowed(c,o.branch_id,'customer',o.customer_id,r) OR EXISTS(SELECT 1 FROM jsonb_array_elements(o.lines) l WHERE NOT erp_lab_private.product_allowed(c,o.branch_id,(l->>'productId')::uuid,r)) THEN RAISE EXCEPTION 'موارد الطلب غير متاحة في فرعك' USING ERRCODE='42501';END IF;
   IF o.invoice_id IS NOT NULL OR o.status='cancelled' THEN RAISE EXCEPTION 'الطلب ملغى أو مرتبط بفاتورة بالفعل' USING ERRCODE='22023';END IF;
   SELECT * INTO invoice FROM public.bf_documents WHERE cafe_id=c AND id=(p->>'invoiceId')::uuid AND kind='sale';
   IF NOT FOUND OR invoice.party_id IS DISTINCT FROM o.customer_id THEN RAISE EXCEPTION 'اختر فاتورة مبيعات تخص عميل الطلب' USING ERRCODE='22023';END IF;
   IF EXISTS(SELECT 1 FROM public.erp_branch_documents WHERE cafe_id=c AND document_id=invoice.id AND branch_id<>o.branch_id) THEN RAISE EXCEPTION 'فرع الفاتورة لا يطابق فرع طلب المعمل' USING ERRCODE='22023';END IF;
   IF coalesce((brand_finance_private.document_state(c,invoice.id)->>'refunded_total')::numeric,0)>0 THEN RAISE EXCEPTION 'لا تربط طلبًا جديدًا بفاتورة لها مرتجعات' USING ERRCODE='22023';END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(o.lines) l WHERE (l->>'quantity')::numeric IS DISTINCT FROM (SELECT sum(quantity) FROM public.bf_document_lines dl WHERE dl.cafe_id=c AND dl.document_id=invoice.id AND dl.product_id=(l->>'productId')::uuid))
    OR EXISTS(SELECT 1 FROM public.bf_document_lines dl WHERE dl.cafe_id=c AND dl.document_id=invoice.id AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(o.lines) l WHERE (l->>'productId')::uuid=dl.product_id)) THEN RAISE EXCEPTION 'منتجات وكميات الفاتورة يجب أن تطابق طلب المعمل' USING ERRCODE='22023';END IF;
   UPDATE public.erp_lab_orders SET invoice_id=invoice.id,revision=revision+1,updated_at=clock_timestamp() WHERE id=o.id RETURNING * INTO o;
  ELSIF a='status' THEN
   target:=p->>'status';
   IF NOT op AND NOT(target='cancelled' AND o.status='requested' AND o.created_by=auth.uid() AND r='cashier') THEN RAISE EXCEPTION 'هذا الإجراء لمسؤول المعمل' USING ERRCODE='42501';END IF;
   IF NOT op AND (NOT erp_lab_private.branch_allowed(c,o.branch_id,r) OR NOT erp_lab_private.resource_allowed(c,o.branch_id,'customer',o.customer_id,r) OR EXISTS(SELECT 1 FROM jsonb_array_elements(o.lines) l WHERE NOT erp_lab_private.product_allowed(c,o.branch_id,(l->>'productId')::uuid,r))) THEN RAISE EXCEPTION 'طلب المعمل غير متاح في فرعك' USING ERRCODE='42501';END IF;
   IF NOT coalesce((o.status='requested' AND target IN('preparing','cancelled')) OR(o.status='preparing' AND target IN('prepared','on_hold','cancelled')) OR(o.status='on_hold' AND target IN('preparing','cancelled')) OR(o.status='prepared' AND target IN('out_for_delivery','delivered','on_hold','recalled')) OR(o.status='out_for_delivery' AND target IN('delivered','recalled')) OR(o.status='delivered' AND target='recalled'),false) THEN RAISE EXCEPTION 'انتقال حالة الطلب غير مسموح' USING ERRCODE='22023';END IF;
   IF (target IN('on_hold','recalled') OR o.status='on_hold') AND coalesce(length(trim(p->>'note')),0)<5 THEN RAISE EXCEPTION 'سجل سبب الإيقاف أو السحب والإجراء التصحيحي قبل الاستئناف' USING ERRCODE='22023';END IF;
   IF target='cancelled' AND o.invoice_id IS NOT NULL THEN RAISE EXCEPTION 'عالج الفاتورة المرتبطة ماليًا قبل إلغاء الطلب' USING ERRCODE='22023';END IF;
   q:=o.quality;
   IF target='prepared' THEN
    q:=p->'quality';
    IF q IS NULL OR jsonb_typeof(q)<>'object' OR octet_length(q::text)>10000 OR coalesce(length(trim(q->>'lotCode')),0) NOT BETWEEN 1 AND 100 OR coalesce(length(trim(q->>'allergens')),0) NOT BETWEEN 1 AND 1000 OR coalesce(length(trim(q->>'storageInstructions')),0) NOT BETWEEN 1 AND 1000
      OR coalesce(length(trim(q->>'ingredientLots')),0) NOT BETWEEN 1 AND 2000 OR coalesce(length(trim(q->>'temperatureReading')),0) NOT BETWEEN 1 AND 500
      OR coalesce(length(trim(q->>'processReference')),0) NOT BETWEEN 1 AND 500
      OR jsonb_typeof(q->'temperatureCelsius') IS DISTINCT FROM 'number' OR jsonb_typeof(q->'minimumTemperature') IS DISTINCT FROM 'number' OR jsonb_typeof(q->'maximumTemperature') IS DISTINCT FROM 'number'
      OR (q->>'minimumTemperature')::numeric NOT BETWEEN -100 AND 400 OR (q->>'maximumTemperature')::numeric NOT BETWEEN -100 AND 400 OR (q->>'minimumTemperature')::numeric>(q->>'maximumTemperature')::numeric
      OR (q->>'temperatureCelsius')::numeric NOT BETWEEN (q->>'minimumTemperature')::numeric AND (q->>'maximumTemperature')::numeric
      OR coalesce(q#>>'{checks,ingredients}','false')<>'true' OR coalesce(q#>>'{checks,cleaning}','false')<>'true' OR coalesce(q#>>'{checks,temperature}','false')<>'true' OR coalesce(q#>>'{checks,packaging}','false')<>'true'
      OR coalesce(q->>'producedOn','') !~ '^\d{4}-\d{2}-\d{2}$' OR coalesce(q->>'expiresOn','') !~ '^\d{4}-\d{2}-\d{2}$' OR (q->>'expiresOn')::date<(q->>'producedOn')::date OR (q->>'producedOn')::date>(now() AT TIME ZONE 'Asia/Riyadh')::date OR (q->>'expiresOn')::date<(now() AT TIME ZONE 'Asia/Riyadh')::date THEN RAISE EXCEPTION 'أكمل رقم التشغيلة والصلاحية والحساسية والتخزين وفحوصات التجهيز' USING ERRCODE='22023';END IF;
    profiles:='[]'::jsonb;low_temp:=-100;high_temp:=400;
    FOR line IN SELECT value FROM jsonb_array_elements(o.lines) LOOP
     SELECT * INTO safety FROM public.erp_lab_safety_profiles WHERE cafe_id=c AND product_id=(line->>'productId')::uuid FOR SHARE;
     IF NOT FOUND OR NOT coalesce((safety.payload->>'enabled')::boolean,false) THEN RAISE EXCEPTION 'اعتمد ملف سلامة كل منتج قبل إكمال التجهيز' USING ERRCODE='22023';END IF;
     low_temp:=greatest(low_temp,(safety.payload->>'minimumTemperature')::numeric);high_temp:=least(high_temp,(safety.payload->>'maximumTemperature')::numeric);
     IF (q->>'expiresOn')::date>(q->>'producedOn')::date+(safety.payload->>'maxShelfLifeDays')::integer THEN RAISE EXCEPTION 'تاريخ الصلاحية يتجاوز المدة المعتمدة للمنتج' USING ERRCODE='22023';END IF;
     FOR record_key IN SELECT jsonb_array_elements_text(safety.payload->'requiredRecords') LOOP
      IF coalesce(length(trim(q#>>ARRAY['recordReferences',record_key])),0) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'أكمل مراجع سجلات سلامة الغذاء المطلوبة في ملف المنتج' USING ERRCODE='22023';END IF;
     END LOOP;
     profiles:=profiles||jsonb_build_array(safety.payload||jsonb_build_object('productId',safety.product_id,'productName',line->>'name','revision',safety.revision,'updatedAt',safety.updated_at));
    END LOOP;
    IF low_temp>high_temp THEN RAISE EXCEPTION 'حدود تجهيز المنتجات مختلفة افصلها في طلبات مستقلة' USING ERRCODE='22023';END IF;
    IF (q->>'minimumTemperature')::numeric<>low_temp OR(q->>'maximumTemperature')::numeric<>high_temp OR (q->>'temperatureCelsius')::numeric NOT BETWEEN low_temp AND high_temp THEN RAISE EXCEPTION 'قراءة الحرارة يجب أن تطابق الحدود المحفوظة في ملف السلامة المعتمد' USING ERRCODE='22023';END IF;
    q:=q||jsonb_build_object('approvedProfiles',profiles,'minimumTemperature',low_temp,'maximumTemperature',high_temp,
      'allergens',(SELECT string_agg(DISTINCT value->>'allergens',' | ') FROM jsonb_array_elements(profiles)),
      'storageInstructions',(SELECT string_agg(DISTINCT value->>'storageInstructions',' | ') FROM jsonb_array_elements(profiles)),
      'processReference',(SELECT string_agg(DISTINCT (value->>'processReference')||' / '||(value->>'recipeVersion'),' | ') FROM jsonb_array_elements(profiles)));
   END IF;
   IF target IN('out_for_delivery','delivered') AND (q->>'expiresOn')::date<(now() AT TIME ZONE 'Asia/Riyadh')::date THEN RAISE EXCEPTION 'لا يمكن تسليم منتج منتهي الصلاحية' USING ERRCODE='22023';END IF;
   UPDATE public.erp_lab_orders SET status=target,quality=q,revision=revision+1,updated_at=clock_timestamp() WHERE id=o.id RETURNING * INTO o;
  ELSE RAISE EXCEPTION 'إجراء غير معروف' USING ERRCODE='22023';END IF;
 END IF;
 INSERT INTO public.erp_lab_events(cafe_id,order_id,action,note,payload,actor) VALUES(c,o.id,CASE WHEN a='status' THEN o.status ELSE a END,coalesce(p->>'note',''),jsonb_build_object('revision',o.revision,'invoiceId',o.invoice_id,'quality',o.quality),auth.uid());
 result:=jsonb_build_object('id',o.id,'revision',o.revision);
 INSERT INTO erp_lab_private.requests VALUES(c,req,auth.uid(),jsonb_build_object('action',a,'payload',p),result);
 RETURN result;
END $$;

CREATE FUNCTION erp_lab_private.events(c uuid,o uuid,i uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',ev.id,'action',ev.action,'note',ev.note,'at',ev.at,'actorName',coalesce(s.name,CASE WHEN ev.actor=ca.owner_user_id THEN 'المالك' ELSE 'مستخدم النظام' END)) ORDER BY ev.at,ev.id),'[]'::jsonb)
 FROM(
  SELECT id,action,note,created_at at,actor FROM public.erp_lab_events WHERE cafe_id=c AND order_id=o
  UNION ALL
  SELECT id,CASE WHEN action='delete' THEN 'payment_deleted' ELSE 'payment_updated' END,reason,created_at,created_by FROM public.bf_invoice_payment_events WHERE cafe_id=c AND invoice_id=i
 )ev LEFT JOIN public.bf_staff s ON s.cafe_id=c AND s.user_id=ev.actor JOIN public.cafes ca ON ca.id=c
$$;
CREATE FUNCTION erp_lab_private.read(c uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text;op boolean;rows jsonb;BEGIN
 r:=erp_lab_private.role_for(c);op:=erp_lab_private.operator(c,r);
 SELECT coalesce(jsonb_agg(x.doc ORDER BY x.priority,x.due,x.created),'[]'::jsonb) INTO rows FROM(
 SELECT CASE WHEN o.status IN('delivered','cancelled','recalled') THEN 1 ELSE 0 END priority,o.required_at due,o.created_at created,jsonb_build_object('id',o.id,'number',o.number,'revision',o.revision,'status',o.status,'branchId',o.branch_id,'branchName',b.name,'customerId',o.customer_id,'customerName',p.name,'customerPhone',p.phone,'requiredAt',o.required_at,'notes',o.notes,'createdAt',o.created_at,'lines',o.lines,'quality',o.quality,'invoiceId',o.invoice_id,'invoiceNumber',coalesce(e.display_number,d.number::text),'total',d.total,'outstanding',(state.value->>'outstanding')::numeric,'refunded',coalesce((state.value->>'refunded_total')::numeric,0),
 'paid',coalesce((SELECT sum((brand_finance_private.payment_document(v)).paid) FROM public.bf_documents v WHERE v.cafe_id=c AND(v.id=o.invoice_id OR(v.reference_id=o.invoice_id AND v.kind='settlement'))),0),
 'payments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'number',v.number::text,'amount',(brand_finance_private.payment_document(v)).paid,'method',coalesce(a.name,'غير محدد'),'at',coalesce(ip.financial_at,v.created_at),'status',coalesce(ip.status,'completed')) ORDER BY coalesce(ip.financial_at,v.created_at),v.number) FROM public.bf_documents v LEFT JOIN public.bf_invoice_payments ip ON ip.cafe_id=c AND ip.source_id=v.id LEFT JOIN public.bf_accounts a ON a.cafe_id=c AND a.id=(brand_finance_private.payment_document(v)).account_id WHERE v.cafe_id=c AND(v.id=o.invoice_id OR(v.reference_id=o.invoice_id AND v.kind='settlement')) AND(v.paid>0 OR ip.source_id IS NOT NULL)),'[]'::jsonb),
 'events',erp_lab_private.events(c,o.id,o.invoice_id)) doc
 FROM public.erp_lab_orders o JOIN public.branches b ON b.id=o.branch_id AND b.cafe_id=c JOIN public.bf_parties p ON p.id=o.customer_id AND p.cafe_id=c LEFT JOIN public.bf_documents d ON d.id=o.invoice_id AND d.cafe_id=c LEFT JOIN public.bf_invoice_extensions e ON e.document_id=d.id AND e.cafe_id=c LEFT JOIN LATERAL(SELECT brand_finance_private.document_state(c,d.id) value) state ON d.id IS NOT NULL
 WHERE o.cafe_id=c AND(op OR(erp_lab_private.branch_allowed(c,o.branch_id,r) AND erp_lab_private.resource_allowed(c,o.branch_id,'customer',o.customer_id,r) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(o.lines) l WHERE NOT erp_lab_private.product_allowed(c,o.branch_id,(l->>'productId')::uuid,r)) AND(r IN('accountant','auditor') OR o.created_by=auth.uid()))) ORDER BY CASE WHEN o.status IN('delivered','cancelled','recalled') THEN 1 ELSE 0 END,o.required_at,o.created_at LIMIT 500)x;
 RETURN jsonb_build_object('role',r,'generatedAt',clock_timestamp(),'capabilities',jsonb_build_object('create',r IN('owner','manager','cashier','accountant'),'prepare',op,'linkInvoice',r IN('owner','manager','accountant'),'manageOperators',r='owner','manageSafetyProfiles',r IN('owner','manager') AND erp_access_private.allowed(c,'manufacturing','settings')),'orders',rows,
 'safetyProfiles',coalesce((SELECT jsonb_agg(s.payload||jsonb_build_object('productId',s.product_id,'productName',p.name,'revision',s.revision,'updatedAt',s.updated_at) ORDER BY p.name) FROM public.erp_lab_safety_profiles s JOIN public.menu_products p ON p.id=s.product_id AND p.cafe_id=c WHERE s.cafe_id=c AND(op OR erp_lab_private.visible(c,'product',s.product_id,r))),'[]'::jsonb),
 'products',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'imageUrl',image_url,'imageStoragePath',image_storage_path,'price',price) ORDER BY sort_order,name) FROM public.menu_products WHERE cafe_id=c AND deleted_at IS NULL AND(op OR erp_lab_private.visible(c,'product',id,r))),'[]'::jsonb),
 'customers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'phone',phone) ORDER BY name) FROM public.bf_parties WHERE cafe_id=c AND kind='customer' AND active AND r IN('owner','manager','cashier','accountant') AND erp_lab_private.visible(c,'customer',id,r)),'[]'::jsonb),
 'branches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name) FROM public.branches WHERE cafe_id=c AND erp_lab_private.branch_allowed(c,id,r)),'[]'::jsonb),
 'invoices',coalesce((SELECT jsonb_agg(x.doc) FROM(SELECT jsonb_build_object('id',d.id,'number',coalesce(e.display_number,d.number::text),'customerId',d.party_id,'total',d.total) doc FROM public.bf_documents d LEFT JOIN public.bf_invoice_extensions e ON e.cafe_id=c AND e.document_id=d.id WHERE d.cafe_id=c AND d.kind='sale' AND d.party_id IS NOT NULL AND r IN('owner','manager','accountant') AND erp_lab_private.visible(c,'customer',d.party_id,r) AND NOT EXISTS(SELECT 1 FROM public.erp_branch_documents bd WHERE bd.cafe_id=c AND bd.document_id=d.id AND NOT erp_lab_private.branch_allowed(c,bd.branch_id,r)) AND NOT EXISTS(SELECT 1 FROM public.erp_lab_orders o WHERE o.cafe_id=c AND o.invoice_id=d.id) ORDER BY d.created_at DESC LIMIT 300)x),'[]'::jsonb),
 'operators',coalesce((SELECT jsonb_agg(jsonb_build_object('userId',s.user_id,'name',s.name,'enabled',coalesce(o.enabled,false)) ORDER BY s.name) FROM public.bf_staff s LEFT JOIN public.erp_lab_operators o USING(cafe_id,user_id) WHERE s.cafe_id=c AND s.active AND s.role<>'auditor' AND r='owner'),'[]'::jsonb));
END $$;

CREATE FUNCTION public.erp_lab_read(p_cafe uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT erp_lab_private.read(p_cafe)$$;
CREATE FUNCTION public.erp_lab_execute(p_cafe uuid,p_action text,p_payload jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT erp_lab_private.execute(p_cafe,p_action,p_payload)$$;
CREATE FUNCTION erp_lab_private.require_priced_sale() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF NEW.product_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.menu_products p JOIN public.cafes c ON c.id=p.cafe_id AND c.slug='khayal-aldeem' JOIN public.bf_documents d ON d.cafe_id=p.cafe_id AND d.id=NEW.document_id WHERE p.id=NEW.product_id AND p.cafe_id=NEW.cafe_id AND d.kind='sale' AND p.commerce_details->>'quoteOnly'='true') THEN
  RAISE EXCEPTION 'اعتمد سعر المنتج في المتجر والمنتجات قبل إصدار فاتورة البيع' USING ERRCODE='22023';
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER erp_lab_require_priced_sale BEFORE INSERT ON public.bf_document_lines FOR EACH ROW EXECUTE FUNCTION erp_lab_private.require_priced_sale();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_lab_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.erp_lab_read(uuid),public.erp_lab_execute(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA erp_lab_private TO authenticated;
GRANT EXECUTE ON FUNCTION erp_lab_private.read(uuid),erp_lab_private.execute(uuid,text,jsonb),public.erp_lab_read(uuid),public.erp_lab_execute(uuid,text,jsonb) TO authenticated;
COMMIT;
