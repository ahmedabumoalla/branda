-- Candidate / installed checks are enclosed by the runner in BEGIN / ROLLBACK
CREATE TEMP TABLE charge_proof(name text PRIMARY KEY,status text NOT NULL DEFAULT 'PASS');
CREATE FUNCTION pg_temp.charge_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Shipping charge check failed: %',label;END IF;INSERT INTO charge_proof(name) VALUES(label);END $$;
DO $$
DECLARE cafe uuid;actor uuid;warehouse uuid;party uuid:=gen_random_uuid();product uuid:=gen_random_uuid();item uuid:=gen_random_uuid();draft uuid:=gen_random_uuid();copied uuid:=gen_random_uuid();option_id uuid:=gen_random_uuid();revenue uuid:=gen_random_uuid();bank uuid:=gen_random_uuid();refund uuid;doc uuid;line_id uuid;foreign_cafe uuid;foreign_actor uuid;
 config jsonb;state jsonb;payload jsonb;selection jsonb;invoice jsonb;result jsonb;historical jsonb;settings jsonb;source jsonb;entry jsonb;rows jsonb;tax_number text;denied boolean;expected numeric;idx integer;before_stock numeric;count_before integer;settings_rev integer;closed_before date;note_id uuid:=gen_random_uuid();old_invoice uuid;staff_actor uuid;
