BEGIN;
CREATE FUNCTION public.aldeem_customer_lookup(p_cafe_id uuid,p_query text DEFAULT '',p_ids uuid[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE term text; result jsonb;
BEGIN
 IF auth.uid() IS NULL OR brand_finance_private.role_for(p_cafe_id) IS DISTINCT FROM 'owner'
 OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND slug='khayal-aldeem')
 THEN RAISE EXCEPTION 'لا تملك صلاحية عرض العملاء' USING ERRCODE='42501'; END IF;
 IF length(coalesce(p_query,''))>100 OR coalesce(cardinality(p_ids),0)>100 THEN RAISE EXCEPTION 'راجع بيانات البحث'; END IF;
 term:='%'||replace(replace(replace(btrim(coalesce(p_query,'')),E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
 SELECT coalesce(jsonb_agg(row),'[]'::jsonb) INTO result FROM (
 SELECT p.id,p.name,p.kind,p.phone,p.email,p.tax_number,p.active,0 AS balance,
 coalesce(p.details,'{}'::jsonb)||CASE WHEN profile.id IS NOT NULL THEN jsonb_build_object('customerCode',profile.code,'customerBarcode',coalesce(profile.payload->>'barcode','')) ELSE '{}'::jsonb END AS details
 FROM public.bf_parties p LEFT JOIN public.erp_customer_profiles profile ON profile.cafe_id=p.cafe_id AND profile.id=p.id
 WHERE p.cafe_id=p_cafe_id AND p.kind='customer'
 AND CASE WHEN coalesce(cardinality(p_ids),0)>0 THEN p.id=ANY(p_ids) ELSE p.active AND (
 p.name ILIKE term OR p.phone ILIKE term OR profile.code ILIKE term OR profile.payload->>'barcode' ILIKE term
 OR p.details->>'customerCode' ILIKE term OR p.details->>'customerBarcode' ILIKE term OR p.details->>'barcode' ILIKE term OR p.id::text=btrim(p_query)) END
 ORDER BY p.name,p.id LIMIT CASE WHEN coalesce(cardinality(p_ids),0)>0 THEN cardinality(p_ids) ELSE 20 END
 ) row;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.aldeem_customer_lookup(uuid,text,uuid[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.aldeem_customer_lookup(uuid,text,uuid[]) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
