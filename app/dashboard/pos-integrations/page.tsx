export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { PosIntegrationsPage } from "@/components/dashboard/pages/pos-integrations-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerPosIntegrationsDashboard } from "@/lib/data/pos-integrations";

export default async function DashboardPosIntegrationsPage() {
  if (!isSupabaseConfigured()) {
    return <PosIntegrationsPage data={null} configError="قم بإعداد Supabase في .env.local" />;
  }

  try {
    const data = await getOwnerPosIntegrationsDashboard();
    return <PosIntegrationsPage data={data} />;
  } catch (error) {
    console.error("[DashboardPosIntegrationsPage]", error);
    return <PosIntegrationsPage data={null} configError="تعذر تحميل تكاملات POS" />;
  }
}
