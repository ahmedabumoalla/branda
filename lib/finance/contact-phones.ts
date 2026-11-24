import { normalizeBrandPhone, normalizeInternationalPhone, getBrandCountry, type BrandPhoneCountry } from "@/lib/auth/brand-phone";
import { normalizeInputDigits } from "@/lib/auth/input-digits";

/** Staff mobiles may belong to another Arab country; local numbers use the account country */
export function normalizeEmployeeContactPhones(record: Record<string, unknown>, country: BrandPhoneCountry) {
  for (const key of ["mobile", "phone"] as const) {
    const raw = record[key];
    if (typeof raw !== "string" || !raw.trim()) continue;
    const normalized = normalizeInternationalPhone(raw, country);
    if (normalized) record[key] = normalized;
    else if (key === "mobile") throw new Error("أدخل جوال الموظف لدولة الحساب أو مع مفتاح الدولة");
    // HR phone directories also support office landlines, preserve those values
  }
}

/** Phone directories can also hold an office landline. Mobile identities use the brand's country. */
export function normalizeFinanceContactPhones(record: Record<string, unknown>, country: BrandPhoneCountry) {
  // Preserve historical Saudi directories, including existing landline formats
  if (country === "SA") return;
  for (const key of ["mobile", "phone"] as const) {
    const raw = record[key];
    if (typeof raw !== "string" || !raw.trim()) continue;
    const digits = normalizeInputDigits(raw).replace(/[\s()-]/g, "");
    if (/^(?:\+|00)/.test(digits) && !digits.replace(/^(?:\+|00)/, "").startsWith(getBrandCountry(country).callingCode)) throw new Error(`أدخل رقمًا لدولة الحساب ${getBrandCountry(country).name}`);
    if (country === "PS" && key === "phone" && !/^(?:0?5|(?:\+|00)?(?:966|970)0?5)/.test(digits)) continue;
    const normalized = normalizeBrandPhone(raw, country);
    if (!normalized && key === "phone" && country !== "PS" && !/^(?:\+|00)/.test(digits)) continue;
    if (!normalized) throw new Error(`أدخل رقم جوال صحيحًا لدولة الحساب ${getBrandCountry(country).name}`);
    record[key] = normalized;
  }
  if (Array.isArray(record.contacts)) {
    for (const contact of record.contacts) {
      if (contact && typeof contact === "object") normalizeFinanceContactPhones(contact, country);
    }
  }
}
