import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicCafeBySlugAdmin, requireOwnerCafeContext } from "@/lib/data/cafes";
import { mapDbOfferToCafeOffer } from "@/lib/data/mappers";
import type { CafeOffer } from "@/lib/mock/offers";
import { clearServerMemoryCache } from "@/lib/performance/server-memory-cache";
import { rastCampaignSchema } from "@/lib/offers/rast-offers";
import { isOwnedMenuAsset } from "@/lib/menu/standalone-menu";
import { assertOwnerServiceEnabled } from "@/lib/data/owner-service-access";
import { getCafeFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

function invalidatePublicOffers(slug: string) {
  const normalizedSlug = slug.trim().toLowerCase();
  clearServerMemoryCache(`public-offers:${normalizedSlug}`);
  revalidatePath(`/c/${normalizedSlug}/products/offers`);
  revalidatePath(`/c/${normalizedSlug}/offers`);
  revalidatePath(`/menu/${normalizedSlug}`);
}

function normalizeOfferStatusToDb(status: string) {
  const value = status.trim().toLowerCase();

  if (value === "active" || status === "نشط") return "active";
  if (value === "scheduled" || value === "published" || status === "مجدول") return "scheduled";
  if (value === "inactive" || status === "غير نشط" || status === "متوقف") return "inactive";
  if (value === "expired" || status === "منتهي") return "expired";
  if (value === "draft" || status === "مسودة") return "draft";

  return value || "inactive";
}

function normalizeOfferStatusToUi(row: Record<string, unknown>) {
  const status = String(row.status ?? "");
  const next = { ...row };

  if (status === "active") next.status = "نشط";
  else if (status === "scheduled" || status === "published") next.status = "مجدول";
  else if (status === "inactive") next.status = "متوقف";
  else if (status === "expired") next.status = "منتهي";
  else if (status === "draft") next.status = "مسودة";

  return next;
}

function mapOffer(row: Record<string, unknown>): CafeOffer {
  return mapDbOfferToCafeOffer(normalizeOfferStatusToUi(row));
}

export async function getPublicOffersBySlug(slug: string): Promise<CafeOffer[]> {
  const cafe = await getPublicCafeBySlugAdmin(slug);
  if (!cafe) return [];
  if (!featureCodesAllow(await getCafeFeatureCodes(cafe.id), "offers")) return [];

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("offers")
    .select("*")
    .eq("cafe_id", cafe.id)
    .eq("visible_in_cafe", true)
    .in("status", ["active", "scheduled", "published"])
    .is("deleted_at", null)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });

  const now = Date.now();
  const visibleOffers = ((data ?? []) as Record<string, unknown>[])
    .map(mapOffer)
    .filter((offer) => {
      const startsAt = offer.startDate ? new Date(`${offer.startDate}T00:00:00+03:00`).getTime() : null;
      const endsAt = offer.endDate ? new Date(`${offer.endDate}T23:59:59.999+03:00`).getTime() : null;
      return (
        (!startsAt || Number.isNaN(startsAt) || startsAt <= now) &&
        (!endsAt || Number.isNaN(endsAt) || endsAt >= now)
      );
    });
  const preferredPaths = visibleOffers
    .map((offer) => [offer.cardStoragePath, offer.bannerAssetId].find((path) => path && isOwnedMenuAsset(path, cafe.id) && path.startsWith(`${cafe.id}/${offer.id}/`)))
    .filter((path): path is string => Boolean(path));
  const signedByPath = new Map<string, string>();
  if (preferredPaths.length) {
    const { data: signed } = await supabase.storage
      .from("offer-banners")
      .createSignedUrls(preferredPaths, 60 * 60);
    for (const item of signed ?? []) {
      if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
    }
  }
  return visibleOffers.map((offer) => {
    const preferredPath = offer.cardStoragePath || offer.bannerAssetId;
    const signedUrl = preferredPath ? signedByPath.get(preferredPath) : undefined;
    return signedUrl
      ? {
          ...offer,
          bannerImageUrl: signedUrl,
          bannerAssetId: undefined,
          cardStoragePath: undefined,
        }
      : offer;
  });
}

export async function getOwnerOffers(): Promise<CafeOffer[]> {
  await assertOwnerServiceEnabled("offers");
  const cafe = await requireOwnerCafeContext();
  if (!["owner", "manager", "platform_admin"].includes(cafe.role)) throw new Error("ليس لديك صلاحية إدارة العروض");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("offers")
    .select("*")
    .eq("cafe_id", cafe.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  const offers = ((data ?? []) as Record<string, unknown>[]).map(mapOffer);
  const paths = offers.flatMap((offer) => [offer.cardStoragePath, offer.bannerAssetId]
    .filter((path): path is string => Boolean(path && isOwnedMenuAsset(path, cafe.id) && path.startsWith(`${cafe.id}/${offer.id}/`))));
  if (!paths.length) return offers;
  const { data: images, error: imageError } = await supabase.storage.from("offer-banners").createSignedUrls([...new Set(paths)], 3600);
  if (imageError) throw imageError;
  const signed = new Map((images ?? []).map((image) => [image.path, image.signedUrl]));
  return offers.map((offer) => ({ ...offer, bannerImageUrl: signed.get(offer.cardStoragePath ?? "") || signed.get(offer.bannerAssetId ?? "") || undefined }));
}

const offerSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  title: z.string().min(1),
  description: z.string(),
  type: z.string(),
  status: z.string(),
  placement: z.string(),
  visibleInCafe: z.boolean(),
  discountPercent: z.number().optional().nullable(),
  code: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  linkedProductId: z.string().uuid().optional().nullable(),
  targetType: z.enum(["products", "experience_campaign"]).optional().default("products"),
  offerRules: z.record(z.string(), z.unknown()).optional(),
  bannerImageUrl: z.string().optional().nullable(),
  bannerUrl: z.string().optional().nullable(),
  bannerStoragePath: z.string().optional().nullable(),
  cardStoragePath: z.string().optional().nullable(),
  cardGenerationStatus: z.enum(["idle", "generating", "ready", "failed"]).optional(),
  cardGenerationError: z.string().optional().nullable(),
  cardGeneratedAt: z.string().optional().nullable(),
  ctaText: z.string().optional().nullable(),
  promoPayload: z.record(z.string(), z.unknown()).optional(),
});

