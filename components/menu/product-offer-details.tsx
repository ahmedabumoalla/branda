import { Gift, Tag } from "lucide-react";
import { isPromoActive, promoBadgeText } from "@/lib/mock/menu";
import type { StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import s from "./bistro-menu.module.css";

type Props = { product: StandaloneMenuProduct; products: StandaloneMenuProduct[]; detailed?: boolean };

function offerDetails({ product, products }: Props) {
  if (!product.available) return [];
  const visibleProduct = (id?: string) => products.find(item => item.id === id && item.available);
  const offers = product.offers ?? [];
  const promo = product.promo && isPromoActive(product.promo) ? product.promo : null;
  const entries = offers.map(offer => {
    const gift = visibleProduct(offer.freeProductId);
    const buy = visibleProduct(offer.buyProductId) ?? product;
    return {
      id: offer.id,
      label: offer.discountPercent ? `خصم ${offer.discountPercent}%` : gift ? "هدية مجانية مع الطلب" : offer.offerType || "عرض خاص",
      title: offer.title,
      description: offer.description,
      condition: gift ? `اطلب ${offer.buyQuantity ?? 1} من ${buy.name} واحصل على ${offer.rewardQuantity ?? 1} من ${gift.name} مجانًا` : "",
      gift,
      code: offer.code,
    };
  });
  if (promo && !offers.some(offer => offer.title === promo.customText)) {
    const gift = promo.kind === "منتج مجاني مع الطلب" ? visibleProduct(promo.freeProductId) : undefined;
    entries.unshift({
      id: "product-promo", label: promo.kind === "عرض مخصص" ? "عرض خاص" : promoBadgeText(promo),
      title: promo.kind === "عرض مخصص" ? promo.customText || "عرض خاص على هذا المنتج" : promo.kind === "خصم" ? "استفد من سعر العرض" : "هدية مع طلب هذا المنتج",
      description: promo.kind === "عرض مخصص" ? "" : promo.customText || "",
      condition: gift ? `اطلب ${product.name} واحصل على ${gift.name} مجانًا` : "",
      gift, code: null,
    });
  }
  return entries;
}

export function ProductOfferBadge(props: Props) {
  const offers = offerDetails(props);
  if (!offers.length) return null;
  const Icon = offers[0].gift || props.product.promo?.kind === "منتج مجاني مع الطلب" ? Gift : Tag;
  return <span className={s.offerBadge}><Icon aria-hidden="true" /><span>{offers[0].label}</span>{offers.length > 1 && <small>+{offers.length - 1}</small>}</span>;
}

export function ProductOfferDetails({ detailed = false, ...props }: Props) {
  const offers = offerDetails(props);
  if (!offers.length) return null;
  return <span className={`${s.productOffers}${detailed ? ` ${s.detailedOffers}` : ""}`} id={detailed ? undefined : `product-offers-${props.product.id}`}>
    {offers.map(offer => <span key={offer.id} className={s.productOffer}>
      <span className={s.offerHeading}>{offer.gift ? <Gift aria-hidden="true" /> : <Tag aria-hidden="true" />}<strong>{offer.label}</strong></span>
      <span className={s.offerTitle} dir="auto">{offer.title}</span>
      {offer.condition && <span className={s.offerDescription}>{offer.condition}</span>}
      {offer.gift && <span className={s.offerGift}>
        {offer.gift.images[0] ? /* The image is already resolved from this brand's published menu. */
          // eslint-disable-next-line @next/next/no-img-element
          <img src={offer.gift.images[0].url} alt={offer.gift.name} width={72} height={72} loading="lazy" /> : <Gift aria-hidden="true" />}
        <span><small>هدية العرض</small><strong dir="auto">{offer.gift.name}</strong><b>مجانًا</b></span>
      </span>}
      {offer.description && offer.description !== offer.title && <span className={s.offerDescription} dir="auto">{offer.description}</span>}
      {offer.code && <span className={s.offerCode}>كود العرض <b dir="ltr">{offer.code}</b></span>}
    </span>)}
  </span>;
}
