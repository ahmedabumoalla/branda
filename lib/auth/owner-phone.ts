import { ARAB_COUNTRIES, normalizeInternationalPhone, type ArabCallingCode } from "@/lib/auth/brand-phone";

export type OwnerPhoneCountry = ArabCallingCode;

export function normalizeOwnerPhone(input: string, localCountry: OwnerPhoneCountry = "966"): string | null {
  const country = ARAB_COUNTRIES.find(entry => entry.callingCode === localCountry);
  return country ? normalizeInternationalPhone(input, country.code) : null;
}
