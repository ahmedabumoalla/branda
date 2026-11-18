import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { ReadOperationsPage } from "@/components/dashboard/pages/read-operations-page";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { getOwnerLoyaltyReads } from "@/lib/data/loyalty-read-operations";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

export const dynamic = "force-dynamic";

export default async function LoyaltyCashierReadsPage() {
  const features = await getOwnerFeatureCodes().catch(() => null);
  if (features && !featureCodesAllow(features, "loyalty")) {
    return <DashboardFeatureBlockedState title="سجل قراءات الكاشير" />;
  }
  const data = features ? await getOwnerLoyaltyReads({ page: 1 }).catch(() => null) : null;
  return <ReadOperationsPage initialData={data} initialError={data ? undefined : "تعذر تحميل سجل قراءات الكاشير حاول التحديث"} />;
}