export async function upsertOffer(input: z.infer<typeof offerSchema>) {
  await assertOwnerServiceEnabled("offers");
  const parsed = offerSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  if (!["owner", "manager", "platform_admin"].includes(cafe.role)) throw new Error("ليس لديك صلاحية إدارة العروض");
  const supabase = await createClient();

  // Resolve the tenant from the authenticated owner, never from a client flag.
  {
    const validated = rastCampaignSchema.safeParse(parsed);
    if (!validated.success) throw new Error(validated.error.issues[0]?.message ?? "راجع بيانات العرض");
    Object.assign(parsed, validated.data);
    const rules = validated.data.offerRules;
    const ids = [...new Set(rules.selectedProductIds)];
    if (rules.rastKind === "products") {
      const { data: owned, error } = await supabase.from("menu_products").select("id")
        .eq("cafe_id", cafe.id).is("deleted_at", null).in("id", ids);
      if (error) throw error;
      if (owned?.length !== ids.length) throw new Error("بعض المنتجات غير متاحة في حساب علامتك أعد اختيارها");
    }
    for (const path of [parsed.bannerStoragePath, parsed.cardStoragePath]) {
      if (path && (!parsed.id || !isOwnedMenuAsset(path, cafe.id) || !path.startsWith(`${cafe.id}/${parsed.id}/`))) {
        throw new Error("الصورة لا تخص هذا العرض");
      }
    }
    parsed.offerRules = { ...rules, selectedProductIds: rules.rastKind === "products" ? ids : [], appliesToAllProducts: rules.rastKind === "general" };
    parsed.type = rules.rastKind === "event" ? "عرض مخصص" : "خصم";
    parsed.targetType = rules.rastKind === "event" ? "experience_campaign" : "products";
    parsed.linkedProductId = rules.rastKind === "products" ? ids[0] : null;
    parsed.discountPercent = rules.rastKind === "event" ? null : parsed.discountPercent;
    parsed.code = rules.rastKind === "event" ? null : parsed.code;
    parsed.placement = "بانر الكوفي";
    if (parsed.status === "متوقف") parsed.status = "inactive";
  }

  const payload = {
    cafe_id: cafe.id,
    title: parsed.title,
    description: parsed.description,
    offer_type: parsed.type,
    status: normalizeOfferStatusToDb(parsed.status),
    placement: parsed.placement,
    visible_in_cafe: parsed.visibleInCafe,
    discount_percent: parsed.discountPercent ?? null,
    code: parsed.code ?? null,
    start_date: parsed.startDate ?? null,
    end_date: parsed.endDate ?? null,
    linked_product_id: parsed.linkedProductId ?? null,
    target_type: parsed.targetType ?? "products",
    offer_rules: parsed.offerRules ?? {},
    banner_storage_path: parsed.bannerStoragePath ?? null,
    banner_url: parsed.bannerImageUrl ?? parsed.bannerUrl ?? null,
    card_storage_path: parsed.cardStoragePath ?? null,
    card_generation_status: parsed.cardGenerationStatus ?? "idle",
    card_generation_error: parsed.cardGenerationError ?? null,
    card_generated_at: parsed.cardGeneratedAt ?? null,
    cta_text: parsed.ctaText ?? null,
    promo_payload: parsed.promoPayload ?? {},
    deleted_at: null,
    is_archived: false,
  };

  let saved: Record<string, unknown> | null = null;

  if (parsed.id) {
    const { data, error } = await supabase
      .from("offers")
      .update(payload)
      .eq("id", parsed.id)
      .eq("cafe_id", cafe.id)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    saved = (data as Record<string, unknown> | null) ?? null;
  } else {
    const { data, error } = await supabase
      .from("offers")
      .insert(payload)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    saved = (data as Record<string, unknown> | null) ?? null;
  }

  if (!saved) {
    throw new Error("تعذر حفظ العرض لم يرجع السجل من قاعدة البيانات");
  }

  // Published campaign prices are derived at read time for every brand
  // Saving or hiding an offer never mutates a product's independent promotion
  invalidatePublicOffers(cafe.slug);

  return mapOffer(saved);
}

export async function softDeleteOffer(offerId: string) {
  await assertOwnerServiceEnabled("offers");
  z.string().uuid().parse(offerId);
  const cafe = await requireOwnerCafeContext();
  if (!["owner", "manager", "platform_admin"].includes(cafe.role)) throw new Error("ليس لديك صلاحية إدارة العروض");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("offers")
    .update({ deleted_at: new Date().toISOString(), is_archived: true })
    .eq("id", offerId)
    .eq("cafe_id", cafe.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("العرض غير متاح أو تم حذفه");
  invalidatePublicOffers(cafe.slug);
}
