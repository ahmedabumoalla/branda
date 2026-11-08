/** Detect unambiguous stamp identifiers independently of the input tab. */
export function resolveReadMethod(method: "code" | "phone", input: string): "code" | "phone" {
  const value = input.trim().replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit >= "۰" ? 0x6f0 : 0x660)));
  if (value.startsWith("BARNDAKSA_QR:") || /^[a-f\d]{16}$/i.test(value) || /^\d{5}$/.test(value)) return "code";
  if (/^[+\d\s()-]+$/.test(value)) {
    const digits = value.replace(/\D/g, "");
    if (/^(?:05\d{8}|5\d{8}|9665\d{8}|009665\d{8})$/.test(digits)) return "phone";
  }
  return method;
}
