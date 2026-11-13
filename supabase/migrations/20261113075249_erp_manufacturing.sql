BEGIN;
CREATE SCHEMA IF NOT EXISTS erp_manufacturing_private;
REVOKE ALL ON SCHEMA erp_manufacturing_private FROM PUBLIC, anon, authenticated;

-- Separate domain aggregates. JSON contains versioned form/line snapshots; stock,
-- allocations, posting identities and their relationships remain relational.
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['boms','plans','orders','workstations','routings','overheads'] LOOP
  EXECUTE format('CREATE TABLE public.erp_mfg_%I (
   id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cafe_id uuid NOT NULL REFERENCES public.cafes(id),
   name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 150), code text NOT NULL CHECK(length(btrim(code)) BETWEEN 1 AND 60),
   status text NOT NULL DEFAULT ''draft'' CHECK(status IN(''draft'',''ready'',''in_progress'',''completed'',''cancelled'',''active'',''inactive'')),
   payload jsonb NOT NULL CHECK(jsonb_typeof(payload)=''object'' AND octet_length(payload::text)<=524288),
   revision integer NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
   created_by uuid NOT NULL REFERENCES auth.users(id), UNIQUE(cafe_id,id), UNIQUE(cafe_id,code))',n);
  EXECUTE format('ALTER TABLE public.erp_mfg_%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('REVOKE ALL ON public.erp_mfg_%I FROM PUBLIC,anon,authenticated',n);
  EXECUTE format('CREATE INDEX ON public.erp_mfg_%I(cafe_id,updated_at DESC,id)',n);
 END LOOP;
END $$;
ALTER TABLE public.erp_mfg_orders ADD COLUMN plan_id uuid, ADD COLUMN material_cost numeric(18,2) NOT NULL DEFAULT 0 CHECK(material_cost>=0 AND material_cost<>'NaN'), ADD COLUMN additional_cost numeric(18,2) NOT NULL DEFAULT 0 CHECK(additional_cost>=0 AND additional_cost<>'NaN'), ADD COLUMN output_quantity numeric(18,3) NOT NULL DEFAULT 0 CHECK(output_quantity>=0 AND output_quantity<>'NaN'), ADD COLUMN output_document_id uuid,
 ADD FOREIGN KEY(cafe_id,plan_id) REFERENCES public.erp_mfg_plans(cafe_id,id), ADD FOREIGN KEY(cafe_id,output_document_id) REFERENCES public.bf_documents(cafe_id,id);
CREATE INDEX erp_mfg_order_plan ON public.erp_mfg_orders(cafe_id,plan_id);
CREATE TABLE public.erp_mfg_material_issues(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,order_id uuid NOT NULL,item_id uuid NOT NULL,warehouse_id uuid NOT NULL,
 quantity numeric(18,3) NOT NULL CHECK(quantity>0 AND quantity<>'NaN'),returned numeric(18,3) NOT NULL DEFAULT 0 CHECK(returned>=0 AND returned<=quantity AND returned<>'NaN'),
 cost numeric(18,2) NOT NULL CHECK(cost>=0 AND cost<>'NaN'),returned_cost numeric(18,2) NOT NULL DEFAULT 0 CHECK(returned_cost>=0 AND returned_cost<=cost AND returned_cost<>'NaN'),document_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(cafe_id,order_id) REFERENCES public.erp_mfg_orders(cafe_id,id),FOREIGN KEY(cafe_id,item_id) REFERENCES public.bf_items(cafe_id,id),
 FOREIGN KEY(cafe_id,warehouse_id) REFERENCES public.bf_warehouses(cafe_id,id),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id));
CREATE INDEX erp_mfg_issue_order ON public.erp_mfg_material_issues(cafe_id,order_id,item_id,warehouse_id);
CREATE TABLE public.erp_mfg_overhead_allocations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,overhead_id uuid NOT NULL,order_id uuid NOT NULL,source_document_id uuid NOT NULL,
 amount numeric(18,2) NOT NULL CHECK(amount>0 AND amount<>'NaN'),document_id uuid NOT NULL,
 FOREIGN KEY(cafe_id,overhead_id) REFERENCES public.erp_mfg_overheads(cafe_id,id),FOREIGN KEY(cafe_id,order_id) REFERENCES public.erp_mfg_orders(cafe_id,id),
 FOREIGN KEY(cafe_id,source_document_id) REFERENCES public.bf_documents(cafe_id,id),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),UNIQUE(cafe_id,overhead_id,order_id,source_document_id));
