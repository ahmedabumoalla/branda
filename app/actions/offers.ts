"use server";

import { getOwnerOffers, softDeleteOffer, upsertOffer } from "@/lib/data/offers";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { createClient } from "@/lib/supabase/server";
import type { CafeOffer } from "@/lib/mock/offers";
import { uploadOptimizedImage } from "@/lib/storage/upload-server";
import { assertOwnerServiceEnabled } from "@/lib/data/owner-service-access";

export async function fetchOwnerOffersAction() {
  await assertOwnerServiceEnabled("offers");
  return getOwnerOffers();
}

export async function saveOfferAction(offer: CafeOffer) {
  await assertOwnerServiceEnabled("offers");
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
  await assertOwnerServiceEnabled("offers");
  await softDeleteOffer(offerId);
}

export async function uploadOfferBannerAction(offerId: string, formData: FormData) {
  await assertOwnerServiceEnabled("offers");
  if (!/^[0-9a-f-]{36}$/i.test(offerId)) {
    throw new Error("احفظ العرض قبل رفع الصورة");
  }
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("اختر صورة صالحة");
  const cafe = await requireOwnerCafeContext();
  if (!["owner", "manager", "platform_admin"].includes(cafe.role)) throw new Error("ليس لديك صلاحية إدارة العروض");
  {
    if (file.size > 8 * 1024 * 1024) throw new Error("اختر صورة بحجم أقل من ٨ ميجابايت");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("اختر صورة بصيغة PNG أو JPG أو WEBP");
    const supabase = await createClient();
    const { data, error } = await supabase.from("offers").select("id").eq("id", offerId).eq("cafe_id", cafe.id).is("deleted_at", null).maybeSingle();
    if (error || !data) throw new Error("احفظ العرض في حساب علامتك قبل رفع الصورة");
  }
  return uploadOptimizedImage("offer-banners", file, "offer-banner", offerId);
}
