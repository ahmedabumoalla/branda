BEGIN;
-- Inventory-only staff must not receive customer, sale, payment or financial data.
DO $baseline$ BEGIN
 IF md5(pg_get_functiondef('public.brand_finance_sales_return_stock(uuid,uuid,integer,text,uuid,text)'::regprocedure))<>'b15f15c4e81152fa2bbcdfd61dd30395' THEN RAISE EXCEPTION 'Unexpected sales return stock baseline';END IF;
END $baseline$;
CREATE OR REPLACE FUNCTION public.brand_finance_sales_return_stock(p_cafe_id uuid, p_id uuid, p_revision integer, p_operation text, p_request_id uuid, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE role_name text;s public.bf_sales_return_stock%ROWTYPE;d public.bf_documents%ROWTYPE;prior public.bf_requests%ROWTYPE;command jsonb;answer jsonb;receipt uuid:=gen_random_uuid();component record;cost numeric:=0;closed_date date;
BEGIN
 role_name:=brand_finance_private.role_for(p_cafe_id);
 IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','warehouse') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 IF p_id IS NULL OR p_revision IS NULL OR p_revision<1 OR p_request_id IS NULL OR p_operation IS NULL OR p_operation NOT IN('receive','reject') OR p_note IS NULL OR length(p_note)>500 THEN RAISE EXCEPTION 'Invalid stock request';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 command:=jsonb_build_object('id',p_id,'revision',p_revision,'operation',p_operation,'note',p_note);
 SELECT * INTO prior FROM public.bf_requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN IF prior.operation<>'sales_return_stock' OR prior.payload<>command OR prior.created_by<>auth.uid() THEN RAISE EXCEPTION 'Request identity conflict';END IF;RETURN CASE WHEN role_name='warehouse' THEN jsonb_build_object('id',prior.result->'id','stockStatus',prior.result->'stockStatus','stockRevision',prior.result->'stockRevision','stockDocumentId',prior.result->'stockDocumentId') ELSE prior.result END;END IF;
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
 IF role_name='warehouse' THEN
  SELECT jsonb_build_object('id',return_id,'stockStatus',status,'stockRevision',revision,'stockDocumentId',receipt_document_id) INTO answer FROM public.bf_sales_return_stock WHERE cafe_id=p_cafe_id AND return_id=p_id;
 ELSE answer:=brand_finance_private.sales_return_detail(d);END IF;
 INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by) VALUES(p_cafe_id,p_request_id,'sales_return_stock',command,answer,auth.uid());
 RETURN answer;
END $function$
;
REVOKE ALL ON FUNCTION public.brand_finance_sales_return_stock(uuid,uuid,integer,text,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_sales_return_stock(uuid,uuid,integer,text,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