CREATE INDEX erp_mfg_allocation_source ON public.erp_mfg_overhead_allocations(cafe_id,source_document_id);
CREATE INDEX erp_mfg_allocation_order ON public.erp_mfg_overhead_allocations(cafe_id,order_id);
CREATE TABLE public.erp_mfg_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),record_id uuid NOT NULL,kind text NOT NULL,action text NOT NULL,note text NOT NULL DEFAULT '' CHECK(length(note)<=10000),payload jsonb NOT NULL DEFAULT '{}',document_id uuid,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id));
CREATE INDEX erp_mfg_event_record ON public.erp_mfg_events(cafe_id,kind,record_id,created_at);
CREATE TABLE public.erp_mfg_settings(cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),revision integer NOT NULL DEFAULT 1,value jsonb NOT NULL DEFAULT '{"autoStartOrders":true,"allowPartialMaterials":true,"orderStatuses":[],"planStatuses":[],"orderFields":[],"planFields":[],"orderForms":[],"planForms":[]}',updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.erp_mfg_requests(cafe_id uuid NOT NULL REFERENCES public.cafes(id),request_id uuid NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(cafe_id,request_id));
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['material_issues','overhead_allocations','events','settings','requests'] LOOP
 EXECUTE format('ALTER TABLE public.erp_mfg_%I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('REVOKE ALL ON public.erp_mfg_%I FROM PUBLIC,anon,authenticated',n);
END LOOP;END $$;

CREATE FUNCTION erp_manufacturing_private.table_name(p_kind text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE p_kind WHEN 'bom' THEN 'erp_mfg_boms' WHEN 'plans' THEN 'erp_mfg_plans' WHEN 'orders' THEN 'erp_mfg_orders' WHEN 'overheads' THEN 'erp_mfg_overheads' WHEN 'workstations' THEN 'erp_mfg_workstations' WHEN 'routings' THEN 'erp_mfg_routings' END
$$;
CREATE FUNCTION erp_manufacturing_private.authorize(p_cafe uuid,p_write boolean DEFAULT false,p_settings boolean DEFAULT false) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; BEGIN
 r:=brand_finance_private.role_for(p_cafe);
 IF r NOT IN('owner','manager','accountant','auditor') OR (p_write AND r='auditor') OR (p_settings AND r<>'owner') THEN RAISE EXCEPTION 'لا تملك صلاحية التصنيع المطلوبة' USING ERRCODE='42501'; END IF;
 RETURN r;
END $$;
CREATE FUNCTION erp_manufacturing_private.money(v jsonb) RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE n numeric;BEGIN
 IF v IS NULL OR jsonb_typeof(v)<>'number' THEN RAISE EXCEPTION 'قيمة رقمية غير صالحة' USING ERRCODE='22023';END IF;
 n:=v::text::numeric;IF n<0 OR n>999999999 OR n='NaN'::numeric THEN RAISE EXCEPTION 'قيمة رقمية خارج المدى' USING ERRCODE='22023';END IF;RETURN n;
END $$;
CREATE FUNCTION public.erp_manufacturing_act(p_cafe_id uuid,p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE kind text:=p_command->>'kind'; action text:=p_command->>'action'; rid uuid:=(p_command->>'id')::uuid; reqid uuid:=(p_command->>'requestId')::uuid;
 tab text; old jsonb; body jsonb; x jsonb; y jsonb; bom jsonb; station jsonb; issue record; journal record; ord record; src record;
 existing public.erp_mfg_requests%ROWTYPE; result jsonb; document uuid; wip uuid; inventory uuid; wid uuid:=nullif(p_command->>'warehouseId','')::uuid;
 q numeric; need numeric; actual numeric:=0; total numeric:=0; extra numeric:=0; salvage numeric:=0; weight numeric; denominator numeric; share numeric; left_amount numeric;
 item uuid; new_id uuid; new_code text; settings jsonb; source_amount numeric; supplied numeric; cost_before numeric; note text:=coalesce(p_command->>'note','');
BEGIN
 PERFORM erp_manufacturing_private.authorize(p_cafe_id,true);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 IF reqid IS NULL OR rid IS NULL OR length(note)>10000 OR octet_length(p_command::text)>524288 THEN RAISE EXCEPTION 'بيانات الإجراء غير صالحة';END IF;
 SELECT * INTO existing FROM public.erp_mfg_requests WHERE cafe_id=p_cafe_id AND request_id=reqid;
 IF FOUND THEN IF existing.payload<>p_command OR existing.actor_id<>auth.uid() THEN RAISE EXCEPTION 'تعارض معرف الطلب';END IF;RETURN existing.result||'{"duplicate":true}';END IF;
 tab:=erp_manufacturing_private.table_name(kind);IF tab IS NULL THEN RAISE EXCEPTION 'نوع غير صالح';END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE cafe_id=$1 AND id=$2 FOR UPDATE',tab) INTO old USING p_cafe_id,rid;
 IF old IS NULL THEN RAISE EXCEPTION 'السجل غير موجود' USING ERRCODE='42501';END IF;
 IF (old->>'revision')::integer IS DISTINCT FROM (p_command->>'revision')::integer THEN RAISE EXCEPTION 'تغير السجل أعد تحميل الصفحة' USING ERRCODE='40001';END IF;
 body:=old->'payload';SELECT value INTO settings FROM public.erp_mfg_settings WHERE cafe_id=p_cafe_id;
 result:=jsonb_build_object('id',rid);
 IF action IN('receive','return','finish','reopen') OR (kind='overheads' AND action='start') THEN
  IF EXISTS(SELECT 1 FROM public.bf_settings WHERE cafe_id=p_cafe_id AND closed_through>=(now() AT TIME ZONE 'Asia/Riyadh')::date) THEN RAISE EXCEPTION 'الفترة المالية مقفلة';END IF;
  PERFORM brand_finance_private.seed(p_cafe_id);
  INSERT INTO public.bf_accounts(cafe_id,name,code,kind) VALUES(p_cafe_id,'إنتاج تحت التشغيل','1250','inventory') ON CONFLICT(cafe_id,code) DO NOTHING;
  wip:=CASE WHEN kind='orders' THEN (body->>'accountId')::uuid ELSE brand_finance_private.account(p_cafe_id,'1250') END;inventory:=brand_finance_private.account(p_cafe_id,'1200');
 END IF;
 IF action='note' THEN
  IF length(btrim(note))=0 THEN RAISE EXCEPTION 'أدخل الملاحظة';END IF;
 ELSIF action='custom-fields' THEN
  IF kind NOT IN('orders','plans') OR old->>'status' IN('completed','cancelled') THEN RAISE EXCEPTION 'السجل لا يقبل تعديل الحقول';END IF;
  x:=coalesce(settings->CASE kind WHEN 'orders' THEN 'orderFields' ELSE 'planFields' END,'[]');
  y:=erp_manufacturing_private.custom_defaults(x,p_command->'value'->'values');
  PERFORM erp_manufacturing_private.validate_custom_values(x,y,p_cafe_id,rid,kind);
  EXECUTE format('UPDATE public.%I SET payload=jsonb_set(payload,''{customValues}'',$3) WHERE cafe_id=$1 AND id=$2',tab) USING p_cafe_id,rid,y;
 ELSIF action='followup' THEN
  IF kind NOT IN('orders','plans') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(settings->CASE kind WHEN 'orders' THEN 'orderStatuses' ELSE 'planStatuses' END,'[]')) s WHERE s=note) THEN RAISE EXCEPTION 'حالة المتابعة غير موجودة';END IF;
  EXECUTE format('UPDATE public.%I SET payload=jsonb_set(payload,''{followup}'',to_jsonb($3::text)) WHERE cafe_id=$1 AND id=$2',tab) USING p_cafe_id,rid,note;
 ELSIF action='related-form' THEN
  IF kind NOT IN('orders','plans') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(settings->CASE kind WHEN 'orders' THEN 'orderForms' ELSE 'planForms' END,'[]')) f WHERE f->>'id'=p_command->'value'->>'formId') THEN RAISE EXCEPTION 'النموذج المرتبط غير موجود';END IF;
  SELECT f->'fields' INTO x FROM jsonb_array_elements(settings->CASE kind WHEN 'orders' THEN 'orderForms' ELSE 'planForms' END) f WHERE f->>'id'=p_command->'value'->>'formId';
  y:=erp_manufacturing_private.custom_defaults(x,p_command->'value'->'values');
  PERFORM erp_manufacturing_private.validate_custom_values(x,y,p_cafe_id,rid,kind);
  result:=result||jsonb_build_object('value',p_command->'value'||jsonb_build_object('values',y,'fields',x,'name',(SELECT f->>'name' FROM jsonb_array_elements(settings->CASE kind WHEN 'orders' THEN 'orderForms' ELSE 'planForms' END) f WHERE f->>'id'=p_command->'value'->>'formId')));
 ELSIF action='copy' THEN
  new_id:=gen_random_uuid();new_code:=left(body->>'code',40)||'-'||substr(new_id::text,1,8);
  result:=public.erp_manufacturing_save(p_cafe_id,kind,body||jsonb_build_object('name',left(body->>'name',140)||' نسخة','code',new_code,'isDefault',false,'customValues','{}'::jsonb),NULL,0,true,gen_random_uuid());
 ELSIF action='delete' THEN
  IF kind IN('orders','plans','overheads') AND old->>'status'<>'draft' THEN RAISE EXCEPTION 'يمكن حذف المسودات فقط، استخدم إلغاء للسجل المعتمد';END IF;
  IF EXISTS(SELECT 1 FROM public.erp_mfg_orders WHERE cafe_id=p_cafe_id AND (plan_id=rid OR payload::text LIKE '%'||rid::text||'%')) OR EXISTS(SELECT 1 FROM public.erp_mfg_boms WHERE cafe_id=p_cafe_id AND id<>rid AND payload::text LIKE '%'||rid::text||'%') OR EXISTS(SELECT 1 FROM public.erp_mfg_plans WHERE cafe_id=p_cafe_id AND id<>rid AND payload::text LIKE '%'||rid::text||'%') THEN RAISE EXCEPTION 'السجل مستخدم ولا يمكن حذفه';END IF;
  EXECUTE format('DELETE FROM public.%I WHERE cafe_id=$1 AND id=$2',tab) USING p_cafe_id,rid;result:=result||'{"deleted":true}';
 ELSIF action='generate' THEN
  IF kind<>'plans' OR old->>'status'<>'ready' OR EXISTS(SELECT 1 FROM public.erp_mfg_orders WHERE cafe_id=p_cafe_id AND plan_id=rid) THEN RAISE EXCEPTION 'الخطة غير جاهزة أو صدرت أوامرها بالفعل';END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(body->'items') LOOP
   SELECT payload INTO STRICT bom FROM public.erp_mfg_boms WHERE cafe_id=p_cafe_id AND id=(x->>'bomId')::uuid AND status='active';
   weight:=(x->>'quantity')::numeric/(bom->>'quantity')::numeric;
   SELECT coalesce(jsonb_agg(v||jsonb_build_object('quantity',round((v->>'quantity')::numeric*weight,3))),'[]') INTO y FROM jsonb_array_elements(bom->'materials') v;
   bom:=bom||jsonb_build_object('materials',y);
   SELECT coalesce(jsonb_agg(v||jsonb_build_object('quantity',round((v->>'quantity')::numeric*weight,3))),'[]') INTO y FROM jsonb_array_elements(bom->'operations') v;
   bom:=bom||jsonb_build_object('operations',y);
   SELECT coalesce(jsonb_agg(v||jsonb_build_object('quantity',round((v->>'quantity')::numeric*weight,3))),'[]') INTO y FROM jsonb_array_elements(bom->'scrap') v;
   bom:=bom||jsonb_build_object('scrap',y);
   SELECT coalesce(jsonb_agg(v||jsonb_build_object('amount',round((v->>'amount')::numeric*weight,2))),'[]') INTO y FROM jsonb_array_elements(bom->'expenses') v;
   new_id:=gen_random_uuid();new_code:=left(body->>'code',40)||'-'||substr(new_id::text,1,8);
   bom:=bom||jsonb_build_object('expenses',y,'name',left(body->>'name',120)||' - '||(SELECT name FROM public.bf_items WHERE cafe_id=p_cafe_id AND id=(x->>'productId')::uuid),'code',new_code,'quantity',x->'quantity','bomId',x->'bomId','from',body->'from','to',body->'to','customerId',body->'customerId','employees',body->'employees','customValues','{}'::jsonb);
   PERFORM erp_manufacturing_private.validate(p_cafe_id,'orders',bom);
   INSERT INTO public.erp_mfg_orders(id,cafe_id,name,code,status,payload,created_by,plan_id) VALUES(new_id,p_cafe_id,bom->>'name',new_code,CASE WHEN coalesce((settings->>'autoStartOrders')::boolean,true) THEN 'in_progress' ELSE 'ready' END,bom,auth.uid(),rid);
   INSERT INTO public.erp_mfg_events(cafe_id,record_id,kind,action,payload,actor_id) VALUES(p_cafe_id,new_id,'orders','generated',jsonb_build_object('planId',rid),auth.uid());
  END LOOP;
  UPDATE public.erp_mfg_plans SET status='in_progress' WHERE cafe_id=p_cafe_id AND id=rid;
 ELSIF action='start' AND kind='overheads' AND old->>'status'='ready' THEN
  IF old->>'status'<>'ready' THEN RAISE EXCEPTION 'التوزيع غير جاهز أو معتمد مسبقًا';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(body->'orderIds') oid WHERE NOT EXISTS(SELECT 1 FROM public.erp_mfg_orders WHERE cafe_id=p_cafe_id AND id=oid::uuid AND status IN('ready','in_progress'))) THEN RAISE EXCEPTION 'أحد الأوامر مغلق أو غير متاح';END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(body->'sources') LOOP
   source_amount:=round(erp_manufacturing_private.money(x->'amount'),2);
   SELECT * INTO src FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=(x->>'documentId')::uuid AND kind='expense';
   IF src IS NULL OR source_amount<=0 OR source_amount>src.total-coalesce((SELECT sum(amount) FROM public.erp_mfg_overhead_allocations WHERE cafe_id=p_cafe_id AND source_document_id=src.id),0) THEN RAISE EXCEPTION 'المبلغ يتجاوز التكلفة المتاحة للمصدر';END IF;
   IF source_amount>coalesce((SELECT sum(debit-credit) FROM public.bf_journal WHERE cafe_id=p_cafe_id AND document_id=src.id AND account_id=(body->>'accountId')::uuid),0)-coalesce((SELECT sum(amount) FROM public.erp_mfg_overhead_allocations WHERE cafe_id=p_cafe_id AND source_document_id=src.id),0) THEN RAISE EXCEPTION 'حساب التوزيع لا يطابق المصروف أو أن رصيده موزع مسبقًا';END IF;
   SELECT sum(CASE WHEN body->>'method'='quantity' THEN (payload->>'quantity')::numeric ELSE material_cost+additional_cost END) INTO denominator FROM public.erp_mfg_orders WHERE cafe_id=p_cafe_id AND id IN(SELECT value::uuid FROM jsonb_array_elements_text(body->'orderIds'));
   IF denominator<=0 THEN RAISE EXCEPTION 'لا توجد قيمة موجبة لتوزيع التكلفة';END IF;
   document:=gen_random_uuid();INSERT INTO public.bf_documents(id,cafe_id,kind,total,note,created_by) VALUES(document,p_cafe_id,'journal',source_amount,'توزيع تكلفة تصنيع '||(old->>'code'),auth.uid());
   left_amount:=source_amount;
   FOR ord IN SELECT *,row_number() OVER(ORDER BY id) idx,count(*) OVER() cnt FROM public.erp_mfg_orders WHERE cafe_id=p_cafe_id AND id IN(SELECT value::uuid FROM jsonb_array_elements_text(body->'orderIds')) ORDER BY id LOOP
    weight:=CASE WHEN body->>'method'='quantity' THEN (ord.payload->>'quantity')::numeric ELSE ord.material_cost+ord.additional_cost END;
    share:=CASE WHEN ord.idx=ord.cnt THEN left_amount ELSE least(left_amount,round(source_amount*weight/denominator,2)) END;left_amount:=left_amount-share;
    IF share>0 THEN INSERT INTO public.erp_mfg_overhead_allocations(cafe_id,overhead_id,order_id,source_document_id,amount,document_id) VALUES(p_cafe_id,rid,ord.id,src.id,share,document);UPDATE public.erp_mfg_orders SET additional_cost=additional_cost+share,revision=revision+1,updated_at=now() WHERE cafe_id=p_cafe_id AND id=ord.id;PERFORM brand_finance_private.line(p_cafe_id,document,(ord.payload->>'accountId')::uuid,share,0);END IF;
   END LOOP;
   IF NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=(body->>'accountId')::uuid AND kind='expense') THEN RAISE EXCEPTION 'اختر حساب المصروف الذي تتحمل منه التكلفة';END IF;
   PERFORM brand_finance_private.line(p_cafe_id,document,(body->>'accountId')::uuid,0,source_amount);
   total:=total+source_amount;
  END LOOP;
  UPDATE public.erp_mfg_overheads SET status='completed' WHERE cafe_id=p_cafe_id AND id=rid;
  result:=result||jsonb_build_object('amount',total);
 ELSIF action='start' THEN
  IF kind IN('orders','plans') THEN PERFORM erp_manufacturing_private.validate_custom_values(coalesce(settings->CASE kind WHEN 'orders' THEN 'orderFields' ELSE 'planFields' END,'[]'),coalesce(body->'customValues','{}'),p_cafe_id,rid,kind);END IF;
  IF kind NOT IN('orders','plans','overheads') OR old->>'status' NOT IN('draft','ready') OR (kind IN('plans','overheads') AND old->>'status'='ready') THEN RAISE EXCEPTION 'لا يمكن بدء السجل في حالته الحالية';END IF;
  EXECUTE format('UPDATE public.%I SET status=$3 WHERE cafe_id=$1 AND id=$2',tab) USING p_cafe_id,rid,CASE WHEN old->>'status'='draft' THEN 'ready' ELSE 'in_progress' END;
 ELSIF action='cancel' THEN
  IF kind NOT IN('orders','plans','overheads') OR old->>'status' IN('completed','cancelled') THEN RAISE EXCEPTION 'لا يمكن إلغاء السجل في حالته الحالية';END IF;
  IF kind='orders' AND ((old->>'material_cost')::numeric>0 OR (old->>'additional_cost')::numeric>0 OR EXISTS(SELECT 1 FROM public.erp_mfg_material_issues WHERE cafe_id=p_cafe_id AND order_id=rid AND quantity>returned)) THEN RAISE EXCEPTION 'أرجع المواد وسوّ التكاليف قبل الإلغاء';END IF;
  IF kind='plans' AND EXISTS(SELECT 1 FROM public.erp_mfg_orders WHERE cafe_id=p_cafe_id AND plan_id=rid AND status<>'cancelled') THEN RAISE EXCEPTION 'ألغ أوامر الخطة أولًا';END IF;
  EXECUTE format('UPDATE public.%I SET status=''cancelled'' WHERE cafe_id=$1 AND id=$2',tab) USING p_cafe_id,rid;
 ELSIF kind='orders' AND action IN('receive','return') THEN
  IF old->>'status' NOT IN('ready','in_progress') OR jsonb_array_length(p_command->'lines') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'الأمر لا يقبل حركة المواد';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.bf_warehouses WHERE cafe_id=p_cafe_id AND id=wid AND active) THEN RAISE EXCEPTION 'اختر مستودعًا صالحًا';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_command->'lines') l GROUP BY l->>'itemId' HAVING count(*)>1) THEN RAISE EXCEPTION 'لا تكرر الصنف في الإذن';END IF;
  document:=gen_random_uuid();INSERT INTO public.bf_documents(id,cafe_id,kind,warehouse_id,note,created_by) VALUES(document,p_cafe_id,'stock_adjust',wid,CASE action WHEN 'receive' THEN 'استلام خامات تصنيع ' ELSE 'إرجاع خامات تصنيع ' END||(old->>'code'),auth.uid());
  FOR x IN SELECT value FROM jsonb_array_elements(p_command->'lines') ORDER BY value->>'itemId' LOOP
   item:=(x->>'itemId')::uuid;q:=erp_manufacturing_private.money(x->'quantity');IF q<=0 OR q<>round(q,3) THEN RAISE EXCEPTION 'كمية الإذن غير صالحة';END IF;
   SELECT (v->>'quantity')::numeric INTO need FROM jsonb_array_elements(body->'materials') v WHERE v->>'itemId'=item::text;
   IF need IS NULL THEN RAISE EXCEPTION 'الصنف ليس من خامات الأمر';END IF;
   IF action='receive' THEN
    SELECT coalesce(sum(quantity-returned),0) INTO supplied FROM public.erp_mfg_material_issues WHERE cafe_id=p_cafe_id AND order_id=rid AND item_id=item;
    IF supplied+q>need THEN RAISE EXCEPTION 'كمية الاستلام تتجاوز الكمية المحددة';END IF;
    IF coalesce((SELECT quantity FROM public.bf_stock WHERE cafe_id=p_cafe_id AND item_id=item AND warehouse_id=wid FOR UPDATE),0)<q THEN RAISE EXCEPTION 'المخزون غير كاف لاستلام الخامات';END IF;
    actual:=brand_finance_private.stock_move(p_cafe_id,document,item,wid,-q,0);
    INSERT INTO public.erp_mfg_material_issues(cafe_id,order_id,item_id,warehouse_id,quantity,cost,document_id) VALUES(p_cafe_id,rid,item,wid,q,actual,document);total:=total+actual;
   ELSE
    supplied:=coalesce((SELECT sum(quantity-returned) FROM public.erp_mfg_material_issues WHERE cafe_id=p_cafe_id AND order_id=rid AND item_id=item AND warehouse_id=wid),0);IF q>supplied THEN RAISE EXCEPTION 'كمية الإرجاع تتجاوز المستلم من هذا المستودع';END IF;
    FOR issue IN SELECT * FROM public.erp_mfg_material_issues WHERE cafe_id=p_cafe_id AND order_id=rid AND item_id=item AND warehouse_id=wid AND quantity>returned ORDER BY created_at,id FOR UPDATE LOOP
     EXIT WHEN q=0;need:=least(q,issue.quantity-issue.returned);actual:=brand_finance_private.stock_move(p_cafe_id,document,item,wid,need,CASE WHEN need=issue.quantity-issue.returned THEN (issue.cost-issue.returned_cost)/need ELSE issue.cost/issue.quantity END);
     UPDATE public.erp_mfg_material_issues SET returned=returned+need,returned_cost=returned_cost+actual WHERE id=issue.id;total:=total+actual;q:=q-need;
    END LOOP;
   END IF;
  END LOOP;
  PERFORM brand_finance_private.line(p_cafe_id,document,wip,CASE WHEN action='receive' THEN total ELSE 0 END,CASE WHEN action='return' THEN total ELSE 0 END);
  PERFORM brand_finance_private.line(p_cafe_id,document,inventory,CASE WHEN action='return' THEN total ELSE 0 END,CASE WHEN action='receive' THEN total ELSE 0 END);
  UPDATE public.erp_mfg_orders SET material_cost=greatest(0,material_cost+CASE action WHEN 'receive' THEN total ELSE -total END),status='in_progress' WHERE cafe_id=p_cafe_id AND id=rid;
  result:=result||jsonb_build_object('documentId',document,'amount',total);
 ELSIF kind='orders' AND action='finish' THEN
  PERFORM erp_manufacturing_private.validate_custom_values(coalesce(settings->'orderFields','[]'),coalesce(body->'customValues','{}'),p_cafe_id,rid,kind);
  IF nullif(p_command->>'deliveryDate','') IS NOT NULL AND ((p_command->>'deliveryDate')::date>(now() AT TIME ZONE 'Asia/Riyadh')::date OR EXISTS(SELECT 1 FROM public.bf_settings WHERE cafe_id=p_cafe_id AND closed_through>=(p_command->>'deliveryDate')::date)) THEN RAISE EXCEPTION 'تاريخ التسليم مستقبلي أو يقع ضمن فترة مقفلة';END IF;
  IF old->>'status'<>'in_progress' OR old->>'output_document_id' IS NOT NULL THEN RAISE EXCEPTION 'لا يمكن إنهاء أمر لم يبدأ أو سبق إنهاؤه';END IF;
  q:=erp_manufacturing_private.money(p_command->'quantity');IF q<=0 OR q>(body->>'quantity')::numeric OR q<>round(q,3) THEN RAISE EXCEPTION 'كمية الناتج غير صالحة';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.bf_warehouses WHERE cafe_id=p_cafe_id AND id=wid AND active) THEN RAISE EXCEPTION 'اختر مستودع المنتج';END IF;
  IF NOT coalesce((settings->>'allowPartialMaterials')::boolean,true) AND EXISTS(SELECT 1 FROM jsonb_array_elements(body->'materials') m WHERE (m->>'quantity')::numeric>coalesce((SELECT sum(quantity-returned) FROM public.erp_mfg_material_issues WHERE cafe_id=p_cafe_id AND order_id=rid AND item_id=(m->>'itemId')::uuid),0)) THEN RAISE EXCEPTION 'استلم كامل الخامات المحددة أولًا';END IF;
  IF jsonb_array_length(body->'materials')>0 AND NOT EXISTS(SELECT 1 FROM public.erp_mfg_material_issues WHERE cafe_id=p_cafe_id AND order_id=rid AND quantity>returned) THEN RAISE EXCEPTION 'استلم الخامات قبل إنهاء التصنيع';END IF;
  document:=gen_random_uuid();INSERT INTO public.bf_documents(id,cafe_id,kind,warehouse_id,note,created_by,created_at) VALUES(document,p_cafe_id,'stock_adjust',wid,'ناتج تصنيع '||(old->>'code'),auth.uid(),coalesce(nullif(p_command->>'deliveryDate','')::date,(now() AT TIME ZONE 'Asia/Riyadh')::date)::timestamp AT TIME ZONE 'Asia/Riyadh');
  FOR x IN SELECT value FROM jsonb_array_elements(body->'expenses') LOOP
   actual:=round((x->>'amount')::numeric,2);extra:=extra+actual;PERFORM brand_finance_private.line(p_cafe_id,document,(x->>'accountId')::uuid,0,actual);
  END LOOP;
  FOR x IN SELECT value FROM jsonb_array_elements(body->'operations') LOOP
   SELECT payload INTO STRICT station FROM public.erp_mfg_workstations WHERE cafe_id=p_cafe_id AND id=(x->>'workstationId')::uuid;
   weight:=(x->>'quantity')::numeric;
   FOR y IN SELECT value FROM jsonb_array_elements(station->'expenses') LOOP actual:=round((y->>'amount')::numeric*weight,2);extra:=extra+actual;PERFORM brand_finance_private.line(p_cafe_id,document,(y->>'accountId')::uuid,0,actual);END LOOP;
   actual:=round((station->>'wagesCost')::numeric*weight,2);extra:=extra+actual;IF actual>0 THEN PERFORM brand_finance_private.line(p_cafe_id,document,(station->>'wagesAccountId')::uuid,0,actual);END IF;
   actual:=round((station->>'assetsCost')::numeric*weight,2);extra:=extra+actual;IF actual>0 THEN PERFORM brand_finance_private.line(p_cafe_id,document,(station->>'assetsAccountId')::uuid,0,actual);END IF;
  END LOOP;
  total:=(old->>'material_cost')::numeric+(old->>'additional_cost')::numeric+extra;
  SELECT coalesce(sum(round((v->>'quantity')::numeric*(v->>'price')::numeric,2)),0) INTO salvage FROM jsonb_array_elements(body->'scrap') v;
  IF salvage>total THEN RAISE EXCEPTION 'قيمة ناتج الهالك تتجاوز تكلفة التصنيع';END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(body->'scrap') LOOP PERFORM brand_finance_private.stock_move(p_cafe_id,document,(x->>'itemId')::uuid,wid,(x->>'quantity')::numeric,(x->>'price')::numeric);END LOOP;
  PERFORM brand_finance_private.stock_move(p_cafe_id,document,(body->>'productId')::uuid,wid,q,(total-salvage)/q);
  PERFORM brand_finance_private.line(p_cafe_id,document,wip,extra,0);PERFORM brand_finance_private.line(p_cafe_id,document,wip,0,total);PERFORM brand_finance_private.line(p_cafe_id,document,inventory,total,0);
  UPDATE public.erp_mfg_orders SET status='completed',additional_cost=additional_cost+extra,output_quantity=q,output_document_id=document WHERE cafe_id=p_cafe_id AND id=rid;
  UPDATE public.erp_mfg_plans p SET status='completed',revision=revision+1,updated_at=now() WHERE p.cafe_id=p_cafe_id AND p.id=(old->>'plan_id')::uuid AND NOT EXISTS(SELECT 1 FROM public.erp_mfg_orders o WHERE o.cafe_id=p_cafe_id AND o.plan_id=p.id AND o.id<>rid AND o.status NOT IN('completed','cancelled'));
  result:=result||jsonb_build_object('documentId',document,'amount',total,'additionalCost',extra);
 ELSIF kind='orders' AND action='reopen' THEN
  IF old->>'status'<>'completed' OR old->>'output_document_id' IS NULL THEN RAISE EXCEPTION 'الأمر ليس مغلقًا';END IF;
  document:=gen_random_uuid();INSERT INTO public.bf_documents(id,cafe_id,kind,note,created_by,reference_id) VALUES(document,p_cafe_id,'stock_adjust','إعادة فتح تصنيع '||(old->>'code'),auth.uid(),(old->>'output_document_id')::uuid);
  FOR issue IN SELECT * FROM public.bf_movements WHERE cafe_id=p_cafe_id AND document_id=(old->>'output_document_id')::uuid ORDER BY item_id LOOP
   IF coalesce((SELECT quantity FROM public.bf_stock WHERE cafe_id=p_cafe_id AND item_id=issue.item_id AND warehouse_id=issue.warehouse_id),0)<issue.quantity THEN RAISE EXCEPTION 'تعذر إعادة الفتح لأن الناتج استُخدم من المخزون';END IF;
   actual:=brand_finance_private.stock_move(p_cafe_id,document,issue.item_id,issue.warehouse_id,-issue.quantity,0);total:=total+actual;
  END LOOP;
  -- Different weighted-average values are a real inventory variance, never silently
  -- erased: keep the original journals and post a balancing variance if needed.
  cost_before:=coalesce((SELECT sum(debit-credit) FROM public.bf_journal WHERE cafe_id=p_cafe_id AND document_id=(old->>'output_document_id')::uuid AND account_id=inventory),0);
  FOR journal IN SELECT * FROM public.bf_journal WHERE cafe_id=p_cafe_id AND document_id=(old->>'output_document_id')::uuid LOOP PERFORM brand_finance_private.line(p_cafe_id,document,journal.account_id,journal.credit,journal.debit);END LOOP;
  IF total<>cost_before THEN PERFORM brand_finance_private.line(p_cafe_id,document,inventory,greatest(cost_before-total,0),greatest(total-cost_before,0));PERFORM brand_finance_private.line(p_cafe_id,document,brand_finance_private.account(p_cafe_id,'5200'),greatest(total-cost_before,0),greatest(cost_before-total,0));END IF;
  SELECT coalesce((payload->>'additionalCost')::numeric,0) INTO extra FROM public.erp_mfg_events WHERE cafe_id=p_cafe_id AND kind='orders' AND record_id=rid AND action='finish' ORDER BY created_at DESC LIMIT 1;
  UPDATE public.erp_mfg_orders SET status='in_progress',output_quantity=0,output_document_id=NULL,additional_cost=greatest(0,additional_cost-coalesce(extra,0)) WHERE cafe_id=p_cafe_id AND id=rid;
  UPDATE public.erp_mfg_plans SET status='in_progress',revision=revision+1 WHERE cafe_id=p_cafe_id AND id=(old->>'plan_id')::uuid;
 ELSE RAISE EXCEPTION 'الإجراء غير متاح لهذا السجل';
 END IF;
 IF action NOT IN('delete','copy') THEN EXECUTE format('UPDATE public.%I SET revision=revision+1,updated_at=now() WHERE cafe_id=$1 AND id=$2',tab) USING p_cafe_id,rid;END IF;
 INSERT INTO public.erp_mfg_events(cafe_id,record_id,kind,action,note,payload,document_id,actor_id) VALUES(p_cafe_id,rid,kind,action,note,p_command||result,document,auth.uid());
 INSERT INTO public.erp_mfg_requests(cafe_id,request_id,payload,result,actor_id) VALUES(p_cafe_id,reqid,p_command,result,auth.uid());RETURN result;
