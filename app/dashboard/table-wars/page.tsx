export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { TableWarsPage } from "@/components/dashboard/pages/table-wars-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerBattleArenaEnabled } from "@/lib/data/brand-games";
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
    const [data, battleArenaEnabled] = await Promise.all([
      getOwnerTableWarsDashboard(),
      getOwnerBattleArenaEnabled(),
    ]);
    return <TableWarsPage data={data} battleArenaEnabled={battleArenaEnabled} />;
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
