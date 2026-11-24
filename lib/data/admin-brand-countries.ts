import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { isBrandPhoneCountry, type BrandPhoneCountry } from "@/lib/auth/brand-phone";

/** Called only after the caller's active-admin check; uses the same RLS client */
export async function getAdminBrandCountries(client: Awaited<ReturnType<typeof createClient>>, brandIds: string[]) {
  const countries = new Map<string, BrandPhoneCountry>();
  for (let offset = 0; offset < brandIds.length; offset += 100) {
    const { data, error } = await client.from("cafes").select("id,phone_country").in("id", brandIds.slice(offset, offset + 100));
    if (error || !data) throw new Error("Brand countries unavailable");
    for (const row of data) {
      if (!isBrandPhoneCountry(row.phone_country)) throw new Error("Invalid brand country");
      countries.set(row.id, row.phone_country);
    }
  }
  if (brandIds.some(id => !countries.has(id))) throw new Error("Incomplete brand countries");
  return countries;
}
