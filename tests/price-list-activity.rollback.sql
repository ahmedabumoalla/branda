-- Run only inside a transaction containing the candidate migration, then ROLLBACK.
CREATE TEMP TABLE price_activity_test_context AS
SELECT c.id cafe_id, c.owner_user_id owner_id,
  gen_random_uuid() list_id, gen_random_uuid() product_id, gen_random_uuid() other_list_id,
  coalesce((SELECT max(e.revision) FROM public.bf_invoice_settings_events e WHERE e.cafe_id=c.id),0) + 1000 base_revision
FROM public.cafes c JOIN public.profiles p ON p.id=c.owner_user_id
WHERE c.deleted_at IS NULL AND c.status IN('active','published') AND p.status='active' AND p.role<>'platform_admin'
  AND platform_access_private.service_enabled(c.id,'finance')
ORDER BY c.id LIMIT 1;

DO $$
DECLARE t record; before_state jsonb; after_state jsonb; result jsonb; next_page jsonb; cursor_value integer; denied boolean; n integer;
BEGIN
  SELECT * INTO STRICT t FROM price_activity_test_context;
  before_state := jsonb_build_object('advanced',jsonb_build_object('priceLists',jsonb_build_array(jsonb_build_object('id',t.list_id,'name','العنوان الحصري','active',true,'partyIds','[]'::jsonb,'prices',jsonb_build_array(jsonb_build_object('productId',t.product_id,'price',18))))),'privateMarker','must_not_leave_database');
  after_state := jsonb_set(jsonb_set(before_state,'{advanced,priceLists,0,active}','false'),'{advanced,priceLists,0,prices,0,price}','20');
  INSERT INTO public.bf_invoice_settings_events(cafe_id,revision,before_settings,after_settings,created_by)
    VALUES (t.cafe_id,t.base_revision+1,'{}',before_state,t.owner_id),
      (t.cafe_id,t.base_revision+2,before_state,before_state||jsonb_build_object('privateMarker','different_secret'),t.owner_id),
      (t.cafe_id,t.base_revision+3,before_state,after_state,t.owner_id),
      (t.cafe_id,t.base_revision+4,'{}',jsonb_set(before_state,'{advanced,priceLists,0,id}',to_jsonb(t.other_list_id::text)),t.owner_id),
      (t.cafe_id,t.base_revision+5,after_state,'{}',t.owner_id);
  PERFORM set_config('request.jwt.claim.sub',t.owner_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',t.owner_id,'role','authenticated')::text,true);
  result := public.brand_finance_price_list_activity(t.cafe_id,t.list_id,NULL,20);
  IF jsonb_array_length(result->'items')<>3 OR result->>'nextCursor' IS NOT NULL THEN RAISE EXCEPTION 'create/update/delete or unrelated settings isolation failed';END IF;
  IF result#>>'{items,0,action}'<>'deleted' OR result#>>'{items,1,action}'<>'updated' OR result#>>'{items,2,action}'<>'created' THEN RAISE EXCEPTION 'action order failed';END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result#>'{items,1,changes}') x WHERE x->>'field'='price' AND x->>'before'='18' AND x->>'after'='20' AND x->>'productId'=t.product_id::text) THEN RAISE EXCEPTION 'price delta failed';END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result#>'{items,1,changes}') x WHERE x->>'field'='active' AND x->>'before'='true' AND x->>'after'='false') THEN RAISE EXCEPTION 'status delta failed';END IF;
  IF result::text LIKE '%privateMarker%' OR result::text LIKE '%must_not_leave_database%' OR result::text LIKE '%before_settings%' OR result::text LIKE '%'||t.other_list_id::text||'%' THEN RAISE EXCEPTION 'settings projection disclosure';END IF;
  IF result#>>'{items,0,actor}' IS NULL OR result#>>'{items,0,createdAt}' IS NULL THEN RAISE EXCEPTION 'actor/time missing';END IF;
  result:=public.brand_finance_price_list_activity(t.cafe_id,t.list_id,NULL,1);
  cursor_value:=(result->>'nextCursor')::integer;
  next_page:=public.brand_finance_price_list_activity(t.cafe_id,t.list_id,cursor_value,1);
  IF jsonb_array_length(result->'items')<>1 OR (next_page#>>'{items,0,revision}')::integer>=cursor_value OR next_page#>>'{items,0,action}'<>'updated' THEN RAISE EXCEPTION 'cursor paging failed';END IF;
  next_page:=public.brand_finance_price_list_activity(t.cafe_id,t.list_id,(next_page->>'nextCursor')::integer,1);
  IF next_page#>>'{items,0,action}'<>'created' OR next_page->>'nextCursor' IS NOT NULL THEN RAISE EXCEPTION 'last page failed';END IF;
  IF jsonb_array_length(public.brand_finance_price_list_activity(t.cafe_id,gen_random_uuid(),NULL,20)->'items')<>0 THEN RAISE EXCEPTION 'unknown list isolation failed';END IF;
  FOREACH n IN ARRAY ARRAY[0,31] LOOP
    denied:=false;
    BEGIN PERFORM public.brand_finance_price_list_activity(t.cafe_id,t.list_id,NULL,n); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
    IF NOT denied THEN RAISE EXCEPTION 'page limit validation failed';END IF;
  END LOOP;
  denied:=false;
  BEGIN PERFORM public.brand_finance_price_list_activity(t.cafe_id,t.list_id,0,20);EXCEPTION WHEN invalid_parameter_value THEN denied:=true;END;
  IF NOT denied THEN RAISE EXCEPTION 'cursor validation failed';END IF;
  PERFORM set_config('request.jwt.claim.sub','',true); PERFORM set_config('request.jwt.claims','{}',true);
  denied:=false;
  BEGIN PERFORM public.brand_finance_price_list_activity(t.cafe_id,t.list_id,NULL,20);EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
  IF NOT denied THEN RAISE EXCEPTION 'anonymous access allowed';END IF;
  PERFORM set_config('request.jwt.claim.sub',t.owner_id::text,true); PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',t.owner_id,'role','authenticated')::text,true);
  denied:=false;
  BEGIN PERFORM public.brand_finance_price_list_activity(gen_random_uuid(),t.list_id,NULL,20);EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
  IF NOT denied THEN RAISE EXCEPTION 'foreign cafe access allowed';END IF;
  IF has_function_privilege('anon','public.brand_finance_price_list_activity(uuid,uuid,integer,integer)','EXECUTE') OR has_function_privilege('service_role','public.brand_finance_price_list_activity(uuid,uuid,integer,integer)','EXECUTE') OR NOT has_function_privilege('authenticated','public.brand_finance_price_list_activity(uuid,uuid,integer,integer)','EXECUTE') THEN RAISE EXCEPTION 'RPC ACL failed';END IF;
  IF has_table_privilege('authenticated','public.bf_invoice_settings_events','SELECT') OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.bf_invoice_settings_events'::regclass) THEN RAISE EXCEPTION 'audit table exposure';END IF;
  INSERT INTO public.bf_invoice_settings_events(cafe_id,revision,before_settings,after_settings,created_by)
    SELECT t.cafe_id,t.base_revision+10+g.value,'{}','{}',t.owner_id FROM generate_series(1,201) g(value);
  result:=public.brand_finance_price_list_activity(t.cafe_id,t.list_id,NULL,20);
  IF jsonb_array_length(result->'items')<>0 OR result->>'nextCursor' IS NULL THEN RAISE EXCEPTION 'bounded scan continuation failed';END IF;
  next_page:=public.brand_finance_price_list_activity(t.cafe_id,t.list_id,(result->>'nextCursor')::integer,20);
  IF jsonb_array_length(next_page->'items')<>3 OR next_page->>'nextCursor' IS NOT NULL THEN RAISE EXCEPTION 'bounded scan skipped list events';END IF;
END $$;

CREATE TEMP TABLE price_activity_role_proof(check_name text, status text);
DO $$
DECLARE t record; outsider record; restricted record; denied boolean; result jsonb;
BEGIN
  SELECT * INTO STRICT t FROM price_activity_test_context;
  SELECT c.id,c.owner_user_id INTO outsider FROM public.cafes c JOIN public.profiles p ON p.id=c.owner_user_id WHERE c.id<>t.cafe_id AND c.owner_user_id<>t.owner_id AND p.status='active' AND c.deleted_at IS NULL AND c.status IN('active','published') AND platform_access_private.service_enabled(c.id,'finance') AND NOT EXISTS(SELECT 1 FROM public.bf_staff s WHERE s.cafe_id=c.id AND s.user_id=t.owner_id AND s.active) LIMIT 1;
  IF FOUND THEN
    INSERT INTO public.bf_invoice_settings_events(cafe_id,revision,before_settings,after_settings,created_by)
    VALUES(outsider.id,coalesce((SELECT max(revision) FROM public.bf_invoice_settings_events WHERE cafe_id=outsider.id),0)+1000,'{}',jsonb_build_object('advanced',jsonb_build_object('priceLists',jsonb_build_array(jsonb_build_object('id',t.list_id,'name','العنوان الحصري','active',true,'partyIds','[]'::jsonb,'prices','[]'::jsonb)))),outsider.owner_user_id);
    denied:=false;
    BEGIN PERFORM public.brand_finance_price_list_activity(outsider.id,t.list_id,NULL,20);EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
    IF NOT denied THEN RAISE EXCEPTION 'existing foreign tenant authorization failed';END IF;
    result:=public.brand_finance_price_list_activity(t.cafe_id,t.list_id,t.base_revision+10,20);
    IF jsonb_array_length(result->'items')<>3 THEN RAISE EXCEPTION 'same list ID crossed tenant boundary';END IF;
    INSERT INTO price_activity_role_proof VALUES('existing foreign tenant and same-list isolation','PASS');
  ELSE INSERT INTO price_activity_role_proof VALUES('existing foreign tenant and same-list isolation','NOT RUN: no eligible second tenant');END IF;
  SELECT s.cafe_id,s.user_id INTO restricted FROM public.bf_staff s JOIN public.profiles p ON p.id=s.user_id JOIN public.cafes c ON c.id=s.cafe_id WHERE s.active AND s.role='cashier' AND p.status='active' AND p.role<>'platform_admin' AND c.owner_user_id<>s.user_id AND c.deleted_at IS NULL AND c.status IN('active','published') AND platform_access_private.service_enabled(c.id,'finance') LIMIT 1;
  IF FOUND THEN
    PERFORM set_config('request.jwt.claim.sub',restricted.user_id::text,true); PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',restricted.user_id,'role','authenticated')::text,true);
    denied:=false;
    BEGIN PERFORM public.brand_finance_price_list_activity(restricted.cafe_id,t.list_id,NULL,20);EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
    IF NOT denied THEN RAISE EXCEPTION 'cashier activity access allowed';END IF;
    INSERT INTO price_activity_role_proof VALUES('active cashier role denied','PASS');
  ELSE INSERT INTO price_activity_role_proof VALUES('active cashier role denied','NOT RUN: no eligible cashier');END IF;
END $$;
SELECT 'PASS' result, 'actions, price/status changes, actor/time, settings/list/cafe isolation, page/scan cursors, input limits, anonymous guard, RPC ACL and private table RLS' scope, (SELECT list_id FROM price_activity_test_context) fixture_list_id, (SELECT jsonb_agg(to_jsonb(p)) FROM price_activity_role_proof p) role_checks;
