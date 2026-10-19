import { CampaignConsole } from "@/components/marketing-campaigns/campaign-console";
import { getMarketingDashboard } from "@/lib/data/marketing";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function CampaignsPage() {
  const dashboard = await getMarketingDashboard().catch(() => null);
  return <CampaignConsole initialDashboard={dashboard} />;
}
