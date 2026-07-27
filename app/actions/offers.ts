"use server";

import { getOwnerOffers, softDeleteOffer, upsertOffer } from "@/lib/data/offers";
import { getOwnerMenu } from "@/lib/data/menu";
import type { CafeOffer } from "@/lib/mock/offers";
import { uploadOptimizedImage } from "@/lib/storage/upload-server";

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

export async function uploadOfferBannerAction(offerId: string, formData: FormData) {
  if (!/^[0-9a-f-]{36}$/i.test(offerId)) {
    throw new Error("احفظ العرض قبل رفع الصورة");
  }
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("اختر صورة صالحة");
  return uploadOptimizedImage("offer-banners", file, "offer-banner", offerId);
}
