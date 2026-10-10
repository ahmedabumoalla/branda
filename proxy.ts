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
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";
  const rootDomain = (process.env.NEXT_PUBLIC_BARNDAKSA_PUBLIC_DOMAIN || "barndaksa.com").replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
  const reservedSubdomains = new Set(["www", "app", "admin", "api", "static", "assets"]);
  const subdomain = host.endsWith(`.${rootDomain}`) ? host.slice(0, -(rootDomain.length + 1)) : "";
  const brandSubdomain = /^[a-z0-9][a-z0-9_-]{0,99}$/.test(subdomain) && !reservedSubdomains.has(subdomain);

  // Saved storefront links are aliases only; menu authorization stays at /menu.
  // Never replay an archived mutation or API request against the menu route.
  if (request.method === "GET" || request.method === "HEAD") {
    const legacy = pathname.match(/^\/(?:c|app)\/([a-z0-9][a-z0-9_-]{0,99})(?:\/|$)/i);
    const pageRequest = !pathname.startsWith("/api/") && !pathname.startsWith("/_next/") && !/\.[a-z0-9]+$/i.test(pathname);
    const slug = pageRequest ? legacy?.[1].toLowerCase() || (brandSubdomain ? subdomain : "") : "";
    if (slug) {
      const target = request.nextUrl.clone();
      if (brandSubdomain) { target.hostname = rootDomain; target.port = ""; target.protocol = "https:"; }
      target.pathname = `/menu/${slug}`;
      target.search = "";
      // Preserve campaign attribution without forwarding old login/table tokens.
      for (const key of ["source", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
        const value = request.nextUrl.searchParams.get(key);
        if (value) target.searchParams.set(key, value);
      }
      return NextResponse.redirect(target, 308);
    }
  }
  if (!isStorefrontEnabled() && isStorefrontPath(pathname)) return storefrontUnavailableResponse();
  if (host.endsWith(`.${rootDomain}`)) {
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
