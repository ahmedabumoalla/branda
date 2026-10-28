import "server-only";
import { createHash } from "node:crypto";

// Admin-provisioned usernames use an internal Auth identity, never an email
// delivery address. Authentication and password throttling remain in Supabase.
export function ownerLoginAliasEmail(value: string): string | null {
  const alias = value.normalize("NFC").trim().replace(/\s+/gu, " ").toLowerCase();
  if (alias.length < 2 || alias.length > 120 || !/^[\p{L}\p{N} _-]+$/u.test(alias) || !/\p{L}/u.test(alias)) return null;
  const digest = createHash("sha256").update(`branda:owner-login-alias:v1:${alias}`).digest("hex");
  return `alias-${digest}@accounts.barndaksa.invalid`;
}
