import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCustomerProfileByUser } from "@/lib/data/customers";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicCafeBySlugAdmin } from "@/lib/data/cafes";
import { loyaltyCookieName, loyaltyIdentityHash, readLoyaltySessionToken } from "./loyalty-session-token";

/** A brand-scoped loyalty session grants card access only, never account login. */
export async function getLoyaltyCustomerProfile(slug: string) {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const token = (await cookies()).get(loyaltyCookieName(slug))?.value;
  if (token) {
    const session = readLoyaltySessionToken(token, slug);
    if (!session) return null;
    const cafe = await getPublicCafeBySlugAdmin(slug);
    if (!cafe || cafe.id !== session.cafeId) return null;
    const { data: profile, error } = await createAdminClient().from("customer_profiles")
      .select("id,cafe_id,full_name,phone,phone_normalized,status,blocked_at,phone_auth_conflict")
      .eq("id", session.profileId).eq("cafe_id", session.cafeId).maybeSingle();
    if (error || !profile || profile.status !== "active" || profile.blocked_at || profile.phone_auth_conflict
      || loyaltyIdentityHash(String(profile.phone_normalized ?? "")) !== session.phoneHash) return null;
    return profile;
  }
  // Existing verified sessions remain usable during the transition.
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || !user.phone_confirmed_at || user.is_anonymous) return null;
  const { data, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !data || data.claims.sub !== user.id) return null;
  const methods = data.claims.amr;
  if (!Array.isArray(methods) || !methods.some((entry) => typeof entry === "object" && entry !== null && "method" in entry && entry.method === "otp")) return null;
  const phone = normalizeSaudiPhone(user.phone ?? "");
  if (!phone) return null;
  const profile = await getCustomerProfileByUser(slug, user.id);
  if (!profile || profile.status !== "active" || profile.blocked_at || profile.phone_auth_conflict || normalizeSaudiPhone(String(profile.phone_normalized ?? profile.phone ?? "")) !== phone) return null;
  return profile;
}

export async function getVerifiedRastCustomerProfile() {
  return getLoyaltyCustomerProfile("rast");
}
