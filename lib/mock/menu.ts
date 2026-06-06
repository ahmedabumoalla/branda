export type MenuCategory = string;

export type MenuImageVariant =
  | "latte"
  | "cold"
  | "cake"
  | "bakery"
  | "tea";

export type PromoKind = "خصم" | "منتج مجاني مع الطلب" | "عرض مخصص";

export type ProductPromo = {
  kind: PromoKind;
  /** percent = خصم مئوي من السعر الأساسي, fixed_price = سعر نهائي بعد الخصم */
  discountMode?: "percent" | "fixed_price";
  discountPercent?: number;
  discountedPrice?: number;
  freeProductId?: string;
  customText?: string;
  startDate: string;
  endDate: string;
};

export type MenuProduct = {
  id: string;
  name: string;
  category: MenuCategory;
  categoryId?: string;
  description: string;
  imageDataUrl?: string | null;
  /** IndexedDB reference — mock only; production → Storage URL */
  imageAssetId?: string;
  imageVariant: MenuImageVariant;
  price: number;
  calories?: number;
  loyaltyPoints: number;
  preparationTimeMinutes?: number;
  redeemableWithPoints?: boolean;
  redemptionPoints?: number;
  availableForPickup?: boolean;
  pickupLeadTimeMinutes?: number;
  ingredients: string[];
  available: boolean;
  promo?: ProductPromo | null;
};

export const MENU_CATEGORIES: MenuCategory[] = [
  "قهوة",
  "بارد",
  "حلويات",
  "مخبوزات",
  "شاي",
  "أخرى",
];

export const PROMO_KINDS: PromoKind[] = [
  "خصم",
  "منتج مجاني مع الطلب",
  "عرض مخصص",
];

export function isPromoActive(promo: ProductPromo) {
  const now = new Date();
  return now >= new Date(promo.startDate) && now <= new Date(promo.endDate);
}

export function promoBadgeText(promo: ProductPromo) {
  if (promo.kind === "خصم") {
    if (promo.discountMode === "fixed_price" && promo.discountedPrice != null) {
      return `السعر بعد الخصم ${promo.discountedPrice.toLocaleString("ar-SA")} ر.س`;
    }
    return `خصم ${promo.discountPercent ?? 10}%`;
  }
  if (promo.kind === "منتج مجاني مع الطلب") return "منتج مجاني مع الطلب";
  return promo.customText || "عرض خاص";
}

export function productFinalPrice(price: number, promo?: ProductPromo | null) {
  if (!promo || promo.kind !== "خصم" || !isPromoActive(promo)) return price;
  if (promo.discountMode === "fixed_price" && promo.discountedPrice != null) {
    return Math.max(0, Number(promo.discountedPrice));
  }
  const percent = Math.min(100, Math.max(0, Number(promo.discountPercent ?? 0)));
  return Math.max(0, price - price * (percent / 100));
}

export const mockMenuProducts: MenuProduct[] = [
  {
    id: "1",
    name: "لاتيه فانيلا",
    category: "قهوة",
    categoryId: "cat_hot",
    description: "قهوة ناعمة بطعم الفانيلا مع حليب مبخر وقوام كريمي.",
    preparationTimeMinutes: 5,
    availableForPickup: true,
    pickupLeadTimeMinutes: 15,
    imageDataUrl:
      "https://images.unsplash.com/photo-1541167760496-1628856ab772?q=80&w=1200&auto=format&fit=crop",
    imageVariant: "latte",
    price: 18,
    calories: 220,
    loyaltyPoints: 18,
    ingredients: ["اسبريسو", "حليب", "فانيلا"],
    available: true,
    promo: {
      kind: "خصم",
      discountPercent: 15,
      startDate: "2026-05-01",
      endDate: "2026-12-31",
    },
  },
  {
    id: "2",
    name: "آيس سبانش لاتيه",
    category: "بارد",
    categoryId: "cat_cold",
    description: "مشروب بارد بطعم متوازن ومناسب لعشاق القهوة الحلوة.",
    preparationTimeMinutes: 4,
    availableForPickup: true,
    pickupLeadTimeMinutes: 10,
    imageDataUrl:
      "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?q=80&w=1200&auto=format&fit=crop",
    imageVariant: "cold",
    price: 21,
    calories: 260,
    loyaltyPoints: 21,
    ingredients: ["اسبريسو", "حليب", "ثلج", "حليب مكثف"],
    available: true,
    promo: null,
  },
  {
    id: "3",
    name: "كوكيز شوكولاتة",
    category: "حلويات",
    categoryId: "cat_sweets",
    description: "كوكيز طازج ومخبوز يوميًا داخل الكوفي.",
    preparationTimeMinutes: 2,
    redeemableWithPoints: true,
    redemptionPoints: 120,
    availableForPickup: true,
    pickupLeadTimeMinutes: 5,
    imageDataUrl:
      "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?q=80&w=1200&auto=format&fit=crop",
    imageVariant: "cake",
    price: 12,
    calories: 310,
    loyaltyPoints: 12,
    ingredients: ["شوكولاتة", "زبدة", "دقيق"],
    available: true,
    promo: null,
  },
];