import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getSupabaseServiceRoleKey } from "@/lib/barndaksa/env";

export const LOYALTY_SESSION_SECONDS = 30 * 24 * 60 * 60;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type LoyaltySession = { slug: string; cafeId: string; profileId: string; phoneHash: string; expiresAt: number };

export function loyaltyIdentityHash(value: string) {
  return createHmac("sha256", getSupabaseServiceRoleKey()).update(`loyalty-identity:v1:${value}`).digest("hex");
}

function signature(payload: string) {
  return createHmac("sha256", getSupabaseServiceRoleKey()).update(`loyalty-session:v1:${payload}`).digest("base64url");
}

export function createLoyaltySessionToken(input: Omit<LoyaltySession, "expiresAt">, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ ...input, expiresAt: now + LOYALTY_SESSION_SECONDS * 1000 })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function readLoyaltySessionToken(token: string, slug: string, now = Date.now()): LoyaltySession | null {
  if (token.length > 1200) return null;
  const [payload, received, extra] = token.split(".");
  if (!payload || !received || extra !== undefined || !/^[A-Za-z0-9_-]{43}$/.test(received)) return null;
  const expected = signature(payload);
  if (received.length !== expected.length || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as LoyaltySession;
    return value.slug === slug && /^[a-z0-9-]{1,80}$/.test(value.slug) && uuid.test(value.cafeId) && uuid.test(value.profileId)
      && /^[a-f0-9]{64}$/.test(value.phoneHash) && Number.isSafeInteger(value.expiresAt)
      && value.expiresAt > now && value.expiresAt <= now + LOYALTY_SESSION_SECONDS * 1000 ? value : null;
  } catch { return null; }
}

export function loyaltyCookieName(slug: string) { return `branda_loyalty_${slug}`; }
