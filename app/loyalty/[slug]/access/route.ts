import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicCafeBySlugAdmin } from "@/lib/data/cafes";
import { assertRastLoyaltyEntitlement } from "@/lib/data/rast-loyalty-access";
import { loyaltyCookieName, loyaltyIdentityHash, readLoyaltySessionToken } from "@/lib/auth/loyalty-session-token";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return new Response(null, { status: 404 });
  const destination = new URL(`/loyalty/${slug}`, request.url);
  if (new URL(request.url).searchParams.get("lang") === "en") destination.searchParams.set("lang", "en");
  const response = NextResponse.redirect(destination);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("referrer-policy", "no-referrer");
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const session = readLoyaltySessionToken(token, slug);
  if (!session) return response;
  try {
    const cafe = await getPublicCafeBySlugAdmin(slug);
    if (!cafe || cafe.id !== session.cafeId) return response;
    await assertRastLoyaltyEntitlement(cafe.id);
    const { data, error } = await createAdminClient().from("customer_profiles").select("id,phone_normalized,status,blocked_at,phone_auth_conflict").eq("id", session.profileId).eq("cafe_id", session.cafeId).maybeSingle();
    if (error || !data || data.status !== "active" || data.blocked_at || data.phone_auth_conflict || loyaltyIdentityHash(String(data.phone_normalized ?? "")) !== session.phoneHash) return response;
    const cardId = new URL(request.url).searchParams.get("card");
    if (cardId !== null) {
      if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(cardId)) return response;
      const card = await createAdminClient().from("loyalty_cards").select("loyalty_branch_id,branch:branches!loyalty_card_branch_same_cafe(active,loyalty_enabled,deleted_at)")
        .eq("id", cardId).eq("customer_profile_id", session.profileId).eq("cafe_id", cafe.id).eq("status", "active").maybeSingle();
      if (card.error) throw new Error("Card status unavailable");
      if (!card.data) return response;
      const branch = Array.isArray(card.data.branch) ? card.data.branch[0] : card.data.branch;
      if (card.data.loyalty_branch_id && branch?.active && branch.loyalty_enabled && !branch.deleted_at) {
        destination.searchParams.set("branch", card.data.loyalty_branch_id);
        response.headers.set("location", destination.toString());
      }
    }
    response.cookies.set(loyaltyCookieName(slug), token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000)) });
    return response;
  } catch { return new Response(null, { status: 503, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } }); }
}
