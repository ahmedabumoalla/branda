BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
-- Transaction fragment. Root wraps candidate migration + this test in BEGIN / ROLLBACK.
-- Identity sequences can advance; never reset shared counters after rollback.
DO $test$
DECLARE cafe uuid;actor uuid;warehouse uuid;party uuid:='8b976733-9d42-4129-9c25-6e12f1300001';product uuid:='8b976733-9d42-4129-9c25-6e12f1300002';item uuid:='8b976733-9d42-4129-9c25-6e12f1300003';item2 uuid:='8b976733-9d42-4129-9c25-6e12f1300004';
 bank uuid:='8b976733-9d42-4129-9c25-6e12f1300005'; source_paid numeric; prior_closed date; source uuid;line_id uuid;approval jsonb;result jsonb;detail jsonb;retry jsonb;payload jsonb;req uuid;receive_req uuid;paid numeric;source_cost numeric;old_qty numeric;old_qty2 numeric;balance numeric;blocked boolean;mode integer;checks integer:=0;refund uuid;returned uuid[]:='{}';
BEGIN
 SELECT c.id,c.owner_user_id INTO STRICT cafe,actor FROM public.cafes c JOIN public.profiles p ON p.id=c.owner_user_id AND p.status='active' WHERE c.slug='test-cafe' AND c.deleted_at IS NULL AND c.status IN('active','published');
 SELECT id INTO STRICT warehouse FROM public.bf_warehouses WHERE cafe_id=cafe AND active ORDER BY id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 IF brand_finance_private.role_for(cafe)<>'owner' THEN RAISE EXCEPTION 'REHEARSAL owner mismatch';END IF;
 IF EXISTS(SELECT 1 FROM public.bf_parties WHERE id=party) OR EXISTS(SELECT 1 FROM public.menu_products WHERE id=product) THEN RAISE EXCEPTION 'REHEARSAL fixture collision';END IF;
 INSERT INTO public.bf_parties(id,cafe_id,name,kind) VALUES(party,cafe,'Sales-return rollback fixture','customer');
 INSERT INTO public.menu_products(id,cafe_id,name,price) VALUES(product,cafe,'Sales-return rollback fixture',20);
 INSERT INTO public.bf_items(id,cafe_id,name,sku) VALUES(item,cafe,'Sales-return component A','SR-ROLLBACK-A'),(item2,cafe,'Sales-return component B','SR-ROLLBACK-B');
 INSERT INTO public.bf_item_product_links(cafe_id,item_id,product_id,quantity) VALUES(cafe,item,product,2),(cafe,item2,product,0.5);
 INSERT INTO public.bf_stock(cafe_id,warehouse_id,item_id,quantity,average_cost,value,cost_known) VALUES(cafe,warehouse,item,100,8,800,true),(cafe,warehouse,item2,100,2,200,true);
 INSERT INTO public.bf_accounts(id,cafe_id,name,code,kind) VALUES(bank,cafe,'Sales-return rollback bank','SR-ROLLBACK-BANK','bank');
 FOR mode IN 0..5 LOOP
  source_paid:=CASE WHEN mode=4 THEN 207 WHEN mode=5 THEN 100 ELSE 0 END;
  source:=gen_random_uuid();line_id:=gen_random_uuid();req:=gen_random_uuid();receive_req:=gen_random_uuid();
  IF mode=3 THEN UPDATE public.bf_stock SET cost_known=false WHERE cafe_id=cafe AND item_id=item;END IF;
  INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,warehouse_id,subtotal,discount,tax,total,paid,account_id,note,created_by,vat_rate,tax_inclusive)
   VALUES(source,cafe,'sale',party,warehouse,200,20,27,207,source_paid,CASE WHEN source_paid>0 THEN bank ELSE NULL END,'Sales-return rollback source',actor,15,false);
  INSERT INTO public.bf_document_lines(id,cafe_id,document_id,product_id,name,quantity,unit_price,net,tax,cost,activity_kind,vat_rate,tax_category)
   VALUES(line_id,cafe,source,product,'Sales-return rollback fixture',10,20,180,27,0,'product',15,'S') RETURNING cost INTO source_cost;
  PERFORM brand_finance_private.invoice_line(cafe,source,brand_finance_private.account(cafe,'1100'),207-source_paid,0,party,'Rollback source');
  IF source_paid>0 THEN PERFORM brand_finance_private.invoice_line(cafe,source,bank,source_paid,0,party,'Rollback payment');END IF;
  PERFORM brand_finance_private.invoice_line(cafe,source,brand_finance_private.account(cafe,'4000'),0,180,party,'Rollback source');
  PERFORM brand_finance_private.invoice_line(cafe,source,brand_finance_private.account(cafe,'2100'),0,27,party,'Rollback source');
  PERFORM brand_finance_private.invoice_line(cafe,source,brand_finance_private.account(cafe,'5000'),source_cost,0,party,'Rollback source');
  PERFORM brand_finance_private.invoice_line(cafe,source,brand_finance_private.account(cafe,'1200'),0,source_cost,party,'Rollback source');
  SELECT quantity INTO old_qty FROM public.bf_stock WHERE cafe_id=cafe AND item_id=item AND warehouse_id=warehouse;
  SELECT quantity INTO old_qty2 FROM public.bf_stock WHERE cafe_id=cafe AND item_id=item2 AND warehouse_id=warehouse;
  payload:=jsonb_build_object('documentId',source,'lines',jsonb_build_array(jsonb_build_object('lineId',line_id,'quantity',10,'expectedReturnedQuantity',0)),'expectedTotal',207,'expectedPaid',source_paid,'paymentMethod','bank','accountId',bank,'note','Rollback refund','deferStock',mode<>0);
  approval:=public.brand_finance_execute(cafe,'refund',payload,req);
  IF approval->>'status'<>'pending' OR EXISTS(SELECT 1 FROM public.bf_documents WHERE cafe_id=cafe AND reference_id=source AND kind='refund') THEN RAISE EXCEPTION 'REHEARSAL owner approval bypass';END IF;checks:=checks+1;
  result:=public.brand_finance_execute(cafe,'refund_approve',jsonb_build_object('requestId',approval->>'id','expectedTotal',207,'expectedPaid',source_paid,'paymentMethod','bank','accountId',bank),gen_random_uuid());refund:=(result->>'id')::uuid;returned:=array_append(returned,refund);
  detail:=public.brand_finance_sales_returns(cafe,refund);
  IF (detail->>'total')::numeric<>207 OR (detail->>'tax')::numeric<>27 OR (detail->>'discount')::numeric<>20 OR (detail->>'subtotal')::numeric<>200 OR (detail#>>'{lines,0,discount}')::numeric<>20 THEN RAISE EXCEPTION 'REHEARSAL monetary snapshot mismatch';END IF;checks:=checks+1;
  IF (detail->>'paid')::numeric<>source_paid OR (detail->>'debtReduced')::numeric<>207-source_paid OR detail->>'paymentStatus'<>(CASE WHEN source_paid=0 THEN 'credit' WHEN source_paid=207 THEN 'cash' ELSE 'mixed' END) THEN RAISE EXCEPTION 'REHEARSAL payment state mismatch';END IF;checks:=checks+1;
  IF (brand_finance_private.document_state(cafe,source)->>'outstanding')::numeric<>0 THEN RAISE EXCEPTION 'REHEARSAL refund debt not settled';END IF;checks:=checks+1;
  IF (SELECT coalesce(sum(debit-credit),0) FROM public.bf_journal WHERE cafe_id=cafe AND document_id=refund)<>0 THEN RAISE EXCEPTION 'REHEARSAL refund imbalance';END IF;checks:=checks+1;
  IF mode=0 THEN
   IF detail->>'stockStatus'<>'received' OR (SELECT quantity FROM public.bf_stock WHERE cafe_id=cafe AND item_id=item AND warehouse_id=warehouse)<>old_qty+20 THEN RAISE EXCEPTION 'REHEARSAL immediate refund changed';END IF;checks:=checks+1;
  ELSE
   IF detail->>'stockStatus'<>'pending' OR (SELECT quantity FROM public.bf_stock WHERE cafe_id=cafe AND item_id=item AND warehouse_id=warehouse)<>old_qty OR EXISTS(SELECT 1 FROM public.bf_movements WHERE cafe_id=cafe AND document_id=refund) THEN RAISE EXCEPTION 'REHEARSAL deferred refund already received';END IF;checks:=checks+1;
   IF EXISTS(SELECT 1 FROM public.bf_journal j JOIN public.bf_accounts a ON a.id=j.account_id AND a.cafe_id=j.cafe_id WHERE j.cafe_id=cafe AND j.document_id=refund AND a.code IN('1200','5000')) THEN RAISE EXCEPTION 'REHEARSAL stock journal before receiving';END IF;checks:=checks+1;
   IF jsonb_array_length(detail->'stockLines')<>2 OR (SELECT sum((x->>'quantity')::numeric) FROM jsonb_array_elements(detail->'stockLines') x)<>25 THEN RAISE EXCEPTION 'REHEARSAL component snapshot mismatch';END IF;checks:=checks+1;
   IF mode=1 THEN
    SELECT closed_through INTO prior_closed FROM public.bf_settings WHERE cafe_id=cafe;
    UPDATE public.bf_settings SET closed_through=(now() AT TIME ZONE 'Asia/Riyadh')::date WHERE cafe_id=cafe;
    blocked:=false;BEGIN PERFORM public.brand_finance_sales_return_stock(cafe,refund,1,'receive',gen_random_uuid(),'');EXCEPTION WHEN raise_exception THEN blocked:=true;END;
    IF NOT blocked THEN RAISE EXCEPTION 'REHEARSAL closed period receipt accepted';END IF;checks:=checks+1;
    UPDATE public.bf_settings SET closed_through=prior_closed WHERE cafe_id=cafe;
   END IF;
   IF mode=2 THEN
    blocked:=false;BEGIN PERFORM public.brand_finance_sales_return_stock(cafe,refund,1,'reject',receive_req,'');EXCEPTION WHEN raise_exception THEN blocked:=true;END;IF NOT blocked THEN RAISE EXCEPTION 'REHEARSAL rejection requires reason';END IF;checks:=checks+1;
    result:=public.brand_finance_sales_return_stock(cafe,refund,1,'reject',receive_req,'Damaged goods');
    IF result->>'stockStatus'<>'rejected' OR (SELECT quantity FROM public.bf_stock WHERE cafe_id=cafe AND item_id=item AND warehouse_id=warehouse)<>old_qty THEN RAISE EXCEPTION 'REHEARSAL rejection changed stock';END IF;checks:=checks+1;
   ELSE
    result:=public.brand_finance_sales_return_stock(cafe,refund,1,'receive',receive_req,'');
    retry:=public.brand_finance_sales_return_stock(cafe,refund,1,'receive',receive_req,'');IF retry<>result THEN RAISE EXCEPTION 'REHEARSAL receive retry mismatch';END IF;checks:=checks+1;
    IF result->>'stockStatus'<>'received' OR (SELECT quantity FROM public.bf_stock WHERE cafe_id=cafe AND item_id=item AND warehouse_id=warehouse)<>old_qty+20 OR (SELECT quantity FROM public.bf_stock WHERE cafe_id=cafe AND item_id=item2 AND warehouse_id=warehouse)<>old_qty2+5 THEN RAISE EXCEPTION 'REHEARSAL component receiving mismatch';END IF;checks:=checks+1;
    IF (SELECT coalesce(sum(debit-credit),0) FROM public.bf_journal WHERE document_id=(result->>'stockDocumentId')::uuid)<>0 THEN RAISE EXCEPTION 'REHEARSAL receiving journal imbalance';END IF;checks:=checks+1;
    IF (SELECT count(*) FROM public.bf_documents WHERE cafe_id=cafe AND kind='refund' AND reference_id=source)<>1 THEN RAISE EXCEPTION 'REHEARSAL receive posted second refund';END IF;checks:=checks+1;
    IF mode=3 AND (SELECT cost_known FROM public.bf_stock WHERE cafe_id=cafe AND item_id=item AND warehouse_id=warehouse) THEN RAISE EXCEPTION 'REHEARSAL unknown cost became known';END IF;checks:=checks+1;
   END IF;
   blocked:=false;BEGIN PERFORM public.brand_finance_sales_return_stock(cafe,refund,2,'receive',gen_random_uuid(),'');EXCEPTION WHEN raise_exception THEN blocked:=true;END;IF NOT blocked THEN RAISE EXCEPTION 'REHEARSAL stock received twice';END IF;checks:=checks+1;
  END IF;
 END LOOP;
 result:=public.brand_finance_sales_returns(cafe,NULL,jsonb_build_object('partyId',party,'limit',1));
 IF (result->>'total')::integer<>6 OR jsonb_array_length(result->'items')<>1 OR result#>'{items,0,lines}' IS NOT NULL THEN RAISE EXCEPTION 'REHEARSAL compact pagination mismatch';END IF;checks:=checks+1;
 result:=public.brand_finance_sales_returns(cafe,NULL,jsonb_build_object('partyId',party,'stockStatus','rejected'));IF (result->>'total')::integer<>1 THEN RAISE EXCEPTION 'REHEARSAL stock filter mismatch';END IF;checks:=checks+1;
 result:=public.brand_finance_sales_returns(cafe,NULL,jsonb_build_object('partyId',party,'paymentStatus','cash'));IF (result->>'total')::integer<>1 THEN RAISE EXCEPTION 'REHEARSAL payment filter mismatch';END IF;checks:=checks+1;
 PERFORM set_config('request.jwt.claim.sub','',true);blocked:=false;BEGIN PERFORM public.brand_finance_sales_returns(cafe,returned[1]);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;IF NOT blocked THEN RAISE EXCEPTION 'REHEARSAL anonymous read accepted';END IF;checks:=checks+1;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);blocked:=false;BEGIN PERFORM public.brand_finance_sales_returns('8b976733-9d42-4129-9c25-6e12f1300099',returned[1]);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;IF NOT blocked THEN RAISE EXCEPTION 'REHEARSAL foreign brand accepted';END IF;checks:=checks+1;
 IF has_table_privilege('authenticated','public.bf_sales_return_stock','INSERT') OR has_function_privilege('anon','public.brand_finance_sales_returns(uuid,uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'REHEARSAL grants invalid';END IF;checks:=checks+1;
 SET CONSTRAINTS ALL IMMEDIATE;
 PERFORM set_config('branda.sales_return_rehearsal',jsonb_build_object('ok',true,'checks',checks,'partyId',party,'productId',product,'scope','transaction rollback only')::text,true);
END $test$;
DO $partial$
DECLARE cafe uuid;actor uuid;other_actor uuid;warehouse uuid;source uuid:=gen_random_uuid();line_id uuid:=gen_random_uuid();refund uuid;first_refund uuid;result jsonb;approval jsonb;payload jsonb;detail jsonb;blocked boolean;before_qty numeric;cost numeric;part integer;qty numeric;total numeric;returned numeric:=0;checks integer:=0;staff_role text;
 party uuid:='8b976733-9d42-4129-9c25-6e12f1300001';product uuid:='8b976733-9d42-4129-9c25-6e12f1300002';item uuid:='8b976733-9d42-4129-9c25-6e12f1300003';bank uuid:='8b976733-9d42-4129-9c25-6e12f1300005';
BEGIN
 SET CONSTRAINTS ALL DEFERRED;
 SELECT id,owner_user_id INTO STRICT cafe,actor FROM public.cafes WHERE slug='test-cafe';
 SELECT id INTO warehouse FROM public.bf_warehouses WHERE cafe_id=cafe AND active ORDER BY id LIMIT 1;
 INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,warehouse_id,subtotal,discount,tax,total,paid,account_id,note,created_by,vat_rate,tax_inclusive)
 VALUES(source,cafe,'sale',party,warehouse,200,20,27,207,207,bank,'Partial return rollback source',actor,15,false);
 INSERT INTO public.bf_document_lines(id,cafe_id,document_id,product_id,name,quantity,unit_price,net,tax,cost,activity_kind,vat_rate,tax_category)
 VALUES(line_id,cafe,source,product,'Partial return fixture',10,20,180,27,0,'product',15,'S') RETURNING bf_document_lines.cost INTO cost;
 PERFORM brand_finance_private.invoice_line(cafe,source,bank,207,0,party,'Rollback payment');
 PERFORM brand_finance_private.invoice_line(cafe,source,brand_finance_private.account(cafe,'4000'),0,180,party,'Rollback source');
 PERFORM brand_finance_private.invoice_line(cafe,source,brand_finance_private.account(cafe,'2100'),0,27,party,'Rollback source');
 PERFORM brand_finance_private.invoice_line(cafe,source,brand_finance_private.account(cafe,'5000'),cost,0,party,'Rollback source');
 PERFORM brand_finance_private.invoice_line(cafe,source,brand_finance_private.account(cafe,'1200'),0,cost,party,'Rollback source');
 SELECT quantity INTO before_qty FROM public.bf_stock WHERE cafe_id=cafe AND item_id=item AND warehouse_id=warehouse;
 FOR part IN 1..2 LOOP
  qty:=CASE WHEN part=1 THEN 4 ELSE 6 END;total:=20.7*qty;
  payload:=jsonb_build_object('documentId',source,'lines',jsonb_build_array(jsonb_build_object('lineId',line_id,'quantity',qty,'expectedReturnedQuantity',returned)),'expectedTotal',total,'expectedPaid',total,'accountId',bank,'paymentMethod','bank','note','Partial refund rollback','deferStock',part=2);
  approval:=public.brand_finance_execute(cafe,'refund',payload,gen_random_uuid());
  result:=public.brand_finance_execute(cafe,'refund_approve',jsonb_build_object('requestId',approval->>'id','expectedTotal',total,'expectedPaid',total),gen_random_uuid());
  refund:=(result->>'id')::uuid;IF part=1 THEN first_refund:=refund;END IF;
  detail:=public.brand_finance_sales_returns(cafe,refund);
  IF (detail->>'total')::numeric<>total OR (detail->>'paid')::numeric<>total OR (detail->>'discount')::numeric<>2*qty THEN RAISE EXCEPTION 'REHEARSAL partial money incorrect';END IF;checks:=checks+1;
  IF (SELECT sum(c.quantity) FROM brand_finance_private.sales_return_components(cafe,refund) c)<>2.5*qty THEN RAISE EXCEPTION 'REHEARSAL partial component allocation incorrect';END IF;checks:=checks+1;
  returned:=returned+qty;
 END LOOP;
 IF (SELECT quantity FROM public.bf_stock WHERE cafe_id=cafe AND item_id=item AND warehouse_id=warehouse)<>before_qty+8 THEN RAISE EXCEPTION 'REHEARSAL partial pending receipt changed inventory';END IF;checks:=checks+1;
 SELECT p.id INTO other_actor FROM public.profiles p WHERE p.status='active' AND p.id<>actor AND NOT EXISTS(SELECT 1 FROM public.bf_staff st WHERE st.cafe_id=cafe AND st.user_id=p.id) LIMIT 1;
 IF other_actor IS NULL THEN RAISE EXCEPTION 'REHEARSAL no unauthorized actor fixture available';END IF;
 INSERT INTO public.bf_staff(cafe_id,user_id,name,role) VALUES(cafe,other_actor,'Rollback role fixture','accountant');
 FOREACH staff_role IN ARRAY ARRAY['accountant','cashier'] LOOP
  UPDATE public.bf_staff SET role=staff_role WHERE cafe_id=cafe AND user_id=other_actor;
  PERFORM set_config('request.jwt.claim.sub',other_actor::text,true);
  blocked:=false;BEGIN PERFORM public.brand_finance_sales_return_stock(cafe,refund,1,'receive',gen_random_uuid(),'');EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'REHEARSAL unauthorized role receipt accepted';END IF;checks:=checks+1;
 END LOOP;
 UPDATE public.bf_staff SET active=false WHERE cafe_id=cafe AND user_id=other_actor;
 blocked:=false;BEGIN PERFORM public.brand_finance_sales_returns(cafe,refund);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'REHEARSAL revoked staff access accepted';END IF;checks:=checks+1;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 result:=public.brand_finance_sales_return_stock(cafe,refund,1,'receive',gen_random_uuid(),'');
 IF (SELECT quantity FROM public.bf_stock WHERE cafe_id=cafe AND item_id=item AND warehouse_id=warehouse)<>before_qty+20 THEN RAISE EXCEPTION 'REHEARSAL partial cumulative stock incorrect';END IF;checks:=checks+1;
 IF (SELECT sum(d.total) FROM public.bf_documents d WHERE d.reference_id=source AND d.kind='refund')<>207 OR (SELECT sum(l.quantity) FROM public.bf_document_lines l WHERE l.reference_line_id=line_id)<>10 THEN RAISE EXCEPTION 'REHEARSAL partial cumulative financial incorrect';END IF;checks:=checks+1;
 blocked:=false;BEGIN PERFORM public.brand_finance_execute(cafe,'refund',payload,gen_random_uuid());EXCEPTION WHEN raise_exception THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'REHEARSAL overreturn accepted';END IF;checks:=checks+1;
 IF EXISTS(SELECT 1 FROM public.bf_journal j WHERE j.document_id IN(first_refund,refund,(result->>'stockDocumentId')::uuid) GROUP BY j.document_id HAVING sum(j.debit-j.credit)<>0) THEN RAISE EXCEPTION 'REHEARSAL partial journal imbalance';END IF;checks:=checks+1;
 IF has_function_privilege('authenticated','brand_finance_private.post_refund(uuid,jsonb,uuid)','EXECUTE') OR has_function_privilege('anon','brand_finance_private.stock_move(uuid,uuid,uuid,uuid,numeric,numeric)','EXECUTE') OR has_function_privilege('authenticated','brand_finance_private.refund_quote(uuid,jsonb)','EXECUTE') OR has_function_privilege('authenticated','brand_finance_private.sales_return_components(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'REHEARSAL private helper ACL widened';END IF;checks:=checks+1;
 SET CONSTRAINTS ALL IMMEDIATE;
 PERFORM set_config('branda.sales_return_rehearsal',(current_setting('branda.sales_return_rehearsal')::jsonb||jsonb_build_object('checks',(current_setting('branda.sales_return_rehearsal')::jsonb->>'checks')::integer+checks))::text,true);
END $partial$;
SELECT current_setting('branda.sales_return_rehearsal')::jsonb AS verification;

ROLLBACK;
