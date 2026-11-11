BEGIN;

-- Extend customer metadata while preserving tenant, role, job and replay guards
CREATE OR REPLACE FUNCTION public.brand_finance_save_customer(p_cafe_id uuid, p_payload jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE result jsonb; r text; detail jsonb; field record; customer_id uuid; contacts jsonb; contact jsonb; contact_field record;
BEGIN
 PERFORM brand_finance_private.assert_job_access(p_cafe_id,'brand_finance_save_customer',NULL);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
  r := brand_finance_private.role_for(p_cafe_id);
  IF r NOT IN ('owner','manager','accountant') THEN RAISE EXCEPTION 'Finance manager required' USING ERRCODE='42501'; END IF;
  IF p_payload->>'kind' IS DISTINCT FROM 'customer' THEN RAISE EXCEPTION 'Customer required'; END IF;
  detail := coalesce(p_payload->'details','{}'::jsonb);
  IF jsonb_typeof(detail) <> 'object' OR octet_length(detail::text) > 16000 THEN RAISE EXCEPTION 'Invalid customer details'; END IF;
  FOR field IN SELECT key,value FROM jsonb_each(detail) LOOP
    IF field.key NOT IN ('legalName','taxRegistration','country','region','city','district','street','buildingNumber','additionalNumber','postalCode','unitNumber','shortAddress','addressNotes','governmentIdType','governmentId','commercialRegistration','unifiedNumber','contactName','notes','customerType','firstName','lastName','telephone','governmentEntity','shippingEnabled','shippingName','shippingBuildingNumber','shippingStreet','shippingAdditionalNumber','shippingDistrict','shippingCity','shippingPostalCode','shippingShortAddress','shippingCountry','invoiceMethod','currency','classification','language','contacts')
      OR jsonb_typeof(field.value) <> 'string' OR length(field.value #>> '{}') > (CASE WHEN field.key IN ('notes','addressNotes') THEN 2000 WHEN field.key='contacts' THEN 14000 ELSE 250 END)
    THEN RAISE EXCEPTION 'Invalid customer detail field'; END IF;
  END LOOP;
  IF detail ? 'contacts' THEN
    contacts := (detail->>'contacts')::jsonb;
    IF jsonb_typeof(contacts) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid contacts'; END IF;
    IF jsonb_array_length(contacts)>10 THEN RAISE EXCEPTION 'Too many contacts'; END IF;
    FOR contact IN SELECT value FROM jsonb_array_elements(contacts) LOOP
      IF jsonb_typeof(contact) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid contact'; END IF;
      FOR contact_field IN SELECT key,value FROM jsonb_each(contact) LOOP
        IF contact_field.key NOT IN ('firstName','lastName','email','telephone','phone') OR jsonb_typeof(contact_field.value)<>'string' OR length(contact_field.value #>> '{}')>250 THEN RAISE EXCEPTION 'Invalid contact field'; END IF;
      END LOOP;
    END LOOP;
  END IF;
  IF (detail ? 'customerType' AND detail->>'customerType' NOT IN ('individual','business'))
    OR (detail ? 'invoiceMethod' AND detail->>'invoiceMethod' NOT IN ('print','email','whatsapp'))
    OR (detail ? 'language' AND detail->>'language' NOT IN ('ar','en'))
    OR (detail ? 'currency' AND detail->>'currency' NOT IN ('SAR','AED','USD','EUR','GBP','KWD','BHD','QAR','OMR','EGP'))
    OR (detail ? 'shippingEnabled' AND detail->>'shippingEnabled' NOT IN ('true','false'))
    OR (detail ? 'governmentEntity' AND detail->>'governmentEntity' NOT IN ('true','false'))
  THEN RAISE EXCEPTION 'Invalid customer preference'; END IF;
  customer_id := nullif(p_payload->>'id','')::uuid;
  IF EXISTS (SELECT 1 FROM public.bf_parties WHERE id=customer_id AND (cafe_id<>p_cafe_id OR kind<>'customer')) THEN RAISE EXCEPTION 'Invalid customer' USING ERRCODE='42501'; END IF;
  result := public.brand_finance_execute(p_cafe_id,'party',p_payload,p_request_id);
  -- A replay must not overwrite details changed by a later successful request.
  IF coalesce((result->>'duplicate')::boolean,false) THEN RETURN result; END IF;
  UPDATE public.bf_parties SET details=detail || CASE WHEN details ? 'attachments' THEN jsonb_build_object('attachments',details->'attachments') ELSE '{}'::jsonb END WHERE id=(result->>'id')::uuid AND cafe_id=p_cafe_id AND kind='customer';
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer not saved'; END IF;
  RETURN result;
END $function$;

COMMIT;
