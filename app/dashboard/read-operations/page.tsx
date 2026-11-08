import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { ReadOperationsPage } from "@/components/dashboard/pages/read-operations-page";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { getOwnerLoyaltyReads } from "@/lib/data/loyalty-read-operations";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function DashboardReadOperationsPage() {
  const features = await getOwnerFeatureCodes().catch(() => null);
  if (!features) {
    return <ReadOperationsPage initialData={null} initialError="تعذر تحميل سجل عمليات القراءة حاول التحديث" />;
  }
  if (!featureCodesAllow(features, "loyalty")) {
    return <DashboardFeatureBlockedState title="سجل عمليات القراءة" />;
  }
  const data = await getOwnerLoyaltyReads({ page: 1 }).catch((error: unknown) => {
    console.error("[DashboardReadOperationsPage]", error);
    return null;
  });
  return <ReadOperationsPage initialData={data} initialError={data ? undefined : "تعذر تحميل سجل عمليات القراءة حاول التحديث"} />;
}
