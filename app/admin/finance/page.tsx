export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requirePlatformAdmin } from "@/lib/data/cafes";
import { getFinancePage } from "@/lib/data/platform-finance";
import { AdminFinancePage } from "@/components/admin/pages/admin-finance-page";
import { financeDefaults } from "@/lib/finance/platform-finance";

export default async function FinanceRoute() {
  await requirePlatformAdmin();
  try { return <AdminFinancePage initialData={await getFinancePage()} />; }
  catch {
    return <AdminFinancePage initialData={{ entries: [], total: 0, totals: { collections: 0, payments: 0, count: 0 }, filter: financeDefaults() }} configError="تعذر تحميل المالية حاول تحديث السجل" />;
  }
}
