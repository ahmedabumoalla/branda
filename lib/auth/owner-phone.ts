import { normalizeInputDigits } from "@/lib/auth/input-digits";

export type OwnerPhoneCountry = "966" | "970";

export function normalizeOwnerPhone(input: string, localCountry: OwnerPhoneCountry = "966"): string | null {
  const value = normalizeInputDigits(input).trim().replace(/[\s()-]/g, "");
  if (!/^\+?\d+$/.test(value)) return null;
  const international = /^(?:\+|00)?(966|970)(\d+)$/.exec(value);
  if (!international && /^(?:\+|00)/.test(value)) return null;
  const country = international?.[1] ?? localCountry;
  const national = (international?.[2] ?? value).replace(/^0/, "");
  const valid = country === "970" ? /^5[69]\d{7}$/.test(national) : /^5\d{8}$/.test(national);
  return valid ? country + national : null;
}
