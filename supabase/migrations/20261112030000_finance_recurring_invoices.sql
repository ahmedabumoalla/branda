BEGIN;
DO $baseline$ BEGIN
 IF md5(pg_get_functiondef('brand_finance_private.issue_company_invoice(uuid,uuid,integer,numeric,uuid,text)'::regprocedure))<>'4b624c21a9f5a804b0cb12aeb95d6ac8' THEN RAISE EXCEPTION 'Unexpected canonical issuer baseline';END IF;
END $baseline$;
CREATE OR REPLACE FUNCTION brand_finance_private.invoice_actor_role(p_cafe uuid, p_actor uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r text;
BEGIN
 IF p_actor IS NULL
   OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND status='active')
   OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND deleted_at IS NULL AND status IN('active','published'))
   OR NOT platform_access_private.service_enabled(p_cafe,'finance')
 THEN RAISE EXCEPTION 'Finance access denied' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND owner_user_id=p_actor) THEN RETURN 'owner'; END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='platform_admin' AND status='active') THEN RETURN 'manager'; END IF;
 SELECT role INTO r FROM public.bf_staff WHERE cafe_id=p_cafe AND user_id=p_actor AND active FOR SHARE;
 IF r IS NULL THEN RAISE EXCEPTION 'Finance staff access denied' USING ERRCODE='42501'; END IF;
 RETURN r;
