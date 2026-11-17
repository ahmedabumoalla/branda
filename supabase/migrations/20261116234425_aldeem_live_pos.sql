BEGIN;
-- Point configuration only. Sales, stock, cash, shifts and points keep their original ledgers.
CREATE SCHEMA aldeem_pos_private;
REVOKE ALL ON SCHEMA aldeem_pos_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE aldeem_pos_private.points(
 id uuid PRIMARY KEY, cafe_id uuid NOT NULL REFERENCES public.cafes(id), revision integer NOT NULL DEFAULT 1,
 name text NOT NULL CHECK(length(name) BETWEEN 2 AND 100),branch_id uuid NOT NULL,employee_id uuid NOT NULL REFERENCES auth.users(id),
 warehouse_id uuid NOT NULL,cash_account_id uuid NOT NULL,card_account_id uuid NOT NULL,enabled boolean NOT NULL DEFAULT true,
 UNIQUE(cafe_id,id),UNIQUE(cafe_id,branch_id,name),
 FOREIGN KEY(branch_id,cafe_id) REFERENCES public.branches(id,cafe_id),
 FOREIGN KEY(cafe_id,warehouse_id) REFERENCES public.bf_warehouses(cafe_id,id),
 FOREIGN KEY(cafe_id,cash_account_id) REFERENCES public.bf_accounts(cafe_id,id),
 FOREIGN KEY(cafe_id,card_account_id) REFERENCES public.bf_accounts(cafe_id,id)
);
CREATE TABLE aldeem_pos_private.prices(cafe_id uuid NOT NULL,point_id uuid NOT NULL,product_id uuid NOT NULL REFERENCES public.menu_products(id),price numeric(14,2) NOT NULL CHECK(price BETWEEN 0 AND 100000),PRIMARY KEY(cafe_id,point_id,product_id),FOREIGN KEY(cafe_id,point_id) REFERENCES aldeem_pos_private.points(cafe_id,id));
CREATE TABLE aldeem_pos_private.requests(cafe_id uuid NOT NULL,request_id uuid NOT NULL,point_id uuid NOT NULL,actor uuid NOT NULL REFERENCES auth.users(id),action text NOT NULL,payload jsonb NOT NULL,result jsonb,document_id uuid,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(cafe_id,request_id),FOREIGN KEY(cafe_id,point_id) REFERENCES aldeem_pos_private.points(cafe_id,id),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id));
CREATE INDEX aldeem_pos_document ON aldeem_pos_private.requests(cafe_id,point_id,created_at) WHERE document_id IS NOT NULL;
CREATE TABLE aldeem_pos_private.shifts(cafe_id uuid NOT NULL,point_id uuid NOT NULL,shift_id uuid NOT NULL,PRIMARY KEY(cafe_id,shift_id),FOREIGN KEY(cafe_id,point_id) REFERENCES aldeem_pos_private.points(cafe_id,id),FOREIGN KEY(cafe_id,shift_id) REFERENCES public.bf_shifts(cafe_id,id));
ALTER TABLE aldeem_pos_private.points ENABLE ROW LEVEL SECURITY;
ALTER TABLE aldeem_pos_private.prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE aldeem_pos_private.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE aldeem_pos_private.shifts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA aldeem_pos_private FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION aldeem_pos_private.role_for(c uuid) RETURNS text LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE r text;BEGIN
 r:=brand_finance_private.role_for(c);
 IF auth.uid() IS NULL OR r IS NULL OR r NOT IN('owner','manager','cashier') OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=c AND slug='khayal-aldeem') THEN RAISE EXCEPTION 'نقطة البيع غير متاحة لهذا الحساب' USING ERRCODE='42501';END IF;
 RETURN r;