END $$;

CREATE FUNCTION erp_manufacturing_private.validate(p_cafe uuid,p_kind text,p jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE x jsonb; a uuid; n numeric; k text; BEGIN
 IF p IS NULL OR jsonb_typeof(p)<>'object' OR octet_length(p::text)>524288 OR length(btrim(coalesce(p->>'name',''))) NOT BETWEEN 1 AND 150 OR length(btrim(coalesce(p->>'code',''))) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'أدخل اسمًا وكودًا صحيحين' USING ERRCODE='22023';END IF;
 IF length(coalesce(p->>'description',''))>4000 THEN RAISE EXCEPTION 'الوصف طويل';END IF;
 IF nullif(p->>'from','')::date > nullif(p->>'to','')::date THEN RAISE EXCEPTION 'تاريخ النهاية يسبق البداية' USING ERRCODE='22023';END IF;
 FOREACH k IN ARRAY ARRAY['accountId','wagesAccountId','assetsAccountId'] LOOP
  a:=nullif(p->>k,'')::uuid;IF a IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe AND id=a AND active) THEN RAISE EXCEPTION 'الحساب غير متاح لهذه العلامة' USING ERRCODE='22023';END IF;
 END LOOP;
 a:=nullif(p->>'customerId','')::uuid;IF a IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bf_parties WHERE cafe_id=p_cafe AND id=a AND kind='customer' AND active) THEN RAISE EXCEPTION 'العميل غير متاح';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(coalesce(p->'employees','[]')) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=p_cafe AND user_id=(x#>>'{}')::uuid AND active) THEN RAISE EXCEPTION 'الموظف غير متاح';END IF;
 END LOOP;
 a:=nullif(p->>'routingId','')::uuid;IF a IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_mfg_routings WHERE cafe_id=p_cafe AND id=a) THEN RAISE EXCEPTION 'مسار الإنتاج غير متاح';END IF;
 IF p_kind IN('bom','orders') THEN
  FOREACH k IN ARRAY ARRAY['materials','expenses','operations','scrap'] LOOP IF coalesce(jsonb_typeof(p->k),'')<>'array' OR jsonb_array_length(p->k)>200 THEN RAISE EXCEPTION 'قائمة تكاليف التصنيع غير صالحة';END IF;END LOOP;
  IF NOT EXISTS(SELECT 1 FROM public.bf_items WHERE cafe_id=p_cafe AND id=(p->>'productId')::uuid AND active) THEN RAISE EXCEPTION 'اختر منتجًا من مخزون العلامة';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe AND id=nullif(p->>'accountId','')::uuid AND active AND kind='inventory') THEN RAISE EXCEPTION 'اختر حساب مخزون للإنتاج تحت التشغيل';END IF;
  n:=erp_manufacturing_private.money(p->'quantity');IF n<=0 OR n<>round(n,3) THEN RAISE EXCEPTION 'الكمية غير صالحة';END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(coalesce(p->'materials','[]')) UNION ALL SELECT value FROM jsonb_array_elements(coalesce(p->'scrap','[]')) LOOP
   IF NOT EXISTS(SELECT 1 FROM public.bf_items WHERE cafe_id=p_cafe AND id=(x->>'itemId')::uuid AND active) THEN RAISE EXCEPTION 'الصنف غير متاح';END IF;
   n:=erp_manufacturing_private.money(x->'quantity');IF n<=0 OR n<>round(n,3) THEN RAISE EXCEPTION 'كمية المادة غير صالحة';END IF;PERFORM erp_manufacturing_private.money(x->'price');
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p->'materials','[]')) material_row GROUP BY material_row->>'itemId' HAVING count(*)>1) THEN RAISE EXCEPTION 'لا تكرر المادة الخام';END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(coalesce(p->'operations','[]')) LOOP
   IF NOT EXISTS(SELECT 1 FROM public.erp_mfg_workstations WHERE cafe_id=p_cafe AND id=(x->>'workstationId')::uuid AND status='active') THEN RAISE EXCEPTION 'محطة العمل غير متاحة';END IF;
   IF erp_manufacturing_private.money(x->'quantity')<=0 THEN RAISE EXCEPTION 'كمية العملية غير صالحة';END IF;
  END LOOP;
 END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(coalesce(p->'expenses','[]')) LOOP
  PERFORM erp_manufacturing_private.money(x->'amount');
  IF NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe AND id=(x->>'accountId')::uuid AND active AND kind='expense') THEN RAISE EXCEPTION 'اختر حساب مصروف للتكلفة';END IF;
 END LOOP;
 IF p_kind='orders' AND nullif(p->>'bomId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_mfg_boms WHERE cafe_id=p_cafe AND id=(p->>'bomId')::uuid AND payload->>'productId'=p->>'productId') THEN RAISE EXCEPTION 'قائمة المواد لا تطابق المنتج';END IF;
 IF p_kind='plans' THEN
  IF coalesce(jsonb_typeof(p->'items'),'')<>'array' OR jsonb_array_length(p->'items') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'أضف منتجًا للخطة';END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(p->'items') LOOP
   IF NOT EXISTS(SELECT 1 FROM public.erp_mfg_boms WHERE cafe_id=p_cafe AND id=(x->>'bomId')::uuid AND status='active' AND payload->>'productId'=x->>'productId') THEN RAISE EXCEPTION 'قائمة مواد الخطة لا تطابق المنتج';END IF;
   IF erp_manufacturing_private.money(x->'quantity')<=0 THEN RAISE EXCEPTION 'كمية الخطة غير صالحة';END IF;
  END LOOP;
  IF nullif(p->>'sourceId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bf_documents WHERE cafe_id=p_cafe AND id=(p->>'sourceId')::uuid AND kind='sale') THEN RAISE EXCEPTION 'مصدر الخطة غير متاح';END IF;
 END IF;
 IF p_kind='workstations' THEN
  FOREACH k IN ARRAY ARRAY['wagesCost','assetsCost'] LOOP n:=erp_manufacturing_private.money(p->k);IF n>0 AND nullif(p->>CASE k WHEN 'wagesCost' THEN 'wagesAccountId' ELSE 'assetsAccountId' END,'') IS NULL THEN RAISE EXCEPTION 'حدد حساب تكلفة المحطة';END IF;END LOOP;
  FOREACH k IN ARRAY ARRAY['wagesAccountId','assetsAccountId'] LOOP IF nullif(p->>k,'') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe AND id=(p->>k)::uuid AND kind='expense' AND active) THEN RAISE EXCEPTION 'حساب تكلفة المحطة يجب أن يكون مصروفًا';END IF;END LOOP;
 END IF;
 IF p_kind='routings' AND (coalesce(jsonb_typeof(p->'stages'),'')<>'array' OR jsonb_array_length(p->'stages') NOT BETWEEN 1 AND 100 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p->'stages') s WHERE length(btrim(s)) NOT BETWEEN 1 AND 150) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p->'stages') s GROUP BY s HAVING count(*)>1)) THEN RAISE EXCEPTION 'أدخل مراحل إنتاجية غير مكررة';END IF;
 IF p_kind='overheads' THEN
  IF coalesce(jsonb_typeof(p->'sources'),'')<>'array' OR coalesce(jsonb_typeof(p->'orderIds'),'')<>'array' OR jsonb_array_length(p->'sources') NOT BETWEEN 1 AND 100 OR jsonb_array_length(p->'orderIds') NOT BETWEEN 1 AND 100 OR coalesce(p->>'method','') NOT IN('quantity','value') THEN RAISE EXCEPTION 'حدد مصادر التكلفة والأوامر وطريقة التوزيع';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'sources') s GROUP BY s->>'documentId' HAVING count(*)>1) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p->'orderIds') s GROUP BY s HAVING count(*)>1) THEN RAISE EXCEPTION 'مصادر التوزيع أو الأوامر مكررة';END IF;
 END IF;
