import { parseBarndaksaQrPayload } from "./secure-qr-payload";

/** Membership and reward QR codes can be inspected; mutation still needs one reward code. */
export function rastRedemptionCode(value: string) {
  const input = value.trim();
  if (input.length > 500) throw new Error("الرمز غير صالح لنوع العملية المحدد.");
  const code = parseBarndaksaQrPayload(input, "loyalty-card")
    ?? parseBarndaksaQrPayload(input, "customer-reward")
    ?? input.toUpperCase();
  if (!/^[A-Z0-9_-]{4,100}$/.test(code)) throw new Error("الرمز غير صالح لنوع العملية المحدد.");
  return code;
}
