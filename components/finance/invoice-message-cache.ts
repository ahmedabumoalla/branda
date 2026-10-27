import type { FinanceInvoiceMessageStatus } from "@/lib/finance/invoice-message-status";

export type InvoiceMessageEntry = { delivery?: FinanceInvoiceMessageStatus; loading: boolean; error: boolean };
export type InvoiceMessageSnapshot = Readonly<Record<string, InvoiceMessageEntry>>;
export const emptyInvoiceMessages: InvoiceMessageSnapshot = Object.freeze({});
type Result = { ok: true; data: { statuses: FinanceInvoiceMessageStatus[] } } | { ok: false };
const polling = new Set(["queued", "sending", "sent"]);
const pendingTtl = 60_000;
const finalTtl = 5 * 60_000;

/** Instance-local cache: no financial delivery data survives a tenant/user screen change. */
export function createInvoiceMessageCache(load: (ids: string[]) => Promise<Result>, now: () => number = Date.now) {
  let snapshot: InvoiceMessageSnapshot = emptyInvoiceMessages;
  const checked = new Map<string, number>();
  const inFlight = new Set<string>();
  const listeners = new Set<() => void>();
  let work: Promise<void> = Promise.resolve();
  function publish(update: Record<string, InvoiceMessageEntry>) { snapshot = { ...snapshot, ...update }; listeners.forEach(listener => listener()); }
  function due(id: string) {
    const entry = snapshot[id];
    return !checked.has(id) || now() - checked.get(id)! >= (entry?.delivery && polling.has(entry.delivery.status) ? pendingTtl : finalTtl);
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    hasPending(ids: string[]) { return ids.some(id => snapshot[id]?.delivery && polling.has(snapshot[id].delivery!.status)); },
    async refresh(ids: string[], force = false) {
      const wanted = [...new Set(ids)].filter(id => !inFlight.has(id) && (force || due(id)));
      if (!wanted.length) return;
      const loading: Record<string, InvoiceMessageEntry> = {};
      wanted.forEach(id => { inFlight.add(id); loading[id] = { ...snapshot[id], loading: true, error: false }; });
      publish(loading);
      // Serialize even overlapping refresh calls; never fan out by row or rapid filter changes.
      work = work.then(async () => {
      // At most 100 IDs per authorized RPC, sequential batches instead of a request per row.
      for (let offset = 0; offset < wanted.length; offset += 100) {
        const batch = wanted.slice(offset, offset + 100);
        const update: Record<string, InvoiceMessageEntry> = {};
        try {
          const result = await load(batch);
          if (!result.ok) throw new Error("status unavailable");
          const rows = new Map(result.data.statuses.map(row => [row.documentId, row]));
          batch.forEach(id => {
            const delivery = rows.get(id);
            update[id] = delivery ? { delivery, loading: false, error: false } : { ...snapshot[id], loading: false, error: true };
          });
        } catch {
          batch.forEach(id => { update[id] = { ...snapshot[id], loading: false, error: true }; });
        } finally {
          batch.forEach(id => { checked.set(id, now()); inFlight.delete(id); });
          publish(update);
        }
      }
      });
      await work;
    },
  };
}
