import { NextResponse } from "next/server";
import { logoutCashier } from "@/lib/data/cashier";

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (request.headers.get("origin") !== url.origin) return new Response("Forbidden", { status: 403 });
  await logoutCashier();
  return NextResponse.redirect(new URL("/loyalty/scan/login", request.url), 303);
}
