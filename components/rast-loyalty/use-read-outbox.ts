"use client";

import { useEffect, useMemo, useState } from "react";
import type { enqueueLoyaltyReadAction, loadCashierLoyaltyReadsAction } from "@/app/actions/loyalty-read-operations";
import { createIndexedReadStore, createReadOutbox, readScopeKey, type LocalRead, type ReadScope } from "@/lib/loyalty/read-outbox";

async function postRead<T>(body: object): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 22_000);
  try {
    const response = await fetch("/api/cashier/loyalty-reads", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      credentials: "same-origin", cache: "no-store", signal: controller.signal,
    });
    if (!response.ok) throw new Error("read_transport_unavailable");
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export function useReadOutbox({ cafeId, cashierId }: ReadScope) {
  const scopeKey = readScopeKey({ cafeId, cashierId });
  const outbox = useMemo(() => createReadOutbox({
    scope: { cafeId, cashierId }, store: createIndexedReadStore(),
    send: input => postRead<Awaited<ReturnType<typeof enqueueLoyaltyReadAction>>>({ step: "enqueue", input }),
    load: (ids, scope) => postRead<Awaited<ReturnType<typeof loadCashierLoyaltyReadsAction>>>({ step: "status", ids, scope }),
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
    const wake = () => { storageStopped = false; window.clearTimeout(timer); void tick(); };
    const saved = () => { fastUntil = Date.now() + 15_000; wake(); };
    function reconnect() {
      void outbox.retryUnsent().catch(() => {}).then(() => { if (alive) wake(); });
    }
    reconnect();
    window.addEventListener("online", reconnect);
    window.addEventListener("pageshow", wake);
    window.addEventListener("branda-loyalty-read-saved", saved);
    return () => { alive = false; window.clearTimeout(timer); window.removeEventListener("online", reconnect); window.removeEventListener("pageshow", wake); window.removeEventListener("branda-loyalty-read-saved", saved); };
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
