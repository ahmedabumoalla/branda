export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { BrandAnalyticsPage } from "@/components/admin/pages/brand-analytics-page";
import { getAdminBrandCustomerAnalytics } from "@/lib/data/brand-customer-analytics";

export default async function AdminBrandAnalyticsPage() {
  const report = await getAdminBrandCustomerAnalytics().catch(() => null);
  return <BrandAnalyticsPage initialReport={report} />;
}