END $$;
CREATE FUNCTION aldeem_pos_private.point(c uuid,p uuid) RETURNS aldeem_pos_private.points LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE r text;x aldeem_pos_private.points;BEGIN
 r:=aldeem_pos_private.role_for(c);SELECT * INTO x FROM aldeem_pos_private.points WHERE cafe_id=c AND id=p;
 IF x.id IS NULL OR NOT erp_branch_private.branch_allowed(c,x.branch_id) OR (r NOT IN('owner','manager') AND x.employee_id<>auth.uid()) THEN RAISE EXCEPTION 'لا تملك صلاحية تشغيل نقطة البيع' USING ERRCODE='42501';END IF;RETURN x;
END $$;
-- Preserve the existing treasury branch hook and add a short-lived, validated point context.
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('erp_branch_private.current_branch(uuid)'::regprocedure);
 EXECUTE replace(d,'FUNCTION erp_branch_private.current_branch(', 'FUNCTION aldeem_pos_private.previous_branch(');
END $$;
CREATE OR REPLACE FUNCTION erp_branch_private.current_branch(c uuid) RETURNS uuid LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE j jsonb;p aldeem_pos_private.points;BEGIN
 j:=nullif(current_setting('aldeem.pos_context',true),'')::jsonb;
 IF j IS NOT NULL AND j->>'cafe'=c::text AND j->>'actor'=auth.uid()::text THEN
  p:=aldeem_pos_private.point(c,(j->>'point')::uuid);RETURN p.branch_id;
 END IF;RETURN aldeem_pos_private.previous_branch(c);
