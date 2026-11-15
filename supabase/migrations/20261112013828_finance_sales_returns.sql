BEGIN;
-- Posted financial refunds remain immutable. Optional receiving is separate and never pays twice.
CREATE TABLE public.bf_sales_return_stock(
 cafe_id uuid NOT NULL,return_id uuid PRIMARY KEY,source_id uuid NOT NULL,warehouse_id uuid,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('none','pending','received','rejected')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),receipt_document_id uuid,
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(cafe_id,return_id) REFERENCES public.bf_documents(cafe_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(cafe_id,source_id) REFERENCES public.bf_documents(cafe_id,id),
 FOREIGN KEY(cafe_id,warehouse_id) REFERENCES public.bf_warehouses(cafe_id,id),
 FOREIGN KEY(cafe_id,receipt_document_id) REFERENCES public.bf_documents(cafe_id,id),
 UNIQUE(cafe_id,return_id),UNIQUE(receipt_document_id),CHECK((status='received')=(receipt_document_id IS NOT NULL))
);
CREATE INDEX bf_sales_return_stock_source ON public.bf_sales_return_stock(cafe_id,source_id);
CREATE INDEX bf_sales_return_stock_actor ON public.bf_sales_return_stock(created_by);
CREATE INDEX bf_sales_return_stock_warehouse ON public.bf_sales_return_stock(cafe_id,warehouse_id);
CREATE TABLE public.bf_sales_return_stock_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,return_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN('receive','reject')),note text NOT NULL DEFAULT '' CHECK(length(note)<=500),
 actor_id uuid NOT NULL REFERENCES auth.users(id),actor_name text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(cafe_id,return_id) REFERENCES public.bf_sales_return_stock(cafe_id,return_id)
);
CREATE INDEX bf_sales_return_stock_events_return ON public.bf_sales_return_stock_events(cafe_id,return_id,created_at,id);
CREATE INDEX bf_sales_return_stock_events_actor ON public.bf_sales_return_stock_events(actor_id);
CREATE INDEX bf_sales_returns_list ON public.bf_documents(cafe_id,created_at DESC,id) WHERE kind='refund';
CREATE INDEX bf_sales_returns_party ON public.bf_documents(cafe_id,party_id,created_at DESC,id) WHERE kind='refund';
ALTER TABLE public.bf_sales_return_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bf_sales_return_stock_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_sales_return_stock,public.bf_sales_return_stock_events FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.bf_sales_return_stock_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION brand_finance_private.sales_return_components(cafe uuid,refund uuid)
 RETURNS TABLE(id uuid,item_id uuid,warehouse_id uuid,quantity numeric,cost numeric,cost_status text)
 LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT c.id,c.item_id,c.warehouse_id,c.quantity,c.cost,c.cost_status
 FROM public.bf_line_components c JOIN public.bf_document_lines l ON l.cafe_id=c.cafe_id AND l.id=c.line_id
 WHERE l.cafe_id=cafe AND l.document_id=refund
 UNION ALL
 SELECT l.id,l.item_id,d.warehouse_id,l.quantity,l.cost,l.cost_status
 FROM public.bf_document_lines l JOIN public.bf_documents d ON d.cafe_id=l.cafe_id AND d.id=l.document_id
 WHERE l.cafe_id=cafe AND l.document_id=refund AND l.item_id IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM public.bf_line_components c WHERE c.cafe_id=l.cafe_id AND c.line_id=l.id)
$$;

CREATE FUNCTION brand_finance_private.sales_return_summary(d public.bf_documents) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',d.id,'number',d.number,'sourceId',d.reference_id,'sourceNumber',source.number,'partyId',d.party_id,
 'customerName',coalesce(p.name,'عميل نقدي'),'createdAt',d.created_at,'createdByName',coalesce(st.name,CASE WHEN c.owner_user_id=d.created_by THEN 'مالك العلامة' ELSE 'موظف سابق' END),
 'subtotal',d.subtotal,'discount',d.discount,'tax',d.tax,'total',d.total,'paid',d.paid,'debtReduced',d.total-d.paid,
 'paymentStatus',CASE WHEN d.paid=0 THEN 'credit' WHEN d.paid=d.total THEN 'cash' ELSE 'mixed' END,
 'paymentMethod',a.kind,'accountName',coalesce(a.name,''),'warehouseName',coalesce(w.name,''),'stockRevision',coalesce(s.revision,0),
 'stockStatus',coalesce(s.status,CASE WHEN EXISTS(SELECT 1 FROM public.bf_movements m WHERE m.cafe_id=d.cafe_id AND m.document_id=d.id AND m.quantity>0) THEN 'received' ELSE 'none' END))
 FROM public.bf_documents source JOIN public.cafes c ON c.id=d.cafe_id
 LEFT JOIN public.bf_parties p ON p.cafe_id=d.cafe_id AND p.id=d.party_id
 LEFT JOIN public.bf_staff st ON st.cafe_id=d.cafe_id AND st.user_id=d.created_by
 LEFT JOIN public.bf_accounts a ON a.cafe_id=d.cafe_id AND a.id=d.account_id
 LEFT JOIN public.bf_warehouses w ON w.cafe_id=d.cafe_id AND w.id=d.warehouse_id
 LEFT JOIN public.bf_sales_return_stock s ON s.cafe_id=d.cafe_id AND s.return_id=d.id
 WHERE source.cafe_id=d.cafe_id AND source.id=d.reference_id AND source.kind='sale' AND d.kind='refund'
