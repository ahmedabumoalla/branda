import { CASHIER_COOKIE_SECONDS } from "@/lib/cashier/persistent-session";
import { NextResponse, type NextRequest } from "next/server";
import { cashierSessionStatus } from "@/lib/cashier/session-recovery";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let persistent = false;
  const status = await cashierSessionStatus(request, () => { persistent = true; });
  const response = NextResponse.json({ status }, {
    status: status === "valid" ? 200 : status === "expired" ? 401 : status === "changed" ? 409 : 503,
    headers: { "Cache-Control": "private, no-store" },
  });
  if (status === "valid" && persistent) {
    response.cookies.set("barndaksa_cashier_session", request.cookies.get("barndaksa_cashier_session")!.value, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: CASHIER_COOKIE_SECONDS,
    });
  }
  return response;
}
