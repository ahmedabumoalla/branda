CREATE TEMP TABLE shift_session_checks(name text PRIMARY KEY) ON COMMIT DROP;
CREATE FUNCTION pg_temp.check_session(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Shift sessions assertion: %',label; END IF; INSERT INTO shift_session_checks VALUES(label); END $$;
DO $$
DECLARE cafe uuid; owner_id uuid; test_shift uuid; foreign_id uuid; value jsonb; expected bigint; row jsonb; tab text; doc public.bf_documents%ROWTYPE; invoice public.bf_documents%ROWTYPE; payment jsonb; denied boolean; other_user uuid;
BEGIN
 SELECT s.cafe_id,c.owner_user_id,s.id INTO cafe,owner_id,test_shift FROM public.bf_shifts s JOIN public.cafes c ON c.id=s.cafe_id JOIN public.profiles p ON p.id=c.owner_user_id AND p.status='active' ORDER BY s.opened_at DESC LIMIT 1;
 IF cafe IS NULL THEN RAISE EXCEPTION 'No existing shift available for read regression'; END IF;
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 value:=public.brand_finance_shift_sessions(cafe);
 SELECT count(*) INTO expected FROM public.bf_shifts WHERE cafe_id=cafe;
 PERFORM pg_temp.check_session((value->>'total')::bigint=expected,'list count matches tenant');
 PERFORM pg_temp.check_session(jsonb_array_length(value->'rows')<=30,'page bounded to30');
 PERFORM pg_temp.check_session((value->>'limit')::integer=30,'fixed page size');
 FOR row IN SELECT * FROM jsonb_array_elements(value->'rows') LOOP
  PERFORM pg_temp.check_session((row->>'net_sales')::numeric=(SELECT coalesce(sum(CASE WHEN kind='sale' THEN total ELSE -total END),0) FROM public.bf_documents WHERE cafe_id=cafe AND shift_id=(row->>'id')::uuid AND kind IN('sale','refund')),'aggregate-'||(row->>'id'));
 END LOOP;
 value:=public.brand_finance_shift_sessions(cafe,'list',NULL,jsonb_build_object('status','closed'));
 SELECT count(*) INTO expected FROM public.bf_shifts WHERE cafe_id=cafe AND status='closed';
 PERFORM pg_temp.check_session((value->>'total')::bigint=expected,'status filter across all records');
 value:=public.brand_finance_shift_sessions(cafe,'list',NULL,jsonb_build_object('accountId',(SELECT account_id FROM public.bf_shifts WHERE id=test_shift AND cafe_id=cafe)));
 SELECT count(*) INTO expected FROM public.bf_shifts WHERE cafe_id=cafe AND account_id=(SELECT account_id FROM public.bf_shifts WHERE id=test_shift AND cafe_id=cafe);
 PERFORM pg_temp.check_session((value->>'total')::bigint=expected,'account filter across all records');
 value:=public.brand_finance_shift_sessions(cafe,'list',NULL,'{"from":"2099-01-01","to":"2099-01-02"}');
 PERFORM pg_temp.check_session((value->>'total')::integer=0,'future range empty');
 value:=public.brand_finance_shift_sessions(cafe,'list',NULL,'{"offset":30,"sort":"number_asc"}');
 PERFORM pg_temp.check_session((value->>'offset')::integer=30 AND jsonb_array_length(value->'rows')<=30,'second page and alternate sort');
 value:=public.brand_finance_shift_sessions(cafe,'summary',test_shift);
 PERFORM pg_temp.check_session(value->'shift'->>'id'=test_shift::text,'summary shift identity');
 PERFORM pg_temp.check_session(value->'analytics'->>'shiftId'=test_shift::text,'canonical analytics identity');
 FOREACH tab IN ARRAY ARRAY['movements','invoices','refunds','payments','activity'] LOOP
  value:=public.brand_finance_shift_sessions(cafe,tab,test_shift);
  PERFORM pg_temp.check_session(jsonb_typeof(value->'rows')='array' AND jsonb_array_length(value->'rows')<=30,tab||' rows bounded');
 END LOOP;
 -- Exercise canonical payment payload using any existing paid shift document, independently of the most recent shift.
 SELECT * INTO doc FROM public.bf_documents WHERE cafe_id=cafe AND shift_id IS NOT NULL AND kind='sale' AND paid>0 ORDER BY created_at DESC LIMIT 1;
 IF FOUND THEN
  value:=public.brand_finance_shift_sessions(cafe,'payments',doc.shift_id);
  FOR row IN SELECT * FROM jsonb_array_elements(value->'rows') LOOP
   SELECT * INTO doc FROM public.bf_documents WHERE cafe_id=cafe AND id=(row->>'id')::uuid;
   SELECT * INTO invoice FROM public.bf_documents WHERE cafe_id=cafe AND id=CASE WHEN doc.kind='sale' THEN doc.id ELSE doc.reference_id END;
   payment:=brand_finance_private.invoice_payment_record(doc,invoice);
   PERFORM pg_temp.check_session(row->'payment'=payment,'canonical-payment-'||(row->>'id'));
  END LOOP;
 END IF;
 SELECT id INTO foreign_id FROM public.bf_shifts WHERE cafe_id<>cafe LIMIT 1;
 IF foreign_id IS NOT NULL THEN PERFORM pg_temp.check_session(public.brand_finance_shift_sessions(cafe,'summary',foreign_id) IS NULL,'foreign shift denied'); END IF;
 PERFORM pg_temp.check_session(public.brand_finance_shift_sessions(cafe,'summary','f127c2c2-0051-433e-bfbf-e47f19a09999') IS NULL,'unknown shift denied');
 denied:=false; BEGIN PERFORM public.brand_finance_shift_sessions('f127c2c2-0051-433e-bfbf-e47f19a09999','summary',test_shift); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 PERFORM pg_temp.check_session(denied,'foreign tenant denied');
 denied:=false; BEGIN PERFORM public.brand_finance_shift_sessions(cafe,'list',NULL,'{"offset":-1}'); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 PERFORM pg_temp.check_session(denied,'invalid pagination rejected');
 denied:=false; BEGIN PERFORM public.brand_finance_shift_sessions(cafe,'list',NULL,'{"from":"2026-12-01","to":"2026-01-01"}'); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 PERFORM pg_temp.check_session(denied,'inverted dates rejected');
 SELECT p.id INTO other_user FROM public.profiles p WHERE p.id<>owner_id AND NOT EXISTS(SELECT 1 FROM public.bf_staff s WHERE s.cafe_id=cafe AND s.user_id=p.id AND s.active) LIMIT 1;
 IF other_user IS NOT NULL THEN
  PERFORM set_config('request.jwt.claim.sub',other_user::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',other_user,'role','authenticated')::text,true);
  denied:=false; BEGIN PERFORM public.brand_finance_shift_sessions(cafe); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  PERFORM pg_temp.check_session(denied,'outsider role denied');
 END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);PERFORM set_config('request.jwt.claims','{}',true);
 denied:=false; BEGIN PERFORM public.brand_finance_shift_sessions(cafe); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 PERFORM pg_temp.check_session(denied,'anonymous denied');
 PERFORM pg_temp.check_session(NOT has_function_privilege('anon','public.brand_finance_shift_sessions(uuid,text,uuid,jsonb)','EXECUTE'),'anon execute denied');
 PERFORM pg_temp.check_session(NOT has_function_privilege('service_role','public.brand_finance_shift_sessions(uuid,text,uuid,jsonb)','EXECUTE'),'service execute denied');
 PERFORM pg_temp.check_session(has_function_privilege('authenticated','public.brand_finance_shift_sessions(uuid,text,uuid,jsonb)','EXECUTE'),'authenticated execute granted');
END $$;
SELECT count(*) AS assertions,array_agg(name ORDER BY name) AS checks FROM shift_session_checks;
