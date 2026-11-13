import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PERSISTENT_SESSION_EXPIRES_AT, SESSION_COOKIE_SECONDS, transientAuthError } from "@/lib/auth/session-policy";
import { decodeSession, encodeSession, maintenanceSessionCookieName } from "@/lib/platform/maintenance-token";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return supabaseResponse;
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
      const maintenance = decodeSession(request.cookies.get(maintenanceSessionCookieName)?.value);
      if (!accessError && active && maintenance?.adminUserId === user.id) {
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
        if (profile?.role === "platform_admin") {
          supabaseResponse.cookies.set(maintenanceSessionCookieName, encodeSession({ ...maintenance, expiresAt: PERSISTENT_SESSION_EXPIRES_AT }), {
            httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_COOKIE_SECONDS,
          });
        }
      }
    }
  } catch {
    // Authorization remains with the route. A transient outage is never logout.
  }
  supabaseResponse.headers.set("Cache-Control", "private, no-store");
  return supabaseResponse;
}
