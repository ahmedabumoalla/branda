import type { BusinessCategoryId } from "@/lib/platform/business-categories";

export type BusinessKind = "cafe" | "restaurant";

export function resolveBusinessKind(
  category?: string | null
): BusinessKind {
  return category === "restaurants" || category === "restaurant"
    ? "restaurant"
    : "cafe";
}

export function isRestaurantCategory(category?: string | null) {
  return resolveBusinessKind(category) === "restaurant";
}

export type BusinessCopy = {
  kind: BusinessKind;
  categoryId: BusinessCategoryId;
  brandNoun: string;
  casualNoun: string;
  pageNoun: string;
  itemSingular: string;
  itemPlural: string;
  menuSearchPlaceholder: string;
  freeRewardName: string;
  loyaltyUnitSingular: string;
  loyaltyUnitPlural: string;
  loyaltyUnitLit: string;
};

const cafeCopy: BusinessCopy = {
  kind: "cafe",
  categoryId: "cafes_coffee",
  brandNoun: "مقهى",
  casualNoun: "كوفي",
  pageNoun: "صفحة الكوفي",
  itemSingular: "مشروب",
  itemPlural: "مشروبات",
  menuSearchPlaceholder: "ابحث عن مشروب أو منتج...",
  freeRewardName: "كوب مجاني",
  loyaltyUnitSingular: "كوب",
  loyaltyUnitPlural: "أكواب",
  loyaltyUnitLit: "أكواب مضيئة",
};

const restaurantCopy: BusinessCopy = {
  kind: "restaurant",
  categoryId: "restaurants",
  brandNoun: "مطعم",
  casualNoun: "مطعم",
  pageNoun: "صفحة المطعم",
  itemSingular: "طبق",
  itemPlural: "أطباق",
  menuSearchPlaceholder: "ابحث عن طبق أو منتج...",
  freeRewardName: "وجبة مجانية",
  loyaltyUnitSingular: "طبق",
  loyaltyUnitPlural: "أطباق",
  loyaltyUnitLit: "أطباق مضيئة",
};

export function getBusinessCopy(category?: string | null): BusinessCopy {
  return isRestaurantCategory(category) ? restaurantCopy : cafeCopy;
}
