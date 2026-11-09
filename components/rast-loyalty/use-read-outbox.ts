"use client";

import { useEffect, useMemo, useState } from "react";
import { enqueueLoyaltyReadAction, loadCashierLoyaltyReadsAction } from "@/app/actions/loyalty-read-operations";
import { createIndexedReadStore, createReadOutbox, readScopeKey, type LocalRead, type ReadScope } from "@/lib/loyalty/read-outbox";

export function useReadOutbox({ cafeId, cashierId }: ReadScope) {
  const scopeKey = readScopeKey({ cafeId, cashierId });
  const outbox = useMemo(() => createReadOutbox({
    scope: { cafeId, cashierId }, store: createIndexedReadStore(),
    send: enqueueLoyaltyReadAction, load: loadCashierLoyaltyReadsAction,
    online: () => navigator.onLine,
  }), [cafeId, cashierId]);
  const [rows, setRows] = useState<LocalRead[]>([]);
  const [storageFailedFor, setStorageFailedFor] = useState<string | null>(null);
  const [authPaused, setAuthPaused] = useState(false);
  useEffect(() => {
    let alive = true;
    let storageStopped = false;
    let running = false;
    let wakeRequested = false;
    let fastUntil = 0;
    let timer: number | undefined;
    let latest: LocalRead[] = [];
    async function refresh() {
      try { const next = await outbox.list(); latest = next; if (alive) setRows(next); return true; }
      catch { storageStopped = true; if (alive) setStorageFailedFor(scopeKey); return false; }
    }
    function schedule() {
      if (!alive) return;
      const pending = latest.some(row => !row.errorCode?.startsWith("rejected:")
        && (!row.operation || ["pending", "processing"].includes(row.operation.status)
          || (row.operation.status === "failed" && row.operation.retryable)));
      const fast = pending && Date.now() < fastUntil && navigator.onLine && !outbox.authPaused && !storageStopped;
      timer = window.setTimeout(() => { void tick(); }, fast ? 750 : 10_000);
    }
    async function tick() {
      if (!alive) return;
      if (running) { wakeRequested = true; return; }
      running = true;
      try {
        if (storageStopped || !await refresh() || !alive) return;
        try { await outbox.sync(); } catch { /* Keep durable work; retry on the next wake. */ }
        if (alive) { setAuthPaused(outbox.authPaused); await refresh(); }
      } finally {
        running = false;
        if (alive && wakeRequested) { wakeRequested = false; void tick(); }
        else schedule();
      }
    }
    void tick();
    const wake = () => { storageStopped = false; window.clearTimeout(timer); void tick(); };
    const saved = () => { fastUntil = Date.now() + 15_000; wake(); };
    window.addEventListener("online", wake);
    window.addEventListener("pageshow", wake);
    window.addEventListener("branda-loyalty-read-saved", saved);
    return () => { alive = false; window.clearTimeout(timer); window.removeEventListener("online", wake); window.removeEventListener("pageshow", wake); window.removeEventListener("branda-loyalty-read-saved", saved); };
  }, [outbox, scopeKey]);
  async function save(method: "code" | "phone", value: string) {
    try {
      const saved = await outbox.save(method, value);
      setStorageFailedFor(null);
      setRows(current => [saved.row, ...current.filter(row => row.requestId !== saved.row.requestId)]);
      // Queue the upload after the caller can release the input for the next customer.
      window.setTimeout(() => window.dispatchEvent(new Event("branda-loyalty-read-saved")), 0);
      return saved;
    } catch (cause) { setStorageFailedFor(scopeKey); throw cause; }
  }
  return { rows: rows.filter(row => row.scope === scopeKey), save, storageError: storageFailedFor === scopeKey, authPaused: authPaused && outbox.authPaused };
}