END $$;

CREATE FUNCTION erp_manufacturing_private.validate_custom_fields(fields jsonb,depth integer DEFAULT 0) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE f jsonb;t text;BEGIN
 IF coalesce(jsonb_typeof(fields),'')<>'array' OR jsonb_array_length(fields)>50 OR depth>2 THEN RAISE EXCEPTION 'تعريف الحقول غير صالح';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(fields) x GROUP BY x->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'معرف الحقل مكرر';END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(fields) LOOP
  t:=f->>'type';
  IF coalesce(f->>'id','')!~'^[a-z][a-z0-9_]{0,59}$' OR length(btrim(coalesce(f->>'label',''))) NOT BETWEEN 1 AND 150 OR coalesce(t,'') NOT IN('text','textarea','url','email','phone','date','time','currency','number','checkbox','location','file','image','subform','separator','select','multiselect','dynamic','multidynamic','static','formatted') OR coalesce(jsonb_typeof(f->'required'),'')<>'boolean' OR coalesce(jsonb_typeof(f->'options'),'')<>'array' THEN RAISE EXCEPTION 'تعريف حقل إضافي غير صالح';END IF;
  IF jsonb_array_length(f->'options')>200 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(f->'options') v WHERE length(btrim(v)) NOT BETWEEN 1 AND 200) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(f->'options') v GROUP BY v HAVING count(*)>1) THEN RAISE EXCEPTION 'خيارات الحقل غير صالحة';END IF;
  IF t IN('select','multiselect') AND jsonb_array_length(f->'options')=0 THEN RAISE EXCEPTION 'أدخل خيارات القائمة';END IF;
  IF t IN('dynamic','multidynamic') AND coalesce(f->>'entity','') NOT IN('items','customers','employees','warehouses','accounts','bom','routings','workstations','orders','sources') THEN RAISE EXCEPTION 'الكيان المرتبط غير صالح';END IF;
  IF nullif(f->>'minimum','')::numeric>nullif(f->>'maximum','')::numeric OR length(coalesce(f->>'content',''))>20000 THEN RAISE EXCEPTION 'حدود الحقل غير صالحة';END IF;
  IF t='subform' THEN
   IF depth>=2 OR coalesce((f->>'minimumRows')::integer,0) NOT BETWEEN 0 AND 100 OR coalesce(jsonb_array_length(f->'fields'),0)=0 THEN RAISE EXCEPTION 'النموذج الفرعي غير صالح';END IF;
   PERFORM erp_manufacturing_private.validate_custom_fields(f->'fields',depth+1);
  END IF;
 END LOOP;
