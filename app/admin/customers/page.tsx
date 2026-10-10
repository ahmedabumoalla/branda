export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { AdminCustomersPage } from "@/components/admin/pages/admin-customers-page";
import { getCustomerIntelligence } from "@/lib/data/customer-intelligence";
import { requirePlatformAdmin } from "@/lib/data/cafes";

export default async function AdminCustomersRoutePage() {
  await requirePlatformAdmin();

  try {
    const data = await getCustomerIntelligence({});
    return <AdminCustomersPage initialData={data} />;
  } catch {
    return (
      <AdminCustomersPage initialData={null} configError="تعذر تحميل العملاء حاول تحديث البيانات" />
    );
  }
}
