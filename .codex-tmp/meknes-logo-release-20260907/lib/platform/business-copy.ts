import type { BusinessCategoryId } from "@/lib/platform/business-categories";

export type BusinessKind = "cafe" | "restaurant" | "events";

export function resolveBusinessKind(
  category?: string | null
): BusinessKind {
  if (category === "restaurants" || category === "restaurant") {
    return "restaurant";
  }

  if (category === "events_conferences" || category === "events") {
    return "events";
  }

  return "cafe";
}

export function isRestaurantCategory(category?: string | null) {
  return resolveBusinessKind(category) === "restaurant";
}

export function isEventsCategory(category?: string | null) {
  return resolveBusinessKind(category) === "events";
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

const eventsCopy: BusinessCopy = {
  kind: "events",
  categoryId: "events_conferences",
  brandNoun: "فعالية",
  casualNoun: "فعالية",
  pageNoun: "صفحة الفعالية",
  itemSingular: "تذكرة",
  itemPlural: "تذاكر",
  menuSearchPlaceholder: "ابحث عن تذكرة أو باقة...",
  freeRewardName: "تذكرة مجانية",
  loyaltyUnitSingular: "زيارة",
  loyaltyUnitPlural: "زيارات",
  loyaltyUnitLit: "زيارات مضيئة",
};

export function getBusinessCopy(category?: string | null): BusinessCopy {
  const kind = resolveBusinessKind(category);
  if (kind === "restaurant") return restaurantCopy;
  if (kind === "events") return eventsCopy;
  return cafeCopy;
}