$$;
CREATE FUNCTION brand_finance_private.sales_return_detail(d public.bf_documents) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE answer jsonb;stock_status text;receipt uuid;lines jsonb;events jsonb;stock_lines jsonb;
BEGIN
 answer:=brand_finance_private.sales_return_summary(d);IF answer IS NULL THEN RETURN NULL;END IF;
 stock_status:=answer->>'stockStatus';
 SELECT receipt_document_id INTO receipt FROM public.bf_sales_return_stock WHERE cafe_id=d.cafe_id AND return_id=d.id;
 IF receipt IS NULL AND stock_status='received' THEN receipt:=d.id;END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'description','','quantity',l.quantity,'price',l.unit_price,
  'discount',greatest(0,round(l.quantity*l.unit_price,2)-l.net-CASE WHEN coalesce(d.tax_inclusive,true) THEN l.tax ELSE 0 END),'net',l.net,'tax',l.tax,'total',l.net+l.tax) ORDER BY l.id),'[]') INTO lines FROM public.bf_document_lines l WHERE l.cafe_id=d.cafe_id AND l.document_id=d.id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'itemName',i.name,'quantity',r.quantity,'receivedQuantity',CASE WHEN stock_status='received' THEN r.quantity ELSE 0 END,'unitCost',r.cost/r.quantity,'total',r.cost,'costStatus',r.cost_status) ORDER BY i.name,r.id),'[]') INTO stock_lines FROM brand_finance_private.sales_return_components(d.cafe_id,d.id) r JOIN public.bf_items i ON i.cafe_id=d.cafe_id AND i.id=r.item_id;
 SELECT coalesce(jsonb_agg(e.data ORDER BY e.created_at,e.id),'[]') INTO events FROM (
  SELECT d.id::text||':posted' id,d.created_at,jsonb_build_object('id',d.id::text||':posted','action','posted','actorName',answer->>'createdByName','createdAt',d.created_at,'note',d.note) data
  UNION ALL SELECT r.id::text||':requested',r.created_at,jsonb_build_object('id',r.id::text||':requested','action','requested','actorName',coalesce(st.name,CASE WHEN c.owner_user_id=r.created_by THEN 'مالك العلامة' ELSE 'موظف سابق' END),'createdAt',r.created_at,'note',r.payload->>'note') FROM public.bf_refund_requests r JOIN public.cafes c ON c.id=r.cafe_id LEFT JOIN public.bf_staff st ON st.cafe_id=r.cafe_id AND st.user_id=r.created_by WHERE r.cafe_id=d.cafe_id AND r.refund_document_id=d.id
  UNION ALL SELECT e.id::text,e.created_at,jsonb_build_object('id',e.id,'action',e.operation,'actorName',e.actor_name,'createdAt',e.created_at,'note',e.note) FROM public.bf_sales_return_stock_events e WHERE e.cafe_id=d.cafe_id AND e.return_id=d.id
 ) e;
 RETURN answer||jsonb_build_object('note',d.note,'taxInclusive',coalesce(d.tax_inclusive,true),'stockDocumentId',receipt,'lines',lines,'stockLines',stock_lines,'events',events);
