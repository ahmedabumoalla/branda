export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { AdvancedDirectOrdersPage } from "@/components/dashboard/pages/advanced-direct-orders-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerAdvancedDirectOrdersDashboard } from "@/lib/data/advanced-direct-orders";

export default async function DashboardAdvancedDirectOrdersPage() {
  if (!isSupabaseConfigured()) {
    return <AdvancedDirectOrdersPage data={null} configError="قم بإعداد Supabase في .env.local" />;
  }

  try {
    const data = await getOwnerAdvancedDirectOrdersDashboard();
    return <AdvancedDirectOrdersPage data={data} />;
  } catch (error) {
    console.error("[DashboardAdvancedDirectOrdersPage]", error);
    return <AdvancedDirectOrdersPage data={null} configError="تعذر تحميل الطلبات المتقدمة" />;
  }
}
