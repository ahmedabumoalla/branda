-- Execute only inside an explicitly approved BEGIN ... ROLLBACK rehearsal.
-- Uses the existing test-cafe tenant; no real customer phone or outbound messages.
CREATE TEMP TABLE account_tax_proof(name text PRIMARY KEY,passed boolean DEFAULT true);
CREATE FUNCTION pg_temp.tax_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Account tax check failed: %',label;END IF;INSERT INTO account_tax_proof(name) VALUES(label);END $$;
DO $test$
DECLARE c uuid;actor uuid;outside uuid;warehouse uuid;bank uuid;drawer uuid;shift uuid:=gen_random_uuid();
 product uuid:=gen_random_uuid();item uuid:=gen_random_uuid();party uuid:=gen_random_uuid();draft uuid:=gen_random_uuid();second_draft uuid:=gen_random_uuid();
 pos_doc uuid;company_doc uuid;actor_doc uuid;refund_doc uuid:=gen_random_uuid();line uuid;old_doc uuid;
 cfg jsonb;old_general jsonb;settings jsonb;source jsonb;payload jsonb;body jsonb;result jsonb;invoice jsonb;actor_invoice jsonb;seller jsonb;old_seller jsonb;prior_invoice jsonb;
 revision integer;request uuid:=gen_random_uuid();denied boolean;old_hash text;message_count bigint;history_ids uuid[];new_name text:='Account tax rollback seller';
