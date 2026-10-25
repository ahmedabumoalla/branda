-- Return only the signed-in cashier's currently authorized POS destinations.
-- Finance tables intentionally deny direct reads, including service_role.
BEGIN;
CREATE FUNCTION public.brand_finance_sales_cashier_destinations()
RETURNS TABLE(id uuid, slug text, name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate record;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id=auth.uid() AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until<=now())
  ) THEN RAISE EXCEPTION 'Finance authentication required' USING ERRCODE='42501'; END IF;
  FOR candidate IN
    SELECT c.id,c.slug,c.name FROM public.bf_staff s JOIN public.cafes c ON c.id=s.cafe_id
    WHERE s.user_id=auth.uid() AND s.role='cashier' AND s.active
      AND c.deleted_at IS NULL ORDER BY c.slug,c.id
  LOOP
    BEGIN
      -- Reuse live profile, tenant, subscription and role checks at the DB boundary.
      IF brand_finance_private.role_for(candidate.id)='cashier' THEN
        id:=candidate.id;slug:=candidate.slug;name:=candidate.name;
        RETURN NEXT;
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN
      -- A revoked/expired brand cannot hide another valid membership.
      CONTINUE;
    END;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_sales_cashier_destinations() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_sales_cashier_destinations() TO authenticated;
COMMIT;
