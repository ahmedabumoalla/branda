/** Human-facing numbers are brand scoped and never public card credentials. */
export function normalizeLoyaltyDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit >= "۰" ? 0x6f0 : 0x660)));
}
export function isLoyaltyDisplayNumber(input: string): boolean {
  return /^[1-9]\d{0,4}$/.test(input);
}
export function isCashierLoyaltyCode(input: string): boolean {
  return isLoyaltyDisplayNumber(input) || /^[A-Z0-9_-]{4,100}$/.test(input);
}
/** Detect unambiguous stamp identifiers independently of the input tab. */
export function resolveReadMethod(method: "code" | "phone", input: string): "code" | "phone" {
  const value = normalizeLoyaltyDigits(input.trim());
  if (value.startsWith("BARNDAKSA_QR:") || /^[a-f\d]{16}$/i.test(value) || isLoyaltyDisplayNumber(value)) return "code";
  if (/^[+\d\s()-]+$/.test(value)) {
    const digits = value.replace(/\D/g, "");
    if (/^(?:05\d{8}|5\d{8}|9665\d{8}|009665\d{8})$/.test(digits)) return "phone";
  }
  return method;
}
