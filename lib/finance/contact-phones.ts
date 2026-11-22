import { normalizeBrandPhone, type BrandPhoneCountry } from "@/lib/auth/brand-phone";
import { normalizeInputDigits } from "@/lib/auth/input-digits";

/** Phone directories can also hold an office landline. Mobile identities use the brand's country. */
export function normalizeFinanceContactPhones(record: Record<string, unknown>, country: BrandPhoneCountry) {
  if (country !== "PS") return;
  for (const key of ["mobile", "phone"] as const) {
    const raw = record[key];
    if (typeof raw !== "string" || !raw.trim()) continue;
    const digits = normalizeInputDigits(raw).replace(/[\s()-]/g, "");
    if (/^(?:\+|00)/.test(digits) && !/^(?:\+|00)970/.test(digits)) throw new Error("أدخل رقمًا فلسطينيًا بمفتاح ٩٧٠");
    if (key === "phone" && !/^(?:0?5|(?:\+|00)?(?:966|970)0?5)/.test(digits)) continue;
    const normalized = normalizeBrandPhone(raw, country);
    if (!normalized) throw new Error("أدخل رقم جوال فلسطيني صحيح");
    record[key] = normalized;
  }
  if (Array.isArray(record.contacts)) {
    for (const contact of record.contacts) {
      if (contact && typeof contact === "object") normalizeFinanceContactPhones(contact, country);
    }
  }
}
