import { createAdminClient } from "@/lib/supabase/admin";
import type { NextRequest, NextResponse } from "next/server";

/** Browsers cap persistent cookies; refresh on visits while server revocation stays authoritative. */
export const CASHIER_COOKIE_SECONDS = 400 * 24 * 60 * 60;

export async function refreshCashierCookie(request: NextRequest, response: NextResponse) {
  const token = request.cookies.get("barndaksa_cashier_session")?.value;
  if (!token || !/^[0-9a-f]{48}$/.test(token) || !["GET", "HEAD"].includes(request.method)
    || !["/cashier", "/pager"].includes(request.nextUrl.pathname)) return response;
  try {
    const { data, error } = await createAdminClient().from("cafe_cashier_sessions")
      .select("expires_at,revoked_at").eq("token", token).is("revoked_at", null)
      .gt("expires_at", "9000-01-01T00:00:00Z").abortSignal(AbortSignal.timeout(2000)).maybeSingle();
    if (!error && data && !data.revoked_at && Date.parse(data.expires_at) > Date.UTC(9000, 0, 1)) {
      response.cookies.set("barndaksa_cashier_session", token, {
        httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/",
        maxAge: CASHIER_COOKIE_SECONDS,
      });
    }
  } catch { /* A temporary database outage must not log the cashier out. */ }
  return response;
}
