import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cashierWorkspaceKey } from "./workspace-session";

export const cashierRecoveryPath = "/cashier/session/clear?reason=session";

// This is an expiry preflight only. Every action still enforces its own permissions.
export async function cashierSessionStatus(request: NextRequest, onPersistent?: () => void): Promise<"valid" | "expired" | "changed" | "unavailable"> {
  const token = request.cookies.get("barndaksa_cashier_session")?.value;
  if (!token) return "expired";
  const workspace = request.nextUrl.searchParams.get("workspace");
  if (workspace && workspace !== cashierWorkspaceKey(token)) return "changed";
  try {
    const { data, error } = await createAdminClient().from("cafe_cashier_sessions")
      .select("expires_at,revoked_at").eq("token", token).maybeSingle();
    if (error) return "unavailable";
    const valid = data && !data.revoked_at && Date.parse(data.expires_at) > Date.now();
    if (valid && Date.parse(data.expires_at) > Date.UTC(9000, 0, 1)) onPersistent?.();
    return valid ? "valid" : "expired";
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