END $$;
CREATE FUNCTION public.brand_finance_sales_returns(p_cafe_id uuid,p_id uuid DEFAULT NULL,p_filters jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.bf_documents%ROWTYPE;role_name text;filter_party uuid;filter_stock text;filter_payment text;query_value text;date_from date;date_to date;off integer;lim integer;answer jsonb;total_count bigint;
BEGIN
 role_name:=brand_finance_private.role_for(p_cafe_id);
 IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 IF p_id IS NOT NULL THEN SELECT * INTO d FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=p_id AND kind='refund';IF NOT FOUND THEN RETURN NULL;END IF;RETURN brand_finance_private.sales_return_detail(d);END IF;
 IF jsonb_typeof(p_filters) IS DISTINCT FROM 'object' OR octet_length(p_filters::text)>2000 THEN RAISE EXCEPTION 'Invalid filters';END IF;
 filter_party:=nullif(p_filters->>'partyId','')::uuid;filter_stock:=p_filters->>'stockStatus';filter_payment:=p_filters->>'paymentStatus';query_value:=lower(trim(coalesce(p_filters->>'query','')));
 date_from:=nullif(p_filters->>'from','')::date;date_to:=nullif(p_filters->>'to','')::date;off:=coalesce((p_filters->>'offset')::integer,0);lim:=coalesce((p_filters->>'limit')::integer,30);
 IF off NOT BETWEEN 0 AND 100000 OR lim NOT BETWEEN 1 AND 100 OR length(query_value)>100 OR (filter_stock IS NOT NULL AND filter_stock NOT IN('none','pending','received','rejected')) OR (filter_payment IS NOT NULL AND filter_payment NOT IN('cash','credit','mixed')) THEN RAISE EXCEPTION 'Invalid filters';END IF;
 WITH matching AS MATERIALIZED (
 SELECT r.id,r.created_at FROM public.bf_documents r JOIN public.bf_documents src ON src.cafe_id=r.cafe_id AND src.id=r.reference_id AND src.kind='sale'
 LEFT JOIN public.bf_parties p ON p.cafe_id=r.cafe_id AND p.id=r.party_id
 LEFT JOIN public.bf_sales_return_stock s ON s.cafe_id=r.cafe_id AND s.return_id=r.id
 WHERE r.cafe_id=p_cafe_id AND r.kind='refund' AND (filter_party IS NULL OR r.party_id=filter_party)
 AND (date_from IS NULL OR r.created_at>=(date_from::timestamp AT TIME ZONE 'Asia/Riyadh')) AND (date_to IS NULL OR r.created_at<((date_to+1)::timestamp AT TIME ZONE 'Asia/Riyadh'))
 AND (filter_payment IS NULL OR CASE WHEN r.paid=0 THEN 'credit' WHEN r.paid=r.total THEN 'cash' ELSE 'mixed' END=filter_payment)
 AND (filter_stock IS NULL OR coalesce(s.status,CASE WHEN EXISTS(SELECT 1 FROM public.bf_movements m WHERE m.cafe_id=r.cafe_id AND m.document_id=r.id AND m.quantity>0) THEN 'received' ELSE 'none' END)=filter_stock)
 AND (query_value='' OR position(query_value in lower(coalesce(p.name,'عميل نقدي')||' '||r.number::text||' '||src.number::text))>0)
 ),page AS (SELECT * FROM matching ORDER BY created_at DESC,id LIMIT lim OFFSET off)
 SELECT (SELECT count(*) FROM matching),coalesce((SELECT jsonb_agg(brand_finance_private.sales_return_summary(doc) ORDER BY doc.created_at DESC,doc.id) FROM page JOIN public.bf_documents doc ON doc.cafe_id=p_cafe_id AND doc.id=page.id),'[]') INTO total_count,answer;
 RETURN jsonb_build_object('items',answer,'total',total_count,'offset',off,'limit',lim);
END $$;

CREATE FUNCTION public.brand_finance_sales_return_stock(p_cafe_id uuid,p_id uuid,p_revision integer,p_operation text,p_request_id uuid,p_note text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text;s public.bf_sales_return_stock%ROWTYPE;d public.bf_documents%ROWTYPE;prior public.bf_requests%ROWTYPE;command jsonb;answer jsonb;receipt uuid:=gen_random_uuid();component record;cost numeric:=0;closed_date date;
BEGIN
 role_name:=brand_finance_private.role_for(p_cafe_id);
 IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','warehouse') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 IF p_id IS NULL OR p_revision IS NULL OR p_revision<1 OR p_request_id IS NULL OR p_operation IS NULL OR p_operation NOT IN('receive','reject') OR p_note IS NULL OR length(p_note)>500 THEN RAISE EXCEPTION 'Invalid stock request';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 command:=jsonb_build_object('id',p_id,'revision',p_revision,'operation',p_operation,'note',p_note);
 SELECT * INTO prior FROM public.bf_requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN IF prior.operation<>'sales_return_stock' OR prior.payload<>command OR prior.created_by<>auth.uid() THEN RAISE EXCEPTION 'Request identity conflict';END IF;RETURN prior.result;END IF;
 SELECT * INTO s FROM public.bf_sales_return_stock WHERE cafe_id=p_cafe_id AND return_id=p_id FOR UPDATE;
 IF NOT FOUND OR s.status<>'pending' THEN RAISE EXCEPTION 'الفاتورة ليست بانتظار الاستلام المخزني';END IF;
 IF s.revision<>p_revision THEN RAISE EXCEPTION 'تغير إذن الاستلام' USING ERRCODE='40001';END IF;
 SELECT * INTO STRICT d FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=p_id AND kind='refund';
 IF p_operation='reject' THEN
  IF length(trim(p_note))=0 THEN RAISE EXCEPTION 'حدد سبب رفض الاستلام';END IF;
  UPDATE public.bf_sales_return_stock SET status='rejected',revision=revision+1 WHERE return_id=p_id;
 ELSE
  SELECT closed_through INTO closed_date FROM public.bf_settings WHERE cafe_id=p_cafe_id;
  IF closed_date IS NOT NULL AND (now() AT TIME ZONE 'Asia/Riyadh')::date<=closed_date THEN RAISE EXCEPTION 'الفترة المحاسبية مقفلة';END IF;
  IF NOT EXISTS(SELECT 1 FROM brand_finance_private.sales_return_components(p_cafe_id,p_id)) THEN RAISE EXCEPTION 'لا توجد أصناف مخزنية لاستلامها';END IF;
  INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,warehouse_id,reference_id,note,created_by) VALUES(receipt,p_cafe_id,'stock_adjust',d.party_id,d.warehouse_id,p_id,'استلام أصناف فاتورة مرتجعة '||d.number,auth.uid());
  UPDATE public.bf_sales_return_stock SET status='received',receipt_document_id=receipt,revision=revision+1 WHERE return_id=p_id;
  FOR component IN SELECT * FROM brand_finance_private.sales_return_components(p_cafe_id,p_id) ORDER BY item_id,warehouse_id,id LOOP
   IF NOT EXISTS(SELECT 1 FROM public.bf_items WHERE cafe_id=p_cafe_id AND id=component.item_id AND active) OR NOT EXISTS(SELECT 1 FROM public.bf_warehouses WHERE cafe_id=p_cafe_id AND id=component.warehouse_id AND active) THEN RAISE EXCEPTION 'الصنف أو مستودع الاستلام غير متاح';END IF;
   cost:=cost+brand_finance_private.stock_move(p_cafe_id,receipt,component.item_id,component.warehouse_id,component.quantity,component.cost/component.quantity);
  END LOOP;
  PERFORM brand_finance_private.invoice_line(p_cafe_id,receipt,brand_finance_private.account(p_cafe_id,'1200'),cost,0,d.party_id,'استلام أصناف فاتورة مرتجعة');
  PERFORM brand_finance_private.invoice_line(p_cafe_id,receipt,brand_finance_private.account(p_cafe_id,'5000'),0,cost,d.party_id,'عكس تكلفة أصناف فاتورة مرتجعة');
 END IF;
 INSERT INTO public.bf_sales_return_stock_events(cafe_id,return_id,operation,note,actor_id,actor_name) VALUES(p_cafe_id,p_id,p_operation,p_note,auth.uid(),brand_finance_private.credit_note_actor(p_cafe_id));
 answer:=brand_finance_private.sales_return_detail(d);
 INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by) VALUES(p_cafe_id,p_request_id,'sales_return_stock',command,answer,auth.uid());
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.sales_return_components(uuid,uuid),brand_finance_private.sales_return_summary(public.bf_documents),brand_finance_private.sales_return_detail(public.bf_documents) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.brand_finance_sales_returns(uuid,uuid,jsonb),public.brand_finance_sales_return_stock(uuid,uuid,integer,text,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_sales_returns(uuid,uuid,jsonb),public.brand_finance_sales_return_stock(uuid,uuid,integer,text,uuid,text) TO authenticated;
-- Existing posting helpers are patched below after exact baseline verification.
DO $baseline$ BEGIN
 IF md5(pg_get_functiondef('brand_finance_private.post_refund(uuid,jsonb,uuid)'::regprocedure))<>'70ec2ab2298b2b25bf85f6d732fe729f' THEN RAISE EXCEPTION 'Unexpected baseline: brand_finance_private.post_refund(uuid,jsonb,uuid)';END IF;
 IF md5(pg_get_functiondef('brand_finance_private.inventory_line_components()'::regprocedure))<>'8ea23fa4e50d31c5709663583daafd51' THEN RAISE EXCEPTION 'Unexpected baseline: brand_finance_private.inventory_line_components()';END IF;
 IF md5(pg_get_functiondef('brand_finance_private.refund_quote(uuid,jsonb)'::regprocedure))<>'ae99a15ee21cd866448d2c33b3a28181' THEN RAISE EXCEPTION 'Unexpected baseline: brand_finance_private.refund_quote(uuid,jsonb)';END IF;
 IF md5(pg_get_functiondef('brand_finance_private.stock_move(uuid,uuid,uuid,uuid,numeric,numeric)'::regprocedure))<>'d632e41dc80ded583cdc9417d1dcf977' THEN RAISE EXCEPTION 'Unexpected baseline: brand_finance_private.stock_move(uuid,uuid,uuid,uuid,numeric,numeric)';END IF;
END $baseline$;
CREATE OR REPLACE FUNCTION brand_finance_private.post_refund(p_cafe uuid, p_payload jsonb, p_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE original public.bf_documents%ROWTYPE; source jsonb; entry jsonb; available jsonb; selections jsonb; prepared jsonb:='[]'; state jsonb;
 qty numeric; before_qty numeric; line_net numeric; line_tax numeric; line_cost numeric; line_gross numeric; net numeric:=0; tax numeric:=0; gross numeric:=0; total numeric; discount numeric; debt numeric; paid numeric; actual_cost numeric; aid uuid; number bigint; item uuid; original_line public.bf_document_lines%ROWTYPE; defer_stock boolean:=false;
BEGIN
 IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe),'') NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'Finance manager required' USING ERRCODE='42501'; END IF;
 SELECT * INTO original FROM public.bf_documents WHERE cafe_id=p_cafe AND id=(p_payload->>'documentId')::uuid AND kind IN('sale','purchase') FOR UPDATE;
 IF original.kind='sale' AND NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND owner_user_id=auth.uid()) THEN RAISE EXCEPTION 'Brand owner required' USING ERRCODE='42501'; END IF;
 IF original.id IS NULL THEN RAISE EXCEPTION 'الفاتورة غير متاحة للإرجاع'; END IF;
 IF p_payload ? 'deferStock' AND jsonb_typeof(p_payload->'deferStock') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'خيار الاستلام المخزني غير صالح';END IF;
 defer_stock:=original.kind='sale' AND coalesce((p_payload->>'deferStock')::boolean,false);
 IF defer_stock AND EXISTS(SELECT 1 FROM public.gift_orders WHERE cafe_id=p_cafe AND finance_document_id=original.id) THEN RAISE EXCEPTION 'مرتجعات طلبات الهدايا تستخدم الاستلام المباشر للحفاظ على مخزون المتجر';END IF;
 available:=brand_finance_private.refund_lines(p_cafe,original.id,true);
 state:=brand_finance_private.document_state(p_cafe,original.id);
 IF (state->>'refunded')::boolean THEN RAISE EXCEPTION 'تم إرجاع جميع كميات الفاتورة'; END IF;
 IF p_payload ? 'lines' THEN selections:=p_payload->'lines'; ELSE
  SELECT jsonb_agg(jsonb_build_object('lineId',l->>'id','quantity',(l->>'quantity')::numeric-(l->>'returned_quantity')::numeric)) INTO selections FROM jsonb_array_elements(available) l WHERE (l->>'quantity')::numeric>(l->>'returned_quantity')::numeric;
 END IF;
 IF jsonb_typeof(selections) IS DISTINCT FROM 'array' OR jsonb_array_length(selections) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'حدد الأصناف والكميات المرتجعة'; END IF;
 IF (SELECT count(DISTINCT e->>'lineId') FROM jsonb_array_elements(selections) e)<>jsonb_array_length(selections) THEN RAISE EXCEPTION 'لا تكرر الصنف في طلب المرتجع'; END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(selections) LOOP
  SELECT l INTO source FROM jsonb_array_elements(available) l WHERE l->>'id'=entry->>'lineId';
  IF source IS NULL THEN RAISE EXCEPTION 'الصنف لا ينتمي إلى الفاتورة'; END IF;
  qty:=(entry->>'quantity')::numeric; before_qty:=(source->>'returned_quantity')::numeric;
  IF qty IS NULL OR qty<=0 OR qty<>round(qty,3) OR qty>(source->>'quantity')::numeric-before_qty THEN RAISE EXCEPTION 'الكمية المرتجعة تتجاوز الكمية المتبقية'; END IF;
  IF entry ? 'expectedReturnedQuantity' AND (entry->>'expectedReturnedQuantity')::numeric IS DISTINCT FROM before_qty THEN RAISE EXCEPTION 'تغيرت الكمية المرتجعة حدث الفاتورة ثم أعد المحاولة'; END IF;
  line_net:=round((source->>'net')::numeric*(before_qty+qty)/(source->>'quantity')::numeric,2)-(source->>'returned_net')::numeric;
  line_tax:=round((source->>'tax')::numeric*(before_qty+qty)/(source->>'quantity')::numeric,2)-(source->>'returned_tax')::numeric;
  line_cost:=round((source->>'cost')::numeric*(before_qty+qty)/(source->>'quantity')::numeric,2)-(source->>'returned_cost')::numeric;
  line_gross:=round(qty*(source->>'unit_price')::numeric,2);
  net:=net+line_net; tax:=tax+line_tax; gross:=gross+line_gross;
  prepared:=prepared||jsonb_build_array(source||jsonb_build_object('return_quantity',qty,'return_net',line_net,'return_tax',line_tax,'return_cost',line_cost));
 END LOOP;
 total:=net+tax;
 IF p_payload ? 'lines' AND (p_payload->>'expectedTotal')::numeric IS DISTINCT FROM total THEN RAISE EXCEPTION 'تغير إجمالي المرتجع راجع الكميات'; END IF;
 discount:=greatest(0,gross-net-CASE WHEN coalesce(original.tax_inclusive,true) THEN tax ELSE 0 END);
 debt:=least(total,(state->>'outstanding')::numeric); paid:=total-debt;
 aid:=nullif(p_payload->>'accountId','')::uuid;
 IF paid>0 AND aid IS NULL THEN
  aid:=CASE WHEN (brand_finance_private.payment_document(original)).paid>0 THEN (brand_finance_private.payment_document(original)).account_id ELSE NULL END;
  IF aid IS NULL THEN SELECT (brand_finance_private.payment_document(d)).account_id INTO aid FROM public.bf_documents d WHERE cafe_id=p_cafe AND reference_id=original.id AND kind='settlement' AND (brand_finance_private.payment_document(d)).paid>0 ORDER BY created_at DESC,id LIMIT 1; END IF;
 END IF;
 IF paid>0 AND NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe AND id=aid AND active AND kind IN('cash','bank','pos')) THEN RAISE EXCEPTION 'اختر حساب تسوية المبلغ المرتجع'; END IF;
 IF paid=0 THEN aid:=NULL; END IF;
 IF defer_stock THEN INSERT INTO public.bf_sales_return_stock(cafe_id,return_id,source_id,warehouse_id,created_by) VALUES(p_cafe,p_id,original.id,original.warehouse_id,auth.uid());END IF;
 INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,shift_id,account_id,warehouse_id,subtotal,discount,tax,total,paid,reference_id,note,created_by,vat_rate,tax_inclusive)
 VALUES(p_id,p_cafe,'refund',original.party_id,CASE WHEN original.kind='sale' THEN nullif(p_payload->>'shiftId','')::uuid ELSE NULL END,aid,original.warehouse_id,gross,discount,tax,total,paid,original.id,coalesce(p_payload->>'note',''),auth.uid(),original.vat_rate,original.tax_inclusive) RETURNING bf_documents.number INTO number;
 FOR entry IN SELECT value FROM jsonb_array_elements(prepared) LOOP
  qty:=(entry->>'return_quantity')::numeric; line_net:=(entry->>'return_net')::numeric; line_tax:=(entry->>'return_tax')::numeric; line_cost:=(entry->>'return_cost')::numeric; item:=(entry->>'item_id')::uuid;
  actual_cost:=0;
  IF NOT defer_stock AND item IS NOT NULL AND NOT (original.kind='sale' AND EXISTS(SELECT 1 FROM public.bf_line_components WHERE cafe_id=p_cafe AND line_id=(entry->>'id')::uuid)) THEN actual_cost:=brand_finance_private.stock_move(p_cafe,p_id,item,original.warehouse_id,CASE WHEN original.kind='sale' THEN qty ELSE -qty END,CASE WHEN original.kind='sale' THEN line_cost/qty ELSE 0 END); END IF;
  SELECT * INTO STRICT original_line FROM public.bf_document_lines WHERE cafe_id=p_cafe AND id=(entry->>'id')::uuid;
  INSERT INTO public.bf_document_lines(cafe_id,document_id,reference_line_id,product_id,item_id,name,quantity,unit_price,net,tax,cost,activity_kind,vat_rate,tax_category,exemption_reason)
  VALUES(p_cafe,p_id,(entry->>'id')::uuid,(entry->>'product_id')::uuid,item,entry->>'name',qty,(entry->>'unit_price')::numeric,line_net,line_tax,line_cost,original_line.activity_kind,original_line.vat_rate,original_line.tax_category,original_line.exemption_reason) RETURNING bf_document_lines.cost INTO line_cost;
  IF original.kind='sale' THEN
   IF NOT defer_stock THEN
   PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'1200'),line_cost,0);
   PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'5000'),0,line_cost);
   END IF;
  ELSE
   PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'1200'),0,actual_cost);
   PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'5200'),greatest(actual_cost-line_net,0),greatest(line_net-actual_cost,0));
  END IF;
 END LOOP;
 IF original.kind='sale' THEN
  PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'4000'),net,0);
  PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'2100'),tax,0);
  PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'1100'),0,debt,original.party_id);
  PERFORM brand_finance_private.line(p_cafe,p_id,aid,0,paid);
 ELSE
  PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'1300'),0,tax);
  PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'2000'),debt,0,original.party_id);
  PERFORM brand_finance_private.line(p_cafe,p_id,aid,paid,0);
 END IF;
 PERFORM brand_finance_private.invoice_refund_adjustments(p_cafe,p_id);
 IF defer_stock AND NOT EXISTS(SELECT 1 FROM brand_finance_private.sales_return_components(p_cafe,p_id)) THEN UPDATE public.bf_sales_return_stock SET status='none' WHERE return_id=p_id;END IF;
 RETURN number;
