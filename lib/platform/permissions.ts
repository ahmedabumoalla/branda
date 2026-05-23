import {
  ACTIVE_CAFE_PLAN_KEY,
  PLATFORM_PLANS_KEY,
  mockPlatformPlans,
  type PlatformFeature,
  type PlatformPlan,
} from "@/lib/platform/admin-data";

export function getPlatformPlans(): PlatformPlan[] {
  if (typeof window === "undefined") return mockPlatformPlans;

  const saved = localStorage.getItem(PLATFORM_PLANS_KEY);
  return saved ? JSON.parse(saved) : mockPlatformPlans;
}

export function getActiveCafePlanId() {
  if (typeof window === "undefined") return "pro";
  return localStorage.getItem(ACTIVE_CAFE_PLAN_KEY) || "pro";
}

export function setActiveCafePlanId(planId: string) {
  localStorage.setItem(ACTIVE_CAFE_PLAN_KEY, planId);
}

export function cafeHasFeature(feature: PlatformFeature) {
  const plans = getPlatformPlans();
  const activePlanId = getActiveCafePlanId();
  const plan = plans.find((item) => item.id === activePlanId);
  if (!plan) return true;
  return plan.features.includes(feature);
}

export function getEnabledCafeFeatures() {
  const plans = getPlatformPlans();
  const activePlanId = getActiveCafePlanId();
  const plan = plans.find((item) => item.id === activePlanId);
  return plan?.features || [];
}