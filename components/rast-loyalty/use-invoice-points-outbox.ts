"use client";

import { useEffect, useMemo, useState } from "react";
import { invoiceOutbox, type QueuedInvoice, type InvoiceTerms } from "@/lib/loyalty/invoice-points-outbox";
import { createIndexedReadStore, readScopeKey, type ReadScope } from "@/lib/loyalty/read-outbox";
import { POINTS_CAFE_ID } from "@/lib/loyalty/points-program";

const wakeEvent = "branda-invoice-points-saved";
async function post(body: Record<string, unknown>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 22_000);
  try {
    const response = await fetch("/api/cashier/invoice-points", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), cache: "no-store", credentials: "same-origin", signal: controller.signal });
    return await response.json();
  } finally { clearTimeout(timer); }
}

export function useInvoicePointsOutbox({ cafeId, cashierId }: ReadScope) {
  const scopeKey = readScopeKey({ cafeId, cashierId });
  const queue = useMemo(() => invoiceOutbox({ scope: { cafeId, cashierId },
    store: createIndexedReadStore<QueuedInvoice>("branda-loyalty-invoice-points"), online: () => navigator.onLine,
    resolve: input => post({ step: "resolve", ...input }), credit: input => post({ step: "credit", ...input }),
  }), [cafeId, cashierId]);
  const [rows, setRows] = useState<QueuedInvoice[]>([]);
  const [errorScope, setErrorScope] = useState("");
  useEffect(() => {
    if (cafeId !== POINTS_CAFE_ID) return;
    let active = true;
    async function refresh() {
      const current = await queue.list();
      if (active) { setRows(current); setErrorScope(""); }
      return current;
    }
    async function wake() {
      try {
        const current = await refresh();
        const now = Date.now();
        if (!active || !navigator.onLine || !current.some(r => r.state === "waiting" && r.nextAttempt <= now && r.leaseUntil <= now)) return;
        await queue.sync(() => { if (active) void refresh().catch(() => setErrorScope(scopeKey)); });
        if (active) await refresh();
      } catch { if (active) setErrorScope(scopeKey); }
    }
    function reconnect() { void queue.retry().then(wake).catch(() => setErrorScope(scopeKey)); }
    void wake();
    const timer = window.setInterval(wake, 8000);
    window.addEventListener("online", reconnect);
    window.addEventListener("pageshow", wake);
    window.addEventListener(wakeEvent, wake);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("online", reconnect);
      window.removeEventListener("pageshow", wake); window.removeEventListener(wakeEvent, wake); };
  }, [cafeId, queue, scopeKey]);
  async function save(identifier: string, terms: InvoiceTerms) {
    if (cafeId !== POINTS_CAFE_ID) throw new Error("invalid_scope");
    const row = await queue.save(identifier, terms);
    setRows(current => [row, ...current.filter(r => r.requestId !== row.requestId)]);
    setErrorScope("");
    window.setTimeout(() => window.dispatchEvent(new Event(wakeEvent)), 0);
  }
  async function retry() {
    try { await queue.retry(); window.dispatchEvent(new Event(wakeEvent)); }
    catch { setErrorScope(scopeKey); }
  }
  return { rows: rows.filter(r => r.scope === scopeKey), save, retry, storageError: errorScope === scopeKey };
}
