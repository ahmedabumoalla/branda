"use client";

import { useEffect, useRef, useTransition } from "react";
import { MENU_CHANGE_KEY } from "@/lib/menu/menu-change";
import { useRouter } from "next/navigation";

/** Keep an open public menu current without resetting search or scroll. */
export function MenuAutoRefresh({ slug }: { slug?: string }) {
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
    const onMenuChanged = (event: StorageEvent) => {
      if (event.key !== MENU_CHANGE_KEY || !event.newValue) return;
      try {
        if (JSON.parse(event.newValue).slug !== slug) return;
        lastRefresh = 0;
        refresh();
      } catch { /* Ignore malformed cross-tab messages. */ }
    };
    window.addEventListener("storage", onMenuChanged);
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", onMenuChanged);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, [router, slug]);

  return null;
}
