import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { getSupabaseServiceRoleKey } from "@/lib/barndaksa/env";

// Purpose-separated key; the service credential never reaches the database or browser.
function key() { return createHmac("sha256", getSupabaseServiceRoleKey()).update("branda:brand-welcome:encryption:v1").digest(); }
export function accountFingerprint(value: string) {
  return createHmac("sha256", key()).update("request:" + value).digest("hex");
}
export function sealWelcomePassword(password: string, requestId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(requestId));
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function openWelcomePassword(sealed: string, requestId: string) {
  const [version, iv, tag, ciphertext] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("INVALID_WELCOME_SECRET");
  const cipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  cipher.setAAD(Buffer.from(requestId));
  cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([cipher.update(Buffer.from(ciphertext, "base64url")), cipher.final()]).toString("utf8");
}
