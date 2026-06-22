"use server";

import { getOwnerOffers, softDeleteOffer, upsertOffer } from "@/lib/data/offers";
import { getOwnerMenu } from "@/lib/data/menu";
import { getOwnerReservationServices } from "@/lib/data/platform-upgrade";
import { generateMarketingCard } from "@/lib/ai/marketing-card-generator";
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
    targetType: offer.targetType ?? "products",
    reservationServiceId: offer.reservationServiceId ?? null,
    offerRules: offer.offerRules ?? {},
    bannerStoragePath: offer.bannerAssetId ?? null,
    cardStoragePath: offer.cardStoragePath ?? null,
    cardGenerationStatus: offer.cardGenerationStatus ?? "idle",
    cardGenerationError: offer.cardGenerationError ?? null,
    cardGeneratedAt: offer.cardGeneratedAt ?? null,
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

export async function generateOfferCardAction(offerId: string) {
  const offers = await getOwnerOffers();
  const offer = offers.find((item) => item.id === offerId);
  if (!offer) throw new Error("العرض غير موجود");

  await saveOfferAction({
    ...offer,
    cardGenerationStatus: "generating",
    cardGenerationError: undefined,
  });

  const [menu, services] = await Promise.all([getOwnerMenu(), getOwnerReservationServices()]);
  const selectedProductIds = new Set([
    offer.linkedProductId,
    offer.offerRules?.buyProductId,
    offer.offerRules?.freeProductId,
    ...(offer.offerRules?.selectedProductIds ?? []),
  ].filter(Boolean));
  const products = menu.products.filter((product) => selectedProductIds.has(product.id));
  const reservationService = services.find((service) => service.id === offer.reservationServiceId) ?? null;

  const result = await generateMarketingCard({
    entityId: offer.id,
    kind: "offer",
    title: offer.title,
    description: offer.description,
    brand: { cafeName: menu.cafe.name ?? "Barndaksa" },
    products,
    reservationService,
  });

  const saved = await saveOfferAction({
    ...offer,
    cardStoragePath: result.ok ? result.storagePath : offer.cardStoragePath,
    cardGenerationStatus: result.status,
    cardGenerationError: result.ok ? undefined : result.error,
    cardGeneratedAt: result.ok ? new Date().toISOString() : offer.cardGeneratedAt,
  });

  return saved;
}
