"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Keep an open public menu current without resetting search or scroll. */
export function MenuAutoRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const refreshing = useRef(false);

  useEffect(() => { refreshing.current = pending; }, [pending]);
  useEffect(() => {
    let lastRefresh = Date.now();
    const refresh = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine || refreshing.current) return;
      const now = Date.now();
      if (now - lastRefresh < 5_000) return;
      lastRefresh = now;
      startTransition(() => router.refresh());
    };
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, [router]);

  return null;
}
