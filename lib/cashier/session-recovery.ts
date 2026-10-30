import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const cashierRecoveryPath = "/cashier/session/clear?reason=session";

// This is an expiry preflight only. Every action still enforces its own permissions.
export async function cashierSessionStatus(request: NextRequest): Promise<"valid" | "expired" | "unavailable"> {
  const token = request.cookies.get("barndaksa_cashier_session")?.value;
  if (!token) return "expired";
  try {
    const { data, error } = await createAdminClient().from("cafe_cashier_sessions")
      .select("expires_at,revoked_at").eq("token", token).maybeSingle();
    if (error) return "unavailable";
    return data && !data.revoked_at && Date.parse(data.expires_at) > Date.now() ? "valid" : "expired";
  } catch {
    return "unavailable";
  }
}

export async function recoverExpiredCashierAction(request: NextRequest) {
  if (request.method !== "POST" || !request.headers.has("next-action")
    || !["/cashier", "/pager"].includes(request.nextUrl.pathname)) return null;
  if (await cashierSessionStatus(request) !== "expired") return null;
  // Next 16.3 reads this header before parsing the action response. Without a
  // Flight body it performs a full navigation, including in already-open tabs.
  return new NextResponse(null, { status: 200, headers: {
    "x-action-redirect": `${cashierRecoveryPath};replace`,
    "Content-Type": "text/plain",
    "Cache-Control": "private, no-store",
  } });
}
