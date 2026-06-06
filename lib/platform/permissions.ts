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
  const plans = options?.plans ?? mockPlatformPlans;
  const activePlanId = options?.planId ?? "pro";
  const plan = plans.find((item) => item.id === activePlanId);
  if (!plan) return true;
  return plan.features.includes(feature);
}

export function getEnabledCafeFeatures(options?: { planId?: string; plans?: PlatformPlan[] }) {
  const plans = options?.plans ?? mockPlatformPlans;
  const activePlanId = options?.planId ?? "pro";
  const plan = plans.find((item) => item.id === activePlanId);
  return plan?.features || [];
}
