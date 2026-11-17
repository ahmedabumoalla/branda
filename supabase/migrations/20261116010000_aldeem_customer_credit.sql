BEGIN;

-- Aldeem credit policy is stored with the customer and applies to every sales channel
-- bf_documents and the receivable ledger use SAR, including foreign-currency invoices
CREATE FUNCTION erp_customer_private.aldeem_credit_state(c uuid, customer uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.bf_parties; enabled boolean; ceiling numeric:=0; days integer:=0; balance numeric; overdue boolean;
BEGIN
 SELECT * INTO p FROM public.bf_parties WHERE cafe_id=c AND id=customer AND kind='customer';
 IF p.id IS NULL THEN RAISE EXCEPTION 'العميل غير متاح' USING ERRCODE='22023';END IF;
 enabled:=coalesce(p.details->>'creditEnabled','false')='true';
 IF enabled THEN
  IF coalesce(p.details->>'creditLimit','')!~'^[0-9]{1,13}(\.[0-9]{1,2})?$'
     OR coalesce(p.details->>'creditDays','')!~'^[0-9]{1,4}$' THEN RAISE EXCEPTION 'راجع حد البيع الآجل ومدة السداد';END IF;
  ceiling:=(p.details->>'creditLimit')::numeric;days:=(p.details->>'creditDays')::integer;
  IF ceiling>1000000000000 OR days>3650 THEN RAISE EXCEPTION 'راجع حد البيع الآجل ومدة السداد';END IF;
 END IF;
 SELECT coalesce(sum(j.debit-j.credit),0) INTO balance FROM public.bf_journal j
 JOIN public.bf_accounts a ON a.cafe_id=j.cafe_id AND a.id=j.account_id
 WHERE j.cafe_id=c AND j.party_id=customer AND a.kind='receivable';
 SELECT enabled AND EXISTS(SELECT 1 FROM public.bf_documents d
  WHERE d.cafe_id=c AND d.party_id=customer AND d.kind='sale'
  AND (d.created_at AT TIME ZONE 'Asia/Riyadh')::date + days < (now() AT TIME ZONE 'Asia/Riyadh')::date
  AND coalesce((brand_finance_private.document_state(c,d.id)->>'outstanding')::numeric,0)>0) INTO overdue;
 RETURN jsonb_build_object('enabled',enabled,'limit',ceiling,'days',days,'balance',balance,
  'available',CASE WHEN enabled AND NOT overdue THEN greatest(ceiling-greatest(balance,0),0) ELSE 0 END,'overdue',overdue);
END $$;
REVOKE ALL ON FUNCTION erp_customer_private.aldeem_credit_state(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.aldeem_customer_credit_context(p_cafe_id uuid,p_customer_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR brand_finance_private.role_for(p_cafe_id) IS DISTINCT FROM 'owner'
 OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND slug='khayal-aldeem')
 THEN RAISE EXCEPTION 'لا تملك صلاحية عرض ائتمان العميل' USING ERRCODE='42501';END IF;
 RETURN erp_customer_private.aldeem_credit_state(p_cafe_id,p_customer_id);
END $$;
REVOKE ALL ON FUNCTION public.aldeem_customer_credit_context(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.aldeem_customer_credit_context(uuid,uuid) TO authenticated;

-- Keep the existing guard unchanged for other brands. Aldeem checks the final
-- transaction state, after prepaid-credit applications and settlements are posted
DO $$DECLARE source text; marker text:='IF NEW.kind<>''sale''';BEGIN
 source:=pg_get_functiondef('erp_customer_private.credit_guard()'::regprocedure);
 IF strpos(source,marker)=0 THEN RAISE EXCEPTION 'Unexpected legacy credit guard baseline';END IF;
 source:=replace(source,marker,'IF EXISTS(SELECT 1 FROM public.cafes WHERE id=NEW.cafe_id AND slug=''khayal-aldeem'') THEN RETURN NEW;END IF; '||marker);
 EXECUTE source;
END $$;

CREATE FUNCTION erp_customer_private.aldeem_credit_lock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.kind='sale' AND EXISTS(SELECT 1 FROM public.cafes WHERE id=NEW.cafe_id AND slug='khayal-aldeem') THEN
  -- Use the established tenant finance lock first to preserve lock ordering
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.cafe_id::text,60412));
  IF NEW.party_id IS NOT NULL THEN
   PERFORM 1 FROM public.bf_parties WHERE cafe_id=NEW.cafe_id AND id=NEW.party_id FOR UPDATE;
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_customer_private.aldeem_credit_lock() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER aldeem_credit_lock BEFORE INSERT OR UPDATE OF total,paid,party_id,cafe_id,kind
 ON public.bf_documents FOR EACH ROW EXECUTE FUNCTION erp_customer_private.aldeem_credit_lock();

CREATE FUNCTION erp_customer_private.aldeem_credit_check() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE doc public.bf_documents; state jsonb; outstanding numeric;
BEGIN
 IF NEW.kind<>'sale' OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=NEW.cafe_id AND slug='khayal-aldeem') THEN RETURN NULL;END IF;
 IF TG_OP='UPDATE' AND OLD.kind='sale' AND NEW.cafe_id=OLD.cafe_id AND NEW.party_id IS NOT DISTINCT FROM OLD.party_id AND NEW.total-NEW.paid<=OLD.total-OLD.paid THEN RETURN NULL;END IF;
 SELECT * INTO doc FROM public.bf_documents WHERE cafe_id=NEW.cafe_id AND id=NEW.id AND kind='sale';
 IF doc.id IS NULL THEN RETURN NULL;END IF;
 outstanding:=coalesce((brand_finance_private.document_state(doc.cafe_id,doc.id)->>'outstanding')::numeric,0);
 IF outstanding<=0 THEN RETURN NULL;END IF;
 IF doc.party_id IS NULL THEN RAISE EXCEPTION 'اختر العميل قبل البيع الآجل';END IF;
 state:=erp_customer_private.aldeem_credit_state(doc.cafe_id,doc.party_id);
 IF NOT (state->>'enabled')::boolean THEN RAISE EXCEPTION 'البيع الآجل غير مفعّل لهذا العميل ويجب سداد كامل الفاتورة';END IF;
 IF (state->>'overdue')::boolean THEN RAISE EXCEPTION 'للعميل فاتورة تجاوزت مدة السداد ولا يمكن البيع له بالآجل حتى تسويتها';END IF;
 IF (state->>'balance')::numeric>(state->>'limit')::numeric THEN
  RAISE EXCEPTION 'الفاتورة تتجاوز حد العميل ويجب تحصيل المبلغ الزائد نقدًا قبل الإصدار';
 END IF;
 -- A mixed invoice that only fits the limit because of its upfront payment
 -- must collect that required excess in cash, rather than another payment method
 IF doc.paid>0 AND (state->>'balance')::numeric+doc.paid>(state->>'limit')::numeric
 AND NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=doc.cafe_id AND id=doc.account_id AND kind='cash') THEN
  RAISE EXCEPTION 'المبلغ الذي يتجاوز الحد الائتماني يجب سداده نقدًا';
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION erp_customer_private.aldeem_credit_check() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER aldeem_credit_check AFTER INSERT OR UPDATE ON public.bf_documents
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_customer_private.aldeem_credit_check();

