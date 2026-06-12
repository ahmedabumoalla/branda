BEGIN;

-- Fix /admin/finance reads after adding finance dashboard joins.
-- Some existing tables were created without explicit service_role grants, so PostgREST
-- returns 42501 even when the server-side admin client is used.
GRANT SELECT ON public.brand_referrals TO service_role;
GRANT SELECT ON public.representative_coupons TO service_role;
GRANT SELECT ON public.platform_representatives TO service_role;
GRANT SELECT ON public.representative_commissions TO service_role;
GRANT SELECT ON public.subscriptions TO service_role;
GRANT SELECT ON public.cafes TO service_role;
GRANT SELECT ON public.platform_plans TO service_role;

-- Keep finance distribution trigger able to maintain referral/commission snapshots.
GRANT UPDATE (first_paid_subscription_at, commission_end_at) ON public.brand_referrals TO service_role;
GRANT INSERT, UPDATE ON public.representative_commissions TO service_role;
GRANT UPDATE (representative_id, coupon_code_snapshot, paid_at) ON public.subscriptions TO service_role;

-- Admin-only read policies for authenticated platform admins, while service_role keeps direct grants.
DROP POLICY IF EXISTS brand_referrals_platform_admin_read ON public.brand_referrals;
CREATE POLICY brand_referrals_platform_admin_read ON public.brand_referrals
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS representative_commissions_platform_admin_read ON public.representative_commissions;
CREATE POLICY representative_commissions_platform_admin_read ON public.representative_commissions
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

COMMIT;
