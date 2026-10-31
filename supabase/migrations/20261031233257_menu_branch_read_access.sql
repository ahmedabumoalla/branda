BEGIN;
SET LOCAL lock_timeout='5s';
-- The archived storefront blocks all branch access. Reopen only menu-linked reads
-- under the existing tenant/public policies and current menu entitlement.
DROP POLICY archived_storefront_access ON public.branches;
CREATE POLICY menu_branch_read_access ON public.branches AS RESTRICTIVE FOR SELECT TO anon,authenticated
USING(public.is_platform_admin() OR (menu_slug IS NOT NULL AND platform_access_private.service_enabled(cafe_id,'menu')));
-- Branch creation, mutation and deletion remain archived/admin-only.
CREATE POLICY archived_branch_insert ON public.branches AS RESTRICTIVE FOR INSERT TO anon,authenticated
WITH CHECK(public.is_platform_admin());
CREATE POLICY archived_branch_update ON public.branches AS RESTRICTIVE FOR UPDATE TO anon,authenticated
USING(public.is_platform_admin()) WITH CHECK(public.is_platform_admin());
CREATE POLICY archived_branch_delete ON public.branches AS RESTRICTIVE FOR DELETE TO anon,authenticated
USING(public.is_platform_admin());
COMMIT;
