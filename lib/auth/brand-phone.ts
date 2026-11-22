import { normalizeOwnerPhone } from "@/lib/auth/owner-phone";

export type BrandPhoneCountry = "SA" | "PS";

export function normalizeBrandPhone(input: string, country: BrandPhoneCountry): string | null {
  if (country !== "SA" && country !== "PS") return null;
  const callingCode = country === "PS" ? "970" : "966";
  const phone = normalizeOwnerPhone(input, callingCode);
  return phone?.startsWith(callingCode) ? phone : null;
}

export const canonicalBrandMobile = /^(?:9665\d{8}|9705[69]\d{7})$/;
