BEGIN;

-- Reuse the existing customer read's role, employee, branch and field masking
-- checks. Only MIND receives an additional full-history membership projection.
CREATE FUNCTION public.erp_mind_customers_read(p_cafe_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  result jsonb;
  branch_id uuid;
  invoiced_ids jsonb;
BEGIN
  result := public.erp_customers_read(p_cafe_id);
  IF NOT EXISTS (SELECT 1 FROM public.cafes WHERE id = p_cafe_id AND slug = 'mind-hospital') THEN
    RAISE EXCEPTION 'Customer directory not available' USING ERRCODE = '42501';
  END IF;
  branch_id := nullif(result #>> '{branchScope,branchId}', '')::uuid;
  SELECT coalesce(jsonb_agg(customer->>'id' ORDER BY customer->>'id'), '[]'::jsonb)
    INTO invoiced_ids
    FROM jsonb_array_elements(coalesce(result->'customers', '[]'::jsonb)) customer
    WHERE EXISTS (
      SELECT 1 FROM public.bf_documents d
      WHERE d.cafe_id = p_cafe_id AND d.kind = 'sale'
        AND d.party_id = (customer->>'id')::uuid
        AND erp_branch_private.row_allowed(p_cafe_id, branch_id, to_jsonb(d))
    );
  RETURN result || jsonb_build_object('invoicedCustomerIds', invoiced_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.erp_mind_customers_read(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.erp_mind_customers_read(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
