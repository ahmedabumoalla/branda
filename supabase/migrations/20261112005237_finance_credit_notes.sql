BEGIN;
-- Credit notes are separate from cash refunds; financial posting precedes optional stock receipt.
CREATE TABLE public.bf_credit_notes(
 id uuid PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id),number bigint GENERATED ALWAYS AS IDENTITY,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','issued','deleted')),
 stock_status text NOT NULL DEFAULT 'none' CHECK(stock_status IN('none','pending','received','rejected')),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=100000),
 party_id uuid,warehouse_id uuid,source_invoice_id uuid,source_number bigint,
 customer_name text NOT NULL,warehouse_name text NOT NULL,salesperson_name text NOT NULL DEFAULT '',created_by_name text NOT NULL,
 lines jsonb NOT NULL CHECK(jsonb_typeof(lines)='array'),
 subtotal numeric(16,2) NOT NULL CHECK(subtotal>=0 AND subtotal<>'NaN'),discount numeric(16,2) NOT NULL CHECK(discount>=0 AND discount<>'NaN'),
 tax numeric(16,2) NOT NULL CHECK(tax>=0 AND tax<>'NaN'),total numeric(16,2) NOT NULL CHECK(total>=0 AND total<>'NaN'),
 journal_id uuid,stock_document_id uuid,created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),issued_at timestamptz,
 UNIQUE(cafe_id,id),FOREIGN KEY(cafe_id,party_id) REFERENCES public.bf_parties(cafe_id,id),
 FOREIGN KEY(cafe_id,warehouse_id) REFERENCES public.bf_warehouses(cafe_id,id),
 FOREIGN KEY(cafe_id,source_invoice_id) REFERENCES public.bf_documents(cafe_id,id),
 FOREIGN KEY(cafe_id,journal_id) REFERENCES public.bf_documents(cafe_id,id),
 FOREIGN KEY(cafe_id,stock_document_id) REFERENCES public.bf_documents(cafe_id,id),
 CHECK((status='issued')=(journal_id IS NOT NULL)),CHECK((stock_status='received')=(stock_document_id IS NOT NULL))
);
CREATE INDEX bf_credit_notes_list ON public.bf_credit_notes(cafe_id,created_at DESC,id);
CREATE INDEX bf_credit_notes_party ON public.bf_credit_notes(cafe_id,party_id);
CREATE INDEX bf_credit_notes_source ON public.bf_credit_notes(cafe_id,source_invoice_id);
CREATE INDEX bf_credit_notes_actor ON public.bf_credit_notes(created_by);
CREATE INDEX bf_credit_notes_warehouse ON public.bf_credit_notes(cafe_id,warehouse_id);
CREATE INDEX bf_credit_notes_journal ON public.bf_credit_notes(cafe_id,journal_id);
CREATE INDEX bf_credit_notes_stock_doc ON public.bf_credit_notes(cafe_id,stock_document_id);
CREATE TABLE public.bf_credit_note_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,note_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN('create','edit','issue','receive','reject','delete')),
 actor_id uuid NOT NULL REFERENCES auth.users(id),actor_name text NOT NULL,note text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(cafe_id,note_id) REFERENCES public.bf_credit_notes(cafe_id,id)
);
CREATE INDEX bf_credit_note_events_note ON public.bf_credit_note_events(cafe_id,note_id,created_at,id);
CREATE INDEX bf_credit_note_events_actor ON public.bf_credit_note_events(actor_id);
ALTER TABLE public.bf_credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bf_credit_note_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_credit_notes,public.bf_credit_note_events FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.bf_credit_notes_number_seq FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.bf_credit_note_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
-- Keep customer-credit application/refund APIs unchanged; add an explicit, auditable credit source.
DO $$DECLARE c record;BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.bf_customer_credit_events'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%action%' LOOP
  EXECUTE format('ALTER TABLE public.bf_customer_credit_events DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE public.bf_customer_credit_events ADD CHECK(action IN('receive','refund','apply','unapply','credit_note')),
 ADD CHECK(delta=CASE WHEN action IN('receive','unapply','credit_note') THEN amount ELSE -amount END);

CREATE FUNCTION brand_finance_private.credit_note_actor(cafe uuid) RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce((SELECT name FROM public.bf_staff WHERE cafe_id=cafe AND user_id=auth.uid()),'مالك العلامة')
$$;
CREATE FUNCTION brand_finance_private.credit_note_record(n public.bf_credit_notes,detail boolean DEFAULT true) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',n.id,'number',n.number,'revision',n.revision,'status',n.status,'stockStatus',n.stock_status,
 'payload',n.payload,'customerName',n.customer_name,'warehouseName',n.warehouse_name,'salespersonName',n.salesperson_name,'createdByName',n.created_by_name,
 'sourceNumber',n.source_number,'createdAt',n.created_at,'updatedAt',n.updated_at,'issuedAt',n.issued_at,
 'subtotal',n.subtotal,'discount',n.discount,'tax',n.tax,'total',n.total,'journalId',n.journal_id,'stockDocumentId',n.stock_document_id,'lines',CASE WHEN detail THEN n.lines ELSE '[]'::jsonb END,
 'events',CASE WHEN detail THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'actorName',e.actor_name,'createdAt',e.created_at,'note',e.note) ORDER BY e.created_at,e.id) FROM public.bf_credit_note_events e WHERE e.cafe_id=n.cafe_id AND e.note_id=n.id),'[]'::jsonb) ELSE '[]'::jsonb END)
