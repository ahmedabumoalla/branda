import { LoyaltyDashboardPage } from "@/components/dashboard/pages/loyalty-dashboard-page";
import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

export default async function LoyaltyCardsPage() {
  const features = await getOwnerFeatureCodes().catch(() => []);
  if (!featureCodesAllow(features, "loyalty")) {
    return <DashboardFeatureBlockedState title="الولاء غير مفعل في هذه الباقة" backHref="/dashboard" />;
  }

  return <LoyaltyDashboardPage />;
}
