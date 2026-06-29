import {
  mockPlatformPlans,
  type PlatformFeature,
  type PlatformPlan,
} from "@/lib/platform/admin-data";
import {
  getEffectiveBrandFeatureAccess,
  getPackageAssignableFeatures,
  getPlanIncludedFeatures,
} from "@/lib/platform/feature-access";

export function getPlatformPlans(): PlatformPlan[] {
  return mockPlatformPlans;
}

export function getActiveCafePlanId() {
  return "pro";
}

export function setActiveCafePlanId(_planId: string) {
  throw new Error("Use Supabase subscription actions");
}

export function cafeHasFeature(
  feature: PlatformFeature,
  options?: { planId?: string; plans?: PlatformPlan[] }
) {
  if (feature === "all" || feature === "home" || feature === "subscription" || feature === "settings") {
    return true;
  }

  const plans = options?.plans ?? mockPlatformPlans;
  const activePlanId = options?.planId ?? "pro";
  const planFeatures = getPlanIncludedFeatures(activePlanId, plans);
  const access = getEffectiveBrandFeatureAccess(planFeatures).find((item) => item.feature.id === feature);
  return Boolean(access?.effectiveEnabled);
}

export function getEnabledCafeFeatures(options?: { planId?: string; plans?: PlatformPlan[] }) {
  const plans = options?.plans ?? mockPlatformPlans;
  const activePlanId = options?.planId ?? "pro";
  const plan = plans.find((item) => item.id === activePlanId);
  if (plan?.features.map(String).includes("all")) {
    return Array.from(
      new Set<PlatformFeature>([
        "home",
        ...getPackageAssignableFeatures().map((feature) => feature.id),
        "settings",
        "subscription",
      ])
    );
  }

  return Array.from(
    new Set<PlatformFeature>([
      "home",
      ...getPlanIncludedFeatures(activePlanId, plans),
      "settings",
      "subscription",
    ])
  );
}
