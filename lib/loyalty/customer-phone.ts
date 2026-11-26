import { normalizeBrandPhone, type BrandPhoneCountry } from "../auth/brand-phone";
import { normalizeInputDigits } from "../auth/input-digits";
import { worldMobileRules } from "./world-mobile-rules";

export const FAROUJ_CAFE_ID = "ec9b4415-b68e-4554-acbd-c918bd5cc2f2";
export const FAROUJ_SLUG = "brand-4eb156760728";

type PhoneRegion = { phone: string; region: string | null };
type Rule = { region: string; prefix: RegExp | null; mobile: RegExp };
let callingCodes: Map<string, Rule[]> | undefined;
function rulesByCallingCode() {
  if (callingCodes) return callingCodes;
  callingCodes = new Map();
  for (const [cc, region, prefix, pattern] of worldMobileRules) {
    const rules = callingCodes.get(cc) ?? [];
    rules.push({ region, prefix: prefix ? new RegExp(`^(?:${prefix})`) : null, mobile: new RegExp(`^(?:${pattern})$`) });
    callingCodes.set(cc, rules);
  }
  return callingCodes;
}

export function faroujCustomerPhone(input: string): PhoneRegion | null {
  if (typeof input !== "string" || input.length > 64) return null;
  const clean = normalizeInputDigits(input).replace(/[\s()-]/g, "");
  const digits = clean.replace(/^(?:\+|00)/, "");
  if (/^[1-9]\d{4,14}$/.test(digits)) {
    const plans = rulesByCallingCode();
    for (let n = 1; n <= 3; n++) {
      const rules = plans.get(digits.slice(0, n));
      if (!rules) continue;
      const national = digits.slice(n);
      const matched = rules.filter(rule => (!rule.prefix || rule.prefix.test(national)) && rule.mobile.test(national));
      if (matched.length) return { phone: digits, region: matched.length === 1 ? matched[0].region : null };
    }
  }
  const local = normalizeBrandPhone(clean, "AE");
  return local ? { phone: local, region: "AE" } : null;
}

export function loyaltyCustomerPhone(raw: string, country: BrandPhoneCountry, cafeId?: string) {
  return cafeId === FAROUJ_CAFE_ID ? faroujCustomerPhone(raw)?.phone ?? null : normalizeBrandPhone(raw, country);
}

export function phoneRegionName(region: string, language: string) {
  return new Intl.DisplayNames([language], { type: "region" }).of(region) ?? region;
}
