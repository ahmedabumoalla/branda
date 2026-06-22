import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicCafeBySlugAdmin, requireOwnerCafeContext } from "@/lib/data/cafes";
import { mapDbOfferToCafeOffer } from "@/lib/data/mappers";
import type { CafeOffer } from "@/lib/mock/offers";

function normalizeOfferStatusToDb(status: string) {
  const value = status.trim().toLowerCase();

  if (value === "active" || status === "نشط") return "active";
  if (value === "scheduled" || value === "published" || status === "مجدول") return "scheduled";
  if (value === "inactive" || status === "غير نشط") return "inactive";
  if (value === "expired" || status === "منتهي") return "expired";
  if (value === "draft" || status === "مسودة") return "draft";

  return value || "inactive";
}

function normalizeOfferStatusToUi(row: Record<string, unknown>) {
  const status = String(row.status ?? "");
  const next = { ...row };

  if (status === "active") next.status = "نشط";
  else if (status === "scheduled" || status === "published") next.status = "مجدول";
  else if (status === "inactive") next.status = "غير نشط";
  else if (status === "expired") next.status = "منتهي";
  else if (status === "draft") next.status = "مسودة";

  return next;
}

function mapOffer(row: Record<string, unknown>): CafeOffer {
  return mapDbOfferToCafeOffer(normalizeOfferStatusToUi(row));
}

function isActiveOfferPayload(payload: {
  status: string;
  visible_in_cafe: boolean;
  discount_percent: number | null;
  linked_product_id: string | null;
}) {
  return (
    (payload.status === "active" || payload.status === "scheduled" || payload.status === "published") &&
    payload.visible_in_cafe &&
    payload.discount_percent != null &&
    payload.discount_percent > 0 &&
    Boolean(payload.linked_product_id)
  );
}

async function syncLinkedProductPromo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cafeId: string,
  payload: {
    status: string;
    discount_percent: number | null;
    start_date: string | null;
    end_date: string | null;
    linked_product_id: string | null;
    title: string;
  }
) {
  if (!payload.linked_product_id) return;

  if (!isActiveOfferPayload({ ...payload, visible_in_cafe: true })) {
    return;
  }

  const promo = {
    kind: "خصم",
    discountMode: "percent",
    discountPercent: Number(payload.discount_percent),
    startDate: payload.start_date ?? new Date().toISOString().slice(0, 10),
    endDate: payload.end_date ?? "2099-12-31",
    customText: payload.title,
  };

  const { error } = await supabase
    .from("menu_products")
    .update({ promo })
    .eq("id", payload.linked_product_id)
    .eq("cafe_id", cafeId);

  if (error) throw error;
}

export async function getPublicOffersBySlug(slug: string): Promise<CafeOffer[]> {
  const cafe = await getPublicCafeBySlugAdmin(slug);
  if (!cafe) return [];

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

  return ((data ?? []) as Record<string, unknown>[]).map(mapOffer);
}

export async function getOwnerOffers(): Promise<CafeOffer[]> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("offers")
    .select("*")
    .eq("cafe_id", cafe.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(mapOffer);
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
  targetType: z.enum(["products", "reservation", "experience_campaign"]).optional().default("products"),
  reservationServiceId: z.string().uuid().optional().nullable(),
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
  const parsed = offerSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

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
    reservation_service_id: parsed.reservationServiceId ?? null,
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
      .upsert({ id: parsed.id, ...payload }, { onConflict: "id" })
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
    const { data, error } = await supabase
      .from("offers")
      .select("*")
      .eq("cafe_id", cafe.id)
      .eq("title", parsed.title)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    saved = (data as Record<string, unknown> | null) ?? null;
  }

  if (!saved) {
    throw new Error("تعذر حفظ العرض، لم يرجع السجل من قاعدة البيانات");
  }

  await syncLinkedProductPromo(supabase, cafe.id, payload);

  return mapOffer(saved);
}

export async function softDeleteOffer(offerId: string) {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("offers")
    .update({ deleted_at: new Date().toISOString(), is_archived: true })
    .eq("id", offerId)
    .eq("cafe_id", cafe.id);
  if (error) throw error;
}
