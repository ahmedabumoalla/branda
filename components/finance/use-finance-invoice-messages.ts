"use client";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { loadFinanceInvoiceMessageStatusesAction } from "@/app/actions/finance-message-status";
import { createInvoiceMessageCache, emptyInvoiceMessages } from "./invoice-message-cache";

export function useFinanceInvoiceMessages({ scope, slug, documentIds, visible }: { scope: string; slug?: string; documentIds: string[]; visible: boolean }) {
  const cache = useMemo(() => ({ scope, ...createInvoiceMessageCache(ids => loadFinanceInvoiceMessageStatusesAction({ documentIds: ids }, slug)) }), [scope, slug]);
  const entries = useSyncExternalStore(cache.subscribe, cache.getSnapshot, () => emptyInvoiceMessages);
  // Equivalent ID arrays do not restart requests when unrelated POS state changes.
  const key = [...new Set(documentIds)].filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)).sort().join(",");
  const pending = key.split(",").some(id => ["queued", "sending", "sent"].includes(entries[id]?.delivery?.status ?? ""));
  useEffect(() => {
    if (!visible || !key) return;
    const ids = key.split(",");
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const foreground = () => document.visibilityState !== "hidden";
    async function run() {
      if (stopped || !foreground()) return;
      await cache.refresh(ids);
      if (!stopped && foreground() && cache.hasPending(ids)) { clearTimeout(timer); timer = setTimeout(() => { void run(); }, 60_000); }
    }
    function visibilityChanged() { clearTimeout(timer); if (document.visibilityState !== "hidden") void run(); }
    document.addEventListener("visibilitychange", visibilityChanged);
    void run();
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", visibilityChanged); };
  }, [cache, key, visible, pending]);
  return { entries, refresh: () => cache.refresh(key ? key.split(",") : [], true), loading: Object.values(entries).some(entry => entry.loading) };
}
