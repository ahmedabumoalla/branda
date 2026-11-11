BEGIN;
-- Anonymous invoice debt remains linked to its immutable source invoice
-- AR1100 permits null party_id and existing settlement/refund posting preserves that identity
-- Remove only the artificial customer prerequisite; posting/auth/period/shift/fee guards remain
DO $patch$
DECLARE body text; old text;
BEGIN
 SELECT pg_get_functiondef('brand_finance_private.invoice_payment_record(public.bf_documents,public.bf_documents)'::regprocedure) INTO body;
 old:='IF invoice.party_id IS NULL AND paid>0 THEN deletion_guard:=coalesce(deletion_guard,''ربط العميل مطلوب قبل تحويل الدفعة إلى رصيد مستحق''); END IF;';
 IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Unexpected invoice payment capability baseline'; END IF;
 EXECUTE replace(body,old,'');
 SELECT pg_get_functiondef('public.brand_finance_manage_invoice_payment(uuid,jsonb)'::regprocedure) INTO body;
 old:='IF invoice.party_id IS NULL AND collected<invoice.total-refund_total+refund_paid THEN RAISE EXCEPTION ''ربط العميل مطلوب قبل تحويل الدفعة إلى رصيد مستحق''; END IF;';
 IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Unexpected invoice payment mutation baseline'; END IF;
 EXECUTE replace(body,old,'');
END $patch$;
NOTIFY pgrst,'reload schema';
COMMIT;