END $function$
;
CREATE OR REPLACE FUNCTION brand_finance_private.issue_company_invoice_actor(p_actor uuid, p_preview boolean, p_cafe_id uuid, p_draft_id uuid, p_revision integer, p_expected_total numeric, p_source_id uuid DEFAULT NULL::uuid, p_debit_reason text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE draft public.bf_invoice_drafts%ROWTYPE; customer public.bf_parties%ROWTYPE; cfg public.bf_settings%ROWTYPE;
  inv jsonb; seller jsonb; entry jsonb; product public.menu_products%ROWTYPE; existing jsonb; doc uuid:=gen_random_uuid();
  aid uuid; wid uuid; n bigint; issue_at timestamptz:=clock_timestamp(); supply_date date; rows jsonb:='[]'; final_rows jsonb:='[]';
  qty numeric; price numeric; gross numeric; row_discount numeric; rate numeric; row_after numeric; remaining numeric; base_left numeric;
  allocated numeric; taxable numeric; row_tax numeric; row_net numeric; row_total numeric; cost numeric; paid numeric;
  subtotal numeric:=0; after_rows numeric:=0; doc_discount numeric; tax numeric:=0; total numeric:=0; net numeric:=0;
  discount_value numeric; inclusive boolean; result jsonb; buyer_address text; seller_tax text; phone text; invoice_type text;
  deposit jsonb; deposit_value numeric; deposit_amount numeric; deposit_paid boolean; deposit_kind text;
  shipping_mode text; shipping_address text; delivery_confirmed boolean; delivery_date timestamptz;
  prefs jsonb;line_cost_status text;file_ids jsonb; file_id uuid; files jsonb:='[]'; attached public.bf_company_invoice_files%ROWTYPE;
  advanced jsonb;currency_code text;fx numeric;source_doc public.bf_documents%ROWTYPE;status_id uuid;list_id uuid;price_list jsonb;product_id uuid;policy jsonb;line_name text;line_kind text;catalog_price numeric;tax_category text;exemption text;cap numeric;
  adjustment_base numeric:=0;adjustment_id uuid;adjustment_rule jsonb;adjustment_amount numeric;adjustment_line_net numeric;adjustment_line_tax numeric;adjustment_net numeric:=0;adjustment_tax numeric:=0;
  sar_line_net numeric;sar_line_tax numeric;sar_net numeric:=0;sar_tax numeric:=0;sar_subtotal numeric:=0;sar_discount numeric;sar_total numeric;sar_adjustment_net numeric:=0;sar_adjustment_tax numeric:=0;
  credit_sar numeric;credit_foreign numeric;cash_sar numeric;display_number text;journal_note text;line_id uuid;
BEGIN
  IF p_actor IS NULL OR coalesce(brand_finance_private.invoice_actor_role(p_cafe_id,p_actor),'') NOT IN ('owner','manager','accountant')
  THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
  SELECT snapshot INTO existing FROM public.bf_company_invoices WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id;
  IF FOUND THEN RETURN existing; END IF;
  SELECT * INTO draft FROM public.bf_invoice_drafts WHERE id=p_draft_id AND cafe_id=p_cafe_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft unavailable' USING ERRCODE='42501'; END IF;
  IF draft.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Draft conflict' USING ERRCODE='40001'; END IF;
  prefs:=brand_finance_private.invoice_settings(p_cafe_id);
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
  IF NOT (prefs->>'allowDeposits')::boolean AND deposit_value>0 THEN RAISE EXCEPTION 'Invoice settings: deposits disabled' USING ERRCODE='22023';END IF;
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
  advanced:=prefs->'advanced';currency_code:=coalesce(nullif(inv->>'currency',''),'SAR');
  SELECT (c->>'rate')::numeric INTO fx FROM jsonb_array_elements(advanced->'currencies') c WHERE c->>'code'=currency_code;
  IF fx IS NULL THEN RAISE EXCEPTION 'عملة الفاتورة غير مفعلة';END IF;
  IF NOT(advanced->>'showExchangeRate')::boolean AND inv ? 'exchangeRate' AND (inv->>'exchangeRate')::numeric IS DISTINCT FROM fx THEN RAISE EXCEPTION 'تعديل سعر الصرف غير مسموح في إعدادات الفاتورة';END IF;
  fx:=coalesce((inv->>'exchangeRate')::numeric,fx);
  IF fx<=0 OR fx>1000000 OR fx<>round(fx,6) OR (currency_code='SAR' AND fx<>1) THEN RAISE EXCEPTION 'راجع سعر صرف العملة';END IF;
  IF p_source_id IS NOT NULL THEN
   SELECT * INTO source_doc FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=p_source_id AND kind='sale' FOR UPDATE;
   IF source_doc.id IS NULL OR NOT(advanced->>'debitNotesEnabled')::boolean OR source_doc.party_id<>customer.id OR EXISTS(SELECT 1 FROM public.bf_invoice_extensions WHERE document_id=p_source_id AND source_id IS NOT NULL) OR (brand_finance_private.document_state(p_cafe_id,p_source_id)->>'refunded')::boolean OR length(btrim(p_debit_reason)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'الفاتورة غير متاحة لإشعار مدين';END IF;
  END IF;
  status_id:=nullif(inv->>'statusId','')::uuid;
  IF status_id IS NOT NULL AND (NOT(advanced->>'customStatusesEnabled')::boolean OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(advanced->'statuses') s WHERE s->>'id'=status_id::text)) THEN RAISE EXCEPTION 'حالة الفاتورة غير متاحة';END IF;
  list_id:=nullif(inv->>'priceListId','')::uuid;
  IF list_id IS NOT NULL THEN
   SELECT x INTO price_list FROM jsonb_array_elements(advanced->'priceLists') x WHERE x->>'id'=list_id::text AND (x->>'active')::boolean;
   IF NOT(advanced->>'priceListsEnabled')::boolean OR price_list IS NULL OR (jsonb_array_length(price_list->'partyIds')>0 AND NOT(price_list->'partyIds' ? customer.id::text)) THEN RAISE EXCEPTION 'قائمة الأسعار غير متاحة لهذا العميل';END IF;
  END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(inv->'lines') LOOP
   product:=NULL;policy:=NULL;product_id:=nullif(entry->>'productId','')::uuid;
   IF product_id IS NULL THEN
    IF p_source_id IS NULL AND NOT(prefs->>'allowLineEditing')::boolean THEN RAISE EXCEPTION 'البنود الحرة غير مسموحة في إعدادات الفاتورة';END IF;
    line_name:=btrim(coalesce(entry->>'name',''));line_kind:=coalesce(entry->>'kind','');
    IF length(line_name) NOT BETWEEN 1 AND 160 OR line_kind NOT IN('product','service') THEN RAISE EXCEPTION 'أكمل اسم البند الحر ونوعه';END IF;
   ELSE
    SELECT * INTO product FROM public.menu_products WHERE cafe_id=p_cafe_id AND id=product_id AND deleted_at IS NULL AND available FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'أحد المنتجات غير متاح حدّث الفاتورة';END IF;
    SELECT x INTO policy FROM jsonb_array_elements(advanced->'productPolicies') x WHERE x->>'productId'=product_id::text;
    line_name:=product.name;line_kind:=coalesce(policy->>'kind','product');
    IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(advanced->'excludedCategories') x WHERE x=product.category_id::text OR x=product.legacy_category OR x=(SELECT name FROM public.menu_categories WHERE id=product.category_id AND cafe_id=p_cafe_id)) THEN RAISE EXCEPTION 'صنف البند مستبعد من الفواتير';END IF;
   END IF;
   IF p_source_id IS NULL AND ((advanced->>'activityKind'='products' AND line_kind<>'product') OR (advanced->>'activityKind'='services' AND line_kind<>'service')) THEN RAISE EXCEPTION 'نوع البند لا يطابق نشاط الفواتير';END IF;
   catalog_price:=product.price;
   IF price_list IS NOT NULL THEN SELECT coalesce((x->>'price')::numeric,product.price) INTO catalog_price FROM jsonb_array_elements(price_list->'prices') x WHERE x->>'productId'=product_id::text;catalog_price:=coalesce(catalog_price,product.price);END IF;
   catalog_price:=round(catalog_price/fx,2);qty:=(entry->>'quantity')::numeric;price:=coalesce((entry->>'price')::numeric,catalog_price);
   IF qty IS NULL OR qty<=0 OR qty>9999 OR qty<>round(qty,3) OR price IS NULL OR price<0 OR price>10000000 OR price<>round(price,2) OR length(coalesce(entry->>'description',''))>500 THEN RAISE EXCEPTION 'راجع كميات وأسعار البنود';END IF;
   IF product_id IS NOT NULL AND NOT(prefs->>'allowLineEditing')::boolean AND (price IS DISTINCT FROM catalog_price OR (coalesce(entry->>'description','')<>'' AND coalesce(entry->>'description','') IS DISTINCT FROM coalesce(product.description,''))) THEN RAISE EXCEPTION 'Invoice settings: catalog line editing disabled' USING ERRCODE='22023';END IF;
   rate:=CASE WHEN p_source_id IS NOT NULL THEN coalesce((entry->>'vatRate')::numeric,15) WHEN advanced->>'taxMode'='none' THEN 0 WHEN advanced->>'taxMode'='specific' THEN (advanced->>'specificTaxRate')::numeric WHEN product_id IS NOT NULL THEN coalesce((policy->>'vatRate')::numeric,15) ELSE coalesce((entry->>'vatRate')::numeric,15) END;
   tax_category:=CASE WHEN rate=15 THEN 'S' WHEN advanced->>'taxMode'='none' AND p_source_id IS NULL THEN 'O' WHEN advanced->>'taxMode'='product' AND product_id IS NOT NULL THEN coalesce(policy->>'taxCategory','Z') ELSE coalesce(nullif(entry->>'taxCategory','S'),'Z') END;
   exemption:=coalesce(nullif(entry->>'exemptionReason',''),nullif(policy->>'exemptionReason',''),advanced->>'exemptionReason','');
   IF rate NOT IN(0,15) OR tax_category NOT IN('S','Z','E','O') OR (rate=15) IS DISTINCT FROM(tax_category='S') OR length(exemption)>250 OR (rate=0 AND (advanced->>'taxRequired')::boolean AND btrim(exemption)='') THEN RAISE EXCEPTION 'أكمل فئة الضريبة وسبب الإعفاء أو النسبة الصفرية';END IF;
   gross:=round(qty*price,2);discount_value:=coalesce((entry->>'discount')::numeric,0);
   IF coalesce(entry->>'discountKind','amount') NOT IN('amount','percent') OR discount_value<0 OR discount_value>1000000000 OR (entry->>'discountKind'='percent' AND discount_value>100) THEN RAISE EXCEPTION 'Invalid line discount';END IF;
   row_discount:=round(CASE WHEN entry->>'discountKind'='percent' THEN gross*discount_value/100 ELSE discount_value END,2);
   IF prefs->>'discountMode'='invoice' AND row_discount>0 THEN RAISE EXCEPTION 'Invoice settings: line discounts disabled' USING ERRCODE='22023';END IF;
   IF row_discount>gross THEN RAISE EXCEPTION 'خصم البند أكبر من قيمته';END IF;
   row_after:=gross-row_discount;subtotal:=subtotal+gross;after_rows:=after_rows+row_after;
   rows:=rows||jsonb_build_array(jsonb_build_object('productId',coalesce(product_id::text,''),'name',line_name,'kind',line_kind,'description',coalesce(entry->>'description',''),'quantity',qty,'price',price,'gross',gross,'rowDiscount',row_discount,'after',row_after,'vatRate',rate,'taxCategory',tax_category,'exemptionReason',exemption,'minimum',CASE WHEN (advanced->>'advancedPricing')::boolean THEN coalesce((policy->>'minimumPrice')::numeric,0) ELSE 0 END));
  END LOOP;
  discount_value:=CASE WHEN coalesce((inv->>'discountEnabled')::boolean,true) THEN coalesce((inv->>'discountValue')::numeric,0) ELSE 0 END;
  IF coalesce(inv->>'discountKind','amount') NOT IN('amount','percent') OR discount_value<0 OR discount_value>1000000000 OR (inv->>'discountKind'='percent' AND discount_value>100) THEN RAISE EXCEPTION 'Invalid invoice discount';END IF;
  doc_discount:=round(CASE WHEN inv->>'discountKind'='percent' THEN after_rows*discount_value/100 ELSE discount_value END,2);
  IF prefs->>'discountMode'='line' AND doc_discount>0 THEN RAISE EXCEPTION 'Invoice settings: invoice discounts disabled' USING ERRCODE='22023';END IF;
  IF doc_discount>after_rows THEN RAISE EXCEPTION 'خصم الفاتورة أكبر من قيمتها';END IF;
  cap:=100;IF (advanced->>'discountCapsEnabled')::boolean THEN SELECT (x->>'percent')::numeric INTO cap FROM jsonb_array_elements(advanced->'discountCaps') x WHERE x->>'userId'=p_actor::text;cap:=coalesce(cap,100);END IF;
  IF subtotal>0 AND subtotal-after_rows+doc_discount>round(subtotal*cap/100,2) THEN RAISE EXCEPTION 'الخصم يتجاوز الحد المسموح للمستخدم';END IF;
  remaining:=doc_discount;base_left:=after_rows;
  FOR entry IN SELECT value FROM jsonb_array_elements(rows) LOOP
   row_after:=(entry->>'after')::numeric;allocated:=least(row_after,remaining,CASE WHEN base_left=0 THEN 0 ELSE round(remaining*row_after/base_left,2) END);remaining:=remaining-allocated;base_left:=base_left-row_after;taxable:=row_after-allocated;rate:=(entry->>'vatRate')::numeric;
   row_tax:=CASE WHEN inclusive THEN round(taxable-taxable/(1+rate/100),2) ELSE round(taxable*rate/100,2) END;row_net:=CASE WHEN inclusive THEN taxable-row_tax ELSE taxable END;row_total:=row_net+row_tax;
   IF (CASE WHEN (advanced->>'minimumIncludesTax')::boolean THEN row_total ELSE row_net END)*fx < (entry->>'minimum')::numeric*(entry->>'quantity')::numeric THEN RAISE EXCEPTION 'سعر البند بعد الخصم أقل من الحد الأدنى';END IF;
   final_rows:=final_rows||jsonb_build_array(entry||jsonb_build_object('discount',(entry->>'rowDiscount')::numeric+allocated,'net',row_net,'tax',row_tax,'total',row_total));
   adjustment_base:=adjustment_base+CASE WHEN inclusive THEN row_total ELSE row_net END;
  END LOOP;
  adjustment_id:=nullif(inv#>>'{adjustment,typeId}','')::uuid;adjustment_amount:=coalesce((inv#>>'{adjustment,amount}')::numeric,0);
  IF adjustment_amount<0 OR adjustment_amount>1000000000 OR adjustment_amount<>round(adjustment_amount,2) OR (adjustment_id IS NULL AND adjustment_amount<>0) THEN RAISE EXCEPTION 'راجع قيمة التسوية';END IF;
  IF adjustment_id IS NOT NULL THEN
   SELECT x INTO adjustment_rule FROM jsonb_array_elements(advanced->'adjustments') x WHERE x->>'id'=adjustment_id::text;
   IF NOT(advanced->>'adjustmentsEnabled')::boolean OR adjustment_rule IS NULL OR NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=(adjustment_rule->>'accountId')::uuid AND active AND kind IN('revenue','expense') AND code<>'5000') THEN RAISE EXCEPTION 'حساب التسوية غير متاح';END IF;
   IF adjustment_rule->>'kind'='deduction' AND adjustment_amount>adjustment_base THEN RAISE EXCEPTION 'التسوية أكبر من قيمة الفاتورة';END IF;
   IF adjustment_rule->>'kind'='deduction' AND subtotal-after_rows+doc_discount+adjustment_amount>round(subtotal*cap/100,2) THEN RAISE EXCEPTION 'الخصم والتسوية يتجاوزان الحد المسموح للمستخدم';END IF;
  END IF;
  remaining:=adjustment_amount;base_left:=adjustment_base;rows:='[]';
  FOR entry IN SELECT value FROM jsonb_array_elements(final_rows) LOOP
   row_net:=(entry->>'net')::numeric;row_tax:=(entry->>'tax')::numeric;row_total:=(entry->>'total')::numeric;rate:=(entry->>'vatRate')::numeric;row_after:=CASE WHEN inclusive THEN row_total ELSE row_net END;
   allocated:=CASE WHEN base_left=0 THEN 0 ELSE round(remaining*row_after/base_left,2) END;remaining:=remaining-allocated;base_left:=base_left-row_after;
   IF adjustment_rule->>'kind'='deduction' THEN allocated:=-allocated;END IF;
   adjustment_line_tax:=CASE WHEN coalesce((adjustment_rule->>'taxable')::boolean,false) THEN CASE WHEN inclusive THEN round(allocated-allocated/(1+rate/100),2) ELSE round(allocated*rate/100,2) END ELSE 0 END;
   adjustment_line_net:=CASE WHEN inclusive AND coalesce((adjustment_rule->>'taxable')::boolean,false) THEN allocated-adjustment_line_tax ELSE allocated END;
   row_net:=row_net+adjustment_line_net;row_tax:=row_tax+adjustment_line_tax;row_total:=row_net+row_tax;
   IF row_net<0 OR row_tax<0 THEN RAISE EXCEPTION 'التسوية تنتج مبلغًا أو ضريبة سالبة';END IF;
   IF (CASE WHEN (advanced->>'minimumIncludesTax')::boolean THEN row_total ELSE row_net END)*fx < (entry->>'minimum')::numeric*(entry->>'quantity')::numeric THEN RAISE EXCEPTION 'سعر البند بعد التسوية أقل من الحد الأدنى';END IF;
   sar_line_net:=round(row_net*fx,2);sar_line_tax:=round(row_tax*fx,2);sar_net:=sar_net+sar_line_net;sar_tax:=sar_tax+sar_line_tax;sar_subtotal:=sar_subtotal+round((entry->>'gross')::numeric*fx,2);
   sar_adjustment_net:=sar_adjustment_net+round(adjustment_line_net*fx,2);sar_adjustment_tax:=sar_adjustment_tax+round(adjustment_line_tax*fx,2);
   net:=net+row_net;tax:=tax+row_tax;total:=total+row_total;adjustment_net:=adjustment_net+adjustment_line_net;adjustment_tax:=adjustment_tax+adjustment_line_tax;
   rows:=rows||jsonb_build_array(entry||jsonb_build_object('net',row_net,'tax',row_tax,'total',row_total,'sarNet',sar_line_net,'sarTax',sar_line_tax,'adjustmentNet',round(adjustment_line_net*fx,2),'adjustmentTax',round(adjustment_line_tax*fx,2)));
  END LOOP;
  final_rows:=rows;sar_total:=sar_net+sar_tax;sar_discount:=round((subtotal-after_rows+doc_discount)*fx,2);
  IF total<=0 OR total>1000000000 OR sar_total<=0 OR sar_total>1000000000 OR (NOT p_preview AND p_expected_total IS DISTINCT FROM total) THEN RAISE EXCEPTION 'راجع إجمالي الفاتورة قبل الإصدار';END IF;
  IF p_preview THEN RETURN jsonb_build_object('subtotal',subtotal,'discount',subtotal-after_rows+doc_discount,'tax',tax,'total',total,'lines',final_rows);END IF;
  credit_sar:=CASE WHEN p_source_id IS NULL AND coalesce((inv->>'applyCredit')::boolean,false) THEN least(sar_total,brand_finance_private.customer_credit_balance(p_cafe_id,customer.id)) ELSE 0 END;
  credit_foreign:=least(total,round(credit_sar/fx,2));deposit_amount:=round(CASE WHEN deposit_kind='percent' THEN total*deposit_value/100 ELSE deposit_value END,2);
  IF deposit_amount>total THEN RAISE EXCEPTION 'الدفعة المقدمة أكبر من إجمالي الفاتورة';END IF;
  paid:=CASE WHEN deposit_value>0 THEN CASE WHEN deposit_paid THEN deposit_amount ELSE 0 END WHEN aid IS NULL THEN 0 ELSE total-credit_foreign END;
  cash_sar:=CASE WHEN deposit_value=0 AND aid IS NOT NULL THEN sar_total-credit_sar ELSE round(paid*fx,2) END;
  IF cash_sar+credit_sar>sar_total THEN RAISE EXCEPTION 'الدفعة ورصيد العميل يتجاوزان المبلغ المستحق';END IF;
  display_number:=brand_finance_private.invoice_number_allocate(p_cafe_id,CASE WHEN p_source_id IS NULL THEN 'invoice' ELSE 'debit' END,advanced->CASE WHEN p_source_id IS NULL THEN 'numbering' ELSE 'debitNumbering' END,coalesce(inv->>'manualNumber',''));
  INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,account_id,warehouse_id,subtotal,discount,tax,total,paid,reference_id,note,created_by,created_at,vat_rate,tax_inclusive)
   VALUES(doc,p_cafe_id,'sale',customer.id,aid,wid,sar_subtotal,sar_discount,sar_tax,sar_total,cash_sar,p_source_id,left(coalesce(inv->>'note',''),1000),p_actor,issue_at,CASE WHEN tax=0 THEN 0 ELSE 15 END,inclusive) RETURNING number INTO n;
  journal_note:=CASE WHEN (advanced->>'journalTemplateEnabled')::boolean THEN replace(replace(replace(replace(advanced->>'journalTemplate','{number}',display_number),'{customer}',customer.name),'{date}',(issue_at AT TIME ZONE 'Asia/Riyadh')::date::text),'{total}',sar_total::text) ELSE '' END;journal_note:=left(journal_note,300);
  FOR entry IN SELECT value FROM jsonb_array_elements(final_rows) LOOP
   line_id:=gen_random_uuid();
   INSERT INTO public.bf_document_lines(id,cafe_id,document_id,product_id,name,quantity,unit_price,net,tax,cost,activity_kind,vat_rate,tax_category,exemption_reason)
    VALUES(line_id,p_cafe_id,doc,nullif(entry->>'productId','')::uuid,entry->>'name',(entry->>'quantity')::numeric,round((entry->>'price')::numeric*fx,2),(entry->>'sarNet')::numeric,(entry->>'sarTax')::numeric,0,entry->>'kind',(entry->>'vatRate')::numeric,entry->>'taxCategory',entry->>'exemptionReason')
    RETURNING bf_document_lines.cost,bf_document_lines.cost_status INTO cost,line_cost_status;
   IF p_source_id IS NULL AND entry->>'kind'='product' AND NOT(prefs->>'allowBelowCost')::boolean THEN
    IF line_cost_status IS DISTINCT FROM 'known' THEN RAISE EXCEPTION 'Invoice settings: known inventory cost required' USING ERRCODE='22023';END IF;
    IF (entry->>'sarNet')::numeric<cost THEN RAISE EXCEPTION 'Invoice settings: below inventory cost' USING ERRCODE='22023';END IF;
   END IF;
   IF adjustment_id IS NOT NULL AND ((entry->>'adjustmentNet')::numeric<>0 OR (entry->>'adjustmentTax')::numeric<>0) THEN INSERT INTO public.bf_invoice_adjustment_lines(cafe_id,document_id,line_id,account_id,net,tax) VALUES(p_cafe_id,doc,line_id,(adjustment_rule->>'accountId')::uuid,(entry->>'adjustmentNet')::numeric,(entry->>'adjustmentTax')::numeric);END IF;
   PERFORM brand_finance_private.invoice_line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'5000'),cost,0,NULL,journal_note);PERFORM brand_finance_private.invoice_line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'1200'),0,cost,NULL,journal_note);
  END LOOP;
  PERFORM brand_finance_private.invoice_line(p_cafe_id,doc,aid,cash_sar,0,NULL,journal_note);
  PERFORM brand_finance_private.invoice_line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'1100'),sar_total-cash_sar,0,customer.id,journal_note);
  PERFORM brand_finance_private.invoice_line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'4000'),0,sar_net-sar_adjustment_net,NULL,journal_note);
  IF sar_adjustment_net<>0 THEN PERFORM brand_finance_private.invoice_line(p_cafe_id,doc,(adjustment_rule->>'accountId')::uuid,greatest(-sar_adjustment_net,0),greatest(sar_adjustment_net,0),NULL,journal_note);END IF;
  PERFORM brand_finance_private.invoice_line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'2100'),0,sar_tax,NULL,journal_note);
  IF credit_sar>0 THEN PERFORM brand_finance_private.customer_credit_apply(p_cafe_id,doc,credit_sar);END IF;
  phone:=regexp_replace(translate(coalesce(customer.phone,''),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[^0-9]','','g');IF phone LIKE '00%' THEN phone:=substr(phone,3);END IF;IF phone~'^05[0-9]{8}$' THEN phone:='966'||substr(phone,2);ELSIF phone~'^5[0-9]{8}$' THEN phone:='966'||phone;END IF;
  IF coalesce(draft.payload->>'deliveryMethod','print') NOT IN('print','whatsapp','email','both') THEN RAISE EXCEPTION 'طريقة إرسال الفاتورة غير صالحة';END IF;
  IF draft.payload->>'deliveryMethod'='whatsapp' AND NOT((advanced->>'socialEnabled')::boolean AND advanced->'socialPlatforms' ? 'whatsapp') THEN RAISE EXCEPTION 'إرسال الواتساب غير مفعل في إعدادات الفواتير';END IF;
  IF draft.payload->>'deliveryMethod' IN('email','both') AND NOT(advanced->>'billingMethod' IN('email','both') OR ((advanced->>'socialEnabled')::boolean AND advanced->'socialPlatforms' ? 'email')) THEN RAISE EXCEPTION 'إرسال البريد الإلكتروني غير مفعل في إعدادات الفواتير';END IF;
  IF draft.payload->>'deliveryMethod'='whatsapp' AND phone!~'^9665[0-9]{8}$' THEN RAISE EXCEPTION 'أدخل رقم جوال سعودي صحيح للعميل قبل إرسال الواتساب';END IF;
  IF draft.payload->>'deliveryMethod' IN('email','both') AND coalesce(customer.email,'')!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'أكمل البريد الإلكتروني الصحيح للعميل';END IF;
  SELECT coalesce(jsonb_agg(x-ARRAY['sarNet','sarTax','adjustmentNet','adjustmentTax','minimum']), '[]') INTO final_rows FROM jsonb_array_elements(final_rows) x;
  result:=jsonb_build_object('id',doc,'number',n,'displayNumber',display_number,'type',invoice_type,'documentType',CASE WHEN p_source_id IS NULL THEN 'invoice' ELSE 'debit' END,'sourceId',p_source_id,'sourceNumber',coalesce((SELECT e.display_number FROM public.bf_invoice_extensions e WHERE e.document_id=p_source_id),source_doc.number::text),'reason',p_debit_reason,'issuedAt',issue_at,'supplyDate',supply_date,'seller',seller,
   'customer',jsonb_build_object('name',coalesce(nullif(customer.details->>'legalName',''),customer.name),'vatNumber',customer.tax_number,'address',buyer_address,'phone',phone,'email',customer.email),
   'lines',final_rows,'subtotal',subtotal,'discount',subtotal-after_rows+doc_discount,'tax',tax,'total',total,'paid',paid+credit_foreign,'cashPaid',paid,'creditApplied',credit_foreign,'taxInclusive',inclusive,'currency',currency_code,'exchangeRate',fx,'decimalDisplay',prefs->>'decimalDisplay',
   'sar',jsonb_build_object('subtotal',sar_subtotal,'discount',sar_discount,'tax',sar_tax,'total',sar_total,'paid',cash_sar+credit_sar,'cashPaid',cash_sar,'creditApplied',credit_sar),
   'adjustment',CASE WHEN adjustment_id IS NULL THEN NULL ELSE jsonb_build_object('typeId',adjustment_id,'amount',adjustment_amount,'kind',adjustment_rule->>'kind','taxable',(adjustment_rule->>'taxable')::boolean,'name',adjustment_rule->>'name','net',adjustment_net,'tax',adjustment_tax,'total',adjustment_net+adjustment_tax) END,
   'deposit',jsonb_build_object('kind',deposit_kind,'value',deposit_value,'amount',deposit_amount,'paid',deposit_paid),'shipping',jsonb_build_object('mode',shipping_mode,'address',shipping_address),'delivery',jsonb_build_object('confirmed',delivery_confirmed,'date',coalesce(delivery_date::text,'')),
   'attachments',files,'note',coalesce(inv->>'note',''),'extraFields',coalesce(draft.payload->'extraFields','[]'::jsonb),'template',draft.payload->>'template','deliveryMethod',coalesce(draft.payload->>'deliveryMethod','print'));
  INSERT INTO public.bf_company_invoices(document_id,cafe_id,draft_id,snapshot) VALUES(doc,p_cafe_id,p_draft_id,result);
  INSERT INTO public.bf_invoice_extensions(cafe_id,document_id,display_number,source_id,status_id,metadata,created_by) VALUES(p_cafe_id,doc,display_number,p_source_id,status_id,jsonb_build_object('currency',currency_code,'exchangeRate',fx,'reason',p_debit_reason),p_actor);
  RETURN result;
END $function$
;
CREATE OR REPLACE FUNCTION brand_finance_private.issue_company_invoice(p_cafe_id uuid,p_draft_id uuid,p_revision integer,p_expected_total numeric,p_source_id uuid DEFAULT NULL,p_debit_reason text DEFAULT '') RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT brand_finance_private.issue_company_invoice_actor(auth.uid(),false,p_cafe_id,p_draft_id,p_revision,p_expected_total,p_source_id,p_debit_reason) $$;
REVOKE ALL ON FUNCTION brand_finance_private.invoice_actor_role(uuid,uuid),brand_finance_private.issue_company_invoice_actor(uuid,boolean,uuid,uuid,integer,numeric,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
DO $draft_baseline$ BEGIN
 IF md5(pg_get_functiondef('public.brand_finance_save_invoice_draft(uuid,uuid,integer,jsonb)'::regprocedure))<>'c222e2e64e50308d534d25fcd896c54c' THEN RAISE EXCEPTION 'Unexpected invoice draft baseline';END IF;
END $draft_baseline$;
CREATE OR REPLACE FUNCTION public.brand_finance_save_invoice_draft(p_cafe_id uuid, p_id uuid, p_revision integer, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r text; existing public.bf_invoice_drafts%ROWTYPE; next_revision integer;
BEGIN
  r := brand_finance_private.role_for(p_cafe_id);
  IF auth.uid() IS NULL OR coalesce(r,'') NOT IN ('owner','manager','accountant') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF p_id IS NULL OR p_revision IS NULL OR p_revision < 0 OR p_payload IS NULL
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>100000
    OR jsonb_typeof(p_payload->'invoice') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_payload#>'{invoice,lines}') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'Invalid draft' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(p_payload#>'{invoice,lines}') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid lines' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60413));
  SELECT * INTO existing FROM public.bf_invoice_drafts WHERE id=p_id FOR UPDATE;
  IF FOUND THEN
    IF existing.cafe_id<>p_cafe_id THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
    -- Identical retries after an uncertain network response must not create another draft
    IF existing.payload=p_payload THEN RETURN jsonb_build_object('id',p_id,'revision',existing.revision); END IF;
    IF existing.revision<>p_revision THEN RAISE EXCEPTION 'Draft conflict' USING ERRCODE='40001'; END IF;
    UPDATE public.bf_invoice_drafts SET payload=p_payload,revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp()
      WHERE id=p_id RETURNING revision INTO next_revision;
  ELSE
    IF p_revision<>0 THEN RAISE EXCEPTION 'Draft conflict' USING ERRCODE='40001'; END IF;
    IF (SELECT count(*) FROM public.bf_invoice_drafts d WHERE d.cafe_id=p_cafe_id AND NOT EXISTS(SELECT 1 FROM public.bf_company_invoices i WHERE i.cafe_id=d.cafe_id AND i.draft_id=d.id))>=500 THEN RAISE EXCEPTION 'Draft limit reached'; END IF;
    INSERT INTO public.bf_invoice_drafts(id,cafe_id,payload,created_by,updated_by) VALUES(p_id,p_cafe_id,p_payload,auth.uid(),auth.uid());
    next_revision:=1;
  END IF;
  RETURN jsonb_build_object('id',p_id,'revision',next_revision);
END $function$
;

CREATE TABLE public.bf_recurring_invoices(
 id uuid PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id),number bigint GENERATED ALWAYS AS IDENTITY,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),payload jsonb NOT NULL,totals jsonb NOT NULL,
 status text NOT NULL CHECK(status IN('active','paused','completed','deleted')),actor_id uuid NOT NULL REFERENCES auth.users(id),
 generated_count integer NOT NULL DEFAULT 0 CHECK(generated_count>=0),next_date date,next_issue_date date,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),failure_count integer NOT NULL DEFAULT 0,last_error text,last_issued_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(cafe_id,id)
);
CREATE INDEX bf_recurring_due ON public.bf_recurring_invoices(next_attempt_at,next_issue_date,id) WHERE status='active';
CREATE INDEX bf_recurring_list ON public.bf_recurring_invoices(cafe_id,updated_at DESC,id) WHERE status<>'deleted';
CREATE INDEX bf_recurring_actor ON public.bf_recurring_invoices(actor_id);
CREATE TABLE public.bf_recurring_occurrences(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,subscription_id uuid NOT NULL,occurrence_index integer NOT NULL CHECK(occurrence_index>=0),
 scheduled_date date NOT NULL,due_date date NOT NULL,period_end date NOT NULL,draft_id uuid NOT NULL UNIQUE,document_id uuid NOT NULL UNIQUE,
 issued_at timestamptz NOT NULL DEFAULT now(),subscription_revision integer NOT NULL,
 FOREIGN KEY(cafe_id,subscription_id) REFERENCES public.bf_recurring_invoices(cafe_id,id),
 FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),UNIQUE(subscription_id,occurrence_index)
);
CREATE INDEX bf_recurring_history ON public.bf_recurring_occurrences(cafe_id,subscription_id,occurrence_index DESC);
CREATE TABLE public.bf_recurring_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,subscription_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 action text NOT NULL,note text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(cafe_id,subscription_id) REFERENCES public.bf_recurring_invoices(cafe_id,id)
);
CREATE INDEX bf_recurring_events_history ON public.bf_recurring_events(cafe_id,subscription_id,created_at DESC);
CREATE INDEX bf_recurring_events_actor ON public.bf_recurring_events(actor_id);
ALTER TABLE public.bf_recurring_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bf_recurring_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bf_recurring_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_recurring_invoices,public.bf_recurring_occurrences,public.bf_recurring_events FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.bf_recurring_occurrences FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.bf_recurring_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION brand_finance_private.recurring_date(anchor date,unit text,step integer,idx integer) RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE answer date;
BEGIN
 IF anchor IS NULL OR anchor<'1900-01-01'::date OR anchor>'9999-12-31'::date OR step IS NULL OR step NOT BETWEEN 1 AND 365 OR idx IS NULL OR idx NOT BETWEEN 0 AND 1000000 OR unit IS NULL OR unit NOT IN('day','week','month','year') THEN RAISE EXCEPTION 'راجع تاريخ وفترة التكرار';END IF;
 answer:=CASE unit WHEN 'day' THEN anchor+step*idx WHEN 'week' THEN anchor+7*step*idx WHEN 'month' THEN (anchor+make_interval(months=>step*idx))::date ELSE (anchor+make_interval(years=>step*idx))::date END;
 IF answer>'9999-12-31'::date THEN RAISE EXCEPTION 'تاريخ التكرار خارج النطاق المسموح';END IF;RETURN answer;
