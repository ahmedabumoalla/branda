export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { MarketplaceBoostPage } from "@/components/dashboard/pages/marketplace-boost-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerMarketplaceBoostDashboard } from "@/lib/data/marketplace-boost";

export default async function DashboardMarketplaceBoostPage() {
  if (!isSupabaseConfigured()) {
    return <MarketplaceBoostPage data={null} configError="قم بإعداد Supabase في .env.local" />;
  }

  try {
    const data = await getOwnerMarketplaceBoostDashboard();
    return <MarketplaceBoostPage data={data} />;
  } catch (error) {
    console.error("[DashboardMarketplaceBoostPage]", error);
    return <MarketplaceBoostPage data={null} configError="تعذر تحميل إبراز العروض" />;
  }
}
