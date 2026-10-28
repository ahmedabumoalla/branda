import { NextResponse } from "next/server";
import { salonLoyaltySession } from "@/lib/salon/loyalty-link";

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive" };

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const session = await salonLoyaltySession((await params).token);
    if (!session) return new NextResponse("رابط البطاقة غير متاح أو انتهت صلاحيته", { status: 404, headers: privateHeaders });
    const response = NextResponse.redirect(new URL(`/loyalty/${session.slug}`, request.url), 303);
    for (const [name, value] of Object.entries(privateHeaders)) response.headers.set(name, value);
    response.cookies.set(session.name, session.token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: session.maxAge });
    return response;
  } catch { return new NextResponse("تعذر فتح البطاقة حاول مجددًا", { status: 503, headers: privateHeaders }); }
}
