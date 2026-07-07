export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { CompanyAccountsPage } from "@/components/dashboard/pages/company-accounts-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerCompanyAccountsDashboard } from "@/lib/data/company-accounts";

export default async function DashboardCompanyAccountsPage() {
  if (!isSupabaseConfigured()) {
    return <CompanyAccountsPage data={null} configError="قم بإعداد Supabase في .env.local" />;
  }

  try {
    const data = await getOwnerCompanyAccountsDashboard();
    return <CompanyAccountsPage data={data} />;
  } catch (error) {
    console.error("[DashboardCompanyAccountsPage]", error);
    return <CompanyAccountsPage data={null} configError="تعذر تحميل حسابات الشركات" />;
  }
}
