import type { ProductPromo } from "@/lib/mock/menu";
import type { StandaloneHighlight, StandaloneMenuProduct } from "@/lib/menu/standalone-menu";

type PublishedOffers = { items: StandaloneHighlight[]; managedProductIds?: string[] };
type LegacyOffer = {
  title: string;
  discount_percent: number | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
};

/** Never infer ownership from title or amount alone */
export function matchesLegacyOfferPromo(product: StandaloneMenuProduct, offer: LegacyOffer) {
  const promo = product.promo;
  return Boolean(promo && promo.kind === "خصم" && promo.discountMode === "percent"
    && promo.discountPercent === Number(offer.discount_percent)
    && promo.customText === offer.title
    && promo.startDate === (offer.start_date || offer.created_at.slice(0, 10))
    && promo.endDate === (offer.end_date || "2099-12-31"));
}

/** Product cards share the same eligibility window as published price offers. */
export function getProductOffers(product: StandaloneMenuProduct, highlights: PublishedOffers | undefined, now = Date.now()) {
  if (!product.available) return [];
  return (highlights?.items ?? []).filter((item) => item.kind !== "event"
    && (item.kind === "general" || item.productId === product.id)
    && (item.expiresAt == null || item.expiresAt >= now));
}

/** Highest applicable discount wins without stacking or changing stored product data. */
export function getPublishedOfferPromo(product: StandaloneMenuProduct, highlights: PublishedOffers | undefined, now = Date.now()): ProductPromo | null {
  const base = highlights?.managedProductIds?.includes(product.id) ? null : product.promo ?? null;
  if (!product.available || !highlights) return base;
  const applicable = getProductOffers(product, highlights, now).filter((item) => item.discountPercent != null && item.discountPercent > 0 && item.discountPercent <= 100);
  const best = applicable.reduce<StandaloneHighlight | undefined>((current, item) => !current || item.discountPercent! > current.discountPercent! ? item : current, undefined);
  if (!best) return base;
  const offerPrice = Math.round(product.price * (1 - best.discountPercent! / 100) * 100) / 100;
  if (base?.kind === "خصم" && now >= new Date(base.startDate).getTime() && now <= new Date(base.endDate).getTime()) {
    const basePrice = base.discountMode === "fixed_price" && base.discountedPrice != null
      ? Math.max(0, base.discountedPrice)
      : product.price * (1 - Math.min(100, Math.max(0, Number(base.discountPercent ?? 0))) / 100);
    if (basePrice <= offerPrice) return base;
  }
  return {
    kind: "خصم", discountMode: "percent", discountPercent: best.discountPercent!,
    customText: best.title, startDate: "2000-01-01",
    endDate: best.expiresAt == null ? "2099-12-31" : new Date(best.expiresAt).toISOString(),
  };
}
