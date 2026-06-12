export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { AdminFinancePage } from "@/components/admin/pages/admin-finance-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getAdminFinanceDashboard } from "@/lib/data/finance";

export default async function AdminFinanceRoutePage() {
  if (!isSupabaseConfigured()) {
    return <AdminFinancePage data={null} configError="قم بإعداد Supabase في .env.local" />;
  }

  try {
    const data = await getAdminFinanceDashboard();
    return <AdminFinancePage data={data} />;
  } catch (error) {
    console.error("[AdminFinanceRoutePage]", error);
    return <AdminFinancePage data={null} configError="تعذر تحميل بيانات المالية" />;
  }
}
