-- Preserve offline receipt identity and reject VAT drift inside the posting transaction
-- Existing request replay happens before this validation and all prior invoices remain unchanged
BEGIN;

ALTER TABLE public.bf_documents
 ADD COLUMN local_reference text,
 ADD COLUMN local_created_at timestamptz,
 ADD CONSTRAINT bf_documents_local_receipt_contract CHECK (
  (local_reference IS NULL AND local_created_at IS NULL)
  OR (kind='sale' AND local_reference IS NOT NULL AND local_created_at IS NOT NULL
      AND length(local_reference)<=96 AND local_reference ~ '^L-[A-Za-z0-9-]+$'
      AND isfinite(local_created_at))
 );
CREATE UNIQUE INDEX bf_documents_local_receipt_unique
 ON public.bf_documents(cafe_id,local_reference) WHERE local_reference IS NOT NULL;
COMMENT ON COLUMN public.bf_documents.local_created_at IS
 'Untrusted client capture time retained for offline receipt reconciliation; created_at remains authoritative server posting time';
COMMENT ON COLUMN public.bf_documents.local_reference IS
 'Immutable device receipt reference unique within the brand; not the authoritative document number';

DO $migration$
DECLARE source text; needle text; replacement text;
BEGIN
 SELECT pg_get_functiondef('brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid)'::regprocedure) INTO source;
 needle:='   SELECT * INTO sh FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND bf_shifts.id=sid AND user_id=auth.uid() AND status=''open'' FOR UPDATE;';
 IF strpos(source,needle)=0 OR strpos(substr(source,strpos(source,needle)+length(needle)),needle)>0 THEN
  RAISE EXCEPTION 'Offline sale contract: posting anchor changed';
 END IF;
 replacement:=$guard$
   -- cfg is locked and any authorized invoice override has already been applied
   -- A committed request was returned earlier, before comparing current tax settings
   IF p_payload ?| ARRAY['offlineExpectedVatRate','offlineExpectedTaxInclusive','localReceiptReference','localCreatedAt'] THEN
    IF jsonb_typeof(p_payload->'offlineExpectedVatRate') IS DISTINCT FROM 'number'
       OR jsonb_typeof(p_payload->'offlineExpectedTaxInclusive') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(p_payload->'localReceiptReference') IS DISTINCT FROM 'string'
       OR jsonb_typeof(p_payload->'localCreatedAt') IS DISTINCT FROM 'string' THEN
     RAISE EXCEPTION 'بيانات مطابقة الفاتورة المحلية غير مكتملة';
    END IF;
    IF (p_payload->>'offlineExpectedVatRate')::numeric IS DISTINCT FROM cfg.vat_rate
       OR (p_payload->>'offlineExpectedTaxInclusive')::boolean IS DISTINCT FROM cfg.tax_inclusive THEN
     RAISE EXCEPTION 'تغيرت ضريبة الفاتورة المحلية احتفظ بالإيصال وراجع مسؤول العلامة لتسوية التعارض';
    END IF;
    IF length(p_payload->>'localReceiptReference')>96
       OR (p_payload->>'localReceiptReference') !~ '^L-[A-Za-z0-9-]+$'
       OR (p_payload->>'localCreatedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
       OR NOT isfinite((p_payload->>'localCreatedAt')::timestamptz) THEN
     RAISE EXCEPTION 'مرجع الفاتورة المحلية أو وقت حفظها غير صالح';
    END IF;
   END IF;
$guard$ || needle;
 source:=replace(source,needle,replacement);

 needle:='vat_rate,tax_inclusive,customer_phone) VALUES(id,p_cafe_id,p_operation,pid,CASE WHEN p_operation=''sale'' THEN sid ELSE NULL END,aid,wid,subtotal,discount,tax,total,paid,note,auth.uid(),cfg.vat_rate,cfg.tax_inclusive,CASE WHEN p_operation=''sale'' THEN brand_finance_private.customer_phone(p_payload->>''customerPhone'') END)';
 IF strpos(source,needle)=0 OR strpos(substr(source,strpos(source,needle)+length(needle)),needle)>0 THEN
  RAISE EXCEPTION 'Offline sale contract: document insert anchor changed';
 END IF;
 replacement:='vat_rate,tax_inclusive,customer_phone,local_reference,local_created_at) VALUES(id,p_cafe_id,p_operation,pid,CASE WHEN p_operation=''sale'' THEN sid ELSE NULL END,aid,wid,subtotal,discount,tax,total,paid,note,auth.uid(),cfg.vat_rate,cfg.tax_inclusive,CASE WHEN p_operation=''sale'' THEN brand_finance_private.customer_phone(p_payload->>''customerPhone'') END,CASE WHEN p_operation=''sale'' THEN p_payload->>''localReceiptReference'' END,CASE WHEN p_operation=''sale'' THEN (p_payload->>''localCreatedAt'')::timestamptz END)';
 source:=replace(source,needle,replacement);
 EXECUTE source;
END $migration$;

-- The existing immutable trigger, RLS and grants are retained
-- brand_finance_snapshot already emits to_jsonb(document), including these additive columns
COMMIT;
