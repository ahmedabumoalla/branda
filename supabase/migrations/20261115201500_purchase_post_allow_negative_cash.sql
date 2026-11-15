-- User decision 2026-11-15: issuing a purchase invoice from the brand dashboard is no longer rejected with
-- the insufficient cash message. The paid amount is credited to the treasury chosen on the invoice, the main
-- treasury by default, which may go below zero. Cashier purchases (erp_purchase_private.pos_post, drawer account)
-- and standalone supplier payments (erp_purchase_private.payment) keep their existing cash rule.
-- Only that single statement is removed; journal lines, stock receipt, credits and status are untouched.
-- Idempotent: a second run finds the rule already absent and changes nothing.
DO $$DECLARE source text;hits integer;
 needle text:='IF paid>0 AND EXISTS(SELECT 1 FROM public.bf_accounts a JOIN public.bf_journal j ON j.account_id=a.id AND j.cafe_id=a.cafe_id WHERE a.cafe_id=c AND a.id=aid AND a.kind=''cash'' GROUP BY a.id HAVING sum(j.debit-j.credit)<0) THEN RAISE EXCEPTION ''الرصيد النقدي لا يكفي'';END IF;';
BEGIN
 SELECT pg_get_functiondef('erp_purchase_private.post(uuid,public.erp_purchase_documents,numeric)'::regprocedure) INTO source;
 hits:=(length(source)-length(replace(source,needle,'')))/length(needle);
 IF hits=0 AND position('الرصيد النقدي لا يكفي' in source)=0 THEN RETURN;END IF;
 IF hits<>1 THEN RAISE EXCEPTION 'Purchase posting cash rule baseline mismatch';END IF;
 EXECUTE replace(source,needle,'');
END$$;