$$;
CREATE FUNCTION brand_finance_private.credit_note_validate(cafe uuid,p jsonb,strict_refs boolean) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE e jsonb;rows jsonb:='[]';result_rows jsonb:='[]';prod public.menu_products%ROWTYPE;item public.bf_items%ROWTYPE;
 customer_name text:='';warehouse_name text:='';salesperson_name text:='';source public.bf_documents%ROWTYPE;
 qty numeric;price numeric;rate numeric;gross numeric;disc numeric;value numeric;after_row numeric;subtotal numeric:=0;after_rows numeric:=0;
 doc_discount numeric;remaining numeric;base_left numeric;allocated numeric;taxable numeric;row_tax numeric;row_total numeric;tax numeric:=0;total numeric:=0;cost numeric;cost_known boolean;inclusive boolean;k text;components jsonb;component record;
BEGIN
 IF p IS NULL OR jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>100000 OR p::text ~* '"[-+]?(nan|infinity)"'
 OR jsonb_typeof(p->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'lines') NOT BETWEEN 1 AND 100
 OR coalesce(p->>'template','') NOT IN('standard','thermal') OR coalesce(p->>'deliveryMethod','')<>'print'
 OR jsonb_typeof(p->'taxInclusive') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p->'stockRequired') IS DISTINCT FROM 'boolean'
 OR coalesce(p->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' OR coalesce(p->>'issueDate','') !~ '^\d{4}-\d{2}-\d{2}$'
 OR NOT isfinite((p->>'date')::date) OR NOT isfinite((p->>'issueDate')::date)
 OR coalesce(p->>'discountKind','') NOT IN('amount','percent') THEN RAISE EXCEPTION 'راجع بيانات الإشعار الدائن' USING ERRCODE='22023';END IF;
 FOREACH k IN ARRAY ARRAY['reason','note','terms'] LOOP
  IF jsonb_typeof(p->k) IS DISTINCT FROM 'string' OR length(p->>k)>(CASE k WHEN 'terms' THEN 3000 WHEN 'note' THEN 1000 ELSE 500 END) THEN RAISE EXCEPTION 'راجع نص الإشعار';END IF;
 END LOOP;
 IF strict_refs AND length(trim(p->>'reason'))=0 THEN RAISE EXCEPTION 'حدد سبب إصدار الإشعار الدائن';END IF;
 IF nullif(p->>'partyId','') IS NOT NULL THEN
  SELECT name INTO customer_name FROM public.bf_parties WHERE cafe_id=cafe AND id::text=p->>'partyId' AND kind='customer' AND (NOT strict_refs OR active);
  IF NOT FOUND THEN RAISE EXCEPTION 'اختر عميلًا متاحًا للعلامة';END IF;
 ELSIF strict_refs THEN RAISE EXCEPTION 'اختر العميل';END IF;
 IF nullif(p->>'warehouseId','') IS NOT NULL THEN
  SELECT name INTO warehouse_name FROM public.bf_warehouses WHERE cafe_id=cafe AND id::text=p->>'warehouseId' AND (NOT strict_refs OR active);
  IF NOT FOUND THEN RAISE EXCEPTION 'اختر مستودعًا متاحًا للعلامة';END IF;
 ELSIF strict_refs AND (p->>'stockRequired')::boolean THEN RAISE EXCEPTION 'اختر المستودع لاستلام المنتجات';END IF;
 IF p->>'sourceInvoiceId' IS NOT NULL THEN
  SELECT * INTO source FROM public.bf_documents WHERE cafe_id=cafe AND id::text=p->>'sourceInvoiceId' AND kind='sale' AND party_id::text=p->>'partyId';
  IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة المرجعية لا تخص هذا العميل';END IF;
 END IF;
 IF p->>'salespersonId' IS NOT NULL THEN
  SELECT name INTO salesperson_name FROM public.bf_staff WHERE cafe_id=cafe AND user_id::text=p->>'salespersonId' AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'مسؤول المبيعات غير متاح';END IF;
 END IF;
 inclusive:=(p->>'taxInclusive')::boolean;
 IF NOT brand_finance_private.invoice_number_valid(p->'vatRate',0,100,2) OR NOT brand_finance_private.invoice_number_valid(p->'discountValue',0,1000000000,2) THEN RAISE EXCEPTION 'راجع الضريبة والخصم';END IF;
 FOR e IN SELECT x.value FROM jsonb_array_elements(p->'lines') x LOOP
  prod:=NULL;item:=NULL;cost:=0;cost_known:=false;components:='[]'::jsonb;
  IF jsonb_typeof(e) IS DISTINCT FROM 'object' OR NOT brand_finance_private.invoice_number_valid(e->'quantity',0.001,9999,3) OR NOT brand_finance_private.invoice_number_valid(e->'price',0,10000000,2)
   OR length(coalesce(e->>'description',''))>500 OR coalesce(e->>'discountKind','amount') NOT IN('amount','percent')
   OR (e ? 'discount' AND NOT brand_finance_private.invoice_number_valid(e->'discount',0,1000000000,2))
   OR (e ? 'vatRate' AND NOT brand_finance_private.invoice_number_valid(e->'vatRate',0,100,2)) THEN RAISE EXCEPTION 'راجع أسعار وكميات وخصومات البنود';END IF;
  IF nullif(e->>'productId','') IS NOT NULL THEN
   SELECT * INTO prod FROM public.menu_products WHERE cafe_id=cafe AND id::text=e->>'productId' AND deleted_at IS NULL;
   IF NOT FOUND THEN RAISE EXCEPTION 'الصنف غير متاح للعلامة';END IF;
   SELECT * INTO item FROM public.bf_items WHERE cafe_id=cafe AND menu_product_id=prod.id AND active;
   SELECT coalesce(st.average_cost,0),st.cost_known INTO cost,cost_known FROM public.bf_stock st WHERE cafe_id=cafe AND warehouse_id::text=p->>'warehouseId' AND item_id=item.id;
  ELSIF strict_refs THEN RAISE EXCEPTION 'حدد الصنف في كل بند';END IF;
  qty:=(e->>'quantity')::numeric;price:=(e->>'price')::numeric;rate:=coalesce((e->>'vatRate')::numeric,(p->>'vatRate')::numeric);gross:=round(qty*price,2);value:=coalesce((e->>'discount')::numeric,0);
  IF e->>'discountKind'='percent' AND value>100 THEN RAISE EXCEPTION 'نسبة الخصم تتجاوز ١٠٠';END IF;
  disc:=round(CASE WHEN e->>'discountKind'='percent' THEN gross*value/100 ELSE value END,2);
  IF disc>gross THEN RAISE EXCEPTION 'خصم البند أكبر من قيمته';END IF;
  FOR component IN
   SELECT i.id, l.quantity factor,coalesce(st.average_cost,0) unit_cost,coalesce(st.cost_known,false) cost_known FROM public.bf_item_product_links l JOIN public.bf_items i ON i.cafe_id=l.cafe_id AND i.id=l.item_id AND i.active LEFT JOIN public.bf_stock st ON st.cafe_id=i.cafe_id AND st.item_id=i.id AND st.warehouse_id::text=p->>'warehouseId' WHERE l.cafe_id=cafe AND l.product_id=prod.id
   UNION ALL SELECT item.id,1,coalesce(cost,0),coalesce(cost_known,false) WHERE item.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bf_item_product_links l WHERE l.cafe_id=cafe AND l.product_id=prod.id)
  LOOP
   IF strict_refs AND (p->>'stockRequired')::boolean AND NOT component.cost_known THEN RAISE EXCEPTION '??? ????? ?????? ?????? ??? ???? ??? ????? ??? ????????';END IF;
   IF qty*component.factor<>round(qty*component.factor,3) THEN RAISE EXCEPTION '???? ?????? ????? ??? ?? ???? ???????';END IF;
   components:=components||jsonb_build_array(jsonb_build_object('itemId',component.id,'quantity',qty*component.factor,'unitCost',component.unit_cost,'costKnown',component.cost_known));
  END LOOP;
  IF strict_refs AND (p->>'stockRequired')::boolean AND jsonb_array_length(components)=0 THEN RAISE EXCEPTION '?? ??? ???????? ??? ?? ???? ??????? ???? ????? ???';END IF;
  after_row:=gross-disc;subtotal:=subtotal+gross;after_rows:=after_rows+after_row;
  rows:=rows||jsonb_build_array(jsonb_build_object('productId',coalesce(e->>'productId',''),'name',coalesce(prod.name,''),'description',coalesce(e->>'description',''),'itemId',item.id,'unitCost',coalesce(cost,0),'components',components,'quantity',qty,'price',price,'rowDiscount',disc,'after',after_row,'vatRate',rate));
 END LOOP;
 value:=(p->>'discountValue')::numeric;
 IF p->>'discountKind'='percent' AND value>100 THEN RAISE EXCEPTION 'راجع نسبة خصم الإشعار';END IF;
 doc_discount:=round(CASE WHEN p->>'discountKind'='percent' THEN after_rows*value/100 ELSE value END,2);
 IF doc_discount>after_rows THEN RAISE EXCEPTION 'خصم الإشعار أكبر من قيمته';END IF;
 remaining:=doc_discount;base_left:=after_rows;
 FOR e IN SELECT x.value FROM jsonb_array_elements(rows) x LOOP
  after_row:=(e->>'after')::numeric;rate:=(e->>'vatRate')::numeric;allocated:=least(after_row,remaining,CASE WHEN base_left=0 THEN 0 ELSE round(remaining*after_row/base_left,2) END);
  remaining:=remaining-allocated;base_left:=base_left-after_row;taxable:=after_row-allocated;
  row_tax:=round(CASE WHEN inclusive THEN taxable-taxable/(1+rate/100) ELSE taxable*rate/100 END,2);row_total:=CASE WHEN inclusive THEN taxable ELSE taxable+row_tax END;
  tax:=tax+row_tax;total:=total+row_total;
  result_rows:=result_rows||jsonb_build_array((e-'after'-'rowDiscount')||jsonb_build_object('discount',(e->>'rowDiscount')::numeric+allocated,'net',row_total-row_tax,'tax',row_tax,'total',row_total));
 END LOOP;
 IF total>1000000000 OR (strict_refs AND total<=0) THEN RAISE EXCEPTION 'إجمالي الإشعار يجب أن يكون أكبر من صفر';END IF;
 IF strict_refs AND (p->>'stockRequired')::boolean AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result_rows) x WHERE jsonb_array_length(x->'components')>0) THEN RAISE EXCEPTION 'لا توجد أصناف مخزنية لاستلامها';END IF;
 RETURN jsonb_build_object('customerName',coalesce(customer_name,''),'warehouseName',coalesce(warehouse_name,''),'salespersonName',coalesce(salesperson_name,''),'sourceNumber',source.number,'lines',result_rows,'subtotal',subtotal,'discount',subtotal-after_rows+doc_discount,'tax',tax,'total',total);
