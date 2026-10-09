import {
  mockPlatformPlans,
  type PlatformFeature,
  type PlatformPlan,
} from "@/lib/platform/admin-data";
import {
  type BrandFeatureOverride,
  getEffectiveBrandFeatureAccess,
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
  options?: { planId?: string; plans?: PlatformPlan[]; overrides?: BrandFeatureOverride[] }
) {
  if (feature === "subscription") return true;

  const plans = options?.plans ?? [];
  const activePlanId = options?.planId ?? "";
  if (!plans.some(plan => plan.id === activePlanId && plan.active !== false)) return false;
  const planFeatures = getPlanIncludedFeatures(activePlanId, plans);
  const access = getEffectiveBrandFeatureAccess(planFeatures, options?.overrides).find((item) => item.feature.id === (feature === "cashier" ? "loyalty" : feature));
  return Boolean(access?.effectiveEnabled);
}

export function getEnabledCafeFeatures(options?: { planId?: string; plans?: PlatformPlan[]; overrides?: BrandFeatureOverride[] }) {
  const plans = options?.plans ?? [];
  const activePlanId = options?.planId ?? "";
  if (!plans.some(plan => plan.id === activePlanId && plan.active !== false)) return [];
  return Array.from(
    new Set<PlatformFeature>([
      ...getEffectiveBrandFeatureAccess(getPlanIncludedFeatures(activePlanId, plans), options?.overrides)
        .filter((row) => row.effectiveEnabled)
        .map((row) => row.feature.id),
    ])
  );
}
