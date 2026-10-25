-- Run only in an isolated fixture database, or explicitly wrapped rollback rehearsal
-- Placeholders are supplied by the existing POS customer PGlite fixture
BEGIN;
CREATE TEMP TABLE pos_offline_check_results(checks integer) ON COMMIT DROP;
DO $tests$
DECLARE
 cafe uuid:='__CAFE_ID__'; other_cafe uuid:='__OTHER_CAFE_ID__'; employee uuid:='__STAFF_ID__';
 product uuid:='__PRODUCT_ID__'; drawer uuid:='__DRAWER_ID__'; warehouse uuid:='__WAREHOUSE_ID__'; shift uuid:='__SHIFT_ID__';
 request_id uuid:=gen_random_uuid(); answer jsonb; replay jsonb; payload jsonb; bad jsonb; d public.bf_documents;
 before_docs bigint; before_requests bigint; rejected boolean; old_rows text; checks integer:=0;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',employee::text,true);
 UPDATE public.bf_settings SET vat_rate=15,tax_inclusive=true WHERE cafe_id=cafe;
 payload:=jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('productId',product,'quantity',2.4,'expectedUnitPrice',20)),
  'expectedTotal',48,'discount',0,'warehouseId',warehouse,'shiftId',shift,'accountId',drawer,
  'offlineExpectedVatRate',15,'offlineExpectedTaxInclusive',true,
  'localReceiptReference','L-TEST0001-000001','localCreatedAt','2026-10-25T09:10:11.123Z');
 SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'')) INTO old_rows FROM public.bf_documents x;
 SELECT count(*) INTO before_docs FROM public.bf_documents;
 answer:=public.brand_finance_execute(cafe,'sale',payload,request_id);
 SELECT * INTO STRICT d FROM public.bf_documents WHERE id=(answer->>'id')::uuid;
 ASSERT d.local_reference='L-TEST0001-000001' AND d.local_created_at='2026-10-25T09:10:11.123Z'::timestamptz,'local receipt identity is retained'; checks:=checks+1;
 ASSERT d.created_at=transaction_timestamp() AND d.created_at<>d.local_created_at,'server posting time is not overwritten'; checks:=checks+1;
 ASSERT d.total=48 AND d.tax=6.26 AND d.vat_rate=15 AND d.tax_inclusive,'inclusive VAT rounding remains exact'; checks:=checks+1;
 ASSERT (SELECT count(*) FROM public.bf_documents)=before_docs+1,'one invoice created'; checks:=checks+1;
 ASSERT old_rows=(SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'')) FROM public.bf_documents x WHERE id<>d.id),'older invoices unchanged'; checks:=checks+1;
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(public.brand_finance_snapshot(cafe)->'documents') doc WHERE doc->>'id'=d.id::text AND doc->>'local_reference'=d.local_reference AND (doc->>'local_created_at')::timestamptz=d.local_created_at),'snapshot contains local metadata'; checks:=checks+1;

 UPDATE public.bf_settings SET vat_rate=5 WHERE cafe_id=cafe;
 replay:=public.brand_finance_execute(cafe,'sale',payload,request_id);
 ASSERT (replay->>'duplicate')::boolean AND replay->>'id'=answer->>'id','replay succeeds even after current VAT changes'; checks:=checks+1;
 SELECT count(*) INTO before_docs FROM public.bf_documents;
 SELECT count(*) INTO before_requests FROM public.bf_requests;
 rejected:=false; BEGIN PERFORM public.brand_finance_execute(cafe,'sale',payload||'{"localReceiptReference":"L-TEST0001-000002"}'::jsonb,gen_random_uuid()); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 ASSERT rejected AND (SELECT count(*) FROM public.bf_documents)=before_docs AND (SELECT count(*) FROM public.bf_requests)=before_requests,'new sale cannot silently change included VAT'; checks:=checks+1;
 UPDATE public.bf_settings SET vat_rate=15,tax_inclusive=false WHERE cafe_id=cafe;
 rejected:=false; BEGIN PERFORM public.brand_finance_execute(cafe,'sale',payload||'{"localReceiptReference":"L-TEST0001-000002"}'::jsonb,gen_random_uuid()); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 ASSERT rejected AND (SELECT count(*) FROM public.bf_documents)=before_docs,'included/excluded tax mode drift is rejected'; checks:=checks+1;
 UPDATE public.bf_settings SET tax_inclusive=true WHERE cafe_id=cafe;

 FOR bad IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
  payload-'offlineExpectedVatRate',payload-'offlineExpectedTaxInclusive',payload-'localCreatedAt',payload-'localReceiptReference',
  payload||'{"offlineExpectedVatRate":"15"}'::jsonb,payload||'{"offlineExpectedTaxInclusive":"true"}'::jsonb,
  payload||'{"localReceiptReference":"<script>"}'::jsonb,payload||'{"localReceiptReference":"L-"}'::jsonb,
  payload||jsonb_build_object('localReceiptReference','L-'||repeat('a',100)),
  payload||'{"localCreatedAt":"infinity"}'::jsonb,payload||'{"localCreatedAt":"2026-10-25 09:10:11"}'::jsonb,
  payload||'{"localCreatedAt":"2026-99-99T09:10:11Z"}'::jsonb,payload||'{"localCreatedAt":null}'::jsonb)) LOOP
  rejected:=false; BEGIN PERFORM public.brand_finance_execute(cafe,'sale',bad,gen_random_uuid()); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
  ASSERT rejected AND (SELECT count(*) FROM public.bf_documents)=before_docs,'malformed offline contract is atomic'; checks:=checks+1;
 END LOOP;

 rejected:=false; BEGIN PERFORM public.brand_finance_execute(cafe,'sale',payload,gen_random_uuid()); EXCEPTION WHEN unique_violation THEN rejected:=true; END;
 ASSERT rejected AND (SELECT count(*) FROM public.bf_documents)=before_docs,'different request cannot reuse local reference within brand'; checks:=checks+1;
 INSERT INTO public.bf_documents(cafe_id,kind,created_by,local_reference,local_created_at) VALUES(other_cafe,'sale',employee,d.local_reference,d.local_created_at);
 ASSERT (SELECT count(*) FROM public.bf_documents WHERE local_reference=d.local_reference)=2,'reference uniqueness is per brand'; checks:=checks+1;
 rejected:=false; BEGIN UPDATE public.bf_documents SET local_reference='L-CHANGED' WHERE id=d.id; EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 ASSERT rejected,'existing immutable document trigger covers local metadata'; checks:=checks+1;
 rejected:=false; BEGIN INSERT INTO public.bf_documents(cafe_id,kind,created_by,local_reference,local_created_at) VALUES(cafe,'expense',employee,'L-NONSALE',d.local_created_at); EXCEPTION WHEN check_violation THEN rejected:=true; END;
 ASSERT rejected,'local receipt metadata belongs only to a sale'; checks:=checks+1;
 answer:=public.brand_finance_execute(cafe,'sale',payload-ARRAY['offlineExpectedVatRate','offlineExpectedTaxInclusive','localReceiptReference','localCreatedAt'],gen_random_uuid());
 ASSERT (SELECT local_reference IS NULL AND local_created_at IS NULL FROM public.bf_documents WHERE id=(answer->>'id')::uuid),'legacy online sale remains compatible'; checks:=checks+1;
 ASSERT NOT has_table_privilege('anon','public.bf_documents','INSERT') AND NOT has_table_privilege('authenticated','public.bf_documents','INSERT'),'clients cannot bypass authoritative posting'; checks:=checks+1;
 ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.bf_documents'::regclass),'RLS remains enabled'; checks:=checks+1;
 INSERT INTO pos_offline_check_results VALUES(checks);
 RAISE NOTICE 'PASS offline sale database checks: %',checks;
END $tests$;
SELECT checks AS passed_checks FROM pos_offline_check_results;
ROLLBACK;
