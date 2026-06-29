import { LoyaltyDashboardPage } from "@/components/dashboard/pages/loyalty-dashboard-page";
import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { getOwnerLoyaltyCardsDashboard } from "@/lib/data/loyalty-cards";
import { getOwnerLoyalty } from "@/lib/data/loyalty";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

export default async function LoyaltyCardsPage() {
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
      ? "تعذر تحميل بعض بيانات الولاء. ستظهر الصفحة بحالة آمنة إلى أن تكتمل إعدادات قاعدة البيانات."
      : undefined;

  return (
    <LoyaltyDashboardPage
      initialDashboard={dashboardResult.status === "fulfilled" ? dashboardResult.value : null}
      initialSettings={loyaltyResult.status === "fulfilled" ? loyaltyResult.value.settings : null}
      configError={configError}
    />
  );
}
