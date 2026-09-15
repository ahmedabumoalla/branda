import { NextResponse, type NextRequest } from "next/server";
import { cashierSessionCookie } from "@/lib/data/cashier";

export async function GET(request: NextRequest) {
  const redirectUrl = new URL("/cashier/login?reason=session", request.url);
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(cashierSessionCookie, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