END $$;
CREATE FUNCTION erp_manufacturing_private.custom_defaults(fields jsonb,vals jsonb,depth integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE f jsonb;v jsonb;arr jsonb;BEGIN
 IF depth>2 OR coalesce(jsonb_typeof(vals),'')<>'object' THEN RAISE EXCEPTION 'قيم الحقول غير صالحة';END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(coalesce(fields,'[]')) LOOP
  IF f->>'type' IN('static','separator') THEN CONTINUE;END IF;
  v:=coalesce(vals->(f->>'id'),f->'defaultValue');
  IF f->>'type'='subform' THEN
   IF v IS NULL THEN SELECT coalesce(jsonb_agg('{}'::jsonb),'[]') INTO v FROM generate_series(1,coalesce((f->>'minimumRows')::integer,0));END IF;
   IF jsonb_typeof(v)='array' THEN SELECT coalesce(jsonb_agg(erp_manufacturing_private.custom_defaults(f->'fields',x,depth+1)),'[]') INTO arr FROM jsonb_array_elements(v) x;v:=arr;END IF;
  END IF;
  IF v IS NOT NULL THEN vals:=jsonb_set(vals,ARRAY[f->>'id'],v);END IF;
 END LOOP;RETURN vals;
END $$;
CREATE FUNCTION erp_manufacturing_private.validate_custom_values(fields jsonb,vals jsonb,p_cafe uuid DEFAULT NULL,p_record uuid DEFAULT NULL,p_kind text DEFAULT NULL,depth integer DEFAULT 0,p_draft boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE f jsonb;v jsonb;t text;x jsonb;txt text;tbl text;col text;valid boolean;metric numeric;BEGIN
 IF coalesce(jsonb_typeof(vals),'')<>'object' OR octet_length(vals::text)>262144 OR depth>2 THEN RAISE EXCEPTION 'بيانات الحقول الإضافية غير صالحة';END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(coalesce(fields,'[]')) LOOP
  t:=f->>'type';IF t IN('static','separator') THEN CONTINUE;END IF;
  v:=coalesce(vals->(f->>'id'),f->'defaultValue');
  IF coalesce((f->>'required')::boolean,false) AND NOT p_draft AND (v IS NULL OR v='null'::jsonb OR v='""'::jsonb OR v='[]'::jsonb OR (t='checkbox' AND v<>'true')) THEN RAISE EXCEPTION 'أكمل الحقل المطلوب: %',f->>'label';END IF;
  IF v IS NULL OR v='null'::jsonb OR v='""'::jsonb THEN CONTINUE;END IF;
  IF t='subform' THEN
   IF jsonb_typeof(v)<>'array' OR jsonb_array_length(v)>100 OR jsonb_array_length(v)<coalesce((f->>'minimumRows')::integer,0) THEN RAISE EXCEPTION 'عدد صفوف النموذج غير صالح';END IF;
   FOR x IN SELECT value FROM jsonb_array_elements(v) LOOP PERFORM erp_manufacturing_private.validate_custom_values(f->'fields',x,p_cafe,p_record,p_kind,depth+1,p_draft);END LOOP;CONTINUE;
  END IF;
  IF t='location' THEN
   IF jsonb_typeof(v)<>'object' OR jsonb_typeof(v->'latitude')<>'number' OR jsonb_typeof(v->'longitude')<>'number' OR abs((v->>'latitude')::numeric)>90 OR abs((v->>'longitude')::numeric)>180 THEN RAISE EXCEPTION 'إحداثيات الموقع غير صالحة';END IF;CONTINUE;
  END IF;
  IF (t IN('number','currency') AND jsonb_typeof(v)<>'number') OR (t='checkbox' AND jsonb_typeof(v)<>'boolean') OR (t IN('multiselect','multidynamic') AND jsonb_typeof(v)<>'array') OR (t NOT IN('number','currency','checkbox','multiselect','multidynamic') AND jsonb_typeof(v)<>'string') THEN RAISE EXCEPTION 'نوع قيمة الحقل غير صالح';END IF;
  txt:=v#>>'{}';
  IF length(txt)>20000 THEN RAISE EXCEPTION 'قيمة الحقل طويلة';END IF;
  IF (t='select' AND NOT(f->'options' @> jsonb_build_array(v))) OR (t='multiselect' AND NOT(f->'options' @> v)) THEN RAISE EXCEPTION 'اختيارات الحقل غير صالحة';END IF;
  IF t='email' AND txt!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'البريد الإلكتروني غير صالح';END IF;
  IF t='url' AND txt!~'^https?://[^[:space:]]+$' THEN RAISE EXCEPTION 'الرابط غير صالح';END IF;
  IF t='time' AND txt!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'الوقت غير صالح';END IF;
  IF t='date' THEN IF txt!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'التاريخ غير صالح';END IF;PERFORM txt::date;END IF;
  IF t IN('number','currency','text','textarea','formatted') THEN
   metric:=CASE WHEN t IN('number','currency') THEN txt::numeric ELSE length(txt) END;
   IF metric<nullif(f->>'minimum','')::numeric OR metric>nullif(f->>'maximum','')::numeric THEN RAISE EXCEPTION 'قيمة الحقل خارج الحدود: %',f->>'label';END IF;
  END IF;
  IF t IN('dynamic','multidynamic') THEN
   tbl:=CASE f->>'entity' WHEN 'items' THEN 'bf_items' WHEN 'customers' THEN 'bf_parties' WHEN 'employees' THEN 'bf_staff' WHEN 'warehouses' THEN 'bf_warehouses' WHEN 'accounts' THEN 'bf_accounts' WHEN 'bom' THEN 'erp_mfg_boms' WHEN 'routings' THEN 'erp_mfg_routings' WHEN 'workstations' THEN 'erp_mfg_workstations' WHEN 'orders' THEN 'erp_mfg_orders' WHEN 'sources' THEN 'bf_documents' END;
   IF tbl IS NULL OR p_cafe IS NULL THEN RAISE EXCEPTION 'الكيان المرتبط غير صالح';END IF;col:=CASE WHEN tbl='bf_staff' THEN 'user_id' ELSE 'id' END;
   FOR x IN SELECT value FROM jsonb_array_elements(CASE WHEN t='dynamic' THEN jsonb_build_array(v) ELSE v END) LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE cafe_id=$1 AND %I=$2)',tbl,col) INTO valid USING p_cafe,(x#>>'{}')::uuid;
    IF NOT valid THEN RAISE EXCEPTION 'القيمة المرتبطة غير موجودة في العلامة';END IF;
   END LOOP;
  END IF;
  IF t IN('file','image') THEN
   IF p_record IS NULL OR to_regclass('public.erp_files') IS NULL THEN RAISE EXCEPTION 'احفظ السجل وأضف المرفق أولًا';END IF;
   EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.erp_files WHERE cafe_id=$1 AND record_id=$2 AND id=$3 AND entity_type=$4 AND uploaded AND ($5<>''image'' OR mime IN(''image/jpeg'',''image/png'')))' INTO valid USING p_cafe,p_record,txt::uuid,CASE p_kind WHEN 'orders' THEN 'manufacturing_order' ELSE 'manufacturing_plan' END,t;
   IF NOT valid THEN RAISE EXCEPTION 'المرفق غير موجود في هذا السجل';END IF;
  END IF;
  IF coalesce((f->>'unique')::boolean,false) AND depth=0 AND p_kind IN('orders','plans') THEN
   tbl:=CASE p_kind WHEN 'orders' THEN 'erp_mfg_orders' ELSE 'erp_mfg_plans' END;
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE cafe_id=$1 AND id IS DISTINCT FROM $2 AND payload->''customValues''->$3=$4)',tbl) INTO valid USING p_cafe,p_record,f->>'id',v;
   IF valid THEN RAISE EXCEPTION 'قيمة الحقل مستخدمة مسبقًا: %',f->>'label';END IF;
  END IF;
 END LOOP;