END $$;

CREATE FUNCTION public.brand_finance_credit_notes(p_cafe_id uuid,p_id uuid DEFAULT NULL,p_filters jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text;filter_party uuid;filter_status text;query_value text;date_from date;date_to date;off integer;lim integer;answer jsonb;total_count bigint;
BEGIN
 role_name:=brand_finance_private.role_for(p_cafe_id);
 IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant','auditor','warehouse') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 IF p_id IS NOT NULL THEN RETURN (SELECT brand_finance_private.credit_note_record(n) FROM public.bf_credit_notes n WHERE cafe_id=p_cafe_id AND id=p_id AND status<>'deleted');END IF;
 IF jsonb_typeof(p_filters) IS DISTINCT FROM 'object' OR octet_length(p_filters::text)>2000 THEN RAISE EXCEPTION 'Invalid filters';END IF;
 filter_party:=nullif(p_filters->>'partyId','')::uuid;filter_status:=p_filters->>'status';query_value:=lower(trim(coalesce(p_filters->>'query','')));
 date_from:=nullif(p_filters->>'from','')::date;date_to:=nullif(p_filters->>'to','')::date;off:=coalesce((p_filters->>'offset')::integer,0);lim:=coalesce((p_filters->>'limit')::integer,30);
 IF off NOT BETWEEN 0 AND 100000 OR lim NOT BETWEEN 1 AND 100 OR length(query_value)>100 OR (filter_status IS NOT NULL AND filter_status NOT IN('draft','issued')) THEN RAISE EXCEPTION 'Invalid filters';END IF;
 SELECT count(*) INTO total_count FROM public.bf_credit_notes n WHERE cafe_id=p_cafe_id AND status<>'deleted' AND (filter_party IS NULL OR party_id=filter_party) AND (filter_status IS NULL OR status=filter_status) AND (date_from IS NULL OR (payload->>'date')::date>=date_from) AND (date_to IS NULL OR (payload->>'date')::date<=date_to) AND (query_value='' OR position(query_value in lower(customer_name||' '||number::text||' '||coalesce(source_number::text,'')))>0);
 SELECT coalesce(jsonb_agg(brand_finance_private.credit_note_record(n,false) ORDER BY created_at DESC,id),'[]'::jsonb) INTO answer FROM (SELECT * FROM public.bf_credit_notes WHERE cafe_id=p_cafe_id AND status<>'deleted' AND (filter_party IS NULL OR party_id=filter_party) AND (filter_status IS NULL OR status=filter_status) AND (date_from IS NULL OR (payload->>'date')::date>=date_from) AND (date_to IS NULL OR (payload->>'date')::date<=date_to) AND (query_value='' OR position(query_value in lower(customer_name||' '||number::text||' '||coalesce(source_number::text,'')))>0) ORDER BY created_at DESC,id LIMIT lim OFFSET off) n;
 RETURN jsonb_build_object('items',answer,'total',total_count,'offset',off,'limit',lim);
END $$;
CREATE FUNCTION public.brand_finance_save_credit_note(p_cafe_id uuid,p_id uuid,p_revision integer,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n public.bf_credit_notes%ROWTYPE;v jsonb;operation text;
BEGIN
 IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 IF p_id IS NULL OR p_revision IS NULL OR p_revision<0 THEN RAISE EXCEPTION 'Invalid identity';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 v:=brand_finance_private.credit_note_validate(p_cafe_id,p_payload,false);
 SELECT * INTO n FROM public.bf_credit_notes WHERE id=p_id FOR UPDATE;
 IF FOUND THEN
  IF n.cafe_id<>p_cafe_id THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
  IF n.status<>'draft' THEN RAISE EXCEPTION 'الإشعار الصادر ثابت ولا يمكن تعديل أثره المالي';END IF;
  IF n.payload=p_payload THEN RETURN brand_finance_private.credit_note_record(n);END IF;
  IF n.revision<>p_revision THEN RAISE EXCEPTION 'تغير الإشعار افتح النسخة المحفوظة' USING ERRCODE='40001';END IF;
  UPDATE public.bf_credit_notes SET payload=p_payload,revision=revision+1,updated_at=clock_timestamp(),party_id=nullif(p_payload->>'partyId','')::uuid,warehouse_id=nullif(p_payload->>'warehouseId','')::uuid,source_invoice_id=(p_payload->>'sourceInvoiceId')::uuid,source_number=(v->>'sourceNumber')::bigint,customer_name=v->>'customerName',warehouse_name=v->>'warehouseName',salesperson_name=v->>'salespersonName',lines=v->'lines',subtotal=(v->>'subtotal')::numeric,discount=(v->>'discount')::numeric,tax=(v->>'tax')::numeric,total=(v->>'total')::numeric WHERE id=p_id RETURNING * INTO n;
  operation:='edit';
 ELSE
  IF p_revision<>0 THEN RAISE EXCEPTION 'تغير الإشعار' USING ERRCODE='40001';END IF;
  INSERT INTO public.bf_credit_notes(id,cafe_id,payload,party_id,warehouse_id,source_invoice_id,source_number,customer_name,warehouse_name,salesperson_name,created_by_name,lines,subtotal,discount,tax,total,created_by) VALUES(p_id,p_cafe_id,p_payload,nullif(p_payload->>'partyId','')::uuid,nullif(p_payload->>'warehouseId','')::uuid,(p_payload->>'sourceInvoiceId')::uuid,(v->>'sourceNumber')::bigint,v->>'customerName',v->>'warehouseName',v->>'salespersonName',brand_finance_private.credit_note_actor(p_cafe_id),v->'lines',(v->>'subtotal')::numeric,(v->>'discount')::numeric,(v->>'tax')::numeric,(v->>'total')::numeric,auth.uid()) RETURNING * INTO n;
  operation:='create';
 END IF;
 INSERT INTO public.bf_credit_note_events(cafe_id,note_id,action,actor_id,actor_name) VALUES(p_cafe_id,p_id,operation,auth.uid(),brand_finance_private.credit_note_actor(p_cafe_id));
 RETURN brand_finance_private.credit_note_record(n);
END $$;
CREATE FUNCTION brand_finance_private.credit_refund_cap() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE credited numeric;refunded numeric;original_total numeric;
BEGIN
 IF NEW.kind='refund' AND NEW.reference_id IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.cafe_id::text,60412));
  SELECT coalesce(sum(total),0) INTO credited FROM public.bf_credit_notes WHERE cafe_id=NEW.cafe_id AND source_invoice_id=NEW.reference_id AND status='issued';
  IF credited>0 THEN
   SELECT total INTO original_total FROM public.bf_documents WHERE cafe_id=NEW.cafe_id AND id=NEW.reference_id;
   SELECT coalesce(sum(total),0) INTO refunded FROM public.bf_documents WHERE cafe_id=NEW.cafe_id AND reference_id=NEW.reference_id AND kind='refund';
   IF credited+refunded+NEW.total>original_total THEN RAISE EXCEPTION 'سبق تعويض جزء من الفاتورة بإشعار دائن راجع المبلغ المتبقي';END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER credit_refund_cap BEFORE INSERT ON public.bf_documents FOR EACH ROW EXECUTE FUNCTION brand_finance_private.credit_refund_cap();