END $function$
;

CREATE OR REPLACE FUNCTION brand_finance_private.inventory_line_components()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE doc public.bf_documents%ROWTYPE; original public.bf_document_lines%ROWTYPE; c record; s public.bf_stock%ROWTYPE;
 q numeric; actual numeric; allocated numeric; divisor integer; status text; returned_menu numeric; returned_qty numeric; returned_cost numeric; returned_allocated numeric; target_qty numeric;
BEGIN
 IF NEW.activity_kind='service' THEN NEW.cost:=0;NEW.allocated_cost:=0;NEW.item_id:=NULL;RETURN NEW;END IF;
 SELECT * INTO STRICT doc FROM public.bf_documents WHERE cafe_id=NEW.cafe_id AND id=NEW.document_id;
 IF doc.kind='sale' THEN
  NEW.cost:=0;NEW.allocated_cost:=0;NEW.item_id:=NULL;
  FOR c IN SELECT l.item_id,l.quantity,i.cost_mode,(SELECT count(*) FROM public.bf_item_product_links x JOIN public.menu_products p ON p.id=x.product_id AND p.cafe_id=x.cafe_id AND p.deleted_at IS NULL WHERE x.cafe_id=l.cafe_id AND x.item_id=l.item_id) linked_count
   FROM public.bf_item_product_links l JOIN public.bf_items i ON i.id=l.item_id AND i.cafe_id=l.cafe_id AND i.active
   WHERE l.cafe_id=NEW.cafe_id AND l.product_id=NEW.product_id ORDER BY l.item_id LOOP
   q:=round(NEW.quantity*c.quantity*NEW.stock_unit_factor,3);
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
  SELECT * INTO STRICT original FROM public.bf_document_lines WHERE cafe_id=NEW.cafe_id AND id=NEW.reference_line_id; NEW.unit_id:=original.unit_id; NEW.unit_label:=original.unit_label; NEW.stock_unit_factor:=original.stock_unit_factor;
  SELECT coalesce(sum(quantity),0) INTO returned_menu FROM public.bf_document_lines WHERE cafe_id=NEW.cafe_id AND reference_line_id=original.id;
  NEW.cost:=0;NEW.allocated_cost:=0;NEW.item_id:=original.item_id;
  FOR c IN SELECT * FROM public.bf_line_components WHERE cafe_id=NEW.cafe_id AND line_id=original.id ORDER BY item_id LOOP
   SELECT coalesce(sum(quantity),0),coalesce(sum(cost),0),coalesce(sum(allocated_cost),0) INTO returned_qty,returned_cost,returned_allocated FROM public.bf_line_components WHERE original_component_id=c.id;
   target_qty:=round(c.quantity*(returned_menu+NEW.quantity)/original.quantity,3);q:=target_qty-returned_qty;
   IF q=0 THEN CONTINUE; END IF;
   IF q<0 OR target_qty>c.quantity THEN RAISE EXCEPTION 'Component refund exceeds original consumption'; END IF;
   actual:=round(c.cost*target_qty/c.quantity,2)-returned_cost;allocated:=round(c.allocated_cost*target_qty/c.quantity,2)-returned_allocated;
   IF NOT EXISTS(SELECT 1 FROM public.bf_sales_return_stock sr WHERE sr.cafe_id=NEW.cafe_id AND sr.return_id=NEW.document_id AND sr.status='pending') THEN
   PERFORM brand_finance_private.stock_move(NEW.cafe_id,NEW.document_id,c.item_id,c.warehouse_id,q,actual/q);
   END IF;
   INSERT INTO public.bf_line_components(cafe_id,line_id,item_id,warehouse_id,quantity,cost,allocated_cost,cost_mode,allocation_divisor,cost_status,original_component_id)
    VALUES(NEW.cafe_id,NEW.id,c.item_id,c.warehouse_id,q,actual,allocated,c.cost_mode,c.allocation_divisor,c.cost_status,c.id);
   NEW.cost:=NEW.cost+actual;NEW.allocated_cost:=NEW.allocated_cost+allocated;
  END LOOP;
 ELSE
  IF doc.kind='refund' AND NEW.reference_line_id IS NOT NULL THEN
   SELECT * INTO STRICT original FROM public.bf_document_lines WHERE cafe_id=NEW.cafe_id AND id=NEW.reference_line_id;
   NEW.unit_id:=original.unit_id; NEW.unit_label:=original.unit_label; NEW.stock_unit_factor:=original.stock_unit_factor;
  END IF;
  NEW.allocated_cost:=NEW.cost;
 END IF;
 RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION brand_finance_private.refund_quote(p_cafe uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE original public.bf_documents%ROWTYPE; source jsonb; entry jsonb; available jsonb; selections jsonb; prepared jsonb:='[]'; state jsonb;
 qty numeric; before_qty numeric; line_net numeric; line_tax numeric; line_cost numeric; line_gross numeric; net numeric:=0; tax numeric:=0; gross numeric:=0; total numeric; discount numeric; debt numeric; paid numeric; actual_cost numeric; aid uuid; number bigint; item uuid; r text; sh public.bf_shifts%ROWTYPE;
BEGIN
 r:=brand_finance_private.role_for(p_cafe);
 IF p_payload ? 'deferStock' AND jsonb_typeof(p_payload->'deferStock') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'خيار الاستلام المخزني غير صالح';END IF;
 SELECT * INTO original FROM public.bf_documents WHERE cafe_id=p_cafe AND id=(p_payload->>'documentId')::uuid AND kind IN('sale','purchase') FOR UPDATE;
 IF original.id IS NULL THEN RAISE EXCEPTION 'الفاتورة غير متاحة للإرجاع'; END IF;
 IF original.kind<>'sale' OR (r='cashier' AND original.created_by<>auth.uid()) THEN RAISE EXCEPTION 'Sale refund access denied' USING ERRCODE='42501'; END IF;
 IF coalesce((p_payload->>'deferStock')::boolean,false) AND EXISTS(SELECT 1 FROM public.gift_orders WHERE cafe_id=p_cafe AND finance_document_id=original.id) THEN RAISE EXCEPTION 'مرتجعات طلبات الهدايا تستخدم الاستلام المباشر للحفاظ على مخزون المتجر';END IF;
 available:=brand_finance_private.refund_lines(p_cafe,original.id,true);
 state:=brand_finance_private.document_state(p_cafe,original.id);
 IF (state->>'refunded')::boolean THEN RAISE EXCEPTION 'تم إرجاع جميع كميات الفاتورة'; END IF;
 IF p_payload ? 'lines' THEN selections:=p_payload->'lines'; ELSE
  SELECT jsonb_agg(jsonb_build_object('lineId',l->>'id','quantity',(l->>'quantity')::numeric-(l->>'returned_quantity')::numeric)) INTO selections FROM jsonb_array_elements(available) l WHERE (l->>'quantity')::numeric>(l->>'returned_quantity')::numeric;
 END IF;
 IF jsonb_typeof(selections) IS DISTINCT FROM 'array' OR jsonb_array_length(selections) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'حدد الأصناف والكميات المرتجعة'; END IF;
 IF (SELECT count(DISTINCT e->>'lineId') FROM jsonb_array_elements(selections) e)<>jsonb_array_length(selections) THEN RAISE EXCEPTION 'لا تكرر الصنف في طلب المرتجع'; END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(selections) LOOP
  SELECT l INTO source FROM jsonb_array_elements(available) l WHERE l->>'id'=entry->>'lineId';
  IF source IS NULL THEN RAISE EXCEPTION 'الصنف لا ينتمي إلى الفاتورة'; END IF;
  qty:=(entry->>'quantity')::numeric; before_qty:=(source->>'returned_quantity')::numeric;
  IF qty IS NULL OR qty<=0 OR qty<>round(qty,3) OR qty>(source->>'quantity')::numeric-before_qty THEN RAISE EXCEPTION 'الكمية المرتجعة تتجاوز الكمية المتبقية'; END IF;
  IF entry ? 'expectedReturnedQuantity' AND (entry->>'expectedReturnedQuantity')::numeric IS DISTINCT FROM before_qty THEN RAISE EXCEPTION 'تغيرت الكمية المرتجعة حدث الفاتورة ثم أعد المحاولة'; END IF;
  line_net:=round((source->>'net')::numeric*(before_qty+qty)/(source->>'quantity')::numeric,2)-(source->>'returned_net')::numeric;
  line_tax:=round((source->>'tax')::numeric*(before_qty+qty)/(source->>'quantity')::numeric,2)-(source->>'returned_tax')::numeric;
  line_cost:=round((source->>'cost')::numeric*(before_qty+qty)/(source->>'quantity')::numeric,2)-(source->>'returned_cost')::numeric;
  line_gross:=round(qty*(source->>'unit_price')::numeric,2);
  net:=net+line_net; tax:=tax+line_tax; gross:=gross+line_gross;
  prepared:=prepared||jsonb_build_array(source||jsonb_build_object('return_quantity',qty,'return_net',line_net,'return_tax',line_tax,'return_cost',line_cost));
 END LOOP;
 total:=net+tax;
 IF p_payload ? 'lines' AND (p_payload->>'expectedTotal')::numeric IS DISTINCT FROM total THEN RAISE EXCEPTION 'تغير إجمالي المرتجع راجع الكميات'; END IF;
 discount:=greatest(0,gross-net-CASE WHEN coalesce(original.tax_inclusive,true) THEN tax ELSE 0 END);
 debt:=least(total,(state->>'outstanding')::numeric); paid:=total-debt;
 IF (p_payload->>'expectedPaid')::numeric IS DISTINCT FROM paid THEN RAISE EXCEPTION 'تغير المبلغ المدفوع للعميل ارفض الطلب وأنشئ طلبا محدثا'; END IF;
 IF nullif(btrim(p_payload->>'note'),'') IS NULL THEN RAISE EXCEPTION 'أدخل سبب المرتجع'; END IF;
 aid:=nullif(p_payload->>'accountId','')::uuid;
 IF paid>0 THEN
  IF p_payload->>'paymentMethod' NOT IN('cash','bank') OR p_payload->>'paymentMethod' IS NULL THEN RAISE EXCEPTION 'حدد دفع المرتجع نقدا أو بتحويل بنكي'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe AND id=aid AND active AND kind=p_payload->>'paymentMethod') THEN RAISE EXCEPTION 'حساب الدفع لا يطابق طريقة دفع المرتجع'; END IF;
  IF p_payload->>'paymentMethod'='cash' THEN
   SELECT * INTO sh FROM public.bf_shifts WHERE cafe_id=p_cafe AND account_id=aid AND status IN('open','handover') FOR UPDATE;
   IF sh.id IS NOT NULL THEN
    IF sh.status<>'open' OR nullif(p_payload->>'shiftId','')::uuid IS DISTINCT FROM sh.id OR (r='cashier' AND sh.user_id<>auth.uid()) OR (p_payload ? 'shiftUserId' AND (p_payload->>'shiftUserId')::uuid IS DISTINCT FROM sh.user_id) THEN RAISE EXCEPTION 'تغيرت عهدة الوردية أو حالتها أنشئ طلبا محدثا'; END IF;
   ELSIF nullif(p_payload->>'shiftId','') IS NOT NULL OR (r='cashier' AND NOT EXISTS(SELECT 1 FROM public.cafes c JOIN public.bf_accounts a ON a.cafe_id=c.id WHERE c.id=p_cafe AND c.business_category='butcher_shops' AND a.id=aid AND a.is_cashier_drawer AND a.active)) THEN RAISE EXCEPTION 'اختر وردية مفتوحة تابعة للكاشير لصرف المرتجع النقدي'; END IF;
  ELSIF nullif(p_payload->>'shiftId','') IS NOT NULL THEN RAISE EXCEPTION 'الصرف من الوردية متاح للدفع النقدي فقط'; END IF;
 ELSE aid:=NULL;
 END IF;
 SELECT jsonb_agg(jsonb_build_object('lineId',l->>'id','name',l->>'name','quantity',(l->>'return_quantity')::numeric,'expectedReturnedQuantity',(l->>'returned_quantity')::numeric,'unitPrice',(l->>'unit_price')::numeric,'net',(l->>'return_net')::numeric,'tax',(l->>'return_tax')::numeric)) INTO selections FROM jsonb_array_elements(prepared) l;
 RETURN jsonb_build_object('deferStock',coalesce((p_payload->>'deferStock')::boolean,false),'documentId',original.id,'documentNumber',original.number,'lines',selections,'expectedTotal',total,'expectedPaid',paid,'paymentMethod',CASE WHEN paid>0 THEN p_payload->>'paymentMethod' ELSE NULL END,'accountId',aid,'shiftId',sh.id,'shiftUserId',sh.user_id,'note',left(p_payload->>'note',1000));
