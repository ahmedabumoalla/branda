export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { CustomerSegmentsPage } from "@/components/dashboard/pages/customer-segments-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import {
  getOwnerCustomerSegmentsDashboard,
  normalizeCustomerSegmentsPeriod,
} from "@/lib/data/customer-segments";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardCustomerSegmentsPage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;
  const period = normalizeCustomerSegmentsPeriod(resolvedSearchParams.period);

  if (!isSupabaseConfigured()) {
    return (
      <CustomerSegmentsPage
        data={null}
        period={period}
        configError="قم بإعداد Supabase في .env.local"
      />
    );
  }

  try {
    const data = await getOwnerCustomerSegmentsDashboard(period);
    return <CustomerSegmentsPage data={data} period={period} />;
  } catch (error) {
    console.error("[DashboardCustomerSegmentsPage]", error);
    return (
      <CustomerSegmentsPage
        data={null}
        period={period}
        configError="تعذر تحميل شرائح العملاء"
      />
    );
  }
}
