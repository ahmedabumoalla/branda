import { getPlatformFeatureDefinition } from "@/lib/platform/feature-registry";

export type FeatureCode = string;

// Billing/account recovery is available even while brand services are suspended.
export const ALWAYS_ENABLED_FEATURES = new Set<string>(["subscription"]);

export function featureCodesAllow(features: FeatureCode[] | null | undefined, feature: string) {
  if (getPlatformFeatureDefinition(feature)?.adminPackageOnly) return false;
  if (ALWAYS_ENABLED_FEATURES.has(feature)) return true;
  const list = Array.isArray(features) ? features.map(String) : [];
  if (feature === "cashier") return list.includes("loyalty") || list.includes("pager");
  return list.includes(feature);
}
