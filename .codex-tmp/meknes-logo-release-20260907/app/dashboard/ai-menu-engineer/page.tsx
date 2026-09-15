export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { AiMenuEngineerPage } from "@/components/dashboard/pages/ai-menu-engineer-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerAiMenuEngineerDashboard } from "@/lib/data/ai-menu-engineer";

export default async function DashboardAiMenuEngineerPage() {
  if (!isSupabaseConfigured()) {
    return <AiMenuEngineerPage data={null} configError="قم بإعداد Supabase في .env.local" />;
  }

  try {
    const data = await getOwnerAiMenuEngineerDashboard();
    return <AiMenuEngineerPage data={data} />;
  } catch (error) {
    console.error("[DashboardAiMenuEngineerPage]", error);
    return <AiMenuEngineerPage data={null} configError="تعذر تحميل AI Menu Engineer" />;
  }
}
