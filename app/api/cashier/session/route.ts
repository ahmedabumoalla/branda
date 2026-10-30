import { NextResponse, type NextRequest } from "next/server";
import { cashierSessionStatus } from "@/lib/cashier/session-recovery";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const status = await cashierSessionStatus(request);
  return NextResponse.json({ status }, {
    status: status === "valid" ? 200 : status === "expired" ? 401 : 503,
    headers: { "Cache-Control": "private, no-store" },
  });
}
