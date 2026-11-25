import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { brandPicker, maintenanceHeader } from "@/lib/platform/maintenance-workspace";
import { transientAuthError } from "@/lib/auth/session-policy";
import { decodeSession, maintenanceSessionCookieName } from "@/lib/platform/maintenance-token";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const workspace = request.headers.get(maintenanceHeader);
  function closedWorkspace() {
    const pageRead = (request.method === "GET" || request.method === "HEAD") && !request.nextUrl.pathname.startsWith("/api/");
    const blocked = pageRead ? NextResponse.redirect(new URL(brandPicker, request.url), 303)
      : NextResponse.json({ error: "maintenance_workspace_changed" }, { status: 409 });
    supabaseResponse.cookies.getAll().forEach(cookie => blocked.cookies.set(cookie));
    blocked.headers.set("Cache-Control", "private, no-store");
    return blocked;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return workspace ? closedWorkspace() : supabaseResponse;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        const previous = supabaseResponse.cookies.getAll();
        supabaseResponse = NextResponse.next({ request });
        previous.forEach(cookie => supabaseResponse.cookies.set(cookie));
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
        Object.entries(headers ?? {}).forEach(([name, value]) => supabaseResponse.headers.set(name, value));
      },
    },
  });

  // Refresh credentials on operator routes too. Owner cashier sessions depend
  // on this Auth cookie, including when the dashboard is not open.
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    const maintenance = decodeSession(request.cookies.get(maintenanceSessionCookieName)?.value);
    if (workspace && (error || !user || maintenance?.adminUserId !== user.id || maintenance.workspaceId !== workspace)) return closedWorkspace();
    if (transientAuthError(error)) {
      supabaseResponse.headers.set("Cache-Control", "private, no-store");
      return supabaseResponse;
    }
    if (user) {
      const { data: active, error: accessError } = await supabase.rpc("current_account_active");
      if (!accessError && active === false && !request.nextUrl.pathname.startsWith("/login")) {
        const blocked = request.nextUrl.pathname.startsWith("/api/")
          ? NextResponse.json({ status: "blocked" }, { status: 403 })
          : NextResponse.redirect(new URL("/login?reason=account_disabled", request.url));
        supabaseResponse.cookies.getAll().forEach(cookie => blocked.cookies.set(cookie));
        blocked.headers.set("Cache-Control", "private, no-store");
        return blocked;
      }
      if (workspace && (accessError || active !== true)) return closedWorkspace();
      // Only entry and exit change the maintenance cookie. Late responses from
      // a previous tab must never reinstate its brand after a switch or logout.
      if (maintenance?.adminUserId === user.id && !request.headers.has(maintenanceHeader)
        && /^\/dashboard(\/|$)/.test(request.nextUrl.pathname)) {
        return closedWorkspace();
      }
    }
  } catch {
    if (workspace) return closedWorkspace();
    // Authorization remains with the route. A transient outage is never logout.
  }
  supabaseResponse.headers.set("Cache-Control", "private, no-store");
  return supabaseResponse;
}
