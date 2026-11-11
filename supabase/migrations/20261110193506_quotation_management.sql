BEGIN;

-- Quotes never create ledger, stock, payment or outbound-message records
CREATE TABLE public.bf_quotes (
 id uuid PRIMARY KEY,
 cafe_id uuid NOT NULL REFERENCES public.cafes(id),
 number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=100000),
 customer_name text NOT NULL DEFAULT '', warehouse_name text NOT NULL DEFAULT '',
 lines jsonb NOT NULL DEFAULT '[]',
 subtotal numeric(18,2) NOT NULL DEFAULT 0, discount numeric(18,2) NOT NULL DEFAULT 0,
 tax numeric(18,2) NOT NULL DEFAULT 0, total numeric(18,2) NOT NULL DEFAULT 0,
 invoice_draft_id uuid UNIQUE REFERENCES public.bf_invoice_drafts(id),
 created_by uuid NOT NULL REFERENCES auth.users(id), updated_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bf_quotes_cafe_updated ON public.bf_quotes(cafe_id,updated_at DESC,id);
CREATE INDEX bf_quotes_created_by ON public.bf_quotes(created_by);
CREATE INDEX bf_quotes_updated_by ON public.bf_quotes(updated_by);
ALTER TABLE public.bf_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_quotes FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.bf_quotes_number_seq FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION brand_finance_private.quote_record(q public.bf_quotes) RETURNS jsonb
 LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',q.id,'number',q.number,'revision',q.revision,'payload',q.payload,
  'customerName',q.customer_name,'warehouseName',q.warehouse_name,'lines',q.lines,
  'subtotal',q.subtotal,'discount',q.discount,'tax',q.tax,'total',q.total,
  'invoiceDraftId',q.invoice_draft_id,'createdAt',q.created_at,'updatedAt',q.updated_at)
