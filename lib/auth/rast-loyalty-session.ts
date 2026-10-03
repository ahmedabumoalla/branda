import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCustomerProfileByUser } from "@/lib/data/customers";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";

/** Rast cards require a verified phone OTP session, never a legacy password cookie. */
export async function getVerifiedLoyaltyCustomerProfile(slug: string) {
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
  return getVerifiedLoyaltyCustomerProfile("rast");
}
