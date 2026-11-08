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
    async function refresh() {
      try { const next = await outbox.list(); if (alive) setRows(next); return true; }
      catch { storageStopped = true; if (alive) setStorageFailedFor(scopeKey); return false; }
    }
    async function tick() {
      if (storageStopped || !await refresh()) return;
      try { await outbox.sync(); } catch { /* Keep durable work; retry on the next wake. */ }
      if (alive) { setAuthPaused(outbox.authPaused); await refresh(); }
    }
    void tick();
    const interval = window.setInterval(() => { void tick(); }, 10_000);
    const wake = () => { storageStopped = false; void tick(); };
    window.addEventListener("online", wake);
    window.addEventListener("pageshow", wake);
    window.addEventListener("branda-loyalty-read-saved", wake);
    return () => { alive = false; window.clearInterval(interval); window.removeEventListener("online", wake); window.removeEventListener("pageshow", wake); window.removeEventListener("branda-loyalty-read-saved", wake); };
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