-- Validate policies even when a different authorized customer editor updates them
CREATE FUNCTION erp_customer_private.aldeem_customer_policy_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ceiling numeric;days integer;
BEGIN
 IF NEW.kind<>'customer' OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=NEW.cafe_id AND slug='khayal-aldeem') THEN RETURN NEW;END IF;
 IF NEW.details ? 'creditEnabled' AND (jsonb_typeof(NEW.details->'creditEnabled')<>'string' OR NEW.details->>'creditEnabled' NOT IN('true','false')) THEN RAISE EXCEPTION 'راجع خيار البيع الآجل';END IF;
 IF NEW.details->>'creditEnabled'='true' THEN
  IF coalesce(NEW.details->>'creditLimit','')!~'^[0-9]{1,13}(\.[0-9]{1,2})?$' OR coalesce(NEW.details->>'creditDays','')!~'^[0-9]{1,4}$' THEN RAISE EXCEPTION 'حدد حد البيع الآجل ومدة السداد';END IF;
  ceiling:=(NEW.details->>'creditLimit')::numeric;days:=(NEW.details->>'creditDays')::integer;
  IF ceiling>1000000000000 OR days>3650 THEN RAISE EXCEPTION 'راجع حد البيع الآجل ومدة السداد';END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_customer_private.aldeem_customer_policy_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER aldeem_customer_policy_guard BEFORE INSERT OR UPDATE OF details ON public.bf_parties
 FOR EACH ROW EXECUTE FUNCTION erp_customer_private.aldeem_customer_policy_guard();

