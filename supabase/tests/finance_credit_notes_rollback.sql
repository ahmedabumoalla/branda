BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
-- Run after the candidate migration INSIDE THE SAME TRANSACTION, then ROLLBACK.
-- No business rows remain. Identity sequences may advance despite rollback; never reset shared sequences.
DO $rehearsal$
DECLARE
 cafe uuid; actor uuid; warehouse uuid;
 party uuid:='fda41364-4074-4f21-8f82-1d1137020001';
 product uuid:='fda41364-4074-4f21-8f82-1d1137020002';
 item uuid:='fda41364-4074-4f21-8f82-1d1137020003';
 item2 uuid:='fda41364-4074-4f21-8f82-1d1137020004';
 note_id uuid:='fda41364-4074-4f21-8f82-1d1137020005';
 issue_request uuid:='fda41364-4074-4f21-8f82-1d1137020006';
 receive_request uuid:='fda41364-4074-4f21-8f82-1d1137020007';
 payload jsonb;n jsonb;issued jsonb;received jsonb;retry jsonb;blocked boolean;checks integer:=0;
BEGIN
 SELECT c.id,c.owner_user_id INTO STRICT cafe,actor FROM public.cafes c JOIN public.profiles p ON p.id=c.owner_user_id AND p.status='active' WHERE c.slug='test-cafe' AND c.deleted_at IS NULL AND c.status IN('active','published');
 SELECT id INTO STRICT warehouse FROM public.bf_warehouses WHERE cafe_id=cafe AND active ORDER BY id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 IF brand_finance_private.role_for(cafe)<>'owner' THEN RAISE EXCEPTION 'REHEARSAL owner context mismatch';END IF;
 IF EXISTS(SELECT 1 FROM public.bf_parties WHERE id=party) OR EXISTS(SELECT 1 FROM public.menu_products WHERE id=product) THEN RAISE EXCEPTION 'REHEARSAL fixture collision';END IF;
 INSERT INTO public.bf_parties(id,cafe_id,name,kind) VALUES(party,cafe,'Credit-note rollback fixture','customer');
 INSERT INTO public.menu_products(id,cafe_id,name,price) VALUES(product,cafe,'Credit-note rollback fixture',20);
 INSERT INTO public.bf_items(id,cafe_id,name,sku) VALUES(item,cafe,'Credit-note rollback component A','CN-ROLLBACK-A'),(item2,cafe,'Credit-note rollback component B','CN-ROLLBACK-B');
 INSERT INTO public.bf_item_product_links(cafe_id,item_id,product_id,quantity) VALUES(cafe,item,product,2),(cafe,item2,product,0.5);
 INSERT INTO public.bf_stock(cafe_id,warehouse_id,item_id,quantity,average_cost,value,cost_known) VALUES(cafe,warehouse,item,10,8,80,true),(cafe,warehouse,item2,10,2,20,true);
 payload:=jsonb_build_object('partyId',party,'warehouseId',warehouse,'date',(now() AT TIME ZONE 'Asia/Riyadh')::date,'issueDate',(now() AT TIME ZONE 'Asia/Riyadh')::date,'salespersonId',NULL,'sourceInvoiceId',NULL,'reason','Rollback verification','note','','terms','','template','standard','deliveryMethod','print','stockRequired',true,'discountValue',0,'discountKind','amount','vatRate',15,'taxInclusive',false,'lines',jsonb_build_array(jsonb_build_object('key',1,'productId',product,'quantity',20,'price',20,'discount',10,'discountKind','percent')));
 n:=public.brand_finance_save_credit_note(cafe,note_id,0,payload);
 IF (n->>'total')::numeric<>414 OR (n->>'tax')::numeric<>54 OR (n->>'discount')::numeric<>40 THEN RAISE EXCEPTION 'REHEARSAL amount mismatch';END IF;checks:=checks+1;
 IF EXISTS(SELECT 1 FROM public.bf_journal WHERE cafe_id=cafe AND party_id=party) OR EXISTS(SELECT 1 FROM public.bf_movements WHERE item_id IN(item,item2)) THEN RAISE EXCEPTION 'REHEARSAL draft side effect';END IF;checks:=checks+1;
 retry:=public.brand_finance_save_credit_note(cafe,note_id,0,payload);IF retry->>'revision'<>n->>'revision' THEN RAISE EXCEPTION 'REHEARSAL duplicate draft revision';END IF;checks:=checks+1;
 blocked:=false;BEGIN PERFORM public.brand_finance_save_credit_note(cafe,note_id,0,payload||'{"note":"stale edit"}');EXCEPTION WHEN serialization_failure THEN blocked:=true;END;IF NOT blocked THEN RAISE EXCEPTION 'REHEARSAL stale edit accepted';END IF;checks:=checks+1;
 UPDATE public.bf_stock SET cost_known=false WHERE cafe_id=cafe AND item_id=item2;
 blocked:=false;BEGIN PERFORM public.brand_finance_transition_credit_note(cafe,note_id,(n->>'revision')::integer,'issue',issue_request,'');EXCEPTION WHEN raise_exception THEN blocked:=true;END;IF NOT blocked THEN RAISE EXCEPTION 'REHEARSAL unknown cost accepted';END IF;checks:=checks+1;
 UPDATE public.bf_stock SET cost_known=true WHERE cafe_id=cafe AND item_id=item2;
 issued:=public.brand_finance_transition_credit_note(cafe,note_id,(n->>'revision')::integer,'issue',issue_request,'');
 IF issued->>'status'<>'issued' OR issued->>'stockStatus'<>'pending' THEN RAISE EXCEPTION 'REHEARSAL issue state mismatch';END IF;checks:=checks+1;
 retry:=public.brand_finance_transition_credit_note(cafe,note_id,(n->>'revision')::integer,'issue',issue_request,'');IF retry<>issued THEN RAISE EXCEPTION 'REHEARSAL issue retry mismatch';END IF;checks:=checks+1;
 IF brand_finance_private.customer_credit_balance(cafe,party)<>414 OR (SELECT count(*) FROM public.bf_customer_credit_events WHERE cafe_id=cafe AND party_id=party)<>1 THEN RAISE EXCEPTION 'REHEARSAL customer balance mismatch';END IF;checks:=checks+1;
 IF (SELECT coalesce(sum(debit-credit),0) FROM public.bf_journal WHERE document_id=(issued->>'journalId')::uuid)<>0 THEN RAISE EXCEPTION 'REHEARSAL issue imbalance';END IF;checks:=checks+1;
 IF EXISTS(SELECT 1 FROM public.bf_movements WHERE item_id IN(item,item2)) THEN RAISE EXCEPTION 'REHEARSAL issue moved stock';END IF;checks:=checks+1;
 received:=public.brand_finance_transition_credit_note(cafe,note_id,(issued->>'revision')::integer,'receive',receive_request,'');
 IF received->>'stockStatus'<>'received' OR (SELECT quantity FROM public.bf_stock WHERE cafe_id=cafe AND item_id=item AND warehouse_id=warehouse)<>50 OR (SELECT quantity FROM public.bf_stock WHERE cafe_id=cafe AND item_id=item2 AND warehouse_id=warehouse)<>20 THEN RAISE EXCEPTION 'REHEARSAL component quantity mismatch';END IF;checks:=checks+1;
 IF (SELECT value FROM public.bf_stock WHERE cafe_id=cafe AND item_id=item AND warehouse_id=warehouse)<>400 OR (SELECT value FROM public.bf_stock WHERE cafe_id=cafe AND item_id=item2 AND warehouse_id=warehouse)<>40 THEN RAISE EXCEPTION 'REHEARSAL stock valuation mismatch';END IF;checks:=checks+1;
 retry:=public.brand_finance_transition_credit_note(cafe,note_id,(issued->>'revision')::integer,'receive',receive_request,'');IF retry<>received OR (SELECT count(*) FROM public.bf_movements WHERE item_id IN(item,item2))<>2 THEN RAISE EXCEPTION 'REHEARSAL receive retry duplicated';END IF;checks:=checks+1;
 IF (SELECT coalesce(sum(debit-credit),0) FROM public.bf_journal WHERE document_id=(received->>'stockDocumentId')::uuid)<>0 THEN RAISE EXCEPTION 'REHEARSAL stock imbalance';END IF;checks:=checks+1;
 blocked:=false;BEGIN PERFORM public.brand_finance_transition_credit_note(cafe,note_id,(received->>'revision')::integer,'delete',gen_random_uuid(),'');EXCEPTION WHEN raise_exception THEN blocked:=true;END;IF NOT blocked THEN RAISE EXCEPTION 'REHEARSAL issued delete accepted';END IF;checks:=checks+1;
 IF jsonb_array_length((public.brand_finance_credit_notes(cafe,note_id))->'events')<>3 THEN RAISE EXCEPTION 'REHEARSAL audit mismatch';END IF;checks:=checks+1;
 IF jsonb_array_length(public.brand_finance_credit_notes(cafe,NULL,jsonb_build_object('partyId',party,'limit',1))#>'{items,0,events}')<>0 THEN RAISE EXCEPTION 'REHEARSAL list is not compact';END IF;checks:=checks+1;
 PERFORM set_config('request.jwt.claim.sub','',true);blocked:=false;BEGIN PERFORM public.brand_finance_credit_notes(cafe,note_id);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;IF NOT blocked THEN RAISE EXCEPTION 'REHEARSAL anonymous access accepted';END IF;checks:=checks+1;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);blocked:=false;BEGIN PERFORM public.brand_finance_credit_notes('fda41364-4074-4f21-8f82-1d1137020099',note_id);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;IF NOT blocked THEN RAISE EXCEPTION 'REHEARSAL foreign brand access accepted';END IF;checks:=checks+1;
 IF has_table_privilege('authenticated','public.bf_credit_notes','INSERT') OR has_function_privilege('anon','public.brand_finance_credit_notes(uuid,uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'REHEARSAL incorrect grants';END IF;checks:=checks+1;
 SET CONSTRAINTS ALL IMMEDIATE;
 PERFORM set_config('branda.credit_rehearsal',jsonb_build_object('ok',true,'checks',checks,'noteId',note_id,'partyId',party,'productId',product,'scope','transaction rollback only')::text,true);
END $rehearsal$;
SELECT current_setting('branda.credit_rehearsal')::jsonb AS verification;

ROLLBACK;
