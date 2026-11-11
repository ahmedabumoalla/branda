BEGIN;
CREATE TABLE public.bf_company_invoice_files (
 id uuid PRIMARY KEY,
 cafe_id uuid NOT NULL REFERENCES public.cafes(id),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 original_name text NOT NULL CHECK(length(original_name) BETWEEN 1 AND 255),
 size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 8388608),
 storage_path text NOT NULL UNIQUE,
 uploaded boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX bf_company_invoice_files_cafe ON public.bf_company_invoice_files(cafe_id,created_at DESC);
CREATE INDEX bf_company_invoice_files_actor ON public.bf_company_invoice_files(created_by);
ALTER TABLE public.bf_company_invoice_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_company_invoice_files FROM PUBLIC,anon,authenticated;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('branda-company-invoice-files','branda-company-invoice-files',false,8388608,ARRAY['application/octet-stream']);
-- Even unrelated permissive bucket policies cannot expose these documents
CREATE POLICY bf_company_invoice_files_private ON storage.objects AS RESTRICTIVE
 FOR ALL TO anon,authenticated
 USING(bucket_id<>'branda-company-invoice-files') WITH CHECK(bucket_id<>'branda-company-invoice-files');

CREATE FUNCTION public.brand_finance_company_file(p_cafe_id uuid,p_action text DEFAULT 'list',p_id uuid DEFAULT NULL,p_name text DEFAULT NULL,p_size bigint DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.bf_company_invoice_files%ROWTYPE; result jsonb;
BEGIN
 IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN ('owner','manager','accountant') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_action='list' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY created_at DESC),'[]'::jsonb) INTO result FROM public.bf_company_invoice_files f WHERE cafe_id=p_cafe_id AND uploaded;
  RETURN result;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60415));
 SELECT * INTO item FROM public.bf_company_invoice_files WHERE cafe_id=p_cafe_id AND id=p_id FOR UPDATE;
 IF p_action='prepare' THEN
  IF p_id IS NULL OR coalesce(length(btrim(p_name)),0) NOT BETWEEN 1 AND 255 OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 8388608 THEN RAISE EXCEPTION 'Invalid file'; END IF;
  IF FOUND THEN
   IF item.original_name<>p_name OR item.size_bytes<>p_size OR item.uploaded THEN RAISE EXCEPTION 'File conflict'; END IF;
   RETURN to_jsonb(item);
  END IF;
  IF (SELECT count(*)>=1000 OR coalesce(sum(size_bytes),0)+p_size>268435456 FROM public.bf_company_invoice_files WHERE cafe_id=p_cafe_id) THEN RAISE EXCEPTION 'File capacity reached'; END IF;
  INSERT INTO public.bf_company_invoice_files(id,cafe_id,created_by,original_name,size_bytes,storage_path)
   VALUES(p_id,p_cafe_id,auth.uid(),p_name,p_size,p_cafe_id::text||'/'||p_id::text) RETURNING * INTO item;
  RETURN to_jsonb(item);
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'File unavailable' USING ERRCODE='42501'; END IF;
 IF p_action='finalize' THEN
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='branda-company-invoice-files' AND name=item.storage_path AND (metadata->>'size')::bigint=item.size_bytes AND metadata->>'mimetype'='application/octet-stream') THEN RAISE EXCEPTION 'Upload incomplete'; END IF;
  UPDATE public.bf_company_invoice_files SET uploaded=true WHERE id=item.id RETURNING * INTO item;
 ELSIF p_action<>'get' OR NOT item.uploaded THEN RAISE EXCEPTION 'File unavailable' USING ERRCODE='42501'; END IF;
 RETURN to_jsonb(item);
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_company_file(uuid,text,uuid,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.brand_finance_company_file(uuid,text,uuid,text,bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.brand_finance_issue_company_invoice(p_cafe_id uuid,p_draft_id uuid,p_revision integer,p_expected_total numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE draft public.bf_invoice_drafts%ROWTYPE; customer public.bf_parties%ROWTYPE; cfg public.bf_settings%ROWTYPE;
  inv jsonb; seller jsonb; entry jsonb; product public.menu_products%ROWTYPE; existing jsonb; doc uuid:=gen_random_uuid();
  aid uuid; wid uuid; n bigint; issue_at timestamptz:=clock_timestamp(); supply_date date; rows jsonb:='[]'; final_rows jsonb:='[]';
  qty numeric; price numeric; gross numeric; row_discount numeric; rate numeric; row_after numeric; remaining numeric; base_left numeric;
  allocated numeric; taxable numeric; row_tax numeric; row_net numeric; row_total numeric; cost numeric; paid numeric;
  subtotal numeric:=0; after_rows numeric:=0; doc_discount numeric; tax numeric:=0; total numeric:=0; net numeric:=0;
  discount_value numeric; inclusive boolean; result jsonb; buyer_address text; seller_tax text; phone text; invoice_type text;
  deposit jsonb; deposit_value numeric; deposit_amount numeric; deposit_paid boolean; deposit_kind text;
  shipping_mode text; shipping_address text; delivery_confirmed boolean; delivery_date timestamptz;
  file_ids jsonb; file_id uuid; files jsonb:='[]'; attached public.bf_company_invoice_files%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN ('owner','manager','accountant')
  THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
  SELECT snapshot INTO existing FROM public.bf_company_invoices WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id;
  IF FOUND THEN RETURN existing; END IF;
  SELECT * INTO draft FROM public.bf_invoice_drafts WHERE id=p_draft_id AND cafe_id=p_cafe_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft unavailable' USING ERRCODE='42501'; END IF;
  IF draft.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Draft conflict' USING ERRCODE='40001'; END IF;
  inv:=draft.payload->'invoice'; seller:=draft.payload->'issuer';
  IF inv IS NULL OR jsonb_typeof(inv->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(inv->'lines') NOT BETWEEN 1 AND 100
    OR draft.payload::text ~* '"[-+]?(nan|infinity)"' THEN RAISE EXCEPTION 'Invalid invoice'; END IF;
  IF coalesce(length(btrim(seller->>'name')),0) NOT BETWEEN 2 AND 160 OR coalesce(length(btrim(seller->>'address')),0) NOT BETWEEN 8 AND 500
    OR octet_length(seller->>'name')>255 OR coalesce(seller->>'vatNumber','') !~ '^3[0-9]{13}3$' THEN RAISE EXCEPTION 'أكمل الاسم القانوني وعنوان البائع والرقم الضريبي الصحيح'; END IF;
  SELECT tax_number INTO seller_tax FROM public.cafe_settings WHERE cafe_id=p_cafe_id;
  IF nullif(btrim(seller_tax),'') IS NOT NULL AND btrim(seller_tax)<>seller->>'vatNumber' THEN RAISE EXCEPTION 'رقم البائع الضريبي لا يطابق إعدادات العلامة'; END IF;
  supply_date:=(draft.payload->>'supplyDate')::date;
  IF supply_date IS NULL OR NOT isfinite(supply_date) OR supply_date>(issue_at AT TIME ZONE 'Asia/Riyadh')::date THEN RAISE EXCEPTION 'اختر تاريخ توريد صالحًا'; END IF;
  PERFORM brand_finance_private.seed(p_cafe_id);
  SELECT * INTO STRICT cfg FROM public.bf_settings WHERE cafe_id=p_cafe_id FOR UPDATE;
  PERFORM brand_finance_private.gl_date_open(p_cafe_id,(issue_at AT TIME ZONE 'Asia/Riyadh')::date);
  SELECT * INTO customer FROM public.bf_parties WHERE cafe_id=p_cafe_id AND id::text=(inv->>'partyId') AND active AND kind='customer';
  IF NOT FOUND THEN RAISE EXCEPTION 'اختر عميلًا نشطًا'; END IF;
  IF coalesce(customer.details->>'customerType','individual') NOT IN ('individual','business') THEN RAISE EXCEPTION 'حدد نوع العميل فردًا أو شركة'; END IF;
  invoice_type:=CASE WHEN coalesce(customer.details->>'customerType','individual')='individual' AND nullif(btrim(customer.tax_number),'') IS NULL THEN 'simplified' ELSE 'standard' END;
  IF invoice_type='standard' AND coalesce(customer.tax_number,'') !~ '^3[0-9]{13}3$' THEN RAISE EXCEPTION 'أكمل الرقم الضريبي الصحيح للعميل من ١٥ رقمًا'; END IF;
  buyer_address:=concat_ws(' ',nullif(customer.details->>'buildingNumber',''),nullif(customer.details->>'street',''),nullif(customer.details->>'district',''),nullif(customer.details->>'city',''),nullif(customer.details->>'postalCode',''),nullif(customer.details->>'country',''));
  IF invoice_type='standard' AND (coalesce(length(buyer_address),0)<8 OR nullif(customer.details->>'city','') IS NULL OR nullif(customer.details->>'street','') IS NULL) THEN RAISE EXCEPTION 'أكمل عنوان العميل في بياناته قبل الإصدار'; END IF;
  wid:=nullif(inv->>'warehouseId','')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.bf_warehouses WHERE cafe_id=p_cafe_id AND id=wid AND active) THEN RAISE EXCEPTION 'اختر مستودعًا نشطًا'; END IF;
  IF coalesce(inv->>'paymentKind','') NOT IN ('cash','bank','pos','credit') THEN RAISE EXCEPTION 'Invalid payment'; END IF;
  IF inv->>'paymentKind'<>'credit' THEN
    aid:=nullif(inv->>'accountId','')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=aid AND active AND kind=inv->>'paymentKind' AND NOT is_cashier_drawer)
      THEN RAISE EXCEPTION 'اختر حساب تحصيل إداريًا نشطًا خارج صناديق ورديات الكاشير'; END IF;
  END IF;
  deposit:=coalesce(draft.payload->'deposit','{"kind":"amount","value":0,"paid":false}'::jsonb);
  deposit_kind:=deposit->>'kind';deposit_value:=(deposit->>'value')::numeric;deposit_paid:=(deposit->>'paid')::boolean;
  IF jsonb_typeof(deposit)<>'object' OR deposit_kind IS NULL OR deposit_kind NOT IN ('amount','percent') OR deposit_value IS NULL OR deposit_paid IS NULL OR deposit_value<0 OR deposit_value>1000000000 OR deposit_value<>round(deposit_value,2) OR (deposit_kind='percent' AND deposit_value>100) THEN RAISE EXCEPTION 'راجع قيمة الدفعة المقدمة'; END IF;
  IF deposit_value>0 AND ((deposit_paid AND aid IS NULL) OR (NOT deposit_paid AND aid IS NOT NULL)) THEN RAISE EXCEPTION 'حدد حالة تحصيل الدفعة وحسابها'; END IF;
  shipping_mode:=coalesce(draft.payload->>'shipping','none');
  IF shipping_mode NOT IN ('none','main','secondary') THEN RAISE EXCEPTION 'Invalid shipping mode'; END IF;
  shipping_address:=CASE shipping_mode WHEN 'main' THEN buyer_address WHEN 'secondary' THEN concat_ws(' ',nullif(customer.details->>'shippingBuildingNumber',''),nullif(customer.details->>'shippingStreet',''),nullif(customer.details->>'shippingDistrict',''),nullif(customer.details->>'shippingCity',''),nullif(customer.details->>'shippingPostalCode',''),nullif(customer.details->>'shippingCountry','')) ELSE '' END;
  IF shipping_mode<>'none' AND (length(shipping_address)<8 OR nullif(customer.details->>CASE WHEN shipping_mode='main' THEN 'street' ELSE 'shippingStreet' END,'') IS NULL OR nullif(customer.details->>CASE WHEN shipping_mode='main' THEN 'city' ELSE 'shippingCity' END,'') IS NULL) THEN RAISE EXCEPTION 'أكمل عنوان الشحن المختار في بيانات العميل'; END IF;
  delivery_confirmed:=coalesce((draft.payload#>>'{delivery,confirmed}')::boolean,false);
  delivery_date:=nullif(draft.payload#>>'{delivery,date}','')::timestamptz;
  IF delivery_confirmed AND (delivery_date IS NULL OR NOT isfinite(delivery_date) OR delivery_date>issue_at) THEN RAISE EXCEPTION 'اختر وقت تسليم صحيحًا لا يتجاوز الوقت الحالي'; END IF;
  IF NOT delivery_confirmed THEN delivery_date:=NULL; END IF;
  file_ids:=coalesce(draft.payload->'attachments','[]'::jsonb);
  IF jsonb_typeof(file_ids)<>'array' OR jsonb_array_length(file_ids)>20 OR (SELECT count(DISTINCT value)<>count(*) FROM jsonb_array_elements(file_ids)) THEN RAISE EXCEPTION 'Invalid attachments'; END IF;
  FOR file_id IN SELECT value::uuid FROM jsonb_array_elements_text(file_ids) LOOP
    SELECT * INTO attached FROM public.bf_company_invoice_files WHERE id=file_id AND cafe_id=p_cafe_id AND uploaded FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'أحد المستندات غير متاح أو لم يكتمل رفعه'; END IF;
    files:=files||jsonb_build_array(jsonb_build_object('id',attached.id,'name',attached.original_name,'size',attached.size_bytes));
  END LOOP;
  inclusive:=coalesce((inv->>'taxInclusive')::boolean,cfg.tax_inclusive);
  FOR entry IN SELECT value FROM jsonb_array_elements(inv->'lines') LOOP
    SELECT * INTO product FROM public.menu_products WHERE cafe_id=p_cafe_id AND id::text=entry->>'productId' AND deleted_at IS NULL AND available FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'أحد المنتجات غير متاح حدّث الفاتورة'; END IF;
    qty:=(entry->>'quantity')::numeric;price:=coalesce((entry->>'price')::numeric,product.price);
    rate:=coalesce((entry->>'vatRate')::numeric,(inv->>'vatRate')::numeric,cfg.vat_rate);
    IF qty IS NULL OR qty<=0 OR qty>9999 OR qty<>round(qty,3) OR price IS NULL OR price<0 OR price>10000000 OR price<>round(price,2)
      THEN RAISE EXCEPTION 'راجع كميات وأسعار البنود'; END IF;
    -- This first B2B release supports standard-rated supplies only
    IF rate IS DISTINCT FROM 15 THEN RAISE EXCEPTION 'الإصدار الحالي يدعم البنود الخاضعة لضريبة ١٥٪ فقط'; END IF;
    gross:=round(qty*price,2);discount_value:=coalesce((entry->>'discount')::numeric,0);
    IF coalesce(entry->>'discountKind','amount') NOT IN ('amount','percent') OR discount_value<0 OR (entry->>'discountKind'='percent' AND discount_value>100) THEN RAISE EXCEPTION 'Invalid line discount'; END IF;
    row_discount:=round(CASE WHEN entry->>'discountKind'='percent' THEN gross*discount_value/100 ELSE discount_value END,2);
    IF row_discount>gross THEN RAISE EXCEPTION 'خصم البند أكبر من قيمته'; END IF;
    row_after:=gross-row_discount;subtotal:=subtotal+gross;after_rows:=after_rows+row_after;
    rows:=rows||jsonb_build_array(jsonb_build_object('productId',product.id,'name',product.name,'description',coalesce(entry->>'description',''),'quantity',qty,'price',price,'gross',gross,'rowDiscount',row_discount,'after',row_after,'vatRate',rate));
  END LOOP;
  discount_value:=CASE WHEN coalesce((inv->>'discountEnabled')::boolean,true) THEN coalesce((inv->>'discountValue')::numeric,0) ELSE 0 END;
  IF coalesce(inv->>'discountKind','amount') NOT IN ('amount','percent') OR discount_value<0 OR (inv->>'discountKind'='percent' AND discount_value>100) THEN RAISE EXCEPTION 'Invalid invoice discount'; END IF;
  doc_discount:=round(CASE WHEN inv->>'discountKind'='percent' THEN after_rows*discount_value/100 ELSE discount_value END,2);
  IF doc_discount>after_rows THEN RAISE EXCEPTION 'خصم الفاتورة أكبر من قيمتها'; END IF;
  remaining:=doc_discount;base_left:=after_rows;
  FOR entry IN SELECT value FROM jsonb_array_elements(rows) LOOP
    row_after:=(entry->>'after')::numeric;
    allocated:=least(row_after,remaining,CASE WHEN base_left=0 THEN 0 ELSE round(remaining*row_after/base_left,2) END);
    remaining:=remaining-allocated;base_left:=base_left-row_after;taxable:=row_after-allocated;
    row_tax:=CASE WHEN inclusive THEN round(taxable-taxable/1.15,2) ELSE round(taxable*.15,2) END;
    row_net:=CASE WHEN inclusive THEN taxable-row_tax ELSE taxable END;row_total:=row_net+row_tax;
    net:=net+row_net;tax:=tax+row_tax;total:=total+row_total;
    final_rows:=final_rows||jsonb_build_array(entry||jsonb_build_object('discount',(entry->>'rowDiscount')::numeric+allocated,'net',row_net,'tax',row_tax,'total',row_total));
  END LOOP;
  IF total<=0 OR total>1000000000 OR p_expected_total IS DISTINCT FROM total THEN RAISE EXCEPTION 'راجع إجمالي الفاتورة قبل الإصدار'; END IF;
  deposit_amount:=round(CASE WHEN deposit_kind='percent' THEN total*deposit_value/100 ELSE deposit_value END,2);
  IF deposit_amount>total THEN RAISE EXCEPTION 'الدفعة المقدمة أكبر من إجمالي الفاتورة'; END IF;
  paid:=CASE WHEN deposit_value>0 THEN CASE WHEN deposit_paid THEN deposit_amount ELSE 0 END WHEN aid IS NULL THEN 0 ELSE total END;
  INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,account_id,warehouse_id,subtotal,discount,tax,total,paid,note,created_by,created_at,vat_rate,tax_inclusive)
    VALUES(doc,p_cafe_id,'sale',customer.id,aid,wid,subtotal,subtotal-after_rows+doc_discount,tax,total,paid,left(coalesce(inv->>'note',''),1000),auth.uid(),issue_at,15,inclusive) RETURNING number INTO n;
  FOR entry IN SELECT value FROM jsonb_array_elements(final_rows) LOOP
    INSERT INTO public.bf_document_lines(cafe_id,document_id,product_id,name,quantity,unit_price,net,tax,cost)
      VALUES(p_cafe_id,doc,(entry->>'productId')::uuid,entry->>'name',(entry->>'quantity')::numeric,(entry->>'price')::numeric,(entry->>'net')::numeric,(entry->>'tax')::numeric,0)
      RETURNING bf_document_lines.cost INTO cost;
    PERFORM brand_finance_private.line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'5000'),cost,0);
    PERFORM brand_finance_private.line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'1200'),0,cost);
  END LOOP;
  PERFORM brand_finance_private.line(p_cafe_id,doc,aid,paid,0);
  PERFORM brand_finance_private.line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'1100'),total-paid,0,customer.id);
  PERFORM brand_finance_private.line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'4000'),0,net);
  PERFORM brand_finance_private.line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'2100'),0,tax);
  phone:=regexp_replace(translate(customer.phone,'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[^0-9]','','g');
  IF phone LIKE '00%' THEN phone:=substr(phone,3); END IF;
  IF phone ~ '^05[0-9]{8}$' THEN phone:='966'||substr(phone,2); ELSIF phone ~ '^5[0-9]{8}$' THEN phone:='966'||phone; END IF;
  IF draft.payload->>'deliveryMethod'='whatsapp' AND phone !~ '^9665[0-9]{8}$' THEN RAISE EXCEPTION 'أدخل رقم جوال سعودي صحيح للعميل قبل إرسال الواتساب'; END IF;
  result:=jsonb_build_object('id',doc,'number',n,'type',invoice_type,'issuedAt',issue_at,'supplyDate',supply_date,'seller',seller,
    'customer',jsonb_build_object('name',coalesce(nullif(customer.details->>'legalName',''),customer.name),'vatNumber',customer.tax_number,'address',buyer_address,'phone',phone),
    'lines',final_rows,'subtotal',subtotal,'discount',subtotal-after_rows+doc_discount,'tax',tax,'total',total,'paid',paid,'taxInclusive',inclusive,
    'deposit',jsonb_build_object('kind',deposit_kind,'value',deposit_value,'amount',deposit_amount,'paid',deposit_paid),
    'shipping',jsonb_build_object('mode',shipping_mode,'address',shipping_address),
    'delivery',jsonb_build_object('confirmed',delivery_confirmed,'date',coalesce(delivery_date::text,'')),
    'attachments',files,'note',coalesce(inv->>'note',''),'extraFields',coalesce(draft.payload->'extraFields','[]'::jsonb),'template',draft.payload->>'template','deliveryMethod',coalesce(draft.payload->>'deliveryMethod','print'));
  INSERT INTO public.bf_company_invoices(document_id,cafe_id,draft_id,snapshot) VALUES(doc,p_cafe_id,p_draft_id,result);
  RETURN result;
END $$;


COMMIT;
