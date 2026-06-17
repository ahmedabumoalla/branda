import {
  mockPlatformPlans,
  type PlatformFeature,
  type PlatformPlan,
} from "@/lib/platform/admin-data";

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
  if (feature === "home" || feature === "subscription") return true;

  const plans = options?.plans ?? mockPlatformPlans;
  const activePlanId = options?.planId ?? "pro";
  const plan = plans.find((item) => item.id === activePlanId);
  if (!plan) return false;

  const featureList = plan.features.map(String);
  if (featureList.includes("all")) return true;

  const legacyFeatureMap: Partial<Record<PlatformFeature, PlatformFeature>> = {
    experience_reviews: "menu",
  };

  return featureList.includes(feature) || Boolean(legacyFeatureMap[feature] && featureList.includes(legacyFeatureMap[feature]!));
}

export function getEnabledCafeFeatures(options?: { planId?: string; plans?: PlatformPlan[] }) {
  const plans = options?.plans ?? mockPlatformPlans;
  const activePlanId = options?.planId ?? "pro";
  const plan = plans.find((item) => item.id === activePlanId);
  const features = (plan?.features || []).map(String) as PlatformFeature[];
  if (features.includes("all")) {
    return Array.from(new Set<PlatformFeature>(["home", ...plans.flatMap((item) => item.features), "subscription"]));
  }
  return Array.from(new Set<PlatformFeature>(["home", ...features, "subscription"]));
}
