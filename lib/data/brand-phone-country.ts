import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BrandPhoneCountry } from "@/lib/auth/brand-phone";

const readCountry = cache(async (field: "id" | "slug", value: string): Promise<BrandPhoneCountry> => {
  const { data, error } = await createAdminClient().from("cafes").select("phone_country").eq(field, value).single();
  if (error || !data || !["SA", "PS"].includes(data.phone_country)) throw new Error("Brand phone country unavailable");
  return data.phone_country as BrandPhoneCountry;
});

export const getBrandPhoneCountry = (cafeId: string) => readCountry("id", cafeId);
export const getBrandPhoneCountryBySlug = (slug: string) => readCountry("slug", slug);
