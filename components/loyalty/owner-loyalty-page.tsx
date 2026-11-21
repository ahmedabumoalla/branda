import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { getOwnerLoyaltyProgramSettings, getOwnerLoyaltyRewardProducts } from "@/lib/data/loyalty-cards";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { RastLoyaltyDashboard } from "@/components/rast-loyalty/rast-dashboard";
import { getLoyaltyBrand, getLoyaltyExperience } from "@/lib/data/loyalty-experience";
import { defaultLoyaltyExperience } from "@/lib/loyalty/experience-types";
import { getWalletReadiness } from "@/lib/wallet";
import type { LoyaltyDashboardView } from "@/components/rast-loyalty/rast-dashboard";
import { getDashboardCafeContext } from "@/lib/data/cafes";
import { getNearbySchedule } from "@/lib/data/nearby-schedule";
import { NEARBY_SCHEDULE_CAFE_ID } from "@/lib/loyalty/nearby-schedule";

export async function OwnerLoyaltyPage({ requestedView }: { requestedView?: "customers" | "messages" } = {}) {
  const features = await getOwnerFeatureCodes().catch(() => []);
  if (!featureCodesAllow(features, "loyalty")) {
    return <DashboardFeatureBlockedState title="الولاء والمكافآت" />;
  }
  const view: LoyaltyDashboardView = requestedView ?? "rewards";
  const needsProgram = view === "rewards";

  const staffPermission = view === "rewards" ? "rewards" as const : view === "messages" ? "messages" as const : undefined;
  const [dashboard, cafe] = await Promise.all([getOwnerLoyaltyProgramSettings(staffPermission).catch(() => null), getDashboardCafeContext()]);
  const staffMode = Boolean(cafe?.staff);
  if (dashboard) {
    const [brand, experience, products, nearbySchedule] = await Promise.all([
      getLoyaltyBrand(dashboard.cafeSlug),
      needsProgram ? getLoyaltyExperience(dashboard.cafeId).then((settings) => ({ settings, error: undefined as string | undefined })).catch(() => ({ settings: defaultLoyaltyExperience, error: "إعدادات تجربة الولاء لم تُفعّل بعد أكمل تهيئة قاعدة البيانات قبل الحفظ" })) : Promise.resolve({ settings: defaultLoyaltyExperience, error: undefined }),
      needsProgram && featureCodesAllow(features, "menu") ? getOwnerLoyaltyRewardProducts() : Promise.resolve([]),
      needsProgram && !staffMode && dashboard.cafeId === NEARBY_SCHEDULE_CAFE_ID
        ? getNearbySchedule(dashboard.cafeId).then(schedule => ({ schedule })).catch(() => ({ schedule: null, error: "تعذر تحميل فترات رسائل القرب حدّث الصفحة قبل تعديلها" }))
        : Promise.resolve(undefined),
    ]);
    if (brand) return <>{experience.error && <p role="alert" className="mx-6 mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">{experience.error}</p>}<RastLoyaltyDashboard initialDashboard={{ program: dashboard.program }} identity={brand.identity}
      view={view} initialExperience={experience.settings} nearbySchedule={nearbySchedule} walletAvailability={getWalletReadiness()} products={products} staffMode={staffMode}
      signupUrl={`${(process.env.NEXT_PUBLIC_APP_URL || "https://barndaksa.com").replace(/\/$/, "")}/loyalty/${encodeURIComponent(dashboard.cafeSlug)}?source=qr`} /></>;
    return <p role="alert" className="mx-6 mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">تعذر تحميل هوية برنامج الولاء حاول تحديث الصفحة</p>;
  }

  return <p role="alert" className="mx-6 mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">تعذر تحميل برنامج الولاء حاول تحديث الصفحة</p>;
}
