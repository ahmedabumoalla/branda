BEGIN;
-- Agreements describe the original invoice total, but cannot be created or
-- edited after every source quantity has been returned. Deletion stays allowed.
DO $patch$
DECLARE body text; anchor text:='   IF value<>''null''::jsonb THEN';
BEGIN
 SELECT pg_get_functiondef('public.brand_finance_invoice_management(uuid,jsonb)'::regprocedure) INTO body;
 IF md5(body)<>'31124629123ef857d07d824f991108f4' OR (length(body)-length(replace(body,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'Unexpected invoice management baseline';END IF;
 EXECUTE replace(body,anchor,anchor||E'\n'||$guard$    IF coalesce((brand_finance_private.document_state(p_cafe_id,target)->>'refunded')::boolean,false) THEN RAISE EXCEPTION 'Invalid schedule for fully refunded invoice' USING ERRCODE='22023'; END IF;$guard$);
END $patch$;
NOTIFY pgrst,'reload schema';
COMMIT;
