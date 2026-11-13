"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function SessionKeeper() {
  const pathname = usePathname();
  useEffect(() => {
    if (!/^\/(dashboard|admin|finance|representative|cashier|pager)(\/|$)/.test(pathname)) return;
    let pending = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (pending || !navigator.onLine) return;
      pending = true;
      try {
        const response = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        if (response.status === 403 && !controller.signal.aborted) window.location.replace("/login?reason=account_disabled");
      } catch { /* Keep credentials and the current screen during temporary outages. */ }
      finally { pending = false; }
    };
    const timer = window.setInterval(refresh, 5 * 60 * 1000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    void refresh();
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); };
  }, [pathname]);
  return null;
}
