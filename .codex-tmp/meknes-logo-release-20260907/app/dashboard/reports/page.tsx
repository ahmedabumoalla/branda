export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { ReportsPageClient } from "@/components/dashboard/pages/reports-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerCustomersDashboard } from "@/lib/data/customers";
import { getOwnerOrders } from "@/lib/data/orders";
import { getOwnerVisitAnalytics } from "@/lib/data/platform-upgrade";

export default async function ReportsPage() {
  if (!isSupabaseConfigured()) {
    return <ReportsPageClient initialOrders={[]} initialCustomers={[]} configError="قم بإعداد Supabase في ملف البيئة" />;
  }
  try {
    const [orders, dashboard, visitAnalytics] = await Promise.all([
      getOwnerOrders(),
      getOwnerCustomersDashboard(),
      getOwnerVisitAnalytics(),
    ]);
    return <ReportsPageClient initialOrders={orders} initialCustomers={dashboard.customers} visitAnalytics={visitAnalytics} />;
  } catch {
    return <ReportsPageClient initialOrders={[]} initialCustomers={[]} configError="تعذر تحميل التقارير" />;
  }
}
