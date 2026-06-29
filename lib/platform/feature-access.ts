import {
  getPlatformFeatureDefinition,
  platformFeatureRegistry,
  type PlatformFeatureCode,
  type PlatformFeatureDefinition,
  type PlatformFeatureId,
} from "@/lib/platform/feature-registry";
import type { PlatformPlan } from "@/lib/platform/admin-data";

export type BrandFeatureOverride = {
  featureId: PlatformFeatureId;
  enabled: boolean;
};

export type EffectiveBrandFeatureAccess = {
  feature: PlatformFeatureDefinition;
  planIncluded: boolean;
  override: "default" | "enabled" | "disabled";
  effectiveEnabled: boolean;
  result: "active" | "locked" | "disabled_by_admin" | "coming_soon";
};

function normalizeFeatureCodes(features: readonly PlatformFeatureCode[] | readonly string[] | null | undefined) {
  return Array.from(new Set((features ?? []).map(String).filter(Boolean))) as PlatformFeatureCode[];
}

export function getAllPlatformFeatures() {
  return [...platformFeatureRegistry].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getPackageAssignableFeatures() {
  return getAllPlatformFeatures().filter((feature) => feature.packageAssignable);
}

export function getDashboardSidebarFeatures() {
  return getAllPlatformFeatures().filter((feature) => feature.sidebarVisible);
}

export function getPlanIncludedFeatures(
  planId: string | null | undefined,
  plans: readonly Pick<PlatformPlan, "id" | "features">[] = []
) {
  const plan = plans.find((item) => item.id === planId);
  const planFeatures = normalizeFeatureCodes(plan?.features);

  if (planFeatures.includes("all")) {
    return getPackageAssignableFeatures().map((feature) => feature.id);
  }

  const enabledByDefault = getAllPlatformFeatures()
    .filter((feature) => feature.defaultEnabled)
    .map((feature) => feature.id);

  return Array.from(
    new Set(
      [...enabledByDefault, ...planFeatures]
        .filter((featureId): featureId is PlatformFeatureId => Boolean(getPlatformFeatureDefinition(featureId)))
    )
  );
}

export function getBrandFeatureOverrides(_brandId: string): BrandFeatureOverride[] {
  return [];
}

export function getEffectiveBrandFeatureAccess(
  planFeatures: readonly PlatformFeatureCode[] | readonly string[] | null | undefined,
  brandOverrides: readonly BrandFeatureOverride[] = []
): EffectiveBrandFeatureAccess[] {
  const normalizedPlanFeatures = normalizeFeatureCodes(planFeatures);
  const planHasAll = normalizedPlanFeatures.includes("all");
  const overrideMap = new Map(brandOverrides.map((override) => [override.featureId, override.enabled]));

  return getPackageAssignableFeatures().map((feature) => {
    const planIncluded =
      planHasAll ||
      feature.defaultEnabled ||
      normalizedPlanFeatures.includes(feature.id);
    const overrideValue = overrideMap.get(feature.id);
    const override =
      overrideValue === true ? "enabled" : overrideValue === false ? "disabled" : "default";
    const comingSoon = feature.status === "coming_soon" || feature.status === "hidden";
    const effectiveEnabled = !comingSoon && (overrideValue ?? planIncluded);
    const result = comingSoon
      ? "coming_soon"
      : overrideValue === false
        ? "disabled_by_admin"
        : effectiveEnabled
          ? "active"
          : "locked";

    return {
      feature,
      planIncluded,
      override,
      effectiveEnabled,
      result,
    };
  });
}

export function isBrandaFinanceEnabledForBrand(
  planFeatures: readonly PlatformFeatureCode[] | readonly string[] | null | undefined,
  brandOverrides: readonly BrandFeatureOverride[] = []
) {
  const access = getEffectiveBrandFeatureAccess(planFeatures, brandOverrides).find(
    (row) => row.feature.id === "branda_finance"
  );
  return Boolean(access?.effectiveEnabled);
}

export function canShowBrandaFinance(context: {
  planId?: string | null;
  plans?: readonly Pick<PlatformPlan, "id" | "features">[];
  features?: readonly PlatformFeatureCode[] | readonly string[] | null;
  overrides?: readonly BrandFeatureOverride[];
}) {
  const planFeatures = context.features ?? getPlanIncludedFeatures(context.planId, context.plans);
  return isBrandaFinanceEnabledForBrand(planFeatures, context.overrides);
}

export function getSidebarFeaturesForBrand(context: {
  planId?: string | null;
  plans?: readonly Pick<PlatformPlan, "id" | "features">[];
  overrides?: readonly BrandFeatureOverride[];
}) {
  const planFeatures = getPlanIncludedFeatures(context.planId, context.plans);
  const accessRows = getEffectiveBrandFeatureAccess(planFeatures, context.overrides);
  const accessMap = new Map(accessRows.map((row) => [row.feature.id, row]));

  return getDashboardSidebarFeatures()
    .map((feature) => ({
      feature,
      access: accessMap.get(feature.id),
    }))
    .filter(({ feature, access }) => {
      if (feature.defaultEnabled) return true;
      if (feature.id === "branda_finance") return Boolean(access?.effectiveEnabled);
      if (feature.id === "cashier") return true;
      return Boolean(access?.effectiveEnabled);
    });
}