EXCEPTION WHEN datetime_field_overflow OR interval_field_overflow OR numeric_value_out_of_range THEN RAISE EXCEPTION 'تاريخ التكرار خارج النطاق المسموح';
END $$;
CREATE FUNCTION brand_finance_private.recurring_summary(r public.bf_recurring_invoices) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',r.id,'number',r.number,'revision',r.revision,'name',r.payload->>'name','customerName',p.name,'warehouseName',w.name,'interval',r.payload->'interval','unit',r.payload->>'unit',
 'subtotal',r.totals->'subtotal','discount',r.totals->'discount','tax',r.totals->'tax','total',r.totals->'total','generatedCount',r.generated_count,'count',r.payload->'count',
 'nextDate',r.next_date,'nextIssueDate',r.next_issue_date,'lastIssuedAt',r.last_issued_at,'lastError',r.last_error,'status',r.status,'updatedAt',r.updated_at)
 FROM public.bf_parties p LEFT JOIN public.bf_warehouses w ON w.cafe_id=r.cafe_id AND w.id::text=r.payload#>>'{document,invoice,warehouseId}' WHERE p.cafe_id=r.cafe_id AND p.id::text=r.payload#>>'{document,invoice,partyId}'
$$;
CREATE FUNCTION brand_finance_private.recurring_detail(r public.bf_recurring_invoices,off integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE history jsonb;upcoming jsonb:='[]';idx integer;day date;last_day date;end_index integer;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',h.id,'index',h.occurrence_index,'scheduledDate',h.scheduled_date,'issuedAt',h.issued_at,'invoiceId',h.document_id,'invoiceNumber',d.number,'displayNumber',i.snapshot->>'displayNumber','total',i.snapshot->'total','dueDate',h.due_date,'periodStart',h.scheduled_date,'periodEnd',h.period_end) ORDER BY h.occurrence_index DESC),'[]') INTO history
 FROM (SELECT * FROM public.bf_recurring_occurrences WHERE cafe_id=r.cafe_id AND subscription_id=r.id ORDER BY occurrence_index DESC LIMIT 30 OFFSET off) h JOIN public.bf_documents d ON d.cafe_id=h.cafe_id AND d.id=h.document_id JOIN public.bf_company_invoices i ON i.cafe_id=h.cafe_id AND i.document_id=h.document_id;
 end_index:=r.generated_count+4;IF (r.payload->>'count')::integer>0 THEN end_index:=least(end_index,(r.payload->>'count')::integer-1);END IF;
 IF r.status<>'deleted' THEN FOR idx IN r.generated_count..end_index LOOP
  day:=brand_finance_private.recurring_date((r.payload->>'firstDate')::date,r.payload->>'unit',(r.payload->>'interval')::integer,idx);
  last_day:=brand_finance_private.recurring_date((r.payload->>'firstDate')::date,r.payload->>'unit',(r.payload->>'interval')::integer,idx+1)-1;
  upcoming:=upcoming||jsonb_build_array(jsonb_build_object('index',idx,'date',day,'issueDate',day-(r.payload->>'leadDays')::integer,'dueDate',day+(r.payload->>'paymentTermsDays')::integer,'periodStart',day,'periodEnd',last_day));
 END LOOP;END IF;
 RETURN brand_finance_private.recurring_summary(r)||jsonb_build_object('payload',r.payload,'lines',r.totals->'lines','invoices',history,'historyTotal',r.generated_count,'historyOffset',off,'upcoming',upcoming);
END $$;
CREATE FUNCTION public.brand_finance_recurring_invoices(p_cafe_id uuid,p_id uuid DEFAULT NULL,p_filters jsonb DEFAULT '{}',p_history_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.bf_recurring_invoices%ROWTYPE;role_name text;lim integer;off integer;q text;filter_status text;party uuid;answer jsonb;cnt bigint;
BEGIN
 role_name:=brand_finance_private.role_for(p_cafe_id);IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 IF p_history_offset IS NULL OR p_history_offset NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION 'Invalid page';END IF;
 IF p_id IS NOT NULL THEN SELECT * INTO r FROM public.bf_recurring_invoices WHERE cafe_id=p_cafe_id AND id=p_id AND status<>'deleted';IF NOT FOUND THEN RETURN NULL;END IF;RETURN brand_finance_private.recurring_detail(r,p_history_offset);END IF;
 IF jsonb_typeof(p_filters) IS DISTINCT FROM 'object' OR octet_length(p_filters::text)>2000 THEN RAISE EXCEPTION 'Invalid filters';END IF;
 lim:=coalesce((p_filters->>'limit')::integer,30);off:=coalesce((p_filters->>'offset')::integer,0);q:=lower(trim(coalesce(p_filters->>'query','')));filter_status:=p_filters->>'status';party:=nullif(p_filters->>'partyId','')::uuid;
 IF lim NOT BETWEEN 1 AND 100 OR off NOT BETWEEN 0 AND 100000 OR length(q)>100 OR (filter_status IS NOT NULL AND filter_status NOT IN('active','paused','completed')) THEN RAISE EXCEPTION 'Invalid filters';END IF;
 WITH matches AS MATERIALIZED(SELECT s.id,s.updated_at FROM public.bf_recurring_invoices s JOIN public.bf_parties p ON p.cafe_id=s.cafe_id AND p.id::text=s.payload#>>'{document,invoice,partyId}' WHERE s.cafe_id=p_cafe_id AND s.status<>'deleted' AND (filter_status IS NULL OR s.status=filter_status) AND (party IS NULL OR p.id=party) AND (q='' OR position(q IN lower(s.payload->>'name'||' '||p.name||' '||s.number::text))>0)),page AS(SELECT * FROM matches ORDER BY updated_at DESC,id LIMIT lim OFFSET off)
 SELECT (SELECT count(*) FROM matches),coalesce((SELECT jsonb_agg(brand_finance_private.recurring_summary(s) ORDER BY s.updated_at DESC,s.id) FROM page JOIN public.bf_recurring_invoices s ON s.id=page.id),'[]') INTO cnt,answer;
 RETURN jsonb_build_object('items',answer,'total',cnt,'offset',off,'limit',lim);
END $$;

CREATE FUNCTION public.brand_finance_save_recurring_invoice(p_cafe_id uuid,p_id uuid,p_revision integer,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.bf_recurring_invoices%ROWTYPE;old public.bf_recurring_invoices%ROWTYPE;role_name text;draft uuid:=gen_random_uuid();doc jsonb;totals jsonb;cnt integer;step integer;lead integer;terms integer;first_day date;next_day date;desired text;entry jsonb;final_date date;
BEGIN
 role_name:=brand_finance_private.role_for(p_cafe_id);IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 IF p_id IS NULL OR p_revision IS NULL OR p_revision<0 OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>100000 OR p_payload::text~* '"[-+]?(nan|infinity)"' THEN RAISE EXCEPTION 'راجع بيانات الاشتراك';END IF;
 IF coalesce(length(trim(p_payload->>'name')),0) NOT BETWEEN 1 AND 160 OR jsonb_typeof(p_payload->'active') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_payload->'showPeriod') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'راجع اسم الاشتراك وحالته';END IF;
 cnt:=(p_payload->>'count')::integer;step:=(p_payload->>'interval')::integer;lead:=(p_payload->>'leadDays')::integer;terms:=(p_payload->>'paymentTermsDays')::integer;first_day:=(p_payload->>'firstDate')::date;
 IF cnt IS NULL OR cnt NOT BETWEEN 0 AND 10000 OR step IS NULL OR step NOT BETWEEN 1 AND 365 OR lead IS NULL OR lead NOT BETWEEN 0 AND 365 OR terms IS NULL OR terms NOT BETWEEN 0 AND 3650 THEN RAISE EXCEPTION 'راجع عدد مرات التكرار ومدة الاستحقاق';END IF;
 final_date:=brand_finance_private.recurring_date(first_day,p_payload->>'unit',step,CASE WHEN cnt=0 THEN 5 ELSE cnt END);
 IF final_date+terms>'9999-12-31'::date THEN RAISE EXCEPTION 'تاريخ الاستحقاق خارج النطاق المسموح';END IF;
 doc:=p_payload->'document';
 IF jsonb_typeof(doc) IS DISTINCT FROM 'object' OR doc#>>'{invoice,paymentKind}' IS DISTINCT FROM 'credit' OR coalesce(doc#>>'{invoice,accountId}','')<>'' OR coalesce((doc#>>'{invoice,applyCredit}')::boolean,false) OR coalesce(doc#>>'{invoice,manualNumber}','')<>'' OR coalesce(doc#>>'{invoice,currency}','SAR')<>'SAR' OR coalesce((doc#>>'{invoice,adjustment,amount}')::numeric,0)<>0 OR coalesce(doc#>>'{invoice,priceListId}','')<>'' OR coalesce((doc#>>'{deposit,value}')::numeric,0)<>0 OR coalesce((doc#>>'{deposit,paid}')::boolean,false) OR coalesce(doc->>'shipping','none')<>'none' OR coalesce((doc#>>'{delivery,confirmed}')::boolean,false) OR coalesce(doc->>'deliveryMethod','print')<>'print' OR coalesce(jsonb_array_length(doc->'attachments'),0)>0 OR coalesce(jsonb_array_length(doc->'extraFields'),0)>3 THEN RAISE EXCEPTION 'الفواتير الدورية آجلة دون تحصيل أو إرسال تلقائي أو مرفقات';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 SELECT * INTO old FROM public.bf_recurring_invoices WHERE id=p_id FOR UPDATE;
 IF FOUND THEN
  IF old.cafe_id<>p_cafe_id OR old.status='deleted' THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
  IF old.payload=p_payload THEN RETURN brand_finance_private.recurring_detail(old);END IF;
  IF old.revision<>p_revision THEN RAISE EXCEPTION 'Subscription conflict' USING ERRCODE='40001';END IF;
  IF old.generated_count>0 AND (old.payload->>'firstDate' IS DISTINCT FROM p_payload->>'firstDate' OR old.payload->>'unit' IS DISTINCT FROM p_payload->>'unit' OR old.payload->>'interval' IS DISTINCT FROM p_payload->>'interval') THEN RAISE EXCEPTION 'لا يمكن تغيير بداية التكرار أو فترته بعد إصدار الفواتير';END IF;
  IF cnt>0 AND cnt<old.generated_count THEN RAISE EXCEPTION 'عدد مرات التكرار أقل من الفواتير الصادرة';END IF;
 ELSE IF p_revision<>0 THEN RAISE EXCEPTION 'Subscription conflict' USING ERRCODE='40001';END IF;IF (SELECT count(*) FROM public.bf_recurring_invoices WHERE cafe_id=p_cafe_id AND status<>'deleted')>=500 THEN RAISE EXCEPTION 'تم بلوغ الحد الأقصى للاشتراكات';END IF;END IF;
 doc:=jsonb_set(doc,'{supplyDate}',to_jsonb((now() AT TIME ZONE 'Asia/Riyadh')::date::text));
 INSERT INTO public.bf_invoice_drafts(id,cafe_id,payload,created_by,updated_by) VALUES(draft,p_cafe_id,doc,auth.uid(),auth.uid());
 totals:=brand_finance_private.issue_company_invoice_actor(auth.uid(),true,p_cafe_id,draft,1,NULL,NULL,'');
 DELETE FROM public.bf_invoice_drafts WHERE id=draft;
 desired:=CASE WHEN cnt>0 AND coalesce(old.generated_count,0)>=cnt THEN 'completed' WHEN (p_payload->>'active')::boolean THEN 'active' ELSE 'paused' END;
 next_day:=CASE WHEN desired='completed' THEN NULL ELSE brand_finance_private.recurring_date(first_day,p_payload->>'unit',step,coalesce(old.generated_count,0)) END;
 INSERT INTO public.bf_recurring_invoices(id,cafe_id,payload,totals,status,actor_id,next_date,next_issue_date) VALUES(p_id,p_cafe_id,p_payload,totals,desired,auth.uid(),next_day,next_day-lead)
 ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,totals=excluded.totals,status=excluded.status,actor_id=excluded.actor_id,next_date=excluded.next_date,next_issue_date=excluded.next_issue_date,revision=bf_recurring_invoices.revision+1,next_attempt_at=now(),last_error=NULL,failure_count=0,updated_at=clock_timestamp() RETURNING * INTO r;
 INSERT INTO public.bf_recurring_events(cafe_id,subscription_id,actor_id,action) VALUES(p_cafe_id,p_id,auth.uid(),CASE WHEN old.id IS NULL THEN 'created' ELSE 'updated' END);
 RETURN brand_finance_private.recurring_detail(r);
END $$;

CREATE FUNCTION brand_finance_private.recurring_run_one(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.bf_recurring_invoices%ROWTYPE;today date:=(now() AT TIME ZONE 'Asia/Riyadh')::date;draft uuid:=gen_random_uuid();doc jsonb;answer jsonb;last_day date;due_day date;next_day date;fields jsonb;err text;errcode text;
BEGIN
 SELECT * INTO r FROM public.bf_recurring_invoices WHERE id=p_id;
 IF NOT FOUND OR NOT pg_try_advisory_xact_lock(hashtextextended(r.cafe_id::text,60412)) THEN RETURN jsonb_build_object('status','busy');END IF;
 SELECT * INTO r FROM public.bf_recurring_invoices WHERE id=p_id FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','busy');END IF;
 IF r.status<>'active' OR r.next_date IS NULL OR r.next_issue_date IS NULL OR r.next_issue_date>today OR r.next_attempt_at>now() THEN RETURN jsonb_build_object('status','not_due');END IF;
 BEGIN
  IF coalesce(brand_finance_private.invoice_actor_role(r.cafe_id,r.actor_id),'') NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'لم تعد صلاحية مصدر الاشتراك متاحة' USING ERRCODE='42501';END IF;
  last_day:=brand_finance_private.recurring_date((r.payload->>'firstDate')::date,r.payload->>'unit',(r.payload->>'interval')::integer,r.generated_count+1)-1;
  due_day:=r.next_date+(r.payload->>'paymentTermsDays')::integer;
  doc:=r.payload->'document';fields:=coalesce(doc->'extraFields','[]')||jsonb_build_array(jsonb_build_object('key',900001,'title','تاريخ الاستحقاق','value',due_day));
  IF (r.payload->>'showPeriod')::boolean THEN fields:=fields||jsonb_build_array(jsonb_build_object('key',900002,'title','فترة الخدمة','value',r.next_date::text||' — '||last_day::text));END IF;
  doc:=jsonb_set(jsonb_set(doc,'{supplyDate}',to_jsonb(least(r.next_date,today)::text)),'{extraFields}',fields);
  INSERT INTO public.bf_invoice_drafts(id,cafe_id,payload,created_by,updated_by) VALUES(draft,r.cafe_id,doc,r.actor_id,r.actor_id);
  answer:=brand_finance_private.issue_company_invoice_actor(r.actor_id,false,r.cafe_id,draft,1,(r.totals->>'total')::numeric,NULL,'');
  INSERT INTO public.bf_recurring_occurrences(cafe_id,subscription_id,occurrence_index,scheduled_date,due_date,period_end,draft_id,document_id,subscription_revision) VALUES(r.cafe_id,r.id,r.generated_count,r.next_date,due_day,last_day,draft,(answer->>'id')::uuid,r.revision);
  next_day:=CASE WHEN (r.payload->>'count')::integer>0 AND r.generated_count+1>=(r.payload->>'count')::integer THEN NULL ELSE last_day+1 END;
  UPDATE public.bf_recurring_invoices SET generated_count=generated_count+1,next_date=next_day,next_issue_date=next_day-(r.payload->>'leadDays')::integer,status=CASE WHEN next_day IS NULL THEN 'completed' ELSE status END,last_issued_at=clock_timestamp(),next_attempt_at=now(),failure_count=0,last_error=NULL,revision=revision+1,updated_at=clock_timestamp() WHERE id=r.id;
  INSERT INTO public.bf_recurring_events(cafe_id,subscription_id,actor_id,action) VALUES(r.cafe_id,r.id,r.actor_id,'issued');
  RETURN jsonb_build_object('status','issued','invoiceId',answer->>'id','number',answer->'number');
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS err=MESSAGE_TEXT,errcode=RETURNED_SQLSTATE;
  err:=CASE WHEN err~'[ء-ي]' THEN left(err,500) WHEN errcode='42501' THEN 'توقفت صلاحية الإصدار أو باقة النظام للعلامة' ELSE 'تعذر إصدار الفاتورة راجع بيانات الاشتراك وإعدادات الفواتير' END;
  UPDATE public.bf_recurring_invoices SET failure_count=failure_count+1,last_error=err,next_attempt_at=now()+make_interval(mins=>least(60,5*(failure_count+1))),updated_at=clock_timestamp() WHERE id=r.id;
  INSERT INTO public.bf_recurring_events(cafe_id,subscription_id,actor_id,action,note) VALUES(r.cafe_id,r.id,r.actor_id,'failed',err);
  RETURN jsonb_build_object('status','failed','message',err);
 END;
END $$;
CREATE FUNCTION public.brand_finance_transition_recurring_invoice(p_cafe_id uuid,p_id uuid,p_revision integer,p_operation text,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.bf_recurring_invoices%ROWTYPE;prior public.bf_requests%ROWTYPE;role_name text;command jsonb;answer jsonb;
BEGIN
 role_name:=brand_finance_private.role_for(p_cafe_id);IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 IF p_id IS NULL OR p_request_id IS NULL OR p_revision IS NULL OR p_revision<1 OR p_operation IS NULL OR p_operation NOT IN('pause','resume','delete','run') THEN RAISE EXCEPTION 'Invalid operation';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));command:=jsonb_build_object('id',p_id,'revision',p_revision,'operation',p_operation);
 SELECT * INTO prior FROM public.bf_requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN IF prior.operation<>'recurring_invoice' OR prior.payload<>command OR prior.created_by<>auth.uid() THEN RAISE EXCEPTION 'Request identity conflict';END IF;RETURN prior.result;END IF;
 SELECT * INTO r FROM public.bf_recurring_invoices WHERE cafe_id=p_cafe_id AND id=p_id AND status<>'deleted' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'الاشتراك غير متاح';END IF;IF r.revision<>p_revision THEN RAISE EXCEPTION 'Subscription conflict' USING ERRCODE='40001';END IF;
 IF p_operation='delete' AND r.generated_count>0 THEN RAISE EXCEPTION 'الاشتراك أصدر فواتير ويمكن إيقافه فقط';END IF;
 IF p_operation IN('resume','pause') AND r.status='completed' THEN RAISE EXCEPTION 'اكتمل عدد الفواتير المحدد';END IF;
 IF p_operation='run' THEN answer:=brand_finance_private.recurring_run_one(p_id);
 ELSE
 UPDATE public.bf_recurring_invoices SET status=CASE p_operation WHEN 'pause' THEN 'paused' WHEN 'resume' THEN 'active' ELSE 'deleted' END,payload=jsonb_set(payload,'{active}',to_jsonb(p_operation='resume')),actor_id=CASE WHEN p_operation='resume' THEN auth.uid() ELSE actor_id END,revision=revision+1,updated_at=clock_timestamp(),next_attempt_at=now() WHERE id=p_id;
 INSERT INTO public.bf_recurring_events(cafe_id,subscription_id,actor_id,action) VALUES(p_cafe_id,p_id,auth.uid(),p_operation);
 answer:=jsonb_build_object('status',CASE p_operation WHEN 'pause' THEN 'paused' WHEN 'resume' THEN 'active' ELSE 'deleted' END);
 END IF;
 IF p_operation<>'run' OR answer->>'status'='issued' THEN INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by) VALUES(p_cafe_id,p_request_id,'recurring_invoice',command,answer,auth.uid());END IF;RETURN answer;
END $$;
CREATE FUNCTION brand_finance_private.recurring_worker() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row record;answer jsonb;done integer:=0;failed integer:=0;
BEGIN
 IF NOT pg_try_advisory_xact_lock(60412020003) THEN RETURN jsonb_build_object('status','busy');END IF;
 FOR row IN SELECT id FROM public.bf_recurring_invoices WHERE status='active' AND next_issue_date<=(now() AT TIME ZONE 'Asia/Riyadh')::date AND next_attempt_at<=now() ORDER BY next_attempt_at,next_issue_date,id LIMIT 10 LOOP
  answer:=brand_finance_private.recurring_run_one(row.id);IF answer->>'status'='issued' THEN done:=done+1;ELSIF answer->>'status'='failed' THEN failed:=failed+1;END IF;
 END LOOP;RETURN jsonb_build_object('issued',done,'failed',failed);
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.recurring_date(date,text,integer,integer),brand_finance_private.recurring_summary(public.bf_recurring_invoices),brand_finance_private.recurring_detail(public.bf_recurring_invoices,integer),brand_finance_private.recurring_run_one(uuid),brand_finance_private.recurring_worker() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.brand_finance_recurring_invoices(uuid,uuid,jsonb,integer),public.brand_finance_save_recurring_invoice(uuid,uuid,integer,jsonb),public.brand_finance_transition_recurring_invoice(uuid,uuid,integer,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_recurring_invoices(uuid,uuid,jsonb,integer),public.brand_finance_save_recurring_invoice(uuid,uuid,integer,jsonb),public.brand_finance_transition_recurring_invoice(uuid,uuid,integer,text,uuid) TO authenticated;
CREATE EXTENSION IF NOT EXISTS pg_cron;
REVOKE ALL ON SCHEMA cron FROM PUBLIC,anon,authenticated,service_role;
-- Managed extension function ACLs belong to supabase_admin; schema denial is the access boundary.
SELECT cron.schedule('branda-recurring-invoices','* * * * *','SET statement_timeout=''40s''; SET lock_timeout=''5s''; SELECT brand_finance_private.recurring_worker()');

NOTIFY pgrst,'reload schema';
COMMIT;
