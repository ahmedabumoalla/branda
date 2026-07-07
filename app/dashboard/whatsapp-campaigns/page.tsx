export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { WhatsappCampaignsPage } from "@/components/dashboard/pages/whatsapp-campaigns-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerWhatsappCampaignsDashboard } from "@/lib/data/whatsapp-campaigns";

export default async function DashboardWhatsappCampaignsPage() {
  if (!isSupabaseConfigured()) {
    return <WhatsappCampaignsPage data={null} configError="قم بإعداد Supabase في .env.local" />;
  }

  try {
    const data = await getOwnerWhatsappCampaignsDashboard();
    return <WhatsappCampaignsPage data={data} />;
  } catch (error) {
    console.error("[DashboardWhatsappCampaignsPage]", error);
    return <WhatsappCampaignsPage data={null} configError="تعذر تحميل حملات واتساب" />;
  }
}