END $$;

CREATE FUNCTION erp_manufacturing_private.matches_fields(p_fields jsonb,p_values jsonb,p_filters jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE k text;v text;f jsonb;BEGIN
 IF jsonb_typeof(p_filters)<>'object' OR octet_length(p_filters::text)>10000 THEN RETURN false;END IF;
 FOR k,v IN SELECT * FROM jsonb_each_text(p_filters) LOOP
  IF v='' THEN CONTINUE;END IF;
  SELECT x INTO f FROM jsonb_array_elements(coalesce(p_fields,'[]')) x WHERE x->>'id'=k AND x->>'filterable'='true';
  IF f IS NULL OR position(lower(v) IN lower(coalesce(p_values->>k,'')))=0 THEN RETURN false;END IF;
 END LOOP;RETURN true;
END $$;
CREATE FUNCTION public.erp_manufacturing_read(p_cafe_id uuid,p_kind text DEFAULT 'orders',p_id uuid DEFAULT NULL,p_query text DEFAULT '',p_status text DEFAULT '',p_page integer DEFAULT 1,p_filters jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tab text; rows jsonb; total integer; events jsonb; related jsonb; cfg jsonb; rev integer; r text; BEGIN
 r:=erp_manufacturing_private.authorize(p_cafe_id);tab:=erp_manufacturing_private.table_name(p_kind);
 IF tab IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR length(p_query)>150 THEN RAISE EXCEPTION 'طلب قراءة غير صالح';END IF;
 SELECT value,revision INTO cfg,rev FROM public.erp_mfg_settings WHERE cafe_id=p_cafe_id;
 EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t)-''cafe_id''-''created_by''||jsonb_build_object(''kind'',$1)),''[]'') FROM (SELECT * FROM public.%I WHERE cafe_id=$2 AND ($3 IS NULL OR id=$3) AND ($4='''' OR name ILIKE ''%%''||$4||''%%'' OR code ILIKE ''%%''||$4||''%%'') AND ($5='''' OR status=$5) AND erp_manufacturing_private.matches_fields($7,payload->''customValues'',$8) ORDER BY updated_at DESC,id LIMIT 50 OFFSET $6) t',tab) INTO rows USING p_kind,p_cafe_id,p_id,p_query,p_status,(p_page-1)*50,cfg->CASE p_kind WHEN 'orders' THEN 'orderFields' ELSE 'planFields' END,p_filters;
 EXECUTE format('SELECT count(*) FROM public.%I WHERE cafe_id=$1 AND ($2 IS NULL OR id=$2) AND ($3='''' OR name ILIKE ''%%''||$3||''%%'' OR code ILIKE ''%%''||$3||''%%'') AND ($4='''' OR status=$4) AND erp_manufacturing_private.matches_fields($5,payload->''customValues'',$6)',tab) INTO total USING p_cafe_id,p_id,p_query,p_status,cfg->CASE p_kind WHEN 'orders' THEN 'orderFields' ELSE 'planFields' END,p_filters;
 SELECT coalesce(jsonb_agg(to_jsonb(e)-'cafe_id'-'actor_id'||jsonb_build_object('actor_name',coalesce(s.name,'المالك')) ORDER BY e.created_at DESC),'[]') INTO events FROM public.erp_mfg_events e LEFT JOIN public.bf_staff s ON s.cafe_id=e.cafe_id AND s.user_id=e.actor_id WHERE e.cafe_id=p_cafe_id AND e.kind=p_kind AND e.record_id=p_id;
 SELECT coalesce(jsonb_agg(to_jsonb(o)-'cafe_id'-'created_by'||'{"kind":"orders"}'::jsonb ORDER BY created_at),'[]') INTO related FROM public.erp_mfg_orders o WHERE cafe_id=p_cafe_id AND plan_id=p_id;
 SELECT value,revision INTO cfg,rev FROM public.erp_mfg_settings WHERE cafe_id=p_cafe_id;
 RETURN jsonb_build_object('records',rows,'total',total,'events',events,'relatedOrders',related,'issues',coalesce((SELECT jsonb_agg(to_jsonb(x)-'cafe_id') FROM public.erp_mfg_material_issues x WHERE cafe_id=p_cafe_id AND order_id=p_id),'[]'),'allocations',coalesce((SELECT jsonb_agg(to_jsonb(x)-'cafe_id'||jsonb_build_object('order_name',o.name,'order_code',o.code)) FROM public.erp_mfg_overhead_allocations x JOIN public.erp_mfg_orders o ON o.cafe_id=x.cafe_id AND o.id=x.order_id WHERE x.cafe_id=p_cafe_id AND (x.overhead_id=p_id OR x.order_id=p_id)),'[]'),'role',r,'canWrite',r<>'auditor','canConfigure',r='owner','settings',coalesce(cfg,'{"autoStartOrders":true,"allowPartialMaterials":true,"orderStatuses":[],"planStatuses":[],"orderFields":[],"planFields":[],"orderForms":[],"planForms":[]}'::jsonb),'settingsRevision',coalesce(rev,0),'lookups',jsonb_build_object(
 'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'code',sku,'quantity',(SELECT coalesce(sum(quantity),0) FROM public.bf_stock WHERE cafe_id=p_cafe_id AND item_id=i.id))) FROM public.bf_items i WHERE cafe_id=p_cafe_id AND active),'[]'),
 'warehouses',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.bf_warehouses WHERE cafe_id=p_cafe_id AND active),'[]'),
 'accounts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'code',code,'status',kind)) FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND active),'[]'),
 'customers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.bf_parties WHERE cafe_id=p_cafe_id AND active AND kind='customer'),'[]'),
 'employees',coalesce((SELECT jsonb_agg(jsonb_build_object('id',user_id,'name',name)) FROM public.bf_staff WHERE cafe_id=p_cafe_id AND active),'[]'),
 'bom',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'code',code,'payload',payload)) FROM public.erp_mfg_boms WHERE cafe_id=p_cafe_id AND status='active'),'[]'),
 'routings',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'code',code,'payload',payload)) FROM public.erp_mfg_routings WHERE cafe_id=p_cafe_id),'[]'),
 'workstations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'code',code,'payload',payload)) FROM public.erp_mfg_workstations WHERE cafe_id=p_cafe_id AND status='active'),'[]'),
 'orders',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'code',code,'status',status,'payload',payload,'total',material_cost+additional_cost)) FROM public.erp_mfg_orders WHERE cafe_id=p_cafe_id AND status IN('ready','in_progress')),'[]'),
 'sources',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'name',d.number::text||' '||d.note,'total',d.total-coalesce((SELECT sum(amount) FROM public.erp_mfg_overhead_allocations WHERE cafe_id=p_cafe_id AND source_document_id=d.id),0),'status',d.kind)) FROM public.bf_documents d WHERE cafe_id=p_cafe_id AND kind IN('expense','sale')),'[]')));
