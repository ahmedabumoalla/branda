import "server-only";
import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServiceRoleKey } from "@/lib/barndaksa/env";
import { createLoyaltySessionToken, loyaltyCookieName, loyaltyIdentityHash, LOYALTY_SESSION_SECONDS } from "@/lib/auth/loyalty-session-token";

export function salonLoyaltyToken(id: string) {
  return createHmac("sha256", getSupabaseServiceRoleKey()).update(`branda:salon:loyalty:v1:${id}`).digest("hex");
}

const context = z.object({ cafe_id: z.uuid(), profile_id: z.uuid(), slug: z.string().regex(/^[a-z0-9-]{1,80}$/), phone: z.string().regex(/^9665\d{8}$/) });

export async function salonLoyaltySession(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const { data, error } = await createAdminClient().rpc("salon_loyalty_link_context", { p_hash: createHash("sha256").update(token).digest("hex") });
  if (error) throw new Error("SALON_LOYALTY_LINK_UNAVAILABLE");
  const parsed = context.safeParse(Array.isArray(data) ? data[0] : null);
  if (!parsed.success) return null;
  const row = parsed.data;
  return { slug: row.slug, name: loyaltyCookieName(row.slug),
    token: createLoyaltySessionToken({ slug: row.slug, cafeId: row.cafe_id, profileId: row.profile_id, phoneHash: loyaltyIdentityHash(row.phone) }),
    maxAge: LOYALTY_SESSION_SECONDS };
}
