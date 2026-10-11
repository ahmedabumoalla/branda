import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { getOwnerLoyaltyCardsDashboard } from "@/lib/data/loyalty-cards";
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

  const dashboard = await getOwnerLoyaltyCardsDashboard().catch(() => null);
  if (dashboard) {
    const [brand, experience] = await Promise.all([getLoyaltyBrand(dashboard.cafeSlug), getLoyaltyExperience(dashboard.cafeId).then((settings) => ({ settings, error: undefined as string | undefined })).catch(() => ({ settings: defaultLoyaltyExperience, error: "إعدادات تجربة الولاء لم تُفعّل بعد أكمل تهيئة قاعدة البيانات قبل الحفظ" }))]);
    const activityFilters = defaultLoyaltyActivityFilters();
    const [menu, activityResult] = await Promise.all([
      featureCodesAllow(features, "menu") ? getOwnerMenu() : Promise.resolve(null),
      loadLoyaltyActivityAction(activityFilters),
    ]);
    if (brand) return <>{experience.error && <p role="alert" className="mx-6 mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">{experience.error}</p>}<RastLoyaltyDashboard initialDashboard={{ program: dashboard.program }} identity={brand.identity}
      initialExperience={experience.settings} walletAvailability={getWalletReadiness()} products={(menu?.products ?? []).map(({ id, name }) => ({ id, name }))}
      activityLog={<LoyaltyActivityLog initialResult={activityResult} initialFilters={activityFilters} />}
      signupUrl={`${(process.env.NEXT_PUBLIC_APP_URL || "https://barndaksa.com").replace(/\/$/, "")}/loyalty/${encodeURIComponent(dashboard.cafeSlug)}?source=qr`} /></>;
    return <p role="alert" className="mx-6 mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">تعذر تحميل هوية برنامج الولاء حاول تحديث الصفحة</p>;
  }

  return <p role="alert" className="mx-6 mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">تعذر تحميل برنامج الولاء حاول تحديث الصفحة</p>;
}
