import { getPlatformFeatureDefinition } from "@/lib/platform/feature-registry";

export type FeatureCode = string;

// Billing/account recovery is available even while brand services are suspended.
export const ALWAYS_ENABLED_FEATURES = new Set<string>(["subscription"]);

export function featureCodesAllow(features: FeatureCode[] | null | undefined, feature: string) {
  if (getPlatformFeatureDefinition(feature)?.adminPackageOnly) return false;
  if (ALWAYS_ENABLED_FEATURES.has(feature)) return true;
  const list = Array.isArray(features) ? features.map(String) : [];
  // Brand identity is an account capability, not a paid service. Finance keeps
  // its existing settings entitlement and dedicated account-settings screens.
  if (feature === "settings") return !list.includes("finance") || list.includes("settings");
  if (feature === "pager") return list.includes("pager") && list.includes("finance");
  if (feature === "cashier") return list.includes("loyalty") || (list.includes("pager") && list.includes("finance"));
  if (feature === "finance_pos") return list.includes("finance");
  return list.includes(feature);
}
