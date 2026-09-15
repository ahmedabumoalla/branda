export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { CustomersPageClient } from "@/components/dashboard/pages/customers-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerCustomersDashboard } from "@/lib/data/customers";

export default async function CustomersPage() {
  if (!isSupabaseConfigured()) {
    return <CustomersPageClient initialCustomers={[]} initialOrders={[]} configError="قم بإعداد Supabase في ملف البيئة" />;
  }
  try {
    const dashboard = await getOwnerCustomersDashboard();
    return <CustomersPageClient initialCustomers={dashboard.customers} initialOrders={dashboard.orders} />;
  } catch {
    return <CustomersPageClient initialCustomers={[]} initialOrders={[]} configError="تعذر تحميل العملاء" />;
  }
}
