export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { MarketingPageClient } from "@/components/dashboard/pages/marketing-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerExperienceData } from "@/lib/data/experience";
import { getOwnerMarketingCampaigns } from "@/lib/data/marketing";

export default async function DashboardMarketingPage() {
  if (!isSupabaseConfigured()) {
    return (
      <MarketingPageClient
        initialCampaigns={[]}
        initialExpCampaigns={[]}
        initialSubmissions={[]}
        configError="قم بإعداد Supabase في .env.local"
      />
    );
  }

  try {
    const [campaigns, experience] = await Promise.all([
      getOwnerMarketingCampaigns(),
      getOwnerExperienceData(),
    ]);
    return (
      <MarketingPageClient
        initialCampaigns={campaigns}
        initialExpCampaigns={experience.campaigns}
        initialSubmissions={experience.submissions}
      />
    );
  } catch {
    return (
      <MarketingPageClient
        initialCampaigns={[]}
        initialExpCampaigns={[]}
        initialSubmissions={[]}
        configError="تعذر تحميل بيانات التسويق"
      />
    );
  }
}
