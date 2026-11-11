BEGIN;
CREATE TABLE public.bf_company_invoices (
  document_id uuid PRIMARY KEY REFERENCES public.bf_documents(id),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id),
  draft_id uuid NOT NULL UNIQUE REFERENCES public.bf_invoice_drafts(id),
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bf_company_invoices_cafe ON public.bf_company_invoices(cafe_id,created_at DESC);
ALTER TABLE public.bf_company_invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_company_invoices FROM PUBLIC,anon,authenticated;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.bf_company_invoices
  FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE FUNCTION brand_finance_private.freeze_issued_company_draft() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.bf_company_invoices WHERE draft_id=OLD.id) THEN RAISE EXCEPTION 'الفاتورة صادرة ولا يمكن تعديل مسودتها'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.freeze_issued_company_draft() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER bf_freeze_issued_company_draft BEFORE UPDATE OR DELETE ON public.bf_invoice_drafts
  FOR EACH ROW EXECUTE FUNCTION brand_finance_private.freeze_issued_company_draft();

CREATE TABLE public.bf_company_invoice_deliveries (
  document_id uuid PRIMARY KEY REFERENCES public.bf_company_invoices(document_id),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'sending' CHECK(status IN ('sending','queued','rejected','unknown')),
  lease_token uuid NOT NULL DEFAULT gen_random_uuid(),
  provider_message_id text CHECK(length(provider_message_id) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),finished_at timestamptz
  ,attempts integer NOT NULL DEFAULT 1 CHECK(attempts BETWEEN 1 AND 3)
);
CREATE INDEX bf_company_invoice_deliveries_cafe ON public.bf_company_invoice_deliveries(cafe_id,created_at DESC);
CREATE INDEX bf_company_invoice_deliveries_actor ON public.bf_company_invoice_deliveries(created_by);
ALTER TABLE public.bf_company_invoice_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_company_invoice_deliveries FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.brand_finance_issue_company_invoice(p_cafe_id uuid,p_draft_id uuid,p_revision integer,p_expected_total numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE draft public.bf_invoice_drafts%ROWTYPE; customer public.bf_parties%ROWTYPE; cfg public.bf_settings%ROWTYPE;
  inv jsonb; seller jsonb; entry jsonb; product public.menu_products%ROWTYPE; existing jsonb; doc uuid:=gen_random_uuid();
  aid uuid; wid uuid; n bigint; issue_at timestamptz:=clock_timestamp(); supply_date date; rows jsonb:='[]'; final_rows jsonb:='[]';
  qty numeric; price numeric; gross numeric; row_discount numeric; rate numeric; row_after numeric; remaining numeric; base_left numeric;
  allocated numeric; taxable numeric; row_tax numeric; row_net numeric; row_total numeric; cost numeric; paid numeric;
  subtotal numeric:=0; after_rows numeric:=0; doc_discount numeric; tax numeric:=0; total numeric:=0; net numeric:=0;
  discount_value numeric; inclusive boolean; result jsonb; buyer_address text; seller_tax text; phone text; invoice_type text;
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
  paid:=CASE WHEN aid IS NULL THEN 0 ELSE total END;
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
    'note',coalesce(inv->>'note',''),'extraFields',coalesce(draft.payload->'extraFields','[]'::jsonb),'template',draft.payload->>'template','deliveryMethod',coalesce(draft.payload->>'deliveryMethod','print'));
  INSERT INTO public.bf_company_invoices(document_id,cafe_id,draft_id,snapshot) VALUES(doc,p_cafe_id,p_draft_id,result);
  RETURN result;
END $$;

CREATE FUNCTION public.brand_finance_company_invoice(p_cafe_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN ('owner','manager','accountant') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  RETURN (SELECT snapshot FROM public.bf_company_invoices WHERE cafe_id=p_cafe_id AND (document_id=p_id OR draft_id=p_id));
END $$;

CREATE FUNCTION public.brand_finance_claim_company_delivery(p_cafe_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invoice jsonb; delivery public.bf_company_invoice_deliveries%ROWTYPE;
BEGIN
  invoice:=public.brand_finance_company_invoice(p_cafe_id,p_id);
  IF invoice IS NULL THEN RAISE EXCEPTION 'Invoice unavailable' USING ERRCODE='42501'; END IF;
  IF coalesce(invoice#>>'{customer,phone}','') !~ '^9665[0-9]{8}$' THEN RAISE EXCEPTION 'Invalid recipient'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60414));
  SELECT * INTO delivery FROM public.bf_company_invoice_deliveries WHERE document_id=(invoice->>'id')::uuid;
  IF FOUND THEN
    IF delivery.status='rejected' AND delivery.attempts<3 AND delivery.finished_at<clock_timestamp()-interval '30 seconds' THEN
      UPDATE public.bf_company_invoice_deliveries SET status='sending',lease_token=gen_random_uuid(),provider_message_id=NULL,finished_at=NULL,attempts=attempts+1
        WHERE document_id=delivery.document_id RETURNING * INTO delivery;
      RETURN jsonb_build_object('claimed',true,'id',delivery.document_id,'leaseToken',delivery.lease_token,'invoice',invoice);
    END IF;
    RETURN jsonb_build_object('claimed',false,'status',delivery.status);
  END IF;
  IF (SELECT count(*) FROM public.bf_company_invoice_deliveries WHERE cafe_id=p_cafe_id AND created_at>clock_timestamp()-interval '1 minute')>=20 THEN RAISE EXCEPTION 'Rate limited'; END IF;
  INSERT INTO public.bf_company_invoice_deliveries(document_id,cafe_id,created_by) VALUES((invoice->>'id')::uuid,p_cafe_id,auth.uid()) RETURNING * INTO delivery;
  RETURN jsonb_build_object('claimed',true,'id',delivery.document_id,'leaseToken',delivery.lease_token,'invoice',invoice);
END $$;
CREATE FUNCTION public.brand_finance_finish_company_delivery(p_id uuid,p_lease_token uuid,p_status text,p_provider_message_id text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('queued','rejected','unknown') OR (p_status='queued' AND coalesce(length(p_provider_message_id),0) NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'Invalid result'; END IF;
  UPDATE public.bf_company_invoice_deliveries SET status=p_status,provider_message_id=p_provider_message_id,finished_at=clock_timestamp()
    WHERE document_id=p_id AND lease_token=p_lease_token AND status='sending';
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_issue_company_invoice(uuid,uuid,integer,numeric),public.brand_finance_company_invoice(uuid,uuid),public.brand_finance_claim_company_delivery(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.brand_finance_issue_company_invoice(uuid,uuid,integer,numeric),public.brand_finance_company_invoice(uuid,uuid),public.brand_finance_claim_company_delivery(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.brand_finance_finish_company_delivery(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.brand_finance_finish_company_delivery(uuid,uuid,text,text) TO service_role;
COMMIT;
