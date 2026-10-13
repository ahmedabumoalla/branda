-- Run inside BEGIN/ROLLBACK against the actual schema; fixtures never persist.
DO $test$
DECLARE
  a uuid := 'f0000000-0000-4000-8000-000000000101';
  b uuid := 'f0000000-0000-4000-8000-000000000102';
  customer uuid := 'f0000000-0000-4000-8000-000000000103';
  product uuid := 'f0000000-0000-4000-8000-000000000104';
  admin_id uuid; other_id uuid; foreign_order uuid; profiles_before text; value jsonb; row_count bigint; t record;
BEGIN
  SELECT id INTO STRICT admin_id FROM public.profiles WHERE role='platform_admin' ORDER BY id LIMIT 1;
  SELECT id INTO STRICT other_id FROM public.profiles WHERE role<>'platform_admin' ORDER BY id LIMIT 1;
  SELECT md5(string_agg(to_jsonb(p)::text, '' ORDER BY p.id)) INTO profiles_before FROM public.profiles p;
  IF has_function_privilege('anon','public.admin_delete_brand(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'anonymous execute'; END IF;
  PERFORM set_config('request.jwt.claim.sub','',true);
  BEGIN
    PERFORM public.admin_delete_brand(a,'delete-test-a');
    RAISE EXCEPTION 'anonymous accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub',other_id::text,true);
  BEGIN
    PERFORM public.admin_delete_brand(a,'delete-test-a');
    RAISE EXCEPTION 'owner accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);

  INSERT INTO public.cafes(id,slug,name,owner_user_id) VALUES
    (a,'delete-test-a','Deletion fixture A',admin_id),(b,'delete-test-b','Deletion fixture B',admin_id);
  INSERT INTO public.menu_products(id,cafe_id,name,price) VALUES(product,a,'Fixture product',10);
  INSERT INTO public.menu_categories(cafe_id,name) VALUES(a,'Fixture A'),(b,'Fixture B');
  INSERT INTO public.customer_profiles(id,cafe_id,full_name,phone) VALUES(customer,a,'Fixture customer','0590000099');
  INSERT INTO public.loyalty_transactions(cafe_id,customer_id,amount,reason) VALUES(a,customer,1,'Fixture');
  INSERT INTO public.orders(cafe_id,customer_id,customer_name,customer_phone) VALUES(a,customer,'Fixture','0590000099');
  INSERT INTO public.brand_support_tickets(cafe_id,message) VALUES(a,'Fixture support');
  INSERT INTO public.loyalty_activity_events(cafe_id,kind,outcome,actor_type) VALUES(a,'scan','success','owner'),(b,'scan','success','owner');
  INSERT INTO public.pager_orders(id,cafe_id,invoice_number,phone,created_by,created_station,feedback_hash)
    VALUES(gen_random_uuid(),a,'fixture','966590000099','fixture','fixture',repeat('a',64));
  INSERT INTO public.platform_finance_entries(kind,source,category,party,description,cafe_id,amount,currency,exchange_rate,occurred_on,voucher_number)
    OVERRIDING SYSTEM VALUE VALUES('payment','manual_payment','other','Fixture','Fixture',a,1,'SAR',1,current_date,-900000000000000001);

  BEGIN
    PERFORM public.admin_delete_brand(a,'wrong-confirmation');
    RAISE EXCEPTION 'confirmation bypass';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'CONFIRMATION_MISMATCH' THEN RAISE; END IF;
  END;
  IF NOT EXISTS(SELECT 1 FROM public.menu_products WHERE id=product) THEN RAISE EXCEPTION 'failed confirmation mutated data'; END IF;
  BEGIN
    DELETE FROM public.loyalty_activity_events WHERE cafe_id=a;
    RAISE EXCEPTION 'immutable ledger bypass';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Loyalty activity is append-only' THEN RAISE; END IF;
  END;

  INSERT INTO public.orders(cafe_id,customer_name,customer_phone) VALUES(b,'Fixture B','0590000098') RETURNING id INTO foreign_order;
  INSERT INTO public.order_items(order_id,product_id,name,quantity,unit_price) VALUES(foreign_order,product,'Cross tenant fixture',1,10);
  BEGIN
    PERFORM public.admin_delete_brand(a,'delete-test-a');
    RAISE EXCEPTION 'cross tenant reference accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'CROSS_BRAND_REFERENCE' THEN RAISE; END IF;
  END;
  IF NOT EXISTS(SELECT 1 FROM public.order_items WHERE order_id=foreign_order AND product_id=product)
    OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=a) THEN RAISE EXCEPTION 'cross tenant failure mutated data'; END IF;
  DELETE FROM public.order_items WHERE order_id=foreign_order;
  -- A failure after the purge must roll back every deletion and its job together.
  BEGIN
    PERFORM public.admin_delete_brand(a,'delete-test-a');
    RAISE EXCEPTION 'SIMULATED_TRANSACTION_FAILURE';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'SIMULATED_TRANSACTION_FAILURE' THEN RAISE; END IF;
  END;
  IF NOT EXISTS(SELECT 1 FROM public.menu_products WHERE id=product)
    OR NOT EXISTS(SELECT 1 FROM public.loyalty_activity_events WHERE cafe_id=a)
    OR EXISTS(SELECT 1 FROM public.brand_deletion_jobs WHERE cafe_id=a) THEN RAISE EXCEPTION 'transaction was not atomic'; END IF;
  value := public.admin_delete_brand(a,'delete-test-a');
  IF value->>'cafeId' <> a::text THEN RAISE EXCEPTION 'wrong deleted id'; END IF;
  IF EXISTS(SELECT 1 FROM public.cafes WHERE id=a) THEN RAISE EXCEPTION 'cafe not deleted'; END IF;
  FOR t IN SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb USING(table_schema,table_name)
    WHERE c.table_schema='public' AND c.column_name='cafe_id' AND tb.table_type='BASE TABLE'
      AND c.table_name<>'brand_deletion_jobs'
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE cafe_id=$1',t.table_name) INTO row_count USING a;
    IF row_count<>0 THEN RAISE EXCEPTION 'tenant rows remain in %',t.table_name; END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=b)
    OR NOT EXISTS(SELECT 1 FROM public.menu_categories WHERE cafe_id=b)
    OR NOT EXISTS(SELECT 1 FROM public.loyalty_activity_events WHERE cafe_id=b) THEN RAISE EXCEPTION 'other tenant touched'; END IF;
  IF profiles_before IS DISTINCT FROM (SELECT md5(string_agg(to_jsonb(p)::text,'' ORDER BY p.id)) FROM public.profiles p)
    THEN RAISE EXCEPTION 'shared identities changed'; END IF;
  IF EXISTS(SELECT 1 FROM public.audit_logs WHERE entity_id=a AND (old_data IS NOT NULL OR new_data IS NOT NULL))
    THEN RAISE EXCEPTION 'private audit snapshots retained'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.brand_deletion_jobs WHERE cafe_id=a) THEN RAISE EXCEPTION 'missing durable job'; END IF;
  PERFORM public.admin_delete_brand(a,'delete-test-a'); -- retry after committed deletion
  IF public.admin_brand_deletion_assets(a)<>'[]'::jsonb THEN RAISE EXCEPTION 'unexpected foreign storage object'; END IF;
  IF NOT public.admin_finish_brand_deletion(a) THEN RAISE EXCEPTION 'empty cleanup failed'; END IF;
  IF EXISTS(SELECT 1 FROM public.brand_deletion_jobs WHERE cafe_id=a) THEN RAISE EXCEPTION 'completed job retained'; END IF;
  PERFORM public.admin_delete_brand(a,'delete-test-a'); -- retry after completed cleanup
  BEGIN
    DELETE FROM public.loyalty_activity_events WHERE cafe_id=b;
    RAISE EXCEPTION 'purge leaked immutable bypass';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Loyalty activity is append-only' THEN RAISE; END IF;
  END;
END;
$test$;
