BEGIN;
-- Loyalty-only branch owners do not have the menu/finance table read policy.
-- Keep that policy intact and expose only this authorized dashboard projection.
CREATE FUNCTION public.get_loyalty_branch_dashboard(p_cafe uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM loyalty_branch_private.assert_owner(p_cafe);
 RETURN jsonb_build_object(
  'branches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'active',b.active,'updated_at',b.updated_at,
   'address',b.address,'lat',b.lat,'lng',b.lng,'welcome_message',b.welcome_message,'loyalty_enabled',b.loyalty_enabled,
   'loyalty_logo',b.loyalty_logo,'loyalty_banner',b.loyalty_banner,'loyalty_background',b.loyalty_background,'loyalty_foreground',b.loyalty_foreground,'loyalty_accent',b.loyalty_accent)
   ORDER BY b.sort_order,b.id) FROM public.branches b WHERE b.cafe_id=p_cafe AND b.deleted_at IS NULL),'[]'::jsonb),
  'cashiers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'full_name',c.full_name,'active',c.active,'loyalty_branch_id',c.loyalty_branch_id) ORDER BY c.created_at,c.id)
   FROM public.cafe_cashiers c WHERE c.cafe_id=p_cafe),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.get_loyalty_branch_dashboard(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_loyalty_branch_dashboard(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
