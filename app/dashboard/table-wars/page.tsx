export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { TableWarsPage } from "@/components/dashboard/pages/table-wars-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerTableWarsDashboard } from "@/lib/data/table-wars";

export default async function DashboardTableWarsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <TableWarsPage
        data={null}
        configError="قم بإعداد Supabase في .env.local"
      />
    );
  }

  try {
    const data = await getOwnerTableWarsDashboard();
    return <TableWarsPage data={data} />;
  } catch (error) {
    console.error("[DashboardTableWarsPage]", error);
    return (
      <TableWarsPage
        data={null}
        configError="تعذر تحميل ألعاب العلامة التجارية"
      />
    );
  }
}
