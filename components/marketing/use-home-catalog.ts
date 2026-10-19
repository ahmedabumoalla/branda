"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicHomeCatalog } from "@/lib/platform/public-home-catalog";

export const unavailableHomeCatalog: PublicHomeCatalog = {
  plans: [], partners: [], menus: [], errors: { plans: true, partners: true, menus: true },
};

export function mergeHomeCatalog(previous: PublicHomeCatalog, next: PublicHomeCatalog): PublicHomeCatalog {
  return {
    plans: next.errors.plans ? previous.plans : next.plans,
    partners: next.errors.partners ? previous.partners : next.partners,
    menus: next.errors.menus ? previous.menus : next.menus,
    errors: next.errors,
  };
}

export function useHomeCatalog(initial: PublicHomeCatalog) {
  const [catalog, setCatalog] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (request.current || document.visibilityState === "hidden") return;
    const controller = new AbortController();
    request.current = controller;
    setRefreshing(true);
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("/api/public/home-catalog", { cache: "no-store", signal: controller.signal });
      if (!response.ok && response.status !== 503) throw new Error("Catalog unavailable");
      const next: PublicHomeCatalog = await response.json();
      if (!Array.isArray(next.plans) || !Array.isArray(next.partners) || !Array.isArray(next.menus) || typeof next.errors?.plans !== "boolean" || typeof next.errors?.partners !== "boolean" || typeof next.errors?.menus !== "boolean") throw new Error("Invalid catalog");
      if (request.current === controller) setCatalog(previous => mergeHomeCatalog(previous, next));
    } catch {
      if (request.current === controller) setCatalog(previous => ({ ...previous, errors: { plans: true, partners: true, menus: true } }));
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) { request.current = null; setRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    const update = () => { void refresh(); };
    const timer = window.setInterval(update, 30000);
    window.addEventListener("focus", update);
    window.addEventListener("online", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("online", update);
      document.removeEventListener("visibilitychange", update);
      const pending = request.current;
      request.current = null;
      pending?.abort();
    };
  }, [refresh]);

  return { catalog, refreshing, refresh };
}