CREATE FUNCTION brand_finance_private.credit_refund_line_cap() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE source uuid;credited numeric;refunded numeric;sold numeric;
BEGIN
 SELECT reference_id INTO source FROM public.bf_documents WHERE cafe_id=NEW.cafe_id AND id=NEW.document_id AND kind='refund';
 IF source IS NOT NULL AND NEW.product_id IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.cafe_id::text,60412));
  SELECT coalesce(sum((line->>'quantity')::numeric),0) INTO credited FROM public.bf_credit_notes n CROSS JOIN LATERAL jsonb_array_elements(n.lines) line WHERE n.cafe_id=NEW.cafe_id AND n.source_invoice_id=source AND n.status='issued' AND (n.payload->>'stockRequired')::boolean AND line->>'productId'=NEW.product_id::text;
  IF credited>0 THEN
   SELECT coalesce(sum(quantity),0) INTO sold FROM public.bf_document_lines WHERE cafe_id=NEW.cafe_id AND document_id=source AND product_id=NEW.product_id;
   SELECT coalesce(sum(l.quantity),0) INTO refunded FROM public.bf_document_lines l JOIN public.bf_documents d ON d.cafe_id=l.cafe_id AND d.id=l.document_id WHERE d.cafe_id=NEW.cafe_id AND d.reference_id=source AND d.kind='refund' AND l.product_id=NEW.product_id;
   IF credited+refunded+NEW.quantity>sold THEN RAISE EXCEPTION 'سبق استلام كمية الصنف بإشعار دائن';END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER credit_refund_line_cap BEFORE INSERT ON public.bf_document_lines FOR EACH ROW EXECUTE FUNCTION brand_finance_private.credit_refund_line_cap();

