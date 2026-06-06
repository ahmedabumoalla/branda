"use server";

import { getOwnerOffers, softDeleteOffer, upsertOffer } from "@/lib/data/offers";
import type { CafeOffer } from "@/lib/mock/offers";

export async function fetchOwnerOffersAction() {
  return getOwnerOffers();
}

export async function saveOfferAction(offer: CafeOffer) {
  return upsertOffer({
    id: /^[0-9a-f-]{36}$/i.test(offer.id) ? offer.id : undefined,
    title: offer.title,
    description: offer.description,
    type: offer.type,
    status: offer.status,
    placement: offer.placement,
    visibleInCafe: offer.visibleInCafe,
    discountPercent: offer.discountPercent ?? null,
    code: offer.code ?? null,
    startDate: offer.startDate ?? null,
    endDate: offer.endDate ?? null,
    linkedProductId: offer.linkedProductId ?? null,
    bannerStoragePath: offer.bannerAssetId ?? null,
    ctaText: offer.ctaText ?? null,
    promoPayload: {
      promoProductName: offer.promoProductName,
      promoProductPrice: offer.promoProductPrice,
      promoProductCategory: offer.promoProductCategory,
      promoProductDescription: offer.promoProductDescription,
    },
  });
}

export async function deleteOfferAction(offerId: string) {
  await softDeleteOffer(offerId);
}