END $$;
CREATE FUNCTION aldeem_pos_private.enter(c uuid,p uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN PERFORM aldeem_pos_private.point(c,p);PERFORM set_config('aldeem.pos_context',jsonb_build_object('cafe',c,'point',p,'actor',auth.uid())::text,true);PERFORM erp_branch_private.enter(c);END $$;

CREATE FUNCTION aldeem_pos_private.sale_price(c uuid,r uuid,e jsonb,fallback numeric) RETURNS numeric LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE p uuid;v numeric;BEGIN
 SELECT point_id INTO p FROM aldeem_pos_private.requests WHERE cafe_id=c AND request_id=r AND actor=auth.uid() AND action='sale';
 IF p IS NULL THEN RETURN hospital_private.sale_price(c,r,e,fallback);END IF;
 PERFORM aldeem_pos_private.point(c,p);
 SELECT price INTO v FROM aldeem_pos_private.prices WHERE cafe_id=c AND point_id=p AND product_id=(e->>'productId')::uuid;
 RETURN coalesce(v,fallback);
END $$;
-- This cashier has points, without pager orders, stamp cards or customer messages.
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('brand_finance_private.apply_sale_customer(uuid,uuid,jsonb,uuid)'::regprocedure);
 EXECUTE replace(d,'FUNCTION brand_finance_private.apply_sale_customer(', 'FUNCTION aldeem_pos_private.previous_sale_customer(');
END $$;
CREATE OR REPLACE FUNCTION brand_finance_private.apply_sale_customer(p_cafe uuid,p_document uuid,p_payload jsonb,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE d public.bf_documents;BEGIN
 IF EXISTS(SELECT 1 FROM aldeem_pos_private.requests WHERE cafe_id=p_cafe AND request_id=p_request AND actor=auth.uid() AND action='sale' AND result IS NULL) THEN
  SELECT * INTO STRICT d FROM public.bf_documents WHERE cafe_id=p_cafe AND id=p_document AND kind='sale';
  IF d.customer_phone IS NOT NULL THEN INSERT INTO public.bf_sale_customers(cafe_id,document_id,phone,loyalty_status) VALUES(p_cafe,d.id,d.customer_phone,'unavailable');END IF;
  RETURN jsonb_build_object('phone',d.customer_phone,'pagerOrderId',NULL,'pagerStatus','unavailable','loyaltyStatus','unavailable','notificationStatus','not_applicable');
 END IF;RETURN aldeem_pos_private.previous_sale_customer(p_cafe,p_document,p_payload,p_request);
END $$;
DO $$ DECLARE d text;needle text:='price:=hospital_private.sale_price(p_cafe_id,p_request_id,entry,prod.price)';BEGIN
 d:=pg_get_functiondef('brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid)'::regprocedure);
 IF length(d)-length(replace(d,needle,''))<>length(needle) THEN RAISE EXCEPTION 'Original sale pricing hook changed';END IF;
 EXECUTE replace(d,needle,'price:=aldeem_pos_private.sale_price(p_cafe_id,p_request_id,entry,prod.price)');
END $$;

CREATE FUNCTION aldeem_pos_private.point_json(c uuid,p uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',x.id,'revision',x.revision,'name',x.name,'branchId',x.branch_id,'branch',b.name,'employeeId',x.employee_id,'employee',coalesce(s.name,'مالك الحساب'),'warehouseId',x.warehouse_id,'cashAccountId',x.cash_account_id,'cardAccountId',x.card_account_id,'enabled',x.enabled,
 'sales',coalesce(t.sales,0),'orders',coalesce(t.orders,0),'cash',coalesce(t.cash,0),'card',coalesce(t.card,0),'earned',coalesce(t.earned,0),'redeemed',coalesce(t.redeemed,0),
 'shift',(SELECT to_jsonb(sh) FROM aldeem_pos_private.shifts ps JOIN public.bf_shifts sh ON sh.cafe_id=ps.cafe_id AND sh.id=ps.shift_id WHERE ps.cafe_id=c AND ps.point_id=p AND sh.status='open' ORDER BY sh.opened_at DESC LIMIT 1))
 FROM aldeem_pos_private.points x JOIN public.branches b ON b.id=x.branch_id AND b.cafe_id=c LEFT JOIN public.bf_staff s ON s.cafe_id=c AND s.user_id=x.employee_id
 LEFT JOIN LATERAL(SELECT sum(d.total) sales,count(*) orders,sum(d.total) FILTER(WHERE a.kind='cash') cash,sum(d.total) FILTER(WHERE a.kind IN('bank','pos')) card,
 sum((SELECT coalesce(sum(l.points),0) FROM public.erp_points_ledger l WHERE l.cafe_id=c AND l.document_id=d.id AND l.kind='earn')) earned,
 sum((SELECT coalesce(-sum(l.points),0) FROM public.erp_points_ledger l WHERE l.cafe_id=c AND l.document_id=d.id AND l.kind='redeem')) redeemed
 FROM aldeem_pos_private.requests q JOIN public.bf_documents d ON d.cafe_id=c AND d.id=q.document_id LEFT JOIN public.bf_accounts a ON a.cafe_id=c AND a.id=d.account_id
 WHERE q.cafe_id=c AND q.point_id=p AND q.action='sale' AND d.created_at>=date_trunc('day',now() AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh') t ON true WHERE x.cafe_id=c AND x.id=p
$$;

CREATE FUNCTION public.aldeem_pos_read(p_cafe uuid,p_point uuid DEFAULT NULL,p_query text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid:=p_cafe;r text;p aldeem_pos_private.points;result jsonb;before_context text:=current_setting('aldeem.pos_context',true);BEGIN
 r:=aldeem_pos_private.role_for(c);
 IF length(coalesce(p_query,''))>100 THEN RAISE EXCEPTION 'البحث طويل جدًا';END IF;
 IF p_point IS NULL THEN
  RETURN jsonb_build_object('userId',auth.uid(),'canManage',r IN('owner','manager'),
   'points',coalesce((SELECT jsonb_agg(aldeem_pos_private.point_json(c,x.id) ORDER BY x.name) FROM aldeem_pos_private.points x WHERE x.cafe_id=c AND erp_branch_private.branch_allowed(c,x.branch_id) AND (r IN('owner','manager') OR x.employee_id=auth.uid())),'[]'::jsonb),
   'branches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) ORDER BY b.name) FROM public.branches b WHERE b.cafe_id=c AND erp_branch_private.branch_allowed(c,b.id)),'[]'::jsonb),
   'staff',CASE WHEN r IN('owner','manager') THEN coalesce((SELECT jsonb_agg(x) FROM(SELECT s.user_id id,s.name FROM public.bf_staff s WHERE s.cafe_id=c AND s.active UNION SELECT owner_user_id,'مالك الحساب' FROM public.cafes WHERE id=c) x),'[]'::jsonb) ELSE '[]'::jsonb END,
   'warehouses',CASE WHEN r IN('owner','manager') THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',w.id,'name',w.name)) FROM public.bf_warehouses w WHERE w.cafe_id=c AND w.active),'[]'::jsonb) ELSE '[]'::jsonb END,
   'accounts',CASE WHEN r IN('owner','manager') THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'kind',a.kind,'active',a.active,'is_cashier_drawer',a.is_cashier_drawer,'balance',coalesce((SELECT sum(j.debit-j.credit) FROM public.bf_journal j WHERE j.cafe_id=c AND j.account_id=a.id),0))) FROM public.bf_accounts a WHERE a.cafe_id=c AND a.active AND (a.kind IN('bank','pos') OR a.kind='cash' AND a.is_cashier_drawer) AND coalesce(to_jsonb(a)->>'is_group','false')<>'true' AND coalesce(to_jsonb(a)->>'frozen','false')<>'true'),'[]'::jsonb) ELSE '[]'::jsonb END);
 END IF;
 p:=aldeem_pos_private.point(c,p_point);PERFORM aldeem_pos_private.enter(c,p.id);
 result:=jsonb_build_object('point',aldeem_pos_private.point_json(c,p.id),'userId',auth.uid(),
 'settings',coalesce((SELECT jsonb_build_object('vat_rate',vat_rate,'tax_inclusive',tax_inclusive) FROM public.bf_settings WHERE cafe_id=c),jsonb_build_object('vat_rate',0,'tax_inclusive',true)),
 'pointsSettings',erp_points_private.settings(c)||jsonb_build_object('enabled',erp_points_private.active(c)),
 'cashBalance',coalesce((SELECT sum(debit-credit) FROM public.bf_journal WHERE cafe_id=c AND account_id=p.cash_account_id),0),
 'shift',(SELECT to_jsonb(s) FROM public.bf_shifts s JOIN aldeem_pos_private.shifts ps ON ps.cafe_id=c AND ps.shift_id=s.id WHERE s.cafe_id=c AND ps.point_id=p.id AND s.user_id=auth.uid() AND s.status='open' LIMIT 1),
 'products',coalesce((SELECT jsonb_agg(x ORDER BY x.name) FROM(SELECT m.id,m.name,coalesce(pp.price,m.price) price,coalesce(cat.name,'') category,m.available,false "stockTracked",NULL "itemId",0 quantity,NULL "imageUrl" FROM public.menu_products m LEFT JOIN public.menu_categories cat ON cat.id=m.category_id LEFT JOIN aldeem_pos_private.prices pp ON pp.cafe_id=c AND pp.point_id=p.id AND pp.product_id=m.id WHERE m.cafe_id=c AND m.deleted_at IS NULL AND m.available AND (m.branch_id IS NULL OR m.branch_id=p.branch_id) AND erp_branch_private.allowed_resource(c,p.branch_id,'item',m.id) AND (p_query='' OR m.name ILIKE '%'||p_query||'%') ORDER BY m.name,m.id LIMIT 100) x),'[]'::jsonb));
 PERFORM set_config('aldeem.pos_context',coalesce(before_context,''),true);RETURN result;
END $$;

CREATE FUNCTION public.aldeem_pos_customers(p_cafe uuid,p_point uuid,p_query text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p aldeem_pos_private.points;q text:=btrim(p_query);BEGIN
 p:=aldeem_pos_private.point(p_cafe,p_point);IF length(q) NOT BETWEEN 2 AND 100 THEN RETURN '[]';END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(x)||jsonb_build_object('points',public.erp_points_balance(p_cafe,x.phone))) FROM(SELECT a.id,a.name,a.phone,a.kind,a.email,a.tax_number,a.active,0 balance FROM public.bf_parties a WHERE a.cafe_id=p_cafe AND a.kind='customer' AND a.active AND erp_branch_private.allowed_resource(p_cafe,p.branch_id,'customer',a.id) AND (a.name ILIKE '%'||q||'%' OR a.phone ILIKE '%'||q||'%' OR public.normalize_customer_phone(a.phone)=public.normalize_customer_phone(q)) ORDER BY a.name,a.id LIMIT 20) x),'[]');
