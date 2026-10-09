-- NOT a test and NOT part of deployment. Run only after a future explicit request
-- to reactivate storefronts. Restores exactly the original recorded RPC grants.
-- Also requires STOREFRONT_ENABLED=true and a reviewed restoration of storefront
-- feature registry/navigation and package rules. The environment flag alone is
-- insufficient. Package restrictions remain intentionally enforced.
BEGIN;
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT tablename FROM pg_policies WHERE schemaname='public' AND policyname='archived_storefront_access' LOOP
    EXECUTE format('DROP POLICY archived_storefront_access ON public.%I',item.tablename);
  END LOOP;
  FOR item IN SELECT * FROM platform_access_private.archived_rpc_grants LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s%s',item.signature,
      CASE WHEN item.grantee='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(item.grantee) END,
      CASE WHEN item.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;
END $$;
COMMIT;