BEGIN
 SELECT id,owner_user_id INTO STRICT c,actor FROM public.cafes WHERE slug='test-cafe' AND deleted_at IS NULL;
 SELECT id INTO STRICT warehouse FROM public.bf_warehouses WHERE cafe_id=c AND active ORDER BY id LIMIT 1;
 SELECT id INTO STRICT bank FROM public.bf_accounts WHERE cafe_id=c AND kind='bank' AND active AND NOT coalesce(frozen,false) AND deleted_at IS NULL ORDER BY id LIMIT 1;
 SELECT id INTO STRICT drawer FROM public.bf_accounts WHERE cafe_id=c AND active AND is_cashier_drawer AND NOT coalesce(frozen,false) AND deleted_at IS NULL ORDER BY id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 SELECT array_agg(id),md5(coalesce(jsonb_agg(to_jsonb(d) ORDER BY id)::text,'')) INTO history_ids,old_hash FROM public.bf_documents d WHERE cafe_id=c;
 SELECT id,receipt_seller INTO old_doc,old_seller FROM public.bf_documents WHERE cafe_id=c AND kind='sale' ORDER BY created_at LIMIT 1;
 SELECT count(*) INTO message_count FROM public.bf_customer_message_jobs WHERE cafe_id=c;
 SELECT coalesce(s.payload,'{}'),s.revision INTO old_general,revision FROM public.erp_system_settings s WHERE s.cafe_id=c AND s.kind='general';
 revision:=coalesce(revision,0);
 cfg:=coalesce(old_general,'{}')||jsonb_build_object('revision',revision,'businessName',new_name,'phone','','mobile','','building','1234','street','Rollback street','secondary','5678','district','Rollback district','city','Riyadh','postal','12345','shortAddress','ABCD1234','country','SA','taxNumber',' 300000000000003 ','identifierType','','identifier','','currency','SAR','negativeFormat','minus','language','ar','weekStart',0,'dateFormat','dd/MM/yyyy','timezone','Asia/Riyadh','documentView','browser','firstName','','lastName','','defaultPriceListId',NULL);
 result:=public.erp_system_settings_write(c,'general',cfg,request);
 PERFORM pg_temp.tax_assert(public.erp_system_settings_write(c,'general',cfg,request)=result,'general exact retry idempotent');
 revision:=revision+1;
 seller:=brand_finance_private.company_seller(c,'{"name":"Stale draft","vatNumber":"312872746700003","address":"Stale draft address"}');
 PERFORM pg_temp.tax_assert(seller->>'name'=new_name AND seller->>'vatNumber'='300000000000003' AND seller->>'address'='1234، Rollback street، 5678، Rollback district، Riyadh، 12345، ABCD1234، المملكة العربية السعودية','company identity from central structured settings');
 PERFORM pg_temp.tax_assert(public.brand_finance_receipt_seller(c)=seller-'address','POS and company share authoritative name VAT');
 PERFORM pg_temp.tax_assert((SELECT payload->>'taxNumber' FROM public.erp_system_settings WHERE cafe_id=c AND kind='general')='300000000000003','VAT trimmed in central settings');
 denied:=false;BEGIN PERFORM public.erp_system_settings_write(c,'general',cfg||jsonb_build_object('revision',revision,'taxNumber','123'),gen_random_uuid());EXCEPTION WHEN invalid_parameter_value THEN denied:=true;END;
 PERFORM pg_temp.tax_assert(denied AND (SELECT s.revision FROM public.erp_system_settings s WHERE s.cafe_id=c AND s.kind='general')=revision,'invalid central VAT rejected before mutation');

 INSERT INTO public.bf_parties(id,cafe_id,name,kind,details) VALUES(party,c,'Account tax rollback customer','customer','{"customerType":"individual"}');
 INSERT INTO public.menu_products(id,cafe_id,name,price,available) VALUES(product,c,'Account tax rollback product',115,true);
 INSERT INTO public.bf_items(id,cafe_id,name,sku) VALUES(item,c,'Account tax rollback stock','TAX-'||item);
 INSERT INTO public.bf_item_product_links(cafe_id,item_id,product_id,quantity) VALUES(c,item,product,1);
 INSERT INTO public.bf_stock(cafe_id,warehouse_id,item_id,quantity,average_cost,value,cost_known) VALUES(c,warehouse,item,100,3,300,true);
 UPDATE public.bf_shifts SET status='closed',closed_at=now() WHERE cafe_id=c AND status IN('open','handover');
 INSERT INTO public.bf_shifts(id,cafe_id,user_id,account_id,opening_cash,expected_cash) VALUES(shift,c,actor,drawer,0,0);
 PERFORM public.brand_finance_execute(c,'settings','{"vatRate":15,"taxInclusive":true,"closedThrough":null}',gen_random_uuid());
 body:=jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('productId',product,'quantity',1,'expectedUnitPrice',115)),'accountId',bank,'warehouseId',warehouse,'shiftId',shift,'discount',0,'expectedTotal',115);
 request:=gen_random_uuid();result:=public.brand_finance_execute(c,'sale',body,request);pos_doc:=(result->>'id')::uuid;
 PERFORM pg_temp.tax_assert(EXISTS(SELECT 1 FROM public.bf_documents WHERE id=pos_doc AND receipt_seller=seller-'address' AND tax=15 AND total=115),'actual POS freezes central seller with original tax amounts');
 PERFORM pg_temp.tax_assert(public.brand_finance_execute(c,'sale',body,request)->>'id'=pos_doc::text,'POS retry remains one invoice');

 source:=public.brand_finance_order_sources(c);IF source#>>'{settings,required}'='true' THEN PERFORM public.brand_finance_order_sources(c,'save',jsonb_set(source->'settings','{required}','false'),(source->>'revision')::integer);END IF;
 settings:=public.brand_finance_invoice_settings(c,'get');
 PERFORM public.brand_finance_invoice_settings(c,'save',jsonb_set(jsonb_set(settings->'settings','{allowLineEditing}','true'),'{allowBelowCost}','true'),(settings->>'revision')::integer);
 payload:=jsonb_build_object('invoice',jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('key',0,'productId',product,'quantity',1,'price',115,'vatRate',15)),'warehouseId',warehouse,'partyId',party,'accountId','','paymentKind','credit','discountValue',0,'discountKind','amount','vatRate',15,'taxInclusive',true,'note','Account tax rollback'),
 'issuer',jsonb_build_object('name','Stale draft seller','vatNumber','312872746700003','address','Stale draft seller address'),'template','standard','deliveryMethod','print','deposit',jsonb_build_object('kind','amount','value',0,'paid',false),'shipping','none','delivery',jsonb_build_object('confirmed',false,'date',''),'attachments','[]'::jsonb,'extraFields','[]'::jsonb,'supplyDate',(now() AT TIME ZONE 'Asia/Riyadh')::date);
 PERFORM public.brand_finance_save_invoice_draft(c,draft,0,payload);
 invoice:=public.brand_finance_issue_company_invoice(c,draft,1,115);company_doc:=(invoice->>'id')::uuid;
 PERFORM pg_temp.tax_assert(invoice->'seller'=seller AND (invoice->>'tax')::numeric=15 AND (invoice->>'total')::numeric=115,'actual sales invoice replaces stale draft seller with central identity');
 PERFORM pg_temp.tax_assert(public.brand_finance_issue_company_invoice(c,draft,1,115)=invoice,'issued company retry returns immutable snapshot');
 PERFORM pg_temp.tax_assert((SELECT receipt_seller FROM public.bf_documents WHERE id=company_doc)=seller-'address','sales invoice ledger receipt agrees with immutable company seller');
 PERFORM public.brand_finance_save_invoice_draft(c,second_draft,0,payload);
 actor_invoice:=brand_finance_private.issue_company_invoice_actor(actor,false,c,second_draft,1,115,NULL,'');actor_doc:=(actor_invoice->>'id')::uuid;
 PERFORM pg_temp.tax_assert(actor_invoice->'seller'=seller,'canonical scheduled issuer uses same central identity');
 PERFORM pg_temp.tax_assert((SELECT quantity FROM public.bf_stock WHERE cafe_id=c AND warehouse_id=warehouse AND item_id=item)=97,'three original issuers consume exact stock once');
 PERFORM pg_temp.tax_assert(NOT EXISTS(SELECT document_id FROM public.bf_journal WHERE document_id IN(pos_doc,company_doc,actor_doc) GROUP BY document_id HAVING sum(debit-credit)<>0),'original journals remain balanced');

 cfg:=cfg||jsonb_build_object('revision',revision,'businessName','Updated account tax seller','taxNumber','315091506600003');
 PERFORM public.erp_system_settings_write(c,'general',cfg,gen_random_uuid());revision:=revision+1;
 PERFORM pg_temp.tax_assert((SELECT snapshot FROM public.bf_company_invoices WHERE document_id=company_doc)=invoice AND (SELECT receipt_seller FROM public.bf_documents WHERE id=pos_doc)=seller-'address','central change never rewrites issued company or POS snapshots');
 SELECT id INTO STRICT line FROM public.bf_document_lines WHERE document_id=company_doc LIMIT 1;
 PERFORM brand_finance_private.post_refund(c,jsonb_build_object('documentId',company_doc,'lines',jsonb_build_array(jsonb_build_object('lineId',line,'quantity',1)),'expectedTotal',115,'expectedPaid',0),refund_doc);
 PERFORM pg_temp.tax_assert((SELECT receipt_seller FROM public.bf_documents WHERE id=refund_doc)=seller-'address','refund preserves original seller after central change');
 denied:=false;BEGIN UPDATE public.bf_documents SET receipt_seller='{}' WHERE id=pos_doc;EXCEPTION WHEN OTHERS THEN denied:=true;END;PERFORM pg_temp.tax_assert(denied,'issued receipt seller immutable');
 denied:=false;BEGIN UPDATE public.bf_company_invoices SET snapshot='{}' WHERE document_id=company_doc;EXCEPTION WHEN OTHERS THEN denied:=true;END;PERFORM pg_temp.tax_assert(denied,'issued company invoice immutable');
 denied:=false;BEGIN PERFORM public.brand_finance_execute(c,'sale',body||jsonb_build_object('offlineExpectedVatRate',15,'offlineExpectedTaxInclusive',true,'localReceiptReference','TAX-'||product,'localCreatedAt',now(),'offlineExpectedReceiptSeller',seller-'address'),gen_random_uuid());EXCEPTION WHEN OTHERS THEN denied:=true;END;PERFORM pg_temp.tax_assert(denied,'old offline seller conflicts rather than silently acquiring new identity');
 PERFORM public.erp_system_settings_write(c,'general',cfg||jsonb_build_object('revision',revision,'taxNumber',''),gen_random_uuid());
 PERFORM pg_temp.tax_assert(brand_finance_private.company_seller(c,payload->'issuer')->>'vatNumber'='' AND public.brand_finance_receipt_seller(c)->>'vatNumber'='','explicit central VAT removal never falls back to draft VAT');
 PERFORM pg_temp.tax_assert((SELECT md5(coalesce(jsonb_agg(to_jsonb(d) ORDER BY id)::text,'')) FROM public.bf_documents d WHERE id=ANY(history_ids))=old_hash,'all preexisting financial documents byte unchanged');
 PERFORM pg_temp.tax_assert((SELECT count(*) FROM public.bf_customer_message_jobs WHERE cafe_id=c)=message_count,'no customer messages queued');
 SELECT id INTO outside FROM public.profiles WHERE status='active' AND id<>actor AND role<>'platform_admin' AND NOT EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=c AND user_id=profiles.id) LIMIT 1;
 IF outside IS NULL THEN RAISE EXCEPTION 'No outsider fixture';END IF;
 PERFORM set_config('request.jwt.claim.sub',outside::text,true);
 denied:=false;BEGIN PERFORM public.brand_finance_receipt_seller(c);EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;PERFORM pg_temp.tax_assert(denied,'cross tenant receipt identity denied');
 denied:=false;BEGIN PERFORM public.erp_system_settings_write(c,'general',cfg,gen_random_uuid());EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;PERFORM pg_temp.tax_assert(denied,'cross tenant central settings mutation denied');
 PERFORM set_config('request.jwt.claim.sub','',true);
 denied:=false;BEGIN PERFORM public.brand_finance_receipt_seller(c);EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;PERFORM pg_temp.tax_assert(denied,'anonymous receipt identity denied');
 PERFORM pg_temp.tax_assert(NOT has_function_privilege('authenticated','brand_finance_private.company_seller(uuid,jsonb)','EXECUTE') AND NOT has_function_privilege('anon','public.brand_finance_receipt_seller(uuid)','EXECUTE'),'private and anonymous grants remain closed');
 SET CONSTRAINTS ALL IMMEDIATE;
END $test$;
SELECT count(*) checks,jsonb_agg(jsonb_build_object('name',name,'passed',passed) ORDER BY name) evidence FROM account_tax_proof;
