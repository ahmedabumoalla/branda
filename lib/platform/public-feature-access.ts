import { featureCodesAllow, type FeatureCode } from "@/lib/platform/feature-gates";
import type { PlatformFeatureId } from "@/lib/platform/feature-registry";

export type PublicFeatureKey =
  | PlatformFeatureId
  | "menu_ordering"
  | "comments_reviews"
  | "loyalty_card"
  | "loyalty_points";

const PUBLIC_FEATURE_MAP: Record<PublicFeatureKey, PlatformFeatureId[]> = {
  home: ["home"],
  pages: ["pages"],
  menu: ["menu"],
  orders: ["orders"],
  reservations: ["reservations"],
  offers: ["offers"],
  loyalty: ["loyalty"],
  cashier: ["cashier"],
  customers: ["customers"],
  reports: ["reports"],
  settings: ["settings"],
  theme: ["theme"],
  domains: ["domains"],
  branches: ["branches"],
  reviews: ["reviews"],
  marketing: ["marketing"],
  experience_reviews: ["experience_reviews"],
  branda_finance: ["branda_finance"],
  subscription: ["subscription"],
  menu_ordering: ["orders"],
  comments_reviews: ["reviews"],
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
  if (feature === "comments_reviews") return "التقييمات والتعليقات";
  if (feature === "loyalty_card") return "بطاقة الولاء";
  if (feature === "loyalty_points") return "نقاط الولاء";
  if (feature === "experience_reviews") return "توثيق التجارب";
  if (feature === "reservations") return "الحجوزات";
  if (feature === "menu") return "المنيو";
  if (feature === "loyalty") return "الولاء والمكافآت";
  return "هذه الميزة";
}
