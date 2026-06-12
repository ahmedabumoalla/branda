export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { AdminValuationPage } from "@/components/admin/pages/admin-valuation-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getAdminFinanceDashboard } from "@/lib/data/finance";

export default async function AdminFinanceValuationRoutePage() {
  if (!isSupabaseConfigured()) {
    return <AdminValuationPage data={null} configError="قم بإعداد Supabase في .env.local" />;
  }

  try {
    const data = await getAdminFinanceDashboard();
    return <AdminValuationPage data={data} />;
  } catch (error) {
    console.error("[AdminFinanceValuationRoutePage]", error);
    return <AdminValuationPage data={null} configError="تعذر تحميل بيانات التقييم" />;
  }
}
