import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { approvedLoyaltyColors } from "@/lib/loyalty/approved-design";

/** Call after the existing owner/public loyalty entitlement guard; cache is request-local. */
export const getLoyaltyBrandAppearance = cache(async (cafeId: string, slug: string) => {
  const { data: cafe, error: cafeError } = await createAdminClient().from("cafes").select("business_category").eq("id", cafeId).maybeSingle();
  if (cafeError) throw new Error("تعذر تحميل هوية العلامة");
  const { data, error } = await createAdminClient().from("cafe_custom_identity")
    .select("palette,logo_storage_path,logo_url").eq("cafe_id", cafeId).maybeSingle();
  if (error) throw new Error("تعذر تحميل هوية العلامة");
  const palette = data?.palette && typeof data.palette === "object" && !Array.isArray(data.palette) ? data.palette as Record<string, unknown> : null;
  return { businessCategory: String(cafe?.business_category ?? "cafes_coffee"), colors: approvedLoyaltyColors(slug, palette), logoPath: data?.logo_storage_path as string | null, logoUrl: data?.logo_url as string | null };
});
