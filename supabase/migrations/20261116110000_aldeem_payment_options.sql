BEGIN;
CREATE FUNCTION public.aldeem_invoice_payment_options(p_cafe_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR brand_finance_private.role_for(p_cafe_id) IS DISTINCT FROM 'owner'
 OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND slug='khayal-aldeem')
 THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
  'accounts',(SELECT coalesce(jsonb_agg(a ORDER BY a.name),'[]'::jsonb) FROM (
   SELECT id,name,code,kind,active,is_primary,is_cashier_drawer,0 AS balance FROM public.bf_accounts
   WHERE cafe_id=p_cafe_id AND active AND kind IN ('cash','bank','pos')
  ) a),
  'warehouses',(SELECT coalesce(jsonb_agg(w ORDER BY w.name),'[]'::jsonb) FROM (
   SELECT id,name,active FROM public.bf_warehouses WHERE cafe_id=p_cafe_id AND active
  ) w),
  'settings',(SELECT jsonb_build_object('vat_rate',vat_rate,'tax_inclusive',tax_inclusive,'currency',currency,'closed_through',closed_through)
   FROM public.bf_settings WHERE cafe_id=p_cafe_id)
 );
END $$;
REVOKE ALL ON FUNCTION public.aldeem_invoice_payment_options(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.aldeem_invoice_payment_options(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
