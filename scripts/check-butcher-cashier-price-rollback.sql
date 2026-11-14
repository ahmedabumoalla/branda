-- Run after the migration in the SAME transaction, then ROLLBACK (never COMMIT).
-- Synthetic product/stock/documents are temporary transactional fixtures only.
CREATE OR REPLACE FUNCTION pg_temp.expect_cashier_price_rejection(cafe uuid,payload jsonb)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN PERFORM public.brand_finance_execute(cafe,'sale',payload,gen_random_uuid());
 EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Expected invalid cashier price to be rejected'; END IF;
END $$;
DO $test$
DECLARE
 cafe uuid:='94b9326e-9fd1-4b15-aa70-008ac4387f4b';
 owner_id uuid:='1560d5b9-ab99-4e7b-ab9b-0d95f1e689ad';
 product uuid:=gen_random_uuid(); stock_id uuid; unit_id uuid; warehouse uuid; bank uuid;
 snapshot jsonb; details jsonb; payload jsonb; result jsonb; original_line public.bf_document_lines%ROWTYPE;
 bad jsonb; checks integer:=0; total_amount numeric; tax_amount numeric; quantity_remaining numeric;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=cafe AND owner_user_id=owner_id AND business_category='butcher_shops') THEN RAISE EXCEPTION 'Fixture tenant identity mismatch'; END IF;
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 snapshot:=public.brand_finance_snapshot(cafe);
 SELECT (x->>'id')::uuid INTO bank FROM jsonb_array_elements(snapshot->'accounts') x WHERE x->>'kind'='bank' LIMIT 1;
 warehouse:=(snapshot->'warehouses'->0->>'id')::uuid;
 IF bank IS NULL OR warehouse IS NULL THEN RAISE EXCEPTION 'Fixture requires existing bank and warehouse'; END IF;
 details:='{"meatType":"sheep","origin":null,"units":[{"id":"carcass","label":"ذبيحة","price":1200},{"id":"half","label":"نصف ذبيحة","price":650,"priceMode":"fixed"},{"id":"quarter","label":"ربع ذبيحة","price":0,"priceMode":"cashier"}]}'::jsonb;
 INSERT INTO public.menu_products(id,cafe_id,name,price,butcher_details) VALUES(product,cafe,'ROLLBACK ONLY cashier price fixture',0,details);
 unit_id:=(public.brand_finance_inventory_unit_save(cafe,'Test '||left(product::text,8),gen_random_uuid())->>'id')::uuid;
 stock_id:=(public.brand_finance_execute(cafe,'item',jsonb_build_object('name','ROLLBACK ONLY stock '||product::text,'unitId',unit_id,'costMode','full','productLinks',jsonb_build_array(jsonb_build_object('productId',product,'quantity',1))),gen_random_uuid())->>'id')::uuid;
 PERFORM public.brand_finance_execute(cafe,'stock_adjust',jsonb_build_object('itemId',stock_id,'warehouseId',warehouse,'quantity',10,'unitCost',600,'note','Rollback-only price test'),gen_random_uuid());
 UPDATE public.bf_settings SET vat_rate=15,tax_inclusive=true WHERE cafe_id=cafe;
 payload:=jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('productId',product,'unitId','quarter','quantity',1,'expectedUnitPrice',345.123456)),'accountId',bank,'warehouseId',warehouse,'discount',0,'expectedTotal',345.12);
 PERFORM pg_temp.expect_cashier_price_rejection(cafe,payload); checks:=checks+1;
 FOR bad IN SELECT value FROM jsonb_array_elements('[0,-1,1000000.000001,0.1234567,null,"350"]'::jsonb) LOOP
  PERFORM pg_temp.expect_cashier_price_rejection(cafe,jsonb_set(payload,'{lines,0,unitPrice}',bad)); checks:=checks+1;
 END LOOP;
 PERFORM pg_temp.expect_cashier_price_rejection(cafe,jsonb_set(jsonb_set(jsonb_set(payload,'{lines,0,unitId}','"half"'),'{lines,0,expectedUnitPrice}','650'),'{lines,0,unitPrice}','1')); checks:=checks+1;
 result:=public.brand_finance_execute(cafe,'sale',jsonb_set(payload,'{lines,0,unitPrice}','345.123456'),gen_random_uuid());
 SELECT * INTO STRICT original_line FROM public.bf_document_lines WHERE document_id=(result->>'id')::uuid;
 SELECT total,tax INTO total_amount,tax_amount FROM public.bf_documents WHERE id=(result->>'id')::uuid;
 SELECT quantity INTO quantity_remaining FROM public.bf_stock WHERE cafe_id=cafe AND item_id=stock_id AND warehouse_id=warehouse;
 IF original_line.unit_price<>345.123456 OR original_line.stock_unit_factor<>0.25 OR total_amount<>345.12 OR tax_amount<>45.02 OR quantity_remaining<>9.75 THEN RAISE EXCEPTION 'Chosen price, VAT or quarter inventory mismatch'; END IF;
 checks:=checks+1;
 UPDATE public.bf_settings SET vat_rate=0 WHERE cafe_id=cafe;
 payload:=jsonb_set(payload,'{lines}',jsonb_build_array(jsonb_build_object('productId',product,'unitId','quarter','quantity',1,'unitPrice',300,'expectedUnitPrice',300),jsonb_build_object('productId',product,'unitId','quarter','quantity',1,'unitPrice',400,'expectedUnitPrice',400)));
 payload:=jsonb_set(payload,'{expectedTotal}','700');
 result:=public.brand_finance_execute(cafe,'sale',payload,gen_random_uuid());
 IF (SELECT jsonb_agg(unit_price ORDER BY unit_price) FROM public.bf_document_lines WHERE document_id=(result->>'id')::uuid)<>'[300,400]'::jsonb THEN RAISE EXCEPTION 'Distinct prices were merged'; END IF;
 checks:=checks+1;
 IF EXISTS(SELECT 1 FROM public.bf_journal WHERE document_id=(result->>'id')::uuid GROUP BY document_id HAVING sum(debit)<>sum(credit)) THEN RAISE EXCEPTION 'Journal imbalance'; END IF;
 checks:=checks+1;
 RAISE NOTICE 'Cashier price live-schema rollback checks passed: %',checks;
END $test$;
SELECT true AS rollback_fixture_passed,11 AS checks;
ROLLBACK;
