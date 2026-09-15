export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { GrowthPage } from "@/components/dashboard/pages/growth-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerGrowthDashboard, normalizeGrowthPeriod } from "@/lib/data/growth";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardGrowthPage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;
  const period = normalizeGrowthPeriod(resolvedSearchParams.period);

  if (!isSupabaseConfigured()) {
    return (
      <GrowthPage
        data={null}
        period={period}
        configError="قم بإعداد Supabase في .env.local"
      />
    );
  }

  try {
    const data = await getOwnerGrowthDashboard(period);
    return <GrowthPage data={data} period={period} />;
  } catch (error) {
    console.error("[DashboardGrowthPage]", error);
    return (
      <GrowthPage
        data={null}
        period={period}
        configError="تعذر تحميل مركز النمو"
      />
    );
  }
}
