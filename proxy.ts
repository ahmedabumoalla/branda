import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";
import { isStorefrontEnabled, isStorefrontPath, storefrontUnavailableResponse } from "@/lib/platform/storefront-availability";

const AUTH_REFRESH_PREFIXES = [
  "/dashboard",
  "/admin",
  "/representative",
  "/login",
  "/register",
  "/auth",
];

function shouldRefreshSupabaseSession(pathname: string) {
  return AUTH_REFRESH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isStorefrontEnabled() && isStorefrontPath(pathname)) return storefrontUnavailableResponse();
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";
  const rootDomain = (process.env.NEXT_PUBLIC_BARNDAKSA_PUBLIC_DOMAIN || "barndaksa.com").replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
  const reservedSubdomains = new Set(["www", "app", "admin", "api", "static", "assets"]);
  if (host.endsWith(`.${rootDomain}`)) {
    const subdomain = host.slice(0, -(rootDomain.length + 1));
    if (!isStorefrontEnabled() && subdomain && !subdomain.includes(".") && !reservedSubdomains.has(subdomain)) {
      return storefrontUnavailableResponse();
    }
    if (subdomain && !subdomain.includes(".") && !reservedSubdomains.has(subdomain) && !pathname.startsWith("/c/") && !pathname.startsWith("/api/")) {
      const url = request.nextUrl.clone();
      url.pathname = `/c/${subdomain}${pathname === "/" ? "" : pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  if (!shouldRefreshSupabaseSession(pathname)) {
    return NextResponse.next({ request });
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/c/:path*",
    "/api/public/cafe/:path*",
    "/api/customer-fast/:path*",
    "/api/pwa/:path*",
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml)$).*)",
  ],
};
