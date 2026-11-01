import { redirect } from "next/navigation";
import { PlatformCampaignConsole } from "@/components/admin/platform-campaign-console";
import { getPlatformCampaignDashboard } from "@/lib/data/platform-marketing";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function PlatformCampaignsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role,status").eq("id", user.id).maybeSingle();
  if (profile?.role !== "platform_admin" || profile.status !== "active") redirect("/login");
  const dashboard = await getPlatformCampaignDashboard().catch(() => null);
  return <PlatformCampaignConsole initialDashboard={dashboard} />;
}
