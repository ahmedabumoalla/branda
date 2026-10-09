import {
  platformPlanFeatureDefaults,
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

function normalizePlanKey(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function getRegistryDefaultFeaturesForPlan(planKey: string | null | undefined) {
  const normalized = normalizePlanKey(planKey);
  const defaults = platformPlanFeatureDefaults as Record<string, readonly PlatformFeatureId[]>;
  return [...(defaults[normalized] ?? [])];
}

export function getAllPlatformFeatures() {
  return [...platformFeatureRegistry].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getPackageAssignableFeatures() {
  return getBrandNavigationFeatures().filter((feature) => feature.packageAssignable);
}

/** Single catalog for package editing and every brand navigation surface. */
export function getBrandNavigationFeatures() {
  return getAllPlatformFeatures().filter((feature) => feature.brandNavigation);
}

export function getDashboardSidebarFeatures() {
  return getAllPlatformFeatures().filter((feature) => feature.sidebarVisible);
}

export function getPlanIncludedFeatures(
  planId: string | null | undefined,
  plans: readonly (Pick<PlatformPlan, "id" | "features"> & Partial<Pick<PlatformPlan, "name">>)[] = []
) {
  const plan = plans.find((item) => item.id === planId);
  const planFeatures = normalizeFeatureCodes(plan?.features);

  if (planFeatures.includes("all")) {
    return getPackageAssignableFeatures().map((feature) => feature.id);
  }

  return getBrandNavigationFeatures().filter(feature => planFeatures.includes(feature.id)).map(feature => feature.id);
}

export function getBrandFeatureOverrides(
  brand: { featureOverrides?: readonly BrandFeatureOverride[] | null } | null | undefined
): BrandFeatureOverride[] {
  return [...(brand?.featureOverrides ?? [])];
}

export function getEffectiveBrandFeatureCodes(
  planFeatures: readonly PlatformFeatureCode[] | readonly string[] | null | undefined,
  brandOverrides: readonly BrandFeatureOverride[] = []
) {
  const accessRows = getEffectiveBrandFeatureAccess(planFeatures, brandOverrides);
  return accessRows
    .filter((row) => row.effectiveEnabled)
    .map((row) => row.feature.id);
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
      normalizedPlanFeatures.includes(feature.id);
    const overrideValue = overrideMap.get(feature.id);
    const override =
      overrideValue === true ? "enabled" : overrideValue === false ? "disabled" : "default";
    const hidden = feature.status === "hidden";
    const comingSoon = feature.status === "coming_soon";
    const effectiveEnabled =
      !hidden &&
      planIncluded && overrideValue !== false && !comingSoon;
    const result = hidden
      ? "coming_soon"
      : overrideValue === false
        ? "disabled_by_admin"
        : comingSoon
            ? "coming_soon"
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

export function getSidebarFeaturesForBrand(context: {
  planId?: string | null;
  plans?: readonly Pick<PlatformPlan, "id" | "features">[];
  overrides?: readonly BrandFeatureOverride[];
  cafeSlug?: string | null;
  isTrial?: boolean;
}) {
  // Navigation reflects the actual assigned package, including an empty feature
  // list. Registry defaults must not make an unassigned service look enabled.
  const plan = context.plans?.find((plan) => plan.id === context.planId);
  if (!plan) return [];
  const planFeatures = plan.features;
  const accessRows = getEffectiveBrandFeatureAccess(planFeatures, context.overrides);
  const accessMap = new Map(accessRows.map((row) => [row.feature.id, row]));

  return getBrandNavigationFeatures()
    .map((feature) => ({
      feature,
      access: accessMap.get(feature.id),
    })).filter(row => row.access?.effectiveEnabled || (context.isTrial && (row.feature.id === "loyalty" || row.feature.id === "offers")));
}
