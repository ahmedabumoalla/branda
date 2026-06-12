export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { AdminPlatformCouponsPage } from "@/components/admin/pages/admin-platform-coupons-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getAdminPlatformPlans } from "@/lib/data/admin";
import { getPlatformDiscountCoupons } from "@/lib/data/platform-coupons";

export default async function AdminPlatformCouponsRoutePage() {
  if (!isSupabaseConfigured()) {
    return <AdminPlatformCouponsPage coupons={[]} plans={[]} configError="قم بإعداد Supabase في .env.local" />;
  }

  try {
    const [coupons, plans] = await Promise.all([getPlatformDiscountCoupons(), getAdminPlatformPlans()]);
    return <AdminPlatformCouponsPage coupons={coupons} plans={plans} />;
  } catch (error) {
    console.error("[AdminPlatformCouponsRoutePage]", error);
    return <AdminPlatformCouponsPage coupons={[]} plans={[]} configError="تعذر تحميل كوبونات خصم المنصة" />;
  }
}
