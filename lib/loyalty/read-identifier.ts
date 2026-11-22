/** Human-facing numbers are brand scoped and never public card credentials. */
export function normalizeLoyaltyDigits(input: string): string {
  // Copied WhatsApp phone numbers often include invisible bidi isolates/marks.
  // Normalize transport formatting before both method detection and validation.
  return input.replace(/[\u061C\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, "")
    .replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit >= "۰" ? 0x6f0 : 0x660))).trim();
}
export function isLoyaltyDisplayNumber(input: string): boolean {
  return /^[1-9]\d{0,4}$/.test(input);
}
export function isCashierLoyaltyCode(input: string): boolean {
  return isLoyaltyDisplayNumber(input) || /^[A-Z0-9_-]{4,100}$/.test(input);
}
export function normalizeLoyaltyReadPhone(input: string): string | null {
  const value = normalizeLoyaltyDigits(input);
  if (!/^[+\d\s()-]+$/.test(value)) return null;
  const match = /^(?:0|966|00966)?(5\d{8})$/.exec(value.replace(/\D/g, ""));
  return match ? `966${match[1]}` : null;
}
/** Detect unambiguous stamp identifiers independently of the input tab. */
export function resolveReadMethod(method: "code" | "phone", input: string): "code" | "phone" {
  const value = normalizeLoyaltyDigits(input.trim());
  if (value.startsWith("BARNDAKSA_QR:") || /^[a-f\d]{16}$/i.test(value) || isLoyaltyDisplayNumber(value)) return "code";
  if (normalizeLoyaltyReadPhone(value)) return "phone";
  return method;
}