END $$;

CREATE FUNCTION public.aldeem_pos_customer_account(p_cafe uuid,p_customer uuid,p_point uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid:=p_cafe;r text;b uuid;a public.bf_parties;BEGIN
 r:=aldeem_pos_private.role_for(c);
 IF p_point IS NULL THEN IF r NOT IN('owner','manager') THEN RAISE EXCEPTION 'صلاحية إدارية مطلوبة' USING ERRCODE='42501';END IF;b:=erp_branch_private.current_branch(c);
 ELSE b:=(aldeem_pos_private.point(c,p_point)).branch_id;END IF;
 SELECT * INTO a FROM public.bf_parties WHERE cafe_id=c AND id=p_customer AND kind='customer';
 IF a.id IS NULL OR NOT erp_branch_private.allowed_resource(c,b,'customer',a.id) THEN RAISE EXCEPTION 'حساب العميل غير متاح' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('customer',to_jsonb(a)||jsonb_build_object('balance',coalesce((SELECT sum(j.debit-j.credit) FROM public.bf_journal j JOIN public.bf_accounts ac ON ac.cafe_id=c AND ac.id=j.account_id WHERE j.cafe_id=c AND j.party_id=a.id AND ac.kind='receivable' AND erp_branch_private.row_allowed(c,b,jsonb_build_object('documentId',j.document_id))),0)),
 'points',public.erp_points_balance(c,a.phone),
 'documents',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM(SELECT d.*,coalesce((SELECT jsonb_agg(l ORDER BY l.id) FROM public.bf_document_lines l WHERE l.cafe_id=c AND l.document_id=d.id),'[]'::jsonb) lines FROM public.bf_documents d WHERE d.cafe_id=c AND d.party_id=a.id AND erp_branch_private.row_allowed(c,b,to_jsonb(d)) ORDER BY d.created_at DESC,d.id DESC LIMIT 50) x),'[]'::jsonb),
 'entries',coalesce((SELECT jsonb_agg(x ORDER BY x."createdAt" DESC) FROM(SELECT l.id,l.kind,l.points,l.created_at "createdAt",l.note FROM public.erp_points_ledger l WHERE l.cafe_id=c AND l.phone=public.normalize_customer_phone(a.phone) AND (b IS NULL OR l.branch_id=b) ORDER BY l.created_at DESC,l.id DESC LIMIT 50) x),'[]'::jsonb));
