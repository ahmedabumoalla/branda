"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { clearDashboardShellSnapshot } from "@/lib/performance/dashboard-shell-client";

// This identity only invalidates local views; the server still authorizes every read/write.
export function dashboardSessionIdentity(session: { user: { id: string }; access_token: string } | null) {
  if (!session) return null;
  try {
    const payload = JSON.parse(atob(session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { session_id?: string };
    return `${session.user.id}:${payload.session_id ?? ""}`;
  } catch { return session.user.id; }
}

/** Keep Next's tab-local route cache, with fresh account boundaries across tabs. */
export function DashboardCacheBoundary() {
  const pathname = usePathname();
  const router = useRouter();
  const protectedArea = /^\/(admin|dashboard)(\/|$)/.test(pathname);
  const lastRefresh = useRef(0);
  // Retain identity while visiting public pages so a cached dashboard cannot be
  // accepted as the baseline after another tab signs in to a different account.
  const identity = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!protectedArea) {
      clearDashboardShellSnapshot();
      return;
    }
    let leaving = false;
    let checking = false;
    lastRefresh.current = Date.now();
    const client = createClient();
    const observe = (event: string, session: { user: { id: string }; access_token: string } | null) => {
      const nextIdentity = dashboardSessionIdentity(session);
      if (!nextIdentity || event === "SIGNED_OUT" || (identity.current !== undefined && identity.current !== nextIdentity)) {
        if (leaving) return;
        leaving = true;
        clearDashboardShellSnapshot();
        // A hard navigation discards every cached route, including other brands/maintenance.
        if (!nextIdentity) window.location.replace("/login");
        else window.location.reload();
      }
      identity.current = nextIdentity;
    };
    const { data } = client.auth.onAuthStateChange(observe);
    const refresh = async () => {
      if (leaving || checking || document.visibilityState === "hidden" || !navigator.onLine) return;
      checking = true;
      try {
        // Server-action logouts in another tab change cookies without broadcasting Auth events.
        const { data: current, error } = await client.auth.getSession();
        if (error || leaving) return;
        observe("FOREGROUND", current.session);
        if (leaving || Date.now() - lastRefresh.current < 60_000) return;
        lastRefresh.current = Date.now();
        router.refresh();
      } catch { /* A transient auth/network failure is not evidence of a different account. */ }
      finally { checking = false; }
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      leaving = true;
      data.subscription.unsubscribe();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [protectedArea, router]);
  return null;
}
