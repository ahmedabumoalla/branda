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
  const response = NextResponse.redirect(new URL(`/loyalty/${slug}`, request.url));
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
    response.cookies.set(loyaltyCookieName(slug), token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000)) });
    return response;
  } catch { return new Response(null, { status: 503, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } }); }
}