BEGIN
 SELECT id,owner_user_id INTO STRICT cafe,actor FROM public.cafes WHERE slug='test-cafe';
 SELECT id INTO STRICT warehouse FROM public.bf_warehouses WHERE cafe_id=cafe AND active ORDER BY id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM pg_temp.charge_assert(public.brand_finance_invoice_shipping_charge_context(cafe)->>'enabled'='false','shipping disabled empty context');
 INSERT INTO public.bf_accounts(id,cafe_id,name,code,kind) VALUES(revenue,cafe,'العنوان الحصري - إيراد شحن اختبار','SHIP-'||revenue::text,'revenue'),(bank,cafe,'العنوان الحصري - بنك اختبار شحن','SHIP-'||bank::text,'bank');
 INSERT INTO public.bf_parties(id,cafe_id,name,kind,details) VALUES(party,cafe,'العنوان الحصري - عميل شحن اختبار','customer','{"street":"العنوان الحصري الرئيسي","city":"الرياض","country":"SA","shippingStreet":"العنوان الحصري الثانوي","shippingCity":"جدة","shippingCountry":"SA"}');
 INSERT INTO public.menu_products(id,cafe_id,name,price) VALUES(product,cafe,'العنوان الحصري - صنف شحن اختبار',20);
 INSERT INTO public.bf_items(id,cafe_id,name,sku) VALUES(item,cafe,'العنوان الحصري - مخزون شحن اختبار','SHIP-'||item::text);
 INSERT INTO public.bf_item_product_links(cafe_id,item_id,product_id,quantity) VALUES(cafe,item,product,2);
 INSERT INTO public.bf_stock(cafe_id,warehouse_id,item_id,quantity,average_cost,value,cost_known) VALUES(cafe,warehouse,item,10000,3,30000,true);
 SELECT coalesce(nullif(trim(s.tax_number),''),'300000000000003') INTO tax_number FROM public.cafe_settings s WHERE s.cafe_id=cafe;
 source:=public.brand_finance_order_sources(cafe);IF source#>>'{settings,required}'='true' THEN PERFORM public.brand_finance_order_sources(cafe,'save',jsonb_set(source->'settings','{required}','false'),(source->>'revision')::integer);END IF;
 settings:=public.brand_finance_invoice_settings(cafe,'get');
 settings:=public.brand_finance_invoice_settings(cafe,'save',jsonb_set(jsonb_set(jsonb_set(settings->'settings','{discountMode}','"both"'),'{allowLineEditing}','true'),'{allowBelowCost}','true'),(settings->>'revision')::integer);
 payload:=jsonb_build_object('invoice',jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('key',41,'productId',product,'quantity',2,'price',20,'vatRate',15)),'warehouseId',warehouse,'partyId',party,'accountId','','paymentKind','credit','discountValue',10,'discountKind','amount','vatRate',15,'taxInclusive',false,'note','العنوان الحصري - اختبار رسوم الشحن'),
 'issuer',jsonb_build_object('name','العنوان الحصري','vatNumber',coalesce(tax_number,'300000000000003'),'address','العنوان الحصري الرياض عنوان الاختبار'),'template','standard','deliveryMethod','print','deposit',jsonb_build_object('kind','amount','value',0,'paid',false),'shipping','auto','delivery',jsonb_build_object('confirmed',false,'date',''),'attachments','[]'::jsonb,'extraFields','[]'::jsonb,'supplyDate',(now() AT TIME ZONE 'Asia/Riyadh')::date);
 config:='{"enabled":true,"codServiceId":null}';PERFORM public.brand_finance_shipping_settings(cafe,'save',config,0);settings_rev:=1;
 PERFORM public.brand_finance_save_shipping_option(cafe,option_id,jsonb_build_object('name','العنوان الحصري - شحن','active',true,'fee',15,'taxRate',NULL,'displayOrder',0,'accountId',revenue,'description',''),0);
 PERFORM public.brand_finance_save_invoice_draft(cafe,draft,0,payload);
 selection:=jsonb_build_object('optionId',option_id,'name','العنوان الحصري - شحن','amount',15,'taxRate',15);
 result:=public.brand_finance_set_invoice_shipping_charge(cafe,draft,1,0,1,1,selection);
 PERFORM pg_temp.charge_assert(result->>'revision'='1' AND public.brand_finance_set_invoice_shipping_charge(cafe,draft,1,0,1,1,selection)=result,'selection persists amount override tax override and lost response retry');
 denied:=false;BEGIN PERFORM public.brand_finance_set_invoice_shipping_charge(cafe,draft,1,0,1,1,jsonb_set(selection,'{amount}','16'));EXCEPTION WHEN serialization_failure THEN denied:=true;END;
 PERFORM pg_temp.charge_assert(denied,'stale selection revision rejected');
 FOREACH entry IN ARRAY ARRAY[selection||'{"accountId":null}'::jsonb,jsonb_set(selection,'{amount}','-1'),jsonb_set(selection,'{amount}','1.001'),jsonb_set(selection,'{taxRate}','0'),jsonb_set(selection,'{name}','" "'),jsonb_set(selection,'{optionId}','"bad"')] LOOP
  denied:=false;BEGIN PERFORM public.brand_finance_set_invoice_shipping_charge(cafe,draft,1,1,1,1,entry);EXCEPTION WHEN invalid_parameter_value THEN denied:=true;END;
  IF NOT denied THEN RAISE EXCEPTION 'Malformed shipping selection accepted';END IF;
 END LOOP;
 PERFORM pg_temp.charge_assert(true,'strict charge amount tax fields account injection validation');
 PERFORM public.brand_finance_set_invoice_line_notes(cafe,draft,1,0,jsonb_build_array(jsonb_build_object('key',41,'notes',jsonb_build_array('العنوان الحصري - ملاحظة الشحن'))));
 denied:=false;BEGIN PERFORM public.brand_finance_issue_company_invoice(cafe,draft,1,34.5);EXCEPTION WHEN OTHERS THEN denied:=true;END;
 PERFORM pg_temp.charge_assert(denied AND NOT EXISTS(SELECT 1 FROM public.bf_company_invoices WHERE draft_id=draft),'expected total excludes shipping rejected atomically');
 invoice:=public.brand_finance_issue_company_invoice(cafe,draft,1,51.75);doc:=(invoice->>'id')::uuid;line_id:=(invoice#>>'{shippingCharge,lineId}')::uuid;
 PERFORM pg_temp.charge_assert((invoice->>'total')::numeric=51.75 AND (invoice->>'tax')::numeric=6.75 AND (invoice#>>'{shippingCharge,amount}')::numeric=15 AND (invoice#>>'{shippingCharge,tax}')::numeric=2.25,'fee net and tax added after line discount');
 PERFORM pg_temp.charge_assert(jsonb_array_length(invoice->'lines')=1 AND public.brand_finance_issued_line_notes(cafe,doc)#>>'{lines,0,key}'='41','shipping keeps snapshot lines and line notes index unchanged');
 PERFORM pg_temp.charge_assert(invoice#>>'{shipping,mode}'='auto' AND invoice#>>'{shipping,resolvedMode}'='secondary' AND invoice#>>'{shipping,address}' LIKE '%الثانوي%','auto address uses complete secondary');
 PERFORM pg_temp.charge_assert((SELECT count(*) FROM public.bf_document_lines WHERE document_id=doc)=2 AND EXISTS(SELECT 1 FROM public.bf_document_lines WHERE id=line_id AND product_id IS NULL AND activity_kind='service' AND cost=0 AND net=15 AND tax=2.25),'canonical no stock service charge');
 PERFORM pg_temp.charge_assert((SELECT quantity FROM public.bf_stock WHERE cafe_id=cafe AND warehouse_id=warehouse AND item_id=item)=9996 AND (SELECT sum(debit-credit) FROM public.bf_journal WHERE document_id=doc)=0 AND (SELECT sum(credit-debit) FROM public.bf_journal WHERE document_id=doc AND account_id=revenue)=15,'stock only products balanced custom revenue');
 historical:=public.brand_finance_issued_shipping_charge(cafe,doc);
 PERFORM pg_temp.charge_assert(historical->'charge'=invoice->'shippingCharge' AND public.brand_finance_issue_company_invoice(cafe,draft,1,51.75)=invoice,'immutable snapshot and issuer retry');
 denied:=false;BEGIN UPDATE public.bf_invoice_shipping_charges SET snapshot='{}' WHERE document_id=doc;EXCEPTION WHEN OTHERS THEN denied:=true;END;
 PERFORM pg_temp.charge_assert(denied,'historical charge immutable');
 PERFORM public.brand_finance_save_invoice_draft(cafe,copied,0,payload);
 result:=public.brand_finance_copy_invoice_shipping_charge(cafe,doc,copied,1);
 PERFORM pg_temp.charge_assert(result->'selection'=selection AND public.brand_finance_copy_invoice_shipping_charge(cafe,doc,copied,1)=result,'copy editable charge safely and retry');
 -- Disabling cannot silently remove the draft quote or rewrite an issued invoice
 PERFORM public.brand_finance_shipping_settings(cafe,'save',jsonb_set(config,'{enabled}','false'),1);
 PERFORM pg_temp.charge_assert(public.brand_finance_set_invoice_shipping_charge(cafe,copied,1,1,1,1,selection)->'selection'=selection,'disabled unchanged draft selection retained');
 denied:=false;BEGIN PERFORM public.brand_finance_issue_company_invoice(cafe,copied,1,51.75);EXCEPTION WHEN invalid_parameter_value THEN denied:=true;END;
 PERFORM pg_temp.charge_assert(denied AND public.brand_finance_issued_shipping_charge(cafe,doc)=historical,'disabled issue clear failure old snapshot unchanged');
 PERFORM public.brand_finance_set_invoice_shipping_charge(cafe,copied,1,1,2,NULL,NULL);
 PERFORM pg_temp.charge_assert(public.brand_finance_issue_company_invoice(cafe,copied,1,34.5)->'shippingCharge'='null'::jsonb,'disabled charge can be removed and invoice issued');
 PERFORM public.brand_finance_shipping_settings(cafe,'save',config,2);settings_rev:=3;
 -- Partial and remaining fee refunds reverse original custom revenue with no stock
 refund:=gen_random_uuid();PERFORM brand_finance_private.post_refund(cafe,jsonb_build_object('documentId',doc,'lines',jsonb_build_array(jsonb_build_object('lineId',line_id,'quantity',0.5)),'expectedTotal',8.63,'expectedPaid',0),refund);
 PERFORM pg_temp.charge_assert((SELECT total FROM public.bf_documents WHERE id=refund)=8.63 AND (SELECT sum(debit-credit) FROM public.bf_journal WHERE document_id=refund)=0 AND (SELECT sum(debit-credit) FROM public.bf_journal WHERE document_id=refund AND account_id=revenue)=7.5 AND NOT EXISTS(SELECT 1 FROM public.bf_movements WHERE document_id=refund),'partial shipping refund proportional tax custom revenue no stock');
 SELECT count(*) INTO count_before FROM public.bf_journal WHERE document_id=refund;PERFORM brand_finance_private.shipping_refund_revenue(cafe,refund);
 PERFORM pg_temp.charge_assert((SELECT count(*) FROM public.bf_journal WHERE document_id=refund)=count_before,'refund revenue extension idempotent');
 refund:=gen_random_uuid();PERFORM brand_finance_private.post_refund(cafe,jsonb_build_object('documentId',doc,'lines',jsonb_build_array(jsonb_build_object('lineId',line_id,'quantity',0.5)),'expectedTotal',8.62,'expectedPaid',0),refund);
 PERFORM pg_temp.charge_assert((SELECT sum(net+tax) FROM public.bf_invoice_shipping_refunds WHERE source_document_id=doc)=17.25,'partial refunds consume exact remaining fee and tax rounding');
 denied:=false;BEGIN PERFORM brand_finance_private.post_refund(cafe,jsonb_build_object('documentId',doc,'lines',jsonb_build_array(jsonb_build_object('lineId',line_id,'quantity',0.001)),'expectedTotal',0,'expectedPaid',0),gen_random_uuid());EXCEPTION WHEN OTHERS THEN denied:=true;END;
 PERFORM pg_temp.charge_assert(denied,'shipping cannot be refunded twice');
 -- tax blank, inclusive goods, zero quote and payment/deposit calculations
 selection:=jsonb_build_object('optionId',NULL,'name','العنوان الحصري - مخصص','amount',15,'taxRate',NULL);
 FOR idx IN 1..5 LOOP
  draft:=gen_random_uuid();entry:=jsonb_set(payload,'{invoice,discountValue}','0');entry:=jsonb_set(entry,'{shipping}','"none"');
  IF idx=2 THEN entry:=jsonb_set(entry,'{invoice,taxInclusive}','true');END IF;
  IF idx=3 THEN selection:=jsonb_set(selection,'{amount}','0');END IF;
  IF idx=4 THEN selection:=jsonb_set(jsonb_set(selection,'{amount}','15'),'{taxRate}','15');entry:=jsonb_set(jsonb_set(entry,'{invoice,accountId}',to_jsonb(bank::text)),'{invoice,paymentKind}','"bank"');entry:=jsonb_set(entry,'{deposit}','{"kind":"percent","value":50,"paid":true}');END IF;
  IF idx=5 THEN entry:=jsonb_set(entry,'{invoice,taxInclusive}','true');END IF;
  PERFORM public.brand_finance_save_invoice_draft(cafe,draft,0,entry);PERFORM public.brand_finance_set_invoice_shipping_charge(cafe,draft,1,0,settings_rev,NULL,selection);
  expected:=CASE idx WHEN 1 THEN 61 WHEN 2 THEN 55 WHEN 3 THEN 46 WHEN 4 THEN 63.25 ELSE 57.25 END;
  invoice:=public.brand_finance_issue_company_invoice(cafe,draft,1,expected);
  PERFORM pg_temp.charge_assert((invoice->>'total')::numeric=expected AND (SELECT sum(debit-credit) FROM public.bf_journal WHERE document_id=(invoice->>'id')::uuid)=0,'canonical fee money scenario '||idx);
  IF idx=3 THEN PERFORM pg_temp.charge_assert(invoice#>>'{shippingCharge,lineId}' IS NULL,'zero quote preserved without zero canonical line');END IF;
  IF idx=4 THEN PERFORM pg_temp.charge_assert((invoice#>>'{deposit,amount}')::numeric=31.63 AND (invoice->>'paid')::numeric=31.63,'deposit percent includes shipping total');END IF;
  IF idx=5 THEN
   PERFORM pg_temp.charge_assert((invoice#>>'{shippingCharge,amount}')::numeric=15 AND (invoice#>>'{shippingCharge,tax}')::numeric=2.25 AND (invoice#>>'{sar,subtotal}')::numeric=57.25 AND (SELECT unit_price FROM public.bf_document_lines WHERE id=(invoice#>>'{shippingCharge,lineId}')::uuid)=17.25,'inclusive goods keep shipping fee net and canonical gross subtotal consistent');
   refund:=gen_random_uuid();PERFORM brand_finance_private.post_refund(cafe,jsonb_build_object('documentId',invoice->>'id','lines',jsonb_build_array(jsonb_build_object('lineId',invoice#>>'{shippingCharge,lineId}','quantity',1)),'expectedTotal',17.25,'expectedPaid',0),refund);
   PERFORM pg_temp.charge_assert((SELECT subtotal FROM public.bf_documents WHERE id=refund)=17.25 AND (SELECT discount FROM public.bf_documents WHERE id=refund)=0 AND (SELECT tax FROM public.bf_documents WHERE id=refund)=2.25,'inclusive fee refund keeps gross subtotal tax and zero discount');
  END IF;
 END LOOP;
 -- 99 product rows + fee remains a complete 100-row return; 100 + fee explicitly blocked
 selection:=jsonb_set(selection,'{taxRate}','null');
 FOR idx IN 99..100 LOOP
  draft:=gen_random_uuid();SELECT jsonb_agg(jsonb_build_object('key',n,'productId',product,'quantity',1,'price',20,'vatRate',15)) INTO rows FROM generate_series(1,idx) n;
  entry:=jsonb_set(jsonb_set(jsonb_set(payload,'{invoice,lines}',rows),'{invoice,discountValue}','0'),'{shipping}','"none"');
  PERFORM public.brand_finance_save_invoice_draft(cafe,draft,0,entry);PERFORM public.brand_finance_set_invoice_shipping_charge(cafe,draft,1,0,settings_rev,NULL,selection);
  IF idx=100 THEN denied:=false;BEGIN PERFORM public.brand_finance_issue_company_invoice(cafe,draft,1,2315);EXCEPTION WHEN invalid_parameter_value THEN denied:=true;END;PERFORM pg_temp.charge_assert(denied AND NOT EXISTS(SELECT 1 FROM public.bf_company_invoices WHERE draft_id=draft),'100 ordinary lines plus positive fee rejected before posting');
  ELSE invoice:=public.brand_finance_issue_company_invoice(cafe,draft,1,2292);refund:=gen_random_uuid();PERFORM brand_finance_private.post_refund(cafe,jsonb_build_object('documentId',invoice->>'id','expectedTotal',2292,'expectedPaid',0),refund);PERFORM pg_temp.charge_assert((SELECT count(*) FROM public.bf_document_lines WHERE document_id=refund)=100 AND (SELECT total FROM public.bf_documents WHERE id=refund)=2292,'99 ordinary plus shipping full return 100 canonical lines');END IF;
 END LOOP;
 -- Currency conversion rounds fee net and fee tax independently
 settings:=public.brand_finance_invoice_settings(cafe,'get');
 settings:=public.brand_finance_invoice_settings(cafe,'save',jsonb_set(settings->'settings','{advanced,currencies}','[{"code":"SAR","rate":1},{"code":"USD","rate":3.75}]'),(settings->>'revision')::integer);
 draft:=gen_random_uuid();entry:=jsonb_set(jsonb_set(payload,'{invoice,currency}','"USD"'),'{invoice,exchangeRate}','3.75');
 selection:=jsonb_build_object('optionId',NULL,'name','العنوان الحصري - شحن عملة','amount',10.01,'taxRate',15);
 PERFORM public.brand_finance_save_invoice_draft(cafe,draft,0,entry);PERFORM public.brand_finance_set_invoice_shipping_charge(cafe,draft,1,0,settings_rev,NULL,selection);
 invoice:=public.brand_finance_issue_company_invoice(cafe,draft,1,46.01);
 PERFORM pg_temp.charge_assert(invoice#>'{shippingCharge,sar}'='{"amount":37.54,"tax":5.63,"total":43.17}'::jsonb AND (invoice#>>'{sar,total}')::numeric=172.55 AND (SELECT sum(debit-credit) FROM public.bf_journal WHERE document_id=(invoice->>'id')::uuid)=0,'foreign shipping separate net tax rounding and balanced journal');
 -- Service COD is an immutable rendering tag only
 settings:=public.brand_finance_invoice_settings(cafe,'get');
 settings:=public.brand_finance_invoice_settings(cafe,'save',jsonb_set(settings->'settings','{advanced,productPolicies}',(settings#>'{settings,advanced,productPolicies}')||jsonb_build_array(jsonb_build_object('productId',product,'kind','service','minimumPrice',0,'vatRate',15,'taxCategory','S','exemptionReason',''))),(settings->>'revision')::integer);
 config:=jsonb_set(config,'{codServiceId}',to_jsonb(product::text));PERFORM public.brand_finance_shipping_settings(cafe,'save',config,settings_rev);settings_rev:=settings_rev+1;
 draft:=gen_random_uuid();entry:=jsonb_set(payload,'{shipping}','"auto"');UPDATE public.bf_parties SET details=jsonb_set(details,'{shippingCountry}','" "') WHERE id=party;
 PERFORM public.brand_finance_save_invoice_draft(cafe,draft,0,entry);invoice:=public.brand_finance_issue_company_invoice(cafe,draft,1,34.5);old_invoice:=(invoice->>'id')::uuid;
 PERFORM pg_temp.charge_assert(public.brand_finance_invoice_shipping_charge_context(cafe)->>'codServiceId'=product::text AND invoice->'codServiceLineIndices'='[0]' AND invoice#>>'{shipping,resolvedMode}'='main' AND (invoice->>'total')::numeric=34.5,'COD context and historical indices preserve ordinary service amount automatic main fallback');
 copied:=gen_random_uuid();PERFORM public.brand_finance_save_invoice_draft(cafe,copied,0,entry);PERFORM pg_temp.charge_assert(public.brand_finance_copy_invoice_shipping_charge(cafe,old_invoice,copied,1)->'selection'='null'::jsonb,'copy no charge invoice keeps no charge');
 -- Customer credit remains canonical and includes shipping in the receivable
 entry:=jsonb_build_object('partyId',party,'warehouseId',warehouse,'date',(now() AT TIME ZONE 'Asia/Riyadh')::date,'issueDate',(now() AT TIME ZONE 'Asia/Riyadh')::date,'salespersonId',NULL,'sourceInvoiceId',NULL,'reason','العنوان الحصري - رصيد اختبار شحن','note','','terms','','template','standard','deliveryMethod','print','stockRequired',false,'discountValue',0,'discountKind','amount','vatRate',15,'taxInclusive',false,'lines',jsonb_build_array(jsonb_build_object('key',1,'productId',product,'quantity',1,'price',30,'discount',0,'discountKind','amount')));
 result:=public.brand_finance_save_credit_note(cafe,note_id,0,entry);PERFORM public.brand_finance_transition_credit_note(cafe,note_id,(result->>'revision')::integer,'issue',gen_random_uuid(),'');
 PERFORM pg_temp.charge_assert(brand_finance_private.customer_credit_balance(cafe,party)=34.5,'canonical credit fixture issued without stock');
 draft:=gen_random_uuid();entry:=jsonb_set(payload,'{invoice,applyCredit}','true');selection:=jsonb_build_object('optionId',NULL,'name','العنوان الحصري - شحن رصيد','amount',15,'taxRate',15);
 PERFORM public.brand_finance_save_invoice_draft(cafe,draft,0,entry);PERFORM public.brand_finance_set_invoice_shipping_charge(cafe,draft,1,0,settings_rev,NULL,selection);invoice:=public.brand_finance_issue_company_invoice(cafe,draft,1,51.75);
 PERFORM pg_temp.charge_assert((invoice->>'creditApplied')::numeric=34.5 AND (invoice->>'paid')::numeric=34.5 AND brand_finance_private.customer_credit_balance(cafe,party)=0 AND (SELECT sum(debit-credit) FROM public.bf_journal WHERE document_id=(invoice->>'id')::uuid)=0,'customer credit applies canonically to total including fee');
 -- Account, option, draft and closed-period guard failures retain the draft and post nothing
 draft:=gen_random_uuid();PERFORM public.brand_finance_save_invoice_draft(cafe,draft,0,payload);selection:=jsonb_build_object('optionId',option_id,'name','العنوان الحصري - شحن','amount',15,'taxRate',15);PERFORM public.brand_finance_set_invoice_shipping_charge(cafe,draft,1,0,settings_rev,1,selection);
 UPDATE public.bf_accounts SET frozen=true WHERE id=revenue;
 denied:=false;BEGIN PERFORM public.brand_finance_issue_company_invoice(cafe,draft,1,51.75);EXCEPTION WHEN invalid_parameter_value THEN denied:=true;END;
 PERFORM pg_temp.charge_assert(denied AND NOT EXISTS(SELECT 1 FROM public.bf_company_invoices WHERE draft_id=draft),'frozen revenue account blocks atomic issuance');UPDATE public.bf_accounts SET frozen=false WHERE id=revenue;
 UPDATE public.bf_shipping_options SET active=false WHERE id=option_id;
 denied:=false;BEGIN PERFORM public.brand_finance_issue_company_invoice(cafe,draft,1,51.75);EXCEPTION WHEN invalid_parameter_value THEN denied:=true;END;
 PERFORM pg_temp.charge_assert(denied,'inactive shipping option rejects issuance');
 copied:=gen_random_uuid();PERFORM public.brand_finance_save_invoice_draft(cafe,copied,0,payload);
 denied:=false;BEGIN PERFORM public.brand_finance_copy_invoice_shipping_charge(cafe,doc,copied,1);EXCEPTION WHEN invalid_parameter_value THEN denied:=true;END;
 PERFORM pg_temp.charge_assert(denied,'inactive historic option copy requires explicit user choice');UPDATE public.bf_shipping_options SET active=true WHERE id=option_id;
 UPDATE public.bf_shipping_options SET revision=2 WHERE id=option_id;denied:=false;BEGIN PERFORM public.brand_finance_issue_company_invoice(cafe,draft,1,51.75);EXCEPTION WHEN serialization_failure THEN denied:=true;END;PERFORM pg_temp.charge_assert(denied,'changed option revision blocks stale draft');UPDATE public.bf_shipping_options SET revision=1 WHERE id=option_id;
 PERFORM public.brand_finance_save_invoice_draft(cafe,draft,1,jsonb_set(payload,'{invoice,note}','"العنوان الحصري - تحديث مسودة"'));denied:=false;BEGIN PERFORM public.brand_finance_issue_company_invoice(cafe,draft,2,51.75);EXCEPTION WHEN serialization_failure THEN denied:=true;END;PERFORM pg_temp.charge_assert(denied,'stale shipping draft binding blocks issuance');
 PERFORM public.brand_finance_set_invoice_shipping_charge(cafe,draft,2,0,settings_rev,1,selection);
 SELECT closed_through INTO closed_before FROM public.bf_settings WHERE cafe_id=cafe;UPDATE public.bf_settings SET closed_through=(now() AT TIME ZONE 'Asia/Riyadh')::date WHERE cafe_id=cafe;
 denied:=false;BEGIN PERFORM public.brand_finance_issue_company_invoice(cafe,draft,2,51.75);EXCEPTION WHEN OTHERS THEN denied:=true;END;
 PERFORM pg_temp.charge_assert(denied AND NOT EXISTS(SELECT 1 FROM public.bf_company_invoices WHERE draft_id=draft),'closed financial period still blocks shipping invoice');UPDATE public.bf_settings SET closed_through=closed_before WHERE cafe_id=cafe;
 invoice:=public.brand_finance_issue_company_invoice(cafe,draft,2,51.75);PERFORM pg_temp.charge_assert((invoice->>'total')::numeric=51.75,'unchanged selection refresh binds updated draft revision');
 SELECT c.id,c.owner_user_id INTO foreign_cafe,foreign_actor FROM public.cafes c WHERE c.id<>cafe AND c.owner_user_id<>actor AND c.deleted_at IS NULL LIMIT 1;
 denied:=false;BEGIN PERFORM public.brand_finance_invoice_shipping_charge_context(foreign_cafe,draft);EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 PERFORM pg_temp.charge_assert(denied,'cross tenant context denied');
 SELECT p.id INTO STRICT staff_actor FROM public.profiles p WHERE p.id<>actor AND p.role<>'platform_admin' AND p.status='active' AND NOT EXISTS(SELECT 1 FROM public.bf_staff s WHERE s.cafe_id=cafe AND s.user_id=p.id) LIMIT 1;
 INSERT INTO public.bf_staff(cafe_id,user_id,name,role) VALUES(cafe,staff_actor,'العنوان الحصري - محاسب اختبار رسوم','accountant');PERFORM set_config('request.jwt.claim.sub',staff_actor::text,true);
 copied:=gen_random_uuid();PERFORM public.brand_finance_save_invoice_draft(cafe,copied,0,payload);result:=public.brand_finance_set_invoice_shipping_charge(cafe,copied,1,0,settings_rev,1,selection);
 PERFORM pg_temp.charge_assert(result->'selection'=selection AND public.brand_finance_invoice_shipping_charge_context(cafe,copied)->>'hasSelection'='true','accountant may save and read manual charge');
 UPDATE public.bf_staff SET role='auditor' WHERE cafe_id=cafe AND user_id=staff_actor;
 PERFORM pg_temp.charge_assert(public.brand_finance_invoice_shipping_charge_context(cafe,copied)->'selection'=selection,'auditor may read charge');
 denied:=false;BEGIN PERFORM public.brand_finance_set_invoice_shipping_charge(cafe,copied,1,1,settings_rev,NULL,NULL);EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;PERFORM pg_temp.charge_assert(denied,'auditor cannot change charge');
 UPDATE public.bf_staff SET role='cashier' WHERE cafe_id=cafe AND user_id=staff_actor;
 denied:=false;BEGIN PERFORM public.brand_finance_invoice_shipping_charge_context(cafe,copied);EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;PERFORM pg_temp.charge_assert(denied,'cashier cannot read manual charge');
 PERFORM set_config('request.jwt.claim.sub','',true);denied:=false;BEGIN PERFORM public.brand_finance_invoice_shipping_charge_context(cafe);EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 PERFORM pg_temp.charge_assert(denied,'anonymous context denied');
 PERFORM pg_temp.charge_assert(NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('brand_finance_invoice_shipping_charge_context','brand_finance_set_invoice_shipping_charge','brand_finance_issued_shipping_charge','brand_finance_copy_invoice_shipping_charge') AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('service_role',p.oid,'EXECUTE') OR NOT has_function_privilege('authenticated',p.oid,'EXECUTE'))),'public RPC least privilege');
 PERFORM pg_temp.charge_assert(NOT EXISTS(SELECT 1 FROM pg_class WHERE oid IN('public.bf_invoice_shipping_drafts'::regclass,'public.bf_invoice_shipping_charges'::regclass,'public.bf_invoice_shipping_refunds'::regclass) AND (NOT relrowsecurity OR has_table_privilege('authenticated',oid,'SELECT'))),'shipping financial history private RLS');
 SET CONSTRAINTS ALL IMMEDIATE;
 PERFORM pg_temp.charge_assert(true,'all deferred financial constraints enforced before rollback');
END $$;
SELECT name,status FROM charge_proof ORDER BY name;
