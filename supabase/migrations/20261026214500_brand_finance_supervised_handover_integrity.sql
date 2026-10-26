BEGIN;
-- A legacy handover already recorded its closing count and variance. Finalizing
-- custody must preserve those figures instead of creating an unlinked second variance.
DO $$ DECLARE src text; needle text; BEGIN
 SELECT pg_get_functiondef('brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid)'::regprocedure) INTO src;
 needle:='   IF counted<>expected THEN';
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'Unexpected close count baseline'; END IF;
 src:=replace(src,needle,$rep$   IF sh.status='handover' AND (counted IS DISTINCT FROM sh.counted_cash OR counted<>expected) THEN RAISE EXCEPTION 'وردية التسليم مقفلة نقديًا يجب مطابقة المبلغ المسجل قبل إكمال الإقفال الإداري'; END IF;
$rep$||needle);
 needle:='UPDATE public.bf_shifts SET expected_cash=expected,counted_cash=counted,variance=counted-expected,status=CASE';
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'Unexpected close update baseline'; END IF;
 src:=replace(src,needle,'UPDATE public.bf_shifts SET expected_cash=CASE WHEN sh.status=''handover'' THEN sh.expected_cash ELSE expected END,counted_cash=counted,variance=CASE WHEN sh.status=''handover'' THEN sh.variance ELSE counted-expected END,status=CASE');
 EXECUTE src;
END $$;
COMMIT;
