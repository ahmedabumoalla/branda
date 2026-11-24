import rules from "@/lib/auth/arab-phone-rules";
import { normalizeInputDigits } from "@/lib/auth/input-digits";

export const ARAB_COUNTRY_CODES = ["SA", "AE", "BH", "KW", "OM", "QA", "YE", "JO", "PS", "LB", "SY", "IQ", "EG", "SD", "LY", "TN", "DZ", "MA", "MR", "SO", "DJ", "KM"] as const;
export type BrandPhoneCountry = typeof ARAB_COUNTRY_CODES[number];
export const ARAB_CALLING_CODES = ["966", "971", "973", "965", "968", "974", "967", "962", "970", "961", "963", "964", "20", "249", "218", "216", "213", "212", "222", "252", "253", "269"] as const;
export type ArabCallingCode = typeof ARAB_CALLING_CODES[number];

// Mobile patterns: Google libphonenumber PhoneNumberMetadata.xml, retrieved 2026-11-24
// Saudi validation retains the existing 5 + eight digits contract
// Source and Apache license: docs/third-party/arab-phone-metadata.md
export const ARAB_COUNTRIES = rules.map(rule => ({ ...rule, code: rule.code as BrandPhoneCountry, callingCode: rule.callingCode as ArabCallingCode }));
const countries = new Map(ARAB_COUNTRIES.map(country => [country.code, country]));
const mobilePatterns = new Map(ARAB_COUNTRIES.map(country => [country.code, new RegExp(`^(?:${country.pattern})$`)]));

export function isBrandPhoneCountry(value: unknown): value is BrandPhoneCountry {
  return typeof value === "string" && countries.has(value as BrandPhoneCountry);
}

export function getBrandCountry(country: BrandPhoneCountry) {
  const result = countries.get(country);
  if (!result) throw new Error("Unsupported brand country");
  return result;
}

function cleanPhone(input: string): string | null {
  if (typeof input !== "string" || input.length > 64) return null;
  const value = normalizeInputDigits(input).trim().replace(/[\s()-]/g, "");
  return /^\+?\d+$/.test(value) ? value : null;
}

function nationalPhone(value: string, country: BrandPhoneCountry): string | null {
  const rule = getBrandCountry(country);
  const national = rule.prefix && value.startsWith(rule.prefix) ? value.slice(rule.prefix.length) : value;
  return mobilePatterns.get(country)!.test(national) ? rule.callingCode + national : null;
}

function internationalPhone(value: string): { country: BrandPhoneCountry; phone: string } | null {
  const digits = value.replace(/^(?:\+|00)/, "");
  for (const country of ARAB_COUNTRIES) {
    if (!digits.startsWith(country.callingCode)) continue;
    const phone = nationalPhone(digits.slice(country.callingCode.length), country.code);
    if (phone) return { country: country.code, phone };
  }
  return null;
}

/** Infer only a complete international number; never guess a local number's country */
export function inferPhoneCountry(input: string): BrandPhoneCountry | null {
  const value = cleanPhone(input);
  return value ? internationalPhone(value)?.country ?? null : null;
}

/** Brand/customer identity: local numbers use the brand country, foreign numbers are rejected */
export function normalizeBrandPhone(input: string, country: BrandPhoneCountry): string | null {
  if (!isBrandPhoneCountry(country)) return null;
  const value = cleanPhone(input);
  if (!value) return null;
  const international = internationalPhone(value);
  if (international) return international.country === country ? international.phone : null;
  if (/^(?:\+|00)/.test(value)) return null;
  return nationalPhone(value, country);
}

/** Staff/owner login: explicit international country wins; local numbers use the account country */
export function normalizeInternationalPhone(input: string, fallbackCountry: BrandPhoneCountry = "SA"): string | null {
  if (!isBrandPhoneCountry(fallbackCountry)) return null;
  const value = cleanPhone(input);
  if (!value) return null;
  const international = internationalPhone(value);
  if (international) return international.phone;
  if (/^(?:\+|00)/.test(value)) return null;
  return nationalPhone(value, fallbackCountry);
}

export const canonicalBrandMobile = new RegExp(`^(?:${ARAB_COUNTRIES.map(country => `${country.callingCode}(?:${country.pattern})`).join("|")})$`);
