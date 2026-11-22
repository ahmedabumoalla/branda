"use client";

import type { BrandPhoneCountry } from "@/lib/auth/brand-phone";
import { useEffect, useMemo, useState } from "react";
import { invoiceOutbox, type QueuedInvoice, type InvoiceTerms } from "@/lib/loyalty/invoice-points-outbox";
import { createIndexedReadStore, readScopeKey, type ReadScope } from "@/lib/loyalty/read-outbox";

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

export function useInvoicePointsOutbox({ cafeId, cashierId }: ReadScope, pointsEnabled: boolean, phoneCountry: BrandPhoneCountry = "SA") {
  const scopeKey = readScopeKey({ cafeId, cashierId });
  const queue = useMemo(() => invoiceOutbox({ phoneCountry, scope: { cafeId, cashierId },
    store: createIndexedReadStore<QueuedInvoice>("branda-loyalty-invoice-points"), online: () => navigator.onLine,
    resolve: input => post({ step: "resolve", ...input }), credit: input => post({ step: "credit", ...input }),
  }), [cafeId, cashierId, phoneCountry]);
  const [rows, setRows] = useState<QueuedInvoice[]>([]);
  const [errorScope, setErrorScope] = useState("");
  useEffect(() => {
    let active = true;
    let timer: number | undefined;
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
    async function start() {
      // Finish previously saved invoices even if the owner switched back to stamps.
      if (!pointsEnabled && !(await refresh()).some(row => row.state === "waiting")) return;
      if (!active) return;
      void wake();
      timer = window.setInterval(wake, 8000);
      window.addEventListener("online", reconnect);
      window.addEventListener("pageshow", wake);
      window.addEventListener(wakeEvent, wake);
    }
    void start().catch(() => { if (active && pointsEnabled) setErrorScope(scopeKey); });
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("online", reconnect);
      window.removeEventListener("pageshow", wake); window.removeEventListener(wakeEvent, wake); };
  }, [pointsEnabled, queue, scopeKey]);
  async function save(identifier: string, terms: InvoiceTerms) {
    if (!pointsEnabled) throw new Error("points_mode_changed");
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