END $$;

CREATE FUNCTION public.erp_manufacturing_save(p_cafe_id uuid,p_kind text,p_payload jsonb,p_id uuid DEFAULT NULL,p_revision integer DEFAULT 0,p_draft boolean DEFAULT false,p_request_id uuid DEFAULT gen_random_uuid()) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tab text; old jsonb; result jsonb; req jsonb; existing public.erp_mfg_requests%ROWTYPE; next_status text; rid uuid:=coalesce(p_id,gen_random_uuid()); BEGIN
 PERFORM erp_manufacturing_private.authorize(p_cafe_id,true,p_kind='settings');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 req:=jsonb_build_object('kind',p_kind,'payload',p_payload,'id',p_id,'revision',p_revision,'draft',p_draft);
 SELECT * INTO existing FROM public.erp_mfg_requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN IF existing.payload<>req OR existing.actor_id<>auth.uid() THEN RAISE EXCEPTION 'تعارض معرف الطلب';END IF;RETURN existing.result||'{"duplicate":true}';END IF;
 IF p_kind='settings' THEN
  IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>262144 OR coalesce(jsonb_typeof(p_payload->'autoStartOrders'),'')<>'boolean' OR coalesce(jsonb_typeof(p_payload->'allowPartialMaterials'),'')<>'boolean' THEN RAISE EXCEPTION 'إعدادات التصنيع غير صالحة';END IF;
  IF EXISTS(SELECT 1 FROM unnest(ARRAY['orderStatuses','planStatuses','orderFields','planFields','orderForms','planForms']) k WHERE coalesce(jsonb_typeof(p_payload->k),'')<>'array' OR jsonb_array_length(p_payload->k)>100) THEN RAISE EXCEPTION 'إعدادات الحقول أو الحالات غير صالحة';END IF;
  PERFORM erp_manufacturing_private.validate_custom_fields(p_payload->'orderFields');PERFORM erp_manufacturing_private.validate_custom_fields(p_payload->'planFields');
  PERFORM erp_manufacturing_private.validate_custom_fields(form->'fields') FROM jsonb_array_elements((p_payload->'orderForms')||(p_payload->'planForms')) form;
  INSERT INTO public.erp_mfg_settings(cafe_id,revision,value) VALUES(p_cafe_id,1,p_payload) ON CONFLICT(cafe_id) DO UPDATE SET value=excluded.value,revision=erp_mfg_settings.revision+1,updated_at=now() WHERE erp_mfg_settings.revision=p_revision RETURNING jsonb_build_object('revision',revision) INTO result;
  IF result IS NULL OR (p_revision>0 AND (result->>'revision')::integer=1) THEN RAISE EXCEPTION 'تغيرت الإعدادات أعد تحميل الصفحة' USING ERRCODE='40001';END IF;
 ELSE
  tab:=erp_manufacturing_private.table_name(p_kind);IF tab IS NULL THEN RAISE EXCEPTION 'نوع التصنيع غير صالح';END IF;
  PERFORM erp_manufacturing_private.validate(p_cafe_id,p_kind,p_payload);
  IF p_kind IN('orders','plans') THEN
   p_payload:=jsonb_set(p_payload,'{customValues}',erp_manufacturing_private.custom_defaults(coalesce((SELECT value->CASE p_kind WHEN 'orders' THEN 'orderFields' ELSE 'planFields' END FROM public.erp_mfg_settings WHERE cafe_id=p_cafe_id),'[]'),coalesce(p_payload->'customValues','{}')));
   PERFORM erp_manufacturing_private.validate_custom_values(coalesce((SELECT value->CASE p_kind WHEN 'orders' THEN 'orderFields' ELSE 'planFields' END FROM public.erp_mfg_settings WHERE cafe_id=p_cafe_id),'[]'),coalesce(p_payload->'customValues','{}'),p_cafe_id,p_id,p_kind,0,p_draft);
  END IF;
  IF p_id IS NOT NULL THEN
   EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE cafe_id=$1 AND id=$2 FOR UPDATE',tab) INTO old USING p_cafe_id,p_id;
   IF old IS NULL THEN RAISE EXCEPTION 'السجل غير موجود' USING ERRCODE='42501';END IF;
   IF (old->>'revision')::integer<>p_revision THEN RAISE EXCEPTION 'تغير السجل أعد تحميل الصفحة' USING ERRCODE='40001';END IF;
   IF p_kind IN('orders','plans','overheads') AND old->>'status' NOT IN('draft','ready') THEN RAISE EXCEPTION 'السجل المرحل لا يقبل تعديل البيانات';END IF;
   IF p_kind='plans' AND EXISTS(SELECT 1 FROM public.erp_mfg_orders WHERE cafe_id=p_cafe_id AND plan_id=p_id) THEN RAISE EXCEPTION 'لا تعدل خطة صدر منها أمر تصنيع';END IF;
  END IF;
  next_status:=CASE WHEN p_kind IN('bom','workstations') THEN CASE WHEN coalesce((p_payload->>'active')::boolean,true) THEN 'active' ELSE 'inactive' END WHEN p_kind='routings' THEN 'active' WHEN p_draft THEN 'draft' ELSE 'ready' END;
  IF p_kind='bom' AND coalesce((p_payload->>'isDefault')::boolean,false) THEN UPDATE public.erp_mfg_boms SET payload=jsonb_set(payload,'{isDefault}','false'),revision=revision+1 WHERE cafe_id=p_cafe_id AND id<>rid AND payload->>'productId'=p_payload->>'productId' AND payload->>'isDefault'='true';END IF;
  IF p_id IS NULL THEN EXECUTE format('INSERT INTO public.%I(id,cafe_id,name,code,status,payload,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',tab) USING rid,p_cafe_id,btrim(p_payload->>'name'),btrim(p_payload->>'code'),next_status,p_payload,auth.uid();
  ELSE EXECUTE format('UPDATE public.%I SET name=$3,code=$4,status=$5,payload=$6,revision=revision+1,updated_at=now() WHERE cafe_id=$1 AND id=$2',tab) USING p_cafe_id,rid,btrim(p_payload->>'name'),btrim(p_payload->>'code'),next_status,p_payload;END IF;
  result:=jsonb_build_object('id',rid,'revision',p_revision+1);
  INSERT INTO public.erp_mfg_events(cafe_id,record_id,kind,action,actor_id) VALUES(p_cafe_id,rid,p_kind,CASE WHEN p_id IS NULL THEN 'create' ELSE 'edit' END,auth.uid());
 END IF;
 INSERT INTO public.erp_mfg_requests(cafe_id,request_id,payload,result,actor_id) VALUES(p_cafe_id,p_request_id,req,result,auth.uid());RETURN result;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_manufacturing_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.erp_manufacturing_read(uuid,text,uuid,text,text,integer,jsonb),public.erp_manufacturing_save(uuid,text,jsonb,uuid,integer,boolean,uuid),public.erp_manufacturing_act(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_manufacturing_read(uuid,text,uuid,text,text,integer,jsonb),public.erp_manufacturing_save(uuid,text,jsonb,uuid,integer,boolean,uuid),public.erp_manufacturing_act(uuid,jsonb) TO authenticated;
COMMIT;
