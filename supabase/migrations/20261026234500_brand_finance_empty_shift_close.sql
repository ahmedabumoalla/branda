BEGIN;
-- An explicitly counted empty drawer has no cash custody to assign. Preserve all
-- normal closing/variance/audit checks and do not touch other pending handovers.
DO $$ DECLARE src text; needle text; BEGIN
 SELECT pg_get_functiondef('brand_finance_private.close_cash_handover(uuid,uuid,jsonb)'::regprocedure) INTO src;
 needle:='IF mode NOT IN(''next_shift'',''accountant'',''other'') THEN';
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'Unexpected handover mode baseline'; END IF;
 EXECUTE replace(src,needle,$rep$IF mode='no_cash' THEN
  IF sh.counted_cash<>0 THEN RAISE EXCEPTION 'لا يمكن إقفال الوردية دون تسليم إلا إذا كانت النقدية المعدودة صفرًا'; END IF;
  RETURN;
 END IF;
 $rep$||needle);
END $$;
COMMIT;
