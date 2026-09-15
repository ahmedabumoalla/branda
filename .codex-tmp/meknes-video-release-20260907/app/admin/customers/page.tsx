export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { AdminCustomersPage } from "@/components/admin/pages/admin-customers-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getAdminCustomers } from "@/lib/data/admin";
import { mockPlatformCustomers } from "@/lib/platform/admin-data";

export default async function AdminCustomersRoutePage() {
  if (!isSupabaseConfigured()) {
    return (
      <AdminCustomersPage
        initialCustomers={mockPlatformCustomers}
        configError="قم بإعداد Supabase في .env.local"
      />
    );
  }

  try {
    const customers = await getAdminCustomers();
    return <AdminCustomersPage initialCustomers={customers} />;
  } catch {
    return (
      <AdminCustomersPage initialCustomers={[]} configError="تعذر تحميل العملاء" />
    );
  }
}
