import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function key() {
  const value = Buffer.from(process.env.MARKETING_ENCRYPTION_KEY?.trim() ?? "", "base64");
  if (value.length !== 32) throw new Error("MARKETING_CONFIGURATION_MISSING");
  return value;
}
export function marketingPublicOrigin() {
  const url = new URL(process.env.MARKETING_PUBLIC_URL || "https://barndaksa.com");
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("MARKETING_CONFIGURATION_INVALID");
  return url.origin;
}
export function marketingConfigured() {
  try { key(); marketingPublicOrigin(); return Boolean(process.env.GREEN_API_PARTNER_TOKEN?.trim()); } catch { return false; }
}
export function encryptMarketingSecret(value: unknown, context: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}
export function decryptMarketingSecret<T>(value: string, context: string): T {
  const [version, iv, tag, data] = value.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("MARKETING_SECRET_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8")) as T;
}
export const hashMarketingToken = (token: string) => createHash("sha256").update(token).digest("hex");
export function verifyMarketingToken(token: string, hash: string) {
  const actual = Buffer.from(hashMarketingToken(token)); const expected = Buffer.from(hash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function signMarketingUnsubscribe(recipientId: string) {
  return createHmac("sha256", key()).update(`marketing-unsubscribe:${recipientId}`).digest("base64url");
}
export function verifyMarketingUnsubscribe(recipientId: string, signature: string) {
  const expected = Buffer.from(signMarketingUnsubscribe(recipientId)); const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
