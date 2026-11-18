"use client";
import { useEffect } from "react";

/** Discard stale brand screens in other tabs after the full-page brand switch. */
export function ManagedBrandBoundary({ userId, brandId }: { userId: string; brandId: string }) {
  useEffect(() => {
    const key = `branda-managed-brand:${userId}`;
    let leaving = false;
    try { localStorage.setItem(key, brandId); } catch { /* Private storage can be disabled */ }
    const check = (event?: Event) => {
      let current: string | null = null;
      try { current = localStorage.getItem(key); } catch { return; }
      if (current && current !== brandId) {
        event?.preventDefault();
        event?.stopImmediatePropagation();
        if (!leaving) { leaving = true; window.location.replace("/brands"); }
      }
    };
    window.addEventListener("storage", check);
    window.addEventListener("pageshow", check);
    window.addEventListener("focus", check);
    document.addEventListener("submit", check, true);
    document.addEventListener("click", check, true);
    return () => { window.removeEventListener("storage", check); window.removeEventListener("pageshow", check); window.removeEventListener("focus", check); document.removeEventListener("submit", check, true); document.removeEventListener("click", check, true); };
  }, [userId, brandId]);
  return null;
}