CREATE FUNCTION public.brand_finance_transition_credit_note(p_cafe_id uuid,p_id uuid,p_revision integer,p_operation text,p_request_id uuid,p_note text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n public.bf_credit_notes%ROWTYPE;role_name text;request public.bf_requests%ROWTYPE;command jsonb;answer jsonb;v jsonb;e jsonb;d uuid:=gen_random_uuid();aid uuid;cost numeric:=0;source public.bf_documents%ROWTYPE;credited numeric;refunded numeric;closed_date date;product_line record;sold numeric;
BEGIN
 role_name:=brand_finance_private.role_for(p_cafe_id);
 IF auth.uid() IS NULL OR p_operation IS NULL OR p_operation NOT IN('issue','receive','reject','delete') OR p_request_id IS NULL OR p_id IS NULL OR p_revision IS NULL OR p_revision<1 OR p_note IS NULL OR length(p_note)>500 THEN RAISE EXCEPTION 'Invalid credit-note operation';END IF;
 IF (p_operation IN('receive','reject') AND coalesce(role_name,'') NOT IN('owner','manager','warehouse')) OR (p_operation IN('issue','delete') AND coalesce(role_name,'') NOT IN('owner','manager','accountant')) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 command:=jsonb_build_object('id',p_id,'revision',p_revision,'operation',p_operation,'note',p_note);
 SELECT * INTO request FROM public.bf_requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN
  IF request.operation<>'credit_note' OR request.payload<>command OR request.created_by<>auth.uid() THEN RAISE EXCEPTION 'Request identity conflict';END IF;
  RETURN request.result;
 END IF;
 SELECT * INTO n FROM public.bf_credit_notes WHERE cafe_id=p_cafe_id AND id=p_id FOR UPDATE;
 IF NOT FOUND OR n.status='deleted' THEN RAISE EXCEPTION 'الإشعار غير متاح';END IF;
 IF n.revision<>p_revision THEN RAISE EXCEPTION 'تغير الإشعار افتح النسخة المحفوظة' USING ERRCODE='40001';END IF;
 IF p_operation='delete' THEN
  IF n.status<>'draft' THEN RAISE EXCEPTION 'لا يمكن حذف إشعار صدر أثره المالي';END IF;
  UPDATE public.bf_credit_notes SET status='deleted',revision=revision+1,updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO n;
 ELSIF p_operation='issue' THEN
  IF n.status<>'draft' THEN RAISE EXCEPTION 'سبق إصدار الإشعار';END IF;
  v:=brand_finance_private.credit_note_validate(p_cafe_id,n.payload,true);
  SELECT closed_through INTO closed_date FROM public.bf_settings WHERE cafe_id=p_cafe_id;
  IF closed_date IS NOT NULL AND (least((n.payload->>'date')::date,(n.payload->>'issueDate')::date)<=closed_date OR (now() AT TIME ZONE 'Asia/Riyadh')::date<=closed_date) THEN RAISE EXCEPTION 'الفترة المحاسبية مقفلة';END IF;
  IF n.source_invoice_id IS NOT NULL THEN
   SELECT * INTO source FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=n.source_invoice_id FOR UPDATE;
   SELECT coalesce(sum(total),0) INTO credited FROM public.bf_credit_notes WHERE cafe_id=p_cafe_id AND source_invoice_id=n.source_invoice_id AND status='issued';
   SELECT coalesce(sum(total),0) INTO refunded FROM public.bf_documents WHERE cafe_id=p_cafe_id AND reference_id=n.source_invoice_id AND kind='refund';
   IF (v->>'total')::numeric+credited+refunded>source.total THEN RAISE EXCEPTION 'قيمة الإشعار تتجاوز المتبقي بعد المرتجعات والإشعارات السابقة';END IF;
   IF (n.payload->>'stockRequired')::boolean THEN
    FOR product_line IN SELECT x->>'productId' product_id,sum((x->>'quantity')::numeric) quantity FROM jsonb_array_elements(v->'lines') x GROUP BY x->>'productId' LOOP
     SELECT coalesce(sum(quantity),0) INTO sold FROM public.bf_document_lines WHERE cafe_id=p_cafe_id AND document_id=source.id AND product_id::text=product_line.product_id;
     SELECT coalesce(sum(l.quantity),0) INTO refunded FROM public.bf_document_lines l JOIN public.bf_documents d ON d.cafe_id=l.cafe_id AND d.id=l.document_id WHERE d.cafe_id=p_cafe_id AND d.reference_id=source.id AND d.kind='refund' AND l.product_id::text=product_line.product_id;
     SELECT coalesce(sum((x->>'quantity')::numeric),0) INTO credited FROM public.bf_credit_notes c CROSS JOIN LATERAL jsonb_array_elements(c.lines) x WHERE c.cafe_id=p_cafe_id AND c.source_invoice_id=source.id AND c.status='issued' AND (c.payload->>'stockRequired')::boolean AND x->>'productId'=product_line.product_id;
     IF credited+refunded+product_line.quantity>sold THEN RAISE EXCEPTION 'كمية الإشعار تتجاوز الكمية المتبقية من الفاتورة';END IF;
    END LOOP;
   END IF;
  END IF;
  aid:=brand_finance_private.customer_credit_account(p_cafe_id);
  INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,subtotal,discount,tax,total,note,created_by) VALUES(d,p_cafe_id,'journal',n.party_id,(v->>'subtotal')::numeric,(v->>'discount')::numeric,(v->>'tax')::numeric,(v->>'total')::numeric,left('إشعار دائن '||n.number||' - '||(n.payload->>'reason'),1000),auth.uid());
  PERFORM brand_finance_private.invoice_line(p_cafe_id,d,brand_finance_private.account(p_cafe_id,'4000'),(v->>'total')::numeric-(v->>'tax')::numeric,0,n.party_id,'إشعار دائن');
  PERFORM brand_finance_private.invoice_line(p_cafe_id,d,brand_finance_private.account(p_cafe_id,'2100'),(v->>'tax')::numeric,0,n.party_id,'ضريبة الإشعار الدائن');
  PERFORM brand_finance_private.invoice_line(p_cafe_id,d,aid,0,(v->>'total')::numeric,n.party_id,'رصيد إشعار دائن');
  INSERT INTO public.bf_customer_credit_events(cafe_id,party_id,document_id,invoice_id,action,amount,delta,created_by) VALUES(p_cafe_id,n.party_id,d,n.source_invoice_id,'credit_note',(v->>'total')::numeric,(v->>'total')::numeric,auth.uid());
  UPDATE public.bf_credit_notes SET status='issued',stock_status=CASE WHEN (payload->>'stockRequired')::boolean THEN 'pending' ELSE 'none' END,journal_id=d,issued_at=clock_timestamp(),updated_at=clock_timestamp(),revision=revision+1,lines=v->'lines',subtotal=(v->>'subtotal')::numeric,discount=(v->>'discount')::numeric,tax=(v->>'tax')::numeric,total=(v->>'total')::numeric WHERE id=p_id RETURNING * INTO n;
 ELSE
  IF n.status<>'issued' OR n.stock_status<>'pending' THEN RAISE EXCEPTION 'الإذن المخزني ليس بانتظار الاستلام';END IF;
  IF p_operation='reject' THEN
   IF length(trim(p_note))=0 THEN RAISE EXCEPTION 'حدد سبب رفض الاستلام';END IF;
   UPDATE public.bf_credit_notes SET stock_status='rejected',revision=revision+1,updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO n;
  ELSE
   SELECT closed_through INTO closed_date FROM public.bf_settings WHERE cafe_id=p_cafe_id;
   IF closed_date IS NOT NULL AND (now() AT TIME ZONE 'Asia/Riyadh')::date<=closed_date THEN RAISE EXCEPTION 'الفترة المحاسبية مقفلة';END IF;
   IF NOT EXISTS(SELECT 1 FROM public.bf_warehouses WHERE cafe_id=p_cafe_id AND id=n.warehouse_id AND active) THEN RAISE EXCEPTION 'المستودع غير متاح';END IF;
   INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,warehouse_id,note,created_by) VALUES(d,p_cafe_id,'stock_adjust',n.party_id,n.warehouse_id,'استلام أصناف إشعار دائن '||n.number,auth.uid());
   FOR e IN SELECT component.value FROM jsonb_array_elements(n.lines) line CROSS JOIN LATERAL jsonb_array_elements(line->'components') component LOOP
    IF e->>'itemId' IS NOT NULL THEN
     IF NOT EXISTS(SELECT 1 FROM public.bf_items WHERE cafe_id=p_cafe_id AND id=(e->>'itemId')::uuid AND active) THEN RAISE EXCEPTION 'أحد الأصناف المخزنية غير نشط';END IF;
     cost:=cost+brand_finance_private.stock_move(p_cafe_id,d,(e->>'itemId')::uuid,n.warehouse_id,(e->>'quantity')::numeric,(e->>'unitCost')::numeric);
    END IF;
   END LOOP;
   PERFORM brand_finance_private.invoice_line(p_cafe_id,d,brand_finance_private.account(p_cafe_id,'1200'),cost,0,n.party_id,'استلام أصناف إشعار دائن');
   PERFORM brand_finance_private.invoice_line(p_cafe_id,d,brand_finance_private.account(p_cafe_id,'5000'),0,cost,n.party_id,'عكس تكلفة أصناف مستلمة');
   UPDATE public.bf_credit_notes SET stock_status='received',stock_document_id=d,revision=revision+1,updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO n;
  END IF;
 END IF;
 INSERT INTO public.bf_credit_note_events(cafe_id,note_id,action,actor_id,actor_name,note) VALUES(p_cafe_id,p_id,p_operation,auth.uid(),brand_finance_private.credit_note_actor(p_cafe_id),p_note);
 answer:=brand_finance_private.credit_note_record(n);
 INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by) VALUES(p_cafe_id,p_request_id,'credit_note',command,answer,auth.uid());
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.credit_note_actor(uuid),brand_finance_private.credit_note_record(public.bf_credit_notes,boolean),brand_finance_private.credit_note_validate(uuid,jsonb,boolean),brand_finance_private.credit_refund_cap(),brand_finance_private.credit_refund_line_cap() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.brand_finance_credit_notes(uuid,uuid,jsonb),public.brand_finance_save_credit_note(uuid,uuid,integer,jsonb),public.brand_finance_transition_credit_note(uuid,uuid,integer,text,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_credit_notes(uuid,uuid,jsonb),public.brand_finance_save_credit_note(uuid,uuid,integer,jsonb),public.brand_finance_transition_credit_note(uuid,uuid,integer,text,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
