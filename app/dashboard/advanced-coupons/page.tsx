export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { AdvancedCouponsPage } from "@/components/dashboard/pages/advanced-coupons-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerAdvancedCouponsDashboard } from "@/lib/data/advanced-coupons";

export default async function DashboardAdvancedCouponsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <AdvancedCouponsPage
        data={null}
        configError="قم بإعداد Supabase في .env.local"
      />
    );
  }

  try {
    const data = await getOwnerAdvancedCouponsDashboard();
    return <AdvancedCouponsPage data={data} />;
  } catch (error) {
    console.error("[DashboardAdvancedCouponsPage]", error);
    return (
      <AdvancedCouponsPage
        data={null}
        configError="تعذر تحميل الكوبونات المتقدمة"
      />
    );
  }
}
