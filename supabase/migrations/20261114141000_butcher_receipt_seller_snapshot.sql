BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.bf_documents ADD COLUMN receipt_seller jsonb;

CREATE FUNCTION brand_finance_private.receipt_seller(p_cafe uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('name',c.name,'vatNumber',coalesce(nullif(btrim(s.tax_number),''),''))
 FROM public.cafes c LEFT JOIN public.cafe_settings s ON s.cafe_id=c.id
 WHERE c.id=p_cafe AND c.business_category='butcher_shops'
$$;
REVOKE ALL ON FUNCTION brand_finance_private.receipt_seller(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.brand_finance_receipt_seller(p_cafe_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM brand_finance_private.role_for(p_cafe_id);
 RETURN brand_finance_private.receipt_seller(p_cafe_id);
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_receipt_seller(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_receipt_seller(uuid) TO authenticated;

CREATE FUNCTION brand_finance_private.freeze_receipt_seller()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE configured jsonb; local_identity text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.receipt_seller IS DISTINCT FROM OLD.receipt_seller THEN RAISE EXCEPTION 'Issued receipt seller is immutable'; END IF;
  RETURN NEW;
 END IF;
 NEW.receipt_seller:=NULL;
 IF NEW.kind='refund' THEN
  SELECT d.receipt_seller INTO NEW.receipt_seller FROM public.bf_documents d WHERE d.cafe_id=NEW.cafe_id AND d.id=NEW.reference_id;
 ELSIF NEW.kind='sale' THEN
  configured:=brand_finance_private.receipt_seller(NEW.cafe_id);
  IF configured IS NOT NULL THEN
   IF NEW.local_reference IS NOT NULL THEN
    local_identity:=nullif(current_setting('brand_finance.local_receipt_seller',true),'');
    -- Old queued receipts keep their absent seller instead of acquiring a new tax identity.
    IF local_identity IS NULL THEN RETURN NEW; END IF;
    IF local_identity::jsonb IS DISTINCT FROM configured THEN RAISE EXCEPTION 'تغيرت بيانات البائع احتفظ بالإيصال المحلي وراجع مسؤول العلامة لتسوية التعارض'; END IF;
   END IF;
   NEW.receipt_seller:=configured;
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.freeze_receipt_seller() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER bf_capture_receipt_seller BEFORE INSERT ON public.bf_documents FOR EACH ROW EXECUTE FUNCTION brand_finance_private.freeze_receipt_seller();
CREATE TRIGGER bf_keep_receipt_seller BEFORE UPDATE OF receipt_seller ON public.bf_documents FOR EACH ROW EXECUTE FUNCTION brand_finance_private.freeze_receipt_seller();

DO $migration$
DECLARE source text; old text;
BEGIN
 SELECT pg_get_functiondef('brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid)'::regprocedure) INTO source;
 old:=$anchor$   IF p_payload ?| ARRAY['offlineExpectedVatRate','offlineExpectedTaxInclusive','localReceiptReference','localCreatedAt'] THEN$anchor$;
 IF (length(source)-length(replace(source,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'Offline receipt identity anchor changed'; END IF;
 EXECUTE replace(source,old,$patch$   PERFORM set_config('brand_finance.local_receipt_seller',coalesce((p_payload->'offlineExpectedReceiptSeller')::text,''),true);
$patch$||old);
END $migration$;
NOTIFY pgrst,'reload schema';
COMMIT;
