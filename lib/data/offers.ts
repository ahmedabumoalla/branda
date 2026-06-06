import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
import { mapDbOfferToCafeOffer } from "@/lib/data/mappers";
import type { CafeOffer } from "@/lib/mock/offers";

export async function getPublicOffersBySlug(slug: string): Promise<CafeOffer[]> {
  const cafe = await getCafeBySlug(slug);
  if (!cafe) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("offers")
    .select("*")
    .eq("cafe_id", cafe.id)
    .eq("visible_in_cafe", true)
    .eq("status", "active")
    .is("deleted_at", null)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });

  return (data ?? []).map(mapDbOfferToCafeOffer);
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
  return (data ?? []).map(mapDbOfferToCafeOffer);
}

const offerSchema = z.object({
  id: z.string().uuid().optional(),
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
  bannerUrl: z.string().optional().nullable(),
  bannerStoragePath: z.string().optional().nullable(),
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
    status: parsed.status,
    placement: parsed.placement,
    visible_in_cafe: parsed.visibleInCafe,
    discount_percent: parsed.discountPercent ?? null,
    code: parsed.code ?? null,
    start_date: parsed.startDate ?? null,
    end_date: parsed.endDate ?? null,
    linked_product_id: parsed.linkedProductId ?? null,
    banner_storage_path: parsed.bannerStoragePath ?? null,
    banner_url: null,
    cta_text: parsed.ctaText ?? null,
    promo_payload: parsed.promoPayload ?? {},
  };

  if (parsed.id) {
    const { data, error } = await supabase
      .from("offers")
      .update(payload)
      .eq("id", parsed.id)
      .eq("cafe_id", cafe.id)
      .select("*")
      .single();
    if (error) throw error;
    return mapDbOfferToCafeOffer(data);
  }

  const { data, error } = await supabase.from("offers").insert(payload).select("*").single();
  if (error) throw error;
  return mapDbOfferToCafeOffer(data);
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