$$;
REVOKE ALL ON FUNCTION brand_finance_private.quote_record(public.bf_quotes) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.brand_finance_quotes(p_cafe_id uuid,p_id uuid DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN ('owner','manager','accountant') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_id IS NOT NULL THEN RETURN (SELECT brand_finance_private.quote_record(q) FROM public.bf_quotes q WHERE cafe_id=p_cafe_id AND id=p_id); END IF;
 RETURN (SELECT coalesce(jsonb_agg(brand_finance_private.quote_record(q) ORDER BY q.updated_at DESC,q.id),'[]')
  FROM (SELECT * FROM public.bf_quotes WHERE cafe_id=p_cafe_id ORDER BY updated_at DESC,id LIMIT 500) q);
END $$;

CREATE FUNCTION public.brand_finance_save_quote(p_cafe_id uuid,p_id uuid,p_revision integer,p_payload jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE q public.bf_quotes%ROWTYPE; inv jsonb; entry jsonb; rows jsonb:='[]'; final_rows jsonb:='[]';
 product public.menu_products%ROWTYPE; customer_name text:=''; warehouse_name text:=''; strict_refs boolean;
 qty numeric; price numeric; rate numeric; gross numeric; disc numeric; after_row numeric; value numeric;
 subtotal numeric:=0; after_rows numeric:=0; doc_discount numeric; remaining numeric; base_left numeric; allocated numeric;
 taxable numeric; row_tax numeric; row_total numeric; tax numeric:=0; total numeric:=0; inclusive boolean;
 quote_date date; valid_date date;
BEGIN
 IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN ('owner','manager','accountant') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_revision IS NULL OR p_revision<0 OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>100000
  OR jsonb_typeof(p_payload->'document') IS DISTINCT FROM 'object' OR jsonb_typeof(p_payload#>'{document,invoice}') IS DISTINCT FROM 'object'
  OR coalesce(p_payload->>'status','') NOT IN ('draft','ready','accepted','rejected') OR coalesce(p_payload->>'date','') !~ '^\d{4}-\d{2}-\d{2}$'
  OR coalesce(p_payload->>'validUntil','') !~ '^(|\d{4}-\d{2}-\d{2})$' OR p_payload::text ~* '"[-+]?(nan|infinity)"'
 THEN RAISE EXCEPTION 'راجع بيانات عرض السعر' USING ERRCODE='22023'; END IF;
 quote_date:=(p_payload->>'date')::date; valid_date:=nullif(p_payload->>'validUntil','')::date;
 IF NOT isfinite(quote_date) OR (valid_date IS NOT NULL AND (NOT isfinite(valid_date) OR valid_date<quote_date)) THEN RAISE EXCEPTION 'تاريخ الانتهاء يجب ألا يسبق تاريخ العرض'; END IF;
 inv:=p_payload#>'{document,invoice}'; strict_refs:=p_payload->>'status'<>'draft';
 IF jsonb_typeof(inv->'lines') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'أضف بنود العرض'; END IF;
 IF jsonb_array_length(inv->'lines') NOT BETWEEN 1 AND 100 OR length(coalesce(inv->>'note',''))>500
  OR coalesce(inv->>'paymentKind','')<>'credit' OR coalesce(inv->>'accountId','')<>''
  OR coalesce(p_payload#>'{document,attachments}','[]')<>'[]'::jsonb
  OR coalesce((p_payload#>>'{document,deposit,value}')::numeric,0)<>0
  OR coalesce((p_payload#>>'{document,deposit,paid}')::boolean,false)
  OR coalesce((p_payload#>>'{document,delivery,confirmed}')::boolean,false)
 THEN RAISE EXCEPTION 'عرض السعر لا يسجل تحصيلًا أو تسليمًا'; END IF;
 IF nullif(inv->>'partyId','') IS NOT NULL THEN
  SELECT name INTO customer_name FROM public.bf_parties WHERE cafe_id=p_cafe_id AND id::text=inv->>'partyId' AND kind='customer' AND (NOT strict_refs OR active);
  IF NOT FOUND THEN RAISE EXCEPTION 'اختر عميلًا متاحًا للعلامة'; END IF;
 ELSIF strict_refs THEN RAISE EXCEPTION 'اختر العميل قبل حفظ العرض'; END IF;
 IF nullif(inv->>'warehouseId','') IS NOT NULL THEN
  SELECT name INTO warehouse_name FROM public.bf_warehouses WHERE cafe_id=p_cafe_id AND id::text=inv->>'warehouseId' AND (NOT strict_refs OR active);
  IF NOT FOUND THEN RAISE EXCEPTION 'اختر مستودعًا متاحًا للعلامة'; END IF;
 ELSIF strict_refs THEN RAISE EXCEPTION 'اختر المستودع قبل حفظ العرض'; END IF;
 inclusive:=coalesce((inv->>'taxInclusive')::boolean,false);
 FOR entry IN SELECT item.value FROM jsonb_array_elements(inv->'lines') item LOOP
  product:=NULL;
  IF nullif(entry->>'productId','') IS NOT NULL THEN
   SELECT * INTO product FROM public.menu_products WHERE cafe_id=p_cafe_id AND id::text=entry->>'productId' AND deleted_at IS NULL AND (NOT strict_refs OR available);
   IF NOT FOUND THEN RAISE EXCEPTION 'أحد المنتجات غير متاح للعلامة'; END IF;
  ELSIF strict_refs THEN RAISE EXCEPTION 'حدد الصنف في كل بند'; END IF;
  qty:=(entry->>'quantity')::numeric; price:=(entry->>'price')::numeric; rate:=coalesce((entry->>'vatRate')::numeric,(inv->>'vatRate')::numeric,0);
  IF qty IS NULL OR qty<0 OR (strict_refs AND qty=0) OR qty>9999 OR qty<>round(qty,3)
   OR price IS NULL OR price<0 OR price>10000000 OR price<>round(price,2) OR rate<0 OR rate>100 OR rate<>round(rate,2)
   OR length(coalesce(entry->>'description',''))>500 THEN RAISE EXCEPTION 'راجع أسعار وكميات وضريبة البنود'; END IF;
  gross:=round(qty*price,2); value:=coalesce((entry->>'discount')::numeric,0);
  IF coalesce(entry->>'discountKind','amount') NOT IN ('amount','percent') OR value<0 OR (entry->>'discountKind'='percent' AND value>100) THEN RAISE EXCEPTION 'راجع خصم البند'; END IF;
  disc:=round(CASE WHEN entry->>'discountKind'='percent' THEN gross*value/100 ELSE value END,2);
  IF disc>gross THEN RAISE EXCEPTION 'خصم البند أكبر من قيمته'; END IF;
  after_row:=gross-disc; subtotal:=subtotal+gross; after_rows:=after_rows+after_row;
  rows:=rows||jsonb_build_array(jsonb_build_object('productId',coalesce(entry->>'productId',''),'name',coalesce(product.name,''),'description',coalesce(entry->>'description',''),'quantity',qty,'price',price,'rowDiscount',disc,'after',after_row,'vatRate',rate));
 END LOOP;
 value:=CASE WHEN coalesce((inv->>'discountEnabled')::boolean,true) THEN coalesce((inv->>'discountValue')::numeric,0) ELSE 0 END;
 IF coalesce(inv->>'discountKind','amount') NOT IN ('amount','percent') OR value<0 OR (inv->>'discountKind'='percent' AND value>100) THEN RAISE EXCEPTION 'راجع خصم العرض'; END IF;
 doc_discount:=round(CASE WHEN inv->>'discountKind'='percent' THEN after_rows*value/100 ELSE value END,2);
 IF doc_discount>after_rows THEN RAISE EXCEPTION 'خصم العرض أكبر من قيمته'; END IF;
 remaining:=doc_discount; base_left:=after_rows;
 FOR entry IN SELECT item.value FROM jsonb_array_elements(rows) item LOOP
  after_row:=(entry->>'after')::numeric; rate:=(entry->>'vatRate')::numeric;
  allocated:=least(after_row,remaining,CASE WHEN base_left=0 THEN 0 ELSE round(remaining*after_row/base_left,2) END);
  remaining:=remaining-allocated; base_left:=base_left-after_row; taxable:=after_row-allocated;
  row_tax:=round(CASE WHEN inclusive THEN taxable-taxable/(1+rate/100) ELSE taxable*rate/100 END,2);
  row_total:=CASE WHEN inclusive THEN taxable ELSE taxable+row_tax END;
  tax:=tax+row_tax; total:=total+row_total;
  final_rows:=final_rows||jsonb_build_array((entry-'after'-'rowDiscount')||jsonb_build_object('discount',(entry->>'rowDiscount')::numeric+allocated,'net',row_total-row_tax,'tax',row_tax,'total',row_total));
 END LOOP;
 IF total>1000000000 OR (strict_refs AND total<=0) THEN RAISE EXCEPTION 'راجع إجمالي عرض السعر'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60416));
 SELECT * INTO q FROM public.bf_quotes WHERE id=p_id FOR UPDATE;
 IF FOUND THEN
  IF q.cafe_id<>p_cafe_id THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF q.payload=p_payload THEN RETURN brand_finance_private.quote_record(q); END IF;
  IF q.invoice_draft_id IS NOT NULL THEN RAISE EXCEPTION 'تم تحويل العرض إلى فاتورة ولا يمكن تعديله'; END IF;
  IF q.revision<>p_revision THEN RAISE EXCEPTION 'تغير العرض في جلسة أخرى افتح أحدث نسخة' USING ERRCODE='40001'; END IF;
  UPDATE public.bf_quotes SET payload=p_payload,revision=revision+1,customer_name=coalesce(customer_name,''),warehouse_name=coalesce(warehouse_name,''),lines=final_rows,
   subtotal=subtotal,discount=subtotal-after_rows+doc_discount,tax=tax,total=total,updated_by=auth.uid(),updated_at=clock_timestamp()
   WHERE id=p_id RETURNING * INTO q;
 ELSE
  IF p_revision<>0 THEN RAISE EXCEPTION 'Quote conflict' USING ERRCODE='40001'; END IF;
  IF (SELECT count(*) FROM public.bf_quotes WHERE cafe_id=p_cafe_id)>=500 THEN RAISE EXCEPTION 'وصلت إلى الحد الأقصى للعروض المحفوظة'; END IF;
  INSERT INTO public.bf_quotes(id,cafe_id,payload,customer_name,warehouse_name,lines,subtotal,discount,tax,total,created_by,updated_by)
   VALUES(p_id,p_cafe_id,p_payload,coalesce(customer_name,''),coalesce(warehouse_name,''),final_rows,subtotal,subtotal-after_rows+doc_discount,tax,total,auth.uid(),auth.uid()) RETURNING * INTO q;
 END IF;
 RETURN brand_finance_private.quote_record(q);
END $$;

CREATE FUNCTION public.brand_finance_convert_quote(p_cafe_id uuid,p_id uuid,p_revision integer) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q public.bf_quotes%ROWTYPE; payload jsonb; draft_id uuid; result jsonb;
BEGIN
 IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN ('owner','manager','accountant') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60416));
 SELECT * INTO q FROM public.bf_quotes WHERE cafe_id=p_cafe_id AND id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'العرض غير متاح' USING ERRCODE='42501'; END IF;
 IF q.invoice_draft_id IS NOT NULL THEN RETURN (SELECT jsonb_build_object('id',id,'revision',revision) FROM public.bf_invoice_drafts WHERE id=q.invoice_draft_id AND cafe_id=p_cafe_id); END IF;
 IF q.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'تغير العرض افتح أحدث نسخة' USING ERRCODE='40001'; END IF;
 IF q.payload->>'status' NOT IN ('ready','accepted') THEN RAISE EXCEPTION 'احفظ عرضًا جاهزًا أو مقبولًا قبل التحويل'; END IF;
 IF nullif(q.payload->>'validUntil','')::date < (now() AT TIME ZONE 'Asia/Riyadh')::date THEN RAISE EXCEPTION 'انتهت صلاحية العرض حدّثه قبل التحويل'; END IF;
 payload:=q.payload->'document';
 payload:=jsonb_set(jsonb_set(payload,'{invoice,paymentKind}','"credit"'),'{invoice,accountId}','""');
 payload:=jsonb_set(payload,'{supplyDate}',to_jsonb(((now() AT TIME ZONE 'Asia/Riyadh')::date)::text));
 IF jsonb_typeof(payload->'extraFields')='array' AND jsonb_array_length(payload->'extraFields')<5 THEN
  payload:=jsonb_set(payload,'{extraFields}',(payload->'extraFields')||jsonb_build_array(jsonb_build_object('key',2147483647,'title','عرض السعر','value',q.number::text)));
 END IF;
 draft_id:=gen_random_uuid(); result:=public.brand_finance_save_invoice_draft(p_cafe_id,draft_id,0,payload);
 UPDATE public.bf_quotes SET invoice_draft_id=draft_id,revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp() WHERE id=q.id;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.brand_finance_quotes(uuid,uuid),public.brand_finance_save_quote(uuid,uuid,integer,jsonb),public.brand_finance_convert_quote(uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.brand_finance_quotes(uuid,uuid),public.brand_finance_save_quote(uuid,uuid,integer,jsonb),public.brand_finance_convert_quote(uuid,uuid,integer) TO authenticated;
COMMIT;