CREATE FUNCTION public.aldeem_save_customer(p_cafe_id uuid,p_payload jsonb,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;detail jsonb;field record;customer_id uuid;
BEGIN
 IF auth.uid() IS NULL OR brand_finance_private.role_for(p_cafe_id) IS DISTINCT FROM 'owner'
 OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND slug='khayal-aldeem')
 THEN RAISE EXCEPTION 'لا تملك صلاحية حفظ العميل' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 IF p_payload->>'kind' IS DISTINCT FROM 'customer' OR length(btrim(coalesce(p_payload->>'name',''))) NOT BETWEEN 1 AND 150
 OR length(coalesce(p_payload->>'phone',''))>30 OR length(coalesce(p_payload->>'email',''))>254 THEN RAISE EXCEPTION 'راجع اسم العميل وبيانات التواصل';END IF;
 detail:=coalesce(p_payload->'details','{}'::jsonb);
 IF jsonb_typeof(detail)<>'object' OR octet_length(detail::text)>16000 THEN RAISE EXCEPTION 'راجع بيانات العميل';END IF;
 FOR field IN SELECT key,value FROM jsonb_each(detail) LOOP
  IF field.key NOT IN('legalName','taxRegistration','country','region','city','district','street','buildingNumber','additionalNumber','postalCode','unitNumber','shortAddress','addressNotes','governmentIdType','governmentId','commercialRegistration','unifiedNumber','contactName','notes','customerType','firstName','lastName','telephone','governmentEntity','shippingEnabled','shippingName','shippingBuildingNumber','shippingStreet','shippingAdditionalNumber','shippingDistrict','shippingCity','shippingPostalCode','shippingShortAddress','shippingCountry','shippingUnitNumber','shippingAddress','shippingLandmark','address','landmark','invoiceMethod','currency','classification','language','contacts','creditEnabled','creditLimit','creditDays','customerCode','customerBarcode')
   OR jsonb_typeof(field.value)<>'string' OR length(field.value#>>'{}')>(CASE WHEN field.key='contacts' THEN 8000 WHEN field.key IN('notes','addressNotes','address','shippingAddress') THEN 2000 ELSE 250 END)
  THEN RAISE EXCEPTION 'راجع حقول بيانات العميل';END IF;
 END LOOP;
 customer_id:=nullif(p_payload->>'id','')::uuid;
 IF EXISTS(SELECT 1 FROM public.bf_parties WHERE id=customer_id AND (cafe_id<>p_cafe_id OR kind<>'customer')) THEN RAISE EXCEPTION 'العميل غير متاح' USING ERRCODE='42501';END IF;
 result:=public.brand_finance_execute(p_cafe_id,'party',p_payload,p_request_id);
 IF coalesce((result->>'duplicate')::boolean,false) THEN RETURN result;END IF;
 UPDATE public.bf_parties SET details=detail WHERE cafe_id=p_cafe_id AND id=(result->>'id')::uuid AND kind='customer';
 IF NOT FOUND THEN RAISE EXCEPTION 'تعذر حفظ العميل';END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.aldeem_save_customer(uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.aldeem_save_customer(uuid,jsonb,uuid) TO authenticated;

CREATE INDEX bf_aldeem_credit_aging ON public.bf_documents(cafe_id,party_id,created_at) WHERE kind='sale';
NOTIFY pgrst,'reload schema';
COMMIT;
