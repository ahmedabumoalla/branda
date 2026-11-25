import { refreshCashierCookie } from "@/lib/cashier/persistent-session";
import { NextResponse, NextRequest } from "next/server";

import { decodeSession, maintenanceSessionCookieName } from "@/lib/platform/maintenance-token";
import { brandPicker, maintenanceHeader, maintenanceParam, maintenanceRequestScope } from "@/lib/platform/maintenance-workspace";
import { updateSession } from "@/lib/supabase/middleware";
import { isStorefrontEnabled, isStorefrontPath, storefrontUnavailableResponse } from "@/lib/platform/storefront-availability";
import { createAdminClient } from "@/lib/supabase/admin";
import { recoverExpiredCashierAction } from "@/lib/cashier/session-recovery";
import { isAwladAlIzz } from "@/lib/menu/awlad-al-izz";
import { hospitalAccountLoginPath, hospitalAccountRouteHeader, isHospitalAccountRoute, isLegacyHospitalAccountLogin } from "@/lib/commerce/hospital-account-routing";

const AUTH_REFRESH_PREFIXES = [
  "/brands",
  "/dashboard",
  "/finance",
  "/admin",
  "/representative",
  "/login",
  "/register",
  "/auth",
  "/cashier",
  "/pager",
  "/api/auth/session",
  "/api/cashier/session",
  "/api/finance",
];

function shouldRefreshSupabaseSession(pathname: string) {
  return isHospitalAccountRoute(pathname) || AUTH_REFRESH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function proxy(incoming: NextRequest) {
  // Only this proxy supplies the layout marker; incoming values cannot opt out
  // of archived-storefront restrictions. Each portal reader retains its auth gate.
  const hospitalAccount = isHospitalAccountRoute(incoming.nextUrl.pathname);
  const requestHeaders = new Headers(incoming.headers);
  requestHeaders.delete(hospitalAccountRouteHeader);
  requestHeaders.delete(maintenanceHeader);
  const cookie = incoming.cookies.get(maintenanceSessionCookieName)?.value;
  const maintenance = cookie ? decodeSession(cookie) : null;
  const binding = maintenanceRequestScope(incoming.nextUrl, incoming.headers.get("referer"), maintenance?.workspaceId);
  const read = incoming.method === "GET" || incoming.method === "HEAD";
  if (binding.blocked) {
    const response = read && !incoming.nextUrl.pathname.startsWith("/api/")
      ? NextResponse.redirect(new URL(brandPicker, incoming.url), 303)
      : NextResponse.json({ error: "maintenance_workspace_changed" }, { status: 409 });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  if (binding.scope) {
    requestHeaders.set(maintenanceHeader, binding.scope);
    if (binding.canonicalize && read) {
      const target = incoming.nextUrl.clone();
      target.searchParams.set(maintenanceParam, binding.scope);
      return NextResponse.redirect(target, { status: 307, headers: { "Cache-Control": "private, no-store" } });
    }
  }
  // Server-only path marker for the dashboard employee allow-list; never trusted from the client
  requestHeaders.set("x-branda-pathname", incoming.nextUrl.pathname);
  if (hospitalAccount) requestHeaders.set(hospitalAccountRouteHeader, "1");
  const request = new NextRequest(incoming, { headers: requestHeaders });
  const recovery = await recoverExpiredCashierAction(request);
  if (recovery) return recovery;
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";
  const rootDomain = (process.env.NEXT_PUBLIC_BARNDAKSA_PUBLIC_DOMAIN || "barndaksa.com").replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
  const reservedSubdomains = new Set(["www", "app", "admin", "api", "static", "assets"]);
  const subdomain = host.endsWith(`.${rootDomain}`) ? host.slice(0, -(rootDomain.length + 1)) : "";
  const brandSubdomain = /^[a-z0-9][a-z0-9_-]{0,99}$/.test(subdomain) && !reservedSubdomains.has(subdomain);

  // Saved storefront links are aliases only; menu authorization stays at /menu.
  // Never replay an archived mutation or API request against the menu route.
  if (request.method === "GET" || request.method === "HEAD") {
    // The MIND counter sign carries this exact legacy enrollment URL.
    if (pathname === "/loyalty/brand-8ad185ee82e3" && host === rootDomain &&
        request.nextUrl.search === "?source=qr") {
      const target = request.nextUrl.clone();
      target.pathname = "/loyalty/mind-hospital";
      return NextResponse.redirect(target, { status: 307, headers: { "Cache-Control": "no-store" } });
    }
    if (isLegacyHospitalAccountLogin(pathname, request.nextUrl.searchParams.get("next"))) {
      const target = request.nextUrl.clone();
      target.pathname = hospitalAccountLoginPath;
      target.search = "";
      return NextResponse.redirect(target, 307);
    }
    // Resolve salon aliases before the cafe route can stream its loading screen.
    // The destination still enforces status and package access before serving data.
    const menuSlug = pathname.match(/^\/menu\/([a-z0-9-]{1,100})\/?$/)?.[1];
    if (menuSlug) {
      try {
        const { data } = await createAdminClient().from("cafes").select("id,business_category").eq("slug", menuSlug).is("deleted_at", null).abortSignal(AbortSignal.timeout(2000)).maybeSingle();
        if (data?.business_category === "hair_salons" && !isAwladAlIzz(data.id)) {
          const target = request.nextUrl.clone(); target.pathname = `/salon/${menuSlug}`;
          return NextResponse.redirect(target, 307);
        }
      } catch { /* Existing menu route remains the authorized fallback */ }
    }
    const legacy = pathname.match(/^\/(?:c|app)\/([a-z0-9][a-z0-9_-]{0,99})(?:\/|$)/i);
    const pageRequest = !pathname.startsWith("/api/") && !pathname.startsWith("/_next/") && !/\.[a-z0-9]+$/i.test(pathname);
    const slug = pageRequest && !hospitalAccount ? legacy?.[1].toLowerCase() || (brandSubdomain ? subdomain : "") : "";
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
  if (!hospitalAccount && !isStorefrontEnabled() && isStorefrontPath(pathname)) return storefrontUnavailableResponse();
  if (host.endsWith(`.${rootDomain}`)) {
    if (!hospitalAccount && !isStorefrontEnabled() && subdomain && !subdomain.includes(".") && !reservedSubdomains.has(subdomain)) {
      return storefrontUnavailableResponse();
    }
    if (subdomain && !subdomain.includes(".") && !reservedSubdomains.has(subdomain) && !pathname.startsWith("/c/") && !pathname.startsWith("/api/")) {
      const url = request.nextUrl.clone();
      url.pathname = `/c/${subdomain}${pathname === "/" ? "" : pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  if (!binding.scope && !shouldRefreshSupabaseSession(pathname)) {
    return refreshCashierCookie(request, NextResponse.next({ request }));
  }

  return refreshCashierCookie(request, await updateSession(request));
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
