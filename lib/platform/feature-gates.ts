export type FeatureCode = string;

export const ALWAYS_ENABLED_FEATURES = new Set<string>(["home", "subscription", "settings"]);

export function featureCodesAllow(features: FeatureCode[] | null | undefined, feature: string) {
  if (ALWAYS_ENABLED_FEATURES.has(feature)) return true;
  const list = Array.isArray(features) ? features.map(String) : [];
  return list.includes("all") || list.includes(feature);
}
