import "server-only";
import { normalizeInputDigits } from "@/lib/auth/input-digits";

export type CustomerPhoneOtpPurpose = "customer_signup" | "customer_login";

export function normalizeSaudiPhone(phone: string): string | null {
  let digits = normalizeInputDigits(phone).replace(/\D/g, "");
  if (digits.startsWith("00966")) digits = digits.slice(2);
  if (/^96605\d{8}$/.test(digits)) digits = `966${digits.slice(4)}`;
  if (digits.startsWith("05")) digits = `966${digits.slice(1)}`;
  if (digits.startsWith("5") && digits.length === 9) digits = `966${digits}`;
  return /^9665\d{8}$/.test(digits) ? digits : null;
}
