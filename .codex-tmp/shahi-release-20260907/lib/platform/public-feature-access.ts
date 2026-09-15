import { featureCodesAllow, type FeatureCode } from "@/lib/platform/feature-gates";
import type { PlatformFeatureId } from "@/lib/platform/feature-registry";

export type PublicFeatureKey =
  | PlatformFeatureId
  | "menu_ordering"

  | "loyalty_card"
  | "loyalty_points";

const PUBLIC_FEATURE_MAP: Partial<Record<PublicFeatureKey, PlatformFeatureId[]>> = {
  home: ["home"],
  menu: ["menu"],
  orders: ["orders"],

  offers: ["offers"],
  loyalty: ["loyalty"],
  cashier: ["cashier"],
  customers: ["customers"],
  reports: ["reports"],
  settings: ["settings"],
  theme: ["theme"],
  domains: ["domains"],
  branches: ["branches"],


  experience_reviews: ["experience_reviews"],

  subscription: ["subscription"],
  menu_ordering: ["orders"],

  loyalty_card: ["loyalty"],
  loyalty_points: ["loyalty"],
};

export function publicFeatureAllows(
  features: FeatureCode[] | string[] | null | undefined,
  feature: PublicFeatureKey,
) {
  const required = PUBLIC_FEATURE_MAP[feature] ?? [feature as PlatformFeatureId];
  return required.every((item) => featureCodesAllow(features, item));
}

export function publicFeatureTitle(feature: PublicFeatureKey) {
  if (feature === "menu_ordering") return "طلبات المنيو";
  if (feature === "loyalty_card") return "بطاقة الولاء";
  if (feature === "loyalty_points") return "نقاط الولاء";
  if (feature === "experience_reviews") return "توثيق التجارب";
  if (feature === "menu") return "المنيو";
  if (feature === "loyalty") return "الولاء والمكافآت";
  return "هذه الميزة";
}
