import { LoyaltyDashboardPage } from "@/components/dashboard/pages/loyalty-dashboard-page";
import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { getOwnerLoyaltyCardsDashboard } from "@/lib/data/loyalty-cards";
import { getOwnerLoyalty } from "@/lib/data/loyalty";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { RastLoyaltyDashboard } from "@/components/rast-loyalty/rast-dashboard";
import { getLoyaltyBrand, getLoyaltyExperience } from "@/lib/data/loyalty-experience";
import { defaultLoyaltyExperience } from "@/lib/loyalty/experience-types";
import { getWalletReadiness } from "@/lib/wallet";
import { getOwnerMenu } from "@/lib/data/menu";
import { LoyaltyActivityLog } from "@/components/loyalty/loyalty-activity-log";
import { loadLoyaltyActivityAction } from "@/app/actions/loyalty-activity";
import { defaultLoyaltyActivityFilters } from "@/lib/loyalty/activity-types";

export default async function LoyaltyCardsPage() {
  const features = await getOwnerFeatureCodes().catch(() => []);
  if (!featureCodesAllow(features, "loyalty")) {
    return <DashboardFeatureBlockedState title="الولاء والمكافآت" />;
  }

  const [dashboardResult, loyaltyResult] = await Promise.allSettled([
    getOwnerLoyaltyCardsDashboard(),
    getOwnerLoyalty(),
  ]);

  const configError =
    dashboardResult.status === "rejected" || loyaltyResult.status === "rejected"
      ? "تعذر تحميل بعض بيانات الولاء. ستظهر الصفحة بحالة آمنة إلى أن تكتمل إعدادات قاعدة البيانات."
      : undefined;

  if (dashboardResult.status === "fulfilled" && dashboardResult.value.cafeSlug === "rast") {
    const dashboard = dashboardResult.value;
    const [brand, experience] = await Promise.all([getLoyaltyBrand(dashboard.cafeSlug), getLoyaltyExperience(dashboard.cafeId).then((settings) => ({ settings, error: undefined as string | undefined })).catch(() => ({ settings: defaultLoyaltyExperience, error: "إعدادات تجربة الولاء لم تُفعّل بعد. أكمل تهيئة قاعدة البيانات قبل الحفظ." }))]);
    const activityFilters = defaultLoyaltyActivityFilters();
    const [menu, activityResult] = await Promise.all([getOwnerMenu(), loadLoyaltyActivityAction(activityFilters)]);
    if (brand) return <>{experience.error && <p role="alert" className="mx-6 mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">{experience.error}</p>}<RastLoyaltyDashboard initialDashboard={dashboard} identity={brand.identity}
      initialExperience={experience.settings} walletAvailability={getWalletReadiness()} products={menu.products.map(({ id, name }) => ({ id, name }))}
      activityLog={<LoyaltyActivityLog initialResult={activityResult} initialFilters={activityFilters} />}
      signupUrl={`${(process.env.NEXT_PUBLIC_APP_URL || "https://barndaksa.com").replace(/\/$/, "")}/loyalty/rast?source=qr`} /></>;
  }

  return (
    <LoyaltyDashboardPage
      initialDashboard={dashboardResult.status === "fulfilled" ? dashboardResult.value : null}
      initialSettings={loyaltyResult.status === "fulfilled" ? loyaltyResult.value.settings : null}
      configError={configError}
    />
  );
}