END $$;

CREATE FUNCTION public.aldeem_pos_execute(p_cafe uuid,p_action text,p_payload jsonb,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE c uuid:=p_cafe;r text;p aldeem_pos_private.points;old aldeem_pos_private.requests;point_id uuid;result jsonb;body jsonb;entry jsonb;customer public.bf_parties;sh public.bf_shifts;pts integer;discount numeric;cfg jsonb;before_context text:=current_setting('aldeem.pos_context',true);BEGIN
 r:=aldeem_pos_private.role_for(c);IF p_request IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>100000 OR p_action NOT IN('point','prices','sale','shift_open','shift_close') THEN RAISE EXCEPTION 'طلب غير صالح';END IF;
 -- Redemption RPC locks the phone before entering the original finance transaction.
 -- Match that order, then serialize point configuration and posting on the original cafe lock.
 IF p_action='sale' THEN
  SELECT * INTO customer FROM public.bf_parties WHERE cafe_id=c AND id=nullif(p_payload->>'partyId','')::uuid AND kind='customer';
  IF public.normalize_customer_phone(customer.phone) IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(c::text||public.normalize_customer_phone(customer.phone),77120));END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(c::text,60412));
 SELECT * INTO old FROM aldeem_pos_private.requests WHERE cafe_id=c AND request_id=p_request;
 IF FOUND THEN IF old.actor<>auth.uid() OR old.action<>p_action OR old.payload<>p_payload THEN RAISE EXCEPTION 'تعارض في معرف العملية';END IF;IF old.result IS NULL THEN RAISE EXCEPTION 'العملية قيد التنفيذ';END IF;RETURN old.result||'{"duplicate":true}';END IF;
 point_id:=coalesce(nullif(p_payload->>'pointId',''),nullif(p_payload->>'id',''))::uuid;
 IF p_action='point' THEN
  IF r NOT IN('owner','manager') THEN RAISE EXCEPTION 'صلاحية إدارية مطلوبة' USING ERRCODE='42501';END IF;
  IF NOT erp_branch_private.branch_allowed(c,(p_payload->>'branchId')::uuid) THEN RAISE EXCEPTION 'الفرع غير متاح';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=c AND user_id=(p_payload->>'employeeId')::uuid AND active) AND NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=c AND owner_user_id=(p_payload->>'employeeId')::uuid) THEN RAISE EXCEPTION 'اختر موظفًا نشطًا';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.bf_warehouses WHERE cafe_id=c AND id=(p_payload->>'warehouseId')::uuid AND active AND erp_branch_private.row_allowed(c,(p_payload->>'branchId')::uuid,to_jsonb(bf_warehouses))) THEN RAISE EXCEPTION 'اختر مستودعًا متاحًا للفرع';END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(jsonb_build_array(jsonb_build_object('id',p_payload->>'cashAccountId','kind','cash'),jsonb_build_object('id',p_payload->>'cardAccountId','kind','card'))) LOOP
   IF NOT EXISTS(SELECT 1 FROM public.bf_accounts a WHERE a.cafe_id=c AND a.id=(entry->>'id')::uuid AND a.active AND (a.kind='cash' AND a.is_cashier_drawer AND entry->>'kind'='cash' OR a.kind IN('bank','pos') AND entry->>'kind'='card') AND coalesce(to_jsonb(a)->>'is_group','false')<>'true' AND coalesce(to_jsonb(a)->>'frozen','false')<>'true' AND erp_branch_private.allowed_resource(c,(p_payload->>'branchId')::uuid,'account',a.id)) THEN RAISE EXCEPTION 'اختر حساب تحصيل متاحًا للفرع';END IF;
  END LOOP;
  SELECT * INTO p FROM aldeem_pos_private.points WHERE cafe_id=c AND id=point_id FOR UPDATE;
  IF coalesce(p.revision,0) IS DISTINCT FROM (p_payload->>'revision')::integer THEN RAISE EXCEPTION 'تغيرت نقطة البيع أعد تحميلها' USING ERRCODE='40001';END IF;
  IF p.id IS NOT NULL AND EXISTS(SELECT 1 FROM aldeem_pos_private.shifts ps JOIN public.bf_shifts s ON s.cafe_id=c AND s.id=ps.shift_id WHERE ps.cafe_id=c AND ps.point_id=p.id AND s.status<>'closed') THEN RAISE EXCEPTION 'أغلق وردية النقطة قبل تعديل إعداداتها';END IF;
  INSERT INTO aldeem_pos_private.points(id,cafe_id,name,branch_id,employee_id,warehouse_id,cash_account_id,card_account_id,enabled) VALUES(point_id,c,btrim(p_payload->>'name'),(p_payload->>'branchId')::uuid,(p_payload->>'employeeId')::uuid,(p_payload->>'warehouseId')::uuid,(p_payload->>'cashAccountId')::uuid,(p_payload->>'cardAccountId')::uuid,(p_payload->>'enabled')::boolean)
  ON CONFLICT(id) DO UPDATE SET revision=aldeem_pos_private.points.revision+1,name=excluded.name,branch_id=excluded.branch_id,employee_id=excluded.employee_id,warehouse_id=excluded.warehouse_id,cash_account_id=excluded.cash_account_id,card_account_id=excluded.card_account_id,enabled=excluded.enabled WHERE aldeem_pos_private.points.cafe_id=c;
  IF NOT FOUND THEN RAISE EXCEPTION 'نقطة البيع غير متاحة' USING ERRCODE='42501';END IF;result:=jsonb_build_object('id',point_id);
 ELSE
  p:=aldeem_pos_private.point(c,point_id);PERFORM aldeem_pos_private.enter(c,p.id);
  IF p_action IN('prices','sale') AND p.revision IS DISTINCT FROM (p_payload->>'revision')::integer THEN RAISE EXCEPTION 'تغيرت إعدادات النقطة أعد فتحها قبل الحفظ' USING ERRCODE='40001';END IF;
  IF p_action='prices' THEN
   IF r NOT IN('owner','manager') THEN RAISE EXCEPTION 'صلاحية إدارية مطلوبة' USING ERRCODE='42501';END IF;
   IF jsonb_typeof(p_payload->'prices')<>'array' OR jsonb_array_length(p_payload->'prices')>100 THEN RAISE EXCEPTION 'راجع قائمة الأسعار';END IF;
   FOR entry IN SELECT value FROM jsonb_array_elements(p_payload->'prices') LOOP
    IF NOT EXISTS(SELECT 1 FROM public.menu_products m WHERE m.cafe_id=c AND m.id=(entry->>'productId')::uuid AND m.deleted_at IS NULL AND (m.branch_id IS NULL OR m.branch_id=p.branch_id) AND erp_branch_private.allowed_resource(c,p.branch_id,'item',m.id)) THEN RAISE EXCEPTION 'الصنف غير متاح للفرع';END IF;
    INSERT INTO aldeem_pos_private.prices VALUES(c,p.id,(entry->>'productId')::uuid,(entry->>'price')::numeric) ON CONFLICT ON CONSTRAINT prices_pkey DO UPDATE SET price=excluded.price;
   END LOOP;
   UPDATE aldeem_pos_private.points SET revision=revision+1 WHERE cafe_id=c AND id=p.id;result:=jsonb_build_object('id',p.id);
  ELSIF p_action='shift_open' THEN
   IF NOT p.enabled THEN RAISE EXCEPTION 'نقطة البيع متوقفة';END IF;
   IF EXISTS(SELECT 1 FROM aldeem_pos_private.shifts ps JOIN public.bf_shifts s ON s.cafe_id=c AND s.id=ps.shift_id WHERE ps.cafe_id=c AND ps.point_id=p.id AND s.status<>'closed') THEN RAISE EXCEPTION 'توجد وردية نشطة لهذه النقطة';END IF;
   result:=public.brand_finance_execute(c,'shift_open',jsonb_build_object('accountId',p.cash_account_id,'openingCash',(p_payload->>'amount')::numeric),p_request);
   INSERT INTO aldeem_pos_private.shifts VALUES(c,p.id,(result->>'id')::uuid);
  ELSIF p_action='shift_close' THEN
   SELECT s.* INTO sh FROM public.bf_shifts s JOIN aldeem_pos_private.shifts ps ON ps.cafe_id=c AND ps.shift_id=s.id WHERE s.cafe_id=c AND ps.point_id=p.id AND s.user_id=auth.uid() AND s.status='open' FOR UPDATE OF s;
   IF sh.id IS NULL THEN RAISE EXCEPTION 'لا توجد وردية نشطة باسمك في هذه النقطة';END IF;
   result:=public.brand_finance_execute(c,'shift_close',jsonb_build_object('shiftId',sh.id,'countedCash',(p_payload->>'amount')::numeric,'handoverType','next_shift'),p_request);
  ELSE
   IF NOT p.enabled THEN RAISE EXCEPTION 'نقطة البيع متوقفة';END IF;
   SELECT s.* INTO sh FROM public.bf_shifts s JOIN aldeem_pos_private.shifts ps ON ps.cafe_id=c AND ps.shift_id=s.id WHERE s.cafe_id=c AND ps.point_id=p.id AND s.user_id=auth.uid() AND s.status='open' FOR UPDATE OF s;
   IF sh.id IS NULL THEN RAISE EXCEPTION 'افتح وردية باسمك قبل إتمام البيع';END IF;
   IF coalesce(p_payload->>'method','') NOT IN('cash','card') OR jsonb_typeof(p_payload->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'lines') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'راجع الأصناف وطريقة الدفع';END IF;
   FOR entry IN SELECT value FROM jsonb_array_elements(p_payload->'lines') LOOP
    IF NOT EXISTS(SELECT 1 FROM public.menu_products m WHERE m.cafe_id=c AND m.id=(entry->>'productId')::uuid AND m.deleted_at IS NULL AND m.available AND (m.branch_id IS NULL OR m.branch_id=p.branch_id) AND erp_branch_private.allowed_resource(c,p.branch_id,'item',m.id)) THEN RAISE EXCEPTION 'الصنف غير متاح في الفرع';END IF;
   END LOOP;
   pts:=coalesce((p_payload->>'redeemPoints')::integer,0);IF pts<0 THEN RAISE EXCEPTION 'عدد النقاط غير صالح';END IF;cfg:=erp_points_private.settings(c);discount:=round(pts*(cfg->>'pointValue')::numeric,2);
   IF nullif(p_payload->>'partyId','') IS NOT NULL THEN SELECT * INTO customer FROM public.bf_parties WHERE cafe_id=c AND id=(p_payload->>'partyId')::uuid AND kind='customer' AND active AND erp_branch_private.allowed_resource(c,p.branch_id,'customer',id);IF NOT FOUND THEN RAISE EXCEPTION 'العميل غير متاح';END IF;END IF;
   IF pts>0 AND public.normalize_customer_phone(customer.phone) IS NULL THEN RAISE EXCEPTION 'اختر عميلًا برقم جوال صحيح لاستبدال النقاط';END IF;
   body:=jsonb_build_object('lines',p_payload->'lines','partyId',customer.id,'customerPhone',customer.phone,'shiftId',sh.id,'warehouseId',p.warehouse_id,'accountId',CASE WHEN p_payload->>'method'='cash' THEN p.cash_account_id ELSE p.card_account_id END,'discount',discount,'expectedTotal',p_payload->'expectedTotal','note','نقطة بيع '||p.name);
   INSERT INTO aldeem_pos_private.requests(cafe_id,request_id,point_id,actor,action,payload) VALUES(c,p_request,p.id,auth.uid(),p_action,p_payload);
   result:=CASE WHEN pts>0 THEN public.erp_points_sale(c,body,p_request,pts) ELSE public.brand_finance_execute(c,'sale',body,p_request) END;
   UPDATE aldeem_pos_private.requests SET result=result,document_id=(result->>'id')::uuid WHERE cafe_id=c AND request_id=p_request;
   PERFORM set_config('aldeem.pos_context',coalesce(before_context,''),true);RETURN result;
  END IF;
 END IF;
 INSERT INTO aldeem_pos_private.requests(cafe_id,request_id,point_id,actor,action,payload,result) VALUES(c,p_request,point_id,auth.uid(),p_action,p_payload,result);
 PERFORM set_config('aldeem.pos_context',coalesce(before_context,''),true);RETURN result;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA aldeem_pos_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.aldeem_pos_read(uuid,uuid,text),public.aldeem_pos_customers(uuid,uuid,text),public.aldeem_pos_customer_account(uuid,uuid,uuid),public.aldeem_pos_execute(uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.aldeem_pos_read(uuid,uuid,text),public.aldeem_pos_customers(uuid,uuid,text),public.aldeem_pos_customer_account(uuid,uuid,uuid),public.aldeem_pos_execute(uuid,text,jsonb,uuid) TO authenticated;
COMMIT;
