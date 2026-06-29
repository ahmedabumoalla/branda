import { LoyaltyCardDesignerPage } from "@/components/dashboard/pages/loyalty-card-designer-page";
import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { getOwnerLoyaltyCardsDashboard } from "@/lib/data/loyalty-cards";
import { getOwnerLoyalty } from "@/lib/data/loyalty";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

export default async function LoyaltyCardDesignerRoute() {
  const features = await getOwnerFeatureCodes().catch(() => []);
  if (!featureCodesAllow(features, "loyalty")) {
    return <DashboardFeatureBlockedState title="الولاء غير مفعل في هذه الباقة" backHref="/dashboard" />;
  }

  const [dashboardResult, loyaltyResult] = await Promise.allSettled([
    getOwnerLoyaltyCardsDashboard(),
    getOwnerLoyalty(),
  ]);

  const configError =
    dashboardResult.status === "rejected" || loyaltyResult.status === "rejected"
      ? "تعذر تحميل بعض بيانات الولاء. سيظهر المصمم بحالة آمنة إلى أن تكتمل إعدادات قاعدة البيانات."
      : undefined;

  return (
    <LoyaltyCardDesignerPage
      initialDashboard={dashboardResult.status === "fulfilled" ? dashboardResult.value : null}
      initialSettings={loyaltyResult.status === "fulfilled" ? loyaltyResult.value.settings : null}
      configError={configError}
    />
  );
}
