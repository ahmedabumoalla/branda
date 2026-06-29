import { LoyaltyPointsWorkspace } from "@/components/branda-finance/loyalty-points-workspace";
import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

export default async function BrandaFinanceLoyaltyPointsPage() {
  const features = await getOwnerFeatureCodes().catch(() => []);
  if (!featureCodesAllow(features, "loyalty")) {
    return <DashboardFeatureBlockedState title="الولاء غير مفعل في هذه الباقة" />;
  }

  return <LoyaltyPointsWorkspace />;
}