END $function$
;

CREATE OR REPLACE FUNCTION brand_finance_private.stock_move(p_cafe uuid, p_doc uuid, p_item uuid, p_warehouse uuid, p_quantity numeric, p_cost numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
 s public.bf_stock%ROWTYPE; doc public.bf_documents%ROWTYPE;
 movement_value numeric; next_value numeric; next_quantity numeric; covered numeric;
 released_value numeric; adjustment numeric:=0; basis_known boolean; incoming_known boolean:=true;
 status text; next_average numeric;
BEGIN
 IF p_quantity=0 OR p_quantity IS NULL OR p_cost<0 OR p_cost IS NULL
 OR p_quantity::text IN('NaN','Infinity','-Infinity') OR p_cost::text IN('NaN','Infinity','-Infinity')
 THEN RAISE EXCEPTION 'Invalid stock movement'; END IF;
 SELECT * INTO STRICT doc FROM public.bf_documents WHERE cafe_id=p_cafe AND id=p_doc;
 INSERT INTO public.bf_stock(cafe_id,warehouse_id,item_id) VALUES(p_cafe,p_warehouse,p_item) ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT s FROM public.bf_stock WHERE cafe_id=p_cafe AND warehouse_id=p_warehouse AND item_id=p_item FOR UPDATE;
 next_quantity:=s.quantity+p_quantity;
 IF p_quantity<0 AND next_quantity<0 AND doc.kind<>'sale' THEN
  RAISE EXCEPTION 'الكمية المتاحة في المخزون غير كافية لهذه العملية';
 END IF;
 basis_known:=s.cost_known;
 IF p_quantity<0 THEN
  movement_value:=CASE WHEN abs(p_quantity)=s.quantity THEN s.value ELSE round(abs(p_quantity)*s.average_cost,2) END;
  next_value:=s.value-movement_value;
  status:=CASE WHEN NOT basis_known THEN 'unknown' WHEN next_quantity<0 THEN 'estimated' ELSE 'known' END;
 ELSE
  -- A returned uncosted sale or transfer cannot invent a known cost basis.
  IF doc.kind='stock_adjust' AND EXISTS(SELECT 1 FROM public.bf_sales_return_stock WHERE cafe_id=p_cafe AND receipt_document_id=p_doc) THEN
   SELECT coalesce(bool_and(c.cost_status NOT IN('unknown','untracked') AND NOT(c.cost_status='legacy' AND c.cost=0)),false) INTO incoming_known
   FROM public.bf_sales_return_stock r CROSS JOIN LATERAL brand_finance_private.sales_return_components(r.cafe_id,r.return_id) c
   WHERE r.cafe_id=p_cafe AND r.receipt_document_id=p_doc AND c.item_id=p_item;
  ELSIF doc.kind='refund' THEN
   incoming_known:=NOT EXISTS(SELECT 1 FROM public.bf_document_lines l WHERE l.cafe_id=p_cafe
    AND l.document_id=doc.reference_id AND l.item_id=p_item
    AND NOT EXISTS(SELECT 1 FROM public.bf_line_components snapshot WHERE snapshot.cafe_id=l.cafe_id AND snapshot.line_id=l.id)
    AND (l.cost_status IN('unknown','untracked') OR (l.cost_status='legacy' AND l.cost=0))) AND NOT EXISTS(SELECT 1 FROM public.bf_line_components c JOIN public.bf_document_lines l ON l.cafe_id=c.cafe_id AND l.id=c.line_id WHERE c.cafe_id=p_cafe AND l.document_id=doc.reference_id AND c.item_id=p_item AND (c.cost_status='unknown' OR (c.cost_status='legacy' AND c.cost=0)));
  ELSIF doc.kind='stock_transfer' THEN
   incoming_known:=NOT EXISTS(SELECT 1 FROM public.bf_movements m WHERE m.cafe_id=p_cafe
    AND m.document_id=p_doc AND m.item_id=p_item AND m.quantity<0 AND m.cost_status='unknown');
  END IF;
  movement_value:=round(p_quantity*p_cost,2);
  next_value:=s.value+movement_value;
  IF s.quantity<0 THEN
   covered:=least(p_quantity,-s.quantity);
   released_value:=CASE WHEN covered=-s.quantity THEN -s.value ELSE round(-s.value*covered/(-s.quantity),2) END;
   -- Liability is cleared at its recorded basis; only remaining stock uses receipt cost.
   next_value:=s.value+released_value+round(greatest(next_quantity,0)*p_cost,2);
   adjustment:=movement_value-(next_value-s.value);
   -- Post current-period valuation correction, never rewrite the original sale.
   PERFORM brand_finance_private.line(p_cafe,p_doc,brand_finance_private.account(p_cafe,'5000'),greatest(adjustment,0),greatest(-adjustment,0));
   PERFORM brand_finance_private.line(p_cafe,p_doc,brand_finance_private.account(p_cafe,'1200'),greatest(-adjustment,0),greatest(adjustment,0));
  END IF;
  basis_known:=CASE WHEN next_quantity<0 THEN s.cost_known
   WHEN s.quantity>0 THEN s.cost_known AND incoming_known ELSE incoming_known END;
  status:=CASE WHEN incoming_known THEN 'known' ELSE 'unknown' END;
 END IF;
 next_average:=CASE WHEN next_quantity<>0 THEN next_value/next_quantity
  WHEN p_quantity>0 AND incoming_known THEN p_cost ELSE s.average_cost END;
 UPDATE public.bf_stock SET quantity=next_quantity,value=next_value,average_cost=next_average,cost_known=basis_known
 WHERE cafe_id=p_cafe AND warehouse_id=p_warehouse AND item_id=p_item;
 INSERT INTO public.bf_movements(cafe_id,document_id,item_id,warehouse_id,quantity,unit_cost,cost_status,valuation_adjustment)
 VALUES(p_cafe,p_doc,p_item,p_warehouse,p_quantity,movement_value/abs(p_quantity),status,adjustment);
 RETURN movement_value;
END $function$
;
NOTIFY pgrst,'reload schema';
COMMIT;
