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
  if (!plan) return true;

  const legacyFeatureMap: Partial<Record<PlatformFeature, PlatformFeature>> = {
    experience_reviews: "menu",
  };

  return plan.features.includes(feature) || Boolean(legacyFeatureMap[feature] && plan.features.includes(legacyFeatureMap[feature]!));
}

export function getEnabledCafeFeatures(options?: { planId?: string; plans?: PlatformPlan[] }) {
  const plans = options?.plans ?? mockPlatformPlans;
  const activePlanId = options?.planId ?? "pro";
  const plan = plans.find((item) => item.id === activePlanId);
  const features = plan?.features || [];
  return Array.from(new Set<PlatformFeature>(["home", ...features, "subscription"]));
}
