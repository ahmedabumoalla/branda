import { isPromoActive, type ProductPromo } from "@/lib/mock/menu";

export function finalProductPrice(price: number, promo?: ProductPromo | null) {
  if (!promo || promo.kind !== "خصم" || !isPromoActive(promo)) return price;
  if (promo.discountMode === "fixed_price" && promo.discountedPrice != null) return Math.max(0, Number(promo.discountedPrice));
  const percent = Math.min(100, Math.max(0, Number(promo.discountPercent ?? 0)));
  return Math.max(0, price - price * (percent / 100));
}

export function productOfferDetails(promo?: ProductPromo | null, freeProductName?: string) {
  if (!promo) return "";
  if (promo.kind === "خصم") {
    const base = promo.discountMode === "fixed_price" && promo.discountedPrice != null
      ? `سعر العرض ${promo.discountedPrice.toLocaleString("ar-SA")} ر.س`
      : `خصم ${promo.discountPercent ?? 0}%`;
    return `${base} من ${promo.startDate} إلى ${promo.endDate}`;
  }
  if (promo.kind === "منتج مجاني مع الطلب") return `منتج مجاني مع الطلب ${freeProductName ? `وهو ${freeProductName}` : ""} من ${promo.startDate} إلى ${promo.endDate}`;
  return `${promo.customText || "عرض خاص"} من ${promo.startDate} إلى ${promo.endDate}`;
}
