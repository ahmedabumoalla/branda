import { LoyaltyCardDesignerPage } from "@/components/dashboard/pages/loyalty-card-designer-page";
import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

export default async function LoyaltyCardDesignerRoute() {
  const features = await getOwnerFeatureCodes().catch(() => []);
  if (!featureCodesAllow(features, "loyalty")) {
    return <DashboardFeatureBlockedState title="الولاء غير مفعل في هذه الباقة" backHref="/dashboard" />;
  }

  return <LoyaltyCardDesignerPage />;
}
